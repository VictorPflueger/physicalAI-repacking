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
//     from after the stop; the audit keeps exceptions and drops ordinary units;
//   - the agent (M3): scenario 1's golden option cases at 02:00 (the cheapest option is not the one
//     with the most slack); decisions change only the night after them, and the night played in pieces
//     equals one simulation with the decisions (a lever at the wake-up's own millisecond is caught);
//     the figure audit (cents, hours, rates, German formats, scopes); the decision, draft and summary
//     rules; escalations only in code; scenario 1's script on every decision path.
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

await test("E4 cut-off risk: Hamm and Soest at 02:00 in scenario 1, with the express order itself in the band; no store on a normal night", () => {
  const r1 = NS.runNight(nightOf(1));
  assert.equal(r1.risks.length, 1); assert.equal(NS.clockOf(r1.risks[0].t), "02:00");
  // The two stores at risk, and the express order with only 9 minutes to spare for its 02:45 truck (D32).
  assert.deepEqual(r1.risks[0].stores.map((s) => s.store).sort(), ["HAM", "SOE", "XPR"]);
  assert.deepEqual(r1.risks[0].stores.filter((s) => s.store !== "XPR").map((s) => s.store).sort(), ["HAM", "SOE"]);
  assert.equal(r1.risks[0].stores.find((s) => s.store === "XPR").slack_min, 9);
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
  assert.deepEqual([order.payload.order, order.payload.units, order.payload.cell_units + order.payload.manual_units, order.payload.due], ["XPR", 400, 400, "02:45"]);
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
    // At the night-end wake-up the night is over: its figures and the unit log come before the agent's
    // last turn (the clock then moves on from "paused").
    const tailEvents = seen.filter((e) => e.type !== "clock").slice(-3);
    assert.deepEqual(tailEvents.map((e) => e.type), ["wake", "night_end", "unit_log"]);
    assert.equal(tailEvents[0].payload.kind, "night_end");
    const end = tailEvents[1].payload;
    assert.equal(end.figures.orders_on_time, res.orders.filter((o) => o.on_time).length);
    assert.equal(tailEvents[2].payload.rows.length, res.units.length);
    assert.equal(tailEvents[2].payload.hash, res.hash);
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

// ---- the agent (M3) -----------------------------------------------------------------------------------------
const S = await mod("js/night_session.js");
const F = await mod("js/figures.js");
const G = await mod("js/guards.js");
const T = await mod("js/tools.js");
const SC = await mod("js/sim_check.js");
for (const f of ["data/reference_cases.js", "data/sim_runs.js", "data/off_snapshot.js"]) vm.runInContext(fs.readFileSync(path.join(APP_ROOT, f), "utf8"), sandbox, { filename: f });
const { REFERENCE_CASES, SIM_RUNS, OFF_SNAPSHOT } = sandbox.window;
globalThis.OFF_SNAPSHOT = OFF_SNAPSHOT;
/** A session of a scenario played to its wake-up `id` (W1, W2 …). */
function sessionAt(n, id) {
  const ses = S.createNightSession({ world: WORLD, scenario: scenario(n) });
  for (let ev = ses.take(); ev; ev = ses.take()) if (ev.type === "wake" && ev.payload.wake_id === id) return ses;
  throw new Error(`no wake-up ${id}`);
}

await test("golden option cases: scenario 1 at 02:00 on 20 replications; the cheapest option is not the one with the most slack", () => {
  const ses = sessionAt(1, "W4");
  assert.deepEqual([...ses.wake().kinds].sort(), ["cutoff_risk", "new_order"]);
  const r = ses.cost(REFERENCE_CASES["SC1-EXPRESS"].options.variants, E.defaults());
  const by = Object.fromEntries([r.baseline, ...r.variants].map((v) => [v.variant_id, v]));
  const want = {
    do_nothing: { total: 462.5, labour: 0, late: 1.85, by: { SOE: 20, HAM: 17 }, tonight: ["HAM", "SOE"], slack: -6.5 },
    A: { total: 112.5, labour: 0, late: 0.45, by: { XPR: 9 }, tonight: ["XPR"], slack: -1.5 },
    B: { total: 134.25, labour: 134.25, late: 0, by: {}, tonight: [], slack: 21.75 },
    C: { total: 250, labour: 0, late: 1, by: { SOE: 20 }, tonight: ["SOE"], slack: 2.4 }
  };
  for (const [id, w] of Object.entries(want)) {
    const v = by[id];
    near(v.expected_total_eur, w.total, `${id} expected total`);
    near(v.extra_labour_eur, w.labour, `${id} extra labour`);
    near(v.expected_late_orders, w.late, `${id} expected late orders`);
    assert.deepEqual(v.late_by_order, w.by, `${id} late by order`);
    assert.deepEqual([...v.tonight.late].sort(), w.tonight, `${id} late tonight`);
    near(v.tonight.smallest_slack_min, w.slack, `${id} smallest slack`);
  }
  assert.equal(eur2(by.B.call_in_eur), "€134.25", "the call-in is O1");
  const cheapest = r.variants.reduce((a, b) => (b.expected_total_eur < a.expected_total_eur ? b : a));
  const slackest = r.variants.reduce((a, b) => (b.tonight.smallest_slack_min > a.tonight.smallest_slack_min ? b : a));
  assert.equal(cheapest.variant_id, "A");
  assert.equal(slackest.variant_id, "B");
  assert.notEqual(cheapest.variant_id, slackest.variant_id);
});

await test("decisions change only the night after them; the night played in pieces equals one simulation with the decisions", () => {
  const same = (a, b) => a.t === b.t && a.type === b.type && JSON.stringify(a.payload) === JSON.stringify(b.payload);
  const ses = S.createNightSession({ world: WORLD, scenario: scenario(1) });
  const played = [];
  const decide = { W2: [{ type: "close_tote", store_ids: ["ESS"] }], W4: REFERENCE_CASES["SC1-EXPRESS"].options.variants[1].levers };
  for (let ev = ses.take(); ev; ev = ses.take()) {
    played.push(ev);
    if (ev.type === "wake" && decide[ev.payload.wake_id]) {
      const before = ses.run.events.slice(0, played.length);
      ses.apply(decide[ev.payload.wake_id], { source: "test" });
      assert.ok(before.every((e, i) => same(e, ses.run.events[i])), `the played part changed at ${ev.payload.wake_id}`);
    }
    if (ev.type === "wake") ses.resume();
  }
  // What the screen showed, event by event, is the night computed once with both decisions.
  const whole = NS.runNight(ses.night, { seed: 7, levers: ses.levers(), closedAt: played.filter((e) => e.type === "wake").map((e) => e.t) });
  assert.equal(played.length, whole.events.length);
  assert.ok(played.every((e, i) => same(e, whole.events[i])), "played in pieces = one simulation");
  assert.equal(ses.run.hash, whole.hash);
  assert.equal(ses.run.orders.filter((o) => o.on_time).length, 13, "option B: every order on time");
  // Control: a lever decided at the wake-up's own millisecond changes what was already shown.
  const at = sessionAt(1, "W4");
  const w = at.wake();
  const n = at.played();
  const early = NS.runNight(at.night, { seed: 7, levers: [{ type: "call_in_picker", minutes: 180, from_ms: w.t, decided_ms: w.t }], closedAt: [] });
  assert.ok(!at.run.events.slice(0, n).every((e, i) => same(e, early.events[i])), "a lever at the wake-up's own millisecond must be caught");
});

await test("a decision's plan update carries the projection the night plays right after it, so the board shows its effect at once", () => {
  const ses = sessionAt(1, "W4");
  const risky = (st) => [...st.orders.values()].filter((o) => o.status === "open" && o.at_risk).map((o) => o.id).sort();
  assert.deepEqual(risky(ses.state()), ["HAM", "SOE", "XPR"], "02:00: Hamm, Soest and the express order inside the band");
  const { update } = ses.apply(REFERENCE_CASES["SC1-EXPRESS"].options.variants[1].levers, { source: "decision", option_id: "B" });
  const next = ses.run.events.find((e) => e.type === "projection" && e.t === ses.wake().t + 1);
  assert.ok(update.projection && next, "a projection right after the decision");
  assert.deepEqual(update.projection, next.payload, "the plan update's projection is the one the night plays next");
  assert.deepEqual(risky(ses.state()), [], "option B: no order inside the band, while the night still stands at 02:00");
  // The board's reducer, fed the same plan update, shows the same.
  const st = CD.createNightState(ses.info);
  for (const ev of ses.run.events.slice(0, ses.played())) CD.applyEvent(st, ev.type, ev.payload, ev.t);
  assert.deepEqual(risky(st), ["HAM", "SOE", "XPR"]);
  CD.applyEvent(st, "plan_update", update, ses.wake().t);
  assert.deepEqual(risky(st), []);
  // An order the decision moves to tomorrow's wave keeps its lane until its order_moved event.
  const c = sessionAt(1, "W4");
  const moved = c.apply(REFERENCE_CASES["SC1-EXPRESS"].options.variants[2].levers, { source: "decision", option_id: "C" });
  const soe = c.state().orders.get("SOE");
  assert.equal(soe.status, "open");
  assert.ok(moved.update.projection.orders.some((o) => o.id === "SOE"), "the projection still lists Soest");
  assert.equal(soe.at_risk, true, "Soest's lane is left as it was until the order moves");
});

await test("figure audit: euros with cents in English and German formats, hours and rates, by scope; clock times are no hours", () => {
  const read = (t) => F.extractFigures(t).map((f) => `${f.kind}:${f.readings.map((r) => r.value).join("|")}`);
  assert.deepEqual(read("€134.25 and 134,25 € and EUR 1,234.56 and 1.234,56 EUR and €1.2k"), ["eur:134.25", "eur:134.25", "eur:1234.56", "eur:1234.56", "eur:1200"]);
  assert.deepEqual(read("0.91 h, 2.72 labour hours, 3 hours and 4.2 cell hours"), ["hours:0.91", "hours:2.72", "hours:3", "hours:4.2"]);
  assert.deepEqual(read("455 picks per cell hour, 500 attempts an hour, 400 picks/h"), ["rate:455", "rate:500", "rate:400"]);
  assert.deepEqual(read("the 02:45 truck, 15 minutes, 20 replications, 400 picks per hour"), ["rate:400"]);
  const known = F.collectFigures({ per_thousand_eur: 32.4885, labour_hours: 2.7225, robot_picks_per_cell_hour: 455, extra_labour_eur: 0 });
  const bad = (t) => F.unknownFigures(t, known).map((f) => f.raw);
  assert.deepEqual(bad("€32.49, €32.5, 32,49 €, 2.72 h, 455 picks per cell hour, €0.00"), []);
  assert.deepEqual(bad("€33, €32.59, 2.9 h, 470 picks per cell hour"), ["€33", "€32.59", "2.9 h", "470 picks per cell hour"]);
  const ledger = new G.FigureLedger();
  ledger.addFacts({ units: 3000 });
  ledger.addEngine("sim_kpis", { per_1000: { hybrid_eur: 45.645 } }, { what_if: true });
  const costing = { do_nothing: { expected_total_eur: 462.5 } };
  ledger.addEngine("sim_cost_options", costing);
  ledger.setOptionsSource(costing);
  assert.equal(ledger.unknown("€45.65", "narration").length, 0, "narration may quote a what-if");
  assert.equal(ledger.unknown("€45.65", "draft").length, 1, "a draft may not");
  assert.equal(ledger.unknown("€45.65", "report").length, 1, "the summary may not");
  assert.equal(ledger.unknown("€462.50", "draft").length, 0, "a draft may quote the costing the options rest on");
});

await test("rules in code: applying, drafts per option, the summary's outcome, and no tool that raises or lifts an escalation", () => {
  const night = NS.buildNight(WORLD, scenario(1).night);
  const variants = REFERENCE_CASES["SC1-EXPRESS"].options.variants;
  const levers = (id) => variants.find((v) => v.variant_id === id).levers;
  const approved = (id) => ({ id, label: `Option ${id}` });
  assert.match(G.applyError({ autonomy: "advise", approved: approved("B"), optionId: "B" }), /Advise mode/);
  assert.match(G.applyError({ autonomy: "approve", approved: null, optionId: "B" }), /No option has been approved/);
  assert.match(G.applyError({ autonomy: "approve", approved: approved("B"), optionId: "A" }), /Only the approved option/);
  assert.match(G.applyError({ autonomy: "approve", approved: { id: "baseline" }, optionId: "baseline" }), /chose to do nothing/);
  assert.equal(G.applyError({ autonomy: "approve", approved: approved("B"), optionId: "B" }), null);
  const draft = (type, recipient, id) => G.draftError({ type, recipient, approved: id ? approved(id) : null, levers: id && id !== "baseline" ? levers(id) : [], stores: WORLD.stores, night });
  assert.match(draft("email", "Ruhrkorb Dortmund", null), /follow a person's decision/);
  assert.equal(draft("call_in", "On-call picker pool", "B"), null, "B calls in a picker");
  assert.match(draft("call_in", "On-call picker pool", "A"), /calls in nobody/);
  assert.equal(draft("email", "Ruhrkorb Dortmund, store manager", "B"), null, "the express order belongs to Dortmund");
  assert.match(draft("email", "Ruhrkorb DC Unna, warehouse office", "B"), /email goes to a store/);
  assert.match(draft("email", "Ruhrkorb Lünen, store manager", "B"), /changes nothing for Lünen/);
  assert.equal(draft("email", "Carrier dispatch, Soest route", "C"), null, "C moves an order: the carrier may hear of it");
  assert.match(draft("email", "Carrier dispatch", "B"), /email goes to a store/);
  assert.equal(draft("memo", "Shift handover", "baseline"), null);
  assert.match(draft("email", "Ruhrkorb Soest, store manager", "baseline"), /chose to do nothing/);
  assert.deepEqual(G.reportOutcome({ approved: approved("B") }), { outcome: "option_decided" });
  assert.deepEqual(G.reportOutcome({ approved: { id: "baseline" } }), { outcome: "baseline_accepted" });
  assert.match(G.reportOutcome({ requested: "baseline_accepted", approved: approved("B") }).error, /option_decided/);
  assert.match(G.reportOutcome({ optionsShown: true }).error, /ui_await_decision/);
  assert.deepEqual(G.reportOutcome({ corrections: 1, escalations: 0 }), { outcome: "correction_only" });
  assert.deepEqual(G.reportOutcome({ corrections: 1, escalations: 2 }), { outcome: "escalation_only" });
  assert.match(G.reportOutcome({ requested: "escalation_only", corrections: 1, escalations: 0 }).error, /does not fit/);
  // Escalations are the night's: no tool raises, cancels or overrides one, or returns a unit to the cell.
  assert.equal(T.TOOL_NAMES.length, 24);
  assert.ok(!T.TOOL_NAMES.some((n) => /escalat|override|return|unroute|cancel/.test(n)), `tools: ${T.TOOL_NAMES.join(", ")}`);
  const route = T.toolDefinitions().find((d) => d.name === "cell_route_to_manual");
  assert.deepEqual(Object.keys(route.input_schema.properties).sort(), ["fragile_only", "reason", "sku_id"]);
});

await test("the tools on the night: guardrails refuse, decisions bind to their option set, a refusal is marked", async () => {
  const ses = sessionAt(1, "W4");
  const drafts = new Map();
  const events = [];
  const queue = [];
  const tb = T.createToolbox({
    session: ses, getInputs: () => E.defaults(), mode: "simulation", drafts, autonomy: () => "approve", pause: async () => {},
    emit: (type, p) => { events.push({ type, p }); if (type === "options") { queue.push({ payload: { option_id: "B", decision: "approved", options_seq: p.options_seq - 1 } }); queue.push({ payload: { option_id: "B", decision: "approved", options_seq: p.options_seq } }); } },
    waitUntil: async (test) => { const v = test(); if (!v) throw new Error("waits"); return v; },
    takeOptionDecision: (pred) => { const i = queue.findIndex(pred); return i >= 0 ? queue.splice(i, 1)[0] : null; },
    takeConfirmation: () => null, advance: async () => null, lookup: null
  });
  const run = (name, input = {}) => tb.execute(name, input);
  const opts = { recommended_variant_id: "B", baseline_description: "Hamm and Soest miss their trucks.", options: ["A", "B", "C"].map((id) => ({ variant_id: id, title: `Option ${id}`, description: "d", residual_risk: "r" })) };
  let r = await run("ui_propose_options", opts);
  assert.ok(r.isError && r.result.refused && /No costed options/.test(r.result.error), "options before a costing are refused");
  r = await run("wms_apply_option", { option_id: "B" });
  assert.ok(r.isError && r.result.refused, "applying before an approval is refused");
  r = await run("ui_draft_action", { type: "memo", recipient: "Shift handover", subject: "x", body: "y" });
  assert.ok(r.isError && /follow a person's decision/.test(r.result.error), "a draft before a decision is refused");
  r = await run("sim_cost_options", { variants: [{ variant_id: "A", name: "x", levers: [{ type: "close_tote", store_ids: ["ESS"] }] }] });
  assert.ok(r.isError && /exactly three variants/.test(r.result.error) && /unknown lever close_tote/.test(r.result.error), "a safety lever is not an option");
  r = await run("sim_cost_options", REFERENCE_CASES["SC1-EXPRESS"].options);
  assert.ok(!r.isError && r.result.variants.length === 3);
  r = await run("ui_propose_options", { ...opts, options: opts.options.map((o) => (o.variant_id === "A" ? { ...o, description: "Costs €140.00." } : o)) });
  assert.ok(r.isError && r.result.refused && /€140\.00/.test(r.result.error), "an amount the engine did not produce is refused");
  r = await run("ui_propose_options", opts);
  assert.equal(r.result.decision, "approved", "the decision on the older option set is ignored, the one on this set counts");
  assert.equal(r.result.option_id, "B");
  r = await run("wms_apply_option", { option_id: "A" });
  assert.ok(r.isError && /Only the approved option/.test(r.result.error));
  r = await run("sim_advance");
  assert.ok(r.isError && /not applied yet/.test(r.result.error), "the night waits for the approved option to be applied");
  r = await run("wms_apply_option", { option_id: "B" });
  assert.ok(!r.isError && r.result.applied);
  assert.ok(events.some((e) => e.type === "plan_update" && e.p.option_id === "B"));
  r = await run("ui_draft_action", { type: "call_in", recipient: "On-call picker pool", subject: "Call-in", body: "One picker from 02:00 at €134.25." });
  assert.ok(!r.isError, r.result.error);
  r = await run("sim_advance");
  assert.ok(r.isError && /wait/.test(r.result.error), "the night waits for the drafts");
  r = await run("ui_final_report", { markdown: "## Summary\n\nA summary that is long enough to publish." });
  assert.ok(r.isError && /closes the night/.test(r.result.error), "no summary before night end");
});

await test("scenario 1's script passes the checker on every decision path; a typed amount fails it, a right one too", async () => {
  const sc = scenario(1);
  const r = await SC.checkScript(WORLD, sc, SIM_RUNS[sc.id], REFERENCE_CASES[sc.id]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(Object.keys(r.paths).sort(), ["advise, approve B", "approve A", "approve B", "approve C", "approve baseline", "reject B, approve A"]);
  assert.equal(r.paths["advise, approve B"].hash, r.paths["approve B"].hash, "Advise gives the same night: the person applied what the agent would have");
  assert.deepEqual([...r.paths["approve B"].late], []);
  assert.deepEqual([...r.paths["approve baseline"].late].sort(), ["HAM", "SOE"]);
  assert.equal(r.paths["approve baseline"].outcome, "baseline_accepted");
  const tampered = JSON.parse(JSON.stringify(SIM_RUNS[sc.id]).replace("Expected {{B.total}}.", "Expected €140.00."));
  const bad = await SC.checkScript(WORLD, sc, tampered, REFERENCE_CASES[sc.id]);
  assert.ok(bad.errors.some((e) => /€140\.00 is typed/.test(e)), bad.errors.join(" | "));
  // A typed figure that is right tonight passes the narration audit, but would not follow a changed input:
  // the checker refuses it from the script's text.
  assert.deepEqual(SC.typedFigures(SIM_RUNS[sc.id]), [], "the shipped script types no figure");
  const typedRight = JSON.parse(JSON.stringify(SIM_RUNS[sc.id]).replace("Expected {{B.total}}.", "Expected €134.25."));
  const caught = await SC.checkScript(WORLD, sc, typedRight, REFERENCE_CASES[sc.id]);
  assert.ok(caught.errors.some((e) => /"€134\.25" is typed; take it from a \{\{placeholder\}\}/.test(e)), caught.errors.join(" | "));
});

await test("golden option cases of scenarios 4 and 6: a maintenance stop saves labour, a call-in with the split saves Hamm and Soest", () => {
  // Scenario 4 at E3 (23:43), after the safety action that sends fragile items to the manual station.
  const s4 = sessionAt(4, "W3");
  assert.deepEqual([...s4.wake().kinds], ["escalation"]);
  s4.apply([{ type: "route_to_manual", fragile_only: true }], { source: "safety" });
  const r4 = s4.cost(REFERENCE_CASES["SC4-WEAR"].options.variants, E.defaults());
  const b4 = Object.fromEntries([r4.baseline, ...r4.variants].map((v) => [v.variant_id, v]));
  const want4 = { do_nothing: [0, 0, 0], A: [-20.37, -20.37, 0], B: [134.25, 134.25, 0], C: [-13.38, -13.38, 0] };
  for (const [id, [total, labour, late]] of Object.entries(want4)) {
    near(b4[id].expected_total_eur, total, `scenario 4 ${id} expected total`);
    near(b4[id].extra_labour_eur, labour, `scenario 4 ${id} extra labour`);
    near(b4[id].expected_late_orders, late, `scenario 4 ${id} late orders`);
  }
  assert.equal(eur2(b4.A.extra_labour_eur), "−€20.37");
  assert.ok(b4.A.extra_manual_picks < -200, `the stop saves failed grasps (${b4.A.extra_manual_picks} picks)`);
  // Scenario 6 at night start: Hamm and Soest late with doing nothing.
  const s6 = sessionAt(6, "W1");
  assert.deepEqual([...s6.wake().kinds].sort(), ["cutoff_risk", "night_start"]);
  const r6 = s6.cost(REFERENCE_CASES["SC6-PEAK"].options.variants, E.defaults());
  const b6 = Object.fromEntries([r6.baseline, ...r6.variants].map((v) => [v.variant_id, v]));
  const want6 = { do_nothing: [500, 0, 2, { HAM: 20, SOE: 20 }], A: [166.94, 166.94, 0, {}], B: [181.16, 181.16, 0, {}], C: [500, 0, 2, { HAM: 20, SOE: 20 }] };
  for (const [id, [total, labour, late, by]] of Object.entries(want6)) {
    near(b6[id].expected_total_eur, total, `scenario 6 ${id} expected total`);
    near(b6[id].extra_labour_eur, labour, `scenario 6 ${id} extra labour`);
    near(b6[id].expected_late_orders, late, `scenario 6 ${id} late orders`);
    assert.deepEqual(b6[id].late_by_order, by, `scenario 6 ${id} late by order`);
  }
  assert.ok(b6.B.tonight.smallest_slack_min > b6.A.tonight.smallest_slack_min, "option B buys more margin than option A");
});

await test("an order moved to tomorrow's wave saves no labour; a stop's saving is credited (TECH_NOTES D48)", () => {
  // Scenario 1's option C moves Soest: its work is deferred, not saved, so its extra labour stays zero.
  const ses = sessionAt(1, "W4");
  const r = ses.cost(REFERENCE_CASES["SC1-EXPRESS"].options.variants, E.defaults());
  const c = r.variants.find((v) => v.variant_id === "C");
  assert.equal(c.extra_manual_picks, 0, `moving Soest counts its manual picks on neither side (${c.extra_manual_picks})`);
  // Control: counted the old way, against doing nothing with Soest's own picks in it, moving Soest would read as a saving.
  const nightSoest = ses.night;
  const NOW = ses.now() + 1;
  const base = NS.simulate(nightSoest, { seed: 7, levers: ses.levers(), events: false });
  const moved = NS.simulate(nightSoest, { seed: 7, levers: [...ses.levers(), ...O.leversFrom(c.levers, NOW)], events: false });
  assert.ok(moved.stats.manual_picks < base.stats.manual_picks, "control: the raw manual picks do drop when Soest leaves tonight's work");
});

await test("Tonight's labour euros carry the call-in premium (TECH_NOTES D46): option B's night costs €69.55 per 1,000 units", async () => {
  const sc = scenario(1);
  const r = await SC.replayScript(SIM_RUNS[sc.id], { world: WORLD, scenario: sc, refs: REFERENCE_CASES[sc.id], plan: { option: "B" } });
  assert.ok(r.ok, r.errors.join(" | "));
  const f = r.session.figures();
  near(f.called_in_hours, 3, "the called-in hours as billed");
  const v = E.defaults();
  assert.equal(eur2(E.tonightEuros(v, f).per_thousand_eur), "€69.55");
  near(E.tonightEuros(v, f).labour_eur, (f.labour_hours - 3) * 35.8 + 3 * 35.8 * 1.25, "base hours at c, called-in hours with the premium");
  assert.equal(eur2(E.tonightEuros({ ...v, callin_premium: 0 }, f).per_thousand_eur), "€61.65", "control: without the premium, M3's figure");
  const report = r.events.filter((e) => e.type === "tool_result" && e.payload.name === "sim_night_report").at(-1).payload.result;
  assert.equal(eur2(report.labour_eur_per_1000), "€69.55", "the night report the agent reads");
  assert.equal(r.vars["night.per1000_eur"], "€69.55", "the placeholder the script shows");
});

await test("every scenario's script passes the checker on every path a person can take, and types no figure", async () => {
  const want = {
    "SC2-GLASS": { paths: ["no decision"], outcome: "correction_only" },
    "SC3-UNKNOWN": { paths: ["no decision, confirm the entry", "no decision, reject the entry"], outcome: "escalation_only" },
    "SC4-WEAR": { paths: ["advise, approve A", "approve A", "approve B", "approve C", "approve baseline", "reject A, approve B"], outcome: "option_decided" },
    "SC5-EARLY": { paths: ["no decision"], outcome: "correction_only" },
    "SC6-PEAK": { paths: ["advise, approve A", "approve A", "approve B", "approve C", "approve baseline", "reject A, approve B"], outcome: "option_decided" }
  };
  for (const [id, w] of Object.entries(want)) {
    const sc = SCENARIOS.find((x) => x.id === id);
    const r = await SC.checkScript(WORLD, sc, SIM_RUNS[id], REFERENCE_CASES[id] || {});
    assert.deepEqual(r.errors, [], `${id}: ${r.errors.slice(0, 2).join(" | ")}`);
    assert.deepEqual(Object.keys(r.paths).sort(), w.paths, `${id} paths`);
    assert.deepEqual(SC.typedFigures(SIM_RUNS[id]), [], `${id} types no figure`);
    const main = r.paths[w.paths.find((p) => /approve A$|no decision/.test(p))];
    assert.equal(main.outcome, w.outcome, `${id} outcome`);
    assert.deepEqual([...main.late], [], `${id}: every truck on time on the main path`);
  }
  // Scenario 6 doing nothing: Hamm and Soest late, as the brief's N2 calibration has it.
  const r6 = await SC.checkScript(WORLD, scenario(6), SIM_RUNS["SC6-PEAK"], REFERENCE_CASES["SC6-PEAK"]);
  assert.deepEqual([...r6.paths["approve baseline"].late].sort(), ["HAM", "SOE"]);
  assert.equal(r6.paths["advise, approve A"].hash, r6.paths["approve A"].hash, "Advise plays the same night as Approve");
  // Controls: a script missing its rejection path, and a confirmation without a branch, both fail.
  const noReject = JSON.parse(JSON.stringify(SIM_RUNS["SC4-WEAR"]));
  delete noReject.wakes[2].steps.find((x) => x.propose).propose.rejected.B;
  assert.ok((await SC.checkScript(WORLD, scenario(4), noReject, REFERENCE_CASES["SC4-WEAR"])).errors.some((e) => /no line for rejecting B/.test(e)));
  const noBranch = JSON.parse(JSON.stringify(SIM_RUNS["SC3-UNKNOWN"]));
  delete noBranch.wakes[2].steps.find((x) => x.confirm).confirm.rejected;
  assert.ok((await SC.checkScript(WORLD, scenario(3), noBranch, {})).errors.some((e) => /no steps for a rejected entry/.test(e)));
  // A script that applies the option itself in Advise mode is caught (the person applies it there).
  assert.equal(SC.SCRIPTS_REQUIRED.length, 6, "all six scripts are required");
});

console.log(failures.length ? `\n${failures.length} engine test(s) failed: ${failures.join("; ")}` : `\nAll ${passed} engine tests passed.`);
process.exit(failures.length ? 1 : 0);
