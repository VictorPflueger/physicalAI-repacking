// Tonight as one session (PLAN.md §a.2): the night, the decisions taken so far, the night computed with
// them, how far it has been played, and the cell board's state at that moment. Both producers (the live
// agent and the scripted replay) and the night player (js/night.js) share one session per run, so the
// tools read exactly what the screen shows and every decision changes the same night. Pure module: no
// DOM and no bus, so the script checker runs it in Node.
//
// A decision is taken while the night stands at a wake-up. Its levers act from the next millisecond
// (decided_ms = wake time + 1): the night is computed again with every decision so far, and everything
// up to and including the wake-up stays exactly as it was played (checked on every decision; TECH_NOTES
// D33). Projections before a decision never see it, and a wake-up that has been played takes nothing
// that happens after it. The night played in pieces is therefore one simulation with the decisions:
// Simulation and Live give the same physical night for the same decisions.

import { buildNight, runNight, nightInfo, projectAt, tonightFigures, leverUntil, clockOf, clockUp, msOf, MINUTE } from "./nightsim.js";
import { createNightState, applyEvent } from "./cell_data.js";
import { costOptions } from "./options.js";
import { cutoffRisks } from "./escalation.js";
import { planUpdate } from "./payoff.js";

/**
 * opts: { world, scenario, params ({ r_m, r_c, p, callin_min_h }), seed, cache }. `cache` ({ runs: Map,
 * costs: Map }) lets several sessions of the same night share computed nights and costings (the
 * script checker replays every decision path; both functions are pure). Returns the session API below.
 */
export function createNightSession({ world, scenario, params = {}, seed, cache = null } = {}) {
  const s = seed ?? scenario.night.seed;
  const night = buildNight(world, { ...scenario.night, seed: s }, params);
  const info = { ...nightInfo(night, { seed: s }), scenario_id: scenario.id };
  const callInMin = night.P.callin_min_h * 60;
  let levers = [];          // every lever decided so far, with decided_ms, until_ms and its source
  const closedAt = [];      // the moments of the wake-ups played so far
  const compute = (list) => {
    if (!cache) return runNight(night, { seed: s, levers: list, closedAt });
    const key = JSON.stringify([s, night.P, list, closedAt]);
    if (!cache.runs.has(key)) cache.runs.set(key, runNight(night, { seed: s, levers: list, closedAt }));
    return cache.runs.get(key);
  };
  let run = compute([]);
  let cursor = 0;           // index of the next event to play
  const state = createNightState(info);
  let wake = null;          // the wake-up the night stands at while a turn is on
  let lastT = 0;
  const decisions = [];     // { at, clock, source, option_id, levers }
  const listeners = new Set();
  let projection = null;    // { key, value }: the last projection, reused until the night moves or changes

  const same = (a, b) => a.t === b.t && a.type === b.type && JSON.stringify(a.payload) === JSON.stringify(b.payload);

  const session = {
    night, info, seed: s, scenario,
    /** The night as computed now (every decision so far). */
    get run() { return run; },
    /** The next event to play, or null at the end. */
    peek() { return run.events[cursor] || null; },
    /** Plays the next event into the session's state and returns it. */
    take() {
      const ev = run.events[cursor];
      if (!ev) return null;
      cursor += 1;
      lastT = Math.max(lastT, ev.t);
      applyEvent(state, ev.type, ev.payload, ev.t);
      if (ev.type === "wake") { wake = { ...ev.payload, t: ev.t }; closedAt.push(ev.t); }
      return ev;
    },
    /** The agent's turn is over: the night may move on. */
    resume() { wake = null; },
    /** The wake-up the night stands at, or null while it plays. */
    wake: () => wake,
    /** Simulated time now (ms after 22:00): the wake-up's time while one is open. */
    now: () => (wake ? wake.t : lastT),
    /** The board's view of tonight as played so far (js/cell_data.js). */
    state: () => state,
    played: () => cursor,
    finished: () => cursor >= run.events.length,
    levers: () => levers.map((l) => ({ ...l })),
    decisions: () => decisions.map((d) => ({ ...d, levers: d.levers.map((l) => ({ ...l })) })),
    /** Called with every decision ({ source, option_id, levers }); returns an unsubscribe function. */
    onDecision(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /**
     * Applies levers decided now (only while the night stands at a wake-up). meta: { source: "decision" |
     * "safety", option_id }. Returns { levers, update }: the levers as they act (start, end) and the
     * plan_update payload, already applied to the session's state, for the bus.
     */
    apply(list, meta = {}) {
      if (!wake) throw new Error("A decision can only be applied while the night stands at a wake-up.");
      const at = wake.t + 1;
      const added = list.map((l) => {
        const from = Math.max(l.start !== undefined ? msOf(l.start) : at, l.from_ms ?? at, at);
        const until = leverUntil(l, from, callInMin);
        return { ...l, from_ms: from, decided_ms: at, ...(until !== null ? { until_ms: until } : {}), source: meta.source || "decision", ...(meta.option_id ? { option_id: meta.option_id } : {}) };
      });
      const next = [...levers, ...added];
      const nextRun = compute(next);
      // Everything already played must stay exactly as it was: the decision acts only from now on.
      for (let i = 0; i < cursor; i++) {
        if (!nextRun.events[i] || !same(run.events[i], nextRun.events[i])) {
          throw new Error(`Internal error: the decision would change the night already played (event ${i}, ${clockOf(run.events[i]?.t ?? 0)}).`);
        }
      }
      levers = next;
      run = nextRun;
      projection = null;
      const update = { ...planUpdate({ source: meta.source || "decision", option_id: meta.option_id || null, levers: added, clock: clockOf(wake.t) }), sim_t: wake.t };
      applyEvent(state, "plan_update", update, wake.t);
      const d = { at, clock: clockOf(wake.t), source: meta.source || "decision", option_id: meta.option_id || null, levers: added };
      decisions.push(d);
      for (const fn of listeners) fn(d);
      return { levers: added, update };
    },

    /**
     * Projection from now with the decisions so far and expected outcomes: per visible order, its
     * projected last unit, cut-off and minutes to spare, and the orders inside the risk band (E4).
     */
    project() {
      const at = wake ? wake.t : lastT;
      const key = `${at}|${levers.length}|${cursor}`;
      if (projection?.key === key) return projection.value;
      const proj = projectAt(night, at, { seed: s, levers });
      const visible = night.orders.filter((o) => !(o.kind === "express" && night.express.at_ms > at));
      const statusOf = (id) => state.orders.get(id)?.status || "open";
      const open = visible.filter((o) => statusOf(o.id) === "open");
      const risks = cutoffRisks(open, proj, at);
      const value = {
        at: clockOf(at), at_ms: at,
        orders: visible.map((o) => {
          const status = statusOf(o.id);
          const p = proj.get(o.id);
          const moved = levers.some((l) => l.type === "move_to_next_wave" && (l.store_ids || []).includes(o.id));
          return {
            id: o.id, name: o.name, kind: o.kind, cutoff: o.cutoff, status: moved && status === "open" ? "moving to the next day's wave" : status,
            ...(status === "open" && !moved ? { projected_last_unit: clockUp(p), slack_min: Math.floor((o.cutoff_ms - p) / MINUTE), at_risk: risks.some((r) => r.order === o.id) } : {})
          };
        }),
        at_risk: risks.filter((r) => !levers.some((l) => l.type === "move_to_next_wave" && (l.store_ids || []).includes(r.order))).map((r) => r.order)
      };
      projection = { key, value };
      return value;
    },

    /** Prices three variants and doing nothing from now, on top of the levers already in force. */
    cost(variants, inputs) {
      const at = (wake ? wake.t : lastT) + 1;
      const args = { seed: s, now_ms: at, variants, inputs, base_levers: levers };
      if (!cache) return costOptions(night, args);
      const key = JSON.stringify([s, night.P, at, variants, inputs, levers]);
      if (!cache.costs.has(key)) cache.costs.set(key, costOptions(night, args));
      return cache.costs.get(key);
    },

    /** Tonight's figures; final once the night has ended. */
    figures: () => tonightFigures(night, run),
    nightOver: () => !!state.ended || wake?.kind === "night_end"
  };
  return session;
}

/** A cache for sessions of the same night (the script checker's decision paths). */
export function createSessionCache() {
  return { runs: new Map(), costs: new Map() };
}

/** The night's wake-ups that are ahead of the session (for the script checker and tests). */
export function wakeupsAhead(session) {
  return session.run.wakeups.filter((w) => w.t > session.now() || (w.t === session.now() && !session.wake()));
}
