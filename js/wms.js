// The agent's read tools on tonight's night (PLAN.md §d.3): the warehouse system (orders, stock, totes,
// the plan), the cell (status, grasp rehearsal) and the world model (items, corrections). Every result
// is computed from the shared night session at the current moment (js/night_session.js), so the agent
// sees exactly what the screen shows and nothing that has not happened yet. Results are compact: the
// agent's context is small and every call counts against the run's 40 model calls. Pure module.

import { clockOf, NOMINAL_P } from "./nightsim.js";
import { manualQueue, rollingSuccess, visibleOrders, callInHours } from "./cell_data.js";
import { POLICY, isFragile } from "./escalation.js";
import { leverText } from "./payoff.js";

const kg = (g) => Math.round(g / 10) / 100;
const STATUS = { open: "open", dispatched: "on its truck", late: "its truck left without it", late_done: "finished after its truck left", moved: "moved to the next day's wave" };
const RULE_NAMES = Object.fromEntries(Object.values(POLICY).map((r) => [r.id, r.name]));

/** The plan's order now: the express order first (the warehouse system's default), then cut-off order, then the decisions. */
export function planOrder(session) {
  const st = session.state();
  const now = session.now();
  const stores = visibleOrders(st).filter((o) => o.kind !== "express").map((o) => o.id);
  let order = [...(st.express_arrived && st.express ? [st.express.order] : []), ...stores];
  for (const l of session.levers().filter((x) => x.type === "resequence" && x.from_ms <= now + 1)) {
    const listed = (l.store_ids || l.order || []).filter((id) => order.includes(id));
    order = [...listed, ...order.filter((id) => !listed.includes(id))];
  }
  const moved = new Set(session.levers().filter((l) => l.type === "move_to_next_wave").flatMap((l) => l.store_ids || []));
  return order.filter((id) => !moved.has(id));
}

/** One order as the warehouse system shows it now, with the projection from js/night_session.js. */
function orderRow(o, proj) {
  const p = proj?.orders.find((x) => x.id === o.id);
  return {
    id: o.id, name: o.name, kind: o.kind, cutoff: o.cutoff, units: o.units, cell_units: o.cell_units, manual_units: o.manual_units,
    packed: o.packed, status: p && p.status !== "open" && o.status === "open" ? p.status : STATUS[o.status] || o.status,
    ...(p && p.projected_last_unit ? { projected_last_unit: p.projected_last_unit, slack_min: p.slack_min, at_risk: p.at_risk } : {})
  };
}

/** The levers in force, in words and with their start (and end). */
export function leversInForce(session) {
  const st = session.state();
  const name = (id) => st.orders.get(id)?.name || id;
  return session.levers().map((l) => ({
    type: l.type, source: l.source === "safety" ? "safety action" : "approved option", ...(l.option_id ? { option_id: l.option_id } : {}),
    what: leverText(l, name), from: clockOf(l.from_ms), ...(typeof l.until_ms === "number" ? { until: clockOf(l.until_ms) } : {})
  }));
}

export function wmsGetNight(session) {
  const st = session.state();
  const now = session.now();
  const info = session.info;
  const proj = session.project();
  const orders = visibleOrders(st).map((o) => orderRow(o, proj));
  const called = session.levers().filter((l) => l.type === "call_in_picker" && l.from_ms <= now + 1 && l.until_ms > now);
  return {
    now: clockOf(now), shift: "22:00 to 06:00", seed: info.seed, volume: info.volume === "n2" ? "peak night (N2)" : "normal night (N1)",
    waves: st.inbound.map((w) => ({ id: w.id, label: w.label, arrives: w.arrives, units: w.units, arrived: !!w.arrived })),
    orders,
    people: { pickers_at_manual_station: 1 + called.length, robot_cells: 1, ...(called.length ? { called_in: called.map((l) => `from ${clockOf(l.from_ms)} to ${clockOf(l.until_ms)}`) } : {}) },
    totals: { units: orders.reduce((n, o) => n + o.units, 0), packed: orders.reduce((n, o) => n + o.packed, 0), at_manual_station_waiting: manualQueue(st) },
    plan: {
      rule: "Cut-off first, ties by route order; the warehouse system puts an express order first unless a decision changes that; heavy items first in each tote.",
      order: planOrder(session),
      levers_in_force: leversInForce(session)
    },
    rates: { picks_per_labour_hour: info.r_m, cell_attempts_per_hour: info.r_c, grasp_success: info.p },
    tote_limit_kg: kg(info.tote_limit_g)
  };
}

export function wmsGetOrder(session, { store_id } = {}) {
  const st = session.state();
  const id = String(store_id || "").trim().toUpperCase();
  const o = st.orders.get(id);
  if (!o || !visibleOrders(st).includes(o)) return { error: `No order "${store_id}" tonight. Orders: ${visibleOrders(st).map((x) => x.id).join(", ")}.` };
  const now = session.now();
  const done = new Map();
  for (const u of session.run.units) if (u.order === id && u.t_done !== null && u.t_done <= now && u.station !== "set_aside") done.set(u.sku, (done.get(u.sku) || 0) + 1);
  const lines = new Map();
  for (const u of session.night.units) {
    if (u.order !== id) continue;
    const l = lines.get(u.sku) || { sku: u.sku, name: session.night.itemsBySku.get(u.sku)?.name, qty: 0, station: u.eligible ? "cell" : "manual", done: done.get(u.sku) || 0 };
    l.qty += 1;
    lines.set(u.sku, l);
  }
  return {
    ...orderRow(o, session.project()),
    lines: [...lines.values()],
    totes: {
      closed: o.totes.length,
      current: o.tote_units ? { tote_no: o.tote_no, units: o.tote_units, weight_kg: kg(o.tote_weight) } : null,
      heaviest_kg: kg(o.heaviest_g), limit_kg: kg(session.info.tote_limit_g)
    }
  };
}

export function wmsGetStock(session, { sku_ids } = {}) {
  const st = session.state();
  const now = session.now();
  const want = Array.isArray(sku_ids) && sku_ids.length ? new Set(sku_ids.map((x) => String(x).trim().toUpperCase())) : null;
  const done = new Set(session.run.units.filter((u) => u.t_done !== null && u.t_done <= now).map((u) => u.id));
  const rows = new Map();
  for (const u of session.night.units) {
    if (!u.order || !u.sku || (want && !want.has(u.sku))) continue;
    if (u.express && session.night.express.at_ms > now) continue;
    const o = st.orders.get(u.order);
    if (!o || o.status === "moved" || o.moving) continue;
    const it = session.night.itemsBySku.get(u.sku);
    const r = rows.get(u.sku) || { sku: u.sku, name: it?.name, wave: it?.wave, arrived: u.avail <= now, to_repack: 0 };
    if (!done.has(u.id)) r.to_repack += 1;
    rows.set(u.sku, r);
  }
  const unknownSku = want ? [...want].filter((x) => !session.night.itemsBySku.has(x)) : [];
  return { now: clockOf(now), skus: [...rows.values()].filter((r) => r.to_repack > 0 || want), ...(unknownSku.length ? { not_in_item_master: unknownSku } : {}) };
}

export function cellGetStatus(session) {
  const st = session.state();
  const rate = rollingSuccess(st);
  const e3 = st.escalations.find((e) => e.rule === "E3");
  const c = st.cell.current;
  return {
    now: clockOf(session.now()),
    attempts: st.cell.attempts, successes: st.cell.successes, failures: st.cell.failures,
    rolling_success_last_100: rate === null ? "fewer than 100 attempts so far" : Math.round(rate * 1000) / 1000,
    gripper: e3 ? "wear suspected: the rolling success fell below the E3 threshold" : "nominal",
    last_grasp: c ? { sku: c.sku, name: session.night.itemsBySku.get(c.sku)?.name, grip: c.grip, expected_success: c.expected_success, grasp_confidence: c.grasp_confidence, ok: c.ok } : null,
    manual_station: { waiting: manualQueue(st), picked: st.manual.picks, set_aside: st.manual.set_aside, routed_from_cell: st.routed || 0 },
    escalations: st.escalations.map((e) => ({
      escalation_id: e.escalation_id, rule: e.rule, rule_name: RULE_NAMES[e.rule], time: clockOf(e.t),
      ...(e.sku ? { sku: e.sku } : {}), ...(e.store ? { store: e.store } : {}), ...(e.unit_id ? { unit: e.unit_id } : {}),
      handed_to: e.to === "manual_station" ? "a person at the manual station" : "a person", reason: e.reason
    })),
    called_in_labour_hours: Math.round(callInHours(st, session.now() + 1) * 100) / 100
  };
}

export function cellGetGraspPlan(session, { sku_id } = {}) {
  const it = session.night.itemsBySku.get(String(sku_id || "").trim().toUpperCase());
  if (!it) return { error: `No item "${sku_id}" in the item master. Items: S01 to S${String(session.night.items.length).padStart(2, "0")}.` };
  const st = session.state();
  const expected = it.cell ? Math.min(0.99, it.success * (session.info.p / NOMINAL_P)) : null;
  const weight = st.world.expected(it.sku);
  const payload = session.night.world.cell?.payload_g ?? 3000;
  const fragile = isFragile(it);
  const routed = session.levers().some((l) => (l.type === "route_to_manual" && ((l.sku_ids || []).includes(it.sku) || (l.fragile_only && fragile))) || (l.type === "manual_for_fragile" && fragile));
  return {
    sku: it.sku, name: it.name, rehearsal: "against the world model, before the next attempt",
    cell_eligible: !!it.cell, grip: it.grip, fragility: it.fragility,
    world_model_g: weight, master_g: it.master_g,
    expected_success: expected === null ? null : Math.round(expected * 100) / 100,
    payload_ok: weight <= payload, payload_limit_g: payload,
    ...(fragile ? { escalation_rule: `E2: a fragile item whose grasp confidence is below ${POLICY.E2.minGraspConfidence.toFixed(2)} goes to a person at the manual station` } : {}),
    ...(it.cell ? {} : { manual_reason: it.manual_reason || "Not handled by the cell" }),
    routed_to_manual: routed
  };
}

/** extra: { provisional: Map barcode → entry } (the run's provisional item-master entries). */
export function worldGetItem(session, { sku_id, barcode } = {}, extra = {}) {
  const st = session.state();
  const items = session.night.itemsBySku;
  const code = barcode === undefined || barcode === null ? "" : String(barcode).trim();
  const it = sku_id ? items.get(String(sku_id).trim().toUpperCase()) : [...items.values()].find((x) => x.barcode === code);
  if (!it) {
    if (code) {
      const seen = st.escalations.some((e) => e.rule === "E1" && e.barcode === code);
      const entry = extra.provisional?.get(code) || null;
      return { barcode: code, known: false, seen_by_camera: seen, provisional_entry: entry, note: "Not in the item master. Its units stay at the manual station until a person confirms an entry." };
    }
    return { error: `No item "${sku_id ?? ""}" in the item master. Give a SKU id (S01 …) or a barcode.` };
  }
  const corr = st.corrections.filter((c) => c.sku === it.sku).map((c) => ({ time: clockOf(c.at), sensor: c.sensor, field: c.field, old: c.old, new: c.new, applies_to: "the whole SKU" }));
  return {
    sku: it.sku, name: it.name, barcode: it.barcode, wave: it.wave, fragility: it.fragility, grip: it.grip, cell_eligible: !!it.cell,
    master_g: it.master_g, world_model_g: st.world.expected(it.sku), last_observed_g: st.world.item(it.sku)?.observed_g ?? null,
    corrections: corr, source: "Synthetic item master"
  };
}

export function worldListCorrections(session) {
  const st = session.state();
  return {
    corrections: st.corrections.map((c) => ({ time: clockOf(c.at), sensor: c.sensor, sku: c.sku, name: session.night.itemsBySku.get(c.sku)?.name, field: c.field, old: c.old, new: c.new, applies_to: "the whole SKU" })),
    tolerance: "A scale reading more than 25 % away from the world model writes the observed weight back for the whole SKU."
  };
}
