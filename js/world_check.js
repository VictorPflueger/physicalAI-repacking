// Integrity checks for the synthetic world, the scenarios, the shadow record and the Open Food Facts
// snapshot (PLAN.md §b.7). Runs in the browser (Diagnostics) and in Node (tools/check_world.mjs).
// The night calibration targets (§b.8) join these checks with the night simulation in M2, and the
// simulation scripts with M3.

import { buildModel, ean13Valid, nightMinutes, NIGHTS } from "./world.js";
import { evaluateGate } from "./autonomy.js";
import { int, fixed } from "./format.js";

const SHIFT_MINUTES = 480; // 22:00 to 06:00

/**
 * @returns {{ok: boolean, checks: Array<{name: string, ok: boolean, detail: string}>, stats: object}}
 */
export function checkWorld(world, scenarios = [], shadowRecord = null, offSnapshot = null) {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });
  const model = buildModel(world);
  const factor = world.meta?.peak_factor;

  add("Model builds without structural problems", model.problems.length === 0, model.problems.slice(0, 5).join(" | ") || "no problems");

  // ---- stores --------------------------------------------------------------------------------------
  const storeIssues = [];
  const flagships = world.stores.filter((s) => s.flagship);
  if (world.stores.length !== 12) storeIssues.push(`${world.stores.length} stores`);
  if (flagships.length !== 1) storeIssues.push(`${flagships.length} flagships`);
  for (const s of world.stores) {
    const t = nightMinutes(s.cutoff);
    if (!(t > 0 && t <= SHIFT_MINUTES)) storeIssues.push(`${s.id} cut-off ${s.cutoff} outside the shift`);
    if (s.express_truck && !(nightMinutes(s.express_truck) > t && nightMinutes(s.express_truck) <= SHIFT_MINUTES)) storeIssues.push(`${s.id} express truck ${s.express_truck}`);
  }
  world.stores.forEach((s, i) => {
    if (s.plan_rank !== i + 1) storeIssues.push(`${s.id} listed out of plan order`);
    if (i && nightMinutes(s.cutoff) < nightMinutes(world.stores[i - 1].cutoff)) storeIssues.push(`${s.id} cut-off before ${world.stores[i - 1].id}`);
  });
  add("Twelve stores, one flagship, cut-offs inside the shift and in plan order", storeIssues.length === 0,
    storeIssues.slice(0, 5).join(" | ") || `${world.stores.length} stores, flagship ${flagships[0]?.name}, cut-offs ${world.stores[0].cutoff}–${world.stores.at(-1).cutoff}`);

  // ---- allocation --------------------------------------------------------------------------------------
  const alloc = [];
  const scale = { n1: 1, n2: factor };
  for (const night of NIGHTS) {
    const f = scale[night];
    // A scaled total must be a whole number of units (180 × 1.4 = 252, not 251.99999999999997).
    const whole = (n) => (Math.abs(n * f - Math.round(n * f)) < 1e-9 ? Math.round(n * f) : null);
    for (const s of world.stores) {
      const want = whole(s.units_n1);
      if (want === null) alloc.push(`${night}: ${s.id} × ${f} is not whole`);
      else if (model.storeUnits(s.id, night) !== want) alloc.push(`${night}: ${s.id} has ${model.storeUnits(s.id, night)}, needs ${want}`);
    }
    for (const it of world.items) {
      const want = whole(it.units_n1);
      if (want === null) alloc.push(`${night}: ${it.sku} × ${f} is not whole`);
      else if (model.itemUnits(it.sku, night) !== want) alloc.push(`${night}: ${it.sku} has ${model.itemUnits(it.sku, night)}, needs ${want}`);
    }
  }
  const t1 = model.totals("n1");
  const t2 = model.totals("n2");
  if (t1.units !== 3000 || t2.units !== 4200) alloc.push(`totals ${t1.units} and ${t2.units}, need 3,000 and 4,200`);
  add("Twenty-four SKUs; the allocation adds up exactly at N1 and N2", world.items.length === 24 && alloc.length === 0,
    alloc.slice(0, 5).join(" | ") || `${world.items.length} SKUs; ${int(t1.units)} units at N1 and ${int(t2.units)} at N2, every store and SKU total exact`);

  // ---- s and p --------------------------------------------------------------------------------------
  const shares = NIGHTS.map((n) => model.totals(n)).map((t) => ({ s: t.cellUnits / t.units, p: t.expectedSuccesses / t.cellUnits }));
  const sp = shares.every((x) => Math.abs(x.s - 0.7) < 1e-12 && Math.abs(x.p - 0.91) < 1e-9);
  add("Cell share s = 0.70 and grasp success p = 0.91 at N1 and N2", sp,
    `cell units ${int(t1.cellUnits)} of ${int(t1.units)} at N1, ${int(t2.cellUnits)} of ${int(t2.units)} at N2; unit-weighted success ${shares.map((x) => fixed(x.p, 6)).join(" and ")}`);

  // ---- item master ----------------------------------------------------------------------------------
  const itemIssues = [];
  const payload = world.cell?.payload_g;
  for (const it of world.items) {
    if (!(it.master_g > 0 && it.actual_g > 0)) itemIssues.push(`${it.sku}: weight`);
    if (!Array.isArray(it.size_mm) || it.size_mm.length !== 3 || !it.size_mm.every((v) => v > 0)) itemIssues.push(`${it.sku}: size`);
    if (!["low", "medium", "high", "very high"].includes(it.fragility)) itemIssues.push(`${it.sku}: fragility`);
    if (it.cell) {
      if (!it.grip) itemIssues.push(`${it.sku}: cell SKU without a grip`);
      if (!(it.success > 0 && it.success < 1)) itemIssues.push(`${it.sku}: success rate`);
      if (!(Math.max(it.master_g, it.actual_g) <= payload)) itemIssues.push(`${it.sku}: over the payload`);
    } else if (!it.manual_reason || it.grip !== null || it.success !== null) itemIssues.push(`${it.sku}: manual-only SKU without a reason`);
  }
  add("Every SKU has weight, size, fragility and grip; cell SKUs fit the payload; manual-only SKUs say why", itemIssues.length === 0,
    itemIssues.slice(0, 5).join(" | ") || `${world.items.filter((i) => i.cell).length} cell SKUs within ${int(payload)} g, ${world.items.filter((i) => !i.cell).length} manual-only SKUs with a reason`);

  const differ = world.items.filter((i) => i.master_g !== i.actual_g);
  const jar = world.items.find((i) => i.sku === "S07");
  add("Only the glass jar's master weight differs from what the scale will read (scenario 2)",
    differ.length === 1 && jar && jar.master_g === 200 && jar.actual_g === 400 && jar.glass,
    differ.map((i) => `${i.sku} ${i.name}: master ${i.master_g} g, scale ${i.actual_g} g`).join(" | ") || "no SKU differs");

  // ---- barcodes -------------------------------------------------------------------------------------
  const codes = world.items.map((i) => i.barcode);
  const badCodes = world.items.filter((i) => !/^20\d{11}$/.test(i.barcode) || !ean13Valid(i.barcode)).map((i) => i.sku);
  const unknown = scenarios.find((s) => s.barcode)?.barcode;
  // A GTIN-13 with a valid check digit outside the restricted circulation prefixes 02 and 20–29.
  const unknownOk = !!unknown && ean13Valid(unknown) && !/^(02|2\d)/.test(unknown) && !model.byBarcode.has(unknown);
  add("Item barcodes are restricted circulation numbers with valid check digits; scenario 3's barcode is a real GTIN outside the item master",
    badCodes.length === 0 && new Set(codes).size === codes.length && unknownOk,
    badCodes.length ? `invalid: ${badCodes.join(", ")}` : `${codes.length} RCN-13 codes (prefix 20); scenario 3: ${unknown || "none"}${unknownOk ? ", valid and not in the item master" : ", NOT valid or already known"}`);

  // ---- waves, cell, tote ------------------------------------------------------------------------------
  const waveTimes = (world.waves || []).map((w) => nightMinutes(w.arrives));
  const plant = waveTimes.length === 2 && waveTimes[0] === 0 && waveTimes[1] > 0 && waveTimes[1] < SHIFT_MINUTES
    && world.cell?.attempts_per_hour === 500 && world.cell?.vendor === null
    && world.manual_station?.picks_per_hour === 400 && world.manual_station?.pickers === 1 && world.tote?.limit_g > 0;
  add("Waves inside the shift; one cell at 500 attempts per hour, no vendor named; one picker at 400 picks per hour; a tote limit",
    plant, `waves at ${(world.waves || []).map((w) => `${w.arrives} (${w.id})`).join(", ")}; tote limit ${int(world.tote?.limit_g)} g`);

  // ---- shadow record and the gate ----------------------------------------------------------------------------
  const gate = shadowRecord ? evaluateGate(shadowRecord) : null;
  const control = evaluateGate({ decisions: Array.from({ length: 200 }, (_, i) => ({ night: (i % 10) + 1, agreed: true, escalation_missed: false, agent_caused_missed_cutoff: false })) });
  const missEsc = evaluateGate({ decisions: Array.from({ length: 200 }, (_, i) => ({ night: (i % 10) + 1, agreed: true, escalation_missed: i === 0, agent_caused_missed_cutoff: false })) });
  const shadowOk = !!gate && !gate.met && gate.failing.join(",") === "decisions,nights,agreement" && control.met && !missEsc.met && missEsc.failing.join(",") === "escalations";
  add("Shadow record falls short of the example gate on decisions, nights and agreement; a record that meets it passes (control)",
    shadowOk, gate ? `${gate.criteria.map((c) => `${c.label}: ${c.text}`).join("; ")}; control ${control.met ? "passes" : "FAILS"}` : "no shadow record loaded");

  // ---- scenarios -------------------------------------------------------------------------------------
  const nums = scenarios.map((s) => s.number).sort((a, b) => a - b).join(",");
  const mains = scenarios.filter((s) => s.main_run);
  const sc5 = scenarios.find((s) => s.number === 5);
  const xmas = new Date(Date.UTC(2026, 11, 24)).getUTCDay(); // 4 = Thursday
  const scenOk = scenarios.length === 6 && nums === "1,2,3,4,5,6" && new Set(scenarios.map((s) => s.id)).size === 6
    && mains.length === 1 && mains[0].number === 1 && sc5?.night_start_date === "2026-12-23" && xmas === 4;
  add("Six scenarios, one main run (scenario 1), scenario 5 on the night into Thursday 24 Dec 2026", scenOk,
    `${scenarios.length} scenarios (${nums}); main run ${mains.map((s) => s.number).join(",") || "none"}; scenario 5 starts ${sc5?.night_start_date || "?"}`);

  // ---- Open Food Facts snapshot -------------------------------------------------------------------------
  const meta = offSnapshot?.meta || {};
  const products = Object.keys(offSnapshot?.products || {});
  const offOk = /Open Food Facts/.test(meta.attribution || "") && /ODbL/.test(meta.attribution || "") && products.every((code) => !model.byBarcode.has(code) && ean13Valid(code));
  add("Open Food Facts data kept in its own file with its attribution", offOk,
    `${meta.attribution || "no attribution"}; ${products.length ? `${products.length} record(s)` : `no record yet (status: ${meta.status || "unknown"})`}`);

  return {
    ok: checks.every((c) => c.ok),
    checks,
    stats: { stores: world.stores.length, items: world.items.length, n1: t1, n2: t2, shadow: gate?.summary || null }
  };
}
