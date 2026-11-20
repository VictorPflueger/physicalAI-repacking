// The showcase in Chromium, as a presenter uses it.
//   boot      the page starts without a console error or a request to another site, opens the guide
//             on a first visit and lands on 22:00
//   steps     each of the five steps by click, by key (1 to 5, arrows, Home) and by address (?step=):
//             its heading, its clock and the header's counters equal the night's state at that moment
//   play      Play runs the night to the next step and stops there; Pause holds it and Play resumes
//   kpis      the header's three key figures (data-vc-kpi), top right at every size, with the night's
//             values: detection to decision counts what was caught, store orders on time 12 of 12 at 06:00
//   decide    Confirm entry decides once; the world model's station, the unknown item's tile and the
//             result's count follow the answer (or its absence); the answer stays; Restart clears it
//   your DC   the inputs priced by the engine (10,000,000 units as the demo script types them), a
//             refused value says why, Reset appears once something is typed and goes back
//   layout    at 1920 × 1080, 1366 × 768 and 1280 × 720, light and dark, in all five steps: nothing
//             overflows, every station and tile and the step's controls are in view, targets ≥ 40 px;
//             at 375 px the page reflows without sideways scrolling
// Usage: NODE_PATH="$(npm root -g)" node tests/showcase.mjs [case …]
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT, launchBrowser, serveStatic, wanted, outDir, VIEWPORTS } from "./lib/harness.mjs";

const E = await import(pathToFileURL(path.join(APP_ROOT, "js/engine.js")).href);
const W = await import(pathToFileURL(path.join(APP_ROOT, "js/worth.js")).href);

const results = [];
const check = (ok, what) => results.push([!!ok, what]);
const out = await outDir("showcase");
const server = await serveStatic(APP_ROOT, 8865);
const browser = await launchBrowser();
const IDS = ["plan", "learns", "asks", "result", "your-dc"];

/** A page on the showcase that records console errors and blocks every other host. */
async function open(query = "", { width = 1920, height = 1080, theme = "light", context } = {}) {
  const ctx = context || await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  if (!context) await ctx.addInitScript((t) => { try { localStorage.setItem("vc-theme", t); } catch { /* blocked */ } }, theme);
  const page = await ctx.newPage();
  const errors = [];
  const outside = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(server.base) || url.startsWith("data:")) return route.continue();
    outside.push(url);
    return route.abort();
  });
  await page.goto(`${server.base}${query}`);
  await page.waitForFunction(() => document.documentElement.dataset.boot === "ready", null, { timeout: 15000 });
  return { page, ctx, errors, outside };
}
const closeGuide = async (page) => { if (await page.evaluate(() => document.getElementById("guide").open)) { await page.keyboard.press("Escape"); await page.waitForTimeout(150); } };
const view = (page) => page.evaluate(() => {
  const rp = window.repackPilot;
  const step = rp.steps[rp.state.index];
  const s = rp.stateAt(rp.state.t);
  return {
    id: new URL(location.href).searchParams.get("step"), index: rp.state.index, playing: rp.state.playing,
    title: document.getElementById("story-title").textContent, heading: step.heading,
    clock: document.getElementById("clock").textContent, stepClock: step.clock, stateClock: s.clock,
    units: document.getElementById("units-done").textContent, repacked: s.repacked.toLocaleString("en-GB"),
    orders: document.getElementById("orders-ready").textContent, onTime: String(s.onTime),
    caught: document.getElementById("decision-note").textContent,
    current: document.querySelector('#steps [aria-current="step"]')?.closest("li")?.dataset.step,
    play: document.querySelector("#play .play-text").textContent
  };
});
const consistent = (v) => v.title === v.heading && v.clock === v.stateClock && v.units === v.repacked && v.orders === v.onTime && v.current === IDS[v.index];
/** What the detection tile says at each step: nothing caught at 22:00, the jar at 22:17, the barcode from 23:10. */
const CAUGHT = { plan: "scale and camera check every unit", learns: "1 caught: a wrong weight", asks: "2 caught: a weight, a barcode", result: "2 caught: a weight, a barcode", "your-dc": "2 caught: a weight, a barcode" };

try {
  // ---- boot ---------------------------------------------------------------------------------------
  if (wanted("boot")) {
    const { page, ctx, errors, outside } = await open();
    check(await page.evaluate(() => document.getElementById("guide").open), "boot: the guide opens by itself on a first visit");
    await closeGuide(page);
    const v = await view(page);
    check(v.id === "plan" && v.clock === "22:00" && consistent(v), `boot: lands on 22:00, the plan (${v.title})`);
    await page.screenshot({ path: path.join(out, "boot.png") });
    check(!errors.length, `boot: no console error${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    check(!outside.length, `boot: no request to another site${outside.length ? `: ${outside.join(", ")}` : ""}`);
    await ctx.close();
  }

  // ---- steps by click, key and address ------------------------------------------------------------
  if (wanted("steps")) {
    const { page, ctx, errors } = await open("?guide=0");
    check(!(await page.evaluate(() => document.getElementById("guide").open)), "steps: ?guide=0 keeps the guide closed");
    const seen = [];
    for (const id of IDS) {
      await page.click(`#steps [data-step="${id}"] button`);
      const v = await view(page);
      seen.push(`${id} ${v.clock}`);
      check(v.id === id && consistent(v), `steps: a click on ${id} shows its heading, its clock ${v.clock} and the counters at that moment`);
      check(v.caught === CAUGHT[id], `steps: at ${id} detection to decision says "${v.caught}"`);
    }
    await page.click('#steps [data-step="result"] button');
    const end = await page.evaluate(() => ({
      names: [...document.querySelectorAll(".app-header [data-vc-kpi]")].map((k) => k.dataset.vcKpi),
      labels: [...document.querySelectorAll(".app-header [data-vc-kpi] .vc-stat__label")].map((l) => l.textContent),
      time: document.querySelector('#kpi-decision [data-fig="decision-time"]').textContent,
      orders: document.getElementById("orders-ready").textContent, of: document.querySelector("#kpi-orders .kpi-of").textContent.trim(),
      note: document.getElementById("orders-note").textContent, tone: document.getElementById("kpi-orders").dataset.tone,
      count: document.querySelector(".pallet-count")?.textContent
    }));
    const names = ["Labour per 1,000 units", "Detection → decision", "Store orders on time"];
    check(end.names.join("|") === names.join("|") && end.labels.join("|") === names.join("|"), `kpis: the header's key figures are ${end.names.join(", ")}`);
    check(end.time === "<\u00a01\u00a0s" && end.orders === "12" && end.of === "of 12" && end.note === "every truck left on time" && end.tone === "done", `kpis: at 06:00 detection to decision reads ${end.time}, store orders on time ${end.orders} ${end.of} (${end.note})`);
    check(end.count === "3,000 of 3,000 units repacked", `kpis: the units count sits with the pallet ("${end.count}")`);
    await page.click("#story-title"); // focus off the buttons, as a presenter's click on the page would
    const keys = [["1", "plan"], ["ArrowRight", "learns"], ["ArrowRight", "asks"], ["4", "result"], ["ArrowLeft", "asks"], ["5", "your-dc"], ["Home", "plan"]];
    let keyed = true;
    for (const [key, id] of keys) { await page.keyboard.press(key); const v = await view(page); if (v.id !== id || !consistent(v)) keyed = false; }
    check(keyed, "steps: keys 1 to 5, the arrows and Home move between the steps");
    for (const id of ["asks", "result"]) {
      const p2 = await ctx.newPage();
      await p2.goto(`${server.base}?step=${id}&guide=0`);
      await p2.waitForFunction(() => document.documentElement.dataset.boot === "ready");
      const v = await view(p2);
      check(v.id === id && consistent(v), `steps: the address ?step=${id} opens that step`);
      await p2.close();
    }
    check(!errors.length, `steps: no console error${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await ctx.close();
  }

  // ---- playback -----------------------------------------------------------------------------------
  if (wanted("play")) {
    const { page, ctx, errors } = await open("?step=plan&guide=0");
    await page.click("#play");
    await page.waitForTimeout(2500);
    const mid = await view(page);
    check(mid.playing && mid.index === 0 && mid.clock > "22:00" && mid.clock < "22:17" && Number(mid.units.replace(/,/g, "")) > 0 && mid.play === "Pause", `play: the night runs (${mid.clock}, ${mid.units} units repacked) and the button says Pause`);
    await page.click("#play");
    const held = await view(page);
    await page.waitForTimeout(800);
    const still = await view(page);
    check(!still.playing && still.clock === held.clock && still.play === "Play", `play: Pause holds the night at ${held.clock}`);
    await page.click("#play");
    await page.waitForFunction(() => window.repackPilot.state.index === 1 && !window.repackPilot.state.playing, null, { timeout: 9000 });
    const at = await view(page);
    check(at.id === "learns" && at.clock === "22:17" && consistent(at), "play: Play resumes and stops at 22:17, the next step");
    await page.click('#steps [data-step="asks"] button');
    await page.click("#play");
    await page.waitForFunction(() => window.repackPilot.state.index === 3 && !window.repackPilot.state.playing, null, { timeout: 14000 });
    const end = await view(page);
    check(end.id === "result" && end.clock === "06:00" && end.units === "3,000" && end.orders === "12" && consistent(end), "play: from 23:10 the night runs to 06:00 and stops on the result");
    await page.click("#play");
    const dc = await view(page);
    check(dc.id === "your-dc" && dc.play === "Replay", "play: from the result Play opens Your DC, where it offers a replay");
    check(!errors.length, `play: no console error${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await ctx.close();
  }

  // ---- the decision -------------------------------------------------------------------------------
  if (wanted("decide")) {
    const { page, ctx, errors } = await open("?step=asks&guide=0");
    // What the page says about the barcode: the world model's station, the unknown item's tile.
    const said = () => page.evaluate(() => {
      const model = document.querySelector('.station[data-station="model"]');
      const tile = document.querySelector('.tile[data-sku="unknown"]');
      return { model: `${model.querySelector(".station-value").textContent} / ${model.querySelector(".station-note").textContent}`, modelTone: model.dataset.tone || "", tile: tile.dataset.tone || "", note: tile.querySelector(".tile-note").textContent };
    });
    const before = { buttons: await page.evaluate(() => !!document.getElementById("confirm").offsetParent), ...(await said()) };
    check(before.buttons && before.tile === "unknown" && before.note === "not in the model" && before.model === "Not in the model / a new entry waits for you", `decide: at 23:10 Confirm entry waits; station and tile say the barcode isn't in the model (${before.model})`);
    await page.click("#confirm");
    const after = await page.evaluate(() => ({
      buttons: !!document.getElementById("confirm").offsetParent || !!document.getElementById("reject").offsetParent,
      outcome: document.getElementById("decision-outcome").textContent, shown: !document.getElementById("decision-outcome").hidden,
      want: window.repackPilot.steps[2].decision.confirm, focus: document.activeElement?.id
    }));
    const confirmed = await said();
    check(!after.buttons && after.shown && after.outcome === after.want, "decide: Confirm entry decides once: the buttons go and the answer shows");
    check(confirmed.tile === "learn" && confirmed.note === "confirmed by you" && confirmed.modelTone === "learn" && confirmed.model === "Now in the model / no weight or grip yet", `decide: confirmed, station and tile say the model learned the barcode (${confirmed.model})`);
    check(after.focus === "decision-outcome", "decide: focus moves to the answer, not to the page's top");
    await page.click('#steps [data-step="result"] button');
    const learned2 = (await said()).model;
    await page.click('#steps [data-step="asks"] button');
    const kept = await page.evaluate(() => !document.getElementById("decision-outcome").hidden) && (await said()).tile === "learn";
    check(kept, "decide: the answer stays when the presenter moves on and back");
    check(learned2 === "Learned 2 / a weight, a barcode", `decide: confirmed, the result says the model learned a weight and a barcode (${learned2})`);
    await page.click("#restart");
    await page.click('#steps [data-step="asks"] button');
    const reset = await page.evaluate(() => !!document.getElementById("confirm").offsetParent && document.getElementById("decision-outcome").hidden) && (await said()).tile === "unknown";
    check(reset, "decide: Restart clears the answer for the next demo");
    await page.click('#steps [data-step="result"] button');
    const undecided = (await said()).model;
    check(undecided === "Learned 1 / a weight, not yet the barcode", `decide: unanswered, the result counts the weight only (${undecided})`);
    await page.click('#steps [data-step="asks"] button');
    await page.click("#reject");
    const rejectedText = await page.evaluate(() => document.getElementById("decision-outcome").textContent === window.repackPilot.steps[2].decision.reject);
    const rejected = await said();
    await page.click('#steps [data-step="result"] button');
    const learned1 = (await said()).model;
    check(rejectedText && rejected.tile === "unknown" && rejected.note === "rejected by you" && rejected.model === "Not in the model / rejected by you" && learned1 === "Learned 1 / a weight, not the barcode", `decide: Reject gives its own answer, and station, tile and result follow it (${rejected.model}; ${learned1})`);
    check(!errors.length, `decide: no console error${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await ctx.close();
  }

  // ---- Your DC ------------------------------------------------------------------------------------
  if (wanted("dc")) {
    const { page, ctx, errors } = await open("?step=your-dc&guide=0");
    const text = (id) => page.$eval(`#${id}`, (el) => el.textContent);
    const ref = W.worth(E.defaults()).text;
    const resetShown = () => page.evaluate(() => getComputedStyle(document.getElementById("dc-reset")).visibility === "visible");
    check(await text("dc-year") === ref.year && (await text("dc-detail")).includes(`${ref.cells} cells`) && (await text("dc-break-even")).startsWith(ref.break_even), `Your DC: the reference site reads ${ref.year} with ${ref.cells} cells, break-even ${ref.break_even}`);
    check(!(await resetShown()), "Your DC: Reset stays hidden while the inputs are the reference site's");
    await page.fill("#dc-units", "10,000,000");
    const ten = W.worth(E.inputs({ N: 10000000 })).text;
    check(await text("dc-year") === ten.year && (await text("dc-detail")).includes(`${ten.cells} cells`), `Your DC: 10,000,000 units give ${ten.year} with ${ten.cells} cells, as the engine computes`);
    await page.fill("#dc-cost", "42,50");
    await page.fill("#dc-rate", "550");
    const mine = W.worth(E.inputs({ N: 10000000, c: 42.5, r_m: 550 })).text;
    check(await text("dc-year") === mine.year && (await text("dc-per1000")) === `${mine.manual} by hand, ${mine.hybrid} with the cell`, `Your DC: €42.50 an hour and 550 picks give ${mine.year}, ${mine.manual} → ${mine.hybrid} per 1,000 units`);
    await page.fill("#dc-units", "lots");
    const refused = await page.evaluate(() => ({ error: !document.getElementById("dc-error").hidden, text: document.getElementById("dc-error").textContent, invalid: document.getElementById("dc-units").getAttribute("aria-invalid") }));
    check(refused.error && refused.invalid === "true" && /type a number from 100,000 to 100,000,000/.test(refused.text), `Your DC: a value that isn't a number is refused and the field says why ("${refused.text}")`);
    const shownWhenTyped = await resetShown();
    await page.click("#dc-reset");
    const back = await page.evaluate(() => ({ error: document.getElementById("dc-error").hidden, focus: document.activeElement?.id }));
    check(shownWhenTyped && await text("dc-year") === ref.year && await page.inputValue("#dc-units") === "6,000,000" && back.error && !(await resetShown()) && back.focus === "dc-units", "Your DC: Reset shows once something is typed, goes back to 6,000,000 units, hides and returns focus to the first field");
    check(!errors.length, `Your DC: no console error${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await ctx.close();
  }

  // ---- layout -------------------------------------------------------------------------------------
  if (wanted("layout")) {
    for (const [width, height] of VIEWPORTS) {
      for (const theme of ["light", "dark"]) {
        const { page, ctx, errors } = await open("?guide=0", { width, height, theme });
        const problems = [];
        for (const id of IDS) {
          await page.click(`#steps [data-step="${id}"] button`);
          await page.waitForTimeout(80);
          const p = await page.evaluate((stepId) => {
            const issues = [];
            const vw = innerWidth;
            const vh = innerHeight;
            const r = (el) => el.getBoundingClientRect();
            const inView = (el, box = { left: 0, top: 0, right: vw, bottom: vh }) => { const b = r(el); return b.width > 0 && b.height > 0 && b.left >= box.left - 0.5 && b.top >= box.top - 0.5 && b.right <= box.right + 0.5 && b.bottom <= box.bottom + 0.5; };
            if (document.documentElement.scrollWidth > vw) issues.push(`page ${document.documentElement.scrollWidth} px wide`);
            for (const sel of [".app-header", ".player", ".app-footer", "#steps", "#play", "#restart", ".kpis"]) if (!inView(document.querySelector(sel))) issues.push(`${sel} not in view`);
            const stage = r(document.querySelector(".stage"));
            const story = r(document.querySelector(".story"));
            for (const el of document.querySelectorAll(".station")) if (!inView(el, stage)) issues.push(`station ${el.dataset.station} cut off`);
            const head = r(document.querySelector(".app-header"));
            const kpis = [...document.querySelectorAll(".app-header [data-vc-kpi]")];
            if (kpis.length !== 3) issues.push(`${kpis.length} key figures in the header`);
            for (const k of kpis) { const b = r(k); if (b.left < vw * 0.45 || b.bottom > head.bottom + 0.5 || !inView(k)) issues.push(`key figure ${k.dataset.vcKpi} not top right`); }
            const tops = [...document.querySelectorAll(".station")].map((el) => Math.round(r(el).top));
            if (new Set(tops).size > 1) issues.push(`stations not in line (${tops.join(", ")})`);
            const tiles = [...document.querySelectorAll(".pallet .tile")];
            tiles.forEach((el, i) => { if (i % 6 && Math.abs(r(el).top - r(tiles[i - 1]).top) > 0.5) issues.push(`tile ${el.dataset.sku} out of its row`); });
            for (const el of document.querySelectorAll('.tile:not([data-shown="false"])')) if (!inView(el, stage)) issues.push(`tile ${el.dataset.sku} cut off`);
            const must = ["#story-title", ...(stepId === "asks" ? ["#confirm", "#reject"] : []), ...(stepId === "result" ? ["#compare"] : []), ...(stepId === "your-dc" ? ["#dc-units", "#dc-cost", "#dc-rate", "#dc-year", ".dc-next"] : [])];
            for (const sel of must) if (!inView(document.querySelector(sel), story)) issues.push(`${sel} not in view`);
            for (const el of document.querySelectorAll(".kpi .vc-stat__value, .station-value, .tile-name")) if (el.scrollWidth > el.clientWidth + 1) issues.push(`text cut: ${el.textContent.trim().slice(0, 30)}`);
            for (const el of document.querySelectorAll("button, input, a")) { const b = r(el); if (el.offsetParent && b.height > 0 && Math.min(b.height, b.width) < 24) issues.push(`small target ${el.id || el.className}`); }
            for (const el of [...document.querySelectorAll("#play, #restart, #steps button, #confirm, #reject, .dc-inputs input")]) { const b = r(el); if (el.offsetParent && b.height < 40) issues.push(`target under 40 px: ${el.id || el.textContent.trim().slice(0, 20)}`); }
            return issues;
          }, id);
          if (p.length) problems.push(`${id}: ${[...new Set(p)].slice(0, 6).join("; ")}`);
          if (id === "asks" || id === "your-dc") await page.screenshot({ path: path.join(out, `layout-${width}x${height}-${theme}-${id}.png`) });
        }
        check(!problems.length, `layout ${width} × ${height} ${theme}: every step fits${problems.length ? `: ${problems.join(" | ")}` : ""}`);
        check(!errors.length, `layout ${width} × ${height} ${theme}: no console error${errors.length ? `: ${errors.join(" | ")}` : ""}`);
        await ctx.close();
      }
    }
    const { page, ctx } = await open("?guide=0", { width: 375, height: 760 });
    const narrow = [];
    for (const id of IDS) {
      await page.click(`#steps [data-step="${id}"] button`);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      if (w > 375) narrow.push(`${id}: ${w} px`);
    }
    await page.screenshot({ path: path.join(out, "layout-375.png"), fullPage: true });
    check(!narrow.length, `layout 375 px: the page reflows without sideways scrolling${narrow.length ? `: ${narrow.join(", ")}` : ""}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}

let failed = 0;
for (const [ok, what] of results) { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failed += 1; }
console.log(`(screenshots in ${out})`);
if (failed) { console.log(`\n${failed} of ${results.length} checks failed.`); process.exit(1); }
console.log(`\nAll ${results.length} checks passed.\nSHOWCASE OK`);
