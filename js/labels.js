// Narration labels, shared by the console (which styles them) and the run facts (which count
// them), so both always agree on what a "Check:" or a "Revised:" paragraph is.

export const LABELS = [
  { re: /^(hypothesis)\s*:\s*/i, kind: "hypothesis" },
  { re: /^(check|checking|verifying|verification)\s*:\s*/i, kind: "check" },
  { re: /^(confirmed|verified)\s*:\s*/i, kind: "confirmed" },
  { re: /^(not confirmed|unconfirmed|unverified|uncertain)\s*:\s*/i, kind: "unconfirmed" },
  { re: /^(revised|revision|correction|self-correction)\s*:\s*/i, kind: "revised" },
  { re: /^(finding|impact|what-if|what if)\s*:\s*/i, kind: "finding" },
  { re: /^(recommendation)\s*:\s*/i, kind: "recommendation" }
];

const SPLIT = /\n{2,}|\n(?=\s*(?:\*\*)?(?:hypothesis|check|checking|verifying|verification|confirmed|verified|not confirmed|unconfirmed|unverified|uncertain|revised|revision|correction|self-correction|finding|impact|what-if|what if|recommendation)\s*:)/i;

/** Narration text split into paragraphs (blank lines, or a new labelled paragraph on its own line). */
export function splitParagraphs(text) {
  return String(text || "").split(SPLIT).map((p) => p.trim()).filter(Boolean);
}

/** The label kind of a paragraph ("check", "revised" …) or null; a bold label counts too. */
export function labelKind(paragraph) {
  const text = String(paragraph || "").replace(/^\*\*([^*]+?:)\*\*\s*/, "$1 ");
  return LABELS.find((rule) => rule.re.test(text))?.kind || null;
}
