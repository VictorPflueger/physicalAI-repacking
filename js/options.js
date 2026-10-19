// Option costing (PLAN.md §c.7; the agent's tool sim_cost_options). Prices exactly three variants and
// "do nothing" on 20 seeded replications of tonight: replication 0 is tonight's seed, 1 to 19 derive
// from it (js/rng.js), and every variant runs on the same draws (common random numbers), so the
// comparison is fair and every replay identical. Pure module.
//
// Per variant: extra labour in euros (called-in hours with the minimum and the premium, plus the manual
// picks it adds against doing nothing at the labour cost, or minus the ones it saves, as a maintenance
// stop that ends failed grasps does; TECH_NOTES D48), the expected number of store orders that miss
// their truck (mean over the replications) and how often each store does, their cost at the cost per
// late order, the expected total, and the outcome on tonight's seed (late orders, smallest slack).

import { simulate, msOf, MINUTE } from "./nightsim.js";
import { replicationSeed } from "./rng.js";
import { callInCost } from "./engine.js";

export const REPLICATIONS = 20;
export const LEVER_TYPES = Object.freeze(["resequence", "call_in_picker", "split_order", "move_to_next_wave", "maintenance_stop", "manual_for_fragile"]);

/** Checks the variants an option set may hold; returns a list of problems (empty when fine). */
export function validateVariants(variants, night) {
  const problems = [];
  if (!Array.isArray(variants) || variants.length !== 3) problems.push("exactly three variants are needed");
  const ids = new Set();
  for (const v of variants || []) {
    if (!v || typeof v.variant_id !== "string" || !v.variant_id) { problems.push("a variant without variant_id"); continue; }
    if (ids.has(v.variant_id) || v.variant_id === "do_nothing") problems.push(`variant_id ${v.variant_id} is used twice or reserved`);
    ids.add(v.variant_id);
    if (!Array.isArray(v.levers) || v.levers.length === 0) problems.push(`${v.variant_id}: no levers`);
    for (const l of v.levers || []) {
      if (!LEVER_TYPES.includes(l?.type)) { problems.push(`${v.variant_id}: unknown lever ${l?.type} (levers: ${LEVER_TYPES.join(", ")})`); continue; }
      const ids = l.store_ids ?? l.order;
      if (ids !== undefined && !Array.isArray(ids)) problems.push(`${v.variant_id}: store_ids must be a list of order ids`);
      for (const id of Array.isArray(ids) ? ids : []) if (!night.ordersById.has(id)) problems.push(`${v.variant_id}: unknown order ${id}`);
      if (["resequence", "split_order", "move_to_next_wave"].includes(l.type) && !(Array.isArray(ids) && ids.length)) problems.push(`${v.variant_id}: ${l.type} needs store_ids`);
      if (l.start !== undefined) { try { msOf(l.start); } catch { problems.push(`${v.variant_id}: start ${l.start} is not a clock time (HH:MM)`); } }
      if (l.minutes !== undefined && !(Number.isInteger(l.minutes) && l.minutes > 0 && l.minutes <= 480)) problems.push(`${v.variant_id}: minutes must be a whole number from 1 to 480`);
      if (l.type === "split_order" && !(l.share > 0 && l.share <= 1)) problems.push(`${v.variant_id}: split_order needs a share between 0 and 1`);
    }
  }
  return problems;
}

/**
 * Levers with their start: their own `start`, or now, and never before now: an option decided at a
 * wake-up acts from the next millisecond (nowMs is the wake-up's time plus one), so the costing and the
 * night that follows a decision run on the same levers (TECH_NOTES D33).
 */
export function leversFrom(levers, nowMs) {
  return (levers || []).map((l) => ({ ...l, from_ms: Math.max(l.start !== undefined ? msOf(l.start) : nowMs, nowMs), decided_ms: nowMs }));
}

/**
 * Prices the variants. opts: { seed (tonight's), now_ms (now: a wake-up's time plus one), variants: [3 ×
 * { variant_id, name, levers }], inputs (engine inputs: c, r_m, callin_min_h, callin_premium, late_cost),
 * base_levers (the levers already in force tonight: earlier decisions and safety actions, with their
 * decided_ms), replications }. Returns { seed, now_ms, replications, baseline, variants: [...] }, each
 * priced alike on top of the levers in force.
 */
export function costOptions(night, { seed, now_ms = 0, variants, inputs, base_levers = [], replications = REPLICATIONS }) {
  const problems = validateVariants(variants, night);
  if (problems.length) throw new Error(`Option set refused: ${problems.join("; ")}.`);
  const v = inputs;
  const seeds = Array.from({ length: replications }, (_, k) => replicationSeed(seed, k));
  const all = [{ variant_id: "do_nothing", name: "Do nothing", levers: [] }, ...variants];
  const runs = all.map((variant) => seeds.map((s) => simulate(night, { seed: s, levers: [...base_levers, ...leversFrom(variant.levers, now_ms)], events: false })));
  const base = runs[0];
  const priced = all.map((variant, i) => {
    const reps = runs[i];
    const lateCounts = new Map();
    // An order moved to the next wave is not worked tonight, but its work is not saved either: it
    // counts on neither side, so moving an order never shows as a labour saving (TECH_NOTES D48).
    const moved = new Set((variant.levers || []).filter((l) => l.type === "move_to_next_wave").flatMap((l) => l.store_ids || l.order || []));
    let lateSum = 0, extraPicksSum = 0;
    reps.forEach((res, k) => {
      const late = res.orders.filter((o) => !o.on_time);
      lateSum += late.length;
      for (const o of late) lateCounts.set(o.id, (lateCounts.get(o.id) || 0) + 1);
      // Manual picks against doing nothing on the same draws: more when the option hands units to the
      // manual station, fewer (a saving) when it avoids failed grasps, as a maintenance stop does.
      extraPicksSum += manualPicks(res, moved) - manualPicks(base[k], moved);
    });
    const callIns = (variant.levers || []).filter((l) => l.type === "call_in_picker");
    const callInEur = callIns.reduce((sum, l) => sum + callInCost(v, Math.max(v.callin_min_h * 60, l.minutes || 0) / 60), 0);
    const extraPicks = extraPicksSum / reps.length;
    const extraPicksEur = (extraPicks / v.r_m) * v.c;
    const expectedLate = lateSum / reps.length;
    const lateEur = expectedLate * v.late_cost;
    const extraLabour = callInEur + extraPicksEur;
    const tonight = reps[0];
    const slackMin = Math.min(...tonight.orders.filter((o) => !o.moved).map((o) => o.slack_ms)) / MINUTE;
    return {
      variant_id: variant.variant_id,
      name: variant.name,
      levers: variant.levers,
      extra_labour_eur: extraLabour,
      call_in_eur: callInEur,
      extra_manual_picks: extraPicks,
      extra_picks_eur: extraPicksEur,
      expected_late_orders: expectedLate,
      late_orders_eur: lateEur,
      expected_total_eur: extraLabour + lateEur,
      late_by_order: Object.fromEntries([...lateCounts.entries()].sort((a, b) => b[1] - a[1])),
      tonight: {
        seed: tonight.seed,
        late: tonight.orders.filter((o) => !o.on_time).map((o) => o.id),
        on_time: tonight.orders.filter((o) => o.on_time).length,
        orders: tonight.orders.length,
        smallest_slack_min: slackMin
      }
    };
  });
  return { seed, now_ms, replications, seeds, baseline: priced[0], variants: priced.slice(1) };
}

/** Units a person picked at the manual station tonight, leaving out the orders in `moved`. */
function manualPicks(res, moved) {
  if (!moved.size) return res.stats.manual_picks;
  let n = 0;
  for (const u of res.units) if ((u.station === "manual" || u.station === "set_aside") && !moved.has(u.order)) n += 1;
  return n;
}
