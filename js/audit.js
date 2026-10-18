// Audit trail: every run event plus every model request/response, exportable as JSON.
// Secrets never enter it: API keys are not part of any event, and the export is redacted again.
//
// Two lists are kept: `events` (the run-event stream as the UI saw it) and `apiExchanges` (one record
// per model call of a live run: what was sent, what came back, usage and timing). The Audit tab shows
// both in one chronological view; each model call appears as a "model_call" row. The export adds the
// run facts (js/run_facts.js) of a finished run.
//
// The night's ordinary units are not kept one envelope per detection, grasp, reading, pick and tote:
// the event "unit_log" holds them as one row per unit (PLAN.md §d.1 "Audit volume"). Exceptions stay
// full events: an unknown barcode, a failed grasp, a reading outside the tolerance, an item set aside,
// a closed tote, every correction, escalation, projection, cut-off risk, wake-up and dispatch.

import { bus } from "./events.js";
import { APP } from "./config.js";
import { redactSecrets } from "./keystore.js";
import { isFineEvent } from "./night.js";
import { computeRunFacts } from "./run_facts.js";

const events = [];
const apiExchanges = [];
const rows = [];
const listeners = new Set();
let run = null;

bus.onAny((ev) => {
  // Streaming narration arrives as many partial updates; the audit keeps only final texts.
  if ((ev.type === "narration" || ev.type === "reasoning") && !ev.payload?.done) return;
  if (isFineEvent(ev.type, ev.payload)) return;
  const copy = safeClone(ev);
  events.push(copy);
  if (ev.type === "run_start") {
    run = {
      run_id: ev.payload.run_id, mode: ev.payload.mode,
      scenario_id: ev.payload.scenario_id || null, title: ev.payload.title, model: ev.payload.model || null,
      seed: ev.payload.seed ?? null, sim_source: ev.payload.sim_source || null,
      ...(ev.payload.chosen_mode ? { chosen_mode: ev.payload.chosen_mode } : {}),
      ...(ev.payload.night_inputs_kept ? { night_inputs_kept: ev.payload.night_inputs_kept } : {}),
      started_at: ev.ts, ended_at: null, status: "running"
    };
  }
  // The night's fingerprint: the same scenario, seed and inputs give the same hash in every browser.
  if (ev.type === "unit_log" && run) run.night_hash = ev.payload.hash;
  if (ev.type === "run_end" && run) {
    run.ended_at = ev.ts;
    run.status = ev.payload.status;
  }
  addRow(copy);
});

function addRow(row) {
  rows.push(row);
  for (const fn of listeners) fn(row);
}

/** Subscribe to new audit rows (events and model calls). */
export function onAuditEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The run-event stream of the current (or last) run. */
export function auditEvents() {
  return events.slice();
}

/** Events and model calls in the order they happened, for the Audit tab. */
export function auditRows() {
  return rows.slice();
}

/** Summary of the current (or last) run: id, mode, scenario, model, status, times. */
export function auditRunInfo() {
  return run ? { ...run } : null;
}

/** Record one model request/response (from the live agent). Never pass headers. */
export function recordApiExchange(entry) {
  const ts = new Date().toISOString();
  const record = safeClone({ ts, ...entry });
  apiExchanges.push(record);
  const current = bus.currentRun();
  const r = record.response || {};
  const q = record.request || {};
  addRow({
    type: "model_call",
    ts,
    t: current ? Math.round(performance.now() - current.t0) : null,
    payload: {
      step: record.step,
      request_id: record.request_id || null,
      duration_ms: record.duration_ms ?? null,
      model: q.model || r.model || null,
      messages_total: q.messages_total ?? null,
      max_tokens: q.max_tokens ?? null,
      stop_reason: r.stop_reason || null,
      input_tokens: r.usage?.input_tokens ?? 0,
      output_tokens: r.usage?.output_tokens ?? 0,
      cache_read_tokens: r.usage?.cache_read_input_tokens ?? 0,
      blocks: Array.isArray(r.content) ? r.content.map((b) => b.type) : []
    }
  });
}

export function resetAudit() {
  events.length = 0;
  apiExchanges.length = 0;
  rows.length = 0;
  run = null;
}

/** Builds the JSON export for the current run (or for this session's notices when no run started). */
export function buildAuditExport() {
  const world = globalThis.WORLD?.meta || {};
  const lastCost = [...events].reverse().find((e) => e.type === "cost_update")?.payload || null;
  const mode = run?.mode || null;
  const recorded = run?.sim_source === "recorded";
  const doc = {
    app: `${APP.name}: ${APP.fullName}`,
    app_version: APP.version,
    exported_at: new Date().toISOString(),
    mode,
    mode_statement: mode === "simulation"
      ? recorded
        ? "SIMULATION: replay of a recorded live run. No model was called during this replay; the evidence shown was recorded earlier and is not live."
        : "SIMULATION: scripted replay of a representative night through the agent's own tools; every figure was computed by the engine and the night simulation. No model was called."
      : mode === "live"
        ? "LIVE: real model reasoning and real tool calls made from the presenter's browser, against the simulated cell."
        : mode === "preview"
          ? "NIGHT PREVIEW: the engine and the night simulation played tonight without the agent. No model was called and nothing was drafted."
          : "No run recorded.",
    ai_disclosure: "This log documents an AI system. All outbound actions are drafts in an in-app outbox; nothing was sent to any external party.",
    world_note: world.retailer_note || "The world is synthetic.",
    simulated_cell: "The robot cell, camera, scale, gripper and warehouse system are simulated in both modes.",
    world_version: world.world_version || null,
    run,
    run_facts: run && run.status !== "running" ? safeFacts() : null,
    cost: lastCost,
    counts: { ...countBy(events.map((e) => e.type)), model_calls: apiExchanges.length },
    events,
    api_exchanges: apiExchanges
  };
  return redactSecrets(JSON.stringify(doc, null, 2));
}

export function auditFileName() {
  const id = run?.run_id || `repack-pilot-${Date.now()}`;
  const suffix = { simulation: "-SIMULATION", live: "-LIVE", preview: "-PREVIEW" }[run?.mode] || "";
  return `${id}${suffix}-audit.json`;
}

function safeFacts() {
  try { return computeRunFacts(rows); } catch { return null; }
}

function countBy(list) {
  const out = {};
  for (const x of list) out[x] = (out[x] || 0) + 1;
  return out;
}

function safeClone(obj) {
  try {
    return JSON.parse(redactSecrets(JSON.stringify(obj)));
  } catch {
    return { unserializable: true };
  }
}
