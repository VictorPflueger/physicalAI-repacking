// Starts the showcase: simulates tonight's night, draws it, and lets the presenter walk the five
// steps by click, key or address (?step=asks). Play runs the night from one step to the next and
// stops there, so the room can talk; the decision at 23:10 is taken once, by the person at the screen.

import { buildShowcase, STEP_IDS, stepById, flowOf } from "./story.js";
import { buildTimeline, stateAt } from "./timeline.js";
import { fillFigures, figuresOf, createFlow, liveFlow, createPallet, updateHeader, renderStory, createYourDc } from "./view.js";

/** Real seconds the night takes from each step to the next while it plays. */
const SEGMENT_MS = [6000, 7000, 10000];
/** Between two items the stations change at most this often, so a name can be read. */
const FLOW_EVERY_MS = 650;

const $ = (id) => document.getElementById(id);

boot().catch((err) => failBoot(err));

async function boot() {
  if (!window.WORLD) throw new Error("data/world.js did not load. Deploy it next to index.html and reload.");
  const show = buildShowcase(window.WORLD);
  const timeline = buildTimeline(show);
  const F = show.facts;
  const steps = show.steps;
  const names = new Map(timeline.items.map((it) => [it.sku, it.name]));

  fillFigures(figuresOf(F));
  const drawFlow = createFlow($("flow"));
  const drawPallet = createPallet($("pallet"), timeline, F);
  createYourDc();

  const ui = {
    play: $("play"),
    stepButtons: [...document.querySelectorAll("#steps .vc-step")].map((li) => ({ li, button: li.querySelector("button"), id: li.dataset.step })),
    announce: $("announce")
  };
  const state = { index: 0, t: 0, playing: false, decision: null, raf: 0, flowAt: 0, flowRows: null };

  // ---- drawing

  function drawNight(t, { moment }) {
    const s = stateAt(timeline, t);
    $("clock").textContent = s.clock;
    updateHeader(s, F);
    drawPallet(s, state.decision);
    const now = performance.now();
    if (moment) {
      state.flowRows = null;
      drawFlow(flowOf(steps[Math.min(state.index, 3)], state.decision));
    } else if (!state.flowRows || now - state.flowAt >= FLOW_EVERY_MS) {
      state.flowRows = liveFlow(s, timeline, names);
      state.flowAt = now;
      const g = s.grasp;
      drawFlow(state.flowRows, g ? (g.ok ? 2 : 4) : -1);
    }
  }

  function drawSteps(fill = 0) {
    ui.stepButtons.forEach((b, i) => {
      b.li.classList.toggle("vc-step--current", i === state.index);
      b.li.classList.toggle("vc-step--done", i < state.index);
      if (i === state.index) b.button.setAttribute("aria-current", "step");
      else b.button.removeAttribute("aria-current");
      b.li.style.setProperty("--fill", i === state.index ? fill.toFixed(4) : "0");
    });
  }

  function drawPlay() {
    const last = state.index === steps.length - 1;
    const icon = ui.play.querySelector(".play-icon");
    icon.classList.toggle("vc-icon--pause", state.playing);
    icon.classList.toggle("vc-icon--play", !state.playing);
    ui.play.querySelector(".play-text").textContent = state.playing ? "Pause" : last ? "Replay" : "Play";
  }

  // ---- moving between steps

  function goTo(index, { announce = true } = {}) {
    stop();
    state.index = Math.max(0, Math.min(steps.length - 1, index));
    const step = steps[state.index];
    state.t = step.t;
    drawNight(state.t, { moment: true });
    renderStory(step, { decision: state.decision });
    drawSteps(0);
    drawPlay();
    if (announce) ui.announce.textContent = `${step.clock && step.id !== "your-dc" ? `${step.clock}, ` : ""}${step.label}. ${step.heading}.`;
    const url = new URL(window.location.href);
    url.searchParams.set("step", step.id);
    window.history.replaceState(null, "", url);
  }

  function stop() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (state.playing) { state.playing = false; drawPlay(); }
  }

  /** Sim time for progress p (0..1) of segment i; the long last stretch spends 80 % on the work. */
  function timeAt(i, p) {
    const from = steps[i].t;
    const to = steps[i + 1].t;
    if (i < 2) return from + (to - from) * p;
    const work = Math.min(to, timeline.lastWork + 60000);
    return p < 0.8 ? from + (work - from) * (p / 0.8) : work + (to - work) * ((p - 0.8) / 0.2);
  }

  function play() {
    if (state.index >= steps.length - 1) { state.decision = null; goTo(0); return play(); }
    if (state.index === steps.length - 2) { goTo(steps.length - 1); return; }
    const i = state.index;
    const duration = SEGMENT_MS[i];
    const from = steps[i].t;
    const to = steps[i + 1].t;
    // Resume where a pause left the night.
    let progress = 0;
    if (state.t > from) {
      for (let k = 1; k <= 100; k++) if (timeAt(i, k / 100) <= state.t) progress = k / 100;
    }
    const startedAt = performance.now() - progress * duration;
    state.playing = true;
    drawPlay();
    const frame = (now) => {
      const p = Math.min(1, (now - startedAt) / duration);
      state.t = timeAt(i, p);
      drawNight(state.t, { moment: false });
      drawSteps(p);
      if (p >= 1 || state.t >= to) { goTo(i + 1); return; }
      state.raf = requestAnimationFrame(frame);
    };
    state.raf = requestAnimationFrame(frame);
  }

  function togglePlay() {
    if (state.playing) stop();
    else play();
  }

  function decide(choice) {
    if (state.decision) return;
    state.decision = choice;
    renderStory(steps[state.index], { decision: state.decision });
    drawNight(state.t, { moment: !state.playing });
    ui.announce.textContent = steps[state.index].decision?.[choice] || "";
    $("decision-outcome").focus({ preventScroll: true });
  }

  // ---- wiring

  ui.play.addEventListener("click", togglePlay);
  $("restart").addEventListener("click", () => { state.decision = null; goTo(0); });
  ui.stepButtons.forEach((b, i) => b.button.addEventListener("click", () => goTo(i)));
  $("confirm").addEventListener("click", () => decide("confirm"));
  $("reject").addEventListener("click", () => decide("reject"));
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector("dialog[open]")) return;
    const t = e.target;
    if (t instanceof HTMLElement && t.closest("input, textarea, select, [contenteditable]")) return;
    const onControl = t instanceof HTMLElement && t.closest("button, a");
    if (e.key === " " && !onControl) { e.preventDefault(); togglePlay(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); goTo(state.index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(state.index - 1); }
    else if (e.key === "Home") { e.preventDefault(); state.decision = null; goTo(0); }
    else if (/^[1-5]$/.test(e.key)) { e.preventDefault(); goTo(Number(e.key) - 1); }
  });
  document.addEventListener("vc:guideclose", (e) => {
    if (e.target?.id === "guide" && e.detail?.returnValue === "done") ui.play.focus();
  });

  const fromUrl = new URL(window.location.href).searchParams.get("step");
  goTo(STEP_IDS.indexOf(stepById(steps, fromUrl).id), { announce: false });
  document.documentElement.dataset.boot = "ready";
  window.repackPilot = { show, timeline, steps, goTo, play, stop, decide, state, stateAt: (t) => stateAt(timeline, t) };
  hideBoot();
}

function hideBoot() {
  const el = document.getElementById("boot");
  if (!el) return;
  el.dataset.state = "done";
  setTimeout(() => el.remove(), 400);
}

function failBoot(err) {
  console.error("[Repack Pilot] Start-up failed:", err);
  const el = document.getElementById("boot");
  if (!el) return;
  el.dataset.state = "failed";
  const status = document.getElementById("boot-status");
  if (status) status.textContent = "Repack Pilot could not start.";
  const detail = document.getElementById("boot-detail");
  if (detail) { detail.textContent = String(err?.message || err); detail.hidden = false; }
}
