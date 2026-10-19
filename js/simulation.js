// The scripted replay (Simulation mode, PLAN.md §a.2): plays a scenario's script (data/sim_runs.js)
// through the live agent's own tools (js/tools.js) on the shared night session, so the screen shows
// exactly what a live agent would produce for the same decisions: the same events, the same engine
// figures, the same guardrails. Only the words are written in advance, and they quote no figure of
// their own ({{placeholders}}, js/sim_vars.js). The script interpreter is js/script.js, shared with the
// script checker (js/sim_check.js), which replays every decision path before a demo.
//
// Narration streams in at a reading pace and every tool call takes a moment, both faster at ×2 and ×4.
// The night itself stands still while the replay takes its turn, as it does for the live agent.

import { bus } from "./events.js";
import { createToolbox } from "./tools.js";
import { interpretScript } from "./script.js";
import { createHumanChannel, ABORT } from "./human.js";
import { createOffLookup } from "./openfoodfacts.js";

// Pacing at ×1 for the five-minute customer call (TECH_NOTES D50): the presenter talks over the
// narration, so it streams briskly; tool calls, which the simple console leaves to Details, take a beat.
export const CHARS_PER_SECOND = 45;  // narration
export const TOOL_MS = 900;          // a tool call (or parallel reads)
export const DRAFT_MS = 900;         // a draft appearing in the Outbox
export const BEFORE_SAY_MS = 500;    // the pause before a paragraph, as a model's before it writes
export const AFTER_SAY_MS = 400;     // and after it

/** hooks: { getSpeed() → 1 | 2 | 4, getAutonomy() → "advise" | "approve" | "bounded" } */
export function createSimulationPlayer({ getSpeed = () => 1, getAutonomy = () => "approve" } = {}) {
  let current = null;

  /**
   * Plays one script. opts: { session, bridge (js/wake_bridge.js), scenario, refs (its reference inputs),
   * getInputs() → the replay's engine inputs, onBeforeEnd(status) }. Resolves when the run has ended.
   */
  async function play(script, { session, bridge, scenario, refs = {}, getInputs, onBeforeEnd } = {}) {
    const run = { ended: false, cancelled: false, msg: 0, call: 0, waits: new Set(), onBeforeEnd, ac: new AbortController() };
    current = run;
    const human = createHumanChannel(bus, { isEnded: () => run.ended });
    run.human = human;
    const emit = (type, payload) => { if (!run.ended) bus.emit(type, payload); };
    const toolbox = createToolbox({
      session, getInputs, mode: "simulation", emit,
      waitUntil: human.waitUntil, takeOptionDecision: human.takeOptionDecision, takeConfirmation: human.takeConfirmation,
      drafts: human.drafts,
      onPhase: (state) => emit("state_change", { state }),
      advance: () => human.guard(bridge.advance()),
      autonomy: getAutonomy,
      lookup: createOffLookup({ mode: "simulation" }),
      signal: run.ac.signal,
      pause: (ms) => wait(run, ms, false)
    });

    const env = {
      refs, vars: {},
      autonomy: getAutonomy,
      describeWake: (w) => toolbox.describeWake(w),
      first: () => human.guard(bridge.first()),
      fail: (msg) => { throw new Error(`The scripted replay does not fit tonight's night: ${msg}.`); },
      say: (text) => say(run, text),
      think: async (text) => { emit("reasoning", { msg_id: `sim-r${++run.msg}`, text, done: true }); await wait(run, 300); },
      callTool: (name, input) => callTool(run, toolbox, name, input),
      callTools: (list) => callTools(run, toolbox, list)
    };

    emit("cost_update", { simulated: true, eur: 0, usd: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 });
    toolbox.setPhase("perceiving");
    try {
      const res = await interpretScript(script, env);
      // A recorded run ends early on a choice its live run did not make: the replay stops, labelled.
      if (!run.ended) {
        if (res?.ended) {
          bus.emit("notice", { level: "info", text: "This replay holds only the path the recorded live run took, so it stops here. Choose that path, or run the scenario in Live mode." });
          end(run, "incomplete", "The recorded run holds only the path its live run took.");
        } else end(run, "done");
      }
    } catch (e) {
      if (e === ABORT || run.cancelled) return;
      console.error("[Repack Pilot] scripted replay stopped:", e);
      bus.emit("notice", { level: "error", text: String(e?.message || e) });
      end(run, "error", "The scripted replay stopped; see the message above.");
    } finally {
      human.close();
      if (current === run) current = null;
    }
  }

  function end(run, status, reason) {
    if (run.ended) return;
    run.onBeforeEnd?.(status);
    run.ended = true;
    bus.emit("state_change", { state: status === "done" ? "done" : status === "aborted" ? "aborted" : status === "incomplete" ? "stopped" : "error" });
    bus.emit("run_end", { status, ...(reason ? { reason } : {}) });
  }

  /** A pause scaled by the replay speed; rejects when the run is stopped. */
  function wait(run, ms, scaled = true) {
    if (run.cancelled) return Promise.reject(ABORT);
    const speed = scaled ? Math.max(0.25, Number(getSpeed()) || 1) : 1;
    return new Promise((resolve, reject) => {
      const cancel = () => { clearTimeout(t); reject(ABORT); };
      const t = setTimeout(() => { run.waits.delete(cancel); resolve(); }, ms / speed);
      run.waits.add(cancel);
    });
  }

  /**
   * Narration at a brisk reading pace (about 45 characters a second at ×1, 90 at ×2), in chunks of a few
   * words, after a pause like a model's before it writes (TECH_NOTES D50).
   */
  async function say(run, text) {
    const id = `sim-n${++run.msg}`;
    await wait(run, BEFORE_SAY_MS);
    const words = String(text).split(/(\s+)/);
    const chunk = 8;
    let out = "";
    for (let i = 0; i < words.length; i += chunk) {
      const piece = words.slice(i, i + chunk).join("");
      out += piece;
      if (!run.ended) bus.emit("narration", { msg_id: id, text: out, done: false });
      await wait(run, Math.max(60, (piece.length / CHARS_PER_SECOND) * 1000));
    }
    if (!run.ended) bus.emit("narration", { msg_id: id, text, done: true });
    await wait(run, AFTER_SAY_MS);
  }

  async function callTool(run, toolbox, name, input) {
    const call_id = `sim-c${++run.call}`;
    if (!run.ended) bus.emit("tool_call", { call_id, name, input, server: false });
    if (name !== "sim_advance" && !name.startsWith("ui_")) await wait(run, TOOL_MS);
    else if (name === "ui_draft_action") await wait(run, DRAFT_MS);
    const out = await toolbox.execute(name, input);
    if (run.cancelled || run.ended) throw ABORT;
    bus.emit("tool_result", { call_id, name, ok: !out.isError, summary: out.summary, result: out.result, server: false });
    if (name !== "sim_advance") await wait(run, 250);
    return out;
  }

  /** Reads in parallel, as a live model turn makes them: every call first, then every result. */
  async function callTools(run, toolbox, list) {
    const ids = list.map(() => `sim-c${++run.call}`);
    list.forEach((t, k) => { if (!run.ended) bus.emit("tool_call", { call_id: ids[k], name: t.name, input: t.input, server: false }); });
    await wait(run, TOOL_MS);
    const outs = await Promise.all(list.map((t) => toolbox.execute(t.name, t.input)));
    if (run.cancelled || run.ended) throw ABORT;
    outs.forEach((out, k) => bus.emit("tool_result", { call_id: ids[k], name: list[k].name, ok: !out.isError, summary: out.summary, result: out.result, server: false }));
    await wait(run, 250);
    return outs;
  }

  /** Stops the replay (Abort, Reset). */
  function abort(reason = "Stopped by the user.") {
    const run = current;
    if (!run || run.ended) return;
    run.cancelled = true;
    run.ac.abort();
    for (const w of [...run.waits]) w();
    run.waits.clear();
    run.human?.cancel();
    end(run, "aborted", reason);
  }

  return { play, abort, isActive: () => !!current && !current.ended };
}
