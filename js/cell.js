// The cell board, Repack Pilot's centrepiece (where the Navigator has its map and Rebate Hunter its
// rebate board). It draws the night as the events arrive: the cell line (the inbound pallet, the
// camera with its last detection and confidence, the robot cell with its rehearsal and every grasp
// attempt, the scale with its last reading, the manual station with its picks, queue and the units
// handed to a person), a lane per store order with its tote filling against the truck cut-off, and
// the world-model card (expected against observed, and the corrections log). Every entity is a button
// with its full name and a popover. The neutral "Simulated cell" tag stays in both modes.
//
// The board fits its panel: "full" with room to spare (and a legend where it fits), "compact" (one
// line per station), "short" (the lanes, the world model as a chip in the head row) and, below 260 px
// with the drawer open, "strip": rows of store chips. The free height picks the size, and the board
// steps down while its content still does not fit (TECH_NOTES D19). Hide the drawer for more board.
//
// Both producers (the live agent and the scripted replay) and the night player emit the same events,
// so the board never asks what runs it. Every figure comes from js/cell_data.js.

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { getWorldData } from "./world.js";
import { buildNight, nightInfo, clockOf, clockUp, WEIGHT_TOLERANCE } from "./nightsim.js";
import { createNightState, applyEvent, manualQueue, rollingSuccess, unitsToRepack, visibleOrders, laneState } from "./cell_data.js";
import { createPopover } from "./cell_pop.js";
import { storePopover, stationPopover, worldPopover, worldOverviewPopover } from "./popovers.js";
import { createWorldPanel } from "./world_panel.js";
import { int, pct, fixed, upTo } from "./format.js";

export const SIZE_LIMITS = { strip: 260, short: 400, compact: 600 }; // body heights in px
const STATE_TEXT = { dispatched: "on its truck", late: "late", "at-risk": "at risk", done: "packed", open: "" };
const STATIONS = [
  { id: "inbound", label: "Inbound pallet", icon: "pallet" },
  { id: "camera", label: "Camera", icon: "camera" },
  { id: "cell", label: "Robot cell", icon: "gripper" },
  { id: "scale", label: "Scale", icon: "scale" },
  { id: "manual", label: "Manual station", icon: "user" }
];
const kg = (g) => `${upTo(g / 1000, 1)} kg`;

/** Night info for the board before a night runs: the selected scenario at 22:00. */
export function idleInfo(scenario, params = {}) {
  const world = getWorldData();
  const night = buildNight(world, scenario.night, params);
  return { ...nightInfo(night, { seed: scenario.night.seed }), scenario_id: scenario.id };
}

/**
 * onRender(dirty, st): called after every frame that applied the night's events or loaded a night, so the
 * Customer view (js/world_stage.js, js/worth_panel.js) draws from the same state in the same frame.
 */
export function createCellBoard(root, { scenarios = [], getParams = () => ({}), nightDate = () => null, onRender = () => {} } = {}) {
  const byId = (id) => scenarios.find((s) => s.id === id);
  let scenario = null;
  let st = null;
  let running = false;
  let size = "full";
  const dirty = new Set();
  let frame = 0;
  let lastFlash = 0;

  // ---- frame -------------------------------------------------------------------------------------------
  const title = h("span", { class: "cell-title" });
  const sub = h("span", { class: "cell-sub" });
  const caption = h("div", { class: "cell-caption" }, title, sub);
  // The board's clock (the header tile carries the accessible one). At a wake-up it says "· paused"; in
  // the short and strip sizes a pause mark stands in for the words, so the head row keeps its room.
  const clockTime = h("span", { class: "cell-clock-time" }, "22:00");
  const clockPaused = h("span", { class: "cell-clock-paused" });
  const clockEl = h("span", { class: "cell-clock", "aria-hidden": "true", dataset: { paused: "false" } }, clockTime, clockPaused);
  const tag = h("span", {
    class: "vc-tag sim-cell-tag", role: "note",
    title: "The robot cell, its camera, scale and gripper, and the warehouse system are simulated, in Live and in Simulation mode."
  }, icon("gripper", 16), "Simulated cell");
  const headRight = h("div", { class: "cell-head-right" }, clockEl, tag);

  const stationEls = new Map();
  const line = h("section", { class: "cell-line", "aria-label": "The cell line, from the inbound pallet to the totes" });
  STATIONS.forEach((s, i) => {
    const t1 = h("span", { class: "st-l1" });
    const t2 = h("span", { class: "st-l2" });
    const btn = h("button", { class: "station", type: "button", dataset: { station: s.id } },
      h("span", { class: "st-head" }, h("span", { class: "vc-cell st-icon" }, icon(s.icon, 22)), h("span", { class: "st-label" }, s.label)), t1, t2);
    btn.addEventListener("click", () => openStation(s.id, btn));
    stationEls.set(s.id, { btn, t1, t2 });
    if (i > 0) line.append(h("span", { class: `flow-arrow${s.id === "manual" ? " to-manual" : ""}`, "aria-hidden": "true" }, s.id === "manual" ? "⇢" : "→"));
    line.append(btn);
  });

  const lanes = h("section", { class: "cell-lanes", "aria-label": "Store orders and their truck cut-offs" });
  const laneEls = new Map();

  // The world-model panel (js/world_panel.js): a card on a roomy board, a chip in the head on a short one.
  const worldPanel = createWorldPanel({
    onOpen: (sku, anchor) => {
      if (!st) return;
      popFor = { kind: "world", id: sku || "all" };
      if (sku) pop.show(anchor, worldPopover(st, sku), { label: `World model: ${sku}`, id: `world:${sku}` });
      else pop.show(anchor, worldOverviewPopover(st), { label: "World model", id: "world:all" });
    }
  });
  const world = worldPanel.card;
  const wmChip = worldPanel.chip;

  // A legend for the board's colours (full size only, when there is room): every state also has
  // its words in the lane, so the colours never carry the meaning alone.
  const legend = h("div", { class: "cell-legend", role: "note", "aria-label": "Legend" },
    [["dispatched", "on its truck"], ["at-risk", "at risk"], ["late", "late"], ["open", "being packed"]].map(([k, label]) =>
      h("span", { class: "lg-item" }, h("span", { class: "lg-swatch", dataset: { state: k }, "aria-hidden": "true" }), label)),
    h("span", { class: "lg-item", dataset: { tone: "person" } }, icon("user", 14), "handed to a person"),
    h("span", { class: "lg-item" }, h("span", { class: "lg-swatch", dataset: { tone: "check" }, "aria-hidden": "true" }), "a sensor's reading or check"));
  const body = h("div", { class: "cell-body" }, line, lanes, world, legend);
  // On a short board the world model folds into a chip in the head row, beside the caption.
  const board = h("div", { class: "cell-board", dataset: { size, state: "idle" } },
    h("div", { class: "cell-head" }, caption, wmChip, headRight), body);
  clear(root).appendChild(board);

  const pop = createPopover(board, {
    resolve: (key) => {
      const [kind, id] = key.split(":");
      if (kind === "store") return laneEls.get(id)?.btn || null;
      if (kind === "station") return stationEls.get(id)?.btn || null;
      if (kind === "world") return size === "strip" || size === "short" ? wmChip : worldPanel.focus;
      return null;
    }
  });
  let popFor = null; // what the open popover shows, to refresh it as the night moves

  function openStation(id, btn) {
    if (!st) return;
    popFor = { kind: "station", id };
    pop.show(btn, stationPopover(st, id), { label: STATIONS.find((s) => s.id === id).label, id: `station:${id}` });
  }
  function openStore(id, btn) {
    if (!st) return;
    popFor = { kind: "store", id };
    pop.show(btn, storePopover(st, st.orders.get(id)), { label: st.orders.get(id).name, id: `store:${id}` });
  }

  // ---- size ---------------------------------------------------------------------------------------------
  // The size follows the free height; when the content still does not fit (thirteen lanes need more
  // room than twelve, a narrow panel more rows), the board steps down a size. The legend shows only
  // where it fits beside everything else.
  const SIZES = ["full", "compact", "short", "strip"];
  const sizeOf = (hgt) => (hgt < SIZE_LIMITS.strip ? "strip" : hgt < SIZE_LIMITS.short ? "short" : hgt < SIZE_LIMITS.compact ? "compact" : "full");
  // Layout positions, not scroll sizes: a lane sliding in (its arrival animation) must not count.
  const bottomOf = (el) => el.offsetTop + el.offsetHeight;
  const fits = () => {
    const items = [...lanes.children].filter((l) => l.offsetParent !== null);
    if (items.length && Math.max(...items.map(bottomOf)) > lanes.offsetTop + lanes.clientHeight + 1) return false;
    const parts = [...body.children].filter((c) => c.offsetParent !== null);
    return !parts.length || Math.max(...parts.map(bottomOf)) <= body.offsetTop + body.clientHeight + 1;
  };
  const measure = () => {
    const before = size;
    let next = sizeOf(body.clientHeight);
    board.dataset.size = next;
    board.dataset.legend = "on";
    if (next === "full" && !fits()) board.dataset.legend = "off";
    while (next !== "strip" && !fits()) { next = SIZES[SIZES.indexOf(next) + 1]; board.dataset.size = next; }
    if (next !== "full") board.dataset.legend = "off";
    size = next;
    if (size !== before) markAll();
  };
  let measuring = 0;
  const remeasure = () => { if (!measuring) measuring = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16))(() => { measuring = 0; measure(); }); };
  if (typeof ResizeObserver === "function") new ResizeObserver(remeasure).observe(board);
  // The board's colours come from Vici's tokens through its classes, so a new theme repaints it; it
  // still redraws, so that anything drawn from a measured style follows the theme too.
  document.addEventListener("vc:themechange", () => { remeasure(); markAll(); });

  // ---- state → view --------------------------------------------------------------------------------------
  function markAll() { for (const k of ["clock", "camera", "cell", "scale", "manual", "orders", "world", "inbound", "escalations", "items"]) dirty.add(k); request(); }
  function request() { if (!frame) frame = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16))(render); }

  function render() {
    frame = 0;
    if (!st) return;
    const d = new Set(dirty);
    dirty.clear();
    if (d.has("clock")) renderClock();
    if (d.has("inbound") || d.has("orders")) renderStation("inbound");
    if (d.has("camera")) renderStation("camera");
    if (d.has("cell")) renderStation("cell");
    if (d.has("scale")) renderStation("scale");
    if (d.has("manual") || d.has("escalations") || d.has("clock")) renderStation("manual");
    if (d.has("orders") || d.has("clock")) { if (renderLanes()) remeasure(); }
    if (d.has("world")) worldPanel.render(st);
    if (pop.isOpen() && popFor && st && d.size) refreshPopover();
    if (d.size) onRender(d, st);
  }

  function refreshPopover() {
    const key = pop.key();
    if (popFor.kind === "store" && key === `store:${popFor.id}`) pop.update(storePopover(st, st.orders.get(popFor.id)));
    else if (popFor.kind === "station" && key === `station:${popFor.id}`) pop.update(stationPopover(st, popFor.id));
    else if (popFor.kind === "world" && key === `world:${popFor.id}`) pop.update(popFor.id === "all" ? worldOverviewPopover(st) : worldPopover(st, popFor.id));
  }

  function renderClock() {
    const started = running || st.t > 0;
    const time = started ? clockOf(st.t) : "22:00";
    const paused = started && st.paused ? " · paused" : "";
    if (clockTime.textContent !== time) clockTime.textContent = time;
    if (clockPaused.textContent !== paused) clockPaused.textContent = paused;
    const flag = paused ? "true" : "false";
    if (clockEl.dataset.paused !== flag) clockEl.dataset.paused = flag;
    board.dataset.state = st.ended ? "ended" : running ? "running" : "idle";
  }

  function renderStation(id) {
    const s = stationEls.get(id);
    if (!s) return;
    let l1 = "", l2 = "", flag = "", label = "";
    if (id === "inbound") {
      const next = st.inbound.find((w) => !w.arrived);
      l1 = next ? `next ${next.arrives} · ${next.label.split(" ")[0].toLowerCase()}` : "all waves in ✓"; // time first: a cut line keeps it
      l2 = `${int(unitsToRepack(st))} units to repack`;
      label = `Inbound pallet: ${st.inbound.map((w) => `${w.label} ${w.arrived ? "arrived" : `due at ${w.arrives}`}`).join(", ")}; ${l2}`;
    } else if (id === "camera") {
      const c = st.camera.last;
      l1 = c ? (c.known ? short(st, c.sku) : `Unknown ${c.barcode}`) : "waiting";
      l2 = c ? `confidence ${fixed(c.confidence, 2)}${c.known ? "" : " · not in the item master"}` : `${int(st.info.totals.cell_units)} items for the cell`;
      flag = c && !c.known ? "unknown" : "";
      label = `Camera: ${l1}, ${l2}`;
    } else if (id === "cell") {
      const c = st.cell.current;
      const roll = rollingSuccess(st);
      // The cell's health first (it is what E3 watches): the rolling rate once there are 100 grasps.
      const rate = roll ?? (st.cell.attempts ? st.cell.successes / st.cell.attempts : null);
      l1 = c ? `${pct(rate, 0)} ok · ${c.grip}` : `${int(st.info.r_c)} attempts an hour`;
      l2 = st.cell.attempts ? (roll !== null ? "over the last 100 grasps" : `over ${int(st.cell.attempts)} grasp${st.cell.attempts === 1 ? "" : "s"}`) : "rehearses each grasp first";
      flag = c ? (c.ok ? "ok" : "fail") : "";
      if (roll !== null && roll < 0.75) flag = "alarm";
      label = `Robot cell: ${c ? `last grasp ${short(st, c.sku)} with ${c.grip}, expected success ${pct(c.expected_success, 0)}, ${c.ok ? "picked" : "failed"}` : l1}; ${int(st.cell.attempts)} grasps, ${st.cell.attempts ? pct(st.cell.successes / st.cell.attempts, 0) : "none"} picked${roll !== null ? `, last 100 grasps ${pct(roll, 0)}` : ""}`;
      const now = performance.now();
      if (c && running && now - lastFlash > 160) { lastFlash = now; s.btn.dataset.flash = c.ok ? "ok" : "fail"; s.btn.classList.remove("flash"); void s.btn.offsetWidth; s.btn.classList.add("flash"); }
    } else if (id === "scale") {
      const r = st.scale.last;
      l1 = r ? `${int(r.observed_g)} g` : "waiting";
      l2 = r ? `expected ${int(r.expected_g)} g` : "weighs every lifted item";
      flag = r && Math.abs(r.observed_g - r.expected_g) / r.expected_g > WEIGHT_TOLERANCE ? "differs" : "";
      label = `Scale: ${l1}, ${l2}`;
    } else {
      const q = manualQueue(st);
      l1 = `${int(q)} waiting · ${int(st.manual.picks)} picked`;
      l2 = st.handed.length ? `${int(st.handed.length)} handed to a person` : `${int(st.info.r_m)} picks an hour`;
      flag = st.handed.length ? "handed" : "";
      label = `Manual station: ${l1}; ${l2}`;
    }
    if (s.t1.textContent !== l1) s.t1.textContent = l1;
    if (s.t2.textContent !== l2) s.t2.textContent = l2;
    s.btn.dataset.flag = flag;
    s.btn.setAttribute("aria-label", label);
  }

  /** Draws the lanes; returns true when a lane was added (the board may need another size). */
  function renderLanes() {
    const list = visibleOrders(st);
    let added = false;
    for (const o of list) {
      if (laneEls.has(o.id)) continue;
      added = true;
      const name = h("span", { class: "lane-name" });
      const cut = h("span", { class: "lane-cut" });
      const fill = h("span", { class: "lane-fill" });
      const bar = h("span", { class: "lane-bar", "aria-hidden": "true" }, fill);
      const meta = h("span", { class: "lane-meta" });
      const status = h("span", { class: "lane-status" });
      const btn = h("button", { class: "lane", type: "button", dataset: { order: o.id, kind: o.kind } },
        h("span", { class: "lane-top" }, name, cut), bar, h("span", { class: "lane-bottom" }, meta, status));
      btn.addEventListener("click", () => openStore(o.id, btn));
      laneEls.set(o.id, { btn, name, cut, fill, meta, status });
      lanes.append(btn);
      if (running && o.kind === "express") btn.classList.add("arrived");
    }
    for (const o of list) {
      const l = laneEls.get(o.id);
      const state = laneState(o);
      const share = o.units ? o.packed / o.units : 0;
      const nameText = size === "strip" ? (o.kind === "express" ? `${o.store}+` : o.id) : o.kind === "express" ? `${o.name.replace(" express", "")} express` : o.name;
      if (l.name.textContent !== nameText) l.name.textContent = nameText;
      if (l.cut.textContent !== o.cutoff) l.cut.textContent = o.cutoff;
      l.fill.style.width = `${Math.round(share * 1000) / 10}%`;
      const meta = size === "strip" ? "" : o.packed ? `${int(o.packed)}/${int(o.units)} · tote ${o.tote_no} ${kg(o.tote_weight)}` : `${int(o.units)} units`;
      if (l.meta.textContent !== meta) l.meta.textContent = meta;
      let status = STATE_TEXT[state];
      if (state === "at-risk" && o.slack_min !== null) status = size === "strip" ? "risk" : o.slack_min >= 0 ? `at risk · ${o.slack_min} min to spare` : `at risk · ${-o.slack_min} min late`;
      if (state === "open" && o.projected_ms !== null && size !== "strip") status = `projected ${clockUp(o.projected_ms)}`;
      if (state === "dispatched") status = size === "strip" ? "✓" : `✓ truck ${clockOf(o.dispatched_ms)}`;
      if (state === "late") status = size === "strip" ? "late" : o.status === "late_done" ? `late · done by ${clockUp(o.done_ms)}` : `late · truck left with ${int(o.packed_by_cutoff)}/${int(o.units)}`;
      if (state === "done" && size !== "strip") status = `packed · truck ${o.cutoff}`;
      if (l.status.textContent !== status) l.status.textContent = status;
      l.btn.dataset.state = state;
      l.btn.setAttribute("aria-label", `${o.name}: ${int(o.packed)} of ${int(o.units)} units in totes, cut-off ${o.cutoff}${STATE_TEXT[state] ? `, ${STATE_TEXT[state]}` : ""}${o.projected_ms !== null && o.status === "open" ? `, projected last unit by ${clockUp(o.projected_ms)}` : ""}`);
    }
    return added;
  }

  // ---- night state ------------------------------------------------------------------------------------------
  function load(info) {
    st = createNightState(info);
    laneEls.clear();
    clear(lanes);
    pop.hide(false);
    popFor = null;
    markAll();
    setCaption();
  }

  function setCaption() {
    title.textContent = getWorldData().meta.dc.name;
    const date = scenario ? nightDate(scenario) : null;
    sub.textContent = `${date ? `${date} · ` : ""}22:00–06:00${scenario ? ` · Scenario ${scenario.number}: ${scenario.short}` : ""}`;
  }

  const FEED = ["detection", "grasp_attempt", "rehearsal", "scale_reading", "world_model_correction", "manual_pick", "tote_update", "projection", "cutoff_risk", "order_new", "dispatch", "late_complete", "escalation", "wave_arrival", "units_routed", "order_moved", "plan_update", "wake", "clock", "night_end"];
  for (const type of FEED) {
    bus.on(type, (ev) => {
      if (!st || !running) return;
      for (const k of applyEvent(st, type, ev.payload, ev.payload.sim_t)) dirty.add(k);
      request();
    });
  }
  bus.on("night_plan", (ev) => { scenario = byId(ev.payload.scenario_id) || scenario; running = true; load(ev.payload); });
  bus.on("night_end", () => { running = false; dirty.add("clock"); request(); });
  // A run that ends stands still for good: no pause mark (the night may have stood at its last wake-up).
  bus.on("run_end", () => { running = false; if (st) { st.paused = false; st.pause_reason = null; } dirty.add("clock"); request(); });

  /** Shows the selected scenario's night at 22:00 (no run). */
  function focusScenario(id) {
    scenario = byId(id) || scenario;
    if (running || !scenario) { setCaption(); return; }
    load(idleInfo(scenario, getParams()));
  }

  function reset() {
    running = false;
    if (scenario) load(idleInfo(scenario, getParams()));
  }

  measure();
  return {
    focusScenario, reset,
    invalidate: () => { measure(); markAll(); },
    state: () => st,
    size: () => size
  };
}

function short(st, sku) {
  const n = st.world.name(sku);
  return n.split(",")[0];
}
