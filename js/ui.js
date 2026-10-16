// UI orchestrator: builds the components, wires controls and dialogs and translates run events into
// drawer and state changes. The UI never branches on which producer is running; only the mode badge
// reads the mode.
//
// This build has no producer yet: Start agent leads through the mode choice (and the key, for Live)
// and then says plainly that runs arrive with M3. The night simulation, the engine and the agent
// plug into the same bus in M2 and M3.

import { bus } from "./events.js";
import { getState, setState, subscribe, isRunning, isFinished } from "./state.js";
import { createCellBoard } from "./cell.js";
import { createConsole } from "./console.js";
import { createDrawer } from "./drawer.js";
import { createAuditPanel } from "./audit_panel.js";
import { resetAudit } from "./audit.js";
import { createControls } from "./controls.js";
import { chooseMode, askApiKey } from "./dialogs.js";
import { openDiagnostics } from "./diagnostics_view.js";
import { openIntro, introSeen } from "./intro.js";
import { hasKey } from "./keystore.js";
import { APP, STORAGE } from "./config.js";
import { h } from "./dom.js";
import { icon } from "./icons.js";

// What each drawer tab will hold, shown until it does.
const DRAWER_EMPTY = {
  options: ["Options", "When the night needs a decision, the agent proposes three costed options next to doing nothing, each priced by the engine in extra labour and late store orders. You decide; nothing happens before."],
  outbox: ["Outbox", "Drafts wait here for your approval: a call-in message, a note to a store, a memo. Approving only marks a draft as cleared. Nothing is ever sent."],
  kpiboard: ["KPI board", "The engine's plan (manual against hybrid: labour hours and € per 1,000 units, picks per cell hour) beside tonight's simulated result (orders on time, exceptions), each figure with its source. It arrives with the engine (M2)."],
  assumptions: ["Assumptions", "Every input of the engine with its source key or the label Assumption, editable, with every change logged in the audit. It arrives with the engine (M2)."]
};

export function initUI() {
  const scenarios = window.SCENARIOS || [];
  const byId = (id) => scenarios.find((s) => s.id === id);
  if (!byId(getState().scenarioId)) setState({ scenarioId: scenarios[0]?.id });
  setState({ keyPresent: hasKey() });

  // ---- components ------------------------------------------------------------------------------
  const badge = document.getElementById("mode-badge");
  const cell = createCellBoard(document.getElementById("cell"), { scenarios });
  const consoleUI = createConsole(document.getElementById("console"));
  const drawer = createDrawer(document.getElementById("drawer"), {
    onToggle: (open) => { setState({ drawerOpen: open }); setTimeout(() => cell.invalidate(), 260); }
  });
  for (const [id, [title, text]] of Object.entries(DRAWER_EMPTY)) {
    drawer.panel(id).append(h("div", { class: "empty" }, h("strong", {}, title), h("span", {}, text)));
  }
  const auditPanel = createAuditPanel(drawer.panel("audit"), { onCount: (n) => drawer.setCount("audit", n) });

  const controls = createControls(document.getElementById("controls"), scenarios, {
    onStart: () => start(),
    onSelectScenario: (id) => {
      setState({ scenarioId: id });
      if (!isRunning(getState())) cell.focusScenario(id);
    },
    onSelectModel: (id) => setState({ model: id }),
    onSpeed: (n) => setState({ speed: n }),
    onAbort: () => abort("Stopped by the user."),
    onReset: () => resetWorkspace(),
    onDiagnostics: () => openDiagnostics()
  });

  // ---- intro window: "How it works" in the header, and once by itself on a first visit -----------
  const aboutBtn = h("button", {
    class: "about-btn", type: "button", id: "btn-about",
    "aria-label": "How it works", title: `What ${APP.name} does, how it works and what is real`
  }, icon("info", 18), h("span", { class: "btn-text" }, "How it works"));
  aboutBtn.addEventListener("click", () => showIntro());
  document.querySelector(".header-badges")?.appendChild(aboutBtn);

  function showIntro() {
    const s = getState();
    // During a run the window only explains; it never starts or interrupts anything.
    if (isRunning(s)) return openIntro({});
    return openIntro({ startLabel: isFinished(s) ? "New run" : "Start agent", onStart: () => start() });
  }

  // ---- state → view ----------------------------------------------------------------------------
  const render = (s) => {
    controls.update(s, { scenarioLabel: byId(s.scenarioId)?.short || "Choose" });
    badge.dataset.mode = s.mode || "none";
    badge.replaceChildren(...(s.mode === "live"
      ? [h("span", { class: "mode-dot", "aria-hidden": "true" }), "LIVE"]
      : s.mode === "simulation" ? ["SIMULATION"] : ["No run active"]));
    badge.title = s.mode === "live" ? "Live agent: real model calls on your API key"
      : s.mode === "simulation" ? "Simulation: scripted replay, not live" : "Choose a mode with Start agent";
  };
  subscribe(render);
  render(getState());
  cell.focusScenario(getState().scenarioId);

  // ---- run events → UI effects --------------------------------------------------------------------
  bus.on("state_change", (ev) => setState({ runState: ev.payload.state }));
  bus.on("run_end", (ev) => {
    const st = ev.payload.status;
    setState({ runState: st === "done" ? "done" : st === "incomplete" ? "stopped" : st });
  });

  // ---- run control ---------------------------------------------------------------------------------
  async function start() {
    const s = getState();
    if (isRunning(s)) return;
    const scenario = byId(s.scenarioId);
    let mode = await chooseMode({ runLabel: `Scenario ${scenario.number}: ${scenario.title}` });
    if (!mode) return;
    if (mode === "key") {
      // "Change or forget key": the key dialog shows the stored key masked, with Forget key.
      const ok = await askApiKey({});
      setState({ keyPresent: hasKey() });
      if (!ok) return;
      mode = "live";
    }
    if (mode === "live" && !hasKey()) {
      const ok = await askApiKey({});
      setState({ keyPresent: hasKey() });
      if (!ok) return;
    }
    preview(mode, scenario);
  }

  // No producer in this build: say what was chosen and what happens next. Nothing runs, no model is
  // called and nothing is sent.
  function preview(mode, scenario) {
    const chosen = mode === "live"
      ? `Live agent chosen for scenario ${scenario.number}. Your key is kept for this tab only (${STORAGE.apiKey}); no model was called.`
      : `Simulation chosen for scenario ${scenario.number}. No run was started.`;
    bus.emit("notice", { level: "info", text: `${chosen} ${APP.stage}` });
    showBanner({ level: "info", title: "Shell preview", text: APP.stage, timeout: 9000 });
  }

  /** Ends the run on the bus (the producers that M2 and M3 add stop themselves on run_end). */
  function abort(reason) {
    if (!bus.currentRun()) return;
    bus.emit("run_end", { status: "aborted", reason });
    bus.endRun();
  }

  function resetWorkspace({ keepMode = false } = {}) {
    bus.endRun();
    consoleUI.reset();
    cell.reset();
    cell.focusScenario(getState().scenarioId);
    resetAudit();
    auditPanel.refresh();
    drawer.setOpen(false);
    setState({ runState: "idle", runId: null, ...(keepMode ? {} : { mode: null }) });
  }

  /** Opens the intro once per browser: called by main.js after the boot screen is gone. */
  function introOnFirstVisit() {
    if (!introSeen() && !document.querySelector(".modal-backdrop")) showIntro();
  }

  return { cell, start, resetWorkspace, showIntro, introOnFirstVisit };
}

/** Transient banner under the header (also used for file:// warnings). */
export function showBanner({ level = "info", title = "", text = "", timeout = 0 } = {}) {
  const stack = document.getElementById("banners");
  if (!stack) return null;
  const close = h("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "Dismiss" }, icon("x", 18));
  const el = h("div", { class: "banner", dataset: { level }, role: level === "error" ? "alert" : "status" },
    icon(level === "info" ? "info" : "alert", 22),
    h("div", { class: "banner-text" }, title ? h("strong", {}, title) : null, text),
    close);
  close.addEventListener("click", () => el.remove());
  stack.appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}
