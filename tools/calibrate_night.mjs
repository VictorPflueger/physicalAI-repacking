// Night calibration report (developer tool; PLAN.md §b.8). Runs js/nightsim.js on the 14 calibration
// seeds and prints, per seed, the four targets the brief asks for (js/calibration.js):
//   T1 N1 hybrid: all 12 stores on time, none within 15 minutes of its cut-off
//   T2 N1 by hand alone: several stores miss their truck
//   T3 N2 hybrid: exactly Hamm and Soest late
//   T4 scenario 1: exactly Hamm and Soest within 15 minutes of their cut-off (late included); the express
//      order on its truck with 15 minutes to spare
//
//   node tools/calibrate_night.mjs          report
//   node tools/calibrate_night.mjs --check  report, and exit 1 unless every seed meets every target

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { calibrate } from "../js/calibration.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ["data/world.js", "data/scenarios.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });

const fmt = (x) => (x === null ? "–" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`);
const started = Date.now();
const res = calibrate(sandbox.window.WORLD, sandbox.window.SCENARIOS);
console.log("seed     T1 T2 T3 T4  N1 smallest slack  manual-only late      N2 late   scenario 1 within 15 min        express slack");
for (const s of res.seeds) {
  const mark = (b) => (b ? "ok" : "NO");
  console.log(`${String(s.seed).padEnd(8)} ${mark(s.targets.t1)} ${mark(s.targets.t2)} ${mark(s.targets.t3)} ${mark(s.targets.t4)}  ${fmt(s.n1_min_slack_min).padStart(8)} min      ${s.manual_late.join(",").padEnd(20)}  ${s.n2_late.join(",").padEnd(8)}  ${s.s1_risk.map((r) => `${r.id} ${fmt(r.slack_min)} min`).join(", ").padEnd(30)}  ${fmt(s.express_slack_min)} min`);
}
console.log(`${res.passed}/${res.total} seeds meet every target (${((Date.now() - started) / 1000).toFixed(1)} s)`);
if (process.argv.includes("--check") && !res.ok) process.exit(1);
