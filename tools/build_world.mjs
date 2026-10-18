// Builds the synthetic world of Repack Pilot (developer tool; the app itself needs no build step and
// loads the generated files).
//   node tools/build_world.mjs           write data/world.js and data/shadow_record.js
//   node tools/build_world.mjs --check   regenerate in memory and compare with the committed files
//
// Everything here is Synthetic: the retailer Ruhrkorb, its DC in Unna, the twelve stores, tonight's
// orders, the item master, the robot cell and the shadow-mode record. The towns are real places in
// the Ruhr area and its eastern neighbours (North Rhine-Westphalia); no store, person or company in
// them is described. The tables below are the ones in PLAN.md §b (approved 16 Oct 2026); the store
// cut-offs and the chilled wave come from the Phase 0 night calibration (PLAN.md §b.8).
//
// The output is deterministic: the allocation of each SKU's units to the stores is an integer
// proportional fit with exact row and column totals, and the shadow record is drawn from a fixed
// seed, so every run writes the same bytes.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
export const WORLD_VERSION = "1.1.0"; // 1.1.0 (M3): the flagship's express truck at 02:45 (TECH_NOTES D32)

// ---- the night -----------------------------------------------------------------------------------
const SHIFT = { start: "22:00", end: "06:00" };
const PEAK_FACTOR = 1.4;           // N2: every store and SKU × 1.4 (brief, scenario 6)
const RISK_BAND_MIN = 15;          // escalation example: projected last unit later than cut-off − 15 min

// Stores in plan order: cut-off first, ties keep this route order (farthest route first).
const STORES = [
  { id: "ESS", name: "Essen", units: 320, cutoff: "01:35", note: "Farthest route, first truck" },
  { id: "GEL", name: "Gelsenkirchen", units: 220, cutoff: "01:40" },
  { id: "BOC", name: "Bochum", units: 300, cutoff: "01:50" },
  { id: "HER", name: "Herne", units: 160, cutoff: "01:55" },
  { id: "HAG", name: "Hagen", units: 240, cutoff: "02:00" },
  { id: "WIT", name: "Witten", units: 230, cutoff: "02:05" },
  { id: "DOR", name: "Dortmund", units: 600, cutoff: "02:30", flagship: true, express_truck: "02:45", note: "Flagship; a second truck at 02:45 takes express orders" },
  { id: "ISE", name: "Iserlohn", units: 180, cutoff: "02:40" },
  { id: "HAM", name: "Hamm", units: 260, cutoff: "02:40" },
  { id: "SOE", name: "Soest", units: 150, cutoff: "02:40" },
  { id: "LUN", name: "Lünen", units: 140, cutoff: "05:40", note: "Short route, second wave" },
  { id: "SCH", name: "Schwerte", units: 200, cutoff: "06:00", note: "Short route, last truck" }
];

// Items: own-label goods of the fictional retailer. Weights in grams (gross, as the item master holds
// them; S07's master holds the label's net content), sizes in millimetres (length × width × height).
// `success` is the cell's per-SKU grasp success (Assumption), calibrated so that the unit-weighted
// mean over the night's cell units equals p = 0.91. Manual-only SKUs say why.
const ITEMS = [
  { sku: "S01", name: "Fusilli pasta 500 g, box", wave: "ambient", master_g: 520, size_mm: [190, 95, 60], fragility: "low", grip: "suction", success: 0.93, units: 180 },
  { sku: "S02", name: "Long-grain rice 1 kg, bag", wave: "ambient", master_g: 1010, size_mm: [200, 120, 60], fragility: "low", grip: "suction", success: 0.93, units: 120 },
  { sku: "S03", name: "Corn flakes 375 g, box", wave: "ambient", master_g: 420, size_mm: [280, 190, 70], fragility: "low", grip: "suction", success: 0.94, units: 140 },
  { sku: "S04", name: "Tomato passata 500 g, glass bottle", wave: "ambient", master_g: 780, size_mm: [70, 70, 200], fragility: "high", grip: "fingers", success: 0.88, units: 110, glass: true },
  { sku: "S05", name: "Kidney beans 400 g, can", wave: "ambient", master_g: 460, size_mm: [75, 75, 110], fragility: "low", grip: "fingers", success: 0.94, units: 160 },
  { sku: "S06", name: "Chopped tomatoes 400 g, can", wave: "ambient", master_g: 460, size_mm: [75, 75, 110], fragility: "low", grip: "fingers", success: 0.93, units: 150 },
  { sku: "S07", name: "Apricot jam 200 g, glass jar", wave: "ambient", master_g: 200, actual_g: 400, size_mm: [75, 75, 90], fragility: "high", grip: "suction on lid", success: 0.87, units: 90, glass: true,
    master_note: "The item master holds the net content printed on the label (200 g); the jar with its glass weighs 400 g (scenario 2)" },
  { sku: "S08", name: "Olive oil 0.5 l, glass bottle", wave: "ambient", master_g: 900, size_mm: [60, 60, 280], fragility: "high", grip: "fingers", success: 0.86, units: 70, glass: true },
  { sku: "S09", name: "Fresh milk 1 l, carton", wave: "chilled", master_g: 1040, size_mm: [70, 70, 195], fragility: "medium", grip: "suction", success: 0.92, units: 200 },
  { sku: "S10", name: "Orange juice 1 l, chilled carton", wave: "chilled", master_g: 1050, size_mm: [70, 70, 195], fragility: "medium", grip: "suction", success: 0.93, units: 110 },
  { sku: "S11", name: "Still water 1.5 l, PET bottle", wave: "ambient", master_g: 1540, size_mm: [90, 90, 310], fragility: "low", grip: "fingers", success: 0.91, units: 150 },
  { sku: "S12", name: "Coffee beans 500 g, valve bag", wave: "ambient", master_g: 520, size_mm: [210, 110, 70], fragility: "medium", grip: "soft", success: 0.89, units: 80 },
  { sku: "S13", name: "Wheat flour 1 kg, paper bag", wave: "ambient", master_g: 1010, size_mm: [160, 100, 60], fragility: "medium", grip: "soft", success: 0.85, units: 90 },
  { sku: "S14", name: "Crisps 175 g, bag", wave: "ambient", master_g: 190, size_mm: [300, 200, 80], fragility: "medium", grip: "soft", success: 0.83, units: 100 },
  { sku: "S15", name: "Black tea, 20 bags, box", wave: "ambient", master_g: 60, size_mm: [130, 70, 70], fragility: "low", grip: "suction", success: 0.95, units: 70 },
  { sku: "S16", name: "Milk chocolate 100 g, bar", wave: "ambient", master_g: 105, size_mm: [160, 80, 15], fragility: "low", grip: "suction", success: 0.92, units: 120 },
  { sku: "S17", name: "Butter biscuits 200 g, pack", wave: "ambient", master_g: 215, size_mm: [200, 60, 50], fragility: "medium", grip: "suction", success: 0.91, units: 80 },
  { sku: "S18", name: "Natural yoghurt 500 g, cup", wave: "chilled", master_g: 530, size_mm: [95, 95, 100], fragility: "medium", grip: "suction", success: 0.9, units: 80 },
  { sku: "S19", name: "Free-range eggs, 10-pack", wave: "chilled", master_g: 650, size_mm: [250, 110, 70], fragility: "very high", grip: null, units: 160, manual_reason: "Very fragile" },
  { sku: "S20", name: "Still water 6 × 1.5 l, shrink pack", wave: "ambient", master_g: 9300, size_mm: [280, 190, 310], fragility: "low", grip: null, units: 120, manual_reason: "Over the cell's payload" },
  { sku: "S21", name: "Potatoes 2.5 kg, net bag", wave: "ambient", master_g: 2520, size_mm: [350, 250, 120], fragility: "low", grip: null, units: 140, manual_reason: "Irregular shape" },
  { sku: "S22", name: "Bananas, about 1 kg, bunch", wave: "chilled", master_g: 1000, size_mm: [250, 180, 100], fragility: "high", grip: null, units: 180, manual_reason: "Irregular shape" },
  { sku: "S23", name: "Red wine 0.75 l, glass bottle", wave: "ambient", master_g: 1250, size_mm: [75, 75, 300], fragility: "high", grip: null, units: 150, glass: true, age_restricted: true, manual_reason: "Fragile and age-restricted" },
  { sku: "S24", name: "Fresh basil, pot", wave: "chilled", master_g: 180, size_mm: [110, 110, 200], fragility: "high", grip: null, units: 150, manual_reason: "Soft plant" }
];

const WAVES = [
  { id: "ambient", label: "Ambient goods", arrives: "22:00", note: "On the inbound pallets when the shift starts" },
  { id: "chilled", label: "Chilled goods", arrives: "01:00", note: "From the fresh hub, mid-shift (Assumption, PLAN.md B2)" }
];

const CELL = {
  id: "CELL-1",
  name: "Repack cell 1",
  attempts_per_hour: 500,          // r_c (Assumption: low end of 500–1,400, manufacturer data, IML)
  payload_g: 3000,                 // Assumption
  sensors: ["3D camera", "Scale under the gripper"],
  grippers: ["Suction", "Two-finger"],
  vendor: null,                    // no vendor is named as the simulated robot
  note: "Simulated cell: no robot, camera or scale is connected"
};

const MANUAL_STATION = { pickers: 1, picks_per_hour: 400, note: "One picker at the manual station; an on-call pool for call-ins" };
const TOTE = { limit_g: 15000, rule: "Heavy items first" };
const ROLES = ["Shift lead", "Picker at the manual station", "On-call picker pool"];

// ---- helpers -------------------------------------------------------------------------------------

/** EAN-13 check digit for 12 digits. */
export function ean13CheckDigit(d12) {
  const sum = [...d12].reduce((s, ch, i) => s + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

/** A restricted circulation number with GS1 prefix 20 for the n-th own-label item. */
function rcn(n) {
  const d12 = `2049000000${String(n).padStart(2, "0")}`;
  return d12 + ean13CheckDigit(d12);
}

/**
 * Integer allocation of each SKU's total across the stores, proportional to store size, with exact
 * row and column totals (the same method as the Phase 0 calibration model, so M2's night simulation
 * reproduces the calibrated night). Returns x[sku][store].
 */
export function allocate(items, stores, factor = 1) {
  const S = stores.map((s) => Math.round(s.units * factor));
  const K = items.map((k) => Math.round(k.units * factor));
  const total = S.reduce((a, b) => a + b, 0);
  if (total !== K.reduce((a, b) => a + b, 0)) throw new Error(`store and SKU totals differ (${total})`);
  const q = items.map((_, j) => stores.map((__, i) => (K[j] * S[i]) / total));
  const x = q.map((row) => row.map(Math.floor));
  for (let j = 0; j < items.length; j++) {
    let left = K[j] - x[j].reduce((a, b) => a + b, 0);
    const order = stores.map((_, i) => i).sort((a, b) => (q[j][b] - x[j][b]) - (q[j][a] - x[j][a]) || a - b);
    for (const i of order) { if (left <= 0) break; x[j][i] += 1; left -= 1; }
  }
  const rowSum = () => S.map((_, i) => x.reduce((a, r) => a + r[i], 0));
  for (let pass = 0; pass < 2000; pass++) {
    const rs = rowSum();
    const over = rs.findIndex((v, i) => v > S[i]);
    const under = rs.findIndex((v, i) => v < S[i]);
    if (over < 0 && under < 0) break;
    const j = x.findIndex((r) => r[over] > 0);
    x[j][over] -= 1;
    x[j][under] += 1;
  }
  return x;
}

/** Deterministic uniform draws in [0, 1) from a seed (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the world -----------------------------------------------------------------------------------

export function buildWorld() {
  const items = ITEMS.map((it, i) => {
    const cell = it.grip !== null;
    return {
      sku: it.sku,
      name: it.name,
      barcode: rcn(i + 1),
      wave: it.wave,
      master_g: it.master_g,
      actual_g: it.actual_g ?? it.master_g,
      size_mm: it.size_mm,
      fragility: it.fragility,
      grip: it.grip,
      cell,
      manual_reason: cell ? null : it.manual_reason,
      success: cell ? it.success : null,
      units_n1: it.units,
      glass: !!it.glass,
      age_restricted: !!it.age_restricted,
      ...(it.master_note ? { master_note: it.master_note } : {})
    };
  });
  const stores = STORES.map((s, i) => ({
    id: s.id,
    name: s.name,
    town: s.name,
    plan_rank: i + 1,
    units_n1: s.units,
    cutoff: s.cutoff,
    flagship: !!s.flagship,
    express_truck: s.express_truck || null,
    note: s.note || null
  }));
  const alloc = (factor) => {
    const x = allocate(ITEMS, STORES, factor);
    const out = {};
    STORES.forEach((s, i) => { out[s.id] = Object.fromEntries(ITEMS.map((k, j) => [k.sku, x[j][i]])); });
    return out;
  };
  return {
    meta: {
      world_version: WORLD_VERSION,
      synthetic: true,
      retailer: "Ruhrkorb",
      retailer_note: "Ruhrkorb, its DC, its stores, tonight's orders, the item master, the robot cell and the shadow record are Synthetic. The towns are real places in North Rhine-Westphalia; no real store, company or person is described.",
      dc: { id: "DC-UNNA", name: "Ruhrkorb DC Unna", town: "Unna", region: "Ruhr area and its eastern neighbours, North Rhine-Westphalia", note: "Fictional DC in a real logistics cluster by the Kamener Kreuz (A1/A2)" },
      shift: SHIFT,
      peak_factor: PEAK_FACTOR,
      risk_band_min: RISK_BAND_MIN,
      generated_by: "tools/build_world.mjs",
      sources: "PLAN.md §b (store and item tables, night calibration), approved 16 Oct 2026"
    },
    stores,
    items,
    waves: WAVES,
    allocation: { n1: alloc(1), n2: alloc(PEAK_FACTOR) },
    cell: CELL,
    manual_station: MANUAL_STATION,
    tote: TOTE,
    roles: ROLES
  };
}

// ---- the shadow-mode record ------------------------------------------------------------------------
// Seven earlier nights in shadow mode: the agent recommended, a person decided, nothing the agent did
// changed the night. 138 decisions, 128 of them the same as the person's (92.8 %), no missed
// escalation, no agent-caused missed cut-off (PLAN.md §b.6). The example gate needs 200 decisions over
// 10 nights at 95 % agreement, so it fails on three counts on purpose.

const SHADOW_NIGHTS = [18, 21, 19, 20, 22, 17, 21];            // decisions per night, 138 in all
const SHADOW_DISAGREEMENTS = 10;
const DECISION_KINDS = [
  ["resequence", "Re-sequence the picks"],
  ["call_in_picker", "Call in a picker"],
  ["split_order", "Split an order between cell and manual station"],
  ["move_to_next_wave", "Move a store's lines to the next wave"],
  ["manual_for_fragile", "Send fragile SKUs to the manual station"],
  ["maintenance_stop", "Stop the cell for maintenance"],
  ["accept_correction", "Accept a world-model correction"],
  ["do_nothing", "Keep the plan"]
];

export function buildShadowRecord() {
  const draw = rng(20261016);
  const total = SHADOW_NIGHTS.reduce((a, b) => a + b, 0);
  // Which decisions the person decided differently: a fixed-seed sample of exactly ten.
  const ids = [...Array(total).keys()];
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(draw() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const disagree = new Set(ids.slice(0, SHADOW_DISAGREEMENTS));
  const decisions = [];
  let n = 0;
  SHADOW_NIGHTS.forEach((count, night) => {
    for (let k = 0; k < count; k++, n++) {
      const kind = DECISION_KINDS[Math.floor(draw() * DECISION_KINDS.length)][0];
      let other = DECISION_KINDS[Math.floor(draw() * DECISION_KINDS.length)][0];
      if (other === kind) other = DECISION_KINDS[(DECISION_KINDS.findIndex((d) => d[0] === kind) + 1) % DECISION_KINDS.length][0];
      const agreed = !disagree.has(n);
      decisions.push({
        id: `SH-${night + 1}-${String(k + 1).padStart(2, "0")}`,
        night: night + 1,
        agent: kind,
        person: agreed ? kind : other,
        agreed,
        escalation_missed: false,
        agent_caused_missed_cutoff: false
      });
    }
  });
  return {
    meta: {
      synthetic: true,
      generated_by: "tools/build_world.mjs",
      note: "Synthetic shadow-mode record: seven earlier nights in which the agent only recommended and a person decided. It falls short of the example gate on purpose, so Bounded stays locked.",
      nights: SHADOW_NIGHTS.length,
      kinds: Object.fromEntries(DECISION_KINDS)
    },
    decisions
  };
}

// ---- output ----------------------------------------------------------------------------------------

/** JSON with one array element or object entry per line at the top two levels: readable diffs. */
function serialize(obj, indent = "  ") {
  const lines = ["{"];
  const keys = Object.keys(obj);
  keys.forEach((k, ki) => {
    const v = obj[k];
    const comma = ki < keys.length - 1 ? "," : "";
    if (Array.isArray(v)) {
      lines.push(`${indent}${JSON.stringify(k)}: [`);
      v.forEach((e, i) => lines.push(`${indent}${indent}${JSON.stringify(e)}${i < v.length - 1 ? "," : ""}`));
      lines.push(`${indent}]${comma}`);
    } else if (v && typeof v === "object") {
      const sub = Object.keys(v);
      lines.push(`${indent}${JSON.stringify(k)}: {`);
      sub.forEach((s, si) => lines.push(`${indent}${indent}${JSON.stringify(s)}: ${JSON.stringify(v[s])}${si < sub.length - 1 ? "," : ""}`));
      lines.push(`${indent}}${comma}`);
    } else {
      lines.push(`${indent}${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`);
    }
  });
  lines.push("}");
  return lines.join("\n");
}

export function files() {
  const world = buildWorld();
  const shadow = buildShadowRecord();
  const worldJs = `/*
 * REPACK PILOT — synthetic world: the fictional retailer Ruhrkorb and its DC in Unna.
 * GENERATED by tools/build_world.mjs: do not edit by hand; change the generator and run
 * \`node tools/build_world.mjs\`.
 *
 * Synthetic: the retailer, the DC, the twelve stores, tonight's orders, the item master, the robot
 * cell and its parameters. The towns are real places in North Rhine-Westphalia.
 *
 * Conventions
 *   - Times are local clock times on the night shift, 22:00 to 06:00 ("01:35" is after midnight).
 *   - Weights in grams, sizes in millimetres (length × width × height).
 *   - master_g is what the item master holds; actual_g is what the simulated scale will read.
 *   - allocation.n1 / allocation.n2: units per store and SKU on a normal night (3,000 units) and on
 *     the peak night (×1.4, 4,200 units).
 *   - Barcodes are GS1 restricted circulation numbers (prefix 20): they identify no product in
 *     open trade.
 *
 * Loaded as a classic script so the app works without any same-origin fetch.
 */
window.WORLD = ${serialize(world)};
`;
  const shadowJs = `/*
 * REPACK PILOT — synthetic shadow-mode record for the autonomy gate.
 * GENERATED by tools/build_world.mjs: do not edit by hand.
 *
 * Seven earlier nights in which the agent only recommended and a person decided. The example gate
 * (200 decisions over 10 nights, 95 % agreement, no missed escalation, no agent-caused missed
 * cut-off) is not met on purpose, so Bounded execution stays locked and the dial says why.
 */
window.SHADOW_RECORD = ${serialize(shadow)};
`;
  return [
    [path.join(ROOT, "data/world.js"), worldJs],
    [path.join(ROOT, "data/shadow_record.js"), shadowJs]
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = files();
  if (CHECK) {
    let stale = 0;
    for (const [file, content] of out) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
      if (current !== content) { stale += 1; console.log(`FAIL  ${path.relative(ROOT, file)} differs from the generator: run node tools/build_world.mjs`); }
      else console.log(`PASS  ${path.relative(ROOT, file)} matches the generator`);
    }
    if (stale) process.exit(1);
    console.log("data files match the generator");
  } else {
    for (const [file, content] of out) fs.writeFileSync(file, content);
    console.log(`Wrote ${out.map(([f]) => path.relative(ROOT, f)).join(" and ")} (world ${WORLD_VERSION}).`);
  }
}
