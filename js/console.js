// Agent console: renders the run-event stream as a logbook (time · mark · entry), under the
// progress rail. Narration paragraphs that start with a label (Hypothesis:, Check:, Confirmed:,
// Not confirmed:, Revised:, Finding:, Recommendation:) get distinct styling; "Revised: old → new" is
// rendered as an amended entry with the superseded part struck through.
//
// This build renders the run frame, narration, reasoning and notices. Tool calls, options, drafts,
// corrections, escalations, per-tote summaries and the run facts join with the agent in M3.

import { bus } from "./events.js";
import { h, clear, prefersReducedMotion } from "./dom.js";
import { icon } from "./icons.js";
import { renderInline } from "./md.js";
import { clock } from "./format.js";
import { createProgressRail } from "./progress.js";
import { runStateLabel } from "./handover.js";
import { LABELS, splitParagraphs } from "./labels.js";
import { STORAGE } from "./config.js";

const PHASES = new Set(["planning", "picking", "replanning", "options", "awaiting_approval", "executing"]);
const TEXT_SIZE_KEY = STORAGE.consoleText;

export function createConsole(panel) {
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
  let entries = 0;
  let lastPhase = null;
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

  function entry(type, t, mark, body, data = {}) {
    return h("div", { class: "entry", dataset: { type, ...data } },
      h("div", { class: "entry-time" }, t !== null && t !== undefined ? clock(t) : ""),
      h("div", { class: "entry-mark" }, mark ? icon(mark, 18) : null),
      h("div", { class: "entry-body" }, body));
  }

  // ---- event handlers ---------------------------------------------------------------------------

  bus.on("run_start", (ev) => {
    const p = ev.payload;
    reset(false);
    const recorded = p.mode === "simulation" && p.sim_source === "recorded";
    watermark.hidden = p.mode !== "simulation";
    watermarkText.textContent = recorded
      ? `Replay of a live run recorded${p.recorded_on ? ` on ${p.recorded_on}` : ""}${p.recorded_model ? ` (${p.recorded_model})` : ""}. No model calls.`
      : SCRIPTED;
    log.dataset.sim = String(p.mode === "simulation");
    const meta = p.mode === "simulation"
      ? recorded ? "Simulation: replay of a recorded live run, no API key, no cost." : "Simulation: scripted replay, no API key, no cost."
      : `Live agent on ${p.model_label || p.model || "Claude"}. Real model reasoning and real tool calls against the simulated cell.`;
    add(entry("run", ev.t, "play", [
      h("div", { class: "run-title" }, p.title || "Agent run"),
      h("div", {}, meta)
    ]));
  });

  bus.on("state_change", (ev) => {
    const s = ev.payload.state;
    rail.update(s);
    if (!PHASES.has(s) || s === lastPhase) return;
    lastPhase = s;
    add(entry("phase", ev.t, null, h("span", { class: "phase" }, `Phase: ${runStateLabel(s)}`)));
  });

  bus.on("narration", (ev) => {
    const { msg_id: id, text, done } = ev.payload;
    let el = byMsg.get(id);
    if (!el) {
      el = add(entry("narration", ev.t, "pulse", h("div", { class: "narration" })));
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
      el = add(entry("reasoning", ev.t, null, details));
      byMsg.set(`r:${id}`, el);
    }
    el.querySelector(".reasoning-text").textContent = text || "";
  });

  bus.on("notice", (ev) => {
    const { level = "info", text } = ev.payload;
    add(entry("notice", ev.t, level === "info" ? "info" : "alert", renderInline(text, h("span")), { level }));
  });

  bus.on("run_end", (ev) => {
    const { status, reason } = ev.payload;
    rail.finish(status);
    const text = {
      done: "Run complete.",
      aborted: "Run aborted.",
      error: "Run stopped because of an error.",
      incomplete: "Run stopped before the workflow was complete."
    }[status] || "Run ended.";
    add(entry("notice", ev.t, status === "done" ? "check" : "stop", h("span", {}, h("strong", {}, text), reason ? ` ${reason}` : ""),
      { level: status === "error" ? "error" : "info" }));
    for (const el of byMsg.values()) { el.classList.remove("streaming"); el.removeAttribute("aria-busy"); }
  });

  function reset(empty = true) {
    byMsg.clear();
    entries = 0;
    lastPhase = null;
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
