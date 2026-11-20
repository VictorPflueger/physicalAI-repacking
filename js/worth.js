// What the cell is worth, from the engine at a set of inputs: labour per 1,000 units by hand and with
// the cell, the saving as a share, the yearly figure with the cells it needs and the break-even per
// operating hour. One source for the header, the guide, the night's result and Your DC, so they never
// disagree. Every figure is the engine's; this module only words it, with js/format.js.

import { plan } from "./engine.js";
import { eur2, eur0, hours, int, upTo, fixed, roundHalfUp } from "./format.js";

/** The saving per 1,000 units as a share of the labour by hand: 1 − H_h ÷ H_m, which is s × p. */
export function savingShare(v) {
  const k = plan(v).per_thousand;
  return k.manual_h > 0 ? 1 - k.hybrid_h / k.manual_h : 0;
}

/** A saving share as the screen writes it: 0.637 → "−64 %" (half up, whole percent, a no-break space). */
export function savingText(share) {
  const pctText = roundHalfUp(Math.abs(Number(share) || 0) * 100, 0);
  return `${share < 0 ? "+" : "−"}${pctText}\u00a0%`;
}

/**
 * Everything the value figures show for a set of inputs: the engine's figures and their display
 * strings. `v` is a full set of inputs (js/engine.js inputs()).
 */
export function worth(v) {
  const p = plan(v);
  const k = p.per_thousand;
  const y = p.per_year;
  const c = p.per_cell_hour;
  const share = k.manual_h > 0 ? 1 - k.hybrid_h / k.manual_h : 0;
  return {
    figures: {
      manual_h: k.manual_h, manual_eur: k.manual_eur, hybrid_h: k.hybrid_h, hybrid_eur: k.hybrid_eur,
      saving_eur: k.saving_eur, saving_share: share,
      year_eur: y.eur_avoided, hours_avoided: y.hours_avoided, cell_hours: y.cell_hours,
      cells_night_shift: y.cells_night_shift, cells_round_clock: y.cells_round_clock,
      break_even_eur: c.break_even_eur, robot_picks: c.robot_picks,
      units_per_year: v.N, labour_cost: v.c, nights: v.nights
    },
    text: {
      manual: eur2(k.manual_eur), hybrid: eur2(k.hybrid_eur),
      manual_h: hours(k.manual_h), hybrid_h: hours(k.hybrid_h),
      saving: savingText(share),
      year: eur0(y.eur_avoided), units: int(v.N),
      cells: upTo(y.cells_night_shift, 1), cells_clock: upTo(y.cells_round_clock, 1), cell_hours: int(y.cell_hours),
      hours_avoided: fixed(y.hours_avoided, y.hours_avoided % 1 ? 1 : 0),
      break_even: eur2(c.break_even_eur), labour_cost: eur2(v.c), nights: int(v.nights)
    }
  };
}
