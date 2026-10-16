// Runs every check in order and prints a summary. The app itself needs none of this.
// Usage: node tests/run-all.mjs             (all suites)
//        node tests/run-all.mjs unit smoke  (only the named suites)
// The suites grow with the milestones: engine (M2), sims and live (M3), accept, layout and design
// (M4 and M5) join the list as they land.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

const SUITES = [
  { id: "tokens", what: "colour system: WCAG 2.2 contrast, colour-blind separation, token files", file: "tools/palette.mjs", args: ["--check"], browser: false },
  { id: "world", what: "synthetic world, scenarios, shadow record, generated files", file: "tools/check_world.mjs", browser: false },
  { id: "unit", what: "streaming client, retries, cost maths, half-up formatting, world checks, autonomy gate", file: "tests/unit.mjs", browser: false },
  { id: "smoke", what: "boot, intro, modes and key, Diagnostics, drawer and audit, viewports, contrast, CSP, file://, missing data", file: "tests/smoke.mjs", browser: true }
];

const only = process.argv.slice(2);
const unknown = only.filter((id) => !SUITES.some((s) => s.id === id));
if (unknown.length) {
  console.error(`Unknown suite${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Available: ${SUITES.map((s) => s.id).join(", ")}.`);
  process.exit(1);
}
const chosen = SUITES.filter((s) => !only.length || only.includes(s.id));
const summary = [];
for (const s of chosen) {
  console.log(`\n=== ${s.id}: ${s.what} ===`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(APP_ROOT, s.file), ...(s.args || [])], { cwd: APP_ROOT, stdio: "inherit", env: process.env });
  summary.push({ ...s, ok: r.status === 0, code: r.status, seconds: Math.round((Date.now() - started) / 1000) });
  if (r.status === 2) {
    console.log("Playwright is missing; browser suites are skipped. See tests/README.md.");
    break;
  }
}

console.log("\n=== Summary ===");
for (const s of summary) console.log(`${s.ok ? "PASS" : "FAIL"}  ${s.id.padEnd(7)} ${String(s.seconds).padStart(4)} s  ${s.what}`);
const skipped = chosen.length - summary.length;
if (skipped) console.log(`(${skipped} suite${skipped === 1 ? "" : "s"} not run)`);
const ok = summary.length === chosen.length && summary.every((s) => s.ok);
if (ok) console.log(`All ${chosen.length} suites passed.`);
process.exit(ok ? 0 : 1);
