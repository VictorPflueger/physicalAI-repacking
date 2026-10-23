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
import { tonightEuros, night as engineNight } from "./engine.js";
import { int, pct, upTo, hours, eur2 } from "./format.js";
import { worth } from "./worth.js";
import { POLICY } from "./escalation.js";

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
  const itemName = (sku) => (sku ? items.get(sku) || sku : "An unknown item");
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
      `The robot cell may take ${int(p.totals.cell_units)} of them; ${int(p.totals.manual_units)} go to the manual station. Trucks leave from ${first.cutoff} (${first.name}) to ${last.cutoff} (${last.name}).`,
      h("span", { class: "detail-only" }, ` Seed ${p.seed}.`)
    ]);
  });

  bus.on("wave_arrival", (ev) => {
    const p = ev.payload;
    add("wave", ev, "pallet", `${p.label}: ${int(p.units)} units reach the infeed.`);
  });

  bus.on("order_new", (ev) => {
    const p = ev.payload;
    names.set(p.order, `${nameOf(p.store)} express`);
    cutoffs.set(p.order, p.due);
    add("order", ev, "info", [strong("Express order: "), `${nameOf(p.store)} wants ${int(p.units)} more units on its ${p.due} express truck.`]);
  });

  bus.on("world_model_correction", (ev) => {
    const p = ev.payload;
    add("correction", ev, "scale", [
      strong("World model corrected: "),
      `${items.get(p.sku) || "An item"} weighs ${int(p.new)} g on the scale; its master data say ${int(p.old)} g. The new weight now holds for every unit of this item`,
      h("span", { class: "detail-only" }, ` (${p.sku})`),
      ", and the next one is rehearsed with it before the robot picks it."
    ]);
  });

  // Escalations in plain words (TECH_NOTES D50): what happened and who takes over; the rule's code is a
  // detail. The rules themselves are in code (js/escalation.js, PLAN.md §e.2).
  bus.on("escalation", (ev) => {
    const p = ev.payload;
    const code = h("span", { class: "detail-only" }, ` Rule ${p.rule}.`);
    let parts;
    if (p.rule === "E1") {
      parts = [strong("Unknown item: "), `${p.reason}. ${int(p.units ?? 1)} unit${p.units === 1 ? "" : "s"} set aside until a person confirms the item.`];
    } else if (p.rule === "E2") {
      const [what, conf] = String(p.reason || "").split(/:\s*grasp confidence\s*/);
      const why = conf ? `${what} (grip confidence ${conf.replace(/\s*below\s*/, ", below ")})` : p.reason;
      parts = [strong("Handed to a person: "), `${why}. ${itemName(p.sku)} for ${nameOf(p.store)} goes to the manual station; the robot does not try it.`];
    } else if (p.rule === "E3") {
      const rate = typeof p.rolling_success === "number" ? pct(p.rolling_success) : null;
      parts = [strong("Gripper check: "), rate ? `the robot picked ${rate} of its last ${int(POLICY.E3.window)} grasps, below the ${pct(POLICY.E3.minRollingSuccess)} the rule asks for. A person is called to the cell.` : `${p.reason}. A person is called to the cell.`];
    } else {
      parts = [strong("Escalation: "), p.reason];
    }
    add("escalation", ev, "user", [...parts, code], { rule: p.rule });
  });

  bus.on("cutoff_risk", (ev) => {
    const stores = ev.payload.stores || [];
    if (!stores.length) return;
    const parts = stores.map((s) => `${nameOf(s.store)} would finish at ${s.projected} for its ${s.cutoff} truck (${slackText(s.slack_min)})`);
    add("risk", ev, "alert", [strong("Trucks at risk: "), `${listJoin(parts)}.`]);
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

  // The night report closes the night as the "what it is worth" card (TECH_NOTES D50): tonight's labour
  // against the same units by hand, then the engine's plan per 1,000 units and per year. Every figure
  // comes from the night's figures and the engine at the run's inputs.
  bus.on("night_end", (ev) => {
    const f = ev.payload.figures;
    if (!f) return;
    // The hours not yet summarised (the clock may jump to the end in one step).
    const endHour = Math.ceil((ev.payload.sim_t ?? 8 * HOUR) / HOUR);
    while (lastHour < endHour) { summariseHour(ev, lastHour); lastHour += 1; hour = fresh(); }
    live = false;
    const v = ctx.getInputs();
    const eur = tonightEuros(v, f);
    // The same units by hand, the ones a person set aside included, as tonight's labour includes them (D69).
    const byHand = engineNight(v, f.units_repacked + (f.set_aside || 0));
    const w = worth(v).text;
    const late = (ev.payload.orders || []).filter((o) => !o.on_time);
    // The express order is the night's thirteenth order (id XPR): name it, so "13 orders" matches the 12 stores.
    const express = (ev.payload.orders || []).some((o) => o.id === "XPR");
    const verdict = late.length
      ? `${int(f.orders_on_time)} of ${int(f.orders)} orders on time; late: ${listJoin(late.map((o) => nameOf(o.id)))}.`
      : `All ${int(f.orders)} orders on time${express ? ` (${int(f.orders - 1)} store orders and the express order)` : ""}.`;
    const plural = (k, one, many) => `${int(k)} ${k === 1 ? one : many}`;
    const tonight = [
      ["Units repacked", int(f.units_repacked)],
      ["Labour with the cell", `${hours(f.labour_hours)} · ${eur2(eur.labour_eur)}${f.called_in_hours > 0 ? `, ${hours(f.called_in_hours)} of it called in` : ""}`],
      ["The same units by hand", `${hours(byHand.manual_h)} · ${eur2(byHand.manual_eur)}`],
      // Tonight beside the plan and by hand, per 1,000 units: a night with a call-in costs more than the plan.
      ["Per 1,000 units", `${eur2(eur.per_thousand_eur)} tonight with the cell${f.called_in_hours > 0 ? `, ${hours(f.called_in_hours)} called in` : ""}; ${w.hybrid} planned; ${w.manual} by hand`],
      ["Robot cell", `${hours(f.cell_hours)} at ${int(f.robot_picks_per_cell_hour)} picks per cell hour`, true],
      ["Exceptions", `${plural(f.failures, "failed grasp", "failed grasps")} picked by hand, ${plural(f.escalations, "escalation", "escalations")} to a person, ${plural(f.corrections, "world-model correction", "world-model corrections")}`],
      ["Seed", `${f.seed} (the same seed replays the same night)`, true]
    ];
    const value = [
      ["Per 1,000 units", `${w.hybrid} with the cell, instead of ${w.manual} by hand (${w.saving})`],
      [`A DC repacking ${w.units} units a year`, `${w.year} a year with ${w.cells} cells on the night shift; gross, before cell costs`],
      ["Break-even per cell", `${w.break_even} per operating hour`]
    ];
    const list = (rows) => h("dl", {}, rows.flatMap(([k, val, detail]) => [h("dt", detail ? { class: "detail-only" } : {}, k), h("dd", detail ? { class: "detail-only" } : {}, val)]));
    add("report", ev, "check", h("div", { class: "night-report" },
      h("div", { class: "night-report-title" }, `Night over at ${clockOf(ev.payload.sim_t ?? 8 * HOUR)}. ${verdict}`),
      h("h4", { class: "night-report-head" }, "Tonight"),
      list(tonight),
      h("h4", { class: "night-report-head" }, "What it is worth"),
      list(value),
      ctx.onOpenBusinessCase ? h("div", { class: "entry-actions" },
        h("button", { class: "btn btn-sm", type: "button", id: "btn-console-your-dc", on: { click: () => ctx.onOpenBusinessCase() } }, "Your DC: the business case")) : null,
      h("p", { class: "night-report-note detail-only" }, `Labour counts the base picker's picks at ${int(v.r_m)} an hour (IML) and any called-in hours; by hand, every unit at that rate; euros at ${eur2(v.c)} an hour (EUROSTAT_LC)${f.called_in_hours > 0 ? `, called-in hours with the ${Math.round(v.callin_premium * 100)} % night premium (Assumption)` : ""}. The yearly figure is illustrative, per reference site. Simulated, synthetic night.`)),
    { state: late.length ? "late" : "on-time" });
  });

  return { reset };
}
