// Engine suite (Node.js only, no browser):
//   - the brief's golden cases G1 to G4 per 1,000 units, per cell hour and per year, the nights N1 and
//     N2, the call-in O1 and the business-case figures (PLAN.md §c.3–c.4), within ±0.005, and every
//     display string the brief lists, exactly;
//   - the night simulation: snapshots per scenario (unit-log hash and every order's completion),
//     frozen in tests/snapshots/des.json; two runs identical; the calibration targets on all 14 seeds;
//     tonight's figures on the calibrated seed equal the engine's plan;
//   - the escalation rules E1 to E4, each with a night that fires it and one that does not;
//   - the world model: one write-back of the glass jar, later readings expect it, no tote over 15 kg;
//   - levers and option costing: 20 replications on common random numbers, O1, do nothing priced by
//     its late orders, refusals;
//   - the night on the screen: the night plan holds only what the warehouse system knows at 22:00;
//     wake-ups follow the events of their moment; the manual queue counted from events; cut-off risk
//     times agree with their minutes to spare; the player emits every event once and in order, waits
//     at each wake-up and ends with the night report and the unit log; a stopped night logs nothing
//     from after the stop; the audit keeps exceptions and drops ordinary units.
// Usage: node tests/engine.mjs                     run the suite
//        node tests/engine.mjs --update-snapshots  rewrite tests/snapshots/des.json (after a deliberate
//                                                  change to the night simulation; review the diff)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./lib/harness.mjs";

const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);
const E = await mod("js/engine.js");
const NS = await mod("js/nightsim.js");
const O = await mod("js/options.js");
const C = await mod("js/calibration.js");
const R = await mod("js/escalation.js");
const NP = await mod("js/night.js");
const CD = await mod("js/cell_data.js");
const { bus } = await mod("js/events.js");
const { eur2, eur0, hours, upTo, int } = await mod("js/format.js");

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ["data/world.js", "data/scenarios.js"]) vm.runInContext(fs.readFileSync(path.join(APP_ROOT, f), "utf8"), sandbox, { filename: f });
const { WORLD, SCENARIOS } = sandbox.window;
const SNAP_FILE = path.join(APP_ROOT, "tests", "snapshots", "des.json");
const UPDATE = process.argv.includes("--update-snapshots");

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`ok: ${name}`); }
  catch (err) { failures.push(name); console.log(`FAIL: ${name}\n      ${String(err.message).split("\n").slice(0, 6).join("\n      ")}`); }
}
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 0.005, `${label}: ${actual} vs ${expected}`);
const scenario = (n) => SCENARIOS.find((s) => s.number === n);
const nightOf = (n, params) => NS.buildNight(WORLD, scenario(n).night, params);

// ---- the engine ------------------------------------------------------------------------------------------
await test("golden cases per 1,000 units and per cell hour (G1–G4)", () => {
  const want = {
    G1: [2.5, 89.5, 0.9075, 32.4885, 455, 40.7225],
    G2: [2.5, 89.5, 1.275, 45.645, 350, 31.325],
    G3: [2.5, 89.5, 0.79375, 28.41625, 455, 40.7225],
    G4: [1.6667, 59.6667, 0.605, 21.659, 455, 27.1483]
  };
  for (const [g, w] of Object.entries(want)) {
    const v = E.inputs(E.GOLDEN[g]);
    const k = E.perThousand(v), h = E.perCellHour(v);
    [k.manual_h, k.manual_eur, k.hybrid_h, k.hybrid_eur, h.robot_picks, h.break_even_eur].forEach((x, i) => near(x, w[i], `${g}[${i}]`));
  }
});

await test("golden cases per year (G1–G4)", () => {
  const want = { G1: [9555, 342069, 8400], G2: [7350, 263130, 8400], G3: [10237.5, 366502.5, 9000], G4: [6370, 228046, 8400] };
  for (const [g, w] of Object.entries(want)) {
    const v = E.inputs(E.GOLDEN[g]);
    const y = E.perYear(v);
    near(y.hours_avoided, w[0], `${g} hours`); near(y.eur_avoided, w[1], `${g} euros`); near(y.cell_hours, w[2], `${g} cell hours`);
    near(y.eur_avoided, E.perCellHour(v).break_even_eur * y.cell_hours, `${g}: A_EUR = B × C_h`);
  }
});

await test("the brief's display strings", () => {
  const g = (name) => E.inputs(E.GOLDEN[name]);
  const k = (name) => E.perThousand(g(name)), h = (name) => E.perCellHour(g(name)), y = (name) => E.perYear(g(name));
  assert.equal(eur2(k("G1").hybrid_eur), "€32.49"); assert.equal(eur2(h("G1").break_even_eur), "€40.72");
  assert.equal(eur2(k("G2").hybrid_eur), "€45.65"); assert.equal(eur2(h("G2").break_even_eur), "€31.33");
  assert.equal(eur2(k("G3").hybrid_eur), "€28.42"); assert.equal(eur0(y("G3").eur_avoided), "€366,503");
  assert.equal(eur2(k("G4").manual_eur), "€59.67"); assert.equal(eur2(k("G4").hybrid_eur), "€21.66"); assert.equal(eur2(h("G4").break_even_eur), "€27.15");
  // and the hook's figures
  assert.equal(hours(k("G1").manual_h), "2.5 h"); assert.equal(eur2(k("G1").manual_eur), "€89.50");
  assert.equal(hours(k("G1").hybrid_h), "0.91 h"); assert.equal(hours(k("G2").hybrid_h), "1.28 h");
  assert.equal(eur0(y("G1").eur_avoided), "€342,069"); assert.equal(int(h("G1").robot_picks), "455");
});

await test("night capacity N1 and N2, and the call-in O1", () => {
  const v = E.defaults();
  const n1 = E.night(v, 3000), n2 = E.night(v, 4200);
  [[n1.cell_h, 4.2], [n1.hybrid_h, 2.7225], [n1.manual_h, 7.5], [n1.hybrid_eur, 97.4655], [n1.manual_eur, 268.5],
    [n2.cell_h, 5.88], [n2.hybrid_h, 3.8115], [n2.manual_h, 10.5], [n2.hybrid_eur, 136.4517], [n2.manual_eur, 375.9]].forEach(([a, b], i) => near(a, b, `night[${i}]`));
  assert.equal(upTo(n2.cell_h), "5.88"); assert.equal(upTo(n2.hybrid_h), "3.81"); assert.equal(upTo(n2.manual_h), "10.5");
  near(E.callInCost(v), 134.25, "O1"); assert.equal(eur2(E.callInCost(v)), "€134.25");
  near(E.callInCost(v, 4), 4 * 35.8 * 1.25, "four hours used");
});

await test("business-case figures (PLAN.md §c.4)", () => {
  const v = E.defaults();
  const k = E.perThousand(v), y = E.perYear(v), d = E.demoCell(v);
  assert.equal(eur2(k.saving_eur), "€57.01");
  near(y.cells_night_shift, 4.2, "cells on a night shift"); near(y.cells_round_clock, 1.4, "cells round the clock");
  assert.equal(eur0(d.eur_avoided), "€42,759"); assert.equal(d.units_per_year, 750000);
  const g1 = E.perYear(E.inputs(E.GOLDEN.G1)).eur_avoided, g2 = E.perYear(E.inputs(E.GOLDEN.G2)).eur_avoided, g3 = E.perYear(E.inputs(E.GOLDEN.G3)).eur_avoided;
  assert.equal(eur0(g1 - g2), "€78,939"); assert.equal(eur0(g3 - g1), "€24,434"); assert.equal(eur0(E.perYear(E.inputs(E.GOLDEN.G4)).eur_avoided), "€228,046");
});

await test("inputs: every parameter carries a basis; values outside their range are refused", () => {
  for (const p of E.PARAMETERS) assert.ok(p.basis && p.unit && Number.isFinite(p.value), p.id);
  assert.throws(() => E.inputs({ p: 1.2 }), /outside/); assert.throws(() => E.inputs({ x: 1 }), /Unknown input/);
  assert.equal(E.inputs({ p: 0.7 }).p, 0.7);
});

// ---- the night simulation ------------------------------------------------------------------------------------
const snapshots = {};
await test("snapshots per scenario: unit-log hash and every order's completion", () => {
  const frozen = UPDATE || !fs.existsSync(SNAP_FILE) ? null : JSON.parse(fs.readFileSync(SNAP_FILE, "utf8"));
  for (const sc of SCENARIOS) {
    const night = NS.buildNight(WORLD, sc.night);
    const res = NS.runNight(night);
    snapshots[sc.id] = {
      seed: sc.night.seed, hash: res.hash,
      orders: Object.fromEntries(res.orders.map((o) => [o.id, o.done_ms])),
      wakeups: res.wakeups.map((w) => `${NS.clockOf(w.t)} ${w.kinds.join("+")}`)
    };
    if (frozen) assert.deepEqual(snapshots[sc.id], frozen.scenarios[sc.id], `scenario ${sc.number} differs from the snapshot (run with --update-snapshots after a deliberate change)`);
  }
  if (UPDATE) {
    fs.mkdirSync(path.dirname(SNAP_FILE), { recursive: true });
    fs.writeFileSync(SNAP_FILE, `${JSON.stringify({ note: "Frozen by `node tests/engine.mjs --update-snapshots`. Times are milliseconds after 22:00.", scenarios: snapshots }, null, 2)}\n`);
    console.log(`      snapshots written to ${path.relative(APP_ROOT, SNAP_FILE)}`);
  } else {
    assert.ok(frozen, "tests/snapshots/des.json is missing");
  }
});

await test("the night is reproducible: two runs, the same events", () => {
  for (const n of [1, 4]) {
    const a = NS.runNight(nightOf(n)), b = NS.runNight(nightOf(n));
    assert.equal(a.hash, b.hash); assert.equal(a.events.length, b.events.length);
    assert.deepEqual(a.events.slice(0, 50), b.events.slice(0, 50));
  }
});

await test("calibration: the four night targets hold on all 14 seeds", () => {
  const res = C.calibrate(WORLD, SCENARIOS);
  assert.equal(res.total, 14);
  assert.ok(res.ok, `failing seeds: ${res.seeds.filter((s) => !s.ok).map((s) => `${s.seed} ${JSON.stringify(s.targets)}`).join("; ")}`);
});

await test("tonight on the calibrated seed equals the engine's plan (scenario 2, seed 7)", () => {
  const night = nightOf(2);
  const res = NS.simulate(night);
  const t = NS.tonightFigures(night, res);
  const plan = E.night(E.defaults(), 3000);
  assert.equal(res.stats.attempts, 2100); assert.equal(res.stats.successes, 1911);
  near(t.labour_hours, plan.hybrid_h, "labour hours"); near(t.cell_hours, plan.cell_h, "cell hours");
  near(t.labour_hours_per_1000, E.perThousand(E.defaults()).hybrid_h, "per 1,000"); near(t.robot_picks_per_cell_hour, 455, "picks per cell hour");
  assert.equal(t.orders_on_time, 12);
});

await test("a projection uses no future draw: at 22:00 two seeds project the same night; once the work is done it equals the night", () => {
  const night = nightOf(2);
  const a = NS.projectAt(night, 0, { seed: 7 }), b = NS.projectAt(night, 0, { seed: 99 });
  assert.deepEqual([...a.entries()], [...b.entries()]);
  const actual = NS.simulate(night, { seed: 7, events: false });
  const late = NS.projectAt(night, NS.msOf("03:30"), { seed: 7 });
  for (const o of actual.orders) assert.equal(late.get(o.id), o.done_ms, `${o.id}: with the whole history known the projection is the night itself`);
  const early = NS.projectAt(night, 0, { seed: 7 });
  assert.ok(actual.orders.some((o) => early.get(o.id) !== o.done_ms), "at 22:00 the projection is an expectation, not the night");
});

// ---- escalation rules ----------------------------------------------------------------------------------------
await test("E1 unknown barcode: fires in scenario 3 and in no other scenario", () => {
  const r3 = NS.simulate(nightOf(3));
  const e1 = r3.escalations.filter((e) => e.rule === "E1");
  assert.equal(e1.length, 1); assert.equal(e1[0].barcode, "4037848020859"); assert.equal(NS.clockOf(e1[0].t), "23:10");
  assert.equal(r3.units.filter((u) => u.station === "set_aside").length, 6);
  for (const n of [1, 2, 4, 5, 6]) assert.equal(NS.simulate(nightOf(n), { events: false }).escalations.filter((e) => e.rule === "E1").length, 0, `scenario ${n}`);
  assert.ok(R.isUnknownBarcode(new Set(["1"]), "4037848020859")); assert.ok(!R.isUnknownBarcode(new Set(["4037848020859"]), "4037848020859"));
});

await test("E2 fragile and low confidence: the two unsafe units of scenario 1, nothing on a normal night", () => {
  const r1 = NS.simulate(nightOf(1));
  const e2 = r1.escalations.filter((e) => e.rule === "E2");
  assert.deepEqual(e2.map((e) => e.unit_id).sort(), ["BOC:S04:0", "BOC:S08:2"]);
  assert.ok(e2.every((e) => e.to === "manual_station"));
  assert.equal(NS.simulate(nightOf(2), { events: false }).escalations.filter((e) => e.rule === "E2").length, 0);
  const high = WORLD.items.find((i) => i.fragility === "high"), low = WORLD.items.find((i) => i.fragility === "low");
  assert.ok(R.isFragileLowConfidence(high, 0.79)); assert.ok(!R.isFragileLowConfidence(high, 0.8)); assert.ok(!R.isFragileLowConfidence(low, 0.5));
});

await test("E3 repeated failures: gripper wear fires it about 13 minutes after the onset; a normal night never does", () => {
  const r4 = NS.simulate(nightOf(4));
  const e3 = r4.escalations.filter((e) => e.rule === "E3");
  assert.equal(e3.length, 1);
  const after = (e3[0].t - NS.msOf("23:30")) / 60000;
  assert.ok(after > 5 && after < 25, `fired ${after.toFixed(1)} min after the onset`);
  assert.ok(e3[0].rolling_success < 0.75);
  for (const n of [1, 2, 3, 5, 6]) assert.equal(NS.simulate(nightOf(n), { events: false }).escalations.filter((e) => e.rule === "E3").length, 0, `scenario ${n}`);
  const roll = new R.RollingSuccess();
  for (let i = 0; i < 100; i++) roll.push(i < 75);
  assert.equal(roll.rate(), 0.75); assert.equal(roll.fires(), false);
  roll.push(false);
  assert.equal(roll.rate(), 0.74); assert.equal(roll.fires(), true);
});

await test("E4 cut-off risk: Hamm and Soest at 02:00 in scenario 1; no store on a normal night", () => {
  const r1 = NS.runNight(nightOf(1));
  assert.equal(r1.risks.length, 1); assert.equal(NS.clockOf(r1.risks[0].t), "02:00");
  assert.deepEqual(r1.risks[0].stores.map((s) => s.store).sort(), ["HAM", "SOE"]);
  const w = r1.wakeups.find((x) => x.kinds.includes("cutoff_risk"));
  assert.deepEqual(w.kinds, ["new_order", "cutoff_risk"], "the risk wakes the agent in the same minute as the new order");
  assert.equal(NS.runNight(nightOf(2)).risks.length, 0);
  const risks = R.cutoffRisks([{ id: "A", cutoff_ms: 100 * 60000 }, { id: "B", cutoff_ms: 100 * 60000 }], { A: 86 * 60000, B: 85 * 60000 }, 0);
  assert.deepEqual(risks.map((r) => r.order), ["A"], "14 minutes to spare is at risk, 15 is not");
});

await test("wake-ups merge within the same simulated minute (scenario 1's two escalations)", () => {
  const r1 = NS.runNight(nightOf(1));
  const esc = r1.wakeups.filter((w) => w.kinds.includes("escalation"));
  assert.equal(esc.length, 1); assert.equal(esc[0].items.filter((i) => i.kind === "escalation").length, 2);
  assert.deepEqual(r1.wakeups.map((w) => w.kind), ["night_start", "correction", "escalation", "new_order", "night_end"]);
});

// ---- the world model -------------------------------------------------------------------------------------
await test("world model: the scale writes the jar back once, later readings expect 400 g, no tote over 15 kg", () => {
  for (const n of [1, 2]) {
    const res = NS.simulate(nightOf(n));
    assert.equal(res.corrections.length, 1, `scenario ${n}`);
    const c = res.corrections[0];
    assert.deepEqual([c.sku, c.old, c.new, c.sensor, c.applies_to], ["S07", 200, 400, "scale", "sku"]);
    const readings = res.events.filter((e) => e.type === "scale_reading" && e.payload.sku === "S07");
    assert.equal(readings[0].payload.expected_g, 200);
    assert.ok(readings.slice(1).every((e) => e.payload.expected_g === 400), "every later S07 reading expects 400 g");
    const totes = res.events.filter((e) => e.type === "tote_update");
    assert.ok(totes.length > 3000 && totes.every((e) => e.payload.weight_g <= 15000), "a tote over 15 kg");
    assert.ok(res.stats.max_tote_g <= 15000);
  }
});

// ---- levers and option costing ---------------------------------------------------------------------------
await test("levers: move to the next wave, a maintenance stop, fragile items by hand, a split, a re-sequence", () => {
  const night = nightOf(1);
  const base = NS.simulate(night, { events: false });
  const moved = NS.simulate(night, { events: false, levers: [{ type: "move_to_next_wave", store_ids: ["SOE"], start: "02:00" }] });
  assert.ok(moved.orders.find((o) => o.id === "SOE").moved && !moved.orders.find((o) => o.id === "SOE").on_time);
  assert.ok(moved.stats.manual_picks + moved.stats.attempts < base.stats.manual_picks + base.stats.attempts, "no labour for moved lines");
  const stop = NS.simulate(nightOf(4), { events: false, levers: [{ type: "maintenance_stop", start: "23:50", minutes: 20 }] });
  const worn = NS.simulate(nightOf(4), { events: false });
  assert.ok(stop.stats.successes > worn.stats.successes, "the stop restores the nominal success rate");
  const fragile = NS.simulate(night, { events: false, levers: [{ type: "manual_for_fragile", start: "02:00" }] });
  assert.ok(fragile.stats.attempts < base.stats.attempts);
  const split = NS.simulate(night, { events: false, levers: [{ type: "split_order", store_ids: ["XPR"], share: 0.5, start: "02:00" }] });
  assert.ok(split.stats.manual_picks > base.stats.manual_picks);
  const reseq = NS.simulate(night, { events: false, levers: [{ type: "resequence", order: ["HAM", "SOE", "XPR"], start: "02:00" }] });
  const soe = (r) => r.orders.find((o) => o.id === "SOE").done_ms;
  assert.ok(soe(reseq) < soe(base), "Soest finishes earlier when it goes before the express order");
});

await test("option costing: 20 replications on common random numbers, O1, do nothing priced by its late orders", () => {
  const night = nightOf(1);
  const variants = [
    { variant_id: "A", name: "Re-sequence", levers: [{ type: "resequence", order: ["HAM", "SOE", "XPR"] }] },
    { variant_id: "B", name: "Call in and split", levers: [{ type: "call_in_picker", start: "02:00", minutes: 180 }, { type: "split_order", store_ids: ["XPR"], share: 0.5 }] },
    { variant_id: "C", name: "Call in", levers: [{ type: "call_in_picker", start: "02:00", minutes: 180 }] }
  ];
  const opts = { seed: 7, now_ms: NS.msOf("02:00"), variants, inputs: E.defaults() };
  const a = O.costOptions(night, opts), b = O.costOptions(night, opts);
  assert.deepEqual(a, b, "the same input gives the same result");
  assert.equal(a.replications, 20); assert.equal(a.seeds.length, 20); assert.equal(a.seeds[0], 7);
  assert.equal(new Set(a.seeds).size, 20);
  const c = a.variants.find((v) => v.variant_id === "C");
  near(c.call_in_eur, 134.25, "O1"); assert.equal(c.extra_manual_picks, 0);
  for (const v of [a.baseline, ...a.variants]) near(v.late_orders_eur, v.expected_late_orders * 250, `${v.variant_id} late cost`);
  near(a.baseline.expected_total_eur, a.baseline.expected_late_orders * 250, "do nothing costs only its late orders");
  assert.ok(a.baseline.expected_late_orders > 0, "doing nothing leaves late orders in scenario 1");
  assert.equal(a.baseline.tonight.seed, 7);
  const tonight = NS.simulate(night, { seed: 7, events: false });
  assert.deepEqual(a.baseline.tonight.late, tonight.orders.filter((o) => !o.on_time).map((o) => o.id), "replication 0 is tonight's seed");
  assert.throws(() => O.costOptions(night, { ...opts, variants: variants.slice(0, 2) }), /exactly three/);
  assert.throws(() => O.costOptions(night, { ...opts, variants: [...variants.slice(0, 2), { variant_id: "D", name: "x", levers: [{ type: "teleport" }] }] }), /unknown lever/);
});

// ---- the night on the screen ----------------------------------------------------------------------------
await test("the night plan holds only what the warehouse system knows at 22:00", () => {
  for (const sc of SCENARIOS) {
    const night = NS.buildNight(WORLD, sc.night);
    const info = NS.nightInfo(night, { seed: sc.night.seed });
    const stores = WORLD.stores.length;
    assert.equal(info.orders.length, stores, `scenario ${sc.number}: only the store orders`);
    assert.ok(info.orders.every((o) => o.kind === "store" && o.arrives_ms === 0), `scenario ${sc.number}: no order from later`);
    assert.equal(info.totals.units, sc.night.volume === "n2" ? 4200 : 3000, `scenario ${sc.number}: units planned`);
    for (const k of ["express", "unknown", "wear", "manual_arrivals_ms", "end_ms"]) assert.ok(!(k in info), `scenario ${sc.number}: ${k} in the plan`);
    assert.equal(info.waves.reduce((n, w) => n + w.units, 0), info.totals.units, `scenario ${sc.number}: waves add up`);
  }
  const res = NS.runNight(nightOf(1));
  const order = res.events.find((e) => e.type === "order_new");
  assert.equal(NS.clockOf(order.t), "02:00");
  assert.deepEqual([order.payload.order, order.payload.units, order.payload.cell_units + order.payload.manual_units, order.payload.due], ["XPR", 600, 600, "03:30"]);
});

await test("wake-ups follow the events of their moment; the night-end wake-up is the last event", () => {
  for (const sc of SCENARIOS) {
    const res = NS.runNight(NS.buildNight(WORLD, sc.night));
    const ev = res.events;
    assert.equal(ev.at(-1).type, "wake", `scenario ${sc.number}: last event`);
    assert.equal(ev.at(-1).payload.kind, "night_end");
    ev.forEach((e, i) => {
      if (e.type !== "wake") return;
      const later = ev.slice(i + 1).filter((x) => x.t === e.t && x.type !== "wake");
      assert.equal(later.length, 0, `scenario ${sc.number}: ${later.map((x) => x.type).join(", ")} after wake-up ${e.payload.wake_id} at ${NS.clockOf(e.t)}`);
      for (const item of e.payload.items.filter((x) => x.kind === "escalation")) {
        const at = ev.findIndex((x) => x.type === "escalation" && x.payload.escalation_id === item.escalation_id);
        assert.ok(at >= 0 && at < i, `scenario ${sc.number}: escalation ${item.escalation_id} after its wake-up`);
      }
    });
  }
  const esc = NS.runNight(nightOf(1)).wakeups.find((w) => w.kinds.includes("escalation"));
  const escTimes = NS.simulate(nightOf(1), { events: false }).escalations.map((e) => e.t);
  assert.equal(esc.t, Math.max(...escTimes), "a merged wake-up fires at its last item");
});

await test("the manual queue counted from events equals the units that reached the manual station", () => {
  for (const n of [1, 3, 4, 6]) {
    const night = nightOf(n);
    const res = NS.runNight(night);
    const info = NS.nightInfo(night, { seed: res.seed });
    const byId = new Map(night.units.map((u) => [u.id, u]));
    // Independent count from the unit log: when each manual unit reached the station.
    const arrivals = res.units.filter((r) => r.station === "manual" || r.station === "set_aside")
      .map((r) => (r.path === "cell_fail" ? r.t_attempt + night.T_CELL : r.path === "E1" || r.path === "E2" ? r.t_detect : byId.get(r.id).avail));
    const st = CD.createNightState(info);
    const times = [...new Set(res.events.map((e) => e.t))];
    let i = 0;
    for (const t of times) {
      while (i < res.events.length && res.events[i].t === t) { const e = res.events[i++]; CD.applyEvent(st, e.type, e.payload, e.t); }
      const want = arrivals.filter((a) => a <= t).length;
      assert.equal(st.manual.arrived, want, `scenario ${n} at ${NS.clockOf(t)}`);
      assert.ok(CD.manualQueue(st) >= 0);
    }
    assert.equal(CD.manualQueue(st), 0, `scenario ${n}: the queue is empty at night end`);
  }
});

await test("cut-off risk times agree with their minutes to spare", () => {
  let seen = 0;
  for (const sc of SCENARIOS) {
    for (const r of NS.runNight(NS.buildNight(WORLD, sc.night)).risks) {
      for (const x of r.stores) {
        seen += 1;
        assert.equal((NS.msOf(x.cutoff) - NS.msOf(x.projected)) / 60000, x.slack_min, `scenario ${sc.number} ${x.store}: ${x.projected} for ${x.cutoff}, ${x.slack_min} min`);
      }
    }
  }
  assert.ok(seen >= 2, `${seen} stores at risk across the scenarios`);
  assert.equal(NS.clockUp(NS.msOf("02:40") + 30000), "02:41");
  assert.equal(NS.clockUp(NS.msOf("02:40")), "02:40");
});

/** Plays a night with a fake clock; returns the events the bus saw. */
async function playNight(n, { stopAt = null, speed = 4 } = {}) {
  let now = 0;
  const pending = [];
  const seen = [];
  const wakes = [];
  const off = bus.onAny((ev) => seen.push(ev));
  const player = NP.createNightPlayer({
    getSpeed: () => speed, now: () => now, schedule: (fn) => pending.push(fn),
    onWake: (w) => { wakes.push(w); return new Promise((r) => setTimeout(r, 1)); }
  });
  bus.beginRun({ run_id: `test-${n}`, mode: "preview" });
  let result = null;
  player.play({ world: WORLD, scenario: scenario(n), params: {} }).then((r) => { result = r; });
  // One frame every 50 ms of fake time; between frames the wake-up timers get their turn.
  for (let guard = 0; !result && guard < 20000; guard++) {
    const fn = pending.shift();
    if (fn) {
      now += 50;
      fn();
      if (stopAt !== null && player.currentNight()?.t >= stopAt) player.stop({ log: true });
    }
    await new Promise((r) => setImmediate(r));
    if (!fn) await new Promise((r) => setTimeout(r, 2));
  }
  bus.endRun();
  off();
  return { seen, wakes, result };
}

await test("the player emits every event once and in order, waits at each wake-up, ends with the report and the unit log", async () => {
  for (const n of [1, 3]) {
    const { seen, wakes, result } = await playNight(n);
    assert.equal(result.status, "done");
    const res = NS.runNight(nightOf(n));
    const want = res.events.map((e) => `${e.type}@${e.t}`);
    const got = seen.filter((e) => !["clock", "night_plan", "night_end", "unit_log"].includes(e.type)).map((e) => `${e.type}@${e.payload.sim_t}`);
    assert.equal(got.length, want.length, `scenario ${n}: ${got.length} events played, ${want.length} in the night`);
    assert.deepEqual(got, want, `scenario ${n}: events out of order`);
    assert.equal(wakes.length, res.wakeups.length);
    assert.equal(seen.filter((e) => e.type === "dispatch").length, res.orders.length, `scenario ${n}: one truck per order`);
    const tail = seen.slice(-2).map((e) => e.type);
    assert.deepEqual(tail, ["night_end", "unit_log"]);
    const end = seen.at(-2).payload;
    assert.equal(end.figures.orders_on_time, res.orders.filter((o) => o.on_time).length);
    assert.equal(seen.at(-1).payload.rows.length, res.units.length);
    assert.equal(seen.at(-1).payload.hash, res.hash);
    // The clock passes every minute it shows in order and stands still at each wake-up.
    const clocks = seen.filter((e) => e.type === "clock").map((e) => e.payload.t);
    assert.ok(clocks.every((t, i) => i === 0 || t >= clocks[i - 1]), "the clock never runs backwards");
    assert.equal(seen.filter((e) => e.type === "clock" && e.payload.paused).length, res.wakeups.length, "one pause per wake-up (the night end too: the agent's report in M3)");
  }
});

await test("a stopped night logs nothing from after the stop", async () => {
  const stopAt = NS.msOf("01:00");
  const { seen, result } = await playNight(1, { stopAt });
  assert.equal(result.status, "aborted");
  const log = seen.find((e) => e.type === "unit_log").payload;
  assert.equal(log.partial, true);
  const until = NS.msOf(log.until);
  assert.ok(until >= stopAt && until < stopAt + 30 * 60000, `stopped at ${log.until}`);
  const cols = Object.fromEntries(log.columns.map((c, i) => [c, i]));
  assert.ok(log.rows.length > 1000 && log.rows.length < 3000, `${log.rows.length} rows`);
  for (const r of log.rows) {
    if (r[cols.done_ms] !== null) assert.ok(r[cols.done_ms] <= until + 59999, `unit ${r[0]} done after the stop`);
    else assert.equal(r[cols.station], null, `unit ${r[0]} shows an outcome it did not have yet`);
  }
  assert.ok(!seen.some((e) => e.type === "night_end"), "no night report for a stopped night");
});

await test("the audit keeps exceptions and drops ordinary units", () => {
  const fine = (type, p) => NP.isFineEvent(type, p);
  assert.equal(fine("grasp_attempt", { ok: true }), true);
  assert.equal(fine("grasp_attempt", { ok: false }), false);
  assert.equal(fine("detection", { known: true }), true);
  assert.equal(fine("detection", { known: false }), false);
  assert.equal(fine("scale_reading", { expected_g: 200, observed_g: 210 }), true);
  assert.equal(fine("scale_reading", { expected_g: 200, observed_g: 400 }), false);
  assert.equal(fine("manual_pick", { reason: "manual" }), true);
  assert.equal(fine("manual_pick", { set_aside: true }), false);
  assert.equal(fine("tote_update", { status: "filling" }), true);
  assert.equal(fine("tote_update", { status: "closed" }), false);
  assert.equal(fine("clock", {}), true);
  for (const t of ["projection", "cutoff_risk", "wake", "dispatch", "escalation", "world_model_correction", "rehearsal", "night_end", "unit_log"]) assert.equal(fine(t, {}), false, t);
  const res = NS.runNight(nightOf(1));
  const kept = res.events.filter((e) => !fine(e.type, e.payload)).length;
  assert.ok(kept < res.events.length / 20, `${kept} of ${res.events.length} events kept`);
});

console.log(failures.length ? `\n${failures.length} engine test(s) failed: ${failures.join("; ")}` : `\nAll ${passed} engine tests passed.`);
process.exit(failures.length ? 1 : 0);
