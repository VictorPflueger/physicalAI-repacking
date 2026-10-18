// Figure audit (PLAN.md §e.1): every euro amount, every number of hours and every rate the agent writes
// into an option card, a draft, a confirmation or the management summary must be one that a tool
// returned in this run (the engine, the night simulation or the warehouse system), within the precision
// it is written with and never by more than 2 %. The cards and tiles take their figures from the
// engine directly; this check covers free text, so "every figure comes from a tool result" is enforced
// in code, not only asked for. Shared by the live tools and the script checker.
//
// Unlike Rebate Hunter there is no €100 floor: tonight's figures are small (€32.49 per 1,000 units,
// €134.25 for a call-in), so cents count. Read formats:
//   euros   "€134.25", "€ 134.25", "134,25 €", "EUR 1,234.56", "1.234,56 EUR", "€1.2k", "€342,069"
//   hours   "0.91 h", "2.72 labour hours", "3 hours", "1.5 hrs", "4.2 cell hours"
//   rates   "455 picks per cell hour", "500 attempts an hour", "400 picks per hour", "500 grasps/h"
// A number with one separator before exactly three digits ("1.084") is read both ways and must match in
// one of them.

const SP = "[ \\u00a0\\u202f\\u2009]";
const NUM = `\\d{1,3}(?:(?:,|\\.|'|’|${SP})\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?`;
const SCALE_RE = "k|K|thousand|m|M|million|Mio\\.?";
const NOT_WORD = "(?![A-Za-z])";
const CUR_PRE = "€|£|US\\$|\\$|\\b(?:EUR|GBP|USD)\\b";
const CUR_SUF = "€|EUR\\b|GBP\\b|USD\\b|[Ee]uros?\\b";

const PREFIX = new RegExp(`(${CUR_PRE})${SP}?(${NUM})(?:${SP}?(${SCALE_RE})${NOT_WORD})?`, "g");
const SUFFIX = new RegExp(`(?<![\\d.,'’])(${NUM})(?:${SP}?(${SCALE_RE})${NOT_WORD})?${SP}?(${CUR_SUF})`, "g");
// Hours: a number followed by h, hr(s), hour(s), optionally with "labour", "cell", "manual" or "picker"
// in between ("2.72 labour hours"); never a clock time ("02:45") or "per hour" (a rate).
const HOURS = new RegExp(`(?<![\\d.,:'’])(${NUM})${SP}?(?:-${SP}?)?(?:(?:labour|labor|cell|manual|picker|call-in|working|operating)${SP}+)?(h|hrs?|hours?)${NOT_WORD}(?!${SP}*(?:per|an|a)${SP})`, "g");
// Rates: picks, attempts, grasps or units per hour (or "an hour", "/h").
const RATES = new RegExp(`(?<![\\d.,'’])(${NUM})${SP}+(?:successful${SP}+|robot${SP}+|manual${SP}+)?(?:picks?|attempts?|grasps?|units?)${SP}*(?:(?:per|an|a)${SP}+(?:cell${SP}+|operating${SP}+|labour${SP}+)?hour|/${SP}?h${NOT_WORD})`, "g");

const SCALE = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, mio: 1e6, "mio.": 1e6 };
const CURRENCY = { "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR", "£": "GBP", gbp: "GBP", "$": "USD", "us$": "USD", usd: "USD" };
export const MAX_RELATIVE_TOLERANCE = 0.02;

/**
 * Readings of a written number: [{ value, decimals }]. Two readings when the separator is ambiguous
 * ("1.084" is 1.084 in English and 1,084 in German; "1,048" the other way round).
 */
export function readNumber(token) {
  const s = String(token).replace(/[   ’]/g, (c) => (c === "’" ? "'" : " "));
  const seps = [...s.matchAll(/[.,' ]/g)].map((m) => ({ c: m[0], i: m.index }));
  const digits = (t) => t.replace(/[^\d]/g, "");
  const out = (intPart, frac = "") => ({ value: Number(`${digits(intPart) || "0"}${frac ? `.${frac}` : ""}`), decimals: frac.length });
  if (!seps.length) return [out(s)];
  const kinds = [...new Set(seps.map((x) => x.c))];
  const last = seps[seps.length - 1];
  const tail = s.slice(last.i + 1);
  if (kinds.length > 1) {
    // Mixed separators: the last one is the decimal separator ("1.048.000,00", "1,048,000.00").
    if (last.c === "." || last.c === ",") return [out(s.slice(0, last.i), tail)];
    return [out(s)];
  }
  const c = kinds[0];
  if (c === " " || c === "'") return [out(s)];
  if (seps.length > 1) return [out(s)];                      // "1,048,000" or "1.048.000": grouping
  if (tail.length !== 3) return [out(s.slice(0, last.i), tail)]; // "2,14" or "2.5": a decimal
  // One separator before exactly three digits: thousands or a decimal, depending on the writer.
  const grouped = out(s);
  const decimal = out(s.slice(0, last.i), tail);
  return c === "," ? [grouped, decimal] : [decimal, grouped];
}

/** Half a unit of the last digit written, and never more than 2 % of the value. */
function tolerance(value, decimals, scale = 1) {
  const half = (scale * 10 ** -decimals) / 2;
  return Math.min(half, Math.abs(value) * MAX_RELATIVE_TOLERANCE);
}

function readings(num, scale = 1) {
  return readNumber(num).map(({ value, decimals }) => {
    const v = value * scale;
    return { value: v, tolerance: tolerance(v, decimals, scale) };
  }).filter((r) => Number.isFinite(r.value));
}

/**
 * Figures written in a text: [{ raw, kind: "eur"|"hours"|"rate", currency?, readings: [{value, tolerance}], index }].
 */
export function extractFigures(text) {
  const s = String(text || "");
  const out = [];
  const spans = [];
  const add = (raw, index, kind, rs, extra = {}) => {
    const end = index + raw.length;
    if (spans.some(([a, b]) => index < b && end > a)) return;
    if (!rs.length) return;
    spans.push([index, end]);
    out.push({ raw: raw.trim(), kind, readings: rs, index, ...extra });
  };
  for (const m of s.matchAll(PREFIX)) add(m[0], m.index, "eur", readings(m[2], m[3] ? SCALE[m[3].toLowerCase()] || 1 : 1), { currency: CURRENCY[m[1].toLowerCase()] || "EUR" });
  for (const m of s.matchAll(SUFFIX)) add(m[0], m.index, "eur", readings(m[1], m[2] ? SCALE[m[2].toLowerCase()] || 1 : 1), { currency: CURRENCY[m[3].toLowerCase()] || "EUR" });
  for (const m of s.matchAll(RATES)) add(m[0], m.index, "rate", readings(m[1]));
  for (const m of s.matchAll(HOURS)) add(m[0], m.index, "hours", readings(m[1]));
  return out.sort((a, b) => a.index - b.index);
}

// ---- known figures --------------------------------------------------------------------------------

/** Known figures by kind: euros (with their currency), hours and rates. */
export class FigureSet {
  constructor() { this.items = []; }
  add(kind, value, currency = null) {
    // A zero a tool returned counts too: "no extra labour, €0.00" quotes the costing.
    const v = Math.abs(Number(value));
    if (!Number.isFinite(v)) return;
    this.items.push({ kind, value: v, currency });
  }
  get size() { return this.items.length; }
  [Symbol.iterator]() { return this.items[Symbol.iterator](); }
}

// Field names that carry figures of each kind in tool results.
const EUR_KEY = /(^|_)eur$|_eur_|^eur$|(^|_)cost$|^c$/i;
const HOURS_KEY = /(^|_)(h|hours?|hrs)$|_h_|hours_|^callin_min_h$/i;
const RATE_KEY = /per_(cell_)?hour|^r_m$|^r_c$|picks_per|attempts_per|rate_per_hour/i;

/**
 * Adds every figure in a tool result: numbers under euro, hour or rate field names, and figures written
 * in strings ("€134.25", "0.91 h"). Other numbers (counts, minutes, shares, ids) are not figures here.
 */
export function collectFigures(value, known = new FigureSet()) {
  const walk = (v, key, depth) => {
    if (depth > 16 || v === null || v === undefined) return;
    if (typeof v === "number") {
      const k = String(key || "");
      if (EUR_KEY.test(k)) known.add("eur", v, "EUR");
      else if (RATE_KEY.test(k)) known.add("rate", v);
      else if (HOURS_KEY.test(k)) known.add("hours", v);
      return;
    }
    if (typeof v === "string") {
      for (const f of extractFigures(v)) for (const r of f.readings) known.add(f.kind, r.value, f.kind === "eur" ? f.currency : null);
      return;
    }
    if (Array.isArray(v)) { for (const x of v) walk(x, key, depth + 1); return; }
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1);
  };
  walk(value, null, 0);
  return known;
}

/**
 * Figure leaves of a tool result with their paths, for the recorder (js/recorder.js): every number under
 * a euro, hour or rate field name, as collectFigures() counts them. [{ path: ["variants", 1,
 * "expected_total_eur"], kind, value }]. Numbers written inside strings are left out: the same values
 * are numbers elsewhere in the results.
 */
export function figureLeaves(value) {
  const out = [];
  const walk = (v, key, p, depth) => {
    if (depth > 16 || v === null || v === undefined) return;
    if (typeof v === "number") {
      const k = String(key ?? "");
      const kind = EUR_KEY.test(k) ? "eur" : RATE_KEY.test(k) ? "rate" : HOURS_KEY.test(k) ? "hours" : null;
      if (kind && Number.isFinite(v)) out.push({ path: p, kind, value: v });
      return;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, key, [...p, i], depth + 1)); return; }
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k, [...p, k], depth + 1);
  };
  walk(value, null, [], 0);
  return out;
}

/** Where the number sits in a written figure ("€134.25" → { start: 1, end: 7, text: "134.25" }), or null. */
export function numberSpan(raw) {
  const m = new RegExp(NUM).exec(String(raw || ""));
  return m ? { start: m.index, end: m.index + m[0].length, text: m[0] } : null;
}

/** Figures in `text` that match no known figure of their kind (known: a FigureSet or a list of them). */
export function unknownFigures(text, known) {
  const sets = Array.isArray(known) ? known : [known];
  const list = sets.flatMap((s) => (s ? [...s] : []));
  return extractFigures(text).filter((f) => !f.readings.some((r) => list.some((k) =>
    k.kind === f.kind && (f.kind !== "eur" || k.currency === null || k.currency === f.currency) && Math.abs(k.value - r.value) <= r.tolerance + 1e-6)));
}
