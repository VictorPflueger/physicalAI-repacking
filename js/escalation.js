// Escalation rules, enforced in code (build brief, "Architecture"; PLAN.md §e.2). The thresholds are
// an example policy a client sets; the night simulation applies them and the agent can neither switch
// a rule off, raise an escalation itself, nor send an escalated unit back to the cell. Pure module.
//
//   E1 Unknown barcode           a barcode that is not in the item master → the unit goes to a person
//   E2 Fragile, low confidence   high or very high fragility and grasp confidence below 0.80 → manual
//   E3 Repeated failures         the cell's grasp success over its last 100 attempts below 75 %
//                                (decision D2; the brief's "three failed grasps on one SKU within 60
//                                simulated minutes" stays available, off by default)
//   E4 Cut-off risk              a store's projected last unit later than its cut-off minus 15 minutes

export const POLICY = Object.freeze({
  E1: { id: "E1", name: "Unknown barcode", to: "person", needsConfirmation: true },
  E2: { id: "E2", name: "Fragile item, low grasp confidence", fragility: ["high", "very high"], minGraspConfidence: 0.80, to: "manual_station" },
  E3: { id: "E3", name: "Repeated grasp failures", window: 100, minRollingSuccess: 0.75, to: "person",
    perSku: { enabled: false, failures: 3, minutes: 60 } },
  E4: { id: "E4", name: "Cut-off risk", bandMinutes: 15, to: "person" }
});

/** E1: true when the barcode is not in the item master (a Set or Map of known barcodes). */
export function isUnknownBarcode(known, barcode) {
  return !known.has(barcode);
}

/** True for the fragility levels E2 watches. */
export function isFragile(item, policy = POLICY) {
  return !!item && policy.E2.fragility.includes(item.fragility);
}

/** E2: a fragile item whose rehearsed grasp confidence is below the threshold. */
export function isFragileLowConfidence(item, graspConfidence, policy = POLICY) {
  return isFragile(item, policy) && graspConfidence < policy.E2.minGraspConfidence;
}

/**
 * E3: the cell's rolling grasp success over its last `window` attempts. push(ok) returns the rate once
 * the window is full (null before), and `fires` tells whether that rate is below the threshold.
 */
export class RollingSuccess {
  constructor(policy = POLICY) {
    this.window = policy.E3.window;
    this.min = policy.E3.minRollingSuccess;
    this.ring = new Uint8Array(this.window);
    this.n = 0;
    this.ok = 0;
  }
  push(ok) {
    const i = this.n % this.window;
    if (this.n >= this.window) this.ok -= this.ring[i];
    this.ring[i] = ok ? 1 : 0;
    this.ok += this.ring[i];
    this.n += 1;
    return this.rate();
  }
  rate() {
    return this.n >= this.window ? this.ok / this.window : null;
  }
  fires() {
    const r = this.rate();
    return r !== null && r < this.min;
  }
}

/**
 * The brief's alternative E3 rule (off by default): `failures` failed grasps on one SKU within
 * `minutes` simulated minutes. push(sku, tMs) returns true when it fires.
 */
export class SkuFailureWindow {
  constructor(policy = POLICY) {
    this.failures = policy.E3.perSku.failures;
    this.spanMs = policy.E3.perSku.minutes * 60000;
    this.bySku = new Map();
  }
  push(sku, tMs) {
    const list = this.bySku.get(sku) || [];
    list.push(tMs);
    while (list.length && tMs - list[0] > this.spanMs) list.shift();
    this.bySku.set(sku, list);
    return list.length >= this.failures;
  }
}

/**
 * E4: the orders at risk at time `nowMs`, from projected last units. orders: [{ id, cutoff_ms }],
 * projected: Map or object id → projected last-unit time (ms). Orders whose truck has left are skipped.
 * Returns [{ order, projected_ms, cutoff_ms, slack_min }] with slack in whole minutes, rounded down.
 */
export function cutoffRisks(orders, projected, nowMs, policy = POLICY) {
  const band = policy.E4.bandMinutes * 60000;
  const get = (id) => (projected instanceof Map ? projected.get(id) : projected[id]);
  const out = [];
  for (const o of orders) {
    const p = get(o.id);
    if (p === undefined || p === null || o.cutoff_ms <= nowMs) continue;
    if (p > o.cutoff_ms - band) out.push({ order: o.id, projected_ms: p, cutoff_ms: o.cutoff_ms, slack_min: Math.floor((o.cutoff_ms - p) / 60000) });
  }
  return out;
}
