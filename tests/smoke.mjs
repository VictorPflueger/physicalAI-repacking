// Smoke tests of the workspace, the agent's runs and the failure modes of loading:
//   boot          the idle workspace: disclosure, badge, fonts, the Simulated cell tag, the board at 22:00
//                 (twelve store lanes with their cut-offs, five stations, the world model's Synthetic
//                 label), the header tiles at the manual baseline, six scenarios, no external request,
//                 storage keys under rp.
//   intro         first visit opens the intro window (five steps, three value points, what is real);
//                 "How it works" reopens it; its Start agent leads to the mode choice
//   modes         Start agent → Simulation → the scripted replay starts (status, badge, the console's run
//                 line, the watermark) → Abort; scenario 2 → a night preview (no script yet, with its
//                 note); Start agent → Live → key dialog (401, then accepted) → the live agent starts (the
//                 Messages API stand-in holds the call) → key kept in this tab's session storage only,
//                 never in local storage or the console; change or forget the key
//   diag          Diagnostics: Anthropic (keyless 401 from a stand-in), world (14 checks), simulation
//                 scripts (scenario 1 valid, five pending), Open Food Facts (live reads off) and privacy
//   drawer        five tabs with their content; a scripted night stopped by Abort, then the audit export:
//                 version, mode "simulation", the chosen mode, the night's hash, a partial unit log instead
//                 of the ordinary units' events, the agent's tool calls, no key
//   night         scenario 1's scripted replay to night end at ×4, ×2 and ×1, with option B approved and
//                 its drafts: every lane's dispatch state, the orders-on-time tile, the KPI board's Tonight
//                 column and the night report equal the replay computed headless in Node; the night clock
//                 moves at about 6 simulated minutes per second per speed step
//   board         the cell board by keyboard and mouse: every station, lane and the world model are
//                 buttons of at least 44 px in the Tab order; Enter opens a popover named for the entity,
//                 Escape closes it and gives the focus back; a popover follows the night; reduced motion
//                 stops every animation
//   kpi           the KPI board at the brief's defaults (G1, break-even, the annual figure with the cells
//                 it needs, the demo cell, sources on every row, no payback claim); p = 0.70 in the
//                 Assumptions tab gives G2 and lands in the audit; an out-of-range value is refused; Reset
//   world         scenario 2: the scale writes the glass jar back once (22:17, 200 g → 400 g) in the
//                 console, the corrections log and the item's popover; the audit holds that one
//                 correction and no tote over 15 kg
//   contrast      every visible text in seventeen states (intro, idle, Diagnostics, five drawer tabs, mode
//                 choice, key dialog, banners of each level, the running replay, the replay with the
//                 drawer open, the options, the drafts with the console's notice, the night's end with the
//                 summary card and run facts, the management summary) meets its WCAG contrast duty; a
//                 control is caught
//   csp           the page's policy blocks a connection to any other host
//   file          opened from file://: the page explains how to start a server
//   missing-data  a data file is missing: the boot screen names it
// The layout at five sizes is the layout suite's (tests/layout.mjs). No case calls a real API:
// api.anthropic.com is answered by a stand-in, every other host is blocked.
// Usage: node tests/smoke.mjs [case…]
import path from "node:path";
import vm from "node:vm";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { APP_ROOT, outDir, wanted, launchBrowser, serveStatic, NETWORK_NOISE, MOCK_KEY, SKIP_INTRO, KEYS } from "./lib/harness.mjs";
import { contrastShortfalls } from "./lib/contrast.mjs";

// The night simulation, the engine and the formatting, in Node: what the screen must show.
const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);
const NS = await mod("js/nightsim.js");
const E = await mod("js/engine.js");
const F = await mod("js/format.js");
const { APP } = await mod("js/config.js");
const { replayScenario1 } = await mod("tests/lib/scenario1.mjs");
// Scenario 1's scripted replay with option B approved, headless in Node: what the screen must show.
const SC1_B = await replayScenario1({ option: "B" });
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ["data/world.js", "data/scenarios.js"]) vm.runInContext(await readFile(path.join(APP_ROOT, f), "utf8"), sandbox, { filename: f });
const { WORLD, SCENARIOS } = sandbox.window;
/** Tonight as the simulation computes it for a scenario at the brief's defaults. */
function expected(id) {
  const sc = SCENARIOS.find((x) => x.id === id);
  const night = NS.buildNight(WORLD, sc.night);
  const res = NS.runNight(night, { seed: sc.night.seed });
  return { sc, night, res, fig: NS.tonightFigures(night, res), info: NS.nightInfo(night, { seed: sc.night.seed }) };
}

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
      // Without a key: the keyless probe's 401. With a key: a live run's first call, held unanswered so
      // the run stays live until the test stops it (no model is called in this suite).
      if (!req.headers()["x-api-key"]) return route.fulfill({ status: 401, headers: cors, body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "x-api-key header is required" } }) });
      return undefined;
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
/** Starts a night preview: scenario, speed, Start agent, the mode card. */
async function startNight(page, { scenario = null, speed = 4, mode = "simulation" } = {}) {
  if (scenario) { await page.click("#dd-scenario"); await page.click(`.menu-item[data-id="${scenario}"]`); }
  await page.click(`button[aria-label="Night speed ×${speed}"]`);
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card", { timeout: 5000 });
  await page.click(`.mode-card[data-mode="${mode}"] .mode-cta button`);
  await page.waitForSelector('.cell-board[data-state="running"]', { timeout: 5000 });
}
/**
 * Takes the decisions of a scripted run as they come: approves an option once the options are on screen,
 * then every draft in the Outbox. Resolves when the run is Done.
 */
async function decideAndFinish(page, { option = "B", timeout = 300000 } = {}) {
  await page.waitForSelector(`.option-card[data-id="${option}"] .btn-approve`, { timeout });
  await page.click(`.option-card[data-id="${option}"] .btn-approve`);
  await page.waitForSelector("#btn-approve-all", { timeout: 60000 });
  await page.click("#btn-approve-all");
  await waitStatus(page, "Done", timeout);
}
const statusText = (page) => page.textContent(".status-pill .text").then((t) => t.trim());
/** Waits for a run state in the status pill, then two frames: the pill changes at once, the board on its next frame. */
const waitStatus = async (page, text, timeout = 240000) => {
  await page.waitForFunction((t) => document.querySelector(".status-pill .text")?.textContent.trim() === t, text, { timeout });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
const dismissBanners = (page) => page.$$eval(".banner", (els) => els.forEach((e) => e.remove()));
/** The KPI board's rows as { figure: [plan, tonight, "KEY KEY"] } (the basis as its source keys). */
const kpiRows = (page) => page.$$eval(".kb-table tbody tr", (rows) => Object.fromEntries(rows.map((r) => {
  const [plan, tonight, basis] = [...r.querySelectorAll("td")];
  return [r.querySelector("th").textContent.trim(), [plan.textContent.replace(/\s+/g, " ").trim(), tonight.textContent.replace(/\s+/g, " ").trim(), [...basis.querySelectorAll(".kb-key")].map((k) => k.textContent).join(" ")]];
})));
const storageKeys = (page) => page.evaluate(() => ({
  local: Object.keys(localStorage), session: Object.keys(sessionStorage)
}));

// ---- boot: the idle workspace ------------------------------------------------------------------------
if (wanted("boot")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  const want = expected("SC1-EXPRESS");
  const waiting = want.info.waves.filter((w) => w.at_ms <= 0).reduce((n, w) => n + w.manual_units, 0);
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
    checks.synthetic = await page.$$eval(".world-card .chip, .wm-chip .chip", (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim()));
    checks.lanes = await page.$$eval(".lane", (els) => els.map((e) => `${e.querySelector(".lane-name").textContent} ${e.querySelector(".lane-cut").textContent}`));
    checks.stations = await page.$$eval(".station .st-label", (els) => els.map((e) => e.textContent));
    checks.manual = (await page.textContent('.station[data-station="manual"] .st-l1')).trim();
    checks.clock = (await page.textContent(".cell-clock")).trim();
    checks.tiles = await page.$$eval(".kpi", (els) => els.map((e) => `${e.querySelector(".kpi-value").textContent} | ${e.querySelector(".kpi-sub").textContent}`));
    checks.subtitle = (await page.textContent(".cell-sub")).trim();
    await page.click("#dd-scenario");
    checks.scenarios = await page.$$eval("#dd-scenario + .dropdown-menu .menu-item", (els) => els.map((e) => `${e.querySelector(".num-badge")?.textContent} ${e.querySelector(".menu-title")?.textContent}`));
    await page.click('.menu-item[data-id="SC4-WEAR"]');
    checks.scenarioLabel = (await page.textContent("#dd-scenario .value")).trim();
    checks.subtitleAfter = (await page.textContent(".cell-sub")).trim();
    await page.click("#dd-scenario");
    await page.click('.menu-item[data-id="SC5-EARLY"]');
    checks.subtitleSc5 = (await page.textContent(".cell-sub")).trim();
    checks.soeSc5 = (await page.textContent('.lane[data-order="SOE"] .lane-cut')).trim();
    checks.rail = await page.$$eval(".rail-step", (els) => els.map((e) => e.dataset.step).join(","));
    checks.status = await statusText(page);
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
  const stores = WORLD.stores.map((x) => `${x.name} ${x.cutoff}`);
  await finish("boot: the idle workspace", t, checks, [
    [checks.bootRemoved, "boot screen removed"],
    [checks.badge === "No run active", "idle badge"],
    [checks.disclosureVisible && /You are interacting with an AI system/.test(checks.disclosure || ""), "AI disclosure visible"],
    [["Barlow", "Barlow Semi Condensed"].every((f) => (checks.fontsLoaded || []).includes(f)), `self-hosted fonts loaded (${(checks.fontsLoaded || []).join(", ")})`],
    [checks.cellTagVisible && checks.cellTag === "Simulated cell", "the neutral Simulated cell tag"],
    [JSON.stringify(checks.synthetic) === JSON.stringify(["Synthetic"]), `the world model says Synthetic (${JSON.stringify(checks.synthetic)})`],
    [JSON.stringify(checks.lanes) === JSON.stringify(stores) && stores.length === 12, `twelve store lanes with the world's cut-offs (${JSON.stringify(checks.lanes)})`],
    [JSON.stringify(checks.stations) === JSON.stringify(["Inbound pallet", "Camera", "Robot cell", "Scale", "Manual station"]), `five stations (${JSON.stringify(checks.stations)})`],
    [checks.manual === `${F.int(waiting)} waiting · 0 picked` && checks.clock === "22:00", `the manual station at 22:00: ${checks.manual}, clock ${checks.clock}`],
    [JSON.stringify(checks.tiles) === JSON.stringify(["2.5 h · €89.50 | manual baseline (engine)", "— | once the night runs", "22:00 | 22:00 to 06:00", "€0.00 | no model calls"]), `header tiles at the manual baseline (${JSON.stringify(checks.tiles)})`],
    [checks.scenarios?.length === 6 && checks.scenarios[0] === "1 Express order for the flagship store at 02:00", `six scenarios (${JSON.stringify(checks.scenarios)})`],
    [checks.scenarioLabel === "Gripper wear" && /Scenario 4: Gripper wear/.test(checks.subtitleAfter || ""), "choosing a scenario updates the bar and the panel"],
    [/^Night of Wed 23 to Thu 24 Dec 2026 · 22:00–06:00 · Scenario 5/.test(checks.subtitleSc5 || "") && checks.soeSc5 === "01:30", `scenario 5's night and Soest's earlier cut-off (${checks.subtitleSc5}; ${checks.soeSc5})`],
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
    checks.noteForScripted = await page.$(".stage-note");
    await shot(page, "03-mode-choice.png");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector('#console .entry[data-type="run"]', { timeout: 5000 });
    checks.simRunLine = (await page.$eval('#console .entry[data-type="run"] .entry-body', (e) => e.innerText)).replace(/\s+/g, " ").trim();
    checks.watermark = await page.isVisible("#console .sim-watermark");
    await page.waitForFunction(() => document.querySelector(".status-pill .text")?.textContent.trim() === "Perceiving", null, { timeout: 5000 });
    checks.statusAfterSim = await statusText(page);
    checks.badgeAfterSim = (await page.textContent("#mode-badge")).trim();
    checks.boardRunning = await page.getAttribute(".cell-board", "data-state");
    checks.startLocked = await page.getAttribute("#btn-start", "aria-disabled");
    await page.click("#btn-abort");
    await waitStatus(page, "Aborted", 5000);
    checks.abortLine = (await page.$$eval("#console .entry .entry-body", (els) => els.at(-1).querySelector("span")?.textContent || "")).trim();
    checks.abortFacts = (await page.$$eval("#console .entry .entry-body", (els) => els.at(-1).querySelector(".run-facts")?.textContent || "")).trim();
    // A scenario without a scripted replay yet plays its night without the agent, and says so first.
    await page.click("#dd-scenario");
    await page.click('.menu-item[data-id="SC2-GLASS"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.previewNote = (await page.textContent(".stage-note")).trim();
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForFunction(() => document.querySelector(".status-pill .text")?.textContent.trim() === "Night preview", null, { timeout: 5000 });
    checks.previewBadge = (await page.textContent("#mode-badge")).trim();
    checks.previewNotice = (await page.$$eval('#console .entry[data-type="notice"] .entry-body', (els) => els.map((e) => e.textContent.trim()).find((x) => /^No scripted replay/.test(x)) || ""));
    await page.click("#btn-abort");
    await waitStatus(page, "Aborted", 5000);
    await page.click("#dd-scenario");
    await page.click('.menu-item[data-id="SC1-EXPRESS"]');
    // Live: the key dialog, then the live agent on that key.
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
    await page.waitForSelector('.cell-board[data-state="running"]', { timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll(".entry[data-type='run']").length === 1 && /Live agent on/.test(document.querySelector(".entry[data-type='run']").textContent), null, { timeout: 5000 });
    checks.liveRunLine = (await page.$eval('#console .entry[data-type="run"] .entry-body', (e) => e.innerText)).replace(/\s+/g, " ").trim();
    checks.liveBadge = (await page.textContent("#mode-badge")).trim();
    // The run's first model call has gone out (and is held by the stand-in).
    await page.waitForFunction(() => document.querySelector(".status-pill .text")?.textContent.trim() === "Perceiving", null, { timeout: 5000 });
    await page.waitForTimeout(500);
    checks.keySession = await page.evaluate((k) => sessionStorage.getItem(k), KEYS.apiKey);
    checks.keyInLocal = await page.evaluate(() => Object.keys(localStorage).some((k) => /sk-ant/.test(localStorage.getItem(k) || "")));
    checks.keyOnPage = await page.evaluate(() => document.body.innerText.includes("MOCKKEY"));
    await page.click("#btn-abort");
    await waitStatus(page, "Aborted", 5000);
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
  const live = (checks.requests || []).filter((r) => /^POST \/v1\/messages/.test(r));
  await finish("modes: Simulation, a night preview, Live and the key", t, checks, [
    [checks.runLabel === "Scenario 1: Express order for the flagship store at 02:00" && checks.noteForScripted === null, "the mode choice names the scenario; a scripted scenario needs no note"],
    [/^Scenario 1: Express order for the flagship store at 02:00 Simulation: scripted replay through the agent's own tools/.test(checks.simRunLine || "") && checks.watermark, `the console says what runs and shows the SIMULATION watermark (${checks.simRunLine})`],
    [checks.statusAfterSim === "Perceiving" && checks.badgeAfterSim === "SIMULATION", `the replay's status and badge (${checks.statusAfterSim}, ${checks.badgeAfterSim})`],
    [checks.boardRunning === "running" && checks.startLocked === "true", "the night runs on the board; Start is locked"],
    [/^Run aborted\. Stopped by the user\.$/.test(checks.abortLine || "") && /^Replay facts: .*; 1 wake-up; .*; no cost \(simulated\)\.$/.test(checks.abortFacts || ""), `Abort stops the run and says how far it got (${checks.abortLine} | ${checks.abortFacts})`],
    [/^This scenario has no scripted replay yet \(M4\)/.test(checks.previewNote || "") && checks.previewBadge === "NIGHT PREVIEW" && /^No scripted replay for scenario 2 yet/.test(checks.previewNotice || ""), `a scenario without a script plays as a night preview, and says so (${checks.previewNote} | ${checks.previewNotice})`],
    [checks.inputMasked && /does not look like an Anthropic API key/.test(checks.formatMessage || ""), "masked input, format check before any request"],
    [/rejected this key \(401\)/.test(checks.rejectMessage || "") && checks.keyAfterReject === null, "a rejected key is not stored"],
    [checks.keySession === MOCK_KEY && /Live agent on Sonnet 5\.5/.test(checks.liveRunLine || "") && checks.liveBadge === "LIVE", `an accepted key is kept in session storage under rp.; the live agent starts (${checks.liveRunLine})`],
    [checks.keyInLocal === false && checks.keyOnPage === false && checks.keyInConsole === false, "the key never reaches local storage, the page text or the console"],
    [/sk-ant-…6789/.test(checks.maskedInFooter || ""), "the stored key is shown masked"],
    [/Key removed/.test(checks.forgotMessage || "") && checks.keyAfterForget === null, "Forget key removes it"],
    [(checks.requests || []).filter((r) => /^GET \/v1\/models key=yes browser=true$/.test(r)).length === 2 && live.length === 1 && /key=yes browser=true$/.test(live[0]) && checks.requests.length === 3, `the key checks and the live run's first call, with the key and the browser header (${JSON.stringify(checks.requests)})`]
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
    await page.waitForFunction(() => document.querySelectorAll('.diag-status[data-s="pass"]').length === 4 && !document.querySelector('.diag-status[data-s="running"]'), null, { timeout: 30000 });
    checks.rows = await page.$$eval(".diag-table tbody tr", (rows) => rows.map((r) => `${r.dataset.test}:${r.querySelector(".diag-status")?.dataset.s}`));
    checks.anthropic = (await page.textContent('tr[data-test="anthropic"] .detail')).trim();
    checks.scripts = (await page.textContent('tr[data-test="scripts"] .detail')).trim();
    checks.off = (await page.textContent('tr[data-test="openfoodfacts"] .detail')).trim();
    checks.privacy = (await page.textContent('tr[data-test="privacy"] .detail')).trim();
    checks.worldChecks = await page.$$eval(".world-checks:not(.script-checks) li", (els) => els.length);
    checks.worldFails = await page.$$eval(".world-checks .mark-fail", (els) => els.length);
    checks.scriptRows = await page.$$eval(".script-checks li", (els) => els.map((e) => `${e.dataset.pending === "true" ? "pending" : e.querySelector(".mark-pass") ? "pass" : "fail"}`));
    checks.footer = await page.$eval(".modal-foot .left", (e) => e.textContent.trim());
    checks.requests = stand.seen;
    await shot(page, "05-diagnostics.png");
    checks.remembered = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) || "{}").anthropic?.status, KEYS.diagnostics);
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "diag-fail.png");
  }
  await finish("diag: Diagnostics", t, checks, [
    [JSON.stringify(checks.rows) === JSON.stringify(["anthropic:pass", "world:pass", "scripts:pass", "openfoodfacts:skip", "privacy:pass"]), `four rows pass, Open Food Facts is skipped (${JSON.stringify(checks.rows)})`],
    [/^Reachable; CORS accepted \(no key sent\)\./.test(checks.anthropic || ""), "the keyless probe reads the 401"],
    [checks.scripts === "1 script valid on every decision path; 5 scenarios without a script yet (M4)." && JSON.stringify(checks.scriptRows) === JSON.stringify(["pass", "pending", "pending", "pending", "pending", "pending"]), `the script row (${checks.scripts}; ${JSON.stringify(checks.scriptRows)})`],
    [/^Live reads are off in this build .* No request is sent\.$/.test(checks.off || ""), `the Open Food Facts row (${checks.off})`],
    [/^Connections limited to api\.anthropic\.com, as configured; no key stored; audit export checked\.$/.test(checks.privacy || ""), `privacy row (${checks.privacy})`],
    [checks.worldChecks === 14 && checks.worldFails === 0, `14 world checks listed, none failing (${checks.worldChecks}, ${checks.worldFails})`],
    [new RegExp(`^Repack Pilot ${APP.version.replace(/\./g, "\\.")}\\.`).test(checks.footer || "") && APP.version === "0.3.0", `the footer shows the version (${checks.footer})`],
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
    for (const [id, sel] of [["options", ".empty strong"], ["outbox", ".empty strong"], ["kpiboard", ".kb-head h3"], ["assumptions", ".as-head h3"]]) {
      await page.click(`#tab-${id}`);
      await page.waitForSelector(`#panel-${id}:not([hidden])`, { timeout: 3000 });
      checks.panels[id] = (await page.textContent(`#panel-${id} ${sel}`)).trim();
    }
    await page.click(".drawer-end .btn");
    // A night stopped by Abort, with a key in this tab that must stay out of the export.
    await startNight(page, { speed: 4 });
    await page.evaluate(async (k) => (await import("./js/keystore.js")).setKey(k), MOCK_KEY);
    await page.waitForFunction(() => document.querySelector(".cell-clock")?.textContent >= "23:00", null, { timeout: 60000 });
    await page.click("#btn-abort");
    await waitStatus(page, "Aborted", 5000);
    await page.click("#tab-audit");
    await page.waitForSelector("#panel-audit:not([hidden])");
    checks.auditCount = Number((await page.textContent("#tab-audit .count")).trim());
    checks.auditTypes = [...new Set(await page.$$eval(".audit-table tbody tr", (els) => els.map((e) => e.dataset.type)))];
    await shot(page, "06-drawer-audit.png");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-audit")]);
    const text = await readFile(await download.path(), "utf8");
    const audit = JSON.parse(text);
    checks.file = download.suggestedFilename();
    checks.version = audit.app_version;
    checks.mode = audit.mode;
    checks.statement = audit.mode_statement;
    checks.chosen = audit.run?.chosen_mode;
    checks.hash = audit.run?.night_hash;
    checks.status = audit.run?.status;
    checks.notices = audit.counts?.notice;
    const ev = audit.events || [];
    checks.unitLog = ev.filter((e) => e.type === "unit_log").map((e) => ({ partial: e.payload.partial, until: e.payload.until, rows: e.payload.rows.length }));
    checks.fine = ev.filter((e) => (e.type === "grasp_attempt" && e.payload.ok) || (e.type === "detection" && e.payload.known) || e.type === "clock" || (e.type === "tote_update" && e.payload.status !== "closed")).length;
    checks.failedGrasps = ev.filter((e) => e.type === "grasp_attempt" && !e.payload.ok).length;
    checks.tools = [...new Set(ev.filter((e) => e.type === "tool_call").map((e) => e.payload.name))];
    checks.narration = ev.filter((e) => e.type === "narration").length;
    checks.partialNarration = ev.filter((e) => e.type === "narration" && !e.payload.done).length;
    checks.noKey = !text.includes("MOCKKEY") && !/sk-ant-(?!\[REDACTED\])/.test(text);
    checks.simCell = audit.simulated_cell;
    await page.click(".drawer-end .btn");
    checks.closed = await page.getAttribute("#drawer", "data-open");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "drawer-fail.png");
  }
  const want = ["run_start", "state_change", "night_plan", "projection", "wake", "world_model_correction", "escalation", "grasp_attempt", "tool_call", "tool_result", "narration", "plan_update", "unit_log", "run_end"];
  await finish("drawer: tabs and the audit export", t, checks, [
    [JSON.stringify(checks.tabs) === JSON.stringify(["Options", "Outbox", "KPI board", "Assumptions", "Audit"]), "five tabs"],
    [JSON.stringify(checks.panels) === JSON.stringify({ options: "No options yet", outbox: "Nothing drafted yet", kpiboard: "Plan and tonight", assumptions: "Assumptions" }), `each tab with its content (${JSON.stringify(checks.panels)})`],
    [checks.auditCount > 20 && want.every((x) => (checks.auditTypes || []).includes(x)), `the audit holds the night and the agent's turns (${checks.auditCount}: ${JSON.stringify(checks.auditTypes)})`],
    [/^run-\d{8}-\d{4}-[a-z0-9]{4}-SIMULATION-audit\.json$/.test(checks.file || "") && checks.version === APP.version && checks.mode === "simulation" && /^SIMULATION: scripted replay/.test(checks.statement || ""), `export: version, mode and statement (${checks.file}, ${checks.mode})`],
    [checks.chosen === "simulation" && /^[0-9a-f]{16}$/.test(checks.hash || "") && checks.status === "aborted", `export: the chosen mode, the night's hash, the status (${checks.chosen}, ${checks.hash}, ${checks.status})`],
    [["wms_get_night", "sim_plan_night", "sim_project", "sim_advance", "world_get_item", "cell_get_grasp_plan", "wms_get_order", "wms_rebalance_tote"].every((n) => (checks.tools || []).includes(n)) && checks.narration > 3 && checks.partialNarration === 0, `export: the agent's tool calls and finished narration only (${JSON.stringify(checks.tools)}, ${checks.narration} narration, ${checks.partialNarration} partial)`],
    [checks.unitLog?.length === 1 && checks.unitLog[0].partial === true && checks.unitLog[0].rows > 100, `a partial unit log (${JSON.stringify(checks.unitLog)})`],
    [checks.fine === 0 && checks.failedGrasps > 0, `ordinary units stay in the unit log, failed grasps are events (${checks.fine} ordinary, ${checks.failedGrasps} failed)`],
    [checks.noKey && /simulated in both modes/.test(checks.simCell || ""), "export: no key; the simulated-cell statement"],
    [checks.closed === "false", "Hide closes the drawer"]
  ]);
}

// ---- night: scenario 1 to night end at ×4, ×2 and ×1 ------------------------------------------------------
if (wanted("night")) {
  const t = await newPage();
  const { page } = t;
  const checks = { speeds: {} };
  // The night of scenario 1's scripted replay with option B approved, computed headless in Node.
  const res = SC1_B.replay.session.run;
  const f = SC1_B.replay.session.figures();
  const states = Object.fromEntries(res.orders.map((o) => [o.id, o.on_time ? "dispatched" : "late"]));
  const onTime = res.orders.filter((o) => o.on_time).length;
  const late = res.orders.filter((o) => !o.on_time).map((o) => o.name);
  try {
    await boot(page);
    for (const speed of [4, 2, 1]) {
      const c = {};
      const started = Date.now();
      await startNight(page, { speed });
      await dismissBanners(page);
      // The night clock against real time, for the playback rate (busy stretch, no wake-up).
      const samples = [];
      const sampler = setInterval(() => { page.textContent(".cell-clock").then((x) => samples.push([Date.now(), x.trim()])).catch(() => {}); }, 400);
      await decideAndFinish(page, { option: "B" });
      clearInterval(sampler);
      c.seconds = Math.round((Date.now() - started) / 1000);
      c.lanes = Object.fromEntries(await page.$$eval(".lane", (els) => els.map((e) => [e.dataset.order, e.dataset.state])));
      c.tile = (await page.textContent("#kpi-ontime-value")).trim();
      c.clock = (await page.textContent("#kpi-clock-value")).trim();
      c.report = (await page.textContent("#console .night-report-title")).trim();
      c.summary = await page.$$eval('#console .entry[data-kind="summary"]', (els) => els.length);
      await page.click("#tab-kpiboard");
      await page.waitForSelector("#panel-kpiboard:not([hidden])");
      c.kpi = await kpiRows(page);
      c.tonightHead = (await page.textContent(".kb-table thead th:nth-child(3)")).trim();
      if (speed === 4) await shot(page, "11-night-end-kpiboard.png");
      await page.click(".drawer-end .btn");
      // Rate: simulated minutes per real second between 22:50 and 01:50 (no wake-up in that stretch),
      // the slope from the first to the last sample in it.
      const mins = (x) => { const m = /^(\d\d):(\d\d)/.exec(x); if (!m) return null; const v = Number(m[1]) * 60 + Number(m[2]); return v >= 22 * 60 ? v - 22 * 60 : v + 120; };
      const pts = samples.map(([ms, x]) => [ms, mins(x), /paused|‖/.test(x)]).filter(([, m, p]) => m !== null && !p && m >= 50 && m <= 230);
      const [a, z] = [pts[0], pts.at(-1)];
      c.rate = pts.length >= 2 && z[0] > a[0] ? Math.round(((z[1] - a[1]) / ((z[0] - a[0]) / 1000)) * 10) / 10 : null;
      c.samples = pts.length;
      checks.speeds[speed] = c;
    }
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "night-fail.png");
  }
  const expectRows = {
    "Labour hours tonight": F.hours(f.labour_hours),
    [`Cell hours, ${F.int(res.orders.reduce((n, o) => n + o.units, 0))} units tonight`]: F.hours(f.cell_hours),
    "Robot picks per cell hour": F.int(f.robot_picks_per_cell_hour),
    "Store orders on time": `${F.int(onTime)} of ${F.int(res.orders.length)}`,
    "Labour per 1,000 units, hybrid": `${F.hours(f.labour_hours_per_1000)} · ${F.eur2(E.tonightEuros(E.defaults(), f).per_thousand_eur)}`
  };
  const exps = [[onTime === 13 && SC1_B.hash === res.hash, `option B keeps every truck on time in the Node replay (${onTime} of ${res.orders.length})`]];
  for (const speed of [4, 2, 1]) {
    const c = checks.speeds[speed] || {};
    exps.push([JSON.stringify(c.lanes) === JSON.stringify(states), `×${speed}: every lane's dispatch state equals the replay (${JSON.stringify(c.lanes)})`]);
    exps.push([c.tile === `${onTime} of ${res.orders.length}` && c.clock === "06:00", `×${speed}: the tile ${c.tile}, the clock ${c.clock}`]);
    exps.push([c.report === (late.length ? `Night over at 06:00. ${onTime} of ${res.orders.length} orders on time; late: ${late.join(" and ")}.` : `Night over at 06:00. All ${res.orders.length} orders on time.`) && c.summary === 1, `×${speed}: the night report and the management summary (${c.report})`]);
    const bad = Object.entries(expectRows).filter(([k, v]) => c.kpi?.[k]?.[1] !== v).map(([k, v]) => `${k}: ${c.kpi?.[k]?.[1]} ≠ ${v}`);
    exps.push([bad.length === 0 && c.tonightHead === `Tonight (simulation, seed ${res.seed})`, `×${speed}: the KPI board's Tonight column (${bad.join("; ") || c.tonightHead})`]);
    exps.push([c.rate !== null && c.samples >= 4 && c.rate >= 4.5 * speed && c.rate <= 7.5 * speed, `×${speed}: ${c.rate} simulated minutes per second over ${c.samples} samples (6 × ${speed} expected)`]);
  }
  checks.durations = Object.fromEntries(Object.entries(checks.speeds).map(([k, v]) => [k, v.seconds]));
  await finish(`night: scenario 1's scripted replay to night end at ×4, ×2 and ×1, option B approved (${JSON.stringify(checks.durations)} s)`, t, checks, exps);
}

// ---- board: keyboard, mouse, popovers, reduced motion ---------------------------------------------------------
if (wanted("board")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    // Every board button in the Tab order, at least 44 px, with its full name.
    checks.buttons = await page.$$eval(".cell-board button.station, .cell-board button.lane, .cell-board button.wm-focus", (els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { name: e.getAttribute("aria-label") || e.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), tab: e.tabIndex };
    }));
    await page.focus("#btn-diagnostics");
    const order = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => { const a = document.activeElement; return a?.closest(".cell-board") ? (a.dataset.station || a.dataset.order || a.className) : null; });
      if (info) order.push(info);
      else if (order.length) break;
    }
    checks.tabOrder = order;
    // Enter opens, Escape closes and gives the focus back.
    checks.pops = {};
    for (const sel of ['.lane[data-order="SOE"]', '.station[data-station="cell"]', '.station[data-station="manual"]', ".wm-focus"]) {
      await page.focus(sel);
      await page.keyboard.press("Enter");
      await page.waitForSelector(".cell-pop:not([hidden])", { timeout: 3000 });
      const label = await page.getAttribute(".cell-pop", "aria-label");
      const focusIn = await page.evaluate(() => !!document.activeElement?.closest(".cell-pop"));
      await page.keyboard.press("Escape");
      await page.waitForSelector(".cell-pop[hidden]", { state: "attached", timeout: 3000 });
      const back = await page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
      checks.pops[sel] = { label, focusIn, back };
    }
    // Mouse: a click opens, a click elsewhere closes.
    await page.click('.lane[data-order="HAM"]');
    checks.mouseOpen = await page.isVisible(".cell-pop");
    checks.mouseLabel = await page.getAttribute(".cell-pop", "aria-label");
    await page.mouse.click(5, 300);
    checks.mouseClosed = await page.isHidden(".cell-pop");
    // A popover follows the night.
    await startNight(page, { speed: 4 });
    await dismissBanners(page);
    // A stretch with no wake-up (the scripted agent's turns pause the night until 22:41).
    await page.waitForFunction(() => /^(23|00|01):/.test(document.querySelector(".cell-clock")?.textContent || ""), null, { timeout: 60000 });
    // The robot cell works without a break from 22:00 to the small hours; a store lane can stand still
    // for hours (Essen waits from 22:20 for its chilled units at 01:00).
    await page.focus('.station[data-station="cell"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector(".cell-pop:not([hidden])");
    const before = (await page.textContent(".cell-pop .pop-grid")).trim();
    await page.waitForTimeout(1500);
    const after = (await page.textContent(".cell-pop .pop-grid")).trim();
    checks.follows = before !== after && (await page.isVisible(".cell-pop"));
    await shot(page, "12-board-popover.png");
    await page.keyboard.press("Escape");
    checks.backAfterRun = await page.evaluate(() => document.activeElement?.dataset.station);
    await page.click("#btn-abort");
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "board-fail.png");
  }
  // Reduced motion: nothing on the board animates.
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  await ctx.addInitScript(SKIP_INTRO);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
  const rp = await ctx.newPage();
  try {
    await rp.goto(BASE);
    await rp.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    await startNight(rp, { speed: 4 });
    const running = [];
    for (let i = 0; i < 8; i++) {
      await rp.waitForTimeout(250);
      running.push(await rp.evaluate(() => document.querySelector(".cell-board").getAnimations({ subtree: true }).filter((a) => a.playState === "running" && a.effect?.getComputedTiming().duration > 1).length));
    }
    checks.reducedRunning = running;
  } catch (err) {
    checks.FAILED = checks.FAILED || `reduced motion: ${String(err.message).split("\n")[0]}`;
  }
  await ctx.close();
  const names = (checks.buttons || []).map((b) => b.name);
  const small = (checks.buttons || []).filter((b) => b.w < 44 || b.h < 44).map((b) => `${b.name.slice(0, 30)} ${b.w}×${b.h}`);
  const tabbed = new Set(checks.tabOrder || []);
  const wantTab = ["inbound", "camera", "cell", "scale", "manual", ...WORLD.stores.map((x) => x.id)];
  await finish("board: keyboard, mouse, popovers, reduced motion", t, checks, [
    [(checks.buttons || []).length === 18 && names.every((n) => n && n.length > 8), `18 board buttons with full names (${(checks.buttons || []).length})`],
    [small.length === 0, `board targets at least 44 px (${JSON.stringify(small)})`],
    [wantTab.every((x) => tabbed.has(x)) && [...tabbed].some((x) => /wm-focus/.test(x)), `every station, lane and the world model in the Tab order (${JSON.stringify(checks.tabOrder)})`],
    [checks.pops?.['.lane[data-order="SOE"]']?.label === "Soest" && checks.pops?.['.station[data-station="cell"]']?.label === "Robot cell" && checks.pops?.['.station[data-station="manual"]']?.label === "Manual station" && checks.pops?.[".wm-focus"]?.label === "World model", `popovers named for their entity (${JSON.stringify(checks.pops)})`],
    [Object.values(checks.pops || {}).length === 4 && Object.values(checks.pops).every((p) => p.focusIn && p.back), "Enter moves the focus into the popover; Escape closes it and gives the focus back"],
    [checks.mouseOpen && checks.mouseLabel === "Hamm" && checks.mouseClosed, "a click opens a popover, a click elsewhere closes it"],
    [checks.follows && checks.backAfterRun === "cell", `an open popover follows the night and gives the focus back (${checks.follows}, ${checks.backAfterRun})`],
    [(checks.reducedRunning || []).length === 8 && checks.reducedRunning.every((n) => n === 0), `reduced motion: nothing animates on the board (${JSON.stringify(checks.reducedRunning)})`]
  ]);
}

// ---- kpi: the KPI board and the Assumptions tab ------------------------------------------------------------------
if (wanted("kpi")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  const read = async () => ({ rows: await kpiRows(page), annual: (await page.innerText(".kb-annual")).replace(/\s+/g, " ").trim(), all: (await page.innerText("#panel-kpiboard")).replace(/\s+/g, " ") });
  try {
    await boot(page);
    await page.click("#tab-kpiboard");
    await page.waitForSelector("#panel-kpiboard:not([hidden])");
    checks.g1 = await read();
    await shot(page, "13-kpiboard.png");
    await page.click("#tab-assumptions");
    await page.waitForSelector("#as-p");
    checks.inputs = await page.$$eval(".as-table tbody tr", (rows) => rows.map((r) => `${r.dataset.param}=${r.querySelector("input").value} [${r.querySelector(".kb-key").textContent}]`));
    await page.fill("#as-p", "1.5");
    await page.press("#as-p", "Enter");
    checks.refused = { msg: (await page.textContent('tr[data-param="p"] .as-msg')).trim(), invalid: await page.getAttribute("#as-p", "aria-invalid"), stored: await page.evaluate(() => sessionStorage.getItem("rp.assumptions")) };
    await page.fill("#as-p", "0.70");
    await page.press("#as-p", "Enter");
    checks.changedChip = await page.isVisible('tr[data-param="p"] .chip');
    checks.stored = await page.evaluate(() => sessionStorage.getItem("rp.assumptions"));
    await shot(page, "14-assumptions.png");
    await page.click("#tab-kpiboard");
    checks.g2 = await read();
    checks.changedLine = (await page.textContent(".kb-changed")).trim();
    checks.tile = (await page.textContent("#kpi-labour-value")).trim();
    await page.click("#tab-audit");
    checks.auditChange = await page.$$eval('.audit-table tr[data-type="assumption_change"] td.s', (els) => els.map((e) => e.textContent.trim()));
    await page.click("#tab-assumptions");
    await page.click("#btn-reset-assumptions");
    checks.afterReset = { value: await page.inputValue("#as-p"), stored: await page.evaluate(() => sessionStorage.getItem("rp.assumptions")) };
    await page.click("#tab-kpiboard");
    checks.reset = await read();
    await page.click("#tab-audit");
    checks.auditReset = await page.$$eval('.audit-table tr[data-type="assumption_change"] td.s', (els) => els.map((e) => e.textContent.trim()));
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "kpi-fail.png");
  }
  const plan = (r, k) => r?.rows?.[k]?.[0];
  const basisOk = (r) => r && Object.keys(r.rows).length === 8 && Object.values(r.rows).every((cells) => cells[2] && cells[2].split(" ").every((k) => ["IML", "EUROSTAT_LC", "Assumption", "Synthetic"].includes(k)));
  const payback = (r) => (r?.all.match(/payback/gi) || []).length === (r?.all.match(/No payback claim/g) || []).length;
  await finish("kpi: the KPI board and the Assumptions tab", t, checks, [
    [plan(checks.g1, "Labour per 1,000 units, by hand") === "2.5 h · €89.50" && plan(checks.g1, "Labour per 1,000 units, hybrid") === "0.91 h · €32.49", "G1 per 1,000 units: 2.5 h · €89.50 by hand, 0.91 h · €32.49 hybrid"],
    [plan(checks.g1, "Robot picks per cell hour") === "455" && plan(checks.g1, "Break-even all-in cell cost") === "€40.72 per operating hour", "455 picks per cell hour; break-even €40.72 per operating hour"],
    [/€342,069 a year illustrative, per reference site, gross, before cell costs/.test(checks.g1?.annual || "") && /8,400 cell hours: 4\.2 cells on an eight-hour night shift over 250 nights, or 1\.4 cells round the clock/.test(checks.g1?.annual || "") && /€42,759 a year/.test(checks.g1?.annual || ""), `the annual figure with its qualifier, the cells it needs and the demo cell (${checks.g1?.annual})`],
    [basisOk(checks.g1) && payback(checks.g1), "every row carries a source key or Assumption; no payback claim"],
    [(checks.inputs || []).length === E.PARAMETERS.length && checks.inputs.includes("p=0.91 [Assumption]") && checks.inputs.includes("r_m=400 [IML]") && checks.inputs.includes("c=35.8 [EUROSTAT_LC]"), `the Assumptions tab lists every input with its basis (${JSON.stringify(checks.inputs)})`],
    [checks.refused?.msg === "Between 0.01 and 1.00." && checks.refused?.invalid === "true" && checks.refused?.stored === null, `an out-of-range value is refused (${JSON.stringify(checks.refused)})`],
    [checks.changedChip && checks.stored === '{"p":0.7}' && /^Changed inputs: p 0\.70 \(default 0\.91\)$/.test(checks.changedLine || ""), `p = 0.70 is kept for this tab and named on the board (${checks.stored}; ${checks.changedLine})`],
    [plan(checks.g2, "Labour per 1,000 units, hybrid") === "1.28 h · €45.65" && plan(checks.g2, "Break-even all-in cell cost") === "€31.33 per operating hour" && /€263,130 a year/.test(checks.g2?.annual || ""), `G2: 1.28 h · €45.65, €31.33, €263,130 (${plan(checks.g2, "Labour per 1,000 units, hybrid")}; ${plan(checks.g2, "Break-even all-in cell cost")})`],
    [checks.tile === "2.5 h · €89.50", `the idle header tile keeps the manual baseline (${checks.tile})`],
    [JSON.stringify(checks.auditChange) === JSON.stringify(["p: 0.91 → 0.7"]), `the change is in the audit (${JSON.stringify(checks.auditChange)})`],
    [checks.afterReset?.value === "0.91" && checks.afterReset?.stored === "{}" && plan(checks.reset, "Labour per 1,000 units, hybrid") === "0.91 h · €32.49" && /€342,069 a year/.test(checks.reset?.annual || ""), "Reset to defaults restores G1"],
    [JSON.stringify(checks.auditReset) === JSON.stringify(["p: 0.91 → 0.7", "p: 0.7 → 0.91 (reset)"]), `the reset is in the audit (${JSON.stringify(checks.auditReset)})`]
  ]);
}

// ---- world: scenario 2's glass jar ----------------------------------------------------------------------------------
if (wanted("world")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  try {
    await boot(page);
    await startNight(page, { scenario: "SC2-GLASS", speed: 4 });
    await dismissBanners(page);
    // The correction stays in focus two simulated minutes (5 s at ×4): read and open it at once.
    await page.waitForSelector('.wm-focus[data-corrected="true"]', { timeout: 20000 });
    checks.focus = await page.$eval(".wm-focus", (el) => { const label = el.getAttribute("aria-label"); el.click(); return label; });
    await page.waitForSelector(".cell-pop:not([hidden])");
    checks.pop = { label: await page.getAttribute(".cell-pop", "aria-label"), grid: (await page.innerText(".cell-pop .pop-grid")).replace(/\s+/g, " ").trim(), table: await page.$$eval(".cell-pop .pop-table tbody tr", (rows) => rows.map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent).join(" | "))) };
    await shot(page, "15-world-model.png");
    await page.keyboard.press("Escape");
    await waitStatus(page, "Done", 120000);
    checks.log = await page.$$eval(".wm-log li", (els) => els.map((e) => e.textContent.trim()));
    checks.consoleLines = await page.$$eval('#console .entry[data-type="correction"]', (els) => els.map((e) => `${e.querySelector(".entry-time").textContent} ${e.querySelector(".entry-body").textContent}`));
    await page.click("#tab-audit");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-audit")]);
    const audit = JSON.parse(await readFile(await download.path(), "utf8"));
    const ev = audit.events || [];
    checks.corrections = ev.filter((e) => e.type === "world_model_correction").map((e) => e.payload);
    checks.readings = ev.filter((e) => e.type === "scale_reading").map((e) => `${e.payload.sku} ${e.payload.expected_g}→${e.payload.observed_g}`);
    checks.closedTotes = ev.filter((e) => e.type === "tote_update" && e.payload.status === "closed").map((e) => e.payload.weight_g);
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "world-fail.png");
  }
  const c = checks.corrections?.[0];
  await finish("world: scenario 2 writes the glass jar back once", t, checks, [
    [/^World model, corrected: S07 Apricot jam 200 g, glass jar, expected 200 g, observed 400 g, written back for the whole SKU at 22:17$/.test(checks.focus || ""), `the panel shows the correction (${checks.focus})`],
    [checks.pop?.label === "World model: S07" && /Item master 200 g World model now 400 g Last scale reading 400 g/.test(checks.pop?.grid || "") && JSON.stringify(checks.pop?.table) === JSON.stringify(["22:17 | scale | weight | 200 g | 400 g"]), `the item's popover (${JSON.stringify(checks.pop)})`],
    [JSON.stringify(checks.log) === JSON.stringify(["22:17 scale: S07 weight 200 g → 400 g, for the whole SKU"]), `one row in the corrections log (${JSON.stringify(checks.log)})`],
    [checks.consoleLines?.length === 1 && /^22:17 World model corrected: S07/.test(checks.consoleLines[0]), `one console line (${JSON.stringify(checks.consoleLines)})`],
    [checks.corrections?.length === 1 && c.sku === "S07" && c.old === 200 && c.new === 400 && c.sensor === "scale" && c.applies_to === "sku" && NS.clockOf(c.at) === "22:17", `one correction in the audit (${JSON.stringify(checks.corrections)})`],
    [JSON.stringify(checks.readings) === JSON.stringify(["S07 200→400"]), `the one reading outside the tolerance is in the audit (${JSON.stringify(checks.readings)})`],
    [(checks.closedTotes || []).length > 100 && checks.closedTotes.every((g) => g <= 15000), `no tote over 15 kg (${(checks.closedTotes || []).length} closed, heaviest ${Math.max(...(checks.closedTotes || [0]))} g)`]
  ]);
}

// ---- contrast: every visible text meets its WCAG 2.2 contrast duty (tests/lib/contrast.mjs) -------------
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
      await page.waitForFunction(() => document.querySelectorAll('.diag-status[data-s="pass"]').length === 4 && !document.querySelector('.diag-status[data-s="running"]'), null, { timeout: 30000 });
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
      await page.click('button[aria-label="Night speed ×4"]');
      await page.click("#btn-start");
      await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
      await page.waitForSelector('.cell-board[data-state="running"]', { timeout: 5000 });
      // A banner of each level over the running replay (the app raises them on notes, warnings and errors).
      await page.evaluate(() => import("./js/ui.js").then((m) => {
        m.showBanner({ level: "info", title: "Note", text: "Contrast check: a note." });
        m.showBanner({ level: "warn", title: "Heads-up", text: "Contrast check: a warning." });
        m.showBanner({ level: "error", title: "Error", text: "Contrast check: an error." });
      }));
      await page.waitForSelector('.banner[data-level="error"]', { timeout: 5000 });
      await measure("banners");
      await dismissBanners(page);
      await page.waitForFunction(() => document.querySelector(".cell-clock")?.textContent >= "22:30", null, { timeout: 60000 });
      await measure("night running");
      await page.click("#tab-kpiboard");
      await page.waitForTimeout(400);
      await measure("night, drawer open");
      // 02:00: the options in the drawer, then the drafts in the Outbox with the console's notice.
      await page.waitForSelector('.option-card[data-id="B"] .btn-approve', { timeout: 120000 });
      await measure("options");
      await page.click('.option-card[data-id="B"] .btn-approve');
      await page.waitForSelector("#btn-approve-all", { timeout: 60000 });
      await page.waitForSelector('#console .entry[data-type="notice"]', { timeout: 10000 });
      await measure("drafts and notice");
      await page.click("#btn-approve-all");
      await waitStatus(page, "Done", 120000);
      await page.click(".drawer-end .btn");
      await measure("night end, summary and run facts");
      await page.click("#btn-open-report");
      await page.waitForSelector(".report-modal", { timeout: 5000 });
      await measure("management summary");
      await page.keyboard.press("Escape");
      await page.waitForSelector(".report-modal", { state: "detached", timeout: 3000 });
      // Control: faint text on the app background (porcelain) measures 4.44:1, a known gap in the
      // shared palette (Rebate Hunter REVIEW W9). The measure has to catch it.
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
      [Object.keys(checks.states).length === 17 && thin.length === 0, `seventeen states, each with at least five text elements measured (${Object.entries(checks.states).map(([k, r]) => `${k} ${r.measured}`).join(", ")})`],
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
