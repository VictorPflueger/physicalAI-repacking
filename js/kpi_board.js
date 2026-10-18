// The KPI board (drawer tab; PLAN.md §c.5 and §g): the engine's plan beside tonight's simulated
// result, in labelled columns, each figure with its basis (a source key from DATA_SOURCES.md or the
// label Assumption), then the annual figure with the cells it needs and the break-even. The figure is
// "illustrative, per reference site, gross, before cell costs"; there is no payback claim.

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { plan as enginePlan, night as engineNight, defaults, PARAMETERS, tonightEuros } from "./engine.js";
import { tonightSoFar, visibleOrders, laneState } from "./cell_data.js";
import { eur2, eur0, hours, int, upTo, fixed } from "./format.js";
import { aiLabel } from "./ai_label.js";

const basis = (...keys) => h("span", { class: "kb-basis" }, keys.map((k) => h("span", { class: "kb-key", dataset: { kind: k === "Assumption" || k === "Synthetic" ? k.toLowerCase() : "source" } }, k)));

export function createKpiBoard(panel, { getInputs, getNightState = () => null } = {}) {
  const root = h("div", { class: "kpiboard" });
  panel.append(root);
  let night = null;      // { seed, volume, final: figures | null }
  let pending = 0;
  let whatIf = null;     // the agent's latest labelled what-if (sim_kpis with what_if), for this run

  function render() {
    pending = 0;
    const v = getInputs();
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
    const tLabel = !night ? "Tonight (simulation)" : `Tonight (simulation, seed ${night.seed}${fin ? "" : ", so far"})`;
    const dash = h("span", { class: "kb-none" }, "—");
    const tonightOr = (fn) => (tonight ? fn(tonight) : night ? dash.cloneNode(true) : h("span", { class: "kb-none" }, "after the night starts"));
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

    clear(root);
    const plural = (k, word) => `${int(k)} ${word}${k === 1 ? "" : "s"}`;
    root.append(...[
      h("div", { class: "kb-head" },
        h("h3", {}, "Plan and tonight"),
        h("p", {}, "Plan: the engine at your assumptions (expected values). Tonight: the night simulation, seeded and reproducible. The two are kept apart.")),
      changed.length ? h("p", { class: "kb-changed" }, `Changed inputs: ${changed.map((x) => `${x.id} ${fixed(v[x.id], x.id === "c" ? 2 : x.step < 1 ? 2 : 0)} (default ${fixed(x.value, x.id === "c" ? 2 : x.step < 1 ? 2 : 0)})`).join(", ")}`) : null,
      h("table", { class: "kb-table" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Figure"), h("th", { scope: "col" }, "Plan (engine)"), h("th", { scope: "col" }, tLabel), h("th", { scope: "col" }, "Basis"))),
        h("tbody", {},
          row("Labour per 1,000 units, by hand", `${hours(p.per_thousand.manual_h)} · ${eur2(p.per_thousand.manual_eur)}`, dash.cloneNode(true), basis("IML", "EUROSTAT_LC")),
          row("Labour per 1,000 units, hybrid", `${hours(p.per_thousand.hybrid_h)} · ${eur2(p.per_thousand.hybrid_eur)}`,
            tonightOr((t) => (t.labour_hours_per_1000 === null ? "—" : `${hours(t.labour_hours_per_1000)} · ${eur2(tonightEuros(v, t).per_thousand_eur)}`)), basis("IML", "EUROSTAT_LC", "Assumption")),
          row("Robot picks per cell hour", int(p.per_cell_hour.robot_picks), tonightOr((t) => (t.robot_picks_per_cell_hour === null ? "—" : int(t.robot_picks_per_cell_hour))), basis("Assumption")),
          row(`Cell hours, ${int(units)} units tonight`, hours(n.cell_h), tonightOr((t) => hours(t.cell_hours)), basis("Assumption", "Synthetic")),
          row("Labour hours tonight", `${hours(n.hybrid_h)} hybrid · ${hours(n.manual_h)} by hand`, tonightOr((t) => hours(t.labour_hours)), basis("IML", "Assumption", "Synthetic")),
          row("Store orders on time", dash.cloneNode(true), ordersOnTime() || tonightOr(() => "—"), basis("Synthetic")),
          row("Exceptions", dash.cloneNode(true), tonightOr((t) => `${plural(t.failures, "failed grasp")} · ${plural(t.escalations, "escalation")} · ${plural(t.corrections, "correction")}`), basis("Synthetic")),
          row("Break-even all-in cell cost", `${eur2(p.per_cell_hour.break_even_eur)} per operating hour`, dash.cloneNode(true), basis("IML", "EUROSTAT_LC", "Assumption"))
        )),
      whatIf ? whatIfRow(whatIf) : null,
      h("section", { class: "kb-annual", "aria-label": "Annual figure" },
        h("div", { class: "kb-annual-main" },
          h("span", { class: "kb-big" }, `${eur0(p.per_year.eur_avoided)} a year`),
          h("span", { class: "kb-qual" }, "illustrative, per reference site, gross, before cell costs")),
        h("ul", {},
          h("li", {}, `Needs ${int(p.per_year.cell_hours)} cell hours: ${upTo(p.per_year.cells_night_shift, 1)} cells on an eight-hour night shift over ${int(v.nights)} nights, or ${upTo(p.per_year.cells_round_clock, 1)} cells round the clock.`),
          h("li", {}, `Each cell pays while its all-in cost stays below ${eur2(p.per_cell_hour.break_even_eur)} per operating hour (break-even).`),
          h("li", {}, `Labour avoided: ${fixed(p.per_year.hours_avoided, p.per_year.hours_avoided % 1 ? 1 : 0)} hours a year at ${eur2(v.c)} an hour.`),
          h("li", {}, `The demo cell's own share: ${eur0(p.demo_cell.eur_avoided)} a year (3,000 units on ${int(v.nights)} nights).`)),
        h("p", { class: "kb-inputs" }, `N ${int(v.N)} units a year (Assumption) · r_m ${int(v.r_m)} picks an hour (IML) · c ${eur2(v.c)} an hour (EUROSTAT_LC) · s ${fixed(v.s, 2)}, p ${fixed(v.p, 2)}, r_c ${int(v.r_c)} (Assumption)`)),
      h("p", { class: "kb-note" }, "No payback claim: robot capex or fees, supervision, maintenance, integration and change management are client-specific, so the board shows the break-even cost per operating hour instead. The simulated cell is not a safety system: a real cell needs conformity assessment and CE marking under the EU Machinery Regulation (EU) 2023/1230, which applies from 20 January 2027, and under Directive 2006/42/EC until then.")
    ].filter(Boolean));
  }

  /**
   * The agent's what-if (violet: the AI), kept apart from the plan and tonight: in scenario 4 the cost of
   * gripper wear if it lasted all night, golden case G2. No option, draft or summary may quote it.
   */
  function whatIfRow(w) {
    return h("section", { class: "kb-whatif", "aria-label": "The agent's what-if" },
      h("div", { class: "kb-whatif-head" }, aiLabel("what-if"), h("strong", {}, "The agent's what-if"), h("span", { class: "kb-whatif-tag" }, "labelled what-if, not tonight's plan")),
      h("p", {}, `${w.label}: labour ${hours(w.per_1000.hybrid_hours)} · ${eur2(w.per_1000.hybrid_eur)} per 1,000 units hybrid, against ${hours(w.per_1000.by_hand_hours)} · ${eur2(w.per_1000.by_hand_eur)} by hand; ${int(w.per_cell_hour.robot_picks_per_cell_hour)} robot picks per cell hour; break-even ${eur2(w.per_cell_hour.break_even_eur_per_cell_hour)} per operating hour.`),
      h("p", { class: "kb-whatif-note" }, "The engine at the changed input, everything else as in the Plan column. It explains an exception; no option, draft or management summary quotes it."));
  }

  function row(label, planCell, tonightCell, basisCell) {
    return h("tr", {}, h("th", { scope: "row" }, label), h("td", { class: "kb-plan" }, planCell), h("td", { class: "kb-tonight" }, tonightCell), h("td", {}, basisCell));
  }

  const later = () => { if (!pending) pending = setTimeout(render, 250); };
  bus.on("night_plan", (ev) => { night = { seed: ev.payload.seed, volume: ev.payload.volume, final: null }; render(); });
  for (const t of ["grasp_attempt", "manual_pick", "dispatch", "late_complete", "escalation", "world_model_correction", "order_new", "plan_update"]) bus.on(t, () => { if (night && !night.final) later(); });
  bus.on("night_end", (ev) => { if (night) night.final = ev.payload.figures; render(); });
  bus.on("tool_result", (ev) => {
    const p = ev.payload;
    if (p.name !== "sim_kpis" || p.ok === false || p.result?.basis !== "what_if") return;
    const changes = String(p.result.what_if || "").split(",").map((x) => x.trim()).filter(Boolean);
    const words = changes.map((c) => { const [k, val] = c.split(/\s+/); const def = PARAMETERS.find((x) => x.id === k); return def ? `${def.label.charAt(0).toLowerCase()}${def.label.slice(1)} ${k === "p" || k === "s" ? `${upTo(Number(val) * 100, 1)} %` : val}` : c; });
    whatIf = { ...p.result, label: `At ${words.join(", ") || "changed inputs"}` };
    render();
  });

  function reset() { night = null; whatIf = null; render(); }
  render();
  return { render, reset };
}
