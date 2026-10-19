// Run facts: a short, factual summary of a finished run, shown on the console's last line and kept in
// the audit export. It doubles as the run's self-check: the time it took (agent time apart from the
// time spent waiting for the person), the wake-ups, the visible tool calls by kind, the guardrail
// refusals, the decision and the drafts, the model calls against the cap of 40, and the cost.

import { AGENT } from "./config.js";
import { eurCents } from "./format.js";

const KIND = (name) => (name.startsWith("wms_") ? "warehouse" : name.startsWith("cell_") ? "cell" : name.startsWith("world_") ? "world" : name.startsWith("open_") ? "open_data" : name.startsWith("sim_") ? "engine" : "other");

/**
 * rows: audit rows of the run (events and model_call rows) in order; end: the run_end envelope (its
 * `t` is the run time in ms).
 */
export function computeRunFacts(rows, end = null) {
  const events = rows.filter((r) => r.type !== "model_call");
  const start = events.find((e) => e.type === "run_start");
  const mode = start?.payload?.mode || null;
  const finish = end || [...events].reverse().find((e) => e.type === "run_end") || null;
  const totalMs = Math.max(0, finish?.t ?? events[events.length - 1]?.t ?? 0);

  // Visible tool calls: what the console lists (ui_* tools show as their effects, sim_advance as the wake-up).
  const calls = events.filter((e) => e.type === "tool_call" && !String(e.payload?.name || "").startsWith("ui_") && e.payload?.name !== "sim_advance");
  const byKind = { warehouse: 0, cell: 0, world: 0, engine: 0, open_data: 0 };
  for (const c of calls) { const k = KIND(String(c.payload.name)); if (k in byKind) byKind[k] += 1; }

  // Time spent waiting for the person (your decision, your approval, your confirmation) is not agent time.
  let waitingMs = 0;
  let waitStart = null;
  for (const e of events) {
    if (e.type !== "state_change" && e.type !== "run_end") continue;
    const awaiting = e.type === "state_change" && ["awaiting_approval", "options"].includes(e.payload?.state);
    if (awaiting && waitStart === null) waitStart = e.t ?? 0;
    else if (!awaiting && waitStart !== null) { waitingMs += Math.max(0, (e.t ?? 0) - waitStart); waitStart = null; }
  }
  if (waitStart !== null) waitingMs += Math.max(0, totalMs - waitStart);

  const guardrails = events.filter((e) => e.type === "tool_result" && e.payload?.result?.refused === true).length;
  const approved = events.filter((e) => e.type === "option_decision" && e.payload?.decision === "approved");
  const decisions = events.filter((e) => e.type === "action_decision");
  const cost = [...events].reverse().find((e) => e.type === "cost_update")?.payload || null;
  const modelCalls = rows.filter((r) => r.type === "model_call").length;
  const unitLog = [...events].reverse().find((e) => e.type === "unit_log")?.payload || null;
  const nightEnd = [...events].reverse().find((e) => e.type === "night_end")?.payload || null;

  return {
    mode,
    status: finish?.payload?.status || "running",
    run_time_s: Math.round(totalMs / 1000),
    agent_time_s: Math.round(Math.max(0, totalMs - waitingMs) / 1000),
    waiting_time_s: Math.round(waitingMs / 1000),
    wakeups: events.filter((e) => e.type === "wake").length,
    model_calls: modelCalls,
    tool_calls: calls.length,
    tool_calls_by_kind: byKind,
    guardrail_refusals: guardrails,
    approved_option: approved.at(-1)?.payload?.option_id || null,
    drafts: events.filter((e) => e.type === "action_draft").length,
    drafts_approved: decisions.filter((e) => e.payload?.decision === "approved").length,
    drafts_rejected: decisions.filter((e) => e.payload?.decision === "rejected").length,
    orders_on_time: nightEnd?.figures ? `${nightEnd.figures.orders_on_time} of ${nightEnd.figures.orders}` : null,
    night_hash: unitLog?.hash || null,
    cost_eur: cost && !cost.simulated ? Math.round((Number(cost.eur) || 0) * 100) / 100 : 0,
    checks: { within_call_cap: modelCalls <= AGENT.maxSteps }
  };
}

/** One readable sentence for the console. */
export function describeRunFacts(f) {
  const mins = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);
  const k = f.tool_calls_by_kind;
  const kinds = [
    k.warehouse ? `${k.warehouse} warehouse` : null,
    k.cell ? `${k.cell} cell` : null,
    k.world ? `${k.world} world model` : null,
    k.open_data ? `${k.open_data} open data` : null,
    k.engine ? `${k.engine} engine` : null
  ].filter(Boolean).join(", ");
  const time = f.mode === "simulation"
    ? `${mins(f.run_time_s)} replay${f.waiting_time_s ? `, ${mins(f.waiting_time_s)} of it waiting for you` : ""}`
    : `${mins(f.agent_time_s)} agent time${f.waiting_time_s ? ` plus ${mins(f.waiting_time_s)} waiting for you` : ""}`;
  const parts = [
    time,
    // The night's wake-ups, in plain words for the room (TECH_NOTES D50): the agent's turns.
    `${f.wakeups} agent turn${f.wakeups === 1 ? "" : "s"}`,
    `${f.tool_calls} tool call${f.tool_calls === 1 ? "" : "s"}${kinds ? ` (${kinds})` : ""}`,
    f.guardrail_refusals ? `${f.guardrail_refusals} guardrail refusal${f.guardrail_refusals === 1 ? "" : "s"}` : null,
    f.mode === "live" ? `${f.model_calls} of ${AGENT.maxSteps} model calls` : null,
    f.orders_on_time ? `${f.orders_on_time} orders on time` : null,
    f.mode === "simulation" ? "no cost (simulated)" : `cost ${eurCents(f.cost_eur)}`
  ].filter(Boolean);
  return `${parts.join("; ")}.`;
}
