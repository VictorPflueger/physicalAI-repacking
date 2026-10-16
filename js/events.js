// The run-event bus. Every UI effect flows through here, whichever producer runs: the live agent
// or the simulation player (both from M3). The UI subscribes to event types and never asks which
// producer is running; only the mode badge, the console watermark and the audit export read the
// envelope's `mode`.
//
// Envelope: { id, seq, type, ts (ISO), t (ms since run start or null), run_id, mode, payload }
//
// Event types and payloads (PLAN.md §d.1). Inherited from Rebate Hunter with the same envelope and role:
//   run_start         { run_id, mode: "live"|"simulation", scenario_id, title, seed?, night_date?, model?, model_label?,
//                       sim_source?: "authored"|"recorded", recorded_on?, recorded_model? }
//   state_change      { state, note? }              states: see RUN_STATES
//   narration         { msg_id, text, done }        streamed upsert: same msg_id replaces text
//   reasoning         { msg_id, text, done }        summarised model thinking (shown collapsed)
//   tool_call         { call_id, name, input }
//   tool_result       { call_id, name, ok, summary, result }
//   option_decision   { option_id, option_label, options_seq, decision: "approved"|"rejected", by: "user", note? }
//   action_draft      { action_id, type: "email"|"memo"|"call_in", recipient, subject, body, status: "pending" }
//   action_decision   { action_id, decision: "approved"|"rejected", by: "user", label? }
//   report            { markdown, outcome? }
//   cost_update       { eur, usd, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, simulated }
//   notice            { level: "info"|"warn"|"error", text }
//   attempt_discarded { msg_ids, call_ids, reason }
//   run_end           { status: "done"|"incomplete"|"aborted"|"error", reason? }
// New payloads: options (extra labour, late store orders, expected total), kpi_update (labour per
// 1,000 units, orders on time, night clock) and cell_update (Rebate Hunter's board_update).
// New for Repack Pilot (the brief's five first): detection, grasp_attempt, world_model_correction,
// escalation, autonomy_change, then clock, scale_reading, tote_update, wake, cutoff_risk, dispatch,
// plan_update, confirmation_request and confirmation_decision. Their payloads are specified in
// PLAN.md §d.1 and documented here as the milestones that emit them land.

export const RUN_STATES = {
  idle: "Idle",
  perceiving: "Perceiving",
  planning: "Planning",
  picking: "Picking",
  replanning: "Replanning",
  options: "Options",
  awaiting_approval: "Awaiting approval",
  executing: "Executing",
  done: "Done",
  stopped: "Stopped",
  aborted: "Aborted",
  error: "Error"
};

class RunEventBus {
  constructor() {
    this.handlers = new Map();
    this.anyHandlers = new Set();
    this.seq = 0;
    this.run = null; // { run_id, mode, t0 }
  }

  /** Subscribe to one event type. Returns an unsubscribe function. */
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  /** Subscribe to every event. Returns an unsubscribe function. */
  onAny(fn) {
    this.anyHandlers.add(fn);
    return () => this.anyHandlers.delete(fn);
  }

  /** Marks the start of a run so events carry run id, mode and relative time. */
  beginRun({ run_id, mode }) {
    this.run = { run_id, mode, t0: performance.now() };
  }

  endRun() {
    this.run = null;
  }

  currentRun() {
    return this.run ? { ...this.run } : null;
  }

  emit(type, payload = {}) {
    const envelope = {
      id: `ev-${Date.now().toString(36)}-${(++this.seq).toString(36)}`,
      seq: this.seq,
      type,
      ts: new Date().toISOString(),
      t: this.run ? Math.round(performance.now() - this.run.t0) : null,
      run_id: this.run?.run_id ?? null,
      mode: this.run?.mode ?? null,
      payload
    };
    for (const fn of this.handlers.get(type) || []) safeCall(fn, envelope);
    for (const fn of this.anyHandlers) safeCall(fn, envelope);
    return envelope;
  }
}

function safeCall(fn, envelope) {
  try {
    fn(envelope);
  } catch (err) {
    // A failing subscriber must never break the run; surface it in the browser console only.
    console.error(`[Repack Pilot] event handler failed for ${envelope.type}:`, err);
  }
}

export const bus = new RunEventBus();

/** New run id, e.g. run-20261016-2200-k3f9. */
export function newRunId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `run-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${Math.random().toString(36).slice(2, 6)}`;
}
