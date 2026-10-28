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
  ["The legend's person (merlot icon) on the canvas", "accent-text", "bg-sunken", "mark"],
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
  ["The robot below its rule: the moment's stripe on its tint", "danger-solid", "danger-bg", "mark"],
  ["The night's end: the moment's stripe on the card", "success-solid", "surface", "mark"],
  ["Goods by the robot: a tile's stripe and bar, on the tile", "neutral-solid", "surface", "mark"],
  ["Goods by hand: a tile's stripe, on the tile", "border-strong", "surface", "mark"],
  ["Goods by hand: a tile's bar on its track", "border-strong", "bg-subtle", "mark"],
  ["What the model learned: a correction's stripe on the canvas", "info-solid", "bg-sunken", "mark"],
  ["What the model learned: an unknown item's stripe on the canvas", "warning-text", "bg-sunken", "mark"],
  ["What the model learned: a person's stripe on the canvas", "accent", "bg-sunken", "mark"],
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
