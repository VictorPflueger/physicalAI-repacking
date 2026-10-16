// The day the app treats as today (day 0 of the synthetic world). Normally the real date; a replay
// of a recorded live run pins it to the recording day, so the dates in the recorded narration and
// the dates the engine computes for the tiles and cards agree. Pure module (no DOM).

let pinned = null;

/** Today for every day/date calculation: the pinned day, or now. */
export function appToday() {
  return pinned === null ? new Date() : new Date(pinned);
}

/** Pins today to a date (a recorded replay), or releases it with null. */
export function pinToday(date) {
  const t = date === null || date === undefined ? NaN : new Date(date).getTime();
  pinned = Number.isFinite(t) ? t : null;
}
