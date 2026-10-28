// Smoke tests of the workspace, the agent's runs and the failure modes of loading:
//   boot          the idle workspace: disclosure, badge, fonts, the Simulated cell tag, the board at 22:00
//                 (twelve store lanes with their cut-offs, five stations, the world model's Synthetic
//                 label), the header tiles at the manual baseline, six scenarios, no external request,
//                 storage keys under rp.
//   intro         first visit opens the intro window, the five-minute call's opener: the world model's four steps, three
//                 value points with the engine's figures at the inputs (€32.49 against €89.50, −64 %,
//                 €342,069 a year on 4.2 cells, €40.72 an hour), what is real; "How it works" reopens it;
//                 its Start agent leads to the mode choice
//   modes         Start agent → Simulation → the scripted replay starts (status, badge, the console's run
//                 line, the watermark) → Abort; scenario 2 → its own scripted replay; a scenario whose
//                 script is missing → a night preview with its note; Start agent → Live → key dialog (401,
//                 then accepted) → the live agent starts (the
//                 Messages API stand-in holds the call) → key kept in this tab's session storage only,
//                 never in local storage or the console; change or forget the key
//   diag          Diagnostics: Anthropic (keyless 401 from a stand-in), world (14 checks), simulation
//                 scripts (all six valid), Open Food Facts (live reads off) and privacy
//   drawer        five tabs with their content; a scripted night stopped by Abort, then the audit export:
//                 version, mode "simulation", the chosen mode, the night's hash, a partial unit log instead
//                 of the ordinary units' events, the agent's tool calls, no key
//   night         scenario 1's scripted replay to night end at ×4, ×2 and ×1, with option B approved and
//                 its drafts: every lane's dispatch state, the orders-on-time tile, the KPI board's Tonight
//                 column and the night report equal the replay computed headless in Node; between moments
//                 the night clock cruises at 16 simulated minutes per second per speed step; the console's
//                 simple view (the default) and Details
//   board         the cell board by keyboard and mouse: every station, lane and the world model are
//                 buttons of at least 44 px in the Tab order; Enter opens a popover named for the entity,
//                 Escape closes it and gives the focus back; a popover follows the night; reduced motion
//                 stops every animation
//   kpi           the KPI board at the brief's defaults (what it is worth first: the annual figure with
//                 the cells it needs, the demo cell; G1, break-even, sources on every row, no payback
//                 claim); p = 0.70 in the Assumptions tab gives G2 and lands in the audit; an
//                 out-of-range value is refused; Reset
//   yourdc        after scenario 1's night, Your DC on the KPI board: 10,000,000 units a year gives
//                 €570,115 on 7 cells, the board keeps the finished night, the audit and the Assumptions
//                 tab show the change, a refused value, Reference site restores €342,069
//   dial          the autonomy dial: Advise, Approve and Bounded, Approve by default; Bounded locked with the
//                 gate's three shortfalls (138 of 200 decisions, 7 of 10 nights, 92.8 % of 95 %) in its
//                 tooltip and dialog; Advise chosen, kept for the tab and logged; the dial locked during the
//                 run; in Advise the person's click applies option B, the agent never calls
//                 wms_apply_option, and the night is the same as with Approve
//   world         scenario 2: the scale writes the glass jar back once (22:17, 200 g → 400 g) in the
//                 console, the corrections log and the item's popover; the audit holds that one
//                 correction and no tote over 15 kg
//   customer      a first visit opens the Customer view (TECH_NOTES D62): the world model with tonight's
//                 24 items and their planned units, What it is worth from the engine, the console; scenario
//                 3 selected; Full shows the board, is remembered and kept on reload; back to Customer
//   worldnight    scenario 3 in the Customer view at ×4: the jar's moment, way and tile, the unknown item's
//                 moment, tile and the console's card; Confirm entry in the world model decides the request
//                 once; at night end What it is worth and every item's done count equal the replay in
//                 Node; two view switches leave the night's hash and tool calls unchanged; plain words,
//                 with the console's Details as the control
//   contrast      every visible text in seventeen states (intro, idle, Diagnostics, five drawer tabs, mode
//                 choice, key dialog, banners of each level, the running replay, the replay with the
//                 drawer open, the options, the drafts with the console's notice, the night's end with the
//                 summary card and run facts, the management summary) meets its WCAG contrast duty; a
//                 control is caught
//   contrast-customer  the Customer view at 1920×1080 and 1280×720 in five states of scenario 3 (idle, the
//                 jar, the unknown item waiting for you, the entry confirmed, night end): every visible
//                 text meets its WCAG contrast duty; a control is caught
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
import { APP_ROOT, outDir, wanted, launchBrowser, serveStatic, NETWORK_NOISE, MOCK_KEY, SKIP_INTRO, M4_SCREEN, KEYS, VIEWPORTS } from "./lib/harness.mjs";
import { contrastShortfalls } from "./lib/contrast.mjs";

// The night simulation, the engine and the formatting, in Node: what the screen must show.
const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);
const NS = await mod("js/nightsim.js");
const E = await mod("js/engine.js");
const NP = await mod("js/night.js");
// Between the night's moments the clock cruises (js/night.js, TECH_NOTES D50): simulated minutes per real second at ×1.
const CRUISE_MIN_PER_S = (NP.SIM_MS_PER_REAL_MS * NP.CRUISE_FACTOR * 1000) / NS.MINUTE;
const F = await mod("js/format.js");
const { APP } = await mod("js/config.js");
const { replayScenario1 } = await mod("tests/lib/scenario1.mjs");
// Scenario 1's scripted replay with option B approved, headless in Node: what the screen must show.
const SC1_B = await replayScenario1({ option: "B" });
// The engine's plan at the brief's defaults: the opener's and the KPI board's figures (golden case G1).
const G1 = E.plan(E.defaults());
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

async function newPage({ anthropic = null, intro = false, viewport = { width: 1920, height: 1080 }, customer = false } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  if (!intro) await context.addInitScript(SKIP_INTRO);
  // The M4 cases run on the Full view with scenario 1; the Customer-view cases see a first visit's screen.
  if (!customer) await context.addInitScript(M4_SCREEN);
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
    checks.cellTag = (await page.textContent(".cell-board .sim-cell-tag")).trim();
    checks.cellTagVisible = await page.isVisible(".cell-board .sim-cell-tag");
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
    [["Inter", "Bricolage Grotesque"].every((f) => (checks.fontsLoaded || []).includes(f)), `Vici's self-hosted fonts loaded (${(checks.fontsLoaded || []).join(", ")})`],
    [checks.cellTagVisible && checks.cellTag === "Simulated cell", "the neutral Simulated cell tag"],
    [JSON.stringify(checks.synthetic) === JSON.stringify(["Synthetic"]), `the world model says Synthetic (${JSON.stringify(checks.synthetic)})`],
    [JSON.stringify(checks.lanes) === JSON.stringify(stores) && stores.length === 12, `twelve store lanes with the world's cut-offs (${JSON.stringify(checks.lanes)})`],
    [JSON.stringify(checks.stations) === JSON.stringify(["Inbound pallet", "Camera", "Robot cell", "Scale", "Manual station"]), `five stations (${JSON.stringify(checks.stations)})`],
    [checks.manual === `${F.int(waiting)} waiting · 0 picked` && checks.clock === "22:00", `the manual station at 22:00: ${checks.manual}, clock ${checks.clock}`],
    [JSON.stringify(checks.tiles) === JSON.stringify(["2.5 h · €89.50 | by hand, without the cell", "— | once the night runs", "22:00 | 22:00 to 06:00", "€0.00 | no model calls"]), `header tiles at the manual baseline (${JSON.stringify(checks.tiles)})`],
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
    checks.figures = await page.$$eval(".intro-value-figure", (els) => els.map((e) => e.textContent.trim()));
    checks.valueTexts = await page.$$eval(".intro-value li", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
    checks.real = await page.$$eval(".intro-real-item strong", (els) => els.map((e) => e.textContent));
    checks.words = await page.$eval(".intro-modal", (e) => e.innerText.split(/\s+/).filter(Boolean).length);
    checks.fits = await page.$eval(".intro-modal", (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    await page.waitForTimeout(200);
    checks.focus = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await shot(page, "02-intro.png");
    // The window at the five sizes: no scrolling in its body, What is real inside it (css/modals.css closes
    // it up on windows up to 900 px high).
    const vp = page.viewportSize();
    checks.sizes = [];
    for (const [w, hgt] of VIEWPORTS) {
      await page.setViewportSize({ width: w, height: hgt });
      await page.waitForTimeout(150);
      checks.sizes.push(await page.evaluate((size) => {
        const body = document.querySelector(".intro-modal .modal-body");
        const box = body.getBoundingClientRect();
        const real = document.querySelector(".intro-real")?.getBoundingClientRect();
        const win = document.querySelector(".intro-modal").getBoundingClientRect();
        return { size, scroll: body.scrollHeight, client: body.clientHeight, ok: body.scrollHeight <= body.clientHeight + 1 && !!real && real.bottom <= box.bottom + 1 && win.top >= 0 && win.bottom <= innerHeight };
      }, `${w}x${hgt}`));
    }
    await page.setViewportSize(vp);
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
    [checks.steps === "Knows,Checks,Learns,Asks" && checks.values === 3, `the world model's four steps and three value points (${checks.steps}; ${checks.values})`],
    [JSON.stringify(checks.figures) === JSON.stringify([F.eur2(G1.per_thousand.hybrid_eur), `${F.eur0(G1.per_year.eur_avoided)} a year`, `${F.eur2(G1.per_cell_hour.break_even_eur)} an hour`])
      && checks.valueTexts?.[0]?.includes(`instead of ${F.eur2(G1.per_thousand.manual_eur)} by hand: −64 %`) && checks.valueTexts?.[1]?.includes("with 4.2 cells on the night shift"),
      `what it is worth, from the engine (${JSON.stringify(checks.figures)}; ${JSON.stringify(checks.valueTexts)})`],
    [JSON.stringify(checks.real) === JSON.stringify(["Simulated, labelled so", "Real"]), `the what-is-real panel (${JSON.stringify(checks.real)})`],
    // About a minute to read: 238 words a minute is the average adult reading rate (TECH_NOTES D50).
    [checks.words <= 238, `the intro reads in about a minute (${checks.words} words of at most 238)`],
    [checks.fits, "the intro fits the screen"],
    [checks.sizes?.length === VIEWPORTS.length && checks.sizes.every((x) => x.ok), `the intro fits without scrolling at the five sizes, What is real in view (${(checks.sizes || []).map((x) => `${x.size} ${x.scroll}/${x.client}`).join(", ")})`],
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
    // Scenario 2 has its own scripted replay (M4).
    await page.click("#dd-scenario");
    await page.click('.menu-item[data-id="SC2-GLASS"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    checks.sc2Note = await page.$(".stage-note");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector('#console .entry[data-type="run"]', { timeout: 5000 });
    checks.sc2RunLine = (await page.$eval('#console .entry[data-type="run"] .entry-body', (e) => e.innerText)).replace(/\s+/g, " ").trim();
    checks.sc2Badge = (await page.textContent("#mode-badge")).trim();
    await page.click("#btn-abort");
    await waitStatus(page, "Aborted", 5000);
    // A scenario whose script is missing plays its night without the agent, and says so first.
    await page.evaluate(() => { delete window.SIM_RUNS["SC2-GLASS"]; });
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
    [/^Run aborted\. Stopped by the user\.$/.test(checks.abortLine || "") && /^Replay facts: .*; 1 agent turn; .*; no cost \(simulated\)\.$/.test(checks.abortFacts || ""), `Abort stops the run and says how far it got (${checks.abortLine} | ${checks.abortFacts})`],
    [checks.sc2Note === null && /^Scenario 2: Glassware heavier than master data Simulation: scripted replay/.test(checks.sc2RunLine || "") && checks.sc2Badge === "SIMULATION", `scenario 2 plays its own scripted replay (${checks.sc2RunLine}, ${checks.sc2Badge})`],
    [/^This scenario has no scripted replay: Simulation plays its night without the agent/.test(checks.previewNote || "") && checks.previewBadge === "NIGHT PREVIEW" && /^No scripted replay for scenario 2:/.test(checks.previewNotice || ""), `a scenario without a script plays as a night preview, and says so (${checks.previewNote} | ${checks.previewNotice})`],
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
    // 15 s, not 5: on a loaded machine the panel once took longer to open (19 Oct 2026), never on an idle one.
    await page.waitForSelector(".diag-table", { timeout: 15000 });
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
    [checks.scripts === "6 scripts valid on every decision path." && JSON.stringify(checks.scriptRows) === JSON.stringify(["pass", "pass", "pass", "pass", "pass", "pass"]), `the script row (${checks.scripts}; ${JSON.stringify(checks.scriptRows)})`],
    [/^Live reads are off in this build .* No request is sent\.$/.test(checks.off || ""), `the Open Food Facts row (${checks.off})`],
    [/^Connections limited to api\.anthropic\.com, as configured; no key stored; audit export checked\.$/.test(checks.privacy || ""), `privacy row (${checks.privacy})`],
    [checks.worldChecks === 14 && checks.worldFails === 0, `14 world checks listed, none failing (${checks.worldChecks}, ${checks.worldFails})`],
    [new RegExp(`^Repack Pilot ${APP.version.replace(/\./g, "\\.")}\\.`).test(checks.footer || "") && APP.version === "0.4.1", `the footer shows the version (${checks.footer})`],
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
      // The console's simple view (the default) and Details (TECH_NOTES D50).
      c.view = await page.getAttribute("#console", "data-view");
      c.entries = await page.$$eval("#console .entry", (els) => ({ all: els.length, shown: els.filter((e) => getComputedStyle(e).display !== "none").length, tools: els.filter((e) => e.dataset.type === "tool_call" && getComputedStyle(e).display !== "none").length }));
      c.count = (await page.textContent("#console .count")).trim();
      if (speed === 4) {
        await page.click("#btn-console-details");
        c.details = { view: await page.getAttribute("#console", "data-view"), shown: await page.$$eval("#console .entry", (els) => els.filter((e) => getComputedStyle(e).display !== "none").length), count: (await page.textContent("#console .count")).trim(), stored: await page.evaluate((k) => localStorage.getItem(k), KEYS.consoleView) };
        await page.click("#btn-console-details");
        c.back = { view: await page.getAttribute("#console", "data-view"), stored: await page.evaluate((k) => localStorage.getItem(k), KEYS.consoleView) };
      }
      await page.click("#tab-kpiboard");
      await page.waitForSelector("#panel-kpiboard:not([hidden])");
      c.kpi = await kpiRows(page);
      c.tonightHead = (await page.textContent(".kb-table thead th:nth-child(3)")).trim();
      c.tonightTitle = await page.getAttribute(".kb-table thead th:nth-child(3)", "title");
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
  const calledIn = f.called_in_hours > 0 ? `, ${F.hours(f.called_in_hours)} called in` : "";
  const expectRows = {
    "Labour hours tonight": `${F.hours(f.labour_hours)}${calledIn}`,
    [`Cell hours, ${F.int(res.orders.reduce((n, o) => n + o.units, 0))} units tonight`]: F.hours(f.cell_hours),
    "Robot picks per cell hour": F.int(f.robot_picks_per_cell_hour),
    "Store orders on time": `${F.int(onTime)} of ${F.int(res.orders.length)}`,
    "Labour per 1,000 units, with the cell": `${F.hours(f.labour_hours_per_1000)} · ${F.eur2(E.tonightEuros(E.defaults(), f).per_thousand_eur)}${calledIn}`
  };
  const exps = [[onTime === 13 && SC1_B.hash === res.hash, `option B keeps every truck on time in the Node replay (${onTime} of ${res.orders.length})`]];
  for (const speed of [4, 2, 1]) {
    const c = checks.speeds[speed] || {};
    exps.push([JSON.stringify(c.lanes) === JSON.stringify(states), `×${speed}: every lane's dispatch state equals the replay (${JSON.stringify(c.lanes)})`]);
    exps.push([c.tile === `${onTime} of ${res.orders.length}` && c.clock === "06:00", `×${speed}: the tile ${c.tile}, the clock ${c.clock}`]);
    exps.push([c.report === (late.length ? `Night over at 06:00. ${onTime} of ${res.orders.length} orders on time; late: ${late.join(" and ")}.` : `Night over at 06:00. All ${res.orders.length} orders on time (${res.orders.length - 1} store orders and the express order).`) && c.summary === 1, `×${speed}: the night report and the management summary (${c.report})`]);
    const bad = Object.entries(expectRows).filter(([k, v]) => c.kpi?.[k]?.[1] !== v).map(([k, v]) => `${k}: ${c.kpi?.[k]?.[1]} ≠ ${v}`);
    exps.push([bad.length === 0 && c.tonightHead === "Tonight (simulated night)" && c.tonightTitle === `Seed ${res.seed}: the same seed replays the same night.`, `×${speed}: the KPI board's Tonight column (${bad.join("; ") || `${c.tonightHead}; ${c.tonightTitle}`})`]);
    exps.push([c.rate !== null && c.samples >= 4 && c.rate >= 0.75 * CRUISE_MIN_PER_S * speed && c.rate <= 1.25 * CRUISE_MIN_PER_S * speed, `×${speed}: ${c.rate} simulated minutes per second over ${c.samples} samples (${CRUISE_MIN_PER_S} × ${speed} expected between moments)`]);
    exps.push([c.view === "simple" && c.entries?.shown <= 35 && c.entries?.tools === 0 && c.count === `${c.entries?.shown} of ${c.entries?.all} entries`, `×${speed}: the console's simple view shows ${c.entries?.shown} of ${c.entries?.all} entries, no tool call (${c.count})`]);
  }
  const d4 = checks.speeds[4] || {};
  exps.push([d4.details?.view === "details" && d4.details?.shown === d4.entries?.all && d4.details?.count === `${d4.entries?.all} entries` && d4.details?.stored === "details" && d4.back?.view === "simple" && d4.back?.stored === "simple", `Details shows every entry and is remembered under rp. (${JSON.stringify(d4.details)}, ${JSON.stringify(d4.back)})`]);
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
  await ctx.addInitScript(M4_SCREEN);
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
  const read = async () => ({ rows: await kpiRows(page), annual: (await page.innerText(".kb-worth")).replace(/\s+/g, " ").trim(), all: (await page.innerText("#panel-kpiboard")).replace(/\s+/g, " "), first: await page.$eval(".kpiboard > *", (e) => e.className) });
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
    [plan(checks.g1, "Labour per 1,000 units, by hand") === "2.5 h · €89.50" && plan(checks.g1, "Labour per 1,000 units, with the cell") === "0.91 h · €32.49", "G1 per 1,000 units: 2.5 h · €89.50 by hand, 0.91 h · €32.49 with the cell"],
    [plan(checks.g1, "Robot picks per cell hour") === "455" && plan(checks.g1, "Break-even all-in cell cost") === "€40.72 per operating hour", "455 picks per cell hour; break-even €40.72 per operating hour"],
    [checks.g1?.first === "kb-worth" && /^What it is worth illustrative, per reference site, gross, before cell costs €342,069 a year with 4\.2 cells on the night shift/.test(checks.g1?.annual || "") && /Per 1,000 units: €32\.49 with the cell, instead of €89\.50 by hand \(−64 %\)/.test(checks.g1?.annual || "") && /8,400 cell hours a year, that is 4\.2 cells on an eight-hour night shift over 250 nights, or 1\.4 round the clock/.test(checks.g1?.annual || "") && /€42,759 a year/.test(checks.g1?.annual || ""), `what it is worth comes first: the annual figure with its qualifier, the cells it needs and the demo cell (${checks.g1?.annual})`],
    [basisOk(checks.g1) && payback(checks.g1), "every row carries a source key or Assumption; no payback claim"],
    [(checks.inputs || []).length === E.PARAMETERS.length && checks.inputs.includes("p=0.91 [Assumption]") && checks.inputs.includes("r_m=400 [IML]") && checks.inputs.includes("c=35.8 [EUROSTAT_LC]"), `the Assumptions tab lists every input with its basis (${JSON.stringify(checks.inputs)})`],
    [checks.refused?.msg === "Between 0.01 and 1.00." && checks.refused?.invalid === "true" && checks.refused?.stored === null, `an out-of-range value is refused (${JSON.stringify(checks.refused)})`],
    [checks.changedChip && checks.stored === '{"p":0.7}' && /^Changed inputs: Grasp success rate 0\.70 \(default 0\.91\)$/.test(checks.changedLine || ""), `p = 0.70 is kept for this tab and named on the board (${checks.stored}; ${checks.changedLine})`],
    [plan(checks.g2, "Labour per 1,000 units, with the cell") === "1.28 h · €45.65" && plan(checks.g2, "Break-even all-in cell cost") === "€31.33 per operating hour" && /€263,130 a year/.test(checks.g2?.annual || ""), `G2: 1.28 h · €45.65, €31.33, €263,130 (${plan(checks.g2, "Labour per 1,000 units, with the cell")}; ${plan(checks.g2, "Break-even all-in cell cost")})`],
    [checks.tile === "2.5 h · €89.50", `the idle header tile keeps the manual baseline (${checks.tile})`],
    [JSON.stringify(checks.auditChange) === JSON.stringify(["p: 0.91 → 0.7"]), `the change is in the audit (${JSON.stringify(checks.auditChange)})`],
    [checks.afterReset?.value === "0.91" && checks.afterReset?.stored === "{}" && plan(checks.reset, "Labour per 1,000 units, with the cell") === "0.91 h · €32.49" && /€342,069 a year/.test(checks.reset?.annual || ""), "Reset to defaults restores G1"],
    [JSON.stringify(checks.auditReset) === JSON.stringify(["p: 0.91 → 0.7", "p: 0.7 → 0.91 (reset)"]), `the reset is in the audit (${JSON.stringify(checks.auditReset)})`]
  ]);
}

// ---- yourdc: after the night, the customer's own volume on the KPI board ------------------------------------------
if (wanted("yourdc")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  const f = SC1_B.replay.session.figures();
  const v = E.defaults();
  const byHand = E.night(v, f.units_repacked);
  const big = E.plan({ ...v, N: 10000000 });
  try {
    await boot(page);
    await startNight(page, { speed: 4 });
    await dismissBanners(page);
    await decideAndFinish(page, { option: "B" });
    checks.card = (await page.innerText("#console .night-report")).replace(/\s+/g, " ").trim();
    checks.cardShown = await page.$$eval("#console .night-report dt", (els) => els.filter((e) => getComputedStyle(e).display !== "none").map((e) => e.textContent));
    await page.click("#btn-console-your-dc");
    await page.waitForSelector("#panel-kpiboard:not([hidden]) #kb-dc-N");
    checks.before = (await page.textContent("#kb-year")).trim();
    await page.fill("#kb-dc-N", "10,000,000");
    await page.press("#kb-dc-N", "Enter");
    await page.waitForFunction(() => /570/.test(document.getElementById("kb-year")?.textContent || ""), null, { timeout: 3000 });
    checks.after = { year: (await page.textContent("#kb-year")).trim(), sub: (await page.textContent(".kb-worth-sub")).trim(), field: await page.inputValue("#kb-dc-N"), focus: await page.evaluate(() => document.activeElement?.id) };
    checks.boardKept = { clock: (await page.textContent(".cell-clock")).trim(), lanes: await page.$$eval(".lane", (els) => els.filter((e) => e.dataset.state === "dispatched").length) };
    checks.tile = (await page.textContent("#kpi-labour-value")).trim();
    await shot(page, "16-your-dc.png");
    await page.fill("#kb-dc-c", "abc");
    await page.press("#kb-dc-c", "Enter");
    checks.refused = { msg: (await page.textContent(".kb-dc-field:has(#kb-dc-c) .kb-dc-msg")).trim(), invalid: await page.getAttribute("#kb-dc-c", "aria-invalid") };
    await page.click("#tab-assumptions");
    checks.assumption = { value: await page.inputValue("#as-N"), chip: await page.isVisible('tr[data-param="N"] .chip') };
    await page.click("#tab-audit");
    checks.audit = await page.$$eval('.audit-table tr[data-type="assumption_change"] td.s', (els) => els.map((e) => e.textContent.trim()));
    await page.click("#tab-kpiboard");
    await page.click("#kb-dc-reset");
    checks.reset = { year: (await page.textContent("#kb-year")).trim(), field: await page.inputValue("#kb-dc-N"), stored: await page.evaluate(() => sessionStorage.getItem("rp.assumptions")) };
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "yourdc-fail.png");
  }
  const lanes = SC1_B.replay.session.run.orders.length;
  await finish("yourdc: the closing card, and Your DC on the KPI board after the night", t, checks, [
    [checks.card?.includes(`Labour with the cell ${F.hours(f.labour_hours)} · ${F.eur2(E.tonightEuros(v, f).labour_eur)}, ${F.hours(f.called_in_hours)} of it called in`) && checks.card?.includes(`The same units by hand ${F.hours(byHand.manual_h)} · ${F.eur2(byHand.manual_eur)}`), `the closing card: tonight against the same units by hand (${checks.card})`],
    [checks.card?.includes(`Per 1,000 units ${F.eur2(G1.per_thousand.hybrid_eur)} with the cell, instead of ${F.eur2(G1.per_thousand.manual_eur)} by hand (−64 %)`) && checks.card?.includes(`${F.eur0(G1.per_year.eur_avoided)} a year with 4.2 cells on the night shift`) && checks.card?.includes(`${F.eur2(G1.per_cell_hour.break_even_eur)} per operating hour`), "the closing card: what it is worth"],
    [!(checks.cardShown || []).includes("Seed") && !(checks.cardShown || []).includes("Robot cell"), `the simple view leaves the seed and the cell's rates to Details (${JSON.stringify(checks.cardShown)})`],
    [checks.before === `${F.eur0(G1.per_year.eur_avoided)} a year` && checks.after?.year === `${F.eur0(big.per_year.eur_avoided)} a year` && checks.after?.sub === "with 7 cells on the night shift" && checks.after?.field === "10,000,000" && checks.after?.focus === "kb-dc-N", `Your DC: 10,000,000 units a year (${JSON.stringify(checks.after)})`],
    [checks.boardKept?.clock === "06:00" && checks.boardKept?.lanes === lanes && checks.tile === "0.91 h · €32.49", `the finished night stays on the board (${JSON.stringify(checks.boardKept)}, ${checks.tile})`],
    [/^Between 1\.00 and 200\.00\.$/.test(checks.refused?.msg || "") && checks.refused?.invalid === "true", `a value that is not a number is refused (${JSON.stringify(checks.refused)})`],
    [checks.assumption?.value === "10000000" && checks.assumption?.chip === true, `the Assumptions tab shows the change (${JSON.stringify(checks.assumption)})`],
    [JSON.stringify(checks.audit) === JSON.stringify(["N: 6000000 → 10000000 (Your DC)"]), `the change is in the audit (${JSON.stringify(checks.audit)})`],
    [checks.reset?.year === `${F.eur0(G1.per_year.eur_avoided)} a year` && checks.reset?.field === "6,000,000" && checks.reset?.stored === "{}", `Reference site restores the brief's site (${JSON.stringify(checks.reset)})`]
  ]);
}

// ---- dial: the autonomy dial, its gate and Advise (TECH_NOTES D58) -------------------------------------------------
if (wanted("dial")) {
  const t = await newPage();
  const { page } = t;
  const checks = {};
  const dial = () => page.$$eval(".autonomy-dial button", (els) => els.map((b) => ({ level: b.dataset.level, pressed: b.getAttribute("aria-pressed"), locked: b.dataset.locked === "true", disabled: b.getAttribute("aria-disabled") === "true", label: b.getAttribute("aria-label"), title: b.title })));
  try {
    await boot(page);
    checks.idle = await dial();
    // Bounded explains why it is locked instead of switching.
    await page.click('.autonomy-dial button[data-level="bounded"]');
    await page.waitForSelector(".gate-modal .gate-list li");
    checks.gate = {
      title: (await page.textContent(".gate-modal h2")).trim(),
      // The page keeps a figure and its unit together with a no-break space; compare with plain spaces.
      rows: await page.$$eval(".gate-list li", (els) => els.map((e) => ({ ok: e.dataset.ok, label: e.querySelector(".gate-label").textContent.trim(), text: e.querySelector(".gate-text").firstChild.textContent.replace(/\u00a0/g, " ").trim() }))),
      record: (await page.textContent(".gate-modal .gate-record")).replace(/\s+/g, " ").trim()
    };
    await shot(page, "17-autonomy-gate.png");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".gate-modal", { state: "detached", timeout: 5000 });
    checks.afterGate = (await dial()).find((d) => d.level === "approve")?.pressed;
    // Advise: a person's setting for the next run, in the audit and kept for the tab.
    await page.click('.autonomy-dial button[data-level="advise"]');
    checks.advise = { pressed: (await dial()).find((d) => d.level === "advise")?.pressed, stored: await page.evaluate(() => sessionStorage.getItem("rp.autonomy")) };
    await page.click("#tab-audit");
    checks.auditBefore = await page.$$eval('.audit-table tr[data-type="autonomy_change"] td.s', (els) => els.map((e) => e.textContent.trim()));
    await page.click(".drawer-end .btn").catch(() => {});
    await startNight(page, { speed: 4 });
    await dismissBanners(page);
    checks.running = await dial();
    // The run keeps its level: a click during the run changes nothing.
    await page.click('.autonomy-dial button[data-level="approve"]', { force: true });
    checks.runningAfterClick = (await dial()).find((d) => d.level === "advise")?.pressed;
    await page.waitForSelector('.option-card[data-id="B"] .btn-approve', { timeout: 300000 });
    checks.button = (await page.textContent('.option-card[data-id="B"] .btn-approve')).trim();
    checks.note = (await page.textContent("#panel-options .options-advise")).replace(/\s+/g, " ").trim();
    await page.click('.option-card[data-id="B"] .btn-approve');
    await page.waitForSelector('.option-card[data-id="B"][data-status="approved"]', { state: "attached", timeout: 10000 });
    checks.status = (await page.textContent('.option-card[data-id="B"] .option-status')).trim();
    await page.waitForSelector("#btn-approve-all", { timeout: 60000 });
    await page.click("#btn-approve-all");
    await waitStatus(page, "Done", 300000);
    checks.after = await dial();
    await page.click("#tab-audit");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-audit")]);
    const audit = JSON.parse(await readFile(await download.path(), "utf8"));
    const ev = audit.events || [];
    checks.run = {
      autonomy: ev.find((e) => e.type === "run_start")?.payload?.autonomy,
      decisions: ev.filter((e) => e.type === "option_decision").map((e) => `${e.payload.option_id} ${e.payload.decision}`),
      applyCalls: ev.filter((e) => e.type === "tool_call" && e.payload?.name === "wms_apply_option").length,
      hash: audit.run?.night_hash, status: audit.run?.status
    };
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "dial-fail.png");
  }
  const by = (list, level) => (list || []).find((d) => d.level === level) || {};
  const failing = (checks.gate?.rows || []).filter((r) => r.ok === "false").map((r) => r.text);
  await finish("dial: the autonomy dial, Bounded's gate and a run in Advise", t, checks, [
    [JSON.stringify((checks.idle || []).map((d) => d.level)) === JSON.stringify(["advise", "approve", "bounded"]) && by(checks.idle, "approve").pressed === "true" && by(checks.idle, "advise").pressed === "false", `Advise, Approve and Bounded, Approve by default (${JSON.stringify(checks.idle)})`],
    [by(checks.idle, "bounded").locked && by(checks.idle, "bounded").label === "Bounded, locked: show why" && /^Locked: 138 decisions \(needs at least 200\); 7 nights \(needs at least 10\); 92\.8 % \(needs at least 95 %\)\.$/.test(by(checks.idle, "bounded").title || ""), `Bounded is locked and its tooltip names the three shortfalls (${by(checks.idle, "bounded").title})`],
    [checks.gate?.title === "Bounded execution is locked" && JSON.stringify(failing) === JSON.stringify(["138 decisions (needs at least 200)", "7 nights (needs at least 10)", "92.8 % (needs at least 95 %)"]) && (checks.gate?.rows || []).length === 5 && /138 decisions over 7 nights/.test(checks.gate?.record || "") && /Synthetic/.test(checks.gate?.record || ""), `the gate dialog: three criteria fail on the synthetic record (${JSON.stringify(checks.gate)})`],
    [checks.afterGate === "true", "clicking Bounded does not switch the level"],
    [checks.advise?.pressed === "true" && checks.advise?.stored === "advise" && (checks.auditBefore || []).length === 1 && /^approve → advise by the person; Bounded locked/.test(checks.auditBefore?.[0] || ""), `Advise is chosen, kept for the tab and logged (${JSON.stringify(checks.advise)}; ${JSON.stringify(checks.auditBefore)})`],
    [by(checks.running, "advise").disabled && by(checks.running, "approve").disabled && checks.runningAfterClick === "true", `the dial is locked while the run goes on (${JSON.stringify(checks.running)})`],
    [checks.button === "Apply" && /^Advise: the agent only recommends\. Your click on Apply applies the option/.test(checks.note || "") && checks.status === "Applied by you", `in Advise the person's click applies the option (${checks.button}; ${checks.status}; ${checks.note})`],
    [checks.run?.autonomy === "advise" && JSON.stringify(checks.run?.decisions) === JSON.stringify(["B approved"]) && checks.run?.applyCalls === 0 && checks.run?.hash === SC1_B.hash && checks.run?.status === "done", `the run: Advise, B applied by the person, no wms_apply_option, the same night as Approve (${JSON.stringify(checks.run)})`],
    [!by(checks.after, "advise").disabled && !by(checks.after, "approve").disabled, `the dial is free again after the run (${JSON.stringify(checks.after)})`]
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
    // What the board shows at the correction: item names, no SKU id (D55); the ids stay in the popover and the audit.
    checks.boardAtFix = await page.$eval(".cell-board", (el) => el.innerText);
    checks.focus = await page.$eval(".wm-focus", (el) => { const label = el.getAttribute("aria-label"); el.click(); return label; });
    await page.waitForSelector(".cell-pop:not([hidden])");
    checks.pop = { label: await page.getAttribute(".cell-pop", "aria-label"), grid: (await page.innerText(".cell-pop .pop-grid")).replace(/\s+/g, " ").trim(), table: await page.$$eval(".cell-pop .pop-table tbody tr", (rows) => rows.map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent).join(" | "))) };
    await shot(page, "15-world-model.png");
    await page.keyboard.press("Escape");
    await waitStatus(page, "Done", 120000);
    checks.log = await page.$$eval(".wm-log li", (els) => els.map((e) => e.textContent.trim()));
    checks.chip = await page.$eval(".wm-chip", (el) => ({ label: el.getAttribute("aria-label"), parts: [...el.querySelectorAll(".wm-chip-name, .wm-chip-vals")].map((e) => e.textContent) }));
    checks.boardAtEnd = await page.$eval(".cell-board", (el) => el.innerText);
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
    [/^World model, corrected: Apricot jam 200 g, glass jar, expected 200 g, observed 400 g, written back for every unit of this item at 22:17$/.test(checks.focus || ""), `the panel shows the correction (${checks.focus})`],
    [/Corrected\s*Apricot jam 200 g, glass jar/.test(checks.boardAtFix || "") && /\bS\d{2}\b/.test(checks.pop?.label || "") && ![checks.boardAtFix, checks.boardAtEnd].some((x) => !x || /\bS\d{2}\b/.test(x)), `the board names the item, no SKU id at the correction or at the end (${[checks.boardAtFix, checks.boardAtEnd].map((x) => (/\bS\d{2}\b/.exec(x || "") || ["none"])[0]).join(", ")})`],
    [checks.pop?.label === "World model: S07" && /Item master 200 g World model now 400 g Last scale reading 400 g/.test(checks.pop?.grid || "") && JSON.stringify(checks.pop?.table) === JSON.stringify(["22:17 | scale | weight | 200 g | 400 g"]), `the item's popover (${JSON.stringify(checks.pop)})`],
    [JSON.stringify(checks.log) === JSON.stringify(["22:17 scale: Apricot jam 200 g, glass jar, weight 200 g → 400 g, for every unit of this item"]), `one row in the corrections log (${JSON.stringify(checks.log)})`],
    [checks.chip?.label === "World model: Apricot jam 200 g, glass jar written back from 200 g to 400 g at 22:17" && JSON.stringify(checks.chip?.parts) === JSON.stringify(["Apricot jam", "200 g → 400 g"]), `the folded chip names the item and keeps its weights (${JSON.stringify(checks.chip)})`],
    [checks.consoleLines?.length === 1 && /^22:17 World model corrected: Apricot jam 200 g, glass jar weighs 400 g on the scale; its master data say 200 g\. The new weight now holds for every unit of this item \(S07\)/.test(checks.consoleLines[0]), `one console line (${JSON.stringify(checks.consoleLines)})`],
    [checks.corrections?.length === 1 && c.sku === "S07" && c.old === 200 && c.new === 400 && c.sensor === "scale" && c.applies_to === "sku" && NS.clockOf(c.at) === "22:17", `one correction in the audit (${JSON.stringify(checks.corrections)})`],
    [JSON.stringify(checks.readings) === JSON.stringify(["S07 200→400"]), `the one reading outside the tolerance is in the audit (${JSON.stringify(checks.readings)})`],
    [(checks.closedTotes || []).length > 100 && checks.closedTotes.every((g) => g <= 15000), `no tote over 15 kg (${(checks.closedTotes || []).length} closed, heaviest ${Math.max(...(checks.closedTotes || [0]))} g)`]
  ]);
}

// ---- customer: a first visit opens the Customer view (TECH_NOTES D62) ---------------------------------------
if (wanted("customer")) {
  const t = await newPage({ customer: true });
  const { page } = t;
  const checks = {};
  const want = expected("SC3-UNKNOWN");
  try {
    await boot(page);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    checks.view = await page.evaluate(() => document.body.dataset.view);
    checks.visible = { stage: await page.isVisible("#stage"), worth: await page.isVisible("#worth"), console: await page.isVisible("#console"), cell: await page.isVisible(".cell-panel") };
    checks.hiddenControls = { model: await page.isVisible("#dd-model"), dial: await page.isVisible(".autonomy-dial") };
    checks.scenarioLabel = (await page.textContent("#dd-scenario .value")).trim();
    checks.pressed = await page.$$eval(".ctl-view button", (els) => els.map((e) => `${e.dataset.view}:${e.getAttribute("aria-pressed")}`).join(","));
    checks.title = (await page.textContent(".ws-title")).trim();
    checks.tiles = await page.$$eval(".ws-item", (els) => els.map((e) => ({ key: e.dataset.key, how: e.dataset.how, label: e.getAttribute("aria-label") })));
    checks.moment = await page.evaluate(() => ({ kind: document.querySelector(".ws-moment")?.dataset.kind, label: document.querySelector(".wsm-label")?.textContent, text: document.querySelector(".wsm-text")?.textContent }));
    checks.worth = { big: (await page.textContent("#wp-hybrid")).trim(), year: (await page.textContent("#wp-year")).trim() };
    await shot(page, "16-customer-idle.png");
    await page.click('button[aria-label="Full view"]');
    await page.waitForTimeout(300);
    checks.full = { view: await page.evaluate(() => document.body.dataset.view), cell: await page.isVisible(".cell-panel"), stage: await page.isVisible("#stage"), stored: await page.evaluate((k) => localStorage.getItem(k), KEYS.view), dial: await page.isVisible(".autonomy-dial") };
    await page.reload();
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    checks.reloaded = await page.evaluate(() => document.body.dataset.view);
    await page.click('button[aria-label="Customer view"]');
    await page.waitForTimeout(300);
    checks.back = { view: await page.evaluate(() => document.body.dataset.view), stored: await page.evaluate((k) => localStorage.getItem(k), KEYS.view), stage: await page.isVisible("#stage") };
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "customer-fail.png");
  }
  const units = (checks.tiles || []).map((x) => Number((/: ([\d,]+) units/.exec(x.label || "") || [0, "0"])[1].replace(/,/g, "")));
  const handItems = want.info.items.filter((i) => !i.cell).map((i) => i.sku).sort().join(",");
  await finish("customer: a first visit opens the Customer view: the world model and what it is worth", t, checks, [
    [checks.view === "customer" && checks.visible?.stage && checks.visible?.worth && checks.visible?.console && !checks.visible?.cell, `the Customer view by default: world model, What it is worth and the console; the board hidden (${JSON.stringify({ view: checks.view, ...checks.visible })})`],
    [checks.hiddenControls && !checks.hiddenControls.model && !checks.hiddenControls.dial, "the model and the autonomy dial stay in the Full view"],
    [checks.scenarioLabel === "Unknown item" && checks.pressed === "customer:true,full:false", `scenario 3 selected, the Customer switch pressed (${checks.scenarioLabel}; ${checks.pressed})`],
    [checks.title === "The robot's world model", `the stage's title (${checks.title})`],
    [(checks.tiles || []).length === want.info.items.length && units.reduce((a, b) => a + b, 0) === want.info.totals.units && (checks.tiles || []).filter((x) => x.how === "hand").map((x) => x.key).sort().join(",") === handItems,
      `tonight's ${want.info.items.length} items with their planned units (${units.reduce((a, b) => a + b, 0)} of ${want.info.totals.units}) and the items for people (${handItems})`],
    [checks.moment?.kind === "idle" && checks.moment?.label === "Tonight's pallet" && checks.moment?.text === `The model holds all ${want.info.items.length} items of tonight's ${F.int(want.info.totals.units)} units. The robot may take ${F.int(want.info.totals.cell_units)} of them; ${F.int(want.info.totals.manual_units)} are for people: items it may not grip.`, `the idle moment (${JSON.stringify(checks.moment)})`],
    [checks.worth?.big === F.eur2(G1.per_thousand.hybrid_eur) && checks.worth?.year === `${F.eur0(G1.per_year.eur_avoided)} a year`, `What it is worth from the engine (${JSON.stringify(checks.worth)})`],
    [checks.full?.view === "full" && checks.full?.cell && !checks.full?.stage && checks.full?.stored === "full" && checks.full?.dial && checks.reloaded === "full", `Full shows the board, is stored and kept on reload (${JSON.stringify(checks.full)}; ${checks.reloaded})`],
    [checks.back?.view === "customer" && checks.back?.stored === "customer" && checks.back?.stage, `back to the Customer view (${JSON.stringify(checks.back)})`]
  ]);
}

// ---- worldnight: scenario 3 in the Customer view, the five-minute run --------------------------------------
if (wanted("worldnight")) {
  const t = await newPage({ customer: true });
  const { page } = t;
  const checks = {};
  const { replayScenario3 } = await mod("tests/lib/scenario3.mjs");
  const { NOT_PLAIN } = await mod("js/sim_check.js");
  const sc3 = await replayScenario3({ option: null, confirm: "confirm" });
  const read = () => page.evaluate(() => ({
    kind: document.querySelector(".ws-moment")?.dataset.kind,
    label: document.querySelector(".wsm-label")?.textContent,
    text: document.querySelector(".wsm-text")?.textContent,
    nodes: Object.fromEntries([...document.querySelectorAll(".ws-node")].map((n) => [n.dataset.node, `${n.querySelector(".wsn-l1").textContent} | ${n.querySelector(".wsn-l2").textContent}`])),
    tiles: Object.fromEntries([...document.querySelectorAll(".ws-item")].map((e) => [e.dataset.key, { state: e.dataset.state, badge: e.querySelector(".wsi-badge")?.textContent || "", label: e.getAttribute("aria-label") }])),
    log: [...document.querySelectorAll(".ws-log li")].map((l) => l.textContent.trim()),
    words: [document.querySelector("#stage")?.innerText || "", document.querySelector("#worth")?.innerText || "",
      [...document.querySelectorAll("#console .entry")].filter((e) => getComputedStyle(e).display !== "none").map((e) => e.innerText).join("\n")].join("\n")
  }));
  try {
    await boot(page);
    await page.click('button[aria-label="Night speed ×4"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForFunction(() => document.querySelector(".ws-moment")?.dataset.kind === "learned", null, { timeout: 60000 });
    checks.jar = await read();
    await shot(page, "17-customer-jar.png");
    // A view switch during the run: the night goes on, neither restarted nor doubled (TECH_NOTES D62).
    await page.click('button[aria-label="Full view"]');
    await page.waitForTimeout(250);
    await page.click('button[aria-label="Customer view"]');
    await page.waitForSelector("#ws-confirm", { timeout: 120000 });
    checks.unknown = await read();
    checks.consoleCard = await page.isVisible("#console .confirm-actions .btn-approve");
    await shot(page, "18-customer-confirm.png");
    await page.click("#ws-confirm");
    await page.waitForSelector("#console .confirm-card .option-status", { state: "attached", timeout: 10000 });
    checks.consoleStatus = (await page.textContent("#console .confirm-card .option-status")).trim();
    // The console marks its card at once; the world model redraws on its next frame (a slow CI runner read
    // it a frame early on 19 Oct 2026). A stage that never shows the decision still fails below.
    await page.waitForFunction(() => document.querySelector(".ws-moment")?.dataset.kind === "decided", null, { timeout: 10000 }).catch(() => {});
    checks.decided = await read();
    await waitStatus(page, "Done", 240000);
    await page.waitForTimeout(300);
    checks.end = await read();
    checks.tonight = await page.$$eval("#wp-tonight dt", (dts) => Object.fromEntries(dts.map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])));
    await shot(page, "19-customer-end.png");
    // The positive control of the plain-words check: Details shows the tool calls.
    await page.click("#btn-console-details").catch(() => page.click('#console button:has-text("Details")'));
    await page.waitForTimeout(200);
    checks.details = await page.$$eval("#console .entry", (els) => els.filter((e) => getComputedStyle(e).display !== "none").map((e) => e.innerText).join("\n"));
    await page.click("#tab-audit");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-audit")]);
    const audit = JSON.parse(await readFile(await download.path(), "utf8"));
    const ev = audit.events || [];
    checks.audit = { hash: audit.run?.night_hash, calls: ev.filter((e) => e.type === "tool_call").map((e) => e.payload.name), decisions: ev.filter((e) => e.type === "confirmation_decision").map((e) => e.payload.choice) };
  } catch (err) {
    checks.FAILED = String(err.message).split("\n")[0];
    await shot(page, "worldnight-fail.png");
  }
  const jarItem = sc3.item(sc3.correction?.sku);
  const pct0 = (x) => F.pct(x, 0);
  const barcode = sc3.e1?.barcode;
  const doneOk = Object.entries(checks.end?.tiles || {}).filter(([k]) => !k.startsWith("unknown:")).every(([sku, x]) => new RegExp(`, ${F.int((sc3.robot[sku] || 0) + (sc3.hand[sku] || 0)).replace(",", "\\,")} done`).test(x.label || ""));
  const plainAt = (x) => (NOT_PLAIN.exec(x?.words || "") || [])[0] || null;
  await finish("worldnight: scenario 3 in the Customer view: the model learns, asks and pays off", t, checks, [
    [checks.jar?.label === `The model learned · ${NS.clockOf(sc3.correction?.at)}` && checks.jar?.text === `${jarItem?.name} weighs ${F.int(sc3.correction?.new)} g on the scale, not ${F.int(sc3.correction?.old)} g as in the master data. The model now holds ${F.int(sc3.correction?.new)} g for every unit of this item, and the next one is rehearsed with it: ${pct0(sc3.rehearsal?.expected_success)} expected success.`,
      `the jar's moment (${JSON.stringify({ label: checks.jar?.label, text: checks.jar?.text })})`],
    [checks.jar?.nodes?.model === `now ${F.int(sc3.correction?.new)} g | was ${F.int(sc3.correction?.old)} g, for every unit` && checks.jar?.nodes?.scale === `${F.int(sc3.correction?.new)} g | expected ${F.int(sc3.correction?.old)} g` && checks.jar?.nodes?.robot === `rehearsed: ${pct0(sc3.rehearsal?.expected_success)} | with the new weight`,
      `the jar's way through the cell (${JSON.stringify(checks.jar?.nodes)})`],
    [checks.jar?.tiles?.[sc3.correction?.sku]?.state === "corrected" && checks.jar?.tiles?.[sc3.correction?.sku]?.badge === `corrected ${NS.clockOf(sc3.correction?.at)}`
      && checks.jar?.log?.[0] === `${NS.clockOf(sc3.correction?.at)} ${jarItem?.name}: ${F.int(sc3.correction?.old)} g → ${F.int(sc3.correction?.new)} g by the scale, for every unit of the item`,
      `the jar's tile and what the model learned (${JSON.stringify(checks.jar?.tiles?.[sc3.correction?.sku])}; ${JSON.stringify(checks.jar?.log)})`],
    [checks.unknown?.kind === "unknown" && checks.unknown?.label === `Not in the model · ${NS.clockOf(sc3.e1?.sim_t ?? 0)}` && checks.unknown?.text?.startsWith(`The camera read barcode ${barcode}, which the model does not know. The robot never picks an unknown item: its ${sc3.e1?.units} units go to a person. A provisional entry waits for your decision`)
      && checks.unknown?.nodes?.camera === "not in the model | unknown barcode" && checks.unknown?.nodes?.people === `${sc3.e1?.units} units to a person | you confirm the entry` && checks.unknown?.tiles?.[`unknown:${barcode}`]?.state === "unknown" && checks.consoleCard,
      `the unknown item's moment, its tile and the console's card (${JSON.stringify({ label: checks.unknown?.label, text: checks.unknown?.text, nodes: checks.unknown?.nodes, tile: checks.unknown?.tiles?.[`unknown:${barcode}`], card: checks.consoleCard })})`],
    [checks.consoleStatus === "Confirmed" && checks.decided?.kind === "decided" && checks.decided?.tiles?.[`unknown:${barcode}`]?.state === "confirmed" && checks.decided?.tiles?.[`unknown:${barcode}`]?.badge === "confirmed by you" && JSON.stringify(checks.audit?.decisions) === JSON.stringify(["confirm"]),
      `Confirm entry in the world model decides the console's request once (${JSON.stringify({ console: checks.consoleStatus, kind: checks.decided?.kind, tile: checks.decided?.tiles?.[`unknown:${barcode}`], decisions: checks.audit?.decisions })})`],
    [checks.end?.log?.[1] === `${NS.clockOf(sc3.e1?.sim_t ?? 0)} Barcode ${barcode}: confirmed by you; its ${sc3.e1?.units} units went to a person` && checks.end?.kind === "end",
      `what the model learned at night end (${JSON.stringify(checks.end?.log)}; ${checks.end?.kind})`],
    [checks.tonight?.["Units repacked"] === sc3.tonight.units && checks.tonight?.Labour === sc3.tonight.labour && checks.tonight?.["Per 1,000 repacked"] === sc3.tonight.per1000 && checks.tonight?.["Store orders"] === sc3.tonight.orders
      && checks.tonight?.["Caught by the model"] === `1 weight corrected · 1 unknown item, ${sc3.e1?.units} units to a person`,
      `What it is worth at night end equals the night in Node (${JSON.stringify(checks.tonight)}; Node ${JSON.stringify(sc3.tonight)})`],
    [doneOk && Object.keys(checks.end?.tiles || {}).length === sc3.info.items.length + 1, `every item's done count equals its robot and hand picks in Node (${Object.keys(checks.end?.tiles || {}).length} tiles)`],
    [checks.audit?.hash === sc3.hash && JSON.stringify(checks.audit?.calls) === JSON.stringify(sc3.calls), `the night after two view switches equals the replay in Node (${checks.audit?.hash}; Node ${sc3.hash}; ${(checks.audit?.calls || []).length} tool calls, Node ${sc3.calls.length})`],
    [!plainAt(checks.jar) && !plainAt(checks.unknown) && !plainAt(checks.end) && NOT_PLAIN.test(checks.details || ""), `plain words in the Customer view, Details as the control (${[plainAt(checks.jar), plainAt(checks.unknown), plainAt(checks.end)].join(", ")}; control ${(NOT_PLAIN.exec(checks.details || "") || ["none"])[0]})`]
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

// ---- contrast in the Customer view: the world model and What it is worth at every moment of scenario 3 ------
if (wanted("contrast-customer")) {
  for (const [w, hgt] of [[1920, 1080], [1280, 720]]) {
    const t = await newPage({ customer: true, viewport: { width: w, height: hgt } });
    const { page } = t;
    const checks = { states: {} };
    const measure = async (state) => { await settle(page); checks.states[state] = await contrastShortfalls(page); };
    try {
      await boot(page);
      await measure("idle");
      await page.click('button[aria-label="Night speed ×4"]');
      await page.click("#btn-start");
      await page.waitForSelector(".mode-card", { timeout: 5000 });
      await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
      await page.waitForFunction(() => document.querySelector(".ws-moment")?.dataset.kind === "learned", null, { timeout: 60000 });
      await measure("the jar");
      await page.waitForSelector("#ws-confirm", { timeout: 120000 });
      await measure("the unknown item, waiting for you");
      await page.click("#ws-confirm");
      await page.waitForFunction(() => document.querySelector(".ws-moment")?.dataset.kind === "decided", null, { timeout: 10000 });
      await measure("the entry confirmed");
      await waitStatus(page, "Done", 120000);
      await measure("night end");
      checks.controlProbe = await page.evaluate(() => {
        const probe = document.createElement("p");
        probe.textContent = "Contrast control";
        Object.assign(probe.style, { position: "fixed", left: "0", top: "0", margin: "0", padding: "4px", fontSize: "14px", fontWeight: "400", color: "var(--text-faint)", background: "var(--porcelain)", zIndex: "9999" });
        document.body.append(probe);
        return probe.getBoundingClientRect().width > 0;
      });
      checks.controlFound = (await contrastShortfalls(page)).below.filter((s) => s.text === "Contrast control");
    } catch (err) {
      checks.FAILED = String(err.message).split("\n")[0];
      await shot(page, `contrast-customer-fail-${w}.png`);
    }
    const below = Object.entries(checks.states).flatMap(([state, r]) => r.below.map((s) => `${state}: "${s.text}" ${s.ratio}:1 (needs ${s.need}) ${s.color} on ${s.bg}`));
    const thin = Object.entries(checks.states).filter(([, r]) => r.measured < 20).map(([state, r]) => `${state} (${r.measured})`);
    await finish(`contrast-customer: every visible text of the Customer view meets its duty at ${w}×${hgt}`, t, checks, [
      [Object.keys(checks.states).length === 5 && thin.length === 0, `five states, each with at least twenty text elements measured (${Object.entries(checks.states).map(([k, r]) => `${k} ${r.measured}`).join(", ")})`],
      [below.length === 0, `text below its duty: ${JSON.stringify(below)}`],
      [checks.controlProbe && checks.controlFound?.length === 1 && checks.controlFound[0].ratio === 4.44, `the control is caught at 4.44:1 (${JSON.stringify(checks.controlFound)})`]
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
