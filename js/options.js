// Option costing (PLAN.md §c.7; tool sim_cost_options from M3). Prices exactly three variants and
// "do nothing" on 20 seeded replications of tonight: replication 0 is tonight's seed, 1 to 19 derive
// from it (js/rng.js), and every variant runs on the same draws (common random numbers), so the
// comparison is fair and every replay identical. Pure module.
//
// Per variant: extra labour in euros (called-in hours with the minimum and the premium, plus extra
// manual picks beyond doing nothing at the labour cost), the expected number of store orders that miss
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
      if (!LEVER_TYPES.includes(l?.type)) problems.push(`${v.variant_id}: unknown lever ${l?.type}`);
      for (const id of l?.store_ids || []) if (!night.ordersById.has(id)) problems.push(`${v.variant_id}: unknown order ${id}`);
      if (l?.start !== undefined) { try { msOf(l.start); } catch { problems.push(`${v.variant_id}: start ${l.start} is not a clock time`); } }
      if (l?.type === "split_order" && !(l.share > 0 && l.share <= 1)) problems.push(`${v.variant_id}: split_order needs a share between 0 and 1`);
    }
  }
  return problems;
}

/** Levers with their start: their own `start`, or the current minute. */
function leversFrom(levers, nowMs) {
  return (levers || []).map((l) => ({ ...l, from_ms: l.start !== undefined ? msOf(l.start) : nowMs }));
}

/**
 * Prices the variants. opts: { seed (tonight's), now_ms (the current minute), variants: [3 × { variant_id,
 * name, levers }], inputs (engine inputs: c, r_m, callin_min_h, callin_premium, late_cost), replications }.
 * Returns { seed, now_ms, replications, baseline, variants: [...] }, each priced alike.
 */
export function costOptions(night, { seed, now_ms = 0, variants, inputs, replications = REPLICATIONS }) {
  const problems = validateVariants(variants, night);
  if (problems.length) throw new Error(`Option set refused: ${problems.join("; ")}.`);
  const v = inputs;
  const seeds = Array.from({ length: replications }, (_, k) => replicationSeed(seed, k));
  const all = [{ variant_id: "do_nothing", name: "Do nothing", levers: [] }, ...variants];
  const runs = all.map((variant) => seeds.map((s) => simulate(night, { seed: s, levers: leversFrom(variant.levers, now_ms), events: false })));
  const base = runs[0];
  const priced = all.map((variant, i) => {
    const reps = runs[i];
    const lateCounts = new Map();
    let lateSum = 0, extraPicksSum = 0;
    reps.forEach((res, k) => {
      const late = res.orders.filter((o) => !o.on_time);
      lateSum += late.length;
      for (const o of late) lateCounts.set(o.id, (lateCounts.get(o.id) || 0) + 1);
      extraPicksSum += Math.max(0, res.stats.manual_picks - base[k].stats.manual_picks);
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
