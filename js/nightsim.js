// The night simulation: a pure, seeded discrete-event simulation of one night shift at Ruhrkorb DC
// Unna (PLAN.md §c.6). Inputs: the synthetic world, a scenario's night (volume, express order,
// anomalies, gripper wear, cut-off changes), the presenter's rates, a seed and the levers in force.
// Outputs: an ordered event list, the unit log, each order's completion, the wake-ups and a hash of
// the night. No randomness outside js/rng.js, no clock, no DOM: Node and every browser compute the
// same night to the millisecond.
//
// Time is whole milliseconds after 22:00. The cell takes 3,600,000 / r_c ms per grasp attempt (7,200
// at 500 an hour), a picker 3,600,000 / r_m ms per pick (9,000 at 400 an hour). Each station takes the
// available unit with the highest priority: the plan's order (cut-off first, ties by route order; an
// express order first, the warehouse system's default), heavy items first within an order, then SKU
// and unit number. Units of a wave are available from its arrival.
//
// A cell-eligible unit is detected by the camera, checked against the world model, rehearsed (grip,
// expected success, grasp confidence), checked against the escalation rules and attempted. A success
// goes onto the scale and into its store's tote; a failure goes to the manual station at the time it
// failed, with no further penalty (brief, model rules). A scale reading more than 25 % away from the
// world model's weight writes the observed weight back for the whole SKU and the SKU is rehearsed
// again (js/world_model.js). Totes close before a unit would take them over the 15 kg limit.

import { draw, hash64 } from "./rng.js";
import { POLICY, RollingSuccess, isFragile, isFragileLowConfidence, cutoffRisks } from "./escalation.js";
import { createWorldModel, WEIGHT_TOLERANCE } from "./world_model.js";

export const MINUTE = 60000;
export const SHIFT_MS = 8 * 60 * MINUTE;
export const NOMINAL_P = 0.91;               // the success rate the item master's per-SKU rates average to
export { WEIGHT_TOLERANCE };                  // Assumption: a scale reading further off writes back (js/world_model.js)
export const RISK_CHECK_EVERY = 15 * MINUTE;  // how often the projection is refreshed between events
export const NIGHT_DEFAULTS = Object.freeze({ r_m: 400, r_c: 500, p: NOMINAL_P, callin_min_h: 3 });

const FRAGILITY_CONFIDENCE = { low: 0.95, medium: 0.92, high: 0.89, "very high": 0.86 };

/** Milliseconds after 22:00 for a clock time on the night shift ("01:35" → 12,900,000). */
export function msOf(clock) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(clock ?? ""));
  if (!m) throw new Error(`Not a clock time: ${clock}`);
  const minutes = (Number(m[1]) * 60 + Number(m[2]) - 22 * 60 + 1440) % 1440;
  return minutes * MINUTE;
}

/** Clock time for milliseconds after 22:00, to the minute below ("01:35"). */
export function clockOf(ms) {
  const minutes = Math.floor(ms / MINUTE);
  const t = ((minutes + 22 * 60) % 1440 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * A completion time against a cut-off, "HH:MM" rounded up to the minute: a last unit at 02:40:30 is
 * done "by 02:41", so it reads late against a 02:40 truck, and the minutes to spare (floored) match
 * the two clock times shown.
 */
export function clockUp(ms) {
  return clockOf(Math.ceil(ms / MINUTE) * MINUTE);
}

// ---- a small binary heap ---------------------------------------------------------------------------
class Heap {
  constructor(cmp) { this.cmp = cmp; this.a = []; }
  get size() { return this.a.length; }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
  drain() { const out = this.a; this.a = []; return out; }
  rebuild(cmp) { const items = this.drain(); this.cmp = cmp || this.cmp; for (const x of items) this.push(x); }
}

/**
 * Builds tonight from the world and a scenario's night: the orders (twelve stores and an express
 * order when there is one), every unit with its arrival, and the rates in force.
 * spec: { volume: "n1" | "n2", seed, express: { at, store, units, due }, unsafe: [{ unit, grasp_confidence,
 * reason }], unknown: { barcode, units, at }, wear: { from, success }, cutoffs: { STORE: "HH:MM" },
 * manual_only (every unit by hand: the manual baseline of the calibration) }
 * params: { r_m, r_c, p, callin_min_h } (the presenter's assumptions; defaults NIGHT_DEFAULTS)
 */
export function buildNight(world, spec = {}, params = {}) {
  const P = { ...NIGHT_DEFAULTS, ...params };
  if (!(P.r_c > 0) || !(P.r_m > 0) || !(P.p > 0) || P.p > 1) throw new Error("Rates must be positive and p at most 1.");
  if (!(P.callin_min_h >= 0)) throw new Error("The call-in minimum must be zero or more hours.");
  const T_CELL = Math.round(3600000 / P.r_c);
  const T_MAN = Math.round(3600000 / P.r_m);
  const volume = spec.volume || "n1";
  const alloc = world.allocation?.[volume];
  if (!alloc) throw new Error(`No allocation for ${volume}.`);

  const items = world.items.map((it, index) => ({ ...it, index, fragile: isFragile(it) }));
  const itemsBySku = new Map(items.map((it) => [it.sku, it]));
  const waveAt = new Map(world.waves.map((w) => [w.id, msOf(w.arrives)]));
  const known = new Set(items.map((it) => it.barcode));

  // Orders in plan order: cut-off first, ties by route order (plan_rank). Scenario 5 moves a cut-off.
  const cutoffOverrides = spec.cutoffs || {};
  const orders = world.stores.map((s) => ({
    id: s.id, store: s.id, name: s.name, kind: "store", flagship: !!s.flagship,
    cutoff: cutoffOverrides[s.id] || s.cutoff, cutoff_ms: msOf(cutoffOverrides[s.id] || s.cutoff),
    plan_rank: s.plan_rank, arrives_ms: 0, units: 0
  }));
  orders.sort((a, b) => a.cutoff_ms - b.cutoff_ms || a.plan_rank - b.plan_rank);

  const units = [];
  const add = (u) => { units.push(u); return u; };
  const unitFields = (it) => ({
    sku: it.sku, skuIndex: it.index, eligible: !!it.cell && !spec.manual_only, master_g: it.master_g, actual_g: it.actual_g,
    fragility: it.fragility, fragile: it.fragile, grip: it.grip, p_base: it.success, barcode: it.barcode
  });
  for (const s of world.stores) {
    const row = alloc[s.id];
    for (const it of items) {
      const count = row?.[it.sku] || 0;
      for (let n = 0; n < count; n++) add({ id: `${s.id}:${it.sku}:${n}`, order: s.id, n, avail: waveAt.get(it.wave) ?? 0, ...unitFields(it) });
    }
  }
  for (const o of orders) o.units = units.filter((u) => u.order === o.id).length;

  // The express order: the flagship's mix, in proportion to its order tonight (Phase 0 model), or with
  // `mix: "<wave>"` the flagship's mix of that wave only (a chilled top-up, say).
  let express = null;
  if (spec.express) {
    const flag = world.stores.find((s) => s.id === spec.express.store);
    if (!flag) throw new Error(`Express order for an unknown store: ${spec.express.store}.`);
    const mixWave = spec.express.mix && spec.express.mix !== "all" ? spec.express.mix : null;
    if (mixWave && !world.waves.some((w) => w.id === mixWave)) throw new Error(`Express mix for an unknown wave: ${mixWave}.`);
    const row = Object.fromEntries(Object.entries(alloc[flag.id]).filter(([sku]) => !mixWave || itemsBySku.get(sku)?.wave === mixWave));
    const total = items.reduce((sum, it) => sum + (row[it.sku] || 0), 0);
    const per = items.map((it) => Math.floor(((row[it.sku] || 0) / total) * spec.express.units));
    let rem = spec.express.units - per.reduce((a, b) => a + b, 0);
    for (let j = 0; rem > 0; j = (j + 1) % per.length) if ((row[items[j].sku] || 0) > 0) { per[j] += 1; rem -= 1; }
    const at = msOf(spec.express.at);
    express = { id: "XPR", store: flag.id, at_ms: at, due_ms: msOf(spec.express.due), units: spec.express.units };
    orders.push({ id: "XPR", store: flag.id, name: `${flag.name} express`, kind: "express", flagship: true, cutoff: spec.express.due, cutoff_ms: express.due_ms, plan_rank: -1, arrives_ms: at, units: spec.express.units });
    items.forEach((it, j) => { for (let n = 0; n < per[j]; n++) add({ id: `X:${it.sku}:${n}`, order: "XPR", n, avail: Math.max(at, waveAt.get(it.wave) ?? 0), express: true, ...unitFields(it) }); });
  }

  // An item the master does not know (scenario 3): on the infeed from its arrival, in no order.
  let unknown = null;
  if (spec.unknown) {
    const at = msOf(spec.unknown.at);
    unknown = { barcode: spec.unknown.barcode, at_ms: at, units: spec.unknown.units, known: known.has(spec.unknown.barcode) };
    for (let n = 0; n < spec.unknown.units; n++) {
      add({ id: `U:${spec.unknown.barcode}:${n}`, order: null, n, avail: at, unknown: true, sku: null, skuIndex: -1, eligible: true,
        master_g: null, actual_g: null, fragility: null, fragile: false, grip: null, p_base: null, barcode: spec.unknown.barcode });
    }
  }

  const unsafe = new Map((spec.unsafe || []).map((x) => [x.unit, { grasp_confidence: x.grasp_confidence, reason: x.reason }]));
  for (const id of unsafe.keys()) if (!units.some((u) => u.id === id)) throw new Error(`Unsafe unit ${id} is not in tonight's orders.`);
  const wear = spec.wear ? { from_ms: msOf(spec.wear.from), factor: spec.wear.success / NOMINAL_P, success: spec.wear.success } : null;

  return {
    world, spec, P, T_CELL, T_MAN, volume, items, itemsBySku, known, orders,
    ordersById: new Map(orders.map((o) => [o.id, o])), units, express, unknown, unsafe, wear,
    toteLimit: world.tote?.limit_g ?? 15000, seed: spec.seed ?? 1, shift_end_ms: SHIFT_MS
  };
}

/**
 * Every lever the night knows: the option levers of PLAN.md §c.7, and the agent's two safety actions,
 * route_to_manual (the remaining units of some SKUs, or of every fragile SKU, go to the manual station)
 * and close_tote (a store's current tote closes early and the next unit opens a new one).
 */
export const NIGHT_LEVERS = Object.freeze(["resequence", "call_in_picker", "split_order", "move_to_next_wave", "maintenance_stop", "manual_for_fragile", "route_to_manual", "close_tote"]);

/**
 * Until when a lever with a duration acts, from its start: a called-in picker stays at least the
 * call-in minimum the costing bills (minMinutes; 3 hours by default, input callin_min_h), longer if its
 * minutes say so; a maintenance stop lasts its minutes (30 by default). Other levers act until the
 * night ends (null).
 */
export function leverUntil(l, fromMs, minMinutes = NIGHT_DEFAULTS.callin_min_h * 60) {
  if (l.type === "call_in_picker") return fromMs + Math.round(Math.max(minMinutes, l.minutes || 0) * MINUTE);
  if (l.type === "maintenance_stop") return fromMs + Math.max(1, l.minutes || 30) * MINUTE;
  return null;
}

/**
 * Normalises levers to milliseconds and validates them. A lever acts from `from_ms` (or its clock time
 * `start`), but never before `decided_ms`, the moment it was decided: a decision taken at a wake-up
 * acts from the next millisecond, so nothing the night has already shown can change (TECH_NOTES D33).
 */
function prepareLevers(night, levers = []) {
  return levers.map((l, i) => {
    const decided = l.decided_ms ?? 0;
    const from = Math.max(l.from_ms ?? (l.start ? msOf(l.start) : 0), decided);
    const x = { ...l, i, from_ms: from, decided_ms: decided };
    const until = leverUntil(l, from, (night.P?.callin_min_h ?? NIGHT_DEFAULTS.callin_min_h) * 60);
    if (until !== null) x.until_ms = until;
    if (l.type === "split_order" && !(l.share > 0 && l.share <= 1)) throw new Error("split_order needs a share in (0, 1].");
    if (l.type === "route_to_manual" && !(l.fragile_only || (Array.isArray(l.sku_ids) && l.sku_ids.length))) throw new Error("route_to_manual needs sku_ids or fragile_only.");
    if (l.type === "close_tote" && !(Array.isArray(l.store_ids) && l.store_ids.length)) throw new Error("close_tote needs store_ids.");
    if (!NIGHT_LEVERS.includes(l.type)) throw new Error(`Unknown lever: ${l.type}`);
    return x;
  }).sort((a, b) => a.from_ms - b.from_ms || a.i - b.i);
}

/**
 * Simulates the night once. opts: { seed, levers, expectedFrom (ms; attempts from then on count with
 * expected outcomes, for the projection), events (default true) }.
 * Returns { events, units (log), orders, stats, corrections, escalations, end_ms }.
 */
export function simulate(night, opts = {}) {
  const seed = opts.seed ?? night.seed;
  const expectedFrom = opts.expectedFrom ?? Infinity;
  const wantEvents = opts.events !== false && expectedFrom === Infinity;
  const levers = prepareLevers(night, opts.levers);
  const { T_CELL, T_MAN, P, itemsBySku, ordersById } = night;
  const pScale = P.p / NOMINAL_P;

  const events = [];
  let seq = 0;
  const emit = (t, type, payload) => { if (wantEvents) events.push({ t, seq: seq++, type, payload }); };

  // World model: the weight the cell expects per SKU (corrections apply to the whole SKU).
  const world = createWorldModel(night.items);
  const corrections = [];
  const escalations = [];
  let escSeq = 0;
  const escalate = (t, rule, fields) => {
    const e = { escalation_id: `ESC-${++escSeq}`, rule, t, ...fields };
    escalations.push(e);
    emit(t, "escalation", e);
    return e;
  };

  // Plan: rank of each order. Express first by default (B7); unknown units first at the camera.
  const baseRank = new Map();
  night.orders.filter((o) => o.kind === "store").forEach((o, i) => baseRank.set(o.id, i));
  if (night.express) baseRank.set("XPR", -1);
  let rank = new Map(baseRank);
  const rankOf = (u) => (u.unknown ? -2 : rank.get(u.order) ?? 99);
  const cmp = (a, b) => rankOf(a) - rankOf(b)
    || (world.expected(b.sku) ?? 0) - (world.expected(a.sku) ?? 0)
    || a.skuIndex - b.skuIndex
    || a.n - b.n
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const state = new Map();     // unit id → log row
  const row = (u) => {
    let r = state.get(u.id);
    if (!r) { r = { id: u.id, order: u.order, sku: u.sku, station: null, path: null, t_detect: null, t_attempt: null, t_done: null, tote: null, ok: null }; state.set(u.id, r); }
    return r;
  };
  const moved = new Set();                 // orders moved to the next day's wave (lever)
  const manualArrivals = [];               // { u, t, reason, frac? }
  const packs = [];                        // { t, u, station, frac? }

  // ---- levers that act on the plan or the cell ----------------------------------------------------
  const cellLevers = levers.filter((l) => ["resequence", "split_order", "move_to_next_wave", "maintenance_stop", "manual_for_fragile", "route_to_manual"].includes(l.type));
  let wearActive = !!night.wear;
  let wearRestoredAt = Infinity;

  // ---- the cell --------------------------------------------------------------------------------------
  const cellUnits = night.units.filter((u) => u.eligible).sort((a, b) => a.avail - b.avail);
  const projecting = expectedFrom !== Infinity;
  // A projection knows only what the warehouse system knows at its time: no express order before it
  // arrives, no unknown item before the camera has seen it, no unsafe unit before it is detected.
  const visible = (u) => !projecting || !((u.express && night.express.at_ms > expectedFrom) || (u.unknown && night.unknown.at_ms > expectedFrom));
  const waiting = cellUnits.filter(visible);
  let wi = 0;
  const heap = new Heap(cmp);
  let t = 0;
  let li = 0;
  let stopUntil = -1;
  const rolling = new RollingSuccess();
  let e3Fired = false;
  let e3At = Infinity;
  let attempts = 0, successes = 0, failures = 0;
  let expAttempts = 0;
  const firstUnknown = new Set();

  const removeFromCell = (pred, at, reason) => {
    const keep = [];
    let moved = 0;
    const skus = new Set();
    for (const u of heap.drain()) {
      if (pred(u)) { manualArrivals.push({ u, t: at, reason }); moved += 1; skus.add(u.sku); } else keep.push(u);
    }
    for (const u of keep) heap.push(u);
    // units not yet arrived
    for (let k = wi; k < waiting.length; k++) if (waiting[k] && pred(waiting[k])) { manualArrivals.push({ u: waiting[k], t: Math.max(at, waiting[k].avail), reason }); skus.add(waiting[k].sku); moved += 1; waiting[k] = null; }
    // The manual station's queue grows by the units the cell hands over (the board counts them).
    if (moved) emit(at, "units_routed", { reason, units: moved, skus: [...skus].sort() });
  };
  const dropFromCell = (pred) => {
    const keep = [];
    for (const u of heap.drain()) (pred(u) ? null : keep.push(u));
    for (const u of keep) heap.push(u);
    for (let k = wi; k < waiting.length; k++) if (waiting[k] && pred(waiting[k])) waiting[k] = null;
  };

  const applyLever = (l, at) => {
    if (l.type === "resequence") {
      const listed = (l.order || l.store_ids || []).filter((id) => baseRank.has(id) || id === "XPR");
      const rest = [...rank.entries()].filter(([id]) => !listed.includes(id)).sort((a, b) => a[1] - b[1]).map(([id]) => id);
      rank = new Map([...listed, ...rest].map((id, i) => [id, i]));
      heap.rebuild();
    } else if (l.type === "split_order") {
      const ids = new Set(l.store_ids || []);
      const candidates = [...heap.a, ...waiting.slice(wi).filter(Boolean)].filter((u) => ids.has(u.order)).sort(cmp);
      const pick = new Set();
      candidates.forEach((u, i) => { if (Math.floor((i + 1) * l.share) > Math.floor(i * l.share)) pick.add(u.id); });
      removeFromCell((u) => pick.has(u.id), at, "split");
    } else if (l.type === "manual_for_fragile") {
      removeFromCell((u) => !u.unknown && u.fragile, at, "fragile");
    } else if (l.type === "route_to_manual") {
      const skus = new Set(l.sku_ids || []);
      removeFromCell((u) => !u.unknown && (skus.has(u.sku) || (!!l.fragile_only && u.fragile)), at, "routed");
    } else if (l.type === "move_to_next_wave") {
      for (const id of l.store_ids || []) moved.add(id);
      dropFromCell((u) => moved.has(u.order));
    } else if (l.type === "maintenance_stop") {
      stopUntil = Math.max(stopUntil, l.until_ms);
      wearRestoredAt = Math.min(wearRestoredAt, l.until_ms);
    }
  };

  const nominalRate = (u) => Math.min(0.99, u.p_base * pScale);
  const successRate = (u, at) => {
    let p = nominalRate(u);
    if (wearActive && night.wear && at >= night.wear.from_ms && at < wearRestoredAt) p *= night.wear.factor;
    return p;
  };

  for (;;) {
    while (li < cellLevers.length && cellLevers[li].from_ms <= t) applyLever(cellLevers[li++], t);
    if (t < stopUntil) { t = stopUntil; continue; }
    while (wi < waiting.length && (waiting[wi] === null || waiting[wi].avail <= t)) { if (waiting[wi]) heap.push(waiting[wi]); wi += 1; }
    if (heap.size === 0) {
      const nextArrival = waiting.slice(wi).find(Boolean)?.avail ?? Infinity;
      const nextLever = li < cellLevers.length ? cellLevers[li].from_ms : Infinity;
      const next = Math.min(nextArrival, nextLever);
      if (next === Infinity) break;
      t = Math.max(t, next);
      continue;
    }
    const u = heap.pop();
    const r = row(u);
    r.t_detect = t;
    if (u.unknown) {
      // E1: the camera reads a barcode the item master does not know.
      const cam = round2(0.93 + 0.06 * draw(seed, u.id, "cam"));
      emit(t, "detection", { unit_id: u.id, sku: null, store: null, barcode: u.barcode, confidence: cam, known: false });
      if (!firstUnknown.has(u.barcode)) {
        firstUnknown.add(u.barcode);
        if (!projecting || t < expectedFrom) escalate(t, "E1", { unit_id: u.id, barcode: u.barcode, reason: `Barcode ${u.barcode} is not in the item master`, to: "person", needs_confirmation: true, units: night.unknown?.units ?? 1 });
      }
      r.path = "E1"; r.station = "set_aside";
      manualArrivals.push({ u, t, reason: "E1" });
      continue;
    }
    const it = itemsBySku.get(u.sku);
    const anomaly = night.unsafe.get(u.id);
    const known = !projecting || t < expectedFrom;
    const graspConfidence = anomaly && known ? anomaly.grasp_confidence : round2(FRAGILITY_CONFIDENCE[u.fragility] - 0.04 + 0.08 * draw(seed, u.id, "conf"));
    const cam = round2(0.93 + 0.06 * draw(seed, u.id, "cam"));
    emit(t, "detection", { unit_id: u.id, sku: u.sku, store: u.order, barcode: u.barcode, confidence: cam, known: true });
    if (isFragileLowConfidence(it, graspConfidence)) {
      // E2: a fragile item the rehearsal does not trust goes to a person at the manual station.
      escalate(t, "E2", { unit_id: u.id, sku: u.sku, store: u.order, grasp_confidence: graspConfidence, reason: anomaly?.reason ? `${anomaly.reason}: grasp confidence ${graspConfidence.toFixed(2)} below 0.80` : `Grasp confidence ${graspConfidence.toFixed(2)} below 0.80 on a fragile item`, to: "manual_station", needs_confirmation: false });
      r.path = "E2";
      manualArrivals.push({ u, t, reason: "E2" });
      continue;
    }
    const future = projecting && t >= expectedFrom;
    // A projection uses the nominal rates unless the cell's measured decline (E3) is already known.
    const p = future && !(e3At < expectedFrom) ? nominalRate(u) : successRate(u, t);
    const te = t + T_CELL;
    attempts += 1;
    r.t_attempt = t;
    if (future) {
      // Expected outcome: the unit is in its tote with probability p; the rest is manual work.
      expAttempts += 1;
      packs.push({ t: te, u, station: "cell", frac: p });
      const rest = Math.round((1 - p) * T_MAN);
      if (rest > 0) manualArrivals.push({ u, t: te, reason: "expected", dur: rest });
      t = te;
      continue;
    }
    const ok = draw(seed, u.id) < p;
    emit(te, "grasp_attempt", { unit_id: u.id, sku: u.sku, store: u.order, grip: u.grip, expected_success: round2(p), grasp_confidence: graspConfidence, ok, ...(ok ? {} : { reason: "Grasp failed: to the manual station" }) });
    const rate = rolling.push(ok);
    if (!e3Fired && rolling.fires()) {
      e3Fired = true;
      e3At = te;
      escalate(te, "E3", { reason: `Rolling grasp success over the last 100 attempts at ${Math.round(rate * 100)} %, below 75 %`, rolling_success: rate, to: "person", needs_confirmation: false });
    }
    if (ok) {
      successes += 1;
      r.station = "cell"; r.path = "cell"; r.ok = true;
      const expected = world.expected(u.sku);
      emit(te, "scale_reading", { unit_id: u.id, sku: u.sku, expected_g: expected, observed_g: u.actual_g });
      const c = world.observe(u.sku, u.actual_g, te, { unit_id: u.id });
      if (c) {
        corrections.push(c);
        emit(te, "world_model_correction", c);
        emit(te, "rehearsal", { sku: u.sku, grip: u.grip, weight_g: u.actual_g, expected_success: round2(p), reason: "World-model correction: the grasp is rehearsed again with the observed weight" });
        heap.rebuild();
      }
      packs.push({ t: te, u, station: "cell" });
    } else {
      failures += 1;
      r.path = "cell_fail"; r.ok = false;
      manualArrivals.push({ u, t: te, reason: "failed" });
    }
    t = te;
  }
  const cellEnd = t;

  // ---- the manual station ------------------------------------------------------------------------------
  for (const u of night.units) if (!u.eligible && visible(u)) manualArrivals.push({ u, t: u.avail, reason: "manual" });
  const callIns = levers.filter((l) => l.type === "call_in_picker");
  const pickers = [{ id: "P1", start: 0, end: Infinity, free: 0, picks: 0, last: 0 }, ...callIns.map((l, i) => ({ id: `P${i + 2}`, start: l.from_ms, end: l.until_ms, free: l.from_ms, picks: 0, last: l.from_ms, billed: l.until_ms - l.from_ms }))];
  const manualLevers = levers.filter((l) => l.type === "resequence" || l.type === "move_to_next_wave");
  let mli = 0;
  // The manual queue follows the plan as it stood at each moment: replay resequence and moves by time.
  rank = new Map(baseRank);
  const arrivals = manualArrivals.sort((a, b) => a.t - b.t || cmp(a.u, b.u));
  let ai = 0;
  const mheap = new Heap((a, b) => cmp(a.u, b.u));
  const movedManual = new Set();
  const isMovedWork = (a) => !!a.u.order && movedManual.has(a.u.order);
  let manualPicks = 0;
  for (;;) {
    // the picker who can start next
    let k = -1, when = Infinity;
    for (let i = 0; i < pickers.length; i++) {
      const pk = pickers[i];
      const at = Math.max(pk.free, pk.start);
      if (at >= pk.end) continue;
      if (at < when) { when = at; k = i; }
    }
    if (k < 0) break;
    const pk = pickers[k];
    while (mli < manualLevers.length && manualLevers[mli].from_ms <= when) {
      const l = manualLevers[mli++];
      if (l.type === "resequence") {
        const listed = (l.order || l.store_ids || []).filter((id) => baseRank.has(id) || id === "XPR");
        const rest = [...rank.entries()].filter(([id]) => !listed.includes(id)).sort((a, b) => a[1] - b[1]).map(([id]) => id);
        rank = new Map([...listed, ...rest].map((id, i) => [id, i]));
        mheap.rebuild();
      } else {
        // Work of an order moved to the next day's wave leaves tonight's queue.
        for (const id of l.store_ids || []) movedManual.add(id);
        const all = mheap.drain();
        const keep = all.filter((a) => !isMovedWork(a));
        for (const a of keep) mheap.push(a);
        for (const id of l.store_ids || []) emit(l.from_ms, "order_moved", { order: id, store: id, manual_dropped: all.filter((a) => a.u.order === id && a.reason !== "expected").length });
      }
    }
    while (ai < arrivals.length && arrivals[ai].t <= when) { const a = arrivals[ai++]; if (!isMovedWork(a)) mheap.push(a); }
    if (mheap.size === 0) {
      if (ai >= arrivals.length) break;
      pk.free = Math.max(pk.free, arrivals[ai].t);
      if (pk.free >= pk.end) pk.free = pk.end;
      continue;
    }
    const a = mheap.pop();
    const dur = a.dur ?? T_MAN;
    const te = when + dur;
    pk.free = te; pk.last = te;
    if (a.reason === "expected") { packs.push({ t: te, u: a.u, station: "manual", frac: 0 }); continue; }
    pk.picks += 1;
    manualPicks += 1;
    const r = row(a.u);
    r.t_done = te;
    if (a.u.unknown) {
      r.station = "set_aside";
      emit(te, "manual_pick", { unit_id: a.u.id, sku: null, store: null, picker: pk.id, reason: "E1", set_aside: true });
      continue;
    }
    r.station = "manual";
    if (!r.path) r.path = a.reason === "manual" ? "manual" : a.reason;
    emit(te, "manual_pick", { unit_id: a.u.id, sku: a.u.sku, store: a.u.order, picker: pk.id, reason: a.reason });
    packs.push({ t: te, u: a.u, station: "manual" });
  }

  // ---- totes and orders -------------------------------------------------------------------------------------
  packs.sort((a, b) => a.t - b.t || (a.station === b.station ? cmp(a.u, b.u) : a.station === "cell" ? -1 : 1));
  const totes = new Map(night.orders.map((o) => [o.id, { no: 1, units: 0, weight: 0, closed: 0 }]));
  // close_tote: the store's tote in use when the lever acts closes before the next unit goes in.
  const closeAt = new Map();
  for (const l of levers.filter((x) => x.type === "close_tote")) for (const id of l.store_ids) if (totes.has(id)) (closeAt.get(id) || closeAt.set(id, []).get(id)).push(l.from_ms);
  for (const list of closeAt.values()) list.sort((a, b) => a - b);
  const done = new Map(night.orders.map((o) => [o.id, 0]));
  const packedBy = new Map(night.orders.map((o) => [o.id, []]));
  let maxTote = 0;
  for (const p of packs) {
    const o = p.u.order;
    if (!o) continue;
    if (p.frac === undefined) {
      const tt = totes.get(o);
      const due = closeAt.get(o);
      if (due && due.length && due[0] <= p.t) {
        while (due.length && due[0] <= p.t) due.shift();
        if (tt.units > 0) {
          emit(p.t, "tote_update", { store: o, tote_no: tt.no, units: tt.units, weight_g: tt.weight, status: "closed", reason: "rebalanced" });
          tt.closed += 1; tt.no += 1; tt.units = 0; tt.weight = 0;
        }
      }
      if (tt.units > 0 && tt.weight + p.u.actual_g > night.toteLimit) {
        emit(p.t, "tote_update", { store: o, tote_no: tt.no, units: tt.units, weight_g: tt.weight, status: "closed" });
        tt.closed += 1; tt.no += 1; tt.units = 0; tt.weight = 0;
      }
      tt.units += 1; tt.weight += p.u.actual_g;
      maxTote = Math.max(maxTote, tt.weight);
      const r = row(p.u);
      r.tote = tt.no;
      if (p.station === "cell") r.t_done = p.t;
      emit(p.t, "tote_update", { store: o, tote_no: tt.no, units: tt.units, weight_g: tt.weight, status: "filling", unit_id: p.u.id });
    }
    done.set(o, Math.max(done.get(o), p.t));
    packedBy.get(o).push(p.t);
  }
  const orders = night.orders.map((o) => {
    const d = done.get(o.id);
    const isMoved = moved.has(o.id);
    const onTime = !isMoved && d <= o.cutoff_ms;
    const packedByCutoff = packedBy.get(o.id).filter((x) => x <= o.cutoff_ms).length;
    return { id: o.id, store: o.store, name: o.name, kind: o.kind, cutoff: o.cutoff, cutoff_ms: o.cutoff_ms, units: o.units, done_ms: d, on_time: onTime, moved: isMoved, slack_ms: o.cutoff_ms - d, packed_by_cutoff: packedByCutoff, totes: totes.get(o.id).closed + (totes.get(o.id).units > 0 ? 1 : 0) };
  });
  for (const o of orders) {
    emit(o.cutoff_ms, "dispatch", { store: o.id, order: o.id, t: o.cutoff_ms, on_time: o.on_time, units: o.packed_by_cutoff, of: o.units, moved: o.moved });
    if (!o.on_time && !o.moved && o.done_ms > o.cutoff_ms) emit(o.done_ms, "late_complete", { store: o.id, order: o.id, t: o.done_ms, units: o.units });
  }
  const basePicker = pickers[0];
  const callInBilledMs = pickers.slice(1).reduce((s, pk) => s + pk.billed, 0);
  const end = Math.max(SHIFT_MS, ...orders.map((o) => (o.moved ? 0 : o.done_ms)), ...orders.map((o) => o.cutoff_ms));
  // The night's other moments: a wave reaching the infeed, an order arriving (before the units they bring).
  for (const w of night.world.waves) { const at = msOf(w.arrives); if (at > 0 && wantEvents) events.push({ t: at, seq: -3, type: "wave_arrival", payload: { wave: w.id, label: w.label, units: night.units.filter((u) => u.order && !u.express && night.itemsBySku.get(u.sku)?.wave === w.id).length } }); }
  if (night.express && wantEvents) {
    const xo = night.orders.find((o) => o.id === "XPR");
    const xu = night.units.filter((u) => u.order === "XPR");
    events.push({ t: night.express.at_ms, seq: -3, type: "order_new", payload: {
      order: "XPR", store: night.express.store, name: xo?.name || `${night.express.store} express`, kind: "express",
      units: night.express.units, cell_units: xu.filter((u) => u.eligible).length, manual_units: xu.filter((u) => !u.eligible).length,
      due: clockOf(night.express.due_ms), cutoff: clockOf(night.express.due_ms), cutoff_ms: night.express.due_ms, arrives_ms: night.express.at_ms
    } });
  }
  events.sort((a, b) => a.t - b.t || a.seq - b.seq);

  return {
    seed, events, orders, corrections, escalations,
    units: [...state.values()],
    stats: {
      attempts, successes, failures, expected_attempts: expAttempts, manual_picks: manualPicks,
      base_picker_picks: basePicker.picks, call_in_picks: pickers.slice(1).reduce((s, pk) => s + pk.picks, 0),
      cell_busy_ms: (attempts) * T_CELL, cell_end_ms: cellEnd, manual_busy_ms: manualPicks * T_MAN,
      call_in_billed_ms: callInBilledMs, max_tote_g: maxTote,
      units_total: night.units.length, units_repacked: night.units.filter((u) => u.order && !moved.has(u.order)).length,
      set_aside: night.units.filter((u) => u.unknown).length, e3_at_ms: e3Fired ? e3At : null
    },
    end_ms: end
  };
}

/** Sort key of a wake-up among the events of its moment: after all of them (night end: after everything). */
const WAKE_SEQ = 1e9;

/** Projected last unit per order from time `atMs`, with expected outcomes from then on (Map id → ms). */
export function projectAt(night, atMs, { seed, levers } = {}) {
  const res = simulate(night, { seed, levers, expectedFrom: atMs, events: false });
  return new Map(res.orders.map((o) => [o.id, o.done_ms]));
}

/**
 * The full night: one simulation plus the wake-ups (night start, corrections, escalations, a new order,
 * cut-off risks, night end; wake-ups in the same simulated minute merge) and the cut-off-risk events,
 * from projections refreshed at night start, at every event that changes the night, right after every
 * decision and every 15 minutes. Returns the simulation result with `wakeups`, `risks` and `hash`.
 */
export function runNight(night, { seed, levers = [], closedAt = [] } = {}) {
  const s = seed ?? night.seed;
  const res = simulate(night, { seed: s, levers });
  // A projection at time `at` knows only the decisions taken by then (D33).
  const knownAt = (at) => levers.filter((l) => (l.decided_ms ?? 0) <= at);
  const orderIds = night.orders;
  // Projections while there is work left: at night start, every 15 minutes, and at every event that
  // changes the night (once every unit is in a tote there is nothing left to project).
  const lastDone = Math.max(...res.orders.map((o) => o.done_ms));
  const checks = new Set([0]);
  for (let x = RISK_CHECK_EVERY; x < Math.min(SHIFT_MS, lastDone); x += RISK_CHECK_EVERY) checks.add(x);
  for (const c of res.corrections) checks.add(c.at);
  for (const e of res.escalations) checks.add(e.t);
  if (night.express) checks.add(night.express.at_ms);
  // Right after a decision the projection shows what it changes (the board need not wait 15 minutes).
  for (const l of levers) if ((l.decided_ms ?? 0) > 0) checks.add(l.decided_ms);
  const flagged = new Set();
  const risks = [];
  const projections = [];
  for (const at of [...checks].sort((a, b) => a - b)) {
    const proj = projectAt(night, at, { seed: s, levers: knownAt(at) });
    const visible = orderIds.filter((o) => !(o.kind === "express" && night.express.at_ms > at));
    const atRisk = cutoffRisks(visible, proj, at);
    const riskIds = new Set(atRisk.map((r) => r.order));
    const pl = { t: at, orders: visible.map((o) => ({ id: o.id, projected_ms: proj.get(o.id), cutoff_ms: o.cutoff_ms, slack_min: Math.floor((o.cutoff_ms - proj.get(o.id)) / MINUTE), at_risk: riskIds.has(o.id) })) };
    projections.push(pl);
    res.events.push({ t: at, seq: -2, type: "projection", payload: pl });
    const fresh = atRisk.filter((r) => !flagged.has(r.order));
    for (const r of fresh) flagged.add(r.order);
    if (fresh.length) {
      const payload = { t: at, stores: atRisk.map((r) => ({ store: r.order, projected: clockUp(r.projected_ms), projected_ms: r.projected_ms, cutoff: clockOf(r.cutoff_ms), slack_min: r.slack_min, new: fresh.some((f) => f.order === r.order) })) };
      risks.push(payload);
      res.events.push({ t: at, seq: -1, type: "cutoff_risk", payload });
    }
  }
  // Wake-ups (PLAN.md §c.6): each with what it is about; the same simulated minute merges.
  // Night start names only what the warehouse system knows at 22:00: no express order, no unknown item.
  const raw = [{ t: 0, kind: "night_start", item: { orders: night.orders.filter((o) => !(o.arrives_ms > 0)).length, units: night.units.filter((u) => u.order && !u.express).length } }];
  const firstBySku = new Map();
  for (const c of res.corrections) if (!firstBySku.has(c.sku)) { firstBySku.set(c.sku, c); raw.push({ t: c.at, kind: "correction", item: { sku: c.sku, old: c.old, new: c.new } }); }
  for (const e of res.escalations) raw.push({ t: e.t, kind: "escalation", item: { escalation_id: e.escalation_id, rule: e.rule, unit_id: e.unit_id ?? null, sku: e.sku ?? null } });
  if (night.express) raw.push({ t: night.express.at_ms, kind: "new_order", item: { order: "XPR", store: night.express.store, units: night.express.units, due: clockOf(night.express.due_ms) } });
  for (const r of risks) raw.push({ t: r.t, kind: "cutoff_risk", item: { stores: r.stores.filter((x) => x.new).map((x) => x.store) } });
  raw.push({ t: res.end_ms, kind: "night_end", item: { on_time: res.orders.filter((o) => o.on_time).length, orders: res.orders.length } });
  raw.sort((a, b) => a.t - b.t);
  // A merged wake-up fires when its last item has happened (the agent never hears of an escalation
  // before it occurs), and after every event of that moment; the night-end wake-up comes last of all.
  // A wake-up the agent has already answered (closedAt: the moments of its decisions) takes nothing
  // that happens after it, even in the same minute.
  const closed = [...closedAt].sort((a, b) => a - b);
  const sealedBetween = (a, b) => closed.some((c) => c >= a && c < b);
  const wakeups = [];
  for (const w of raw) {
    const last = wakeups[wakeups.length - 1];
    if (last && Math.floor(last.t / MINUTE) === Math.floor(w.t / MINUTE) && w.kind !== "night_end" && last.kinds[0] !== "night_end" && !sealedBetween(last.t, w.t)) {
      if (!last.kinds.includes(w.kind)) last.kinds.push(w.kind);
      last.items.push({ kind: w.kind, ...w.item });
      last.t = Math.max(last.t, w.t);
    } else {
      wakeups.push({ t: w.t, kinds: [w.kind], items: [{ kind: w.kind, ...w.item }] });
    }
  }
  wakeups.forEach((w, i) => {
    w.id = `W${i + 1}`;
    w.kind = w.kinds[0];
    res.events.push({ t: w.t, seq: w.kind === "night_end" ? WAKE_SEQ * 2 : WAKE_SEQ + i, type: "wake", payload: { wake_id: w.id, kind: w.kind, kinds: w.kinds, t: w.t, clock: clockOf(w.t), items: w.items } });
  });
  res.events.sort((a, b) => a.t - b.t || a.seq - b.seq);
  res.wakeups = wakeups;
  res.risks = risks;
  res.projections = projections;
  res.hash = nightHash(res);
  return res;
}

/** Fingerprint of a night: every unit's station, completion and tote, and each order's completion. */
export function nightHash(res) {
  const lines = res.units.map((u) => `${u.id},${u.station},${u.path},${u.t_done},${u.tote}`).sort();
  const orders = res.orders.map((o) => `${o.id}:${o.done_ms}:${o.on_time ? 1 : 0}`);
  return hash64(`${lines.join(";")}|${orders.join(";")}`);
}

/**
 * Tonight's figures from a simulated night (the KPI board's Tonight column, PLAN.md §c.5): labour hours
 * (the base picker's picks at r_m plus called-in hours as billed) and per 1,000 units repacked, robot
 * picks per cell hour, cell hours, orders on time, exceptions.
 */
export function tonightFigures(night, res) {
  const r_m = night.P.r_m;
  const labourHours = res.stats.base_picker_picks / r_m + res.stats.call_in_billed_ms / 3600000;
  const repacked = res.stats.units_repacked;
  const cellHours = res.stats.cell_busy_ms / 3600000;
  return {
    units_repacked: repacked,
    labour_hours: labourHours,
    called_in_hours: res.stats.call_in_billed_ms / 3600000,
    labour_hours_per_1000: repacked ? (labourHours / repacked) * 1000 : 0,
    robot_picks_per_cell_hour: cellHours ? res.stats.successes / cellHours : 0,
    cell_hours: cellHours,
    attempts: res.stats.attempts, successes: res.stats.successes, failures: res.stats.failures,
    manual_picks: res.stats.manual_picks,
    orders_on_time: res.orders.filter((o) => o.on_time).length,
    orders: res.orders.length,
    escalations: res.escalations.length,
    corrections: res.corrections.length,
    seed: res.seed
  };
}

function round2(x) { return Math.round(x * 100) / 100; }

/**
 * Tonight as the warehouse system knows it at 22:00 (event "night_plan"): the store orders with their
 * cell and manual units, the inbound waves, the item master, the rates and the tote limit. Nothing the
 * night has not yet revealed is in it: no express order, no unknown item, no gripper wear, no outcome.
 * Those arrive as events when they happen (order_new, detection, grasp_attempt).
 */
export function nightInfo(night, { seed } = {}) {
  const orders = night.orders.filter((o) => !(o.arrives_ms > 0)).map((o) => {
    const us = night.units.filter((u) => u.order === o.id);
    return { id: o.id, name: o.name, kind: o.kind, store: o.store, flagship: o.flagship, cutoff: o.cutoff, cutoff_ms: o.cutoff_ms, arrives_ms: 0, units: us.length, cell_units: us.filter((u) => u.eligible).length, manual_units: us.filter((u) => !u.eligible).length };
  });
  const known = new Set(orders.map((o) => o.id));
  const planned = night.units.filter((u) => u.order && known.has(u.order));
  const waves = night.world.waves.map((w) => {
    const us = planned.filter((u) => night.itemsBySku.get(u.sku)?.wave === w.id);
    return { id: w.id, label: w.label, at_ms: msOf(w.arrives), arrives: w.arrives, units: us.length, manual_units: us.filter((u) => !u.eligible).length };
  });
  return {
    seed: seed ?? night.seed, volume: night.volume, orders, waves,
    items: night.items.map((it) => ({ sku: it.sku, name: it.name, master_g: it.master_g, fragility: it.fragility, grip: it.grip, cell: it.cell, success: it.success, wave: it.wave })),
    totals: { units: planned.length, cell_units: planned.filter((u) => u.eligible).length, manual_units: planned.filter((u) => !u.eligible).length },
    r_m: night.P.r_m, r_c: night.P.r_c, p: night.P.p,
    t_cell_ms: night.T_CELL, t_man_ms: night.T_MAN, tote_limit_g: night.toteLimit, risk_band_min: 15
  };
}
