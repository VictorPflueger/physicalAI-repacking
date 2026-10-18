# TECH_NOTES — verified facts and build decisions

Repack Pilot calls the Claude API directly from the browser. Its Open Food Facts lookup is built and answers from the bundled snapshot until a browser probe shows that a page may read the API (§4). Every external detail the code depends on is recorded here with its source and the date it was verified. If a fact changes, update this file first, then `js/config.js`.

**Basis.** Version **0.3.0** (milestone M3, the agent), 18 October 2026. Repack Pilot runs on Rebate Hunter's browser client, run-event bus, agent loop, key handling, Diagnostics and design system (Rebate Hunter 7.1.0, commit `009a38b`); `PLAN.md` §a.4 lists what is copied, adapted or replaced, file by file. Sections 1–6 hold the facts this build depends on, verified on 16 October 2026 and re-read for M3 on 18 October 2026. Section 7 describes the engine and the night simulation (M2, scenario 1 tuned in M3), section 9 the live agent's guardrails and section 10 the simulation scripts (M3). Section 8 is the decision log, section 11 the verification log and section 12 the acceptance checklist.

Times are UTC unless marked CEST.

---

## 1. Claude models and token prices (cost meter inputs)

Sources: `https://platform.claude.com/docs/en/about-claude/models/overview` and `https://platform.claude.com/docs/en/about-claude/pricing`, read in Phase 0 (`PLAN.md` §1.4, P9 and P10), again for M1 on 16 Oct 2026 at 09:54 and, the pricing page, for M3 on 18 Oct 2026 at 18:40. Every read gave the figures below.

| Label | API model ID | Input $/MTok | Output $/MTok | 5-min cache write $/MTok | Cache read $/MTok | Context | Max output |
|---|---|---|---|---|---|---|---|
| Haiku 5.5 — fast, cheapest | `claude-haiku-5-5` | 0.10 (prompt ≤ 100k tok) / 0.50 (> 100k) | 0.50 / 2.50 | 0.125 / 0.625 | 0.01 / 0.05 | 1M | 128K |
| **Sonnet 5.5 — default** | `claude-sonnet-5-5` | 2.00 | 10.00 | 2.50 | 0.10 | 1M | 128K |
| Opus 5.5 — deepest | `claude-opus-5-5` | 4.00 | 20.00 | 5.00 | 0.20 | 1M | 128K |

- The list, the default and the price handling are the same as Rebate Hunter's `js/config.js` (project instructions); every figure above matched both the documentation and that file on 16 Oct 2026.
- The overview also lists **Claude Fable 5.1** (`claude-fable-5-1`, $10 / $50 per MTok). It is not in the reference list and is not added.
- Haiku 5.5 is priced in two tiers by prompt size. The pricing page: prompts "over 100,000 tokens" take the higher tier, a prompt's length counts all input tokens including cache reads and cache writes, and each request is priced on its own. The cost meter picks the tier per request from `input_tokens + cache_creation_input_tokens + cache_read_input_tokens > 100000` (`js/cost.js`, tested in `tests/unit.mjs`).
- One-hour cache writes (Sonnet $4, Haiku $0.20 or $1, Opus $8 per MTok) are not priced: Rebate Hunter's agent loop, which M3 carries over, sets `cache_control: { type: "ephemeral" }` without a `ttl`, which is the five-minute cache.
- The Models API (`GET /v1/models`) is free. The key dialog and Diagnostics use it to check a key and confirm the three model IDs.
- **USD → EUR.** The API bills in USD; the cost meter converts at a fixed **1 USD = 0.892 EUR** (`FX_USD_EUR`). Source: ECB euro reference rates, `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, reference date 15 Oct 2026, USD 1.1208 (1 / 1.1208 = 0.8922), read again at 09:54 on 16 Oct 2026. Rebate Hunter fixed 0.894 on 12 Oct 2026.
- **Run caps** (`AGENT`): 40 model calls and €3 per run, a 90 s idle limit (project instructions). In force since M3 (§9).
- **Cost per run:** not measured with a real key yet; Victor runs the first real Live check. The live suite's fake run of scenario 1 bills 19 model calls at €0.16, but its token counts are made up: it proves the arithmetic (the cost meter equals the usage at Sonnet 5.5's prices × 0.892, `tests/live.mjs`), not what a real run costs.

## 2. Server-side web search tool

- **Off.** The project instructions keep Rebate Hunter's server-side web search off unless the plan argues for it; `PLAN.md` §e.5 does not. The agent's tools give it what the night needs, the evidence stays inside the simulated world, and the content security policy keeps one host for the model.
- Price for reference: $10 per 1,000 searches plus tokens (pricing page, 16 Oct 2026). `ANTHROPIC.webSearchUsdPer1000` stays in the config only so the cost maths stays complete; no request ever carries the tool.
- Rebate Hunter's paid web-search probe (`probeWebSearch`) is removed from `js/anthropic.js`.

## 3. Messages API from the browser (CORS, headers, protocol)

**Probes, 16 Oct 2026** (`PLAN.md` §1.4). P1–P3 with curl from this build environment at 09:00, repeated for M1 at 09:55 with the same results; P4 from a real page in headless Chromium 141.0.7390.37 (Playwright 1.56.0) through the environment's proxy, page served on `127.0.0.1`, at 09:00. For M1, Diagnostics itself ran the keyless probe from Chromium against the live API (§11).

| # | Request | Result |
|---|---|---|
| P1 | `OPTIONS /v1/messages` with `Origin` and the four request headers | 200; `access-control-allow-origin: *`; `access-control-allow-headers` echoes `anthropic-version, content-type, anthropic-dangerous-direct-browser-access, x-api-key`; `access-control-max-age: 600` |
| P2 | `POST /v1/messages` without a key, with `anthropic-dangerous-direct-browser-access: true` | 401 `authentication_error` ("x-api-key header is required"); `access-control-allow-origin: *`; `access-control-expose-headers: *` |
| P3 | the same without the header | 401 **without** `access-control-allow-origin`: a browser blocks it |
| P4 | P2 and P3 from the page | With the header the page reads status 401 and `access-control-allow-origin: *`; without it `fetch` fails (`TypeError: Failed to fetch`, `net::ERR_FAILED`): a CORS block |

**Request.** `POST https://api.anthropic.com/v1/messages` with `x-api-key` (from session storage only), `anthropic-version: 2023-06-01`, `content-type: application/json` and `anthropic-dangerous-direct-browser-access: true`. **The header is mandatory** (P3, P4). `GET /v1/models` with the header is CORS-enabled too; the key dialog uses it as a free key check.

**Keyless probe.** Diagnostics without a stored key sends one `POST /v1/messages` with no key and a one-token request to Haiku. The API answers 401, which the page can read only because CORS works: reachable, nothing billed. With a key stored, Diagnostics runs the free `GET /v1/models` check instead.

**Streaming protocol.** `js/sse.js` and `js/anthropic.js` are Rebate Hunter's (verified there against `platform.claude.com/docs` and live probes on 12 Oct 2026): SSE over `fetch`, LF or CRLF split anywhere, cumulative usage in `message_delta`, mid-stream `error` events raised as API errors, a body without a stop reason treated as an interrupted connection, a 90 s idle limit including the wait for headers, retries for 429 (honouring `retry-after`, never for spend-limit 429s), 5xx, 529 and network errors. `tests/unit.mjs` covers all of it.

**The agent loop's request, re-verified for M3** (18 Oct 2026, 18:30–18:45, against `platform.claude.com/docs/en/build-with-claude/effort`, `…/thinking`, `…/prompt-caching` and `…/api/handling-stop-reasons`):

| Field or rule | What the loop does (`js/agent.js`) | What the documentation says |
|---|---|---|
| `output_config.effort` | `medium` for Sonnet 5.5 and Haiku 5.5, `high` for Opus 5.5 (`MODELS`) | GA, no beta header; values `low` to `max`. Sonnet 5.5's default is `high`, and its guidance for multistep tool use is "start with `medium` for well-specified tasks"; Opus 5.5 and Haiku 5.5 default to `medium` |
| `thinking` | `{ type: "adaptive", display: "summarized" }`, so the console can show the reasoning | Thinking is on by default on the 5.5 models; `display` is `"omitted"` by default there, `"summarized"` returns readable summaries |
| Thinking blocks | Passed back complete and unchanged with their signatures (the fake checks every earlier turn byte for byte) | "Pass every `thinking` block back to the API complete and unmodified"; modified blocks are rejected with a 400; `redacted_thinking` blocks too |
| `cache_control` | Top level, `{ type: "ephemeral" }` | Automatic caching: the breakpoint moves with the conversation; 5-minute lifetime by default; minimum 512 tokens on the 5.5 models |
| `pause_turn` | Resend the conversation as it is | "Send the assistant content back to continue"; it comes only from server tools, which this build does not use, so it is a safeguard |
| `max_tokens` with a cut tool call | Discard the turn and retry once with 1.5 × the room | "Retry the request with a higher `max_tokens` value to get the full tool use" |
| `refusal`, `model_context_window_exceeded` | End the run with a plain message | Refusal: "retry on a fallback model"; the context-window stop needs no beta header on Sonnet 4.5 and later |
| Tool results | One user message of `tool_result` blocks, one per `tool_use`, first; a nudge to continue goes after them | The continuation must hold the `tool_result` blocks; text after them ends the assistant turn, which for a server tool gives a 400. No server tool is used here |

P2 repeated with curl at 18:45 on 18 Oct 2026: 401 without a key, as before.

## 4. Open data: Open Food Facts

Status, 18 Oct 2026: **not probed.** This build environment's network allow-list refuses the host: Chromium got `net::ERR_TUNNEL_CONNECTION_FAILED` at 08:09 and 09:00 on 16 Oct (`PLAN.md` §1.4, P6), and curl from the shell got `CONNECT tunnel failed, response 403` at 09:55 on 16 Oct and again at 18:45 on 18 Oct. The browser probe in `PLAN.md` Appendix A is for Victor's own Chrome (decision D3); its console line has not reached the build yet, so whether a browser may read the API stays open. This build makes no request to the host, and the content security policy does not list it (§6).

**What M3 built** (`js/openfoodfacts.js`, D40): the agent's tool `open_lookup_barcode` with a cache, a cap of 3 lookups per run, a memory of sources that failed, and the bundled snapshot as default and fallback. Live reads are off (`OPEN_FOOD_FACTS.live = false`), so in both modes every lookup answers from `data/off_snapshot.js`, which still holds no record (D14): a lookup of the scenario's barcode answers "not in the snapshot" until the record exists. With live reads on, a 429, a 5xx or a network failure falls back to the snapshot and is remembered for the run; a 404, or status 0, counts as an answer ("not found"). `tests/unit.mjs` drives the module with fake responses for each case. Scenario 3, which uses the lookup, gets its script in M4.

Facts from the API documentation, `https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/`, read in Phase 0 (P7) and again at 09:57 on 16 Oct 2026:

| Topic | What the documentation says | What Repack Pilot does (from M3) |
|---|---|---|
| Hosts | Production `https://world.openfoodfacts.org`; staging `https://world.openfoodfacts.net` with basic auth `off` / `off` | Production, read only |
| Reads | No authentication other than the custom User-Agent | `GET /api/v2/product/{barcode}.json` with a field list |
| User-Agent | "should be in the form of `AppName/Version (ContactEmail)`" | Not sent: Chromium drops a custom `User-Agent` on `fetch` (probe P5 below). Recorded as a known deviation |
| Rate limits | 15 product reads and 10 searches per minute per IP address | At most 3 lookups per run, cached; no search |
| CORS | Not mentioned | Probe before relying on it (Appendix A); the bundled snapshot is the default and the fallback |
| Licence | Database ODbL, contents DbCL, images CC BY-SA | Records in `data/off_snapshot.js`, apart from the synthetic world, with "Product data: Open Food Facts, ODbL" and a link; no product images |

**P5, custom User-Agent from a page** (Chromium 141, 16 Oct 2026, 08:09): a cross-origin `fetch` with a custom `User-Agent` to a local echo server arrived with Chromium's own `HeadlessChrome/141.0.7390.37` agent and without a preflight. The custom value is dropped silently.

**Product page** (page fetcher, 16 Oct 2026, P8 and again at 09:57; the API path is disallowed for the fetcher by robots.txt): `4037848020859` is "Bio Elisen-Lebkuchen vegan – Nürnberger Bio Originale – 210g", brand Nürnberger Bio Originale, quantity 210g, sold in Germany, packaging "not filled in". It is scenario 3's unknown barcode (decision D4). `data/off_snapshot.js` holds no record yet (status `pending`): the record is built from an API response, never from a page summary (D3, D14).

## 5. The synthetic world

**World 1.1.0** (`data/world.js`, generated by `tools/build_world.mjs`; everything is Synthetic). The fictional retailer **Ruhrkorb** and its DC **Ruhrkorb DC Unna** in a real logistics cluster by the Kamener Kreuz; twelve stores in real towns of the Ruhr area and its eastern neighbours, in plan order (cut-off first, ties by route order), with truck cut-offs from 01:35 (Essen) to 06:00 (Schwerte) and a second truck at 02:45 at the Dortmund flagship for express orders (03:30 in world 1.0.0; changed in M3, D32); 24 own-label SKUs with weight, size, fragility, grip and per-SKU grasp success; two inbound waves (ambient at 22:00, chilled at 01:00); one cell at 500 attempts per hour with a 3 kg payload and no vendor named; one picker at 400 picks per hour; a 15 kg tote limit. The tables are `PLAN.md` §b.2–b.4.

- **Allocation.** Each SKU's units are spread over the stores in proportion to store size by an integer fit with exact row and column totals, the method of the Phase 0 calibration model, so the M2 night simulation reproduces the calibrated night. N1 is 3,000 units, N2 4,200 (every store and SKU × 1.4, all whole numbers).
- **s and p.** The 18 cell SKUs carry 2,100 of the 3,000 units (s = 0.70) and their unit-weighted success is exactly 0.91 (Σ units × success = 1,911.0), at N1 and N2.
- **The glass jar.** S07's item master holds 200 g, the net content on its label; the simulated scale will read 400 g (scenario 2). Every other SKU's master weight equals its scale weight.
- **Barcodes.** Item barcodes are GS1 restricted circulation numbers with prefix 20 and a valid EAN-13 check digit. GS1 member organisations "may assign one or several of the GS1 Prefixes 02, 20 through 29" for fixed-measure items within a region or a company, and "RCNs are not GTINs" (GS1 General Specifications Change Notification, work request 23-006, "RCN updates", ratified March 2023, `https://www.gs1.org/docs/barcodes/GSCN-23-006-RCN.pdf`, read 16 Oct 2026 at 09:57). The world checks also require scenario 3's barcode to be a valid GTIN outside the item master. The plan's check that the snapshot holds its record (`PLAN.md` §b.7, item 7) joins when the record exists (D14).
- **Shadow-mode record** (`data/shadow_record.js`, generated from a fixed seed): 138 decisions over 7 nights, 128 of them the same as the person's (92.8 %), no missed escalation, no agent-caused missed cut-off. The brief's example gate needs 200 decisions over 10 nights at 95 % agreement, so it fails on three counts on purpose (`js/autonomy.js`).
- **Integrity checks** (`js/world_check.js`, in Node through `tools/check_world.mjs` and in the browser through Diagnostics): 14 checks, 11 on the world and its files and three on the nights (every scenario's night builds; the calibration holds on all 14 seeds; every scenario's night is reproducible), plus, in Node, a check that the generated files are current. `tests/unit.mjs` breaks the world in 14 ways and requires the right check to fail each time.
- **Night calibration.** The cut-offs and the chilled wave come from the Phase 0 scratch model (`PLAN.md` §b.8). Since M2 the night simulation itself is calibrated: `tools/calibrate_night.mjs` and the world check run the four targets on the 14 seeds with `js/nightsim.js`, and all four hold on all of them (§7.3).
- **Names.** "Ruhrkorb" was web-searched on 16 Oct 2026 ("Ruhrkorb", and with GmbH, Supermarkt, Lebensmittel or Markt): no company of that name (`PLAN.md` §b.1). The Unna logistics cluster is real (Prologis Park Unna, P3 Kamen, Dachser Unna-Ost). The region label read "Eastern Ruhr and Hellweg" in the approved plan; M1 corrected it, because Essen and Gelsenkirchen are not in the eastern Ruhr.

## 6. Front-end libraries, fonts and browser security

| Asset | Version | Delivery | Notes |
|---|---|---|---|
| Web fonts | Barlow, Barlow Semi Condensed, IBM Plex Mono (Fontsource 5.3.0) | Self-hosted woff2 in `fonts/`, latin and latin-ext; byte-identical to Rebate Hunter's 26 files and 3 licences (compared 16 Oct 2026) | SIL Open Font License 1.1; no third-party font service |

No runtime library. Markdown is rendered by a small escape-first renderer (`js/md.js`, Rebate Hunter's); everything else is plain DOM and SVG.

### Content Security Policy (meta tag in `index.html`)

| Directive | Allows | Why |
|---|---|---|
| `connect-src` | `https://api.anthropic.com` | The only `fetch` target in this build; no other host can receive the API key or any data. Open Food Facts joins once its browser probe is recorded and `OPEN_FOOD_FACTS.live` is turned on, which adds it to `OPEN_DATA` (§4, D40). Diagnostics' privacy row compares the policy with `CONNECT_ORIGINS` in `js/config.js` and fails on any difference in either direction |
| `script-src` | `'self'` | App modules and data files only; no CDN file can run |
| `style-src` | `'self'` | Dynamic styles go through the CSSOM, so no `'unsafe-inline'` |
| `img-src` | `'self'`, `data:` | The favicon and the author's photo in the drawer bar |
| `font-src` | `'self'` | Self-hosted fonts |
| `object-src`, `base-uri`, `form-action` | none | Hardening |

`tests/smoke.mjs` (case `csp`) shows the policy at work: a `fetch` to another host fails and the browser reports a `connect-src` violation (Chromium 141, 16 Oct 2026).

**Browser storage** (`STORAGE` in `js/config.js`), all under the app's own prefix, because every project site of the account shares the `victorpflueger.github.io` origin (Rebate Hunter uses `rh.`, the Navigator `nav.`): session storage `rp.anthropic.key`, `rp.diag`, `rp.model`, `rp.speed`, `rp.scenario`, `rp.sessionCostEur`, `rp.assumptions` (the presenter's changed engine inputs, from M2); local storage `rp.introSeen`, `rp.consoleText`. The key is never written to local storage, the console, the page or the audit export (`tests/smoke.mjs`, cases `modes` and `drawer`).

## 7. The engine and the night simulation

Everything in this section was computed and checked on 16 Oct 2026 with Node 22.22.0 (`tests/engine.mjs`, `tools/calibrate_night.mjs`) and in Chromium 141.0.7390.37 (`tests/sims.mjs`, `tests/smoke.mjs`), and again on 18 Oct 2026 after M3 tuned scenario 1 (D32). The formulas and targets are the approved plan's (`PLAN.md` §c); nothing below changes a number or a source of the brief. The plan's own numbers that M3 changed are scenario 1's express order and target T4 (D32).

### 7.1 The engine (`js/engine.js`)

Pure and without randomness; it computes every hour and euro on screen. Its inputs are the brief's eleven parameters (`PARAMETERS`, each with unit, range and basis: a source key from `DATA_SOURCES.md` or the label Assumption); the Assumptions tab changes them, range-checked. Full precision inside, half-up display rounding outside (`js/format.js`, D9).

| Case | Inputs | By hand per 1,000 | Hybrid per 1,000 | Robot picks per cell hour | Break-even € per cell hour | € a year avoided | Cell hours a year |
|---|---|---|---|---:|---:|---:|---:|
| G1 | brief's defaults | 2.5 h · €89.50 | 0.91 h · €32.49 | 455 | 40.72 | 342,069 | 8,400 |
| G2 | `p` = 0.70 | 2.5 h · €89.50 | 1.28 h · €45.65 | 350 | 31.33 | 263,130 | 8,400 |
| G3 | `s` = 0.75 | 2.5 h · €89.50 | 0.79 h · €28.42 | 455 | 40.72 | 366,503 | 9,000 |
| G4 | `r_m` = 600 | 1.67 h · €59.67 | 0.61 h · €21.66 | 455 | 27.15 | 228,046 | 8,400 |

The nights: N1 (3,000 units) needs 4.2 cell hours and 2.72 labour hours hybrid against 7.5 by hand; N2 (4,200) 5.88 and 3.81 against 10.5. O1, one picker called in for its three-hour minimum at the 25 % premium, costs €134.25. The business case (`PLAN.md` §c.4): G1 needs 4.2 cells on an eight-hour night shift over 250 nights or 1.4 round the clock; the demo cell's own share is €42,759 a year. `tests/engine.mjs` checks every figure within ±0.005 and every display string exactly.

### 7.2 The night simulation (`js/nightsim.js`)

A pure, seeded discrete-event simulation of one night, as specified in `PLAN.md` §c.6:

- **Time and rates.** Integer milliseconds after 22:00. A grasp attempt takes 3,600,000 / `r_c` ms (7,200 at 500 an hour), a manual pick 3,600,000 / `r_m` ms (9,000 at 400). Integer time and string-hashed draws make every night identical in Node and every browser (§7.6).
- **Order of work.** Each station takes the available unit with the highest priority: the plan's order (cut-off first, ties by route order; an express order first, the warehouse system's default, D8), heavy items first within an order by the world model's weight, then SKU and unit number. A wave's units are available from its arrival (ambient 22:00, chilled 01:00).
- **A unit at the cell.** Detection (camera confidence 0.93–0.99), the escalation rules (`js/escalation.js`: E1 an unknown barcode, to a person; E2 a fragile item whose grasp confidence is below 0.80, to the manual station), the attempt, then success (scale reading, tote) or failure (to the manual station at the time it failed, no further penalty). Success draws use common random numbers: one hash of seed and unit per unit (`js/rng.js`), so a change of plan never changes which units would fail. Per-SKU rates scale with `p`; gripper wear multiplies them from its onset.
- **The world model** (`js/world_model.js`). A scale reading more than 25 % away from the expected weight writes the observed weight back for the whole SKU, logs time, sensor, field, old and new, and the SKU is rehearsed again (D26).
- **E3.** The cell's rolling success over its last 100 attempts below 75 % calls a person (D2).
- **Totes.** A tote closes before a unit would take it over 15 kg (D8). An order is on time when its last unit is in a tote by its cut-off.
- **Projections and E4.** At 22:00, every 15 minutes while work remains, and at every correction, escalation and new order, the simulation reruns from that moment with expected outcomes (fractional failures, no future draw) and flags every store projected inside the 15-minute band of its cut-off; a store flagged for the first time raises `cutoff_risk`.
- **Wake-ups.** Night start, the first correction of a SKU, each escalation, a new order, a cut-off risk and night end. Wake-ups in the same simulated minute merge; a merged wake-up fires when its last item has happened, after every event of that moment, and the night-end wake-up is the night's last event (D22).
- **Outputs.** The ordered event list, the unit log, each order's completion, the wake-ups and a 64-bit hash of the unit log and the completions (`nightHash`).
- **Tonight's figures** (the KPI board's Tonight column, `PLAN.md` §c.5): labour hours are the base picker's picks at `r_m` plus called-in hours as billed; per 1,000 units repacked; robot picks per cell hour are successful picks over the cell's busy hours.

Runtime in Node 22: one simulation 6–36 ms, a full night with its projections and wake-ups 140–280 ms, option costing over 20 replications 0.8 s.

### 7.3 Calibration (`tools/calibrate_night.mjs`, `js/calibration.js`)

The four targets of `PLAN.md` §b.8, run with `js/nightsim.js` on the 14 calibration seeds, 16 Oct 2026 and, with T4 as tuned (D32), 18 Oct 2026: **14 of 14 seeds meet every target** (1.1 s). On seed 7:

| Target | Night simulation, seed 7 | Phase 0 scratch model, seed 7 |
|---|---|---|
| T1 N1 hybrid serves all 12 stores on time, smallest slack ≥ 15 min | yes, smallest slack 26.4 min | yes, 26 min |
| T2 N1 manual-only misses several | Dortmund, Iserlohn, Hamm, Soest | the same four |
| T3 N2 hybrid misses exactly Hamm and Soest | Hamm −15.4 min, Soest −33.0 min | −15 and −33 min |
| T4 Scenario 1: exactly Hamm and Soest within 15 minutes of their cut-off, the express order on its truck (until M3: at least 15 minutes early, D32) | Hamm −2.6 min, Soest −6.5 min; express +8.7 min | Hamm 4 min, Soest 0 min; express done 02:50 (600 units due 03:30, before D32) |

Across the 14 seeds the smallest N1 slack lies between 25.4 and 26.5 minutes and, since D32, the express order's slack between 8.4 and 10.9 minutes (39.5 to 39.6 with the M2 express order). On seed 7 the N2 night and scenario 2's night reproduce the plan's labour exactly: 1,911 picks of 2,100 attempts and 1,089 manual picks, 2.7225 labour hours. D24 described scenario 1's Soest before D32.

### 7.4 The six nights on their seed (7), doing nothing

| # | Night | On time | Escalations and corrections | Cut-off risks | Tonight |
|---|---|---|---|---|---|
| 1 | 3,000 units + a chilled express top-up of 400 at 02:00, due 02:45 (D32) | 11 of 13; Hamm 2.6 and Soest 6.5 min late | S07 200 g → 400 g at 22:17; two E2 at 22:41 | 02:00: Hamm (2 min late), Soest (6 min late) and the express order itself (9 min to spare) | 3.33 h, 0.98 h per 1,000; 210 failed grasps |
| 2 | 3,000 units | 12 of 12 | S07 at 22:17 | none | 2.72 h, 0.91 h per 1,000 |
| 3 | 3,000 + 6 unknown items at 23:10 | 12 of 12 | S07 at 22:17; E1 at 23:10 | none | 2.74 h (the six items set aside by hand) |
| 4 | 3,000, wear to 70 % from 23:30 | 12 of 12; Soest 18 min to spare | S07 at 22:17; E3 at 23:43 | none | 3.38 h, 1.13 h per 1,000; 450 failed grasps |
| 5 | 3,000, Soest's cut-off 01:30 | 12 of 12 | S07 at 22:08 | none | 2.72 h |
| 6 | 4,200 units | 10 of 12; Hamm and Soest late | S07 at 22:24 | 22:00: Hagen, Witten, Dortmund, Iserlohn (11–14 min to spare), Hamm, Soest | 3.8 h, 5.88 cell hours |

Scenarios 1 to 4 match their plan rows (`PLAN.md` §f). Scenarios 5 and 6 do not yet: D25.

### 7.5 Option costing (`js/options.js`) and the golden option cases

Exactly three variants and doing nothing, each over 20 seeded replications on common random numbers (replication 0 is tonight's seed, D1), priced on top of the levers already in force (in scenario 1, Essen's tote closed at 22:17). Extra labour is call-in hours (at least the three-hour minimum, with the 25 % premium) plus manual picks beyond doing nothing at `c`; a late store order costs €250. An option decided at a wake-up acts from the next millisecond, and the costing prices it from there (D33).

**Golden option cases** (scenario 1 at 02:00 plus 1 ms, seed 7, the reference variants in `data/reference_cases.js`; `tests/engine.mjs`, 18 Oct 2026):

| Option | Levers | Extra labour | Late store orders, expected (in 20 replications) | Expected total | Tonight's seed | Smallest slack tonight |
|---|---|---:|---|---:|---|---:|
| Do nothing | The express order first (the warehouse system's default, D8) | €0.00 | 1.85 (Soest 20, Hamm 17) | €462.50 | Hamm and Soest late | −6.5 min |
| A | Iserlohn, Hamm and Soest, then the express order | €0.00 | 0.45 (the express order 9) | €112.50 | The express order late | −1.5 min |
| B | One picker called in from 02:00 for 180 minutes; the same order | €134.25 (O1) | none | €134.25 | Every truck on time | 21.75 min |
| C | Soest to tomorrow's wave; Iserlohn, Hamm, then the express order | €0.00 | 1 (Soest 20) | €250.00 | Soest moved, so late | 2.4 min |

The cheapest option on expected cost (A) is not the one with the most slack (B): the decision is a real trade-off, as `PLAN.md` §c.7 and §j require (tested). The brief's third example, splitting the express order between the cell and the manual station, is dominated on this night (D35).

**The night on each decision path** (the scripted replay, `tests/sims.mjs` and `tests/engine.mjs`): option B, the main path, gives 3,400 units and 13 of 13 orders on time; labour 5.86 h, 3 h of them called in, so 1.72 h · €61.65 per 1,000 units against the plan's 0.91 h · €32.49; the cell 4.55 h at 454 picks per cell hour; 210 failed grasps to the manual station; night hash `30d0e195eb5b7a5c`. Option A: 12 of 13, the express order late (`f6f4b99207f22a37`); option C: 12 of 13, Soest moved (`561f6174ff901df2`); doing nothing: 11 of 13, Hamm and Soest late (`8e044b5cd2137f32`). A, C and doing nothing all come to 3.27 to 3.33 labour hours, 0.98 to 1.01 h per 1,000 units.

### 7.6 Playback and the screen (`js/night.js`, `js/cell_data.js`)

- **Speeds.** ×1 plays about 6 simulated minutes per real second; ×2 and ×4 double and quadruple it; a stretch with no event for more than 4 simulated minutes passes 12 times faster. Measured in Chromium on 18 Oct 2026 (`tests/smoke.mjs`, case `night`): scenario 1's scripted replay with option B approved, start-up and the presenter's two clicks included, in 126 s at ×1, 64 to 65 s at ×2 and 34 to 35 s at ×4, the night clock at 6.0, 11.9 and 24.0 simulated minutes per second between 22:50 and 01:50 (the slope from the first to the last clock sample in that stretch). In M2, without the agent, the night took 60, 30 and 15 s.
- **Wake-ups.** At each one the night stands still until the agent's turn is over: the scripted replay or the live agent takes it through the same tools (§9, §10). A scenario without a scripted replay plays its night in Simulation as a night preview, with a pause of 1.2 s at ×1 at each wake-up (D17, D39).
- **Decisions.** A decision acts from the wake-up's next millisecond; the night as played so far stays as it was, checked on every decision (D33). The projection the night makes right after a decision travels with the plan update, so the board shows its effect while the night still stands (D37).
- **The same night everywhere.** `tests/sims.mjs` computes the six nights in Chromium and compares them with the snapshot frozen in Node: identical hashes (scenario 1 `ba3745d87a7ace43` since D32, `f290631f7ffc76be` before; 2 `6678ce4c349b3ce5`, 3 `b14ed2e514824ae8`, 4 `d94016e222f2f11b`, 5 `72ec0c1f3d8744e6`, 6 `048400445b8cd68d`), order completions and wake-ups. The scripted replay of scenario 1 played in Chromium makes every tool call of the same replay in Node, in the same order, and ends on the same night hash, on two decision paths.
- **What the screen knows.** The night plan the board starts from holds only what the warehouse system knows at 22:00; the express order, an unknown item, gripper wear and every outcome arrive as events (D21). The agent's night-start wake-up knows the same (D38). The board, the header tiles and the KPI board are a pure reducer over those events (`js/cell_data.js`).
- **Audit volume.** The ordinary unit's detection, grasp, reading, pick and tote, and the clock, stay out of the audit as events: the night's unit log holds them, one row per unit (`isFineEvent`, `PLAN.md` §d.1). Exceptions stay events: an unknown barcode, a failed grasp, a reading outside the tolerance, an item set aside, a closed tote. A stopped night logs its units up to the stop, without any outcome from after it.

## 8. Build decisions log

| # | Decision | Why | Date |
|---|---|---|---|
| D1 | Options are priced over 20 seeded replications with common random numbers; tonight's seed is replication 0 | One seed is one outcome, not an expectation: doing nothing left Soest late in 17 of 20 replications while the default seed showed it on time (`PLAN.md` B5, decision 1) | Approved 16 Oct 2026 |
| D2 | The repeated-failure escalation's example threshold is the cell's rolling success over its last 100 attempts below 75 %; the brief's "three failed grasps on one SKU within 60 minutes" stays available, off by default | The brief's rule fired on 15 to 18 of 18 SKUs on every normal night; the rolling rule never fired in 200 normal nights and caught gripper wear in all 200 (B1, decision 2) | Approved 16 Oct 2026 |
| D3 | Open Food Facts data comes from Victor's browser probe (`PLAN.md` Appendix A); the snapshot record is built from an API response | This build environment cannot reach the host; a page summary is not a record (decision 3) | Approved 16 Oct 2026 |
| D4 | One real Open Food Facts product, scenario 3's unknown barcode `4037848020859`; everything else synthetic, the glass jar included; no enrichment of the item master | A simulated 400 g reading on a real product would state a false fact about it (decision 4) | Approved 16 Oct 2026 |
| D5 | The night pauses while the agent works: a blocking `sim_advance` tool plays the night to the next wake-up, and the speed control sets the night clock in both modes | Simulation and Live see the same physical events for the same decisions, and a run stays inside 40 model calls (decision 5) | Approved 16 Oct 2026 |
| D6 | The stores are in North Rhine-Westphalia; scenario 5 cites § 4 (1) no. 2 LÖG NRW (shops may open until 14:00 on 24 December on a working day), with § 3 LadSchlG as the federal background | The Länder have their own shop-hours laws (B3) | 16 Oct 2026 |
| D7 | Two inbound waves (ambient 22:00, chilled 01:00) and staggered cut-offs | With every unit on the pallet at 22:00 a 02:00 express order has nothing left to endanger (B2) | 16 Oct 2026 |
| D8 | Tote limit 15 kg (Assumption); "doing nothing" in scenario 1 keeps the warehouse system's default, the express order first | The brief defines neither (B6, B7) | 16 Oct 2026 |
| D9 | Display rounds half up on the decimal expansion (`js/format.js`), never `Number.toFixed`; the example in the tests is 31.325 → 31.33 | The brief's example is wrong in V8: `(45.645).toFixed(2)` gives "45.65" because the double is 45.64500000000000313; `(31.325).toFixed(2)` does give "31.32" (B9) | 16 Oct 2026 |
| D10 | In M1, Start agent leads through the mode choice and, for Live, the key dialog, then says in the console and a banner that runs arrive with M3; no run starts and no model is called | A shell can show the modes and the key handling honestly before there is a producer | 16 Oct 2026 |
| D11 | In M1 the cell panel shows the night it will draw (stores and cut-offs, units, waves, stations) with the Simulated cell tag and the Synthetic label; on a short panel the card folds to one summary line, Synthetic label included. The board itself comes in M2 | The world data is visible and checked from the first build; with the drawer open the full card would have to scroll at every size, and its label would leave the view | 16 Oct 2026 |
| D12 | The palette is Rebate Hunter's, value for value (`tools/palette.mjs`, same source colour); only the role names follow the night: `late`, `at-risk`, `on-time`, `goods` | One design system across the prototypes | 16 Oct 2026 |
| D13 | The intro window explains the finished product with a "what is real" panel; what the current build can do is said only in the notice and banner on Start | The intro stays short (at most 260 words, tested) and does not date | 16 Oct 2026 |
| D14 | `data/off_snapshot.js` ships with its attribution and no record (status `pending`) | The file and its licence statement are in place before any data (D3) | 16 Oct 2026 |
| D15 | Contrast is also measured in the running page (`tests/smoke.mjs`, case `contrast`): every visible text in eleven states at two sizes, with the palette's known short pair (faint text on porcelain, 4.44:1) as the control. The palette itself stays Rebate Hunter's until the fix lands in all three prototypes | The palette check tests primitives against `ink-2`, while the page paints its background `ink-3` (Rebate Hunter REVIEW W9). Measuring the real page catches any use of the short pair; changing the tokens here alone would split the shared palette | 16 Oct 2026 |
| D16 | While the boot screen fades out, it sinks below dialogs (`z-index` 1500 instead of 3000) | Rebate Hunter's boot screen stays on top for its 0.35 s fade, so the first-visit intro, which opens at once, shows the boot text across it for a moment (seen in the M1 screenshots) | 16 Oct 2026 |
| D17 | In M2, Start agent leads through the mode choice as before and then plays tonight's night without the agent, a **night preview**: run mode `preview`, run state `previewing`, a **NIGHT PREVIEW** badge in neutral ink, and in the audit export "NIGHT PREVIEW: … No model was called". The mode choice says so (`APP.stageNote`), the progress rail stays at its plan preview because no agent works, and each wake-up pauses the night for 1.2 s at ×1 where the agent will take its turn | The plan's "engine-only night (no agent) to drive the screen" (`PLAN.md` §i). It is neither a scripted replay (so no hazard badge) nor the live agent (so no LIVE badge); the agent replaces the pause in M3 | 16 Oct 2026 |
| D18 | `js/escalation.js` lands in M2 (the plan lists it under M3): the night simulation applies E1 to E3 and the projections E4, as in `PLAN.md` §e.2 | The rules are physical events of the night, so the night cannot be simulated without them; the agent's use of them comes in M3 | 16 Oct 2026 |
| D19 | No view toggle (Cell · Totes, `PLAN.md` §g). The board shows the cell line and the store lanes together and picks its size from the free height: full (with a legend where it fits), compact, short (no cell line, the world model as a chip in the head) and strip (store chips in as many rows as the width needs); when the content still does not fit, it steps down a size | One view the audience never has to switch, and every store stays in view at every size (`tests/layout.mjs`); thirteen lanes need more room than twelve, which a fixed height threshold cannot know | 16 Oct 2026 |
| D20 | The console shows one line per store when its truck leaves (on time with its tote count and heaviest tote, or late with what was packed), the last unit of a late order, an hourly line for the cell and the manual station, and every correction, escalation, cut-off risk and wake-up, instead of a line per tote (`PLAN.md` §d.1, §g). Closed totes stay in the audit as events | About 35 lines a night instead of more than 300; the per-tote record is in the audit and on the board's store popovers | 16 Oct 2026 |
| D21 | The night plan the screen starts from (event `night_plan`) holds only what the warehouse system knows at 22:00: the store orders, the waves, the item master, the rates and the tote limit. The express order, an unknown item, gripper wear and every outcome arrive as events when they happen; the board counts the manual queue from events | The first build showed "3,600 units tonight" at 22:00 in scenario 1, two hours before the express order exists. What a scenario will make happen is shown apart, in the Assumptions tab ("Scenario 1: what it makes happen") | 16 Oct 2026 |
| D22 | A merged wake-up fires when its last item has happened and after every event of that moment; the night-end wake-up is the night's last event | Found in M2: with the wake-up sorted first, playback stopped at the night-end wake-up and dropped Schwerte's 06:00 truck, and a merged escalation wake-up told of the second escalation before it happened. `tests/engine.mjs` now checks both, with the old order as a control that fails | 16 Oct 2026 |
| D23 | A completion or projection shown against a cut-off is rounded up to the minute ("projected 02:42", "done by 02:41"); the minutes to spare are floored | A last unit at 02:40:30 read "02:40" against a 02:40 truck while it was late; rounded up, the two clocks and the minutes to spare always agree (tested) | 16 Oct 2026 |
| D24 | Scenario 1 on seed 7, doing nothing: Soest's last unit lands 0.5 minutes after its 02:40 truck; the plan's scratch model had it on time with 0 minutes to spare. The calibration counts a late store as inside the risk band, so target T4 holds on all 14 seeds | Both models put Hamm and Soest in the band at 02:00; the half minute follows from the exact tote and unit order of the new simulation | 16 Oct 2026 |
| D25 | Scenarios 5 and 6 are not yet tuned to their plan rows: in scenario 5 no other store slips after Soest's earlier cut-off (the plan expects options when one does), and in scenario 6 the projection at 22:00 puts six stores inside the 15-minute band (Hagen, Witten, Dortmund and Iserlohn on time with 11 to 14 minutes to spare; Hamm and Soest late) where the plan names two | Their scripts and options come in M4; the tuning (a cut-off, the volume or the band's use in the script) is decided then and logged | 16 Oct 2026 |
| D26 | The world model is its own module, `js/world_model.js`: the simulation decides corrections with it and the board mirrors them; the panel is `js/world_panel.js` with `css/world.css`; before any reading, the panel opens an overview of the model | The plan's file tree; one rule for the simulation, the screen and, from M3, the agent's world tools | 16 Oct 2026 |
| D27 | With the four header tiles, the layout suite allows the header at most 14 % of the window's height (113 px at 1080 px, 100 px at 720 px) instead of M1's 96 px without tiles. Below 1400 px the tiles' figures shrink, the cost tile says "no model calls" and the drawer's note shortens to "Drafts only, never sent."; a muted tile figure uses muted ink, not faint ink | At 1280 px the long tiles and a night's audit count pushed the page 13 px wider than the window; faint text on porcelain is 4.44:1 (D15), and the tile figure falls below large-text size on a small laptop | 16 Oct 2026 |
| D28 | The console's time column is the night clock (22:00 to 06:00); the run time is in its tooltip | Every run is one night, and the audience follows the night, not a stopwatch; from M3 the agent's lines carry the time of the wake-up they answer | 16 Oct 2026 |
| D29 | The KPI board carries the brief's safety note with its dates checked: Regulation (EU) 2023/1230 applies from 20 January 2027 and repeals Directive 2006/42/EC with effect from that date (source key MACHREG) | The brief asks for the note; `DATA_SOURCES.md` §1 promised the dates would be re-read when it ships | 16 Oct 2026 |
| D30 | Changed engine inputs are kept for the tab (`rp.assumptions`); a value outside its range is refused with the range, and a stored one is dropped at start with a notice. The plan follows a change at once, the night simulation takes `r_m`, `r_c` and `p` when a night starts. Every change, and a reset, is an `assumption_change` in the audit | The Assumptions tab is the presenter's what-if; the night must not change under the audience's eyes, and the audit must show which inputs a night ran on (its `run_start` carries them) | 16 Oct 2026 |
| D31 | While the night runs, the KPI board's Tonight row for store orders states facts only: the trucks gone so far, on time of gone, and the orders still open ("5 of 5 so far · 8 still open" at 02:00 in scenario 1). The projection stays with the header tile, which counts orders on their truck or projected with more than the 15-minute band to spare and names the stores inside the band beneath ("11 of 13", "projected · 2 at risk") | Before, the row counted every order not yet late, so at 02:00 it said 13 of 13 while the tile said 11 of 13; the layout suite now checks both against the simulation at 02:00 | 16 Oct 2026 |
| D32 | Scenario 1 tuned (world 1.1.0): the express order is a chilled top-up of **400 units** of the flagship's chilled lines for its express truck, which now leaves at **02:45** (before: 600 units of the flagship's whole mix, due 03:30). Target T4 now asks that the express order make its truck, not that it make it with 15 minutes to spare. Changed numbers, all Assumptions of the plan (`PLAN.md` B2, §b.8), none of the brief: 600 → 400 units, 03:30 → 02:45, T4's express condition | With the M2 order, re-sequencing was almost free (€12.50 expected against €200.00 for doing nothing, §7.5 of M2), so one option was both cheapest and safest: the decision the plan's risk table warns about (`PLAN.md` §c.7, §j). A chilled top-up competes with Hamm and Soest for the manual station, so taking them first puts the express truck at risk. Now A costs €112.50 with the express order late in 9 of 20 replications, B €134.25 with every truck on time, C €250.00, doing nothing €462.50 (§7.5); the brief's "scenario 1 endangers exactly two stores" still holds, and every calibration target holds on 14 of 14 seeds (§7.3). At 02:00 the express order itself is inside the 15-minute band (9 minutes to spare), so the header tile reads "10 of 13 · 3 at risk" | 18 Oct 2026 |
| D33 | A decision acts from the next millisecond after its wake-up, and the session checks on every decision that the night already played stays the same, event for event; the costing prices options from that millisecond on top of the levers in force | The costing and the night that follows must run on the same levers. A lever at the wake-up's own millisecond would change events already shown; `tests/engine.mjs` keeps that case as a control that must be caught, and checks that a night played in pieces equals one simulation with all its decisions | 18 Oct 2026 |
| D34 | A scripted replay keeps the night-shaping inputs (`r_m`, `r_c`, `p` and the call-in minimum, `NIGHT_INPUTS`) at the brief's defaults; the money inputs (labour cost, call-in premium, the cost of a late order) follow the presenter's Assumptions tab. When the presenter has changed a night-shaping input, a notice says which stay at their defaults, and the audit records them (`night_inputs_kept`). Live runs use every input | A script's words describe one particular night: which stores are at risk and what each option does. A changed rate makes a different night that the words do not describe, while a changed price only reprices the same night, and every figure on screen is still computed at playback | 18 Oct 2026 |
| D35 | Option C moves Soest to tomorrow's wave rather than splitting the express order between the cell and the manual station, the brief's third example ("for example") | On this night a split loads the manual station, which is the bottleneck: moving a quarter of the express order's cell units to it costs €516.14 expected, more than doing nothing, and with the re-sequence €253.64 with the express order late in 20 of 20 replications, so it is dominated by option A (computed 18 Oct 2026). Moving an order is a distinct strategy with a certain cost | 18 Oct 2026 |
| D36 | The call-in minimum is a parameter of the night as well as of the price: a called-in picker works at least the minimum (three hours), longer if the lever says so | The night and the costing must agree on how long the second picker works; it is one of the night-shaping inputs (D34) | 18 Oct 2026 |
| D37 | After a decision or a safety action the night makes a projection at once (one at every lever's decided millisecond), and the plan update carries it, so the lanes and the header tile show the decision's effect while the night still stands at the wake-up | Found in M3 twice: the lanes stayed "at risk" for up to 15 simulated minutes after a decision, and then, while the drafts waited, until the night moved on. `tests/engine.mjs` checks that the plan update's projection is the one the night plays next, with the old code as a control | 18 Oct 2026 |
| D38 | The agent's night-start wake-up describes only what the warehouse system knows at 22:00: 12 store orders and 3,000 units in scenario 1 | Found in M3: it counted the express order's units and a thirteenth order two hours before the order existed (the same rule as D21 for the board) | 18 Oct 2026 |
| D39 | Scenarios 2 to 6 have no scripted replay until M4: in Simulation they play as a night preview (D17) with a note in the mode choice and a console notice; Live runs the agent on every scenario. The M1 and M2 stage note is gone; the badge, the audit statement and the run line say what runs | Scenario 1 is the main run and M3's acceptance case; each further script needs its own scenario tuning (D25) and lands with its acceptance test | 18 Oct 2026 |
| D40 | Open Food Facts live reads stay off (`OPEN_FOOD_FACTS.live = false`): the lookup answers from the bundled snapshot in both modes, the host stays out of `OPEN_DATA` and the security policy, and Diagnostics shows the row as skipped, with the reason | Whether a page may read the API is still unknown (§4, D3). The lookup's cap, cache, failure memory and fallback are built and unit-tested, so turning live reads on is one flag plus the policy entry once the probe is in | 18 Oct 2026 |
| D41 | The console's run facts close every agent run, a stop at the step limit or the cost cap and an Abort included (Rebate Hunter shows them for finished runs) | A run stopped at a cap is where "40 of 40 model calls" or the cost matters most (`tests/live.mjs`, cases `steps` and `budget`) | 18 Oct 2026 |
| D42 | When the person rejects an option, the run is the agent's turn again ("Replanning") until it waits for the next decision | Found in M3: with option A approved while the agent was still acknowledging the rejection of B, the status pill said "Awaiting your approval" for about two seconds with nothing to approve. `tests/sims.mjs` checks every painted pill state against what waits on screen; the old code fails it | 18 Oct 2026 |
| D43 | The option cards fit the drawer: two columns below a window height of 1,000 px (the drawer is then under 400 px high), and below 760 px a card leaves out its description, which the title and the agent's narration carry | Found by the layout suite's new options state: at 1600×900, 1536×864 and 1280×720 the Approve buttons sat below the drawer's edge, so the presenter had to scroll inside a card at the decision | 18 Oct 2026 |
| D44 | The contrast measure in the running page (D15) leaves text that is still fading in for a later state, where it is measured at full opacity, and counts it | Found in M3: console lines arriving while a replay streams were measured mid-fade at 4.39:1; settled, the same faint text on paper is 4.99:1. The suite reports per state how many texts it left for later (at most 6 against at least 14 measured on 18 Oct 2026, §11) | 18 Oct 2026 |
| D45 | The script checker refuses any euro amount, number of hours or rate typed into a script's text, even one that is right tonight; figures come only from `{{placeholders}}`. An unknown tool's answer is marked as an error, like every refusal | The browser plays the narration without auditing it, and the checker audits it at the brief's inputs only: a typed €462.50 would stay on screen after the presenter changed the cost of a late order. Both found by the M3 gate checks (`tests/engine.mjs` keeps a typed right amount as a control) | 18 Oct 2026 |

## 9. Live-agent guardrails

The rules of `PLAN.md` §e, as built in M3. They live in code that both producers share: the live agent and the scripted replay call the same 24 tools (`js/tools.js`), so a script passes the same guardrails as a model.

**The loop** (`js/agent.js`, Rebate Hunter 7.1.0's without web search). One conversation per run: the system prompt and the opening message (`js/prompt.js`; the opening message is the night-start wake-up and names nothing that has not happened yet), the request fields of §3, streaming. Independent reads in one turn (`wms_get_*`, `cell_get_*`, `world_get_*`, `world_list_*`, `open_*`) run in parallel; every other tool runs in order. Every exchange lands in the audit: the request without the key, the response, its usage and request id.

**The night and the agent's turns** (`js/wake_bridge.js`, `js/night_session.js`). The night stands still while the agent works and moves only when it calls `sim_advance`, which returns the next wake-up (D5). `sim_advance` is refused while options wait for a decision, while an approved option is not yet applied (outside Advise), while drafts wait in the Outbox, and after the night has ended.

**Caps** (`AGENT` in `js/config.js`). At most 40 model calls per run, a turn discarded by the `max_tokens` retry included; at most €3 per run, checked after every call (the run stops at once and says how much it used); a 90 s idle limit; two transport retries per call for a 429, 5xx, 529 or network failure, each announced in the console; one `max_tokens` retry with 1.5 times the room, the cut turn discarded and marked so; at most two nudges when the agent ends its turn before the night is done; if the API refuses `output_config`, `display`, `thinking` or `cache_control` with a 400, the loop drops that field and retries, each field once.

**Numbers** (`js/figures.js`, `js/guards.js`). Every amount in euros (with cents, in English and German formats), every number of hours and every rate in the agent's text is matched against the figures the tools returned in this run, within the precision written and never more than 2 % off; there is no €100 floor as in Rebate Hunter, because a figure per 1,000 units is small. Scopes: narration may quote any figure a tool returned; option cards, drafts and confirmations only the facts and the costing the options rest on, never a what-if; the summary the facts and every engine result that is not a what-if. A text that fails is refused twice (`figureRetries`), then shown with an "Unchecked figures" chip and a console line. The option cards and the header tiles never take a figure from the model: the cards are filled from the engine's costing by variant id.

**Decisions** (`js/human.js`). The three options must be the variants of the latest `sim_cost_options` at this wake-up; `options_seq` binds a decision to its set, and a decision left from an earlier set is dropped. A rejected option cannot be approved afterwards. `wms_apply_option` applies only the approved option, once, and never in Advise mode (`applyError`). Decisions the person takes while the agent is busy are queued, never lost; Abort and Reset end every wait at once.

**Drafts** (`js/drafts.js`, `draftError`). Only after an approval and only what the option contains: a call-in message only when it calls in a picker; an email only to a store whose order it changes, or to the carrier about a moved order; after doing nothing, only an internal memo for the shift handover. Recipients are functions, never named people. Every draft waits in the Outbox for the person's approval; nothing is ever sent, and approving marks a draft cleared for a person to send.

**The summary** (`ui_final_report`). Only once the night is over and every draft is decided; its outcome follows the decisions (`reportOutcome`), and the closing line is added in code by mode: "Live agent run on a simulated cell …" or "Simulated run: a scripted replay on a simulated cell …". A scripted summary that calls itself a live run fails the script checker.

**Escalations and safety** (`js/escalation.js`). The rules E1 to E4 raise escalations in code (`PLAN.md` §e.2); no tool raises, lifts or overrides one, and the agent explains them. The safety actions `wms_rebalance_tote` and `cell_route_to_manual` are allowed at every autonomy level and never return an item to the cell.

**Autonomy** (`js/autonomy.js`). Approve by default: the agent applies an option after the person approved it. Advise: the person applies it. Bounded stays locked by the shadow-mode gate; the dial arrives in M4.

**Refusals are visible.** Every refusal goes back to the model as an error result with `refused: true` and the reason, and the console shows it as a **Guardrail:** line. In `tests/live.mjs` the fake Claude writes a call-in draft quoting €143.25, an amount no tool returned: it is refused, shown as a Guardrail line, corrected to the engine's €134.25 and only then queued.

**Run facts** (`js/run_facts.js`). The console's last line and the audit export: time (agent time apart from the time spent waiting for the person), wake-ups, visible tool calls by kind, guardrail refusals, model calls against the cap, orders on time and the cost (D41).

**Evidence.** `tests/engine.mjs` (the rules in code, the toolbox on the night: refusals, decisions bound to their set, waits; the figure audit by scope), `tests/unit.mjs` (the human channel, the wake bridge, the Open Food Facts lookup, run facts), `tests/live.mjs` (the loop against the fake Claude: protocol, the same night as the Simulation, parallel reads, `pause_turn`, a 529, a `max_tokens` cut, a refused amount, the caps, Abort, a rejected key).

## 10. Simulation scripts and recorded runs

**What a script is** (`data/sim_runs.js`, format in `js/script.js`). For each wake-up of its scenario's night: the kinds the night must show there and the steps: `say` (narration), `think`, `tool` and `tools` (parallel reads), `when` and `propose` (the options, with what to say for each rejection and what to do for each approval). No figure is typed: `{{placeholders}}` take every number from the tool results of that moment (`js/sim_vars.js`), and a text may vary by decision. Every wake-up but the last ends with `sim_advance`.

**How it plays** (`js/simulation.js`). Through the live agent's own tools on the same night session, so every figure is computed at playback and every action passes the guardrails of §9. Narration streams at about 70 characters a second at ×1; tool waits scale with the speed. A scripted replay keeps the night-shaping inputs at the brief's defaults (D34).

**The checker** (`js/sim_check.js`). Reads each script first: a euro amount, a number of hours or a rate typed into a text is an error, even a right one (D45). Then it plays the script headless, once for every decision the person can take: approve A, B or C, do nothing, and reject the recommendation, then approve another option. Every placeholder must resolve, no text may show `undefined`, `NaN` or `[object Object]`, every figure in the narration must pass the figure audit, every tool call the live guardrails, and the summary must carry the "Simulated run" line. It runs in CI (`tools/check_world.mjs`, the `world` suite), in `tests/engine.mjs` (with a typed amount that must fail it) and in the browser (Diagnostics, Simulation scripts).

**Scenario 1's script** (world 1.1.0): five wake-ups (22:00 night start; 22:17 the jar correction, Essen's tote closed; 22:41 two E2 escalations; 02:00 the express order and the cut-off risk, three options; 06:00 night end with the summary), 19 to 21 tool calls by path, 11 to 12 of them on screen (the console shows the `ui_*` tools as their effects and `sim_advance` as the wake-up); on the main path 12: 4 warehouse, 2 cell, 1 world model, 5 engine. All five paths pass the checker; their nights are those of §7.5.

**Scenarios 2 to 6** get their scripts in M4 (D39). **Recorded runs:** the recorder that saves a Live run as a simulation script arrives with M4 (`PLAN.md` §i).

## 11. Verification log

**16 Oct 2026, Phase 0.** Probes P1–P8 and the price, rate and labour-cost checks recorded in `PLAN.md` §1.4. One Simulation played to its end in Rebate Hunter 7.1.0 and in the Navigator 1.1.0, served locally.

**16 Oct 2026, M1 (v0.1.0)**, on branch `m1-shell`, Node 22.22.0, Playwright 1.56.0 with Chromium 141.0.7390.37 (times UTC):
- `node tests/run-all.mjs`: tokens (45 colour checks), world (12/12), unit (16 tests), smoke (20 cases): all four suites pass.
- Re-read for M1, 09:54–09:58: the Claude pricing and models pages, the ECB rate, the Open Food Facts API documentation and product page, GS1's GSCN 23-006 and § 4 LÖG NRW (§1, §4, §5, `DATA_SOURCES.md` §1). P1–P3 repeated at 09:55 with the same results; Open Food Facts still refused by the environment (§4).
- Diagnostics in Chromium against the live `api.anthropic.com`, keyless, 10:14: one `POST /v1/messages` without a key and with the browser header, answered 401 with `access-control-allow-origin: *`; the Anthropic, world (11/11) and privacy rows pass; no other host contacted, no CSP violation, no page error.
- The token values in `css/tokens.css` are identical to Rebate Hunter's (only the file header differs).
- Contrast in the running page (D15): eleven states at 1920×1080 and 1280×720, 14 to 72 text elements measured per state, none below its duty; the control pair (faint text on porcelain, 4.44:1) is caught.
- The world against the approved plan (store and item tables, calibration block, s and p recomputed, allocation exact at N1 and N2), the data files reproducible from the generator, and the policy, the config and the page's requests checked by the M1 gate scripts, each with a broken copy that fails.
- Screenshots at 1920×1080 and 1280×720 (idle, intro, mode choice, key dialog, Diagnostics, drawer) reviewed.

**16 Oct 2026, M2 (v0.2.0)**, on branch `m2-physical`, Node 22.22.0, Playwright 1.56.0 with Chromium 141.0.7390.37:
- `node tests/run-all.mjs`: tokens (45 colour checks), world (15/15), unit (16 tests), engine (26 tests), smoke (14 cases, 247 s), sims (1 case), layout (30 cases, 118 s): all seven suites pass.
- The engine's figures against `PLAN.md` §c.3–c.4 (§7.1), the calibration on 14 of 14 seeds (§7.3), the six nights identical in Node and Chromium (§7.6), option costing over 20 replications with O1 €134.25 (§7.5).
- Scenario 1 played in Chromium to night end at ×4 (15 to 16 s), ×2 (30 s) and ×1 (60 s): every lane's dispatch state, the orders-on-time tile, the KPI board's Tonight column and the night report equal the simulation computed in Node (smoke `night`).
- Controls that must fail did: the layout suite's store-order check on the KPI board's old Tonight row ("13 of 13 so far" at 02:00, D31); the engine suite's wake-up tests with the old wake-up order (D22); the contrast case on the header tiles' faint figures at 1280 px, before the fix (D27); the layout suite on the squeezed lanes and the 13 px overflow at 1280 px, before the fixes (D19, D27).
- The layout suite's clock: an installed Playwright clock flows with real time until it is paused (probed 16 Oct 2026: 1,005 ms of page time over 1,000 ms of real time, none once paused), so the suite now pauses it after boot and the night moves only when the suite moves it; every size then meets 02:00 inside the same pause.
- MACHREG read on EU-OSHA's pages on the Regulation and on Directive 2006/42/EC, 16 Oct 2026 (D29).
- Screenshots at 1920×1080 and 1280×720 reviewed: idle, the jar correction at 22:17, the express order at 02:00 with two stores at risk, strip mode with the drawer open, the night's end with the KPI board, the Assumptions tab, a board popover, the world model's correction.

**18 Oct 2026, M3 (v0.3.0)**, on branch `m3-agent`, Node 22.22.0, Playwright 1.56.0 with Chromium 141.0.7390.37 (times UTC):
- `node tests/run-all.mjs`: tokens (45 colour checks), world (16/16, five scripts pending for M4), unit (21 tests), engine (33 tests), smoke (14 cases, 394 s), sims (3 cases), live (5 cases), layout (40 cases, 203 s): all eight suites pass.
- Re-read for M3, 18:30–18:45: the effort, thinking, prompt-caching and stop-reason pages and the pricing page (§1, §3); P2 repeated with curl (401). Open Food Facts still refused by the environment at 18:45 (§4).
- Scenario 1 tuned and re-calibrated: 14 of 14 seeds meet all four targets (§7.3); the golden option cases (§7.5) recomputed by `tests/engine.mjs` and by the gate's own script; the six nights identical in Node and Chromium, scenario 1's new hash `ba3745d87a7ace43` (§7.6).
- Scenario 1 end to end in Simulation in Chromium (`tests/sims.mjs`, `tests/smoke.mjs`): option B and its drafts approved at ×4, ×2 and ×1, and B rejected, then A approved and its draft rejected at ×4; every tool call and the night's hash equal the same decisions replayed in Node; no request leaves the page.
- Scenario 1 against the fake Claude (`tests/live.mjs`): 19 model calls of at most 40, the Simulation's night hash `30d0e195eb5b7a5c`, the refused €143.25 shown as a Guardrail line, the cost equal to the usage maths; the step cap, the cost cap, Abort and a 401.
- Controls that must fail did: the engine suite's lever at the wake-up's own millisecond (D33) and its typed amount in a script; the decision's projection test with the old code (D37); the sims suite's status-pill test with the old code (D42); the layout suite's options state before the card fix (D43); the contrast case's faint-on-porcelain pair (4.44:1).
- Found and fixed by the M3 suites before the pull request: Diagnostics threw on opening (its lists were used before they existed), the board's popover test watched Essen while Essen waits for its chilled goods, the decisions, pill and card issues of D37, D42 and D43, the contrast measure's fade (D44), run facts missing at a cap (D41).
- Screenshots at 1920×1080 and 1280×720 reviewed: the 02:00 options, the drafts in the Outbox after option B, the night's end with the summary card and run facts, the management summary, the live run's end; Diagnostics with the scripts and Open Food Facts rows.

## 12. Acceptance checklist

The definition of done for v1.0.0, item by item. Ticked items carry their evidence; the rest are open.

| Item | Status | Evidence |
|---|---|---|
| Static HTML, CSS and ES modules; no backend, build step, framework or runtime CDN; self-hosted fonts; `.nojekyll` | Done (M1) | `index.html`, `fonts/`; `tests/smoke.mjs` case `boot` sees no external request |
| Content security policy allows `connect-src` to api.anthropic.com plus the open-data hosts in use; Diagnostics checks config against policy | Done for M3 (no open-data host in use while Open Food Facts reads are off, D40) | §6; smoke cases `diag` and `csp` |
| Key: session storage only, masked, never logged, exported or committed; `rp.` prefix for every key | Done (M1) | §6; smoke cases `modes`, `drawer`, `boot`; unit tests |
| "You are interacting with an AI system" always visible | Done (M1) | Header; smoke `boot`; layout (badges clear at five sizes) |
| Neutral "Simulated cell" tag in both modes; Synthetic on generated data; "what is real" in the intro | Done (M2: the board) | Board, intro; smoke `boot`, `intro`; layout (tag and Synthetic label in view in every state) |
| SIMULATION badge on scripted replays only | Done (M3) | The badge, tape and watermark in Simulation, LIVE in a live run, NIGHT PREVIEW for a scenario without a script; smoke `modes`, sims `sc1`, live `full` |
| Models, default and prices as Rebate Hunter's, re-verified and dated | Done (M1) | §1 |
| Caps of 40 model calls and €3, cost meter, run facts | Done (M3; a real Live run by Victor still open) | §9; live `full`, `steps`, `budget`; run facts in smoke `night`, `modes` and sims |
| Engine golden cases and display strings; seeded simulation snapshots | Done (M2) | §7; `tests/engine.mjs`; `tests/sims.mjs` (Node and Chromium) |
| KPI board: Plan and Tonight apart, every figure with a source key or Assumption, the annual figure gross with the cells it needs, no payback claim; assumptions editable and audited | Done (M2) | smoke `kpi`, `night`; D29, D30 |
| A night plays at ×1, ×2 and ×4 with correct dispatch states | Done (M2, without the agent) | smoke `night`; engine (the player) |
| Three costed options plus doing nothing; approval; outbox; summary; audit JSON | Done (M3, scenario 1) | §7.5, §9; engine golden option cases; sims `sc1`, `sc1-reject`; smoke `night`, `drawer`; layout (options and drafts at five sizes) |
| Autonomy dial with the shadow-mode gate | Gate logic and record done (M1); dial open (M4) | `js/autonomy.js`; unit tests |
| Escalation rules in code | Done (M2 rules, M3 handover: the agent explains and cannot raise or lift one) | `js/escalation.js`; engine tests E1–E4 with positive and negative controls, and no tool that raises or lifts an escalation |
| Open Food Facts lookup with snapshot | Built (M3): cap, cache, failure memory, snapshot fallback; live reads off and the snapshot's record pending until the browser probe (§4, D40) | unit (the lookup with fake responses); smoke `diag` |
| Six scenarios in both modes, each with a recorded simulation and an acceptance test | Scenario 1 done in both modes (M3); scenarios 2 to 6 and the recorder open (M4) | sims `sc1`, `sc1-reject`; live `full`; world (the script checker) |
| Design system, palette checks, progress rail, intro, Diagnostics; 1920×1080 down to 1280×720 | Done for M3 | `tools/palette.mjs --check`; `tests/layout.mjs` (five sizes in seven states, the options and the drafts included); smoke `board` and `contrast` (seventeen states, D15, D44) |
| Live on GitHub Pages, offline in Simulation mode | Pages on (`main`, root), enabled by Victor on 16 Oct 2026; Simulation offline done for scenario 1 (M3): no request leaves the page | GitHub API: `has_pages: true`; run "pages build and deployment" for `main` at `3ca020c` succeeded, 16 Oct 2026, 09:23; sims `sc1` and smoke `night` see no external request |
| Docs complete; independent review with no high or medium finding open | Open (M5) | |
