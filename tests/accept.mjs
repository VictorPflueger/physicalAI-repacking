// Acceptance tests (TECH_NOTES §12) that the other suites do not cover, ported from Rebate Hunter's:
//   key      key lifecycle: no key at load, the mode choice first, a masked key dialog, session-only
//            storage, a new tab has no key, Change or forget key, the key only ever sent to
//            api.anthropic.com in its header, never in the console, the page or the audit export; the
//            Diagnostics privacy row with and without a key
//   diag     Diagnostics: the page's connection policy equals the configuration (api.anthropic.com
//            only, js/config.js CONNECT_ORIGINS); with the API unreachable the Anthropic row fails, the
//            failure is remembered for the session and shown again; Open Food Facts is skipped with its
//            reason and no request
//   abort    the Abort and Reset matrix in Simulation and Live at several phases (perceiving, options
//            waiting, drafts waiting, a model call in flight, after Done): every path ends clean, a late
//            decision is refused, nothing of a stopped run appears later, and a new run completes
//   offline  each of the six scenarios' Simulation with every external host blocked: it runs to Done
//            with its decisions, the SIMULATION badge and watermark at the start and the end, the replay
//            facts, and not a single request leaves the page's own server
// Usage: node tests/accept.mjs [case…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createFakeClaude } from "./lib/fake-claude.mjs";
import { conversationFromReplay } from "./lib/script_fake.mjs";
import { driveDecisions } from "./lib/drive.mjs";
import { loadData } from "./lib/scenario1.mjs";
import { APP_ROOT, outDir, wanted, launchBrowser, serveStatic, CORS, MOCK_KEY, NETWORK_NOISE, SKIP_INTRO, M4_SCREEN, KEYS } from "./lib/harness.mjs";

const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);
const { replayScript } = await mod("js/sim_check.js");
const { CONNECT_ORIGINS } = await mod("js/config.js");

const OUT = await outDir("accept");
const { base: BASE, close } = await serveStatic(APP_ROOT, 8869);
const browser = await launchBrowser();
const DATA = await loadData();
const KEY = MOCK_KEY;
const results = [];

/** A scenario's scripted replay played headless for a plan, and a fake Claude that makes its turns. */
async function scriptedFake(id, plan = { option: null }, { cutAfter = null } = {}) {
  const sc = DATA.SCENARIOS.find((x) => x.id === id);
  const node = await replayScript(DATA.SIM_RUNS[id], { world: DATA.WORLD, scenario: sc, refs: DATA.REFERENCE_CASES[id] || {}, plan });
  if (!node.ok) throw new Error(`replay of ${id} failed in Node: ${node.errors.join(" | ")}`);
  let turns = conversationFromReplay(node);
  // A conversation that stops after the turn that calls `cutAfter` (the run is aborted there).
  if (cutAfter) turns = turns.slice(0, turns.findIndex((t) => t.blocks.some((b) => b.name === cutAfter)) + 1);
  return createFakeClaude(turns);
}

/**
 * A page with a swappable fake Anthropic API and a full request log. opts.blockHosts: hosts whose
 * requests fail at network level; opts.offline: every non-local request fails.
 */
async function newPage({ blockHosts = [], offline = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  await context.addInitScript(SKIP_INTRO);
  await context.addInitScript(M4_SCREEN);
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const holder = { fake: null };
  const requests = [];
  context.on("request", async (req) => {
    let headers = {};
    try { headers = await req.allHeaders(); } catch { /* ignore */ }
    requests.push({ url: req.url(), host: new URL(req.url()).host, method: req.method(), headers, body: req.postData() || "" });
  });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (offline || blockHosts.includes(u.host)) return route.abort("failed");
    if (u.host === "api.anthropic.com") {
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
      if (u.pathname === "/v1/models") return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ data: [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }, { id: "claude-opus-5-5" }] }) });
      if (u.pathname === "/v1/messages" && !req.headers()["x-api-key"]) {
        // The Diagnostics reachability probe sends no key: answer like the real API does.
        return route.fulfill({ status: 401, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "x-api-key header is required" } }) });
      }
      if (u.pathname === "/v1/messages" && holder.fake) {
        const out = holder.fake.handle(req.postData() || "{}", req.headers());
        if (out.delayMs) await new Promise((r) => setTimeout(r, out.delayMs));
        return route.fulfill({ status: out.status, headers: { ...CORS, ...out.headers }, body: out.body }).catch(() => {});
      }
    }
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const log = { pageErrors: [], consoleErrors: [], consoleAll: [] };
  const watch = (p) => {
    p.on("pageerror", (e) => log.pageErrors.push(String(e.message || e)));
    p.on("console", (m) => {
      log.consoleAll.push(`${m.type()}: ${m.text()}`);
      if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) log.consoleErrors.push(m.text());
    });
  };
  watch(page);
  return { context, page, log, holder, requests, watch };
}

const status = (page) => page.$eval(".status-pill .text", (e) => e.textContent.trim());
const waitStatus = (page, re, timeout = 60000) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector(".status-pill .text")?.textContent || ""), re.source, { timeout });
const entries = (page) => page.$$eval("#console .entry", (els) => els.length);
/** The last console entry's text, without its time column (the night clock, D28). */
const lastEntry = (page) => page.$$eval("#console .entry", (els) => { const e = els.slice(-1)[0]; return (e?.querySelector(".entry-body") || e)?.innerText.replace(/\s+/g, " ").trim() || ""; });
/** Plays the night at ×16, a test speed the control bar does not offer: the logic, not the pace, is tested. */
const fastNight = (page) => page.evaluate(() => import("./js/state.js").then((m) => m.setState({ speed: 16 })));

async function boot(page) {
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
}
async function pickScenario(page, id) {
  await page.click("#dd-scenario");
  await page.click(`.menu-item[data-id="${id}"]`);
}
async function startMode(page, mode) {
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card", { timeout: 5000 });
  await page.click(`.mode-card[data-mode="${mode}"] .mode-cta button`);
}
async function enterKey(page) {
  await page.waitForSelector("#api-key-input", { timeout: 5000 });
  await page.fill("#api-key-input", KEY);
  await page.click('button:has-text("Check key and continue")');
  await page.waitForSelector("#api-key-input", { state: "detached", timeout: 8000 });
}
async function diagRow(page, id) {
  return page.$eval(`.diag-table tbody tr[data-test="${id}"]`, (r) => ({ s: r.querySelector(".diag-status")?.dataset.s, detail: r.querySelector(".detail")?.textContent.trim() })).catch(() => null);
}
async function openDiagnostics(page, run = true) {
  await page.click("#btn-diagnostics");
  await page.waitForSelector(".diag-table", { timeout: 5000 });
  if (run) {
    await page.click("#btn-run-tests");
    await page.waitForFunction(() => {
      const rows = [...document.querySelectorAll(".diag-table tbody tr")];
      return rows.length === 5 && rows.every((r) => { const s = r.querySelector(".diag-status")?.dataset.s; return s && s !== "running" && s !== "idle"; });
    }, null, { timeout: 60000 });
  }
}
async function closeModal(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}
async function exportAudit(page) {
  if ((await page.getAttribute("#drawer", "data-open")) !== "true" || !(await page.isVisible("#panel-audit"))) await page.click("#tab-audit");
  await page.waitForSelector("#panel-audit:not([hidden])");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.click("#btn-export-audit")]);
  return JSON.parse(await readFile(await dl.path(), "utf8"));
}
async function finish(name, t, checks, problems, extraFakes = []) {
  const csp = await t.page.evaluate(() => window.__csp || []).catch(() => []);
  const violations = [t.holder.fake, ...extraFakes].filter(Boolean).flatMap((f) => f.violations);
  const ok = !problems.length && !violations.length && !t.log.pageErrors.length && !t.log.consoleErrors.length && !csp.length;
  results.push({ name, ok, checks, problems, violations, pageErrors: t.log.pageErrors, consoleErrors: t.log.consoleErrors, csp });
  await t.context.close();
}

// ---- key lifecycle ------------------------------------------------------------------------------------
if (wanted("key")) {
  const t = await newPage();
  const { page } = t;
  const checks = {}, problems = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  try {
    await boot(page);
    checks.noKeyAtLoad = await page.evaluate((k) => !sessionStorage.getItem(k), KEYS.apiKey);
    checks.rendered = await page.evaluate(() => ({ lanes: document.querySelectorAll(".lane").length, stations: document.querySelectorAll(".station").length, tiles: document.querySelectorAll(".kpi").length }));
    expect(checks.noKeyAtLoad && checks.rendered.lanes === 12 && checks.rendered.stations === 5 && checks.rendered.tiles === 4, `no key at load; the board and tiles are drawn (${JSON.stringify(checks.rendered)})`);
    await openDiagnostics(page, false);
    await page.click("#btn-run-tests");
    await page.waitForFunction(() => document.querySelector('.diag-table tr[data-test="privacy"] .diag-status')?.dataset.s === "pass", null, { timeout: 30000 });
    checks.privacyNoKey = await diagRow(page, "privacy");
    expect(checks.privacyNoKey?.s === "pass" && /no key stored/.test(checks.privacyNoKey.detail), `privacy row passes with no key (${checks.privacyNoKey?.detail})`);
    await closeModal(page);
    // Start → the mode choice first, no key dialog yet.
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.modeCards = await page.$$eval(".mode-card", (els) => els.map((e) => e.dataset.mode));
    checks.keyModalBeforeChoice = await page.isVisible("#api-key-input");
    checks.manageKeyHiddenWithoutKey = !(await page.isVisible("#btn-manage-key"));
    expect(JSON.stringify(checks.modeCards) === JSON.stringify(["simulation", "live"]) && checks.manageKeyHiddenWithoutKey && !checks.keyModalBeforeChoice, "the mode choice first, without a key dialog or a Change-key button");
    await page.click('.mode-card[data-mode="live"] .mode-cta button');
    await page.waitForSelector("#api-key-input", { timeout: 5000 });
    checks.inputType = await page.$eval("#api-key-input", (e) => e.type);
    checks.pmIgnore = await page.$eval("#api-key-input", (e) => e.getAttribute("autocomplete") === "off" && e.hasAttribute("data-1p-ignore") && e.getAttribute("data-lpignore") === "true");
    checks.facts = await page.$$eval(".key-facts li", (els) => els.map((e) => e.textContent.trim()));
    expect(checks.inputType === "password" && checks.pmIgnore, "the key input is masked and asks password managers not to save it");
    expect(checks.facts.some((f) => /reopening a closed tab/.test(f)), "the key facts say that reopening a closed tab can restore the key");
    // A short live run: scenario 2 against a fake that makes its scripted replay's turns.
    t.holder.fake = await scriptedFake("SC2-GLASS");
    await page.keyboard.press("Escape");
    await pickScenario(page, "SC2-GLASS");
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    await page.click('.mode-card[data-mode="live"] .mode-cta button');
    await enterKey(page);
    await fastNight(page);
    await waitStatus(page, /Done/, 180000);
    checks.runEnd = await lastEntry(page);
    expect(/Run facts:/.test(checks.runEnd), `a live run ends with its Run facts line (${checks.runEnd})`);
    checks.keyInSession = await page.evaluate(([name, k]) => sessionStorage.getItem(name) === k, [KEYS.apiKey, KEY]);
    checks.keyLikeInLocal = await page.evaluate(() => { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/sk-ant-/.test(localStorage.getItem(k) || "")) out.push(k); } return out; });
    expect(checks.keyInSession && checks.keyLikeInLocal.length === 0, "the key is in this tab's session storage only, never in local storage");
    checks.keyInDom = await page.evaluate((k) => document.documentElement.outerHTML.includes(k) || document.documentElement.outerHTML.includes("MOCKKEY"), KEY);
    expect(!checks.keyInDom, "the key never appears in the page");
    await openDiagnostics(page, false);
    await page.click("#btn-run-tests");
    await page.waitForFunction(() => { const s = document.querySelector('.diag-table tr[data-test="privacy"] .diag-status')?.dataset.s; return s === "pass" || s === "fail"; }, null, { timeout: 30000 });
    checks.privacyWithKey = await diagRow(page, "privacy");
    await page.screenshot({ path: path.join(OUT, "A-key-diagnostics.png") });
    expect(checks.privacyWithKey?.s === "pass" && /stored for this tab only/.test(checks.privacyWithKey.detail), `the privacy row passes with a key and says it is tab-only (${checks.privacyWithKey?.detail})`);
    await closeModal(page);
    const audit = await exportAudit(page);
    checks.auditHasKey = JSON.stringify(audit).includes("MOCKKEY");
    expect(!checks.auditHasKey && !!audit.run_facts, "the audit export carries the run facts and no key");
    // A new tab in the same browser has no key.
    const tab2 = await t.context.newPage();
    t.watch(tab2);
    await tab2.goto(BASE);
    await tab2.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    checks.newTabHasKey = await tab2.evaluate((k) => !!sessionStorage.getItem(k), KEYS.apiKey);
    expect(!checks.newTabHasKey, "a new tab does not see the key");
    await tab2.close();
    // Change or forget the key from the mode choice.
    await page.click("#btn-reset");
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.footerKey = await page.$eval(".modal-foot .left", (e) => e.textContent.trim()).catch(() => null);
    expect(!!checks.footerKey && !checks.footerKey.includes(KEY) && /sk-ant-…/.test(checks.footerKey), `the mode choice shows the key masked (${checks.footerKey})`);
    await page.click("#btn-manage-key");
    await page.waitForSelector("#api-key-input", { timeout: 5000 });
    await page.click('button:has-text("Forget key")');
    checks.keyAfterForget = await page.evaluate((k) => sessionStorage.getItem(k), KEYS.apiKey);
    expect(checks.keyAfterForget === null, "Forget key clears session storage");
    await closeModal(page);
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.manageKeyAfterForget = await page.isVisible("#btn-manage-key");
    await page.click('.mode-card[data-mode="live"] .mode-cta button');
    checks.keyAskedAgain = await page.waitForSelector("#api-key-input", { timeout: 5000 }).then(() => true).catch(() => false);
    expect(checks.keyAskedAgain && !checks.manageKeyAfterForget, "after Forget key, Live asks for a key again");
    await closeModal(page);
    // Where did the key go? Only in the x-api-key header to api.anthropic.com.
    const carrying = t.requests.filter((r) => JSON.stringify(r).includes("MOCKKEY"));
    checks.requestsWithKey = [...new Set(carrying.map((r) => `${r.method} ${r.host}${new URL(r.url).pathname}`))];
    checks.keyOnlyInHeader = carrying.every((r) => r.host === "api.anthropic.com" && r.headers["x-api-key"] === KEY && !r.url.includes("MOCKKEY") && !r.body.includes("MOCKKEY"));
    expect(carrying.length > 0 && checks.keyOnlyInHeader, `the key travels only in the x-api-key header to api.anthropic.com (${JSON.stringify(checks.requestsWithKey)})`);
    checks.hosts = [...new Set(t.requests.map((r) => r.host))].sort();
    const allowed = new Set([new URL(BASE).host, "api.anthropic.com"]);
    expect(checks.hosts.every((h) => allowed.has(h)), `no other host contacted (${checks.hosts.join(", ")})`);
    checks.consoleMentionsKey = t.log.consoleAll.filter((x) => x.includes("MOCKKEY") || x.includes(KEY)).length;
    expect(checks.consoleMentionsKey === 0, "the key is never written to the browser console");
  } catch (e) {
    problems.push(`exception: ${String(e.message).split("\n")[0]} (${(String(e.stack).match(/accept\.mjs:\d+/) || ["?"])[0]})`);
    await page.screenshot({ path: path.join(OUT, "A-key-fail.png") }).catch(() => {});
  }
  await finish("key lifecycle and privacy", t, checks, problems);
}

// ---- Diagnostics: the policy equals the configuration; an unreachable API is remembered -----------------
if (wanted("diag")) {
  const t = await newPage({ blockHosts: ["api.anthropic.com"] });
  const { page } = t;
  const checks = {}, problems = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  try {
    await boot(page);
    checks.csp = await page.$eval('meta[http-equiv="Content-Security-Policy"]', (m) => (/connect-src([^;]*)/.exec(m.getAttribute("content"))?.[1] || "").trim().split(/\s+/));
    expect(JSON.stringify(checks.csp) === JSON.stringify(CONNECT_ORIGINS) && JSON.stringify(CONNECT_ORIGINS) === JSON.stringify(["https://api.anthropic.com"]), `the page's connection policy equals the configuration (${JSON.stringify(checks.csp)} against ${JSON.stringify(CONNECT_ORIGINS)})`);
    await openDiagnostics(page, true);
    checks.rows = await page.$$eval(".diag-table tbody tr", (rows) => rows.map((r) => `${r.dataset.test}:${r.querySelector(".diag-status")?.dataset.s}`));
    checks.anthropic = await diagRow(page, "anthropic");
    checks.privacy = await diagRow(page, "privacy");
    checks.off = await diagRow(page, "openfoodfacts");
    expect(JSON.stringify(checks.rows) === JSON.stringify(["anthropic:fail", "world:pass", "scripts:pass", "openfoodfacts:skip", "privacy:pass"]), `the API row fails, the others pass, Open Food Facts is skipped (${JSON.stringify(checks.rows)})`);
    expect(/as configured/.test(checks.privacy?.detail || ""), `the privacy row compares the policy with the configuration (${checks.privacy?.detail})`);
    expect(/Live reads are off/.test(checks.off?.detail || "") && /No request is sent/.test(checks.off?.detail || ""), `Open Food Facts says why it is skipped (${checks.off?.detail})`);
    await page.screenshot({ path: path.join(OUT, "A-diag-unreachable.png") });
    await closeModal(page);
    checks.remembered = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) || "{}").anthropic?.status, KEYS.diagnostics);
    expect(checks.remembered === "fail", `the failure is remembered for this session (${checks.remembered})`);
    await page.reload();
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    await openDiagnostics(page, false);
    checks.afterReload = await diagRow(page, "anthropic");
    expect(checks.afterReload?.s === "fail", `after a reload Diagnostics shows the remembered failure (${JSON.stringify(checks.afterReload)})`);
    await closeModal(page);
    checks.offRequests = t.requests.filter((r) => /openfoodfacts/.test(r.host)).length;
    expect(checks.offRequests === 0, "no request to Open Food Facts");
  } catch (e) {
    problems.push(`exception: ${String(e.message).split("\n")[0]} (${(String(e.stack).match(/accept\.mjs:\d+/) || ["?"])[0]})`);
    await page.screenshot({ path: path.join(OUT, "A-diag-fail.png") }).catch(() => {});
  }
  await finish("Diagnostics: the policy equals the configuration, an unreachable API is remembered", t, checks, problems);
}

// ---- Abort / Reset matrix ------------------------------------------------------------------------------------
if (wanted("abort")) {
  const t = await newPage();
  const { page } = t;
  const checks = {}, problems = [];
  const used = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  const idleCheck = async (label) => {
    const s = await status(page);
    const n = await entries(page);
    const drafts = await page.$$eval(".action-card", (els) => els.length);
    const opts = await page.$$eval(".option-card", (els) => els.length);
    const clock = (await page.textContent(".cell-clock")).trim();
    checks[`${label}:idle`] = `${s}|entries ${n}|options ${opts}|drafts ${drafts}|${clock}`;
    expect(s === "Idle" && n === 0 && opts === 0 && drafts === 0 && clock === "22:00", `${label}: Reset returns to a clean Idle at 22:00 (${checks[`${label}:idle`]})`);
  };
  const stable = async (label, ms = 2500) => {
    const a = await entries(page);
    await page.waitForTimeout(ms);
    const b = await entries(page);
    checks[`${label}:stable`] = `${a}→${b}`;
    expect(a === b, `${label}: nothing appears after Abort (${a}→${b})`);
  };
  try {
    await boot(page);
    // S1: Simulation, Abort while perceiving, then Start again at once (no Reset needed).
    await startMode(page, "simulation");
    await page.waitForTimeout(1500);
    checks["S1:before"] = await status(page);
    await page.click("#btn-abort");
    await waitStatus(page, /Aborted/, 5000);
    await stable("S1");
    checks["S1:end"] = await lastEntry(page);
    expect(/^Run aborted\. Stopped by the user\./.test(checks["S1:end"]) && /Replay facts:/.test(checks["S1:end"]), `S1: Abort says how far the run got (${checks["S1:end"]})`);
    await startMode(page, "simulation");
    await page.waitForTimeout(1200);
    checks["S1:restart"] = await status(page);
    expect(checks["S1:restart"] !== "Aborted" && checks["S1:restart"] !== "Idle", `S1: Start after Abort begins a new run (${checks["S1:restart"]})`);
    // S2: Abort while the options wait for a decision; a late click decides nothing.
    await fastNight(page);
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 120000 });
    await page.click("#btn-abort");
    await waitStatus(page, /Aborted/, 5000);
    await stable("S2");
    await page.click('.option-card[data-recommended="true"] .btn-approve').catch(() => {});
    await page.waitForTimeout(400);
    checks["S2:cards"] = await page.$$eval(".option-card", (els) => els.map((e) => e.dataset.status || "open").join(","));
    checks["S2:buttonsLeft"] = await page.$$eval(".option-card .btn-approve, .option-card .option-actions .btn", (els) => els.length);
    await page.screenshot({ path: path.join(OUT, "A-abort-options.png") });
    expect(checks["S2:cards"] === "expired,expired,expired,expired" && checks["S2:buttonsLeft"] === 0, `S2: an aborted run shows its options undecided, without buttons (${checks["S2:cards"]})`);
    await page.click("#btn-reset");
    await idleCheck("S2");
    // S3: Reset (without Abort) while drafts wait for approval; then a full run to Done.
    await startMode(page, "simulation");
    await fastNight(page);
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 120000 });
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForFunction(() => /Waiting for your approval of \d+ drafts?/.test(document.querySelector("#console").innerText), null, { timeout: 60000 });
    await page.click("#btn-reset");
    await idleCheck("S3");
    await page.waitForTimeout(1500);
    checks["S3:afterReset"] = `${await status(page)}|entries ${await entries(page)}`;
    expect(checks["S3:afterReset"] === "Idle|entries 0", `S3: the reset run stays silent (${checks["S3:afterReset"]})`);
    await startMode(page, "simulation");
    await fastNight(page);
    const s3 = await driveDecisions(page, { option: "B" });
    checks["S3:end"] = await lastEntry(page);
    expect(s3.end === "Done" && /Replay facts:/.test(checks["S3:end"]), `S3: a finished replay ends with its Replay facts (${checks["S3:end"]})`);
    // S4: Reset after Done.
    await page.click("#btn-reset");
    await idleCheck("S4");

    // L1: Live, Abort while the options wait; no model call after it; then a fresh live run completes.
    t.holder.fake = await scriptedFake("SC1-EXPRESS", { option: "B" }, { cutAfter: "ui_propose_options" });
    used.push(t.holder.fake);
    await startMode(page, "live");
    await enterKey(page);
    await fastNight(page);
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 120000 });
    const before = t.holder.fake.requests.length;
    await page.click("#btn-abort");
    await waitStatus(page, /Aborted/, 5000);
    await stable("L1");
    checks["L1:modelCallsAfterAbort"] = t.holder.fake.requests.length - before;
    expect(checks["L1:modelCallsAfterAbort"] === 0, `L1: no model call after Abort (${checks["L1:modelCallsAfterAbort"]})`);
    await page.click("#btn-reset");
    await idleCheck("L1");
    // L2: Live, Abort while drafts wait for approval; a late draft decision is refused.
    t.holder.fake = await scriptedFake("SC1-EXPRESS", { option: "B" }, { cutAfter: "ui_await_approvals" });
    used.push(t.holder.fake);
    await startMode(page, "live");
    await fastNight(page);
    await page.waitForSelector('.option-card[data-recommended="true"] .btn-approve', { state: "visible", timeout: 120000 });
    await page.click('.option-card[data-recommended="true"] .btn-approve');
    await page.waitForFunction(() => /Waiting for your approval of \d+ drafts?/.test(document.querySelector("#console").innerText), null, { timeout: 60000 });
    const calls = t.holder.fake.requests.length;
    await page.click("#btn-abort");
    await waitStatus(page, /Aborted/, 5000);
    await stable("L2");
    await page.click(".action-card .action-buttons .btn-approve").catch(() => {});
    await page.waitForTimeout(400);
    checks["L2:draftsAfterAbort"] = await page.$$eval(".action-card", (els) => els.map((e) => `${e.dataset.status}:${e.querySelector(".chip")?.textContent}`).join(","));
    expect(/^(expired:Not decided: the run ended,?)+$/.test(checks["L2:draftsAfterAbort"]), `L2: an aborted run shows its drafts as not decided (${checks["L2:draftsAfterAbort"]})`);
    await page.screenshot({ path: path.join(OUT, "A-abort-outbox.png") });
    checks["L2:modelCallsAfterAbort"] = t.holder.fake.requests.length - calls;
    expect(checks["L2:modelCallsAfterAbort"] === 0, `L2: no model call after Abort (${checks["L2:modelCallsAfterAbort"]})`);
    await page.click("#btn-reset");
    await idleCheck("L2");
    // L3: Live, Reset while a model call is in flight; the late answer never appears.
    t.holder.fake = createFakeClaude([{ usage: { input_tokens: 600, output_tokens: 40 }, stop: "end_turn", delayMs: 2500, blocks: [{ type: "text", text: "This late answer must never appear." }] }]);
    used.push(t.holder.fake);
    await startMode(page, "live");
    await page.waitForTimeout(700);
    checks["L3:before"] = await status(page);
    await page.click("#btn-reset");
    await idleCheck("L3");
    await page.waitForTimeout(3200);
    checks["L3:after"] = `${await status(page)}|entries ${await entries(page)}|late ${await page.evaluate(() => /must never appear/.test(document.body.innerText))}`;
    expect(checks["L3:after"] === "Idle|entries 0|late false", `L3: nothing of the reset run appears (${checks["L3:after"]})`);
    // L4: after all that, a normal live run still completes (scenario 2).
    t.holder.fake = await scriptedFake("SC2-GLASS");
    used.push(t.holder.fake);
    await pickScenario(page, "SC2-GLASS");
    await startMode(page, "live");
    await fastNight(page);
    await waitStatus(page, /Done/, 180000);
    checks["L4:end"] = await lastEntry(page);
    expect(/Run facts:/.test(checks["L4:end"]), `L4: a fresh live run completes (${checks["L4:end"]})`);
  } catch (e) {
    problems.push(`exception: ${String(e.message).split("\n")[0]} (${(String(e.stack).match(/accept\.mjs:\d+/) || ["?"])[0]})`);
    await page.screenshot({ path: path.join(OUT, "A-abort-fail.png") }).catch(() => {});
    checks.consoleTail = await page.$$eval("#console .entry", (els) => els.slice(-4).map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 200))).catch(() => []);
  }
  // A cut conversation is not used up: its remaining turns are the run that was aborted.
  const cut = used.slice(0, 2);
  const rest = used.slice(2);
  t.holder.fake = null;
  await finish("Abort and Reset matrix (Simulation and Live)", t, checks, problems, [...rest, ...cut.map((f) => ({ violations: f.violations.filter((v) => !/script exhausted/.test(v)) }))]);
}

// ---- every scenario's Simulation fully offline -------------------------------------------------------------
if (wanted("offline")) {
  const PLANS = {
    "SC1-EXPRESS": { option: "B" }, "SC2-GLASS": {}, "SC3-UNKNOWN": { confirm: "confirm" },
    "SC4-WEAR": { option: "A" }, "SC5-EARLY": {}, "SC6-PEAK": { option: "A" }
  };
  const t = await newPage({ offline: true });
  const { page } = t;
  const checks = {}, problems = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  const marks = async (label) => {
    const badge = (await page.textContent("#mode-badge")).trim();
    const wm = await page.isVisible(".sim-watermark");
    checks[`marks:${label}`] = `${badge}|watermark ${wm}`;
    expect(badge === "SIMULATION" && wm, `${label}: the SIMULATION badge and watermark are visible`);
  };
  try {
    await boot(page);
    for (const [id, plan] of Object.entries(PLANS)) {
      await page.click("#btn-reset");
      await pickScenario(page, id);
      await startMode(page, "simulation");
      await fastNight(page);
      await page.waitForTimeout(400);
      await marks(`${id} start`);
      const r = await driveDecisions(page, plan);
      await marks(`${id} done`);
      checks[`${id}:end`] = `${r.end} after ${r.decided.join(", ") || "no decision"}; ${(await page.textContent("#kpi-ontime-value")).trim()} on time`;
      const last = await lastEntry(page);
      expect(r.end === "Done" && /Replay facts:/.test(last), `${id}: the offline replay ends with its Replay facts (${last})`);
    }
    await page.screenshot({ path: path.join(OUT, "A-offline-done.png") });
    checks.externalAttempts = [...new Set(t.requests.filter((r) => !r.host.startsWith("127.0.0.1")).map((r) => r.host))].sort();
    expect(checks.externalAttempts.length === 0, `an offline simulation tries no external host: ${checks.externalAttempts.join(", ")}`);
  } catch (e) {
    problems.push(`exception: ${String(e.message).split("\n")[0]} (${(String(e.stack).match(/accept\.mjs:\d+/) || ["?"])[0]})`);
    await page.screenshot({ path: path.join(OUT, "A-offline-fail.png") }).catch(() => {});
  }
  await finish("every scenario's Simulation fully offline (no external request at all)", t, checks, problems);
}

await browser.close();
await close();
await writeFile(path.join(OUT, "accept-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const p of r.problems) console.log(`      - ${p}`);
  for (const v of r.violations) console.log(`      - fake: ${v}`);
  if (r.pageErrors.length) console.log(`      - page errors: ${r.pageErrors.join(" | ")}`);
  if (r.consoleErrors.length) console.log(`      - console errors: ${r.consoleErrors.slice(0, 3).join(" | ")}`);
  if (r.csp.length) console.log(`      - csp: ${r.csp.join(" | ")}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} acceptance cases passed. Screenshots: ${OUT}`);
process.exit(results.length > 0 && results.every((r) => r.ok) ? 0 : 1);
