// The two views of the workspace (TECH_NOTES D62). The Customer view, the default, puts the robot's
// world model at the centre and What it is worth beside it, with the agent console below that: the
// five-minute customer call. The Full view is the M4 screen: the cell board with every store lane and
// station, and the console beside it. Both show the same run: switching never restarts or replays the
// night. The choice is remembered in this browser (local storage, under the app's own prefix).

import { STORAGE } from "./config.js";

export const VIEWS = [
  { id: "customer", label: "Customer", title: "The world model and what it is worth: the five-minute customer view" },
  { id: "full", label: "Full", title: "Every store lane and station of the cell board, as in M4" }
];
export const DEFAULT_VIEW = "customer";

export function readView() {
  try {
    const v = localStorage.getItem(STORAGE.view);
    return VIEWS.some((x) => x.id === v) ? v : DEFAULT_VIEW;
  } catch { return DEFAULT_VIEW; }
}

export function writeView(v) {
  try { localStorage.setItem(STORAGE.view, v); } catch { /* storage blocked: the view holds for this page only */ }
}

/** Sets the view on the page: the body's data-view drives the layout (css/stage.css). */
export function applyView(v) {
  document.body.dataset.view = v;
}
