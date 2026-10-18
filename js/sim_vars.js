// Placeholders for simulation scripts. A script never types a figure the engine or the night computes:
// it writes {{plan.hybrid_eur}}, {{B.total}}, {{night.on_time}} … and the player fills them from the
// tool results of that moment, formatted exactly as the screen formats them (js/format.js). Shared by
// the player (js/simulation.js) and the script checker (js/sim_check.js), so a placeholder that would
// not resolve, or a text that quotes a figure no tool returned, is caught before a demo.
//
// A text may also differ by decision: { B: "…", A: "…", default: "…" } picks the text for the option
// the person approved (or "baseline"), else "default".

import { eur2, hours, int, upTo } from "./format.js";

const listJoin = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const slackText = (min) => (min >= 0 ? `${int(min)} min to spare` : `${int(-min)} min late`);
const grams = (g) => `${int(g)} g`;

/** Variables produced by one tool result (name, its input, its result). */
export function varsFrom(name, input, r) {
  const v = {};
  if (!r || r.error) return v;
  switch (name) {
    case "sim_plan_night": {
      Object.assign(v, {
        "plan.units": int(r.units), "plan.cell_units": int(r.cell_units), "plan.manual_units": int(r.manual_units),
        "plan.cell_h": hours(r.night.cell_hours), "plan.labour_h": hours(r.night.labour_hours), "plan.labour_eur": eur2(r.night.labour_eur),
        "plan.by_hand_h": hours(r.night.by_hand_hours), "plan.by_hand_eur": eur2(r.night.by_hand_eur),
        "plan.hybrid_h": hours(r.per_1000.hybrid_hours), "plan.hybrid_eur": eur2(r.per_1000.hybrid_eur),
        "plan.manual_h": hours(r.per_1000.by_hand_hours), "plan.manual_eur": eur2(r.per_1000.by_hand_eur),
        "plan.robot_picks": int(r.rates.robot_picks_per_cell_hour), "plan.cell_share": `${upTo(r.rates.cell_share * 100, 0)} %`,
        "plan.success": `${upTo(r.rates.grasp_success * 100, 0)} %`
      });
      const stores = r.order.filter((o) => o.id !== "XPR");
      if (stores.length) {
        v["plan.first_store"] = stores[0].name; v["plan.first_cutoff"] = stores[0].cutoff;
        v["plan.last_store"] = stores.at(-1).name; v["plan.last_cutoff"] = stores.at(-1).cutoff;
      }
      const risk = r.order.filter((o) => o.at_risk).map((o) => o.name);
      v["plan.risk"] = risk.length ? listJoin(risk) : "no store";
      break;
    }
    case "sim_project": {
      const risk = r.orders.filter((o) => o.at_risk);
      v["risk.count"] = int(risk.length);
      v["risk.names"] = risk.length ? listJoin(risk.map((o) => o.name)) : "no order";
      v["risk.list"] = risk.length ? listJoin(risk.map((o) => `${o.name} (${slackText(o.slack_min)})`)) : "no order";
      v["risk.sentence"] = risk.length
        ? `${listJoin(risk.map((o) => o.name))} ${risk.length === 1 ? "is" : "are"} inside the ${r.band_minutes}-minute band of ${risk.length === 1 ? "its truck" : "their trucks"}`
        : `every open order is projected to make its truck with more than ${r.band_minutes} minutes to spare`;
      for (const o of r.orders) {
        if (!o.projected_last_unit) continue;
        v[`proj.${o.id}.by`] = o.projected_last_unit;
        v[`proj.${o.id}.slack`] = slackText(o.slack_min);
        v[`proj.${o.id}.cutoff`] = o.cutoff;
      }
      break;
    }
    case "sim_cost_options": {
      const reps = r.replications;
      const put = (key, x) => {
        v[`${key}.total`] = eur2(x.expected_total_eur);
        v[`${key}.late`] = upTo(x.expected_late_orders, 2);
        v[`${key}.late_eur`] = eur2(x.late_orders_eur);
        const lateIn = x.late_in_replications || [];
        v[`${key}.late_text`] = lateIn.length ? listJoin(lateIn.map((l) => `${l.name} in ${l.late}`)) : `no order in any of the ${int(reps)} replications`;
        v[`${key}.late_names`] = lateIn.length ? listJoin(lateIn.map((l) => l.name)) : "no order";
        for (const l of lateIn) v[`${key}.late.${l.order}`] = l.late;
        v[`${key}.tonight`] = x.tonight.late.length ? `${listJoin(x.tonight.late)} late` : "every truck on time";
        v[`${key}.tonight_on_time`] = x.tonight.on_time;
        v[`${key}.slack`] = slackText(Math.floor(x.tonight.smallest_slack_min));
        if (x.extra_labour_eur !== undefined) v[`${key}.labour`] = eur2(x.extra_labour_eur);
        if (x.call_in_eur !== undefined) {
          v[`${key}.call_in`] = eur2(x.call_in_eur);
          v[`${key}.picks_eur`] = eur2(x.extra_picks_eur);
        }
      };
      put("nothing", r.do_nothing);
      for (const x of r.variants) put(x.variant_id, x);
      v["options.replications"] = int(reps);
      v["options.late_cost"] = eur2(r.late_cost_eur);
      v["options.at"] = r.costed_at;
      v["options.call_in_min"] = hours(r.call_in.minimum_hours);
      v["options.premium"] = r.call_in.premium;
      break;
    }
    case "sim_night_report": {
      Object.assign(v, {
        "night.units": int(r.units_repacked), "night.on_time": `${int(r.orders_on_time)} of ${int(r.orders)}`,
        "night.late": r.late.length ? listJoin(r.late) : "none", "night.moved": r.moved_to_next_wave.length ? listJoin(r.moved_to_next_wave) : "none",
        "night.labour_h": hours(r.labour_hours), "night.labour_eur": eur2(r.labour_eur),
        "night.per1000_h": r.labour_hours_per_1000 === null ? "—" : hours(r.labour_hours_per_1000),
        "night.per1000_eur": r.labour_eur_per_1000 === null ? "—" : eur2(r.labour_eur_per_1000),
        "night.cell_h": hours(r.cell_hours), "night.picks": r.robot_picks_per_cell_hour === null ? "—" : int(r.robot_picks_per_cell_hour),
        "night.failures": int(r.failed_grasps), "night.escalations": int(r.escalations), "night.corrections": int(r.corrections),
        "night.manual": int(r.manual_picks), "night.called_in_h": hours(r.called_in_hours), "night.seed": String(r.seed),
        "night.plan_h": hours(r.plan_per_1000.hybrid_hours), "night.plan_eur": eur2(r.plan_per_1000.hybrid_eur)
      });
      break;
    }
    case "world_get_item": {
      if (r.known === false) { v[`barcode.${r.barcode}.seen`] = r.seen_by_camera ? "yes" : "no"; break; }
      const k = `item.${r.sku}`;
      Object.assign(v, { [`${k}.name`]: r.name, [`${k}.master`]: grams(r.master_g), [`${k}.world`]: grams(r.world_model_g), [`${k}.fragility`]: r.fragility, [`${k}.grip`]: r.grip });
      break;
    }
    case "cell_get_grasp_plan": {
      const k = `grasp.${r.sku}`;
      Object.assign(v, { [`${k}.grip`]: r.grip, [`${k}.weight`]: grams(r.world_model_g), [`${k}.success`]: r.expected_success === null ? "—" : `${upTo(r.expected_success * 100, 0)} %`, [`${k}.payload`]: r.payload_ok ? "within the payload" : "over the payload" });
      break;
    }
    case "wms_get_order": {
      const k = `order.${r.id}`;
      v[`${k}.name`] = r.name;
      v[`${k}.packed`] = `${int(r.packed)} of ${int(r.units)}`;
      if (r.totes.current) { v[`${k}.tote`] = `tote ${r.totes.current.tote_no}`; v[`${k}.tote_kg`] = `${upTo(r.totes.current.weight_kg, 2)} kg`; v[`${k}.tote_units`] = int(r.totes.current.units); }
      if (r.projected_last_unit) { v[`${k}.by`] = r.projected_last_unit; v[`${k}.slack`] = slackText(r.slack_min); }
      break;
    }
    case "wms_get_night":
      v["wms.orders"] = int(r.orders.length);
      v["wms.units"] = int(r.totals.units);
      v["wms.packed"] = int(r.totals.packed);
      break;
    case "cell_get_status":
      v["cell.attempts"] = int(r.attempts);
      v["cell.successes"] = int(r.successes);
      v["cell.escalations"] = int(r.escalations.length);
      if (typeof r.rolling_success_last_100 === "number") v["cell.rolling"] = `${upTo(r.rolling_success_last_100 * 100, 1)} %`;
      break;
    case "wms_rebalance_tote":
      Object.assign(v, { "rebalance.store": r.store_name, "rebalance.tote": `tote ${r.closes.tote_no}`, "rebalance.next": `tote ${r.next_tote_no}`, "rebalance.kg": `${upTo(r.closes.weight_kg, 2)} kg`, "rebalance.units": int(r.closes.units) });
      break;
    case "wms_apply_option":
      v["applied.from"] = r.from;
      v["applied.letter"] = r.letter;
      break;
    case "sim_advance": {
      v["wake.clock"] = r.clock;
      v["wake.id"] = r.wake_id;
      let e = 0;
      for (const it of r.items || []) {
        if (it.kind === "correction") Object.assign(v, { "corr.at": r.clock, "corr.sku": it.sku, "corr.name": it.name, "corr.old": grams(it.old_g), "corr.new": grams(it.new_g), "corr.store": it.store_name || "—", "corr.store_id": it.store || "—", ...(it.tote ? { "corr.tote": `tote ${it.tote.tote_no}`, "corr.tote_kg": `${upTo(it.tote.weight_kg, 2)} kg` } : {}) });
        else if (it.kind === "escalation") {
          e += 1;
          Object.assign(v, { "esc.at": r.clock, [`esc.${e}.rule`]: it.rule, [`esc.${e}.reason`]: it.reason, [`esc.${e}.item`]: it.name || "an unknown item", [`esc.${e}.sku`]: it.sku || "—", [`esc.${e}.store`]: it.store_name || "—", [`esc.${e}.to`]: it.handed_to });
        } else if (it.kind === "new_order") Object.assign(v, { "xpr.at": r.clock, "xpr.store": it.store_name, "xpr.units": int(it.units), "xpr.due": it.due, "xpr.cell_units": int(it.cell_units ?? 0), "xpr.manual_units": int(it.manual_units ?? 0) });
        else if (it.kind === "cutoff_risk") { v["cut.names"] = listJoin(it.stores.map((x) => x.name)); v["cut.list"] = listJoin(it.stores.map((x) => `${x.name} (projected ${x.projected} for ${x.cutoff}, ${slackText(x.slack_min)})`)); }
        else if (it.kind === "night_end") { v["end.on_time"] = `${int(it.on_time)} of ${int(it.orders)}`; v["end.late"] = it.late.length ? listJoin(it.late) : "none"; }
      }
      v["esc.count"] = int(e);
      break;
    }
    case "ui_await_approvals":
      Object.assign(v, { "drafts.total": int(r.decisions.length), "drafts.approved": int(r.approved), "drafts.rejected": int(r.rejected) });
      break;
    case "open_lookup_barcode":
      if (r.found) Object.assign(v, { [`off.${r.barcode}.name`]: r.product.name || "—", [`off.${r.barcode}.quantity`]: r.product.quantity || "—", [`off.${r.barcode}.source`]: r.source });
      break;
    default:
      break;
  }
  return v;
}

/** The variables after a decision: its letter and title, or doing nothing. */
export function decisionVars(d) {
  if (!d) return {};
  return { "decision.id": d.id, "decision.letter": d.letter || "–", "decision.title": d.id === "baseline" ? "Do nothing" : d.title, "decision.option": d.id === "baseline" ? "doing nothing" : `option ${d.letter}` };
}

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * The text for the approved option: a string as it is, or a map { optionId | "baseline" | "default": text }
 * (also written { $by_decision: { … } }).
 */
export function pick(text, decisionId = null) {
  if (text === null || text === undefined) return text;
  if (typeof text === "string") return text;
  if (typeof text === "object") {
    const map = text.$by_decision || text;
    return decisionId && map[decisionId] !== undefined ? map[decisionId] : map.default;
  }
  return String(text);
}

/** Resolves every { $by_decision: { … } } inside a tool input for the approved option. */
export function pickDeep(value, decisionId = null) {
  if (Array.isArray(value)) return value.map((x) => pickDeep(x, decisionId));
  if (value && typeof value === "object") {
    if (value.$by_decision) return pickDeep(pick(value, decisionId), decisionId);
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, pickDeep(x, decisionId)]));
  }
  return value;
}

/** Replaces {{key}} with vars[key]; unknown keys stay as they are (the checker reports them). */
export function fillTemplate(vars, text) {
  return String(text ?? "").replace(PLACEHOLDER, (m, key) => (key in vars ? vars[key] : m));
}

/** Placeholder keys in a text that `vars` cannot resolve. */
export function unresolvedKeys(vars, text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(PLACEHOLDER)) if (!(m[1] in vars)) out.push(m[1]);
  return out;
}

/** Fills every string in an object (a tool input) with the variables. */
export function fillDeep(vars, value) {
  if (typeof value === "string") return fillTemplate(vars, value);
  if (Array.isArray(value)) return value.map((x) => fillDeep(vars, x));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, fillDeep(vars, x)]));
  return value;
}

/** Every string in an object (for unresolved-placeholder checks). */
export function stringsIn(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((x) => stringsIn(x, out));
  else if (value && typeof value === "object") Object.values(value).forEach((x) => stringsIn(x, out));
  return out;
}
