// Autonomy levels and the shadow-mode gate. Pure module (no DOM).
//
// Three levels (build brief, "Autonomy dial"): Advise, the agent recommends and a person acts in the
// UI; Approve, the default, the agent acts after a person's click; Bounded, the agent acts inside
// limits and anything outside escalates. Bounded unlocks only when the shadow-mode record meets the
// gate. T-Systems frames it the same way: autonomy is an operating policy, not a technical switch,
// and a stage advances only on evidence ("From industrial data to Physical AI", p. 9).
//
// The gate below is the brief's example policy, shown as such in the app; a client sets its own.
// M1 uses it in the world integrity checks; the dial in the control bar arrives with M4.

import { pct } from "./format.js";

export const LEVELS = [
  { id: "advise", label: "Advise", text: "The agent recommends; a person acts in the interface." },
  { id: "approve", label: "Approve", text: "The agent acts after a person's click." },
  { id: "bounded", label: "Bounded", text: "The agent acts inside set limits; anything outside them escalates." }
];
export const DEFAULT_LEVEL = "approve";

/** The brief's example gate for Bounded execution. A client sets its own. */
export const EXAMPLE_GATE = {
  minDecisions: 200,
  minNights: 10,
  minAgreement: 0.95,
  maxMissedEscalations: 0,
  maxAgentCausedMissedCutoffs: 0,
  basis: "Example policy from the build brief; a client sets its own thresholds"
};

/** Counts of a shadow-mode record: decisions, nights, agreement and the two failure counts. */
export function shadowSummary(record) {
  const decisions = Array.isArray(record?.decisions) ? record.decisions : [];
  const nights = new Set(decisions.map((d) => d.night)).size;
  const agreed = decisions.filter((d) => d.agreed === true).length;
  return {
    decisions: decisions.length,
    nights,
    agreed,
    agreement: decisions.length ? agreed / decisions.length : 0,
    missedEscalations: decisions.filter((d) => d.escalation_missed === true).length,
    agentCausedMissedCutoffs: decisions.filter((d) => d.agent_caused_missed_cutoff === true).length
  };
}

/**
 * Evaluates the gate. Returns { met, summary, criteria: [{ id, label, ok, text }], failing: [id] }.
 * Every criterion must hold; the texts say what the record shows against what the policy needs.
 */
export function evaluateGate(record, policy = EXAMPLE_GATE) {
  const s = shadowSummary(record);
  const criteria = [
    { id: "decisions", label: "Shadow decisions", ok: s.decisions >= policy.minDecisions, text: `${s.decisions} decisions (needs at least ${policy.minDecisions})` },
    { id: "nights", label: "Nights in shadow mode", ok: s.nights >= policy.minNights, text: `${s.nights} nights (needs at least ${policy.minNights})` },
    { id: "agreement", label: "Agreement with the person's decision", ok: s.decisions > 0 && s.agreement >= policy.minAgreement, text: `${pct(s.agreement)} (needs at least ${pct(policy.minAgreement)})` },
    { id: "escalations", label: "Missed escalations", ok: s.missedEscalations <= policy.maxMissedEscalations, text: `${s.missedEscalations} (allowed: ${policy.maxMissedEscalations})` },
    { id: "cutoffs", label: "Missed cut-offs the agent caused", ok: s.agentCausedMissedCutoffs <= policy.maxAgentCausedMissedCutoffs, text: `${s.agentCausedMissedCutoffs} (allowed: ${policy.maxAgentCausedMissedCutoffs})` }
  ];
  const failing = criteria.filter((c) => !c.ok).map((c) => c.id);
  return { met: failing.length === 0, summary: s, criteria, failing };
}
