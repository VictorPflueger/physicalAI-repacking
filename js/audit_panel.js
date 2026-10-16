// Audit tab: chronological log of every event and every model call, with filters and JSON export.
// ("Save run as simulation" joins with the recorder in M4.)

import { h, clear, downloadText } from "./dom.js";
import { icon } from "./icons.js";
import { clock, timeOfDay, int, fixed } from "./format.js";
import { auditRows, onAuditEvent, buildAuditExport, auditFileName } from "./audit.js";

const PHYSICAL = ["detection", "grasp_attempt", "scale_reading", "tote_update", "world_model_correction", "escalation", "cutoff_risk", "dispatch", "clock", "wake"];
const GROUPS = {
  all: { label: "All", types: null },
  agent: { label: "Agent", types: ["narration", "reasoning", "options", "action_draft", "report"] },
  tools: { label: "Tools", types: ["tool_call", "tool_result"] },
  physical: { label: "Physical events", types: PHYSICAL },
  model: { label: "Model calls", types: ["model_call"] },
  human: { label: "Human decisions", types: ["option_decision", "action_decision", "confirmation_decision", "autonomy_change"] },
  system: { label: "System", types: ["run_start", "run_end", "state_change", "notice", "cell_update", "kpi_update", "plan_update", "cost_update", "attempt_discarded"] }
};

export function createAuditPanel(panel, { onCount } = {}) {
  let filter = "all";
  const filterBtns = new Map();
  const tbody = h("tbody");
  const empty = h("p", { class: "audit-empty" }, "No events yet. Every event of a run, every model call and every decision is listed here and exports as JSON.");
  const head = h("div", { class: "audit-head" },
    h("div", { class: "audit-filters", role: "group", "aria-label": "Filter audit events" },
      Object.entries(GROUPS).map(([id, g]) => {
        const b = h("button", { class: "btn btn-sm", type: "button", "aria-pressed": String(id === filter) }, g.label);
        b.addEventListener("click", () => { filter = id; for (const [fid, fb] of filterBtns) fb.setAttribute("aria-pressed", String(fid === id)); renderAll(); });
        filterBtns.set(id, b);
        return b;
      })),
    h("div", { class: "audit-actions" },
      h("button", { class: "btn btn-sm btn-primary", type: "button", id: "btn-export-audit", on: { click: exportJson } }, icon("download", 16), "Export JSON")));
  const table = h("table", { class: "audit-table" },
    h("thead", {}, h("tr", {}, h("th", {}, "Run time"), h("th", {}, "Clock"), h("th", {}, "Event"), h("th", {}, "Details"))),
    tbody);
  panel.append(head, empty, table);

  function matches(ev) {
    const g = GROUPS[filter];
    return !g.types || g.types.includes(ev.type);
  }

  function row(ev) {
    return h("tr", { dataset: { type: ev.type } },
      h("td", { class: "t" }, ev.t !== null && ev.t !== undefined ? clock(ev.t) : "—"),
      h("td", { class: "t" }, timeOfDay(ev.ts)),
      h("td", { class: "k" }, h("span", { class: "audit-kind" }, ev.type)),
      h("td", { class: "s" }, summarize(ev)));
  }

  function renderAll() {
    clear(tbody);
    const rows = auditRows();
    for (const ev of rows) if (matches(ev)) tbody.appendChild(row(ev));
    empty.hidden = rows.length > 0;
    table.hidden = rows.length === 0;
    onCount?.(rows.length);
  }

  onAuditEvent((ev) => {
    if (matches(ev)) tbody.appendChild(row(ev));
    empty.hidden = true;
    table.hidden = false;
    onCount?.(auditRows().length);
  });

  function exportJson() {
    downloadText(auditFileName(), buildAuditExport());
  }

  renderAll();
  return { refresh: renderAll };
}

function summarize(ev) {
  const p = ev.payload || {};
  switch (ev.type) {
    case "run_start": return `${String(p.mode || "").toUpperCase()} run "${p.title}"${p.model ? ` on ${p.model}` : ""}${p.sim_source === "recorded" ? " (replay of a recorded live run)" : ""}`;
    case "run_end": return `${p.status}${p.reason ? `: ${p.reason}` : ""}`;
    case "state_change": return p.state;
    case "narration": return trim(p.text, 220);
    case "reasoning": return trim(p.text, 200);
    case "tool_call": return `${p.name} ${trim(JSON.stringify(p.input || {}), 200)}`;
    case "tool_result": return `${p.name}: ${p.ok === false ? "ERROR " : ""}${trim(p.summary || "", 200)}`;
    case "model_call": return `Step ${p.step}: ${p.messages_total ?? "?"} messages sent, stop reason ${p.stop_reason || "?"}, ${int(p.input_tokens)} in / ${int(p.output_tokens)} out tokens${p.cache_read_tokens ? ` (${int(p.cache_read_tokens)} from cache)` : ""}${p.duration_ms ? `, ${fixed(p.duration_ms / 1000, 1)} s` : ""}${p.request_id ? `, request ${p.request_id}` : ""}`;
    case "option_decision": return `${p.decision}: ${p.option_label || p.option_id}${p.options_seq ? ` (options set ${p.options_seq})` : ""}`;
    case "action_draft": return `${p.type} to ${p.recipient}: ${p.subject}`;
    case "action_decision": return `${p.decision}: ${p.label || p.action_id}`;
    case "report": return trim(p.markdown, 200);
    case "notice": return `[${p.level}] ${p.text}`;
    case "attempt_discarded": return `response not kept (${(p.msg_ids || []).length} text, ${(p.call_ids || []).length} calls): ${p.reason || ""}`;
    default: return trim(JSON.stringify(p), 200);
  }
}

function trim(s, n) {
  s = String(s ?? "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
