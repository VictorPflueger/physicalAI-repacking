// Run recorder (PLAN.md §a.4, adapted from Rebate Hunter's js/recorder.js): turns a finished Live run,
// its audit event stream, into a simulation script in the format of data/sim_runs.js, so a real run can
// replace the authored replay of its scenario: the stage's fallback then replays what the live agent
// said and did that night.
//
// What is kept, in wake-up blocks as the night woke the agent: its narration and reasoning, every tool
// call it made in order (the reads of one turn as one parallel step), the options it proposed with its
// lines after a rejection, its drafts, its confirmation request and its summary. What is not kept: the
// person's decisions (the replay waits for new ones, and a choice the live run did not make ends the
// replay with a note), refused calls, and responses that were discarded. No figure is copied: every
// euro amount, number of hours and rate the agent wrote becomes a placeholder bound to the tool result
// it came from ({{@tool#n:path|spec}}, js/sim_vars.js), so the replay computes it again (TECH_NOTES
// D45). A figure that no tool result gave cannot be bound, and the recording is refused with its place.
// A run is recorded only on the brief's night (D34); the script stores the seed, the world, engine and
// app versions, the model and the night's hash, which the script checker compares (js/sim_check.js).

import { auditEvents, auditRunInfo } from "./audit.js";
import { redactSecrets } from "./keystore.js";
import { APP } from "./config.js";
import { ENGINE_VERSION, NIGHT_INPUTS, defaults as engineDefaults } from "./engine.js";
import { extractFigures, figureLeaves, readNumber, numberSpan, MAX_RELATIVE_TOLERANCE } from "./figures.js";
import { formatRaw } from "./sim_vars.js";
import { ORDER_FREE } from "./tools.js";
import { typedFigures } from "./sim_check.js";

/** Can the last run be saved as a simulation? → { ok, reason } */
export function canRecord(run = auditRunInfo(), events = auditEvents()) {
  const no = (reason) => ({ ok: false, reason });
  if (!run) return no("No run yet. Complete a Live run of a scenario first.");
  if (run.mode !== "live") return no("Only a Live run can be saved as a simulation.");
  if (run.status === "running") return no("Available when the run has ended.");
  if (run.status !== "done") return no("Only a run that reached its management summary can be saved.");
  if (!run.scenario_id) return no("The run has no scenario.");
  if (!events.some((e) => e.type === "report")) return no("The run ended without a management summary.");
  const start = events.find((e) => e.type === "run_start")?.payload || {};
  const d = engineDefaults();
  const changed = NIGHT_INPUTS.filter((k) => start.inputs && start.inputs[k] !== d[k]);
  if (changed.length) return no(`A recorded run replays on the brief's night (TECH_NOTES D34), and this run changed ${changed.join(", ")}. Reset the assumptions and run it again.`);
  return { ok: true, reason: "" };
}

/**
 * Builds the script of the last run. Returns { key, def, issues }: issues name every figure that no
 * tool result gave (the recording is not usable then).
 */
export function buildRecordedRun(run = auditRunInfo(), events = auditEvents(), { world = globalThis.WORLD } = {}) {
  const start = events.find((e) => e.type === "run_start")?.payload || {};
  const cost = [...events].reverse().find((e) => e.type === "cost_update")?.payload || null;
  const recordedOn = localDay(run.started_at);
  const st = {
    wakes: [], cursor: null,
    calls: new Map(),        // call_id → { name, input (figures as placeholders), step?, list? }
    open: null,              // the parallel read step still taking calls (no result since it opened)
    counts: {},              // successful results per tool, as the replay's interpreter counts them
    ledger: [],              // [{ name, n, leaves }]: the figures every result so far gave, in order
    byMsg: new Map(),        // msg_id → { step, list }
    propose: null,           // the options step whose decision is still open
    waiting: false,          // between a rejection and the next decision: the replay handles it itself
    rejectionFor: null,
    decisions: { option: null, reject: [], confirm: null, drafts: [] }
  };

  const push = (step) => { st.cursor.push(step); return step; };
  const where = () => `wake ${st.wakes.length}`;
  const text = (t, label) => bind(t, `${where()} ${label}`, st);
  const deep = (v, label) => bindDeep(v, `${where()} ${label}`, st);

  for (const ev of events) {
    const p = ev.payload || {};
    switch (ev.type) {
      case "wake":
        // The first wake-up opens the script; the others arrive as sim_advance results.
        if (!st.wakes.length) newWake(st, p.kinds || [p.kind]);
        break;
      case "narration": {
        if (!st.cursor || !p.done || !String(p.text || "").trim()) break;
        if (st.waiting) {
          // What the agent says after a rejection is that option's rejection line.
          if (st.rejectionFor && st.propose) {
            const prev = st.propose.propose.rejected[st.rejectionFor];
            const line = text(p.text, `rejection line for ${st.rejectionFor}`);
            st.propose.propose.rejected[st.rejectionFor] = prev ? `${prev}\n\n${line}` : line;
          }
          break;
        }
        const seen = st.byMsg.get(`n:${p.msg_id}`);
        if (seen) seen.step.say = text(p.text, "narration");
        else st.byMsg.set(`n:${p.msg_id}`, { step: push({ say: text(p.text, "narration") }), list: st.cursor });
        st.open = null;
        break;
      }
      case "reasoning": {
        if (!st.cursor || !p.done || !String(p.text || "").trim() || st.waiting) break;
        const seen = st.byMsg.get(`r:${p.msg_id}`);
        if (seen) seen.step.think = text(p.text, "reasoning");
        else st.byMsg.set(`r:${p.msg_id}`, { step: push({ think: text(p.text, "reasoning") }), list: st.cursor });
        st.open = null;
        break;
      }
      case "attempt_discarded":
        // A response that was not kept leaves no step.
        for (const id of p.msg_ids || []) { drop(st.byMsg.get(`n:${id}`)); drop(st.byMsg.get(`r:${id}`)); }
        for (const id of p.call_ids || []) dropCall(st, id);
        break;
      case "tool_call": {
        if (!st.cursor) break;
        const name = p.name;
        const call = { name, input: p.input || {} };
        st.calls.set(p.call_id, call);
        if (st.waiting) break; // between a rejection and the next decision nothing is replayed
        if (name === "ui_await_decision" || name.startsWith("ui_") || name === "sim_advance") {
          // Bound now, with the figures the agent had seen when it wrote the call.
          if (name !== "ui_await_decision") call.bound = deep(call.input, name);
          st.open = null;
          break;
        }
        // A read, an engine call or an action: in order, the reads of one turn as one parallel step.
        const input = deep(call.input, name);
        if (ORDER_FREE(name) && st.open) {
          st.open.tools.push({ tool: name, input });
          call.step = st.open; call.list = st.cursor;
        } else {
          const step = { tools: [{ tool: name, input }] };
          push(step);
          call.step = step; call.list = st.cursor;
          st.open = ORDER_FREE(name) ? step : null;
        }
        call.entry = call.step.tools.at(-1);
        break;
      }
      case "tool_result": {
        const call = st.calls.get(p.call_id) || { name: p.name, input: {} };
        const name = p.name || call.name;
        st.open = null;
        if (p.ok === false) { dropCall(st, p.call_id); break; }
        if (st.waiting && !["ui_await_decision"].includes(name)) { dropCall(st, p.call_id); break; }
        // The figures this result gives, numbered as the replay numbers them.
        st.counts[name] = (st.counts[name] || 0) + 1;
        st.ledger.push({ name, n: st.counts[name], leaves: figureLeaves(p.result) });
        onResult(st, name, call, p.result, { recordedOn });
        break;
      }
      default:
        break;
    }
  }

  // Parallel steps with one call are plain tool steps.
  const tidy = (steps) => steps.forEach((s, i) => {
    if (s.tools && s.tools.length === 1) steps[i] = { tool: s.tools[0].tool, ...(Object.keys(s.tools[0].input || {}).length ? { input: s.tools[0].input } : {}) };
    else if (s.tools) for (const t of s.tools) if (!Object.keys(t.input || {}).length) delete t.input;
    if (s.propose) for (const b of Object.values(s.propose.approved)) tidy(b);
    if (s.confirm) for (const k of ["confirmed", "rejected"]) tidy(s.confirm[k]);
  });
  for (const w of st.wakes) tidy(w.steps);
  st.wakes = st.wakes.filter((w) => w.steps.length || w === st.wakes[0]);

  const def = {
    source: "recorded",
    scenario: run.scenario_id,
    world_version: world?.meta?.world_version || null,
    title: run.title || null,
    recorded: {
      at: run.started_at, recorded_on: recordedOn,
      model: run.model || start.model || null, model_label: start.model_label || null,
      app_version: APP.version, world_version: world?.meta?.world_version || null, engine_version: ENGINE_VERSION,
      seed: run.seed ?? start.seed ?? null, autonomy: start.autonomy || "approve", inputs: start.inputs || null,
      run_id: run.run_id, night_hash: run.night_hash || null,
      cost_eur: cost && typeof cost.eur === "number" ? Math.round(cost.eur * 100) / 100 : null,
      decisions: st.decisions
    },
    wakes: st.wakes
  };
  // A figure no recorded result gave stays typed in the script, where the checker would refuse it.
  return { key: run.scenario_id, def, issues: typedFigures(def).map((f) => `${f.where}: ${f.raw}`) };
}

/** The downloadable script: appended to data/sim_runs.js, it replaces the authored replay. */
export function recordedRunScript({ key, def }) {
  const r = def.recorded || {};
  const when = r.at ? `${r.at.replace("T", " ").slice(0, 16)} UTC` : "an unknown time";
  const header = [
    "/*",
    " * REPACK PILOT: a recorded live run, saved with \"Save run as simulation\" (js/recorder.js).",
    ` * Scenario: ${key}${def.title ? ` (${String(def.title).replace(/\*\//g, "* /")})` : ""}`,
    ` * Recorded: ${when} with ${r.model_label || r.model || "an unknown model"}; Repack Pilot ${r.app_version}, engine ${r.engine_version}, world ${r.world_version}, seed ${r.seed}`,
    " * Every figure is a placeholder bound to a recorded tool result: the replay computes it again.",
    " * To use it, append this file's content to the end of data/sim_runs.js: it then replaces the authored",
    " * replay of this scenario. Delete it again to restore the authored one.",
    " */"
  ].join("\n");
  const body = `window.SIM_RUNS = window.SIM_RUNS || {};\nwindow.SIM_RUNS[${JSON.stringify(key)}] = ${JSON.stringify(def, null, 2)};\n`;
  return redactSecrets(`${header}\n${body}`);
}

export function recordedRunFileName({ key, def }) {
  return `sim-run-${key}-recorded-${String(def.recorded?.recorded_on || localDay(new Date().toISOString())).replace(/-/g, "")}.js`;
}

/**
 * Builds, checks and downloads the script of the last run. check(def) → Promise<{ errors }> (the script
 * checker); download(name, text). Returns { ok, message, name?, text? }.
 */
export async function saveRunAsSimulation({ check, download } = {}) {
  const can = canRecord();
  if (!can.ok) return { ok: false, message: can.reason };
  const rec = buildRecordedRun();
  if (rec.issues.length) return { ok: false, message: `The recording cannot replay ${rec.issues.length === 1 ? "a figure" : `${rec.issues.length} figures`} that no tool returned (${rec.issues.slice(0, 3).join("; ")}). Run the scenario again.` };
  const result = check ? await check(rec.key, rec.def) : { errors: [] };
  if (result.errors.length) return { ok: false, message: `The recording is not a valid simulation script (${result.errors[0]}).` };
  const name = recordedRunFileName(rec);
  const text = recordedRunScript(rec);
  download?.(name, text);
  return { ok: true, name, text, message: `Saved ${name}. Append it to data/sim_runs.js to replay this run in Simulation instead of the authored script.` };
}

// ---- building the steps ----------------------------------------------------------------------------

function newWake(st, kinds) {
  const w = { kinds: [...kinds], steps: [] };
  st.wakes.push(w);
  st.cursor = w.steps;
  st.open = null;
  st.propose = null;
  st.waiting = false;
}

function onResult(st, name, call, result, { recordedOn }) {
  const r = result || {};
  const push = (step) => { st.cursor.push(step); return step; };
  switch (name) {
    case "sim_advance":
      push({ tool: "sim_advance" });
      newWake(st, r.kinds || []);
      return;
    case "ui_propose_options":
      st.propose = push({ propose: { input: call.bound || {}, rejected: {}, approved: {} } });
      decided(st, r, recordedOn);
      return;
    case "ui_await_decision":
      decided(st, r, recordedOn);
      return;
    case "ui_request_confirmation": {
      const choice = r.choice === "confirm" ? "confirmed" : "rejected";
      const other = choice === "confirmed" ? "rejected" : "confirmed";
      const branch = [];
      push({ confirm: { input: call.bound || {}, [choice]: branch, [other]: [{ end: `This replay holds only the path of the live run of ${recordedOn}, where the entry was ${choice}. It stops here; ${choice === "confirmed" ? "confirm" : "reject"} the entry to see the rest of that run.` }] } });
      st.decisions.confirm = r.choice === "confirm" ? "confirm" : "reject";
      st.cursor = branch;
      return;
    }
    case "ui_await_approvals":
      push({ tool: "ui_await_approvals" });
      for (const d of r.decisions || []) st.decisions.drafts.push(d.decision === "approved" ? "approve" : "reject");
      return;
    case "ui_final_report": {
      const input = call.bound || {};
      push({ tool: "ui_final_report", input: { ...(input.outcome ? { outcome: input.outcome } : {}), markdown: replayReport(input.markdown, recordedOn) } });
      return;
    }
    default:
      if (name.startsWith("ui_")) push({ tool: name, input: call.bound || {} });
      // Reads, engine calls and actions were placed when they were called.
  }
}

/** A decision came back from the options: a rejection waits again, an approval opens its branch. */
function decided(st, r, recordedOn) {
  if (!st.propose || !r.decision) return;
  if (r.decision === "rejected") {
    st.waiting = true;
    st.rejectionFor = r.option_id;
    st.decisions.reject.push(r.option_id);
    return;
  }
  const branch = [];
  const label = r.option_id === "baseline" ? "doing nothing" : r.refer_to_it_as || `option ${r.option_id}`;
  st.propose.propose.approved[r.option_id] = branch;
  st.propose.propose.approved.default = [{ end: `This replay holds only the path of the live run of ${recordedOn}, where ${label} was approved. It stops here; approve ${label} to see the rest of that run.` }];
  st.decisions.option = r.option_id;
  st.waiting = false;
  st.rejectionFor = null;
  st.cursor = branch;
}

function drop(ref) {
  if (!ref) return;
  const k = ref.list.indexOf(ref.step);
  if (k >= 0) ref.list.splice(k, 1);
}

function dropCall(st, callId) {
  const call = st.calls.get(callId);
  if (!call?.step) return;
  const k = call.step.tools.indexOf(call.entry);
  if (k >= 0) call.step.tools.splice(k, 1);
  if (!call.step.tools.length) drop({ step: call.step, list: call.list });
  call.step = null;
}

/** The live summary, re-labelled for its replay: a recorded run is a simulated run now. */
function replayReport(markdown, recordedOn) {
  const lines = String(markdown || "").split("\n").filter((l) => !/live agent run/i.test(l));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return `${lines.join("\n")}\n\n*Simulated run: a replay of a live run recorded on ${recordedOn}, on a simulated cell. Ruhrkorb, its DC, stores and items are fictional; every hour and euro is computed again by the engine at playback.*`;
}

// ---- binding figures to tool results --------------------------------------------------------------

const SCALE_AFTER = /^[    ]?(k|K|thousand|m|M|million|Mio\.?)(?![A-Za-z])/;

/**
 * A text with every euro amount, number of hours and rate replaced by a placeholder bound to the latest
 * tool result that gave it, written with the decimals and separators the agent used. A figure no
 * result gave stays as it is (buildRecordedRun lists it as an issue if it is still in the script).
 */
function bind(textIn, where, st) {
  const s = String(textIn ?? "");
  const figs = extractFigures(s);
  if (!figs.length) return s;
  let out = s;
  for (const f of [...figs].sort((a, b) => b.index - a.index)) {
    const at = s.indexOf(f.raw, f.index);
    const span = numberSpan(f.raw);
    if (at < 0 || !span) continue;
    const after = f.raw.slice(span.end);
    const scaleWord = SCALE_AFTER.exec(after)?.[1]?.toLowerCase() || "";
    const scale = scaleWord.startsWith("k") || scaleWord === "thousand" ? 1e3 : scaleWord ? 1e6 : 1;
    const hit = findLeaf(st.ledger, f.kind, span.text, scale);
    if (!hit) continue;
    const spec = `${hit.reading.decimals}${hit.grouped ? "g" : ""}${hit.german ? "d" : ""}${scale === 1e3 ? "k" : scale === 1e6 ? "m" : ""}`;
    const key = `{{@${hit.name}#${hit.n}:${hit.path.join(".")}|${spec}}}`;
    out = `${out.slice(0, at + span.start)}${key}${out.slice(at + span.end)}`;
  }
  return out;
}

function bindDeep(value, where, st) {
  if (typeof value === "string") return bind(value, where, st);
  if (Array.isArray(value)) return value.map((x, i) => bindDeep(x, `${where}[${i}]`, st));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, bindDeep(x, `${where}.${k}`, st)]));
  return value;
}

/** The latest result's leaf of this kind whose value the written number reads as (within its precision). */
function findLeaf(ledger, kind, token, scale) {
  const seps = token.match(/[.,'’    ]/g) || [];
  for (let i = ledger.length - 1; i >= 0; i--) {
    const entry = ledger[i];
    let best = null;
    for (const leaf of entry.leaves) {
      if (leaf.kind !== kind) continue;
      const v = Math.abs(leaf.value);
      for (const reading of readNumber(token)) {
        const value = reading.value * scale;
        const tol = Math.min((scale * 10 ** -reading.decimals) / 2, Math.abs(value) * MAX_RELATIVE_TOLERANCE);
        if (Math.abs(v - value) > tol + 1e-9) continue;
        const dec = reading.decimals > 0 ? seps.at(-1) : null;
        const grp = reading.decimals > 0 ? (seps.length > 1 ? seps[0] : null) : seps[0] || null;
        const german = dec === "," || grp === ".";
        const spec = `${reading.decimals}${grp ? "g" : ""}${german ? "d" : ""}${scale === 1e3 ? "k" : scale === 1e6 ? "m" : ""}`;
        // An exact rewrite of the written number is best; a figure within its precision will do.
        const exact = formatRaw(leaf.value, spec) === token.replace(/[’    ']/g, (c) => (german ? "." : ","));
        const score = exact ? 0 : Math.abs(v - value);
        if (!best || score < best.score) best = { name: entry.name, n: entry.n, path: leaf.path, reading, grouped: !!grp, german, score };
      }
    }
    if (best) return best;
  }
  return null;
}

/** "2026-10-18" in the browser's own day (the recording day the file name and the notes use). */
function localDay(iso) {
  const d = new Date(iso || Date.now());
  const x = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
