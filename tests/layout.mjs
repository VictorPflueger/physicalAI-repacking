// Layout suite (Chromium): the five window sizes from a 1080p projector down to a small laptop
// (1920×1080, 1600×900, 1536×864, 1366×768, 1280×720), each in five states of scenario 1: idle; idle
// with the drawer open; the glass jar's correction (22:17); the express order (02:00, thirteen lanes,
// two stores at risk); and that moment with the drawer open on the KPI board (the board's smallest
// sizes, strip mode at 1280×720). The last three are taken while the night pauses for the agent's turn
// there, so the clock carries its longest text ("· paused"). In every state: no horizontal overflow, the
// header tiles in view and never covered, the header at most 14 % of the window's height, a one-row
// control bar, the header badges clear of each other,
// the board's caption, Simulated cell tag and world-model chip inside the panel and clear of each other,
// every store lane whole and in view, the board fitting its panel, its Synthetic label in view, and
// every target at least 40 px (44 px on the board). At 02:00 the store-order figures must equal the
// night simulation computed here in Node: the header tile (on their truck or safely projected, the
// stores at risk beneath) and the KPI board's Tonight row (trucks gone so far, orders still open). The
// night runs on Playwright's clock, paused after boot: it moves only when the suite advances it, so it
// stands still while a state is measured and every size meets the same moments. Options and drafts
// join the states with the agent (M3).
// Usage: node tests/layout.mjs [case…]   (cases: the sizes, for example 1280x720)
import path from "node:path";
import vm from "node:vm";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { APP_ROOT, outDir, ONLY, launchBrowser, serveStatic, NETWORK_NOISE, SKIP_INTRO, VIEWPORTS } from "./lib/harness.mjs";

// Scenario 1 in Node, for the store-order figures at the 02:00 pause.
const NS = await import(pathToFileURL(path.join(APP_ROOT, "js/nightsim.js")).href);
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ["data/world.js", "data/scenarios.js"]) vm.runInContext(await readFile(path.join(APP_ROOT, f), "utf8"), sandbox, { filename: f });
const SC1 = sandbox.window.SCENARIOS.find((x) => x.number === 1);
const NIGHT1 = NS.buildNight(sandbox.window.WORLD, SC1.night);
const RES1 = NS.runNight(NIGHT1, { seed: SC1.night.seed });
const MINUTE = 60000;
/**
 * What the screen must say at a wake-up's pause m minutes after 22:00, every event of that moment
 * processed: a truck leaves at its cut-off, on time if its order was done by then; the stores at risk
 * are those still open that the latest projection flags.
 */
function storeOrdersAt(m) {
  const t = m * MINUTE;
  const visible = RES1.orders.filter((o) => o.kind !== "express" || NIGHT1.express.at_ms <= t);
  const gone = visible.filter((o) => o.cutoff_ms <= t);
  const onTruck = gone.filter((o) => o.on_time).length;
  const late = gone.length - onTruck;
  const open = visible.length - gone.length;
  const last = RES1.events.filter((e) => e.type === "projection" && e.t <= t).at(-1);
  const flagged = new Set((last?.payload.orders || []).filter((x) => x.at_risk).map((x) => x.id));
  const risk = visible.filter((o) => o.cutoff_ms > t && flagged.has(o.id)).length;
  return {
    clock: `${NS.clockOf(t)} · paused`,
    tile: `${visible.length - late - risk} of ${visible.length}`,
    sub: late ? `${late} late${risk ? ` · ${risk} at risk` : ""}` : risk ? `projected · ${risk} at risk` : "projected · on its trucks",
    row: gone.length ? `${onTruck} of ${gone.length} so far · ${open} still open` : `no truck yet · ${open} still open`
  };
}
// The rule above holds only if every truck leaves at its cut-off and cut-offs fall on whole minutes.
const dispatchAtCutoff = RES1.events.filter((e) => e.type === "dispatch").every((e) => e.t === RES1.orders.find((o) => o.id === e.payload.order)?.cutoff_ms)
  && RES1.orders.every((o) => o.cutoff_ms % MINUTE === 0);
const AT_0200 = storeOrdersAt(240);

const OUT = await outDir("layout");
const { base: BASE, close } = await serveStatic(APP_ROOT, 8867);
const browser = await launchBrowser();
const results = [];

/** Everything the layout must hold, measured in the page. */
const measure = () => {
  const r = (el) => el.getBoundingClientRect();
  const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  const shown = (e) => e && e.offsetParent !== null && getComputedStyle(e).visibility !== "hidden" && r(e).width > 0;
  const controls = [...document.getElementById("controls").children].filter((e) => shown(e) && !e.classList.contains("spacer"));
  const first = r(controls[0]);
  const oneRow = controls.every((e) => { const b = r(e); return b.top < first.bottom && b.bottom > first.top; });
  const badges = [...document.querySelectorAll(".header-badges > *")].filter(shown).map(r);
  const badgesClear = badges.every((a, i) => badges.every((b, j) => i === j || !overlap(a, b)));
  // Tiles: in view, not covered (the point at a tile's centre belongs to the tile), the value whole.
  const tiles = [...document.querySelectorAll(".kpi")].map((t) => {
    const b = r(t);
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const v = t.querySelector(".kpi-value");
    return { id: t.id, inView: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth, covered: !t.contains(hit), clipped: v.scrollWidth > v.clientWidth + 1 };
  });
  const panel = r(document.querySelector(".cell-panel"));
  const board = document.querySelector(".cell-board");
  const body = board.querySelector(".cell-body");
  const lanesEl = board.querySelector(".cell-lanes");
  const bodyBox = r(body);
  const head = [board.querySelector(".cell-caption"), board.querySelector(".wm-chip"), board.querySelector(".sim-cell-tag")].filter(shown);
  const headBoxes = head.map(r);
  const lanes = [...board.querySelectorAll(".lane")].map((l) => ({ id: l.dataset.order, whole: inside(r(l), bodyBox) && inside(r(l), panel), shown: shown(l) }));
  const synthetic = [...board.querySelectorAll('.chip[data-tone="synthetic"]')].some((c) => shown(c) && inside(r(c), panel));
  const tag = board.querySelector(".sim-cell-tag");
  const targets = [...document.querySelectorAll("button, a[href]")].filter((e) => shown(e) && !e.closest(".skip-link"))
    .filter((e) => { const b = r(e); return b.bottom > 0 && b.top < innerHeight; })
    .map((e) => ({ e, b: r(e), min: e.closest(".cell-board") && !e.closest(".cell-pop") ? 44 : 40 }))
    .filter(({ b, min }) => b.width < min || b.height < min)
    .map(({ e, b }) => `${(e.textContent.trim() || e.getAttribute("aria-label") || "").slice(0, 24)} ${Math.round(b.width)}×${Math.round(b.height)}`);
  return {
    size: board.dataset.size, legend: board.dataset.legend, clock: board.querySelector(".cell-clock")?.textContent, viewH: innerHeight,
    hOverflow: document.documentElement.scrollWidth > innerWidth,
    oneRow, badgesClear, headerHeight: Math.round(r(document.querySelector(".app-header")).height),
    tiles,
    headInside: headBoxes.every((b) => inside(b, panel)),
    headClear: headBoxes.every((a, i) => headBoxes.every((b, j) => i === j || !overlap(a, b))),
    lanes, laneCount: lanes.length,
    fits: body.scrollHeight <= body.clientHeight + 1 && lanesEl.scrollHeight <= lanesEl.clientHeight + 1,
    synthetic, tagShown: shown(tag) && inside(r(tag), panel),
    smallTargets: targets
  };
};

/** The expectations for one measured state. */
function verdict(m, state) {
  const bad = (list) => list.length ? `: ${list.join(", ")}` : "";
  const tileProblems = (m.tiles || []).filter((t) => !t.inView || t.covered || t.clipped).map((t) => `${t.id}${t.covered ? " covered" : ""}${t.inView ? "" : " out of view"}${t.clipped ? " clipped" : ""}`);
  const laneProblems = (m.lanes || []).filter((l) => !l.shown || !l.whole).map((l) => l.id);
  const lanesWanted = state.startsWith("02:00") ? 13 : 12;
  return [
    [m.hOverflow === false, "no horizontal overflow"],
    [m.oneRow, "one-row control bar"],
    // The header holds the four tiles: at most 14 % of the window's height (about 100 px at 720 px).
    [m.badgesClear && m.headerHeight <= Math.round(0.14 * m.viewH), `header badges clear of each other, header ${m.headerHeight} px of ${m.viewH}`],
    [(m.tiles || []).length === 4 && tileProblems.length === 0, `four header tiles in view, never covered, values whole${bad(tileProblems)}`],
    [m.headInside && m.headClear, "the board's caption, chip and Simulated cell tag inside the panel and clear of each other"],
    [m.laneCount === lanesWanted && laneProblems.length === 0, `${lanesWanted} store lanes, each whole and in view (${m.laneCount})${bad(laneProblems)}`],
    [m.fits, `the board fits its panel (size ${m.size})`],
    [m.synthetic && m.tagShown, "the Synthetic label and the Simulated cell tag in view"],
    [(m.smallTargets || []).length === 0, `targets at least 40 px, 44 px on the board${bad(m.smallTargets || [])}`]
  ];
}

const until = async (page, test, limitMs = 120000) => {
  for (let spent = 0; spent < limitMs; spent += 250) {
    if (await page.evaluate(test)) return true;
    await page.clock.runFor(250);
  }
  return false;
};

for (const [w, hgt] of VIEWPORTS) {
  const name = `${w}x${hgt}`;
  if (ONLY.length && !ONLY.includes(name)) continue;
  const context = await browser.newContext({ viewport: { width: w, height: hgt } });
  await context.addInitScript(SKIP_INTRO);
  const external = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => { external.push(route.request().url()); return route.abort("blockedbyclient"); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); });
  const states = {};
  const figures = [];
  let failed = null;
  const readStoreOrders = () => page.evaluate(() => {
    const row = [...document.querySelectorAll(".kb-table tbody tr")].find((r) => r.querySelector("th")?.textContent.trim() === "Store orders on time");
    return { clock: document.querySelector(".cell-clock")?.textContent.trim(), tile: document.getElementById("kpi-ontime-value")?.textContent.trim(), sub: document.getElementById("kpi-ontime-sub")?.textContent.trim(), row: row?.querySelectorAll("td")[1]?.textContent.trim() ?? null };
  });
  const settle = () => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
  const snap = async (state, file, advance = 700) => {
    await page.clock.runFor(advance); // the board's next frames
    // CSS animations and transitions (a lane sliding in, the drawer opening) run on real time: let them
    // finish, then give the board the frames it asks for once they are over (it re-measures on one).
    await settle();
    await page.clock.runFor(50);
    await settle();
    states[state] = await page.evaluate(measure);
    if (w === 1920 || w === 1280) await page.screenshot({ path: path.join(OUT, `${file}-${name}.png`) });
  };
  try {
    await page.clock.install();
    await page.goto(BASE);
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    // From here the page's time moves only when the suite moves it (an installed clock otherwise flows
    // with real time, through screenshots and animation waits).
    await page.clock.pauseAt(Date.now() + 500);
    await page.clock.runFor(1000);
    await snap("idle", "01-idle");
    await page.click("#tab-audit");
    await snap("idle, drawer open", "02-idle-drawer");
    await page.click(".drawer-end .btn");
    await page.clock.runFor(600);
    await page.click('button[aria-label="Night speed ×1"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.$$eval(".banner", (els) => els.forEach((e) => e.remove()));
    // The jar correction at 22:17: the panel shows it while the night pauses for the agent's turn
    // (the clock's longest text, "22:17 · paused"). A short step, so the shot shows that moment.
    if (!await until(page, () => !!document.querySelector('.wm-focus[data-corrected="true"]'))) throw new Error("the night did not reach the jar correction");
    await snap("22:17, the jar correction", "03-correction", 100);
    // The express order at 02:00: the night pauses 1.2 s (×1) for the agent's turn (W4); both states
    // are taken inside that pause, the second after the drawer has opened on the KPI board.
    if (!await until(page, () => /^02:00 · paused$/.test(document.querySelector(".cell-clock")?.textContent.trim() || ""))) throw new Error("the night did not pause at 02:00");
    await snap("02:00, the express order", "04-express", 100);
    figures.push(["02:00", await readStoreOrders()]);
    await page.click("#tab-kpiboard");
    await snap("02:00, drawer open", "05-drawer", 400);
    figures.push(["02:00, drawer open", await readStoreOrders()]);
    await page.click("#btn-abort");
  } catch (err) {
    failed = String(err.message).split("\n")[0];
    await page.screenshot({ path: path.join(OUT, `fail-${name}.png`) }).catch(() => {});
  }
  for (const [state, m] of Object.entries(states)) {
    const exps = verdict(m, state);
    const problems = exps.filter(([ok]) => !ok).map(([, msg]) => msg);
    results.push({ name: `${name}, ${state} (board ${m.size}${m.legend === "on" ? ", legend" : ""})`, ok: problems.length === 0, problems, m });
  }
  const extra = [];
  if (failed) extra.push(`exception: ${failed}`);
  if (Object.keys(states).length !== 5) extra.push(`${Object.keys(states).length} of 5 states measured`);
  if (!dispatchAtCutoff) extra.push("the simulation does not dispatch every order at its cut-off on a whole minute");
  // The tile at both states; the KPI board's row once its panel is open (it renders 250 ms after a change).
  for (const [when, got] of figures) {
    const want = when === "02:00" ? { ...AT_0200, row: got.row } : AT_0200;
    if (JSON.stringify(got) !== JSON.stringify(want)) extra.push(`store orders at ${when}: ${JSON.stringify(got)}, the simulation says ${JSON.stringify(want)}`);
  }
  if (figures.length !== 2 && !failed) extra.push(`${figures.length} of 2 store-order readings`);
  if (errors.length) extra.push(`page errors: ${errors.join(" | ")}`);
  if (external.length) extra.push(`external requests: ${external.join(", ")}`);
  results.push({ name: `${name}: five states, store orders at 02:00 as simulated, no error, no external request`, ok: extra.length === 0, problems: extra, figures, expected: AT_0200 });
  await context.close();
}

await browser.close();
await close();
await writeFile(path.join(OUT, "layout-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const p of r.problems) console.log(`      - ${p}`);
}
const okCount = results.filter((r) => r.ok).length;
console.log(`\n${okCount}/${results.length} layout cases passed. Screenshots: ${OUT}`);
process.exit(results.length > 0 && okCount === results.length ? 0 : 1);
