// Progress rail: the agent's plan as five steps (the same five as the intro window), shown above
// the console. Before a run it previews the plan; during a run it shows where the agent is; when
// the agent hands over to a person, the step turns burgundy with "Your decision", "Your approval" or
// "Your confirmation".
//
// Run states map onto steps monotonically: once the agent has reached a step, a later return to an
// earlier phase (it perceives again after a correction) does not move the rail backwards.

import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { awaitedStep, onAwaitedChange, turnLabel } from "./handover.js";

export const STEPS = [
  { id: "perceive", label: "Perceive" },
  { id: "plan", label: "Plan" },
  { id: "pick", label: "Pick" },
  { id: "replan", label: "Replan" },
  { id: "prepare", label: "Prepare" }
];

const STATE_STEP = { perceiving: 0, planning: 1, picking: 2, replanning: 3, options: 3, awaiting_approval: 4, executing: 4 };
const STATE_TEXT = {
  todo: "not started", active: "in progress", done: "completed", yours: "waiting for you",
  stopped: "stopped here", skipped: "not needed"
};

export function createProgressRail() {
  const el = h("ol", { class: "rail", "aria-label": "Agent progress" });
  let reached = -1;     // furthest step reached in this run
  let ended = null;     // null while running; otherwise the run_end status
  let lastState = null; // the run state last shown

  // "Awaiting approval" covers the option decision (step 4), the drafts (step 5) and a confirmation,
  // which waits wherever the agent is.
  const stepOf = (runState) => {
    if (runState !== "awaiting_approval") return STATE_STEP[runState];
    const step = awaitedStep();
    if (step === "decision") return 3;
    if (step === "confirmation") return Math.max(reached, 0);
    return 4;
  };
  // Right after an approval, the step stops waiting for you even before the next state arrives.
  onAwaitedChange(() => { if (!ended && reached >= 0) render(lastState); });

  function render(runState) {
    lastState = runState;
    clear(el);
    const turn = turnLabel(runState);
    STEPS.forEach((step, i) => {
      let state = "todo";
      if (ended) {
        if (ended === "done") state = i <= reached ? "done" : reached >= 0 ? "skipped" : "todo";
        else state = i < reached ? "done" : i === reached ? "stopped" : "todo";
      } else if (reached >= 0) {
        if (i < reached) state = "done";
        else if (i === reached) state = turn ? "yours" : "active";
      }
      const current = !ended && reached >= 0 && i === reached;
      const mark = state === "done" ? icon("check", 16)
        : state === "yours" ? icon("user", 16)
          : state === "stopped" ? icon("stop", 14)
            : h("span", { class: "rail-num" }, String(i + 1));
      el.appendChild(h("li", {
        class: "rail-step",
        dataset: { state, step: step.id },
        ...(current ? { "aria-current": "step" } : {})
      },
      h("span", { class: "rail-dot", "aria-hidden": "true" }, mark),
      h("span", { class: "rail-label" }, step.label),
      state === "yours" ? h("span", { class: "rail-turn" }, turn) : null,
      h("span", { class: "visually-hidden" }, `: ${state === "yours" ? `${turn.toLowerCase()} needed` : STATE_TEXT[state]}`)));
    });
  }

  return {
    el,
    /** Follow a run state (state_change). */
    update(runState) {
      if (ended) return;
      const step = stepOf(runState);
      if (step !== undefined) reached = Math.max(reached, step);
      render(runState);
    },
    /** The run has ended with this status (done, incomplete, aborted, error). */
    finish(status) {
      ended = status || "done";
      render(null);
    },
    /** Back to the plan preview (Reset, or a new run). */
    reset() {
      reached = -1;
      ended = null;
      render(null);
    }
  };
}
