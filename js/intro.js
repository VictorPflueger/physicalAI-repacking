// Intro window: what Repack Pilot does, how it works, why it pays off and what is real, readable in
// about a minute (at most 238 words). It is the opener of the five-minute customer call (DEMO_SCRIPT.md,
// TECH_NOTES D50): one sentence on what it does, the five steps of the progress rail in plain words, and what it is
// worth, with the engine's figures at the presenter's inputs (js/worth.js). It opens by itself on a
// visitor's first visit (remembered in this browser's local storage) and any time from the "How it
// works" button in the header.

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { STORAGE } from "./config.js";
import { STEPS as RAIL } from "./progress.js";
import { worth } from "./worth.js";

// The five steps are the same as the progress rail above the console. Their numbers use the
// colours the app uses for the same moments: blue for readings and checks, ink for the agent's
// planning, green for picks that land, amber for a night at risk, burgundy for your decision.
const TEXT = {
  perceive: "Camera and scale check each item; a reading that differs corrects the world model.",
  plan: "The agent orders the work so every store makes its truck.",
  pick: "The robot rehearses each grasp, then picks. What it cannot grip safely goes to a person.",
  replan: "When the night changes, the agent prices three options against doing nothing; you decide.",
  prepare: "It drafts messages and the night's summary; nothing is sent without your approval."
};
const STEPS = RAIL.map((s) => ({ tone: s.id, title: s.label, text: TEXT[s.id] }));

/** Why it pays off: three figures from the engine at the current inputs, each with what it means. */
function valueItems(v) {
  const t = worth(v).text;
  return [
    { label: "Labour per 1,000 units", figure: t.hybrid, text: `with the cell, instead of ${t.manual} by hand: ${t.saving}.` },
    { label: `A DC repacking ${t.units} units a year`, figure: `${t.year} a year`, text: `with ${t.cells} cells on the night shift. Illustrative, gross, before cell costs.` },
    { label: "Break-even per cell", figure: `${t.break_even} an hour`, text: "Each cell pays while its all-in cost per operating hour stays below this; no payback claim." }
  ];
}

const REAL = [
  { tone: "simulated", title: "Simulated, labelled so", text: "The robot cell and its sensors, the warehouse system, the retailer Ruhrkorb with its stores and orders (Synthetic)." },
  { tone: "real", title: "Real", text: "Live mode's agent (Claude on your key), the engine's arithmetic and its sourced inputs, such as Eurostat's labour cost." }
];

/** True once this browser has seen the intro (closed it at least once). */
export function introSeen() {
  try { return localStorage.getItem(STORAGE.introSeen) === "1"; } catch { return false; }
}

function markIntroSeen() {
  try { localStorage.setItem(STORAGE.introSeen, "1"); } catch { /* storage blocked: it opens again next time */ }
}

/**
 * Opens the intro window. `getInputs()` gives the engine's inputs for the figures (the presenter's
 * assumptions). With `onStart`, its main button starts the usual run flow (mode choice first) under
 * `startLabel`; without it (a run is in progress) there is only Close. Resolves "start" or null.
 */
export function openIntro({ startLabel = "Start agent", onStart = null, getInputs } = {}) {
  return new Promise((resolve) => {
    let modal;
    const steps = h("ol", { class: "intro-steps" }, STEPS.map((s, i) =>
      h("li", { class: "intro-step", dataset: { tone: s.tone } },
        h("span", { class: "intro-num", "aria-hidden": "true" }, String(i + 1)),
        h("strong", { class: "intro-step-title" }, s.title),
        h("span", { class: "intro-step-text" }, s.text))));
    const value = h("ul", { class: "intro-value" }, valueItems(getInputs()).map((x) =>
      h("li", {},
        h("span", { class: "intro-value-label" }, x.label),
        h("strong", { class: "intro-value-figure num" }, x.figure),
        h("span", { class: "intro-value-text" }, x.text))));
    const real = h("div", { class: "intro-real", role: "group", "aria-label": "What is real" }, REAL.map((r) =>
      h("div", { class: "intro-real-item", dataset: { tone: r.tone } },
        h("strong", {}, r.title), h("span", {}, r.text))));

    const footer = onStart
      ? [
        h("span", { class: "left" }),
        h("button", { class: "btn btn-ghost", type: "button", on: { click: () => modal.close(null) } }, "Close"),
        h("button", { class: "btn btn-primary", type: "button", autofocus: true, on: { click: () => modal.close("start") } }, icon("play", 18), startLabel)
      ]
      : [h("button", { class: "btn btn-primary", type: "button", autofocus: true, on: { click: () => modal.close(null) } }, "Close")];

    modal = openModal({
      title: "How Repack Pilot works",
      intro: "A robot cell and an AI agent run a retail distribution centre's night shift: the robot repacks most of each mixed pallet into 12 store orders, people do the rest, and the agent keeps every store on its truck. You decide.",
      className: "intro-modal",
      body: [
        h("h3", {}, "How it works"),
        steps,
        h("h3", {}, "Why it pays off"),
        value,
        h("h3", {}, "What is real"),
        real
      ],
      footer,
      onClose: (result) => {
        markIntroSeen();
        resolve(result || null);
        if (result === "start") onStart?.();
      }
    });
  });
}
