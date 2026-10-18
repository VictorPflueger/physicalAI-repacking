// Guardrail policy shared by the live tools (js/tools.js) and the simulation script checker
// (js/sim_check.js), so a live run and a scripted replay are held to the same rules (PLAN.md §e):
//   - figures: which tool results a text may quote, by where the text goes (a draft may quote only the
//     facts and the costed result the options rest on, never a what-if);
//   - decisions: options are the three variants of the latest costing, a decision belongs to the set it
//     was taken on, and only the approved option is applied (after the approval, and not in Advise mode);
//   - drafts: only the kinds of action the approved option contains (a call-in needs a call-in lever, a
//     store email a change for that store, after "do nothing" only a memo);
//   - the management summary's outcome follows the decisions.
// Escalations are not here on purpose: js/escalation.js and the night simulation raise them, and no
// tool lets the model raise one, switch a rule off or send an escalated unit back to the cell.

import { FigureSet, collectFigures, unknownFigures } from "./figures.js";

// ---- figures ---------------------------------------------------------------------------------------

/**
 * The figures a run's tools returned, kept apart by origin, so each kind of text can quote only what it
 * may: facts (the warehouse system, the cell, the world model, Open Food Facts, the night's wake-ups)
 * and engine results (plan, KPIs, projections, option costings, the night report; a what-if apart).
 */
export class FigureLedger {
  constructor() {
    this.facts = new FigureSet();
    this.engine = [];          // { tool, what_if, set, res }
    this.optionsSource = null; // the costing the options on screen rest on
  }
  addFacts(result) { collectFigures(result, this.facts); }
  addEngine(tool, res, { what_if = false } = {}) {
    const entry = { tool, what_if, res, set: collectFigures(res) };
    this.engine.push(entry);
    return entry;
  }
  setOptionsSource(res) {
    this.optionsSource = this.engine.find((e) => e.res === res) || this.addEngine("sim_cost_options", res);
  }
  clone() {
    const c = new FigureLedger();
    c.facts.items = this.facts.items.slice();
    c.engine = this.engine.slice();
    c.optionsSource = this.optionsSource;
    return c;
  }
  /**
   * narration: anything a tool returned; report: the facts and every engine result that is not a
   * what-if; options, draft and confirmation: the facts and the costing the options rest on.
   */
  scope(kind) {
    const all = this.engine.map((e) => e.set);
    const notWhatIf = this.engine.filter((e) => !e.what_if).map((e) => e.set);
    switch (kind) {
      case "narration": return [this.facts, ...all];
      case "report": return [this.facts, ...notWhatIf];
      case "options": case "draft": case "confirmation":
        return [this.facts, ...(this.optionsSource ? [this.optionsSource.set] : [])];
      default: return [this.facts];
    }
  }
  unknown(text, kind) {
    return [...new Map(unknownFigures(text, this.scope(kind)).map((f) => [f.raw, f])).values()];
  }
}

// ---- options and decisions ------------------------------------------------------------------------------

/**
 * May the approved option be applied now? autonomy: "advise" | "approve" | "bounded"; approved: { id } or
 * null; optionId: what the agent asks to apply. Returns an error message, or null.
 */
export function applyError({ autonomy = "approve", approved, optionId }) {
  if (autonomy === "advise") return "In Advise mode the agent recommends and a person applies the option in the interface. Do not apply it; say what you recommend and wait.";
  if (!approved) return "No option has been approved yet. Propose the options with ui_propose_options and wait for the person's decision.";
  if (approved.id === "baseline") return "The person chose to do nothing: there is no option to apply. Continue with the memo, the approvals and the night.";
  if (String(optionId || "") !== approved.id) return `Only the approved option can be applied: ${approved.label}. "${optionId}" was not approved.`;
  return null;
}

// ---- drafts -------------------------------------------------------------------------------------------

const STORE_ALIASES = { LUN: ["lünen", "luenen", "lunen"] };
const CARRIER = /\b(carrier|haulier|haulage|transport|freight|logistics partner|dispatch(?:er)?|truck)\b/i;

/** Which stores the levers change: the orders they name (the express order belongs to its store). */
export function storesChanged(levers = [], night = null) {
  const ids = new Set();
  for (const l of levers) for (const id of [...(l.store_ids || []), ...(l.order || [])]) ids.add(id);
  if (ids.has("XPR")) { ids.delete("XPR"); ids.add(night?.express?.store || "DOR"); }
  return ids;
}

/** The store a recipient names (by its town), or null. stores: [{ id, name }]. */
export function recipientStore(recipient, stores = []) {
  const r = String(recipient || "").toLowerCase();
  for (const s of stores) {
    const names = [s.name.toLowerCase(), ...(STORE_ALIASES[s.id] || [])];
    if (names.some((n) => new RegExp(`(^|[^\\p{L}])${n}([^\\p{L}]|$)`, "u").test(r))) return s;
  }
  return null;
}

/**
 * Which drafts a decision allows. approved: { id, label } or null; levers: the approved option's levers;
 * stores: the world's stores; night: the night (for the express order's store). Returns an error, or null.
 */
export function draftError({ type, recipient = "", approved, levers = [], stores = [], night = null }) {
  if (!approved) return "Drafts follow a person's decision. Propose the options with ui_propose_options and wait for the decision first.";
  if (approved.id === "baseline") {
    return type === "memo" ? null : "The person chose to do nothing: nothing goes to a store, a carrier or the picker pool. Draft one internal memo recording the decision (type memo), for example the shift handover.";
  }
  const kinds = new Set(levers.map((l) => l.type));
  const name = approved.label || "The approved option";
  if (type === "call_in" && !kinds.has("call_in_picker")) {
    return `${name} calls in nobody, so there is no message for the on-call picker pool. Draft only what the option contains.`;
  }
  if (type === "email") {
    const store = recipientStore(recipient, stores);
    const changed = storesChanged(levers, night);
    if (store && !changed.has(store.id)) {
      return `${name} changes nothing for ${store.name}, so there is no email to send there. A store email needs a change for that store (${[...changed].map((id) => stores.find((s) => s.id === id)?.name || id).join(", ") || "none"}).`;
    }
    if (!store && !(CARRIER.test(recipient) && kinds.has("move_to_next_wave"))) {
      return `An email goes to a store whose order the option changes${kinds.has("move_to_next_wave") ? " or to the carrier about the moved order" : ""}. Name the store in the recipient, for example "Ruhrkorb Soest, store manager", or draft an internal memo instead.`;
    }
  }
  return null;
}

// ---- the management summary ----------------------------------------------------------------------------

export const OUTCOMES = ["option_decided", "baseline_accepted", "correction_only", "escalation_only", "routine_night"];

/**
 * The outcome of the management summary, from the decisions and the night. Returns { outcome } or
 * { error }. optionsShown: options were on screen; approved: { id } or null; corrections, escalations:
 * how many the night had so far.
 */
export function reportOutcome({ requested, optionsShown, approved, corrections = 0, escalations = 0 }) {
  const asked = OUTCOMES.includes(requested) ? requested : null;
  if (approved) {
    const outcome = approved.id === "baseline" ? "baseline_accepted" : "option_decided";
    if (asked && asked !== outcome) return { error: `The outcome is ${outcome}: the person ${approved.id === "baseline" ? "chose to do nothing" : "approved an option"}. Write the summary for that decision and publish it with outcome "${outcome}".` };
    return { outcome };
  }
  if (optionsShown) return { error: "The options are still waiting for the person's decision. Call ui_await_decision first; the summary follows the decision." };
  const fits = { correction_only: corrections > 0, escalation_only: escalations > 0, routine_night: true };
  if (asked && fits[asked]) return { outcome: asked };
  if (asked && asked in fits) return { error: `The outcome "${asked}" does not fit tonight (${corrections} correction${corrections === 1 ? "" : "s"}, ${escalations} escalation${escalations === 1 ? "" : "s"}). Choose ${Object.entries(fits).filter(([, ok]) => ok).map(([k]) => `"${k}"`).join(" or ")}.` };
  if (asked) return { error: `No options were proposed tonight, so the outcome cannot be "${asked}".` };
  return { outcome: escalations ? "escalation_only" : corrections ? "correction_only" : "routine_night" };
}
