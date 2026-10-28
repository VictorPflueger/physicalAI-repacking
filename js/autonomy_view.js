// The autonomy dial's gate (PLAN.md §g, §e.3): why Bounded execution stays locked. Opened from the
// dial's Bounded segment; it shows every criterion of the example gate against the synthetic shadow
// record (js/autonomy.js), and the wording follows T-Systems: autonomy is an operating policy, and a
// stage advances only on evidence ("From industrial data to Physical AI", p. 9).

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { evaluateGate, EXAMPLE_GATE } from "./autonomy.js";
import { int, pct } from "./format.js";
import { tag } from "./tags.js";

/** The gate on the shadow record the app ships (data/shadow_record.js). */
export function currentGate(record = globalThis.SHADOW_RECORD) {
  return evaluateGate(record, EXAMPLE_GATE);
}

/** A one-line reason for the dial's tooltip: the criteria the record fails. */
export function lockReason(gate = currentGate()) {
  if (gate.met) return "The shadow-mode gate is met.";
  const failing = gate.criteria.filter((c) => !c.ok).map((c) => c.text);
  return `Locked: ${failing.join("; ")}.`;
}

/** Opens the gate dialog. Resolves when it is closed. */
export function openGateDialog({ record = globalThis.SHADOW_RECORD } = {}) {
  const gate = evaluateGate(record, EXAMPLE_GATE);
  const s = gate.summary;
  return new Promise((resolve) => {
    const closeBtn = h("button", { class: "vc-button vc-button--outline", type: "button" }, "Close");
    const m = openModal({
      title: gate.met ? "Bounded execution: the gate is met" : "Bounded execution is locked",
      intro: "In Bounded mode the agent would apply an option itself when it stays inside set limits (no extra cost, no store at risk) and escalate anything else. It unlocks only when the shadow-mode record meets the gate.",
      size: "narrow",
      className: "gate-modal",
      body: [
        h("ul", { class: "gate-list", "aria-label": "The gate's criteria" },
          gate.criteria.map((c) => h("li", { dataset: { ok: String(c.ok), id: c.id } },
            h("span", { class: "gate-mark", "aria-hidden": "true" }, icon(c.ok ? "check" : "x", 18)),
            h("span", { class: "gate-label" }, c.label),
            h("span", { class: "gate-text" }, c.text, h("span", { class: "vc-visually-hidden" }, c.ok ? " (met)" : " (not met)"))))),
        h("p", { class: "gate-record" },
          `The record: ${int(s.decisions)} decisions over ${int(s.nights)} nights in shadow mode, in which the agent only recommended and a person decided; ${int(s.agreed)} agreed with the person (${pct(s.agreement)}). `,
          tag("Synthetic", "synthetic")),
        h("p", { class: "gate-policy" }, `${EXAMPLE_GATE.basis}. Advise and Approve stay available.`),
        h("blockquote", { class: "gate-quote" },
          "Autonomy “is therefore an operating policy”, not a technical switch: a stage advances only when the one before it has produced evidence.",
          h("cite", {}, " T-Systems, From industrial data to Physical AI, p. 9"))
      ],
      footer: [h("span", { class: "dialog-note" }), closeBtn],
      onClose: () => resolve()
    });
    closeBtn.addEventListener("click", () => m.close());
  });
}
