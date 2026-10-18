// The night player (PLAN.md §c.6, "Playback"). Builds tonight from a scenario and the presenter's
// assumptions, computes it with the night simulation (js/nightsim.js: pure, seeded, all at once) and
// plays its events onto the run-event bus at ×1, ×2 or ×4: at ×1 about six simulated minutes pass per
// real second, and stretches with nothing happening are fast-forwarded. At every wake-up (night
// start, a world-model correction, an escalation, a new order, a cut-off risk, night end) the night
// stands still until `onWake` resolves: the agent's turn (the live agent or the scripted replay, which
// may take decisions on the shared night session, js/night_session.js), or a short pause in a night
// preview. Every event carries its simulated time as `sim_t` (ms after 22:00).

import { bus } from "./events.js";
import { tonightFigures, clockOf, clockUp, MINUTE, WEIGHT_TOLERANCE } from "./nightsim.js";
import { createNightSession } from "./night_session.js";

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
 * Creates a player. hooks: { getSpeed() → 1 | 2 | 4, onWake(wake, session) → Promise (the night waits
 * for it: the agent's turn), now() → ms (defaults to performance.now), schedule(fn) (defaults to
 * requestAnimationFrame) }.
 */
export function createNightPlayer(hooks = {}) {
  const getSpeed = hooks.getSpeed || (() => 1);
  const onWake = hooks.onWake || (() => Promise.resolve());
  const now = hooks.now || (() => performance.now());
  const schedule = hooks.schedule || ((fn) => (typeof requestAnimationFrame === "function" && !document.hidden ? requestAnimationFrame(fn) : setTimeout(fn, 33)));
  let current = null;

  /**
   * Plays one night. opts: { session } (js/night_session.js: the producers share it), or { world,
   * scenario, params ({ r_m, r_c, p }), seed } for a session of its own. Resolves with { status: "done" |
   * "aborted", session, night, result, figures } once the night has ended or was stopped. The night
   * always plays the session's current events, so a decision taken at a wake-up changes what follows.
   */
  function play({ session = null, world, scenario, params = {}, seed } = {}) {
    stop();
    const ses = session || createNightSession({ world, scenario, params, seed: seed ?? scenario.night.seed });
    return new Promise((resolve) => {
      const run = { ses, t: 0, last: now(), waiting: false, stopped: false, minute: -1, resolve };
      current = run;
      bus.emit("night_plan", ses.info);
      emitClock(run, false);
      const tick = () => {
        if (run.stopped) return;
        if (run.waiting) { run.last = now(); schedule(tick); return; }
        const n = now();
        const dt = Math.min(250, Math.max(0, n - run.last)); // a hidden tab or a slow frame never jumps the night
        run.last = n;
        const next = ses.peek();
        const advance = dt * SIM_MS_PER_REAL_MS * (getSpeed() || 1);
        // A long quiet stretch passes faster, but never beyond the next event.
        const idle = next && next.t - run.t > IDLE_GAP_MS;
        const target = idle ? Math.min(run.t + advance * IDLE_FACTOR, next.t) : run.t + advance;
        // Emit everything due by the target; a wake-up stops the night until its turn is over.
        while (ses.peek() && ses.peek().t <= target) {
          const ev = ses.take();
          run.t = Math.max(run.t, ev.t);
          emitClock(run, false);
          if (ev.type === "wake") {
            const end = ev.payload.kind === "night_end";
            bus.emit("wake", { ...ev.payload, sim_t: ev.t });
            run.waiting = true;
            emitClock(run, true, "the agent's turn");
            // At night end the night is over before the agent's last turn: its figures are final.
            if (end) emitNightEnd(run);
            Promise.resolve(onWake(ev.payload, ses)).catch(() => null).then(() => {
              if (run.stopped) return;
              ses.resume();
              run.waiting = false;
              run.last = now();
              emitClock(run, false);
              if (end) finish(run);
            });
            if (end) return;
            schedule(tick);
            return;
          }
          bus.emit(ev.type, { ...ev.payload, sim_t: ev.t });
        }
        run.t = Math.max(run.t, target);
        emitClock(run, false);
        if (!ses.peek() && run.t >= ses.run.end_ms) { emitNightEnd(run); finish(run); return; }
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

  function emitNightEnd(run) {
    if (run.endEmitted) return;
    run.endEmitted = true;
    const res = run.ses.run;
    bus.emit("night_end", { sim_t: res.end_ms, figures: tonightFigures(run.ses.night, res), orders: res.orders.map((o) => ({ id: o.id, name: o.name, on_time: o.on_time, moved: o.moved, done: clockUp(o.done_ms), cutoff: o.cutoff, slack_min: Math.floor(o.slack_ms / MINUTE), totes: o.totes, units: o.units })) });
    bus.emit("unit_log", unitLog(res));
  }

  function finish(run) {
    if (run.stopped || run.finished) return;
    run.finished = true;
    emitNightEnd(run);
    current = null;
    const res = run.ses.run;
    run.resolve({ status: "done", session: run.ses, night: run.ses.night, result: res, figures: tonightFigures(run.ses.night, res) });
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
    if (log && !run.endEmitted) bus.emit("unit_log", unitLog(run.ses.run, run.t));
    run.resolve({ status: "aborted", session: run.ses, night: run.ses.night, result: run.ses.run, figures: null });
  }

  return { play, stop, isPlaying: () => !!current, currentNight: () => current, currentSession: () => current?.ses || null };
}
