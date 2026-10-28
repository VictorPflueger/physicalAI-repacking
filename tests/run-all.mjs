// Runs every check in order and prints a summary. The app itself needs none of this.
// Usage: node tests/run-all.mjs             (all suites)
//        node tests/run-all.mjs unit smoke  (only the named suites)
// The suites grow with the milestones: sims and layout start in M2 (the night in Chromium, the five
// window sizes); the live suite and the scripted replays arrived with the agent (M3); accept arrived with
// the six scenarios (M4); page-icon, vici-files and hexagon with the move to Vici (0.5.0); design joins
// the list with the hardening (M5).
// On GitHub Actions a failing suite's FAIL lines also become error annotations on the check run, so a
// failure can be read through the API without the log.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

const SUITES = [
  { id: "tokens", what: "colour system on Vici's tokens, light and dark: contrast, colour-blind separation", file: "tests/tokens.mjs", browser: false },
  { id: "page-icon", what: "page icon: favicon, header and loading screen, as on the website's card", file: "tests/page-icon.mjs", browser: false },
  { id: "vici-files", what: "vici/ holds exactly the files its README lists, unchanged", file: "tests/vici-files.mjs", browser: false },
  { id: "world", what: "synthetic world, scenarios and their nights, calibration, shadow record, generated files", file: "tools/check_world.mjs", browser: false },
  { id: "unit", what: "streaming client, retries, cost maths, half-up formatting, world checks, autonomy gate, Open Food Facts lookup, placeholders, wake bridge, human channel, run facts", file: "tests/unit.mjs", browser: false },
  { id: "engine", what: "golden cases and display strings, night snapshots, calibration, escalation rules, world model, levers, option costing with the golden option cases of scenarios 1, 4 and 6, decisions, figure audit, rules in code, toolbox, every scenario's script on every path", file: "tests/engine.mjs", browser: false },
  { id: "smoke", what: "boot, intro, modes and key, Diagnostics, drawer and audit, the scripted replay at ×4/×2/×1 and the simple console, board keyboard, KPI board and assumptions, Your DC, the autonomy dial, world model, the Customer view and scenario 3 in it, contrast in both views, CSP, file://, missing data", file: "tests/smoke.mjs", browser: true },
  { id: "sims", what: "the six scenario nights identical in Chromium and Node; every scenario's scripted replay with its decisions equal to Node, scenario 1 on two paths", file: "tests/sims.mjs", browser: true },
  { id: "live", what: "the live loop against a fake Claude: all six scenarios, the recorder, the step and cost caps, abort, a rejected key", file: "tests/live.mjs", browser: true },
  { id: "accept", what: "acceptance: the key's lifecycle, Diagnostics against the policy, the Abort and Reset matrix, every scenario offline", file: "tests/accept.mjs", browser: true },
  { id: "layout", what: "five window sizes: the Full view in eight states of scenario 1 (the options, the drafts and what it is worth included), the Customer view in seven states of scenario 3", file: "tests/layout.mjs", browser: true },
  { id: "hexagon", what: "nothing round: the app's files, and the rendered app in both themes", file: "tests/hexagon.mjs", browser: true }
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
  // Locally the suite writes straight to the terminal; on GitHub Actions its output is captured too.
  const ci = process.env.GITHUB_ACTIONS === "true";
  const r = spawnSync(process.execPath, [path.join(APP_ROOT, s.file), ...(s.args || [])], { cwd: APP_ROOT, stdio: ci ? ["inherit", "pipe", "inherit"] : "inherit", env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const text = String(r.stdout || "");
  if (ci) process.stdout.write(text);
  if (r.status !== 0 && ci) {
    // A FAIL line and the problem lines under it, as one annotation (newlines encoded for the command).
    const lines = text.split("\n");
    const blocks = [];
    lines.forEach((line, i) => {
      if (!/^FAIL\b/.test(line)) return;
      const rest = [];
      for (let j = i + 1; j < lines.length && /^\s{2,}/.test(lines[j]); j++) rest.push(lines[j].trim());
      blocks.push([line, ...rest].join("\n").slice(0, 3000));
    });
    for (const b of blocks.slice(0, 10)) console.log(`::error title=${s.id}::${b.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`);
  }
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
