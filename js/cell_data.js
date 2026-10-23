// The cell board's view model: a pure reducer over the night's events (js/nightsim.js, played by
// js/night.js). It keeps what the board, the world-model card, the header tiles and the KPI board show:
// each order's units, totes, projection and dispatch; the camera's last detection; the cell's current
// grasp, its attempts and rolling success; the scale's last reading; the manual station's picks and
// queue; the inbound waves; the world model's expected and observed weights and its corrections log;
// the escalations; and tonight's running figures. No DOM.

import { createWorldModel } from "./world_model.js";

export const ROLLING_WINDOW = 100;

/**
 * info: the night as the warehouse system knows it at 22:00 (event "night_plan", js/nightsim.js
 * nightInfo): { seed, scenario_id, orders, waves, items, totals, r_m, r_c, p, t_cell_ms, t_man_ms,
 * tote_limit_g, risk_band_min }. Whatever happens later arrives as an event.
 */
export function createNightState(info) {
  const orders = new Map();
  for (const o of info.orders) orders.set(o.id, newOrder(o));
  // The world model as the board knows it: the item master, then every reading and correction the
  // night reports (the simulation decides them with the same module).
  const world = createWorldModel(info.items);
  return {
    info, t: 0, paused: false, pause_reason: null, ended: false,
    orders, order_ids: info.orders.map((o) => o.id),
    camera: { last: null, detections: 0, unknown: 0, recent: new Map() },
    cell: { attempts: 0, successes: 0, failures: 0, current: null, ring: [], ring_ok: 0, last_ok: null, rehearsal: null },
    scale: { last: null, readings: 0 },
    // Units that reached the manual station: manual-only units with their wave or order, failed
    // grasps, items handed over by E2 and unknown items set aside (E1).
    manual: { picks: 0, by_picker: {}, last: null, arrived: info.waves.filter((w) => w.at_ms <= 0).reduce((n, w) => n + w.manual_units, 0), set_aside: 0 },
    inbound: info.waves.map((w) => ({ ...w, arrived: w.at_ms <= 0 })),
    world, corrections: [], focus: null,
    // Tonight's pallet item by item (the Customer view's tiles): the planned units of each item, and how
    // many the robot picked, how many a person picked and how many grasps failed. An item the model does
    // not know arrives as `unknown` when the camera reads its barcode.
    items: new Map((info.items || []).map((it) => [it.sku, { sku: it.sku, units: it.units ?? 0, robot: 0, hand: 0, failed: 0, attempts: 0 }])),
    unknown: null,
    escalations: [], handed: [], wakes: [], risks: [], projection_t: null, express_arrived: false,
    // The levers in force (decisions and safety actions, from plan_update events) and the pickers
    // called in, whose billed hours count as labour from the moment they start.
    levers: [], call_ins: [],
    dispatched: 0, on_time: 0, late: 0, version: 0
  };
}

function newOrder(o) {
  return {
    id: o.id, name: o.name, kind: o.kind || "store", store: o.store, flagship: !!o.flagship,
    cutoff: o.cutoff, cutoff_ms: o.cutoff_ms, arrives_ms: o.arrives_ms || 0, units: o.units,
    cell_units: o.cell_units, manual_units: o.manual_units,
    visible: true, packed: 0, packed_cell: 0, packed_manual: 0,
    tote_no: 1, tote_units: 0, tote_weight: 0, totes: [], heaviest_g: 0,
    projected_ms: null, slack_min: null, at_risk: false,
    status: "open", on_time: null, done_ms: null, dispatched_ms: null, packed_by_cutoff: null
  };
}

/** Units at the manual station that wait for a picker: arrived minus picked. */
export function manualQueue(st) {
  return Math.max(0, st.manual.arrived - st.manual.picks);
}

/** The cell's grasp success over its last 100 attempts (null before the 100th). */
export function rollingSuccess(st) {
  return st.cell.ring.length >= ROLLING_WINDOW ? st.cell.ring_ok / ROLLING_WINDOW : null;
}

/** Units of the repack orders not yet in a tote (the pallet and the queues). */
export function unitsToRepack(st) {
  let left = 0;
  for (const o of st.orders.values()) if (o.status !== "moved") left += o.units - o.packed;
  return left;
}

/** Orders shown on the board: the twelve stores, and the express order once it has arrived. */
export function visibleOrders(st) {
  return st.order_ids.map((id) => st.orders.get(id));
}

/**
 * The state of an order for its lane and chip: "dispatched" (on its truck in time), "late" (the truck
 * left without it, or it finished after its cut-off), "at-risk" (projected inside the 15-minute band),
 * "done" (all units in totes, truck still to leave), "open".
 */
export function laneState(o) {
  if (o.status === "dispatched") return "dispatched";
  if (o.status === "late" || o.status === "late_done" || o.status === "moved") return "late";
  if (o.at_risk) return "at-risk";
  if (o.packed >= o.units) return "done";
  return "open";
}

/**
 * Hours billed for called-in pickers by time `t` (ms after 22:00): a picker's billed hours (at least the
 * call-in minimum) count in full from the moment the picker starts, as tonight's final figure does.
 */
export function callInHours(st, t = st.t) {
  return st.call_ins.filter((c) => c.from_ms <= t).reduce((sum, c) => sum + (c.until_ms - c.from_ms) / 3600000, 0);
}

/** Tonight's figures so far (the KPI board's Tonight column while the night runs). */
export function tonightSoFar(st) {
  const i = st.info;
  const picks = st.manual.picks;
  const labourH = (st.manual.by_picker.P1 || 0) / i.r_m + callInHours(st);
  let packed = 0;
  for (const o of st.orders.values()) packed += o.packed;
  const cellH = (st.cell.attempts * i.t_cell_ms) / 3600000;
  return {
    t: st.t, units_packed: packed, labour_hours: labourH, called_in_hours: callInHours(st),
    labour_hours_per_1000: packed ? (labourH / packed) * 1000 : null,
    robot_picks_per_cell_hour: cellH ? st.cell.successes / cellH : null,
    cell_hours: cellH, attempts: st.cell.attempts, successes: st.cell.successes, failures: st.cell.failures,
    manual_picks: picks, escalations: st.escalations.length, corrections: st.corrections.length,
    dispatched: st.dispatched, on_time: st.on_time, late: st.late, orders: visibleOrders(st).length
  };
}

/**
 * Applies one event (type, payload, t in ms after 22:00) and returns what changed: a set of names
 * among "clock", "camera", "cell", "scale", "manual", "orders", "world", "escalations", "inbound", "items".
 */
export function applyEvent(st, type, p, t) {
  const dirty = new Set();
  if (typeof t === "number" && t > st.t) { st.t = t; dirty.add("clock"); }
  st.version += 1;
  switch (type) {
    case "detection": {
      st.camera.last = { unit_id: p.unit_id, sku: p.sku, store: p.store, barcode: p.barcode, confidence: p.confidence, known: p.known, t };
      st.camera.detections += 1;
      // The last few detections by unit, so a unit's way through the cell can name its own confidence.
      st.camera.recent.set(p.unit_id, p.confidence);
      if (st.camera.recent.size > 8) st.camera.recent.delete(st.camera.recent.keys().next().value);
      if (!p.known) {
        st.camera.unknown += 1; st.manual.arrived += 1; dirty.add("manual");
        if (!st.unknown) st.unknown = { barcode: p.barcode, seen: 0, hand: 0, t };
        st.unknown.seen += 1;
        dirty.add("items");
      }
      dirty.add("camera");
      break;
    }
    case "grasp_attempt": {
      const c = st.cell;
      c.attempts += 1;
      if (p.ok) c.successes += 1; else c.failures += 1;
      c.ring.push(p.ok ? 1 : 0);
      c.ring_ok += p.ok ? 1 : 0;
      if (c.ring.length > ROLLING_WINDOW) c.ring_ok -= c.ring.shift();
      c.current = { unit_id: p.unit_id, sku: p.sku, store: p.store, grip: p.grip, expected_success: p.expected_success, grasp_confidence: p.grasp_confidence, ok: p.ok, t };
      c.last_ok = p.ok;
      if (!p.ok) { st.manual.arrived += 1; dirty.add("manual"); }
      const it = st.items.get(p.sku);
      if (it) { it.attempts += 1; if (p.ok) it.robot += 1; else it.failed += 1; dirty.add("items"); }
      dirty.add("cell");
      break;
    }
    case "rehearsal": {
      st.cell.rehearsal = { sku: p.sku, grip: p.grip, weight_g: p.weight_g, expected_success: p.expected_success, reason: p.reason, t };
      dirty.add("cell");
      break;
    }
    case "scale_reading": {
      st.scale.last = { unit_id: p.unit_id, sku: p.sku, expected_g: p.expected_g, observed_g: p.observed_g, t };
      st.scale.readings += 1;
      st.world.record(p.sku, p.observed_g);
      // The panel's focus: the latest reading, except that a correction stays two simulated minutes.
      if (st.focus?.kind !== "correction" || t - st.focus.t > 2 * 60000) st.focus = { kind: "reading", sku: p.sku, expected_g: p.expected_g, observed_g: p.observed_g, t };
      dirty.add("scale"); dirty.add("world");
      break;
    }
    case "world_model_correction": {
      st.world.apply(p);
      st.corrections.push({ ...p });
      st.focus = { kind: "correction", sku: p.sku, expected_g: p.old, observed_g: p.new, t };
      dirty.add("world");
      break;
    }
    case "manual_pick": {
      st.manual.picks += 1;
      st.manual.by_picker[p.picker] = (st.manual.by_picker[p.picker] || 0) + 1;
      st.manual.last = { unit_id: p.unit_id, sku: p.sku, store: p.store, reason: p.reason, picker: p.picker, t };
      if (p.set_aside) st.manual.set_aside += 1;
      const it = p.sku ? st.items.get(p.sku) : null;
      if (it) it.hand += 1;
      else if (p.set_aside && st.unknown) st.unknown.hand += 1;
      dirty.add("manual"); dirty.add("items");
      break;
    }
    case "tote_update": {
      const o = st.orders.get(p.store);
      if (!o) break;
      if (p.status === "closed") {
        o.totes.push({ no: p.tote_no, units: p.units, weight_g: p.weight_g, closed_ms: t });
        o.heaviest_g = Math.max(o.heaviest_g, p.weight_g);
      } else {
        o.packed += 1;
        o.tote_no = p.tote_no; o.tote_units = p.units; o.tote_weight = p.weight_g;
        o.heaviest_g = Math.max(o.heaviest_g, p.weight_g);
      }
      dirty.add("orders");
      break;
    }
    case "projection": {
      for (const x of p.orders) {
        const o = st.orders.get(x.id);
        if (!o || o.status !== "open") continue;
        o.projected_ms = x.projected_ms; o.slack_min = x.slack_min; o.at_risk = !!x.at_risk;
      }
      st.projection_t = p.t;
      dirty.add("orders");
      break;
    }
    case "cutoff_risk": {
      st.risks.push(p);
      dirty.add("orders");
      break;
    }
    case "order_new": {
      if (!st.orders.has(p.order)) {
        st.orders.set(p.order, newOrder({ id: p.order, name: p.name, kind: p.kind || "express", store: p.store, flagship: true,
          cutoff: p.cutoff || p.due, cutoff_ms: p.cutoff_ms, arrives_ms: p.arrives_ms ?? t, units: p.units, cell_units: p.cell_units, manual_units: p.manual_units }));
        st.order_ids.push(p.order);
      }
      st.manual.arrived += p.manual_units || 0;
      st.express_arrived = true;
      st.express = { order: p.order, store: p.store, units: p.units, due: p.due, at: t };
      dirty.add("orders"); dirty.add("manual"); dirty.add("inbound");
      break;
    }
    case "dispatch": {
      const o = st.orders.get(p.order);
      if (!o) break;
      o.dispatched_ms = t;
      o.packed_by_cutoff = p.units;
      o.on_time = p.on_time;
      o.status = p.moved ? "moved" : p.on_time ? "dispatched" : "late";
      o.at_risk = false;
      st.dispatched += 1;
      if (p.on_time) st.on_time += 1; else st.late += 1;
      dirty.add("orders");
      break;
    }
    case "late_complete": {
      const o = st.orders.get(p.order);
      if (o) { o.status = "late_done"; o.done_ms = t; }
      dirty.add("orders");
      break;
    }
    case "escalation": {
      st.escalations.push({ ...p });
      if (p.rule === "E2") st.manual.arrived += 1; // the item goes to the manual station (E1 items count at the camera)
      if (p.to === "person" || p.to === "manual_station") st.handed.push({ id: p.escalation_id, rule: p.rule, sku: p.sku ?? null, unit_id: p.unit_id ?? null, reason: p.reason, to: p.to, t });
      dirty.add("escalations"); dirty.add("manual");
      break;
    }
    case "units_routed": {
      // The cell hands units to the manual station (a safety action or an approved option).
      st.manual.arrived += p.units || 0;
      st.routed = (st.routed || 0) + (p.units || 0);
      dirty.add("manual");
      break;
    }
    case "order_moved": {
      // An order moved to the next day's wave: its queued manual work leaves tonight's station.
      st.manual.arrived = Math.max(st.manual.picks, st.manual.arrived - (p.manual_dropped || 0));
      const o = st.orders.get(p.order);
      if (o) o.moving = true;
      dirty.add("manual"); dirty.add("orders");
      break;
    }
    case "wave_arrival": {
      for (const w of st.inbound) {
        if (w.id !== p.wave || w.arrived) continue;
        w.arrived = true;
        st.manual.arrived += w.manual_units;
      }
      dirty.add("inbound"); dirty.add("manual");
      break;
    }
    case "wake": {
      st.wakes.push({ ...p });
      break;
    }
    case "plan_update": {
      // A decision or a safety action changes the plan from the next millisecond (js/night_session.js).
      for (const l of p.levers || []) {
        st.levers.push({ ...l, source: p.source, option_id: p.option_id ?? null });
        if (l.type === "call_in_picker" && typeof l.from_ms === "number" && typeof l.until_ms === "number") st.call_ins.push({ from_ms: l.from_ms, until_ms: l.until_ms });
      }
      // The projection right after the decision, so the lanes show its effect while the night stands
      // still. An order the decision moves to tomorrow's wave keeps its lane until order_moved.
      if (p.projection) {
        const moving = new Set((p.levers || []).filter((l) => l.type === "move_to_next_wave").flatMap((l) => l.store_ids || []));
        for (const x of p.projection.orders || []) {
          const o = st.orders.get(x.id);
          if (!o || o.status !== "open" || moving.has(x.id)) continue;
          o.projected_ms = x.projected_ms; o.slack_min = x.slack_min; o.at_risk = !!x.at_risk;
        }
        st.projection_t = p.projection.t;
      }
      dirty.add("orders"); dirty.add("manual");
      break;
    }
    case "clock": {
      st.paused = !!p.paused; st.pause_reason = p.reason || null;
      dirty.add("clock");
      break;
    }
    case "night_end": {
      st.ended = true;
      dirty.add("clock"); dirty.add("orders");
      break;
    }
    default:
      break;
  }
  return dirty;
}
