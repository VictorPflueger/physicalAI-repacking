// Formatting helpers for euros, hours, percentages and counts (English UI, EUR).
//
// Rounding: every figure is kept at full precision and rounded only for display, half up on its
// decimal expansion (build brief, "KPIs and engine formulas"). Number.toFixed is not used for display:
// it rounds the binary double, so (31.325).toFixed(2) gives "31.32" where G2's break-even must read
// €31.33. The decimal expansion is first cut to ten places, far below any display
// precision, which removes the binary noise (31.324999999999999 → 31.3250000000) before rounding.

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

/** Hours with up to two decimals: hours(0.9075) → "0.91 h", hours(2.5) → "2.5 h", with a no-break space. */
export function hours(value, decimals = 2) {
  return `${upTo(value, decimals)}\u00a0h`;
}

/** A share as a percentage with up to one decimal: pct(128 / 138) → "92.8 %", pct(0.95) → "95 %", with a no-break space. */
export function pct(share, decimals = 1) {
  if (share === null || share === undefined || Number.isNaN(Number(share))) return "—";
  return `${upTo(Number(share) * 100, decimals)}\u00a0%`;
}

/** Whole numbers with grouping: int(4200) → "4,200". */
export function int(value) {
  return fixed(Number(value) || 0, 0);
}

