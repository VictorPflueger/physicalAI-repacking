// Contrast: every visible text meets WCAG 2.2 AA (4.5:1, large text 3:1) against what is painted
// behind it, in the light and the dark theme, at 1920 × 1080 and 1280 × 720: the five steps (the
// decision answered and unanswered, with the bar under the story asking or done), the night playing,
// and the guide's first and last chapters.
// The measure is tests/lib/contrast.mjs; it first proves itself on a planted page.
// Usage: NODE_PATH="$(npm root -g)" node tests/contrast.mjs
import { APP_ROOT, launchBrowser, serveStatic } from "./lib/harness.mjs";
import { contrastShortfalls, settle } from "./lib/contrast.mjs";

const server = await serveStatic(APP_ROOT, 8867);
const browser = await launchBrowser();
const results = [];
const check = (ok, what) => results.push([!!ok, what]);
const IDS = ["plan", "learns", "asks", "result", "your-dc"];

try {
  // The measure catches a grey on grey and passes ink on paper.
  {
    const page = await browser.newPage();
    await page.setContent('<body style="background:#fff"><p style="color:#bbb">Faint text</p><p style="color:#222">Ink</p></body>');
    const r = await contrastShortfalls(page);
    check(r.measured === 2 && r.below.length === 1 && r.below[0].text === "Faint text", "control: the measure catches #bbb on white and passes #222");
    await page.close();
  }
  for (const [width, height] of [[1920, 1080], [1280, 720]]) {
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      await ctx.addInitScript((t) => { try { localStorage.setItem("vc-theme", t); } catch { /* blocked */ } }, theme);
      const page = await ctx.newPage();
      await page.goto(server.base);
      await page.waitForFunction(() => document.documentElement.dataset.boot === "ready");
      const below = [];
      let measured = 0;
      const measure = async (state) => {
        await settle(page);
        const r = await contrastShortfalls(page);
        measured += r.measured;
        for (const b of r.below) below.push(`${state}: "${b.text}" ${b.ratio}:1 < ${b.need}:1 (${b.color} on ${b.bg})`);
      };
      await measure("guide, chapter 1");
      await page.click(".vc-guide__rail .vc-step__button >> nth=-1");
      await measure("guide, the talk track");
      await page.keyboard.press("Escape");
      for (const id of IDS) {
        await page.click(`#steps [data-step="${id}"] button`);
        await measure(id);
        if (id === "asks") { await page.click("#confirm"); await measure("asks, confirmed"); }
      }
      await page.click('#steps [data-step="plan"] button');
      await page.click("#play");
      await page.waitForFunction(() => document.getElementById("clock").textContent > "22:00", null, { timeout: 12000 });
      await measure("playing");
      check(measured > 400 && !below.length, `${width} × ${height} ${theme}: ${measured} texts measured in 10 states${below.length ? `; below AA: ${[...new Set(below)].slice(0, 8).join(" | ")}` : ", all at AA or better"}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}

let failed = 0;
for (const [ok, what] of results) { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failed += 1; }
if (failed) { console.log(`\n${failed} of ${results.length} checks failed.`); process.exit(1); }
console.log(`\nAll ${results.length} checks passed.\nCONTRAST OK`);
