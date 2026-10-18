// The script checker (PLAN.md §h, "six scripts under the live guardrail policy"): every simulation script
// in data/sim_runs.js is replayed headless through the live agent's own tools (js/tools.js) on the night
// it was written for, once for every decision the person can take, so a scripted replay can never show
// an invented figure, a refused action or a broken path on stage. Run by the world suite
// (tools/check_world.mjs) and by Diagnostics; tests use replayScript() to compute what the screen must
// show for a decision path.
//
// Per decision path it checks: the night has the wake-ups the script expects, in order; every tool call
// passes the live guardrails (a refusal is an error); every {{placeholder}} resolves where it is used;
// every euro amount, number of hours and rate written in narration matches a figure a tool returned by
// then (as in live mode, option cards, drafts and the summary are audited by the tools themselves); no
// text shows "undefined" or "NaN"; the summary is marked as a simulated run, never as a live one; and
// the night ends with the summary published. Paths: each option approved, doing nothing, and the
// recommended option rejected before another is approved.

import { createNightSession, createSessionCache } from "./night_session.js";
import { createToolbox, TOOL_NAMES } from "./tools.js";
import { interpretScript, replayInputs, REPLAY_PARAMS } from "./script.js";
import { unresolvedKeys, stringsIn } from "./sim_vars.js";
import { createOffLookup } from "./openfoodfacts.js";
import { defaults as engineDefaults } from "./engine.js";

const BROKEN = /\b(undefined|NaN)\b|\[object Object\]/;
/** Scenarios whose script must exist in this build (the others arrive with M4). */
export const SCRIPTS_REQUIRED = Object.freeze(["SC1-EXPRESS"]);

class ScriptError extends Error {}

/** Plays a session headless from wake-up to wake-up (the night player's job in the browser). */
function headlessBridge(session) {
  const toNextWake = () => {
    session.resume();
    for (let ev = session.take(); ev; ev = session.take()) if (ev.type === "wake") return { ...ev.payload, t: ev.t };
    return null;
  };
  return { first: async () => toNextWake(), advance: async () => toNextWake() };
}

/**
 * A person who decides by plan: plan { option: "B" | "baseline", reject: ["A"] (rejected first, in
 * order), drafts: "approve" | "reject" | ["approve", "reject", …], confirm: "confirm" | "reject" }.
 */
function plannedPerson(plan) {
  const drafts = new Map();
  const queue = [];        // option decisions for the set on screen
  const confirmations = [];
  let draftIndex = 0;
  const draftChoice = () => {
    const d = plan.drafts ?? "approve";
    const c = Array.isArray(d) ? d[draftIndex] ?? "approve" : d;
    draftIndex += 1;
    return c === "reject" ? "rejected" : "approved";
  };
  return {
    drafts,
    onEvent(type, payload) {
      if (type === "options") {
        queue.length = 0;
        for (const id of plan.reject || []) queue.push({ payload: { option_id: id, decision: "rejected", options_seq: payload.options_seq, by: "user" } });
        queue.push({ payload: { option_id: plan.option, decision: "approved", options_seq: payload.options_seq, by: "user" } });
      } else if (type === "confirmation_request") {
        confirmations.push({ payload: { request_id: payload.request_id, choice: plan.confirm || "confirm", by: "user" } });
      }
    },
    waitUntil: async (test) => {
      let v = test();
      if (!v) {
        for (const d of drafts.values()) if (d.status === "pending") d.status = draftChoice();
        v = test();
      }
      if (!v) throw new ScriptError("the script waits for the person, and the decision plan has no answer");
      return v;
    },
    takeOptionDecision: (pred) => { const i = queue.findIndex(pred); return i >= 0 ? queue.splice(i, 1)[0] : null; },
    takeConfirmation: (pred) => { const i = confirmations.findIndex(pred); return i >= 0 ? confirmations.splice(i, 1)[0] : null; }
  };
}

/**
 * Replays one script headless for one decision plan. opts: { world, scenario, refs (this scenario's
 * reference inputs), plan, inputs (the engine's inputs; default the brief's), cache (shared across
 * paths), audit (default true: check texts) }. Never throws: returns { ok, errors, events, session,
 * toolbox, vars, decisionId, calls, texts }.
 */
export async function replayScript(script, { world, scenario, refs = {}, plan = { option: null }, inputs = null, cache = null, audit = true, snapshot = globalThis.OFF_SNAPSHOT } = {}) {
  const errors = [];
  const events = [];
  const texts = [];
  const v = replayInputs(inputs || engineDefaults());
  let session;
  try {
    session = createNightSession({ world, scenario, params: REPLAY_PARAMS(v), seed: scenario.night.seed, cache });
  } catch (e) {
    return { ok: false, errors: [`the night cannot be built: ${e.message}`], events, texts };
  }
  const person = plannedPerson(plan);
  const bridge = headlessBridge(session);
  const lookup = createOffLookup({ mode: "simulation", snapshot });
  const toolbox = createToolbox({
    session, getInputs: () => v, mode: "simulation",
    emit: (type, payload) => { events.push({ type, payload }); person.onEvent(type, payload); },
    waitUntil: person.waitUntil, takeOptionDecision: person.takeOptionDecision, takeConfirmation: person.takeConfirmation,
    drafts: person.drafts, onPhase: (state) => events.push({ type: "state_change", payload: { state } }),
    advance: () => bridge.advance(), autonomy: () => "approve", lookup, pause: async () => {}
  });
  const vars = {};
  const calls = [];
  const fail = (msg) => { throw new ScriptError(msg); };
  const call = async (name, input, where) => {
    if (!TOOL_NAMES.includes(name)) fail(`${where || "a step"}: unknown tool "${name}"`);
    const left = stringsIn(input).flatMap((s) => unresolvedKeys(vars, s));
    if (left.length) fail(`${where || name}: {{${left[0]}}} does not resolve here`);
    if (name === "ui_final_report") {
      const md = String(input.markdown || "");
      if (/live agent run/i.test(md)) errors.push(`${where || name}: a scripted summary must not call itself a live run`);
      if (!/simulated run/i.test(md)) errors.push(`${where || name}: the summary lacks the "Simulated run" marker`);
    }
    for (const s of stringsIn(input)) if (BROKEN.test(s)) errors.push(`${where || name}: the input shows "${BROKEN.exec(s)[0]}"`);
    calls.push(name);
    events.push({ type: "tool_call", payload: { name, input } });
    const out = await toolbox.execute(name, input);
    events.push({ type: "tool_result", payload: { name, ok: !out.isError, result: out.result } });
    return out;
  };
  let decisionId = null;
  try {
    const res = await interpretScript(script, {
      refs, vars, fail,
      first: () => bridge.first(),
      callTool: (name, input, step) => call(name, input, step?.where),
      callTools: (list) => Promise.all(list.map((t) => call(t.name, t.input))),
      say: async (text) => { events.push({ type: "narration", payload: { text, done: true } }); },
      think: async (text) => { events.push({ type: "reasoning", payload: { text, done: true } }); },
      onText: (raw, filled, label, step, at, scope) => {
        if (!audit) return;
        const left = unresolvedKeys(vars, raw);
        if (left.length) { errors.push(`${at} ${label}: {{${left[0]}}} does not resolve here`); return; }
        if (BROKEN.test(filled)) errors.push(`${at} ${label}: shows "${BROKEN.exec(filled)[0]}"`);
        texts.push({ at, label, text: filled });
        if (scope === "narration") {
          const bad = toolbox.ledger().unknown(filled, "narration");
          if (bad.length) errors.push(`${at} ${label}: ${bad[0].raw} is typed, not taken from a tool result (use a placeholder)`);
        }
      }
    });
    decisionId = res.decisionId;
    const st = toolbox.state();
    if (!st.nightOver) errors.push("the script ends before the night does");
    if (!st.reported) errors.push("the script publishes no management summary");
    if (plan.option && decisionId !== plan.option) errors.push(`the decision plan approves ${plan.option}, the script took ${decisionId || "no decision"}`);
  } catch (e) {
    if (e instanceof ScriptError) errors.push(e.message);
    else errors.push(`the replay failed: ${e?.message || e}`);
  }
  return { ok: errors.length === 0, errors, events, session, toolbox, vars, decisionId, calls, texts };
}

/** The decision points of a script: each propose step with its option ids and recommendation. */
function decisionPoints(script) {
  const out = [];
  const walk = (steps = []) => {
    for (const s of steps) {
      if (s.propose) {
        const ids = (s.propose.input?.options || []).map((o) => o.variant_id);
        out.push({ ids, recommended: s.propose.input?.recommended_variant_id, rejected: s.propose.rejected || {}, approved: s.propose.approved || {} });
        for (const b of Object.values(s.propose.approved || {})) walk(b);
      }
      if (s.when) for (const b of Object.values(s.when)) walk(b);
    }
  };
  for (const w of script?.wakes || []) walk(w.steps);
  return out;
}

/** Checks one scenario's script on every decision path. Returns { errors, summary, paths }. */
export async function checkScript(world, scenario, script, refs = {}, { cache = createSessionCache(), inputs = null } = {}) {
  const errors = [];
  if (!script || !Array.isArray(script.wakes) || !script.wakes.length) return { errors: ["the script has no wake-ups"], summary: "", paths: {} };
  if (script.scenario && script.scenario !== scenario.id) errors.push(`the script is for ${script.scenario}, not ${scenario.id}`);
  if (script.world_version && world.meta?.world_version && script.world_version !== world.meta.world_version) errors.push(`written for world ${script.world_version}, this app has world ${world.meta.world_version}`);
  const points = decisionPoints(script);
  if (points.length > 1) errors.push("more than one decision per script is not supported yet");
  const plans = [];
  if (points.length) {
    const p = points[0];
    if (p.ids.length !== 3) errors.push(`the options name ${p.ids.length} variants, not 3`);
    for (const id of [...p.ids, "baseline"]) if (!p.approved[id] && !p.approved.default) errors.push(`no path for approving ${id}`);
    for (const id of p.ids) if (!p.rejected[id]) errors.push(`no line for rejecting ${id}`);
    for (const id of [...p.ids, "baseline"]) plans.push({ name: `approve ${id}`, plan: { option: id } });
    const other = p.ids.find((id) => id !== p.recommended) || "baseline";
    if (p.recommended) plans.push({ name: `reject ${p.recommended}, approve ${other}`, plan: { option: other, reject: [p.recommended] } });
  } else {
    plans.push({ name: "no decision", plan: { option: null } });
  }
  const paths = {};
  let first = null;
  for (const { name, plan } of plans) {
    const r = await replayScript(script, { world, scenario, refs, plan, cache, inputs });
    for (const e of r.errors) errors.push(`${name}: ${e}`);
    const res = r.session?.run;
    paths[name] = r.ok ? { hash: res.hash, on_time: res.orders.filter((o) => o.on_time).length, orders: res.orders.length, late: res.orders.filter((o) => !o.on_time).map((o) => o.id), calls: r.calls.length, outcome: r.toolbox.state().outcome } : { failed: true };
    if (!first) first = r;
  }
  const stats = first?.ok ? {
    visible: first.calls.filter((n) => !n.startsWith("ui_")).length,
    revised: first.texts.some((t) => /(^|\n)\s*Revised:/.test(t.text)),
    recommendation: first.texts.some((t) => /(^|\n)\s*Recommendation:/.test(t.text))
  } : null;
  if (stats && points.length && !stats.recommendation) errors.push("no \"Recommendation:\" narration before the decision");
  const summary = `${script.wakes.length} wake-ups, ${stats ? `${stats.visible} visible tool calls` : "replay failed"}, ${plans.length} decision path${plans.length === 1 ? "" : "s"}`;
  return { errors: [...new Set(errors)], summary, paths };
}

/**
 * Checks for every scenario's script (Diagnostics, the world suite). Returns [{ name, ok, detail,
 * pending }]: a scenario whose script arrives later (not in SCRIPTS_REQUIRED) without one is pending.
 */
export async function checkSimRuns(world, simRuns = {}, scenarios = [], referenceCases = {}) {
  const out = [];
  const cache = createSessionCache();
  for (const sc of scenarios) {
    const def = simRuns[sc.id];
    if (!def) {
      const required = SCRIPTS_REQUIRED.includes(sc.id);
      out.push({ name: `Simulation ${sc.number}: script present`, ok: !required, pending: !required, detail: required ? `no script for ${sc.id}` : "no script yet (M4): Simulation plays this night without the agent" });
      continue;
    }
    const r = await checkScript(world, sc, def, referenceCases[sc.id] || {}, { cache });
    out.push({ name: `Simulation ${sc.number}: script valid under the live guardrails`, ok: r.errors.length === 0, detail: r.errors.length ? r.errors.slice(0, 3).join(" | ") : r.summary, paths: r.paths });
  }
  return out;
}
