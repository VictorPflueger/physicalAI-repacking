// Agent console: renders the run-event stream as a logbook (time · mark · entry), under the
// progress rail. Narration paragraphs that start with a label (Hypothesis:, Check:, Confirmed:,
// Not confirmed:, Revised:, Finding:, Recommendation:) get distinct styling; "Revised: old → new" is
// rendered as an amended entry with the superseded part struck through.
//
// The time column is the night clock (22:00 to 06:00): every run is one night, and the audience
// follows the night, not a stopwatch. Its title gives the run time. The night's own lines (plan,
// waves, corrections, escalations, cut-off risks, wake-ups, the hourly cell line, the trucks and the
// night report) come from js/console_night.js; this module shows the agent: its narration, reasoning
// summaries and tool calls, every Guardrail refusal, the options, your decisions, the drafts, the
// confirmations, the management summary and the run facts.

import { bus } from "./events.js";
import { h, clear, prefersReducedMotion } from "./dom.js";
import { icon } from "./icons.js";
import { renderInline, renderMarkdown } from "./md.js";
import { clock } from "./format.js";
import { createProgressRail } from "./progress.js";
import { runStateLabel } from "./handover.js";
import { LABELS, splitParagraphs } from "./labels.js";
import { STORAGE } from "./config.js";
import { clockOf } from "./nightsim.js";
import { attachNightLog } from "./console_night.js";
import { aiLabel } from "./ai_label.js";
import { auditRows } from "./audit.js";
import { computeRunFacts, describeRunFacts } from "./run_facts.js";
import { DRAFT_LABELS } from "./drafts.js";

const PHASES = new Set(["planning", "picking", "replanning", "options", "awaiting_approval", "executing"]);
const TEXT_SIZE_KEY = STORAGE.consoleText;

/**
 * opts: { getInputs() → the engine's inputs (the night report's euros), onOpenOptions(), onOpenOutbox(),
 * onOpenReport(markdown), onConfirm({ request_id, choice, subject }) }.
 */
export function createConsole(panel, { getInputs = () => null, onOpenOptions, onOpenOutbox, onOpenReport, onConfirm } = {}) {
  const count = h("span", { class: "count num" }, "");
  const jumpBtn = h("button", { class: "btn btn-sm", type: "button", hidden: true }, icon("chevronDown", 16), "Jump to latest");
  // Larger text for projectors, remembered per browser (a convenience; storage may be unavailable).
  const sizeBtn = h("button", { class: "btn btn-sm btn-ghost text-size", type: "button", "aria-pressed": "false", title: "Larger console text for projectors" }, "Larger text");
  const applySize = (large) => {
    panel.dataset.text = large ? "large" : "standard";
    sizeBtn.setAttribute("aria-pressed", String(large));
    pin();
  };
  sizeBtn.addEventListener("click", () => {
    const large = panel.dataset.text !== "large";
    applySize(large);
    try { localStorage.setItem(TEXT_SIZE_KEY, large ? "large" : "standard"); } catch { /* storage unavailable */ }
  });
  const SCRIPTED = "Scripted replay of a representative night. No model calls.";
  const watermarkText = h("span", {}, SCRIPTED);
  const watermark = h("div", { class: "sim-watermark", hidden: true, role: "note" }, "SIMULATION", watermarkText);
  const log = h("div", { class: "log", role: "log", "aria-live": "polite", "aria-relevant": "additions" });
  // The agent's plan and progress, above the log (agentic UX: show the plan, show the hand-over).
  const rail = createProgressRail();
  rail.reset();

  panel.append(
    h("div", { class: "console-head" },
      h("div", { class: "console-title" }, h("h2", {}, "Agent console"), count),
      h("div", { class: "console-head-actions" }, jumpBtn, sizeBtn)),
    rail.el,
    watermark,
    log
  );

  const byMsg = new Map();
  const byCall = new Map();
  const confirmations = new Map();
  let optionsSeq = null;  // the option set on screen: a click on an older set is not logged as a decision
  let entries = 0;
  let lastPhase = null;
  let runMode = null;     // the current run's mode: "simulation" | "live" | "preview"
  let nightClock = null;  // "HH:MM" while a run is on; the time column shows it
  // Auto-follow: the log stays pinned to the newest entry until the presenter scrolls up. Only
  // user input (wheel, touch, keys, scrollbar drag) can unpin it, so programmatic scrolling and
  // layout changes (the drawer opening) never stop the follow.
  let follow = true;
  let userIntentUntil = 0;
  const noteIntent = () => { userIntentUntil = performance.now() + 900; };
  for (const type of ["wheel", "touchmove", "pointerdown", "keydown"]) log.addEventListener(type, noteIntent, { passive: true });
  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const pin = () => { if (follow) log.scrollTop = log.scrollHeight; };

  log.addEventListener("scroll", () => {
    if (atBottom()) {
      follow = true;
      jumpBtn.hidden = true;
    } else if (performance.now() < userIntentUntil) {
      follow = false;
      if (entries > 0) jumpBtn.hidden = false;
    }
  });
  if (typeof ResizeObserver === "function") new ResizeObserver(pin).observe(log);
  jumpBtn.addEventListener("click", () => {
    follow = true;
    jumpBtn.hidden = true;
    log.scrollTo({ top: log.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  });

  function showEmpty() {
    clear(log);
    log.appendChild(h("div", { class: "log-empty" },
      h("h3", {}, "Pick a scenario, then start the agent"),
      h("p", {}, "The five steps above are the agent's plan for the night. It perceives each item, plans the store orders against the truck cut-offs, picks with the cell, replans when the night changes and prepares the drafts."),
      h("p", {}, "When it needs you, the step turns burgundy. Nothing is sent without your approval. You choose between a free simulation and the live agent on your own API key.")));
    count.textContent = "";
  }

  function add(el) {
    if (entries === 0) clear(log);
    log.appendChild(el);
    entries++;
    count.textContent = `${entries} ${entries === 1 ? "entry" : "entries"}`;
    if (follow) pin();
    else jumpBtn.hidden = false;
    return el;
  }

  /**
   * One logbook line. `ev` is the run event: its simulated time (sim_t) or the night clock gives the
   * time column, its run time the title.
   */
  function entry(type, ev, mark, body, data = {}) {
    const simT = ev?.payload?.sim_t;
    const night = typeof simT === "number" ? clockOf(simT) : nightClock;
    const run = ev?.t !== null && ev?.t !== undefined ? clock(ev.t) : null;
    const time = h("div", { class: "entry-time", ...(run ? { title: `Run time ${run}` } : {}) }, night || run || "");
    return h("div", { class: "entry", dataset: { type, ...data } },
      time,
      h("div", { class: "entry-mark" }, mark ? icon(mark, 18) : null),
      h("div", { class: "entry-body" }, body));
  }

  // ---- event handlers ---------------------------------------------------------------------------

  bus.on("run_start", (ev) => {
    const p = ev.payload;
    reset(false);
    runMode = p.mode;
    nightClock = "22:00";
    const recorded = p.mode === "simulation" && p.sim_source === "recorded";
    watermark.hidden = p.mode !== "simulation";
    watermarkText.textContent = recorded
      ? `Replay of a live run recorded${p.recorded_on ? ` on ${p.recorded_on}` : ""}${p.recorded_model ? ` (${p.recorded_model})` : ""}. No model calls.`
      : SCRIPTED;
    log.dataset.sim = String(p.mode === "simulation");
    const meta = p.mode === "preview"
      ? "Night preview: this scenario has no scripted replay yet (M4), so the engine and the simulated cell play tonight without the agent. No API key, no model calls, no cost."
      : p.mode === "simulation"
        ? recorded ? "Simulation: replay of a recorded live run, no API key, no cost." : "Simulation: scripted replay through the agent's own tools; the engine computes every figure now. No API key, no cost."
        : `Live agent on ${p.model_label || p.model || "Claude"}. Real model reasoning and real tool calls against the simulated cell.`;
    add(entry("run", ev, "play", [
      h("div", { class: "run-title" }, p.title || "Agent run"),
      h("div", {}, meta)
    ]));
  });

  bus.on("state_change", (ev) => {
    const s = ev.payload.state;
    rail.update(s);
    if (!PHASES.has(s) || s === lastPhase) return;
    lastPhase = s;
    add(entry("phase", ev, null, h("span", { class: "phase" }, `Phase: ${runStateLabel(s)}`)));
  });

  bus.on("narration", (ev) => {
    const { msg_id: id, text, done } = ev.payload;
    let el = byMsg.get(id);
    if (!el) {
      el = add(entry("narration", ev, "pulse", h("div", { class: "narration" })));
      byMsg.set(id, el);
    }
    const body = el.querySelector(".narration");
    clear(body);
    for (const para of splitParagraphs(text)) body.appendChild(renderParagraph(para));
    el.classList.toggle("streaming", !done);
    // Screen readers wait for the finished paragraph instead of announcing every partial update.
    if (done) el.removeAttribute("aria-busy"); else el.setAttribute("aria-busy", "true");
    pin();
  });

  bus.on("reasoning", (ev) => {
    const { msg_id: id, text } = ev.payload;
    let el = byMsg.get(`r:${id}`);
    if (!el) {
      const details = h("details", { class: "reasoning" },
        h("summary", {}, icon("chevronRight", 14), "Reasoning summary"),
        h("div", { class: "reasoning-text" }));
      el = add(entry("reasoning", ev, null, details));
      byMsg.set(`r:${id}`, el);
    }
    el.querySelector(".reasoning-text").textContent = text || "";
  });

  // ---- the agent's tools ---------------------------------------------------------------------------
  bus.on("tool_call", (ev) => {
    const p = ev.payload;
    // ui_* tools show as their effects (options, drafts, the summary); sim_advance as the wake-up line.
    if (hidden(p.name)) return;
    const line = h("div", { class: "tool-line" }, h("span", { class: "tool-name" }, p.name), h("span", { class: "tool-args" }, argsSummary(p.name, p.input)));
    const el = add(entry("tool_call", ev, "gear", line, { server: "false", tool: p.name }));
    byCall.set(p.call_id, el);
  });

  bus.on("tool_result", (ev) => {
    const p = ev.payload;
    const refused = p.result?.refused === true;
    if (hidden(p.name)) {
      // A refused ui_* call or sim_advance is a guardrail at work: show it, so the presenter sees why the
      // agent tries again.
      if (refused || p.ok === false) guardLine(ev, p.name, String(p.result?.error || p.summary || "").replace(/^(Error|Refused):\s*/, ""));
      return;
    }
    let el = byCall.get(p.call_id);
    if (!el) el = add(entry("tool_call", ev, "gear", h("div", { class: "tool-line" }, h("span", { class: "tool-name" }, p.name)), { tool: p.name }));
    const body = el.querySelector(".entry-body");
    const result = h("div", { class: "result", dataset: { open: "false" } });
    const toggle = h("button", { class: "result-toggle", type: "button", "aria-expanded": "false" },
      icon("chevronRight", 14),
      h("span", { class: "result-summary", dataset: { ok: String(p.ok !== false) } }, p.summary || (p.ok === false ? "Tool error" : "Result")));
    const pre = h("pre", { class: "result-body" }, formatJson(p.result));
    toggle.addEventListener("click", () => {
      const open = result.dataset.open !== "true";
      result.dataset.open = String(open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    result.append(toggle, pre);
    body.appendChild(result);
    if (refused) {
      el.dataset.guard = p.name;
      guardLine(ev, p.name, String(p.result?.error || "").trim());
    }
    pin();
  });

  function guardLine(ev, name, why) {
    add(entry("notice", ev, "shield", h("span", {}, h("strong", {}, "Guardrail: "), `${GUARD_LABEL[name] || `${name} was`} refused. `, why), { level: "warn", guard: name }));
  }

  // A response that was not kept (failed and retried, or cut off and redone): its entries stay visible
  // for the record, dimmed and marked, and nothing in them counts.
  bus.on("attempt_discarded", (ev) => {
    const p = ev.payload || {};
    const els = [...(p.msg_ids || []).flatMap((id) => [byMsg.get(id), byMsg.get(`r:${id}`)]), ...(p.call_ids || []).map((id) => byCall.get(id))].filter(Boolean);
    for (const el of new Set(els)) {
      if (el.dataset.discarded === "true") continue;
      el.dataset.discarded = "true";
      el.classList.remove("streaming");
      el.removeAttribute("aria-busy");
      el.querySelector(".entry-body")?.prepend(h("div", { class: "discarded-note" }, h("em", {}, "Discarded: "), p.reason || "this part of the response was not used."));
    }
  });

  // ---- decisions, drafts, confirmations and the summary ------------------------------------------------
  bus.on("options", (ev) => {
    optionsSeq = ev.payload.options_seq ?? null;
    const n = ev.payload.options?.length || 0;
    add(entry("decision-request", ev, "list", h("div", {},
      h("p", {}, `${n} costed options and doing nothing wait for your decision. The night stands still until you decide.`),
      h("button", { class: "btn btn-sm btn-primary", type: "button", on: { click: () => onOpenOptions?.() } }, "Review options"))));
  });

  bus.on("option_decision", (ev) => {
    const p = ev.payload;
    if (p.options_seq !== undefined && (p.options_seq ?? null) !== optionsSeq) return;
    const approved = p.decision === "approved";
    const what = p.option_id === "baseline" ? (approved ? "You chose to do nothing" : "You rejected doing nothing") : `${approved ? "You approved" : "You rejected"} ${p.option_label || p.option_id}`;
    add(entry("decision", ev, "user", h("p", {}, h("strong", {}, what), p.note ? `. ${p.note}` : "."), { decision: p.decision }));
  });

  bus.on("action_draft", (ev) => {
    const p = ev.payload;
    const label = (DRAFT_LABELS[p.type] || DRAFT_LABELS.email).toLowerCase();
    add(entry("draft", ev, p.type === "memo" ? "memo" : p.type === "call_in" ? "user" : "mail", h("div", {},
      h("p", {}, `Drafted ${label} for ${p.recipient}: “${p.subject}”. It waits for your approval in the Outbox.`),
      h("button", { class: "btn btn-sm", type: "button", on: { click: () => onOpenOutbox?.() } }, "Open outbox"))));
  });

  bus.on("action_decision", (ev) => {
    const p = ev.payload;
    add(entry("decision", ev, "user", h("p", {},
      h("strong", {}, p.decision === "approved" ? "You approved " : "You rejected "),
      p.label || p.action_id, p.decision === "approved" ? " (a draft; nothing was sent)." : "."), { decision: p.decision }));
  });

  bus.on("provisional_entry", (ev) => {
    const p = ev.payload;
    add(entry("correction", ev, "memo", [h("strong", {}, "Provisional entry: "), `${p.name}${p.net_content ? `, ${p.net_content}` : ""} for barcode ${p.barcode} (${p.source === "open_food_facts" ? "from Open Food Facts" : "from the scale and the camera"}), unverified until a person confirms it.`]));
  });

  bus.on("confirmation_request", (ev) => {
    const p = ev.payload;
    const actions = h("div", { class: "entry-actions confirm-actions" },
      h("button", { class: "btn btn-sm btn-approve", type: "button", on: { click: () => decideConfirmation(p, "confirm") } }, icon("check", 16), "Confirm"),
      h("button", { class: "btn btn-sm btn-reject", type: "button", on: { click: () => decideConfirmation(p, "reject") } }, "Reject"));
    const card = h("div", { class: "confirm-card" }, h("strong", {}, p.subject), h("p", {}, p.reason), actions);
    confirmations.set(p.request_id, { actions, decided: false });
    add(entry("confirmation", ev, "user", card));
  });

  function decideConfirmation(p, choice) {
    const c = confirmations.get(p.request_id);
    if (!c || c.decided) return;
    onConfirm?.({ request_id: p.request_id, choice, subject: p.subject });
  }

  bus.on("confirmation_decision", (ev) => {
    const p = ev.payload;
    const c = confirmations.get(p.request_id);
    if (c && !c.decided) {
      c.decided = true;
      c.actions.replaceWith(h("div", { class: `option-status ${p.choice === "confirm" ? "mark-pass" : "mark-fail"}` }, icon(p.choice === "confirm" ? "check" : "x", 18), p.choice === "confirm" ? "Confirmed" : "Rejected"));
    }
    add(entry("decision", ev, "user", h("p", {}, h("strong", {}, p.choice === "confirm" ? "You confirmed " : "You rejected "), `${p.subject || p.request_id}.`), { decision: p.choice === "confirm" ? "approved" : "rejected" }));
  });

  bus.on("report", (ev) => {
    const card = h("div", { class: "report-card" },
      aiLabel("report"),
      renderMarkdown(ev.payload.markdown),
      h("div", { class: "report-actions" },
        h("button", { class: "btn btn-sm btn-primary", type: "button", id: "btn-open-report", on: { click: () => onOpenReport?.(ev.payload.markdown) } }, icon("external", 16), "Open management summary")));
    add(entry("report", ev, "check", card, { kind: "summary" }));
  });

  bus.on("notice", (ev) => {
    const { level = "info", text } = ev.payload;
    add(entry("notice", ev, level === "info" ? "info" : "alert", renderInline(text, h("span")), { level }));
  });

  // The night clock follows the night; the night's own lines come from js/console_night.js.
  bus.on("clock", (ev) => { if (runMode) nightClock = ev.payload.label; });
  const nightLog = attachNightLog({ add, entry, mode: () => runMode, getInputs });

  bus.on("run_end", (ev) => {
    const { status, reason } = ev.payload;
    rail.finish(status);
    const text = (runMode === "preview" ? {
      done: "Night preview complete.",
      aborted: "Night preview stopped.",
      error: "Night preview stopped because of an error."
    } : {})[status] || {
      done: "Run complete.",
      aborted: "Run aborted.",
      error: "Run stopped because of an error.",
      incomplete: "Run stopped before the night was complete."
    }[status] || "Run ended.";
    // Facts for every agent run that ends, a stop at a cap or by Abort included (the audit has every
    // event up to this one): they say how far the run got and what it cost.
    let facts = null;
    if (runMode && runMode !== "preview") {
      try { facts = describeRunFacts(computeRunFacts(auditRows(), ev)); } catch (e) { console.error("[Repack Pilot] run facts failed:", e); }
    }
    add(entry("notice", ev, status === "done" ? "check" : "stop", h("div", {},
      h("span", {}, h("strong", {}, text), reason ? ` ${reason}` : ""),
      facts ? h("div", { class: "run-facts" }, h("strong", {}, runMode === "simulation" ? "Replay facts: " : "Run facts: "), facts) : null),
    { level: status === "error" ? "error" : "info", end: status }));
    for (const el of byMsg.values()) { el.classList.remove("streaming"); el.removeAttribute("aria-busy"); }
    runMode = null;
    nightClock = null;
  });

  function reset(empty = true) {
    byMsg.clear();
    byCall.clear();
    confirmations.clear();
    optionsSeq = null;
    entries = 0;
    lastPhase = null;
    runMode = null;
    nightClock = null;
    nightLog?.reset();
    follow = true;
    jumpBtn.hidden = true;
    watermark.hidden = true;
    log.dataset.sim = "false";
    rail.reset();
    if (empty) showEmpty(); else clear(log);
  }

  let storedSize = null;
  try { storedSize = localStorage.getItem(TEXT_SIZE_KEY); } catch { /* storage unavailable */ }
  applySize(storedSize === "large");
  showEmpty();
  return { reset };
}

// ---------------------------------------------------------------------------------------------

function renderParagraph(raw) {
  let text = raw.replace(/^\*\*([^*]+?:)\*\*\s*/, "$1 ");
  for (const rule of LABELS) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const rest = text.slice(m[0].length);
    const label = m[1][0].toUpperCase() + m[1].slice(1);
    const p = h("p", { class: "para", dataset: { kind: rule.kind } }, h("span", { class: "tag" }, `${label}:`));
    if (rule.kind === "revised") {
      const arrow = rest.search(/\s(→|->)\s/);
      if (arrow > 0) {
        const old = rest.slice(0, arrow);
        const after = rest.slice(arrow).replace(/^\s(→|->)\s/, "");
        p.append(renderInline(old, h("span", { class: "struck" })), h("span", { class: "arrow", "aria-label": "replaced by" }, "→"), renderInline(after, h("span", { class: "amended" })));
        return p;
      }
    }
    renderInline(rest, p);
    return p;
  }
  return renderInline(text, h("p", { class: "para" }));
}

/** Tools the console shows by their effect, not as a tool line. */
function hidden(name) {
  const n = String(name || "");
  return n.startsWith("ui_") || n === "sim_advance";
}

function argsSummary(name, input) {
  if (!input || typeof input !== "object") return "";
  if (name === "sim_cost_options") {
    const v = input.variants || [];
    return v.map((x) => `${x.variant_id}: ${trim(String(x.name || ""), 40)}`).join(" · ");
  }
  const parts = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || v === "") continue;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k}=${trim(s, 56)}`);
  }
  return parts.join(", ");
}

function trim(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatJson(value) {
  if (value === undefined) return "";
  let s;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    s = String(value);
  }
  return s.length > 9000 ? `${s.slice(0, 9000)}\n… (shortened for display; the full result is in the audit log)` : s;
}

const GUARD_LABEL = {
  sim_advance: "Letting the night run on was", ui_propose_options: "The options were", ui_await_decision: "The wait was",
  ui_request_confirmation: "The confirmation was", ui_draft_action: "The draft was", ui_await_approvals: "The wait was",
  ui_final_report: "The management summary was", wms_apply_option: "Applying the option was", wms_rebalance_tote: "The tote rebalance was",
  cell_route_to_manual: "Routing to the manual station was", world_propose_entry: "The provisional entry was", open_lookup_barcode: "The lookup was"
};
