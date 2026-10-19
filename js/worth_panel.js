// What it is worth: the Customer view's right column, beside the world model (TECH_NOTES D62, D64).
// Euros only where the engine prices labour with sourced inputs: per 1,000 units with the cell against
// by hand, tonight's labour against the same units by hand, a DC's year with the cells it needs, and the
// break-even per cell hour. Everything else the world model does for the customer is a count from the
// night: the weights it corrected, the items it did not know, the grasps it handed to a person, the
// store orders on their trucks. No new number and no payback claim (Victor, 19 Oct 2026).
//
// "Your DC" changes the presenter's inputs exactly as the KPI board and the Assumptions tab do (audited
// as assumption_change), so every view follows. Plan figures use the run's inputs while a run is on and
// the presenter's otherwise; tonight's figures keep the inputs the run ran on (TECH_NOTES D53).

import { bus } from "./events.js";
import { h } from "./dom.js";
import { worth } from "./worth.js";
import { tonightSoFar, visibleOrders, laneState } from "./cell_data.js";
import { tonightEuros, night as engineNight, defaults } from "./engine.js";
import { eur2, hours, int, fixed } from "./format.js";
import { commitInput, parseInput } from "./assumptions.js";

const YOUR_DC = [
  { id: "N", label: "Units repacked a year", unit: "units", integer: true, show: (v) => int(v) },
  { id: "c", label: "Labour cost", unit: "€ an hour", integer: false, show: (v) => fixed(v, 2) }
];

/**
 * onOpenBusinessCase(): opens the KPI board (on a short window the panel shows the year with a button
 * there instead of its own inputs).
 */
export function createWorthPanel(root, { getInputs, getRunInputs = () => null, getNightState = () => null, getOverrides = () => ({}), setOverrides = () => {}, isRunning = () => false, onOpenBusinessCase = null } = {}) {
  // ---- headline: per 1,000 units ----------------------------------------------------------------------
  const big = h("span", { class: "wp-big num", id: "wp-hybrid" });
  const bigSub = h("span", { class: "wp-big-sub" });
  const barManual = h("span", { class: "wp-bar-fill", dataset: { kind: "manual" } });
  const barHybrid = h("span", { class: "wp-bar-fill", dataset: { kind: "hybrid" } });
  const valManual = h("span", { class: "wp-bar-value num" });
  const valHybrid = h("span", { class: "wp-bar-value num" });
  const saving = h("span", { class: "wp-saving" });
  const bars = h("div", { class: "wp-bars", role: "img" },
    h("span", { class: "wp-bar-label" }, "By hand"), h("span", { class: "wp-bar" }, barManual), valManual,
    h("span", { class: "wp-bar-label" }, "With the cell"), h("span", { class: "wp-bar" }, barHybrid), valHybrid,
    saving);

  // ---- tonight -------------------------------------------------------------------------------------------
  const tonightHead = h("h3", { class: "wp-head" });
  const tonight = h("dl", { class: "wp-list", id: "wp-tonight" });

  // ---- your DC -------------------------------------------------------------------------------------------
  const year = h("span", { class: "wp-year num", id: "wp-year" });
  const yearCells = h("span", { class: "wp-year-cells" });
  const yearBreak = h("span", { class: "wp-year-break" });
  const yearSub = h("span", { class: "wp-year-sub" }, yearCells, yearBreak);
  // The qualifier: its label stays beside the year at every size (the brief: "illustrative, per reference
  // site, gross", before cell costs); its sources line gives way first on a short window.
  const qualLabel = h("span", { class: "wp-qual-label" });
  const qualSources = h("span", { class: "wp-qual-sources" });
  const qual = h("span", { class: "wp-qual" }, qualLabel, qualSources);
  const inputs = new Map();
  let drawing = false;
  const fields = YOUR_DC.map((x) => {
    const input = h("input", {
      class: "input wp-dc-input num", type: "text", id: `wp-dc-${x.id}`,
      inputmode: x.integer ? "numeric" : "decimal", autocomplete: "off", spellcheck: "false", "aria-label": `${x.label} (${x.unit})`
    });
    const msg = h("span", { class: "wp-dc-msg", role: "status" });
    const commit = () => {
      if (drawing) return;
      const r = commitInput({ id: x.id, value: parseInput(input.value, { integer: x.integer }), getOverrides, setOverrides, isRunning, via: "your_dc" });
      if (!r.ok) { msg.textContent = r.message; input.setAttribute("aria-invalid", "true"); return; }
      input.removeAttribute("aria-invalid");
      msg.textContent = "";
      render(true);
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
    inputs.set(x.id, { input, x });
    return h("label", { class: "wp-dc-field", for: `wp-dc-${x.id}` },
      h("span", { class: "wp-dc-label" }, x.label),
      h("span", { class: "wp-dc-row" }, input, h("span", { class: "wp-dc-unit" }, x.unit)),
      msg);
  });
  const resetBtn = h("button", { class: "btn btn-sm", type: "button", id: "wp-dc-reset", title: "Back to the reference site of the brief: 6,000,000 units a year at €35.80 an hour" }, "Reference site");
  // On a short window the inputs stay on the KPI board: one click opens it.
  const openDc = onOpenBusinessCase
    ? h("button", { class: "btn btn-sm wp-dc-open", type: "button", id: "wp-dc-open", title: "Type the customer's yearly volume and labour cost on the KPI board" }, "Your DC")
    : null;
  openDc?.addEventListener("click", () => onOpenBusinessCase());
  resetBtn.addEventListener("click", () => {
    for (const x of YOUR_DC) commitInput({ id: x.id, value: defaults()[x.id], getOverrides, setOverrides, isRunning, via: "your_dc" });
    render(true);
  });

  const panel = h("div", { class: "worth-inner" },
    h("div", { class: "wp-title-row" }, h("h2", { class: "wp-title" }, "What it is worth"), h("span", { class: "wp-engine" }, "the engine's figures, not the AI's")),
    h("div", { class: "wp-headline" }, h("div", { class: "wp-big-wrap" }, big, bigSub), bars),
    h("section", { class: "wp-tonight", "aria-label": "Tonight" }, tonightHead, tonight),
    h("section", { class: "wp-dc", "aria-label": "Your DC" },
      h("h3", { class: "wp-head" }, "Your DC"),
      h("div", { class: "wp-dc-fields" }, ...fields, resetBtn),
      h("div", { class: "wp-year-wrap" }, year, yearSub, openDc),
      qual));
  root.replaceChildren(panel);

  // ---- size: stepping down while the content does not fit above the console's minimum --------------------
  // full; compact (the year with a Your DC button to the KPI board's inputs, its qualifier without the
  // sources line); tight (rows and bars closed up); hidden when a drawer open over a short window leaves
  // the panel under HIDE_BELOW px: the KPI board in the drawer and the header tiles carry its figures
  // then. The year keeps its cells, its break-even and "gross, before cell costs" at every size.
  const HIDE_BELOW = 200;
  let size = "full";
  const fits = () => root.scrollHeight <= root.clientHeight + 1;
  function measure() {
    root.dataset.size = "full";
    if (!root.offsetParent) return; // the Full view hides the panel: measured again when shown
    size = "full";
    for (const next of ["compact", "tight"]) {
      if (fits()) break;
      size = next;
      root.dataset.size = next;
    }
    if (size === "tight" && !fits() && root.clientHeight < HIDE_BELOW) { size = "hidden"; root.dataset.size = size; }
  }
  let measuring = 0;
  const remeasure = () => { if (!measuring) measuring = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16))(() => { measuring = 0; measure(); }); };
  if (typeof ResizeObserver === "function") new ResizeObserver(remeasure).observe(root.parentElement || root);

  // ---- rendering ----------------------------------------------------------------------------------------
  let frame = 0;
  let forced = false;
  let running = false;
  let ended = false;
  function schedule(force = false) {
    if (force) forced = true;
    if (!frame) frame = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16))(() => { frame = 0; const f = forced; forced = false; render(f); });
  }

  function render(force = false) {
    const v = getInputs();
    const w = worth(v);
    const t = w.text;
    // Per 1,000 units, the plan at the inputs in force.
    set(big, t.hybrid);
    set(bigSub, "per 1,000 units with the cell");
    set(saving, `${t.saving} against by hand`);
    const max = Math.max(w.figures.manual_eur, w.figures.hybrid_eur, 0.01);
    barManual.style.width = `${Math.round((w.figures.manual_eur / max) * 1000) / 10}%`;
    barHybrid.style.width = `${Math.round((w.figures.hybrid_eur / max) * 1000) / 10}%`;
    set(valManual, t.manual);
    set(valHybrid, t.hybrid);
    bars.setAttribute("aria-label", `Labour per 1,000 units: ${t.manual} by hand, ${t.hybrid} with the cell`);
    renderTonight();
    // Your DC: the year and its cells, at the presenter's inputs.
    set(year, `${t.year} a year`);
    set(yearCells, `for ${t.units} units, with ${t.cells} cells on the night shift`);
    set(yearBreak, `; each cell pays while it costs less than ${t.break_even} an operating hour`);
    set(qualLabel, `Illustrative, ${v.N === defaults().N ? "per reference site" : "for this volume"}, gross, before cell costs.`);
    set(qualSources, ` ${int(v.r_m)} manual picks an hour (IML), labour at ${eur2(v.c)} an hour (EUROSTAT_LC); the cell's rates are assumptions.`);
    drawing = true;
    try {
      const over = getOverrides();
      for (const { input, x } of inputs.values()) {
        if (document.activeElement === input && !force) continue;
        const val = x.show(v[x.id]);
        if (input.value !== val) input.value = val;
      }
      resetBtn.disabled = !YOUR_DC.some((x) => over[x.id] !== undefined);
    } finally { drawing = false; }
  }

  function renderTonight() {
    const st = getNightState();
    const rv = getRunInputs() || getInputs();
    const rows = [];
    if (!st || (!running && !ended && st.t === 0)) {
      // Before the night: tonight's plan, from the engine at tonight's units.
      const units = st ? st.info.totals.units : 3000;
      const n = engineNight(rv, units);
      set(tonightHead, "Tonight, as planned");
      rows.push(["Units", `${int(units)}: the robot may take ${int(st?.info.totals.cell_units ?? Math.round(units * rv.s))}, people ${int(st?.info.totals.manual_units ?? units - Math.round(units * rv.s))}`]);
      rows.push(["Labour", `${hours(n.hybrid_h)} · ${eur2(n.hybrid_eur)} with the cell; by hand ${hours(n.manual_h)} · ${eur2(n.manual_eur)}`]);
      rows.push(["Store orders", `${int(st ? visibleOrders(st).length : 12)}, each with its truck`]);
    } else {
      const f = tonightSoFar(st);
      const eur = tonightEuros(rv, f);
      // The same units by hand, the ones a person set aside included, as tonight's labour includes them (D69).
      const byHand = engineNight(rv, f.units_packed + (st.manual.set_aside || 0));
      const done = ended || st.ended;
      set(tonightHead, done ? "Tonight" : "Tonight so far");
      const total = [...st.orders.values()].reduce((n, o) => n + o.units, 0);
      const repackedByHand = Math.max(0, st.manual.picks - st.manual.set_aside);
      rows.push(["Units repacked", `${int(f.units_packed)} of ${int(total)}: ${int(st.cell.successes)} by the robot, ${int(repackedByHand)} by hand`]);
      rows.push(["Labour", `${hours(f.labour_hours)} · ${eur2(eur.labour_eur)} with the cell; by hand ${hours(byHand.manual_h)} · ${eur2(byHand.manual_eur)}`]);
      const caught = [];
      const nFix = st.corrections.length;
      caught.push(`${int(nFix)} ${nFix === 1 ? "weight" : "weights"} corrected`);
      if (st.unknown) {
        const units = [...st.escalations].reverse().find((e) => e.rule === "E1")?.units ?? st.unknown.seen;
        caught.push(`1 unknown item, ${int(units)} units to a person`);
      }
      const unsafe = st.escalations.filter((e) => e.rule === "E2").length;
      if (unsafe) caught.push(`${int(unsafe)} unsure ${unsafe === 1 ? "grasp" : "grasps"} to a person`);
      rows.push(["Caught by the model", caught.join(" · ")]);
      const list = visibleOrders(st);
      const states = list.map(laneState);
      const onTruck = states.filter((s) => s === "dispatched").length;
      const late = states.filter((s) => s === "late").length;
      const risk = states.filter((s) => s === "at-risk").length;
      const onTrack = list.length - onTruck - late - risk;
      rows.push(["Store orders", done
        ? `${int(onTruck)} of ${int(list.length)} on their trucks${late ? `; ${int(late)} late` : ""}`
        : `${int(onTruck)} of ${int(list.length)} on their trucks so far, ${int(onTrack)} on track${risk ? `, ${int(risk)} at risk` : ""}${late ? `, ${int(late)} late` : ""}`]);
      if (done && f.units_packed) rows.push(["Per 1,000 units tonight", `${eur2(eur.per_thousand_eur)} with the cell${f.called_in_hours > 0 ? `, ${hours(f.called_in_hours)} called in` : ""}`]);
    }
    const key = rows.map((r) => r.join("|")).join("\n");
    if (tonight.dataset.key === key) return;
    tonight.dataset.key = key;
    tonight.replaceChildren(...rows.flatMap(([k, val]) => [h("dt", {}, k), h("dd", {}, val)]));
    remeasure();
  }

  function set(el, text) { if (el.textContent !== text) el.textContent = text; }

  bus.on("run_start", () => { running = true; ended = false; schedule(true); });
  bus.on("night_end", () => { ended = true; schedule(true); });
  bus.on("run_end", () => { running = false; schedule(true); });

  render(true);
  return {
    /** Called by the board after a batch of the night's events, and when the inputs change. */
    update: () => schedule(),
    refresh: () => { schedule(true); remeasure(); },
    reset: () => { running = false; ended = false; schedule(true); },
    size: () => size
  };
}
