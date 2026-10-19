// A fake Claude conversation derived from a scripted replay played headless in Node (js/sim_check.js
// replayScript): every turn says what the replay said and calls what it called, in its order, with the
// same inputs. The live agent loop then runs against it, and the browser's tool results must equal the
// replay's: the same night, the same costings, the same outcome. Used by the live suite for every
// scenario (tests/live.mjs, cases sc2 to sc6), and by the decision driver's callers.
import { lastResults } from "./fake-claude.mjs";

const usage = { input_tokens: 900, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 400 };
const SIM_FOOTER = /\*Simulated run: a scripted replay on a simulated cell\.[^*]*\*/;
const LIVE_FOOTER = "*Live agent run on a simulated cell. Ruhrkorb, its DC, stores and items are fictional; every hour and euro comes from the deterministic engine and the reproducible night simulation.*";

/** Tools whose results the live run must reproduce exactly (the ui_* tools carry run-specific ids). */
const EXACT = (name) => !name.startsWith("ui_");

/**
 * A result as both modes must agree on it. The Open Food Facts lookup's note opens with why the
 * snapshot answered, and that reason is the mode's own ("Simulation: no live request is made." against
 * "Live Open Food Facts reads are not enabled in this build"); everything after it must be equal.
 */
function comparable(name, r) {
  if (name !== "open_lookup_barcode" || typeof r?.note !== "string") return r;
  const at = r.note.search(/(?:The bundled snapshot|Product data from the bundled snapshot)/);
  return { ...r, note: at >= 0 ? r.note.slice(at) : r.note };
}

/** What an answer of a ui_* tool must agree on. */
function uiFacts(name, r) {
  if (!r) return null;
  if (name === "ui_propose_options" || name === "ui_await_decision") return { decision: r.decision, option_id: r.option_id };
  if (name === "ui_await_approvals") return { approved: r.approved, rejected: r.rejected };
  if (name === "ui_request_confirmation") return { choice: r.choice };
  if (name === "ui_draft_action") return { status: r.status };
  if (name === "ui_final_report") return { published: r.published, outcome: r.outcome };
  return null;
}

/**
 * The turns for createFakeClaude: each with the replay's narration before a group of calls, the calls as
 * tool_use blocks, and an expectation on the next request that the browser's results equal the replay's.
 * The last turn says the replay's closing words and ends.
 */
export function conversationFromReplay(replay) {
  const turns = [];
  let texts = [];
  let group = [];          // [{ name, input, result }]
  let open = 0;            // calls of the group still waiting for their result
  let n = 0;
  let previous = null;     // the group whose results the next request carries
  const close = () => {
    const uses = group.map((c) => ({ type: "tool_use", id: `toolu_s${String(++n).padStart(3, "0")}`, name: c.name, input: c.input }));
    const check = previous;
    turns.push({
      usage, stop: "tool_use",
      blocks: [...texts.map((t) => ({ type: "text", text: t })), ...uses],
      expect: (req, ctx) => compare(req, ctx, check)
    });
    previous = group;
    texts = [];
    group = [];
  };
  for (const e of replay.events) {
    if (e.type === "narration") {
      if (group.length && open === 0) close();
      texts.push(e.payload.text);
    } else if (e.type === "tool_call") {
      if (group.length && open === 0) close();
      let input = JSON.parse(JSON.stringify(e.payload.input));
      // A live run's summary calls itself one.
      if (e.payload.name === "ui_final_report" && typeof input.markdown === "string") input = { ...input, markdown: input.markdown.replace(SIM_FOOTER, LIVE_FOOTER) };
      group.push({ name: e.payload.name, input, result: undefined });
      open += 1;
    } else if (e.type === "tool_result") {
      const c = group.find((x) => x.result === undefined && x.name === e.payload.name);
      if (c) { c.result = e.payload.result; open -= 1; }
    }
  }
  if (group.length) close();
  const last = previous;
  turns.push({ usage, stop: "end_turn", blocks: (texts.length ? texts : ["The night is closed."]).map((t) => ({ type: "text", text: t })), expect: (req, ctx) => compare(req, ctx, last) });
  return turns;
}

/** The browser's results for a group of calls against the replay's. */
function compare(req, { check }, group) {
  if (!group) return;
  const got = lastResults(req);
  check(got.length === group.length, `${group.length} results for ${group.map((c) => c.name).join(", ")} (got ${got.length})`);
  group.forEach((c, k) => {
    const r = got[k];
    check(r && r.isError === false, `${c.name} succeeded in the browser (${r?.raw?.slice(0, 160)})`);
    if (!r?.json) return;
    if (EXACT(c.name)) check(JSON.stringify(comparable(c.name, r.json)) === JSON.stringify(comparable(c.name, c.result)), `${c.name}: the browser's result equals the replay's (${r.raw.slice(0, 200)})`);
    else check(JSON.stringify(uiFacts(c.name, r.json)) === JSON.stringify(uiFacts(c.name, c.result)), `${c.name}: ${JSON.stringify(uiFacts(c.name, r.json))} as in the replay (${JSON.stringify(uiFacts(c.name, c.result))})`);
  });
}
