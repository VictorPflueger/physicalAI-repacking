// The How it works guide behaves as Vici's standard says (components/guide.html, Behaviour and
// Opening), checked the way Vici's own scripts/check-guide-render.mjs checks its starters, here over
// http because the showcase's modules don't run from a file: it opens by itself in a new tab with
// focus on Next and no live region; Enter moves to chapter 2 and focus to its heading; the rail jumps
// to the last chapter, whose button reads Start; Escape closes; the header button reopens it at
// chapter 1; the last button closes it and gives focus back; a reload in the same tab doesn't reopen
// it; ?guide=0 keeps it closed; ?guide=present opens the talk track; at 375 px it fills the screen;
// at 1280 × 720 and 1366 × 768 every chapter, the talk track included, fits without scrolling.
// Usage: NODE_PATH="$(npm root -g)" node tests/guide-behaviour.mjs
import path from "node:path";
import { APP_ROOT, launchBrowser, serveStatic, outDir } from "./lib/harness.mjs";

const out = await outDir("guide");
const server = await serveStatic(APP_ROOT, 8866);
const browser = await launchBrowser();
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const errs = [];
const watch = (p) => { p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); }); };
const ready = (p) => p.waitForFunction(() => document.documentElement.dataset.boot === "ready", null, { timeout: 15000 });

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  watch(p);
  await p.goto(server.base);
  await ready(p);
  await p.waitForTimeout(200);
  const state = () => p.evaluate(() => {
    const d = document.querySelector("dialog.vc-guide");
    const shown = [...d.querySelectorAll(".vc-guide__chapter")].filter((c) => !c.hidden);
    return {
      open: d.open, chapters: d.querySelectorAll(".vc-guide__chapter").length, shown: shown.map((c) => c.dataset.vcChapter),
      count: d.querySelector(".vc-guide__count").textContent,
      active: document.activeElement && (document.activeElement.matches("[data-vc-guide-next]") ? "next" : `${document.activeElement.tagName}:${document.activeElement.textContent.trim().slice(0, 40)}`),
      back: d.querySelector("[data-vc-guide-back]").disabled, next: d.querySelector("[data-vc-guide-next]").textContent.trim(),
      rail: d.querySelectorAll(".vc-guide__rail .vc-step__button").length,
      current: d.querySelector('.vc-step__button[aria-current="step"]')?.textContent.trim(), live: d.querySelectorAll("[aria-live]").length
    };
  });
  let s = await state();
  ok(s.open, "does not open by itself in a new tab");
  ok(s.shown.length === 1 && s.shown[0] === "what", `first chapter not shown alone: ${s.shown}`);
  ok(s.active === "next", `focus not on Next at open: ${s.active}`);
  ok(s.back === true, "Back not disabled on chapter 1");
  ok(s.count === `1 of ${s.chapters}`, `count reads "${s.count}"`);
  ok(s.rail === s.chapters && s.chapters === 4, `rail lists ${s.rail} of ${s.chapters} chapters`);
  ok(s.live === 0, "a live region is inside the guide");
  await p.screenshot({ path: path.join(out, "guide-1280.png") });
  await p.keyboard.press("Enter");
  await p.waitForTimeout(100);
  s = await state();
  ok(s.shown[0] === "how", "Next did not move to chapter 2");
  ok(/^H3:/.test(s.active), `focus not on the new heading: ${s.active}`);
  ok(s.back === false, "Back still disabled on chapter 2");
  ok(s.current && s.current.includes("How it works"), `rail current is ${s.current}`);
  await p.click(".vc-guide__rail .vc-step__button >> nth=-1");
  await p.waitForTimeout(100);
  s = await state();
  ok(s.shown[0] === "present", "the rail did not jump to the talk track");
  ok(s.next === "Start", `the last chapter's button reads "${s.next}"`);
  await p.screenshot({ path: path.join(out, "guide-present-1280.png") });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(150);
  s = await state();
  ok(!s.open, "Escape did not close the guide");
  await p.click("[data-vc-guide-open]");
  await p.waitForTimeout(150);
  s = await state();
  ok(s.open && s.shown[0] === "what", "the header button did not reopen it at chapter 1");
  for (let i = 0; i < s.chapters; i++) { await p.click("[data-vc-guide-next]"); await p.waitForTimeout(60); }
  s = await state();
  ok(!s.open, "the last button did not close the guide");
  const focusAfter = await p.evaluate(() => document.activeElement && (document.activeElement.hasAttribute("data-vc-guide-open") || document.activeElement.id === "play"));
  ok(focusAfter, "focus did not go back to the page's controls");
  const afterStart = await p.evaluate(() => new URL(location.href).searchParams.get("step"));
  ok(afterStart === "plan", `Start did not leave the page on the first step (${afterStart})`);
  await p.reload();
  await ready(p);
  await p.waitForTimeout(200);
  s = await state();
  ok(!s.open, "opens again after a reload in the same tab");

  const p2 = await ctx.newPage();
  watch(p2);
  await p2.goto(`${server.base}?guide=0`);
  await ready(p2);
  ok(!(await p2.evaluate(() => document.querySelector("dialog.vc-guide").open)), "?guide=0 did not keep it closed");
  const p3 = await ctx.newPage();
  watch(p3);
  await p3.goto(`${server.base}?guide=present`);
  await ready(p3);
  await p3.waitForTimeout(150);
  ok(await p3.evaluate(() => { const d = document.querySelector("dialog.vc-guide"); return d.open && !d.querySelector('[data-vc-chapter="present"]').hidden; }), "?guide=present did not open the talk track");

  const phone = await browser.newContext({ viewport: { width: 375, height: 760 } });
  const p4 = await phone.newPage();
  watch(p4);
  await p4.goto(server.base);
  await ready(p4);
  await p4.waitForTimeout(200);
  const box = await p4.evaluate(() => { const r = document.querySelector("dialog.vc-guide").getBoundingClientRect(); return [r.width, r.height, document.documentElement.scrollWidth]; });
  ok(box[0] >= 374 && box[1] >= 759, `not full screen at 375 px: ${box}`);
  await p4.screenshot({ path: path.join(out, "guide-375.png") });
  const dark = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
  await dark.addInitScript(() => { try { localStorage.setItem("vc-theme", "dark"); } catch { /* blocked */ } });
  const p5 = await dark.newPage();
  watch(p5);
  await p5.goto(`${server.base}?guide=present`);
  await ready(p5);
  await p5.waitForTimeout(200);
  await p5.screenshot({ path: path.join(out, "guide-present-dark.png") });

  // On a shared laptop screen every chapter, the talk track included, reads without scrolling.
  for (const [width, height] of [[1280, 720], [1366, 768]]) {
    const c = await browser.newContext({ viewport: { width, height } });
    const pg = await c.newPage();
    watch(pg);
    await pg.goto(`${server.base}?guide=what`);
    await ready(pg);
    await pg.waitForTimeout(150);
    const over = await pg.evaluate(() => {
      const d = document.querySelector("dialog.vc-guide");
      const scroller = d.querySelector(".vc-guide__chapters");
      return [...d.querySelectorAll(".vc-guide__rail .vc-step__button")].map((b, i) => {
        b.click();
        const chapter = d.querySelectorAll(".vc-guide__chapter")[i];
        return { id: chapter.dataset.vcChapter, over: scroller.scrollHeight - scroller.clientHeight };
      }).filter((x) => x.over > 1);
    });
    ok(!over.length, `at ${width} × ${height} the guide scrolls in ${over.map((x) => `"${x.id}" by ${x.over} px`).join(", ")}`);
    await c.close();
  }
  ok(!errs.length, `console errors: ${errs.join(" | ")}`);
} finally {
  await browser.close();
  await server.close();
}

if (fails.length) { console.error(fails.map((f) => `FAIL  ${f}`).join("\n")); process.exit(1); }
console.log("PASS  opens once per tab, focus and keyboard behave, the talk track's button reads Start, ?guide=0 and ?guide=present work, full screen on a phone");
console.log(`(screenshots in ${out})`);
console.log("GUIDE BEHAVIOUR OK");
