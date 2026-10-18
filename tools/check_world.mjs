// Developer check (optional; the app itself needs no Node): validates the synthetic world, the
// scenarios, the shadow record and the Open Food Facts snapshot, that the generated data files are what
// tools/build_world.mjs writes today, and every simulation script under the live guardrail policy
// (js/sim_check.js: replayed headless through the agent's tools on every decision path).
// Usage from the repository root:  node tools/check_world.mjs
// The same checks run in the browser via Diagnostics → "World data integrity" and "Simulation scripts".

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ["data/world.js", "data/scenarios.js", "data/shadow_record.js", "data/off_snapshot.js", "data/reference_cases.js", "data/sim_runs.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
}

const { checkWorld } = await import(pathToFileURL(path.join(root, "js/world_check.js")).href);
const { checkSimRuns } = await import(pathToFileURL(path.join(root, "js/sim_check.js")).href);
const { files } = await import(pathToFileURL(path.join(root, "tools/build_world.mjs")).href);
const { WORLD, SCENARIOS, SHADOW_RECORD, OFF_SNAPSHOT, SIM_RUNS, REFERENCE_CASES } = sandbox.window;
globalThis.OFF_SNAPSHOT = OFF_SNAPSHOT;
const result = checkWorld(WORLD, SCENARIOS || [], SHADOW_RECORD || null, OFF_SNAPSHOT || null);

// The committed data files must be exactly what the generator writes now.
const stale = files().filter(([file, content]) => fs.readFileSync(file, "utf8") !== content).map(([file]) => path.relative(root, file));
result.checks.push({ name: "Data files match tools/build_world.mjs", ok: stale.length === 0, detail: stale.length ? `stale: ${stale.join(", ")} (run node tools/build_world.mjs)` : "data/world.js and data/shadow_record.js are current" });

// The simulation scripts, held to the live guardrails (scenarios without a script yet are listed as pending).
for (const c of await checkSimRuns(WORLD, SIM_RUNS || {}, SCENARIOS || [], REFERENCE_CASES || {})) result.checks.push(c);

for (const c of result.checks) {
  console.log(`${c.pending ? "PEND" : c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  —  ${c.detail}` : ""}`);
}
const pending = result.checks.filter((c) => c.pending).length;
const counted = result.checks.filter((c) => !c.pending);
const passed = counted.filter((c) => c.ok).length;
console.log(`\n${passed}/${counted.length} checks passed${pending ? `; ${pending} script${pending === 1 ? "" : "s"} pending (M4)` : ""}.`);
process.exit(passed === counted.length ? 0 : 1);
