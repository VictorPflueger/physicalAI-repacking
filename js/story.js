// The showcase's one night and the five steps a presenter walks through. Pure: no DOM, no clock, so
// Node computes exactly what the page shows (tests/figures.mjs).
//
// The night is 0.5.0's main run, "Unknown item on the pallet": 3,000 units for 12 stores, a glass jar
// the scale finds heavier than its master data, and a barcode the world model has never seen. The night
// simulation plays it unit by unit (js/nightsim.js) with the agent's one action of that run: at the
// correction it closes the tote it had packed by the old weight. Every hour and euro comes from the
// simulation and the engine (js/engine.js); the words around them are written here.

import { buildNight, simulate, nightHash, tonightFigures, clockOf } from "./nightsim.js";
import { defaults, night as engineNight, tonightEuros } from "./engine.js";
import { worth, savingText } from "./worth.js";
import { eur2, hours, int, pct } from "./format.js";

/** The night: the regular volume, its seed, and the unknown barcode on 6 units at 23:10 (Synthetic). */
export const NIGHT = Object.freeze({
  volume: "n1",
  seed: 7,
  unknown: Object.freeze({ barcode: "4037848020859", units: 6, at: "23:10" })
});

/** The five steps of the talk track, in order. */
export const STEP_IDS = Object.freeze(["plan", "learns", "asks", "result", "your-dc"]);

/**
 * "Apricot jam 200 g, glass jar" → "Apricot jam 200 g": the name without its pack, with no-break
 * spaces inside a size ("200 g", "6 × 1.5 l") so a tile never wraps a unit onto its own line.
 */
export const itemName = (name) => String(name).split(",")[0].trim()
  .replace(/(\d) × (\d)/g, "$1\u00a0×\u00a0$2")
  .replace(/(\d) (g|kg|l|ml)\b/g, "$1\u00a0$2");

/** The item master's reason an item goes to people, in a customer's words. */
export function reasonText(reason) {
  if (!reason) return "";
  if (/payload/i.test(reason)) return "too heavy for the robot";
  // A word joiner after each hyphen keeps "age-restricted" on one line of a narrow tile.
  return (reason.charAt(0).toLowerCase() + reason.slice(1).replace(" and ", ", ")).replace(/-/g, "-⁠");
}

const nb = (n, unit) => `${n} ${unit}`;

/**
 * Builds the night and everything the page says about it. world: window.WORLD (data/world.js).
 * Returns { night, res, hash, facts, steps }.
 */
export function buildShowcase(world) {
  const night = buildNight(world, NIGHT);
  // The agent acts at the correction: run the night once to find it, then again with the action.
  const first = simulate(night, { seed: NIGHT.seed });
  const corr = first.corrections[0];
  const toteStore = corr ? corr.unit_id.split(":")[0] : null;
  const levers = corr ? [{ type: "close_tote", store_ids: [toteStore], from_ms: corr.at + 1, decided_ms: corr.at + 1, source: "safety" }] : [];
  const res = simulate(night, { seed: NIGHT.seed, levers });
  const facts = factsOf(world, night, res, toteStore);
  return { night, res, hash: nightHash(res), facts, steps: stepsOf(facts) };
}

function factsOf(world, night, res, toteStore) {
  const v = defaults();
  const w = worth(v);
  const planned = night.units.filter((u) => u.order && !u.express);
  const robotUnits = planned.filter((u) => u.eligible).length;
  const corr = res.corrections[0];
  const esc = res.escalations[0];
  const jar = night.itemsBySku.get(corr.sku);
  const rehearsal = res.events.find((e) => e.type === "rehearsal" && e.payload.sku === corr.sku)?.payload;
  const fig = tonightFigures(night, res);
  const eur = tonightEuros(v, fig);
  // The same units by hand: every unit a person or the robot handled, the set-aside ones included.
  const byHand = engineNight(v, fig.units_repacked + fig.set_aside);
  const storeName = (id) => world.stores.find((s) => s.id === id)?.name || id;
  const byCutoff = [...night.orders].sort((a, b) => a.cutoff_ms - b.cutoff_ms);
  const peopleItems = night.items.filter((it) => !it.cell);
  // Two items people take because they break: the plan's examples ("free-range eggs and red wine").
  const fragile = peopleItems.filter((it) => /fragile/i.test(it.manual_reason || "")).slice(0, 2).map((it) => itemName(it.name).replace(/ \d.*$/, "").toLowerCase());
  return {
    v, worth: w,
    units: planned.length, robotUnits, peopleUnits: planned.length - robotUnits,
    stores: night.orders.length, items: night.items.length, peopleItems: peopleItems.length, fragile,
    firstTruck: { store: byCutoff[0].name, at: byCutoff[0].cutoff }, lastTruck: { store: byCutoff.at(-1).name, at: byCutoff.at(-1).cutoff },
    jar: { sku: corr.sku, name: itemName(jar.name), old: corr.old, new: corr.new, at: corr.at, clock: clockOf(corr.at), success: rehearsal?.expected_success ?? null, store: storeName(toteStore) },
    unknown: { barcode: esc.barcode, units: esc.units, at: esc.t, clock: clockOf(esc.t) },
    end: res.end_ms, endClock: clockOf(res.end_ms),
    lastWork: Math.max(...res.units.filter((u) => u.t_done !== null).map((u) => u.t_done)),
    tonight: {
      repacked: fig.units_repacked, robot: fig.successes, hand: fig.manual_picks - fig.set_aside, setAside: fig.set_aside,
      read: res.events.filter((e) => e.type === "detection").length, corrections: fig.corrections,
      attempts: fig.attempts, success: fig.attempts ? fig.successes / fig.attempts : 0,
      labourH: fig.labour_hours, labourEur: eur.labour_eur, byHandH: byHand.manual_h, byHandEur: byHand.manual_eur,
      saving: byHand.manual_eur > 0 ? 1 - eur.labour_eur / byHand.manual_eur : 0,
      onTime: fig.orders_on_time, orders: fig.orders, learned: fig.corrections + fig.escalations
    }
  };
}

/**
 * The steps: { id, n, t, clock, label, heading, text, agent, flow, flowIf?, decision? }. flow holds what
 * each of the five stations says at that moment: [camera, model, robot, scale, person], each { value,
 * note, tone }; flowIf replaces it once the presenter has answered at 23:10 (see flowOf).
 */
function stepsOf(F) {
  const T = F.tonight;
  const step = (id, t, clock, label, rest) => ({ id, n: STEP_IDS.indexOf(id) + 1, t, clock, label, ...rest });
  const asks = (model) => [
    { value: "Unknown barcode", note: F.unknown.barcode, tone: "unknown" },
    model,
    { value: "Doesn't pick it", note: "a rule in code" },
    { value: "Not weighed", note: "nothing to check against" },
    { value: `${F.unknown.units} units`, note: "go to a person", tone: "person" }
  ];
  const weights = T.corrections === 1 ? "a weight" : `${T.corrections} weights`;
  const result = (learned, note) => [
    { value: `${int(T.read)} read`, note: "every unit at the cell" },
    { value: `Learned ${learned}`, note, tone: "learn" },
    { value: `${int(T.robot)} picked`, note: `${pct(T.success, 0)} of ${int(T.attempts)} grasps` },
    { value: `${int(T.robot)} weighed`, note: `${T.corrections} ${T.corrections === 1 ? "correction" : "corrections"}` },
    { value: `${int(T.hand)} by hand`, note: `and ${T.setAside} set aside` }
  ];
  return [
    step("plan", 0, "22:00", "The plan", {
      heading: `Tonight: ${int(F.units)} units for ${F.stores} stores`,
      text: `The world model holds all ${F.items} items on the pallet. The robot may take ${int(F.robotUnits)} units; people take the other ${int(F.peopleUnits)}, items the robot may not grip, such as ${F.fragile.join(" and ")}.`,
      agent: "Earliest truck first, heavy items at the bottom of each tote. I let the night run and step in when something changes.",
      flow: [
        { value: "Reads every item", note: "and its barcode" },
        { value: `${F.items} items`, note: "weight, size, grip" },
        { value: `${int(F.robotUnits)} units`, note: "it may take" },
        { value: "Checks every pick", note: "against the model" },
        { value: `${int(F.peopleUnits)} units`, note: "the robot may not grip" }
      ]
    }),
    step("learns", F.jar.at, F.jar.clock, "It learns", {
      heading: `The scale weighs a jar at ${nb(F.jar.new, "g")}, not ${nb(F.jar.old, "g")}`,
      text: `${F.jar.name.replace(/ \d.*$/, "")} is listed at ${nb(F.jar.old, "g")}, the jam alone; the robot lifts the glass too. The world model now expects ${nb(F.jar.new, "g")} for every jar, and the robot rehearses the next one with it.`,
      agent: `${F.jar.store}'s tote was packed with the old weight, so I close it and start a fresh one.`,
      flow: [
        { value: F.jar.name.replace(/ \d.*$/, ""), note: `labelled ${nb(F.jar.old, "g")}` },
        { value: `Now ${nb(F.jar.new, "g")}`, note: "for every jar", tone: "learn" },
        { value: F.jar.success === null ? "Rehearsed" : `${pct(F.jar.success, 0)} success`, note: `rehearsed at ${nb(F.jar.new, "g")}` },
        { value: `Weighed ${nb(F.jar.new, "g")}`, note: `the model expected ${nb(F.jar.old, "g")}`, tone: "learn" },
        { value: "Not involved", note: "the robot picks the jar" }
      ]
    }),
    step("asks", F.unknown.at, F.unknown.clock, "It asks", {
      heading: "A barcode the world model doesn't know",
      text: `The camera reads ${F.unknown.barcode} on ${F.unknown.units} units. The robot never picks what the model doesn't know, so a rule in code sends them to a person.`,
      agent: "I've created a provisional entry, marked unverified. Do you confirm it?",
      decision: {
        confirm: `Confirmed by you. The model knows the barcode from now on, still without weight or grip, so tonight's ${F.unknown.units} units stay with a person.`,
        reject: `Rejected by you. The barcode stays unknown, and its ${F.unknown.units} units stay with a person.`
      },
      flow: asks({ value: "Not in the model", note: "a new entry waits for you", tone: "unknown" }),
      flowIf: {
        confirm: asks({ value: "Now in the model", note: "no weight or grip yet", tone: "learn" }),
        reject: asks({ value: "Not in the model", note: "rejected by you", tone: "unknown" })
      }
    }),
    step("result", F.end, F.endClock, "The result", {
      heading: "Every truck left on time",
      text: `${T.onTime} of ${T.orders} store orders made their trucks. The robot picked ${int(T.robot)} units and people ${int(T.hand)}; the ${T.setAside} unknown units went aside for a person.`,
      agent: `Night over: labour came to ${hours(T.labourH)}. By hand, the same units would have taken ${hours(T.byHandH)}.`,
      compare: {
        cell: { hours: hours(T.labourH), eur: eur2(T.labourEur) },
        hand: { hours: hours(T.byHandH), eur: eur2(T.byHandEur) },
        share: T.labourEur / T.byHandEur, saving: savingText(T.saving)
      },
      // What the model learned depends on the answer at 23:10: the weight always, the barcode once confirmed.
      flow: result(T.corrections, `${weights}, not yet the barcode`),
      flowIf: {
        confirm: result(T.learned, `${weights}, a barcode`),
        reject: result(T.corrections, `${weights}, not the barcode`)
      }
    }),
    step("your-dc", F.end, F.endClock, "Your DC", {
      heading: "What it is worth for your DC",
      text: "Type your site's yearly volume and labour cost. The engine prices them at the rates of the night you just saw.",
      agent: null,
      flow: null
    })
  ];
}

/** The step with this id, or the first. */
export function stepById(steps, id) {
  return steps.find((s) => s.id === id) || steps[0];
}

/** What the five stations say at a step, given the answer at 23:10 ("confirm", "reject" or none). */
export function flowOf(step, decision) {
  return (decision && step.flowIf?.[decision]) || step.flow;
}
