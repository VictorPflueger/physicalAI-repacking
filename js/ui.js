// UI orchestrator: builds the components, wires controls and dialogs and translates run events into
// drawer and state changes. The UI never branches on which producer is running; only the mode badge
// reads the mode.
//
// This build (M2) has the physical layer but no agent yet: Start agent leads through the mode choice
// (and the key, for Live) and then plays tonight's night without the agent, a "night preview": the
// night simulation computes the night and js/night.js plays it onto the bus at the chosen speed, so the
// cell board, the header tiles, the console and the KPI board follow it exactly as they will with the
// agent. At each wake-up the night pauses briefly where the agent will take its turn (M3).

import { bus, newRunId } from "./events.js";
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
import { createNightPlayer } from "./night.js";
import { createKpis } from "./kpi.js";
import { createKpiBoard } from "./kpi_board.js";
import { createAssumptions } from "./assumptions.js";
import { inputs as engineInputs, PARAMETERS } from "./engine.js";
import { getWorldData } from "./world.js";

// What each drawer tab will hold, shown until it does.
const DRAWER_EMPTY = {
  options: ["Options", "When the night needs a decision, the agent proposes three costed options next to doing nothing, each priced by the engine in extra labour and late store orders. You decide; nothing happens before. The options arrive with the agent (M3)."],
  outbox: ["Outbox", "Drafts wait here for your approval: a call-in message, a note to a store, a memo. Approving only marks a draft as cleared. Nothing is ever sent. The drafts arrive with the agent (M3)."]
};

/** How long the night stands still at a wake-up at ×1 (shorter at ×2 and ×4): where the agent will take its turn. */
export const WAKE_PAUSE_MS = 1200;

export function initUI() {
  const scenarios = window.SCENARIOS || [];
  const byId = (id) => scenarios.find((s) => s.id === id);
  if (!byId(getState().scenarioId)) setState({ scenarioId: scenarios[0]?.id });
  setState({ keyPresent: hasKey() });
  const dropped = sanitiseAssumptions();

  // ---- the engine's inputs: the brief's defaults with the presenter's changes ---------------------
  const getInputs = () => engineInputs(getState().assumptions);
  // The night simulation reads the rates of the engine's inputs (r_m, r_c, p) when a night starts.
  const nightParams = () => { const v = getInputs(); return { r_m: v.r_m, r_c: v.r_c, p: v.p }; };

  // ---- components ------------------------------------------------------------------------------
  const badge = document.getElementById("mode-badge");
  const cell = createCellBoard(document.getElementById("cell"), { scenarios, getParams: nightParams, nightDate });
  const consoleUI = createConsole(document.getElementById("console"), { getInputs });
  const drawer = createDrawer(document.getElementById("drawer"), {
    onToggle: (open) => { setState({ drawerOpen: open }); setTimeout(() => cell.invalidate(), 260); }
  });
  for (const [id, [title, text]] of Object.entries(DRAWER_EMPTY)) {
    drawer.panel(id).append(h("div", { class: "empty" }, h("strong", {}, title), h("span", {}, text)));
  }
  const auditPanel = createAuditPanel(drawer.panel("audit"), { onCount: (n) => drawer.setCount("audit", n) });
  const kpis = createKpis(document.getElementById("kpis"), { getInputs, getNightState: () => cell.state(), getSpeed: () => getState().speed });
  const kpiBoard = createKpiBoard(drawer.panel("kpiboard"), { getInputs, getNightState: () => cell.state() });
  const assumptions = createAssumptions(drawer.panel("assumptions"), {
    getOverrides: () => getState().assumptions,
    setOverrides: (next) => {
      setState({ assumptions: { ...next } });
      kpis.refresh();
      kpiBoard.render();
      if (!isRunning(getState())) cell.focusScenario(getState().scenarioId);
    },
    getNightInfo: () => cell.state()?.info || null,
    getScenario: () => byId(cell.state()?.info?.scenario_id) || byId(getState().scenarioId) || null,
    isRunning: () => isRunning(getState())
  });

  const player = createNightPlayer({
    getSpeed: () => getState().speed,
    // No agent in this build: the night stands still for a moment where the agent will take its turn.
    onWake: (w) => (w.kind === "night_end" ? null : new Promise((r) => setTimeout(r, WAKE_PAUSE_MS / (getState().speed || 1))))
  });

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
  const BADGE = {
    live: { content: () => [h("span", { class: "mode-dot", "aria-hidden": "true" }), "LIVE"], title: "Live agent: real model calls on your API key" },
    simulation: { content: () => ["SIMULATION"], title: "Simulation: scripted replay, not live" },
    preview: { content: () => ["NIGHT PREVIEW"], title: "Night preview: the engine and the simulated cell play tonight without the agent. No model calls." }
  };
  const render = (s) => {
    controls.update(s, { scenarioLabel: byId(s.scenarioId)?.short || "Choose" });
    const b = BADGE[s.mode];
    badge.dataset.mode = b ? s.mode : "none";
    badge.replaceChildren(...(b ? b.content() : ["No run active"]));
    badge.title = b ? b.title : "Choose a mode with Start agent";
  };
  subscribe(render);
  render(getState());
  cell.focusScenario(getState().scenarioId);
  if (dropped.length) bus.emit("notice", { level: "warn", text: `Stored assumptions outside their range were reset to the defaults: ${dropped.join(", ")}.` });

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
    if (isRunning(getState())) return;
    await playNight(mode, scenario);
  }

  /**
   * Plays tonight's night without the agent (the night preview). `chosen` is the mode the presenter
   * picked; this build records it and says that the agent arrives with M3. Nothing calls a model.
   */
  async function playNight(chosen, scenario) {
    clearWorkspace();
    const run_id = newRunId();
    const v = getInputs();
    bus.beginRun({ run_id, mode: "preview" });
    setState({ mode: "preview", runId: run_id, runState: "previewing" });
    bus.emit("run_start", {
      run_id, mode: "preview", chosen_mode: chosen, scenario_id: scenario.id,
      title: `Scenario ${scenario.number}: ${scenario.title}`, seed: scenario.night.seed,
      inputs: v, changed_inputs: Object.keys(getState().assumptions)
    });
    bus.emit("state_change", { state: "previewing" });
    const chosenText = chosen === "live"
      ? `Live agent chosen for scenario ${scenario.number}. Your key is kept for this tab only (${STORAGE.apiKey}); no model is called in this build.`
      : `Simulation chosen for scenario ${scenario.number}.`;
    bus.emit("notice", { level: "info", text: `${chosenText} ${APP.stage}` });
    showBanner({ level: "info", title: "Night preview", text: APP.stage, timeout: 9000 });
    const res = await player.play({ world: getWorldData(), scenario, params: nightParams(), seed: scenario.night.seed });
    // Abort and Reset end the run themselves; a finished night ends it here.
    if (res.status !== "done" || bus.currentRun()?.run_id !== run_id) return;
    bus.emit("run_end", { status: "done" });
    bus.endRun();
  }

  /** Stops the night where it is and ends the run on the bus. */
  function abort(reason) {
    if (!bus.currentRun()) return;
    player.stop({ log: true });
    bus.emit("run_end", { status: "aborted", reason });
    bus.endRun();
  }

  /** Empties the console, the audit, the tiles and the KPI board for a new run. */
  function clearWorkspace() {
    player.stop();
    bus.endRun();
    consoleUI.reset();
    resetAudit();
    auditPanel.refresh();
    kpis.reset();
    kpiBoard.reset();
  }

  function resetWorkspace({ keepMode = false } = {}) {
    clearWorkspace();
    cell.reset();
    cell.focusScenario(getState().scenarioId);
    assumptions.render();
    drawer.setOpen(false);
    setState({ runState: "idle", runId: null, ...(keepMode ? {} : { mode: null }) });
  }

  /** Opens the intro once per browser: called by main.js after the boot screen is gone. */
  function introOnFirstVisit() {
    if (!introSeen() && !document.querySelector(".modal-backdrop")) showIntro();
  }

  return { cell, start, resetWorkspace, showIntro, introOnFirstVisit, player };
}

/** "Night of Wed 23 to Thu 24 Dec 2026" for a scenario set on a particular night (scenario 5), else null. */
function nightDate(scenario) {
  const iso = scenario?.night_start_date;
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const e = new Date(d);
  e.setDate(d.getDate() + 1);
  const f = (x, opts) => x.toLocaleDateString("en-GB", opts).replace(/,/g, "").replace(/\bSept\b/, "Sep");
  return `Night of ${f(d, { weekday: "short", day: "numeric" })} to ${f(e, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`;
}

/**
 * Drops stored assumptions that are unknown or outside their range (session storage can hold an old
 * or edited value). Returns the ids it dropped.
 */
function sanitiseAssumptions() {
  const stored = getState().assumptions || {};
  const keep = {};
  const dropped = [];
  for (const [id, value] of Object.entries(stored)) {
    const p = PARAMETERS.find((x) => x.id === id);
    const n = Number(value);
    if (p && Number.isFinite(n) && n >= p.min && n <= p.max && n !== p.value) keep[id] = n;
    else if (!p || n !== p.value) dropped.push(id);
  }
  if (dropped.length || Object.keys(keep).length !== Object.keys(stored).length) setState({ assumptions: keep });
  return dropped;
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
