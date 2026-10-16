// Small observable application state (mode, run state, selections). UI modules subscribe to it.

import { DEFAULT_MODEL, STORAGE, UI } from "./config.js";
import { DEFAULT_LEVEL } from "./autonomy.js";

const listeners = new Set();

const state = {
  mode: null,              // null | "simulation" | "live"   (chosen per run; cleared by Reset)
  runState: "idle",        // see RUN_STATES in events.js
  runId: null,
  scenarioId: readSession(STORAGE.scenario) || UI.defaultScenario,
  model: readSession(STORAGE.model) || DEFAULT_MODEL,
  speed: UI.speeds.includes(Number(readSession(STORAGE.speed))) ? Number(readSession(STORAGE.speed)) : 1,
  autonomy: DEFAULT_LEVEL, // "advise" | "approve" | "bounded" (the dial arrives with M4)
  keyPresent: false,
  simSource: null,         // "authored" | "recorded" while a simulation runs
  drawerOpen: false
};

export function getState() {
  return { ...state };
}

export function setState(patch) {
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (state[k] !== v) {
      state[k] = v;
      changed = true;
    }
  }
  if (patch.model) writeSession(STORAGE.model, patch.model);
  if (patch.speed) writeSession(STORAGE.speed, String(patch.speed));
  if (patch.scenarioId) writeSession(STORAGE.scenario, patch.scenarioId);
  if (changed) for (const fn of listeners) fn(getState());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const TERMINAL = ["done", "stopped", "aborted", "error"];

/** True while a run is in progress (anything except idle and terminal states). */
export function isRunning(s = state) {
  return s.runState !== "idle" && !TERMINAL.includes(s.runState);
}

/** True once a run has ended, whatever the outcome. */
export function isFinished(s = state) {
  return TERMINAL.includes(s.runState);
}

function readSession(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function writeSession(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* storage unavailable: keep in memory only */ }
}
