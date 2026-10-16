// Developer check (optional; the app itself needs no Node): validates the synthetic world, the
// scenarios, the shadow record and the Open Food Facts snapshot, and that the generated data files
// are what tools/build_world.mjs writes today.
// Usage from the repository root:  node tools/check_world.mjs
// The same integrity checks run in the browser via Diagnostics → "World data integrity".

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ["data/world.js", "data/scenarios.js", "data/shadow_record.js", "data/off_snapshot.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
}

const { checkWorld } = await import(pathToFileURL(path.join(root, "js/world_check.js")).href);
const { files } = await import(pathToFileURL(path.join(root, "tools/build_world.mjs")).href);
const { WORLD, SCENARIOS, SHADOW_RECORD, OFF_SNAPSHOT } = sandbox.window;
const result = checkWorld(WORLD, SCENARIOS || [], SHADOW_RECORD || null, OFF_SNAPSHOT || null);

// The committed data files must be exactly what the generator writes now.
const stale = files().filter(([file, content]) => fs.readFileSync(file, "utf8") !== content).map(([file]) => path.relative(root, file));
result.checks.push({ name: "Data files match tools/build_world.mjs", ok: stale.length === 0, detail: stale.length ? `stale: ${stale.join(", ")} (run node tools/build_world.mjs)` : "data/world.js and data/shadow_record.js are current" });

for (const c of result.checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  —  ${c.detail}` : ""}`);
}
const passed = result.checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${result.checks.length} checks passed.`);
process.exit(passed === result.checks.length ? 0 : 1);
