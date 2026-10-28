// Layout suite (Chromium): the five window sizes from a 1080p projector down to a small laptop
// (1920×1080, 1600×900, 1536×864, 1366×768, 1280×720), each in eight states of scenario 1's scripted
// replay: idle; idle with the drawer open; the glass jar's correction (22:17); the express order (02:00,
// thirteen lanes, two stores at risk); that moment with the drawer open on the KPI board (the board's
// smallest sizes, strip mode at 1280×720); the three costed options in the drawer; option B approved,
// its drafts in the Outbox; and the night's end with the KPI board open on what it is worth, whose Your
// DC inputs are in view and at least 40 px high. All but the idle ones are taken while the night stands still for
// the agent's turn or the presenter's decision, so the clock carries its pause ("· paused", or a pause
// mark in the short and strip sizes).
// In every state: no horizontal overflow, the header tiles in view and never covered, the header at
// most 14 % of the window's height, a one-row control bar, the header badges clear of each other, the
// board's caption (its title on one line), world-model chip, clock and Simulated cell tag inside the
// panel and clear of each other, every store lane whole and in view, the board fitting its panel, its
// Synthetic label in view, and every target at least 40 px (44 px on the board). With the options (three
// and "Do nothing") or the drafts open: every card inside the drawer's panel and not clipping its
// content, the cards clear of each other, and a card's buttons wholly in view once scrolled to. At 02:00 the store-order figures must equal
// the scripted replay's night computed here in Node: the header tile (on their truck or safely
// projected, the stores at risk beneath) and the KPI board's Tonight row (trucks gone so far, orders
// still open). The night runs on Playwright's clock, paused after boot: it moves only when the suite
// advances it, so it stands still while a state is measured and every size meets the same moments.
// The Customer view (TECH_NOTES D62) at the same five sizes, in seven states of scenario 3 (idle; idle
// with the KPI board open; the jar at 22:17; the unknown item waiting for the person; the entry confirmed;
// night over; Your DC, which opens the KPI board on a short window): no horizontal overflow, the header as
// above, the world model fitting its panel with its parts, stations and items whole and clear of each
// other (with the drawer open: strip or flow, tonight's pallet stepped aside), its Synthetic label and
// Simulated cell tag in view, What it is worth fitting beside it (with the drawer open: fitting or
// stepped aside) and the console at least 200 px high, Confirm entry and Reject in view, Your DC's
// inputs whole in view and at least 40 px, every target at least 40 px.
// Usage: node tests/layout.mjs [case…]   (cases: the sizes, for example 1280x720, or customer-1280x720)
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { APP_ROOT, outDir, ONLY, launchBrowser, serveStatic, NETWORK_NOISE, SKIP_INTRO, M4_SCREEN, VIEWPORTS } from "./lib/harness.mjs";

// Scenario 1's scripted replay in Node (option B approved at 02:00), for the store-order figures at the
// 02:00 pause: the night as played up to the decision is the same on every path (the agent closes
// Essen's tote at 22:17 on all of them), and a decision changes only what follows it.
const NS = await import(pathToFileURL(path.join(APP_ROOT, "js/nightsim.js")).href);
const { replayScenario1 } = await import(pathToFileURL(path.join(APP_ROOT, "tests/lib/scenario1.mjs")).href);
const SC1_B = await replayScenario1({ option: "B" });
const NIGHT1 = SC1_B.replay.session.night;
const RES1 = SC1_B.replay.session.run;
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
    sub: late ? `${late} late${risk ? ` · ${risk} at risk` : ""}` : risk ? `projected · ${risk} at risk` : "projected · on their trucks",
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
  const head = [board.querySelector(".cell-caption"), board.querySelector(".wm-chip"), board.querySelector(".cell-clock"), board.querySelector(".sim-cell-tag")].filter(shown);
  const lines = (el) => { if (!el) return 0; const range = document.createRange(); range.selectNodeContents(el); return new Set([...range.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size; };
  const headBoxes = head.map(r);
  const lanes = [...board.querySelectorAll(".lane")].map((l) => ({ id: l.dataset.order, whole: inside(r(l), bodyBox) && inside(r(l), panel), shown: shown(l) }));
  const synthetic = [...board.querySelectorAll('.tag-synthetic')].some((c) => shown(c) && inside(r(c), panel));
  const tag = board.querySelector(".sim-cell-tag");
  const targets = [...document.querySelectorAll("button, a[href]")].filter((e) => shown(e) && !e.closest(".skip-link"))
    .filter((e) => { const b = r(e); return b.bottom > 0 && b.top < innerHeight; })
    .map((e) => ({ e, b: r(e), min: e.closest(".cell-board") && !e.closest(".cell-pop") ? 44 : 40 }))
    .filter(({ b, min }) => b.width < min || b.height < min)
    .map(({ e, b }) => `${(e.textContent.trim() || e.getAttribute("aria-label") || "").slice(0, 24)} ${Math.round(b.width)}×${Math.round(b.height)}`);
  // The drawer's cards (options or drafts) when its panel is open: inside the panel's width, clear of
  // each other; scrolled into view one by one, every button of a card is wholly in view.
  const openPanel = [...document.querySelectorAll(".drawer-panel")].find((p) => !p.hidden && document.getElementById("drawer")?.dataset.open === "true");
  const cards = openPanel ? [...openPanel.querySelectorAll(".option-card, .action-card")].filter(shown) : [];
  const cardBoxes = cards.map(r);
  const panelBox = openPanel ? r(openPanel) : null;
  const cardProblems = [];
  cards.forEach((c, i) => {
    const b = cardBoxes[i];
    if (b.left < panelBox.left - 1 || b.right > panelBox.right + 1) cardProblems.push(`${c.dataset.id || i} wider than the panel`);
    if (cardBoxes.some((o, j) => j !== i && overlap(b, o))) cardProblems.push(`${c.dataset.id || i} overlaps another card`);
    if (c.scrollWidth > c.clientWidth + 1) cardProblems.push(`${c.dataset.id || i} clips its content`);
  });
  // Your DC on the KPI board: both inputs shown inside the drawer's panel, at least 40 px high.
  const dc = [...document.querySelectorAll(".kb-dc-input")].filter(shown).map((e) => ({ h: Math.round(r(e).height), inside: openPanel ? inside(r(e), r(openPanel)) : false }));
  return {
    dc,
    cards: cards.length, cardProblems, panelId: openPanel?.id || null,
    size: board.dataset.size, legend: board.dataset.legend, clock: board.querySelector(".cell-clock")?.textContent, viewH: innerHeight,
    hOverflow: document.documentElement.scrollWidth > innerWidth,
    oneRow, badgesClear, headerHeight: Math.round(r(document.querySelector(".app-header")).height),
    tiles,
    headInside: headBoxes.every((b) => inside(b, panel)),
    headClear: headBoxes.every((a, i) => headBoxes.every((b, j) => i === j || !overlap(a, b))),
    titleLines: lines(board.querySelector(".cell-title")),
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
  const lanesWanted = state.startsWith("02:00") || state.startsWith("06:00") ? 13 : 12;
  return [
    [m.hOverflow === false, "no horizontal overflow"],
    [m.oneRow, "one-row control bar"],
    // The header holds the four tiles: at most 14 % of the window's height (about 100 px at 720 px).
    [m.badgesClear && m.headerHeight <= Math.round(0.14 * m.viewH), `header badges clear of each other, header ${m.headerHeight} px of ${m.viewH}`],
    [(m.tiles || []).length === 4 && tileProblems.length === 0, `four header tiles in view, never covered, values whole${bad(tileProblems)}`],
    [m.headInside && m.headClear, "the board's caption, chip, clock and Simulated cell tag inside the panel and clear of each other"],
    [m.titleLines === 1, `the caption's title on one line (${m.titleLines})`],
    [m.laneCount === lanesWanted && laneProblems.length === 0, `${lanesWanted} store lanes, each whole and in view (${m.laneCount})${bad(laneProblems)}`],
    [m.fits, `the board fits its panel (size ${m.size})`],
    [m.synthetic && m.tagShown, "the Synthetic label and the Simulated cell tag in view"],
    [(m.smallTargets || []).length === 0, `targets at least 40 px, 44 px on the board${bad(m.smallTargets || [])}`],
    ...(state.endsWith("options") ? [[m.panelId === "panel-options" && m.cards === 4 && m.cardProblems.length === 0 && (m.buttonsInView || []).length === 4 && m.buttonsInView.every(Boolean), `three option cards and "Do nothing" in the Options panel, whole, clear of each other, their buttons in view when scrolled to (${m.panelId}, ${m.cards}${bad(m.cardProblems)}; ${JSON.stringify(m.buttonsInView)})`]] : []),
    ...(state.endsWith("worth") ? [[m.panelId === "panel-kpiboard" && (m.dc || []).length === 2 && m.dc.every((x) => x.h >= 40 && x.inside), `the KPI board opens with Your DC, both inputs in view and at least 40 px high (${JSON.stringify(m.dc)})`]] : []),
    ...(state.endsWith("drafts") ? [[m.panelId === "panel-outbox" && m.cards === 2 && m.cardProblems.length === 0 && (m.buttonsInView || []).length === 2 && m.buttonsInView.every(Boolean), `two drafts in the Outbox, whole, clear of each other, their buttons in view when scrolled to (${m.panelId}, ${m.cards}${bad(m.cardProblems)}; ${JSON.stringify(m.buttonsInView)})`]] : [])
  ];
}

/** Scrolls each card of the open drawer panel into view; true for each whose buttons are then wholly in view. */
const cardButtonsInView = () => {
  const p = [...document.querySelectorAll(".drawer-panel")].find((x) => !x.hidden);
  const cards = p ? [...p.querySelectorAll(".option-card, .action-card")] : [];
  const out = cards.map((c) => {
    c.scrollIntoView({ block: "nearest" });
    const btns = [...c.querySelectorAll("button")].filter((b) => b.offsetParent !== null);
    const pb = p.getBoundingClientRect();
    return btns.length > 0 && btns.every((b) => { const r = b.getBoundingClientRect(); return r.top >= Math.max(0, pb.top) - 1 && r.bottom <= Math.min(innerHeight, pb.bottom) + 1 && r.left >= 0 && r.right <= innerWidth; });
  });
  if (p) p.scrollTop = 0;
  return out;
};

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
  await context.addInitScript(M4_SCREEN);
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
    if (states[state].cards) states[state].buttonsInView = await page.evaluate(cardButtonsInView);
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
    await page.click(".drawer-toggle");
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
    // The express order at 02:00: the night stands still for the agent's turn (W4); both states are
    // taken at its start, the second after the drawer has opened on the KPI board.
    if (!await until(page, () => /^02:00 · paused$/.test(document.querySelector(".cell-clock")?.textContent.trim() || ""))) throw new Error("the night did not pause at 02:00");
    await snap("02:00, the express order", "04-express", 100);
    figures.push(["02:00", await readStoreOrders()]);
    await page.click("#tab-kpiboard");
    await snap("02:00, drawer open", "05-drawer", 400);
    figures.push(["02:00, drawer open", await readStoreOrders()]);
    // The turn ends with three costed options: the drawer turns to them, the night still stands.
    if (!await until(page, () => !!document.querySelector('#panel-options:not([hidden]) .option-card[data-id="B"] [data-action="approve"]'))) throw new Error("no options at 02:00");
    await snap("02:00, options", "06-options", 400);
    await page.click('.option-card[data-id="B"] [data-action="approve"]');
    if (!await until(page, () => document.querySelectorAll("#panel-outbox:not([hidden]) .action-card").length === 2 && !!document.querySelector("#btn-approve-all"))) throw new Error("no drafts after option B");
    await snap("02:00, drafts", "07-outbox", 400);
    // The night's end: the drafts approved, the night runs on to 06:00, the KPI board opens on what it
    // is worth (the closing card's button).
    await page.click("#btn-approve-all");
    if (!await until(page, () => document.querySelector(".status-pill .text")?.textContent.trim() === "Done", 240000)) throw new Error("the night did not end");
    await page.click("#btn-console-your-dc");
    await snap("06:00, what it is worth", "08-worth", 400);
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
  if (Object.keys(states).length !== 8) extra.push(`${Object.keys(states).length} of 8 states measured`);
  if (!dispatchAtCutoff) extra.push("the simulation does not dispatch every order at its cut-off on a whole minute");
  // The tile at both states; the KPI board's row once its panel is open (it renders 250 ms after a change).
  for (const [when, got] of figures) {
    const want = when === "02:00" ? { ...AT_0200, row: got.row } : AT_0200;
    if (JSON.stringify(got) !== JSON.stringify(want)) extra.push(`store orders at ${when}: ${JSON.stringify(got)}, the simulation says ${JSON.stringify(want)}`);
  }
  if (figures.length !== 2 && !failed) extra.push(`${figures.length} of 2 store-order readings`);
  if (errors.length) extra.push(`page errors: ${errors.join(" | ")}`);
  if (external.length) extra.push(`external requests: ${external.join(", ")}`);
  results.push({ name: `${name}: eight states, store orders at 02:00 as the replay's night, no error, no external request`, ok: extra.length === 0, problems: extra, figures, expected: AT_0200 });
  await context.close();
}

// ---- the Customer view (TECH_NOTES D62): scenario 3, the five-minute run -------------------------------------
/** What the Customer view's layout must hold, measured in the page. */
const measureCustomer = () => {
  const r = (el) => el.getBoundingClientRect();
  const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  const shown = (e) => e && e.offsetParent !== null && getComputedStyle(e).visibility !== "hidden" && r(e).width > 0;
  const controls = [...document.getElementById("controls").children].filter((e) => shown(e) && !e.classList.contains("spacer"));
  const first = r(controls[0]);
  const oneRow = controls.every((e) => { const b = r(e); return b.top < first.bottom && b.bottom > first.top; });
  const badges = [...document.querySelectorAll(".header-badges > *")].filter(shown).map(r);
  const tiles = [...document.querySelectorAll(".kpi")].map((t) => {
    const b = r(t);
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const v = t.querySelector(".kpi-value");
    return { id: t.id, ok: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth && t.contains(hit) && v.scrollWidth <= v.clientWidth + 1 };
  });
  const stage = document.querySelector(".world-stage");
  const inner = document.querySelector(".world-stage-inner");
  const stageBox = r(stage);
  const parts = [".ws-head", ".ws-flow", ".ws-moment", ".ws-pallet", ".ws-learned"].map((s) => document.querySelector(s)).filter(shown);
  const partBoxes = parts.map(r);
  const nodes = [...document.querySelectorAll(".ws-node")].filter(shown).map(r);
  const items = [...document.querySelectorAll(".ws-item")].map((e) => ({ key: e.dataset.key, box: r(e), shown: shown(e) }));
  const worth = document.querySelector(".worth-panel");
  const cons = document.querySelector(".console-panel");
  const worthShown = shown(worth);
  const drawerOpen = document.getElementById("drawer")?.dataset.open === "true";
  // The workspace's parts stay inside it: nothing spills over the drawer's tabs below it.
  const ws = r(document.querySelector(".workspace"));
  const drawerTop = r(document.getElementById("drawer")).top;
  const mainInside = [stage, worth, cons].filter(shown).every((e) => inside(r(e), ws)) && ws.bottom <= drawerTop + 1;
  const actions = [...document.querySelectorAll(".wsm-actions button")].filter(shown).map(r);
  // Your DC's inputs: in What it is worth, or on the KPI board in the drawer; whole inside the box that
  // shows them (the panel, or the drawer's scrolling body) and inside the window.
  const dcInputs = [...document.querySelectorAll(".wp-dc-input, .kb-dc-input")].filter((e) => shown(e) && (drawerOpen || !e.closest("#drawer"))).map((e) => {
    const b = r(e);
    const box = r(e.closest(".drawer-body") || worth);
    return { h: Math.round(b.height), inView: b.top >= 0 && b.bottom <= innerHeight && inside(b, box) };
  });
  const targets = [...document.querySelectorAll("button, a[href], input")].filter((e) => shown(e) && !e.closest(".skip-link"))
    .filter((e) => { const b = r(e); return b.bottom > 0 && b.top < innerHeight; })
    .filter((e) => { const b = r(e); return b.width < 40 || b.height < 40; })
    .map((e) => `${(e.textContent.trim() || e.getAttribute("aria-label") || e.id || "").slice(0, 24)} ${Math.round(r(e).width)}×${Math.round(r(e).height)}`);
  // Text cut off with an ellipsis in the world model or What it is worth: an item's name, a station's line,
  // the moment's label, a line of what the model learned, a figure (the header's tiles are checked above).
  const cut = [...document.querySelectorAll(".world-stage *, .worth-panel *")].filter((e) => {
    if (!shown(e) || e.closest(".visually-hidden") || !e.textContent.trim()) return false;
    const cs = getComputedStyle(e);
    return (cs.textOverflow === "ellipsis" || (cs.overflowX === "hidden" && cs.whiteSpace === "nowrap")) && e.scrollWidth > e.clientWidth + 1;
  }).map((e) => `"${e.innerText.trim().slice(0, 32)}" ${e.scrollWidth}>${e.clientWidth}`);
  // The console's idle hint says "The five steps above" only where the progress rail is shown.
  const railRef = document.querySelector(".idle-rail-ref");
  return {
    view: document.body.dataset.view, size: inner?.dataset.size, worthSize: worth?.dataset.size || "full", viewH: innerHeight, cut,
    railHint: !railRef || Boolean(shown(document.querySelector("#console .rail"))) === Boolean(shown(railRef)),
    hOverflow: document.documentElement.scrollWidth > innerWidth,
    oneRow, badgesClear: badges.every((a, i) => badges.every((b, j) => i === j || !overlap(a, b))),
    headerHeight: Math.round(r(document.querySelector(".app-header")).height),
    tilesOk: tiles.length === 4 && tiles.every((x) => x.ok),
    stageFits: inner.scrollHeight <= inner.clientHeight + 1,
    partsInside: partBoxes.every((b) => inside(b, stageBox)), partsClear: partBoxes.every((a, i) => partBoxes.every((b, j) => i === j || !overlap(a, b))),
    nodes: nodes.length, nodesClear: nodes.every((a, i) => nodes.every((b, j) => i === j || !overlap(a, b))) && nodes.every((b) => inside(b, stageBox)),
    items: items.length, itemsWhole: items.every((x) => x.shown && inside(x.box, stageBox)), itemsClear: items.every((a, i) => items.every((b, j) => i === j || !overlap(a.box, b.box))),
    palletShown: shown(document.querySelector(".ws-pallet")), learnedShown: shown(document.querySelector(".ws-learned")), drawerOpen,
    mainInside, workspaceH: Math.round(ws.height),
    synthetic: [...stage.querySelectorAll('.tag-synthetic')].some((c) => shown(c) && inside(r(c), stageBox)),
    tag: shown(stage.querySelector(".sim-cell-tag")) && inside(r(stage.querySelector(".sim-cell-tag")), stageBox),
    worthShown, worthFits: worthShown && worth.scrollHeight <= worth.clientHeight + 1,
    worthBesideStage: !overlap(r(cons), stageBox) && (!worthShown || (!overlap(r(worth), stageBox) && !overlap(r(worth), r(cons)))),
    consoleH: Math.round(r(cons).height),
    actions: actions.length, actionsInView: actions.every((b) => inside(b, stageBox) && b.bottom <= innerHeight),
    dcInputs,
    smallTargets: targets
  };
};

function verdictCustomer(m, state) {
  const bad = (list) => list.length ? `: ${list.join(", ")}` : "";
  const itemsWanted = state.startsWith("idle") || state.startsWith("22:17") ? 24 : 25;
  // The drawer open over the stage (the KPI board, or Your DC on a short window): the stage keeps the
  // item's way and the moment (strip or flow, like the cell board's strip), tonight's pallet steps aside,
  // and What it is worth either fits or steps aside for the KPI board, which carries its figures.
  const open = m.drawerOpen;
  return [
    [m.view === "customer" && m.hOverflow === false && m.oneRow, `the Customer view, no horizontal overflow, a one-row control bar (${m.view})`],
    [m.badgesClear && m.headerHeight <= Math.round(0.14 * m.viewH) && m.tilesOk, `header badges clear, header ${m.headerHeight} px of ${m.viewH}, four tiles in view and whole`],
    [m.stageFits && m.partsInside && m.partsClear, `the world model fits its panel, its parts inside and clear of each other (size ${m.size})`],
    [m.nodes === 5 && m.nodesClear, `five stations of the item's way, clear of each other (${m.nodes})`],
    [m.cut.length === 0, `no name, line or figure cut off in the world model or What it is worth${bad(m.cut)}`],
    open
      ? [["strip", "flow"].includes(m.size) && !m.palletShown, `the drawer open: the stage at strip or flow, tonight's pallet stepped aside (${m.size}, pallet ${m.palletShown ? "shown" : "aside"})`]
      : [m.palletShown && m.items === itemsWanted && m.itemsWhole && m.itemsClear, `${itemsWanted} items of tonight's pallet, each whole and clear of the others (${m.items})`],
    [m.synthetic && m.tag, "the Synthetic label and the Simulated cell tag in view"],
    [m.mainInside, `the world model, What it is worth and the console inside the workspace, clear of the drawer's tabs (workspace ${m.workspaceH} px)`],
    open
      ? [(m.worthFits || !m.worthShown) && m.worthBesideStage && m.consoleH >= Math.min(200, m.workspaceH - 1), `the drawer open: What it is worth fits or steps aside (${m.worthSize}), the console at least 200 px or the whole column (${m.consoleH} of ${m.workspaceH})`]
      : [m.worthFits && m.worthBesideStage && m.consoleH >= 200, `What it is worth fits (${m.worthSize}), beside the world model, the console at least 200 px (${m.consoleH})`],
    ...(state.includes("waiting for you") ? [[m.actions === 2 && m.actionsInView, `Confirm entry and Reject in view in the world model (${m.actions})`]] : []),
    ...(state.startsWith("idle") ? [[m.railHint, "the console's idle hint names the progress rail only where the rail is shown"]] : []),
    ...(state.includes("Your DC") ? [[m.dcInputs.length === 2 && m.dcInputs.every((x) => x.h >= 40 && x.inView), `Your DC's two inputs in view, at least 40 px high (${JSON.stringify(m.dcInputs)})`]] : []),
    [(m.smallTargets || []).length === 0, `targets at least 40 px${bad(m.smallTargets || [])}`]
  ];
}

for (const [w, hgt] of VIEWPORTS) {
  const name = `${w}x${hgt}`;
  if (ONLY.length && !ONLY.includes(name) && !ONLY.includes(`customer-${name}`)) continue;
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
  const settle = () => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
  const snap = async (state, file, advance = 700) => {
    await page.clock.runFor(advance);
    await settle();
    await page.clock.runFor(50);
    await settle();
    states[state] = await page.evaluate(measureCustomer);
    if (w === 1920 || w === 1280) await page.screenshot({ path: path.join(OUT, `customer-${file}-${name}.png`) });
  };
  try {
    await page.clock.install();
    await page.goto(BASE);
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    await page.clock.pauseAt(Date.now() + 500);
    await page.clock.runFor(1000);
    await snap("idle", "01-idle");
    await page.click("#tab-kpiboard");
    await snap("idle, the KPI board open", "01b-idle-drawer", 400);
    await page.click(".drawer-toggle");
    await page.clock.runFor(600);
    await page.click('button[aria-label="Night speed ×1"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card");
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.$$eval(".banner", (els) => els.forEach((e) => e.remove()));
    if (!await until(page, () => document.querySelector(".ws-moment")?.dataset.kind === "learned")) throw new Error("the night did not reach the jar");
    await snap("22:17, the model learns", "02-jar", 100);
    if (!await until(page, () => !!document.querySelector("#ws-confirm"), 240000)) throw new Error("the world model did not ask");
    await snap("23:10, the unknown item waiting for you", "03-confirm", 100);
    await page.click("#ws-confirm");
    await snap("23:10, the entry confirmed", "04-decided", 100);
    if (!await until(page, () => document.querySelector(".status-pill .text")?.textContent.trim() === "Done", 240000)) throw new Error("the night did not end");
    await snap("06:00, night over", "05-end", 400);
    // Your DC: in What it is worth, or on a short window the KPI board its button opens.
    if (await page.isVisible("#wp-dc-N")) await page.focus("#wp-dc-N");
    else await page.click("#wp-dc-open");
    await snap("06:00, Your DC", "06-yourdc", 400);
  } catch (err) {
    failed = String(err.message).split("\n")[0];
    await page.screenshot({ path: path.join(OUT, `customer-fail-${name}.png`) }).catch(() => {});
  }
  for (const [state, m] of Object.entries(states)) {
    const problems = verdictCustomer(m, state).filter(([ok]) => !ok).map(([, msg]) => msg);
    results.push({ name: `${name}, Customer view, ${state} (stage ${m.size}, worth ${m.worthSize})`, ok: problems.length === 0, problems, m });
  }
  const extra = [];
  if (failed) extra.push(`exception: ${failed}`);
  if (Object.keys(states).length !== 7) extra.push(`${Object.keys(states).length} of 7 states measured`);
  if (errors.length) extra.push(`page errors: ${errors.join(" | ")}`);
  if (external.length) extra.push(`external requests: ${external.join(", ")}`);
  results.push({ name: `${name}: the Customer view in seven states of scenario 3, no error, no external request`, ok: extra.length === 0, problems: extra });
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
