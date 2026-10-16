// Smoke tests of the shell and the failure modes of loading:
//   boot          the idle workspace: disclosure, badge, fonts, the Simulated cell tag, the Synthetic world
//                 data, six scenarios, no external request, storage keys under rp.
//   intro         first visit opens the intro window (five steps, three value points, what is real);
//                 "How it works" reopens it; its Start agent leads to the mode choice
//   modes         Start agent → Simulation; Start agent → Live → key dialog (401, then accepted) → key
//                 kept in this tab's session storage only, never in local storage or the console;
//                 change or forget the key
//   diag          Diagnostics: Anthropic (keyless 401 from a stand-in), world and privacy rows pass;
//                 the privacy row names the one allowed host
//   drawer        five tabs, each with its text; the audit export (JSON) carries the version, the mode
//                 and the notices, and no key
//   viewports     1920×1080 down to 1280×720, drawer closed and open: no horizontal overflow, a one-row
//                 control bar, the header badges clear of each other, the cell panel's caption, tag and
//                 overview inside the panel and clear of each other, the overview whole (it folds on a
//                 short panel) with its Synthetic label in view; screenshots
//   contrast      every visible text in eleven states (intro, idle, Diagnostics, five drawer tabs, mode
//                 choice, key dialog, notice and banner) meets its WCAG contrast duty; a control is caught
//   csp           the page's policy blocks a connection to any other host
//   file          opened from file://: the page explains how to start a server
//   missing-data  a data file is missing: the boot screen names it
// No case calls a real API: api.anthropic.com is answered by a stand-in, every other host is blocked.
// Usage: node tests/smoke.mjs [case…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { APP_ROOT, outDir, wanted, launchBrowser, serveStatic, NETWORK_NOISE, MOCK_KEY, SKIP_INTRO, KEYS, VIEWPORTS } from "./lib/harness.mjs";

const OUT = await outDir("smoke");
const { base: BASE, blockLocal, close } = await serveStatic(APP_ROOT, 8865);
const browser = await launchBrowser();
const results = [];

/** A stand-in for the Messages and Models API: 401 without a key, then whatever `models` answers. */
function anthropicStandIn({ models = [401, 200] } = {}) {
  let modelCalls = 0;
  const cors = { "access-control-allow-origin": "*", "access-control-expose-headers": "*", "content-type": "application/json" };
  const handler = async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" } });
    const url = new URL(req.url());
    handler.seen.push(`${req.method()} ${url.pathname} key=${req.headers()["x-api-key"] ? "yes" : "no"} browser=${req.headers()["anthropic-dangerous-direct-browser-access"] || "-"}`);
    if (url.pathname === "/v1/messages") {
      return route.fulfill({ status: 401, headers: cors, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "x-api-key header is required" } }) });
    }
    const status = models[Math.min(modelCalls++, models.length - 1)];
    if (status !== 200) return route.fulfill({ status, headers: cors, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ data: [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }, { id: "claude-opus-5-5" }] }) });
  };
  handler.seen = [];
  return handler;
}

async function newPage({ anthropic = null, intro = false, viewport = { width: 1920, height: 1080 } } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  if (!intro) await context.addInitScript(SKIP_INTRO);
  await context.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`.trim()));
  });
  const external = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const u = new URL(route.request().url());
    if (u.host === "api.anthropic.com" && anthropic) return anthropic(route);
    external.push(`${route.request().method()} ${u.host}${u.pathname}`);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const log = { pageErrors: [], consoleErrors: [], consoleAll: [] };
  page.on("pageerror", (e) => log.pageErrors.push(String(e.message || e)));
  page.on("console", (m) => { log.consoleAll.push(m.text()); if (m.type() === "error") log.consoleErrors.push(m.text()); });
  return { context, page, log, external };
}

/** expectations: [[condition, message], …]; allow: console errors and CSP reports that are part of the case. */
async function finish(name, { context, page, log }, checks, expectations, { allowConsole = null, allowCsp = null } = {}) {
  const csp = (await page.evaluate(() => window.__csp || []).catch(() => ["<page gone>"])).filter((c) => !(allowCsp && allowCsp.test(c)));
  const consoleErrors = log.consoleErrors.filter((t) => !NETWORK_NOISE.test(t) && !(allowConsole && allowConsole.test(t)));
  const problems = expectations.filter(([okay]) => !okay).map(([, msg]) => msg);
  if (checks.FAILED) problems.unshift(`exception: ${checks.FAILED}`);
  const ok = !problems.length && !log.pageErrors.length && !consoleErrors.length && !csp.length;
  results.push({ name, ok, problems, checks, pageErrors: log.pageErrors, consoleErrors, csp });
  await context.close();
}

/** Waits out fades and transitions (endless ones such as a spinner or the rail's pulse excepted). */
const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null)))).catch(() => null);
const shot = async (page, file) => { await settle(page); return page.screenshot({ path: path.join(OUT, file) }); };
const boot = async (page) => { await page.goto(BASE); await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 }); };
const storageKeys = (page) => page.evaluate(() => ({
  local: Object.keys(localStorage), session: Object.keys(sessionStorage)
}));

// ---- boot: the idle workspace ------------------------------------------------------------------------
if (wanted("boot")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.waitForTimeout(600);
    checks.bootRemoved = (await page.$("#boot")) === null;
    checks.badge = (await page.textContent("#mode-badge")).trim();
    checks.disclosure = (await page.textContent(".ai-disclosure")).replace(/\s+/g, " ").trim();
    checks.disclosureVisible = await page.isVisible(".ai-disclosure");
    checks.fontsLoaded = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")); });
    checks.cellTag = (await page.textContent(".sim-cell-tag")).trim();
    checks.cellTagVisible = await page.isVisible(".sim-cell-tag");
    checks.synthetic = (await page.textContent(".cell-synthetic")).replace(/\s+/g, " ").trim();
    checks.facts = await page.$$eval(".cell-facts dd", (els) => els.map((e) => e.textContent));
    checks.subtitle = (await page.textContent(".cell-sub")).trim();
    await page.click("#dd-scenario");
    checks.scenarios = await page.$$eval("#dd-scenario + .dropdown-menu .menu-item", (els) => els.map((e) => `${e.querySelector(".num-badge")?.textContent} ${e.querySelector(".menu-title")?.textContent}`));
    await page.click('.menu-item[data-id="SC4-WEAR"]');
    checks.scenarioLabel = (await page.textContent("#dd-scenario .value")).trim();
    checks.subtitleAfter = (await page.textContent(".cell-sub")).trim();
    checks.rail = await page.$$eval(".rail-step", (els) => els.map((e) => e.dataset.step).join(","));
    checks.status = (await page.textContent(".status-pill .text")).trim();
    checks.abortDisabled = await page.getAttribute("#btn-abort", "aria-disabled");
    await page.click('button[aria-label="Night speed ×4"]');
    checks.speedPressed = await page.getAttribute('button[aria-label="Night speed ×4"]', "aria-pressed");
    checks.storage = await storageKeys(page);
    await shot(page, "01-idle.png");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "boot-fail.png");
  }
  const keys = [...(checks.storage?.local || []), ...(checks.storage?.session || [])];
  await finish("boot: the idle workspace", t, checks, [
    [checks.bootRemoved, "boot screen removed"],
    [checks.badge === "No run active", "idle badge"],
    [checks.disclosureVisible && /You are interacting with an AI system/.test(checks.disclosure || ""), "AI disclosure visible"],
    [["Barlow", "Barlow Semi Condensed"].every((f) => (checks.fontsLoaded || []).includes(f)), `self-hosted fonts loaded (${(checks.fontsLoaded || []).join(", ")})`],
    [checks.cellTagVisible && checks.cellTag === "Simulated cell", "the neutral Simulated cell tag"],
    [/^Synthetic/.test(checks.synthetic || "") && /Ruhrkorb/.test(checks.synthetic || ""), "the world data says Synthetic"],
    [/^12, truck cut-offs 01:35 \(Essen\) to 06:00 \(Schwerte\)$/.test(checks.facts?.[0] || "") && /^3,000 units of 24 SKUs; 2,100 of them the cell may handle$/.test(checks.facts?.[1] || ""), `night facts from the world (${JSON.stringify(checks.facts)})`],
    [checks.scenarios?.length === 6 && checks.scenarios[0] === "1 Express order for the flagship store at 02:00", `six scenarios (${JSON.stringify(checks.scenarios)})`],
    [checks.scenarioLabel === "Gripper wear" && /Scenario 4: Gripper wear/.test(checks.subtitleAfter || ""), "choosing a scenario updates the bar and the panel"],
    [checks.rail === "perceive,plan,pick,replan,prepare", "the rail's five steps"],
    [checks.status === "Idle" && checks.abortDisabled === "true", "idle status, Abort disabled"],
    [checks.speedPressed === "true", "night speed ×4 selected"],
    [keys.length > 0 && keys.every((k) => k.startsWith("rp.")), `storage keys all under rp. (${JSON.stringify(checks.storage)})`],
    [t.external.length === 0, `no external request (${t.external.join(", ")})`]
  ]);
}

// ---- intro: first visit, reopen, start ---------------------------------------------------------------------
if (wanted("intro")) {
  const t = await newPage({ intro: true });
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.waitForSelector(".intro-modal", { timeout: 5000 });
    checks.title = (await page.textContent(".intro-modal h2")).trim();
    checks.steps = await page.$$eval(".intro-step-title", (els) => els.map((e) => e.textContent).join(","));
    checks.values = await page.$$eval(".intro-value strong", (els) => els.length);
    checks.real = await page.$$eval(".intro-real-item strong", (els) => els.map((e) => e.textContent));
    checks.words = await page.$eval(".intro-modal", (e) => e.innerText.split(/\s+/).filter(Boolean).length);
    checks.fits = await page.$eval(".intro-modal", (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    await page.waitForTimeout(200);
    checks.focus = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await shot(page, "02-intro.png");
    await page.click('.intro-modal .modal-foot button:has-text("Close")');
    await page.waitForSelector(".intro-modal", { state: "detached", timeout: 3000 });
    checks.flag = await page.evaluate((k) => localStorage.getItem(k), KEYS.introSeen);
    await page.reload();
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    await page.waitForTimeout(700);
    checks.reopenedOnReload = await page.isVisible(".intro-modal");
    checks.buttonLabel = (await page.textContent("#btn-about")).trim();
    await page.click("#btn-about");
    await page.waitForSelector(".intro-modal", { timeout: 3000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector(".intro-modal", { state: "detached", timeout: 3000 });
    checks.focusBack = await page.evaluate(() => document.activeElement?.id);
    await page.click("#btn-about");
    await page.click('.intro-modal .modal-foot button:has-text("Start agent")');
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.modeChoice = await page.$$eval(".mode-card", (els) => els.map((e) => e.dataset.mode).join(","));
    await page.keyboard.press("Escape");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "intro-fail.png");
  }
  await finish("intro: first visit, reopen, start", t, checks, [
    [checks.title === "How Repack Pilot works", "the intro opens by itself on the first visit"],
    [checks.steps === "Perceive,Plan,Pick,Replan,Prepare" && checks.values === 3, "five steps and three value points"],
    [JSON.stringify(checks.real) === JSON.stringify(["Simulated, and labelled so", "Real"]), "the what-is-real panel"],
    [checks.words <= 260, `the intro stays brief (${checks.words} words)`],
    [checks.fits, "the intro fits the screen"],
    [checks.focus === "Start agent", "the main button has focus"],
    [checks.flag === "1" && checks.reopenedOnReload === false, "once closed, it does not open again on reload"],
    [checks.buttonLabel === "How it works" && checks.focusBack === "btn-about", "How it works reopens it; Escape returns the focus"],
    [checks.modeChoice === "simulation,live", "Start agent in the intro opens the mode choice"]
  ]);
}

// ---- modes: Simulation, Live with the key dialog, change and forget the key -------------------------------
if (wanted("modes")) {
  const stand = anthropicStandIn({ models: [401, 200] });
  const t = await newPage({ anthropic: stand });
  const { page, log } = t;
  const checks = {};
  try {
    await boot(page);
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.runLabel = (await page.textContent(".run-summary strong")).trim();
    await shot(page, "03-mode-choice.png");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector('#console .entry[data-type="notice"]', { timeout: 5000 });
    checks.simNotice = (await page.textContent('#console .entry[data-type="notice"]')).trim();
    checks.banner = (await page.textContent(".banner")).replace(/\s+/g, " ").trim();
    checks.statusAfterSim = (await page.textContent(".status-pill .text")).trim();
    checks.badgeAfterSim = (await page.textContent("#mode-badge")).trim();
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="live"] .mode-cta button');
    await page.waitForSelector("#api-key-input", { timeout: 5000 });
    checks.inputMasked = (await page.getAttribute("#api-key-input", "type")) === "password";
    await page.fill("#api-key-input", "not-a-key");
    await page.click('button:has-text("Check key and continue")');
    checks.formatMessage = (await page.textContent("#api-key-msg")).trim();
    await page.fill("#api-key-input", MOCK_KEY);
    await shot(page, "04-key-dialog.png");
    await page.click('button:has-text("Check key and continue")');
    await page.waitForFunction(() => /401/.test(document.getElementById("api-key-msg")?.textContent || ""), null, { timeout: 8000 });
    checks.rejectMessage = (await page.textContent("#api-key-msg")).trim();
    checks.keyAfterReject = await page.evaluate((k) => sessionStorage.getItem(k), KEYS.apiKey);
    await page.click('button:has-text("Check key and continue")');
    await page.waitForSelector("#api-key-input", { state: "detached", timeout: 8000 });
    await page.waitForFunction(() => document.querySelectorAll('#console .entry[data-type="notice"]').length >= 2, null, { timeout: 5000 });
    checks.liveNotice = (await page.$$eval('#console .entry[data-type="notice"]', (els) => els.at(-1).textContent)).trim();
    checks.keySession = await page.evaluate((k) => sessionStorage.getItem(k), KEYS.apiKey);
    checks.keyInLocal = await page.evaluate(() => Object.keys(localStorage).some((k) => /sk-ant/.test(localStorage.getItem(k) || "")));
    checks.keyOnPage = await page.evaluate(() => document.body.innerText.includes("MOCKKEY"));
    // Change or forget the key from the mode choice.
    await page.click("#btn-start");
    await page.waitForSelector("#btn-manage-key", { timeout: 5000 });
    checks.maskedInFooter = (await page.textContent(".modal-foot .left")).replace(/\s+/g, " ").trim();
    await page.click("#btn-manage-key");
    await page.waitForSelector(".key-current", { timeout: 5000 });
    await page.click('button:has-text("Forget key")');
    checks.forgotMessage = (await page.textContent("#api-key-msg")).trim();
    checks.keyAfterForget = await page.evaluate((k) => sessionStorage.getItem(k), KEYS.apiKey);
    await page.keyboard.press("Escape");
    checks.requests = stand.seen;
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "modes-fail.png");
  }
  checks.keyInConsole = log.consoleAll.some((m) => m.includes("MOCKKEY"));
  await finish("modes: Simulation, Live and the key", t, checks, [
    [checks.runLabel === "Scenario 1: Express order for the flagship store at 02:00", "the mode choice names the scenario"],
    [/^Simulation chosen for scenario 1\. No run was started\. Shell preview \(v0\.1\.0\)/.test(checks.simNotice || ""), `the console says what happens (${checks.simNotice})`],
    [/Shell preview/.test(checks.banner || "") && checks.statusAfterSim === "Idle" && checks.badgeAfterSim === "No run active", "a banner, still idle, no run badge"],
    [checks.inputMasked && /does not look like an Anthropic API key/.test(checks.formatMessage || ""), "masked input, format check before any request"],
    [/rejected this key \(401\)/.test(checks.rejectMessage || "") && checks.keyAfterReject === null, "a rejected key is not stored"],
    [checks.keySession === MOCK_KEY && /Live agent chosen for scenario 1\. Your key is kept for this tab only \(rp\.anthropic\.key\); no model was called\./.test(checks.liveNotice || ""), "an accepted key is kept in session storage under rp."],
    [checks.keyInLocal === false && checks.keyOnPage === false && checks.keyInConsole === false, "the key never reaches local storage, the page text or the console"],
    [/sk-ant-…6789/.test(checks.maskedInFooter || ""), "the stored key is shown masked"],
    [/Key removed/.test(checks.forgotMessage || "") && checks.keyAfterForget === null, "Forget key removes it"],
    [(checks.requests || []).length === 2 && checks.requests.every((r) => /^GET \/v1\/models key=yes browser=true$/.test(r)), `only the free key check reached the API, with the browser header (${JSON.stringify(checks.requests)})`]
  ]);
}

// ---- diag: Diagnostics ---------------------------------------------------------------------------------
if (wanted("diag")) {
  const stand = anthropicStandIn();
  const t = await newPage({ anthropic: stand });
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await page.click("#btn-diagnostics");
    await page.waitForSelector(".diag-table", { timeout: 5000 });
    await page.click("#btn-run-tests");
    await page.waitForFunction(() => document.querySelectorAll('.diag-status[data-s="pass"]').length === 3, null, { timeout: 10000 });
    checks.rows = await page.$$eval(".diag-table tbody tr", (rows) => rows.map((r) => `${r.dataset.test}:${r.querySelector(".diag-status")?.dataset.s}`));
    checks.anthropic = (await page.textContent('tr[data-test="anthropic"] .detail')).trim();
    checks.privacy = (await page.textContent('tr[data-test="privacy"] .detail')).trim();
    checks.worldChecks = await page.$$eval(".world-checks li", (els) => els.length);
    checks.worldFails = await page.$$eval(".world-checks .mark-fail", (els) => els.length);
    checks.footer = await page.$eval(".modal-foot .left", (e) => e.textContent.trim());
    checks.requests = stand.seen;
    await shot(page, "05-diagnostics.png");
    checks.remembered = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) || "{}").anthropic?.status, KEYS.diagnostics);
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "diag-fail.png");
  }
  await finish("diag: Diagnostics", t, checks, [
    [JSON.stringify(checks.rows) === JSON.stringify(["anthropic:pass", "world:pass", "privacy:pass"]), `three rows pass (${JSON.stringify(checks.rows)})`],
    [/^Reachable; CORS accepted \(no key sent\)\./.test(checks.anthropic || ""), "the keyless probe reads the 401"],
    [/^Connections limited to api\.anthropic\.com, as configured; no key stored; audit export checked\.$/.test(checks.privacy || ""), `privacy row (${checks.privacy})`],
    [checks.worldChecks === 11 && checks.worldFails === 0, `11 world checks listed, none failing (${checks.worldChecks}, ${checks.worldFails})`],
    [/^Repack Pilot 0\.1\.0\./.test(checks.footer || ""), "the footer shows the version"],
    [(checks.requests || []).length === 1 && /^POST \/v1\/messages key=no browser=true$/.test(checks.requests[0]), `one keyless probe with the browser header (${JSON.stringify(checks.requests)})`],
    [checks.remembered === "pass", "the result is remembered for this session"]
  ]);
}

// ---- drawer: tabs and the audit export ------------------------------------------------------------------------
if (wanted("drawer")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    checks.tabs = await page.$$eval(".drawer-tab", (els) => els.map((e) => e.firstChild.textContent));
    checks.panels = {};
    for (const id of ["options", "outbox", "kpiboard", "assumptions"]) {
      await page.click(`#tab-${id}`);
      await page.waitForSelector(`#panel-${id}:not([hidden])`, { timeout: 3000 });
      checks.panels[id] = (await page.textContent(`#panel-${id} .empty strong`)).trim();
    }
    // One notice to audit: choose Simulation, then a key in this tab that must stay out of the export.
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector('#console .entry[data-type="notice"]', { timeout: 5000 });
    await page.evaluate(async (k) => (await import("./js/keystore.js")).setKey(k), MOCK_KEY);
    await page.click("#tab-audit");
    await page.waitForSelector("#panel-audit:not([hidden])");
    checks.auditCount = (await page.textContent("#tab-audit .count")).trim();
    checks.auditRows = await page.$$eval(".audit-table tbody tr", (els) => els.map((e) => e.dataset.type));
    await shot(page, "06-drawer-audit.png");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-audit")]);
    const text = await readFile(await download.path(), "utf8");
    const audit = JSON.parse(text);
    checks.file = download.suggestedFilename();
    checks.version = audit.app_version;
    checks.mode = audit.mode;
    checks.statement = audit.mode_statement;
    checks.notices = audit.counts?.notice;
    checks.noKey = !text.includes("MOCKKEY") && !/sk-ant-(?!\[REDACTED\])/.test(text);
    checks.simCell = audit.simulated_cell;
    await page.click(".drawer-end .btn");
    checks.closed = await page.getAttribute("#drawer", "data-open");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "drawer-fail.png");
  }
  await finish("drawer: tabs and the audit export", t, checks, [
    [JSON.stringify(checks.tabs) === JSON.stringify(["Options", "Outbox", "KPI board", "Assumptions", "Audit"]), "five tabs"],
    [JSON.stringify(checks.panels) === JSON.stringify({ options: "Options", outbox: "Outbox", kpiboard: "KPI board", assumptions: "Assumptions" }), "each tab says what it will hold"],
    [checks.auditCount === "1" && checks.auditRows?.join(",") === "notice", "the notice is in the audit"],
    [/^repack-pilot-\d+-audit\.json$/.test(checks.file || "") && checks.version === "0.1.0" && checks.mode === null && checks.statement === "No run recorded." && checks.notices === 1, `export: version, no mode, the notice (${checks.file})`],
    [checks.noKey && /simulated in both modes/.test(checks.simCell || ""), "export: no key; the simulated-cell statement"],
    [checks.closed === "false", "Hide closes the drawer"]
  ]);
}

// ---- viewports: layout from 1920×1080 down to 1280×720 ------------------------------------------------------
if (wanted("viewports")) {
  for (const [w, hgt] of VIEWPORTS) {
    for (const drawerOpen of [false, true]) {
      const t = await newPage({ viewport: { width: w, height: hgt } });
      const { page } = t;
      const checks = {};
      try {
        await boot(page);
        if (drawerOpen) { await page.click("#tab-audit"); await page.waitForTimeout(400); }
        await page.waitForTimeout(300);
        Object.assign(checks, await page.evaluate(() => {
          const r = (el) => el.getBoundingClientRect();
          const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
          const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
          const controls = [...document.getElementById("controls").children].filter((e) => e.offsetParent !== null && !e.classList.contains("spacer"));
          const first = r(controls[0]);
          const oneRow = controls.every((e) => { const b = r(e); return b.top < first.bottom && b.bottom > first.top; });
          const badges = [...document.querySelectorAll(".header-badges > *")].filter((e) => e.offsetParent !== null).map(r);
          const badgesClear = badges.every((a, i) => badges.every((b, j) => i === j || !overlap(a, b)));
          const panel = r(document.querySelector(".cell-panel"));
          const caption = r(document.querySelector(".cell-caption"));
          const tag = r(document.querySelector(".sim-cell-tag"));
          const cardEl = document.querySelector(".cell-empty");
          const card = r(cardEl);
          const targets = [...document.querySelectorAll("button, a[href]")].filter((e) => e.offsetParent !== null && getComputedStyle(e).visibility !== "hidden")
            .filter((e) => { const b = r(e); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight; })
            .filter((e) => !e.closest(".skip-link"))
            .filter((e) => { const b = r(e); return b.width < 40 || b.height < 40; }).map((e) => e.textContent.trim() || e.getAttribute("aria-label"));
          return {
            hOverflow: document.documentElement.scrollWidth > innerWidth,
            oneRow,
            badgesClear,
            headerHeight: Math.round(r(document.querySelector(".app-header")).height),
            captionInside: inside(caption, panel), tagInside: inside(tag, panel), cardInside: inside(card, panel),
            captionTagClear: !overlap(caption, tag), cardClear: !overlap(card, caption) && !overlap(card, tag),
            cardFits: cardEl.scrollHeight <= cardEl.clientHeight + 1,
            syntheticVisible: [...cardEl.querySelectorAll('.chip[data-tone="synthetic"]')].some((c) => c.offsetParent !== null && inside(r(c), card)),
            smallTargets: targets
          };
        }));
        if (!drawerOpen && (w === 1920 || w === 1280)) await shot(page, `07-layout-${w}x${hgt}.png`);
        if (drawerOpen && w === 1280) await shot(page, `08-layout-${w}x${hgt}-drawer.png`);
      } catch (err) {
        checks.FAILED = String(err.message).split("\n")[0];
      }
      await finish(`viewports: ${w}×${hgt}${drawerOpen ? ", drawer open" : ""}`, t, checks, [
        [checks.hOverflow === false, "no horizontal overflow"],
        [checks.oneRow, "one-row control bar"],
        [checks.badgesClear, "header badges clear of each other"],
        [checks.headerHeight <= 96, `header height ${checks.headerHeight}px`],
        [checks.captionInside && checks.tagInside && checks.cardInside, "caption, tag and overview inside the cell panel"],
        [checks.captionTagClear && checks.cardClear, "caption, tag and overview clear of each other"],
        [checks.cardFits && checks.syntheticVisible, "the overview fits without scrolling, its Synthetic label in view"],
        [(checks.smallTargets || []).length === 0, `controls at least 40 px (${JSON.stringify(checks.smallTargets)})`]
      ]);
    }
  }
}

// ---- contrast: every visible text meets its WCAG 2.2 contrast duty ---------------------------------------------
// Measured in the running page, against the nearest opaque background (semi-transparent layers blended),
// with the element's opacity applied. Normal text needs 4.5:1, large text (24 px, or 18.66 px bold) 3:1
// (WCAG 1.4.3). Inactive controls have no duty. With a dialog open, only the dialog is measured.
/** { measured: text elements in view, below: those below their duty [{ text, ratio, need, color, bg }] }. */
const contrastShortfalls = (page) => page.evaluate(() => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const background = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    return layers.reduceRight((bg, layer) => over(layer, bg), { r: 255, g: 255, b: 255, a: 1 });
  };
  const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  const scope = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
  const out = [];
  let measured = 0;
  const seen = new Set();
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || seen.has(el) || el instanceof SVGElement) continue;
    seen.add(el);
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0 || box.bottom <= 0 || box.right <= 0 || box.top >= innerHeight || box.left >= innerWidth) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible" || el.closest('[hidden], [aria-hidden="true"], [disabled], [aria-disabled="true"]')) continue;
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    if (opacity === 0) continue;
    const bg = background(el);
    const ink = parse(cs.color);
    const fg = over({ ...ink, a: ink.a * opacity }, bg);
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    measured += 1;
    const size = parseFloat(cs.fontSize);
    const need = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66) ? 3 : 4.5;
    if (ratio < need) out.push({ text: n.textContent.trim().slice(0, 40), ratio: Math.round(ratio * 100) / 100, need, color: cs.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})` });
  }
  return { measured, below: out };
});

if (wanted("contrast")) {
  for (const [w, hgt] of [[1920, 1080], [1280, 720]]) {
    const t = await newPage({ intro: true, viewport: { width: w, height: hgt }, anthropic: anthropicStandIn() });
    const { page } = t;
    const checks = { states: {} };
    const measure = async (state) => { await settle(page); checks.states[state] = await contrastShortfalls(page); };
    try {
      await boot(page);
      await page.waitForSelector(".intro-modal", { timeout: 5000 });
      await page.waitForTimeout(300);
      await measure("intro");
      await page.keyboard.press("Escape");
      await page.waitForSelector(".intro-modal", { state: "detached", timeout: 3000 });
      await page.waitForSelector("#boot", { state: "detached", timeout: 5000 });
      await measure("idle");
      await page.click("#btn-diagnostics");
      await page.click("#btn-run-tests");
      await page.waitForFunction(() => document.querySelectorAll('.diag-status[data-s="pass"]').length === 3, null, { timeout: 15000 });
      await measure("diagnostics");
      await page.keyboard.press("Escape");
      for (const tab of ["options", "outbox", "kpiboard", "assumptions", "audit"]) {
        await page.click(`#tab-${tab}`);
        await page.waitForTimeout(150);
        await measure(`drawer ${tab}`);
      }
      await page.click(".drawer-end .btn");
      await page.click("#btn-start");
      await page.waitForSelector(".mode-card", { timeout: 5000 });
      await measure("mode choice");
      await page.click('.mode-card[data-mode="live"] .mode-cta button');
      await page.waitForSelector("#api-key-input", { timeout: 5000 });
      await page.fill("#api-key-input", "not-a-key");
      await page.click('button:has-text("Check key and continue")');
      await measure("key dialog with its message");
      await page.keyboard.press("Escape");
      await page.click("#btn-start");
      await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
      await page.waitForSelector(".banner", { timeout: 5000 });
      await measure("notice and banner");
      // Control: faint text on the app background (porcelain) measures 4.44:1, a known gap in the
      // shared palette (Rebate Hunter REVIEW W9). The measure has to catch it.
      await page.click(".banner .btn, .banner button").catch(() => {});
      checks.control = await page.evaluate(() => {
        const probe = document.createElement("p");
        probe.textContent = "Contrast control";
        Object.assign(probe.style, { position: "fixed", left: "0", top: "0", margin: "0", padding: "4px", fontSize: "14px", fontWeight: "400", color: "var(--text-faint)", background: "var(--porcelain)", zIndex: "9999" });
        document.body.append(probe);
        return probe.getBoundingClientRect().width > 0;
      });
      checks.controlFound = (await contrastShortfalls(page)).below.filter((s) => s.text === "Contrast control");
    } catch (err) {
      checks.FAILED = String(err.message).split("\n")[0];
      await shot(page, `contrast-fail-${w}.png`);
    }
    const below = Object.entries(checks.states).flatMap(([state, r]) => r.below.map((s) => `${state}: "${s.text}" ${s.ratio}:1 (needs ${s.need}) ${s.color} on ${s.bg}`));
    const thin = Object.entries(checks.states).filter(([, r]) => r.measured < 5).map(([state, r]) => `${state} (${r.measured})`);
    await finish(`contrast: every visible text meets its duty at ${w}×${hgt}`, t, checks, [
      [Object.keys(checks.states).length === 11 && thin.length === 0, `eleven states, each with at least five text elements measured (${Object.entries(checks.states).map(([k, r]) => `${k} ${r.measured}`).join(", ")})`],
      [below.length === 0, `text below its duty: ${JSON.stringify(below)}`],
      [checks.control && checks.controlFound?.length === 1 && checks.controlFound[0].ratio === 4.44, `the control is caught at 4.44:1 (${JSON.stringify(checks.controlFound)})`]
    ]);
  }
}

// ---- csp: the policy blocks any other host ------------------------------------------------------------------
if (wanted("csp")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    checks.result = await page.evaluate(() => fetch("https://example.com/").then(() => "fetched", (e) => String(e)));
    await page.waitForTimeout(200);
    checks.csp = await page.evaluate(() => window.__csp.slice());
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
  }
  await finish("csp: connections to any other host are blocked", t, checks, [
    [/Failed to fetch/.test(checks.result || ""), "the fetch fails"],
    [(checks.csp || []).some((c) => /^connect-src https:\/\/example\.com/.test(c)), `the page's policy reported it (${JSON.stringify(checks.csp)})`]
  ], { allowCsp: /^connect-src https:\/\/example\.com/, allowConsole: /Content Security Policy|example\.com/ });
}

// ---- file: opened from disk ----------------------------------------------------------------------------------
if (wanted("file")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await page.goto(`file://${APP_ROOT}/index.html`);
    await page.waitForTimeout(7000);
    checks.bootPresent = (await page.$("#boot")) !== null;
    checks.helpVisible = await page.evaluate(() => getComputedStyle(document.querySelector(".boot-help")).visibility === "visible");
    await shot(page, "09-file-protocol.png");
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  await finish("file: the page explains how to start a server", t, checks, [[checks.bootPresent && checks.helpVisible, "boot help visible"]], { allowConsole: /blocked by CORS policy|Cross origin requests/ });
}

// ---- missing-data: a data file did not deploy ---------------------------------------------------------------
if (wanted("missing-data")) {
  blockLocal.add("/data/shadow_record.js");
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await page.goto(BASE);
    await page.waitForSelector('#boot[data-state="failed"]', { timeout: 15000 });
    checks.detail = (await page.textContent("#boot-detail")).trim();
    await shot(page, "10-missing-data.png");
  } catch (err) { checks.FAILED = String(err.message).split("\n")[0]; }
  blockLocal.delete("/data/shadow_record.js");
  await finish("missing-data: the boot screen names the file", t, checks, [[/data\/shadow_record\.js/.test(checks.detail || ""), "missing file named"]], { allowConsole: /Start-up failed/ });
}

await browser.close();
await close();
await writeFile(path.join(OUT, "smoke-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const p of r.problems) console.log(`      - ${p}`);
  if (r.pageErrors.length || r.consoleErrors.length || r.csp.length) console.log(`      errors: ${JSON.stringify({ page: r.pageErrors, console: r.consoleErrors, csp: r.csp }).slice(0, 400)}`);
}
const okCount = results.filter((r) => r.ok).length;
console.log(`\n${okCount}/${results.length} smoke cases passed. Screenshots: ${OUT}`);
process.exit(results.length > 0 && okCount === results.length ? 0 : 1);
