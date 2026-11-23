// Starts the showcase: simulates tonight's night, draws it, and walks the five steps. Play starts when
// the guide closes and walks the steps by itself, each for as long as its words take to read (7 to 14 s);
// towards the end of a step the night plays on to the next step's moment. At 23:10 Play holds: the bar
// under the story says "Your turn" and holds Confirm entry and Reject, and the answer goes into the
// decision log. At Your DC the night is over and Play offers Replay. Keys: Space plays or pauses; 1 to 5,
// the arrows, a clicker's PageDown and PageUp, and Home step by hand and pause Play. Links: ?step=asks
// opens a step, paused.

import { buildShowcase, STEP_IDS, stepById, flowOf, readMs } from "./story.js";
import { buildTimeline, stateAt } from "./timeline.js";
import { fillFigures, figuresOf, createFlow, liveFlow, createPallet, updateHeader, renderStory, renderLog, setMove, createYourDc } from "./view.js";

/** Real milliseconds the night plays at the end of each of the first three steps, to the next moment. */
const NIGHT_MS = [8000, 7000, 6000];
/** A step's own moment stays on the stations at least this long before the night plays on. */
const HOLD_MS = 4000;
/** Between two items the stations change at most this often, so a name can be read. */
const FLOW_EVERY_MS = 650;
/** Paused on a step, the bar's Next draws the eye after this long without a click, a key or a scroll. */
const NUDGE_MS = 6000;

const $ = (id) => document.getElementById(id);

boot().catch((err) => failBoot(err));

async function boot() {
  if (!window.WORLD) throw new Error("data/world.js did not load. Deploy it next to index.html and reload.");
  const show = buildShowcase(window.WORLD);
  const timeline = buildTimeline(show);
  const F = show.facts;
  const steps = show.steps;
  const last = steps.length - 1;
  const names = new Map(timeline.items.map((it) => [it.sku, it.name]));

  fillFigures(figuresOf(F));
  const drawFlow = createFlow($("flow"));
  const drawPallet = createPallet($("pallet"), timeline, F);
  createYourDc();

  const ui = {
    play: $("play"),
    stepButtons: [...document.querySelectorAll("#steps .vc-step")].map((li) => ({ li, button: li.querySelector("button"), id: li.dataset.step })),
    announce: $("announce"),
    guide: $("guide")
  };
  /** The night on screen: its step and time, Play, the answer at 23:10 and the log of it. */
  const state = { index: 0, t: 0, playing: false, decision: null, log: [], flowAt: 0, flowRows: null };
  /** Play's clock: the frame it asked for, the time spent on the step, the last frame's time. */
  const P = { raf: 0, at: 0, last: 0 };

  /** 23:10 before the answer: the person's turn, where Play holds. */
  const waits = (i = state.index) => steps[i].id === "asks" && !state.decision;
  /** Your DC: the night is over, and Play offers Replay. */
  const finished = () => state.index === last;
  const covered = () => !!document.querySelector("dialog[open]");
  /** How long Play stays on step i, and how much of that the night plays on to the next moment. */
  function timing(i) {
    const read = readMs(steps[i], state.decision);
    const night = i < NIGHT_MS.length ? Math.min(NIGHT_MS[i], read - HOLD_MS) : 0;
    return { read, night, hold: read - night };
  }

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

  function drawSteps() {
    ui.stepButtons.forEach((b, i) => {
      b.li.classList.toggle("vc-step--current", i === state.index);
      b.li.classList.toggle("vc-step--done", i < state.index);
      b.li.dataset.waits = String(waits(i));
      if (i === state.index) b.button.setAttribute("aria-current", "step");
      else b.button.removeAttribute("aria-current");
    });
    drawProgress();
  }

  /** How far Play has read the step: the rail to the next step and the line along the bar fill with it,
   * and the bar says in how many seconds the page moves on. */
  function drawProgress() {
    const reading = state.playing && !waits() && !finished();
    const { read } = timing(state.index);
    const p = reading ? Math.max(0, Math.min(1, P.at / read)) : 0;
    ui.stepButtons.forEach((b, i) => b.li.style.setProperty("--vc-step-fill", i === state.index ? p.toFixed(4) : "0"));
    $("move-fill").style.setProperty("--fill", p.toFixed(4));
    const note = reading ? `in ${Math.max(1, Math.ceil((read - P.at) / 1000))} s` : "";
    if ($("move-note").textContent !== note) $("move-note").textContent = note;
  }

  /** Play, Pause or Replay, on one button: Replay once the night is over. */
  const PLAY = { play: ["vc-icon--play", "Play"], pause: ["vc-icon--pause", "Pause"], replay: ["vc-icon--refresh", "Replay"] };
  function drawPlay() {
    const mode = state.playing ? "pause" : finished() ? "replay" : "play";
    if (ui.play.dataset.state === mode) return;
    ui.play.dataset.state = mode;
    ui.play.querySelector(".vc-icon").className = `vc-icon ${PLAY[mode][0]}`;
    ui.play.querySelector(".play-text").textContent = PLAY[mode][1];
  }

  // ---- the bar under the story: what happens next, or what to do

  /** In words, with its one action: Your turn at 23:10, Playing while Play reads, Done at Your DC. */
  function moveFor() {
    const i = state.index;
    const next = steps[i + 1];
    if (waits(i)) {
      return { tone: "move", lead: "Your turn.", text: steps[i].turn, actions: [
        { id: "confirm", label: "Confirm entry", icon: "check", attention: "now", onClick: () => decide("confirm") },
        { id: "reject", label: "Reject", kind: "outline", onClick: () => decide("reject") }
      ] };
    }
    if (!next) return { tone: "done", lead: "Done.", text: steps[i].done, actions: [{ id: "replay", label: "Replay", icon: "refresh", kind: "secondary", onClick: replay }] };
    const text = `Next${next.id === "your-dc" ? "" : ` at ${next.clock}`}: ${next.next}.`;
    const go = { id: "next", label: `Next: ${next.label}`, iconEnd: "chevron-right", onClick: () => goTo(i + 1, { how: "next" }) };
    return state.playing
      ? { tone: "play", lead: "Playing.", text, actions: [go] }
      : { tone: "move", lead: "Your turn.", text: `${text} Or press Play.`, actions: [{ ...go, attention: "nudge" }] };
  }

  /** The bar, then Vici's vc-attention on the action the page waits for: at once at 23:10, after six
   * quiet seconds where Next is all that is left. */
  let idle = 0;
  function drawMove() {
    const m = moveFor();
    setMove(m);
    $("move-fill").hidden = m.tone !== "play";
    drawProgress();
    const want = m.actions.find((a) => a.attention);
    const button = document.querySelector("#move [data-attention]");
    if (!button || !want) return;
    if (want.attention === "now") button.classList.add("vc-attention");
    else if (!button.classList.contains("vc-attention") && !idle) {
      idle = setTimeout(() => { idle = 0; if (!state.playing && !covered()) document.querySelector("#move [data-attention]")?.classList.add("vc-attention"); }, NUDGE_MS);
    }
  }
  /** A click, a key or a scroll starts the six seconds again. */
  function quiet() {
    clearTimeout(idle);
    idle = 0;
    if (moveFor().actions.find((a) => a.attention)?.attention === "nudge") document.querySelector("#move [data-attention]")?.classList.remove("vc-attention");
    drawMove();
  }
  for (const type of ["pointerdown", "keydown", "wheel"]) document.addEventListener(type, () => { if (!state.playing) requestAnimationFrame(quiet); }, { capture: true, passive: true });

  // ---- moving between steps

  /** Shows step `index` at its moment. how: "click" or "key" pause Play and move the focus to the step's
   * title; "next" and "play" keep Play going; "code" changes neither. */
  function goTo(index, { how = "click" } = {}) {
    if (how === "click" || how === "key") pause();
    state.index = Math.max(0, Math.min(last, index));
    const step = steps[state.index];
    state.t = step.t;
    P.at = 0;
    drawNight(state.t, { moment: true });
    renderStory(step, { decision: state.decision });
    renderLog(state.log, step.id === "asks" || step.id === "result");
    drawSteps();
    drawPlay();
    drawMove();
    if (how !== "code") ui.announce.textContent = `${step.id === "your-dc" ? "" : `${step.clock}, `}${step.label}. ${step.heading}.${waits() ? ` Your turn: ${step.turn}` : ""}`;
    if (how === "click" || how === "key") $("story-title").focus({ preventScroll: true });
    const url = new URL(window.location.href);
    url.searchParams.set("step", step.id);
    window.history.replaceState(null, "", url);
  }

  /** Sim time for progress p (0..1) of the night between step i and the next; the long stretch from
   * 23:10 spends 80 % of it on the work. */
  function timeAt(i, p) {
    const from = steps[i].t;
    const to = steps[i + 1].t;
    if (i < 2) return from + (to - from) * p;
    const work = Math.min(to, timeline.lastWork + 60000);
    return p < 0.8 ? from + (work - from) * (p / 0.8) : work + (to - work) * ((p - 0.8) / 0.2);
  }

  function play() {
    if (finished()) { replay(); return; }
    state.playing = true;
    P.last = 0;
    clearTimeout(idle);
    idle = 0;
    drawPlay();
    drawMove();
    if (!P.raf) P.raf = requestAnimationFrame(frame);
  }

  function pause() {
    if (!state.playing) return;
    state.playing = false;
    cancelAnimationFrame(P.raf);
    P.raf = 0;
    drawPlay();
    drawMove();
  }

  /** The night again from 22:00, with its question open again: for the next audience. */
  function replay() {
    pause();
    state.decision = null;
    state.log = [];
    goTo(0, { how: "code" });
    play();
  }

  function frame(now) {
    P.raf = 0;
    if (!state.playing) return;
    // Time away from the tab, or a slow frame, does not count.
    const dt = P.last ? Math.min(now - P.last, 100) : 0;
    P.last = now;
    const i = state.index;
    if (finished()) { pause(); return; }
    if (waits(i)) P.at = 0;
    else if (!covered()) {
      P.at += dt;
      const { read, night, hold } = timing(i);
      if (P.at >= read) {
        goTo(i + 1, { how: "play" });
        if (state.playing) P.raf = requestAnimationFrame(frame);
        return;
      }
      if (night > 0 && P.at > hold) {
        state.t = timeAt(i, (P.at - hold) / night);
        drawNight(state.t, { moment: false });
      }
    }
    drawProgress();
    P.raf = requestAnimationFrame(frame);
  }

  function togglePlay() {
    if (state.playing) pause();
    else play();
  }

  /** The person's answer at 23:10: once, logged, and the stations, the tile and the bar follow it. */
  function decide(choice) {
    const step = steps[state.index];
    if (state.decision || !step.decision) return;
    state.decision = choice;
    state.log = [{ at: step.clock, what: step.log[choice] }];
    P.at = 0;
    renderStory(step, { decision: choice });
    renderLog(state.log, true);
    drawNight(state.t, { moment: true });
    drawSteps();
    drawPlay();
    drawMove();
    ui.announce.textContent = step.decision[choice];
  }

  // ---- wiring

  ui.play.addEventListener("click", togglePlay);
  ui.stepButtons.forEach((b, i) => b.button.addEventListener("click", () => goTo(i)));
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (covered()) return;
    const t = e.target;
    if (t instanceof HTMLElement && t.closest("input, textarea, select, [contenteditable]")) return;
    const onControl = t instanceof HTMLElement && t.closest("button, a, summary");
    if (e.key === " ") {
      if (onControl) return;
      e.preventDefault();
      if (!e.repeat) togglePlay();
      return;
    }
    // A presentation clicker sends PageDown and PageUp, or the arrow keys.
    if (e.key === "ArrowRight" || e.key === "PageDown") goTo(state.index + 1, { how: "key" });
    else if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(state.index - 1, { how: "key" });
    else if (e.key === "Home") { pause(); state.decision = null; state.log = []; goTo(0, { how: "key" }); }
    else if (/^[1-5]$/.test(e.key)) goTo(Number(e.key) - 1, { how: "key" });
    else return;
    e.preventDefault();
  });

  // The guide holds Play: the first time it closes, Play starts, unless a link asked for a step; later
  // only its Start button plays.
  const asked = STEP_IDS.includes(new URL(window.location.href).searchParams.get("step"));
  let firstClose = ui.guide.open;
  document.addEventListener("vc:guideclose", (e) => {
    if (e.target?.id !== "guide") return;
    const done = e.detail?.returnValue === "done";
    if ((firstClose && !asked) || done) play();
    firstClose = false;
    if (done && state.playing) ui.play.focus({ preventScroll: true });
  });

  const fromUrl = new URL(window.location.href).searchParams.get("step");
  goTo(STEP_IDS.indexOf(stepById(steps, fromUrl).id), { how: "code" });
  document.documentElement.dataset.boot = "ready";
  window.repackPilot = { show, timeline, steps, goTo, play, pause, replay, decide, state, P, timing, stateAt: (t) => stateAt(timeline, t) };
  hideBoot();
  if (!ui.guide.open && !asked) play();
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
