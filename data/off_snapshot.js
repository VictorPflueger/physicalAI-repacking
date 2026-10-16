/*
 * REPACK PILOT — Open Food Facts snapshot, kept apart from the synthetic world (brief, "Data and
 * licences").
 *
 * Product data: Open Food Facts, https://world.openfoodfacts.org. Database under the Open Database
 * License (ODbL) 1.0, individual contents under the Database Contents License (DbCL) 1.0. Product
 * images are CC BY-SA and are not used.
 *
 * Status, 16 October 2026: no product record yet. The record for scenario 3's barcode is built from an
 * Open Food Facts API response (PLAN.md decision 3), never from a page summary, before the lookup
 * goes live in M3. Until then Simulation and Live have no snapshot to fall back on, and nothing uses
 * this file.
 *
 * Loaded as a classic script so the app works without any same-origin fetch.
 */
window.OFF_SNAPSHOT = {
  meta: {
    source: "Open Food Facts",
    url: "https://world.openfoodfacts.org",
    licence: "ODbL 1.0 (database), DbCL 1.0 (contents); images CC BY-SA, not used",
    attribution: "Product data: Open Food Facts, ODbL",
    api: "https://world.openfoodfacts.org/api/v2/product/{barcode}.json",
    status: "pending",
    note: "No record yet: added from an API response before M3."
  },
  products: {}
};
