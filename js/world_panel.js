// The world-model panel (PLAN.md §g, "World-model panel"): a card on the cell board with the SKU in
// focus, expected against observed, and the corrections log (time, sensor, old, new). The focus is the
// latest scale reading; a correction stays in focus for two simulated minutes so the audience sees it.
// On a short board the card folds into a chip with the latest correction. Both open the item's popover
// (js/popovers.js worldPopover). Every value comes from js/cell_data.js, which mirrors the night's
// world model (js/world_model.js).

import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { clockOf } from "./nightsim.js";
import { int } from "./format.js";

/** onOpen(sku | null, anchorButton): open the item's popover, or the model's overview for null. */
export function createWorldPanel({ onOpen = () => {} } = {}) {
  const focus = h("button", { class: "wm-focus", type: "button" });
  const log = h("ol", { class: "wm-log", "aria-label": "Corrections log" });
  const chip = h("button", { class: "wm-chip", type: "button" });
  const card = h("section", { class: "world-card", "aria-label": "World model: expected against observed, and the corrections log" },
    h("div", { class: "wm-head" }, h("strong", {}, "World model"), h("span", { class: "chip", dataset: { tone: "synthetic" } }, "Synthetic")),
    focus, log);
  // What each button shows: a click opens that, even when the night has moved on since the last frame.
  let shown = { focus: null, chip: null, ready: false };
  focus.addEventListener("click", () => { if (shown.ready) onOpen(shown.focus, focus); });
  chip.addEventListener("click", () => { if (shown.ready) onOpen(shown.chip, chip); });

  function render(st) {
    shown = { focus: st.focus?.sku || null, chip: st.corrections.at(-1)?.sku || st.focus?.sku || null, ready: true };
    const f = st.focus;
    const w = f ? st.world.item(f.sku) : null;
    clear(focus);
    if (f && w) {
      const corrected = f.kind === "correction";
      const fix = w.corrected_at !== null;
      focus.append(
        h("span", { class: "wm-sku" }, h("span", { class: "wm-label" }, corrected ? "Corrected" : "Last reading"), `${f.sku} ${w.name}`),
        h("span", { class: "wm-vals" },
          h("span", { class: "wm-exp" }, `expected ${int(f.expected_g)} g`),
          h("span", { class: "wm-obs", dataset: { differs: f.observed_g !== f.expected_g ? "true" : "false" } }, `observed ${int(f.observed_g)} g`),
          fix ? h("span", { class: "wm-fix" }, icon("check", 14), `written back ${clockOf(w.corrected_at)}`) : null));
      focus.setAttribute("aria-label", `World model, ${corrected ? "corrected" : "last reading"}: ${f.sku} ${w.name}, expected ${f.expected_g} g, observed ${f.observed_g} g${fix ? `, written back for the whole SKU at ${clockOf(w.corrected_at)}` : ""}`);
      focus.dataset.corrected = corrected ? "true" : "false";
    } else {
      focus.append(h("span", { class: "wm-sku" }, "Every reading is checked against the item master"));
      focus.setAttribute("aria-label", "World model: no reading yet");
      focus.dataset.corrected = "false";
    }
    clear(log);
    if (st.corrections.length) {
      for (const c of st.corrections.slice(-3)) {
        log.append(h("li", {}, h("span", { class: "wm-time" }, clockOf(c.at)), " ", `${c.sensor}: ${c.sku} weight ${int(c.old)} g → ${int(c.new)} g, for the whole SKU`));
      }
    } else {
      log.append(h("li", { class: "wm-none" }, "Corrections log: none yet"));
    }
    const last = st.corrections.at(-1);
    clear(chip);
    chip.append(h("strong", {}, "World model"),
      h("span", { class: "wm-chip-text" }, last ? `${last.sku} ${int(last.old)} g → ${int(last.new)} g, ${clockOf(last.at)}` : "no corrections yet"),
      h("span", { class: "chip", dataset: { tone: "synthetic" } }, "Synthetic"));
    chip.setAttribute("aria-label", `World model: ${last ? `${last.sku} written back from ${last.old} g to ${last.new} g at ${clockOf(last.at)}` : "no corrections yet"}`);
  }

  return { card, chip, focus, render };
}
