// Outbox tab (PLAN.md §g): the drafts that follow a decision: a call-in message for the on-call picker
// pool, an email to a store or the carrier, an internal memo. Every item is a draft that needs the
// person's explicit approval, and approval only changes its status here: nothing is ever sent.

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { aiLabel } from "./ai_label.js";
import { DRAFT_LABELS } from "./drafts.js";

const ICON = { email: "mail", memo: "memo", call_in: "user" };

export function createOutbox(panel, { onDecision, onCount } = {}) {
  const actions = new Map(); // id → { draft, status: "pending" | "approved" | "rejected" | "expired" }
  let refocus = false;       // a decision was made in the panel: keep the focus in it after the rebuild

  function counts() {
    const pending = [...actions.values()].filter((a) => a.status === "pending").length;
    onCount?.(actions.size, pending > 0);
  }

  function render() {
    clear(panel);
    const pending = [...actions.values()].filter((a) => a.status === "pending");
    panel.appendChild(h("div", { class: "outbox-head" },
      h("span", { class: "outbox-safety" }, icon("shield", 18), "Drafts only. Repack Pilot has no email, staffing or messaging connection; approving marks a draft as cleared for a person to send."),
      pending.length > 1
        ? h("button", { class: "vc-button vc-button--secondary button-compact", type: "button", id: "btn-approve-all", dataset: { action: "approve-all" }, on: { click: () => pending.forEach((a) => decide(a.draft, "approved")) } }, icon("check", 16), `Approve all ${pending.length} pending`)
        : null));

    if (!actions.size) {
      panel.appendChild(h("div", { class: "vc-empty empty" },
        h("strong", { class: "vc-empty__title" }, "Nothing drafted yet"),
        h("p", { class: "vc-empty__text" }, "After you decide, the agent drafts what the decision needs: a call-in message, a note to a store or the carrier, a memo for the shift handover. Each draft waits here for your approval.")));
      return;
    }

    const list = h("div", { class: "outbox-list" });
    for (const { draft, status } of actions.values()) list.appendChild(card(draft, status));
    panel.appendChild(list);
    if (refocus) {
      refocus = false;
      const next = panel.querySelector('.action-card[data-status="pending"] [data-action="approve"]');
      if (next) next.focus();
      else { list.setAttribute("tabindex", "-1"); list.focus(); }
    }
  }

  function card(d, status) {
    const label = DRAFT_LABELS[d.type] || DRAFT_LABELS.email;
    // The status is a Vici tag: merlot while it waits for you, success once approved, plain otherwise.
    const tone = status === "pending" ? "vc-tag--accent" : status === "approved" ? "vc-tag--success" : "";
    const statusText = status === "pending" ? "Pending approval"
      : status === "approved" ? "Approved: draft, not sent"
        : status === "expired" ? "Not decided: the run ended" : "Rejected";
    const bodyText = d.body || "";
    const clipped = bodyText.split("\n").length > 6 || bodyText.length > 480;
    const el = h("article", { class: "vc-card action-card", dataset: { status, expanded: "false", clipped: String(clipped), type: d.type, id: d.action_id } },
      h("span", { class: "vc-cell action-type", "aria-hidden": "true" }, icon(ICON[d.type] || "mail", 20)),
      h("div", {},
        h("div", { class: "action-meta" },
          h("span", {}, label),
          h("span", {}, `To: ${d.recipient}`),
          h("span", { class: ["vc-tag", tone, "action-status"] }, statusText),
          Array.isArray(d.unchecked) && d.unchecked.length
            ? h("span", { class: "vc-tag vc-tag--warning", title: `Figures no tool returned: ${d.unchecked.join(", ")}` }, "Unchecked figures")
            : null,
          aiLabel("draft")),
        h("div", { class: "action-subject" }, d.subject),
        h("pre", { class: "action-body" }, bodyText),
        clipped
          ? h("button", { class: "vc-button vc-button--ghost button-compact action-more", type: "button", on: { click: (e) => {
            const open = el.dataset.expanded !== "true";
            el.dataset.expanded = String(open);
            e.currentTarget.textContent = open ? "Show less" : "Show full draft";
          } } }, "Show full draft")
          : null),
      status === "pending"
        ? h("div", { class: "action-buttons" },
          h("button", { class: "vc-button", type: "button", dataset: { action: "approve" }, on: { click: () => decide(d, "approved") } }, icon("check", 18), "Approve"),
          h("button", { class: "vc-button vc-button--outline", type: "button", dataset: { action: "reject" }, on: { click: () => decide(d, "rejected") } }, "Reject"))
        : h("div", { class: "action-buttons" }));
    return el;
  }

  function decide(d, decision) {
    const a = actions.get(d.action_id);
    if (!a || a.status !== "pending") return;
    refocus = panel.contains(document.activeElement);
    onDecision?.({ action_id: d.action_id, decision, label: `${(DRAFT_LABELS[d.type] || DRAFT_LABELS.email).toLowerCase()} “${d.subject}”` });
  }

  bus.on("action_draft", (ev) => {
    actions.set(ev.payload.action_id, { draft: ev.payload, status: "pending" });
    render();
    counts();
  });

  bus.on("action_decision", (ev) => {
    const a = actions.get(ev.payload.action_id);
    if (!a || a.status !== "pending") return;
    a.status = ev.payload.decision === "approved" ? "approved" : "rejected";
    render();
    counts();
  });

  // Drafts still pending when a run ends (Abort, an error) can no longer be decided; nothing was sent.
  bus.on("run_end", () => {
    let changed = false;
    for (const a of actions.values()) if (a.status === "pending") { a.status = "expired"; changed = true; }
    if (changed) { render(); counts(); }
  });

  function reset() {
    actions.clear();
    render();
    counts();
  }

  render();
  return { reset };
}
