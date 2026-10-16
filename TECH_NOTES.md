# TECH_NOTES — verified facts and build decisions

Repack Pilot calls the Claude API directly from the browser and, from M3, reads Open Food Facts. Every external detail the code depends on is recorded here with its source and the date it was verified. If a fact changes, update this file first, then `js/config.js`.

**Basis.** Version **0.1.0** (milestone M1, the shell), 16 October 2026. Repack Pilot runs on Rebate Hunter's browser client, run-event bus, key handling, Diagnostics and design system (Rebate Hunter 7.1.0, commit `009a38b`); `PLAN.md` §a.4 lists what is copied, adapted or replaced, file by file. Sections 1–6 hold the facts this build depends on, verified on 16 October 2026. Sections 7, 9 and 10 (engine and night simulation, guardrails, simulation scripts) fill in with M2 and M3. Section 8 is the decision log, section 11 the verification log and section 12 the acceptance checklist.

Times are UTC unless marked CEST.

---

## 1. Claude models and token prices (cost meter inputs)

Sources: `https://platform.claude.com/docs/en/about-claude/models/overview` and `https://platform.claude.com/docs/en/about-claude/pricing`, read in Phase 0 (`PLAN.md` §1.4, P9 and P10) and again for M1 on 16 Oct 2026 at 09:54. Both reads gave the figures below.

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
- **Run caps** (`AGENT`): 40 model calls and €3 per run, a 90 s idle limit (project instructions). They take effect with the agent in M3.
- **Cost per run:** not measured yet. Victor runs the first real Live check after M3.

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

**Streaming protocol.** `js/sse.js` and `js/anthropic.js` are Rebate Hunter's (verified there against `platform.claude.com/docs` and live probes on 12 Oct 2026): SSE over `fetch`, LF or CRLF split anywhere, cumulative usage in `message_delta`, mid-stream `error` events raised as API errors, a body without a stop reason treated as an interrupted connection, a 90 s idle limit including the wait for headers, retries for 429 (honouring `retry-after`, never for spend-limit 429s), 5xx, 529 and network errors. `tests/unit.mjs` covers all of it. The agent loop's parameters (thinking, effort, prompt caching, stop reasons) are re-verified when the loop lands in M3.

## 4. Open data: Open Food Facts

Status, 16 Oct 2026: **not probed.** This build environment's network allow-list refuses the host: Chromium got `net::ERR_TUNNEL_CONNECTION_FAILED` at 08:09 and 09:00 (`PLAN.md` §1.4, P6), and curl from the shell got `CONNECT tunnel failed, response 403` at 09:55. The browser probe in `PLAN.md` Appendix A is for Victor's own Chrome (decision D3); its console line has not reached the build yet, so whether a browser may read the API stays open. This build makes no request to the host, and the content security policy does not list it (§6).

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

**World 1.0.0** (`data/world.js`, generated by `tools/build_world.mjs`; everything is Synthetic). The fictional retailer **Ruhrkorb** and its DC **Ruhrkorb DC Unna** in a real logistics cluster by the Kamener Kreuz; twelve stores in real towns of the Ruhr area and its eastern neighbours, in plan order (cut-off first, ties by route order), with truck cut-offs from 01:35 (Essen) to 06:00 (Schwerte) and a second truck at 03:30 at the Dortmund flagship for express orders; 24 own-label SKUs with weight, size, fragility, grip and per-SKU grasp success; two inbound waves (ambient at 22:00, chilled at 01:00); one cell at 500 attempts per hour with a 3 kg payload and no vendor named; one picker at 400 picks per hour; a 15 kg tote limit. The tables are `PLAN.md` §b.2–b.4.

- **Allocation.** Each SKU's units are spread over the stores in proportion to store size by an integer fit with exact row and column totals, the method of the Phase 0 calibration model, so the M2 night simulation reproduces the calibrated night. N1 is 3,000 units, N2 4,200 (every store and SKU × 1.4, all whole numbers).
- **s and p.** The 18 cell SKUs carry 2,100 of the 3,000 units (s = 0.70) and their unit-weighted success is exactly 0.91 (Σ units × success = 1,911.0), at N1 and N2.
- **The glass jar.** S07's item master holds 200 g, the net content on its label; the simulated scale will read 400 g (scenario 2). Every other SKU's master weight equals its scale weight.
- **Barcodes.** Item barcodes are GS1 restricted circulation numbers with prefix 20 and a valid EAN-13 check digit. GS1 member organisations "may assign one or several of the GS1 Prefixes 02, 20 through 29" for fixed-measure items within a region or a company, and "RCNs are not GTINs" (GS1 General Specifications Change Notification, work request 23-006, "RCN updates", ratified March 2023, `https://www.gs1.org/docs/barcodes/GSCN-23-006-RCN.pdf`, read 16 Oct 2026 at 09:57). The world checks also require scenario 3's barcode to be a valid GTIN outside the item master. The plan's check that the snapshot holds its record (`PLAN.md` §b.7, item 7) joins when the record exists (D14).
- **Shadow-mode record** (`data/shadow_record.js`, generated from a fixed seed): 138 decisions over 7 nights, 128 of them the same as the person's (92.8 %), no missed escalation, no agent-caused missed cut-off. The brief's example gate needs 200 decisions over 10 nights at 95 % agreement, so it fails on three counts on purpose (`js/autonomy.js`).
- **Integrity checks** (`js/world_check.js`, in Node through `tools/check_world.mjs` and in the browser through Diagnostics): 11 checks, plus a check that the generated files are current. `tests/unit.mjs` breaks the world in 14 ways and requires the right check to fail each time.
- **Night calibration.** The cut-offs and the chilled wave come from the Phase 0 scratch model, which meets the brief's four night targets on 14 of 14 seeds (`PLAN.md` §b.8). The calibration joins the world checks with the night simulation in M2.
- **Names.** "Ruhrkorb" was web-searched on 16 Oct 2026 ("Ruhrkorb", and with GmbH, Supermarkt, Lebensmittel or Markt): no company of that name (`PLAN.md` §b.1). The Unna logistics cluster is real (Prologis Park Unna, P3 Kamen, Dachser Unna-Ost). The region label read "Eastern Ruhr and Hellweg" in the approved plan; M1 corrected it, because Essen and Gelsenkirchen are not in the eastern Ruhr.

## 6. Front-end libraries, fonts and browser security

| Asset | Version | Delivery | Notes |
|---|---|---|---|
| Web fonts | Barlow, Barlow Semi Condensed, IBM Plex Mono (Fontsource 5.3.0) | Self-hosted woff2 in `fonts/`, latin and latin-ext; byte-identical to Rebate Hunter's 26 files and 3 licences (compared 16 Oct 2026) | SIL Open Font License 1.1; no third-party font service |

No runtime library. Markdown is rendered by a small escape-first renderer (`js/md.js`, Rebate Hunter's); everything else is plain DOM and SVG.

### Content Security Policy (meta tag in `index.html`)

| Directive | Allows | Why |
|---|---|---|
| `connect-src` | `https://api.anthropic.com` | The only `fetch` target in this build; no other host can receive the API key or any data. Open Food Facts joins in M3 once its browser probe is recorded (§4). Diagnostics' privacy row compares the policy with `CONNECT_ORIGINS` in `js/config.js` and fails on any difference in either direction |
| `script-src` | `'self'` | App modules and data files only; no CDN file can run |
| `style-src` | `'self'` | Dynamic styles go through the CSSOM, so no `'unsafe-inline'` |
| `img-src` | `'self'`, `data:` | The favicon and the author's photo in the drawer bar |
| `font-src` | `'self'` | Self-hosted fonts |
| `object-src`, `base-uri`, `form-action` | none | Hardening |

`tests/smoke.mjs` (case `csp`) shows the policy at work: a `fetch` to another host fails and the browser reports a `connect-src` violation (Chromium 141, 16 Oct 2026).

**Browser storage** (`STORAGE` in `js/config.js`), all under the app's own prefix, because every project site of the account shares the `victorpflueger.github.io` origin (Rebate Hunter uses `rh.`, the Navigator `nav.`): session storage `rp.anthropic.key`, `rp.diag`, `rp.model`, `rp.speed`, `rp.scenario`, `rp.sessionCostEur`; local storage `rp.introSeen`, `rp.consoleText`. The key is never written to local storage, the console, the page or the audit export (`tests/smoke.mjs`, cases `modes` and `drawer`).

## 7. The engine and the night simulation

Arrives with M2 (`PLAN.md` §c): the engine with the brief's golden cases and display strings, the seeded discrete-event simulation of the night, option costing over 20 replications, the Plan and Tonight columns.

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

## 9. Live-agent guardrails

Arrive with M3 (`PLAN.md` §e).

## 10. Simulation scripts and recorded runs

Arrive with M3 and M4 (`PLAN.md` §f).

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

## 12. Acceptance checklist

The definition of done for v1.0.0, item by item. Ticked items carry their evidence; the rest are open.

| Item | Status | Evidence |
|---|---|---|
| Static HTML, CSS and ES modules; no backend, build step, framework or runtime CDN; self-hosted fonts; `.nojekyll` | Done (M1) | `index.html`, `fonts/`; `tests/smoke.mjs` case `boot` sees no external request |
| Content security policy allows `connect-src` to api.anthropic.com plus the open-data hosts in use; Diagnostics checks config against policy | Done for M1 (no open-data host yet) | §6; smoke cases `diag` and `csp` |
| Key: session storage only, masked, never logged, exported or committed; `rp.` prefix for every key | Done (M1) | §6; smoke cases `modes`, `drawer`, `boot`; unit tests |
| "You are interacting with an AI system" always visible | Done (M1) | Header; smoke `boot` and `viewports` |
| Neutral "Simulated cell" tag in both modes; Synthetic on generated data; "what is real" in the intro | Done (M1) | Cell panel, intro; smoke `boot`, `intro` |
| SIMULATION badge on scripted replays only | Open (M3) | |
| Models, default and prices as Rebate Hunter's, re-verified and dated | Done (M1) | §1 |
| Caps of 40 model calls and €3, cost meter, run facts | Open (M3) | |
| Engine golden cases and display strings; seeded simulation snapshots | Open (M2) | |
| Three costed options plus doing nothing; approval; outbox; summary; audit JSON | Audit export done (M1); the rest open (M3) | smoke `drawer` |
| Autonomy dial with the shadow-mode gate | Gate logic and record done (M1); dial open (M4) | `js/autonomy.js`; unit tests |
| Escalation rules in code | Open (M3) | |
| Open Food Facts lookup with snapshot | Open (M3; record pending, §4) | |
| Six scenarios in both modes, each with a recorded simulation and an acceptance test | Open (M3, M4) | |
| Design system, palette checks, progress rail, intro, Diagnostics; 1920×1080 down to 1280×720 | Done for M1 | `tools/palette.mjs --check`; smoke `viewports` (five sizes, drawer closed and open) and `contrast` (D15) |
| Live on GitHub Pages, offline in Simulation mode | Pages on (`main`, root), enabled by Victor on 16 Oct 2026; the app goes live with the M1 merge; Simulation offline open (M3) | GitHub API: `has_pages: true`; run "pages build and deployment" for `main` at `3ca020c` succeeded, 16 Oct 2026, 09:23 |
| Docs complete; independent review with no high or medium finding open | Open (M5) | |
