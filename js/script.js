// The simulation script interpreter, shared by the scripted replay in the browser (js/simulation.js)
// and the script checker in Node and in Diagnostics (js/sim_check.js), so both walk a script the same
// way. Pure: everything it does goes through `env`.
//
// A script (data/sim_runs.js) is a list of wake-ups, each with the kinds it expects (night start, a
// world-model correction, escalations, a new order, a cut-off risk, night end) and its steps:
//   { say: text }                  narration ({{placeholders}} from tool results; a text may be a map by decision)
//   { think: text }                a reasoning summary
//   { tool: name, input | ref }    one tool call through the shared executors (js/tools.js); `ref` takes the
//                                  input from data/reference_cases.js
//   { tools: [{ tool, input }] }   reads in parallel, as one model turn would make them
//   { propose: { input, rejected: { id: text }, approved: { id | "baseline" | "default": [steps] } } }
//                                  ui_propose_options, then the person's decision: a rejection says its line
//                                  and waits again (ui_await_decision); an approval runs its steps
//   { when: { id | "baseline" | "default": [steps] } }   steps for the decision taken earlier tonight
// Every wake-up but the last ends with { tool: "sim_advance" }, whose result is the next wake-up.

import { varsFrom, decisionVars, pick, pickDeep, fillTemplate, fillDeep } from "./sim_vars.js";
import { defaults as engineDefaults, NIGHT_INPUTS, nightParams } from "./engine.js";

export const STEP_KINDS = ["say", "think", "tool", "tools", "propose", "when"];

/**
 * The inputs of a scripted replay (TECH_NOTES D34): a script is written and checked for its scenario's
 * night at the brief's rates, so the inputs that shape the night (r_m, r_c, p, the call-in minimum) stay
 * at their defaults for the replay; the money inputs (labour cost, call-in premium, the cost of a late
 * order) and the annual scale are the presenter's, and every euro follows them.
 */
export function replayInputs(v) {
  const d = engineDefaults();
  return { ...v, ...Object.fromEntries(NIGHT_INPUTS.map((k) => [k, d[k]])) };
}

/** The night simulation's parameters for a set of inputs (the replay's, or a live run's). */
export const REPLAY_PARAMS = (v) => nightParams(v);

/** The night-shaping inputs the presenter has changed (a replay keeps them at their defaults). */
export function changedNightInputs(v) {
  const d = engineDefaults();
  return NIGHT_INPUTS.filter((k) => v[k] !== d[k]);
}

/** True when a wake-up has exactly the kinds a script expects (in any order). */
export function sameKinds(expected = [], actual = []) {
  const a = [...expected].sort().join("+");
  const b = [...actual].sort().join("+");
  return a === b;
}

/**
 * Walks a script. env: {
 *   refs: reference inputs for this scenario, vars: {} (filled as it goes),
 *   first() → Promise<wake>                      the night-start wake-up ({ wake_id, kinds, clock })
 *   callTool(name, input, step) → Promise<{ result, isError }>
 *   callTools(list, step) → Promise<[{ result, isError }]>
 *   say(text, step), think(text, step) → Promise
 *   fail(message) → never returns normally (throws)
 *   onWake?(wake, def, index), onText?(raw, filled, label, step, where, scope)  (the checker audits what is written)
 * }
 * Resolves with { decisionId } once the last wake-up's steps are done.
 */
export async function interpretScript(script, env) {
  const state = { decisionId: null, wake: null };
  const vars = env.vars;
  const wakes = Array.isArray(script?.wakes) ? script.wakes : [];
  if (!wakes.length) env.fail("the script has no wake-ups");
  state.wake = await env.first();
  for (const [i, def] of wakes.entries()) {
    const where = `wake ${i + 1}`;
    if (!state.wake) env.fail(`${where}: the night ended before this wake-up`);
    if (!sameKinds(def.kinds, state.wake.kinds)) env.fail(`${where}: the script expects ${def.kinds.join(" + ")}, the night is at ${state.wake.kinds.join(" + ")} (${state.wake.clock})`);
    env.onWake?.(state.wake, def, i);
    const advanced = await runSteps(def.steps || [], `${where}`);
    const last = i === wakes.length - 1;
    if (!last && !advanced) env.fail(`${where}: the steps do not end with sim_advance`);
    if (last && advanced) env.fail(`${where}: the last wake-up must not call sim_advance`);
  }
  return { decisionId: state.decisionId };

  /** Runs steps; returns true when the last step advanced the night (state.wake is then the next wake-up). */
  async function runSteps(steps, where) {
    let advanced = false;
    for (const [k, step] of steps.entries()) {
      const at = `${where}, step ${k + 1}`;
      const kinds = STEP_KINDS.filter((x) => x in step);
      if (kinds.length !== 1) env.fail(`${at}: expected one step type, found ${kinds.join(", ") || "none"}`);
      if (advanced) env.fail(`${at}: steps after sim_advance belong to the next wake-up`);
      const kind = kinds[0];
      if (kind === "say" || kind === "think") {
        const text = fill(step[kind], `${kind === "say" ? "narration" : "reasoning"}`, step, at);
        await (kind === "say" ? env.say(text, step) : env.think(text, step));
      } else if (kind === "tool") {
        const input = step.ref !== undefined ? refInput(step.ref, at) : fillDeep(vars, pickDeep(step.input || {}, state.decisionId));
        const out = await env.callTool(step.tool, input, step);
        took(step.tool, input, out, at);
        if (step.tool === "sim_advance") { state.wake = out.result; advanced = true; }
      } else if (kind === "tools") {
        const list = (step.tools || []).map((t) => ({ name: t.tool, input: t.ref !== undefined ? refInput(t.ref, at) : fillDeep(vars, pickDeep(t.input || {}, state.decisionId)) }));
        if (list.some((t) => t.name === "sim_advance")) env.fail(`${at}: sim_advance cannot run in parallel`);
        const outs = await env.callTools(list, step);
        outs.forEach((out, j) => took(list[j].name, list[j].input, out, `${at}.${j + 1}`));
      } else if (kind === "propose") {
        const p = step.propose || {};
        const input = fillDeep(vars, p.input || {});
        const texts = (x) => [x.baseline_description, ...(x.options || []).flatMap((o) => [o.title, o.description, o.residual_risk])];
        const raw = texts(p.input || {});
        texts(input).forEach((t, j) => env.onText?.(raw[j], t, "option text", step, at, "options"));
        let out = await env.callTool("ui_propose_options", input, step);
        took("ui_propose_options", input, out, at);
        for (;;) {
          const r = out.result || {};
          if (r.decision === "rejected") {
            const line = p.rejected?.[r.option_id];
            if (line) await env.say(fill(line, "rejection line", step, at), step);
            out = await env.callTool("ui_await_decision", {}, step);
            took("ui_await_decision", {}, out, at);
            continue;
          }
          if (r.decision !== "approved") env.fail(`${at}: no decision came back (${JSON.stringify(r).slice(0, 120)})`);
          state.decisionId = r.option_id;
          Object.assign(vars, decisionVars({ id: r.option_id, letter: r.refer_to_it_as ? r.refer_to_it_as.replace(/^option /, "") : null, title: (r.option || "").replace(/^Option [A-C]: /, "") }));
          const branch = p.approved?.[r.option_id] || p.approved?.default;
          if (!branch) env.fail(`${at}: no steps for approving ${r.option_id}`);
          advanced = await runSteps(branch, `${at} (${r.option_id} approved)`);
          break;
        }
      } else if (kind === "when") {
        const branch = step.when?.[state.decisionId || "none"] || step.when?.default;
        if (branch) advanced = await runSteps(branch, `${at} (${state.decisionId || "no decision"})`);
      }
    }
    return advanced;
  }

  function fill(text, label, step, at) {
    const picked = pick(text, state.decisionId);
    if (picked === undefined || picked === null) env.fail(`${at}: no ${label} for ${state.decisionId || "this path"}`);
    const filled = fillTemplate(vars, picked);
    env.onText?.(picked, filled, label, step, at, "narration");
    return filled;
  }

  function refInput(ref, at) {
    const x = env.refs?.[ref];
    if (x === undefined) env.fail(`${at}: no reference input "${ref}"`);
    return JSON.parse(JSON.stringify(x));
  }

  function took(name, input, out, at) {
    if (out.isError) env.fail(`${at}: ${name} was refused: ${out.result?.error || "error"}`);
    Object.assign(vars, varsFrom(name, input, out.result));
  }
}
