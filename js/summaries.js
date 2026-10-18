// One-line, human-readable summaries of tool results for the agent console. Shared by both producers
// (the live agent and the scripted replay drive the same tools, js/tools.js), so a result reads the
// same in either mode; every tool has its own line, so a result is never reduced to "Result received".
// The words come from the result; figures are formatted as on the screen (js/format.js).

import { eur2, hours, int, upTo } from "./format.js";

const listJoin = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const plural = (n, word, many = `${word}s`) => `${int(n)} ${n === 1 ? word : many}`;

export function summarizeToolResult(name, r) {
  if (!r) return "No result";
  if (r.error) return `${r.refused ? "Refused" : "Error"}: ${r.error}`;
  switch (name) {
    case "wms_get_night": {
      const risk = r.orders.filter((o) => o.at_risk).map((o) => o.name);
      return `${plural(r.orders.length, "order")}, ${int(r.totals.units)} units, ${int(r.totals.packed)} in totes; ${r.waves.filter((w) => w.arrived).length} of ${r.waves.length} waves in${risk.length ? `; at risk: ${listJoin(risk)}` : ""}`;
    }
    case "wms_get_order":
      return `${r.name}: ${int(r.packed)} of ${int(r.units)} units in totes, cut-off ${r.cutoff}${r.projected_last_unit ? `, projected by ${r.projected_last_unit} (${r.slack_min >= 0 ? `${int(r.slack_min)} min to spare` : `${int(-r.slack_min)} min late`})` : `, ${r.status}`}${r.totes.current ? `; tote ${r.totes.current.tote_no} at ${upTo(r.totes.current.weight_kg, 2)} kg` : ""}`;
    case "wms_get_stock":
      return `${plural(r.skus.length, "SKU")}, ${int(r.skus.reduce((n, s) => n + s.to_repack, 0))} units still to repack`;
    case "wms_rebalance_tote":
      return `${r.store_name}: tote ${r.closes.tote_no} (${plural(r.closes.units, "unit")}, ${upTo(r.closes.weight_kg, 2)} kg) closes now; the next unit opens tote ${r.next_tote_no}`;
    case "wms_apply_option":
      return `Option ${r.letter} applied from ${r.from}: ${r.levers.map((l) => l.what).join("; ")}`;
    case "cell_get_status":
      return `${int(r.attempts)} grasps, ${int(r.successes)} picked${typeof r.rolling_success_last_100 === "number" ? `, rolling success ${upTo(r.rolling_success_last_100 * 100, 1)} %` : ""}; ${int(r.manual_station.waiting)} waiting at the manual station; ${plural(r.escalations.length, "escalation")}`;
    case "cell_get_grasp_plan":
      return r.cell_eligible
        ? `${r.sku} ${r.name}: ${r.grip} grip at ${int(r.world_model_g)} g, expected success ${upTo(r.expected_success * 100, 0)} %, payload ${r.payload_ok ? "within" : "over"} the ${upTo(r.payload_limit_g / 1000, 1)} kg limit${r.routed_to_manual ? "; routed to the manual station" : ""}`
        : `${r.sku} ${r.name}: not for the cell (${r.manual_reason})`;
    case "cell_route_to_manual":
      return `${r.what} from ${r.from}${r.units_moved ? `: ${plural(r.units_moved, "unit")} move to the manual station` : ""}`;
    case "world_get_item":
      return r.known === false
        ? `Barcode ${r.barcode}: not in the item master${r.provisional_entry ? "; a provisional entry waits for a person" : ""}`
        : `${r.sku} ${r.name}: world model ${int(r.world_model_g)} g (master data ${int(r.master_g)} g)${r.corrections.length ? `, ${plural(r.corrections.length, "correction")}` : ""}`;
    case "world_list_corrections":
      return r.corrections.length ? r.corrections.map((c) => `${c.time} ${c.sku} ${int(c.old)} g → ${int(c.new)} g (${c.sensor})`).join("; ") : "No corrections tonight";
    case "world_propose_entry":
      return `Provisional entry for ${r.barcode}: ${r.name}, unverified until a person confirms it`;
    case "open_lookup_barcode":
      return r.found ? `${r.product?.name || "Product"}${r.product?.quantity ? `, ${r.product.quantity}` : ""} (${r.source})` : `No product found (${r.source})`;
    case "sim_plan_night":
      return `${int(r.units)} units, ${int(r.cell_units)} for the cell; plan: ${hours(r.night.cell_hours)} cell hours, ${hours(r.night.labour_hours)} labour hours, ${eur2(r.per_1000.hybrid_eur)} per 1,000 units`;
    case "sim_kpis":
      return `${r.basis === "what_if" ? "What-if: " : ""}${hours(r.per_1000.hybrid_hours)} · ${eur2(r.per_1000.hybrid_eur)} per 1,000 units hybrid, ${hours(r.per_1000.manual_hours)} · ${eur2(r.per_1000.manual_eur)} by hand; ${int(r.per_cell_hour.robot_picks_per_cell_hour)} picks per cell hour`;
    case "sim_project": {
      const risk = r.orders.filter((o) => o.at_risk);
      return `Projection from ${r.at}: ${risk.length ? `${listJoin(risk.map((o) => `${o.name} (${o.slack_min >= 0 ? `${int(o.slack_min)} min to spare` : `${int(-o.slack_min)} min late`})`))} at risk` : "no order at risk"}`;
    }
    case "sim_cost_options":
      return `Do nothing ${eur2(r.do_nothing.expected_total_eur)}; ${r.variants.map((v) => `${v.variant_id} ${eur2(v.expected_total_eur)}`).join(", ")} (expected over ${int(r.replications)} replications)`;
    case "sim_advance":
      return r.night_over ? `Night over at ${r.clock}` : `Woken at ${r.clock}: ${listJoin(r.kinds.map((k) => k.replace(/_/g, " ")))}`;
    case "sim_night_report":
      return `${r.final ? "Tonight" : "So far"}: ${int(r.orders_on_time)} of ${int(r.orders)} orders on time; ${hours(r.labour_hours_per_1000)} · ${eur2(r.labour_eur_per_1000)} per 1,000 units`;
    case "ui_await_approvals":
      return `${plural(r.approved, "draft")} approved, ${int(r.rejected)} rejected`;
    case "ui_request_confirmation":
      return `The person chose: ${r.choice}`;
    default:
      if (typeof r.summary === "string") return r.summary;
      return r.ok === false ? "Refused" : "Done";
  }
}
