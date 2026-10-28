// What differs between the four prototypes in the shared Vici tests (tests/tokens.mjs,
// tests/hexagon.mjs, tests/page-icon.mjs and tests/vici-files.mjs). Those four files are the same in
// Rebate Hunter, Navigator, Timetable Translator and Repack Pilot; this file is the one place that is
// not. Everything here is Repack Pilot's.

/** The prototype's name, as on its page and on its card on Victor's website. */
export const NAME = "Repack Pilot";

/**
 * Colour pairs only this prototype draws (the shared shell's pairs are in tests/tokens.mjs):
 * [what, foreground token, background token, kind]. kind "text" needs 4.5:1, "mark" (a line, an icon,
 * a control's border, a bar) 3:1 (WCAG 2.2, 1.4.3 and 1.4.11). Tokens are Vici's, without "--vc-".
 */
export const COLOUR_PAIRS = [
  // The cell board (Full view): its canvas (bg-sunken), the stations, lanes and cards on it (surface).
  ["Cell board: the caption, the clock and the stations' names on the canvas", "text", "bg-sunken", "text"],
  ["Cell board: the legend's words on the canvas", "text-muted", "bg-sunken", "text"],
  ["Cell board: the cell line's arrows on the canvas", "text-subtle", "bg-sunken", "mark"],
  ["A store order late: its lane's stripe and its tote's fill, on the lane", "danger-solid", "danger-bg", "mark"],
  ["A store order at risk: its lane's stripe and its tote's fill, on the lane", "warning-text", "warning-bg", "mark"],
  ["A store order on its truck: its lane's stripe, on the lane", "success-solid", "surface", "mark"],
  ["Goods at rest: an open lane's stripe, on the lane", "neutral-solid", "surface", "mark"],
  ["A tote filling (goods at rest), on its track", "neutral-solid", "bg-subtle", "mark"],
  ["A tote on its truck, on its track", "success-solid", "bg-subtle", "mark"],
  ["A tote at risk, on its track", "warning-text", "bg-subtle", "mark"],
  ["A tote late, on its track", "danger-solid", "bg-subtle", "mark"],
  ["The legend's swatches on the canvas: late", "danger-solid", "bg-sunken", "mark"],
  ["The legend's swatches on the canvas: at risk", "warning-text", "bg-sunken", "mark"],
  ["The legend's swatches on the canvas: on its truck", "success-solid", "bg-sunken", "mark"],
  ["The legend's swatches on the canvas: goods at rest", "neutral-solid", "bg-sunken", "mark"],
  ["The legend's swatches on the canvas: a sensor's reading or check", "info-solid", "bg-sunken", "mark"],
  ["The legend's person (its icon in ink) on the canvas", "text", "bg-sunken", "mark"],
  ["A station that reads (camera, scale): its icon in its fjord cell", "info-text", "info-bg", "mark"],
  ["A station's icon in its neutral cell", "text-muted", "bg-subtle", "mark"],
  ["A station with an unknown item: its frame on its tint", "warning-text", "warning-bg", "mark"],
  ["A station whose reading differs: its frame on its tint", "info-solid", "info-bg", "mark"],
  ["The robot below its rule: the station's frame on its tint", "danger-solid", "danger-bg", "mark"],
  ["A grasp that lands: the station's flash on the canvas", "success-solid", "bg-sunken", "mark"],
  ["A grasp that fails: the station's flash on the canvas", "danger-solid", "bg-sunken", "mark"],
  // The world model: the card on the cell board and the Customer view's stage (bg-sunken).
  ["Customer view: the stage's title and the moment's words on the canvas", "text", "bg-sunken", "text"],
  ["Customer view: the lede, the legend and the log's notes on the canvas", "text-muted", "bg-sunken", "text"],
  ["The world model's node: its frame on the canvas", "neutral-solid", "bg-sunken", "mark"],
  ["The world model's icon in its neutral cell", "neutral-text", "neutral-bg", "mark"],
  ["A reading or a check: a node's or a tile's frame on its tint", "info-solid", "info-bg", "mark"],
  ["An item the model does not know: its frame on its tint", "warning-text", "warning-bg", "mark"],
  ["A person: a node's, a tile's or the moment's frame on its tint", "accent", "accent-soft", "mark"],
  ["A person: the moment's words and the tile's name on the soft merlot tint", "text", "accent-soft", "text"],
  ["A person: a node's second line and a tile's details on the soft merlot tint", "text-muted", "accent-soft", "text"],
  ["The robot below its rule: the moment's stripe on its tint", "danger-solid", "danger-bg", "mark"],
  ["The night's end: the moment's stripe on the card", "success-solid", "surface", "mark"],
  ["Goods by the robot: a tile's stripe and bar, on the tile", "neutral-solid", "surface", "mark"],
  ["Goods by hand: a tile's stripe, on the tile", "border-strong", "surface", "mark"],
  ["Goods by hand: a tile's bar on its track", "border-strong", "bg-subtle", "mark"],
  ["What the model learned: a correction's stripe on the canvas", "info-solid", "bg-sunken", "mark"],
  ["What the model learned: an unknown item's stripe on the canvas", "warning-text", "bg-sunken", "mark"],
  ["What the model learned: a person's stripe (ink) on the canvas", "text", "bg-sunken", "mark"],
  ["The Simulated cell tag: its capsule's outline on the canvas", "border-strong", "bg-sunken", "mark"],
  ["Synthetic: the tag's dashed outline", "text-muted", "surface", "mark"],
  ["Synthetic: the tag's dashed outline on the canvas", "text-muted", "bg-sunken", "mark"],
  // What it is worth, the KPI board and the Assumptions tab (surface).
  ["What it is worth: the bar by hand (Vici's data 8), on its track", "data-8", "bg-subtle", "mark"],
  ["What it is worth: the hybrid cell's bar (Vici's data 2), on its track", "data-2", "bg-subtle", "mark"],
  ["KPI board: Tonight's figures (the simulation's readings) on the panel", "info-text", "surface", "text"],
  ["Your DC: the presenter's inputs, its merlot title on its tint", "accent-text", "surface-hover", "text"],
  ["An assumption a person changed: its input's merlot border", "accent", "surface", "mark"],
  // The options: what happens to the trucks, and the cost bars.
  ["An option's outcome: its stripe on its tint (no truck missed)", "success-solid", "success-bg", "mark"],
  ["An option's outcome: its stripe on its tint (some nights miss one)", "warning-text", "warning-bg", "mark"],
  ["An option's outcome: its stripe on its tint (a truck missed every night)", "danger-solid", "danger-bg", "mark"],
  ["Cost bars: the extra labour (fjord), on its track", "info-solid", "bg-subtle", "mark"],
  ["Cost bars: the late store orders, on its track", "warning-text", "bg-subtle", "mark"],
  ["Cost bars: doing nothing, on its track", "danger-solid", "bg-subtle", "mark"],
  // The intro: the world model's four steps, each number on its hexagon (Checks and Asks take the
  // shell's info and merlot tints).
  ["The intro's step Knows: its number on its neutral hexagon", "text", "neutral-bg", "text"],
  ["The intro's step Learns: its number on its neutral solid hexagon", "neutral-on-solid", "neutral-solid", "text"],
  // The night console: the marks of the night's entries and its closing report (surface).
  ["Night console: a sensor's correction (fjord mark)", "info-text", "surface", "mark"],
  ["Night console: an item handed to a person (merlot mark)", "accent-text", "surface", "mark"],
  ["Night console: the agent's wake-up (lilac mark)", "feature-text", "surface", "mark"],
  ["Night console: the closing report's stripe, on time", "success-solid", "surface", "mark"],
  ["Night console: the closing report's stripe, late", "danger-solid", "surface", "mark"]
];

/**
 * Colours that must stay apart, beyond the shared ones in tests/tokens.mjs: [what, token, token].
 * The test reports how far apart they stay under colour-vision deficiency; it does not fail on them.
 */
export const SEPARATIONS = [
  ["Cost bars: the late store orders (warning) vs doing nothing (danger)", "warning-text", "danger-solid"],
  ["What it is worth: by hand (data 8) vs the hybrid cell (data 2)", "data-8", "data-2"],
  ["Goods: by the robot (neutral solid) vs by hand (the strong border's grey)", "neutral-solid", "border-strong"],
  ["A reading (fjord) vs an item at risk (warning)", "info-solid", "warning-text"],
  ["A person (merlot frame) vs a reading (fjord)", "accent", "info-solid"]
];

/**
 * The hexagon test's tour of the app (tests/hexagon.mjs): the start screen with the intro, both views at
 * rest, the dialogs, the drawer's tabs, scenario 3 in the Customer view, scenario 1 in the Full view to
 * its end, and a night preview. The page has just been opened, without SKIP_INTRO, so the intro opens by
 * itself over the Customer view. visit(name, { settle }) checks the page as it is, settle ms (250) after
 * the step.
 */
export async function hexagonTour(page, visit) {
  const approve = '.option-card[data-recommended="true"] [data-action="approve"]';
  const status = () => page.evaluate(() => document.querySelector(".status-pill .text")?.textContent.trim() || "");
  const waitStatus = (text, timeout = 240000) => page.waitForFunction((t) => document.querySelector(".status-pill .text")?.textContent.trim() === t, text, { timeout });
  const scenario = async (id) => { await page.click("#dd-scenario"); await page.click(`.vc-menu__item[data-id="${id}"]`); };
  const startSimulation = async () => {
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
  };
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  await page.waitForSelector(".intro-modal", { timeout: 10000 });
  await visit("start screen with the intro");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".intro-modal", { state: "detached", timeout: 5000 });
  await visit("Customer view at rest");
  // The Full view at rest, a station's details, the KPI board and the assumptions.
  await page.click('button[aria-label="Full view"]');
  await page.waitForSelector(".cell-board", { state: "visible", timeout: 5000 });
  await visit("Full view at rest");
  await page.click('.station[data-station="cell"]');
  await page.waitForSelector(".cell-pop:not([hidden])", { timeout: 5000 });
  await visit("a station's details");
  await page.keyboard.press("Escape");
  await page.click("#tab-kpiboard");
  await visit("KPI board");
  await page.click("#tab-assumptions");
  await visit("Assumptions");
  await page.click(".drawer-toggle");
  await page.click("#btn-diagnostics");
  await page.waitForSelector(".diag-table", { timeout: 5000 });
  await visit("Diagnostics");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".diag-table", { state: "detached", timeout: 5000 });
  // The mode dialog and the key dialog behind the live card.
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card", { timeout: 5000 });
  await visit("mode dialog");
  await page.click('.mode-card[data-mode="live"] .mode-cta button');
  await page.waitForSelector("#api-key-input", { timeout: 5000 });
  await visit("key dialog");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#api-key-input", { state: "detached", timeout: 5000 });
  if (await page.$(".mode-card")) { await page.keyboard.press("Escape"); await page.waitForSelector(".mode-card", { state: "detached", timeout: 5000 }); }
  // Scenario 3 in the Customer view: at ×1 until the scale's reading is checked against the model, then
  // at ×4 to the confirmation that waits for you, and on to the end of the night.
  await page.click('button[aria-label="Customer view"]');
  await scenario("SC3-UNKNOWN");
  await page.click('button[aria-label="Night speed ×1"]');
  await startSimulation();
  await page.waitForFunction(() => document.querySelector(".ws-moment")?.dataset.kind === "learned", null, { timeout: 120000 });
  await visit("Customer view, the scale's reading checked", { settle: 50 });
  await page.click('button[aria-label="Night speed ×4"]');
  await page.waitForSelector("#ws-confirm", { state: "visible", timeout: 240000 });
  await visit("Customer view, the confirmation waits for you");
  await page.click("#ws-confirm");
  await waitStatus("Done");
  await page.waitForTimeout(800);
  await visit("Customer view, the night over");
  // Scenario 1 in the Full view: the decision, the drafts and the finished run with its audit.
  await page.click('button[aria-label="Full view"]');
  await scenario("SC1-EXPRESS");
  await startSimulation();
  await page.waitForSelector(approve, { state: "visible", timeout: 240000 });
  await page.waitForTimeout(800);
  await visit("decision");
  await page.click(approve);
  await page.waitForSelector("#btn-approve-all", { state: "visible", timeout: 120000 });
  await page.waitForTimeout(800);
  await visit("drafts");
  await page.click("#btn-approve-all");
  await waitStatus("Done");
  await page.waitForTimeout(800);
  await visit("finished");
  await page.click("#tab-audit");
  await visit("finished, audit");
  await page.click(".drawer-toggle");
  await page.waitForTimeout(1500);
  await visit("finished, drawer hidden");
  await page.click("#btn-open-report");
  await page.waitForSelector(".report-modal", { timeout: 5000 });
  await visit("management summary");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".report-modal", { state: "detached", timeout: 5000 });
  // A scenario without a scripted replay plays as a NIGHT PREVIEW.
  await scenario("SC2-GLASS");
  await page.evaluate(() => { delete window.SIM_RUNS["SC2-GLASS"]; });
  await startSimulation();
  await waitStatus("Night preview", 10000);
  await page.waitForTimeout(1500);
  await visit("night preview");
  if (await status() !== "Done") await page.click("#btn-abort");
}

/**
 * The page icon (tests/page-icon.mjs): the icon and kind of this prototype's card on Victor's website
 * (VictorPflueger/VIP, data/prototypes.js), the colour of that kind's cell (Vici's teal for a
 * tech-showcase), and favicon.svg exactly: the card's cell drawn for small sizes.
 */
export const PAGE_ICON = {
  icon: "layers",
  kind: "showcase",
  tone: "teal",
  favicon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 103.92">
  <!-- Repack Pilot's page icon: Vici's layers icon in a teal hexagon cell, the same as its card
       on Victor Pflüger's website (icon and kind: VictorPflueger/VIP, data/prototypes.js). Vici's
       teal 100 (#dcf3f3) and teal 900 (#003538); the icon is drawn larger and bolder
       than on the card so that it still reads at 16 px. -->
  <polygon points="120,51.96 90,103.92 30,103.92 0,51.96 30,0 90,0" fill="#dcf3f3"/>
  <g transform="translate(18 9.96) scale(3.5)" fill="none" stroke="#003538" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.5 8.5 L7.5 4.5 H16.5 L20.5 8.5 L16.5 12.5 H7.5 Z M3.5 12.5 L7.5 16.5 H16.5 L20.5 12.5 M3.5 16.5 L7.5 20.5 H16.5 L20.5 16.5"/>
  </g>
</svg>
`
};
