// The world model (PLAN.md §a.4, "World model"; brief: expected against observed): what the cell
// expects of every item, what its sensors observed, and the corrections log. The item master is the
// starting point; a scale reading further than the tolerance from the expectation writes the observed
// weight back for the whole SKU (every later unit is rehearsed and weighed against it), and the log
// keeps time, sensor, field, old and new value.
//
// One rule, three users: the night simulation decides corrections with it (js/nightsim.js), the
// board replays them from the night's events (js/cell_data.js, js/world_panel.js), and the agent's
// world tools read it (js/wms.js). Pure: no DOM, no clock, no randomness.

/** A reading further than this share away from the expected weight writes back (Assumption). */
export const WEIGHT_TOLERANCE = 0.25;

/** True when an observed weight is outside the tolerance around the expected one. */
export function differs(expected_g, observed_g, tolerance = WEIGHT_TOLERANCE) {
  return Math.abs(observed_g - expected_g) / expected_g > tolerance;
}

/**
 * Creates a world model over the item master. items: [{ sku, name, master_g, … }]; every other field of
 * an item (fragility, grip, cell, success) is kept as it is.
 */
export function createWorldModel(items) {
  const rows = new Map(items.map((it) => [it.sku, { ...it, expected_g: it.master_g, observed_g: null, readings: 0, corrected_at: null }]));
  const log = [];

  /** Writes a correction into the model and the log. */
  function apply(c) {
    const r = rows.get(c.sku);
    if (!r) return null;
    r.expected_g = c.new;
    r.corrected_at = c.at;
    log.push({ ...c });
    return c;
  }

  return {
    /** The weight the cell expects for a SKU now (the item master until a correction). */
    expected: (sku) => rows.get(sku)?.expected_g,
    /**
     * A sensor reading: recorded as the latest observation; outside the tolerance it corrects the
     * whole SKU. Returns the correction, or null.
     */
    observe(sku, observed_g, at, { unit_id = null, sensor = "scale" } = {}) {
      const r = rows.get(sku);
      if (!r) return null;
      r.observed_g = observed_g;
      r.readings += 1;
      if (!differs(r.expected_g, observed_g)) return null;
      return apply({ sku, field: "weight_g", old: r.expected_g, new: observed_g, sensor, at, unit_id, applies_to: "sku" });
    },
    /** A reading the model only records (the board mirrors the night; the simulation decided already). */
    record(sku, observed_g) {
      const r = rows.get(sku);
      if (!r) return;
      r.observed_g = observed_g;
      r.readings += 1;
    },
    apply,
    /** One item as the model holds it now (a copy), or null. */
    item: (sku) => (rows.has(sku) ? { ...rows.get(sku) } : null),
    name: (sku) => rows.get(sku)?.name || "",
    /** The corrections log, oldest first (copies). */
    corrections: () => log.map((c) => ({ ...c })),
    size: () => rows.size
  };
}
