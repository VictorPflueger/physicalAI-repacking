// Simulation suite (Chromium).
//   parity     the night simulation computes the same night in the browser as in Node: for each of the
//              six scenarios the page imports js/nightsim.js, builds the scenario's night from the data
//              files it loaded and runs it, and the unit-log hash, every order's completion time and the
//              wake-ups must equal the snapshot frozen by the engine suite (tests/snapshots/des.json).
//              Integer milliseconds and string-hashed draws make that exact (PLAN.md §c.6).
//   sc1        scenario 1's scripted replay at ×4, option B approved and both drafts approved: the
//              SIMULATION markings, a pause at every wake-up, the option cards' figures, the drafts,
//              the management summary marked as a simulated run, every tool call in order, the run facts
//              and the night's hash all equal the same decisions replayed headless in Node
//              (js/sim_check.js), and no external request.
//   sc1-reject the same replay with option B rejected, then A approved at once and its draft rejected:
//              the rejection is shown and the agent waits again, the night follows option A, the summary
//              counts the rejected draft. In both cases the status pill says it waits for the person only
//              while an option or a draft waits on screen.
//   sc2 … sc6  each scenario's scripted replay at ×4 with its demo decisions (scenario 3 confirms its
//              provisional entry and, in sc3-reject, rejects it; scenarios 4 and 6 approve the recommended
//              option and its drafts): the SIMULATION marking, every tool call in order, the night's hash,
//              every lane, the summary's heading and the outcome equal the same decisions replayed headless
//              in Node; the console's simple view shows no internal code or statistics word (seed,
//              replication, wake-up, rolling success, payload, sku_id, E1 to E4); no external request.
// Usage: node tests/sims.mjs [case…]
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { APP_ROOT, outDir, wanted, launchBrowser, serveStatic, NETWORK_NOISE, SKIP_INTRO } from "./lib/harness.mjs";
import { replayScenario1, loadData } from "./lib/scenario1.mjs";

const NS = await import(pathToFileURL(path.join(APP_ROOT, "js/nightsim.js")).href);
const F = await import(pathToFileURL(path.join(APP_ROOT, "js/format.js")).href);
const { replayScript, NOT_PLAIN } = await import(pathToFileURL(path.join(APP_ROOT, "js/sim_check.js")).href);

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

/**
 * Plays scenario 1's scripted replay in the page with the decisions of `plan` ({ option, reject, drafts })
 * and reads what the screen and the audit export show.
 */
let step = "";
async function playScenario1(page, plan, { drafts: draftCount }) {
  const got = {};
  step = "boot";
  await page.goto(BASE);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
  // Every moment the board's clock carries its pause mark, recorded as it happens.
  await page.evaluate(() => {
    window.__pauses = [];
    const clock = document.querySelector(".cell-clock");
    const note = () => {
      const t = clock.firstChild?.textContent?.trim();
      if (clock.dataset.paused === "true" && t && window.__pauses.at(-1) !== t) window.__pauses.push(t);
    };
    new MutationObserver(note).observe(clock, { attributes: true, childList: true, subtree: true, characterData: true });
    // The status pill may say it waits for the person only when something waits on screen: an option
    // card to decide, or a draft to approve. Checked in the frame that paints the change (a state that
    // lasts only until the next microtask never reaches the screen).
    window.__mislabels = [];
    const pill = document.querySelector(".status-pill .text");
    let queued = false;
    const check = () => {
      queued = false;
      const t = pill.textContent.trim();
      const pendingDraft = !!document.querySelector('#panel-outbox .action-card[data-status="pending"]');
      const openOption = !!document.querySelector("#panel-options .option-actions .btn");
      if ((t === "Awaiting your approval" && !pendingDraft) || (t === "Awaiting your decision" && !openOption)) window.__mislabels.push(`${clock.firstChild?.textContent?.trim()} ${t}`);
    };
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(check); } }).observe(pill, { childList: true, subtree: true, characterData: true });
  });
  await page.click('button[aria-label="Night speed ×4"]');
  await page.click("#btn-start");
  await page.waitForSelector(".mode-card", { timeout: 5000 });
  got.noteInChoice = await page.$(".stage-note");
  await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
  await page.waitForSelector('#console .entry[data-type="run"]', { timeout: 5000 });
  got.runLine = (await page.$eval('#console .entry[data-type="run"] .entry-body', (e) => e.innerText)).replace(/\s+/g, " ").trim();
  got.badge = (await page.textContent("#mode-badge")).trim();
  got.watermark = await page.isVisible("#console .sim-watermark");
  got.cellTag = (await page.textContent(".sim-cell-tag")).trim();
  got.disclosure = await page.isVisible(".ai-disclosure");
  // 02:00: the options.
  step = "options";
  await page.waitForSelector('#panel-options:not([hidden]) .option-card[data-id="B"] .btn-approve', { timeout: 120000 });
  got.clockAtOptions = (await page.textContent(".cell-clock")).trim();
  got.tileAtOptions = (await page.textContent("#kpi-clock-sub")).trim();
  got.cards = await page.$$eval("#panel-options .option-card", (els) => els.map((e) => ({
    id: e.dataset.id, recommended: e.dataset.recommended === "true",
    total: e.querySelector(".option-total .value")?.textContent.trim(),
    figures: [...e.querySelectorAll(".option-figures dd")].map((d) => d.textContent.trim())
  })));
  step = "reject";
  for (const id of plan.reject || []) {
    await page.click(`.option-card[data-id="${id}"] .btn-reject`);
    await page.waitForSelector(`.option-card[data-id="${id}"][data-status="rejected"]`, { state: "attached", timeout: 10000 });
  }
  const approve = plan.option === "baseline" ? '.option-card[data-id="baseline"] .option-actions .btn' : `.option-card[data-id="${plan.option}"] .btn-approve`;
  await page.click(approve);
  // The drafts in the Outbox, decided as planned (by type, in the order they were drafted).
  step = "approval wait";
  // Every draft is in once the agent waits for the approvals (the clock tile says so).
  await page.waitForFunction((n) => document.getElementById("kpi-clock-sub")?.textContent.trim() === "paused: your approval" && document.querySelectorAll("#panel-outbox .action-card").length === n, draftCount, { timeout: 120000 });
  got.clockAtDrafts = (await page.textContent(".cell-clock")).trim();
  got.drafts = await page.$$eval("#panel-outbox .action-card", (els) => els.map((e) => ({ type: e.dataset.type, subject: e.querySelector(".action-subject")?.textContent.trim() })));
  step = "drafts";
  const choices = Array.isArray(plan.drafts) ? plan.drafts : got.drafts.map(() => plan.drafts || "approve");
  for (let i = 0; i < got.drafts.length; i++) {
    const card = `#panel-outbox .action-card:nth-child(${i + 1})`;
    await page.click(`${card} ${choices[i] === "reject" ? ".btn-reject" : ".btn-approve"}`);
    await page.waitForSelector(`${card}:not([data-status="pending"])`, { state: "attached", timeout: 10000 });
  }
  step = "done wait";
  await page.waitForFunction(() => document.querySelector(".status-pill .text")?.textContent.trim() === "Done", null, { timeout: 120000 });
  step = "reading";
  got.pauses = await page.evaluate(() => window.__pauses.slice());
  got.mislabels = await page.evaluate(() => window.__mislabels.slice());
  got.optionLines = await page.$$eval('#console .entry[data-type="decision"] .entry-body', (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()).filter((x) => /^You (approved|rejected) option [A-C]\b|^You (chose to do nothing|rejected doing nothing)/i.test(x)));
  got.tile = (await page.textContent("#kpi-ontime-value")).trim();
  got.lanes = Object.fromEntries(await page.$$eval(".lane", (els) => els.map((e) => [e.dataset.order, e.dataset.state])));
  got.facts = (await page.$$eval("#console .entry .entry-body", (els) => els.map((e) => e.textContent.trim()).find((x) => /agent turns; /.test(x)) || ""));
  got.view = await page.getAttribute("#console", "data-view");
  got.simple = await page.$$eval("#console .entry", (els) => els.filter((e) => getComputedStyle(e).display !== "none").map((e) => e.innerText).join("\n"));
  got.board = await page.$eval(".cell-board", (el) => el.innerText);
  // The management summary, as the dialog shows it.
  await page.click(".drawer-end .btn").catch(() => {});
  await page.click("#btn-open-report");
  await page.waitForSelector(".report-modal", { timeout: 5000 });
  got.report = await page.$eval(".report-modal", (m) => ({
    heading: m.querySelector(".modal-body h2, .modal-body h3")?.textContent.trim(),
    paragraphs: [...m.querySelectorAll(".modal-body p")].map((p) => p.textContent.replace(/\s+/g, " ").trim()),
    table: [...m.querySelectorAll(".modal-body table tr")].map((r) => [...r.children].map((c) => c.textContent.trim())),
    footer: m.querySelector(".modal-foot")?.textContent.replace(/\s+/g, " ").trim()
  }));
  await page.keyboard.press("Escape");
  // The audit export.
  await page.click("#tab-audit");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-audit")]);
  const audit = JSON.parse(await readFile(await download.path(), "utf8"));
  got.file = download.suggestedFilename();
  got.audit = {
    mode: audit.mode, statement: audit.mode_statement, status: audit.run?.status, hash: audit.run?.night_hash,
    calls: (audit.events || []).filter((e) => e.type === "tool_call").map((e) => e.payload.name),
    refusals: (audit.events || []).filter((e) => e.type === "tool_result" && e.payload?.result?.refused).length,
    wakes: (audit.events || []).filter((e) => e.type === "wake").map((e) => NS_clock(e.payload)),
    facts: audit.run_facts
  };
  return got;
}
const NS_clock = (p) => p.clock || null;

/** The management summary's markdown as plain paragraphs and table rows, to compare with the dialog. */
function markdownParts(md) {
  const plain = (x) => x.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const heading = blocks.find((b) => /^#{1,3} /.test(b))?.replace(/^#{1,3} /, "").trim() || null;
  const table = blocks.filter((b) => b.startsWith("|")).flatMap((b) => b.split("\n").filter((l) => !/^\|[\s|:-]+\|$/.test(l.trim())).map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => plain(c))));
  const paragraphs = blocks.filter((b) => !/^#{1,3} /.test(b) && !b.startsWith("|")).map(plain);
  return { heading, paragraphs, table };
}

async function scenario1Case(name, plan, golden) {
  const node = await replayScenario1(plan);
  const res = node.replay.session.run;
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  await context.addInitScript(SKIP_INTRO);
  const external = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => { external.push(route.request().url()); return route.abort("blockedbyclient"); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); });
  let got = {};
  let failed = null;
  const started = Date.now();
  try {
    got = await playScenario1(page, plan, { drafts: node.replay.events.filter((e) => e.type === "action_draft").length });
    await page.screenshot({ path: path.join(OUT, `${name}-end.png`) });
  } catch (err) {
    failed = `${step}: ${String(err.message).split("\n")[0]}`;
    await page.screenshot({ path: path.join(OUT, `${name}-fail.png`) }).catch(() => {});
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const opts = node.options;
  const cardsWanted = [...opts.options.map((o) => ({ id: o.id, recommended: !!o.recommended, total: F.eur2(o.expected_total_eur) })), { id: "baseline", recommended: false, total: F.eur2(opts.baseline.expected_total_eur) }];
  const cardsGot = (got.cards || []).map((c) => ({ id: c.id, recommended: c.recommended, total: c.total }));
  const md = markdownParts(node.report || "");
  const states = Object.fromEntries(res.orders.map((o) => [o.id, o.on_time ? "dispatched" : o.moved ? "moved" : "late"]));
  const onTime = res.orders.filter((o) => o.on_time).length;
  const wakeClocks = res.wakeups.map((w) => NS.clockOf(w.t));
  const nodeCalls = node.replay.calls;
  const visible = nodeCalls.filter((n) => !n.startsWith("ui_") && n !== "sim_advance").length;
  const draftsDecided = (plan.drafts && Array.isArray(plan.drafts)) ? plan.drafts : null;
  const problems = [];
  const expect = (ok, msg) => { if (!ok) problems.push(msg); };
  if (failed) problems.push(`exception: ${failed}`);
  expect(got.noteInChoice === null, "the mode choice needs no note for a scripted scenario");
  expect(/^Scenario 1: Express order for the flagship store at 02:00 Simulation: scripted replay through the agent's own tools/.test(got.runLine || "") && got.badge === "SIMULATION" && got.watermark && got.cellTag === "Simulated cell" && got.disclosure, `the SIMULATION markings, the Simulated cell tag and the disclosure (${got.runLine}; ${got.badge})`);
  expect(JSON.stringify(got.pauses) === JSON.stringify(wakeClocks) && wakeClocks.length === 5, `the board pauses at every wake-up and only there (${JSON.stringify(got.pauses)}; Node: ${JSON.stringify(wakeClocks)})`);
  expect(got.clockAtOptions === "02:00 · paused" && got.tileAtOptions === "paused: your decision" && got.clockAtDrafts === "02:00 · paused", `the night stands still for the decision and the drafts (${got.clockAtOptions}; ${got.tileAtOptions}; ${got.clockAtDrafts})`);
  expect(JSON.stringify(cardsGot) === JSON.stringify(cardsWanted), `the option cards equal the engine's costing in Node (${JSON.stringify(cardsGot)}; Node: ${JSON.stringify(cardsWanted)})`);
  expect(JSON.stringify(cardsGot.map((c) => c.total)) === JSON.stringify(golden.totals) && cardsGot.find((c) => c.recommended)?.id === "B", `the golden option totals, B recommended (${JSON.stringify(cardsGot.map((c) => c.total))})`);
  expect(Array.isArray(got.mislabels) && got.mislabels.length === 0, `the status pill says it waits for you only while an option or a draft waits on screen (${JSON.stringify(got.mislabels)})`);
  expect((got.optionLines || []).length === (plan.reject || []).length + 1, `one console line per option decision (${JSON.stringify(got.optionLines)})`);
  expect(JSON.stringify((got.drafts || []).map((d) => d.type)) === JSON.stringify(golden.drafts), `the drafts the approved option contains (${JSON.stringify(got.drafts)})`);
  expect(JSON.stringify(got.lanes) === JSON.stringify(states) && got.tile === `${onTime} of ${res.orders.length}`, `every lane and the tile equal the night in Node (${JSON.stringify(got.lanes)}; ${got.tile})`);
  expect(got.report?.heading === md.heading && JSON.stringify(got.report?.paragraphs) === JSON.stringify(md.paragraphs) && JSON.stringify(got.report?.table) === JSON.stringify(md.table), `the management summary equals the replay in Node (${String(JSON.stringify(got.report)).slice(0, 400)})`);
  expect(/Simulated run: a scripted replay on a simulated cell\./.test(md.paragraphs.at(-1) || "") && !/live agent run/i.test(node.report || "") && /^Simulated run: the words were scripted/.test(got.report?.footer?.replace(/^.*?(Simulated run)/, "$1") || ""), `the summary says it is a simulated run (${md.paragraphs.at(-1)}; ${got.report?.footer})`);
  expect(JSON.stringify(got.audit?.calls) === JSON.stringify(nodeCalls), `every tool call in the order the Node replay made them (${(got.audit?.calls || []).length} in the browser, ${nodeCalls.length} in Node)`);
  expect(got.audit?.hash === res.hash && res.hash === golden.hash && got.audit?.status === "done" && got.audit?.mode === "simulation" && /^SIMULATION: /.test(got.audit?.statement || "") && /-SIMULATION-audit\.json$/.test(got.file || ""), `the audit: the night's hash ${got.audit?.hash} (Node ${res.hash}, golden ${golden.hash}), done, simulation`);
  expect(got.audit?.refusals === 0, `no guardrail refusal in the scripted replay (${got.audit?.refusals})`);
  expect(got.view === "simple" && !JARGON.test(got.simple || "x") && !/\bS\d{2}\b/.test(got.board || "S00"), `the simple console and the board speak plainly (${(JARGON.exec(got.simple || "") || /\bS\d{2}\b/.exec(got.board || "") || [])[0] || got.view})`);
  expect(new RegExp(`; 5 agent turns; ${visible} tool calls \\(`).test(got.facts || "") && new RegExp(`; ${onTime} of ${res.orders.length} orders on time; no cost \\(simulated\\)\\.$`).test(got.facts || "") && got.audit?.facts?.drafts_rejected === (draftsDecided || []).filter((x) => x === "reject").length, `the run facts (${got.facts})`);
  if (errors.length) problems.push(`page errors: ${errors.join(" | ")}`);
  if (external.length) problems.push(`external requests: ${external.join(", ")}`);
  results.push({ name: `${name}: scenario 1's scripted replay, ${golden.label}, equals the replay in Node (${seconds} s at ×4)`, ok: problems.length === 0, problems, got: { ...got, report: undefined } });
  await context.close();
}

/** The console's words a customer should not meet in the simple view (TECH_NOTES D50): the script checker's list. */
const JARGON = NOT_PLAIN;

/**
 * Any scenario's scripted replay at ×4 in Chromium with a decision plan ({ option, reject, drafts,
 * confirm }), compared with the same plan replayed headless in Node.
 */
async function scenarioCase(name, id, plan, label) {
  const data = await loadData();
  const sc = data.SCENARIOS.find((x) => x.id === id);
  const node = await replayScript(data.SIM_RUNS[id], { world: data.WORLD, scenario: sc, refs: data.REFERENCE_CASES[id] || {}, plan });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  await context.addInitScript(SKIP_INTRO);
  const external = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => { external.push(route.request().url()); return route.abort("blockedbyclient"); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); });
  const got = { decided: [] };
  let failed = null;
  const started = Date.now();
  try {
    await page.goto(BASE);
    await page.waitForSelector('html[data-boot="ready"]', { timeout: 20000 });
    await page.click("#dd-scenario");
    await page.click(`.menu-item[data-id="${id}"]`);
    await page.click('button[aria-label="Night speed ×4"]');
    await page.click("#btn-start");
    await page.waitForSelector(".mode-card", { timeout: 5000 });
    await page.click('.mode-card[data-mode="simulation"] .mode-cta button');
    await page.waitForSelector('#console .entry[data-type="run"]', { timeout: 5000 });
    got.badge = (await page.textContent("#mode-badge")).trim();
    let drafts = 0;
    for (let guard = 0; guard < 20; guard++) {
      const handle = await page.waitForFunction(() => {
        const pill = document.querySelector(".status-pill .text")?.textContent.trim();
        if (["Done", "Stopped", "Error", "Aborted"].includes(pill)) return pill;
        if (document.querySelector("#panel-options .option-card .option-actions .btn")) return "options";
        if (document.querySelector("#console .confirm-actions .btn-approve")) return "confirm";
        if (document.getElementById("kpi-clock-sub")?.textContent.trim() === "paused: your approval" && document.querySelector('#panel-outbox .action-card[data-status="pending"]')) return "drafts";
        return false;
      }, null, { timeout: 180000, polling: 150 });
      const what = await handle.jsonValue();
      if (["Done", "Stopped", "Error", "Aborted"].includes(what)) { got.end = what; break; }
      if (what === "options") {
        for (const r of plan.reject || []) {
          await page.click(`.option-card[data-id="${r}"] .btn-reject`);
          await page.waitForSelector(`.option-card[data-id="${r}"][data-status="rejected"]`, { state: "attached", timeout: 10000 });
        }
        await page.click(plan.option === "baseline" ? '.option-card[data-id="baseline"] .option-actions .btn' : `.option-card[data-id="${plan.option}"] .btn-approve`);
        await page.waitForSelector(`.option-card[data-id="${plan.option}"][data-status="approved"]`, { state: "attached", timeout: 10000 });
        got.decided.push(`option ${plan.option}`);
      } else if (what === "confirm") {
        await page.click(`#console .confirm-actions ${plan.confirm === "reject" ? ".btn-reject" : ".btn-approve"}`);
        await page.waitForSelector("#console .confirm-card .option-status", { state: "attached", timeout: 10000 });
        got.decided.push(`confirm ${plan.confirm || "confirm"}`);
      } else if (what === "drafts") {
        const pending = await page.$$eval("#panel-outbox .action-card", (els) => els.map((e, i) => (e.dataset.status === "pending" ? i : -1)).filter((i) => i >= 0));
        for (const i of pending) {
          const choice = Array.isArray(plan.drafts) ? plan.drafts[drafts] ?? "approve" : plan.drafts || "approve";
          const card = `#panel-outbox .action-card:nth-child(${i + 1})`;
          await page.click(`${card} ${choice === "reject" ? ".btn-reject" : ".btn-approve"}`);
          await page.waitForSelector(`${card}:not([data-status="pending"])`, { state: "attached", timeout: 10000 });
          drafts += 1;
        }
        got.decided.push(`drafts ${pending.length}`);
      }
    }
    got.tile = (await page.textContent("#kpi-ontime-value")).trim();
    got.lanes = Object.fromEntries(await page.$$eval(".lane", (els) => els.map((e) => [e.dataset.order, e.dataset.state])));
    got.view = await page.getAttribute("#console", "data-view");
    got.simple = await page.$$eval("#console .entry", (els) => els.filter((e) => getComputedStyle(e).display !== "none").map((e) => e.innerText).join("\n"));
    got.board = await page.$eval(".cell-board", (el) => el.innerText);
    // "## …" renders as h3 in the console (js/md.js: h1 is the app's title).
    got.heading = (await page.textContent('#console .entry[data-kind="summary"] .md :is(h2, h3, h4)', { timeout: 5000 }))?.trim();
    await page.click(".drawer-end .btn").catch(() => {});
    await page.click("#tab-audit");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-audit")]);
    const audit = JSON.parse(await readFile(await download.path(), "utf8"));
    got.audit = { status: audit.run?.status, hash: audit.run?.night_hash, mode: audit.mode, calls: (audit.events || []).filter((e) => e.type === "tool_call").map((e) => e.payload.name), refusals: (audit.events || []).filter((e) => e.type === "tool_result" && e.payload?.result?.refused).length };
    await page.screenshot({ path: path.join(OUT, `${name}-end.png`) });
  } catch (err) {
    failed = String(err.message).split("\n")[0];
    await page.screenshot({ path: path.join(OUT, `${name}-fail.png`) }).catch(() => {});
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  const res = node.session?.run;
  const problems = [];
  const expect = (ok, msg) => { if (!ok) problems.push(msg); };
  if (failed) problems.push(`exception: ${failed}`);
  expect(node.ok, `the headless replay in Node (${node.errors?.join(" | ")})`);
  const states = res ? Object.fromEntries(res.orders.map((o) => [o.id, o.on_time ? "dispatched" : o.moved ? "moved" : "late"])) : {};
  const onTime = res ? res.orders.filter((o) => o.on_time).length : -1;
  const heading = /^#{1,3} (.+)$/m.exec(node.events.find((e) => e.type === "report")?.payload.markdown || "")?.[1];
  expect(got.badge === "SIMULATION" && got.end === "Done", `the SIMULATION marking and a finished run (${got.badge}, ${got.end})`);
  expect(JSON.stringify(got.audit?.calls) === JSON.stringify(node.calls), `every tool call in the order the Node replay made them (${(got.audit?.calls || []).length} in the browser, ${(node.calls || []).length} in Node)`);
  expect(got.audit?.hash === res?.hash && got.audit?.status === "done" && got.audit?.mode === "simulation" && got.audit?.refusals === 0, `the night's hash ${got.audit?.hash} (Node ${res?.hash}), done, no refusal`);
  expect(JSON.stringify(got.lanes) === JSON.stringify(states) && got.tile === `${onTime} of ${res?.orders.length}`, `every lane and the tile equal the night in Node (${JSON.stringify(got.lanes)}; ${got.tile})`);
  expect(got.heading === heading, `the summary's heading (${got.heading}; Node: ${heading})`);
  expect(got.view === "simple" && !JARGON.test(got.simple || "x") && !/\bS\d{2}\b/.test(got.board || "S00"), `the simple console and the board speak plainly (${(JARGON.exec(got.simple || "") || /\bS\d{2}\b/.exec(got.board || "") || [])[0] || got.view})`);
  if (errors.length) problems.push(`page errors: ${errors.join(" | ")}`);
  if (external.length) problems.push(`external requests: ${external.join(", ")}`);
  results.push({ name: `${name}: scenario ${sc.number}'s scripted replay, ${label}, equals the replay in Node (${seconds} s at ×4; ${got.decided.join(", ") || "no decision"})`, ok: problems.length === 0, problems, got: { ...got, simple: undefined } });
  await context.close();
}

if (wanted("sc1")) {
  await scenario1Case("sc1", { option: "B" }, { label: "option B and both drafts approved", hash: "30d0e195eb5b7a5c", totals: ["€112.50", "€134.25", "€250.00", "€462.50"], drafts: ["call_in", "email"] });
}
if (wanted("sc1-reject")) {
  await scenario1Case("sc1-reject", { option: "A", reject: ["B"], drafts: ["reject"] }, { label: "B rejected, A approved, its draft rejected", hash: "f6f4b99207f22a37", totals: ["€112.50", "€134.25", "€250.00", "€462.50"], drafts: ["email"] });
}
if (wanted("sc2")) await scenarioCase("sc2", "SC2-GLASS", { option: null }, "the jar's correction, no decision");
if (wanted("sc3")) await scenarioCase("sc3", "SC3-UNKNOWN", { option: null, confirm: "confirm" }, "the provisional entry confirmed");
if (wanted("sc3-reject")) await scenarioCase("sc3-reject", "SC3-UNKNOWN", { option: null, confirm: "reject" }, "the provisional entry rejected");
if (wanted("sc4")) await scenarioCase("sc4", "SC4-WEAR", { option: "A" }, "option A (a maintenance stop now) and its draft approved");
if (wanted("sc5")) await scenarioCase("sc5", "SC5-EARLY", { option: null }, "no store slips, no decision");
if (wanted("sc6")) await scenarioCase("sc6", "SC6-PEAK", { option: "A" }, "option A (a call-in for Hamm and Soest) and its draft approved");

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
