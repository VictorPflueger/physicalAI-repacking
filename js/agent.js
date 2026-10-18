// Live agent: the Claude tool-use loop, run entirely in the presenter's browser (TECH_NOTES §3, §9).
//
// One run = repeated streaming calls to POST /v1/messages. Every response is appended to the
// conversation unchanged (thinking blocks and signatures included). stop_reason drives the loop:
//   tool_use   → execute the tools (independent reads in parallel), send the tool_result blocks
//   pause_turn → resend the conversation as it is
//   max_tokens → retry once with more room if a tool call was cut off, otherwise continue
//   end_turn   → the run ends, or the agent is asked to carry on if the night is not over
// The night is shared with the night player through the wake bridge (js/wake_bridge.js): sim_advance
// ends the agent's turn and returns the next wake-up, so the agent meets the night's events as they
// happen and a run fits inside 40 model calls. All UI effects go through the run-event bus, exactly as
// the scripted replay's, because both drive the same tools (js/tools.js). A response that is not kept
// (an attempt that failed mid-stream and was retried, or a turn discarded by the max_tokens retry) is
// marked as discarded on screen and in the audit, and nothing it did counts.

import { bus } from "./events.js";
import { MODELS, AGENT } from "./config.js";
import { streamMessage, withRetry, ApiError } from "./anthropic.js";
import { toolDefinitions, createToolbox, UI_BLOCKING_TOOLS, ORDER_FREE } from "./tools.js";
import { buildSystemPrompt, buildOpeningMessage, continueInstruction } from "./prompt.js";
import { createCostTracker } from "./cost.js";
import { recordApiExchange } from "./audit.js";
import { getKey } from "./keystore.js";
import { eurCents } from "./format.js";
import { createHumanChannel, ABORT } from "./human.js";
import { createOffLookup } from "./openfoodfacts.js";

/** hooks: { onKeyRejected() } */
export function createLiveAgent(hooks = {}) {
  let current = null;

  /**
   * Runs the agent on one night. opts: { session, bridge, scenario, world, modelId, getInputs,
   * getAutonomy, nightDate, onBeforeEnd(status) }. Resolves when the run has ended.
   */
  async function run({ session, bridge, scenario, world, modelId, getInputs, getAutonomy = () => "approve", nightDate = null, onBeforeEnd } = {}) {
    const modelDef = MODELS.find((m) => m.id === modelId) || MODELS[0];
    const r = {
      ended: false, cancelled: false, onBeforeEnd,
      ac: new AbortController(),
      step: 0, calls: 0,
      compat: { effort: true, display: true, thinking: true, cache: true },
      maxTokens: modelDef.maxTokens,
      modelDef,
      cost: createCostTracker(modelDef.id),
      exchanges: 0
    };
    current = r;
    const human = createHumanChannel(bus, { isEnded: () => r.ended });
    r.human = human;
    const toolbox = createToolbox({
      session, getInputs, mode: "live",
      // Nothing a tool emits after the run has ended (Abort, Reset) may reach the next run's screen.
      emit: (type, payload) => { if (!r.ended) bus.emit(type, payload); },
      waitUntil: human.waitUntil, takeOptionDecision: human.takeOptionDecision, takeConfirmation: human.takeConfirmation,
      drafts: human.drafts,
      onPhase: (state) => { if (!r.ended) bus.emit("state_change", { state }); },
      advance: () => human.guard(bridge.advance()),
      autonomy: getAutonomy,
      lookup: createOffLookup({ mode: "live" }),
      signal: r.ac.signal
    });
    r.toolbox = toolbox;

    try {
      bus.emit("cost_update", r.cost.snapshot());
      toolbox.setPhase("perceiving");
      const first = await human.guard(bridge.first());
      if (!first) return finish(r, "aborted", "The night was stopped before it started.");
      const system = buildSystemPrompt({ world, autonomy: getAutonomy() });
      const opening = buildOpeningMessage({ scenario, wake: first, info: session.info, nightDate, autonomy: getAutonomy() });
      const messages = [{ role: "user", content: opening }];
      let sentUpTo = 0;
      let maxTokensRetried = false;
      let nudges = 0;

      for (;;) {
        if (r.cancelled) throw ABORT;
        // Every model turn counts against the cap, one discarded by the max_tokens retry included.
        // Transport retries within a turn are bounded separately (two, in withRetry).
        if (r.calls >= AGENT.maxSteps) {
          return finish(r, "error", `Step limit reached (${AGENT.maxSteps} model calls). The run stops here to protect time and cost.`);
        }
        r.step += 1;
        r.calls += 1;

        const started = performance.now();
        const call = await callModel(r, system, messages);
        const { message, requestId, incomplete, attemptBody, attemptIds } = call;
        const snap = r.cost.add(message.usage);
        bus.emit("cost_update", snap);
        audit(r, { step: r.step, body: attemptBody, appended: messages.slice(sentUpTo).filter((m) => m.role === "user"), message, requestId, ms: Math.round(performance.now() - started) });
        sentUpTo = messages.length;

        if (snap.eur > AGENT.budgetEur) {
          messages.push({ role: "assistant", content: message.content });
          return finish(r, "aborted", `Cost cap reached: this run has used ${eurCents(snap.eur)}, above the ${eurCents(AGENT.budgetEur)} safety limit per run.`);
        }

        const stop = message.stop_reason;
        if (stop === "max_tokens" && incomplete.size && !maxTokensRetried) {
          // A tool call was cut off mid-input: discard this turn and retry once with more room.
          maxTokensRetried = true;
          r.maxTokens = Math.min(AGENT.maxOutputTokens, Math.round(r.maxTokens * 1.5));
          discardAttempt(attemptIds, "The response hit the output limit in the middle of a tool call; it is discarded and retried with more room.");
          continue;
        }

        const kept = cleanContent(message.content, incomplete);
        if (kept.length) messages.push({ role: "assistant", content: kept });

        if (stop === "pause_turn") continue;

        const uses = message.content.filter((b, i) => b.type === "tool_use" && !incomplete.has(i));
        if (stop === "tool_use" || (stop === "max_tokens" && uses.length)) {
          if (!uses.length) continue;
          const results = await runTools(r, uses, toolbox);
          messages.push({ role: "user", content: results });
          continue;
        }
        if (stop === "max_tokens") {
          sentUpTo = Math.min(sentUpTo, pushUserText(messages, "Continue from where you stopped."));
          continue;
        }
        if (stop === "refusal") return finish(r, "error", "The model declined to continue this request. Try another scenario or model.");
        if (stop === "model_context_window_exceeded") return finish(r, "error", "The conversation exceeded the model's context window.");
        // end_turn (or anything else): done once the summary is out. Before that the agent is asked,
        // at most twice and visibly, to carry on: nobody can answer questions in the console.
        const st = toolbox.state();
        if (st.reported) return finish(r, "done");
        if (nudges < AGENT.maxNudges) {
          nudges += 1;
          bus.emit("notice", { level: "info", text: "The agent paused before finishing the night. Repack Pilot asked it to continue on its own." });
          sentUpTo = Math.min(sentUpTo, pushUserText(messages, continueInstruction(st)));
          continue;
        }
        return finish(r, "incomplete", st.nightOver
          ? "The agent ended without a management summary. Approved drafts stay in the Outbox."
          : "The agent ended its turn twice before the night was over. Start a new run or try another model.");
      }
    } catch (e) {
      if (e === ABORT || e?.name === "AbortError") {
        if (!r.ended) finish(r, "aborted", r.abortReason || "Stopped by the user.");
        return;
      }
      handleError(r, e);
    } finally {
      human.close();
      if (current === r) current = null;
    }
  }

  // ---- model calls ------------------------------------------------------------------------------

  async function callModel(r, system, messages) {
    const stream = makeStreamHooks(r);
    let downgraded = 0;
    for (;;) {
      const body = requestBody(r, system, messages);
      try {
        const out = await withRetry(
          () => { stream.beginAttempt(); return streamMessage({ key: getKey(), body, signal: r.ac.signal, hooks: stream.hooks, idleMs: AGENT.idleTimeoutMs }); },
          {
            retries: AGENT.transportRetries,
            signal: r.ac.signal,
            onRetry: ({ attempt, waitMs, error }) => {
              // Whatever the failed attempt showed is not part of the run.
              discardAttempt(stream.ids(), null);
              bus.emit("notice", { level: "warn", text: `The API reported ${describeTransient(error)}. Retrying in ${Math.round(waitMs / 1000)} s (attempt ${attempt} of ${AGENT.transportRetries}).` });
            }
          }
        );
        return { ...out, attemptBody: body, attemptIds: stream.ids() };
      } catch (e) {
        if (r.cancelled) throw ABORT;
        discardAttempt(stream.ids(), null);
        if (!(e instanceof ApiError) || e.status !== 400 || downgraded >= 4) throw e;
        // Graceful degradation for optional request features (TECH_NOTES §3).
        if (/output_config|effort/i.test(e.message) && r.compat.effort) r.compat.effort = false;
        else if (/display/i.test(e.message) && r.compat.display) r.compat.display = false;
        else if (/thinking/i.test(e.message) && r.compat.thinking) r.compat.thinking = false;
        else if (/cache_control/i.test(e.message) && r.compat.cache) r.compat.cache = false;
        else throw e;
        downgraded += 1;
      } finally {
        // Throttled narration of a finished, failed or cancelled attempt never surfaces later.
        stream.flush();
      }
    }
  }

  function requestBody(r, system, messages) {
    const body = {
      model: r.modelDef.id,
      max_tokens: r.maxTokens,
      system,
      tools: toolDefinitions(),
      tool_choice: { type: "auto" },
      messages
    };
    if (r.compat.cache) body.cache_control = { type: "ephemeral" };
    if (r.compat.thinking) body.thinking = r.compat.display ? { type: "adaptive", display: "summarized" } : { type: "adaptive" };
    if (r.compat.effort) body.output_config = { effort: r.modelDef.effort };
    return body;
  }

  /**
   * Streams narration and reasoning to the console while a response arrives. Message ids are unique
   * per attempt, so a discarded attempt's text can be marked as such without touching the retry's.
   */
  function makeStreamHooks(r) {
    const pending = new Map();
    let timer = null;
    let attempt = 0;
    let shown = { msg_ids: [], call_ids: [] };
    const flushPending = () => {
      timer = null;
      if (!r.ended) for (const [id, ev] of pending) bus.emit(ev.type, { msg_id: id, text: ev.text, done: false });
      pending.clear();
    };
    const queue = (type, id, text) => {
      if (r.ended) return;
      pending.set(id, { type, text });
      if (!timer) timer = setTimeout(flushPending, 45);
    };
    const nid = (i) => `n-${r.step}-${attempt}-${i}`;
    const rid = (i) => `r-${r.step}-${attempt}-${i}`;
    const seen = (id) => { if (!shown.msg_ids.includes(id)) shown.msg_ids.push(id); };
    return {
      beginAttempt: () => {
        clearTimeout(timer);
        timer = null;
        pending.clear();
        attempt += 1;
        shown = { msg_ids: [], call_ids: [] };
      },
      ids: () => ({ msg_ids: shown.msg_ids.slice(), call_ids: shown.call_ids.slice() }),
      hooks: {
        onText: (i, text) => { if (text.trim()) { seen(nid(i)); queue("narration", nid(i), text); } },
        onThinking: (i, text) => { if (text.trim()) { seen(rid(i)); queue("reasoning", rid(i), text); } },
        onBlockStop: (i, block) => {
          if (r.ended) return;
          if (block.type === "text" && block.text.trim()) {
            pending.delete(nid(i));
            seen(nid(i));
            bus.emit("narration", { msg_id: nid(i), text: block.text, done: true });
          } else if (block.type === "thinking" && block.thinking?.trim()) {
            pending.delete(rid(i));
            seen(rid(i));
            bus.emit("reasoning", { msg_id: rid(i), text: block.thinking, done: true });
          }
        }
      },
      flush: () => {
        clearTimeout(timer);
        timer = null;
        pending.clear();
      }
    };
  }

  /** Marks what a response that is not kept showed (narration, reasoning) as discarded. */
  function discardAttempt(ids, note) {
    if (ids && (ids.msg_ids.length || ids.call_ids.length)) bus.emit("attempt_discarded", { ...ids, reason: note || "The API call failed and was retried; this part of the response is not used." });
    if (note) bus.emit("notice", { level: "info", text: note });
  }

  // ---- tools ----------------------------------------------------------------------------------------

  async function runTools(r, uses, toolbox) {
    const results = new Array(uses.length);
    let i = 0;
    while (i < uses.length) {
      if (r.cancelled) throw ABORT;
      if (ORDER_FREE(uses[i].name)) {
        // A run of independent reads executes in parallel.
        let j = i;
        while (j < uses.length && ORDER_FREE(uses[j].name)) j++;
        const batch = uses.slice(i, j);
        const outs = await Promise.all(batch.map((b) => execOne(r, b, toolbox)));
        outs.forEach((o, k) => { results[i + k] = o; });
        i = j;
      } else {
        results[i] = await execOne(r, uses[i], toolbox);
        i += 1;
      }
    }
    return results;
  }

  async function execOne(r, block, toolbox) {
    const name = block.name;
    bus.emit("tool_call", { call_id: block.id, name, input: block.input || {}, server: false, ...(UI_BLOCKING_TOOLS.has(name) ? { blocking: true } : {}) });
    let out;
    try {
      out = await toolbox.execute(name, block.input || {});
    } catch (e) {
      if (e === ABORT || typeof e === "symbol" || e?.name === "AbortError") throw ABORT;
      const why = String(e?.message || "unknown error");
      out = { content: JSON.stringify({ error: why }), isError: true, result: { error: why }, summary: "Tool error" };
    }
    // A slow tool that returns after Abort or Reset is dropped, never shown in the next run.
    if (r.ended || r.cancelled) throw ABORT;
    bus.emit("tool_result", { call_id: block.id, name, ok: !out.isError, summary: out.summary, result: out.result, server: false });
    return { type: "tool_result", tool_use_id: block.id, content: out.content, ...(out.isError ? { is_error: true } : {}) };
  }

  // ---- ending ----------------------------------------------------------------------------------------

  function finish(r, status, reason) {
    if (r.ended) return;
    r.onBeforeEnd?.(status);
    r.ended = true;
    const st = status === "done" ? "done" : status === "incomplete" ? "stopped" : status;
    bus.emit("state_change", { state: st });
    bus.emit("run_end", { status, ...(reason ? { reason } : {}) });
  }

  function handleError(r, e) {
    console.error("[Repack Pilot] live run failed:", e);
    let text;
    if (e instanceof ApiError) {
      if (e.status === 401) {
        text = "Anthropic rejected the API key (401). It has been removed from this tab; start again and enter a valid key.";
        hooks.onKeyRejected?.();
      } else if (e.spendLimit || e.status === 402) {
        text = "The API key has reached its spend limit or has no credit. Raise the workspace's spend limit at platform.claude.com (Settings, Workspaces), or use Simulation mode.";
      } else if ((e.status === 400 || e.status === 403) && /workspace/i.test(e.message || "")) {
        text = `Anthropic refused the request because of this key's workspace (${e.message}). If the key works in several workspaces, create one scoped to a single workspace at platform.claude.com (Settings, API keys) and enter that key.`;
      } else if (e.status === 404) {
        text = `The model ${r.modelDef.label} is not available to this API key. Choose another model.`;
      } else if (e.status === 0 && e.type === "network_error") {
        text = `Could not reach api.anthropic.com from this browser (${e.message}). Check the network or run Diagnostics; Simulation mode works offline.`;
      } else if (e.retryable) {
        text = `The API is busy right now (${describeTransient(e)}), even after ${AGENT.transportRetries} retries. Try again in a minute, or run the Simulation.`;
      } else {
        text = `The API returned an error (${e.status || ""} ${e.type}): ${e.message}`;
      }
      if (e.requestId) text += ` Request id: ${e.requestId}.`;
    } else {
      text = `The run stopped because of an unexpected error: ${e?.message || e}`;
    }
    bus.emit("notice", { level: "error", text });
    finish(r, "error", "See the message above.");
  }

  function abort(reason = "Stopped by the user.") {
    const r = current;
    if (!r || r.ended) return;
    r.cancelled = true;
    r.abortReason = reason;
    r.ac.abort();
    r.human?.cancel();
    finish(r, "aborted", reason);
  }

  return { run, abort, isActive: () => !!current && !current.ended };
}

// ---------------------------------------------------------------------------------------------------

/** Drops tool_use blocks that were cut off by max_tokens (they cannot be answered). */
function cleanContent(content, incomplete) {
  if (!incomplete?.size) return content;
  return content.filter((_, i) => !incomplete.has(i));
}

/**
 * Adds a text instruction as the next user turn, merging into a trailing user turn if needed. Returns
 * the index of the message it changed, so the audit records it again.
 */
function pushUserText(messages, text) {
  const last = messages[messages.length - 1];
  if (last?.role === "user") {
    const content = Array.isArray(last.content) ? last.content : [{ type: "text", text: String(last.content) }];
    last.content = [...content, { type: "text", text }];
    return messages.length - 1;
  }
  messages.push({ role: "user", content: text });
  return messages.length - 1;
}

function describeTransient(e) {
  if (e.status === 429) return "a rate limit (429)";
  if (e.status === 529 || e.type === "overloaded_error") return "overload (529)";
  if (e.type === "timeout_error") return "a timeout";
  if (e.type === "network_error") return "a network interruption";
  return `${e.status || ""} ${e.type}`.trim();
}

/** Audit record of one model exchange: the newly sent messages and the full response. */
function audit(r, { step, body, appended, message, requestId, ms }) {
  r.exchanges += 1;
  const request = {
    model: body.model, max_tokens: body.max_tokens,
    thinking: body.thinking || null, output_config: body.output_config || null,
    cache_control: body.cache_control || null,
    tools: body.tools.map((t) => t.name),
    messages_total: body.messages.length,
    appended_messages: appended.map(stripOpaque)
  };
  if (r.exchanges === 1) {
    request.system = body.system;
    request.tool_definitions = body.tools;
  }
  recordApiExchange({
    step, request_id: requestId, duration_ms: ms,
    request,
    response: { id: message.id, model: message.model, stop_reason: message.stop_reason, usage: message.usage, content: message.content.map(stripBlock) }
  });
}

function stripOpaque(msg) {
  return { role: msg.role, content: Array.isArray(msg.content) ? msg.content.map(stripBlock) : msg.content };
}

function stripBlock(b) {
  if (!b || typeof b !== "object") return b;
  const copy = { ...b };
  if (copy.signature) copy.signature = "[signature omitted]";
  if (copy.type === "redacted_thinking") copy.data = "[redacted]";
  return copy;
}
