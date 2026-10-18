// Open Food Facts lookup (tool open_lookup_barcode; PLAN.md §d.3, brief "Open Food Facts"): product data
// for a barcode the item master does not know. At most three lookups per run, each barcode once (the
// result is cached for the run), never in Simulation. In Live mode the API is read only when the
// configuration enables it (js/config.js OPEN_FOOD_FACTS.live, off until a browser probe shows that a
// page may read the API, TECH_NOTES §4, D3) and the source has not failed recently in this session
// (js/source_health.js); otherwise, and after any failure, the bundled snapshot answers
// (data/off_snapshot.js), with a note saying so. The lookup resolves; it never throws, except when
// the run is aborted.
//
// No product image is used (CC BY-SA), and no User-Agent is sent: Chromium drops a custom one on
// fetch (TECH_NOTES §4, P5).

import { OPEN_FOOD_FACTS } from "./config.js";
import { remember, recentFailure } from "./source_health.js";

const BARCODE = /^\d{8,14}$/;

/** The fields kept from a product record (DATA_SOURCES §4), in the tool result's words. */
export function productFields(p = {}) {
  return {
    code: String(p.code ?? ""),
    name: p.product_name || null,
    brands: p.brands || null,
    quantity: p.quantity || null,
    net_content: p.product_quantity !== undefined && p.product_quantity !== null && p.product_quantity !== ""
      ? `${p.product_quantity}${p.product_quantity_unit ? ` ${p.product_quantity_unit}` : ""}` : null,
    packaging: p.packaging_text || null,
    categories: Array.isArray(p.categories_tags) ? p.categories_tags.slice(0, 6) : []
  };
}

/**
 * Creates the lookup for one run. opts: { mode: "live" | "simulation", snapshot (window.OFF_SNAPSHOT),
 * config (OPEN_FOOD_FACTS), fetchImpl (window.fetch), memory ({ remember, recentFailure }) }.
 * Returns { lookup(barcode, { signal }) → Promise<result>, count(), sources() }.
 */
export function createOffLookup({ mode = "simulation", snapshot = globalThis.OFF_SNAPSHOT, config = OPEN_FOOD_FACTS, fetchImpl = globalThis.fetch?.bind(globalThis), memory = { remember, recentFailure } } = {}) {
  const cache = new Map();      // barcode → result
  let used = 0;                 // lookups that reached a source (live or snapshot)
  const log = [];               // { barcode, source, ok }
  const meta = snapshot?.meta || {};
  const attribution = config.attribution;

  function fromSnapshot(code, why) {
    const rec = snapshot?.products?.[code] || null;
    const base = { barcode: code, source: "bundled snapshot", attribution, product_page: config.productPage(code) };
    if (!rec) {
      return {
        ...base, found: false,
        note: `${why} The bundled snapshot holds no record for this barcode${meta.status === "pending" ? " yet (its record is pending, TECH_NOTES §4)" : ""}.`
      };
    }
    return {
      ...base, found: true, product: productFields(rec.product || rec), snapshot_date: rec.fetched || meta.fetched || null,
      note: `${why} Product data from the bundled snapshot${rec.fetched ? ` of ${rec.fetched}` : ""}, not a live reading.`
    };
  }

  async function fromApi(code, signal) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
    try {
      const res = await fetchImpl(config.productUrl(code), { method: "GET", signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
      if (res.status === 429) return { failed: `rate limited (429; the API allows ${config.ratePerMinute} product reads a minute)` };
      if (res.status >= 500) return { failed: `server error ${res.status}` };
      let json = null;
      try { json = await res.json(); } catch { return { failed: `unreadable answer (${res.status})` }; }
      // The API answers an unknown barcode with status 0 ("product not found"), often with a 404.
      if (json?.status === 0 || res.status === 404) return { answer: { found: false, note: `Open Food Facts has no product for this barcode (${json?.status_verbose || "product not found"}).` } };
      if (!res.ok) return { failed: `HTTP ${res.status}` };
      if (json?.status !== 1 || !json.product) return { failed: "unexpected answer" };
      return { answer: { found: true, product: productFields({ code, ...json.product }), note: "Live reading from the Open Food Facts API." } };
    } catch (e) {
      if (signal?.aborted) throw e;
      return { failed: e?.name === "AbortError" ? `no answer within ${Math.round(config.timeoutMs / 1000)} s` : "blocked or unreachable from this browser (network, firewall or CORS)" };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async function lookup(barcode, { signal } = {}) {
    const code = String(barcode ?? "").trim();
    if (!BARCODE.test(code)) return { error: `"${barcode}" is not a barcode (8 to 14 digits).` };
    if (cache.has(code)) return { ...cache.get(code), cached: true };
    if (used >= config.maxLookupsPerRun) {
      return { error: `Lookup cap reached: at most ${config.maxLookupsPerRun} Open Food Facts lookups per run (each barcode once). Use the results you have.`, refused: true };
    }
    used += 1;
    let result;
    if (mode !== "live") {
      result = fromSnapshot(code, "Simulation: no live request is made.");
    } else if (!config.live) {
      result = fromSnapshot(code, "Live Open Food Facts reads are not enabled in this build (TECH_NOTES §4).");
    } else if (memory.recentFailure(config.id)) {
      result = { ...fromSnapshot(code, "Open Food Facts failed earlier in this session, so it is skipped for now."), fallback: true };
    } else {
      const r = await fromApi(code, signal);
      if (r.answer) {
        memory.remember(config.id, "pass", "Product read", "tool");
        result = { barcode: code, source: "Open Food Facts API (live)", attribution, product_page: config.productPage(code), ...r.answer };
      } else {
        memory.remember(config.id, "fail", r.failed, "tool");
        result = { ...fromSnapshot(code, `The live lookup failed (${r.failed}).`), fallback: true };
      }
    }
    log.push({ barcode: code, source: result.source, found: !!result.found });
    cache.set(code, result);
    return result;
  }

  return { lookup, count: () => used, sources: () => log.slice() };
}
