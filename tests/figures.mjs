// The figures: what the showcase states is what the engine and the night simulation compute, and the
// night is the very night 0.5.0 showed. Node.js only.
//   engine     every value figure recomputed here from the formulas and the default inputs, against
//              the engine and its display strings
//   night      the night's fingerprint equals 0.5.0's main run (scenario 3 with its recorded agent,
//              a4f63a61186a840e), and tonight's units, hours and euros recomputed from its unit log
//   steps      the five steps at their moments, each stating the figures computed above
//   page       every figure in index.html ([data-fig], the guide included) equals the computed one
// Usage: node tests/figures.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { APP_ROOT } from "./lib/harness.mjs";

const mod = (p) => import(pathToFileURL(path.join(APP_ROOT, p)).href);
const E = await mod("js/engine.js");
const W = await mod("js/worth.js");
const S = await mod("js/story.js");
const T = await mod("js/timeline.js");
const V = await mod("js/view.js");
const NS = await mod("js/nightsim.js");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(path.join(APP_ROOT, "data/world.js"), "utf8"), sandbox, { filename: "data/world.js" });
const WORLD = sandbox.window.WORLD;

const results = [];
const check = (ok, what) => results.push([!!ok, what]);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const euros = (x, d = 2) => `€${(Math.round(x * 10 ** d) / 10 ** d).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

// ---- engine: the formulas, by hand ----------------------------------------------------------------
const v = E.defaults();
const Hm = 1000 / v.r_m;
const Hh = Hm * (1 - v.s * v.p);
const year = (v.N / v.r_m) * v.s * v.p * v.c;
const cells = ((v.N * v.s) / v.r_c) / (v.nights * v.shift_h);
const breakEven = ((v.r_c * v.p) / v.r_m) * v.c;
const k = E.perThousand(v);
check(near(k.manual_eur, Hm * v.c) && near(k.hybrid_eur, Hh * v.c), `engine: per 1,000 units ${Hm * v.c} by hand, ${Hh * v.c} with the cell`);
check(near(E.perYear(v).eur_avoided, year, 1e-6) && near(E.perYear(v).cells_night_shift, cells), `engine: ${year} a year with ${cells} cells`);
check(near(E.perCellHour(v).break_even_eur, breakEven), `engine: break-even ${breakEven} an operating hour`);
const wt = W.worth(v).text;
const want = { manual: euros(Hm * v.c), hybrid: euros(Hh * v.c), year: euros(year, 0), cells: String(Math.round(cells * 10) / 10), break_even: euros(breakEven), saving: `−${Math.round((1 - Hh / Hm) * 100)} %` };
for (const [key, text] of Object.entries(want)) check(wt[key] === text, `display: ${key} reads "${wt[key]}", expected "${text}"`);
// Your DC at 10,000,000 units, as the demo script types it
const wt10 = W.worth(E.inputs({ N: 10000000 })).text;
check(wt10.year === euros((10000000 / v.r_m) * v.s * v.p * v.c, 0) && wt10.cells === String(Math.round(((10000000 * v.s) / v.r_c / (v.nights * v.shift_h)) * 10) / 10), `Your DC: 10,000,000 units give ${wt10.year} with ${wt10.cells} cells`);

// ---- the night ------------------------------------------------------------------------------------
const show = S.buildShowcase(WORLD);
check(show.hash === "a4f63a61186a840e", `night: fingerprint ${show.hash} equals 0.5.0's main run (a4f63a61186a840e)`);
const res = show.res;
const robot = res.events.filter((e) => e.type === "grasp_attempt" && e.payload.ok).length;
const picks = res.events.filter((e) => e.type === "manual_pick");
const setAside = picks.filter((e) => e.payload.set_aside).length;
const hand = picks.length - setAside;
const labourH = picks.length / v.r_m; // every pick a person made, set-aside units included
const byHandH = (robot + hand + setAside) / v.r_m;
const F = show.facts;
check(robot + hand === 3000 && F.tonight.repacked === 3000, `night: ${robot} by the robot + ${hand} by hand = 3,000 repacked`);
check(setAside === F.unknown.units && setAside === 6, `night: ${setAside} unknown units set aside for a person`);
check(near(F.tonight.labourH, labourH) && near(F.tonight.labourEur, labourH * v.c), `night: labour ${labourH} h, ${labourH * v.c} €`);
check(near(F.tonight.byHandH, byHandH) && near(F.tonight.byHandEur, byHandH * v.c), `night: by hand ${byHandH} h, ${byHandH * v.c} €`);
check(res.orders.length === 12 && res.orders.every((o) => o.on_time) && F.tonight.onTime === 12, "night: 12 of 12 store orders on their trucks");
const corr = res.corrections[0];
check(res.corrections.length === 1 && corr.sku === "S07" && corr.old === 200 && corr.new === 400 && NS.clockOf(corr.at) === "22:17", "night: one correction, the jam jar 200 g → 400 g at 22:17");
const esc = res.escalations[0];
check(res.escalations.length === 1 && esc.rule === "E1" && esc.units === 6 && NS.clockOf(esc.t) === "23:10", "night: one escalation, the unknown barcode on 6 units at 23:10");

// ---- the key figures ------------------------------------------------------------------------------
// Detection to decision, measured here from the events: the scale's reading to the model taking the
// weight, the camera's reading to the rule sending the units to a person.
const readAt = (type, unit) => res.events.find((e) => e.type === type && e.payload.unit_id === unit)?.t;
const delays = [
  ...res.events.filter((e) => e.type === "world_model_correction").map((e) => e.t - readAt("scale_reading", e.payload.unit_id)),
  ...res.events.filter((e) => e.type === "escalation" && e.payload.rule === "E1").map((e) => e.t - readAt("detection", e.payload.unit_id))
];
check(delays.length === 2 && delays.every((d) => Number.isFinite(d) && d >= 0), `key figures: two catches tonight, each with a reading before it (${delays.join(" ms, ")} ms)`);
check(F.decision.catches === delays.length && F.decision.ms === Math.max(...delays) && F.decision.text === (Math.max(...delays) < 1000 ? "<\u00a01\u00a0s" : `${Math.ceil(Math.max(...delays) / 1000)}\u00a0s`), `key figures: detection to decision reads "${F.decision.text}" for ${F.decision.catches} catches, ${F.decision.ms} ms at most`);
check(F.tonight.onTime === res.orders.filter((o) => o.on_time).length && F.tonight.onTime === 12, `key figures: store orders on time ${F.tonight.onTime} of ${res.orders.length}`);

// ---- the steps ------------------------------------------------------------------------------------
const steps = show.steps;
check(steps.map((s) => s.id).join() === S.STEP_IDS.join() && steps.map((s) => s.clock).join() === "22:00,22:17,23:10,06:00,06:00", `steps: ${steps.map((s) => `${s.id} ${s.clock}`).join(", ")}`);
const has = (s, ...parts) => parts.every((p) => `${s.heading} ${s.text} ${s.agent || ""}`.includes(p));
check(has(steps[0], "3,000", "12 stores", "2,100", "900"), "step 1 states 3,000 units, 12 stores, 2,100 for the robot and 900 for people");
check(has(steps[1], "400 g", "200 g", "Essen"), "step 2 states 400 g against 200 g and the tote it closes");
check(has(steps[2], "4037848020859", "6 units") && steps[2].decision?.confirm && steps[2].decision?.reject, "step 3 states the barcode, its 6 units and both answers");
const hours2 = (h) => `${(Math.round(h * 100) / 100).toFixed(2)} h`;
check(has(steps[3], "12 of 12", "1,911", "1,089", hours2(labourH), hours2(byHandH)) && steps[3].compare.cell.eur === euros(labourH * v.c) && steps[3].compare.hand.eur === euros(byHandH * v.c), `step 4 states ${hours2(labourH)} · ${euros(labourH * v.c)} against ${hours2(byHandH)} · ${euros(byHandH * v.c)}`);
check(steps[3].compare.saving === `−${Math.round((1 - labourH / byHandH) * 100)} %`, `step 4's saving reads ${steps[3].compare.saving}`);
check(steps.slice(0, 4).every((s) => [undefined, "confirm", "reject"].every((d) => S.flowOf(s, d)?.length === 5)), "steps 1 to 4 say what each of the five stations does, whatever the answer at 23:10");
// The result counts what the model learned: the weight always, the barcode only once it is confirmed.
const learnedSays = (d) => S.flowOf(steps[3], d)[1].value;
const learnedWant = { confirm: res.corrections.length + res.escalations.length, reject: res.corrections.length, none: res.corrections.length };
check(learnedSays("confirm") === `Learned ${learnedWant.confirm}` && learnedSays("reject") === `Learned ${learnedWant.reject}` && learnedSays(undefined) === `Learned ${learnedWant.none}`, `step 4 counts what the model learned: ${learnedSays("confirm")} confirmed, ${learnedSays("reject")} rejected or unanswered`);

// The timeline at the moments: the night's state matches its events.
const tl = T.buildTimeline(show);
const end = T.stateAt(tl, F.end);
check(end.robot === robot && end.hand === hand && end.setAside === setAside && end.ready === 12 && end.shipped === 12, "timeline: at 06:00 everything is done and every truck gone");
const at = T.stateAt(tl, corr.at);
check(at.learned && !T.stateAt(tl, corr.at - 1).learned && at.grasp?.sku === "S07" && at.grasp?.observed_g === 400, "timeline: the jar is learned at 22:17, not a millisecond before");
check(T.stateAt(tl, esc.t).unknownSeen && !T.stateAt(tl, esc.t - 1).unknownSeen, "timeline: the unknown barcode turns up at 23:10");

// ---- the page: every stated figure is the computed one --------------------------------------------
const html = readFileSync(path.join(APP_ROOT, "index.html"), "utf8");
const figs = V.figuresOf(F);
const decode = (t) => t.replace(/&nbsp;/g, "\u00a0").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const stated = [...html.matchAll(/<(\w+)\b[^>]*\bdata-fig="([^"]+)"[^>]*>([^<]*)<\/\1>/g)].map((m) => ({ key: m[2], text: decode(m[3]) }));
const wrong = stated.filter((s) => figs[s.key] === undefined || figs[s.key] !== s.text);
check(stated.length >= 30 && !wrong.length, `page: ${stated.length} figures in index.html equal the computed ones${wrong.length ? `; wrong: ${wrong.map((w) => `${w.key} "${w.text}" ≠ "${figs[w.key]}"`).join(", ")}` : ""}`);
const unused = Object.keys(figs).filter((key) => !stated.some((s) => s.key === key));
check(!unused.length, `page: every computed figure appears in the page${unused.length ? ` (not used: ${unused.join(", ")})` : ""}`);
const heading = (html.match(/<h2 class="story-title" id="story-title">([^<]*)<\/h2>/) || [])[1];
check(heading === steps[0].heading, `page: the story opens on step 1's heading ("${heading}")`);

// ---- the docs: the README and the demo script state the same figures --------------------------
const plain = (t) => t.replace(/\u00a0/g, " ");
const key = [wt.manual, wt.hybrid, "3,000", "2,100", "900", "12 stores", `${corr.new} g`, `${corr.old} g`, `${esc.units} units`, `${(Math.round(labourH * 100) / 100).toFixed(2)}`, `${(Math.round(byHandH * 100) / 100).toFixed(2)}`, plain(wt.saving).replace("−", "")];
for (const doc of ["README.md", "DEMO_SCRIPT.md"]) {
  const text = plain(readFileSync(path.join(APP_ROOT, doc), "utf8"));
  const missing = key.filter((k) => !text.includes(plain(k)));
  check(!missing.length, `docs: ${doc} states the computed figures${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
}

// The talk track says what the figure shows: "under a second" only while it is under a second.
const track = (html.match(/data-vc-chapter="present"[\s\S]*?<\/section>/) || [""])[0];
check(/under a second/.test(track) === (F.decision.ms < 1000) && /point at the three figures/i.test(track), "talk track: it points at the three figures and says detection to decision takes under a second, as measured");
const kpiNames = ["Labour per 1,000 units", "Detection → decision", "Store orders on time"];
for (const doc of ["README.md", "DEMO_SCRIPT.md"]) {
  const text = readFileSync(path.join(APP_ROOT, doc), "utf8");
  const missing = kpiNames.filter((k) => !text.includes(k));
  check(!missing.length, `docs: ${doc} names the three key figures${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
}

let failed = 0;
for (const [ok, what] of results) { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failed += 1; }
if (failed) { console.log(`\n${failed} of ${results.length} checks failed.`); process.exit(1); }
console.log(`\nAll ${results.length} checks passed.\nFIGURES OK`);
