// Memory of data sources that failed in this browser session, so the open_* tools can skip a
// blocked source and the agent falls back to web search at once. Diagnostics writes here too.
//
// Only failures that say something about the source are remembered: a network, CORS or timeout
// failure, or a server error (5xx). A 4xx caused by the tool's own input (an unknown LEI, say) is a
// tool error, not a broken source. A remembered failure expires after FAIL_TTL_MS, so one bad moment
// in a rehearsal cannot silently remove a source from the show.

import { STORAGE } from "./config.js";

export const FAIL_TTL_MS = 10 * 60 * 1000;

function read() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE.diagnostics) || "{}"); } catch { return {}; }
}
function write(m) {
  try { sessionStorage.setItem(STORAGE.diagnostics, JSON.stringify(m)); } catch { /* storage unavailable */ }
}

/** Remember a source result (status: "pass" | "fail" | "warn"), with where it came from. */
export function remember(id, status, detail = "", origin = "tool") {
  const m = read();
  m[id] = { status, detail, origin, at: new Date().toISOString() };
  write(m);
}

/** The remembered failure of a source if it is recent enough to skip the source, else null. */
export function recentFailure(id, now = Date.now()) {
  const r = read()[id];
  if (!r || r.status !== "fail") return null;
  const age = now - Date.parse(r.at || 0);
  return Number.isFinite(age) && age >= 0 && age < FAIL_TTL_MS ? r : null;
}

export function memory() {
  return read();
}
