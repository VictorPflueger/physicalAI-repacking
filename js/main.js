// Entry point. Checks the data files, then imports and starts the UI. The UI is imported
// dynamically so that a failed module load is reported on the boot screen instead of leaving a
// blank page. Browsers never run this module from file:// — the boot screen in index.html explains
// that case on its own. Nothing is loaded from a third party: every file comes from this site.

import { APP } from "./config.js";

const REQUIRED_DATA = [
  ["WORLD", "data/world.js"],
  ["SCENARIOS", "data/scenarios.js"],
  ["SHADOW_RECORD", "data/shadow_record.js"],
  ["OFF_SNAPSHOT", "data/off_snapshot.js"]
];

boot().catch((err) => failBoot(err));

async function boot() {
  setBootStatus("Loading the synthetic world…");
  const missing = REQUIRED_DATA.filter(([name]) => !window[name]).map(([, file]) => file);
  if (missing.length) {
    throw new Error(`These data files did not load: ${missing.join(", ")}. Deploy them next to index.html and reload.`);
  }

  setBootStatus("Starting the workspace…");
  let ui;
  try {
    ui = await import("./ui.js");
  } catch (err) {
    throw new Error(`A program file failed to load (${err?.message || err}). Check that the js/ folder was deployed completely.`);
  }
  const { initUI, showBanner } = ui;
  const { redactSecrets } = await import("./keystore.js");

  const app = initUI();
  installErrorReporting(showBanner, redactSecrets);
  document.documentElement.dataset.boot = "ready";
  hideBoot();
  app.introOnFirstVisit();

  if (location.protocol === "file:") {
    showBanner({ level: "warn", title: "Opened from disk", text: "Serve this folder over http(s) for reliable behaviour, for example with python -m http.server 8000." });
  }
  console.info(`[Repack Pilot] ${APP.name} ${APP.version} ready.`);
}

// ---- boot screen ------------------------------------------------------------------------------

function setBootStatus(text) {
  const el = document.getElementById("boot-status");
  if (el) el.textContent = text;
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
  setBootStatus("Repack Pilot could not start.");
  const detail = document.getElementById("boot-detail");
  if (detail) {
    detail.textContent = String(err?.message || err);
    detail.hidden = false;
  }
}

// ---- last-resort error reporting --------------------------------------------------------------

function installErrorReporting(showBanner, redactSecrets) {
  let shown = 0;
  const report = (message) => {
    const text = redactSecrets(String(message || "")).slice(0, 280);
    // "Script error." comes from cross-origin scripts such as browser extensions: not ours.
    if (!text || text === "Script error." || shown >= 3) return;
    shown += 1;
    showBanner({
      level: "error",
      title: "Unexpected error",
      text: `${text} The audit log keeps everything recorded so far. If the screen looks wrong, use Reset.`,
      timeout: 15000
    });
  };
  window.addEventListener("error", (e) => report(e.message || e.error?.message));
  window.addEventListener("unhandledrejection", (e) => {
    if (e.reason?.name === "AbortError") return; // user-initiated aborts are expected
    report(e.reason?.message || e.reason);
  });
}
