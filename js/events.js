// The run-event bus. Every UI effect flows through here, whichever producer runs: the live agent or
// the scripted replay, which drive the same tools (js/tools.js). The UI subscribes to event types and
// never asks which producer is running; only the mode badge, the console watermark and the audit
// export read the envelope's `mode`.
//
// Envelope: { id, seq, type, ts (ISO), t (ms since run start or null), run_id, mode, payload }
//
// Event types and payloads (PLAN.md §d.1). Inherited from Rebate Hunter with the same envelope and role:
//   run_start         { run_id, mode: "live"|"simulation"|"preview", scenario_id, title, seed?, chosen_mode?, model?, model_label?,
//                       inputs, changed_inputs, night_inputs_kept?, sim_source?: "authored"|"recorded", recorded_on?, recorded_model? }
//   state_change      { state, note? }              states: see RUN_STATES
//   narration         { msg_id, text, done }        streamed upsert: same msg_id replaces text
//   reasoning         { msg_id, text, done }        summarised model thinking (shown collapsed)
//   tool_call         { call_id, name, input, server, blocking? }
//   tool_result       { call_id, name, ok, summary, result }   result.refused: a guardrail refused it (a Guardrail line)
//   option_decision   { option_id, option_label, options_seq, decision: "approved"|"rejected", by: "user", note? }
//   action_draft      { action_id, type: "email"|"memo"|"call_in", recipient, subject, body, status: "pending" }
//   action_decision   { action_id, decision: "approved"|"rejected", by: "user", label? }
//   report            { markdown, outcome? }
//   cost_update       { eur, usd, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, simulated }
//   notice            { level: "info"|"warn"|"error", text }
//   attempt_discarded { msg_ids, call_ids, reason }
//   run_end           { status: "done"|"incomplete"|"aborted"|"error", reason? }
// New payloads (M3): options { options_seq, at, replications, seed, late_cost_eur, recommended, options: [{ id,
// letter, title, description, residual_risk, levers_text, extra_labour_eur, call_in_eur, extra_picks_eur,
// expected_late_orders, late_orders_eur, expected_total_eur, late_by_order, tonight, recommended }],
// baseline: { expected_late_orders, late_orders_eur, expected_total_eur, late_by_order, tonight, description } };
// plan_update { source: "decision"|"safety", option_id?, clock, sim_t, reason?, levers: [{ type, …, from, from_ms,
// until?, until_ms? }] } (a decision or a safety action, from the next millisecond, js/night_session.js);
// provisional_entry { barcode, name, net_content, source, status: "unverified", created };
// confirmation_request { request_id, subject, reason, entry_barcode?, choices } and confirmation_decision
// { request_id, choice: "confirm"|"reject", subject?, by: "user" }.
// New for Repack Pilot (the brief's five first): detection, grasp_attempt, world_model_correction,
// escalation, autonomy_change, then clock, scale_reading, tote_update, wake, cutoff_risk, dispatch,
// plan_update, confirmation_request and confirmation_decision. Their payloads are specified in
// PLAN.md §d.1 and documented here as the milestones that emit them land.
//
// From the night simulation (js/nightsim.js, played by js/night.js; M2). Every one carries `sim_t`, its
// simulated time in ms after 22:00:
//   night_plan        { seed, volume, scenario_id, orders, waves, items, totals, r_m, r_c, p, express?, unknown?, wear? }
//   clock             { t, label: "02:00", paused, reason? }        once per simulated minute and at every pause
//   wave_arrival      { wave, label, units }
//   order_new         { order: "XPR", store, units, due }
//   detection         { unit_id, sku, store, barcode, confidence, known }
//   rehearsal         { sku, grip, weight_g, expected_success, reason }
//   grasp_attempt     { unit_id, sku, store, grip, expected_success, grasp_confidence, ok, reason? }
//   scale_reading     { unit_id, sku, expected_g, observed_g }
//   world_model_correction { sku, field: "weight_g", old, new, sensor: "scale", at, applies_to: "sku", unit_id }
//   escalation        { escalation_id, rule: "E1"…"E4", unit_id?, sku?, store?, reason, to, needs_confirmation, t }
//   manual_pick       { unit_id, sku, store, picker, reason, set_aside? }
//   tote_update       { store, tote_no, units, weight_g, status: "filling"|"closed" }
//   projection        { t, orders: [{ id, projected_ms, cutoff_ms, slack_min, at_risk }] }
//   cutoff_risk       { t, stores: [{ store, projected, cutoff, slack_min, new }] }
//   wake              { wake_id, kind, kinds, t, clock, items }        the night stands still until its turn is over
//   dispatch          { store, order, t, on_time, units, of, moved }   at the store's cut-off
//   late_complete     { store, order, t, units }                       the last unit of a late order
//   night_end         { figures, orders }                              tonight's figures (PLAN.md §c.5)
//   units_routed      { reason, units, skus }                         the cell hands units to the manual station
//   order_moved       { order, store, manual_dropped }                 an order moved to the next day's wave
//   unit_log          { columns, rows, seed, hash, partial?, until? }  one row per unit: the audit keeps the
//                     ordinary units here instead of thousands of envelopes (js/night.js, isFineEvent)
// A scenario without a scripted replay yet plays its night in Simulation without the agent ("night
// preview": run_start mode "preview", run state "previewing").

export const RUN_STATES = {
  idle: "Idle",
  previewing: "Night preview",
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
