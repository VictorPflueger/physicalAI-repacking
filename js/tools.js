// The agent's tools (PLAN.md §d.3): the JSON Schemas sent to the model and the executors that run in the
// browser. The scripted replay drives the very same executors from its script (js/simulation.js), so a
// replay can do nothing a live agent could not, and both emit the same events. The script checker runs
// them headless in Node (js/sim_check.js). Every result is computed from the shared night session
// (js/night_session.js): the agent sees what the screen shows, and nothing from the future.
//
// Guardrails enforced in code, not only in the prompt (policy in js/guards.js and js/figures.js):
//   - every hour and euro comes from the engine or the night simulation; an option card's figures are
//     filled from the latest sim_cost_options result by variant_id, never from the model's text;
//   - every euro amount, number of hours and rate in an option card, a draft, a confirmation or the
//     management summary must be one a tool returned, by scope (a draft may quote only the facts and
//     the costing the options rest on, never a what-if); refused twice, then shown marked unchecked;
//   - options are exactly the three variants of the latest costing at this wake-up; the recommendation
//     is one of them; a decision belongs to the option set it was taken on; only the approved option is
//     applied, after the approval, and never in Advise mode;
//   - drafts follow a decision and contain only what the approved option does; the management summary
//     waits for the night's end and every draft, and its outcome follows the decisions;
//   - escalations come from the night simulation (js/escalation.js): no tool raises one, switches a rule
//     off or sends an escalated unit back to the cell; the two safety actions (route items to the
//     manual station, close a tote early) are allowed at every autonomy level;
//   - the night stands still while a decision, a draft or a confirmation waits for the person.

import { clockOf } from "./nightsim.js";
import { plan as enginePlan, night as engineNight, PARAMETERS } from "./engine.js";
import { LEVER_TYPES, REPLICATIONS, validateVariants } from "./options.js";
import { visibleOrders, tonightSoFar, callInHours } from "./cell_data.js";
import { wmsGetNight, wmsGetOrder, wmsGetStock, cellGetStatus, cellGetGraspPlan, worldGetItem, worldListCorrections, leversInForce } from "./wms.js";
import { summarizeToolResult } from "./summaries.js";
import { optionFigures, optionsPayload, leverText } from "./payoff.js";
import { finalizeDraft, DRAFT_TYPES, DRAFT_LABELS } from "./drafts.js";
import { FigureLedger, applyError, draftError, reportOutcome, OUTCOMES } from "./guards.js";
import { POLICY } from "./escalation.js";
import { roundHalfUp, eur2 } from "./format.js";
import { AGENT } from "./config.js";

export { OUTCOMES };
export const LIVE_REPORT_FOOTER = "*Live agent run on a simulated cell. Ruhrkorb, its DC, stores and items are fictional; every hour and euro comes from the deterministic engine and the seeded night simulation.*";
export const SIM_REPORT_FOOTER = "*Simulated run: a scripted replay on a simulated cell. Ruhrkorb, its DC, stores and items are fictional; every hour and euro comes from the deterministic engine and the seeded night simulation.*";
const LETTERS = ["A", "B", "C"];
const r2 = (x) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? null : Number(roundHalfUp(x, 2)));
const r3 = (x) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? null : Number(roundHalfUp(x, 3)));
const ids = (description) => ({ type: "array", items: { type: "string" }, description });
const listJoin = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// ---- schemas ----------------------------------------------------------------------------------------

const LEVER_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string", enum: LEVER_TYPES,
      description: "resequence: the cell and the manual station take these orders first, in this order. call_in_picker: a second picker at the manual station, billed at least the call-in minimum with the night premium. split_order: a share of an order's cell units goes to the manual station. move_to_next_wave: the order leaves tonight's work for tomorrow's wave (its truck leaves without it, which counts as late). maintenance_stop: the cell stops for maintenance, which ends gripper wear. manual_for_fragile: every fragile item goes to the manual station."
    },
    store_ids: ids("Order ids as in wms_get_night (ESS … SWE, XPR for the express order). resequence: the orders to take first, in order; split_order and move_to_next_wave: the orders it acts on."),
    share: { type: "number", description: "split_order: the share of the order's remaining cell units that go to the manual station, above 0 and at most 1." },
    start: { type: "string", description: "HH:MM on tonight's shift; default now. call_in_picker: when the picker starts; maintenance_stop: when the cell stops." },
    minutes: { type: "integer", description: "call_in_picker: how long the picker stays (at least the call-in minimum); maintenance_stop: its length (default 30)." }
  },
  required: ["type"]
};

const DEFINITIONS = [
  {
    name: "wms_get_night",
    description: "Tonight in the warehouse system now: shift, inbound waves and whether they have arrived, every visible order (twelve stores, and the express order once it has arrived) with units, cell and manual units, units in totes, cut-off and projected last unit, people at the manual station, the plan's order and the levers in force, the rates and the tote limit.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "wms_get_order",
    description: "One order: its lines (SKU, quantity, cell or manual, units done), totes (closed, the current tote's units and weight, the limit), units in totes, cut-off, projected last unit and minutes to spare.",
    input_schema: { type: "object", properties: { store_id: { type: "string", description: "Order id, e.g. ESS or XPR." } }, required: ["store_id"] }
  },
  {
    name: "wms_get_stock",
    description: "Units of each SKU still to repack tonight, by wave, and whether the wave has arrived.",
    input_schema: { type: "object", properties: { sku_ids: ids("Optional: only these SKUs (S01 … S24).") } }
  },
  {
    name: "wms_rebalance_tote",
    description: "Close a store's current tote now and continue in a new one, so the next units start a fresh tote (heavy items first) by the corrected weights. A safety action, allowed at every autonomy level.",
    input_schema: { type: "object", properties: { store_id: { type: "string" }, reason: { type: "string", description: "One line: why." } }, required: ["store_id", "reason"] }
  },
  {
    name: "wms_apply_option",
    description: "Apply the levers of the option the person approved, from now. Refused for any other option, before an approval, after doing nothing, and in Advise mode (the person applies it there).",
    input_schema: { type: "object", properties: { option_id: { type: "string", description: "The approved option's variant_id." } }, required: ["option_id"] }
  },
  {
    name: "cell_get_status",
    description: "The cell now: grasp attempts, successes and failures, rolling success over the last 100 attempts, gripper state, the last grasp, the manual station's queue, every escalation so far with its rule, reason and who took the item.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "cell_get_grasp_plan",
    description: "Rehearse a grasp for one SKU against the world model: grip, the world model's weight against master data, expected success, the payload check, the E2 rule for fragile items, whether the SKU is routed to the manual station.",
    input_schema: { type: "object", properties: { sku_id: { type: "string" } }, required: ["sku_id"] }
  },
  {
    name: "cell_route_to_manual",
    description: "Send the remaining units of one SKU, or of every fragile SKU, from the cell to the manual station from now on, with a one-line reason. A safety action, allowed at every autonomy level; it does not return any unit to the cell.",
    input_schema: { type: "object", properties: { sku_id: { type: "string" }, fragile_only: { type: "boolean", description: "Every fragile SKU instead of one SKU." }, reason: { type: "string" } }, required: ["reason"] }
  },
  {
    name: "world_get_item",
    description: "One item in the world model, by SKU id or barcode: master data against the world model's weight and the last observation, corrections, fragility, grip, cell eligibility. An unknown barcode returns whether the camera saw it and any provisional entry.",
    input_schema: { type: "object", properties: { sku_id: { type: "string" }, barcode: { type: "string" } } }
  },
  {
    name: "world_list_corrections",
    description: "The world model's corrections log: time, sensor, SKU, field, old and new value (a correction applies to the whole SKU).",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "world_propose_entry",
    description: "Create a provisional item-master entry for an unknown barcode the camera saw, from a lookup result or the scale and camera. It stays unverified, and its units stay at the manual station, until a person confirms it (ui_request_confirmation).",
    input_schema: {
      type: "object",
      properties: {
        barcode: { type: "string" }, name: { type: "string" }, net_content: { type: "string", description: "As printed on the label, e.g. 210 g." },
        source: { type: "string", enum: ["open_food_facts", "scale_and_camera"] }
      },
      required: ["barcode", "name", "source"]
    }
  },
  {
    name: "open_lookup_barcode",
    description: "Open Food Facts product data for a barcode: name, brand, quantity, packaging, categories, with the source and its attribution (the live API when this build enables it, otherwise the bundled snapshot). At most 3 lookups per run, each barcode once.",
    input_schema: { type: "object", properties: { barcode: { type: "string" } }, required: ["barcode"] }
  },
  {
    name: "sim_plan_night",
    description: "The engine's plan for tonight: units for the cell and by hand, the plan's order with each order's projected last unit and minutes to spare, and the night's figures (cell hours, labour hours and euros, hybrid against by hand, per 1,000 units), with each rate's source key.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "sim_kpis",
    description: "Engine KPIs: labour hours and euros per 1,000 units (by hand, hybrid), robot picks and break-even cost per cell hour, the annual figure with the cells it needs (gross, before cell costs), each input with its source key. what_if values give a labelled what-if, which no option, draft or summary may quote.",
    input_schema: {
      type: "object",
      properties: {
        what_if: {
          type: "object", description: "Optional inputs to change for this result only.",
          properties: { p: { type: "number" }, s: { type: "number" }, r_m: { type: "number" }, r_c: { type: "number" }, c: { type: "number" }, N: { type: "number" } }
        }
      }
    }
  },
  {
    name: "sim_project",
    description: "Projection from now with the plan and the levers in force and expected outcomes: each open order's projected last unit, cut-off and minutes to spare, and the orders inside the 15-minute risk band.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "sim_cost_options",
    description: `Price exactly three variants and doing nothing from now, on ${REPLICATIONS} seeded replications of tonight with the levers already in force: extra labour (call-in and extra manual picks), expected store orders that miss their truck, their cost, the expected total, how often each order is late, and the outcome on tonight's seed. Errors name the field to fix.`,
    input_schema: {
      type: "object",
      properties: {
        variants: {
          type: "array", minItems: 3, maxItems: 3,
          items: {
            type: "object",
            properties: {
              variant_id: { type: "string", description: "A, B or C." },
              name: { type: "string", description: "Up to 8 words." },
              levers: { type: "array", items: LEVER_SCHEMA }
            },
            required: ["variant_id", "name", "levers"]
          }
        }
      },
      required: ["variants"]
    }
  },
  {
    name: "sim_advance",
    description: "End your turn: the night plays on until the next moment that needs you and stands still there. Returns that wake-up (a world-model correction, escalations, a new order, a cut-off risk, or night end) with what happened. Refused while a decision, an unapplied option or a draft waits.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "sim_night_report",
    description: "Tonight against the plan: units repacked, grasps, failures, manual picks, escalations, corrections, labour hours and euros (in total and per 1,000 units), cell hours, robot picks per cell hour, store orders on time and late, the seed. Final once the night is over, otherwise so far.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "ui_propose_options",
    description: "Show exactly three options plus doing nothing and wait for the person's decision. The figures on the cards come from your latest sim_cost_options result at this wake-up, by variant_id; on screen the options are A, B and C in the order you pass them. Returns the decision.",
    input_schema: {
      type: "object",
      properties: {
        options: {
          type: "array", minItems: 3, maxItems: 3,
          items: {
            type: "object",
            properties: {
              variant_id: { type: "string" },
              title: { type: "string", description: "Up to 8 words." },
              description: { type: "string", description: "One or two sentences: what we would do." },
              residual_risk: { type: "string", description: "One sentence: what can still go wrong." }
            },
            required: ["variant_id", "title", "description", "residual_risk"]
          }
        },
        recommended_variant_id: { type: "string" },
        baseline_description: { type: "string", description: "One sentence: what happens if we do nothing." }
      },
      required: ["options", "recommended_variant_id", "baseline_description"]
    }
  },
  {
    name: "ui_await_decision",
    description: "After the person rejected an option, wait for the next decision on the remaining options or on doing nothing. Returns the decision.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "ui_request_confirmation",
    description: "Ask the person to confirm or reject a provisional item-master entry or another handover, and wait for the answer.",
    input_schema: { type: "object", properties: { subject: { type: "string" }, reason: { type: "string" }, entry_barcode: { type: "string" } }, required: ["subject", "reason"] }
  },
  {
    name: "ui_draft_action",
    description: "Queue one outbound action as a draft in the Outbox, pending the person's approval; nothing is ever sent. email: to a store whose order the approved option changes, or to the carrier about a moved order; memo: internal (shift handover, master data, maintenance); call_in: the message to the on-call picker pool, only when the option calls one in. Names, times and amounts from tool results only.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: DRAFT_TYPES },
        recipient: { type: "string", description: "By function, e.g. \"Ruhrkorb Dortmund, store manager\" or \"On-call picker pool\". No personal names." },
        subject: { type: "string" },
        body: { type: "string", description: "Plain text, signed \"Night shift lead, Ruhrkorb DC Unna\"." }
      },
      required: ["type", "recipient", "subject", "body"]
    }
  },
  {
    name: "ui_await_approvals",
    description: "Wait until the person has approved or rejected every draft in the Outbox. Returns each decision. Call after the last ui_draft_action, before sim_advance.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "ui_final_report",
    description: "Publish the management summary (Markdown) once the night is over and every draft is decided. Every amount, number of hours and rate must come from tool results; the outcome follows the decisions.",
    input_schema: {
      type: "object",
      properties: {
        markdown: { type: "string" },
        outcome: { type: "string", enum: OUTCOMES, description: "option_decided after an approved option, baseline_accepted after doing nothing; without options: correction_only, escalation_only or routine_night." }
      },
      required: ["markdown"]
    }
  }
];

/** The tool list for a request. */
export function toolDefinitions() {
  return DEFINITIONS.map((d) => ({ ...d }));
}
export const TOOL_NAMES = DEFINITIONS.map((d) => d.name);

/** Reads that may run in parallel within one turn (PLAN.md §d.3). */
export const ORDER_FREE = (name) => /^(wms_get_|cell_get_|world_get_|world_list_|open_)/.test(String(name));
/** Tools that wait: for a person, or for the night. */
export const UI_BLOCKING_TOOLS = new Set(["sim_advance", "ui_propose_options", "ui_await_decision", "ui_request_confirmation", "ui_await_approvals"]);
/** Results that are facts (the warehouse system, the cell, the world model, open data, the night's wake-ups). */
const FACT_TOOLS = new Set(["wms_get_night", "wms_get_order", "wms_get_stock", "cell_get_status", "cell_get_grasp_plan", "world_get_item", "world_list_corrections", "open_lookup_barcode", "sim_advance", "wms_rebalance_tote", "wms_apply_option", "cell_route_to_manual", "world_propose_entry"]);
/** Results of the engine and the night simulation. */
const ENGINE_TOOLS = new Set(["sim_plan_night", "sim_kpis", "sim_project", "sim_cost_options", "sim_night_report"]);

// ---- executors ----------------------------------------------------------------------------------------

/**
 * Creates the executors for one run.
 * ctx: { session, getInputs() → the engine's inputs, mode: "live" | "simulation", emit(type, payload),
 *        waitUntil(test) → Promise, takeOptionDecision(pred), takeConfirmation(pred), drafts: Map,
 *        onPhase(state), advance() → Promise<wake | null>, autonomy() → "advise" | "approve" | "bounded",
 *        lookup ({ lookup(barcode, { signal }) }), signal, pause(ms) (lets the screen paint before a
 *        long computation) }
 * execute(name, input) resolves { content (the tool_result text), isError, result, summary }.
 */
export function createToolbox(ctx) {
  const ses = ctx.session;
  const world = ses.night.world;
  const storeName = (id) => ses.state().orders.get(id)?.name || world.stores.find((s) => s.id === id)?.name || id;
  const itemName = (sku) => ses.night.itemsBySku.get(sku)?.name || sku;
  const pause = ctx.pause || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const run = {
    costing: null,          // the latest sim_cost_options at this wake-up: { res (full), compact, at }
    options: null,          // options on screen at this wake-up
    optionsPayload: null,
    optionsSeq: 0,
    rejected: new Set(),
    decision: null,         // this wake-up's decision: { id, letter, title, label, levers, applied }
    decisions: [],          // every decision of the night, in order
    ledger: new FigureLedger(),
    figureRejections: { options: 0, draft: 0, report: 0, confirmation: 0 },
    provisional: new Map(),
    reported: false,
    outcome: null,
    nightOver: false,
    wake: ses.wake() ? describeWakeRaw(ses.wake()) : null,
    wakes: 0,
    phase: null,
    calls: {}
  };

  const handlers = {
    wms_get_night: () => wmsGetNight(ses),
    wms_get_order: (i) => wmsGetOrder(ses, i),
    wms_get_stock: (i) => wmsGetStock(ses, i),
    cell_get_status: () => cellGetStatus(ses),
    cell_get_grasp_plan: (i) => cellGetGraspPlan(ses, i),
    world_get_item: (i) => worldGetItem(ses, i, { provisional: run.provisional }),
    world_list_corrections: () => worldListCorrections(ses),
    open_lookup_barcode: openLookup,
    wms_rebalance_tote: rebalanceTote,
    wms_apply_option: applyOption,
    cell_route_to_manual: routeToManual,
    world_propose_entry: proposeEntry,
    sim_plan_night: planNight,
    sim_kpis: kpis,
    sim_project: project,
    sim_cost_options: costOptionsTool,
    sim_advance: advance,
    sim_night_report: nightReport,
    ui_propose_options: proposeOptions,
    ui_await_decision: awaitDecision,
    ui_request_confirmation: requestConfirmation,
    ui_draft_action: draftAction,
    ui_await_approvals: awaitApprovals,
    ui_final_report: finalReport
  };

  async function execute(name, input = {}) {
    if (!run.wake && ses.wake()) run.wake = describeWakeRaw(ses.wake());
    const fn = handlers[name];
    if (!fn) return done(name, { error: `Unknown tool "${name}". Tools: ${TOOL_NAMES.join(", ")}.` });
    run.calls[name] = (run.calls[name] || 0) + 1;
    phaseFor(name);
    let result;
    try {
      result = await fn(input && typeof input === "object" ? input : {});
    } catch (e) {
      // Cancellation (the run's abort or a fetch AbortError) ends the run, not the tool.
      if (typeof e === "symbol" || e?.name === "AbortError") throw e;
      console.error(`[Repack Pilot] tool ${name} failed:`, e);
      result = { error: `The tool failed unexpectedly (${String(e?.message || "unknown error")}). Try different input or another tool.` };
    }
    const isError = !!(result && result.error);
    if (!isError && FACT_TOOLS.has(name)) run.ledger.addFacts(result);
    if (!isError && ENGINE_TOOLS.has(name)) run.ledger.addEngine(name, result, { what_if: result.basis === "what_if" });
    return done(name, result, isError);
  }

  function done(name, result, isError = false) {
    return { content: JSON.stringify(result), isError, result, summary: summarizeToolResult(name, result) };
  }

  /** A refusal by a guardrail: the agent is told why and what to do instead. */
  const refuse = (error, extra = {}) => ({ error, refused: true, ...extra });

  // ---- phases (the run states the rail and the status pill show) -------------------------------------
  function setPhase(s) {
    if (!s || s === run.phase) return;
    run.phase = s;
    ctx.onPhase?.(s);
  }
  function phaseFor(name) {
    const late = ["options", "awaiting_approval"].includes(run.phase);
    if (name === "sim_plan_night" && !late) setPhase("planning");
    else if ((name === "sim_project" || name === "sim_cost_options") && !late) setPhase("replanning");
    else if (["wms_apply_option", "ui_draft_action", "ui_final_report", "sim_night_report"].includes(name) && run.decision) setPhase("executing");
  }

  // ---- reads that need the run's memory ----------------------------------------------------------------
  async function openLookup(i) {
    if (!ctx.lookup) return { error: "No barcode lookup is available in this run." };
    const r = await ctx.lookup.lookup(i.barcode, { signal: ctx.signal });
    return r;
  }

  // ---- the engine and the night simulation ---------------------------------------------------------------
  function sourceOf(id) {
    return PARAMETERS.find((p) => p.id === id)?.basis || "Assumption";
  }

  function unitsKnown() {
    return visibleOrders(ses.state()).reduce((n, o) => n + o.units, 0);
  }

  function planNight() {
    const v = ctx.getInputs();
    const st = ses.state();
    const orders = visibleOrders(st);
    const units = unitsKnown();
    const n = engineNight(v, units);
    const p = enginePlan(v);
    const proj = ses.project();
    return {
      basis: "engine",
      units, cell_units: orders.reduce((k, o) => k + o.cell_units, 0), manual_units: orders.reduce((k, o) => k + o.manual_units, 0),
      rule: "Cut-off first, ties by route order; heavy items first in each tote. The cell takes the cell-eligible units; the manual station takes the rest and every failed grasp.",
      order: proj.orders.map((o) => ({ id: o.id, name: o.name, cutoff: o.cutoff, status: o.status, ...(o.projected_last_unit ? { projected_last_unit: o.projected_last_unit, slack_min: o.slack_min, at_risk: o.at_risk } : {}) })),
      night: {
        cell_hours: r2(n.cell_h), labour_hours: r2(n.hybrid_h), labour_eur: r2(n.hybrid_eur),
        by_hand_hours: r2(n.manual_h), by_hand_eur: r2(n.manual_eur)
      },
      per_1000: { hybrid_hours: r2(p.per_thousand.hybrid_h), hybrid_eur: r2(p.per_thousand.hybrid_eur), by_hand_hours: r2(p.per_thousand.manual_h), by_hand_eur: r2(p.per_thousand.manual_eur) },
      rates: {
        picks_per_labour_hour: v.r_m, cell_attempts_per_hour: v.r_c, grasp_success: v.p, cell_share: v.s,
        robot_picks_per_cell_hour: Math.round(p.per_cell_hour.robot_picks), labour_cost_eur_per_hour: v.c
      },
      sources: { r_m: sourceOf("r_m"), c: sourceOf("c"), s: sourceOf("s"), p: sourceOf("p"), r_c: sourceOf("r_c") },
      note: "Plan figures are the engine's expected values; tonight's simulated result is sim_night_report."
    };
  }

  function kpis(i) {
    const base = ctx.getInputs();
    const w = i.what_if && typeof i.what_if === "object" ? i.what_if : null;
    const v = { ...base };
    const changed = [];
    if (w) {
      for (const [k, x] of Object.entries(w)) {
        const def = PARAMETERS.find((p) => p.id === k);
        if (!def || !["p", "s", "r_m", "r_c", "c", "N"].includes(k)) return { error: `what_if takes p, s, r_m, r_c, c or N, not ${k}.` };
        const n = Number(x);
        if (!Number.isFinite(n) || n < def.min || n > def.max) return { error: `${def.label} (${k}): ${x} is outside ${def.min} to ${def.max}.` };
        if (n !== base[k]) { v[k] = n; changed.push(`${k} ${n}`); }
      }
    }
    const p = enginePlan(v);
    return {
      basis: changed.length ? "what_if" : "engine inputs",
      ...(changed.length ? { what_if: changed.join(", "), note: "A labelled what-if: no option, draft or summary may quote it." } : {}),
      inputs: PARAMETERS.filter((x) => ["N", "r_m", "c", "s", "p", "r_c"].includes(x.id)).map((x) => ({ id: x.id, label: x.label, value: v[x.id], unit: x.unit, source: x.basis })),
      per_1000: { by_hand_hours: r2(p.per_thousand.manual_h), by_hand_eur: r2(p.per_thousand.manual_eur), hybrid_hours: r2(p.per_thousand.hybrid_h), hybrid_eur: r2(p.per_thousand.hybrid_eur), saving_eur: r2(p.per_thousand.saving_eur) },
      per_cell_hour: { robot_picks_per_cell_hour: Math.round(p.per_cell_hour.robot_picks), break_even_eur_per_cell_hour: r2(p.per_cell_hour.break_even_eur) },
      per_year: {
        hours_avoided: Math.round(p.per_year.hours_avoided), avoided_eur: Math.round(p.per_year.eur_avoided), cell_hours: Math.round(p.per_year.cell_hours),
        cells_on_night_shift: Number(roundHalfUp(p.per_year.cells_night_shift, 1)), cells_round_the_clock: Number(roundHalfUp(p.per_year.cells_round_clock, 1)),
        qualifier: "illustrative, per reference site, gross, before cell costs; no payback claim"
      }
    };
  }

  function project() {
    const p = ses.project();
    const risk = p.orders.filter((o) => o.at_risk);
    return {
      at: p.at, band_minutes: POLICY.E4.bandMinutes,
      orders: p.orders,
      at_risk: risk.map((o) => o.id),
      levers_in_force: leversInForce(ses),
      note: risk.length ? `${listJoin(risk.map((o) => o.name))} projected inside the ${POLICY.E4.bandMinutes}-minute band of the cut-off.` : "No open order inside the risk band."
    };
  }

  /** The costing as the model sees it: rounded, with the lever texts and the late counts in words. */
  function compactCosting(res, v) {
    const lateIn = (m) => Object.entries(m || {}).map(([id, n]) => ({ order: id, name: storeName(id), late: `${n} of ${res.replications}` }));
    const tonight = (t) => ({ late: t.late.map(storeName), on_time: `${t.on_time} of ${t.orders}`, smallest_slack_min: Number(roundHalfUp(t.smallest_slack_min, 1)) });
    const priced = (x) => ({
      expected_late_orders: r3(x.expected_late_orders), late_orders_eur: r2(x.late_orders_eur), expected_total_eur: r2(x.expected_total_eur),
      late_in_replications: lateIn(x.late_by_order), tonight: tonight(x.tonight)
    });
    return {
      costed_at: clockOf(res.now_ms - 1), replications: res.replications, seed: res.seed,
      late_cost_eur: r2(v.late_cost), labour_cost_eur_per_hour: r2(v.c), call_in: { minimum_hours: v.callin_min_h, premium: `${Math.round(v.callin_premium * 100)} %` },
      do_nothing: { extra_labour_eur: r2(res.baseline.extra_labour_eur), ...priced(res.baseline) },
      variants: res.variants.map((x) => ({
        variant_id: x.variant_id, name: x.name, levers: x.levers.map((l) => leverText(l, storeName)),
        extra_labour_eur: r2(x.extra_labour_eur), call_in_eur: r2(x.call_in_eur), extra_picks_eur: r2(x.extra_picks_eur),
        ...priced(x)
      })),
      note: `Expected over ${res.replications} seeded replications of tonight with common random numbers (tonight is the first); expected total = extra labour + expected late orders × the cost per late order. Lower is better.`
    };
  }

  async function costOptionsTool(i) {
    if (!ses.wake()) return { error: "Options are priced at a wake-up only." };
    const list = Array.isArray(i.variants) ? i.variants : [];
    const variants = list.map((x) => ({ variant_id: String(x?.variant_id ?? "").trim(), name: String(x?.name ?? "").slice(0, 90), levers: Array.isArray(x?.levers) ? x.levers.map(cleanLever) : [] }));
    const problems = validateVariants(variants, ses.night);
    if (problems.length) return { error: `The option set is not valid: ${problems.join("; ")}.` };
    // The costing simulates 20 nights for each variant (about a second): let the screen show the call first.
    await pause(30);
    const v = ctx.getInputs();
    const res = ses.cost(variants, v);
    const compact = compactCosting(res, v);
    run.costing = { res, compact, at: ses.now() };
    return compact;
  }

  function cleanLever(l) {
    const out = { type: String(l?.type || "") };
    const list = l?.store_ids ?? l?.order;
    if (list !== undefined) out.store_ids = Array.isArray(list) ? list.map((x) => String(x).trim().toUpperCase()) : list;
    if (l?.share !== undefined) out.share = Number(l.share);
    if (l?.start !== undefined && l.start !== null && l.start !== "") out.start = String(l.start).trim();
    if (l?.minutes !== undefined) out.minutes = Number(l.minutes);
    return out;
  }

  function nightReport() {
    const st = ses.state();
    const v = ctx.getInputs();
    const final = run.nightOver || !!st.ended;
    const f = final ? ses.figures() : tonightSoFar(st);
    const per = f.labour_hours_per_1000;
    const p = enginePlan(v).per_thousand;
    const orders = final ? ses.run.orders : null;
    const late = final ? orders.filter((o) => !o.on_time && !o.moved).map((o) => o.name) : visibleOrders(st).filter((o) => o.status === "late" || o.status === "late_done").map((o) => o.name);
    const moved = final ? orders.filter((o) => o.moved).map((o) => o.name) : visibleOrders(st).filter((o) => o.status === "moved").map((o) => o.name);
    return {
      final, at: clockOf(final ? ses.run.end_ms : ses.now()), seed: ses.seed,
      units_repacked: final ? f.units_repacked : f.units_packed,
      grasp_attempts: f.attempts, successes: f.successes, failed_grasps: f.failures, manual_picks: f.manual_picks,
      escalations: f.escalations, corrections: f.corrections,
      labour_hours: r2(f.labour_hours), labour_eur: r2(f.labour_hours * v.c),
      called_in_hours: r2(final ? ses.run.stats.call_in_billed_ms / 3600000 : callInHours(st)),
      labour_hours_per_1000: per === null || per === undefined ? null : r2(per),
      labour_eur_per_1000: per === null || per === undefined ? null : r2(per * v.c),
      cell_hours: r2(f.cell_hours), robot_picks_per_cell_hour: f.robot_picks_per_cell_hour ? Math.round(f.robot_picks_per_cell_hour) : null,
      orders_on_time: final ? f.orders_on_time : st.on_time, orders: final ? f.orders : visibleOrders(st).length,
      ...(final ? {} : { trucks_gone: st.dispatched }),
      late, moved_to_next_wave: moved,
      plan_per_1000: { hybrid_hours: r2(p.hybrid_h), hybrid_eur: r2(p.hybrid_eur), by_hand_hours: r2(p.manual_h), by_hand_eur: r2(p.manual_eur) },
      labour_cost_eur_per_hour: r2(v.c),
      note: final ? "Tonight's simulated result (seeded and reproducible). Labour counts the base picker's picks at the manual picking rate and any called-in hours as billed." : "So far tonight; final at night end."
    };
  }

  // ---- the night: wake-ups ------------------------------------------------------------------------------
  function describeWakeRaw(w) {
    return { wake_id: w.wake_id, kind: w.kind, kinds: w.kinds || [w.kind], clock: w.clock || clockOf(w.t), t: w.t };
  }

  /** What a wake-up is about, in the agent's terms. */
  function describeWake(w) {
    const st = ses.state();
    const items = [];
    for (const it of w.items || []) {
      if (it.kind === "night_start") items.push({ kind: "night_start", orders: it.orders, units: it.units });
      else if (it.kind === "correction") {
        const c = [...st.corrections].reverse().find((x) => x.sku === it.sku);
        const store = c?.unit_id ? ses.night.units.find((u) => u.id === c.unit_id)?.order || null : null;
        const o = store ? st.orders.get(store) : null;
        items.push({
          kind: "correction", sku: it.sku, name: itemName(it.sku), sensor: c?.sensor || "scale", old_g: it.old, new_g: it.new,
          ...(c?.unit_id ? { unit: c.unit_id } : {}), ...(store ? { store, store_name: storeName(store) } : {}),
          ...(o && o.tote_units ? { tote: { tote_no: o.tote_no, units: o.tote_units, weight_kg: Math.round(o.tote_weight / 10) / 100 } } : {}),
          applies_to: "the whole SKU"
        });
      } else if (it.kind === "escalation") {
        const e = st.escalations.find((x) => x.escalation_id === it.escalation_id) || it;
        items.push({
          kind: "escalation", escalation_id: it.escalation_id, rule: e.rule, rule_name: POLICY[e.rule]?.name,
          ...(e.sku ? { sku: e.sku, name: itemName(e.sku) } : {}), ...(e.store ? { store: e.store, store_name: storeName(e.store) } : {}),
          ...(e.unit_id ? { unit: e.unit_id } : {}), ...(e.barcode ? { barcode: e.barcode } : {}),
          reason: e.reason, handed_to: e.to === "manual_station" ? "a person at the manual station" : "a person",
          needs_confirmation: !!e.needs_confirmation, raised_by: "the escalation rules in code"
        });
      } else if (it.kind === "new_order") {
        const o = st.orders.get(it.order);
        items.push({ kind: "new_order", order: it.order, store: it.store, store_name: storeName(it.store), units: it.units, due: it.due, ...(o ? { cell_units: o.cell_units, manual_units: o.manual_units } : {}) });
      } else if (it.kind === "cutoff_risk") {
        const r = [...st.risks].reverse().find((x) => x.t <= w.t) || null;
        items.push({ kind: "cutoff_risk", stores: (r?.stores || []).map((x) => ({ store: x.store, name: storeName(x.store), projected: x.projected, cutoff: x.cutoff, slack_min: x.slack_min, new: !!x.new })) });
      } else if (it.kind === "night_end") {
        const late = ses.run.orders.filter((o) => !o.on_time);
        items.push({ kind: "night_end", on_time: it.on_time, orders: it.orders, late: late.map((o) => o.name) });
      }
    }
    return { wake_id: w.wake_id, clock: w.clock || clockOf(w.t), kinds: w.kinds || [w.kind], items };
  }

  const HINTS = {
    correction: "Read the item and rehearse its grasp (world_get_item, cell_get_grasp_plan), look at the store's tote (wms_get_order), say what changed in a \"Revised:\" line, rebalance the tote if that helps (wms_rebalance_tote), then sim_advance.",
    escalation: "The rules in code have already handed the item to a person. Say why in one or two sentences; where a person must confirm something, ask with ui_request_confirmation; then sim_advance.",
    new_order: "Check the projection (sim_project). If an order is at risk, price exactly three options (sim_cost_options) and propose them (ui_propose_options); after the decision, apply it (wms_apply_option), draft what it contains, wait for the approvals, then sim_advance.",
    cutoff_risk: "Check the projection (sim_project). If an order is at risk, price exactly three options (sim_cost_options) and propose them (ui_propose_options); after the decision, apply it (wms_apply_option), draft what it contains, wait for the approvals, then sim_advance.",
    night_end: "The night is over. Read tonight's result (sim_night_report) and publish the management summary (ui_final_report); then end your turn."
  };

  async function advance() {
    if (run.nightOver) return refuse("The night is over. Read sim_night_report and publish the management summary with ui_final_report.");
    if (run.options && !run.decision) return refuse("The options wait for the person's decision; the night stands still until then. Call ui_await_decision.");
    if (run.decision && run.decision.id !== "baseline" && !run.decision.applied && ctx.autonomy() !== "advise") {
      return refuse(`${run.decision.label} is approved but not applied yet. Apply it with wms_apply_option, draft what it contains, then call sim_advance.`);
    }
    const pending = pendingDrafts();
    if (pending) return refuse(`${pending} draft${pending === 1 ? " waits" : "s wait"} for the person's approval; the night stands still until then. Call ui_await_approvals.`);
    setPhase("picking");
    const w = await ctx.advance();
    if (!w) return { error: "The night was stopped." };
    // A new wake-up: the options and the costing of the last one are closed.
    run.wakes += 1;
    run.options = null;
    run.optionsPayload = null;
    run.decision = null;
    run.rejected.clear();
    run.costing = null;
    run.wake = describeWakeRaw(w);
    const out = describeWake(w);
    const kinds = out.kinds;
    if (kinds.includes("night_end")) { run.nightOver = true; setPhase("executing"); }
    else if (kinds.includes("new_order") || kinds.includes("cutoff_risk")) setPhase("replanning");
    else setPhase("perceiving");
    const hint = kinds.includes("night_end") ? HINTS.night_end : kinds.map((k) => HINTS[k]).filter(Boolean).at(-1) || null;
    return { ...out, night_over: run.nightOver, ...(hint ? { next: hint } : {}) };
  }

  // ---- safety actions --------------------------------------------------------------------------------------
  function rebalanceTote(i) {
    if (!ses.wake()) return { error: "Totes can be rebalanced at a wake-up only." };
    const id = String(i.store_id || "").trim().toUpperCase();
    const st = ses.state();
    const o = st.orders.get(id);
    if (!o || !visibleOrders(st).includes(o)) return { error: `No order "${i.store_id}" tonight.` };
    const reason = String(i.reason || "").trim().slice(0, 200);
    if (!reason) return { error: "Give a one-line reason." };
    if (o.status !== "open") return refuse(`${o.name}'s truck has gone; there is no tote to rebalance.`);
    if (!o.tote_units) return refuse(`${o.name} has no tote in progress: the next unit opens a fresh tote anyway.`);
    const { levers, update } = ses.apply([{ type: "close_tote", store_ids: [id] }], { source: "safety" });
    ctx.emit("plan_update", { ...update, reason });
    return {
      store: id, store_name: o.name,
      closes: { tote_no: o.tote_no, units: o.tote_units, weight_kg: Math.round(o.tote_weight / 10) / 100 },
      next_tote_no: o.tote_no + 1, from: clockOf(levers[0].from_ms), reason,
      note: "A safety action, allowed at every autonomy level: the current tote closes before the next unit, which opens a new tote."
    };
  }

  function routeToManual(i) {
    if (!ses.wake()) return { error: "Items can be routed at a wake-up only." };
    const reason = String(i.reason || "").trim().slice(0, 200);
    if (!reason) return { error: "Give a one-line reason." };
    const fragileOnly = i.fragile_only === true;
    const sku = fragileOnly ? null : String(i.sku_id || "").trim().toUpperCase();
    if (!fragileOnly) {
      const it = ses.night.itemsBySku.get(sku);
      if (!it) return { error: `No item "${i.sku_id ?? ""}" in the item master; give sku_id or fragile_only.` };
      if (!it.cell) return refuse(`${it.sku} ${it.name} is not handled by the cell: it already goes to the manual station.`);
    }
    const routed = new Set();
    let fragileRouted = false;
    for (const l of ses.levers()) {
      if (l.type === "route_to_manual") { if (l.fragile_only) fragileRouted = true; for (const x of l.sku_ids || []) routed.add(x); }
      if (l.type === "manual_for_fragile") fragileRouted = true;
    }
    const already = fragileOnly ? fragileRouted : routed.has(sku) || (fragileRouted && !!ses.night.itemsBySku.get(sku)?.fragile);
    if (already) return refuse(fragileOnly ? "Fragile items already go to the manual station." : `${sku} already goes to the manual station.`);
    const lever = fragileOnly ? { type: "route_to_manual", fragile_only: true } : { type: "route_to_manual", sku_ids: [sku] };
    const { levers, update } = ses.apply([lever], { source: "safety" });
    ctx.emit("plan_update", { ...update, reason });
    // The night computed with the lever says how many units the cell hands over (its first units_routed event from now).
    const moved = ses.run.events.slice(ses.played()).find((e) => e.type === "units_routed" && e.payload.reason === "routed")?.payload.units || 0;
    return {
      what: leverText(lever, storeName), from: clockOf(levers[0].from_ms), units_moved: moved, reason,
      note: "A safety action, allowed at every autonomy level. No tool returns these units to the cell."
    };
  }

  function proposeEntry(i) {
    const code = String(i.barcode || "").trim();
    if (!/^\d{8,14}$/.test(code)) return { error: `"${i.barcode}" is not a barcode (8 to 14 digits).` };
    if (ses.night.known.has(code)) return refuse(`${code} is already in the item master.`);
    const seen = ses.state().escalations.some((e) => e.rule === "E1" && e.barcode === code);
    if (!seen) return refuse(`The camera has not reported barcode ${code} tonight; a provisional entry needs an unknown item on the infeed.`);
    const source = i.source === "open_food_facts" ? "open_food_facts" : i.source === "scale_and_camera" ? "scale_and_camera" : null;
    if (!source) return { error: "source must be open_food_facts or scale_and_camera." };
    if (source === "open_food_facts" && !(ctx.lookup?.sources?.() || []).some((x) => x.barcode === code && x.found)) {
      return refuse(`No Open Food Facts result for ${code} in this run: look it up with open_lookup_barcode first, or use source scale_and_camera.`);
    }
    const name = String(i.name || "").trim().slice(0, 120);
    if (!name) return { error: "name is required." };
    const entry = { barcode: code, name, net_content: String(i.net_content || "").trim().slice(0, 40) || null, source, status: "unverified", created: clockOf(ses.now()) };
    run.provisional.set(code, entry);
    ctx.emit("provisional_entry", { ...entry });
    return { ...entry, note: "Provisional and unverified: tonight's units stay at the manual station until a person confirms the entry (ui_request_confirmation)." };
  }

  // ---- options and decisions -------------------------------------------------------------------------------
  async function proposeOptions(i) {
    if (run.decision) return refuse(`A decision was taken at this wake-up already: ${run.decision.label}. Continue with it.`);
    if (run.options) return refuse("The options are on screen already. Call ui_await_decision to wait for the person.");
    const c = run.costing;
    const list = Array.isArray(i.options) ? i.options : [];
    if (list.length !== 3) return refuse("Exactly three options are required (doing nothing is added by itself).");
    if (!c) return refuse("No costed options at this wake-up yet. Call sim_cost_options with exactly three variants first.");
    const seen = new Set();
    const options = [];
    for (const [k, o] of list.entries()) {
      const v = c.res.variants.find((x) => x.variant_id === o?.variant_id);
      if (!v) return refuse(`variant_id "${o?.variant_id}" is not in the latest sim_cost_options result (has: ${c.res.variants.map((x) => x.variant_id).join(", ")}).`);
      if (seen.has(v.variant_id)) return refuse(`variant_id "${v.variant_id}" is used twice.`);
      seen.add(v.variant_id);
      options.push({
        id: v.variant_id, letter: LETTERS[k],
        title: String(o.title || v.name).slice(0, 90),
        description: String(o.description || "").slice(0, 400),
        residual_risk: String(o.residual_risk || "").slice(0, 300),
        levers_text: v.levers.map((l) => leverText(l, storeName)),
        ...optionFigures(v),
        recommended: v.variant_id === i.recommended_variant_id
      });
    }
    if (!options.some((o) => o.recommended)) return refuse(`recommended_variant_id "${i.recommended_variant_id ?? ""}" is not one of the options (${options.map((o) => o.id).join(", ")}).`);
    // The texts on the cards may quote only the facts and the figures of this costing.
    run.ledger.setOptionsSource(c.compact);
    let baselineText = String(i.baseline_description || "").slice(0, 300);
    const audit = figureCheck([baselineText, ...options.flatMap((o) => [o.title, o.description, o.residual_risk])].join("\n"), "options", "options", "ui_propose_options");
    if (audit.reject) return audit.reject;
    if (audit.flag) {
      for (const o of options) { o.title = mark(o.title, audit.bad); o.description = mark(o.description, audit.bad); o.residual_risk = mark(o.residual_risk, audit.bad); }
      baselineText = mark(baselineText, audit.bad);
    }
    // Decisions queued for an earlier set of options are dropped: they do not count for this one.
    while (ctx.takeOptionDecision(() => true)) { /* discard stale decisions */ }
    run.optionsSeq += 1;
    run.options = options;
    run.rejected.clear();
    run.optionsPayload = optionsPayload({ seq: run.optionsSeq, res: c.res, options, recommended: i.recommended_variant_id, baselineText, inputs: ctx.getInputs(), now_ms: c.at });
    if (audit.flag) run.optionsPayload.unchecked = audit.bad;
    setPhase("options");
    ctx.emit("options", run.optionsPayload);
    return waitForDecision();
  }

  async function awaitDecision() {
    if (!run.options) return refuse("No options are on screen at this wake-up. Use ui_propose_options first.");
    if (run.decision) return refuse(`A decision was taken already: ${run.decision.label}. Continue with it.`);
    return waitForDecision();
  }

  /** A decision counts only for the options on screen, and only once per option. */
  function validDecision(ev) {
    const p = ev?.payload || {};
    if (p.options_seq !== run.optionsSeq) return false;
    if (p.option_id === "baseline") return p.decision === "approved";
    return run.options.some((o) => o.id === p.option_id) && !run.rejected.has(p.option_id);
  }

  async function waitForDecision() {
    setPhase("awaiting_approval");
    const ev = await ctx.waitUntil(() => ctx.takeOptionDecision(validDecision));
    const { option_id: id, decision } = ev.payload;
    const opt = run.options.find((o) => o.id === id) || null;
    const label = id === "baseline" ? "Do nothing" : `Option ${opt.letter}: ${opt.title}`;
    if (decision === "approved") {
      const v = id === "baseline" ? null : run.costing.res.variants.find((x) => x.variant_id === id);
      run.decision = { id, letter: opt ? opt.letter : null, title: opt ? opt.title : "Do nothing", label, levers: v ? v.levers : [], applied: false, wake_id: run.wake?.wake_id || null, clock: clockOf(ses.now()) };
      run.decisions.push(run.decision);
      setPhase("executing");
      if (id === "baseline") {
        return {
          decision: "approved", option_id: "baseline", option: label,
          next: "The person chose to do nothing: the plan stays as it is. Nothing goes to a store, a carrier or the picker pool. Draft one internal memo recording the decision (ui_draft_action, type memo, for the shift handover), then ui_await_approvals, then sim_advance."
        };
      }
      const kinds = new Set(v.levers.map((l) => l.type));
      const may = [
        kinds.has("call_in_picker") ? "a call_in message to the on-call picker pool" : null,
        "an email to a store whose order the option changes",
        kinds.has("move_to_next_wave") ? "an email to the carrier about the moved order" : null,
        "an internal memo"
      ].filter(Boolean);
      return {
        decision: "approved", option_id: id, option: label, refer_to_it_as: `option ${opt.letter}`,
        figures: { extra_labour: eur2(opt.extra_labour_eur), late_store_orders_expected: opt.expected_late_orders, late_orders_cost: eur2(opt.late_orders_eur), expected_total: eur2(opt.expected_total_eur) },
        levers: opt.levers_text,
        next: ctx.autonomy() === "advise"
          ? "Advise mode: the person applies the option in the interface. Draft what it contains, then ui_await_approvals, then sim_advance."
          : `Call it "option ${opt.letter}" (as on screen). Apply it with wms_apply_option (option_id ${id}). Then draft only what it contains (${listJoin(may)}), call ui_await_approvals, then sim_advance.`
      };
    }
    run.rejected.add(id);
    const remaining = run.options.filter((o) => !run.rejected.has(o.id)).map((o) => `Option ${o.letter} (${o.id})`);
    return {
      decision: "rejected", option_id: id, option: label, ...(opt ? { refer_to_it_as: `option ${opt.letter}` } : {}),
      remaining_options: remaining,
      next: remaining.length
        ? "Acknowledge the rejection in one sentence and draft nothing for it. Then call ui_await_decision for the next decision."
        : "All three options were rejected. Say that the plan stays as it is unless the person chooses to do nothing, then call ui_await_decision once more."
    };
  }

  function applyOption(i) {
    const optionId = String(i.option_id || "").trim();
    const d = run.decision;
    const err = applyError({ autonomy: ctx.autonomy(), approved: d, optionId });
    if (err) return refuse(err);
    if (d.applied) return refuse(`${d.label} is applied already. Continue with its drafts.`);
    const { levers, update } = ses.apply(d.levers, { source: "decision", option_id: d.id });
    d.applied = true;
    ctx.emit("plan_update", update);
    setPhase("executing");
    return {
      applied: true, option_id: d.id, letter: d.letter, from: clockOf(levers[0]?.from_ms ?? ses.now() + 1),
      levers: levers.map((l) => ({ what: leverText(l, storeName), from: clockOf(l.from_ms), ...(typeof l.until_ms === "number" ? { until: clockOf(l.until_ms) } : {}) })),
      note: "The plan changes from the next moment; everything the night has shown so far stays as it was."
    };
  }

  /** The decision drafts follow: this wake-up's, else the night's latest. */
  const decisionForDrafts = () => run.decision || run.decisions.at(-1) || null;

  // ---- drafts and approvals --------------------------------------------------------------------------------
  function pendingDrafts() {
    return [...ctx.drafts.values()].filter((d) => d.status === "pending").length;
  }

  function draftAction(i) {
    const type = DRAFT_TYPES.includes(i.type) ? i.type : null;
    if (!type) return { error: `type must be ${DRAFT_TYPES.join(", ")}.` };
    const recipient = String(i.recipient || "").trim().slice(0, 160);
    const subject = String(i.subject || "").trim().slice(0, 200);
    const raw = String(i.body || "").trim();
    if (!recipient || !subject || !raw) return { error: "recipient, subject and body are required." };
    const approved = decisionForDrafts();
    const rule = draftError({ type, recipient, approved: approved ? { id: approved.id, label: approved.label } : null, levers: approved?.levers || [], stores: world.stores, night: ses.night });
    if (rule) return refuse(rule);
    let body = finalizeDraft(type, raw);
    const audit = figureCheck(`${subject}\n${raw}`, "draft", "draft", "ui_draft_action");
    if (audit.reject) return audit.reject;
    if (audit.flag) body = finalizeDraft(type, `${raw}\n\nUnchecked figures: ${audit.flag}. Verify them against the option card before approving.`);
    const action_id = `act-${ctx.drafts.size + 1}`;
    ctx.drafts.set(action_id, { status: "pending", type, recipient, subject });
    setPhase("executing");
    ctx.emit("action_draft", { action_id, type, recipient, subject, body, status: "pending", ...(audit.flag ? { unchecked: audit.bad } : {}) });
    return { action_id, status: "pending_approval", note: `Queued in the Outbox as ${DRAFT_LABELS[type].toLowerCase()}. Nothing is sent.` };
  }

  async function awaitApprovals() {
    if (!ctx.drafts.size) return refuse("There are no drafts. Use ui_draft_action first.");
    if (pendingDrafts()) {
      setPhase("awaiting_approval");
      const n = pendingDrafts();
      ctx.emit("notice", { level: "info", text: `Waiting for your approval of ${n} draft${n === 1 ? "" : "s"} in the Outbox.` });
      await ctx.waitUntil(() => pendingDrafts() === 0);
    }
    setPhase("executing");
    const decisions = [...ctx.drafts.entries()].map(([id, d]) => ({ action_id: id, type: d.type, recipient: d.recipient, subject: d.subject, decision: d.status }));
    return {
      all_decided: true,
      approved: decisions.filter((d) => d.decision === "approved").length,
      rejected: decisions.filter((d) => d.decision === "rejected").length,
      decisions,
      next: run.nightOver
        ? "Publish the management summary with ui_final_report. Approved drafts are cleared for sending by a person; nothing was sent."
        : "Approved drafts are cleared for sending by a person; nothing was sent. Call sim_advance to let the night continue."
    };
  }

  // ---- confirmations ----------------------------------------------------------------------------------------
  let confirmSeq = 0;
  async function requestConfirmation(i) {
    const subject = String(i.subject || "").trim().slice(0, 160);
    const reason = String(i.reason || "").trim().slice(0, 400);
    if (!subject || !reason) return { error: "subject and reason are required." };
    const code = i.entry_barcode === undefined || i.entry_barcode === null || i.entry_barcode === "" ? null : String(i.entry_barcode).trim();
    if (code && !run.provisional.has(code)) return refuse(`No provisional entry for ${code}. Create it with world_propose_entry first.`);
    const audit = figureCheck(`${subject}\n${reason}`, "confirmation", "confirmation", "ui_request_confirmation");
    if (audit.reject) return audit.reject;
    const request_id = `conf-${++confirmSeq}`;
    const before = run.phase;
    setPhase("awaiting_approval");
    ctx.emit("confirmation_request", { request_id, subject: audit.flag ? mark(subject, audit.bad) : subject, reason: audit.flag ? mark(reason, audit.bad) : reason, ...(code ? { entry_barcode: code } : {}), choices: ["confirm", "reject"] });
    const ev = await ctx.waitUntil(() => ctx.takeConfirmation((e) => e.payload.request_id === request_id));
    const choice = ev.payload.choice === "confirm" ? "confirm" : "reject";
    if (code) {
      const entry = run.provisional.get(code);
      entry.status = choice === "confirm" ? "confirmed by a person" : "rejected by a person";
    }
    setPhase(before && before !== "awaiting_approval" ? before : "perceiving");
    return {
      request_id, choice,
      ...(code ? { entry: { ...run.provisional.get(code) } } : {}),
      note: code
        ? choice === "confirm" ? "The entry is confirmed for the item master; tonight's units of this item stay at the manual station." : "The entry is rejected; the units stay set aside for a person."
        : "Recorded."
    };
  }

  // ---- the management summary --------------------------------------------------------------------------------
  /** The decision the summary's outcome follows: an approved option if there was one, else doing nothing. */
  function decisionForReport() {
    return run.decisions.find((d) => d.id !== "baseline") || run.decisions.find((d) => d.id === "baseline") || null;
  }

  function finalReport(i) {
    if (!run.nightOver) return refuse("The management summary closes the night: call sim_advance until the night-end wake-up first.");
    const pending = pendingDrafts();
    if (pending) return refuse(`${pending} draft${pending === 1 ? " is" : "s are"} still pending. Call ui_await_approvals first.`);
    const st = ses.state();
    const outcome = reportOutcome({
      requested: i.outcome, optionsShown: !!(run.options && !run.decision), approved: decisionForReport(),
      corrections: st.corrections.length, escalations: st.escalations.length
    });
    if (outcome.error) return refuse(outcome.error);
    let markdown = String(i.markdown || "").trim().slice(0, 19000);
    if (markdown.length < 40) return { error: "The summary is empty. Write a short Markdown management summary." };
    const audit = figureCheck(markdown, "report", "report", "ui_final_report");
    if (audit.reject) return audit.reject;
    if (audit.flag) markdown = `${markdown}\n\n*Unchecked figures (no tool returned them): ${audit.flag}.*`;
    // Every summary states what it is, whatever the text says.
    if (ctx.mode === "live" && !/live agent run/i.test(markdown)) markdown = `${markdown}\n\n${LIVE_REPORT_FOOTER}`;
    if (ctx.mode !== "live" && !/simulated run/i.test(markdown)) markdown = `${markdown}\n\n${SIM_REPORT_FOOTER}`;
    run.reported = true;
    run.outcome = outcome.outcome;
    ctx.emit("report", { markdown, outcome: run.outcome });
    return { ok: true, published: true, outcome: run.outcome, next: "End your turn now with one short closing sentence." };
  }

  /**
   * Figure audit for free text, by scope (js/guards.js): refused up to AGENT.figureRetries times with the
   * figures to fix, then let through with the unchecked figures named or marked, and said in the console.
   */
  function figureCheck(text, kind, scope, tool) {
    const bad = run.ledger.unknown(text, scope);
    if (!bad.length) return {};
    const list = bad.slice(0, 6).map((a) => a.raw).join(", ");
    if (run.figureRejections[kind] < AGENT.figureRetries) {
      run.figureRejections[kind] += 1;
      const allowed = scope === "report"
        ? "the figures of the engine, the night simulation and the warehouse system (never a what-if)"
        : "the figures of the sim_cost_options result the options rest on, or the warehouse system, cell and world-model results (never a what-if)";
      return { reject: refuse(`These figures match nothing this text may quote: ${list}. Use ${allowed}, written as the tools give them (or leave the figure out), then call ${tool} again.`, { figures: bad.slice(0, 6).map((a) => a.raw) }) };
    }
    const where = { draft: "draft", report: "summary", options: "option cards", confirmation: "confirmation" }[kind];
    ctx.emit("notice", { level: "warn", text: `The ${where} quote${kind === "options" ? "" : "s"} figures no tool returned (${list}); they are marked as unchecked.` });
    return { flag: list, bad: bad.map((a) => a.raw) };
  }

  return {
    execute,
    /** What the agent loop and the tests need to know about the run. */
    state: () => ({
      reported: run.reported, outcome: run.outcome, nightOver: run.nightOver, wakes: run.wakes,
      wake: run.wake, phase: run.phase,
      optionsPending: !!(run.options && !run.decision),
      decision: run.decision ? { ...run.decision } : null,
      decisions: run.decisions.map((d) => ({ ...d })),
      pendingDrafts: pendingDrafts(), drafts: ctx.drafts.size,
      optionsSeq: run.optionsSeq, calls: { ...run.calls },
      figureRejections: { ...run.figureRejections },
      provisional: [...run.provisional.values()].map((e) => ({ ...e }))
    }),
    ledger: () => run.ledger,
    setPhase
  };
}

/** Marks unchecked figures in a short text shown on a card: "€140" → "€140 (unchecked)". */
function mark(text, bad = []) {
  let out = String(text || "");
  for (const raw of bad) out = out.split(raw).join(`${raw} (unchecked)`);
  return out;
}

