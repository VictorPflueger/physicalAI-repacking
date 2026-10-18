// The night calibration (PLAN.md §b.8), frozen as a check: the brief asks for one picker, one cell,
// 22:00 to 06:00 and staggered cut-offs, with these outcomes:
//   T1  on a normal night (N1) the hybrid night serves all 12 stores on time, none within the
//       15-minute risk band;
//   T2  on the same night by hand alone (manual baseline) several stores miss their truck;
//   T3  on the peak night (N2) the hybrid night misses exactly two stores, Hamm and Soest;
//   T4  scenario 1 (the express order at 02:00, the warehouse system's default of express first)
//       puts exactly two stores, Hamm and Soest, inside the 15-minute risk band (slack below 15
//       minutes, late included), while the express order makes its truck. (Until M3 the express order
//       also needed 15 minutes to spare; M3 tuned it to a chilled top-up for the 02:45 truck so that
//       re-sequencing carries a real late risk, PLAN.md §c.7, TECH_NOTES D32.)
// The cut-offs and the chilled wave in the world were found on these 14 seeds by the Phase 0 model;
// js/nightsim.js has to meet the targets on every one of them. Pure module, used by the world checks
// (Node and Diagnostics) and by tools/calibrate_night.mjs.

import { buildNight, simulate, MINUTE } from "./nightsim.js";

export const CALIBRATION_SEEDS = Object.freeze([7, 1000, 8919, 16838, 24757, 32676, 40595, 48514, 56433, 64352, 72271, 80190, 88109, 96028]);
export const RISK_BAND_MS = 15 * MINUTE;
export const N2_LATE = Object.freeze(["HAM", "SOE"]);
export const S1_RISK = Object.freeze(["HAM", "SOE"]);

const ids = (orders) => orders.map((o) => o.id).sort().join(",");

/** Evaluates the four targets on one seed. scenario1Night: the night spec of scenario 1. */
export function calibrateSeed(world, scenario1Night, seed) {
  const n1 = simulate(buildNight(world, { volume: "n1" }), { seed, events: false });
  const man = simulate(buildNight(world, { volume: "n1", manual_only: true }), { seed, events: false });
  const n2 = simulate(buildNight(world, { volume: "n2" }), { seed, events: false });
  const s1 = simulate(buildNight(world, { ...scenario1Night, seed }), { seed, events: false });
  const stores = (res) => res.orders.filter((o) => o.kind === "store");
  const minSlack = Math.min(...stores(n1).map((o) => o.slack_ms));
  const manLate = stores(man).filter((o) => !o.on_time);
  const n2Late = stores(n2).filter((o) => !o.on_time);
  const s1Risk = stores(s1).filter((o) => o.slack_ms < RISK_BAND_MS);
  const xpr = s1.orders.find((o) => o.kind === "express");
  const t1 = stores(n1).every((o) => o.on_time) && minSlack >= RISK_BAND_MS;
  const t2 = manLate.length >= 3;
  const t3 = ids(n2Late) === [...N2_LATE].sort().join(",");
  const t4 = ids(s1Risk) === [...S1_RISK].sort().join(",") && !!xpr && xpr.on_time;
  return {
    seed, ok: t1 && t2 && t3 && t4, targets: { t1, t2, t3, t4 },
    n1_min_slack_min: minSlack / MINUTE,
    manual_late: manLate.map((o) => o.id),
    n2_late: n2Late.map((o) => o.id),
    s1_risk: s1Risk.map((o) => ({ id: o.id, slack_min: o.slack_ms / MINUTE })),
    express_slack_min: xpr ? xpr.slack_ms / MINUTE : null,
    n1_successes: n1.stats.successes, n1_attempts: n1.stats.attempts
  };
}

/** All calibration seeds: { ok, passed, seeds: [calibrateSeed …] }. */
export function calibrate(world, scenarios, seeds = CALIBRATION_SEEDS) {
  const s1 = scenarios.find((s) => s.number === 1)?.night;
  if (!s1) throw new Error("Scenario 1 has no night.");
  const results = seeds.map((seed) => calibrateSeed(world, s1, seed));
  const passed = results.filter((r) => r.ok).length;
  return { ok: passed === seeds.length, passed, total: seeds.length, seeds: results };
}
