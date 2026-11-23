// Vici's own rules, checked with Vici's own functions: the How it works guide and its key figures (guideProblems), the
// byline (bylineProblems) and the Writing guideline's checkable patterns (writingProblems: no eyebrow,
// no numbered middle-dot heading, no bold-label list item, no em dash as punctuation, no stock word),
// on the page and on every sentence the showcase writes into it. Node.js only.
//
// The functions come from a checkout of ViciDesign next to this repository (../ViciDesign, or the
// folder in VICI_DIR). Without one the suite says so and passes, unless --require-vici is given, as on
// GitHub Actions, which checks ViciDesign out at the commit vici/ was copied from.
// Usage: node tests/vici.mjs [--require-vici]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./lib/harness.mjs";

const require = process.argv.includes("--require-vici");
const dir = [process.env.VICI_DIR, path.resolve(APP_ROOT, "..", "ViciDesign")].filter(Boolean).find((d) => existsSync(path.join(d, "scripts", "check-guide.mjs")));
if (!dir) {
  console.log(`${require ? "FAIL" : "SKIP"}  no ViciDesign checkout next to this repository (../ViciDesign) or in VICI_DIR`);
  process.exit(require ? 1 : 0);
}

// Vici's checks print their own report on import; it goes to stderr here, so this suite's lines stay together.
const log = console.log;
console.log = (...a) => console.error("  [vici]", ...a);
const load = async (lib, script, name) => {
  const file = [lib, script].map((f) => path.join(dir, "scripts", f)).find((f) => existsSync(f));
  return (await import(pathToFileURL(file).href))[name];
};
const guideProblems = await load("lib/guide.mjs", "check-guide.mjs", "guideProblems");
const bylineProblems = await load("lib/byline.mjs", "check-byline.mjs", "bylineProblems");
const writingProblems = await load("lib/writing.mjs", "check-docs.mjs", "writingProblems");
console.log = log;

const results = [];
const check = (ok, what) => results.push([!!ok, what]);
const html = readFileSync(path.join(APP_ROOT, "index.html"), "utf8");

const g = guideProblems(html);
check(!g.length, `the guide follows Vici's standard${g.length ? `: ${g.join("; ")}` : ""}`);
check(/<h2 class="vc-dialog__title" id="guide-title">How the showcase works<\/h2>/.test(html), "the guide is titled for a showcase, as the website's card lists Repack Pilot");
const b = bylineProblems(html);
check(!b.length, `the byline follows Vici's standard${b.length ? `: ${b.join("; ")}` : ""}`);
const w = writingProblems(html);
check(!w.length, `index.html keeps Vici's writing rules${w.length ? `: ${w.join("; ")}` : ""}`);
check(/<html lang="en-GB">/.test(html), 'the page is marked lang="en-GB"');
// The key figures: three in the header, each named in the guide (Vici's guideProblems() checks the naming).
const kpis = [...html.matchAll(/\bdata-vc-kpi="([^"]+)"/g)].map((m) => m[1]);
check(kpis.join("|") === "Labour per 1,000 units|Detection → decision|Store orders on time", `the header marks its three key figures (${kpis.join(", ")})`);

// Every sentence the showcase writes at run time, as the page would show it.
const S = await import(pathToFileURL(path.join(APP_ROOT, "js/story.js")).href);
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(path.join(APP_ROOT, "data/world.js"), "utf8"), sandbox);
const show = S.buildShowcase(sandbox.window.WORLD);
const rows = (s) => [s.flow || [], ...Object.values(s.flowIf || {})].flat();
const said = show.steps.flatMap((s) => [s.heading, s.text, s.agent, s.next, s.turn, s.done, s.decision?.confirm, s.decision?.reject, s.log?.confirm, s.log?.reject, ...rows(s).flatMap((f) => [f.value, f.note])]).filter(Boolean);
const written = writingProblems(`<html lang="en-GB"><body>${said.map((t) => `<p>${t}</p>`).join("")}</body></html>`);
check(!written.length, `the ${said.length} sentences and labels the steps write keep the writing rules${written.length ? `: ${written.join("; ")}` : ""}`);

// The README and the demo script read the same way (Markdown, checked as text).
for (const doc of ["README.md", "DEMO_SCRIPT.md", "DESIGN.md"]) {
  const text = readFileSync(path.join(APP_ROOT, doc), "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  const p = writingProblems(`<html lang="en-GB"><body><p>${text.replace(/</g, "&lt;")}</p></body></html>`);
  check(!p.length, `${doc} keeps the writing rules${p.length ? `: ${p.join("; ")}` : ""}`);
}

// The checks can fail: a page without a guide, a key figure the guide never names, a byline without the
// website link, an em dash.
check(guideProblems(html.replace(/<dialog\b[^>]*vc-guide[\s\S]*?<\/dialog>/, "")).length > 0, "control: a page without the guide is caught");
check(guideProblems(html.replace("<div class=\"kpis\"", "<p class=\"vc-stat\" data-vc-kpi=\"Pallets per hour\">48</p><div class=\"kpis\"")).some((p) => /Pallets per hour/.test(p)), "control: a key figure the guide never names is caught");
check(bylineProblems(html.replace(/href="https:\/\/victorpflueger\.github\.io\/VIP\/index\.html"/, 'href="#"')).length > 0, "control: a byline without the website link is caught");
check(writingProblems('<html lang="en-GB"><body><p>Fast — and robust.</p></body></html>').length > 0, "control: an em dash and a stock word are caught");

let failed = 0;
for (const [ok, what] of results) { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failed += 1; }
console.log(`(Vici's checks from ${path.relative(APP_ROOT, dir) || dir})`);
if (failed) { console.log(`\n${failed} of ${results.length} checks failed.`); process.exit(1); }
console.log(`\nAll ${results.length} checks passed.\nVICI STANDARDS OK`);
