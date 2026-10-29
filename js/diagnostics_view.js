// Diagnostics dialog: self-tests the Anthropic API from this browser and shows the synthetic world's
// integrity checks, the simulation scripts' checks, how the Open Food Facts lookup answers and the
// key-and-privacy row.

import { h, clear } from "./dom.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { TESTS, runAll, runTest, memory } from "./diagnostics.js";
import { APP } from "./config.js";

const STATUS_TEXT = { pass: "Pass", fail: "Fail", warn: "Check", skip: "Skipped", running: "Testing", idle: "Not run" };
const STATUS_ICON = { pass: "check", fail: "x", warn: "alert", skip: "info", idle: "info" };
// Each status is a Vici tag in its tone, with its icon and its word; skipped and not run are plain.
const STATUS_TAG = { pass: "vc-tag--success", fail: "vc-tag--danger", warn: "vc-tag--warning", running: "vc-tag--info", skip: "", idle: "" };

export function openDiagnostics() {
  const rows = new Map();
  const remembered = memory();
  const tbody = h("tbody");
  // Declared before the rows: setRow fills these lists as soon as a row is set.
  const worldList = h("ul", { class: "world-checks" });
  const scriptList = h("ul", { class: "world-checks script-checks" });
  for (const t of TESTS) {
    const statusCell = h("td", { class: "status" });
    const msCell = h("td", { class: "ms vc-tabular" }, "");
    const detailCell = h("td", { class: "detail" }, t.purpose);
    tbody.appendChild(h("tr", { dataset: { test: t.id } },
      h("td", {}, h("strong", {}, t.label), h("span", { class: "host" }, t.host)),
      statusCell, msCell, detailCell));
    rows.set(t.id, { statusCell, msCell, detailCell });
    const prev = remembered[t.id];
    setRow(t.id, prev ? { status: prev.status, detail: `${prev.detail} (earlier this session)` } : { status: "idle" });
  }

  function setRow(id, r) {
    const row = rows.get(id);
    if (!row) return;
    const s = r.status || "idle";
    clear(row.statusCell).appendChild(h("span", { class: ["vc-tag", STATUS_TAG[s] || "", "diag-status"], dataset: { s } },
      s === "running" ? h("span", { class: "vc-spinner vc-spinner--sm", "aria-hidden": "true" }) : icon(STATUS_ICON[s] || "info", 16), STATUS_TEXT[s] || s));
    row.msCell.textContent = r.ms ? `${r.ms} ms` : "";
    if (r.detail) row.detailCell.textContent = r.detail;
    const list = id === "world" ? worldList : id === "scripts" ? scriptList : null;
    if (list && r.checks) {
      clear(list);
      for (const c of r.checks) {
        // A check's result as a tag in its tone, with its icon and its word; one not run yet is plain.
        const s = c.pending ? "skip" : c.ok ? "pass" : "fail";
        list.appendChild(h("li", { dataset: { ok: String(!!c.ok), pending: String(!!c.pending) } },
          h("span", { class: ["vc-tag", STATUS_TAG[s], "world-mark"] }, icon(STATUS_ICON[s], 14), c.pending ? "Pending" : STATUS_TEXT[s]),
          h("span", {}, `${c.name}${c.detail ? ` — ${c.detail}` : ""}`)));
      }
    }
  }

  const runBtn = h("button", { class: "vc-button", type: "button", id: "btn-run-tests", autofocus: true }, icon("pulse", 18), "Run all tests");
  runBtn.addEventListener("click", async () => {
    if (runBtn.getAttribute("aria-disabled") === "true") return;
    runBtn.setAttribute("aria-disabled", "true");
    await runAll(setRow);
    runBtn.setAttribute("aria-disabled", "false");
  });

  const modal = openModal({
    title: "Diagnostics",
    intro: "Tests the connection to Anthropic from this browser, the synthetic world's integrity and how the key is kept. Run it on the presentation laptop and network before going on stage.",
    size: "wide",
    body: [
      h("div", { class: "vc-table-wrap diag-wrap" },
        h("table", { class: "vc-table diag-table" },
          h("thead", {}, h("tr", {}, h("th", {}, "Service"), h("th", {}, "Status"), h("th", {}, "Time"), h("th", {}, "Details"))),
          tbody)),
      h("div", { class: "diag-section" },
        h("h3", {}, "World data integrity"),
        h("p", {}, "Checks run locally on the synthetic world: the stores and their cut-offs, the item master, the night's allocation at 3,000 and 4,200 units, the barcodes, the scenarios, the shadow-mode record and the Open Food Facts file."),
        worldList),
      h("div", { class: "diag-section" },
        h("h3", {}, "Simulation scripts"),
        h("p", {}, "Each scripted replay is played headless through the agent's own tools on its night, once for every decision you can take: every tool call must pass the live guardrails, every placeholder resolve and every figure come from a tool result."),
        scriptList)
    ],
    footer: [
      h("span", { class: "dialog-note" }, `${APP.name} ${APP.version}. Without a key, the Anthropic test sends one request with no key: the API answers 401 and nothing is billed.`),
      runBtn
    ]
  });

  // The local checks need no network: show them straight away.
  for (const id of ["world", "scripts", "openfoodfacts", "privacy"]) {
    setRow(id, { status: "running" });
    runTest(id).then((r) => setRow(id, r));
  }
  return modal;
}
