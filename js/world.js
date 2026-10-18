// World data access for Repack Pilot: indexes over the synthetic world (stores, items, the night's
// allocation, waves, the cell, the manual station and the tote rule), the night-shift clock and the
// barcode check. Pure module (no DOM), shared by the UI, Diagnostics and the integrity checks; the
// engine, the night simulation and the agent's tools read the world through it too.
//
// Conventions (see data/world.js): times are clock times on the night shift, 22:00 to 06:00, and
// are compared as minutes after the shift start ("01:35" → 215). N1 is the normal night (3,000
// units), N2 the peak night (×1.4, 4,200 units).

export const NIGHTS = ["n1", "n2"];
const SHIFT_START = 22 * 60;

/** Minutes after 22:00 for a clock time on the night shift: "22:00" → 0, "01:35" → 215, "06:00" → 480. */
export function nightMinutes(time) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(time ?? ""));
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return NaN;
  return (h * 60 + min - SHIFT_START + 1440) % 1440;
}

/** Clock time for minutes after 22:00: 215 → "01:35". Fractions round to the nearest minute. */
export function clockTime(minutes) {
  const t = ((Math.round(Number(minutes)) + SHIFT_START) % 1440 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** True for a 13-digit code with a valid EAN-13 check digit. */
export function ean13Valid(code) {
  const s = String(code ?? "");
  if (!/^\d{13}$/.test(s)) return false;
  const sum = [...s.slice(0, 12)].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(s[12]);
}

/** Returns the raw synthetic world loaded by data/world.js. */
export function getWorldData() {
  const w = globalThis.WORLD;
  if (!w || !Array.isArray(w.items) || !Array.isArray(w.stores)) throw new Error("World data (data/world.js) is not loaded.");
  return w;
}

let cachedModel = null;
/** Returns the (cached) indexed model of the world. */
export function getModel() {
  if (!cachedModel) cachedModel = buildModel(getWorldData());
  return cachedModel;
}

/** Builds an indexed model from the raw world object; `problems` lists structural faults. */
export function buildModel(world) {
  const problems = [];
  const stores = mapById(world.stores || [], "id", "Store", problems);
  const items = mapById(world.items || [], "sku", "Item", problems);
  const waves = mapById(world.waves || [], "id", "Wave", problems);
  const byBarcode = new Map();
  for (const it of world.items || []) {
    if (byBarcode.has(it.barcode)) problems.push(`Barcode ${it.barcode} is used twice.`);
    byBarcode.set(it.barcode, it);
    if (!waves.has(it.wave)) problems.push(`${it.sku}: unknown wave ${it.wave}.`);
  }
  for (const night of NIGHTS) {
    const alloc = world.allocation?.[night];
    if (!alloc) { problems.push(`Allocation ${night} is missing.`); continue; }
    for (const [storeId, row] of Object.entries(alloc)) {
      if (!stores.has(storeId)) problems.push(`Allocation ${night}: unknown store ${storeId}.`);
      for (const [sku, n] of Object.entries(row)) {
        if (!items.has(sku)) problems.push(`Allocation ${night}: unknown SKU ${sku}.`);
        if (!Number.isInteger(n) || n < 0) problems.push(`Allocation ${night}: ${storeId}/${sku} is not a whole number of units.`);
      }
    }
    for (const s of world.stores || []) if (!alloc[s.id]) problems.push(`Allocation ${night}: store ${s.id} has no row.`);
  }
  for (const s of world.stores || []) {
    if (!Number.isFinite(nightMinutes(s.cutoff))) problems.push(`${s.id}: cut-off "${s.cutoff}" is not a clock time.`);
  }

  // Plan order: cut-off first, ties keep the route order (plan_rank).
  const planOrder = [...(world.stores || [])].sort((a, b) => nightMinutes(a.cutoff) - nightMinutes(b.cutoff) || a.plan_rank - b.plan_rank);

  const units = (storeId, sku, night = "n1") => world.allocation?.[night]?.[storeId]?.[sku] ?? 0;
  const storeUnits = (storeId, night = "n1") => Object.values(world.allocation?.[night]?.[storeId] || {}).reduce((a, b) => a + b, 0);
  const itemUnits = (sku, night = "n1") => (world.stores || []).reduce((a, s) => a + units(s.id, sku, night), 0);
  const totals = (night = "n1") => {
    let all = 0, cell = 0, expected = 0;
    for (const it of world.items || []) {
      const n = itemUnits(it.sku, night);
      all += n;
      if (it.cell) { cell += n; expected += n * it.success; }
    }
    return { units: all, cellUnits: cell, manualUnits: all - cell, expectedSuccesses: expected };
  };

  return { problems, world, stores, items, waves, byBarcode, planOrder, units, storeUnits, itemUnits, totals };
}

function mapById(list, key, label, problems) {
  const m = new Map();
  for (const x of list) {
    if (m.has(x[key])) problems.push(`${label} ${x[key]} is listed twice.`);
    m.set(x[key], x);
  }
  return m;
}
