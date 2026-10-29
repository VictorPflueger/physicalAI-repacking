// Dialogs: run-mode choice, the API key and the management summary.

import { h, copyText, downloadText, withTooltip, setTooltip } from "./dom.js";
import { renderMarkdown } from "./md.js";
import { aiLabel } from "./ai_label.js";
import { icon } from "./icons.js";
import { openModal } from "./modal.js";
import { ANTHROPIC, AGENT, APP, STORAGE } from "./config.js";
import { getKey, setKey, forgetKey, hasKey, looksLikeKey, maskKey } from "./keystore.js";
import { checkKey } from "./anthropic.js";
import { eur0 } from "./format.js";

/**
 * Ask which mode to run in. Resolves "simulation" | "live" | "key" (change or forget the stored key) | null.
 * runLabel: what will run (the scenario); simNote: a note on the Simulation of this scenario (no scripted
 * replay yet, or night inputs kept at the defaults), or null.
 */
export function chooseMode({ runLabel, simNote = null }) {
  return new Promise((resolve) => {
    let modal;
    const pick = (mode) => modal.close(mode);
    // Each card is one choice (Vici's interactive card): its button is the card's link, so a click
    // anywhere on the card makes the choice, and the keyboard still reaches the one button.
    const simCard = h("section", { class: "vc-card vc-card--interactive mode-card", dataset: { mode: "simulation" }, "aria-disabled": "false" },
      h("div", { class: "vc-card__body" },
        h("h3", { class: "vc-card__title" }, icon("play", 22), "Simulation"),
        h("span", { class: "vc-tag mode-tag", dataset: { mode: "simulation" } }, "SIMULATION"),
        h("ul", {},
          h("li", {}, "Scripted replay of a representative night through the agent's own tools and the same interface."),
          h("li", {}, "No API key, no cost, no model calls. Works fully offline."),
          h("li", {}, "Every hour and euro is still calculated by the engine."),
          h("li", {}, "Labelled SIMULATION throughout, including the audit export.")),
        h("div", { class: "mode-cta" },
          h("button", { class: "vc-button vc-button--outline vc-card__link", type: "button", on: { click: () => pick("simulation") } }, icon("play", 18), "Run simulation"))));
    const liveCard = h("section", { class: "vc-card vc-card--interactive mode-card", dataset: { mode: "live" } },
      h("div", { class: "vc-card__body" },
        h("h3", { class: "vc-card__title" }, icon("spark", 22), "Live agent"),
        h("span", { class: "vc-tag vc-tag--solid mode-tag", dataset: { mode: "live" } }, "LIVE"),
        h("ul", {},
          h("li", {}, "Real Claude reasoning with real tool calls against the simulated cell."),
          h("li", {}, "Runs on your own Anthropic API key, kept in this tab only."),
          h("li", {}, `Each run stops at ${AGENT.maxSteps} model calls or ${eur0(AGENT.budgetEur)}; the cost meter shows the spend live.`),
          h("li", {}, "The cell, camera and scale are simulated in both modes.")),
        h("div", { class: "mode-cta" },
          h("button", { class: "vc-button vc-card__link", type: "button", autofocus: true, on: { click: () => pick("live") } }, icon("key", 18), hasKey() ? `Use my key (${maskKey()})` : "Continue with my API key"))));

    // With a key stored, the footer offers the only other way to it: change it or forget it.
    const footer = hasKey()
      ? [
        h("span", { class: "dialog-note" }, "A key is stored for this tab: ", h("code", {}, maskKey())),
        h("button", { class: "vc-button vc-button--ghost button-compact", type: "button", id: "btn-manage-key", on: { click: () => pick("key") } }, icon("key", 16), "Change or forget key")
      ]
      : [];

    modal = openModal({
      title: "How should the agent run?",
      intro: "Live is the real thing. Simulation is for rehearsal, an offline fallback and exploring without a key.",
      body: [
        h("div", { class: "vc-card vc-card--flat run-summary" }, h("span", { class: "label" }, "Will run:"), h("strong", {}, runLabel)),
        simNote ? h("p", { class: "vc-alert stage-note", role: "note" }, icon("info", 18), h("span", { class: "vc-alert__body" }, simNote)) : null,
        h("div", { class: "mode-cards" }, simCard, liveCard)
      ],
      footer,
      onClose: (result) => resolve(result || null)
    });
  });
}

// The key dialog's message line: an error, or how the check goes (Vici's field help).
const ERROR = "vc-help vc-help--error field-msg";
const OK = "vc-help vc-help--success field-msg";

/** Ask for (or confirm) the API key. Resolves true when a key is stored and accepted. */
export function askApiKey({ reason = "" } = {}) {
  return new Promise((resolve) => {
    let modal;
    let accepted = false;
    // A key is not a password: password managers are asked not to offer to save it.
    const input = h("input", {
      class: "vc-input key-input", id: "api-key-input", name: "rp-api-key", type: "password", autocomplete: "off", spellcheck: "false",
      "data-1p-ignore": "", "data-lpignore": "true", "data-bwignore": "true", "data-form-type": "other",
      placeholder: "sk-ant-…", "aria-describedby": "api-key-help api-key-msg", autofocus: true
    });
    // Inside a frame another page could steer the clicks (clickjacking): live mode, and so the key,
    // needs Repack Pilot open in its own tab. Simulation works anywhere.
    const framed = (() => { try { return window.top !== window.self; } catch { return true; } })();
    const showBtn = h("button", { class: "vc-icon-button", type: "button" }, icon("eye", 20));
    const showTip = withTooltip(showBtn, "Show key");
    showBtn.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      showBtn.replaceChildren(icon(hidden ? "eyeOff" : "eye", 20));
      setTooltip(showBtn, hidden ? "Hide key" : "Show key");
    });
    const msg = h("div", { class: "vc-help vc-help--error field-msg", id: "api-key-msg", role: "status" }, reason);
    const saveBtn = h("button", { class: "vc-button", type: "button" }, icon("check", 18), "Check key and continue");
    const forgetBtn = h("button", { class: "vc-button vc-button--danger", type: "button", hidden: !hasKey() }, "Forget key");

    const current = hasKey()
      ? h("div", { class: "vc-alert vc-alert--neutral key-current" }, icon("key", 18), h("div", { class: "vc-alert__body" }, h("p", {}, "A key is stored for this tab: ", h("code", {}, maskKey()))))
      : null;

    async function save() {
      if (saveBtn.getAttribute("aria-disabled") === "true") return;
      if (framed) return;
      const raw = input.value.trim() || getKey() || "";
      if (!raw) { msg.className = ERROR; msg.textContent = "Paste your Anthropic API key (it starts with sk-ant-)."; input.focus(); return; }
      if (!looksLikeKey(raw)) { msg.className = ERROR; msg.textContent = "That does not look like an Anthropic API key. It should start with sk-ant-."; input.focus(); return; }
      saveBtn.setAttribute("aria-disabled", "true");
      msg.className = OK;
      msg.replaceChildren(h("span", { class: "vc-spinner vc-spinner--sm", "aria-hidden": "true" }), " Checking the key with Anthropic (free, no tokens used)…");
      const r = await checkKey(raw);
      saveBtn.setAttribute("aria-disabled", "false");
      if (r.ok) {
        setKey(raw);
        accepted = true;
        modal.close(true);
        return;
      }
      if (r.status === 0) {
        // Network or CORS problem: store the key anyway so the presenter can retry; say so clearly.
        setKey(raw);
        msg.className = ERROR;
        msg.textContent = `Could not reach api.anthropic.com to check the key (${r.error?.message}). The key is stored for this tab; run Diagnostics to investigate.`;
        forgetBtn.hidden = false;
        return;
      }
      msg.className = ERROR;
      msg.textContent = r.status === 401
        ? "Anthropic rejected this key (401). Check that it is active and copied completely."
        : /workspace/i.test(r.error?.message || "")
          ? `Anthropic answered ${r.status}: ${r.error.message} Use a key scoped to a single workspace.`
          : `Anthropic answered ${r.status}: ${r.error?.message || r.error?.type}.`;
    }

    saveBtn.addEventListener("click", save);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    forgetBtn.addEventListener("click", () => {
      forgetKey();
      input.value = "";
      forgetBtn.hidden = true;
      if (current) current.remove();
      msg.className = OK;
      msg.textContent = "Key removed from this tab.";
    });

    if (framed) {
      input.disabled = true;
      saveBtn.setAttribute("aria-disabled", "true");
      msg.className = ERROR;
      msg.textContent = `${APP.name} is running inside another page. Open it in its own tab to use live mode; Simulation works here.`;
    }

    modal = openModal({
      title: "Your Anthropic API key",
      intro: "Live mode runs on your own key. Billing goes to your Anthropic account.",
      size: "narrow",
      body: [
        h("div", { class: "vc-alert vc-alert--warning key-advice" }, icon("alert", 22), h("div", { class: "vc-alert__body" },
          h("p", {}, h("strong", {}, "Use a dedicated key with a low monthly spend limit"), " (for example $10)."),
          h("p", {}, `At platform.claude.com, create a workspace for ${APP.name} and set its spend limit under `,
            h("a", { href: ANTHROPIC.consoleWorkspacesUrl, target: "_blank", rel: "noopener noreferrer" }, "Workspaces"),
            ", then create a key scoped to that workspace under ",
            h("a", { href: ANTHROPIC.consoleKeysUrl, target: "_blank", rel: "noopener noreferrer" }, "API keys"), "."))),
        current,
        h("div", { class: "vc-field" },
          h("label", { class: "vc-label", for: "api-key-input" }, "API key"),
          h("div", { class: "input-row" }, input, showTip),
          h("span", { class: "vc-help", id: "api-key-help" }, "Masked while you type. Checked with a free call that uses no tokens."),
          msg),
        h("ul", { class: "key-facts" },
          h("li", {}, icon("check", 16), `Kept in this tab's session storage only, under ${APP.name}'s own name (${STORAGE.apiKey}); the browser drops it when the tab is closed (reopening a closed tab can bring it back). If the browser offers to save it as a password, decline. On a shared computer, click Forget key when you finish.`),
          h("li", {}, icon("check", 16), "Sent only to api.anthropic.com, never to any other host."),
          h("li", {}, icon("check", 16), "Never written to the console, logs or the audit export."))
      ],
      footer: [forgetBtn, saveBtn],
      onClose: () => resolve(accepted)
    });
  });
}

/** The management summary in a wide dialog, with copy and download. */
export function showReport(markdown, { mode } = {}) {
  const status = h("span", { class: "dialog-note", role: "status" }, mode === "simulation" ? "Simulated run: the words were scripted; every figure was computed by the engine and the night simulation." : "");
  const copyBtn = h("button", { class: "vc-button vc-button--outline", type: "button" }, icon("copy", 18), "Copy text");
  copyBtn.addEventListener("click", async () => {
    status.textContent = (await copyText(markdown)) ? "Copied to the clipboard." : "Copy failed; use Download instead.";
  });
  const dlBtn = h("button", { class: "vc-button", type: "button", id: "btn-download-report" }, icon("download", 18), "Download .md");
  dlBtn.addEventListener("click", () => {
    const sim = mode === "simulation";
    const text = sim ? `> SIMULATION: scripted replay on a simulated cell, not a live run.\n\n${markdown}` : markdown;
    downloadText(`${sim ? "SIMULATION-" : ""}repack-pilot-management-summary.md`, text, "text/markdown");
  });
  return openModal({
    title: "Management summary",
    className: "report-modal",
    size: "wide",
    body: [renderMarkdown(markdown)],
    footer: [aiLabel("report"), status, copyBtn, dlBtn]
  });
}
