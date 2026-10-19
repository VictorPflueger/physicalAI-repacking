// Shared shaping of options and of what an approved decision changes. The live tools and the scripted
// replay both use these helpers, so an option card looks exactly the same whichever producer runs. Every
// figure on a card comes from the engine's costing (js/options.js), never from the model.

import { clockOf } from "./nightsim.js";

/** Figures of one costed variant as shown on its card. */
export function optionFigures(v) {
  return {
    extra_labour_eur: v.extra_labour_eur,
    call_in_eur: v.call_in_eur,
    extra_picks_eur: v.extra_picks_eur,
    expected_late_orders: v.expected_late_orders,
    late_orders_eur: v.late_orders_eur,
    expected_total_eur: v.expected_total_eur,
    late_by_order: v.late_by_order || {},
    tonight: { ...v.tonight },
    levers: (v.levers || []).map((l) => ({ ...l }))
  };
}

/** The do-nothing baseline as shown on its card. */
export function baselineFigures(res, description = "") {
  const b = res.baseline;
  return {
    expected_late_orders: b.expected_late_orders,
    late_orders_eur: b.late_orders_eur,
    expected_total_eur: b.expected_total_eur,
    late_by_order: b.late_by_order || {},
    tonight: { ...b.tonight },
    description: String(description || "").slice(0, 300)
  };
}

/** The options event: what the cards, the comparison bars and the audit show. */
export function optionsPayload({ seq, res, options, recommended, recommendationReason = "", baselineText, replications, inputs, now_ms }) {
  return {
    options_seq: seq,
    at: clockOf(now_ms ?? res.now_ms),
    replications: replications ?? res.replications,
    seed: res.seed,
    late_cost_eur: inputs?.late_cost,
    recommended,
    ...(recommendationReason ? { recommendation_reason: recommendationReason } : {}),
    options,
    baseline: baselineFigures(res, baselineText)
  };
}

/**
 * The plan_update event after an applied decision or a safety action: each lever with what it acts on
 * and from when (and until when, for a called-in picker or a maintenance stop).
 */
export function planUpdate({ source, option_id = null, levers, clock }) {
  return {
    source, ...(option_id ? { option_id } : {}), clock,
    levers: levers.map((l) => ({
      type: l.type,
      ...(l.store_ids ? { store_ids: [...l.store_ids] } : {}),
      ...(l.order ? { order: [...l.order] } : {}),
      ...(l.sku_ids ? { sku_ids: [...l.sku_ids] } : {}),
      ...(l.fragile_only ? { fragile_only: true } : {}),
      ...(l.share !== undefined ? { share: l.share } : {}),
      ...(l.minutes !== undefined ? { minutes: l.minutes } : {}),
      from: clockOf(l.from_ms), from_ms: l.from_ms,
      ...(typeof l.until_ms === "number" ? { until: clockOf(l.until_ms), until_ms: l.until_ms } : {})
    }))
  };
}

/** One line for a lever, for tool results, the console and the audit ("call in one picker from 02:00 for 3 h"). */
export function leverText(l, names = (id) => id) {
  const list = (ids) => (ids || []).map(names).join(", ");
  switch (l.type) {
    case "resequence": return `repack ${list(l.store_ids || l.order)} first, in that order`;
    case "call_in_picker": return `call in one picker${l.start ? ` from ${l.start}` : ""}${l.minutes ? ` for ${l.minutes} minutes` : ""}`;
    case "split_order": return `move ${Math.round((l.share || 0) * 100)} % of ${list(l.store_ids)} from the cell to the manual station`;
    case "move_to_next_wave": return `move ${list(l.store_ids)} to the next day's wave`;
    case "maintenance_stop": return `stop the cell${l.start ? ` at ${l.start}` : ""} for ${l.minutes || 30} minutes of maintenance`;
    case "manual_for_fragile": return "send every fragile item to the manual station";
    case "route_to_manual": return l.fragile_only ? "route every fragile item to the manual station" : `route ${list(l.sku_ids)} to the manual station`;
    case "close_tote": return `close the current tote of ${list(l.store_ids)}`;
    default: return l.type;
  }
}
