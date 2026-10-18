// Central configuration. Every value here is documented and verified in TECH_NOTES.md.

export const APP = {
  id: "rp",
  name: "Repack Pilot",
  fullName: "Repack Pilot, a Physical AI repacking showcase",
  version: "0.2.0",
  // What this build can do yet (shown when a night starts). Removed once the agent with its scripted
  // replays (M3) is in.
  stage: "Night preview (v0.2.0): the cell, the world model and the engine run tonight without the agent. The agent, its options and the scripted replays arrive with M3.",
  // Shown in the mode choice while the build has no agent (removed in M3).
  stageNote: "This build plays the night without the agent in either mode: a night preview with no model calls. The agent arrives with M3."
};

export const ANTHROPIC = {
  messagesUrl: "https://api.anthropic.com/v1/messages",
  modelsUrl: "https://api.anthropic.com/v1/models?limit=100",
  apiVersion: "2023-06-01",
  // Header that enables CORS for direct browser calls (verified by live probe, TECH_NOTES §3).
  browserHeader: "anthropic-dangerous-direct-browser-access",
  // Server-side web search stays off in Repack Pilot (TECH_NOTES §2); its price stays here so the
  // cost maths is complete if a response ever reports a search.
  webSearchUsdPer1000: 10,
  // Spend limits are set per workspace (not per key, and not on the Default Workspace), so the
  // advice is: a dedicated workspace with a monthly spend limit, and a key scoped to it.
  consoleKeysUrl: "https://platform.claude.com/settings/keys",
  consoleWorkspacesUrl: "https://platform.claude.com/settings/workspaces"
};

// Prices in USD per million tokens (TECH_NOTES §1, verified 16 Oct 2026; the same list, default and
// price handling as Rebate Hunter 7.1.0).
export const MODELS = [
  {
    id: "claude-sonnet-5-5", label: "Sonnet 5.5", hint: "Balanced. Recommended for the demo.",
    effort: "medium", maxTokens: 16000,
    price: { input: 2.0, output: 10.0, cacheWrite: 2.5, cacheRead: 0.1 }
  },
  {
    id: "claude-haiku-5-5", label: "Haiku 5.5", hint: "Fastest and cheapest.",
    effort: "medium", maxTokens: 12000,
    price: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01,
      longPrompt: { thresholdTokens: 100000, input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 } }
  },
  {
    id: "claude-opus-5-5", label: "Opus 5.5", hint: "Deepest reasoning, highest cost.",
    effort: "high", maxTokens: 16000,
    price: { input: 4.0, output: 20.0, cacheWrite: 5.0, cacheRead: 0.2 }
  }
];
export const DEFAULT_MODEL = "claude-sonnet-5-5";

// Live-agent guardrails (TECH_NOTES §9 from M3). A run stops at whichever limit it reaches first.
export const AGENT = {
  maxSteps: 40,          // model calls per run
  budgetEur: 3.0,        // hard cost cap per run
  idleTimeoutMs: 90000,  // no streamed data for this long counts as a failed request
  maxOutputTokens: 128000
};

// ECB euro reference rate of 15 Oct 2026: €1 = $1.1208, so 1 USD = 0.892 EUR. Fixed for a stable
// cost meter (TECH_NOTES §1).
export const FX_USD_EUR = 0.892;

// Open data the app reads without a key (TECH_NOTES §4). None in this build: Open Food Facts joins
// with the lookup in M3, once a browser probe has shown that it may be read (PLAN.md decision 3). The
// CSP in index.html allows exactly api.anthropic.com plus these origins; js/diagnostics.js checks
// that the two lists match.
export const OPEN_DATA = {};

/** Every origin the page may connect to: the Messages API and the open-data hosts above. */
export const CONNECT_ORIGINS = [new URL(ANTHROPIC.messagesUrl).origin, ...Object.values(OPEN_DATA).map((d) => d.origin)];

// Every browser storage key, all under this app's own prefix. GitHub Pages serves all of an
// account's project sites from one origin, so a sister app (Rebate Hunter uses "rh.", the Navigator
// "nav.") must never share a key with this one: no shared API key, intro flag, cost total or
// failure memory.
const P = `${APP.id}.`;
export const STORAGE = {
  apiKey: `${P}anthropic.key`,          // sessionStorage: this tab only
  diagnostics: `${P}diag`,              // sessionStorage: data sources that failed recently
  model: `${P}model`,                   // sessionStorage
  speed: `${P}speed`,                   // sessionStorage
  scenario: `${P}scenario`,             // sessionStorage
  sessionCost: `${P}sessionCostEur`,    // sessionStorage: live spend in this tab (M3)
  assumptions: `${P}assumptions`,       // sessionStorage: the presenter's changed engine inputs
  introSeen: `${P}introSeen`,           // localStorage: the intro opens by itself only on a first visit
  consoleText: `${P}consoleText`        // localStorage: larger console text for projectors
};

export const UI = {
  defaultScenario: "SC1-EXPRESS",
  speeds: [1, 2, 4]
};
