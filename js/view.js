// Draws the page from the night (js/story.js, js/timeline.js): the header's figures, one item's way
// through the cell, tonight's pallet, the story of the step on screen, the decision log and the bar
// under the story. No state of its own beyond what the bar last showed: main.js says what to show,
// these functions show it.

import { worth } from "./worth.js";
import { inputs, PARAMETERS } from "./engine.js";
import { int, eur2, upTo, fixed } from "./format.js";

/** A small element factory: h("p", { class: "x" }, "text", child). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const $ = (id) => document.getElementById(id);
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };

/** Writes every figure the page and the guide name ([data-fig]) from one table of strings. */
export function fillFigures(figs, root = document) {
  for (const el of root.querySelectorAll("[data-fig]")) {
    const text = figs[el.dataset.fig];
    if (text !== undefined) setText(el, text);
  }
}

/** The figures the page states, from the night and the engine at the reference inputs. */
export function figuresOf(F) {
  const W = F.worth.text;
  const p = (id) => PARAMETERS.find((x) => x.id === id).value;
  return {
    units: int(F.units), stores: String(F.stores), "robot-units": int(F.robotUnits), "people-units": int(F.peopleUnits),
    "first-truck": F.firstTruck.at, "plan-at": "22:00", "learns-at": F.jar.clock, "asks-at": F.unknown.clock, "end-at": F.endClock,
    manual: W.manual, hybrid: W.hybrid, saving: W.saving,
    "jar-new": `${F.jar.new} g`, "jar-old": `${F.jar.old} g`, "unknown-units": String(F.unknown.units),
    "labour-h": `${upTo(F.tonight.labourH, 2)} h`, "by-hand-h": `${upTo(F.tonight.byHandH, 2)} h`,
    "decision-time": F.decision.text, "on-time": String(F.tonight.onTime),
    r_m: int(p("r_m")), c: eur2(p("c")), s: `${upTo(p("s") * 100, 0)} %`, p: `${upTo(p("p") * 100, 0)} %`, r_c: int(p("r_c"))
  };
}

// ------------------------------------------------------------------ one item's way

const STATIONS = [
  { id: "camera", name: "Camera", icon: "camera", cell: "vc-cell--fjord" },
  { id: "model", name: "World model", icon: "cube", cell: "cell-neutral" },
  { id: "robot", name: "Robot", icon: "gripper", cell: "cell-neutral" },
  { id: "scale", name: "Scale", icon: "scale", cell: "vc-cell--fjord" },
  { id: "person", name: "Person", icon: "user", cell: "" }
];

/** Builds the five stations; returns update(rows, active) where rows[i] = { value, note, tone }. */
export function createFlow(root) {
  const parts = STATIONS.map((s) => {
    const value = h("span", { class: "station-value" });
    const note = h("span", { class: "station-note" });
    const li = h("li", { class: "station", dataset: { station: s.id } },
      h("span", { class: `vc-cell vc-cell--sm station-cell ${s.cell}`, "aria-hidden": "true" }, h("span", { class: `vc-icon vc-icon--${s.icon}` })),
      h("span", { class: "station-name" }, s.name), value, note);
    root.append(li);
    return { li, value, note, name: s.name };
  });
  return (rows, active = -1) => {
    rows.forEach((r, i) => {
      const p = parts[i];
      setText(p.value, r.value);
      setText(p.note, r.note || "");
      if ((p.li.dataset.tone || "") !== (r.tone || "")) {
        if (r.tone) p.li.dataset.tone = r.tone;
        else delete p.li.dataset.tone;
      }
      p.li.dataset.active = String(i === active);
      p.li.setAttribute("aria-label", `${p.name}: ${r.value}${r.note ? `, ${r.note}` : ""}`);
    });
  };
}

/** What the stations show while the night plays: the last unit through the cell, the people's count. */
export function liveFlow(state, timeline, names) {
  const g = state.grasp;
  const person = { value: `${int(state.hand + state.setAside)} by hand`, note: state.handPick ? `now: ${names.get(state.handPick.sku)}` : "items the robot may not grip" };
  if (!g) return [{ value: "Waiting", note: "for the first unit" }, { value: `${timeline.items.length} items`, note: "weight, size, grip" }, { value: "Ready", note: "" }, { value: "Ready", note: "" }, person];
  const name = names.get(g.sku);
  const corrected = timeline.correction && g.sku === timeline.correction.sku && g.t >= timeline.correction.at;
  return [
    { value: name, note: "barcode read" },
    { value: `Expects ${int(g.expected_g)} g`, note: corrected ? "learned tonight" : "from the item master", tone: corrected ? "learn" : "" },
    g.ok ? { value: "Picked", note: `${int(state.robot)} so far` } : { value: "Missed", note: "the unit goes to a person", tone: "miss" },
    g.ok ? { value: `${int(g.observed_g)} g`, note: g.observed_g === g.expected_g ? "as the model expects" : "differs from the model", tone: g.observed_g === g.expected_g ? "" : "learn" } : { value: "Not weighed", note: "nothing was picked" },
    person
  ];
}

// ------------------------------------------------------------------ tonight's pallet

const SIZE = /^(.*?)(\s\d.*)$/;
/**
 * "Apricot jam 200 g": the name, with its size in a span a small screen can leave out, unless the
 * size is what tells two items apart (still water by the bottle and by the six-pack).
 */
function tileName(name, names) {
  const m = SIZE.exec(name);
  const twin = m && names.filter((n) => (SIZE.exec(n)?.[1] ?? n) === m[1]).length > 1;
  if (!m || twin) return h("span", { class: "tile-name" }, name);
  return h("span", { class: "tile-name" }, m[1], h("span", { class: "tile-size" }, m[2]));
}

/** Builds one tile per item (and the unknown item's, shown once it turns up); returns update(). */
export function createPallet(root, timeline, F) {
  const names = timeline.items.map((it) => it.name);
  const tiles = timeline.items.map((it) => {
    const fill = h("span", { class: "tile-fill" });
    const note = h("span", { class: "tile-note" });
    const li = h("li", { class: "tile", dataset: { sku: it.sku, kind: it.cell ? "robot" : "person" } },
      h("span", { class: `vc-icon vc-icon--${it.cell ? "gripper" : "user"} tile-icon`, "aria-hidden": "true" }),
      tileName(it.name, names), note,
      h("span", { class: "tile-bar", "aria-hidden": "true" }, fill));
    root.append(li);
    return { li, fill, note, item: it };
  });
  const uFill = h("span", { class: "tile-fill" });
  const uNote = h("span", { class: "tile-note" });
  // Its place is kept from the start, so the pallet doesn't move when the barcode turns up at 23:10.
  const unknown = h("li", { class: "tile", dataset: { sku: "unknown", kind: "person", shown: "false" } },
    h("span", { class: "vc-icon vc-icon--user tile-icon", "aria-hidden": "true" }),
    h("span", { class: "tile-name" }, "Unknown item"), uNote,
    h("span", { class: "tile-bar", "aria-hidden": "true" }, uFill));
  root.append(unknown);

  const tone = (li, t) => { if ((li.dataset.tone || "") !== (t || "")) { if (t) li.dataset.tone = t; else delete li.dataset.tone; } };
  return (state, decision) => {
    tiles.forEach((tile, i) => {
      const s = state.items[i];
      const it = tile.item;
      const share = it.planned ? s.done / it.planned : 0;
      tile.fill.style.setProperty("--p", share.toFixed(4));
      tile.li.dataset.full = String(s.done >= it.planned && it.planned > 0);
      const learned = state.learned && it.sku === F.jar.sku;
      tone(tile.li, learned ? "learn" : "");
      // A second line only where it says something: why people take the item, or what the model learned.
      const note = learned ? `now ${F.jar.new}\u00a0g` : it.cell ? "" : it.reason;
      setText(tile.note, note);
      tile.note.hidden = !note;
      tile.li.setAttribute("aria-label", `${it.name}: ${int(s.done)} of ${int(it.planned)} units, ${it.cell ? "for the robot" : `for people, ${it.reason}`}${learned ? `, learned: ${F.jar.new} g` : ""}`);
    });
    unknown.dataset.shown = String(state.unknownSeen);
    uFill.style.setProperty("--p", (state.setAside / F.unknown.units).toFixed(4));
    unknown.dataset.full = String(state.setAside >= F.unknown.units);
    // Confirmed, the barcode is something the model learned (fjord, as the legend says); otherwise it stays unknown.
    const said = decision === "confirm" ? "confirmed by you" : decision === "reject" ? "rejected by you" : "not in the model";
    tone(unknown, decision === "confirm" ? "learn" : "unknown");
    setText(uNote, said);
    unknown.setAttribute("aria-label", `Unknown item, barcode ${F.unknown.barcode}: ${F.unknown.units} units for a person, ${said}`);
  };
}

// ------------------------------------------------------------------ header

/** What the cell has caught so far, in the words of the detection tile. */
function caughtText(state) {
  if (state.learned && state.unknownSeen) return "2 caught: a weight, a barcode";
  if (state.learned) return "1 caught: a wrong weight";
  if (state.unknownSeen) return "1 caught: an unknown barcode";
  return "scale and camera check every unit";
}

/** The header's two moving figures and the pallet's count at a state; tone "done" once every truck has left on time. */
export function updateHeader(state, F) {
  setText($("units-done"), int(state.repacked));
  setText($("decision-note"), caughtText(state));
  setText($("orders-ready"), String(state.onTime));
  const allGone = state.shipped === state.orders && state.t >= F.end;
  setText($("orders-note"), allGone ? "every truck left on time" : state.ready === state.orders ? "all packed, trucks leaving" : `first truck at ${F.firstTruck.at}`);
  const tile = $("kpi-orders");
  if (allGone) tile.dataset.tone = "done";
  else delete tile.dataset.tone;
}

// ------------------------------------------------------------------ the story

/** Shows a step's words, the answer given at 23:10, its comparison or Your DC. The question itself is
 * asked by the bar under the story (setMove). */
export function renderStory(step, { decision } = {}) {
  setText($("story-title"), step.heading);
  setText($("story-text"), step.text);
  $("agent").hidden = !step.agent;
  if (step.agent) setText($("agent-text"), step.agent);

  const outcome = $("decision-outcome");
  outcome.hidden = !(step.decision && decision);
  if (step.decision && decision) setText(outcome, step.decision[decision]);

  const c = $("compare");
  c.hidden = !step.compare;
  if (step.compare) {
    setText($("compare-hand"), `${step.compare.hand.hours} · ${step.compare.hand.eur}`);
    setText($("compare-cell"), `${step.compare.cell.hours} · ${step.compare.cell.eur}`);
    c.querySelector('[data-kind="cell"] .compare-fill').style.setProperty("--p", step.compare.share.toFixed(4));
    setText($("compare-saving"), `${step.compare.saving} labour with the cell`);
  }
  $("your-dc").hidden = step.id !== "your-dc";
}

/** The decision log: who answered what at 23:10, kept for the rest of the night. */
export function renderLog(entries, shown) {
  const log = $("log");
  log.hidden = !(shown && entries.length);
  const key = entries.map((e) => `${e.at} ${e.what}`).join("|");
  if (log.dataset.key === key) return;
  log.dataset.key = key;
  setText($("log-summary"), `Decision log: ${entries.length === 1 ? "1 entry" : `${entries.length} entries`}`);
  $("log-list").replaceChildren(...entries.map((e) => h("li", {}, h("time", { class: "vc-tabular", datetime: e.at }, e.at), ` ${e.what}`)));
}

// ------------------------------------------------------------------ the bar under the story

let shownMove = "";
/**
 * The bar right under what just happened: in words, what happens next or what to do, with that one
 * action (Rebate Hunter's pattern). tone: "play" while Play reads the step, "move" when it is the
 * person's turn, "done" when the night is over. An action is { id, label, icon, iconEnd, kind, attention,
 * onClick }; attention marks the one the page waits for. Returns true when the bar changed.
 */
export function setMove({ tone = "move", lead = "", text = "", actions = [] }) {
  const key = JSON.stringify([tone, lead, text, actions.map((a) => [a.id, a.label, a.kind, !!a.attention])]);
  if (key === shownMove) return false;
  shownMove = key;
  const box = $("move");
  const hadFocus = box.contains(document.activeElement);
  box.dataset.tone = tone;
  $("move-text").replaceChildren(...(lead ? [h("strong", {}, lead), " "] : []), text);
  $("move-actions").replaceChildren(...actions.map((a) => {
    const b = h("button", { type: "button", id: a.id, class: `vc-button${a.kind ? ` vc-button--${a.kind}` : ""}`, "data-attention": a.attention ? true : null },
      a.icon ? h("span", { class: `vc-icon vc-icon--${a.icon}`, "aria-hidden": "true" }) : null, a.label,
      a.iconEnd ? h("span", { class: `vc-icon vc-icon--${a.iconEnd}`, "aria-hidden": "true" }) : null);
    b.addEventListener("click", a.onClick);
    return b;
  }));
  // A new request is seen arriving; under reduced motion it just appears (css/app.css).
  box.classList.remove("move--new");
  void box.offsetWidth;
  box.classList.add("move--new");
  if (hadFocus) (box.querySelector("[data-attention]") || box.querySelector("button"))?.focus({ preventScroll: true });
  return true;
}

// ------------------------------------------------------------------ Your DC

/** "6,000,000" or "6.000.000" → 6000000; "35,80" or "35.80" → 35.8; null when it isn't a number. */
export function parseNumber(raw, { integer = false } = {}) {
  let s = String(raw ?? "").replace(/[\s€ ]/g, "");
  if (!s) return null;
  if (integer) s = s.replace(/[.,](?=\d{3}(\D|$))/g, "");
  else if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,(?=\d{3}(\D|$))/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const FIELDS = [
  { id: "dc-units", key: "N", integer: true, show: (v) => int(v) },
  { id: "dc-cost", key: "c", integer: false, show: (v) => fixed(v, 2) },
  { id: "dc-rate", key: "r_m", integer: true, show: (v) => int(v) }
];

/** The Your DC calculator: three inputs priced by the engine as they are typed. */
export function createYourDc() {
  const form = $("your-dc");
  const error = $("dc-error");
  const reference = Object.fromEntries(FIELDS.map((f) => [f.key, PARAMETERS.find((p) => p.id === f.key).value]));
  const render = () => {
    const overrides = {};
    const problems = [];
    for (const f of FIELDS) {
      const input = $(f.id);
      const n = parseNumber(input.value, { integer: f.integer });
      const def = PARAMETERS.find((p) => p.id === f.key);
      const ok = n !== null && n >= def.min && n <= def.max;
      input.setAttribute("aria-invalid", String(!ok));
      if (ok) overrides[f.key] = n;
      else problems.push(`${def.label}: type a number from ${f.show(def.min)} to ${f.show(def.max)}.`);
    }
    error.hidden = !problems.length;
    setText(error, problems.join(" "));
    const t = worth(inputs(overrides)).text;
    setText($("dc-year"), t.year);
    setText($("dc-detail"), `labour saved with ${t.cells} cells on the night shift, gross, before cell costs`);
    setText($("dc-per1000"), `${t.manual} by hand, ${t.hybrid} with the cell`);
    setText($("dc-break-even"), `${t.break_even} an operating hour`);
    // Reset shows once there is something to reset; it keeps its place, so nothing moves.
    const atReference = FIELDS.every((f) => $(f.id).value === f.show(reference[f.key]));
    $("dc-reset").style.visibility = atReference ? "hidden" : "";
    return t;
  };
  form.addEventListener("input", render);
  form.addEventListener("submit", (e) => { e.preventDefault(); render(); });
  $("dc-reset").addEventListener("click", () => {
    for (const f of FIELDS) $(f.id).value = f.show(reference[f.key]);
    render();
    $(FIELDS[0].id).focus(); // the button hides itself, so focus goes back to where typing starts
  });
  for (const f of FIELDS) $(f.id).value = f.show(reference[f.key]);
  render();
  return { render };
}
