// Popovers on the cell board (Rebate Hunter's board popovers, same mechanics): one at a time, a paper
// card with a tip pointing at what it explains. A station, a store lane or a world-model entry gets
// its popover beside it (to its right, else to its left, else centred over it); "below" places it
// under or over its anchor when there is room. Opens with a click or Enter; closes with its button,
// Escape or a click elsewhere, and gives focus back to what opened it, found again by its key when
// the board has redrawn it meanwhile.

import { h } from "./dom.js";
import { icon } from "./icons.js";

const PAD = 12;   // distance to the board's edges
const GAP = 12;   // distance to the anchor (the tip sits in it)
const MIN_H = 220; // a popover shorter than this is too cramped to read: it goes elsewhere

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** host: the board; resolve(key): the element that stands for a key now (after a redraw), or null. */
export function createPopover(host, { resolve = null } = {}) {
  const close = h("button", { class: "btn btn-ghost btn-icon pop-close", type: "button", "aria-label": "Close details" }, icon("x", 18));
  const body = h("div", { class: "pop-body" });
  const el = h("div", { class: "cell-pop", hidden: true, role: "dialog", tabindex: "-1" }, close, body);
  host.appendChild(el);
  let trigger = null;
  let key = null;

  close.addEventListener("click", () => hide(true));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); hide(true); }
  });
  // A click outside the popover (and outside what opened it) closes it.
  document.addEventListener("pointerdown", (e) => {
    if (el.hidden) return;
    if (el.contains(e.target) || current()?.contains(e.target)) return;
    hide(false);
  }, true);

  /** What opened the popover, or the element that stands for it after a redraw (shown, not hidden). */
  function current() {
    const shown = (x) => !!x?.isConnected && x.getClientRects().length > 0;
    if (shown(trigger)) return trigger;
    const again = key && resolve ? resolve(key) : null;
    if (!shown(again)) return null;
    trigger = again;
    return again;
  }

  /**
   * Shows content for `anchor` (what opened it, and gets the focus back); opening the same key again
   * closes it (a toggle). opts: { label, id: key, placement: "side" | "below", placeAt: element to
   * place against (default the anchor), tipAt: element the tip points at }
   */
  function show(anchor, content, { label = "Details", id = null, placement = "side", placeAt = null, tipAt = null } = {}) {
    if (!el.hidden && id && id === key) { hide(true); return; }
    trigger = anchor;
    key = id;
    body.replaceChildren(content);
    el.setAttribute("aria-label", label);
    el.hidden = false;
    place(placeAt || anchor, placement, tipAt || anchor);
    el.focus({ preventScroll: true });
  }

  function place(anchor, placement, tipAt) {
    const hb = host.getBoundingClientRect();
    const ab = anchor.getBoundingClientRect();
    const tb = tipAt.getBoundingClientRect();
    el.style.maxHeight = "";
    delete el.dataset.tip;
    const w = el.offsetWidth;
    const full = el.offsetHeight;
    if (placement === "below") {
      // Under the anchor (or over it), its tip at the middle of tipAt.
      const below = hb.bottom - ab.bottom - GAP - PAD;
      const above = ab.top - hb.top - GAP - PAD;
      const down = below >= Math.min(full, MIN_H) || (below >= above && below >= MIN_H);
      const up = !down && above >= Math.min(full, MIN_H);
      if (down || up) {
        const room = down ? below : above;
        if (full > room) el.style.maxHeight = `${Math.floor(room)}px`;
        const ht = el.offsetHeight;
        const tx = tb.left + tb.width / 2 - hb.left;
        const left = clamp(tx - w + 48, PAD, hb.width - w - PAD);
        const top = down ? ab.bottom - hb.top + GAP : ab.top - hb.top - GAP - ht;
        set(left, top, down ? "up" : "down", clamp(tx - left, 20, w - 20));
        return;
      }
      // No room under or over the anchor: beside tipAt.
      const left = clamp(tb.left - hb.left - GAP - w, PAD, hb.width - w - PAD);
      const ht = Math.min(full, hb.height - 2 * PAD);
      if (full > ht) el.style.maxHeight = `${Math.floor(ht)}px`;
      const top = clamp(tb.top - hb.top + tb.height / 2 - ht / 2, PAD, hb.height - ht - PAD);
      set(left, top, left + w <= tb.left - hb.left ? "right" : null, clamp(tb.top - hb.top + tb.height / 2 - top, 20, ht - 20));
      return;
    }
    // Beside the anchor: to its right, else to its left, else centred over it (no tip).
    const ht = Math.min(full, hb.height - 2 * PAD);
    if (full > ht) el.style.maxHeight = `${Math.floor(ht)}px`;
    let left = ab.right - hb.left + GAP;
    let tip = "left";
    if (left + w > hb.width - PAD) { left = ab.left - hb.left - GAP - w; tip = "right"; }
    if (left < PAD) { left = clamp(ab.left - hb.left + ab.width / 2 - w / 2, PAD, hb.width - w - PAD); tip = null; }
    const cy = ab.top - hb.top + ab.height / 2;
    const top = clamp(cy - ht / 2, PAD, hb.height - ht - PAD);
    set(left, top, tip, clamp(cy - top, 20, ht - 20));
  }

  function set(left, top, tip, at) {
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    if (tip) { el.dataset.tip = tip; el.style.setProperty("--tip", `${Math.round(at)}px`); }
  }

  /** Hides the popover; with `refocus`, focus goes back to what opened it. */
  function hide(refocus = false) {
    if (el.hidden) return;
    const t = refocus ? current() : null;
    el.hidden = true;
    body.replaceChildren();
    trigger = null;
    key = null;
    t?.focus({ preventScroll: true });
  }

  /** Replaces what the open popover shows (the night moved on), keeping its place, scroll and focus. */
  function update(content) {
    if (el.hidden) return;
    const scroll = body.scrollTop;
    body.replaceChildren(content);
    body.scrollTop = scroll;
  }

  return { show, hide, update, isOpen: () => !el.hidden, element: el, key: () => key };
}
