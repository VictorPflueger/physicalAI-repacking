// Agent console: renders the run-event stream as a logbook (time · mark · entry), under the
// progress rail. Narration paragraphs that start with a label (Hypothesis:, Check:, Confirmed:,
// Not confirmed:, Revised:, Finding:, Recommendation:) get distinct styling; "Revised: old → new" is
// rendered as an amended entry with the superseded part struck through.
//
// The time column is the night clock (22:00 to 06:00): every run is one night, and the audience
// follows the night, not a stopwatch. Its title gives the run time. The night's own lines (plan,
// waves, corrections, escalations, cut-off risks, wake-ups, the hourly cell line, the trucks and the
// night report) come from js/console_night.js. Tool calls, options, drafts and the run facts join
// with the agent in M3.

import { bus } from "./events.js";
import { h, clear, prefersReducedMotion } from "./dom.js";
import { icon } from "./icons.js";
import { renderInline } from "./md.js";
import { clock } from "./format.js";
import { createProgressRail } from "./progress.js";
import { runStateLabel } from "./handover.js";
import { LABELS, splitParagraphs } from "./labels.js";
import { STORAGE } from "./config.js";
import { clockOf } from "./nightsim.js";
import { attachNightLog } from "./console_night.js";

const PHASES = new Set(["planning", "picking", "replanning", "options", "awaiting_approval", "executing"]);
const TEXT_SIZE_KEY = STORAGE.consoleText;

/** opts: { getInputs() → the engine's inputs, for the night report's euros }. */
export function createConsole(panel, { getInputs = () => null } = {}) {
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
      ? "Night preview: the engine and the simulated cell play tonight without the agent. No API key, no model calls, no cost."
      : p.mode === "simulation"
        ? recorded ? "Simulation: replay of a recorded live run, no API key, no cost." : "Simulation: scripted replay, no API key, no cost."
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
      incomplete: "Run stopped before the workflow was complete."
    }[status] || "Run ended.";
    add(entry("notice", ev, status === "done" ? "check" : "stop", h("span", {}, h("strong", {}, text), reason ? ` ${reason}` : ""),
      { level: status === "error" ? "error" : "info" }));
    for (const el of byMsg.values()) { el.classList.remove("streaming"); el.removeAttribute("aria-busy"); }
    runMode = null;
    nightClock = null;
  });

  function reset(empty = true) {
    byMsg.clear();
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
