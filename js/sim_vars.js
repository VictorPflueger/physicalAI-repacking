// Placeholders for simulation scripts. A script never types a figure the engine or the night computes:
// it writes {{plan.hybrid_eur}}, {{B.total}}, {{night.on_time}} … and the player fills them from the
// tool results of that moment, formatted exactly as the screen formats them (js/format.js). Shared by
// the player (js/simulation.js) and the script checker (js/sim_check.js), so a placeholder that would
// not resolve, or a text that quotes a figure no tool returned, is caught before a demo.
//
// A text may also differ by decision: { B: "…", A: "…", default: "…" } picks the text for the option
// the person approved (or "baseline"), else "default".

import { eur2, eur0, hours, int, upTo, pct, roundHalfUp } from "./format.js";
import { figureLeaves } from "./figures.js";

const listJoin = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const slackText = (min) => (min >= 0 ? `${int(min)} min to spare` : `${int(-min)} min late`);
const grams = (g) => `${int(g)} g`;
const labourText = (x) => (x < -0.005 ? `saves ${eur2(-x)} of labour` : x > 0.005 ? `${eur2(x)} of extra labour` : "no extra labour");

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
      const late = risk.filter((o) => o.slack_min < 0);
      const band = risk.filter((o) => o.slack_min >= 0);
      Object.assign(v, {
        "risk.late_count": int(late.length), "risk.late_names": late.length ? listJoin(late.map((o) => o.name)) : "no order",
        "risk.band_count": int(band.length), "risk.band_names": band.length ? listJoin(band.map((o) => o.name)) : "no order",
        "risk.band_list": band.length ? listJoin(band.map((o) => `${o.name} (${slackText(o.slack_min)})`)) : "no order",
        "risk.band": `${int(r.band_minutes)}-minute band`
      });
      const open = r.orders.filter((o) => o.projected_last_unit);
      if (open.length) {
        const tight = open.reduce((a, b) => (b.slack_min < a.slack_min ? b : a));
        v["proj.tightest"] = tight.name;
        v["proj.tightest_slack"] = slackText(tight.slack_min);
      }
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
        if (x.extra_labour_eur !== undefined) {
          v[`${key}.labour`] = eur2(x.extra_labour_eur);
          v[`${key}.labour_text`] = labourText(x.extra_labour_eur);
          if (x.extra_labour_eur < -0.005) v[`${key}.saving`] = eur2(-x.extra_labour_eur);
        }
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
        "night.plan_h": hours(r.plan_per_1000.hybrid_hours), "night.plan_eur": eur2(r.plan_per_1000.hybrid_eur),
        ...(r.called_in_eur !== undefined ? { "night.called_in_eur": eur2(r.called_in_eur) } : {}),
        ...(r.heaviest_tote_kg !== undefined ? { "night.heaviest_tote": `${upTo(r.heaviest_tote_kg, 2)} kg`, "night.tote_limit": `${upTo(r.tote_limit_kg, 2)} kg` } : {})
      });
      break;
    }
    case "sim_kpis": {
      // The engine's KPIs, or a labelled what-if (which no option, draft or summary may quote).
      const k = r.basis === "what_if" ? "whatif" : "kpis";
      const p = (r.inputs || []).find((x) => x.id === "p");
      Object.assign(v, {
        [`${k}.hybrid_h`]: hours(r.per_1000.hybrid_hours), [`${k}.hybrid_eur`]: eur2(r.per_1000.hybrid_eur),
        [`${k}.manual_h`]: hours(r.per_1000.by_hand_hours), [`${k}.manual_eur`]: eur2(r.per_1000.by_hand_eur),
        [`${k}.saving_eur`]: eur2(r.per_1000.saving_eur),
        [`${k}.picks`]: int(r.per_cell_hour.robot_picks_per_cell_hour), [`${k}.break_even`]: eur2(r.per_cell_hour.break_even_eur_per_cell_hour),
        [`${k}.year_eur`]: eur0(r.per_year.avoided_eur), [`${k}.year_h`]: int(r.per_year.hours_avoided),
        ...(p ? { [`${k}.p`]: pct(p.value) } : {})
      });
      if (r.what_if) v["whatif.label"] = r.what_if;
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
      v["wms.volume"] = r.volume;
      for (const o of r.orders) { v[`wms.${o.id}.cutoff`] = o.cutoff; v[`wms.${o.id}.units`] = int(o.units); v[`wms.${o.id}.name`] = o.name; }
      break;
    case "cell_get_status":
      v["cell.attempts"] = int(r.attempts);
      v["cell.successes"] = int(r.successes);
      v["cell.failures"] = int(r.failures);
      v["cell.escalations"] = int(r.escalations.length);
      v["cell.gripper"] = r.gripper;
      if (typeof r.rolling_success_last_100 === "number") v["cell.rolling"] = `${upTo(r.rolling_success_last_100 * 100, 1)} %`;
      break;
    case "world_list_corrections": {
      const list = r.corrections || [];
      v["corrections.count"] = int(list.length);
      v["corrections.list"] = list.length ? listJoin(list.map((c) => `${c.time} ${c.sku} ${grams(c.old)} → ${grams(c.new)} by the ${c.sensor}`)) : "none";
      for (const c of list) v[`corrections.${c.sku}`] = int(list.filter((x) => x.sku === c.sku).length);
      break;
    }
    case "cell_route_to_manual":
      Object.assign(v, { "routed.what": r.what, "routed.from": r.from, "routed.units": int(r.units_moved) });
      break;
    case "world_propose_entry":
      Object.assign(v, { "entry.barcode": r.barcode, "entry.name": r.name, "entry.status": r.status, "entry.source": r.source === "open_food_facts" ? "Open Food Facts" : "the camera", "entry.net_content": r.net_content || "not known" });
      break;
    case "ui_request_confirmation":
      v["confirm.choice"] = r.choice === "confirm" ? "confirmed" : "rejected";
      if (r.entry) v["entry.status"] = r.entry.status;
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
          Object.assign(v, { "esc.at": r.clock, [`esc.${e}.rule`]: it.rule, [`esc.${e}.reason`]: it.reason, [`esc.${e}.item`]: it.name || "an unknown item", [`esc.${e}.sku`]: it.sku || "—", [`esc.${e}.store`]: it.store_name || "—", [`esc.${e}.to`]: it.handed_to,
            ...(it.barcode ? { [`esc.${e}.barcode`]: it.barcode } : {}), ...(it.units_seen ? { [`esc.${e}.units`]: int(it.units_seen) } : {}),
            ...(typeof it.rolling_success === "number" ? { [`esc.${e}.rolling`]: `${upTo(it.rolling_success * 100, 1)} %` } : {}) });
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
    case "open_lookup_barcode": {
      // The latest lookup, found or not: a script reads the same words whether or not the bundled
      // snapshot holds a record yet (TECH_NOTES §4).
      const b = r.barcode;
      const live = /live/i.test(r.source || "");
      const name = r.found ? r.product.name || `an unnamed product ${b}` : `Unknown item ${b}`;
      const q = r.found ? r.product.net_content || r.product.quantity || "" : "";
      Object.assign(v, {
        "lookup.barcode": b, "lookup.source": r.source, "lookup.attribution": r.attribution,
        "lookup.found": r.found ? "found" : "not found", "lookup.name": name, "lookup.net_content": q,
        "lookup.entry_source": r.found ? "open_food_facts" : "scale_and_camera",
        "lookup.sentence": r.found
          ? `Open Food Facts lists it as ${name}${q ? `, ${q}` : ""} (${r.source})`
          : live ? "Open Food Facts has no product for it" : "the bundled Open Food Facts snapshot holds no record for it"
      });
      v["lookup.Sentence"] = v["lookup.sentence"].charAt(0).toUpperCase() + v["lookup.sentence"].slice(1);
      if (r.found) Object.assign(v, { [`off.${b}.name`]: r.product.name || "—", [`off.${b}.quantity`]: r.product.quantity || "—", [`off.${b}.source`]: r.source });
      break;
    }
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
 * Raw figures of one tool result for recorded scripts (js/recorder.js): "@name#n:path" → the number at
 * that path of the n-th successful call of that tool in the run. A recorded run's text writes
 * {{@sim_cost_options#1:variants.1.expected_total_eur|2}}, so every figure the live agent wrote is
 * computed again at playback, as the authored placeholders are (TECH_NOTES D45).
 */
export function rawFigures(name, n, result) {
  const out = {};
  if (!result || result.error) return out;
  for (const leaf of figureLeaves(result)) out[`@${name}#${n}:${leaf.path.join(".")}`] = leaf.value;
  return out;
}

/**
 * A raw figure written as the live text wrote it. spec: decimals, then "g" for thousands separators,
 * "d" for German separators, "k" or "m" for a figure written in thousands or millions ("2", "0g", "2gd",
 * "1k"). The sign stays in the text around the number, so the value is formatted without it.
 */
export function formatRaw(value, spec) {
  const m = /^(\d)(g?)(d?)([km]?)$/.exec(String(spec || ""));
  if (!m || typeof value !== "number" || !Number.isFinite(value)) return null;
  const scale = m[4] === "k" ? 1e3 : m[4] === "m" ? 1e6 : 1;
  const [w, frac] = roundHalfUp(Math.abs(value) / scale, Number(m[1])).split(".");
  const whole = m[2] ? w.replace(/\B(?=(\d{3})+(?!\d))/g, m[3] ? "." : ",") : w;
  return frac !== undefined ? `${whole}${m[3] ? "," : "."}${frac}` : whole;
}

/** A recorded figure placeholder's text ("@tool#n:path|spec"), or null when it does not resolve. */
function resolveRaw(vars, key) {
  if (!key.startsWith("@")) return null;
  const bar = key.lastIndexOf("|");
  if (bar < 0) return null;
  const name = key.slice(0, bar);
  return name in vars ? formatRaw(vars[name], key.slice(bar + 1)) : null;
}

/**
 * The text for this path: a string as it is, or a map { optionId | "baseline" | "confirmed" |
 * "rejected" | "default": text } (also written { $by_decision: { … } }). `keys` is the path so far, most
 * specific first: the approved option, then the answer to a confirmation (one key or a list).
 */
export function pick(text, keys = null) {
  if (text === null || text === undefined) return text;
  if (typeof text === "string") return text;
  if (typeof text === "object") {
    const map = text.$by_decision || text;
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
    const hit = list.find((k) => map[k] !== undefined);
    return hit ? map[hit] : map.default;
  }
  return String(text);
}

/** Resolves every { $by_decision: { … } } inside a tool input for this path. */
export function pickDeep(value, keys = null) {
  if (Array.isArray(value)) return value.map((x) => pickDeep(x, keys));
  if (value && typeof value === "object") {
    if (value.$by_decision) return pickDeep(pick(value, keys), keys);
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, pickDeep(x, keys)]));
  }
  return value;
}

/** Replaces {{key}} with vars[key]; unknown keys stay as they are (the checker reports them). */
export function fillTemplate(vars, text) {
  return String(text ?? "").replace(PLACEHOLDER, (m, key) => (key in vars ? vars[key] : resolveRaw(vars, key) ?? m));
}

/** Placeholder keys in a text that `vars` cannot resolve. */
export function unresolvedKeys(vars, text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(PLACEHOLDER)) if (!(m[1] in vars) && resolveRaw(vars, m[1]) === null) out.push(m[1]);
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
