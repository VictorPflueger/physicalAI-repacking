// Live suite (Chromium): the live agent loop against a fake Claude (tests/lib/fake-claude.mjs). No real
// API is called: api.anthropic.com is answered by the fake, every other host is blocked and recorded.
//   full    scenario 1 live, on the decisions of the scripted replay's path B (Essen's tote closed at
//           22:17, option B approved, both drafts approved): the fake checks every request against the
//           protocol (headers, streaming, earlier turns passed back unchanged, every tool_use answered)
//           and what the tools returned; the night is the same physical night as the Simulation's (the
//           unit-log hash, every lane, the orders on time); independent reads run in parallel (all
//           three calls before their results); a pause_turn, a 529 retry and a max_tokens retry are
//           handled; an amount the engine never produced is refused and shown as a Guardrail line;
//           at most 40 model calls; the cost equals the usage at the model's prices × 0.892; the
//           summary says Live agent run; no request to Open Food Facts or any other host; the end state
//           meets its WCAG contrast duty
//   steps   a model that never stops reading is stopped at 40 model calls
//   budget  one response whose usage costs more than €3 stops the run at the cost cap
//   abort   Abort while a model call is in flight: the run stops at once and no further call is made
//   key     the API rejects the key (401) mid-run: the key is removed from this tab, the run ends in Error
// Usage: node tests/live.mjs [case…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { APP_ROOT, outDir, wanted, launchBrowser, serveStatic, NETWORK_NOISE, SKIP_INTRO, CORS, MOCK_KEY, KEYS } from "./lib/harness.mjs";
import { createFakeClaude, lastResults } from "./lib/fake-claude.mjs";
import { replayScenario1, liveConversation, usageCost } from "./lib/scenario1.mjs";
import { contrastShortfalls, settle } from "./lib/contrast.mjs";

const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);
const { MODELS, DEFAULT_MODEL, FX_USD_EUR, AGENT } = await mod("js/config.js");
const F = await mod("js/format.js");

const OUT = await outDir("live");
const { base: BASE, close } = await serveStatic(APP_ROOT, 8868);
const browser = await launchBrowser();
const results = [];
// The same decisions as the scripted replay's path B, played headless in Node: the night the live run
// must produce, and the figures the fake's texts quote.
const SC1_B = await replayScenario1({ option: "B" });

/** A page whose api.anthropic.com is the fake (models listed, messages scripted); other hosts blocked. */
async function newLivePage(fake, { viewport = { width: 1920, height: 1080 } } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.addInitScript(SKIP_INTRO);
  const external = [];
  const seen = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.host === "api.anthropic.com") {
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      seen.push(`${req.method()} ${u.pathname}`);
      if (u.pathname === "/v1/models") return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ data: MODELS.map((m) => ({ id: m.id })) }) });
      if (u.pathname === "/v1/messages") {
        const out = fake.handle(req.postData() || "{}", req.headers());
        if (out.delayMs) await new Promise((r) => setTimeout(r, out.delayMs));
        return route.fulfill({ status: out.status, headers: { ...CORS, ...out.headers }, body: out.body }).catch(() => {});
      }
    }
    external.push(`${req.method()} ${u.host}${u.pathname}`);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const log = { pageErrors: [], consoleErrors: [], consoleAll: [] };
  page.on("pageerror", (e) => log.pageErrors.push(String(e.message || e)));
  page.on("console", (m) => { log.consoleAll.push(m.text()); if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) log.consoleErrors.push(m.text()); });
  return { context, page, log, external, seen };
}

/** Boot, ×4, Start agent → Live → the key → the run starts. */
async function startLive(page) {
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  await page.click('button[aria-label="Night speed ×4"]');
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card", { timeout: 5000 });
  await page.click('.mode-card[data-mode="live"] .mode-cta button');
  await page.waitForSelector("#api-key-input", { timeout: 5000 });
  await page.fill("#api-key-input", MOCK_KEY);
  await page.click('button:has-text("Check key and continue")');
  await page.waitForSelector("#api-key-input", { state: "detached", timeout: 8000 });
  // The run's line in the console: it stays, while the board's running state can be over within
  // milliseconds when the first answer ends the run (the cost cap, a rejected key).
  await page.waitForFunction(() => /Live agent on/.test(document.querySelector('#console .entry[data-type="run"]')?.textContent || ""), null, { timeout: 10000 });
}
const statusText = (page) => page.textContent(".status-pill .text").then((t) => t.trim());
const waitEnded = (page, timeout = 300000) => page.waitForFunction(() => ["Done", "Error", "Stopped", "Aborted"].includes(document.querySelector(".status-pill .text")?.textContent.trim()), null, { timeout });
const lastLines = (page, n = 3) => page.$$eval("#console .entry .entry-body", (els, k) => els.slice(-k).map((e) => e.textContent.replace(/\s+/g, " ").trim()), n);
async function exportAudit(page) {
  await page.click("#tab-audit");
  await page.waitForSelector("#panel-audit:not([hidden])");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-audit")]);
  const text = await readFile(await download.path(), "utf8");
  return { file: download.suggestedFilename(), text, audit: JSON.parse(text) };
}

async function finish(name, t, checks, expectations, { allowConsole = null } = {}) {
  const consoleErrors = t.log.consoleErrors.filter((x) => !(allowConsole && allowConsole.test(x)));
  const problems = expectations.filter(([ok]) => !ok).map(([, msg]) => msg);
  if (checks.FAILED) problems.unshift(`exception: ${checks.FAILED}`);
  if (t.external.length) problems.push(`requests to other hosts: ${t.external.join(", ")}`);
  const ok = !problems.length && !t.log.pageErrors.length && !consoleErrors.length;
  results.push({ name, ok, problems, checks, pageErrors: t.log.pageErrors, consoleErrors });
  await t.context.close();
}

/** The usage records the fake bills, as sseFor reports them (its defaults included). */
const billed = (script) => script.filter((s) => !s.error).map((s) => ({
  input_tokens: s.usage?.input_tokens ?? 1500, cache_creation_input_tokens: s.usage?.cache_creation_input_tokens ?? 0,
  cache_read_input_tokens: s.usage?.cache_read_input_tokens ?? 0, output_tokens: s.usage?.output_tokens ?? 600
}));
const PRICE = MODELS.find((m) => m.id === DEFAULT_MODEL).price;

// ---- full: scenario 1 live against the fake --------------------------------------------------------------
if (wanted("full")) {
  const script = liveConversation({ v: SC1_B.vars, variants: SC1_B.variants, lastResults });
  const fake = createFakeClaude(script);
  const t = await newLivePage(fake);
  const { page } = t;
  const checks = {};
  const started = Date.now();
  try {
    await startLive(page);
    checks.badge = (await page.textContent("#mode-badge")).trim();
    checks.watermark = await page.isVisible("#console .sim-watermark");
    checks.cellTag = (await page.textContent(".sim-cell-tag")).trim();
    checks.disclosure = await page.isVisible(".ai-disclosure");
    await page.waitForSelector('#panel-options:not([hidden]) .option-card[data-id="B"] .btn-approve', { timeout: 180000 });
    checks.cards = await page.$$eval("#panel-options .option-card", (els) => els.map((e) => `${e.dataset.id} ${e.querySelector(".option-total .value")?.textContent.trim()}${e.dataset.recommended === "true" ? " recommended" : ""}`));
    await page.click('.option-card[data-id="B"] .btn-approve');
    await page.waitForSelector("#btn-approve-all", { timeout: 120000 });
    checks.drafts = await page.$$eval("#panel-outbox .action-card", (els) => els.map((e) => e.dataset.type));
    await page.click("#btn-approve-all");
    await waitEnded(page);
    checks.seconds = Math.round((Date.now() - started) / 1000);
    checks.status = await statusText(page);
    checks.lanes = Object.fromEntries(await page.$$eval(".lane", (els) => els.map((e) => [e.dataset.order, e.dataset.state])));
    checks.tile = (await page.textContent("#kpi-ontime-value")).trim();
    checks.costTile = (await page.textContent("#kpi-cost-value")).trim();
    checks.guardrail = await page.$$eval('#console .entry[data-guard="ui_draft_action"] .entry-body', (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
    checks.notices = await page.$$eval('#console .entry[data-type="notice"]:not([data-guard]) .entry-body', (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
    checks.discarded = await page.$$eval("#console .entry[data-discarded='true'] .discarded-note", (els) => els.length);
    checks.facts = (await page.$$eval("#console .entry .entry-body", (els) => els.map((e) => e.textContent.trim()).find((x) => /wake-ups; /.test(x)) || ""));
    await page.click("#btn-open-report");
    await page.waitForSelector(".report-modal", { timeout: 5000 });
    checks.report = (await page.innerText(".report-modal")).replace(/\s+/g, " ");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".report-modal", { state: "detached", timeout: 3000 });
    // The drawer closed and its slide over: the end state as the room sees it.
    if ((await page.getAttribute("#drawer", "data-open")) === "true") await page.click(".drawer-end .btn");
    await settle(page);
    const contrast = await contrastShortfalls(page);
    checks.contrastMeasured = contrast.measured;
    checks.contrastBelow = contrast.below;
    await page.screenshot({ path: path.join(OUT, "01-live-end.png") });
    const { file, text, audit } = await exportAudit(page);
    checks.file = file;
    checks.mode = audit.mode;
    checks.hash = audit.run?.night_hash;
    checks.runStatus = audit.run?.status;
    const ev = audit.events || [];
    checks.modelCalls = audit.counts?.model_calls;
    checks.exchanges = (audit.api_exchanges || []).length;
    // The parallel reads of the correction (toolu_05 to 07): all three calls before any of their results.
    const idx = (type, id) => ev.findIndex((e) => e.type === type && e.payload?.call_id === id);
    const ids = ["toolu_05", "toolu_06", "toolu_07"];
    checks.parallel = ids.map((id) => idx("tool_call", id)).every((c) => c >= 0 && c < Math.min(...ids.map((id) => idx("tool_result", id)).filter((r) => r >= 0)));
    checks.cost = ev.filter((e) => e.type === "cost_update").at(-1)?.payload;
    checks.keyInExport = text.includes("MOCKKEY");
    checks.offRequests = t.seen.filter((x) => /openfoodfacts/.test(x)).length + t.external.filter((x) => /openfoodfacts/.test(x)).length;
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await page.screenshot({ path: path.join(OUT, "full-fail.png") }).catch(() => {});
  }
  checks.violations = fake.violations;
  checks.requests = fake.requests.length;
  checks.remaining = fake.remaining();
  checks.keyInConsole = t.log.consoleAll.some((m) => m.includes("MOCKKEY"));
  const res = SC1_B.replay.session.run;
  const states = Object.fromEntries(res.orders.map((o) => [o.id, o.on_time ? "dispatched" : "late"]));
  const want = usageCost(billed(script), PRICE, FX_USD_EUR);
  const keptTurns = script.filter((s) => !s.error).length;
  await finish(`full: scenario 1 live against the fake Claude, the Simulation's night (${checks.seconds} s at ×4)`, t, checks, [
    [checks.violations.length === 0 && checks.remaining === 0 && checks.requests === script.length, `every request follows the protocol and the fake's script is used up (${checks.requests} requests, ${checks.remaining} left; ${JSON.stringify(checks.violations)})`],
    [checks.badge === "LIVE" && checks.watermark === false && checks.cellTag === "Simulated cell" && checks.disclosure, `Live markings: LIVE badge, no SIMULATION watermark, the Simulated cell tag, the disclosure (${checks.badge})`],
    [JSON.stringify(checks.cards) === JSON.stringify(["A €112.50", "B €134.25 recommended", "C €250.00", "baseline €462.50"]), `the option cards carry the engine's golden totals (${JSON.stringify(checks.cards)})`],
    // The refused call-in comes back corrected after the store email, so it is drafted second.
    [JSON.stringify(checks.drafts) === JSON.stringify(["email", "call_in"]), `the store email and the corrected call-in wait in the Outbox (${JSON.stringify(checks.drafts)})`],
    [checks.status === "Done" && checks.runStatus === "done", `the run is done (${checks.status}, ${checks.runStatus})`],
    [checks.hash === SC1_B.hash && SC1_B.hash === "30d0e195eb5b7a5c", `the same physical night as the Simulation: unit-log hash ${checks.hash} (Simulation ${SC1_B.hash})`],
    [JSON.stringify(checks.lanes) === JSON.stringify(states) && checks.tile === `${SC1_B.onTime} of ${SC1_B.total}`, `every lane and the tile as in the Simulation (${checks.tile})`],
    [checks.parallel === true, "the correction's three reads ran in parallel: all three calls before their results"],
    [(checks.notices || []).some((x) => /^The API reported .*529.*\. Retrying in \d+ s \(attempt 1 of 2\)\.$/.test(x)), `the 529 is retried and said so (${JSON.stringify(checks.notices)})`],
    [(checks.notices || []).some((x) => /^The response hit the output limit in the middle of a tool call; it is discarded and retried with more room\.$/.test(x)) && checks.discarded >= 1, `the max_tokens cut is discarded and retried, and said so (${checks.discarded} entries marked discarded)`],
    [(checks.guardrail || []).length === 1 && /^Guardrail: /.test(checks.guardrail[0]) && checks.guardrail[0].includes("€143.25"), `the amount the engine never produced is refused, as a Guardrail line (${JSON.stringify(checks.guardrail)})`],
    [checks.modelCalls === keptTurns && checks.exchanges === keptTurns && checks.modelCalls <= AGENT.maxSteps && new RegExp(`; ${keptTurns} of 40 model calls; `).test(checks.facts || "") && /; 1 guardrail refusal; /.test(checks.facts || ""), `${checks.modelCalls} model calls of at most 40, in the run facts (${checks.facts})`],
    [checks.cost && Math.abs(checks.cost.eur - want.eur) < 1e-9 && Math.abs(checks.cost.usd - want.usd) < 1e-9 && checks.costTile === F.eurCents(want.eur), `the cost is the usage at Sonnet 5.5's prices × ${FX_USD_EUR}: ${checks.cost?.eur} against ${want.eur}, tile ${checks.costTile}`],
    [/Live agent run on a simulated cell/.test(checks.report || "") && !/Simulated run: the words were scripted/.test(checks.report || ""), "the summary calls itself a live run on a simulated cell"],
    [checks.offRequests === 0 && t.external.length === 0, "no Open Food Facts request and no other host"],
    [checks.keyInExport === false && checks.keyInConsole === false && /-LIVE-audit\.json$/.test(checks.file || "") && checks.mode === "live", `the audit export (${checks.file}) and the console carry no key`],
    [checks.contrastMeasured > 50 && (checks.contrastBelow || []).length === 0, `the end state meets its contrast duty (${checks.contrastMeasured} measured; ${JSON.stringify(checks.contrastBelow)})`]
  ]);
}

// ---- steps: the cap of 40 model calls ------------------------------------------------------------------------
if (wanted("steps")) {
  // A model that reads the night again and again and never moves on.
  const script = Array.from({ length: 41 }, (_, k) => ({ usage: { input_tokens: 300, cache_read_input_tokens: 9000, output_tokens: 60 }, stop: "tool_use", blocks: [{ type: "tool_use", id: `toolu_s${k}`, name: "wms_get_night", input: {} }] }));
  const fake = createFakeClaude(script);
  const t = await newLivePage(fake);
  const { page } = t;
  const checks = {};
  try {
    await startLive(page);
    await waitEnded(page, 240000);
    checks.status = await statusText(page);
    checks.lines = await lastLines(page, 3);
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  checks.requests = fake.requests.length;
  checks.violations = fake.violations;
  await finish("steps: a model that never moves on is stopped at 40 model calls", t, checks, [
    [checks.requests === AGENT.maxSteps && AGENT.maxSteps === 40 && checks.violations.length === 0, `exactly 40 model calls, each following the protocol (${checks.requests}; ${JSON.stringify(checks.violations)})`],
    [checks.status === "Error" && (checks.lines || []).some((x) => /Step limit reached \(40 model calls\)\. The run stops here to protect time and cost\./.test(x)), `the run stops with the step limit (${checks.status}; ${JSON.stringify(checks.lines)})`],
    [(checks.lines || []).some((x) => /Run facts: .*; 40 of 40 model calls; /.test(x)), "the run facts say 40 of 40 model calls"]
  ]);
}

// ---- budget: the €3 cost cap -------------------------------------------------------------------------------
if (wanted("budget")) {
  const big = { input_tokens: 1000000, cache_read_input_tokens: 0, output_tokens: 200000 };
  const script = [{ usage: big, stop: "tool_use", blocks: [{ type: "text", text: "Night start." }, { type: "tool_use", id: "toolu_b1", name: "wms_get_night", input: {} }] }, { usage: big, stop: "end_turn", blocks: [{ type: "text", text: "Never reached." }] }];
  const fake = createFakeClaude(script);
  const t = await newLivePage(fake);
  const { page } = t;
  const checks = {};
  const want = usageCost(billed(script.slice(0, 1)), PRICE, FX_USD_EUR);
  try {
    await startLive(page);
    await waitEnded(page, 60000);
    checks.status = await statusText(page);
    checks.lines = await lastLines(page, 3);
    checks.costTile = (await page.textContent("#kpi-cost-value")).trim();
    checks.toolResults = await page.$$eval('#console .entry[data-type="tool_call"]', (els) => els.length);
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  checks.requests = fake.requests.length;
  const text = `Cost cap reached: this run has used ${F.eurCents(want.eur)}, above the ${F.eurCents(AGENT.budgetEur)} safety limit per run.`;
  await finish(`budget: one response costing ${F.eurCents(want.eur)} stops the run at the €3 cap`, t, checks, [
    [want.eur > AGENT.budgetEur && AGENT.budgetEur === 3, `the response costs more than €3 (${want.eur})`],
    [checks.requests === 1, `no model call after the cap (${checks.requests})`],
    [checks.status === "Aborted" && (checks.lines || []).some((x) => x.includes(text)), `the run stops with the cost cap (${checks.status}; ${JSON.stringify(checks.lines)}; expected "${text}")`],
    [checks.costTile === F.eurCents(want.eur), `the cost tile shows what the run used (${checks.costTile})`],
    [(checks.lines || []).some((x) => new RegExp(`Run facts: .*; 1 of 40 model calls; cost ${F.eurCents(want.eur).replace(".", "\\.")}\\.$`).test(x)), `the run facts carry the call and the cost (${JSON.stringify(checks.lines)})`]
  ]);
}

// ---- abort: Abort while a model call is in flight -----------------------------------------------------------
if (wanted("abort")) {
  const script = [{ delayMs: 6000, usage: {}, stop: "tool_use", blocks: [{ type: "text", text: "Night start." }, { type: "tool_use", id: "toolu_a1", name: "wms_get_night", input: {} }] }];
  const fake = createFakeClaude(script);
  const t = await newLivePage(fake);
  const { page } = t;
  const checks = {};
  try {
    await startLive(page);
    await page.waitForFunction(() => document.querySelector(".status-pill .text")?.textContent.trim() === "Perceiving", null, { timeout: 5000 });
    await page.waitForTimeout(800);
    checks.requestsBefore = fake.requests.length;
    const t0 = Date.now();
    await page.click("#btn-abort");
    await page.waitForFunction(() => document.querySelector(".status-pill .text")?.textContent.trim() === "Aborted", null, { timeout: 3000 });
    checks.stopMs = Date.now() - t0;
    await page.waitForTimeout(7000); // past the held response
    checks.status = await statusText(page);
    checks.lines = await lastLines(page, 2);
    checks.toolCalls = await page.$$eval('#console .entry[data-type="tool_call"]', (els) => els.length);
    checks.board = await page.getAttribute(".cell-board", "data-state");
    checks.start = await page.getAttribute("#btn-start", "aria-disabled");
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  checks.requests = fake.requests.length;
  await finish("abort: Abort during a model call stops the run at once", t, checks, [
    [checks.requestsBefore === 1 && checks.requests === 1, `one call in flight, none after (${checks.requestsBefore}, ${checks.requests})`],
    [checks.stopMs < 3000 && checks.status === "Aborted" && (checks.lines || []).some((x) => /^Run aborted\. Stopped by the user\./.test(x)), `aborted in ${checks.stopMs} ms (${JSON.stringify(checks.lines)})`],
    [checks.toolCalls === 0, `the late response runs no tool (${checks.toolCalls})`],
    [checks.board !== "running" && checks.start !== "true", `the board stops and Start is free again (${checks.board}, ${checks.start})`]
  ]);
}

// ---- key: a 401 mid-run removes the key -------------------------------------------------------------------
if (wanted("key")) {
  const script = [{ error: { status: 401, type: "authentication_error", message: "invalid x-api-key" } }];
  const fake = createFakeClaude(script);
  const t = await newLivePage(fake);
  const { page } = t;
  const checks = {};
  try {
    await startLive(page);
    await waitEnded(page, 30000);
    checks.status = await statusText(page);
    checks.lines = await lastLines(page, 3);
    checks.key = await page.evaluate((k) => sessionStorage.getItem(k), KEYS.apiKey);
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  checks.requests = fake.requests.length;
  await finish("key: a 401 during the run removes the key from this tab", t, checks, [
    [checks.requests === 1, `no retry of a 401 (${checks.requests})`],
    [checks.status === "Error" && (checks.lines || []).some((x) => /^Anthropic rejected the API key \(401\)\. It has been removed from this tab; start again and enter a valid key\./.test(x)), `the run ends in Error and says why (${checks.status}; ${JSON.stringify(checks.lines)})`],
    [checks.key === null, "the key is gone from session storage"]
  ], { allowConsole: /\[Repack Pilot\] live run failed/ });
}

await browser.close();
await close();
await writeFile(path.join(OUT, "live-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const p of r.problems) console.log(`      - ${p}`);
  if (r.pageErrors.length || r.consoleErrors.length) console.log(`      errors: ${JSON.stringify({ page: r.pageErrors, console: r.consoleErrors }).slice(0, 400)}`);
}
const okCount = results.filter((r) => r.ok).length;
console.log(`\n${okCount}/${results.length} live cases passed. Screenshots: ${OUT}`);
process.exit(results.length > 0 && okCount === results.length ? 0 : 1);
