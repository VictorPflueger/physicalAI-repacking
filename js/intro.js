// Intro window: what Repack Pilot does, how it works, why it pays off and what is real, readable in
// about a minute. It opens by itself on a visitor's first visit (remembered in this browser's local
// storage) and any time from the "How it works" button in the header.

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { STORAGE } from "./config.js";
import { STEPS as RAIL } from "./progress.js";

// The five steps are the same as the progress rail above the console. Their numbers use the
// colours the app uses for the same moments: blue for readings and checks, ink for the agent's
// planning, green for picks that land, amber for a night at risk, burgundy for your decision.
const TEXT = {
  perceive: "The camera identifies each item; the world model loads its weight, shape and fragility.",
  plan: "The agent splits the units across 12 store orders and sequences them against truck cut-offs.",
  pick: "The cell rehearses each grasp before it acts. A reading that differs is written back.",
  replan: "When the night changes, the agent prices three options next to doing nothing. You decide.",
  prepare: "It drafts messages for your approval and closes the night with a summary. Nothing is sent."
};
const STEPS = RAIL.map((s) => ({ tone: s.id, title: s.label, text: TEXT[s.id] }));

const VALUE = [
  { title: "Labour per 1,000 units", text: "The engine sets the manual baseline against the hybrid cell, from sourced inputs." },
  { title: "Physical AI you can watch", text: "Readings, grasp rehearsal, corrections, replanning and handovers to a person." },
  { title: "People stay in charge", text: "The agent proposes, a person decides. Escalations are enforced in code; every step is logged." }
];

const REAL = [
  { tone: "simulated", title: "Simulated, and labelled so", text: "The robot cell with its camera, scale and gripper; the warehouse system; the retailer Ruhrkorb, its stores and orders (Synthetic)." },
  { tone: "real", title: "Real", text: "The agent in Live mode (Claude on your key), the engine's arithmetic, sourced inputs such as Eurostat's labour cost, the optional Open Food Facts lookup." }
];

/** True once this browser has seen the intro (closed it at least once). */
export function introSeen() {
  try { return localStorage.getItem(STORAGE.introSeen) === "1"; } catch { return false; }
}

function markIntroSeen() {
  try { localStorage.setItem(STORAGE.introSeen, "1"); } catch { /* storage blocked: it opens again next time */ }
}

/**
 * Opens the intro window. With `onStart`, its main button starts the usual run flow (mode choice
 * first) under `startLabel`; without it (a run is in progress) there is only Close.
 * Resolves "start" or null.
 */
export function openIntro({ startLabel = "Start agent", onStart = null } = {}) {
  return new Promise((resolve) => {
    let modal;
    const steps = h("ol", { class: "intro-steps" }, STEPS.map((s, i) =>
      h("li", { class: "intro-step", dataset: { tone: s.tone } },
        h("span", { class: "intro-num", "aria-hidden": "true" }, String(i + 1)),
        h("strong", { class: "intro-step-title" }, s.title),
        h("span", { class: "intro-step-text" }, s.text))));
    const value = h("ul", { class: "intro-value" }, VALUE.map((v) =>
      h("li", {}, h("strong", {}, v.title), h("span", {}, v.text))));
    const real = h("div", { class: "intro-real", role: "group", "aria-label": "What is real" }, REAL.map((r) =>
      h("div", { class: "intro-real-item", dataset: { tone: r.tone } },
        h("strong", {}, r.title), h("span", {}, r.text))));

    const footer = onStart
      ? [
        h("span", { class: "left" }, "Press ", h("strong", {}, startLabel), " to choose ", h("strong", {}, "Simulation"), " (no key) or ", h("strong", {}, "Live"), " (your own key)."),
        h("button", { class: "btn btn-ghost", type: "button", on: { click: () => modal.close(null) } }, "Close"),
        h("button", { class: "btn btn-primary", type: "button", autofocus: true, on: { click: () => modal.close("start") } }, icon("play", 18), startLabel)
      ]
      : [h("button", { class: "btn btn-primary", type: "button", autofocus: true, on: { click: () => modal.close(null) } }, "Close")];

    modal = openModal({
      title: "How Repack Pilot works",
      intro: "One night shift in a retail distribution centre: a simulated robot cell, planned by an AI agent, repacks mixed pallets into 12 store orders. An engine prices every 1,000 units in labour.",
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
