// Formatting helpers for euros, hours, percentages, times and dates (English UI, EUR).
//
// Rounding: every figure is kept at full precision and rounded only for display, half up on its
// decimal expansion (build brief, "KPIs and engine formulas"). Number.toFixed is not used for display:
// it rounds the binary double, so (31.325).toFixed(2) gives "31.32" where G2's break-even must read
// €31.33 (PLAN.md B9). The decimal expansion is first cut to ten places, far below any display
// precision, which removes the binary noise (31.324999999999999 → 31.3250000000) before rounding.

import { appToday } from "./clock.js";

/**
 * Half-up rounding to `decimals` places as a plain decimal string without grouping:
 * roundHalfUp(31.325, 2) → "31.33", roundHalfUp(366502.5, 0) → "366503", roundHalfUp(-2.5, 0) → "-3".
 * Halves round away from zero, so a negative figure mirrors its positive.
 */
export function roundHalfUp(value, decimals = 2) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "NaN";
  const d = Math.max(0, Math.min(10, Math.trunc(decimals)));
  const text = Math.abs(v).toFixed(10);
  const [intPart, frac] = text.split(".");
  let n = BigInt(intPart + frac.slice(0, d)) + (Number(frac[d]) >= 5 ? 1n : 0n);
  let digits = n.toString().padStart(d + 1, "0");
  const whole = digits.slice(0, digits.length - d);
  const rest = digits.slice(digits.length - d);
  const out = d ? `${whole}.${rest}` : whole;
  const isZero = /^0(\.0+)?$/.test(out);
  return v < 0 && !isZero ? `-${out}` : out;
}

/** Thousands separators (en-GB) for a plain decimal string: "366503" → "366,503". */
function group(decimalString) {
  const [whole, frac] = decimalString.replace("-", "").split(".");
  const sign = decimalString.startsWith("-") ? "−" : "";
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac !== undefined ? `.${frac}` : ""}`;
}

/** A number with half-up rounding and grouping: fixed(10237.5, 1) → "10,237.5". */
export function fixed(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return group(roundHalfUp(value, decimals));
}

/** Up to `decimals` places, trailing zeros dropped: upTo(2.5, 2) → "2.5", upTo(0.9075, 2) → "0.91". */
export function upTo(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const s = roundHalfUp(value, decimals);
  return group(s.includes(".") ? s.replace(/\.?0+$/, "") : s);
}

/** Euros with two decimals, the unit of every per-1,000-units figure: €32.49, €89.50. */
export function eur2(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const s = fixed(value, 2);
  return s.startsWith("−") ? `−€${s.slice(1)}` : `€${s}`;
}

/** Whole euros, the unit of every annual figure: €366,503. */
export function eur0(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const s = fixed(value, 0);
  return s.startsWith("−") ? `−€${s.slice(1)}` : `€${s}`;
}

/** Small euro amounts with cents, for the cost meter: €0.38. */
export function eurCents(value) {
  return eur2(Number(value) || 0);
}

/** Hours with up to two decimals: hours(0.9075) → "0.91 h", hours(2.5) → "2.5 h". */
export function hours(value, decimals = 2) {
  return `${upTo(value, decimals)} h`;
}

/** A share as a percentage with up to one decimal: pct(128 / 138) → "92.8 %", pct(0.95) → "95 %". */
export function pct(share, decimals = 1) {
  if (share === null || share === undefined || Number.isNaN(Number(share))) return "—";
  return `${upTo(Number(share) * 100, decimals)} %`;
}

/** Whole numbers with grouping: int(4200) → "4,200". */
export function int(value) {
  return fixed(Number(value) || 0, 0);
}

/** mm:ss (or h:mm:ss) for the run stopwatch in the console. */
export function clock(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

// en-GB writes September "Sept" next to the three-letter Aug and Oct; keep all months at three.
const month3 = (text) => text.replace(/\bSept\b/, "Sep");

/**
 * "12 Oct 2026" from an ISO date or timestamp. A bare date is read as that day where the browser is,
 * not as midnight UTC (which is the day before west of UTC).
 */
export function dateWithYear(iso) {
  const text = String(iso ?? "");
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : text);
  return Number.isNaN(d.getTime()) ? "an earlier date" : month3(d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }));
}

/** "Wed 23 Dec" for an ISO date, with the year when it is not this year. */
export function shortDate(iso) {
  const text = String(iso ?? "");
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : text);
  if (Number.isNaN(d.getTime())) return "—";
  const year = d.getFullYear() !== appToday().getFullYear() ? { year: "numeric" } : {};
  return month3(d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...year }));
}

/** "15:56:03" local time from an ISO timestamp. */
export function timeOfDay(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
