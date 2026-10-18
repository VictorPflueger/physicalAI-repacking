// Content of the cell board's popovers: a store order with its totes, each station of the cell (the
// inbound pallet, the camera, the robot cell, the scale, the manual station) and an item of the world
// model. Every figure comes from the night's events (js/cell_data.js) and the synthetic world; the
// popovers only arrange it.

import { h } from "./dom.js";
import { clockOf, clockUp } from "./nightsim.js";
import { int, pct, fixed, upTo } from "./format.js";
import { laneState, manualQueue, rollingSuccess, unitsToRepack } from "./cell_data.js";

const kg = (g) => `${upTo(g / 1000, 2)} kg`;
const grams = (g) => (g === null || g === undefined ? "—" : `${int(g)} g`);
const STATE_WORDS = { dispatched: "On its truck, on time", late: "Late", "at-risk": "At risk", done: "Packed, truck still to leave", open: "Being packed" };
const REASONS = { manual: "manual-only item", failed: "failed grasp", E1: "unknown barcode (E1)", E2: "fragile, low grasp confidence (E2)", split: "split to the manual station", fragile: "fragile items by hand" };

function grid(rows) {
  return h("dl", { class: "pop-grid" }, rows.filter(Boolean).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
}
function head(title, sub, tags = []) {
  return [h("div", { class: "pop-title" }, title), sub ? h("div", { class: "pop-sub" }, sub) : null,
    tags.length ? h("div", { class: "pop-tags" }, tags) : null];
}
const chip = (text, tone) => h("span", { class: "chip", dataset: { tone } }, text);

/** A store order: units, totes, cut-off, projection, dispatch. */
export function storePopover(st, o) {
  const state = laneState(o);
  const tone = { dispatched: "on-time", late: "late", "at-risk": "at-risk" }[state] || "neutral";
  const rows = [
    ["Truck cut-off", o.kind === "express" ? `${o.cutoff} (express truck)` : o.cutoff],
    ["Units in totes", `${int(o.packed)} of ${int(o.units)} (${int(o.cell_units)} for the cell, ${int(o.manual_units)} by hand)`],
    ["Current tote", o.packed ? `no. ${o.tote_no}: ${int(o.tote_units)} units, ${kg(o.tote_weight)} of ${kg(st.info.tote_limit_g)}` : "not started"],
    ["Totes closed", `${int(o.totes.length)}${o.heaviest_g ? `, heaviest ${kg(o.heaviest_g)}` : ""}`],
    o.status === "open" && o.projected_ms !== null ? ["Projected last unit", `by ${clockUp(o.projected_ms)} (${o.slack_min >= 0 ? `${o.slack_min} min to spare` : `${-o.slack_min} min late`})`] : null,
    o.dispatched_ms !== null ? ["Truck", `left ${clockOf(o.dispatched_ms)} with ${int(o.packed_by_cutoff)} of ${int(o.units)} units`] : null,
    o.done_ms !== null && o.status === "late_done" ? ["Last unit", `by ${clockUp(o.done_ms)}, after its truck`] : null
  ];
  const totes = o.totes.slice(-6);
  return h("div", {},
    ...head(o.name, o.kind === "express" ? `Express order, arrived ${clockOf(o.arrives_ms)}` : (o.flagship ? "Flagship store" : "Store order"),
      [chip(STATE_WORDS[state], tone), chip("Synthetic", "synthetic")]),
    grid(rows),
    totes.length ? h("table", { class: "pop-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Tote"), h("th", { class: "r" }, "Units"), h("th", { class: "r" }, "Weight"), h("th", { class: "r" }, "Closed"))),
      h("tbody", {}, totes.map((x) => h("tr", {}, h("td", {}, `no. ${x.no}`), h("td", { class: "r" }, int(x.units)), h("td", { class: "r" }, kg(x.weight_g)), h("td", { class: "r" }, clockOf(x.closed_ms)))))) : null,
    h("p", { class: "pop-note" }, `Totes close before a unit would take them over ${kg(st.info.tote_limit_g)} (Assumption). A store's order is on time when its last unit is in a tote by its cut-off.`));
}

/** One station of the cell line. kind: inbound | camera | cell | scale | manual. */
export function stationPopover(st, kind) {
  const i = st.info;
  if (kind === "inbound") {
    return h("div", {}, ...head("Inbound pallet", "Mixed pallets from the inbound waves", [chip("Synthetic", "synthetic")]),
      grid([
        ...st.inbound.map((w) => [w.label, `${w.arrives}, ${int(w.units)} units (${int(w.manual_units)} by hand)${w.arrived ? "" : ", not yet arrived"}`]),
        st.express ? ["Express order", `arrived ${clockOf(st.express.at)} for ${st.orders.get(st.express.order)?.name || st.express.store}, ${int(st.express.units)} units, due ${st.express.due}`] : null,
        ["Units to repack", int(unitsToRepack(st))]
      ]),
      h("p", { class: "pop-note" }, "Waves: ambient goods on the pallets at 22:00, chilled goods from a fresh hub at 01:00 (Assumption)."));
  }
  if (kind === "camera") {
    const d = st.camera.last;
    return h("div", {}, ...head("Camera", "3D camera over the infeed: identifies each item and reads its barcode"),
      grid([
        ["Last item", d ? (d.known ? `${d.sku} ${itemName(st, d.sku)}` : `Unknown barcode ${d.barcode}`) : "none yet"],
        ["Confidence", d ? fixed(d.confidence, 2) : "—"],
        ["In the item master", d ? (d.known ? "yes" : "no: handed to a person (E1)") : "—"],
        ["Items seen", int(st.camera.detections)]
      ]),
      h("p", { class: "pop-note" }, "Simulated sensor: readings come from the night simulation, seeded and reproducible."));
  }
  if (kind === "cell") {
    const c = st.cell.current;
    const roll = rollingSuccess(st);
    return h("div", {}, ...head("Robot cell", "Suction and two-finger gripper; every grasp is rehearsed against the world model first", [chip("Simulated cell", "neutral")]),
      grid([
        ["Last grasp", c ? `${c.sku} ${itemName(st, c.sku)}, ${c.ok ? "picked" : "failed: to the manual station"}` : "none yet"],
        ["Rehearsal", c ? `${c.grip}, expected success ${pct(c.expected_success, 0)}, grasp confidence ${fixed(c.grasp_confidence, 2)}` : "—"],
        st.cell.rehearsal ? ["Rehearsed again", `${st.cell.rehearsal.sku} at ${int(st.cell.rehearsal.weight_g)} g, ${clockOf(st.cell.rehearsal.t)}`] : null,
        ["Attempts", `${int(st.cell.attempts)} (${int(st.cell.successes)} picked, ${int(st.cell.failures)} failed)`],
        ["Success so far", st.cell.attempts ? pct(st.cell.successes / st.cell.attempts) : "—"],
        ["Last 100 attempts", roll === null ? "after 100 attempts" : pct(roll)],
        ["Rate", `${int(i.r_c)} attempts per hour (${upTo(i.t_cell_ms / 1000, 1)} s each)`]
      ]),
      h("p", { class: "pop-note" }, "Escalation rules in code: a fragile item with grasp confidence below 0.80 goes to a person (E2); success over the last 100 attempts below 75 % calls a person (E3). Example thresholds a client sets."));
  }
  if (kind === "scale") {
    const r = st.scale.last;
    return h("div", {}, ...head("Scale", "Under the gripper: weighs every item the cell lifts"),
      grid([
        ["Last reading", r ? `${r.sku} ${itemName(st, r.sku)}: ${grams(r.observed_g)}` : "none yet"],
        ["World model expected", r ? grams(r.expected_g) : "—"],
        ["Readings", int(st.scale.readings)],
        ["Corrections written back", int(st.corrections.length)]
      ]),
      h("p", { class: "pop-note" }, "A reading more than 25 % away from the world model writes the observed weight back for the whole SKU (Assumption)."));
  }
  const last = st.manual.last;
  return h("div", {}, ...head("Manual station", "A picker for the items the cell may not or could not handle", [chip("Synthetic", "synthetic")]),
    grid([
      ["Picks", int(st.manual.picks)],
      ["Waiting", `${int(manualQueue(st))} units`],
      ["Last pick", last ? `${last.sku ? `${last.sku} ${itemName(st, last.sku)}` : "unknown item, set aside"} (${REASONS[last.reason] || last.reason})` : "none yet"],
      ["Handed to a person", st.handed.length ? st.handed.map((x) => `${x.rule} ${clockOf(x.t)}`).join(", ") : "none"],
      ["Rate", `${int(i.r_m)} picks per hour`]
    ]),
    st.handed.length ? h("ul", { class: "pop-list" }, st.handed.slice(-4).map((x) => h("li", {}, `${clockOf(x.t)} ${x.rule}: ${x.reason}`))) : null);
}

/** An item of the world model: master data against what the sensors observed, and its corrections. */
export function worldPopover(st, sku) {
  const w = st.world.item(sku);
  if (!w) return h("div", {}, h("div", { class: "pop-title" }, sku));
  const corr = st.corrections.filter((c) => c.sku === sku);
  return h("div", {}, ...head(`${sku} ${w.name}`, "World model: what the item master says against what the sensors observed", [chip("Synthetic", "synthetic")]),
    grid([
      ["Item master", grams(w.master_g)],
      ["World model now", grams(w.expected_g)],
      ["Last scale reading", grams(w.observed_g)],
      ["Fragility", w.fragility],
      ["Grip", w.cell ? `${w.grip}, success ${pct(w.success, 0)} on average` : "manual only"]
    ]),
    corr.length ? h("table", { class: "pop-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Time"), h("th", {}, "Sensor"), h("th", {}, "Field"), h("th", { class: "r" }, "Old"), h("th", { class: "r" }, "New"))),
      h("tbody", {}, corr.map((c) => h("tr", {}, h("td", {}, clockOf(c.at)), h("td", {}, c.sensor), h("td", {}, "weight"), h("td", { class: "r" }, grams(c.old)), h("td", { class: "r" }, grams(c.new)))))) : null,
    h("p", { class: "pop-note" }, corr.length ? "The correction applies to the whole SKU: every later unit is rehearsed and weighed against the new value." : "No correction for this item: its readings match the item master."));
}

/** The world model as a whole: the item master it starts from, the rule, tonight's corrections. */
export function worldOverviewPopover(st) {
  const corr = st.corrections;
  return h("div", {}, ...head("World model", "What the cell expects of every item, against what its sensors observe", [chip("Synthetic", "synthetic")]),
    grid([
      ["Items", `${int(st.world.size())} SKUs from the item master`],
      ["Readings tonight", int(st.scale.readings)],
      ["Corrections", corr.length ? `${int(corr.length)}, for the whole SKU each` : "none yet"]
    ]),
    corr.length ? h("table", { class: "pop-table" },
      h("thead", {}, h("tr", {}, h("th", {}, "Time"), h("th", {}, "SKU"), h("th", {}, "Sensor"), h("th", { class: "r" }, "Old"), h("th", { class: "r" }, "New"))),
      h("tbody", {}, corr.map((c) => h("tr", {}, h("td", {}, clockOf(c.at)), h("td", {}, c.sku), h("td", {}, c.sensor), h("td", { class: "r" }, grams(c.old)), h("td", { class: "r" }, grams(c.new)))))) : null,
    h("p", { class: "pop-note" }, "Every scale reading is checked against the world model; one more than 25 % away writes the observed weight back for the whole SKU, and the grasp is rehearsed again (Assumption)."));
}

function itemName(st, sku) {
  return st.world.name(sku);
}
