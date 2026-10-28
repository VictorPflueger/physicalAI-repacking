// The Customer view's centre (TECH_NOTES D62): the robot's world model, as Detecon's whitepaper puts
// it the connecting link between the robot and the agent ("Two AI Worlds, One Robot", pp. 7–8). Four
// parts, top to bottom:
//   - the way of one item through the cell: camera → world model → robot → scale, and what goes to a
//     person, each with what it does for that item (the latest weighed or missed unit, or the moment);
//   - the moment: what the model learned, an item it does not know (with the person's Confirm and
//     Reject), an item handed to a person, the robot's own state; calm lines in between;
//   - tonight's pallet in the model, item by item: its planned units, robot or by hand, what is done,
//     and what the night changed (corrected, not in the model, confirmed or rejected by you);
//   - what the model learned tonight.
// Every value comes from the board's state (js/cell_data.js, fed by the night's events) and from the
// agent's own events (provisional_entry, confirmation_request, confirmation_decision), so both
// producers draw the same view. Items go by their names: no SKU id, tool name, rule code or seed.
// A station's two lines stay short (about 16 and 20 characters), so they fit its width at 1280 × 720;
// the moment below says the same at length.
//
// The stage takes its size from its free height, like the cell board (TECH_NOTES D19): "full" with the
// lede and two lines per node, "compact" and "short" with less, stepping down while its content does not
// fit. Below 400 px (the drawer open over the stage, like the board's strip) tonight's pallet steps aside
// ("strip"), then what the model learned ("flow"): the item's way and the moment stay. Between moments the item on its way changes at most every FLOW_MS of real time, so a fast night
// reads as a sequence of items, not a blur; a moment stays while the night stands still and for two
// simulated minutes after.

import { bus } from "./events.js";
import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { clockOf } from "./nightsim.js";
import { int, pct, upTo, fixed } from "./format.js";
import { tag } from "./tags.js";

export const FLOW_MS = 700;
const HOLD_MS = 2 * 60000; // a moment stays two simulated minutes after its time
const SIZES = ["full", "compact", "short", "strip", "flow"];
const SIZE_LIMITS = { strip: 400, short: 560, compact: 760 }; // stage heights in px

/** "400 g", "1 kg", "1.5 kg". */
export function grams(g) {
  if (g === null || g === undefined || !Number.isFinite(Number(g))) return "—";
  return g >= 1000 ? `${upTo(g / 1000, 2)} kg` : `${int(g)} g`;
}

/** The item's name up to its first comma: "Apricot jam 200 g, glass jar" → "Apricot jam 200 g". */
const shortName = (name) => String(name || "").split(",")[0];

/**
 * An item's name in two parts, so a tile can drop the second below the stage's full size and the camera's
 * line always does: "Apricot jam" and " 200 g", "Barcode" and " 4037848020859". A multipack keeps its
 * whole name ("Still water 6 × 1.5 l"), so it never reads like the single bottle.
 */
function nameParts(name) {
  const b = /^(Barcode)(\s+\d+)$/.exec(name);
  if (b) return [b[1], b[2]];
  const q = /^(.+?)(\s+\d[\d.,]*\s?(?:g|kg|l|ml))$/.exec(name);
  return q && !/×$/.test(q[1].trim()) ? [q[1], q[2]] : [name, ""];
}

const FRAGILITY = { low: "sturdy", medium: "handle with care", high: "fragile", "very high": "very fragile" };

/** Why an item is for people, in a customer's words (the item master says "Over the cell's payload"). */
const handReason = (reason) => String(reason || "").toLowerCase().replace(/^over the cell's payload$/, "too heavy for the robot").replace(/^fragile and age-restricted$/, "fragile, age-restricted");

/**
 * root: the stage's element. getState(): the board's night state (js/cell_data.js) or null.
 * onConfirm({ request_id, choice, subject }): the person's answer to a confirmation request.
 */
export function createWorldStage(root, { getState = () => null, onConfirm = () => {} } = {}) {
  // ---- frame ---------------------------------------------------------------------------------------
  const clockTime = h("span", { class: "ws-clock-time" }, "22:00");
  const clockPaused = h("span", { class: "ws-clock-paused" });
  const head = h("div", { class: "ws-head" },
    h("div", { class: "ws-titles" },
      h("div", { class: "ws-title-row" },
        h("h2", { class: "ws-title" }, "The robot's world model"),
        tag("Synthetic", "synthetic")),
      h("p", { class: "ws-lede" }, "What the robot knows about every item on tonight's pallet: weight, size, fragility and how to grip it.")),
    h("div", { class: "ws-head-right" },
      h("span", { class: "ws-clock", "aria-hidden": "true" }, clockTime, clockPaused),
      h("span", { class: "vc-tag sim-cell-tag", role: "note", title: "The robot cell, its camera, scale and gripper, and the warehouse system are simulated, in Live and in Simulation mode." }, icon("gripper", 16), "Simulated cell")));

  const NODES = [
    { id: "camera", label: "Camera", icon: "camera" },
    { id: "model", label: "World model", icon: "cube" },
    { id: "robot", label: "Robot", icon: "gripper" },
    { id: "scale", label: "Scale", icon: "scale" },
    { id: "people", label: "People", icon: "user" }
  ];
  const nodeEls = new Map();
  const flow = h("ol", { class: "ws-flow", "aria-label": "One item's way through the cell" });
  NODES.forEach((n, i) => {
    if (i > 0) flow.append(h("li", { class: `ws-arrow${n.id === "people" ? " to-people" : ""}`, "aria-hidden": "true" }, n.id === "people" ? "⇢" : "→"));
    const l1 = h("span", { class: "wsn-l1" });
    const l2 = h("span", { class: "wsn-l2" });
    const el = h("li", { class: "ws-node", dataset: { node: n.id, tone: "" } },
      h("span", { class: "wsn-head" }, h("span", { class: "wsn-icon" }, icon(n.icon, 20)), h("span", { class: "wsn-label" }, n.label)), l1, l2);
    nodeEls.set(n.id, { el, l1, l2 });
    flow.append(el);
  });

  const momentLabel = h("span", { class: "wsm-label" });
  const momentText = h("p", { class: "wsm-text" });
  const momentActions = h("div", { class: "wsm-actions" });
  const moment = h("div", { class: "ws-moment", dataset: { kind: "idle" }, role: "status", "aria-live": "polite" },
    h("span", { class: "wsm-icon", "aria-hidden": "true" }), h("div", { class: "wsm-body" }, momentLabel, momentText), momentActions);

  const palletMeta = h("span", { class: "ws-pallet-meta" });
  const grid = h("ul", { class: "ws-grid", "aria-label": "Tonight's pallet, item by item" });
  const pallet = h("section", { class: "ws-pallet", "aria-label": "Tonight's pallet in the model" },
    h("div", { class: "ws-pallet-head" },
      h("h3", {}, "Tonight's pallet in the model"), palletMeta,
      h("span", { class: "ws-legend", role: "note", "aria-label": "Legend" },
        h("span", { class: "wsl-item" }, icon("gripper", 14), "robot"),
        h("span", { class: "wsl-item" }, icon("user", 14), "by hand"),
        h("span", { class: "wsl-item", dataset: { tone: "check" } }, h("span", { class: "wsl-swatch", "aria-hidden": "true" }), "corrected"),
        h("span", { class: "wsl-item", dataset: { tone: "risk" } }, h("span", { class: "wsl-swatch", "aria-hidden": "true" }), "not in the model"))),
    grid);
  const tileEls = new Map();

  const log = h("ol", { class: "ws-log", "aria-label": "What the model learned tonight" });
  const learned = h("section", { class: "ws-learned" }, h("h3", {}, "What the model learned tonight"), log);

  const stage = h("div", { class: "world-stage-inner", dataset: { size: "full", state: "idle" } }, head, flow, moment, pallet, learned);
  clear(root).appendChild(stage);

  // ---- the agent's side of the model: provisional entries and the person's confirmations ----------------
  const entries = new Map();   // barcode → { name, net_content, status: "unverified" | "confirmed" | "rejected", at }
  let request = null;           // { request_id, subject, barcode, decided: null | "confirm" | "reject", at }
  let running = false;
  let ended = false;

  bus.on("run_start", () => { entries.clear(); request = null; running = true; ended = false; tileEls.clear(); clear(grid); schedule(true); });
  bus.on("night_end", () => { ended = true; schedule(true); });
  bus.on("run_end", () => { running = false; schedule(true); });
  bus.on("provisional_entry", (ev) => {
    const p = ev.payload;
    // A name the lookup did not find ("Unknown item 4037848020859") is no name: the item goes by its barcode.
    const name = /^unknown item\b/i.test(String(p.name || "")) ? null : p.name || null;
    entries.set(p.barcode, { name, net_content: p.net_content || null, status: "unverified", at: p.created || null });
    schedule(true);
  });
  bus.on("confirmation_request", (ev) => {
    const p = ev.payload;
    request = { request_id: p.request_id, subject: p.subject, barcode: p.entry_barcode || barcodeIn(p.subject), decided: null, at: clockNow() };
    schedule(true);
  });
  bus.on("confirmation_decision", (ev) => {
    const p = ev.payload;
    if (!request || request.request_id !== p.request_id) return;
    request.decided = p.choice;
    const e = request.barcode ? entries.get(request.barcode) : null;
    if (e) e.status = p.choice === "confirm" ? "confirmed" : "rejected";
    schedule(true);
  });

  const barcodeIn = (text) => (String(text || "").match(/\b\d{8,14}\b/) || [null])[0];
  const clockNow = () => { const st = getState(); return st ? clockOf(st.t) : null; };

  // ---- rendering --------------------------------------------------------------------------------------
  let frame = 0;
  let forced = false;
  let lastFlowAt = 0;
  let trailing = 0;
  function schedule(force = false) {
    if (force) forced = true;
    if (!frame) frame = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16))(render);
  }

  /** Called by the board after it applied a batch of the night's events (or loaded a night). */
  function update() { schedule(); }

  function render() {
    frame = 0;
    const force = forced;
    forced = false;
    const st = getState();
    if (!st) return;
    stage.dataset.state = ended || st.ended ? "ended" : running ? "running" : "idle";
    renderClock(st);
    // The item on its way and the moment: held while the night runs fast, at once when it stands still.
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const m = momentOf(st);
    const calmFlow = m.kind === "calm" && running && !st.paused;
    if (!force && calmFlow && now - lastFlowAt < FLOW_MS) {
      if (!trailing) trailing = setTimeout(() => { trailing = 0; schedule(true); }, FLOW_MS - (now - lastFlowAt) + 10);
    } else {
      lastFlowAt = now;
      renderFlow(st, m);
      renderMoment(st, m);
    }
    renderPallet(st);
    renderLearned(st);
    remeasure();
  }

  function renderClock(st) {
    const started = running || st.t > 0;
    const time = started ? clockOf(st.t) : "22:00";
    if (clockTime.textContent !== time) clockTime.textContent = time;
    const paused = started && st.paused && running ? " · paused" : "";
    if (clockPaused.textContent !== paused) clockPaused.textContent = paused;
  }

  /** What the stage tells now: the strongest moment of the night at this time. */
  function momentOf(st) {
    const t = st.t;
    if (!running && !ended && !st.ended && t === 0) return { kind: "idle" };
    if (request && !request.decided) return { kind: "unknown", pending: true };
    // A moment holds while the night stands still at it (its time does not move) and two simulated minutes after.
    const fresh = (at) => typeof at === "number" && t - at <= HOLD_MS;
    const esc = st.escalations.at(-1);
    const escAt = esc ? esc.sim_t ?? st.handed.at(-1)?.t : null;
    const fix = st.focus?.kind === "correction" ? st.focus : null;
    // The latest of a correction and an escalation wins while it is fresh.
    const fixFresh = fix && fresh(fix.t);
    const escFresh = esc && fresh(escAt);
    if (fixFresh && (!escFresh || fix.t >= escAt)) return { kind: "learned", fix };
    if (escFresh) {
      if (esc.rule === "E1") return { kind: "unknown", esc, pending: false };
      if (esc.rule === "E2") return { kind: "unsafe", esc };
      if (esc.rule === "E3") return { kind: "wear", esc };
    }
    if (request?.decided && st.unknown && fresh(st.unknown.t + 1)) return { kind: "unknown", pending: false };
    if (ended || st.ended) return { kind: "end" };
    return { kind: "calm" };
  }

  // ---- the way of one item -------------------------------------------------------------------------------
  /**
   * l1 is a text, or { name } for an item's name, which the camera's line shows without its pack size
   * ("Chopped tomatoes"): its tile and the moment name the item in full.
   */
  function setNode(id, l1, l2, tone = "") {
    const n = nodeEls.get(id);
    const text = l1 && typeof l1 === "object" ? nameParts(l1.name || "")[0] : l1;
    if (n.l1.textContent !== text) n.l1.textContent = text;
    if (n.l2.textContent !== l2) n.l2.textContent = l2;
    if (n.el.dataset.tone !== tone) n.el.dataset.tone = tone;
  }

  /** Units repacked by hand so far: hand picks less the units set aside for a person (not in the model). */
  const byHand = (st) => Math.max(0, st.manual.picks - st.manual.set_aside);
  const unsureCount = (st) => st.escalations.filter((e) => e.rule === "E2").length;

  function people(st, tone = "") {
    if (!running && !ended && st.t === 0) {
      setNode("people", `${int(st.info.totals.manual_units)} units by hand`, "not for the robot");
      return;
    }
    const aside = st.manual.set_aside;
    const unsure = unsureCount(st);
    // The grasps the robot missed go to a person too, so "as planned" only while it has missed none.
    const missed = Math.max(0, st.cell.attempts - st.cell.successes);
    setNode("people", `${int(byHand(st))} units by hand`, aside ? `${int(aside)} unknown, set aside` : unsure ? `${int(unsure)} unsure ${unsure === 1 ? "grasp" : "grasps"}` : missed ? `${int(missed)} ${missed === 1 ? "grasp" : "grasps"} missed` : "as planned", tone);
  }

  function renderFlow(st, m) {
    const item = (sku) => (sku ? st.world.item(sku) : null);
    if (m.kind === "idle") {
      setNode("camera", "Identifies each item", "and reads its barcode");
      setNode("model", `${int(st.info.items.length)} items`, "weight, size, fragility, grip");
      setNode("robot", "Rehearses grasps", "on the model first");
      setNode("scale", "Weighs what it lifts", "against the model");
      people(st);
      return;
    }
    if (m.kind === "learned") {
      const it = item(m.fix.sku);
      const r = st.cell.rehearsal && st.cell.rehearsal.sku === m.fix.sku ? st.cell.rehearsal : null;
      setNode("camera", { name: shortName(it?.name) }, "identified");
      setNode("model", `now ${grams(m.fix.observed_g)}`, `was ${grams(m.fix.expected_g)}, for every unit`, "check");
      setNode("robot", r ? `rehearsed: ${pct(r.expected_success, 0)}` : "rehearses again", "with the new weight", "check");
      setNode("scale", grams(m.fix.observed_g), `expected ${grams(m.fix.expected_g)}`, "check");
      people(st);
      return;
    }
    if (m.kind === "unknown") {
      const u = st.unknown;
      const e = u ? entries.get(u.barcode) : null;
      const units = m.esc?.units ?? lastE1(st)?.units ?? u?.seen ?? 0;
      setNode("camera", "not in the model", "unknown barcode", "risk");
      setNode("model", e ? (e.status === "confirmed" ? "entry confirmed" : e.status === "rejected" ? "entry rejected" : "provisional entry") : "no entry",
        e ? (e.status === "unverified" ? "unverified: you decide" : "by you") : "it does not know the item", e && e.status !== "unverified" ? "person" : "risk");
      setNode("robot", "does not pick it", "never unknown items");
      setNode("scale", "not weighed", "");
      setNode("people", `${int(units)} units to a person`, request && !request.decided ? "you confirm the entry" : "by a rule in code", "person");
      return;
    }
    if (m.kind === "unsafe") {
      const it = item(m.esc.sku);
      setNode("camera", { name: shortName(it?.name) }, "identified");
      setNode("model", FRAGILITY[it?.fragility] || "fragile", it?.grip || "");
      setNode("robot", `confidence ${fixed(m.esc.grasp_confidence, 2)}`, "below 0.80", "person");
      setNode("scale", "not weighed", "");
      people(st, "person");
      return;
    }
    if (m.kind === "wear") {
      const rate = m.esc.rolling_success;
      journey(st, item);
      setNode("robot", `${pct(rate, 0)} of last 100`, "below 75 %", "late");
      return;
    }
    if (m.kind === "end") {
      setNode("camera", `${int(st.camera.detections)} units read`, st.camera.unknown ? `${int(st.camera.unknown)} not in the model` : "all in the model");
      setNode("model", `${int(st.corrections.length + entries.size)} learned tonight`, `${int(st.info.items.length)} items${entries.size ? ` and ${int(entries.size)} new` : ""}`);
      setNode("robot", `${int(st.cell.successes)} picked`, `of ${int(st.cell.attempts)} grasps`);
      setNode("scale", `${int(st.scale.readings)} weighed`, `${int(st.corrections.length)} ${st.corrections.length === 1 ? "correction" : "corrections"}`);
      people(st);
      return;
    }
    journey(st, item);
  }

  /** The latest unit's way: weighed after a picked grasp, or missed and sent to the manual station. */
  function journey(st, item) {
    const c = st.cell.current;
    if (!c) {
      setNode("camera", "Identifies each item", "and reads its barcode");
      setNode("model", `${int(st.info.items.length)} items`, "weight, size, fragility, grip");
      setNode("robot", "Rehearses grasps", "on the model first");
      setNode("scale", "Weighs what it lifts", "against the model");
      people(st);
      return;
    }
    const it = item(c.sku);
    const conf = st.camera.recent.get(c.unit_id);
    setNode("camera", { name: shortName(it?.name) }, conf !== undefined ? `confidence ${fixed(conf, 2)}` : "identified");
    setNode("model", `expects ${grams(it?.expected_g)}`, `${it?.grip || ""}${it?.fragility ? ` · ${FRAGILITY[it.fragility] || it.fragility}` : ""}`);
    setNode("robot", `rehearsed: ${pct(c.expected_success, 0)}`, c.ok ? "picked" : "missed: to a person", c.ok ? "on-time" : "");
    const r = st.scale.last && st.scale.last.unit_id === c.unit_id ? st.scale.last : null;
    if (r) setNode("scale", grams(r.observed_g), Math.abs(r.observed_g - r.expected_g) / r.expected_g > 0.25 ? `expected ${grams(r.expected_g)}` : "as expected", Math.abs(r.observed_g - r.expected_g) / r.expected_g > 0.25 ? "check" : "");
    else setNode("scale", c.ok ? "weighing" : "not weighed", c.ok ? "" : "a person picks it");
    people(st);
  }

  const lastE1 = (st) => [...st.escalations].reverse().find((e) => e.rule === "E1") || null;

  // ---- the moment -----------------------------------------------------------------------------------------
  function renderMoment(st, m) {
    let label = "";
    let text = "";
    const actions = [];
    if (m.kind === "idle") {
      label = "Tonight's pallet";
      text = `The model holds all ${int(st.info.items.length)} items of tonight's ${int(st.info.totals.units)} units. The robot may take ${int(st.info.totals.cell_units)} of them; ${int(st.info.totals.manual_units)} are for people: items it may not grip.`;
    } else if (m.kind === "learned") {
      const it = st.world.item(m.fix.sku);
      const r = st.cell.rehearsal && st.cell.rehearsal.sku === m.fix.sku ? st.cell.rehearsal : null;
      label = `The model learned · ${clockOf(m.fix.t)}`;
      text = `${it?.name || "An item"} weighs ${grams(m.fix.observed_g)} on the scale, not ${grams(m.fix.expected_g)} as in the master data. The model now holds ${grams(m.fix.observed_g)} for every unit of this item${r ? `, and the next one is rehearsed with it: ${pct(r.expected_success, 0)} expected success` : ""}.`;
    } else if (m.kind === "unknown") {
      const u = st.unknown;
      const e = u ? entries.get(u.barcode) : null;
      const esc = m.esc || lastE1(st);
      const units = esc?.units ?? u?.seen ?? 0;
      const at = esc?.sim_t !== undefined ? ` · ${clockOf(esc.sim_t)}` : u ? ` · ${clockOf(u.t)}` : "";
      // After the person's decision the card says what was decided.
      label = request?.decided === "confirm" ? `Entry confirmed${at}` : request?.decided === "reject" ? `Entry rejected${at}` : `Not in the model${at}`;
      const what = `The camera read barcode ${u?.barcode || "?"}, which the model does not know. The robot never picks an unknown item: its ${int(units)} units go to a person.`;
      if (request && !request.decided) {
        text = `${what} A provisional entry waits for your decision${e?.name ? `: ${e.name}` : ""}${e && !e.name ? "; the lookup found no product" : ""}.`;
        actions.push(
          h("button", { class: "vc-button button-compact", type: "button", id: "ws-confirm", dataset: { action: "approve" }, on: { click: () => decide("confirm") } }, icon("check", 16), "Confirm entry"),
          h("button", { class: "vc-button vc-button--outline button-compact", type: "button", id: "ws-reject", dataset: { action: "reject" }, on: { click: () => decide("reject") } }, "Reject"));
      } else if (request?.decided) {
        text = request.decided === "confirm"
          ? `You confirmed the provisional entry for barcode ${u?.barcode || "?"}: the model knows the barcode from now on, still without weight or grip, so tonight's ${int(units)} units stay with a person.`
          : `You rejected the entry for barcode ${u?.barcode || "?"}: the item stays unknown, and its ${int(units)} units stay with a person.`;
      } else {
        text = `${what} The agent looks the barcode up.`;
      }
    } else if (m.kind === "unsafe") {
      const it = st.world.item(m.esc.sku);
      label = `Handed to a person · ${clockOf(m.esc.sim_t ?? st.t)}`;
      const why = String(m.esc.reason || "").split(":")[0];
      text = `${it?.name || "An item"}: ${why && !/^grasp confidence/i.test(why) ? `${why.charAt(0).toLowerCase()}${why.slice(1)}. ` : ""}The robot is not sure enough of its grip (${fixed(m.esc.grasp_confidence, 2)}, below 0.80), so a person takes it.`;
    } else if (m.kind === "wear") {
      label = `The robot's own state · ${clockOf(m.esc.sim_t ?? st.t)}`;
      text = `The robot picked only ${pct(m.esc.rolling_success, 0)} of its last 100 grasps, below 75 %: a rule in code calls a person to the cell.`;
    } else if (m.kind === "end") {
      label = "Night over";
      const n = st.corrections.length + entries.size;
      const split = `${int(st.cell.successes)} units were picked by the robot and ${int(byHand(st))} by hand${st.manual.set_aside ? `; ${int(st.manual.set_aside)} were set aside for a person` : ""}.`;
      text = n
        ? `The model learned ${int(n)} ${n === 1 ? "thing" : "things"} tonight, listed below. ${split}`
        : `Every reading matched the model tonight. ${split}`;
    } else {
      label = "Every grasp is rehearsed first";
      const n = st.corrections.length;
      text = `${int(st.scale.readings)} readings checked against the model so far${n ? `; ${int(n)} corrected it` : ", all as expected"}. Items it may not grip, and grasps it misses, go to a person.`;
    }
    moment.dataset.kind = m.kind === "unknown" && request?.decided ? "decided" : m.kind;
    if (momentLabel.textContent !== label) momentLabel.textContent = label;
    if (momentText.textContent !== text) momentText.textContent = text;
    const key = actions.length ? `actions:${request?.request_id}` : "";
    if (momentActions.dataset.key !== key) {
      momentActions.dataset.key = key;
      momentActions.replaceChildren(...actions);
    }
  }

  function decide(choice) {
    if (!request || request.decided) return;
    onConfirm({ request_id: request.request_id, choice, subject: request.subject });
  }

  // ---- tonight's pallet ------------------------------------------------------------------------------------
  function renderPallet(st) {
    const items = st.info.items;
    const planned = items.reduce((n, it) => n + (it.units || 0), 0);
    const meta = `${int(items.length)} items · ${int(planned)} units${st.unknown ? ` · and one item not in the model` : ""}`;
    if (palletMeta.textContent !== meta) palletMeta.textContent = meta;
    const corrected = new Map(st.corrections.map((c) => [c.sku, c]));
    const handedBySku = new Map();
    for (const x of st.handed) if (x.sku) handedBySku.set(x.sku, (handedBySku.get(x.sku) || 0) + 1);
    for (const it of items) {
      const tally = st.items.get(it.sku) || { units: it.units, robot: 0, hand: 0, failed: 0 };
      const done = tally.robot + tally.hand;
      const fix = corrected.get(it.sku);
      const handed = handedBySku.get(it.sku) || 0;
      const state = fix ? "corrected" : handed ? "handed" : done >= (it.units || 0) && it.units ? "done" : "open";
      const how = it.cell ? "robot" : "hand";
      const badge = fix ? `corrected ${clockOf(fix.at)}` : handed ? `${int(handed)} to a person` : "";
      // The icon says robot or by hand; the line says how many units, and why an item is for people.
      const metaText = it.cell
        ? `${int(it.units)} units${tally.failed ? ` · ${int(tally.failed)} missed, by hand` : ""}`
        : `${int(it.units)} units${it.manual_reason ? ` · ${handReason(it.manual_reason)}` : ""}`;
      tile(it.sku, { name: shortName(it.name), meta: metaText, share: it.units ? Math.min(1, done / it.units) : 0, state, how, badge, short: fix ? "corrected" : handed ? "to a person" : "",
        label: `${it.name}: ${int(it.units)} units, ${it.cell ? "for the robot" : "by hand"}, ${int(done)} done${fix ? `, corrected at ${clockOf(fix.at)}: ${grams(fix.old)} → ${grams(fix.new)}` : ""}${handed ? `, ${int(handed)} handed to a person` : ""}` });
    }
    if (st.unknown) {
      const e = entries.get(st.unknown.barcode);
      const status = e?.status || "unknown";
      const units = lastE1(st)?.units ?? st.unknown.seen;
      tile(`unknown:${st.unknown.barcode}`, {
        name: e?.status === "confirmed" ? (e.name || `Barcode ${st.unknown.barcode}`) : `Barcode ${st.unknown.barcode}`,
        meta: `${int(units)} units · set aside for a person`,
        share: units ? Math.min(1, st.unknown.hand / units) : 0,
        state: status === "confirmed" ? "confirmed" : status === "rejected" ? "rejected" : "unknown",
        how: "hand",
        badge: status === "confirmed" ? "confirmed by you" : status === "rejected" ? "rejected by you" : "not in the model",
        short: status === "confirmed" ? "confirmed" : status === "rejected" ? "rejected" : "unknown",
        label: `Barcode ${st.unknown.barcode}: not in the model, ${int(units)} units set aside for a person${status === "confirmed" ? "; you confirmed the entry" : status === "rejected" ? "; you rejected the entry" : ""}`
      });
    }
  }

  function tile(key, { name, meta, share, state, how, badge, short = "", label }) {
    let t = tileEls.get(key);
    if (!t) {
      const nameEl = h("span", { class: "wsi-name" });
      const metaEl = h("span", { class: "wsi-meta" });
      const fill = h("span", { class: "wsi-fill" });
      const badgeEl = h("span", { class: "wsi-badge" });
      // On a short stage the badge's one word sits beside the bar, so the name keeps the tile's width.
      const shortEl = h("span", { class: "wsi-badge-short", "aria-hidden": "true" });
      const howEl = h("span", { class: "wsi-how", "aria-hidden": "true" });
      const el = h("li", { class: "ws-item", dataset: { key } },
        h("span", { class: "wsi-top" }, howEl, nameEl), metaEl,
        h("span", { class: "wsi-row" }, h("span", { class: "wsi-bar", "aria-hidden": "true" }, fill), shortEl), badgeEl);
      t = { el, nameEl, metaEl, fill, badgeEl, shortEl, howEl, how: null };
      tileEls.set(key, t);
      grid.append(el);
      if (running && key.startsWith("unknown:")) el.classList.add("arrived");
    }
    if (t.name !== name) {
      t.name = name;
      const [main, rest] = nameParts(name);
      t.nameEl.replaceChildren(h("span", { class: "wsi-name-main" }, main), rest ? h("span", { class: "wsi-name-rest" }, rest) : "");
    }
    if (t.metaEl.textContent !== meta) t.metaEl.textContent = meta;
    const w = `${Math.round(share * 1000) / 10}%`;
    if (t.fill.style.width !== w) t.fill.style.width = w;
    if (t.badgeEl.textContent !== badge) t.badgeEl.textContent = badge;
    t.badgeEl.hidden = !badge;
    if (t.shortEl.textContent !== short) t.shortEl.textContent = short;
    t.shortEl.hidden = !short;
    if (t.how !== how) { t.how = how; t.howEl.replaceChildren(icon(how === "robot" ? "gripper" : "user", 14)); }
    t.el.dataset.state = state;
    t.el.dataset.how = how;
    t.el.setAttribute("aria-label", label);
  }

  // ---- what the model learned -----------------------------------------------------------------------------
  function renderLearned(st) {
    const rows = [];
    for (const c of st.corrections) {
      const it = st.world.item(c.sku);
      rows.push({ key: `c:${c.sku}:${c.at}`, time: clockOf(c.at), tone: "check", text: `${it?.name || "An item"}: ${grams(c.old)} → ${grams(c.new)} by the ${c.sensor}, for every unit of the item` });
    }
    if (st.unknown) {
      const e = entries.get(st.unknown.barcode);
      const units = lastE1(st)?.units ?? st.unknown.seen;
      const what = e?.status === "confirmed" ? `confirmed by you${e.name ? ` as ${e.name}` : ""}` : e?.status === "rejected" ? "rejected by you: it stays unknown" : e ? "a provisional entry waits for you" : "not in the model";
      rows.push({ key: `u:${st.unknown.barcode}`, time: clockOf(st.unknown.t), tone: e?.status === "confirmed" || e?.status === "rejected" ? "person" : "risk", text: `Barcode ${st.unknown.barcode}: ${what}; its ${int(units)} units went to a person` });
    }
    const key = rows.map((r) => `${r.key}|${r.text}`).join("\n");
    if (log.dataset.key === key) return;
    log.dataset.key = key;
    clear(log);
    if (!rows.length) {
      log.append(h("li", { class: "ws-none" }, running || ended ? "Nothing yet: every reading so far matches the model." : "Nothing yet: the night has not started."));
      return;
    }
    for (const r of rows) log.append(h("li", { dataset: { tone: r.tone } }, h("span", { class: "ws-log-time" }, r.time), " ", r.text));
  }

  // ---- size ------------------------------------------------------------------------------------------------
  const sizeOf = (hgt) => (hgt < SIZE_LIMITS.strip ? "strip" : hgt < SIZE_LIMITS.short ? "short" : hgt < SIZE_LIMITS.compact ? "compact" : "full");
  const fits = () => stage.scrollHeight <= stage.clientHeight + 1;
  let size = "full";
  function measure() {
    if (!root.offsetParent) return; // hidden (the Full view): measured again when shown
    const hgt = root.clientHeight;
    // The pallet steps aside only when the stage is short of room by far (the drawer open), never for a
    // few pixels: at 400 px and more "short" is the floor, and the stage scrolls as a last resort.
    const floor = hgt < SIZE_LIMITS.strip ? "flow" : "short";
    let next = sizeOf(hgt);
    stage.dataset.size = next;
    while (next !== floor && !fits()) { next = SIZES[SIZES.indexOf(next) + 1]; stage.dataset.size = next; }
    size = next;
  }
  let measuring = 0;
  function remeasure() { if (!measuring) measuring = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16))(() => { measuring = 0; measure(); }); }
  if (typeof ResizeObserver === "function") new ResizeObserver(remeasure).observe(root);

  function reset() {
    entries.clear(); request = null; running = false; ended = false;
    tileEls.clear(); clear(grid); log.dataset.key = "";
    schedule(true);
  }

  return { update, reset, invalidate: () => { measure(); schedule(true); }, size: () => size };
}
