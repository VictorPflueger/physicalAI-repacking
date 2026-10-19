// Header tiles (PLAN.md §g): labour per 1,000 units, store orders on time, the night clock and the
// session cost. Labour shows the work by hand at 22:00 (the brief's hook: 2.5 h · €89.50) and the plan
// with the cell once the night's plan stands, with the figure by hand and the saving beneath (−64 % at
// the defaults); all come from the engine with the run's inputs, or the presenter's between runs. Store orders on time counts orders on their truck plus orders
// projected to make it with more than the risk band (15 minutes) to spare; an order inside the band is
// named beneath as at risk and not counted (amber), one whose truck left without it as late (red).

import { bus } from "./events.js";
import { h } from "./dom.js";
import { perThousand } from "./engine.js";
import { savingShare, savingText } from "./worth.js";
import { eur2, hours, int, eurCents } from "./format.js";
import { STORAGE } from "./config.js";
import { visibleOrders, laneState } from "./cell_data.js";
import { awaitedStep, onAwaitedChange } from "./handover.js";

export function createKpis(container, { getInputs, getNightState = () => null, getSpeed = () => 1, nightDate = () => null } = {}) {
  const make = (id, label, sub) => {
    const value = h("div", { class: "kpi-value", id: `kpi-${id}-value` }, "—");
    const subEl = h("div", { class: "kpi-sub", id: `kpi-${id}-sub` }, sub);
    const el = h("div", { class: "kpi", id: `kpi-${id}`, dataset: { tone: "muted" }, role: "group", "aria-label": label },
      h("div", { class: "kpi-label" }, label), value, subEl);
    container.appendChild(el);
    return { el, value, sub: subEl };
  };
  const labour = make("labour", "Labour per 1,000 units", "manual baseline");
  const ontime = make("ontime", "Store orders on time", "once the night runs");
  const clockTile = make("clock", "Night clock", "22:00 to 06:00");
  const cost = make("cost", "Session cost", "no model calls");

  let planStands = false;
  let running = false;
  let ended = false;
  let paused = false;
  let clockLabel = "22:00";
  let runState = "idle";
  // The session cost: live runs in this tab so far, plus the run in progress.
  let sessionBase = readSessionCost();
  let runCost = 0;
  let lastRunCost = null;
  let mode = null;

  // A changed figure flips in; the clock only ticks (it changes every simulated minute).
  const set = (tile, text, tone, sub, { flip = true } = {}) => {
    if (tile.value.textContent !== text) {
      tile.value.textContent = text;
      if (flip) {
        tile.value.classList.remove("flip");
        void tile.value.offsetWidth;
        tile.value.classList.add("flip");
      }
    }
    if (tone !== undefined) tile.el.dataset.tone = tone;
    if (sub !== undefined && tile.sub.textContent !== sub) { tile.sub.textContent = sub; tile.sub.title = sub; }
  };

  // At 22:00 the tile shows the work by hand (the brief's hook); once tonight's plan stands, the plan
  // with the cell, with the same work by hand and the saving beneath (TECH_NOTES D50).
  function renderLabour() {
    const v = getInputs();
    const k = perThousand(v);
    if (planStands) set(labour, `${hours(k.hybrid_h)} · ${eur2(k.hybrid_eur)}`, "", `planned · ${eur2(k.manual_eur)} by hand · ${savingText(savingShare(v))}`);
    else set(labour, `${hours(k.manual_h)} · ${eur2(k.manual_eur)}`, "", "by hand, without the cell");
  }

  function renderOnTime() {
    const st = getNightState();
    if (!st || (!running && !ended)) { set(ontime, "—", "muted", "once the night runs"); return; }
    const list = visibleOrders(st);
    const states = list.map(laneState);
    const late = states.filter((s) => s === "late").length;
    const risk = states.filter((s) => s === "at-risk").length;
    const ok = list.length - late - risk;
    const value = `${int(ok)} of ${int(list.length)}`;
    if (ended) set(ontime, value, late ? "late" : "on-time", late ? `tonight · ${int(late)} late` : "tonight · every truck on time");
    else if (late) set(ontime, value, "late", `${int(late)} late${risk ? ` · ${int(risk)} at risk` : ""}`);
    else if (risk) set(ontime, value, "at-risk", `projected · ${int(risk)} at risk`);
    else set(ontime, value, "on-time", "projected · on their trucks");
  }

  /** Why the night stands still: the person's step while one waits, else the agent's turn. */
  function pauseReason() {
    if (runState === "options") return "paused: your decision";
    if (runState === "awaiting_approval") return `paused: your ${awaitedStep()}`;
    return mode === "preview" ? "paused at a wake-up" : "paused: the agent's turn";
  }

  function renderClock() {
    const date = nightDate();
    const sub = ended ? "night over" : paused ? pauseReason() : running ? `×${getSpeed()}${date ? ` · ${date}` : ""}` : (date || "22:00 to 06:00");
    set(clockTile, clockLabel, running || ended ? "" : "muted", sub, { flip: false });
  }

  function renderCost() {
    if (mode === "simulation" || mode === "preview") { set(cost, eurCents(sessionBase), sessionBase > 0 ? "" : "muted", "simulated: no model calls"); return; }
    const total = sessionBase + runCost;
    let sub;
    if (mode === "live" && running) sub = `this run ${eurCents(runCost)}`;
    else if (lastRunCost !== null) sub = `last run ${eurCents(lastRunCost)}`;
    else sub = total > 0 ? "earlier live runs in this tab" : "no model calls";
    set(cost, eurCents(total), total > 0 ? "" : "muted", sub);
  }

  bus.on("run_start", (ev) => { running = true; ended = false; paused = false; planStands = false; clockLabel = "22:00"; mode = ev.payload.mode; runCost = 0; runState = "idle"; renderAll(); renderCost(); });
  bus.on("state_change", (ev) => { runState = ev.payload.state; if (paused) renderClock(); });
  onAwaitedChange(() => { if (paused) renderClock(); });
  bus.on("night_plan", () => { planStands = true; renderAll(); });
  bus.on("clock", (ev) => {
    clockLabel = ev.payload.label;
    paused = !!ev.payload.paused;
    renderClock();
  });
  let pending = 0;
  const later = () => { if (!pending) pending = setTimeout(() => { pending = 0; renderOnTime(); }, 120); };
  for (const t of ["projection", "dispatch", "late_complete", "order_new", "cutoff_risk", "plan_update"]) bus.on(t, later);
  bus.on("night_end", () => { ended = true; paused = false; renderAll(); });
  bus.on("run_end", () => {
    running = false; paused = false;
    if (mode === "live") {
      sessionBase += runCost;
      lastRunCost = runCost;
      runCost = 0;
      writeSessionCost(sessionBase);
    }
    renderAll();
    renderCost();
  });
  bus.on("cost_update", (ev) => {
    if (ev.payload.simulated) return;
    runCost = Number(ev.payload.eur) || 0;
    renderCost();
  });

  function renderAll() { renderLabour(); renderOnTime(); renderClock(); }

  function reset() {
    running = false; ended = false; paused = false; planStands = false; clockLabel = "22:00"; runState = "idle";
    mode = null; runCost = 0;
    renderAll();
    renderCost();
  }

  reset();
  return { reset, refresh: renderAll };
}

function readSessionCost() {
  try { return Number(sessionStorage.getItem(STORAGE.sessionCost)) || 0; } catch { return 0; }
}

function writeSessionCost(v) {
  try { sessionStorage.setItem(STORAGE.sessionCost, String(v)); } catch { /* storage unavailable */ }
}
