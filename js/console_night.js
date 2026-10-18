// The night in the agent console (PLAN.md §g, "Console and progress rail"): the logbook gets a line
// for every moment that matters and never one per unit. Tonight's plan; an inbound wave; a new order;
// every world-model correction; every escalation; every cut-off risk; every wake-up; an hourly line
// for the cell and the manual station; one line per store when its truck leaves (on time with its
// totes, or late with what was packed), and the night report with tonight's figures. Single grasps,
// readings, picks and totes stay on the board and in the audit's unit log (decision D20).
//
// Every figure here comes from the night's events and the engine; the console only words them.

import { bus } from "./events.js";
import { h } from "./dom.js";
import { clockOf, clockUp, msOf, MINUTE } from "./nightsim.js";
import { tonightEuros } from "./engine.js";
import { int, pct, upTo, hours, eur2 } from "./format.js";

const HOUR = 60 * MINUTE;
const WAKE_WORDS = {
  night_start: "night start", correction: "world-model correction", escalation: "escalation",
  new_order: "new order", cutoff_risk: "cut-off risk", night_end: "night end"
};
const kg = (g) => `${upTo(g / 1000, 2)} kg`;
const listJoin = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const slackText = (min) => (min >= 0 ? `${int(min)} min to spare` : `${int(-min)} min late`);

/**
 * ctx: { add(el), entry(type, ev, mark, body, data), mode() → the run's mode, getInputs() → engine inputs }.
 * Returns { reset }.
 */
export function attachNightLog(ctx) {
  let names = new Map();     // order id → name
  let items = new Map();     // sku → name
  let cutoffs = new Map();   // order id → cut-off "HH:MM"
  let totes = new Map();     // order id → { closed, open, heaviest_g }
  let hour = null;           // this hour's counters
  let lastHour = 0;          // hours after 22:00 already summarised
  let live = false;

  const fresh = () => ({ attempts: 0, ok: 0, failed: 0, manual: 0, packed: 0 });
  const nameOf = (id) => names.get(id) || id;
  const item = (sku) => (sku ? `${sku} ${items.get(sku) || ""}`.trim() : "an unknown item");
  const add = (type, ev, mark, body, data) => ctx.add(ctx.entry(type, ev, mark, body, data));
  const strong = (text) => h("strong", {}, text);

  function reset() {
    names = new Map(); items = new Map(); cutoffs = new Map(); totes = new Map();
    hour = fresh(); lastHour = 0; live = false;
  }
  reset();

  bus.on("night_plan", (ev) => {
    reset();
    live = true;
    const p = ev.payload;
    for (const o of p.orders) { names.set(o.id, o.kind === "express" ? `${o.name.replace(/ express$/, "")} express` : o.name); cutoffs.set(o.id, o.cutoff); }
    for (const it of p.items) items.set(it.sku, it.name);
    const stores = p.orders.filter((o) => o.kind === "store");
    const first = stores[0];
    const last = stores.at(-1);
    add("night", ev, "pallet", [
      strong(`Tonight: ${int(p.totals.units)} units for ${int(stores.length)} store orders. `),
      `The cell may handle ${int(p.totals.cell_units)} of them, ${int(p.totals.manual_units)} go by hand. Truck cut-offs from ${first.cutoff} (${first.name}) to ${last.cutoff} (${last.name}); seed ${p.seed}.`
    ]);
  });

  bus.on("wave_arrival", (ev) => {
    const p = ev.payload;
    add("night", ev, "pallet", `${p.label}: ${int(p.units)} units reach the infeed.`);
  });

  bus.on("order_new", (ev) => {
    const p = ev.payload;
    names.set(p.order, `${nameOf(p.store)} express`);
    cutoffs.set(p.order, p.due);
    add("order", ev, "info", [strong("New order: "), `${nameOf(p.store)} express, ${int(p.units)} units for the express truck at ${p.due}.`]);
  });

  bus.on("world_model_correction", (ev) => {
    const p = ev.payload;
    add("correction", ev, "scale", [
      strong("World model corrected: "),
      `${p.sku} (${items.get(p.sku) || "item"}) weighs ${int(p.new)} g on the scale; the world model expected ${int(p.old)} g. The observed weight is written back for the whole SKU, and the next unit is rehearsed with it.`
    ]);
  });

  bus.on("escalation", (ev) => {
    const p = ev.payload;
    let text;
    if (p.rule === "E1") text = `${p.reason}. ${int(p.units ?? 1)} unit${p.units === 1 ? "" : "s"} set aside until a person confirms the item.`;
    else if (p.rule === "E2") text = `${p.reason}. Handed to a person at the manual station (${item(p.sku)} for ${nameOf(p.store)}).`;
    else if (p.rule === "E3") text = `${p.reason}. A person is called to the cell.`;
    else text = p.reason;
    add("escalation", ev, "user", [strong(`Escalation ${p.rule}: `), text], { rule: p.rule });
  });

  bus.on("cutoff_risk", (ev) => {
    const stores = ev.payload.stores || [];
    if (!stores.length) return;
    const parts = stores.map((s) => `${nameOf(s.store)} projected done by ${s.projected} for its ${s.cutoff} truck (${slackText(s.slack_min)})`);
    add("risk", ev, "alert", [strong("Cut-off risk: "), `${listJoin(parts)}.`]);
  });

  bus.on("wake", (ev) => {
    const p = ev.payload;
    if (p.kind === "night_end") return; // the night report follows
    const kinds = listJoin((p.kinds || [p.kind]).map((k) => WAKE_WORDS[k] || k));
    const preview = ctx.mode() === "preview";
    add("wake", ev, "spark", [strong(`Wake-up ${p.wake_id}: `), `${kinds}.`, preview ? " No agent in this preview: the night only pauses." : " The night stands still while the agent takes its turn."]);
  });

  // ---- counters for the hourly line and the truck lines ----------------------------------------
  bus.on("grasp_attempt", (ev) => { hour.attempts += 1; if (ev.payload.ok) hour.ok += 1; else hour.failed += 1; });
  bus.on("manual_pick", () => { hour.manual += 1; });
  bus.on("tote_update", (ev) => {
    const p = ev.payload;
    const t = totes.get(p.store) || { closed: 0, open: 0, heaviest_g: 0 };
    if (p.status === "closed") { t.closed += 1; t.open = 0; } else { t.open = p.units; hour.packed += 1; }
    t.heaviest_g = Math.max(t.heaviest_g, p.weight_g);
    totes.set(p.store, t);
  });
  bus.on("clock", (ev) => {
    if (!live) return;
    const now = Math.floor(ev.payload.t / HOUR);
    while (lastHour < now) { summariseHour(ev, lastHour); lastHour += 1; hour = fresh(); }
  });

  function summariseHour(ev, n) {
    const x = hour;
    if (!x.attempts && !x.manual && !x.packed) return;
    const from = clockOf(n * HOUR);
    const to = clockOf((n + 1) * HOUR);
    const cell = x.attempts ? `the cell made ${int(x.attempts)} grasps, ${int(x.ok)} picked (${pct(x.ok / x.attempts)}) and ${int(x.failed)} to the manual station` : "the cell was idle";
    add("hour", { ...ev, payload: { sim_t: (n + 1) * HOUR } }, "gripper", [strong(`${from} to ${to}: `), `${cell}; the manual station picked ${int(x.manual)}; ${int(x.packed)} units went into totes.`]);
  }

  bus.on("dispatch", (ev) => {
    const p = ev.payload;
    const t = totes.get(p.store) || { closed: 0, open: 0, heaviest_g: 0 };
    const count = t.closed + (t.open > 0 ? 1 : 0);
    const name = nameOf(p.store);
    if (p.moved) { add("dispatch", ev, "truck", [strong(`${name}: `), "moved to the next day's wave."], { state: "late" }); return; }
    if (p.on_time) {
      add("dispatch", ev, "truck", [strong(`${name}: `), `on its ${cutoffs.get(p.store) || clockOf(p.t)} truck with all ${int(p.of)} units in ${int(count)} tote${count === 1 ? "" : "s"}, the heaviest ${kg(t.heaviest_g)}.`], { state: "on-time" });
    } else {
      add("dispatch", ev, "truck", [strong(`${name}: late. `), `Its ${cutoffs.get(p.store) || clockOf(p.t)} truck left with ${int(p.units)} of ${int(p.of)} units.`], { state: "late" });
    }
  });

  bus.on("late_complete", (ev) => {
    const p = ev.payload;
    const cut = cutoffs.get(p.store);
    const lateMin = cut ? Math.floor((p.t - msOf(cut)) / MINUTE) : null;
    const after = lateMin === null ? "" : lateMin < 1 ? ", less than a minute after its truck" : `, ${int(lateMin)} min after its truck`;
    add("dispatch", ev, "tote", [strong(`${nameOf(p.store)}: `), `last unit in its tote by ${clockUp(p.t)}${after}.`], { state: "late" });
  });

  bus.on("night_end", (ev) => {
    const f = ev.payload.figures;
    if (!f) return;
    // The hours not yet summarised (the clock may jump to the end in one step).
    const endHour = Math.ceil((ev.payload.sim_t ?? 8 * HOUR) / HOUR);
    while (lastHour < endHour) { summariseHour(ev, lastHour); lastHour += 1; hour = fresh(); }
    live = false;
    const v = ctx.getInputs();
    const eur = tonightEuros(v, f);
    const late = (ev.payload.orders || []).filter((o) => !o.on_time);
    const verdict = late.length ? `${int(f.orders_on_time)} of ${int(f.orders)} orders on time; late: ${listJoin(late.map((o) => nameOf(o.id)))}.` : `All ${int(f.orders)} orders on time.`;
    const rows = [
      ["Units repacked", int(f.units_repacked)],
      ["Labour tonight", `${hours(f.labour_hours)} · ${eur2(eur.labour_eur)}`],
      ["Per 1,000 units", `${hours(f.labour_hours_per_1000)} · ${eur2(eur.per_thousand_eur)}`],
      ["Robot cell", `${hours(f.cell_hours)} at ${int(f.robot_picks_per_cell_hour)} picks per cell hour`],
      ["Exceptions", `${int(f.failures)} failed grasps, ${int(f.escalations)} escalation${f.escalations === 1 ? "" : "s"}, ${int(f.corrections)} correction${f.corrections === 1 ? "" : "s"}`],
      ["Seed", `${f.seed} (the same seed replays the same night)`]
    ];
    add("report", ev, "check", h("div", { class: "night-report" },
      h("div", { class: "night-report-title" }, `Night over at ${clockOf(ev.payload.sim_t ?? 8 * HOUR)}. ${verdict}`),
      h("dl", {}, rows.flatMap(([k, val]) => [h("dt", {}, k), h("dd", {}, val)])),
      h("p", { class: "night-report-note" }, `Labour counts the base picker's picks at ${int(v.r_m)} an hour (IML) and any called-in hours; euros at ${eur2(v.c)} an hour (EUROSTAT_LC)${f.called_in_hours > 0 ? `, called-in hours with the ${Math.round(v.callin_premium * 100)} % night premium (Assumption)` : ""}. Simulated, synthetic night.`)),
    { state: late.length ? "late" : "on-time" });
  });

  return { reset };
}
