// Layout suite (Chromium): the five window sizes from a 1080p projector down to a small laptop
// (1920×1080, 1600×900, 1536×864, 1366×768, 1280×720), each in five states of scenario 1: idle; idle
// with the drawer open; the night just after the glass jar's correction (22:17); the night just after
// the express order (02:00, thirteen lanes, two stores at risk); and that moment with the drawer open
// (the board's smallest sizes, strip mode at 1280×720). In every state: no horizontal overflow, the
// header tiles in view and never covered, the header at most 14 % of the window's height, a one-row
// control bar, the header badges clear of each other,
// the board's caption, Simulated cell tag and world-model chip inside the panel and clear of each other,
// every store lane whole and in view, the board fitting its panel, its Synthetic label in view, and
// every target at least 40 px (44 px on the board). The night runs on Playwright's clock, so each state
// is reached exactly. Options and drafts join the states with the agent (M3).
// Usage: node tests/layout.mjs [case…]   (cases: the sizes, for example 1280x720)
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { APP_ROOT, outDir, ONLY, launchBrowser, serveStatic, NETWORK_NOISE, SKIP_INTRO, VIEWPORTS } from "./lib/harness.mjs";

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
  const lanesWanted = state.startsWith("02:01") ? 13 : 12;
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
  let failed = null;
  const snap = async (state, file) => {
    await page.clock.runFor(700); // the board's next frames
    // CSS animations (a lane sliding in, a fade) run on real time: let them finish.
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
    states[state] = await page.evaluate(measure);
    if (w === 1920 || w === 1280) await page.screenshot({ path: path.join(OUT, `${file}-${name}.png`) });
  };
  try {
    await page.clock.install();
    await page.goto(BASE);
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
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
    if (!await until(page, () => /^22:1[89]/.test(document.querySelector(".cell-clock")?.textContent || ""))) throw new Error("the night did not reach 22:18");
    await snap("22:18, after the correction", "03-correction");
    if (!await until(page, () => /^02:0[1-3]/.test(document.querySelector(".cell-clock")?.textContent || ""))) throw new Error("the night did not reach 02:01");
    await snap("02:01, the express order", "04-express");
    await page.click("#tab-kpiboard");
    await snap("02:01, drawer open", "05-drawer");
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
  if (errors.length) extra.push(`page errors: ${errors.join(" | ")}`);
  if (external.length) extra.push(`external requests: ${external.join(", ")}`);
  results.push({ name: `${name}: five states, no error, no external request`, ok: extra.length === 0, problems: extra });
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
