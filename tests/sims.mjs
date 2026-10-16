// Simulation suite (Chromium). M2: the night simulation computes the same night in the browser as in
// Node: for each of the six scenarios the page imports js/nightsim.js, builds the scenario's night from
// the data files it loaded and runs it, and the unit-log hash, every order's completion time and the
// wake-ups must equal the snapshot frozen by the engine suite (tests/snapshots/des.json). Integer
// milliseconds and string-hashed draws make that exact, not approximate (PLAN.md §c.6).
// The scripted replays of the six scenarios join this suite in M3 and M4.
// Usage: node tests/sims.mjs [case…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { APP_ROOT, outDir, wanted, launchBrowser, serveStatic, NETWORK_NOISE, SKIP_INTRO } from "./lib/harness.mjs";

const OUT = await outDir("sims");
const SNAP = JSON.parse(await readFile(path.join(APP_ROOT, "tests", "snapshots", "des.json"), "utf8"));
const { base: BASE, close } = await serveStatic(APP_ROOT, 8866);
const browser = await launchBrowser();
const results = [];

if (wanted("parity")) {
  const context = await browser.newContext();
  await context.addInitScript(SKIP_INTRO);
  const external = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => { external.push(route.request().url()); return route.abort("blockedbyclient"); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); });
  let got = null;
  let failed = null;
  try {
    await page.goto(BASE);
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    got = await page.evaluate(async () => {
      const NS = await import("./js/nightsim.js");
      const out = {};
      for (const sc of window.SCENARIOS) {
        const night = NS.buildNight(window.WORLD, sc.night);
        const res = NS.runNight(night, { seed: sc.night.seed });
        out[sc.id] = {
          seed: sc.night.seed, hash: res.hash,
          orders: Object.fromEntries(res.orders.map((o) => [o.id, o.done_ms])),
          wakeups: res.wakeups.map((w) => `${NS.clockOf(w.t)} ${w.kinds.join("+")}`),
          userAgent: navigator.userAgent
        };
      }
      return out;
    });
  } catch (err) {
    failed = String(err.message).split("\n")[0];
  }
  const problems = [];
  if (failed) problems.push(`exception: ${failed}`);
  const ids = Object.keys(SNAP.scenarios);
  if (ids.length !== 6) problems.push(`the snapshot holds ${ids.length} scenarios, not 6`);
  for (const id of ids) {
    const want = SNAP.scenarios[id];
    const have = got?.[id];
    if (!have) { problems.push(`${id}: not computed in the browser`); continue; }
    if (have.hash !== want.hash) problems.push(`${id}: hash ${have.hash} in Chromium, ${want.hash} in the snapshot`);
    if (JSON.stringify(have.orders) !== JSON.stringify(want.orders)) problems.push(`${id}: order completions differ`);
    if (JSON.stringify(have.wakeups) !== JSON.stringify(want.wakeups)) problems.push(`${id}: wake-ups differ (${have.wakeups.join(", ")})`);
  }
  if (errors.length) problems.push(`page errors: ${errors.join(" | ")}`);
  if (external.length) problems.push(`external requests: ${external.join(", ")}`);
  results.push({ name: "parity: six scenario nights identical in Chromium and Node", ok: problems.length === 0, problems, hashes: got && Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.hash])), browser: got && Object.values(got)[0]?.userAgent });
  await context.close();
}

await browser.close();
await close();
await writeFile(path.join(OUT, "sims-results.json"), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  for (const p of r.problems) console.log(`      - ${p}`);
  if (r.ok && r.hashes) console.log(`      ${Object.entries(r.hashes).map(([k, v]) => `${k} ${v}`).join("; ")}`);
}
const okCount = results.filter((r) => r.ok).length;
console.log(`\n${okCount}/${results.length} simulation cases passed.`);
process.exit(results.length > 0 && okCount === results.length ? 0 : 1);
