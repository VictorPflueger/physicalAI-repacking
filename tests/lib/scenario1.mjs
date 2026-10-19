// Scenario 1 for the tests: the night in Node (the scripted replay's decision paths, headless, through
// the agent's own tools) and a scripted conversation for the fake Claude that makes the same decisions
// as the scripted replay on path B (rebalance Essen's tote at the correction, approve option B), so the
// live run must produce the same physical night. The fake's figures are taken from the Node replay,
// never typed: what the live agent writes is checked against the tool results it really received.
import path from "node:path";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./harness.mjs";

const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);

/** The data files as the page loads them (window globals), in a sandbox. */
export async function loadData() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const f of ["data/world.js", "data/scenarios.js", "data/shadow_record.js", "data/off_snapshot.js", "data/reference_cases.js", "data/sim_runs.js"]) {
    vm.runInContext(await readFile(path.join(APP_ROOT, f), "utf8"), sandbox, { filename: f });
  }
  globalThis.OFF_SNAPSHOT = sandbox.window.OFF_SNAPSHOT;
  return sandbox.window;
}

/** The scripted replay of scenario 1 played headless for a decision plan ({ option: "B" } …). */
export async function replayScenario1(plan = { option: "B" }) {
  const data = await loadData();
  const { replayScript } = await mod("js/sim_check.js");
  const sc = data.SCENARIOS.find((s) => s.id === "SC1-EXPRESS");
  const r = await replayScript(data.SIM_RUNS[sc.id], { world: data.WORLD, scenario: sc, refs: data.REFERENCE_CASES[sc.id], plan });
  if (!r.ok) throw new Error(`The scripted replay of scenario 1 failed in Node: ${r.errors.join(" | ")}`);
  const res = r.session.run;
  // Plain objects of this realm (the data files ran in a sandbox): the fake compares them deeply.
  const variants = JSON.parse(JSON.stringify(data.REFERENCE_CASES[sc.id].options.variants));
  return {
    data, scenario: sc, replay: r, vars: r.vars, variants,
    hash: res.hash,
    orders: Object.fromEntries(res.orders.map((o) => [o.id, o.on_time ? "on time" : o.moved ? "moved" : "late"])),
    onTime: res.orders.filter((o) => o.on_time).length, total: res.orders.length,
    report: r.events.find((e) => e.type === "report")?.payload.markdown || null,
    options: r.events.find((e) => e.type === "options")?.payload || null
  };
}

const usage = (o = {}) => ({ input_tokens: 700, cache_creation_input_tokens: 0, cache_read_input_tokens: 11000, output_tokens: 450, ...o });

/**
 * The fake Claude's conversation for scenario 1 (19 kept or discarded turns and one 529): parallel reads,
 * a pause_turn, a 529 retry, a max_tokens retry, an amount the engine did not produce (refused, then
 * corrected), option B, two drafts, the summary. v: the Node replay's variables; variants: the reference
 * options. The checks in `expect` see what the browser's tools returned.
 */
export function liveConversation({ v, variants, lastResults, wrongAmount = "€143.25" }) {
  const T = (id, name, input) => ({ type: "tool_use", id, name, input });
  const say = (text) => ({ type: "text", text });
  const callIn = (amount) => `Hello,\n\nRuhrkorb DC Unna needs one picker at the manual station tonight from 02:00, for the call-in minimum of ${v["options.call_in_min"]}${amount ? ` (${amount} of extra labour)` : ""}. Please report to the shift lead at the repack cell.\n\nNight shift lead, Ruhrkorb DC Unna`;
  const report = `## Ruhrkorb DC Unna, night shift: an express order at 02:00\n\n**What happened.** At 02:00 the Dortmund flagship ordered ${v["xpr.units"]} more units for its ${v["xpr.due"]} truck; with the express order first, Hamm and Soest were projected to miss their trucks.\n\n**If we had done nothing.** An expected ${v["nothing.total"]}.\n\n**Decision.** You approved option B: one picker called in from 02:00, Hamm and Soest first.\n\n| | Do nothing | Option B |\n|---|---|---|\n| Extra labour | ${v["nothing.labour"]} | ${v["B.labour"]} |\n| Expected total | ${v["nothing.total"]} | ${v["B.total"]} |\n\n**Tonight.** ${v["night.on_time"]} orders on their trucks. Labour ${v["night.labour_h"]}, ${v["night.per1000_h"]} · ${v["night.per1000_eur"]} per 1,000 units against the plan's ${v["night.plan_h"]} · ${v["night.plan_eur"]}; the cell ran at ${v["night.picks"]} picks per cell hour.\n\n**Actions.** 2 drafts approved; nothing was sent.\n\n**How we know.** The deterministic engine and the seeded night simulation.`;
  return [
    // 1. Night start: three reads in one turn.
    { usage: usage({ input_tokens: 4200, cache_creation_input_tokens: 9300, cache_read_input_tokens: 0, output_tokens: 380 }), stop: "tool_use", blocks: [
      { type: "thinking", thinking: "Night start. Read the night, the plan and the projection together.", signature: "SIG-1==" },
      say("Night shift at Ruhrkorb DC Unna. I read tonight's orders, the engine's plan and the projection in one go."),
      T("toolu_01", "wms_get_night", {}), T("toolu_02", "sim_plan_night", {}), T("toolu_03", "sim_project", {})
    ], expect: (req, { check }) => {
      const m = req.messages[0];
      check(req.messages.length === 1 && typeof m.content === "string" && /night start/.test(m.content), "the opening message is the night start");
      check(!/02:00|express|XPR|Hamm|Soest/.test(m.content), "the opening message knows nothing of the night's future");
      check(req.thinking?.type === "adaptive" && req.thinking?.display === "summarized", "thinking parameters");
      check(req.output_config?.effort === "medium", "effort");
      check(req.cache_control?.type === "ephemeral", "cache_control");
      check(req.tools.length === 24 && !req.tools.some((t) => t.type && String(t.type).startsWith("web_search")), `24 tools and no web search (got ${req.tools.length})`);
    } },
    // 2. Narration, paused by the API (pause_turn): the conversation is resent as it is.
    { usage: usage(), stop: "pause_turn", blocks: [
      say(`Plan: ${v["plan.units"]} units for ${v["wms.orders"]} store orders, ${v["plan.hybrid_h"]} · ${v["plan.hybrid_eur"]} per 1,000 units against ${v["plan.manual_h"]} · ${v["plan.manual_eur"]} by hand.`)
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(r.length === 3 && r.every((x) => !x.isError), "three successful reads");
      check(r[0]?.json?.orders?.length === 12 && !r[0]?.json?.orders?.some((o) => o.id === "XPR"), "twelve store orders and no express order at 22:00");
      check(r[1]?.json?.per_1000?.hybrid_eur === 32.49 && r[1]?.json?.per_1000?.by_hand_eur === 89.5, `the engine's plan (got ${JSON.stringify(r[1]?.json?.per_1000)})`);
      check(Array.isArray(r[2]?.json?.at_risk) && r[2].json.at_risk.length === 0, "no order at risk at 22:00");
    } },
    // 3. The night runs on.
    { usage: usage(), stop: "tool_use", blocks: [T("toolu_04", "sim_advance", {})], expect: (req, { check }) => {
      check(req.messages[req.messages.length - 1].role === "assistant", "pause_turn must be resent with the assistant turn last");
    } },
    // 4. A 529 (overloaded) first: the agent retries the same call.
    { error: { status: 529, type: "overloaded_error", message: "Overloaded" } },
    // 5. The correction: three reads in parallel.
    { usage: usage(), stop: "tool_use", blocks: [
      say(`${v["corr.at"]}: the scale read ${v["corr.new"]} for ${v["corr.sku"]}; the world model expected ${v["corr.old"]}.`),
      T("toolu_05", "world_get_item", { sku_id: "S07" }), T("toolu_06", "cell_get_grasp_plan", { sku_id: "S07" }), T("toolu_07", "wms_get_order", { store_id: "ESS" })
    ], expect: (req, { check }) => {
      const w = lastResults(req)[0]?.json;
      check(w?.wake_id === "W2" && w?.kinds?.join() === "correction" && w?.items?.[0]?.old_g === 200 && w?.items?.[0]?.new_g === 400, `the correction wake-up (got ${JSON.stringify(w).slice(0, 160)})`);
    } },
    // 6. Revised, and the tote rebalanced (a safety action).
    { usage: usage(), stop: "tool_use", blocks: [
      say(`Revised: ${v["corr.sku"]} weighs ${v["corr.old"]} → ${v["corr.new"]}, written back for the whole SKU. I close Essen's tote and start a fresh one.`),
      T("toolu_08", "wms_rebalance_tote", { store_id: "ESS", reason: "S07 weighs 400 g, not 200 g." })
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(r.length === 3 && r.every((x) => !x.isError), "three successful reads");
      check(r[0]?.json?.world_model_g === 400 && r[1]?.json?.world_model_g === 400 && r[2]?.json?.totes?.current?.tote_no === 23, "the world model, the rehearsal and the tote");
    } },
    { usage: usage(), stop: "tool_use", blocks: [T("toolu_09", "sim_advance", {})], expect: (req, { check }) => {
      const r = lastResults(req)[0]?.json;
      check(r?.closes?.tote_no === 23 && r?.next_tote_no === 24, `the rebalance (got ${JSON.stringify(r).slice(0, 120)})`);
    } },
    // 7. Two escalations, raised by the rules in code.
    { usage: usage(), stop: "tool_use", blocks: [
      say("Escalation E2, twice: two fragile bottles for Bochum went to a person at the manual station."),
      T("toolu_10", "sim_advance", {})
    ], expect: (req, { check }) => {
      const w = lastResults(req)[0]?.json;
      check(w?.wake_id === "W3" && w?.items?.length === 2 && w.items.every((x) => x.rule === "E2" && x.raised_by === "the escalation rules in code"), "two E2 escalations raised in code");
    } },
    // 8. The express order and the cut-off risk.
    { usage: usage(), stop: "tool_use", blocks: [say("A new order for the Dortmund express truck. I check the projection."), T("toolu_11", "sim_project", {})], expect: (req, { check }) => {
      const w = lastResults(req)[0]?.json;
      check(w?.wake_id === "W4" && [...(w?.kinds || [])].sort().join("+") === "cutoff_risk+new_order", `the new order and the cut-off risk (got ${w?.kinds})`);
    } },
    { usage: usage({ output_tokens: 700 }), stop: "tool_use", blocks: [say("Hamm and Soest are projected late. I price three options against doing nothing."), T("toolu_12", "sim_cost_options", { variants })], expect: (req, { check }) => {
      const p = lastResults(req)[0]?.json;
      check(["HAM", "SOE"].every((id) => p?.at_risk?.includes(id)), `Hamm and Soest at risk (got ${p?.at_risk})`);
    } },
    // 9. Cut off in the middle of the options (max_tokens): discarded and retried with more room.
    { usage: usage({ output_tokens: 1200 }), stop: "max_tokens", cut: 1, discard: true, blocks: [
      say("Recommendation: option B."),
      T("toolu_13x", "ui_propose_options", { options: [], recommended_variant_id: "B", baseline_description: "Hamm and Soest miss their trucks." })
    ] },
    { usage: usage({ output_tokens: 900 }), stop: "tool_use", blocks: [
      say(`Recommendation: option B. Option A costs ${v["A.total"]} expected and option B ${v["B.total"]}, but only B keeps every truck on time in all 20 replications.`),
      T("toolu_13", "ui_propose_options", {
        recommended_variant_id: "B", recommendation_reason: "The only option with every truck on time, the express order included.",
        baseline_description: `The express order stays first: Soest and Hamm miss their trucks, an expected ${v["nothing.total"]}.`,
        options: [
          { variant_id: "A", title: "Re-sequence: Hamm and Soest first", description: "Iserlohn, Hamm and Soest before the express order; no extra labour.", residual_risk: "The express order misses its truck in 9 of 20 replications." },
          { variant_id: "B", title: "Call in one picker", description: "A second picker from 02:00, with the same order as option A.", residual_risk: "The call-in is billed for the minimum." },
          { variant_id: "C", title: "Move Soest to tomorrow's wave", description: "Soest's order goes with tomorrow's wave.", residual_risk: "Soest gets no delivery tonight." }
        ]
      })
    ], expect: (req, { check }) => {
      const c = lastResults(req)[0]?.json;
      const total = (id) => (id === "do_nothing" ? c?.do_nothing : c?.variants?.find((x) => x.variant_id === id))?.expected_total_eur;
      check(total("do_nothing") === 462.5 && total("A") === 112.5 && total("B") === 134.25 && total("C") === 250, `the golden option costs (got ${["do_nothing", "A", "B", "C"].map(total).join(", ")})`);
      check(req.max_tokens > 16000, `the retry has more room (max_tokens ${req.max_tokens})`);
      const last = req.messages[req.messages.length - 1];
      check(!JSON.stringify(req.messages).includes("toolu_13x"), "the cut-off turn is not sent back");
      check(last.role === "user", "after the discarded turn the conversation ends with the tool results");
    } },
    // 10. Approved (the test clicks): apply it.
    { usage: usage(), stop: "tool_use", blocks: [T("toolu_14", "wms_apply_option", { option_id: "B" })], expect: (req, { check }) => {
      const d = lastResults(req)[0]?.json;
      check(d?.decision === "approved" && d?.option_id === "B" && d?.figures?.expected_total === v["B.total"], `option B approved (got ${JSON.stringify(d).slice(0, 160)})`);
    } },
    // 11. Two drafts; the call-in quotes an amount no tool returned and is refused.
    { usage: usage(), stop: "tool_use", blocks: [
      T("toolu_15", "ui_draft_action", { type: "call_in", recipient: "On-call picker pool, Ruhrkorb DC Unna", subject: "Call-in tonight from 02:00", body: callIn(wrongAmount) }),
      T("toolu_16", "ui_draft_action", { type: "email", recipient: "Ruhrkorb Dortmund, store manager", subject: "Your express order tonight", body: `Dear store manager,\n\nyour express order of ${v["xpr.units"]} units goes on your ${v["xpr.due"]} truck.\n\nNight shift lead, Ruhrkorb DC Unna` })
    ], expect: (req, { check }) => {
      check(lastResults(req)[0]?.json?.applied === true, "option B applied");
    } },
    { usage: usage(), stop: "tool_use", blocks: [
      say("Corrected: the call-in quotes only the call-in minimum."),
      T("toolu_17", "ui_draft_action", { type: "call_in", recipient: "On-call picker pool, Ruhrkorb DC Unna", subject: "Call-in tonight from 02:00", body: callIn(v["B.call_in"]) })
    ], expect: (req, { check }) => {
      const r = lastResults(req);
      check(r[0]?.isError === true && r[0]?.json?.refused === true && r[0]?.raw.includes(wrongAmount), `the wrong amount is refused (got ${r[0]?.raw?.slice(0, 160)})`);
      check(r[1]?.isError === false && r[1]?.json?.status === "pending_approval", "the store email is queued");
    } },
    { usage: usage(), stop: "tool_use", blocks: [T("toolu_18", "ui_await_approvals", {})], expect: (req, { check }) => {
      check(lastResults(req)[0]?.json?.status === "pending_approval", "the corrected call-in is queued");
    } },
    // 12. Approved (the test clicks): the night runs on to its end.
    { usage: usage(), stop: "tool_use", blocks: [say("Both drafts are approved; nothing was sent."), T("toolu_19", "sim_advance", {})], expect: (req, { check }) => {
      const a = lastResults(req)[0]?.json;
      check(a?.approved === 2 && a?.rejected === 0, `two drafts approved (got ${JSON.stringify(a).slice(0, 100)})`);
    } },
    { usage: usage(), stop: "tool_use", blocks: [T("toolu_20", "sim_night_report", {})], expect: (req, { check }) => {
      const w = lastResults(req)[0]?.json;
      check(w?.night_over === true && w?.kinds?.join() === "night_end", "the night is over");
    } },
    { usage: usage({ output_tokens: 1100 }), stop: "tool_use", blocks: [T("toolu_21", "ui_final_report", { outcome: "option_decided", markdown: report })], expect: (req, { check }) => {
      const n = lastResults(req)[0]?.json;
      check(n?.final === true && `${n?.orders_on_time} of ${n?.orders}` === v["night.on_time"], `tonight's final figures (got ${n?.orders_on_time} of ${n?.orders})`);
    } },
    { usage: usage({ output_tokens: 60 }), stop: "end_turn", blocks: [say("The management summary is published; that closes the night.")], expect: (req, { check }) => {
      const r = lastResults(req)[0]?.json;
      check(r?.published === true && r?.outcome === "option_decided", `the summary is published (got ${JSON.stringify(r).slice(0, 160)})`);
    } }
  ];
}

/** USD and EUR cost of a list of usage records at a model's prices (js/cost.js, independently). */
export function usageCost(usages, price, fx) {
  let usd = 0;
  for (const u of usages) usd += (u.input_tokens * price.input + (u.cache_creation_input_tokens || 0) * price.cacheWrite + (u.cache_read_input_tokens || 0) * price.cacheRead + u.output_tokens * price.output) / 1e6;
  return { usd, eur: usd * fx };
}
