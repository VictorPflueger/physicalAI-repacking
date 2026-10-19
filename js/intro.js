// Intro window: what Repack Pilot does, how its world model works, why it pays off and what is real,
// readable in about a minute (at most 238 words). It is the opener of the five-minute customer call
// (DEMO_SCRIPT.md, TECH_NOTES D50 and D65): one paragraph on what it does, the world model in four steps
// (what it knows, how camera and scale check it, how it learns, what it hands to a person), and what it
// is worth, with the engine's figures at the presenter's inputs (js/worth.js). It opens by itself on a
// visitor's first visit (remembered in this browser's local storage) and any time from the "How it
// works" button in the header.

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { STORAGE } from "./config.js";
import { worth } from "./worth.js";

// The world model at work, in the colours the Customer view uses for the same things: ink for what the
// model holds, blue for the camera's and the scale's checks, slate for the model taking a correction,
// burgundy for a person.
const STEPS = [
  { tone: "know", title: "Knows", text: "Every item on the pallet: weight, size, fragility and how to grip it." },
  { tone: "check", title: "Checks", text: "Camera and scale compare each item with the model; the robot rehearses every grasp against it first." },
  { tone: "learn", title: "Learns", text: "A reading that differs is written back for every unit of that item." },
  { tone: "ask", title: "Asks", text: "What the model does not know, or the robot cannot grip safely, goes to a person. You decide." }
];

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
      intro: "A robot cell repacks mixed pallets into store orders at night. What makes it work is its world model: what the robot knows about every item it lifts. An AI agent plans the night with it, and people do the rest.",
      className: "intro-modal",
      body: [
        h("h3", {}, "The world model at work"),
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
