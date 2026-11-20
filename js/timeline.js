// The night as an index the page can read at any moment: how far each item is, what the robot and the
// people have done, which store orders are ready, and the last unit through the cell. Pure: built once
// from the night simulation's events (js/story.js), then stateAt(t) answers in a few binary searches,
// so the page can jump to any time and play smoothly between the steps.

import { clockOf } from "./nightsim.js";
import { itemName, reasonText } from "./story.js";

/** How many of the sorted times are at or before t. */
export function countUpTo(sorted, t) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The index of a showcase ({ night, res } from buildShowcase). */
export function buildTimeline({ night, res }) {
  const bySku = new Map();
  const items = night.items.map((it) => {
    const item = { sku: it.sku, name: itemName(it.name), cell: !!it.cell, reason: reasonText(it.manual_reason), planned: 0, robot: [], hand: [] };
    bySku.set(it.sku, item);
    return item;
  });
  for (const u of night.units) if (u.order && !u.express && bySku.has(u.sku)) bySku.get(u.sku).planned += 1;

  const attempts = [];
  const setAside = [];
  const grasps = []; // { t, sku, ok, expected_g, observed_g }
  const handPicks = []; // { t, sku }
  for (const e of res.events) {
    const p = e.payload;
    if (e.type === "grasp_attempt") {
      attempts.push(e.t);
      if (p.ok) bySku.get(p.sku)?.robot.push(e.t);
      grasps.push({ t: e.t, sku: p.sku, ok: !!p.ok, expected_g: null, observed_g: null });
    } else if (e.type === "scale_reading") {
      const g = grasps[grasps.length - 1];
      if (g && g.sku === p.sku && g.t === e.t) { g.expected_g = p.expected_g; g.observed_g = p.observed_g; }
    } else if (e.type === "manual_pick") {
      if (p.set_aside) setAside.push(e.t);
      else { bySku.get(p.sku)?.hand.push(e.t); handPicks.push({ t: e.t, sku: p.sku }); }
    }
  }
  const byTime = (a, b) => a - b;
  attempts.sort(byTime);
  setAside.sort(byTime);
  for (const it of items) { it.robot.sort(byTime); it.hand.sort(byTime); }
  grasps.sort((a, b) => a.t - b.t);
  handPicks.sort((a, b) => a.t - b.t);

  const masterWeight = new Map(night.items.map((it) => [it.sku, it.master_g]));
  const orders = res.orders.map((o) => ({ id: o.id, name: o.name, done: o.done_ms, cutoff: o.cutoff_ms, onTime: !!o.on_time }));
  const correction = res.corrections[0] || null;
  const escalation = res.escalations[0] || null;
  return {
    items, attempts, setAside, grasps, handPicks, orders, correction, escalation, masterWeight,
    graspTimes: grasps.map((g) => g.t), handTimes: handPicks.map((p) => p.t),
    end: res.end_ms, lastWork: Math.max(attempts.at(-1) ?? 0, handPicks.at(-1)?.t ?? 0, setAside.at(-1) ?? 0)
  };
}

/** What the night looks like at time t (milliseconds after 22:00). */
export function stateAt(tl, t) {
  const items = tl.items.map((it) => {
    const robot = countUpTo(it.robot, t);
    const hand = countUpTo(it.hand, t);
    return { sku: it.sku, robot, hand, done: robot + hand, planned: it.planned };
  });
  const robot = items.reduce((s, x) => s + x.robot, 0);
  const hand = items.reduce((s, x) => s + x.hand, 0);
  const setAside = countUpTo(tl.setAside, t);
  const gi = countUpTo(tl.graspTimes, t) - 1;
  const hi = countUpTo(tl.handTimes, t) - 1;
  const grasp = gi >= 0 ? tl.grasps[gi] : null;
  return {
    t, clock: clockOf(t),
    items, robot, hand, setAside, repacked: robot + hand,
    attempts: countUpTo(tl.attempts, t),
    ready: tl.orders.filter((o) => o.done <= t).length,
    // Ready before its truck: on time so far (a late order would count once it was done, not before).
    onTime: tl.orders.filter((o) => o.done <= t && o.onTime).length,
    shipped: tl.orders.filter((o) => o.cutoff <= t).length,
    orders: tl.orders.length,
    // The jar's lesson and the unknown barcode, once they have happened.
    learned: !!tl.correction && tl.correction.at <= t,
    unknownSeen: !!tl.escalation && tl.escalation.t <= t,
    // The last unit the robot handled, and the last one a person picked.
    grasp: grasp && { ...grasp, expected_g: grasp.expected_g ?? tl.masterWeight.get(grasp.sku) },
    handPick: hi >= 0 ? tl.handPicks[hi] : null
  };
}
