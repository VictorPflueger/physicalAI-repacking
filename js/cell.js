// The cell board's panel. This build shows the night it will draw, from the synthetic world: the
// stores and their truck cut-offs, tonight's units, the inbound waves and the stations. The board
// itself (pallet, camera and scale readings, grasp rehearsals and attempts, the manual station and
// the twelve store totes) arrives with the night simulation in M2. The neutral "Simulated cell" tag
// stays on the panel in both modes (build brief, "Honesty rules").

import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { getModel, nightMinutes } from "./world.js";
import { int } from "./format.js";

const FLOW = [
  ["pallet", "Inbound pallet"], ["camera", "Camera"], ["gripper", "Gripper"],
  ["scale", "Scale"], ["tote", "Store totes"], ["truck", "Trucks"]
];

export function createCellBoard(root, { scenarios = [] } = {}) {
  const model = getModel();
  const world = model.world;
  const subtitle = h("span", { class: "cell-sub" });
  const caption = h("div", { class: "cell-caption" },
    h("span", { class: "cell-title" }, world.meta.dc.name),
    subtitle);
  const tag = h("span", {
    class: "sim-cell-tag", role: "note",
    title: "The robot cell, its camera, scale and gripper, and the warehouse system are simulated, in Live and in Simulation mode."
  }, icon("gripper", 16), "Simulated cell");

  const t1 = model.totals("n1");
  const cutoffs = world.stores.map((s) => nightMinutes(s.cutoff));
  const first = world.stores[cutoffs.indexOf(Math.min(...cutoffs))];
  const last = world.stores[cutoffs.indexOf(Math.max(...cutoffs))];
  const waves = world.waves.map((w) => `${w.label.toLowerCase()} at ${w.arrives}`).join(", ");

  const flow = h("ol", { class: "cell-flow", "aria-label": "What the cell board will show" }, FLOW.map(([name, label]) =>
    h("li", {}, h("span", { class: "cell-flow-icon" }, icon(name, 26)), h("span", {}, label))));
  const facts = h("dl", { class: "cell-facts" },
    h("dt", {}, "Stores"), h("dd", {}, `${world.stores.length}, truck cut-offs ${first.cutoff} (${first.name}) to ${last.cutoff} (${last.name})`),
    h("dt", {}, "Tonight"), h("dd", {}, `${int(t1.units)} units of ${world.items.length} SKUs; ${int(t1.cellUnits)} of them the cell may handle`),
    h("dt", {}, "Inbound"), h("dd", {}, waves.charAt(0).toUpperCase() + waves.slice(1)),
    h("dt", {}, "Stations"), h("dd", {}, `One robot cell; ${world.manual_station.pickers === 1 ? "one picker" : `${world.manual_station.pickers} pickers`} at the manual station`));

  // On a short panel (the drawer open) the card folds to this line, so the night stays readable and
  // its Synthetic label stays in view (css/cell.css, container queries on the panel's height).
  const summary = h("p", { class: "cell-summary" },
    h("span", { class: "chip", dataset: { tone: "synthetic" } }, "Synthetic"),
    h("span", {}, `${world.stores.length} stores, truck cut-offs ${first.cutoff} to ${last.cutoff} · ${int(t1.units)} units tonight · ${waves}`));

  const card = h("section", { class: "cell-empty", "aria-labelledby": "cell-empty-title" },
    flow,
    h("h2", { id: "cell-empty-title" }, "Tonight at ", world.meta.dc.name),
    h("p", { class: "cell-intro" }, "The cell board will draw the inbound pallet, each camera and scale reading, every grasp rehearsal and attempt, the manual station and the twelve store totes with their truck cut-offs. It arrives with the night simulation (M2)."),
    facts,
    h("p", { class: "cell-synthetic" }, h("span", { class: "chip", dataset: { tone: "synthetic" } }, "Synthetic"), world.meta.retailer_note),
    summary);

  const board = h("div", { class: "cell-board", dataset: { state: "idle" } },
    h("div", { class: "cell-head" }, caption, tag),
    h("div", { class: "cell-body" }, card));
  clear(root).appendChild(board);

  function focusScenario(id) {
    const s = scenarios.find((x) => x.id === id);
    subtitle.textContent = `Night shift ${world.meta.shift.start}–${world.meta.shift.end}${s ? ` · Scenario ${s.number}: ${s.short}` : ""}`;
  }

  return { focusScenario, reset: () => {}, invalidate: () => {} };
}
