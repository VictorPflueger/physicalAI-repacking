// Self-tests run from the presenter's browser: the Anthropic API (a keyless probe, or a free key
// check when a key is stored), the synthetic world's integrity and the key-and-privacy row, which
// also checks that the page's content security policy allows exactly the hosts in js/config.js.
// The Open Food Facts row joins with the lookup in M3. Network results feed the data-source memory
// (js/source_health.js).

import { APP, STORAGE, CONNECT_ORIGINS } from "./config.js";
import { checkKey, probeEndpoint } from "./anthropic.js";
import { getKey, redactSecrets } from "./keystore.js";
import { checkWorld } from "./world_check.js";
import { buildAuditExport } from "./audit.js";
import { remember, memory as sourceMemory } from "./source_health.js";

export const TESTS = [
  { id: "anthropic", label: "Anthropic API", host: "api.anthropic.com", purpose: "Live agent (Claude)" },
  { id: "world", label: "World data integrity", host: "local", purpose: "Synthetic world, scenarios and their nights, night calibration, shadow record, Open Food Facts snapshot" },
  { id: "privacy", label: "Key and privacy", host: "local", purpose: "Key kept in this tab only, under this app's own name, never exported; connections limited by the page's security policy" }
];

const KEY_LIKE = /sk-ant-(?!\[REDACTED\])[A-Za-z0-9_-]{8,}/;

/** Remembered results of this session (Diagnostics and tools), for the dialog. */
export function memory() {
  return sourceMemory();
}

/** The connect-src origins of the page's content security policy (meta tag), in order. */
export function cspConnectOrigins(doc = document) {
  const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") || "";
  return (/connect-src([^;]*)/.exec(csp)?.[1] || "").trim().split(/\s+/).filter(Boolean);
}

const RUNNERS = {
  async anthropic() {
    const key = getKey();
    if (!key) {
      const r = await probeEndpoint();
      return { status: r.ok ? "pass" : "fail", ms: r.ms, detail: r.ok ? `${r.detail} Add your key in Live mode to check it.` : r.detail };
    }
    const r = await checkKey(key);
    if (!r.ok) {
      const msg = r.status === 401 ? "Key rejected (401). Check that it is active and copied completely." : `${r.error?.type || "error"}: ${r.error?.message || ""}`;
      return { status: "fail", ms: r.ms, detail: msg };
    }
    const missing = r.missing.length ? ` Missing for this key: ${r.missing.join(", ")}.` : ` All three ${APP.name} models are available.`;
    return { status: r.missing.length ? "warn" : "pass", ms: r.ms, detail: `Key valid (free check, no tokens used).${missing}` };
  },
  async privacy() {
    const issues = [];
    const notes = [];
    // 1. The browser enforces where the page may connect, and the policy must equal the config.
    const connect = cspConnectOrigins();
    const extra = connect.filter((x) => !CONNECT_ORIGINS.includes(x));
    const missing = CONNECT_ORIGINS.filter((x) => !connect.includes(x));
    if (!connect.length) issues.push("no connection policy found");
    else if (extra.length) issues.push(`the policy also allows ${extra.join(", ")}`);
    else if (missing.length) issues.push(`the policy does not allow ${missing.join(", ")}, which the app needs`);
    else notes.push(`connections limited to ${connect.map((x) => new URL(x).host).join(", ")}, as configured`);
    // 2. The key lives in this tab's session storage only, under this app's own name.
    let inLocal = false;
    let foreign = 0;
    try { for (let i = 0; i < localStorage.length; i++) if (KEY_LIKE.test(localStorage.getItem(localStorage.key(i)) || "")) inLocal = true; } catch { /* storage unavailable */ }
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k !== STORAGE.apiKey && KEY_LIKE.test(sessionStorage.getItem(k) || "")) foreign += 1;
      }
    } catch { /* storage unavailable */ }
    if (inLocal) issues.push("an API key was found in local storage");
    notes.push(getKey() ? `your key is stored for this tab only (${STORAGE.apiKey})` : "no key stored");
    if (foreign) notes.push(`another app on this site address keeps ${foreign} key${foreign === 1 ? "" : "s"} in this tab under its own name`);
    // 3. Nothing exported can carry the key.
    const sample = getKey() || "sk-ant-EXAMPLE-not-a-real-key-0000";
    if (redactSecrets(`x ${sample} y`).includes(sample)) issues.push("key redaction failed");
    if (KEY_LIKE.test(buildAuditExport())) issues.push("the audit export contains a key");
    else notes.push("audit export checked");
    const text = issues.length ? `${issues.join("; ")}.` : `${notes.join("; ")}.`;
    return { status: issues.length ? "fail" : "pass", ms: null, detail: text.charAt(0).toUpperCase() + text.slice(1) };
  },
  async world() {
    // The night checks simulate every scenario and the 14 calibration seeds (about a second): let the
    // "running" state paint first.
    await new Promise((r) => setTimeout(r, 30));
    const started = performance.now();
    const res = checkWorld(globalThis.WORLD, globalThis.SCENARIOS || [], globalThis.SHADOW_RECORD || null, globalThis.OFF_SNAPSHOT || null);
    const passed = res.checks.filter((c) => c.ok).length;
    return { status: res.ok ? "pass" : "fail", ms: Math.round(performance.now() - started), detail: `${passed}/${res.checks.length} integrity checks passed.`, checks: res.checks };
  }
};

/** Run one test; network results are remembered for tool fallbacks. */
export async function runTest(id) {
  const fn = RUNNERS[id];
  if (!fn) return { status: "skip", detail: "Unknown test." };
  const r = await fn();
  if (!["world", "privacy"].includes(id)) remember(id, r.status, r.detail, "diagnostics");
  return r;
}

/** Run all tests in parallel, reporting each result as it arrives. */
export async function runAll(onResult) {
  const results = {};
  await Promise.all(TESTS.map(async (t) => {
    onResult?.(t.id, { status: "running" });
    const r = await runTest(t.id);
    results[t.id] = r;
    onResult?.(t.id, r);
  }));
  return results;
}
