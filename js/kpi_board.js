// The KPI board (drawer tab; PLAN.md §c.5 and §g). It opens with what the cell is worth (TECH_NOTES
// D50): the yearly figure with the cells it needs and the break-even, per 1,000 units with the cell
// against by hand, and a "Your DC" input for the customer's own volume and labour cost, which changes
// the presenter's inputs exactly as the Assumptions tab does (audited as assumption_change). Below it,
// the engine's plan beside tonight's simulated result in labelled columns, each figure with its basis
// (a source key from DATA_SOURCES.md or the label Assumption). The yearly figure is "illustrative, per
// reference site, gross, before cell costs"; there is no payback claim.
//
// Plan figures use the run's inputs while a run is on and the presenter's inputs otherwise; the Tonight
// column keeps the inputs its run ran on (TECH_NOTES D53).

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { plan as enginePlan, night as engineNight, defaults, PARAMETERS, tonightEuros } from "./engine.js";
import { tonightSoFar, visibleOrders, laneState } from "./cell_data.js";
import { eur2, hours, int, upTo, fixed } from "./format.js";
import { aiLabel } from "./ai_label.js";
import { basisTag } from "./tags.js";
import { worth } from "./worth.js";
import { commitInput, parseInput } from "./assumptions.js";

// Each figure's basis as Vici's tags: a source key from DATA_SOURCES.md (mono), the label Assumption,
// or Synthetic in its dashed capsule.
const basis = (...keys) => h("span", { class: "kb-basis" }, keys.map(basisTag));

/** The two inputs a customer knows for his own DC. */
const YOUR_DC = [
  { id: "N", label: "Units repacked a year", unit: "units", integer: true, show: (v) => int(v) },
  { id: "c", label: "Labour cost", unit: "€ an hour", integer: false, show: (v) => fixed(v, 2) }
];

export function createKpiBoard(panel, { getInputs, getRunInputs = () => null, getNightState = () => null, getOverrides = () => ({}), setOverrides = () => {}, isRunning = () => false } = {}) {
  const root = h("div", { class: "kpiboard" });
  const worthEl = h("section", { class: "kb-worth", "aria-label": "What it is worth" });
  const tableEl = h("div", { class: "kb-plan-tonight" });
  root.append(worthEl, tableEl);
  panel.append(root);
  let night = null;      // { seed, volume, final: figures | null }
  let pending = 0;
  let whatIf = null;     // the agent's latest labelled what-if (sim_kpis with what_if), for this run
  let worthKey = null;   // the inputs the worth section was drawn with: it is redrawn only when they change
  let drawing = false;   // the worth section is being redrawn (a focused input's change event fires on removal)

  function render() {
    renderWorth();
    renderTable();
  }

  // ---- what it is worth, with Your DC ---------------------------------------------------------------
  function renderWorth(force = false) {
    const v = getInputs();
    const over = getOverrides();
    const key = JSON.stringify([v, over, isRunning()]);
    // Never redrawn while the presenter types in it, and only when its inputs changed.
    if (!force && key === worthKey) return;
    if (!force && worthEl.contains(document.activeElement) && document.activeElement?.tagName === "INPUT") return;
    if (drawing) return;
    drawing = true;
    try { drawWorth(v, over, key); } finally { drawing = false; }
  }

  function drawWorth(v, over, key) {
    worthKey = key;
    const w = worth(v);
    const t = w.text;
    const changed = YOUR_DC.some((x) => over[x.id] !== undefined);
    const held = isRunning() && YOUR_DC.some((x) => (over[x.id] ?? defaults()[x.id]) !== v[x.id]);
    clear(worthEl);
    worthEl.append(...[
      h("div", { class: "kb-worth-head" },
        h("h3", {}, "What it is worth"),
        h("span", { class: "kb-qual" }, `illustrative, ${v.N === defaults().N ? "per reference site" : "for this volume"}, gross, before cell costs`)),
      h("div", { class: "kb-worth-main" },
        h("div", { class: "kb-worth-figure" },
          h("span", { class: "kb-big vc-tabular", id: "kb-year" }, `${t.year} a year`),
          h("span", { class: "kb-worth-sub" }, `with ${t.cells} cells on the night shift`)),
        yourDc(v, changed)),
      held ? h("p", { class: "kb-held" }, "This run keeps the inputs it started with; your change applies when it ends.") : null,
      h("ul", { class: "vc-list kb-worth-list" },
        h("li", {}, h("strong", {}, "Per 1,000 units: "), `${t.hybrid} with the cell, instead of ${t.manual} by hand (${t.saving}).`),
        h("li", {}, h("strong", {}, "Cells: "), `${t.cell_hours} cell hours a year, that is ${t.cells} cells on an eight-hour night shift over ${t.nights} nights, or ${t.cells_clock} round the clock.`),
        h("li", {}, h("strong", {}, "Break-even: "), `each cell pays while its all-in cost stays below ${t.break_even} per operating hour.`),
        h("li", {}, h("strong", {}, "Labour avoided: "), `${t.hours_avoided} hours a year at ${t.labour_cost} an hour. The demo cell's own share: ${t.demo} a year (3,000 units on ${t.nights} nights).`)),
      h("p", { class: "kb-inputs" }, `Inputs: ${int(v.N)} units a year (Assumption) · ${int(v.r_m)} manual picks an hour (IML) · labour ${eur2(v.c)} an hour (EUROSTAT_LC) · the cell takes ${Math.round(v.s * 100)} % of units, ${Math.round(v.p * 100)} % of its grasps succeed, ${int(v.r_c)} grasp attempts an hour (Assumption)`)
    ].filter(Boolean));
  }

  /** "Your DC": the customer's yearly volume and labour cost, as inputs of the engine. */
  function yourDc(v, changed) {
    const fields = YOUR_DC.map((x) => {
      const input = h("input", {
        class: "vc-input kb-dc-input vc-tabular", type: "text", id: `kb-dc-${x.id}`, value: x.show(v[x.id]),
        inputmode: x.integer ? "numeric" : "decimal", autocomplete: "off", spellcheck: "false", "aria-label": `${x.label} (${x.unit})`
      });
      const msg = h("span", { class: "kb-dc-msg", role: "status" });
      const commit = (refocus) => {
        if (drawing) return;
        const r = commitInput({ id: x.id, value: parseInput(input.value, { integer: x.integer }), getOverrides, setOverrides, isRunning, via: "your_dc" });
        if (!r.ok) {
          msg.textContent = r.message;
          input.setAttribute("aria-invalid", "true");
          return;
        }
        input.removeAttribute("aria-invalid");
        msg.textContent = "";
        if (!r.changed) return;
        renderWorth(true);
        if (refocus) document.getElementById(`kb-dc-${x.id}`)?.focus();
      };
      input.addEventListener("change", () => commit(false));
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(true); } });
      return h("label", { class: "kb-dc-field", for: `kb-dc-${x.id}` },
        h("span", { class: "kb-dc-label" }, x.label),
        h("span", { class: "kb-dc-row" }, input, h("span", { class: "kb-dc-unit" }, x.unit)),
        msg);
    });
    const reset = h("button", { class: "vc-button vc-button--outline button-compact", type: "button", id: "kb-dc-reset", title: "Back to the reference site of the brief: 6,000,000 units a year at €35.80 an hour" }, "Reference site");
    reset.disabled = !changed;
    reset.addEventListener("click", () => {
      for (const x of YOUR_DC) commitInput({ id: x.id, value: defaults()[x.id], getOverrides, setOverrides, isRunning, via: "your_dc" });
      renderWorth(true);
      document.getElementById("kb-dc-N")?.focus();
    });
    return h("div", { class: "kb-dc", role: "group", "aria-label": "Your DC" },
      h("strong", { class: "kb-dc-title" }, "Your DC"),
      ...fields,
      reset);
  }

  // ---- plan and tonight -------------------------------------------------------------------------------
  function renderTable() {
    pending = 0;
    const v = getInputs();
    const rv = getRunInputs() || v;
    const p = enginePlan(v);
    const st = getNightState();
    const changed = PARAMETERS.filter((x) => v[x.id] !== defaults()[x.id]);
    // Tonight's units as the warehouse system knows them now: the store orders, plus an express order
    // once it has arrived (the plan column then prices the same units as the night).
    const units = st ? [...st.orders.values()].reduce((n, o) => n + o.units, 0) : 3000;
    const n = engineNight(v, units);
    const so = night && st ? tonightSoFar(st) : null;
    const fin = night?.final || null;
    const tonight = fin ? { ...fin, units_packed: fin.units_repacked, on_time: fin.orders_on_time } : so;
    // In plain words (D50); the seed that makes the night reproducible is in the head's tooltip.
    const tLabel = !night ? "Tonight (simulated night)" : `Tonight (simulated night${fin ? "" : ", so far"})`;
    const tTitle = night ? `Seed ${night.seed}: the same seed replays the same night.` : "";
    const dash = h("span", { class: "kb-none" }, "—");
    const tonightOr = (fn) => (tonight ? fn(tonight) : night ? dash.cloneNode(true) : h("span", { class: "kb-none" }, "after the night starts"));
    const calledIn = (t) => (t.called_in_hours > 0 ? `, ${hours(t.called_in_hours)} called in` : "");
    // Facts only: while the night runs, the trucks gone so far (on time of gone) and the orders still
    // open; the projection is the header tile's. At the night's end every truck is gone.
    const ordersOnTime = () => {
      if (!st || !night) return null;
      const states = visibleOrders(st).map(laneState);
      const late = states.filter((s) => s === "late").length;
      if (fin) return `${int(states.length - late)} of ${int(states.length)}`;
      const onTruck = states.filter((s) => s === "dispatched").length;
      const open = states.length - onTruck - late;
      return onTruck + late ? `${int(onTruck)} of ${int(onTruck + late)} so far · ${int(open)} still open` : `no truck yet · ${int(open)} still open`;
    };
    // The run's record keeps its own inputs: say so when the plan now follows other ones.
    const repriced = night && getRunInputs() && PARAMETERS.some((x) => x.id !== "N" && rv[x.id] !== v[x.id]);

    clear(tableEl);
    const plural = (k, word) => `${int(k)} ${word}${k === 1 ? "" : "s"}`;
    tableEl.append(...[
      h("div", { class: "kb-head" },
        h("h3", {}, "Plan and tonight"),
        h("p", {}, "Plan: the engine at your inputs (expected values). Tonight: the simulated night, which plays the same every time. The two are kept apart.")),
      changed.length ? h("p", { class: "kb-changed" }, `Changed inputs: ${changed.map((x) => `${x.label} ${fixed(v[x.id], x.id === "c" ? 2 : x.step < 1 ? 2 : 0)} (default ${fixed(x.value, x.id === "c" ? 2 : x.step < 1 ? 2 : 0)})`).join(", ")}`) : null,
      repriced ? h("p", { class: "kb-held" }, `Tonight keeps the inputs its run ran on (labour cost ${eur2(rv.c)} an hour); the plan follows your inputs now.`) : null,
      h("div", { class: "vc-table-wrap kb-wrap" }, h("table", { class: "vc-table vc-table--compact kb-table" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Figure"), h("th", { scope: "col" }, "Plan (engine)"), h("th", { scope: "col", ...(tTitle ? { title: tTitle } : {}) }, tLabel), h("th", { scope: "col" }, "Basis"))),
        h("tbody", {},
          row("Labour per 1,000 units, by hand", `${hours(p.per_thousand.manual_h)} · ${eur2(p.per_thousand.manual_eur)}`, dash.cloneNode(true), basis("IML", "EUROSTAT_LC")),
          row("Labour per 1,000 units, with the cell", `${hours(p.per_thousand.hybrid_h)} · ${eur2(p.per_thousand.hybrid_eur)}`,
            tonightOr((t) => (t.labour_hours_per_1000 === null ? "—" : `${hours(t.labour_hours_per_1000)} · ${eur2(tonightEuros(rv, t).per_thousand_eur)}${calledIn(t)}`)), basis("IML", "EUROSTAT_LC", "Assumption")),
          row("Robot picks per cell hour", int(p.per_cell_hour.robot_picks), tonightOr((t) => (t.robot_picks_per_cell_hour === null ? "—" : int(t.robot_picks_per_cell_hour))), basis("Assumption")),
          row(`Cell hours, ${int(units)} units tonight`, hours(n.cell_h), tonightOr((t) => hours(t.cell_hours)), basis("Assumption", "Synthetic")),
          row("Labour hours tonight", `${hours(n.hybrid_h)} with the cell · ${hours(n.manual_h)} by hand`, tonightOr((t) => `${hours(t.labour_hours)}${calledIn(t)}`), basis("IML", "Assumption", "Synthetic")),
          row("Store orders on time", dash.cloneNode(true), ordersOnTime() || tonightOr(() => "—"), basis("Synthetic")),
          row("Exceptions", dash.cloneNode(true), tonightOr((t) => `${plural(t.failures, "failed grasp")} · ${plural(t.escalations, "escalation")} · ${plural(t.corrections, "correction")}`), basis("Synthetic")),
          row("Break-even all-in cell cost", `${eur2(p.per_cell_hour.break_even_eur)} per operating hour`, dash.cloneNode(true), basis("IML", "EUROSTAT_LC", "Assumption"))
        ))),
      whatIf ? whatIfRow(whatIf) : null,
      h("p", { class: "kb-note" }, "No payback claim: robot capex or fees, supervision, maintenance, integration and change management are client-specific, so the board shows the break-even cost per operating hour instead. The simulated cell is not a safety system: a real cell needs conformity assessment and CE marking under the EU Machinery Regulation (EU) 2023/1230, which applies from 20 January 2027, and under Directive 2006/42/EC until then.")
    ].filter(Boolean));
  }

  /**
   * The agent's what-if (lilac: the AI), kept apart from the plan and tonight: in scenario 4 the cost of
   * gripper wear if it lasted all night, golden case G2. No option, draft or summary may quote it.
   */
  function whatIfRow(w) {
    return h("section", { class: "kb-whatif", "aria-label": "The agent's what-if" },
      h("div", { class: "kb-whatif-head" }, aiLabel("what-if"), h("strong", {}, "The agent's what-if"), h("span", { class: "kb-whatif-tag" }, "labelled what-if, not tonight's plan")),
      h("p", {}, `${w.label}: labour ${hours(w.per_1000.hybrid_hours)} · ${eur2(w.per_1000.hybrid_eur)} per 1,000 units with the cell, against ${hours(w.per_1000.by_hand_hours)} · ${eur2(w.per_1000.by_hand_eur)} by hand; ${int(w.per_cell_hour.robot_picks_per_cell_hour)} robot picks per cell hour; break-even ${eur2(w.per_cell_hour.break_even_eur_per_cell_hour)} per operating hour.`),
      h("p", { class: "kb-whatif-note" }, "The engine at the changed input, everything else as in the Plan column. It explains an exception; no option, draft or management summary quotes it."));
  }

  function row(label, planCell, tonightCell, basisCell) {
    return h("tr", {}, h("th", { scope: "row" }, label), h("td", { class: "kb-plan" }, planCell), h("td", { class: "kb-tonight" }, tonightCell), h("td", {}, basisCell));
  }

  const later = () => { if (!pending) pending = setTimeout(renderTable, 250); };
  bus.on("night_plan", (ev) => { night = { seed: ev.payload.seed, volume: ev.payload.volume, final: null }; render(); });
  for (const t of ["grasp_attempt", "manual_pick", "dispatch", "late_complete", "escalation", "world_model_correction", "order_new", "plan_update"]) bus.on(t, () => { if (night && !night.final) later(); });
  bus.on("night_end", (ev) => { if (night) night.final = ev.payload.figures; render(); });
  bus.on("run_end", () => render());
  bus.on("tool_result", (ev) => {
    const p = ev.payload;
    if (p.name !== "sim_kpis" || p.ok === false || p.result?.basis !== "what_if") return;
    const changes = String(p.result.what_if || "").split(",").map((x) => x.trim()).filter(Boolean);
    const words = changes.map((c) => { const [k, val] = c.split(/\s+/); const def = PARAMETERS.find((x) => x.id === k); return def ? `${def.label.charAt(0).toLowerCase()}${def.label.slice(1)} ${k === "p" || k === "s" ? `${upTo(Number(val) * 100, 1)} %` : val}` : c; });
    whatIf = { ...p.result, label: `At ${words.join(", ") || "changed inputs"}` };
    renderTable();
  });

  function reset() { night = null; whatIf = null; worthKey = null; render(); }
  render();
  return { render, reset, renderWorth };
}
