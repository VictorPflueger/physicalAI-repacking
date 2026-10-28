// Control bar: start, scenario picker, model, night speed, the autonomy dial, status, abort, reset,
// diagnostics. The dial (PLAN.md §g): Advise · Approve · Bounded, a group of toggle buttons the app owns
// (drawn like the replay speed, its chosen level in ink); Bounded carries a lock and opens the
// shadow-mode gate's reasons (js/autonomy_view.js).
// The view switch (Customer, Full; TECH_NOTES D62) goes into the header beside the mode badge when a
// slot is given, the same place in both views: the Full view's bar has no room for it at laptop widths.

import { h, setDisabled, isDisabled, withTooltip } from "./dom.js";
import { icon } from "./icons.js";
import { MODELS, UI } from "./config.js";
import { isRunning, isFinished } from "./state.js";
import { runStateLabel, onAwaitedChange } from "./handover.js";
import { LEVELS } from "./autonomy.js";
import { lockReason, currentGate } from "./autonomy_view.js";
import { VIEWS } from "./view.js";

const STATE_TONE = {
  idle: "", previewing: "active", perceiving: "active", planning: "active", picking: "active", replanning: "active",
  options: "waiting", awaiting_approval: "waiting", executing: "active", done: "done", stopped: "stopped", aborted: "stopped", error: "stopped"
};
// The status pill is a Vici tag in its tone, with a mark of its own and its words: ink while the
// agent works (a pulsing hexagon), merlot when it waits for you, success when done, danger when stopped.
const TONE_TAG = { "": "", active: "", waiting: "vc-tag--accent", done: "vc-tag--success", stopped: "vc-tag--danger" };

/**
 * handlers: { onStart, onSelectScenario(id), onSelectModel(id), onSpeed(n), onAutonomy(level), onShowGate,
 *             onAbort, onReset, onView(id), onDiagnostics }
 * viewRoot: where the view switch goes (the header's slot); without it, the bar.
 */
export function createControls(root, scenarios, handlers, { viewRoot = null } = {}) {
  const startBtn = h("button", { class: "vc-button", type: "button", id: "btn-start" }, icon("play", 18), h("span", {}, "Start agent"));
  startBtn.addEventListener("click", () => { if (!isDisabled(startBtn)) handlers.onStart(); });

  const scenarioDd = dropdown({
    id: "scenario",
    caption: "Scenario",
    width: 280,
    items: scenarios.map((s) => ({ id: s.id, badge: String(s.number), title: s.title, hint: s.category })),
    onSelect: (id) => handlers.onSelectScenario(id)
  });

  const modelDd = dropdown({
    id: "model",
    caption: "Model",
    width: 180,
    items: MODELS.map((m) => ({ id: m.id, title: m.label, hint: m.hint })),
    onSelect: (id) => handlers.onSelectModel(id)
  });

  // The night clock's speed: it applies in both modes, because the simulated night moves the same
  // way whichever producer runs the agent (PLAN.md decision 5).
  const speedBtns = UI.speeds.map((n) => {
    const b = h("button", { type: "button", "aria-pressed": "false", "aria-label": `Night speed ×${n}` }, `×${n}`);
    b.addEventListener("click", () => handlers.onSpeed(n));
    return b;
  });
  const speedGroup = h("div", { class: "segmented", role: "group", "aria-label": "Night speed" }, speedBtns);

  // The autonomy dial. Advise and Approve are a person's setting for the next run; Bounded stays locked
  // while the shadow-mode gate is not met, and its segment explains why instead of switching.
  const gate = currentGate();
  const dialBtns = LEVELS.map((lv) => {
    const locked = lv.id === "bounded" && !gate.met;
    const b = h("button", {
      type: "button", "aria-pressed": "false", dataset: { level: lv.id, ...(locked ? { locked: "true" } : {}) },
      "aria-label": locked ? "Bounded, locked: show why" : `Autonomy ${lv.label}`,
      title: locked ? lockReason(gate) : lv.text,
      ...(locked ? { "aria-haspopup": "dialog" } : {})
    }, locked ? [icon("lock", 15), h("span", { class: "btn-text" }, lv.label)] : lv.label);
    b.addEventListener("click", () => {
      if (locked) return handlers.onShowGate?.();
      if (isDisabled(b)) return;
      handlers.onAutonomy?.(lv.id);
    });
    return b;
  });
  // Bounded keeps only its lock on laptop screens: its tooltip names it then.
  const dial = h("div", { class: "segmented autonomy-dial", role: "group", "aria-label": "Autonomy" },
    dialBtns.map((b) => (b.dataset.locked === "true" ? withTooltip(b, "Bounded, locked: show why", { below: true }) : b)));

  // The two views of the workspace (js/view.js): the Customer view for the call, the Full view's board.
  const viewBtns = VIEWS.map((v) => {
    const b = h("button", { type: "button", "aria-pressed": "false", dataset: { view: v.id }, title: v.title, "aria-label": `${v.label} view` }, v.label);
    b.addEventListener("click", () => handlers.onView?.(v.id));
    return b;
  });
  const viewGroup = h("div", { class: "segmented view-switch", role: "group", "aria-label": "View" }, viewBtns);

  const pill = h("div", { class: "vc-tag status-pill", role: "status", "aria-live": "polite" }, h("span", { class: "dot", "aria-hidden": "true" }), h("span", { class: "text" }, "Idle"));

  const abortBtn = h("button", { class: "vc-button vc-button--danger", type: "button", id: "btn-abort" }, icon("stop", 18), "Abort");
  abortBtn.addEventListener("click", () => { if (!isDisabled(abortBtn)) handlers.onAbort(); });
  // Reset and Diagnostics lose their words on laptop screens: their tooltips name them then.
  const resetBtn = h("button", { class: "vc-button vc-button--outline", type: "button", id: "btn-reset", title: "Clear the workspace" }, icon("reset", 18), h("span", { class: "btn-text" }, "Reset"));
  resetBtn.addEventListener("click", () => handlers.onReset());
  const diagBtn = h("button", { class: "vc-button vc-button--ghost", type: "button", id: "btn-diagnostics", title: "Test every external service from this browser" }, icon("pulse", 18), h("span", { class: "btn-text" }, "Diagnostics"));
  diagBtn.addEventListener("click", () => handlers.onDiagnostics());

  root.append(
    startBtn,
    scenarioDd.el,
    h("span", { class: "control-group ctl-model" }, modelDd.el),
    h("span", { class: "control-group" }, h("span", { class: "control-label" }, "Night"), speedGroup),
    h("span", { class: "control-group ctl-autonomy" }, h("span", { class: "control-label" }, "Autonomy"), dial),
    h("span", { class: "spacer" }),
    pill,
    abortBtn,
    withTooltip(resetBtn, "Reset", { below: true }),
    ...(viewRoot ? [] : [h("span", { class: "control-group ctl-view" }, h("span", { class: "control-label" }, "View"), viewGroup)]),
    withTooltip(diagBtn, "Diagnostics", { below: true })
  );
  viewRoot?.append(viewGroup);

  // The pill names the step the run waits for ("Awaiting your decision", then "Awaiting your
  // approval"); that can change without a new run state, right after an option is approved.
  let shownState = "idle";
  onAwaitedChange(() => { pill.querySelector(".text").textContent = runStateLabel(shownState); });

  function update(s, { scenarioLabel } = {}) {
    const running = isRunning(s);
    const finished = isFinished(s);
    const sim = s.mode === "simulation";

    startBtn.lastChild.textContent = finished ? "New run" : "Start agent";
    setDisabled(startBtn, running, "A run is in progress. Abort it or wait until it finishes.");

    scenarioDd.setValue(s.scenarioId, scenarioLabel);
    scenarioDd.setDisabled(running, "Locked while the agent runs.");

    const model = MODELS.find((m) => m.id === s.model) || MODELS[0];
    modelDd.setValue(model.id, model.label);
    modelDd.setDisabled(running || (sim && !finished), running ? "Locked while the agent runs." : "Requires Live mode.");

    for (const [i, b] of speedBtns.entries()) b.setAttribute("aria-pressed", String(UI.speeds[i] === s.speed));
    for (const b of viewBtns) b.setAttribute("aria-pressed", String(b.dataset.view === s.view));
    // A run keeps the level it started with: the dial is locked while it runs.
    for (const b of dialBtns) {
      const lv = b.dataset.level;
      b.setAttribute("aria-pressed", String(lv === s.autonomy));
      if (b.dataset.locked !== "true") setDisabled(b, running, "Locked while the agent runs: a run keeps the autonomy level it started with.");
      if (!running && b.dataset.locked !== "true") b.title = LEVELS.find((x) => x.id === lv)?.text || "";
    }

    setDisabled(abortBtn, !running, "Nothing to abort: no run in progress.");

    pill.dataset.tone = STATE_TONE[s.runState] || "";
    pill.className = ["vc-tag", TONE_TAG[pill.dataset.tone], "status-pill"].filter(Boolean).join(" ");
    pill.querySelector(".text").textContent = runStateLabel(s.runState);
    shownState = s.runState;
  }

  return { update };
}

// ---- dropdown ----------------------------------------------------------------------------------

function dropdown({ id, caption, items, onSelect, width }) {
  const valueEl = h("span", { class: "value" }, "");
  const toggle = h("button", {
    class: "vc-button vc-button--outline dropdown-toggle", type: "button", id: `dd-${id}`,
    "aria-haspopup": "menu", "aria-expanded": "false", style: width ? { minWidth: `${Math.min(width, 360)}px` } : undefined
  }, h("span", { class: "caption" }, `${caption}:`), valueEl, icon("chevronDown", 16));
  // Vici's menu, opened and closed by this module (no popover attribute: vici.js leaves it alone).
  const menu = h("div", { class: "vc-menu dropdown-menu", role: "menu", "aria-labelledby": `dd-${id}`, hidden: true });
  const itemEls = new Map();

  for (const it of items) {
    if (it.sep) { menu.appendChild(h("hr", { class: "vc-menu__divider", role: "separator" })); continue; }
    const el = h("button", { class: "vc-menu__item", type: "button", role: "menuitemradio", "aria-checked": "false", dataset: { id: it.id } },
      it.badge ? h("span", { class: "num-badge" }, it.badge) : h("span"),
      h("span", { class: "menu-text" }, h("span", { class: "menu-title" }, it.title), it.hint ? h("span", { class: "menu-hint" }, it.hint) : null),
      h("span"));
    el.addEventListener("click", () => {
      if (isDisabled(el)) return;
      close();
      onSelect(it.id);
      toggle.focus();
    });
    itemEls.set(it.id, el);
    menu.appendChild(el);
  }

  const wrap = h("div", { class: "dropdown" }, toggle, menu);

  function open() {
    if (isDisabled(toggle)) return;
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    const current = menu.querySelector('[aria-checked="true"]') || menu.querySelector(".vc-menu__item");
    current?.focus();
    document.addEventListener("mousedown", outside, true);
  }
  function close() {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", outside, true);
  }
  function outside(e) {
    if (!wrap.contains(e.target)) close();
  }

  toggle.addEventListener("click", () => (menu.hidden ? open() : close()));
  toggle.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); open(); }
  });
  menu.addEventListener("keydown", (e) => {
    const els = [...menu.querySelectorAll(".vc-menu__item")];
    const i = els.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); toggle.focus(); }
    else if (e.key === "Tab") close();
  });

  return {
    el: wrap,
    setValue(idVal, label) {
      valueEl.textContent = label || "";
      // The value may end in an ellipsis on a small laptop: the whole name stays in its tooltip.
      valueEl.title = label || "";
      for (const [iid, el] of itemEls) el.setAttribute("aria-checked", String(iid === idVal));
    },
    setDisabled(disabled, reason) {
      setDisabled(toggle, disabled, reason);
      if (disabled) close();
    }
  };
}
