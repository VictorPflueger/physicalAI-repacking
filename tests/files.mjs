// The files: everything the page, the modules, the tests and the workflow name is there, and vici/ is
// Vici unchanged. Node.js only.
//   page       every local file index.html loads (stylesheets, scripts, images, the icon) exists
//   modules    every import of every module resolves to a file that exports the imported names
//   tests      every suite the runner lists and every script the workflow runs exists
//   data       data/world.js is exactly what tools/build_world.mjs writes
//   vici       vici/ holds exactly the files vici/README.md lists, each byte for byte as in ViciDesign at
//              the commit the README names (with a ViciDesign checkout at ../ViciDesign or VICI_DIR;
//              without one it says so and passes, unless --require-vici is given)
// Usage: node tests/files.mjs [--require-vici]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./lib/harness.mjs";

const results = [];
const check = (ok, what) => results.push([!!ok, what]);
const read = (f) => readFileSync(path.join(APP_ROOT, f), "utf8");
const exists = (f) => existsSync(path.join(APP_ROOT, f));

// ---- the page --------------------------------------------------------------------------------------
const html = read("index.html");
const local = [...html.matchAll(/\b(?:href|src)="([^"#?]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|data:)/.test(u));
const missingPage = local.filter((f) => !exists(f));
check(local.length >= 6 && !missingPage.length, `page: the ${local.length} local files index.html loads exist${missingPage.length ? `; missing: ${missingPage.join(", ")}` : ""}`);

// ---- the modules -----------------------------------------------------------------------------------
const modules = readdirSync(path.join(APP_ROOT, "js")).filter((f) => f.endsWith(".js"));
const exportsOf = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) for (const part of m[1].split(",")) names.add(part.trim().split(/\s+as\s+/).pop());
  return names;
};
const broken = [];
let imports = 0;
for (const f of modules) {
  const src = read(`js/${f}`);
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
    imports += 1;
    const target = path.join("js", m[2]);
    if (!exists(target)) { broken.push(`${f} imports ${m[2]}, which is missing`); continue; }
    const have = exportsOf(read(target));
    for (const name of m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!have.has(name)) broken.push(`${f} imports ${name} from ${m[2]}, which doesn't export it`);
  }
}
check(imports > 10 && !broken.length, `modules: the ${imports} imports of ${modules.length} modules resolve${broken.length ? `; ${broken.join("; ")}` : ""}`);
const loaded = new Set(local.filter((f) => f.startsWith("js/")).map((f) => f.slice(3)));
const reachable = new Set();
const walk = (f) => { if (reachable.has(f) || !exists(`js/${f}`)) return; reachable.add(f); for (const m of read(`js/${f}`).matchAll(/from\s*"\.\/([^"]+)"/g)) walk(m[1]); };
for (const f of loaded) walk(f);
const orphans = modules.filter((f) => !reachable.has(f));
check(!orphans.length, `modules: every module is loaded by the page or imported by one that is${orphans.length ? `; unused: ${orphans.join(", ")}` : ""}`);

// ---- the tests and the workflow --------------------------------------------------------------------
const runner = read("tests/run-all.mjs");
const suites = [...runner.matchAll(/file:\s*"([^"]+)"/g)].map((m) => m[1]);
check(suites.length >= 8 && suites.every(exists), `tests: the ${suites.length} suites the runner lists exist${suites.filter((f) => !exists(f)).map((f) => `; missing ${f}`).join("")}`);
const workflow = read(".github/workflows/tests.yml");
const named = [...workflow.matchAll(/\bnode\s+(tests\/[\w./-]+\.mjs)/g)].map((m) => m[1]);
check(named.length >= 1 && named.every(exists), `workflow: the scripts it runs exist (${named.join(", ")})`);
const stale = [...workflow.matchAll(/run-all\.mjs([^\n]*)/g)].flatMap((m) => m[1].trim().split(/\s+/).filter((x) => x && !x.startsWith("-")));
const ids = [...runner.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
check(stale.every((id) => ids.includes(id)), `workflow: every suite it names is in the runner (${stale.join(", ") || "all"})`);

// ---- the data --------------------------------------------------------------------------------------
const { files } = await import(pathToFileURL(path.join(APP_ROOT, "tools/build_world.mjs")).href);
const generated = files();
check(generated.length === 1 && generated.every(([file, content]) => existsSync(file) && readFileSync(file, "utf8") === content), "data: data/world.js is exactly what tools/build_world.mjs writes");
const dataFiles = readdirSync(path.join(APP_ROOT, "data"));
check(dataFiles.join() === "world.js", `data: data/ holds the world only (${dataFiles.join(", ")})`);

// ---- vici/ -----------------------------------------------------------------------------------------
const readme = read("vici/README.md");
const commit = (readme.match(/commit \*\*`([0-9a-f]{7,40})`\*\*/) || [])[1];
const listed = [...readme.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
const all = (dir) => readdirSync(path.join(APP_ROOT, dir)).flatMap((e) => (statSync(path.join(APP_ROOT, dir, e)).isDirectory() ? all(`${dir}/${e}`) : [`${dir}/${e}`]));
const present = all("vici").map((f) => f.slice("vici/".length)).filter((f) => f !== "README.md").sort();
const matches = (pattern, f) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`).test(f);
const unlisted = present.filter((f) => !listed.some((p) => matches(p, f)));
const unmatched = listed.filter((p) => !present.some((f) => matches(p, f)));
check(!!commit && !unlisted.length && !unmatched.length, `vici: its README names the commit (${commit}) and lists exactly the ${present.length} files${unlisted.length ? `; not listed: ${unlisted.join(", ")}` : ""}${unmatched.length ? `; listed, not present: ${unmatched.join(", ")}` : ""}`);
const requireVici = process.argv.includes("--require-vici");
const dir = [process.env.VICI_DIR, path.resolve(APP_ROOT, "..", "ViciDesign")].filter(Boolean).find((d) => existsSync(path.join(d, ".git")) || existsSync(path.join(d, "dist")));
if (!dir) {
  check(!requireVici, `vici: ${requireVici ? "no" : "(skipped) no"} ViciDesign checkout at ../ViciDesign or in VICI_DIR to compare with`);
} else {
  const show = (f) => { try { return execFileSync("git", ["-C", dir, "show", `${commit}:${f}`], { maxBuffer: 64 * 1024 * 1024 }); } catch { return null; } };
  const differ = [];
  for (const f of present) {
    const source = f.startsWith("dist/") || f === "LICENSE" ? f : f.replace(/^assets\//, "assets/");
    const theirs = show(source);
    const ours = readFileSync(path.join(APP_ROOT, "vici", f));
    if (!theirs || !theirs.equals(ours)) differ.push(f);
  }
  check(!differ.length, `vici: all ${present.length} files are byte for byte ViciDesign's at ${commit}${differ.length ? `; differ: ${differ.join(", ")}` : ""}`);
}

let failed = 0;
for (const [ok, what] of results) { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failed += 1; }
if (failed) { console.log(`\n${failed} of ${results.length} checks failed.`); process.exit(1); }
console.log(`\nAll ${results.length} checks passed.\nFILES OK`);
