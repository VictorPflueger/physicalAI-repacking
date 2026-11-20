// How lean the showcase stays: limits a change has to argue with. Node.js only.
//   app        at most 12 JavaScript modules and 2,200 lines of app JavaScript, at most 1,100 lines of
//              app CSS (vici/ is Vici's, tests/ and tools/ aren't the app)
//   no lab     no live-mode, API-key or network code in the app: no fetch, no XMLHttpRequest, no
//              WebSocket, no key storage, no Anthropic host
//   policy     the page's content security policy connects nowhere (connect-src 'none')
//   docs       README.md at most 900 words, DEMO_SCRIPT.md at most 700
// Each rule is first tried on a planted example that must break it.
// Usage: node tests/lean.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

const LIMITS = { modules: 12, jsLines: 2200, cssLines: 1100, readmeWords: 900, scriptWords: 700 };
const LAB = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sessionStorage|api\.anthropic|anthropic-version|x-api-key|sk-ant-/;

const results = [];
const check = (ok, what) => results.push([!!ok, what]);
const read = (f) => readFileSync(path.join(APP_ROOT, f), "utf8");
const lines = (text) => text.split("\n").length;
const words = (text) => text.replace(/```[\s\S]*?```/g, " ").replace(/[|#*`>-]/g, " ").split(/\s+/).filter((w) => /[A-Za-z0-9€]/.test(w)).length;
const connectNone = (html) => /content="[^"]*\bconnect-src 'none'/.test(html);

// The rules catch what they are for.
check(LAB.test('await fetch("https://api.anthropic.com/v1/messages")') && LAB.test('sessionStorage.setItem("rp.anthropic.key", k)') && !LAB.test("const fetched = items.filter(Boolean);"), "control: the lab pattern catches a model call and a stored key, and passes ordinary code");
check(!connectNone(`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src https://api.anthropic.com">`), "control: a policy that connects to a host is caught");

const js = readdirSync(path.join(APP_ROOT, "js")).filter((f) => f.endsWith(".js"));
const jsLines = js.reduce((n, f) => n + lines(read(`js/${f}`)), 0);
const css = readdirSync(path.join(APP_ROOT, "css")).filter((f) => f.endsWith(".css"));
const cssLines = css.reduce((n, f) => n + lines(read(`css/${f}`)), 0);
check(js.length <= LIMITS.modules, `app: ${js.length} JavaScript modules, at most ${LIMITS.modules}`);
check(jsLines <= LIMITS.jsLines, `app: ${jsLines} lines of JavaScript, at most ${LIMITS.jsLines}`);
check(cssLines <= LIMITS.cssLines, `app: ${cssLines} lines of CSS in ${css.length} file(s), at most ${LIMITS.cssLines}`);
const lab = [...js.map((f) => `js/${f}`), "index.html"].filter((f) => LAB.test(read(f)));
check(!lab.length, `no lab: no network, key or model code in the app${lab.length ? `; found in ${lab.join(", ")}` : ""}`);
check(connectNone(read("index.html")), "policy: the page connects nowhere (connect-src 'none')");
const readme = words(read("README.md"));
const script = words(read("DEMO_SCRIPT.md"));
check(readme <= LIMITS.readmeWords, `docs: README.md has ${readme} words, at most ${LIMITS.readmeWords}`);
check(script <= LIMITS.scriptWords, `docs: DEMO_SCRIPT.md has ${script} words, at most ${LIMITS.scriptWords}`);

let failed = 0;
for (const [ok, what] of results) { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failed += 1; }
if (failed) { console.log(`\n${failed} of ${results.length} checks failed.`); process.exit(1); }
console.log(`\nAll ${results.length} checks passed.\nLEAN OK`);
