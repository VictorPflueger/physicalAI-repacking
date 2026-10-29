// The night's labels on Vici's tag (vc-tag, a hex capsule): a state in its tone with its word (success
// on time, warning at risk, danger late), a person in merlot, fjord for a reading, a neutral label, and
// Synthetic, which says that data is generated: a neutral tag in a dashed capsule (css/components.css),
// never a state colour. The cell board's popovers, the world model, the assumptions and the autonomy
// gate use it.

import { h } from "./dom.js";

/** Vici's tag class for each tone of the night. */
export const TAG_TONE = {
  "on-time": "vc-tag--success", "at-risk": "vc-tag--warning", late: "vc-tag--danger",
  person: "vc-tag--accent", check: "vc-tag--info", neutral: "", synthetic: "tag-synthetic"
};

/** A tag in a tone of the night: tag("Synthetic", "synthetic"), tag("Late", "late"). */
export function tag(text, tone = "neutral", attrs = {}) {
  const { class: cls = "", ...rest } = attrs;
  return h("span", { ...rest, class: ["vc-tag", TAG_TONE[tone] ?? "", cls] }, text);
}

/**
 * A figure's basis as a neutral tag (css/kpiboard.css): a source key from DATA_SOURCES.md in mono, the
 * label Assumption in italics, Brief in the text face, and Synthetic in its dashed capsule. A basis is
 * not a state, so it never takes a state colour.
 */
export function basisTag(key) {
  const kind = key === "Assumption" ? "assumption" : key === "Synthetic" ? "synthetic" : key === "Brief" ? "brief" : "source";
  return h("span", { class: ["vc-tag", "kb-key", kind === "synthetic" ? "tag-synthetic" : ""], dataset: { kind } }, key);
}
