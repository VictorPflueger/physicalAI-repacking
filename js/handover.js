// Which human step a run is waiting for. The run state "awaiting_approval" covers three moments:
// choosing an option, approving the drafts that follow, and confirming a provisional item-master entry
// (scenario 3). The decision and confirmation events tell them apart. The status pill, the console's
// phase line and the progress rail all name the moment through this module, so the words match
// everywhere: "Your decision", "Your approval", "Your confirmation".

import { bus, RUN_STATES } from "./events.js";

let awaited = "approval"; // "decision" | "approval" | "confirmation"
const listeners = new Set();

function set(value) {
  if (awaited === value) return;
  awaited = value;
  for (const fn of listeners) fn();
}

bus.on("run_start", () => set("approval"));
bus.on("options", () => set("decision"));
bus.on("option_decision", (ev) => { if (ev.payload?.decision === "approved") set("approval"); });
// Drafts only follow a decision, and drafting ("executing") means the decision is made. This also
// covers the do-nothing path that follows three rejections, which has no approval event.
bus.on("action_draft", () => set("approval"));
bus.on("state_change", (ev) => { if (ev.payload?.state === "executing") set("approval"); });
bus.on("confirmation_request", () => set("confirmation"));
bus.on("confirmation_decision", () => set("approval"));

/** "decision" while options wait for a choice, "confirmation" while an entry waits, otherwise "approval". */
export function awaitedStep() {
  return awaited;
}

const WAITING = { decision: "Awaiting your decision", approval: "Awaiting your approval", confirmation: "Awaiting your confirmation" };
const TURN = { decision: "Your decision", approval: "Your approval", confirmation: "Your confirmation" };

/** Display label for a run state; names the human step when the run waits for one. */
export function runStateLabel(state) {
  if (state === "awaiting_approval") return WAITING[awaited];
  return RUN_STATES[state] || state;
}

/** "Your decision", "Your approval" or "Your confirmation" for a state that waits for a person, else null. */
export function turnLabel(state) {
  if (state === "options") return TURN.decision;
  if (state === "awaiting_approval") return TURN[awaited];
  return null;
}

/** Call `fn` whenever the awaited step changes (for example right after an option is approved). */
export function onAwaitedChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
