// Audit tab: chronological log of every event and every model call, with filters, JSON export and
// "Save run as simulation" (js/recorder.js), enabled after a Live run that reached its summary.

import { h, clear, downloadText } from "./dom.js";
import { icon } from "./icons.js";
import { clock, timeOfDay, int, fixed, upTo } from "./format.js";
import { auditRows, onAuditEvent, buildAuditExport, auditFileName } from "./audit.js";
import { canRecord } from "./recorder.js";
import { clockOf, clockUp } from "./nightsim.js";

const PHYSICAL = ["night_plan", "wave_arrival", "order_new", "detection", "rehearsal", "grasp_attempt", "scale_reading", "manual_pick", "tote_update",
  "world_model_correction", "escalation", "projection", "cutoff_risk", "wake", "dispatch", "late_complete", "night_end", "unit_log", "clock"];
const GROUPS = {
  all: { label: "All", types: null },
  agent: { label: "Agent", types: ["narration", "reasoning", "options", "action_draft", "report"] },
  tools: { label: "Tools", types: ["tool_call", "tool_result"] },
  physical: { label: "Physical events", types: PHYSICAL },
  model: { label: "Model calls", types: ["model_call"] },
  human: { label: "Human decisions", types: ["option_decision", "action_decision", "confirmation_decision", "autonomy_change", "assumption_change"] },
  system: { label: "System", types: ["run_start", "run_end", "state_change", "notice", "cell_update", "kpi_update", "plan_update", "cost_update", "attempt_discarded"] }
};

export function createAuditPanel(panel, { onCount, onSaveSimulation } = {}) {
  let filter = "all";
  const filterBtns = new Map();
  const saveBtn = h("button", { class: "btn btn-sm", type: "button", id: "btn-save-simulation", on: { click: saveSimulation } }, icon("download", 16), "Save run as simulation");
  const status = h("p", { class: "audit-status", role: "status", hidden: true });
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
      h("button", { class: "btn btn-sm btn-primary", type: "button", id: "btn-export-audit", on: { click: exportJson } }, icon("download", 16), "Export JSON"),
      saveBtn));
  const table = h("table", { class: "audit-table" },
    h("thead", {}, h("tr", {}, h("th", {}, "Run time"), h("th", {}, "Night"), h("th", {}, "Clock"), h("th", {}, "Event"), h("th", {}, "Details"))),
    tbody);
  panel.append(head, status, empty, table);

  function matches(ev) {
    const g = GROUPS[filter];
    return !g.types || g.types.includes(ev.type);
  }

  function row(ev) {
    const simT = ev.payload?.sim_t;
    return h("tr", { dataset: { type: ev.type } },
      h("td", { class: "t" }, ev.t !== null && ev.t !== undefined ? clock(ev.t) : "—"),
      h("td", { class: "t" }, typeof simT === "number" ? clockOf(simT) : "—"),
      h("td", { class: "t" }, timeOfDay(ev.ts)),
      h("td", { class: "k" }, h("span", { class: "audit-kind" }, ev.type)),
      h("td", { class: "s" }, summarize(ev)));
  }

  function refreshSave() {
    const can = canRecord();
    saveBtn.setAttribute("aria-disabled", String(!can.ok));
    saveBtn.title = can.ok ? "Download this Live run as a simulation script that can replace the scripted replay of its scenario" : can.reason;
  }

  async function saveSimulation() {
    refreshSave();
    const can = canRecord();
    if (!can.ok) return setStatus(can.reason, "error");
    setStatus("Checking the recording against the script checker…", "ok");
    const r = await onSaveSimulation?.();
    if (r) setStatus(r.message, r.ok ? "ok" : "error");
    return r;
  }

  function setStatus(text, tone) {
    status.hidden = !text;
    status.textContent = text || "";
    status.dataset.tone = tone || "ok";
  }

  function renderAll() {
    refreshSave();
    clear(tbody);
    const rows = auditRows();
    for (const ev of rows) if (matches(ev)) tbody.appendChild(row(ev));
    empty.hidden = rows.length > 0;
    table.hidden = rows.length === 0;
    onCount?.(rows.length);
  }

  onAuditEvent((ev) => {
    if (ev.type === "run_start") setStatus("");
    if (ev.type === "run_start" || ev.type === "run_end") queueMicrotask(refreshSave);
    if (matches(ev)) tbody.appendChild(row(ev));
    empty.hidden = true;
    table.hidden = false;
    onCount?.(auditRows().length);
  });

  function exportJson() {
    downloadText(auditFileName(), buildAuditExport());
  }

  renderAll();
  return { refresh: renderAll, saveSimulation };
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
    // The night (M2): the ordinary units are in the unit log; exceptions arrive one by one.
    case "night_plan": return `${int(p.totals?.units)} units for ${int((p.orders || []).length)} orders, seed ${p.seed}, r_m ${int(p.r_m)}, r_c ${int(p.r_c)}, p ${fixed(p.p, 2)}`;
    case "wave_arrival": return `${p.label}: ${int(p.units)} units`;
    case "order_new": return `${p.order} for ${p.store}: ${int(p.units)} units, due ${p.due}`;
    case "detection": return `${p.unit_id}: barcode ${p.barcode}${p.known ? "" : " not in the item master"}, confidence ${fixed(p.confidence, 2)}`;
    case "rehearsal": return `${p.sku} rehearsed again at ${int(p.weight_g)} g, expected success ${fixed(p.expected_success, 2)}`;
    case "grasp_attempt": return `${p.unit_id} ${p.grip}: ${p.ok ? "picked" : "failed, to the manual station"} (expected ${fixed(p.expected_success, 2)}, confidence ${fixed(p.grasp_confidence, 2)})`;
    case "scale_reading": return `${p.unit_id}: ${int(p.observed_g)} g, expected ${int(p.expected_g)} g`;
    case "world_model_correction": return `${p.sku} ${p.field} ${int(p.old)} → ${int(p.new)} (${p.sensor}), applies to the whole SKU`;
    case "escalation": return `${p.rule} ${p.escalation_id}: ${p.reason} → ${p.to === "person" ? "a person" : "the manual station"}${p.needs_confirmation ? ", needs confirmation" : ""}`;
    case "manual_pick": return `${p.unit_id} by ${p.picker}: ${p.set_aside ? "set aside, unknown item" : p.reason}`;
    case "tote_update": return `${p.store} tote ${p.tote_no} ${p.status}: ${int(p.units)} units, ${upTo(p.weight_g / 1000, 2)} kg`;
    case "projection": { const risk = (p.orders || []).filter((o) => o.at_risk).map((o) => o.id); return `${int((p.orders || []).length)} orders projected; ${risk.length ? `at risk: ${risk.join(", ")}` : "none at risk"}`; }
    case "cutoff_risk": return (p.stores || []).map((x) => `${x.store} ${x.projected} for ${x.cutoff} (${x.slack_min} min)`).join("; ");
    case "wake": return `${p.wake_id}: ${(p.kinds || [p.kind]).join(", ")}`;
    case "dispatch": return `${p.store}: ${p.moved ? "moved to the next wave" : p.on_time ? "on time" : "late"}, ${int(p.units)} of ${int(p.of)} units on the truck`;
    case "late_complete": return `${p.store}: last unit by ${clockUp(p.t)}`;
    case "night_end": return `${int(p.figures?.orders_on_time)} of ${int(p.figures?.orders)} orders on time; ${int(p.figures?.units_repacked)} units; labour ${upTo(p.figures?.labour_hours, 2)} h; seed ${p.figures?.seed}`;
    case "unit_log": return `${int((p.rows || []).length)} units${p.partial ? `, stopped at ${p.until}` : ""}; seed ${p.seed}, night hash ${p.hash}`;
    case "assumption_change": return `${p.id}: ${p.from} → ${p.to}${p.reset ? " (reset)" : ""}${p.via === "your_dc" ? " (Your DC)" : ""}${p.applies && p.applies !== "now" ? `, ${p.applies}` : ""}`;
    case "autonomy_change": return `${p.from} → ${p.to} by the person${p.gate ? `; Bounded ${p.gate.met ? "unlocked" : `locked (${(p.gate.failing || []).join(", ")})`}` : ""}`;
    case "plan_update": return `${p.source}${p.option_id ? ` ${p.option_id}` : ""}: ${(p.levers || []).map((l) => l.type).join(", ")}${p.from ? ` from ${p.from}` : ""}`;
    default: return trim(JSON.stringify(p), 200);
  }
}

function trim(s, n) {
  s = String(s ?? "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
