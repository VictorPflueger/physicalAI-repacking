// The labour engine (build brief, "KPIs and engine formulas"; PLAN.md §c.1–c.4). Pure and without
// randomness: it computes every hour and euro the screen shows, and the agent only ever quotes its
// results. Full precision inside; js/format.js rounds half up for display (PLAN.md §c.8).
//
//   H_m   = 1000 / r_m                manual labour hours per 1,000 units
//   H_h   = 1000 / r_m × (1 − s·p)    hybrid labour hours per 1,000 units
//   E     = H × c                     labour € per 1,000 units
//   A_h   = N / r_m × s·p             labour hours avoided per year
//   A_EUR = A_h × c                   € avoided per year (gross, before cell costs)
//   P_c   = r_c × p                   successful robot picks per cell hour
//   B     = r_c·p / r_m × c           break-even all-in cell cost per operating hour
//   C_h   = N·s / r_c                 cell hours needed per year (A_EUR = B × C_h)
//   Night: cell hours s·V / r_c; hybrid labour hours V·(1 − s·p) / r_m; manual-only V / r_m
//   Call-in: max(minimum, hours used) × c × (1 + premium)

/**
 * The engine's inputs: default, unit and basis (a source key from DATA_SOURCES.md or "Assumption"),
 * in the order the assumptions tab lists them. Values are the brief's (PLAN.md §c.1).
 */
export const PARAMETERS = Object.freeze([
  { id: "N", label: "Units repacked per year", value: 6000000, unit: "units per year", step: 100000, min: 100000, max: 100000000,
    basis: "Assumption", note: "Illustrative regional DC, about 24,000 units a day on 250 days" },
  { id: "r_m", label: "Manual picking rate", value: 400, unit: "picks per labour hour", step: 10, min: 100, max: 2000,
    basis: "IML", note: "Proxy: research cited by Fraunhofer IML, method not stated; G4 tests 600 (KNAPP)" },
  { id: "c", label: "Labour cost, transport and storage, Germany, 2025", value: 35.8, unit: "€ per hour", step: 0.1, min: 1, max: 200,
    basis: "EUROSTAT_LC", note: "Eurostat lc_lci_lev, Germany, NACE H, 2025 (2024: €35.10)" },
  { id: "s", label: "Share of units the cell may handle", value: 0.7, unit: "share", step: 0.01, min: 0.01, max: 1,
    basis: "Assumption", note: "Proxy: KNAPP handles 70 % of pickable SKUs, an SKU share rather than a unit share" },
  { id: "p", label: "Grasp success rate", value: 0.91, unit: "share", step: 0.01, min: 0.01, max: 1,
    basis: "Assumption", note: "Proxy: Amazon's Pick robot, 91 % over 12,000 attempts in a trial (REGISTER)" },
  { id: "r_c", label: "Cell grasp attempts per operating hour", value: 500, unit: "attempts per hour", step: 10, min: 50, max: 2000,
    basis: "Assumption", note: "Low end of 500 to 1,400 picks per hour, manufacturer data under optimal conditions (IML)" },
  { id: "callin_min_h", label: "Call-in minimum per extra picker", value: 3, unit: "hours", step: 0.5, min: 0, max: 8,
    basis: "Assumption", note: "Option costing" },
  { id: "callin_premium", label: "Premium on call-in hours at night or at short notice", value: 0.25, unit: "share", step: 0.05, min: 0, max: 2,
    basis: "Assumption", note: "Option costing" },
  { id: "late_cost", label: "Cost per store order that misses its truck", value: 250, unit: "€ per order", step: 10, min: 0, max: 10000,
    basis: "Assumption", note: "For example a special delivery run; set per client" },
  { id: "nights", label: "Nights per year", value: 250, unit: "nights", step: 1, min: 1, max: 366,
    basis: "Brief", note: "Annual figures and cells needed" },
  { id: "shift_h", label: "Shift length", value: 8, unit: "hours", step: 0.5, min: 1, max: 24,
    basis: "Brief", note: "22:00 to 06:00" }
]);

/**
 * The inputs the night simulation itself reads (js/nightsim.js buildNight): the picking rate, the cell's
 * attempts per hour, the grasp success and the call-in minimum (how long a called-in picker stays).
 * The others price the night (c, the premium, the cost of a late order) or scale it to a year.
 */
export const NIGHT_INPUTS = Object.freeze(["r_m", "r_c", "p", "callin_min_h"]);

/** The night simulation's parameters from a set of inputs. */
export function nightParams(v) {
  return Object.fromEntries(NIGHT_INPUTS.map((k) => [k, v[k]]));
}

/** The default inputs as a plain object { N, r_m, c, s, p, r_c, callin_min_h, … }. */
export function defaults() {
  return Object.fromEntries(PARAMETERS.map((x) => [x.id, x.value]));
}

/** Inputs with overrides applied and checked; throws on a value outside its range. */
export function inputs(overrides = {}) {
  const v = { ...defaults() };
  for (const [k, x] of Object.entries(overrides || {})) {
    const def = PARAMETERS.find((q) => q.id === k);
    if (!def) throw new Error(`Unknown input: ${k}`);
    const n = Number(x);
    if (!Number.isFinite(n) || n < def.min || n > def.max) throw new Error(`${def.label}: ${x} is outside ${def.min} to ${def.max}.`);
    v[k] = n;
  }
  return v;
}

/** Labour per 1,000 units, manual against hybrid. */
export function perThousand(v) {
  const manual_h = 1000 / v.r_m;
  const hybrid_h = manual_h * (1 - v.s * v.p);
  return { manual_h, hybrid_h, manual_eur: manual_h * v.c, hybrid_eur: hybrid_h * v.c, saving_eur: (manual_h - hybrid_h) * v.c };
}

/** Per cell operating hour: successful robot picks and the break-even all-in cell cost. */
export function perCellHour(v) {
  return { robot_picks: v.r_c * v.p, break_even_eur: (v.r_c * v.p / v.r_m) * v.c };
}

/** Per year, gross before cell costs, with the cells it needs (PLAN.md §c.4). */
export function perYear(v) {
  const hours_avoided = (v.N / v.r_m) * v.s * v.p;
  const cell_hours = (v.N * v.s) / v.r_c;
  return {
    hours_avoided,
    eur_avoided: hours_avoided * v.c,
    cell_hours,
    cells_night_shift: cell_hours / (v.nights * v.shift_h),
    cells_round_clock: cell_hours / (v.nights * 24)
  };
}

/** One night of V units: cell hours, hybrid and manual-only labour hours and euros. */
export function night(v, V) {
  const cell_h = (v.s * V) / v.r_c;
  const hybrid_h = (V * (1 - v.s * v.p)) / v.r_m;
  const manual_h = V / v.r_m;
  return { units: V, cell_h, hybrid_h, manual_h, hybrid_eur: hybrid_h * v.c, manual_eur: manual_h * v.c };
}

/**
 * Tonight's labour in euros from the night simulation's hours (js/nightsim.js tonightFigures, or the
 * board's figures so far): the Tonight column of the KPI board and the night report.
 */
export function tonightEuros(v, figures) {
  const per = figures?.labour_hours_per_1000;
  return {
    labour_eur: (figures?.labour_hours ?? 0) * v.c,
    per_thousand_eur: per === null || per === undefined ? null : per * v.c
  };
}

/** Extra labour for a called-in picker: max(minimum, hours used) × c × (1 + premium). O1: €134.25. */
export function callInCost(v, hoursUsed = 0) {
  return Math.max(v.callin_min_h, hoursUsed) * v.c * (1 + v.callin_premium);
}

/** Everything the KPI board and the header tiles show for a set of inputs (the Plan column). */
export function plan(v) {
  const k = perThousand(v);
  const h = perCellHour(v);
  const y = perYear(v);
  return { inputs: { ...v }, per_thousand: k, per_cell_hour: h, per_year: y, demo_cell: demoCell(v) };
}

/**
 * The demo cell's own share of the annual figure: the night's 3,000 units on every night of the year
 * (750,000 units at the defaults), at the same rates (PLAN.md §c.4: €42,759).
 */
export function demoCell(v, unitsPerNight = 3000) {
  const N = unitsPerNight * v.nights;
  const hours_avoided = (N / v.r_m) * v.s * v.p;
  return { units_per_year: N, eur_avoided: hours_avoided * v.c, cell_hours: (N * v.s) / v.r_c };
}

/** The brief's golden cases as inputs (PLAN.md §c.3). */
export const GOLDEN = Object.freeze({
  G1: {},
  G2: { p: 0.7 },
  G3: { s: 0.75 },
  G4: { r_m: 600 }
});
