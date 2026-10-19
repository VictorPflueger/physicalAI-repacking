// Scenario 3, the main run of the Customer view (TECH_NOTES D63), for the tests: its scripted replay in
// Node for a decision plan, and what the world model and What it is worth must show from it. Every
// expected figure comes from the night simulation and the engine here, never typed.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./harness.mjs";
import { loadData } from "./scenario1.mjs";

const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);

/** Scenario 3's scripted replay headless for a plan ({ confirm: "confirm" | "reject" }). */
export async function replayScenario3(plan = { option: null, confirm: "confirm" }) {
  const data = await loadData();
  const { replayScript } = await mod("js/sim_check.js");
  const NS = await mod("js/nightsim.js");
  const E = await mod("js/engine.js");
  const F = await mod("js/format.js");
  const sc = data.SCENARIOS.find((s) => s.id === "SC3-UNKNOWN");
  const r = await replayScript(data.SIM_RUNS[sc.id], { world: data.WORLD, scenario: sc, refs: data.REFERENCE_CASES[sc.id] || {}, plan });
  if (!r.ok) throw new Error(`The scripted replay of scenario 3 failed in Node: ${r.errors.join(" | ")}`);
  const run = r.session.run;
  const events = run.events;
  // Item by item: units planned tonight, picked by the robot, picked by hand (the night's own events).
  const robot = {};
  const hand = {};
  for (const e of events) {
    if (e.type === "grasp_attempt" && e.payload.ok) robot[e.payload.sku] = (robot[e.payload.sku] || 0) + 1;
    if (e.type === "manual_pick" && e.payload.sku) hand[e.payload.sku] = (hand[e.payload.sku] || 0) + 1;
  }
  const info = NS.nightInfo(r.session.night || NS.buildNight(data.WORLD, sc.night), { seed: sc.night.seed });
  const correction = events.find((e) => e.type === "world_model_correction")?.payload || null;
  const rehearsal = events.find((e) => e.type === "rehearsal" && e.payload.sku === correction?.sku)?.payload || null;
  const e1Event = events.find((e) => e.type === "escalation" && e.payload.rule === "E1") || null;
  // The night's events carry their time beside the payload; on the page it arrives as the payload's sim_t.
  const e1 = e1Event ? { ...e1Event.payload, sim_t: e1Event.t } : null;
  const night = r.session.night || NS.buildNight(data.WORLD, sc.night);
  const fig = NS.tonightFigures(night, run);
  const v = E.defaults();
  const eur = E.tonightEuros(v, fig);
  const setAside = events.filter((e) => e.type === "manual_pick" && e.payload.set_aside).length;
  // The same units by hand, the set-aside ones included (TECH_NOTES D69).
  const byHand = E.night(v, fig.units_repacked + setAside);
  return {
    data, scenario: sc, replay: r, run, hash: run.hash, calls: r.calls, events, info, robot, hand,
    correction, rehearsal, e1, fig, setAside,
    item: (sku) => data.WORLD.items.find((i) => i.sku === sku),
    // What it is worth at night end, as the panel words it (js/worth_panel.js).
    tonight: {
      units: `${F.int(fig.units_repacked)} of ${F.int(fig.units_repacked)}: ${F.int(fig.successes)} by the robot, ${F.int(fig.manual_picks - setAside)} by hand`,
      labour: `${F.hours(fig.labour_hours)} · ${F.eur2(eur.labour_eur)} with the cell${setAside ? ` (${F.int(fig.manual_picks - setAside)} + ${F.int(setAside)} set aside)` : ""}; by hand ${F.hours(byHand.manual_h)} · ${F.eur2(byHand.manual_eur)}`,
      per1000: `${F.eur2(eur.per_thousand_eur)} with the cell`,
      orders: `${F.int(fig.orders_on_time)} of ${F.int(fig.orders)} on their trucks`
    },
    F, E, NS
  };
}
