// Header tiles (PLAN.md §g): labour per 1,000 units, store orders on time, the night clock and the
// session cost. Labour shows the manual baseline at 22:00 (the brief's hook: 2.5 h · €89.50) and the
// hybrid plan once the night's plan stands, with the manual figure beneath; both come from the engine
// with the presenter's assumptions. Store orders on time counts orders on their truck plus orders
// projected to make it, amber with a store at risk, red once one is late.

import { bus } from "./events.js";
import { h } from "./dom.js";
import { perThousand } from "./engine.js";
import { eur2, hours, int } from "./format.js";
import { STORAGE } from "./config.js";
import { visibleOrders, laneState } from "./cell_data.js";

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

  function renderLabour() {
    const k = perThousand(getInputs());
    const manual = `${hours(k.manual_h)} · ${eur2(k.manual_eur)}`;
    if (planStands) set(labour, `${hours(k.hybrid_h)} · ${eur2(k.hybrid_eur)}`, "", `hybrid · by hand ${manual}`);
    else set(labour, manual, "", "manual baseline (engine)");
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
    if (ended) set(ontime, value, late ? "late" : "on-time", late ? `tonight · ${int(late)} late` : "tonight · every truck in time");
    else if (late) set(ontime, value, "late", `${int(late)} late${risk ? ` · ${int(risk)} at risk` : ""}`);
    else if (risk) set(ontime, value, "at-risk", `projected · ${int(risk)} at risk`);
    else set(ontime, value, "on-time", "projected · on its trucks");
  }

  function renderClock() {
    const date = nightDate();
    const sub = ended ? "night over" : paused ? "paused: the agent's turn" : running ? `×${getSpeed()}${date ? ` · ${date}` : ""}` : (date || "22:00 to 06:00");
    set(clockTile, clockLabel, running || ended ? "" : "muted", sub, { flip: false });
  }

  bus.on("run_start", () => { running = true; ended = false; paused = false; planStands = false; clockLabel = "22:00"; renderAll(); });
  bus.on("night_plan", () => { planStands = true; renderAll(); });
  bus.on("clock", (ev) => {
    clockLabel = ev.payload.label;
    paused = !!ev.payload.paused;
    renderClock();
  });
  let pending = 0;
  const later = () => { if (!pending) pending = setTimeout(() => { pending = 0; renderOnTime(); }, 120); };
  for (const t of ["projection", "dispatch", "late_complete", "order_new", "cutoff_risk"]) bus.on(t, later);
  bus.on("night_end", () => { ended = true; running = false; paused = false; renderAll(); });
  bus.on("run_end", () => { running = false; paused = false; renderAll(); });
  bus.on("cost_update", (ev) => { if (!ev.payload.simulated) set(cost, eur2(ev.payload.eur), "", "this run"); });

  function renderAll() { renderLabour(); renderOnTime(); renderClock(); }

  function reset() {
    running = false; ended = false; paused = false; planStands = false; clockLabel = "22:00";
    set(cost, readSessionCost() > 0 ? eur2(readSessionCost()) : "€0.00", "muted", "no model calls");
    renderAll();
  }

  reset();
  return { reset, refresh: renderAll };
}

function readSessionCost() {
  try { return Number(sessionStorage.getItem(STORAGE.sessionCost)) || 0; } catch { return 0; }
}
