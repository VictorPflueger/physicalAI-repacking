// The night player (PLAN.md §c.6, "Playback"). Builds tonight from a scenario and the presenter's
// assumptions, computes it with the night simulation (js/nightsim.js: pure, seeded, all at once) and
// plays its events onto the run-event bus at ×1, ×2 or ×4: at ×1 about six simulated minutes pass per
// real second, and stretches with nothing happening are fast-forwarded. At every wake-up (night
// start, a world-model correction, an escalation, a new order, a cut-off risk, night end) the night
// stands still until `onWake` resolves: the agent's turn from M3; in this build a short pause that
// shows where the agent will come in. Every event carries its simulated time as `sim_t` (ms after 22:00).

import { bus } from "./events.js";
import { buildNight, runNight, nightInfo, tonightFigures, clockOf, clockUp, MINUTE, WEIGHT_TOLERANCE } from "./nightsim.js";

export const SIM_MS_PER_REAL_MS = (6 * MINUTE) / 1000; // ×1: six simulated minutes per real second
export const IDLE_GAP_MS = 4 * MINUTE;                  // a longer gap between events is fast-forwarded
export const IDLE_FACTOR = 12;                          // how much faster an idle stretch passes

/**
 * Events the audit keeps as one compact unit log instead of one envelope each (PLAN.md §d.1 "Audit
 * volume"): the ordinary unit's detection, grasp, scale reading, manual pick and tote, and the clock.
 */
export const FINE_EVENTS = new Set(["detection", "grasp_attempt", "scale_reading", "manual_pick", "tote_update", "clock"]);

/**
 * True for an ordinary, "fine" event; exceptions stay full events: an unknown barcode at the camera, a
 * failed grasp, a scale reading outside the tolerance, an item set aside, and a closed tote. The tote
 * line is the per-tote summary of PLAN.md §d.1 (store, tote number, units, weight).
 */
export function isFineEvent(type, p = {}) {
  if (!FINE_EVENTS.has(type)) return false;
  if (type === "detection") return p.known !== false;
  if (type === "grasp_attempt") return p.ok !== false;
  if (type === "scale_reading") return !(Math.abs(p.observed_g - p.expected_g) / p.expected_g > WEIGHT_TOLERANCE);
  if (type === "manual_pick") return !p.set_aside;
  if (type === "tote_update") return p.status !== "closed";
  return true;
}

/**
 * The unit log (one row per unit) of a night. Stopped at `untilMs`, it lists the units finished by then
 * and, without their outcome, the units the camera had seen: nothing from after the stop.
 */
export function unitLog(result, untilMs = Infinity) {
  const by = (x) => x !== null && x !== undefined && x <= untilMs;
  const rows = [];
  for (const u of result.units) {
    if (untilMs === Infinity || by(u.t_done)) rows.push([u.id, u.order, u.sku, u.station, u.path, u.t_attempt, u.t_done, u.tote]);
    else if (by(u.t_detect)) rows.push([u.id, u.order, u.sku, null, null, by(u.t_attempt) ? u.t_attempt : null, null, null]);
  }
  return {
    columns: ["unit", "order", "sku", "station", "path", "attempt_ms", "done_ms", "tote"],
    rows, seed: result.seed, hash: result.hash,
    ...(untilMs === Infinity ? {} : { partial: true, until: clockOf(untilMs) })
  };
}

/**
 * Creates a player. hooks: { getSpeed() → 1 | 2 | 4, onWake(wake) → Promise (the night waits for it),
 * now() → ms (defaults to performance.now), schedule(fn) (defaults to requestAnimationFrame) }.
 */
export function createNightPlayer(hooks = {}) {
  const getSpeed = hooks.getSpeed || (() => 1);
  const onWake = hooks.onWake || (() => Promise.resolve());
  const now = hooks.now || (() => performance.now());
  const schedule = hooks.schedule || ((fn) => (typeof requestAnimationFrame === "function" && !document.hidden ? requestAnimationFrame(fn) : setTimeout(fn, 33)));
  let current = null;

  /**
   * Plays one night. opts: { world, scenario, params ({ r_m, r_c, p }), seed }. Resolves with
   * { status: "done" | "aborted", night, result, figures } once the night has ended or was stopped.
   */
  function play({ world, scenario, params = {}, seed }) {
    stop();
    const night = buildNight(world, { ...scenario.night, seed: seed ?? scenario.night.seed }, params);
    const result = runNight(night, { seed: seed ?? scenario.night.seed });
    const info = { ...nightInfo(night, result), scenario_id: scenario.id };
    const events = result.events;
    return new Promise((resolve) => {
      const run = { night, result, info, i: 0, t: 0, last: now(), waiting: false, stopped: false, minute: -1, resolve };
      current = run;
      bus.emit("night_plan", info);
      emitClock(run, false);
      const tick = () => {
        if (run.stopped) return;
        if (run.waiting) { run.last = now(); schedule(tick); return; }
        const n = now();
        const dt = Math.min(250, Math.max(0, n - run.last)); // a hidden tab or a slow frame never jumps the night
        run.last = n;
        const next = events[run.i];
        const advance = dt * SIM_MS_PER_REAL_MS * (getSpeed() || 1);
        // A long quiet stretch passes faster, but never beyond the next event.
        const idle = next && next.t - run.t > IDLE_GAP_MS;
        const target = idle ? Math.min(run.t + advance * IDLE_FACTOR, next.t) : run.t + advance;
        // Emit everything due by the target; a wake-up stops the night until its turn is over.
        while (run.i < events.length && events[run.i].t <= target) {
          const ev = events[run.i++];
          run.t = Math.max(run.t, ev.t);
          emitClock(run, false);
          if (ev.type === "wake") {
            bus.emit("wake", { ...ev.payload, sim_t: ev.t });
            run.waiting = true;
            emitClock(run, true, "the agent's turn");
            Promise.resolve(onWake(ev.payload)).catch(() => null).then(() => {
              if (run.stopped) return;
              run.waiting = false;
              run.last = now();
              emitClock(run, false);
              if (ev.payload.kind === "night_end") finish(run);
            });
            if (ev.payload.kind === "night_end") return; // the night ends after its last wake-up
            schedule(tick);
            return;
          }
          bus.emit(ev.type, { ...ev.payload, sim_t: ev.t });
        }
        run.t = Math.max(run.t, target);
        emitClock(run, false);
        if (run.i >= events.length && run.t >= result.end_ms) { finish(run); return; }
        schedule(tick);
      };
      schedule(tick);
    });
  }

  function emitClock(run, paused, reason) {
    const minute = Math.floor(run.t / MINUTE);
    if (!paused && minute === run.minute && !run.wasPaused) return;
    run.minute = minute;
    run.wasPaused = paused;
    bus.emit("clock", { t: run.t, sim_t: run.t, label: clockOf(run.t), paused, ...(reason ? { reason } : {}) });
  }

  function finish(run) {
    if (run.stopped || run.finished) return;
    run.finished = true;
    const figures = tonightFigures(run.night, run.result);
    bus.emit("night_end", { sim_t: run.result.end_ms, figures, orders: run.result.orders.map((o) => ({ id: o.id, name: o.name, on_time: o.on_time, done: clockUp(o.done_ms), cutoff: o.cutoff, slack_min: Math.floor(o.slack_ms / MINUTE), totes: o.totes, units: o.units })) });
    bus.emit("unit_log", unitLog(run.result));
    current = null;
    run.resolve({ status: "done", night: run.night, result: run.result, figures });
  }

  /**
   * Stops the night where it is (Abort or Reset). With `log`, the units played so far go to the audit
   * as a partial unit log first (Abort keeps the record; Reset clears it anyway).
   */
  function stop({ log = false } = {}) {
    const run = current;
    if (!run) return;
    run.stopped = true;
    current = null;
    if (log) bus.emit("unit_log", unitLog(run.result, run.t));
    run.resolve({ status: "aborted", night: run.night, result: run.result, figures: null });
  }

  return { play, stop, isPlaying: () => !!current, currentNight: () => current };
}
