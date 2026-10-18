// UI orchestrator: builds the components, wires controls and dialogs, starts a run's producer and its
// night, and translates run events into drawer and state changes. The UI never branches on which
// producer is running; only the mode badge reads the mode.
//
// A run is one night (PLAN.md §a.2): a night session (js/night_session.js) shared by the night player
// (js/night.js), which plays the night onto the bus at the chosen speed, and one producer, the live
// agent (js/agent.js) or the scripted replay (js/simulation.js), which drive the same tools. The wake
// bridge (js/wake_bridge.js) hands each wake-up from the night to the producer and the night stands
// still until the producer's turn is over. A scenario without a scripted replay yet (M4) plays its
// night in Simulation without the agent, as a night preview.

import { bus, newRunId } from "./events.js";
import { getState, setState, subscribe, isRunning, isFinished } from "./state.js";
import { createCellBoard } from "./cell.js";
import { createConsole } from "./console.js";
import { createDrawer } from "./drawer.js";
import { createAuditPanel } from "./audit_panel.js";
import { resetAudit } from "./audit.js";
import { createControls } from "./controls.js";
import { chooseMode, askApiKey, showReport } from "./dialogs.js";
import { openDiagnostics } from "./diagnostics_view.js";
import { openIntro, introSeen } from "./intro.js";
import { hasKey, forgetKey } from "./keystore.js";
import { APP, MODELS } from "./config.js";
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { createNightPlayer } from "./night.js";
import { createNightSession } from "./night_session.js";
import { createWakeBridge } from "./wake_bridge.js";
import { createSimulationPlayer } from "./simulation.js";
import { createLiveAgent } from "./agent.js";
import { createOptionsPanel } from "./options_panel.js";
import { createOutbox } from "./outbox.js";
import { createKpis } from "./kpi.js";
import { createKpiBoard } from "./kpi_board.js";
import { createAssumptions } from "./assumptions.js";
import { inputs as engineInputs, nightParams as nightParamsOf, PARAMETERS } from "./engine.js";
import { replayInputs, changedNightInputs } from "./script.js";
import { getWorldData } from "./world.js";

/** How long the night stands still at a wake-up at ×1 in a night preview (shorter at ×2 and ×4). */
export const WAKE_PAUSE_MS = 1200;

export function initUI() {
  const scenarios = window.SCENARIOS || [];
  const byId = (id) => scenarios.find((s) => s.id === id);
  if (!byId(getState().scenarioId)) setState({ scenarioId: scenarios[0]?.id });
  setState({ keyPresent: hasKey() });
  const dropped = sanitiseAssumptions();

  // ---- the engine's inputs: the brief's defaults with the presenter's changes ---------------------
  const getInputs = () => engineInputs(getState().assumptions);
  // The night simulation reads the inputs that shape the night (r_m, r_c, p, the call-in minimum).
  const nightParams = () => nightParamsOf(getInputs());

  // The run in progress: its wake bridge (null in a night preview) and the inputs it runs on.
  let bridge = null;
  let runInputs = null;

  // ---- components ------------------------------------------------------------------------------
  const badge = document.getElementById("mode-badge");
  const cell = createCellBoard(document.getElementById("cell"), { scenarios, getParams: nightParams, nightDate });
  const orderName = (id) => cell.state()?.orders.get(id)?.name || id;
  const consoleUI = createConsole(document.getElementById("console"), {
    getInputs: () => runInputs || getInputs(),
    onOpenOptions: () => drawer.show("options"),
    onOpenOutbox: () => drawer.show("outbox"),
    onOpenReport: (md) => showReport(md, { mode: getState().mode }),
    onConfirm: (d) => {
      if (!isRunning(getState())) return notice("warn", "This run has ended. Start a new run to confirm.");
      bus.emit("confirmation_decision", { ...d, by: "user" });
    }
  });
  const drawer = createDrawer(document.getElementById("drawer"), {
    onToggle: (open) => { setState({ drawerOpen: open }); setTimeout(() => cell.invalidate(), 260); }
  });
  const optionsPanel = createOptionsPanel(drawer.panel("options"), {
    orderName,
    onDecision: (d) => {
      if (!isRunning(getState())) return notice("warn", "This run has ended. Start a new run to take a decision.");
      bus.emit("option_decision", { ...d, by: "user" });
    },
    onCount: (n, attention) => drawer.setCount("options", n, attention)
  });
  const outbox = createOutbox(drawer.panel("outbox"), {
    onDecision: (d) => {
      if (!isRunning(getState())) return notice("warn", "This run has ended. Start a new run to approve drafts.");
      bus.emit("action_decision", { ...d, by: "user" });
    },
    onCount: (n, attention) => drawer.setCount("outbox", n, attention)
  });
  const auditPanel = createAuditPanel(drawer.panel("audit"), { onCount: (n) => drawer.setCount("audit", n) });
  const kpis = createKpis(document.getElementById("kpis"), { getInputs: () => runInputs || getInputs(), getNightState: () => cell.state(), getSpeed: () => getState().speed });
  const kpiBoard = createKpiBoard(drawer.panel("kpiboard"), { getInputs: () => runInputs || getInputs(), getNightState: () => cell.state() });
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
    // An agent run hands every wake-up to its producer; a night preview only pauses for a moment.
    onWake: (w) => (bridge ? bridge.wake(w) : w.kind === "night_end" ? null : new Promise((r) => setTimeout(r, WAKE_PAUSE_MS / (getState().speed || 1))))
  });
  const sim = createSimulationPlayer({ getSpeed: () => getState().speed, getAutonomy: () => getState().autonomy });
  const agent = createLiveAgent({
    onKeyRejected: () => {
      forgetKey();
      setState({ keyPresent: false });
    }
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
    // The run is over once every subscriber has seen its end.
    const id = ev.run_id;
    queueMicrotask(() => { if (bus.currentRun()?.run_id === id) bus.endRun(); });
  });
  bus.on("options", () => drawer.show("options"));
  bus.on("action_draft", () => drawer.show("outbox"));

  // ---- run control ---------------------------------------------------------------------------------
  async function start() {
    const s = getState();
    if (isRunning(s)) return;
    const scenario = byId(s.scenarioId);
    const script = window.SIM_RUNS?.[scenario.id];
    const kept = changedNightInputs(getInputs());
    const simNote = !script
      ? "This scenario has no scripted replay yet (M4): Simulation plays its night without the agent, as a night preview. Live runs the agent."
      : kept.length
        ? `The scripted replay is written for the brief's night: ${kept.join(", ")} stay at their defaults in Simulation; your other inputs apply. Live uses all your inputs.`
        : null;
    let mode = await chooseMode({ runLabel: `Scenario ${scenario.number}: ${scenario.title}`, simNote });
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
    begin(mode, scenario);
  }

  function begin(chosen, scenario) {
    clearWorkspace();
    const s = getState();
    const script = chosen === "simulation" ? window.SIM_RUNS?.[scenario.id] || null : null;
    const mode = chosen === "simulation" && !script ? "preview" : chosen;
    const v = getInputs();
    const inputs = mode === "simulation" ? replayInputs(v) : v;
    const kept = mode === "simulation" ? changedNightInputs(v) : [];
    const model = MODELS.find((m) => m.id === s.model) || MODELS[0];
    const run_id = newRunId();
    let session;
    try {
      session = createNightSession({ world: getWorldData(), scenario, params: nightParamsOf(inputs), seed: scenario.night.seed });
    } catch (e) {
      notice("error", `Tonight's night could not be built: ${e.message}`);
      return;
    }
    runInputs = inputs;
    bus.beginRun({ run_id, mode });
    setState({ mode, runId: run_id, runState: mode === "preview" ? "previewing" : "perceiving", simSource: mode === "simulation" ? "authored" : null });
    bus.emit("run_start", {
      run_id, mode, chosen_mode: chosen, scenario_id: scenario.id,
      title: `Scenario ${scenario.number}: ${scenario.title}`, seed: scenario.night.seed,
      inputs, changed_inputs: Object.keys(getState().assumptions),
      ...(kept.length ? { night_inputs_kept: kept } : {}),
      ...(mode === "live" ? { model: model.id, model_label: model.label } : {}),
      ...(mode === "simulation" ? { sim_source: "authored" } : {})
    });
    if (kept.length) {
      const names = kept.length === 1 ? kept[0] : `${kept.slice(0, -1).join(", ")} and ${kept.at(-1)}`;
      bus.emit("notice", { level: "info", text: `The scripted replay runs on the brief's night: ${names} ${kept.length === 1 ? "stays at its default" : "stay at their defaults"}; your other inputs apply.` });
    }

    if (mode === "preview") {
      bus.emit("state_change", { state: "previewing" });
      bus.emit("notice", { level: "info", text: `No scripted replay for scenario ${scenario.number} yet (M4): the engine and the simulated cell play tonight without the agent. Live runs the agent on this scenario.` });
      bridge = null;
      player.play({ session }).then((res) => {
        if (res.status !== "done" || bus.currentRun()?.run_id !== run_id) return;
        bus.emit("run_end", { status: "done" });
      });
      return;
    }

    const runBridge = createWakeBridge();
    bridge = runBridge;
    // Before the producer reports the end of its run: a finished night may finish; a run that stops
    // early stops the night where it is, with the units played so far in the audit.
    const onBeforeEnd = (status) => {
      if (bridge !== runBridge) return;
      if (status !== "done") player.stop({ log: true });
      runBridge.release();
    };
    player.play({ session });
    if (mode === "live") {
      agent.run({ session, bridge: runBridge, scenario, world: getWorldData(), modelId: model.id, getInputs: () => inputs, getAutonomy: () => getState().autonomy, nightDate: nightDate(scenario), onBeforeEnd });
    } else {
      sim.play(script, { session, bridge: runBridge, scenario, refs: window.REFERENCE_CASES?.[scenario.id] || {}, getInputs: () => inputs, onBeforeEnd });
    }
  }

  /** Stops the run where it is (Abort). */
  function abort(reason) {
    if (sim.isActive()) return sim.abort(reason);
    if (agent.isActive()) return agent.abort(reason);
    // A night preview: stop the night and end the run here.
    if (!bus.currentRun()) return;
    player.stop({ log: true });
    bus.emit("run_end", { status: "aborted", reason });
  }

  /** Empties the console, the drawer, the audit and the tiles for a new run. */
  function clearWorkspace() {
    if (sim.isActive()) sim.abort("Reset by the user.");
    if (agent.isActive()) agent.abort("Reset by the user.");
    bridge?.release();
    bridge = null;
    runInputs = null;
    player.stop();
    bus.endRun();
    consoleUI.reset();
    optionsPanel.reset();
    outbox.reset();
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
    setState({ runState: "idle", runId: null, simSource: null, ...(keepMode ? {} : { mode: null }) });
  }

  function notice(level, text) {
    showBanner({ level, title: level === "warn" ? "Heads-up" : level === "error" ? "Error" : "Note", text, timeout: 6000 });
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
