// The world-model panel (PLAN.md §g, "World-model panel"): a card on the cell board with the item in
// focus, expected against observed, and the corrections log (time, sensor, item, old, new). The focus is
// the latest scale reading; a correction stays in focus for two simulated minutes so the audience sees it.
// On a short board the card folds into a chip with the latest correction. Both open the item's popover
// (js/popovers.js worldPopover). Every value comes from js/cell_data.js, which mirrors the night's
// world model (js/world_model.js). Items go by their names, as in the console; SKU ids stay in the
// popover and the audit (TECH_NOTES D55).

import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { clockOf } from "./nightsim.js";
import { int } from "./format.js";

/** The item's name without its pack: "Apricot jam 200 g, glass jar" → "Apricot jam" (the chip has little room). */
const bare = (name) => String(name).split(",")[0].replace(/\s+\d[\d.,]*(?:\s*×\s*\d[\d.,]*)?\s*(?:g|kg|ml|l)$/, "");

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
        h("span", { class: "wm-sku" }, h("span", { class: "wm-label" }, corrected ? "Corrected" : "Last reading"), w.name),
        h("span", { class: "wm-vals" },
          h("span", { class: "wm-exp" }, `expected ${int(f.expected_g)} g`),
          h("span", { class: "wm-obs", dataset: { differs: f.observed_g !== f.expected_g ? "true" : "false" } }, `observed ${int(f.observed_g)} g`),
          fix ? h("span", { class: "wm-fix" }, icon("check", 14), `written back ${clockOf(w.corrected_at)}`) : null));
      focus.setAttribute("aria-label", `World model, ${corrected ? "corrected" : "last reading"}: ${w.name}, expected ${f.expected_g} g, observed ${f.observed_g} g${fix ? `, written back for every unit of this item at ${clockOf(w.corrected_at)}` : ""}`);
      focus.dataset.corrected = corrected ? "true" : "false";
    } else {
      focus.append(h("span", { class: "wm-sku" }, "Every reading is checked against the item master"));
      focus.setAttribute("aria-label", "World model: no reading yet");
      focus.dataset.corrected = "false";
    }
    clear(log);
    if (st.corrections.length) {
      for (const c of st.corrections.slice(-3)) {
        log.append(h("li", {}, h("span", { class: "wm-time" }, clockOf(c.at)), " ", `${c.sensor}: ${st.world.name(c.sku) || c.sku}, weight ${int(c.old)} g → ${int(c.new)} g, for every unit of this item`));
      }
    } else {
      log.append(h("li", { class: "wm-none" }, "Corrections log: none yet"));
    }
    const last = st.corrections.at(-1);
    clear(chip);
    const lastName = last ? st.world.name(last.sku) || last.sku : "";
    // The item's name gives way before its weights, so the news stays readable on a narrow head row.
    chip.append(h("strong", {}, "World model"),
      h("span", { class: "wm-chip-text" },
        h("span", { class: "wm-chip-name" }, last ? bare(lastName) : "no corrections yet"),
        last ? h("span", { class: "wm-chip-vals" }, `${int(last.old)} g → ${int(last.new)} g`) : null),
      h("span", { class: "chip", dataset: { tone: "synthetic" } }, "Synthetic"));
    chip.setAttribute("aria-label", `World model: ${last ? `${lastName} written back from ${last.old} g to ${last.new} g at ${clockOf(last.at)}` : "no corrections yet"}`);
  }

  return { card, chip, focus, render };
}
