// Options tab (PLAN.md §g): three costed options plus doing nothing, a cost comparison, and the
// approval gate. Every figure on a card comes from the engine's costing (the options event, filled by
// variant_id in js/tools.js), never from the agent's text. Card state follows option_decision events,
// so Live and Simulation behave alike. Lower expected total is better: the extra labour an option
// spends plus the cost of the store orders that still miss their truck. Each card opens with what
// happens to the trucks over the simulated nights, and the recommended card says why it is recommended
// when it is not the cheapest (TECH_NOTES D50, D51).

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { eur2, int, upTo } from "./format.js";
import { renderInline } from "./md.js";
import { aiLabel } from "./ai_label.js";

const lateCount = (n) => (n === 0 ? "none" : `${upTo(n, 2)} expected`);
// Extra labour against doing nothing: negative when an option saves manual picks (a maintenance stop that
// ends failed grasps, TECH_NOTES D48), shown as a saving rather than as a cost.
const labourText = (x) => (x < -0.005 ? `${eur2(x)} saved` : eur2(x));

export function createOptionsPanel(panel, { onDecision, onCount, orderName = (id) => id } = {}) {
  let current = null;           // the last options payload
  const status = new Map();     // option id → "approved" | "rejected" | "not_selected"
  let locked = false;           // true once an option has been approved
  let ended = false;            // the run ended (abort, error) before any approval
  let refocus = false;          // a decision was made in the panel: keep the focus in it

  function empty() {
    clear(panel);
    panel.appendChild(h("div", { class: "empty" },
      h("strong", {}, "No options yet"),
      h("span", {}, "When the night needs a decision, the agent prices three options against doing nothing, each in extra labour and late store orders, and they wait here for your decision. Nothing changes before.")));
  }

  function render() {
    clear(panel);
    if (!current) return empty();
    const { baseline, options = [], replications = 20, late_cost_eur: lateCost } = current;
    const pending = !locked && !ended && options.some((o) => !status.has(o.id));
    // Bars start at zero: a saving shows as no bar, its total (below zero) as the figure beside it.
    const max = Math.max(1, baseline?.expected_total_eur || 0, ...options.map((o) => Math.max(0, o.extra_labour_eur || 0) + (o.late_orders_eur || 0)));
    const pctOf = (x) => `${(Math.max(0, x) / max) * 100}%`;

    const rows = [
      ...options.map((o) => ({ key: o.letter, name: `Option ${o.letter}: ${o.title}`, spend: o.extra_labour_eur || 0, late: o.late_orders_eur || 0, total: o.expected_total_eur || 0, recommended: !!o.recommended })),
      { key: "–", name: "Do nothing", base: baseline?.expected_total_eur || 0, total: baseline?.expected_total_eur || 0 }
    ];
    const summary = h("div", { class: "options-summary" },
      h("div", { class: "options-summary-head" },
        h("h3", {}, pending ? "Decide how to respond" : locked ? "Decision taken" : ended ? "Run ended before a decision" : "Options"),
        aiLabel("options")),
      current.autonomy === "advise" ? h("p", { class: "options-advise" }, h("strong", {}, "Advise: "), "the agent only recommends. Your click on Apply applies the option; the agent does not act on the plan.") : null,
      h("p", {}, `Expected total at ${current.at}: the extra labour against doing nothing${options.some((o) => o.extra_labour_eur < -0.005) ? " (a saving counts below zero)" : ""}, plus ${lateCost !== undefined ? eur2(lateCost) : "the cost"} (Assumption) for each store order that misses its truck, on average over ${int(replications)} simulated versions of tonight. Every figure comes from the engine, not from the AI.`),
      h("div", { class: "compare", role: "img", "aria-label": `Expected total per option against doing nothing: ${rows.map((r) => `${r.name} ${eur2(r.total)}`).join("; ")}` },
        rows.map((r) => h("div", { class: "compare-row", dataset: { recommended: String(!!r.recommended) }, title: r.name },
          h("span", { class: "compare-key", "aria-hidden": "true" }, r.key),
          h("span", { class: "compare-track" },
            r.base !== undefined
              ? h("span", { class: "compare-bar baseline", style: { width: pctOf(r.base) } })
              : [h("span", { class: "compare-bar mitigation", style: { width: pctOf(r.spend) } }),
                h("span", { class: "compare-bar residual", style: { left: pctOf(r.spend), width: pctOf(r.late) } })]),
          h("span", { class: "compare-value num" }, eur2(r.total))))),
      h("div", { class: "compare-legend" },
        h("span", { class: "k-mit" }, "Extra labour"),
        h("span", { class: "k-res" }, "Late store orders"),
        h("span", { class: "k-base" }, "Do nothing")));

    const grid = h("div", { class: "options-grid" });
    for (const o of options) grid.appendChild(optionCard(o, replications));
    grid.appendChild(baselineCard(baseline, replications));
    panel.appendChild(h("div", { class: "options-layout" }, summary, grid));
    if (refocus) {
      // The cards were rebuilt: put the focus on the next decision, or on the decided card.
      refocus = false;
      const next = panel.querySelector(".option-actions .btn");
      const target = next || panel.querySelector(".option-status")?.closest(".option-card");
      if (target) {
        if (!next) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: false });
      }
    }
  }

  /** "Soest 20 of 20, Hamm 17 of 20" from the costing's late counts. */
  function lateBy(m, reps) {
    const list = Object.entries(m || {});
    return list.length ? list.map(([id, n]) => `${orderName(id)} ${int(n)} of ${int(reps)}`).join(", ") : `none of ${int(reps)}`;
  }

  /**
   * What happens to the trucks, from the costing's late counts over the simulated nights: "Every truck
   * on time in all 20 nights", or "Soest late in 20 of 20 nights, Hamm in 17". Green
   * when no truck is missed, red when one is missed in every night, amber in between.
   */
  function outcome(m, reps) {
    const list = Object.entries(m || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (!list.length) return h("p", { class: "option-outcome", dataset: { tone: "on-time" } }, `Every truck on time in all ${int(reps)} nights`);
    const [[id, n], ...rest] = list;
    const text = `${orderName(id)} late in ${int(n)} of ${int(reps)} nights${rest.map(([x, k]) => `, ${orderName(x)} in ${int(k)}`).join("")}`;
    return h("p", { class: "option-outcome", dataset: { tone: list.some(([, k]) => k >= reps) ? "late" : "at-risk" } }, text);
  }

  function optionCard(o, reps) {
    const st = status.get(o.id) || (locked ? "not_selected" : ended ? "expired" : "");
    return h("article", { class: "option-card", dataset: { recommended: String(!!o.recommended), status: st, kind: "option", id: o.id }, "aria-label": `Option ${o.letter}: ${o.title}` },
      h("div", { class: "option-top" },
        h("span", { class: "option-letter", "aria-hidden": "true" }, o.letter),
        // The chip flows after the title's last word, so a long title takes two lines, not three.
        h("h4", { class: "option-title" }, `${o.title} `, o.recommended ? h("span", { class: "chip", dataset: { tone: "recommended" } }, "Recommended") : null)),
      outcome(o.late_by_order, reps),
      o.description ? renderInline(o.description, h("p", { class: "option-desc" })) : null,
      h("dl", { class: "option-figures" },
        h("dt", {}, "Extra labour"), h("dd", o.extra_labour_eur < -0.005 ? { title: "Fewer manual picks than doing nothing: a saving" } : {}, labourText(o.extra_labour_eur)),
        h("dt", {}, "Late orders, expected"), h("dd", { title: `${lateCount(o.expected_late_orders)}: ${lateBy(o.late_by_order, reps)}` }, eur2(o.late_orders_eur))),
      h("div", { class: "option-total" }, h("span", { class: "label" }, "Expected total"), h("span", { class: "value num" }, eur2(o.expected_total_eur))),
      o.recommended && current?.recommendation_reason ? renderInline(current.recommendation_reason, h("p", { class: "option-why" }, h("strong", {}, "Why recommended: "))) : null,
      o.residual_risk ? h("p", { class: "option-risk" }, h("strong", {}, "Residual risk: "), o.residual_risk) : null,
      actionsFor(o, st));
  }

  function baselineCard(b, reps) {
    const st = status.get("baseline") || (locked ? "not_selected" : ended ? "expired" : "");
    return h("article", { class: "option-card", dataset: { kind: "baseline", status: st, id: "baseline" }, "aria-label": "Do nothing" },
      h("div", { class: "option-top" },
        h("span", { class: "option-letter", "aria-hidden": "true" }, "–"),
        h("h4", { class: "option-title" }, "Do nothing")),
      outcome(b?.late_by_order, reps),
      h("p", { class: "option-desc" }, b?.description || "Keep the plan as it is."),
      h("dl", { class: "option-figures" },
        h("dt", {}, "Extra labour"), h("dd", {}, eur2(0)),
        h("dt", {}, "Late orders, expected"), h("dd", { title: `${lateCount(b?.expected_late_orders)}: ${lateBy(b?.late_by_order, reps)}` }, eur2(b?.late_orders_eur))),
      h("div", { class: "option-total" }, h("span", { class: "label" }, "Expected total"), h("span", { class: "value num" }, eur2(b?.expected_total_eur))),
      actionsFor({ id: "baseline", letter: "–", title: "Do nothing" }, st, true));
  }

  function actionsFor(o, st, isBaseline = false) {
    if (st === "approved") return h("div", { class: "option-status mark-pass" }, icon("check", 20), isBaseline ? "Plan kept" : current?.autonomy === "advise" ? "Applied by you" : "Approved");
    if (st === "rejected") return h("div", { class: "option-status mark-fail" }, icon("x", 20), "Rejected");
    if (st === "not_selected") return h("div", { class: "option-status mark-skip" }, "Not selected");
    if (st === "expired") return h("div", { class: "option-status mark-skip" }, "No decision: the run ended");
    if (isBaseline) {
      return h("div", { class: "option-actions" },
        h("button", { class: "btn", type: "button", on: { click: () => decide(o, "approved") } }, "Do nothing"));
    }
    const advise = current?.autonomy === "advise";
    return h("div", { class: "option-actions" },
      // The recommended option's Approve is the one solid brand button; the others stay available as
      // outlined brand buttons. Reject is a neutral decision, not an alarm. In Advise mode the click
      // applies the option itself (the person acts in the interface).
      h("button", { class: `btn btn-approve${o.recommended ? "" : " btn-brand-outline"}`, type: "button", ...(advise ? { title: "Advise: your click applies this option" } : {}), on: { click: () => decide(o, "approved") } }, icon("check", 18), advise ? "Apply" : "Approve"),
      h("button", { class: "btn btn-reject", type: "button", on: { click: () => decide(o, "rejected") } }, "Reject"));
  }

  function decide(o, decision) {
    if (locked || !current) return;
    refocus = panel.contains(document.activeElement);
    // The decision names the set of options it was taken on, so a click on a set the agent has just
    // replaced is ignored instead of counting for the new one.
    onDecision?.({ option_id: o.id, option_label: o.id === "baseline" ? "Do nothing" : `Option ${o.letter}: ${o.title}`, options_seq: current.options_seq ?? null, decision });
  }

  bus.on("options", (ev) => {
    current = ev.payload;
    status.clear();
    locked = false;
    ended = false;
    render();
    onCount?.(current.options?.length || 0, true);
  });

  bus.on("option_decision", (ev) => {
    const { option_id: id, decision, options_seq: seq } = ev.payload;
    if (!current || (seq !== undefined && seq !== (current.options_seq ?? null))) return; // a decision on an older set
    status.set(id, decision);
    if (decision === "approved") {
      locked = true;
      for (const o of current.options || []) if (o.id !== id) status.set(o.id, "not_selected");
      if (id !== "baseline") status.set("baseline", "not_selected");
    }
    render();
    onCount?.(current.options?.length || 0, !locked);
  });

  // A run that ends (Abort, an error) cannot take a decision any more: say so instead of offering buttons.
  bus.on("run_end", () => {
    if (!current || locked) return;
    ended = true;
    render();
    onCount?.(current.options?.length || 0, false);
  });

  function reset() {
    current = null;
    status.clear();
    locked = false;
    ended = false;
    empty();
    onCount?.(0, false);
  }

  empty();
  return { reset };
}
