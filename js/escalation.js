// Escalation rules, enforced in code. The thresholds are an example policy a client sets; the night
// simulation applies them, and nothing the agent says can switch a rule off or send an escalated unit
// back to the cell. Pure module.
//
//   E1 Unknown barcode           a barcode that is not in the item master → the unit goes to a person
//   E2 Fragile, low confidence   high or very high fragility and grasp confidence below 0.80 → manual
//   E3 Repeated failures         the cell's grasp success over its last 100 attempts below 75 %

export const POLICY = Object.freeze({
  E1: { id: "E1", name: "Unknown barcode", to: "person", needsConfirmation: true },
  E2: { id: "E2", name: "Fragile item, low grasp confidence", fragility: ["high", "very high"], minGraspConfidence: 0.80, to: "manual_station" },
  E3: { id: "E3", name: "Repeated grasp failures", window: 100, minRollingSuccess: 0.75, to: "person" }
});

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
