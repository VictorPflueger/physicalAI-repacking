// Draft finalisation shared by both producers (the live tools and the scripted replay), so the safety
// lines can never differ between a live run and its replay: every draft carries the AI footer, and a
// call-in message also says that no staffing or messaging system is connected. The lines are added in
// code, after any truncation, so no draft can lose them (PLAN.md §e.4).

export const DRAFT_TYPES = ["email", "memo", "call_in"];
export const DRAFT_LABELS = { email: "Email draft", memo: "Internal memo", call_in: "Call-in message (mock)" };
export const DRAFT_FOOTER = "Prepared with the Repack Pilot AI assistant. Requires human approval before sending.";
export const MOCK_CALL_IN_LINE = "Mock call-in for demonstration; no staffing or messaging system is connected.";
export const MAX_BODY = 4000;

/** The body as it goes into the Outbox: trimmed, with the mock line (call-ins) and the AI footer. */
export function finalizeDraft(type, body) {
  let out = String(body || "").trim().slice(0, MAX_BODY);
  if (type === "call_in" && !/Mock call-in/i.test(out)) out = `${out}\n\n${MOCK_CALL_IN_LINE}`;
  if (!out.includes("Requires human approval before sending")) out = `${out}\n\n${DRAFT_FOOTER}`;
  return out;
}
