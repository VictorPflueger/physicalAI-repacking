// Central configuration. Every value here is documented and verified in TECH_NOTES.md.

export const APP = {
  id: "rp",
  name: "Repack Pilot",
  fullName: "Repack Pilot, a Physical AI repacking showcase",
  version: "0.3.0"
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

// Live-agent guardrails (TECH_NOTES §9). A run stops at whichever limit it reaches first.
export const AGENT = {
  maxSteps: 40,          // model calls per run (a turn discarded by the max_tokens retry counts)
  budgetEur: 3.0,        // hard cost cap per run
  idleTimeoutMs: 90000,  // no streamed data for this long counts as a failed request
  transportRetries: 2,   // retries of one model call after a 429, 5xx, overload or network failure
  figureRetries: 2,      // a text with an unchecked amount is refused this often, then shown marked
  maxNudges: 2,          // times the agent is asked to carry on when it ends its turn early
  maxOutputTokens: 128000
};

// ECB euro reference rate of 15 Oct 2026: €1 = $1.1208, so 1 USD = 0.892 EUR. Fixed for a stable
// cost meter (TECH_NOTES §1).
export const FX_USD_EUR = 0.892;

// Open Food Facts (TECH_NOTES §4, DATA_SOURCES §4): product data for a barcode the item master does not
// know (tool open_lookup_barcode, js/openfoodfacts.js). Live reads stay off until a browser probe shows
// that a page may read the API (PLAN.md Appendix A, decision D3); until then Live mode answers from the
// bundled snapshot, as Simulation always does, and the host is in neither OPEN_DATA nor the page's
// connection policy. Turning `live` on adds the origin to OPEN_DATA, and index.html must list it then.
export const OPEN_FOOD_FACTS = {
  id: "open_food_facts",
  live: false,
  origin: "https://world.openfoodfacts.org",
  fields: ["code", "product_name", "brands", "quantity", "product_quantity", "product_quantity_unit", "packaging_text", "categories_tags"],
  productUrl(barcode) { return `${this.origin}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${this.fields.join(",")}`; },
  productPage(barcode) { return `${this.origin}/product/${encodeURIComponent(barcode)}`; },
  maxLookupsPerRun: 3,
  ratePerMinute: 15,      // documented limit: product reads per minute per IP address
  timeoutMs: 8000,
  attribution: "Product data: Open Food Facts, ODbL"
};

// Open data the app reads without a key: the live sources that are switched on. The CSP in index.html
// allows exactly api.anthropic.com plus these origins; js/diagnostics.js checks that the two lists
// match. Empty in this build (Open Food Facts answers from its snapshot, above).
export const OPEN_DATA = OPEN_FOOD_FACTS.live ? { [OPEN_FOOD_FACTS.id]: { origin: OPEN_FOOD_FACTS.origin } } : {};

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
  sessionCost: `${P}sessionCostEur`,    // sessionStorage: live spend in this tab
  assumptions: `${P}assumptions`,       // sessionStorage: the presenter's changed engine inputs
  introSeen: `${P}introSeen`,           // localStorage: the intro opens by itself only on a first visit
  consoleText: `${P}consoleText`        // localStorage: larger console text for projectors
};

export const UI = {
  defaultScenario: "SC1-EXPRESS",
  speeds: [1, 2, 4]
};
