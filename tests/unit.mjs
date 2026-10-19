// Unit tests (Node.js 20 or later; no browser needed):
//   - the streaming client in js/anthropic.js with a mocked fetch: SSE parsing, thinking signatures,
//     retries, aborts, truncated streams;
//   - the price table in js/cost.js at the fixed rate of 0.892 EUR per USD;
//   - half-up display rounding in js/format.js (never Number.toFixed);
//   - the night-shift clock and the EAN-13 check in js/world.js;
//   - the world integrity checks in js/world_check.js against broken copies of the world (negative
//     controls), and the shadow-mode gate in js/autonomy.js;
//   - the key store's masking and redaction;
//   - the Open Food Facts lookup with a mocked fetch: success, not found, a CORS failure, a 429 and a 503 fall
//     back to the snapshot and are remembered, the cap of 3, the cache, no request in Simulation or
//     while live reads are off, an abort;
//   - the script placeholders, the wake bridge between the night and the producer, the person's
//     decisions as a producer waits for them, and the run facts.
// Usage: node tests/unit.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./lib/harness.mjs";

const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);
const { streamMessage, ApiError, withRetry } = await mod("js/anthropic.js");
const { usageCostUsd, createCostTracker } = await mod("js/cost.js");
const { roundHalfUp, eur2, eur0, fixed, upTo, hours, pct, int } = await mod("js/format.js");
const { nightMinutes, clockTime, ean13Valid } = await mod("js/world.js");
const { checkWorld } = await mod("js/world_check.js");
const { evaluateGate, shadowSummary, EXAMPLE_GATE } = await mod("js/autonomy.js");
const { FX_USD_EUR, STORAGE, CONNECT_ORIGINS } = await mod("js/config.js");
const keystore = await mod("js/keystore.js");

let passed = 0;
const ok = (label) => { passed += 1; console.log("ok:", label); };

// ---- streaming client ------------------------------------------------------------------------------
function sse(events, { crlf = false } = {}) {
  const nl = crlf ? "\r\n" : "\n";
  return events.map(([ev, data]) => `event: ${ev}${nl}data: ${JSON.stringify(data)}${nl}${nl}`).join("");
}
function chunked(text, sizes) {
  const enc = new TextEncoder().encode(text);
  const parts = [];
  let i = 0, k = 0;
  while (i < enc.length) { const n = sizes[k++ % sizes.length]; parts.push(enc.slice(i, i + n)); i += n; }
  return new ReadableStream({ start(c) { for (const p of parts) c.enqueue(p); c.close(); } });
}
const events = [
  ["message_start", { type: "message_start", message: { id: "msg_1", model: "claude-sonnet-5-5", role: "assistant", content: [], usage: { input_tokens: 1200, cache_creation_input_tokens: 3000, cache_read_input_tokens: 0, output_tokens: 3 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Check the night " } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "first." } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "SIG==abc" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["ping", { type: "ping" }],
  ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hypothesis: the jar weighs more " } }],
  ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "than its label — 400 g ✓" } }],
  ["content_block_stop", { type: "content_block_stop", index: 1 }],
  ["content_block_start", { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "world_get_item", input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "{\"sku_" } }],
  ["content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "id\": \"S07\"}" } }],
  ["content_block_stop", { type: "content_block_stop", index: 2 }],
  ["content_block_start", { type: "content_block_start", index: 3, content_block: { type: "tool_use", id: "toolu_2", name: "wms_get_night", input: {} } }],
  ["content_block_stop", { type: "content_block_stop", index: 3 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 240 } }],
  ["message_stop", { type: "message_stop" }]
];
for (const [label, crlf, sizes] of [["lf small chunks", false, [7, 13, 1, 50]], ["crlf odd chunks", true, [3, 1, 2, 97, 5]], ["one chunk", false, [100000]]]) {
  globalThis.fetch = async () => new Response(chunked(sse(events, { crlf }), sizes), { status: 200, headers: { "content-type": "text/event-stream", "request-id": "req_123" } });
  const texts = [];
  const r = await streamMessage({ key: "k", body: { model: "claude-sonnet-5-5", messages: [] }, hooks: { onText: (i, t) => texts.push(t) } });
  const m = r.message;
  assert.equal(m.stop_reason, "tool_use", label);
  assert.equal(m.content.length, 4, label);
  assert.deepEqual(m.content[0], { type: "thinking", thinking: "Check the night first.", signature: "SIG==abc" }, label);
  assert.equal(m.content[1].text, "Hypothesis: the jar weighs more than its label — 400 g ✓", label);
  assert.deepEqual(m.content[2].input, { sku_id: "S07" }, label);
  assert.deepEqual(m.content[3].input, {}, label);
  assert.equal(m.usage.output_tokens, 240, label);
  assert.equal(m.usage.cache_creation_input_tokens, 3000, label);
  assert.equal(r.requestId, "req_123");
  assert.ok(texts.length >= 2);
  ok(`stream: ${label}`);
}
globalThis.fetch = async () => new Response(chunked(sse([events[0], ["error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }]]), [11]), { status: 200 });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e instanceof ApiError && e.type === "overloaded_error" && e.retryable && e.midStream);
ok("stream: mid-stream error is retryable");
globalThis.fetch = async () => new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" }, request_id: "req_9" }), { status: 429, headers: { "retry-after": "1" } });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e.status === 429 && e.retryAfter === "1" && e.retryable);
ok("stream: 429 with retry-after");
assert.equal(new ApiError({ status: 429, type: "rate_limit_error", message: "x", details: { error_code: "enforced_spend_limit_reached" } }).retryable, false);
ok("stream: a spend-limit 429 is not retried");
let n = 0;
const v = await withRetry(async () => { n++; if (n < 3) throw new ApiError({ status: 529, type: "overloaded_error", message: "o" }); return 42; }, { retries: 2 });
assert.equal(v, 42); assert.equal(n, 3);
ok("withRetry: succeeds on the third attempt");
const cut = [events[0], ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_x", name: "ui_draft_action", input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"subject\": \"Call-in for tonig" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 16000 } }]];
globalThis.fetch = async () => new Response(chunked(sse(cut), [64]), { status: 200 });
const rc = await streamMessage({ key: "k", body: {} });
assert.equal(rc.message.stop_reason, "max_tokens"); assert.ok(rc.incomplete.has(0));
ok("stream: an incomplete tool input is flagged");
const ac = new AbortController();
globalThis.fetch = async (url, init) => new Promise((res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
setTimeout(() => ac.abort(), 20);
await assert.rejects(() => streamMessage({ key: "k", body: {}, signal: ac.signal }), (e) => e.name === "AbortError");
ok("stream: abort");
globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e instanceof ApiError && e.type === "network_error" && e.midStream);
globalThis.fetch = async () => new Response(chunked(sse(events.slice(0, 6)), [40]), { status: 200 });
await assert.rejects(() => streamMessage({ key: "k", body: {} }), (e) => e instanceof ApiError && e.type === "network_error");
ok("stream: a body without a stop reason is an interrupted connection");

// ---- cost maths ------------------------------------------------------------------------------------
assert.equal(FX_USD_EUR, 0.892);
const usd = usageCostUsd("claude-sonnet-5-5", { input_tokens: 1200, cache_creation_input_tokens: 3000, cache_read_input_tokens: 10000, output_tokens: 240 });
assert.ok(Math.abs(usd - (1200 * 2 / 1e6 + 3000 * 2.5 / 1e6 + 10000 * 0.1 / 1e6 + 240 * 10 / 1e6)) < 1e-12, `${usd}`);
const haikuShort = usageCostUsd("claude-haiku-5-5", { input_tokens: 90000, cache_read_input_tokens: 10000, output_tokens: 1000 });
assert.ok(Math.abs(haikuShort - (90000 * 0.1 / 1e6 + 10000 * 0.01 / 1e6 + 1000 * 0.5 / 1e6)) < 1e-12);
const haikuLong = usageCostUsd("claude-haiku-5-5", { input_tokens: 90000, cache_read_input_tokens: 20000, output_tokens: 1000 });
assert.ok(Math.abs(haikuLong - (90000 * 0.5 / 1e6 + 20000 * 0.05 / 1e6 + 1000 * 2.5 / 1e6)) < 1e-12);
const t = createCostTracker("claude-opus-5-5"); t.add({ input_tokens: 1e6 }); const snap = t.add({ output_tokens: 1e6 });
assert.ok(Math.abs(snap.usd - 24) < 1e-9 && Math.abs(snap.eur - 24 * 0.892) < 1e-9 && snap.requests === 2);
ok("cost: Sonnet, Haiku's two prompt tiers, Opus, EUR at 0.892");

// ---- half-up display rounding --------------------------------------------------------------------------
// Number.toFixed rounds the binary double; the brief's display strings need the decimal rule.
assert.equal((31.325).toFixed(2), "31.32", "toFixed's known miss, the reason for the half-up rule");
for (const [value, d, want] of [[45.645, 2, "45.65"], [31.325, 2, "31.33"], [32.4885, 2, "32.49"], [40.7225, 2, "40.72"], [28.41625, 2, "28.42"],
  [366502.5, 0, "366503"], [1000 / 600 * 35.8, 2, "59.67"], [21.659, 2, "21.66"], [455 / 600 * 35.8, 2, "27.15"], [1.275, 2, "1.28"], [0.9075, 2, "0.91"],
  [134.25, 2, "134.25"], [-2.5, 0, "-3"], [-0.004, 2, "0.00"], [0.005, 2, "0.01"], [0, 2, "0.00"]]) {
  assert.equal(roundHalfUp(value, d), want, `${value} to ${d}`);
}
assert.equal(eur2(32.4885), "€32.49");
assert.equal(eur2(89.5), "€89.50");
assert.equal(eur0(366502.5), "€366,503");
assert.equal(eur0(342069), "€342,069");
assert.equal(eur2(-12.345), "−€12.35");
assert.equal(fixed(10237.5, 1), "10,237.5");
assert.equal(upTo(2.5, 2), "2.5");
assert.equal(hours(1.275), "1.28 h");
assert.equal(pct(128 / 138), "92.8 %");
assert.equal(pct(0.95), "95 %");
assert.equal(int(4200), "4,200");
ok("format: half-up rounding and the units of the brief");

// ---- night clock and barcodes ------------------------------------------------------------------------
assert.equal(nightMinutes("22:00"), 0);
assert.equal(nightMinutes("01:35"), 215);
assert.equal(nightMinutes("06:00"), 480);
assert.ok(Number.isNaN(nightMinutes("25:00")) && Number.isNaN(nightMinutes("1:35")));
assert.equal(clockTime(215), "01:35");
assert.equal(clockTime(0), "22:00");
assert.ok(ean13Valid("4037848020859"));
assert.ok(!ean13Valid("4037848020858"));
assert.ok(!ean13Valid("403784802085"));
ok("world: night clock and EAN-13 check digits");

// ---- world checks: the real world passes, broken copies fail ------------------------------------------
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ["data/world.js", "data/scenarios.js", "data/shadow_record.js", "data/off_snapshot.js"]) {
  vm.runInContext(fs.readFileSync(path.join(APP_ROOT, file), "utf8"), sandbox, { filename: file });
}
const { WORLD, SCENARIOS, SHADOW_RECORD, OFF_SNAPSHOT } = sandbox.window;
const clone = (x) => JSON.parse(JSON.stringify(x));
// Broken copies skip the night runs (calibration, reproducibility): the engine suite covers those.
const run = (w = WORLD, s = SCENARIOS, sh = SHADOW_RECORD, off = OFF_SNAPSHOT) => checkWorld(w, s, sh, off, { night: false });
const failing = (r) => r.checks.filter((c) => !c.ok).map((c) => c.name);
const base = checkWorld(WORLD, SCENARIOS, SHADOW_RECORD, OFF_SNAPSHOT);
assert.ok(base.ok, failing(base).join(" | "));
const breakers = [
  ["a store cut-off after the shift", (w) => { w.stores[3].cutoff = "07:00"; }, /cut-offs inside the shift/],
  ["two flagships", (w) => { w.stores[0].flagship = true; }, /one flagship/],
  ["an allocation one unit off", (w) => { w.allocation.n1.ESS.S01 += 1; w.allocation.n1.GEL.S01 -= 1; w.allocation.n1.GEL.S02 += 1; }, /allocation adds up/],
  ["the jar's scale weight equal to its master data", (w) => { w.items.find((i) => i.sku === "S07").actual_g = 200; }, /glass jar's master weight/],
  ["a second SKU whose weight differs", (w) => { w.items[0].actual_g += 10; }, /glass jar's master weight/],
  ["a success rate that moves p away from 0.91", (w) => { w.items[0].success = 0.95; }, /grasp success p = 0.91/],
  ["a cell SKU over the payload", (w) => { w.items[10].master_g = 4000; w.items[10].actual_g = 4000; }, /payload/],
  ["a manual-only SKU without its reason", (w) => { w.items.find((i) => !i.cell).manual_reason = null; }, /manual-only SKUs say why/],
  ["a barcode with a wrong check digit", (w) => { const b = w.items[5].barcode; w.items[5].barcode = b.slice(0, 12) + String((Number(b[12]) + 1) % 10); }, /barcodes/],
  ["a vendor named as the simulated robot", (w) => { w.cell.vendor = "Any vendor"; }, /no vendor named/]
];
for (const [label, mutate, expect] of breakers) {
  const w = clone(WORLD);
  mutate(w);
  const names = failing(run(w));
  assert.ok(names.some((nm) => expect.test(nm)), `${label}: expected a failing check matching ${expect}, got ${JSON.stringify(names)}`);
}
const s2 = clone(SCENARIOS); s2[2].barcode = WORLD.items[0].barcode;
assert.ok(failing(run(WORLD, s2)).some((nm) => /scenario 3's barcode/.test(nm)), "scenario 3's barcode inside the item master must fail");
// A restricted circulation number outside the item master is still no GTIN (prefix 02, valid check digit).
const rcn02 = [..."0123456789"].map((d) => `020000000001${d}`).find((c) => ean13Valid(c));
const s4 = clone(SCENARIOS); s4[2].barcode = rcn02;
assert.ok(rcn02 && failing(run(WORLD, s4)).some((nm) => /scenario 3's barcode/.test(nm)), "an RCN with prefix 02 as scenario 3's barcode must fail");
const s3 = clone(SCENARIOS); s3[4].night_start_date = "2026-12-24";
assert.ok(failing(run(WORLD, s3)).some((nm) => /Six scenarios/.test(nm)), "a wrong night for scenario 5 must fail");
const off = clone(OFF_SNAPSHOT); off.meta.attribution = "Product data";
assert.ok(failing(run(WORLD, SCENARIOS, SHADOW_RECORD, off)).some((nm) => /Open Food Facts/.test(nm)), "missing ODbL attribution must fail");
ok(`world checks: the world passes ${base.checks.length}/${base.checks.length}; ${breakers.length + 4} broken copies each fail the right check`);

// ---- the shadow-mode gate ------------------------------------------------------------------------------
const sum = shadowSummary(SHADOW_RECORD);
assert.deepEqual([sum.decisions, sum.nights, sum.agreed, sum.missedEscalations, sum.agentCausedMissedCutoffs], [138, 7, 128, 0, 0]);
const g = evaluateGate(SHADOW_RECORD);
assert.equal(g.met, false);
assert.deepEqual(g.failing, ["decisions", "nights", "agreement"]);
assert.equal(g.criteria.find((c) => c.id === "agreement").text, "92.8 % (needs at least 95 %)");
const passing = { decisions: Array.from({ length: 200 }, (_, i) => ({ night: (i % 10) + 1, agreed: i >= 10, escalation_missed: false, agent_caused_missed_cutoff: false })) };
assert.equal(evaluateGate(passing).met, true, "200 decisions over 10 nights at 95 % agreement meet the gate");
passing.decisions[0].agent_caused_missed_cutoff = true;
assert.deepEqual(evaluateGate(passing).failing, ["cutoffs"]);
assert.equal(EXAMPLE_GATE.minDecisions, 200);
ok("autonomy gate: the synthetic record fails on decisions, nights and agreement; the control passes at exactly 95 %");

// ---- key store and config ---------------------------------------------------------------------------------
const KEY = "sk-ant-test-MOCKKEY-0123456789abcdefghijklmnopqrstuvwxyz0123456789";
assert.ok(keystore.looksLikeKey(KEY) && !keystore.looksLikeKey("sk-123"));
keystore.setKey(KEY);
assert.equal(keystore.maskKey(), "sk-ant-…6789");
assert.equal(keystore.redactSecrets(`header x-api-key: ${KEY}.`), "header x-api-key: sk-ant-[REDACTED].");
keystore.forgetKey();
assert.equal(keystore.hasKey(), false);
assert.ok(Object.values(STORAGE).every((k) => k.startsWith("rp.")), "every storage key under the rp. prefix");
assert.deepEqual(CONNECT_ORIGINS, ["https://api.anthropic.com"]);
ok("key store masking and redaction; rp.* storage keys; one connect origin");

// ---- Open Food Facts lookup ---------------------------------------------------------------------------------
{
  const { createOffLookup, productFields } = await mod("js/openfoodfacts.js");
  const { OPEN_FOOD_FACTS, OPEN_DATA } = await mod("js/config.js");
  assert.equal(OPEN_FOOD_FACTS.live, false, "live reads are off in this build");
  assert.deepEqual(OPEN_DATA, {}, "and the host is in no connection list");
  const BAR = "4037848020859";
  const record = { code: BAR, product_name: "Bio Elisen-Lebkuchen", brands: "Test brand", quantity: "210g", product_quantity: 210, product_quantity_unit: "g", packaging_text: "", categories_tags: ["en:gingerbreads"] };
  const snap = { meta: { status: "test" }, products: { [BAR]: { product: record, fetched: "2026-10-18" } } };
  const live = { ...OPEN_FOOD_FACTS, live: true, productUrl: (b) => `https://world.openfoodfacts.org/api/v2/product/${b}.json`, productPage: (b) => `https://world.openfoodfacts.org/product/${b}` };
  const mem = () => { const m = {}; return { m, remember: (id, status, detail) => { m[id] = { status, detail }; }, recentFailure: (id) => (m[id]?.status === "fail" ? m[id] : null) }; };
  const noFetch = async () => { throw new Error("no request may be made"); };
  // Simulation: the snapshot only, never a request; the bundled snapshot has no record yet.
  let r = await createOffLookup({ mode: "simulation", snapshot: snap, config: live, fetchImpl: noFetch, memory: mem() }).lookup(BAR);
  assert.equal(r.found, true); assert.equal(r.source, "bundled snapshot"); assert.equal(r.product.net_content, "210 g"); assert.match(r.note, /Simulation: no live request/);
  const pending = { meta: { status: "pending" }, products: {} };
  r = await createOffLookup({ mode: "simulation", snapshot: pending, config: live, fetchImpl: noFetch, memory: mem() }).lookup(BAR);
  assert.equal(r.found, false); assert.match(r.note, /pending/);
  // Live with reads switched off (this build): the snapshot, no request.
  r = await createOffLookup({ mode: "live", snapshot: snap, config: OPEN_FOOD_FACTS, fetchImpl: noFetch, memory: mem() }).lookup(BAR);
  assert.equal(r.source, "bundled snapshot"); assert.match(r.note, /not enabled in this build/);
  // Live and enabled: a product, a barcode the API does not know, the cache and the cap of 3.
  const calls = [];
  const api = async (url) => {
    calls.push(url);
    const code = /product\/(\d+)\.json/.exec(url)[1];
    if (code === BAR) return new Response(JSON.stringify({ code, product: record, status: 1, status_verbose: "product found" }), { status: 200 });
    return new Response(JSON.stringify({ code, status: 0, status_verbose: "product not found" }), { status: 404 });
  };
  const m1 = mem();
  const lk = createOffLookup({ mode: "live", snapshot: snap, config: live, fetchImpl: api, memory: m1 });
  r = await lk.lookup(BAR);
  assert.equal(r.found, true); assert.equal(r.source, "Open Food Facts API (live)"); assert.equal(r.product.name, "Bio Elisen-Lebkuchen"); assert.equal(r.attribution, "Product data: Open Food Facts, ODbL");
  r = await lk.lookup(BAR);
  assert.equal(r.cached, true); assert.equal(calls.length, 1, "a repeated barcode is answered from the cache");
  r = await lk.lookup("4000000000001");
  assert.equal(r.found, false); assert.match(r.note, /no product/); assert.equal(m1.m.open_food_facts.status, "pass", "not found is an answer, not a failure");
  r = await lk.lookup("4000000000002");
  r = await lk.lookup("4000000000003");
  assert.ok(r.error && r.refused && /at most 3/.test(r.error), "the fourth barcode is refused");
  assert.equal(lk.count(), 3); assert.equal(calls.length, 3);
  assert.match((await lk.lookup("12ab")).error, /not a barcode/);
  // A CORS failure falls back to the snapshot and is remembered: the next lookup skips the network.
  const m2 = mem();
  let tries = 0;
  const blocked = async () => { tries += 1; throw new TypeError("Failed to fetch"); };
  const lk2 = createOffLookup({ mode: "live", snapshot: snap, config: live, fetchImpl: blocked, memory: m2 });
  r = await lk2.lookup(BAR);
  assert.equal(r.fallback, true); assert.equal(r.found, true); assert.match(r.note, /The live lookup failed \(blocked or unreachable/); assert.equal(m2.m.open_food_facts.status, "fail");
  r = await lk2.lookup("4000000000001");
  assert.equal(tries, 1, "a remembered failure skips the source"); assert.match(r.note, /failed earlier in this session/);
  // A 429 is a failure of the source too.
  const m3 = mem();
  r = await createOffLookup({ mode: "live", snapshot: snap, config: live, fetchImpl: async () => new Response("{}", { status: 429 }), memory: m3 }).lookup(BAR);
  assert.equal(r.fallback, true); assert.match(r.note, /rate limited \(429/); assert.match(m3.m.open_food_facts.detail, /429/);
  // So is a server error.
  const m4 = mem();
  r = await createOffLookup({ mode: "live", snapshot: snap, config: live, fetchImpl: async () => new Response("{}", { status: 503 }), memory: m4 }).lookup(BAR);
  assert.equal(r.fallback, true); assert.equal(r.found, true); assert.equal(m4.m.open_food_facts.status, "fail"); assert.match(m4.m.open_food_facts.detail, /503/);
  // Abort: the run's signal stops the request.
  const ac = new AbortController();
  const hang = (url, init) => new Promise((res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const pend = createOffLookup({ mode: "live", snapshot: snap, config: live, fetchImpl: hang, memory: mem() }).lookup(BAR, { signal: ac.signal });
  ac.abort();
  await assert.rejects(pend, (e) => e.name === "AbortError");
  assert.deepEqual(productFields({ code: 1, product_name: "x" }), { code: "1", name: "x", brands: null, quantity: null, net_content: null, packaging: null, categories: [] });
  ok("Open Food Facts lookup: snapshot in Simulation and while live reads are off, live product and not-found, cache, cap of 3, CORS failure, 429 and 503 remembered with a snapshot fallback, abort");
}

// ---- script placeholders, the wake bridge, the person's decisions, run facts --------------------------------
{
  const V = await mod("js/sim_vars.js");
  const vars = { "B.total": "€134.25", "night.on_time": "13 of 13" };
  assert.equal(V.fillTemplate(vars, "Expected {{B.total}}; {{ night.on_time }} on time."), "Expected €134.25; 13 of 13 on time.");
  assert.deepEqual(V.unresolvedKeys(vars, "{{B.total}} {{C.total}}"), ["C.total"]);
  assert.equal(V.pick({ B: "b", default: "d" }, "B"), "b");
  assert.equal(V.pick({ B: "b", default: "d" }, "A"), "d");
  assert.deepEqual(V.pickDeep({ outcome: { $by_decision: { baseline: "baseline_accepted", default: "option_decided" } }, n: 1 }, "baseline"), { outcome: "baseline_accepted", n: 1 });
  ok("script placeholders: filled, unresolved keys named, texts by decision");

  const { createWakeBridge } = await mod("js/wake_bridge.js");
  const b = createWakeBridge();
  const order = [];
  const turn1 = b.wake({ wake_id: "W1" }).then(() => order.push("turn W1 over"));
  const w1 = await b.first();
  order.push(`producer at ${w1.wake_id}`);
  const next = b.advance().then((w) => order.push(`producer at ${w.wake_id}`));
  await turn1;
  const turn2 = b.wake({ wake_id: "W2" });
  await next;
  b.release();
  await turn2;
  assert.equal(await b.advance(), null, "after release no turn follows");
  assert.deepEqual(order, ["producer at W1", "turn W1 over", "producer at W2"]);
  ok("wake bridge: the night waits for the producer's turn, sim_advance ends it and returns the next wake-up, release lets the night finish");

  const { createHumanChannel, ABORT } = await mod("js/human.js");
  const handlers = new Map();
  const fakeBus = { on: (type, fn) => { handlers.set(type, fn); return () => handlers.delete(type); } };
  const hc = createHumanChannel(fakeBus);
  const decided = hc.waitUntil(() => hc.takeOptionDecision((ev) => ev.payload.options_seq === 2));
  handlers.get("option_decision")({ payload: { option_id: "A", options_seq: 1 } });
  handlers.get("option_decision")({ payload: { option_id: "B", options_seq: 2 } });
  assert.equal((await decided).payload.option_id, "B", "a decision on an older set is not taken");
  hc.drafts.set("act-1", { status: "pending" });
  const approvals = hc.waitUntil(() => [...hc.drafts.values()].every((d) => d.status !== "pending"));
  handlers.get("action_decision")({ payload: { action_id: "act-1", decision: "approved" } });
  assert.equal(await approvals, true);
  const hanging = hc.waitUntil(() => false);
  hc.cancel();
  await assert.rejects(hanging, (e) => e === ABORT);
  ok("the person's decisions: queued until taken, bound to their option set, drafts decided, every wait rejected on Abort");

  const { computeRunFacts, describeRunFacts } = await mod("js/run_facts.js");
  const ev = (type, t, payload = {}) => ({ type, t, payload });
  const rows = [
    ev("run_start", 0, { mode: "live" }), ev("state_change", 0, { state: "perceiving" }), ev("wake", 100, {}),
    ev("tool_call", 200, { name: "wms_get_night" }), ev("tool_call", 210, { name: "sim_plan_night" }), ev("tool_call", 220, { name: "sim_advance" }),
    ev("wake", 5000, {}), ev("tool_call", 5100, { name: "ui_propose_options" }), ev("state_change", 6000, { state: "awaiting_approval" }),
    ev("option_decision", 16000, { option_id: "B", decision: "approved" }), ev("state_change", 16000, { state: "executing" }),
    ev("tool_result", 16100, { name: "ui_draft_action", ok: false, result: { refused: true } }), ev("action_draft", 17000, {}), ev("action_decision", 18000, { decision: "approved" }),
    ev("cost_update", 19000, { eur: 0.4249, simulated: false }), ev("night_end", 20000, { figures: { orders_on_time: 13, orders: 13 } }),
    { type: "model_call", t: 1000, payload: {} }, { type: "model_call", t: 2000, payload: {} }
  ];
  const f = computeRunFacts(rows, ev("run_end", 21000, { status: "done" }));
  assert.equal(f.tool_calls, 2, "sim_advance and ui_* tools are not counted as visible calls");
  assert.deepEqual([f.wakeups, f.model_calls, f.guardrail_refusals, f.approved_option, f.drafts_approved, f.waiting_time_s, f.agent_time_s, f.cost_eur], [2, 2, 1, "B", 1, 10, 11, 0.42]);
  assert.equal(describeRunFacts(f), "11 s agent time plus 10 s waiting for you; 2 agent turns; 2 tool calls (1 warehouse, 1 engine); 1 guardrail refusal; 2 of 40 model calls; 13 of 13 orders on time; cost €0.42.");
  ok("run facts: agent time apart from waiting, agent turns, visible tool calls by kind, refusals, model calls against the cap, cost");
}

console.log(`\nAll ${passed} unit tests passed.`);
