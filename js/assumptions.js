// The Assumptions tab (drawer; PLAN.md §g): every input of the engine with its value, unit and basis
// (a source key from DATA_SOURCES.md or the label Assumption), editable, with a reset to the brief's
// defaults. Every change lands in the audit (event "assumption_change"). Below them, read-only, the
// night's own parameters from the synthetic world, and the scenario's settings: what the scenario
// makes happen, which the warehouse system, the cell and the agent learn only when it happens.
//
// The engine's plan uses a change at once. The night simulation reads r_m, r_c, p and the call-in
// minimum when a night starts, so a change during a night applies to the next one.

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { PARAMETERS, defaults, NIGHT_INPUTS } from "./engine.js";
import { fixed, int } from "./format.js";
import { WEIGHT_TOLERANCE } from "./nightsim.js";

export { NIGHT_INPUTS };

export function createAssumptions(panel, { getOverrides, setOverrides, getNightInfo = () => null, getScenario = () => null, isRunning = () => false } = {}) {
  const root = h("div", { class: "assumptions" });
  panel.append(root);

  function decimals(p) { return p.step < 0.01 ? 3 : p.step < 1 ? 2 : p.step < 10 && p.value % 1 ? 1 : 0; }

  function render() {
    const over = getOverrides();
    const values = { ...defaults(), ...over };
    clear(root);
    const resetBtn = h("button", { class: "btn", type: "button", id: "btn-reset-assumptions" }, "Reset to defaults");
    resetBtn.disabled = Object.keys(over).length === 0;
    resetBtn.addEventListener("click", () => {
      const changed = Object.keys(over);
      setOverrides({});
      for (const id of changed) bus.emit("assumption_change", { id, from: over[id], to: defaults()[id], by: "user", reset: true });
      render();
    });
    root.append(
      h("div", { class: "as-head" },
        h("div", {}, h("h3", {}, "Assumptions"),
          h("p", {}, "Every input of the engine, with its source key or the label Assumption. Change one and the plan follows at once; the night simulation takes r_m, r_c, p and the call-in minimum from the next night on. Every change is in the audit.")),
        resetBtn),
      h("table", { class: "as-table" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Input"), h("th", { scope: "col" }, "Value"), h("th", { scope: "col" }, "Unit"), h("th", { scope: "col" }, "Basis"))),
        h("tbody", {}, PARAMETERS.map((p) => {
          const input = h("input", {
            class: "input as-input", type: "number", id: `as-${p.id}`, step: String(p.step), min: String(p.min), max: String(p.max),
            value: String(values[p.id]), "aria-label": `${p.label} (${p.unit})`, inputmode: "decimal"
          });
          const msg = h("span", { class: "as-msg", role: "status" });
          const commit = () => {
            const raw = input.value.trim();
            const n = Number(raw);
            if (raw === "" || !Number.isFinite(n) || n < p.min || n > p.max) {
              msg.textContent = `Between ${fixed(p.min, decimals(p))} and ${fixed(p.max, decimals(p))}.`;
              input.setAttribute("aria-invalid", "true");
              return;
            }
            input.removeAttribute("aria-invalid");
            msg.textContent = "";
            const cur = { ...getOverrides() };
            const from = cur[p.id] ?? p.value;
            if (n === from) return;
            if (n === p.value) delete cur[p.id]; else cur[p.id] = n;
            setOverrides(cur);
            bus.emit("assumption_change", { id: p.id, label: p.label, from, to: n, by: "user", applies: NIGHT_INPUTS.includes(p.id) && isRunning() ? "plan now, night from the next one" : "now" });
            render();
            document.getElementById(`as-${p.id}`)?.focus();
          };
          input.addEventListener("change", commit);
          input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
          const changed = over[p.id] !== undefined;
          return h("tr", { dataset: { changed: changed ? "true" : "false", param: p.id } },
            h("th", { scope: "row" }, h("span", { class: "as-label" }, p.label), h("span", { class: "as-id" }, p.id), changed ? h("span", { class: "chip", dataset: { tone: "person" } }, "changed") : null),
            h("td", {}, input, msg),
            h("td", { class: "as-unit" }, p.unit),
            h("td", {}, h("span", { class: "kb-key", dataset: { kind: p.basis === "Assumption" ? "assumption" : p.basis === "Brief" ? "brief" : "source" } }, p.basis), h("span", { class: "as-note" }, p.note)));
        }))),
      nightParameters());
  }

  /** The night's own parameters and the scenario's settings (read-only). */
  function nightParameters() {
    const info = getNightInfo();
    const world = globalThis.WORLD;
    const storeName = (id) => world?.stores?.find((x) => x.id === id)?.name || id;
    const rows = [
      ["Tote limit", `${int(world?.tote?.limit_g ?? 15000)} g, heavy items first`, "Assumption"],
      ["Scale tolerance before a write-back", `${int(WEIGHT_TOLERANCE * 100)} % from the world model`, "Assumption"],
      ["Inbound waves", (world?.waves || []).map((w) => `${w.label.toLowerCase()} at ${w.arrives}`).join("; "), "Assumption"],
      ["Units planned at 22:00", info ? `${int(info.totals.units)} for ${int(info.orders.length)} store orders (${int(info.totals.cell_units)} the cell may handle)` : "3,000 (N1) or 4,200 (N2)", "Synthetic"],
      ["Escalation rules", "E1 unknown barcode; E2 fragile with grasp confidence below 0.80; E3 last 100 grasps below 75 %; E4 projected within 15 minutes of a cut-off", "Assumption"]
    ];
    const sc = getScenario();
    const n = sc?.night || {};
    const settings = [
      n.express ? ["Express order", `${int(n.express.units)} units for ${storeName(n.express.store)} at ${n.express.at}, due on the ${n.express.due} truck`, "Assumption"] : null,
      n.unsafe?.length ? ["Units unsafe to grip", n.unsafe.map((x) => `${x.reason.toLowerCase()} (grasp confidence ${fixed(x.grasp_confidence, 2)})`).join("; "), "Synthetic"] : null,
      n.unknown ? ["Unknown item", `barcode ${n.unknown.barcode}, ${int(n.unknown.units)} units at ${n.unknown.at}`, "Synthetic"] : null,
      n.wear ? ["Gripper wear", `success falls to ${fixed(n.wear.success * 100, 0)} % from ${n.wear.from}`, "Assumption"] : null,
      ...Object.entries(n.cutoffs || {}).map(([id, time]) => ["Earlier cut-off", `${storeName(id)} at ${time}`, "Assumption"]),
      sc ? ["Seed", `${n.seed}: the same seed replays the same night`, "Synthetic"] : null
    ].filter(Boolean);
    const list = (items) => h("dl", {}, items.flatMap(([k, val, b]) => [h("dt", {}, k), h("dd", {}, val, " ", h("span", { class: "kb-key", dataset: { kind: b.toLowerCase() } }, b))]));
    return h("section", { class: "as-night" },
      h("h4", {}, "The night's parameters"),
      list(rows),
      sc ? h("h4", {}, `Scenario ${sc.number}: what it makes happen`) : null,
      sc ? h("p", { class: "as-scenario-note" }, "The warehouse system, the cell and the agent learn of these only when they happen.") : null,
      sc ? list(settings.length ? settings : [["Events", "none beyond the night itself", "Synthetic"]]) : null);
  }

  render();
  return { render };
}
