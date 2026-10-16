// Seeded draws for the night simulation. Pure functions with 32-bit integer arithmetic only, so Node
// and every browser produce the same numbers (PLAN.md §c.6, "Randomness").
//
// Every draw is a hash of (seed, unit id, draw name) into [0, 1): common random numbers. A unit's
// draws never depend on what happened before it, so a change of plan never changes which units
// would fail, options compare fairly, and every replay is identical. The grasp outcome uses the bare
// unit id as its key, the key of the Phase 0 calibration model the night targets were tuned on
// (PLAN.md §b.8); every other draw adds its name.

/** Uniform number in [0, 1) for a seed and a string key (splitmix-style integer hash). */
export function u01(seed, key) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** The draw `name` for one unit: "" is the grasp outcome (bare unit id), anything else is keyed "id|name". */
export function draw(seed, unitId, name = "") {
  return u01(seed, name ? `${unitId}|${name}` : unitId);
}

/**
 * Seed of replication k of a night: replication 0 is the night's own seed, the others derive from it
 * by hash, so a set of replications is fixed by tonight's seed alone (PLAN.md §c.7).
 */
export function replicationSeed(seed, k) {
  if (k === 0) return seed >>> 0;
  return Math.floor(u01(seed, `replication|${k}`) * 4294967296) >>> 0;
}

/**
 * A 64-bit FNV-1a hash of a string as 16 hex digits (two 32-bit lanes with different offsets): the
 * fingerprint of a night's unit log in the snapshot tests.
 */
export function hash64(text) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
