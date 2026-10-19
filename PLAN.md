# Repack Pilot: build plan

**Status:** Phase 0 plan, approved by Victor on 16 October 2026 with the five default decisions (TECH_NOTES D1–D5). **Date:** 16 October 2026.
**Changes after approval:** M1 corrected the region in b.1, because Essen and Gelsenkirchen are not in the eastern Ruhr. M2 departs from §d.1, §g and §i where `TECH_NOTES.md` D17–D30 say so (the night preview without the agent, the escalation rules arriving with the night simulation, no Cell · Totes toggle, one console line per truck instead of one per tote, the header's height with its tiles); no number of this plan changed. **M3 changed numbers of this plan** (`TECH_NOTES.md` D32): scenario 1's express order is 400 units of the flagship's chilled lines due on its express truck at 02:45, not 600 units due 03:30 (§b.2, B2, §f), and target T4 asks that the express order make its truck instead of making it with 15 minutes to spare (§b.8), so that the decision at 02:00 is a real trade-off (§c.7, §j). M3 also departs from §c.7's example options (C moves Soest to tomorrow's wave instead of splitting the express order, D35), keeps a scripted replay's night-shaping inputs at the brief's values (D34), and leaves scenarios 2 to 6 as night previews in Simulation until their scripts in M4 (D39); D33 and D36–D45 record the rest. **M4 was re-scoped** by Victor's request of 18 Oct 2026 (`TECH_NOTES.md` D49–D52): a five-minute customer call replaces the eight-minute timing of §h and §i, and the call runs scenario 1 in Simulation at ×1 instead of Live with Simulation at ×2 as the fallback (§i), so the playback rate of §d is tuned to the five-minute script (§7.6 of `TECH_NOTES.md`). **M4 changed one figure** of the screen, not of this plan's engine: Tonight's labour euros carry the call-in premium on called-in hours, as the option costing does (D46: option B's night €69.55 per 1,000 units, not €61.65). Scenario 5 ends without options because no other store slips (D47), scenario 6 keeps its night with four stores inside the band (D56), and an option's saving counts below zero (D48); D50–D59 record the rest. **On 19 Oct 2026 Victor re-centred the five-minute call on the world model** (`TECH_NOTES.md` D62–D68): a Customer view, now the default, puts the robot's world model at the centre with What it is worth beside it, the M4 screen stays one click away as the Full view, and the call runs scenario 3 instead of scenario 1 (superseding the brief's main run); no number of this plan or of the engine changed.

This plan turns the build brief into milestones. The brief decides what to build; this file decides how, in which order, and how each step is proven. Where the plan departs from the brief or from a reference prototype, it says so and gives the reason. Numbers from the brief appear here unchanged.

Contents: [0 Summary](#0-phase-0-in-one-page) · [1 Findings and probes](#1-phase-0-findings) · [a Architecture](#a-architecture-and-file-tree) · [b World](#b-world-schema) · [c Engine](#c-engine-specification) · [d Events and tools](#d-run-events-and-agent-tools) · [e Guardrails](#e-guardrails) · [f Scenarios](#f-the-six-scenarios) · [g Screen](#g-screen-layout) · [h Tests](#h-test-plan-and-ci) · [i Milestones](#i-milestones) · [j Risks](#j-risks-and-how-i-will-test-them) · [Appendix](#appendix-a-open-food-facts-probe-for-your-browser)

---

## 0. Phase 0 in one page

**What I did.** Read the brief in full and both whitepapers (Detecon pp. 3 and 7–12, T-Systems pp. 5 and 8–14; every quote and page number in the brief's anchor table matches the text). Studied Rebate Hunter 7.1.0 (commit `009a38b`) and the Navigator 1.1.0 (commit `4ed3d88`): all documents, `index.html`, the modules in `js/`, `data/`, `tools/`, `tests/` and the CI workflow, and REVIEW.md with its parity table. Played one Simulation to its end in each, served locally at the deployed commit. Checked the target repository. Probed the Anthropic API from a real Chromium page, tried Open Food Facts, re-verified model IDs, prices, the ECB rate and the Eurostat labour cost. Built a scratch model of the night and calibrated it to the brief's four targets.

**The plan in five lines.**
1. Rebate Hunter's shell carries over almost unchanged: bus, streaming client, agent loop, key handling, cost meter, Diagnostics, console, drawer, options, outbox, audit, recorder, design system and test harness. The domain modules are new.
2. A pure, seeded discrete-event simulation (DES) plays the night unit by unit. Both producers drive the same DES; the agent sleeps until a wake-up, and the night stands still while it works.
3. A deterministic engine owns every hour and euro. It reproduces every golden case of the brief and prices options over 20 seeded replications.
4. Escalation rules, the autonomy gate, the figure audit and decision binding live in code (`js/guards.js`, `js/escalation.js`, `js/autonomy.js`), shared by live tools and the script checker.
5. Five milestones, each one pull request with green CI; Simulation mode works end to end from M3.

**Decisions for you** (section 1.6 has the reasons): option costing over 20 seeded replications; a different example threshold for repeated grasp failures; how I get Open Food Facts data without network access; one real Open Food Facts product only; the night pauses while the agent works.

**What I need from you.** Enable GitHub Pages (Settings → Pages → Deploy from a branch → `main` / `/ (root)`): the session proxy blocks the Pages API for me. Run the one-line Open Food Facts probe in Appendix A and send me the console line. Approve or change the decisions. Then I start M1.

---

## 1. Phase 0 findings

### 1.1 What I read

| Source | What | Notes |
|---|---|---|
| Build brief (project file, 15 Oct 2026) | In full | Golden figures recomputed independently (section c.3) |
| Detecon, *Two AI Worlds, One Robot* | Full text, with pp. 3 and 7–12 closely | Added to the project at 10:02 CEST on 16 Oct; cup example p. 7, loop figure p. 8, repacking pp. 9–10, honest assessment p. 11, Hyperconnectivity Campus p. 12 |
| T-Systems, *From industrial data to Physical AI*, v5 | Full text, with pp. 5 and 8–14 closely | Controlled autonomy p. 5; Simulate, Predict, Autonomize pp. 8–9; "GATE BETWEEN STAGES" p. 9 is the wording for the dial's gate; control record p. 11 |
| Rebate Hunter 7.1.0 (`009a38b`) | README, DESIGN, TECH_NOTES, DEMO_SCRIPT, DATA_SOURCES, REVIEW (all six parts), `index.html`, `js/` (shell and guardrail modules line by line; board, ERP and engine modules for their contracts and patterns), `css/`, `data/` (structure), `tools/`, `tests/`, CI | The newer reference; wins where the two differ |
| Navigator 1.1.0 (`4ed3d88`) | DEMO_SCRIPT, TECH_NOTES (D1–D46), CSP, `js/map.js`, `js/impact.js` (engine contract), every shared module diffed against Rebate Hunter | Of its 120 files, 40 are identical to Rebate Hunter's (29 of them fonts), 66 share a path but differ, and 14 exist only in the Navigator: the map, Leaflet, geo tools and the impact engine |

### 1.2 Reference prototypes played

Both live sites are blocked by this environment's network allowlist (`connect_rejected` for `victorpflueger.github.io`). I served each clone locally at the deployed commit and played one Simulation to its end at ×4 in headless Chromium 141 (Playwright 1.56.0), approving the recommended option and every draft.

| Prototype | Scenario | Result | Replay facts |
|---|---|---|---|
| Rebate Hunter | Cisco acquisitions | Done; SIMULATION badge and watermark; options A €17,100, B €17,500, C €1.09M, do nothing €2.14M; no CSP violation, no page error | 18 s replay; 10 tool calls; 3 verification steps, 1 revision |
| Navigator | Tangier harness fire | Done; same markings; options A €6.1M, B €2.9M, C €7.7M, do nothing €19.1M; no CSP violation, no page error | 18 s replay; 10 tool calls; 2 verification steps, 1 revision |

Screenshots at 1920×1080 and 1280×720 are kept outside the repository (Phase 0 evidence, not product files).

### 1.3 Target repository

- `VictorPflueger/physicalAI-repacking`, public, default branch `main`. It holds two commits of yours ("Create README" at 22:22 and "Delete README" at 22:23 CEST, 15 Oct 2026) and an empty tree. The bootstrap commit goes on top of `29f8572`; no force push is needed.
- My session has `admin`, `maintain` and `push` on the repository (GitHub API, 16 Oct 2026). `has_pages` is `false`.
- **GitHub Pages: I cannot enable it.** The session proxy refuses the Pages API (`/repos/…/pages`: "Access to this GitHub API path is not permitted through this proxy", HTTP 403), and changing settings needs your approval anyway. Please enable it now: Settings → Pages → Deploy from a branch → `main` / `/ (root)`. Until M1 adds `index.html` there is no page to show.

### 1.4 Probe log

All times UTC, 16 October 2026.

| # | Probe | How | Result |
|---|---|---|---|
| P1 | Anthropic preflight | `curl -X OPTIONS https://api.anthropic.com/v1/messages` with `Origin` and the four request headers, 09:00 | 200; `access-control-allow-origin: *`; allow-headers echo `anthropic-version, content-type, anthropic-dangerous-direct-browser-access, x-api-key` |
| P2 | Anthropic, keyless POST, header set | curl, 09:00 | 401 `authentication_error`; `access-control-allow-origin: *`; `access-control-expose-headers: *` |
| P3 | Anthropic, keyless POST, header missing | curl, 09:00 | 401 without `access-control-allow-origin`: a browser would block it. The header stays mandatory |
| P4 | Same two calls from a real page | Headless Chromium 141.0.7390.37 via the session proxy, page on `127.0.0.1`, 09:00 | With the header: status 401 readable by the page, `access-control-allow-origin: *`. Without it: `TypeError: Failed to fetch` (`net::ERR_FAILED`, a CORS block). Matches Rebate Hunter's TECH_NOTES §3 |
| P5 | Custom `User-Agent` in `fetch()` | Same Chromium, cross-origin request to a local echo server, 08:09 | Chromium sends its own `HeadlessChrome/141` user agent and no preflight: the custom value is dropped silently. A page cannot meet Open Food Facts' request for `AppName/Version (ContactEmail)` in Chrome |
| P6 | Open Food Facts product read, browser | Same Chromium, `GET world.openfoodfacts.org/api/v2/product/3017620422003.json` and `/api/v3/…`, 08:09, again at 09:00 | **Not probed.** `net::ERR_TUNNEL_CONNECTION_FAILED`: the egress allowlist refuses the host before any CORS answer. The shell gets `connect_rejected` too |
| P7 | Open Food Facts API docs | Fetched `openfoodfacts.github.io/documentation/docs/Product-Opener/api/` | Reads need no login; custom User-Agent requested; 15 product reads and 10 searches per minute per IP; production `world.openfoodfacts.org`, staging `world.openfoodfacts.net` (basic auth `off`/`off`); ODbL, DbCL, images CC BY-SA; **CORS not mentioned**; the page offers a `fetch` example "you can test in your browser console" |
| P8 | Open Food Facts product pages | Page fetcher (the API path is disallowed by robots.txt for the fetcher) | `3274080005003` exists (Cristaline 1.5 l). Candidate for scenario 3: `4037848020859`, "Bio Elisen-Lebkuchen vegan – Nürnberger Bio Originale – 210g", sold in Germany, packaging data missing |
| P9 | Claude models | `platform.claude.com/docs/en/about-claude/models/overview` | `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5-5`: 1M context, 128K output. Also listed: `claude-fable-5-1` |
| P10 | Claude prices | `platform.claude.com/docs/en/about-claude/pricing` | Same as Rebate Hunter's `js/config.js`: Sonnet 5.5 $2 in, $10 out, $2.50 5-min cache write, $0.10 cache read; Haiku 5.5 $0.10/$0.50/$0.125/$0.01 up to 100K prompt tokens and $0.50/$2.50/$0.625/$0.05 above; Opus 5.5 $4/$20/$5/$0.20. Fable 5.1 $10/$50 (not in the reference list; not added). Web search $10 per 1,000 (stays off) |
| P11 | USD → EUR | ECB `eurofxref-daily.xml` | 15 Oct 2026: €1 = $1.1208, so 1 USD = 0.892 EUR. Rebate Hunter fixed 0.894 (12 Oct). Repack Pilot uses **0.892**, dated in TECH_NOTES |
| P12 | Eurostat labour cost | `lc_lci_lev`, DE, NACE H, D1_D4_MD5, EUR | 2025: 35.8; 2024: 35.1 (dataset updated 23 Apr 2026). Matches EUROSTAT_LC in the brief |

**Consequences for the plan.** Open Food Facts runs on the bundled snapshot by default. Live lookups stay in the design behind a Diagnostics probe, a cache and a cap, and switch on once a browser probe succeeds (Appendix A has the one-line snippet). No custom `User-Agent` is sent, because Chromium drops it; TECH_NOTES records this as a known deviation from the API's request. The CSP lists `https://world.openfoodfacts.org` only if the probe shows that browsers may read it.

### 1.5 What I think is wrong, missing or not buildable in the brief

| # | Brief | Finding | Proposed fix |
|---|---|---|---|
| B1 | Escalation example: "three failed grasps on one SKU within 60 simulated minutes" | At the default 91 % success and 500 attempts per hour, this fires on 15 to 18 of the 18 cell-eligible SKUs on every normal night (scratch model, 20 seeds). It would bury the real alarm in scenario 4 | Example threshold: **the cell's rolling grasp success over its last 100 attempts falls below 75 %**. In 200 seeded normal nights it never fired; with gripper wear (70 %) it fired in all 200, about 13 simulated minutes (106 attempts) after the wear began. A threshold of 80 % fired falsely in 13 of 200 nights. Decision 2 |
| B2 | Scenario 1: an express order at 02:00 endangers two stores | With all 3,000 units on the pallet at 22:00, the cell finishes at 02:12, so almost no work is left to endanger at 02:00 | Two inbound waves: ambient goods at 22:00, chilled goods at 01:00 (from a fresh hub); express order 600 units, due on the flagship's 03:30 truck; cut-offs staggered 01:35–06:00. The scratch model then meets all four night targets on 14 of 14 seeds (b.8) |
| B3 | Scenario 5 cites § 3 LadSchlG | The stores are in North Rhine-Westphalia, where the Ladenöffnungsgesetz NRW applies: § 4 (1) no. 2 LÖG NRW lets shops open on 24 December on working days until 14:00. 24 December 2026 is a Thursday | Cite § 4 LÖG NRW for the NRW stores (new source key LOEG_NRW), keep LADSCHLG as the federal background |
| B4 | Open Food Facts asks for a custom User-Agent | Chromium drops it (P5) | Send none; cap lookups at 3 per run, cache them, document the deviation |
| B5 | "Option costing … the expected total" on "the same night and seed" | One seed is a single outcome, not an expectation. In scenario 1, doing nothing leaves Soest's truck late in 17 of 20 seeded replications, but the default seed shows it on time with 0 minutes to spare | Price every option over 20 replications with common random numbers derived from tonight's seed (c.7). Decision 1 |
| B6 | "the agent rebalances the tote" | No tote limit is defined | Tote limit 15 kg (Assumption); the jar's real weight pushes a tote over it; rebalancing closes it early and opens the next |
| B7 | "doing nothing" in scenario 1 | Not defined | Doing nothing keeps the warehouse system's default: an express order goes to the front of both queues |
| B8 | Brief's whitepaper anchors | The two whitepapers were missing from the project at the start of Phase 0 | Resolved: added 16 Oct, 10:02 CEST |
| B9 | "`Number.toFixed`, which shows 45.64 for 45.645" | In V8 (Node 22, Chromium 141) `(45.645).toFixed(2)` returns "45.65", because the stored double is 45.64500000000000313. The rule still holds: `(31.325).toFixed(2)` returns "31.32", where G2's display string needs €31.33 | Keep half-up rounding; use 31.325 as the example in TECH_NOTES and the tests |

### 1.6 Decisions for you

| # | Decision | My recommended default | Why |
|---|---|---|---|
| 1 | How options are priced | **20 seeded replications with common random numbers** (expected late orders × €250 + extra labour); tonight's seed is replication 0 and drives what the cell then does | A single seed can show "doing nothing" as free when it fails most nights (B5). Same night, same seed family, so the comparison stays fair and every replay is identical |
| 2 | Repeated-failure escalation threshold | **Rolling success over the last 100 attempts below 75 %** | The brief's example fires on nearly every SKU every night (B1). Shown as an example policy a client sets |
| 3 | How I get Open Food Facts data, since this session cannot reach the host | **You run the one-line probe in Appendix A in Chrome once and send me the console line.** It answers the CORS question and carries the API record I build the snapshot from | Takes a minute and works today. The alternative is to open `world.openfoodfacts.org` and `victorpflueger.github.io` to this project's sessions, which would also let me test the live site at M5; but I could not confirm which setting governs this session's network access (Claude's help article covers the code-execution setting under Settings → Capabilities and does not mention these sessions). Without it, I test the deployed commit served locally and you confirm the live URL |
| 4 | Real products | **One real Open Food Facts product** (scenario 3's unknown barcode, candidate `4037848020859`, a seasonal gingerbread); every other item synthetic, the glass jar included; the brief's optional enrichment of the item master stays off | A simulated 400 g reading on a real product would state a false fact about it. A seasonal item arriving in October before the item master knows it is realistic |
| 5 | How the agent meets the night | **The night pauses while the agent works**: a blocking `sim_advance` tool plays the night to the next wake-up. The replay-speed control then sets the night clock in both modes | Simulation and Live see the same physical events for the same decisions, and a run stays inside 40 model calls. The brief already pauses the clock during decisions; this extends the pause to the agent's turns |

---

## a. Architecture and file tree

### a.1 Five layers in code

| Layer (brief) | Modules | Notes |
|---|---|---|
| Person and screen | `ui.js`, `controls.js`, `dialogs.js`, `intro.js`, `console.js`, `progress.js`, `handover.js`, `ai_label.js`, `kpi.js` (header tiles), `kpi_board.js`, `assumptions.js`, `world_panel.js`, `options_panel.js`, `outbox.js`, `drawer.js`, `audit_panel.js` | The shell is Rebate Hunter's; new: KPI board, assumptions tab, world-model panel, autonomy dial (in `controls.js`) |
| Agent | `agent.js` (Live), `simulation.js` (scripted replay), `prompt.js`, `tools.js`, `summaries.js`, `recorder.js` | One event bus, two producers, as in both references |
| Control in code | `engine.js`, `options.js`, `guards.js`, `figures.js`, `escalation.js`, `autonomy.js` (policy and gate), `drafts.js`, `payoff.js`, run caps in `agent.js` | Every figure and every action passes through here |
| World model | `world.js` (indexed item master, stores, totes, robot state), `world_model.js` (expected vs observed, corrections log), `openfoodfacts.js` (lookup, cache, snapshot) | Corrections apply to the whole SKU |
| Simulated cell | `nightsim.js` (pure DES), `rng.js` (seeded draws), `night.js` (runner: playback, clock, wake-ups, bus), `cell.js` + `cell_data.js` + `cell_pop.js` (board) | Tagged "Simulated cell" in both modes |
| Audit log | `audit.js`, `run_facts.js` | Spans all layers; JSON export |

### a.2 How a run works

1. **Start.** The mode dialog chooses Simulation or Live (Live asks for the key, session storage only). `run_start` carries the scenario, the night's date and seed.
2. **Night start.** `night.js` builds tonight from `data/scenarios.js` (volume, waves, anomalies, express order, wear, early closing) and the item master. The engine plans the night (cut-off order, heavy items first in each tote) and projects every store's last unit. The agent wakes for the first time (`night_start`).
3. **Agent turn.** Live: Claude reads with `wms_*`, `cell_*`, `world_*`, prices with `sim_*`, decides with `ui_*`. Simulation: the script block for this wake-up runs the same tools through the same executors. Either way the night clock stands still.
4. **The night moves.** The agent calls `sim_advance`. The DES computes up to the next wake-up at once; `night.js` plays the events out on the bus at the chosen speed (detections, grasp attempts, scale readings, tote updates, dispatches). Animation shows a sample of picks; counters and totes show every unit.
5. **Wake-ups** (brief): night start, a world-model correction, an escalation, a new order, a cut-off risk, night end. Events within the same simulated minute are merged into one wake-up. `sim_advance` returns the wake-up as its tool result.
6. **Decisions.** Options are priced by the engine (`sim_cost_options`), shown by `ui_propose_options`, and decided by a person. The DES applies the approved option from the current minute on. The clock is paused while a decision is open.
7. **Night end.** At 06:00, or when the last truck has left, the agent gets `night_end`, reads `sim_night_report` and publishes the management summary. Run facts close the console; the audit exports as JSON.

Live and Simulation therefore produce the same physical events for the same decisions. The DES is pure and deterministic: same world, scenario, seed and decisions, same night.

### a.3 File tree

```
physicalAI-repacking/
├─ index.html              page, CSP, boot screen
├─ favicon.svg             own mark (tote with a return arrow), burgundy tile
├─ .nojekyll
├─ README.md  DESIGN.md  TECH_NOTES.md  DATA_SOURCES.md  DEMO_SCRIPT.md  PLAN.md  REVIEW.md (M5)
├─ .github/workflows/tests.yml
├─ css/       tokens.css fonts.css style.css components.css console.css drawer.css modals.css
│             cell.css (cell board)  world.css (world-model panel)  kpiboard.css (KPI board, assumptions, dial)
├─ design/    tokens.json
├─ fonts/     26 woff2 + 3 licences (Barlow, Barlow Semi Condensed, IBM Plex Mono)
├─ images/    author.jpg
├─ data/      world.js           synthetic world, generated by tools/build_world.mjs ("Synthetic")
│             off_snapshot.js    Open Food Facts records (ODbL, attribution, own file)
│             shadow_record.js   synthetic shadow-mode record for the autonomy gate
│             scenarios.js       six scenarios: night spec, seed, anomalies
│             reference_cases.js engine and option specs per scenario (scripts and checks)
│             sim_runs.js        six simulation scripts
├─ js/        shell: main config events state keystore sse anthropic cost dom format md modal icons labels
│                    handover progress ai_label intro dialogs controls drawer console audit audit_panel
│                    run_facts diagnostics diagnostics_view source_health clock ui
│             domain: world world_model wms engine options nightsim rng night escalation autonomy
│                     openfoodfacts cell cell_data cell_pop popovers world_panel kpi kpi_board assumptions
│             agent: agent prompt tools summaries guards figures drafts payoff options_panel outbox
│                    simulation sim_vars sim_check recorder world_check
├─ tools/     palette.mjs build_world.mjs check_world.mjs calibrate_night.mjs build_off_snapshot.mjs
└─ tests/     run-all.mjs README.md lib/{harness,fake-claude,fixtures}.mjs
              unit.mjs engine.mjs smoke.mjs sims.mjs live.mjs accept.mjs layout.mjs design.mjs
```

### a.4 Reuse map

Verdicts: **Copy** (same code; only names, storage prefix and copy change), **Adapt** (same role and structure, new content), **Replace** (a new module in the same role), **Drop** (not needed), **Pattern** (read for its design, no code taken). Every Rebate Hunter file is listed, then every Navigator file without a Rebate Hunter twin.

#### Rebate Hunter: root, documents and assets

| Path | Verdict | Repack Pilot |
|---|---|---|
| `index.html` | Adapt | Same skeleton, boot screen and meta CSP; `connect-src` api.anthropic.com (+ `world.openfoodfacts.org` only after a passing probe); new data scripts; workspace with cell board and console |
| `favicon.svg` | Replace | Own mark, same tile and colours |
| `.nojekyll` | Copy | Bootstrap commit |
| `README.md` | Adapt | Same structure; stub now, full at M5 |
| `DESIGN.md` | Adapt | Same system; adds the cell board, world-model panel, KPI board and dial in the colour grammar |
| `TECH_NOTES.md` | Adapt | Same sections; probe log from 1.4; decision log D1… (the five decisions of 1.6 first); guardrails; DES; verification log; acceptance checklist |
| `DATA_SOURCES.md` | Adapt | Brief's source keys; synthetic world; Open Food Facts licence and attribution |
| `DEMO_SCRIPT.md` | Adapt | Eight minutes from the brief's storyline |
| `REVIEW.md` | Replace | Written at M5 by a reviewer agent without build context |
| `.github/workflows/tests.yml` | Copy | Node 22, ubuntu-24.04, Playwright 1.56.0; output variable `RP_TEST_OUT` |
| `design/tokens.json` | Copy | Regenerated by `tools/palette.mjs` from the same source colour |
| `fonts/*.woff2` (26 files) | Copy | Self-hosted, latin and latin-ext |
| `fonts/LICENSE-*.txt` (3 files) | Copy | SIL OFL 1.1 |
| `images/author.jpg` | Copy | Author credit in the drawer bar |

#### Rebate Hunter: styles

| Path | Verdict | Repack Pilot |
|---|---|---|
| `css/tokens.css` | Copy | Generated |
| `css/fonts.css` | Copy | 26 `@font-face` rules |
| `css/style.css` | Adapt | Same roles and grid; workspace holds cell board and console; a neutral `--sim-cell-tag` role; strip mode below 260 px board height |
| `css/components.css` | Copy | Buttons, chips, segmented control (also the autonomy dial), AI label |
| `css/console.css` | Copy | Plus entry styles for corrections, escalations and per-tote summaries |
| `css/drawer.css` | Adapt | Five tabs; KPI board and assumptions layouts move to `kpiboard.css` |
| `css/modals.css` | Copy | Plus the intro's "what is real" panel |
| `css/board.css` | Replace | `cell.css` and `world.css` |

#### Rebate Hunter: data, tools, tests

| Path | Verdict | Repack Pilot |
|---|---|---|
| `data/world.js` | Replace | Synthetic retailer, DC, stores, item master, cell, staff (b) |
| `data/scenarios.js` | Replace | Six scenarios with night spec and seed (f) |
| `data/reference_cases.js` | Replace | Engine and option specs per scenario |
| `data/sim_runs.js` | Replace | Six scripts organised by wake-up (f) |
| `tools/palette.mjs` | Copy | Same source `#7a1e3a`; plus pairs for the cell board's states on the board canvas |
| `tools/check_world.mjs` | Adapt | Loads Repack Pilot's data files; runs the world validator, calibration targets and script checker |
| `tools/build_world.mjs` | Replace | Seeded generator of the synthetic world; allocates SKUs to stores with exact totals |
| `tools/legacy_seed.mjs` | Drop | Streamlit legacy data |
| `tools/legacy_reference.py` | Drop | Streamlit legacy data |
| `tests/run-all.mjs` | Copy | Same ten suite ids |
| `tests/README.md` | Adapt | Same set-up; new cases |
| `tests/lib/harness.mjs` | Adapt | Storage keys `rp.*`; output folder from `RP_TEST_OUT` |
| `tests/lib/fake-claude.mjs` | Adapt | Protocol checks kept; system-prompt and tool-count checks for Repack Pilot |
| `tests/lib/fixtures.mjs` | Replace | Open Food Facts fixtures in the real response shape |
| `tests/unit.mjs` | Adapt | Streaming client and cost maths kept; adds half-up formatting |
| `tests/engine.mjs` | Replace | Golden cases G1–G4, N1–N2, O1 and display strings; DES snapshots; option costing; guard policy |
| `tests/smoke.mjs` | Adapt | Main flow, board by keyboard, intro, Diagnostics, `file://`, missing data |
| `tests/sims.mjs` | Adapt | Six scripts with decision plans |
| `tests/live.mjs` | Adapt | Live agent against the fake API: wake-ups, options, refusals, escalations, Open Food Facts fixture |
| `tests/accept.mjs` | Adapt | Key lifecycle, Diagnostics and CSP, Abort/Reset matrix, offline Simulation |
| `tests/layout.mjs` | Adapt | Five viewports, states incl. strip mode |
| `tests/design.mjs` | Adapt | Colour grammar on the cell board, rail, dial; washout and colour-blind captures |

#### Rebate Hunter: modules (`js/`)

| Path | Verdict | Repack Pilot |
|---|---|---|
| `js/main.js` | Adapt | Required data globals: WORLD, SCENARIOS, REFERENCE_CASES, SIM_RUNS, OFF_SNAPSHOT, SHADOW_RECORD |
| `js/config.js` | Adapt | `APP.id = "rp"`; models and prices re-verified (P9, P10); FX 0.892; caps 40 calls and €3; Open Food Facts endpoint, cap 3 lookups per run; storage keys `rp.*` |
| `js/events.js` | Adapt | Contract extended (d.1); run states for repacking |
| `js/state.js` | Adapt | Adds autonomy level and assumption overrides; persisted under `rp.*` |
| `js/keystore.js` | Copy | Session-only key, masking, redaction |
| `js/sse.js` | Copy | SSE reader |
| `js/anthropic.js` | Copy | Streaming client, retries, key check, keyless probe; the paid web-search probe is not used |
| `js/cost.js` | Copy | Price-table maths |
| `js/agent.js` | Adapt | Same loop, caps, downgrades and abort hygiene; the blocking `sim_advance` returns wake-ups; parallel reads for `wms_*`, `cell_*`, `world_*`, `open_*` |
| `js/tools.js` | Replace | New tool set (d.3) with Rebate Hunter's guardrail patterns |
| `js/guards.js` | Adapt | One policy for live tools and the script checker: figure scopes, decisions bound to options, drafts per option, outcome follows decision, autonomy checks |
| `js/figures.js` | Adapt | Euro amounts of every size (cents included) and hours; no €100 floor (e.1) |
| `js/drafts.js` | Adapt | Draft types `email`, `memo`, `call_in`; AI footer and "Mock … no warehouse system is connected" in code |
| `js/payoff.js` | Adapt | Option figures (extra labour, expected late orders, late cost, expected total) and decision effects on tiles and board |
| `js/summaries.js` | Replace | One-line summary per new tool |
| `js/prompt.js` | Replace | Repacking mission, wake-up handling, rules |
| `js/simulation.js` | Adapt | Same player on the same bus; script blocks keyed by wake-up |
| `js/sim_vars.js` | Adapt | Placeholders from engine and DES results |
| `js/sim_check.js` | Adapt | Runs the DES to know each script's wake-ups; applies `guards.js` |
| `js/recorder.js` | Adapt | Records a Live run into wake-up blocks; stores seed, world and engine versions |
| `js/world.js` | Replace | Indexed retailer, stores, items, totes, cell and staff |
| `js/world_check.js` | Replace | World validator (b.7) and calibration targets (b.8) |
| `js/erp.js` | Replace | `js/wms.js`: orders, stock, totes, plan |
| `js/rebate.js` | Replace | `js/engine.js` (formulas) and `js/options.js` (costing); `js/nightsim.js` for the night |
| `js/similarity.js` | Drop | No name matching here |
| `js/opendata.js` | Replace | `js/openfoodfacts.js`: same resolve-never-throw contract, abort signal, cache, cap, snapshot fallback |
| `js/source_health.js` | Copy | Failure memory in session storage under an `rp.*` key |
| `js/clock.js` | Adapt | The night's date (scenario 5 needs 23/24 Dec) and the paused-clock state |
| `js/labels.js` | Copy | Console labels and run facts agree |
| `js/handover.js` | Adapt | "Your decision", "Your approval", and "Your confirmation" (scenario 3) |
| `js/progress.js` | Adapt | Steps Perceive, Plan, Pick, Replan, Prepare |
| `js/ai_label.js` | Adapt | Texts for options, drafts, summary, world-model entries |
| `js/intro.js` | Adapt | Five steps, three value points, "what is real" panel |
| `js/dialogs.js` | Adapt | Mode cards and key dialog kept; custom free-text what-if dropped (the audience what-if is a scenario or an assumption, as in the brief) |
| `js/controls.js` | Adapt | Start, Scenario, Model, Night speed ×1/×2/×4, Autonomy dial, status, Abort, Reset, Diagnostics; no Live sweep |
| `js/ui.js` | Adapt | Same orchestration; starts the night runner with either producer |
| `js/console.js` | Adapt | Per-tote summaries, every exception, corrections, escalations, guardrail lines |
| `js/kpi.js` | Adapt | Tiles: labour € per 1,000 units, store orders on time, night clock, session cost |
| `js/options_panel.js` | Adapt | Extra labour, late store orders, cost of late orders, expected total, comparison bars |
| `js/outbox.js` | Adapt | Draft types of Repack Pilot |
| `js/audit.js` | Adapt | Exceptions as full events; the unit log as one compact table (a.2 step 4) |
| `js/audit_panel.js` | Adapt | Filters incl. "Physical events" |
| `js/run_facts.js` | Adapt | Tool calls by kind, wake-ups, corrections, escalations, guardrail refusals, model calls against the cap |
| `js/diagnostics.js` | Adapt | Rows: Anthropic API, Open Food Facts, world and calibration, scripts, key and privacy (CSP equals config) |
| `js/diagnostics_view.js` | Adapt | No web-search probe |
| `js/drawer.js` | Adapt | Tabs: Options, Outbox, KPI board, Assumptions, Audit |
| `js/modal.js` | Copy | Accessible modal |
| `js/md.js` | Copy | Escape-first Markdown |
| `js/dom.js` | Copy | Safe element factory |
| `js/icons.js` | Adapt | Adds tote, camera, scale, gripper, person, clock, lock |
| `js/format.js` | Adapt | Half-up rounding for euros and hours (c.8) |
| `js/popovers.js` | Replace | Item, tote, store, sensor and station details |
| `js/board.js` | Replace | `js/cell.js`: the cell board's state and wiring |
| `js/board_data.js` | Replace | `js/cell_data.js`: pure view model and geometry |
| `js/board_pop.js` | Adapt | `js/cell_pop.js`: same popover mechanics, focus return |
| `js/board_race.js` | Pattern | Growing bars and pulses become the tote lanes |
| `js/board_group.js` | Pattern | Pure geometry with label separation and a fit test |
| `js/board_band.js` | Pattern | Short-board fallback becomes the strip mode |
| `js/board_portfolio.js` | Drop | No portfolio view |

#### Navigator files without a Rebate Hunter twin

| Path | Verdict | Repack Pilot |
|---|---|---|
| `js/map.js` | Drop | No map; its floating caption, view buttons and legend card pattern lives on in `cell.js` |
| `css/map.css` | Drop | Same |
| `js/libs.js` | Drop | No runtime library and no CDN |
| `vendor/leaflet-1.9.4/*` | Drop | Same |
| `data/basemap_offline.js` | Drop | Same |
| `js/geo.js` | Pattern | Open-data contract `{error, fallback_hint}` (already in Rebate Hunter's `opendata.js`) |
| `js/impact.js` | Pattern | Deterministic engine contract: validated inputs, field-level errors, variants against a baseline |

The Navigator's DEMO_SCRIPT, options drawer and replay speeds are the same patterns Rebate Hunter carries; they come in with the Rebate Hunter files above.

---

## b. World schema

All of it is **Synthetic** unless a row names a source. Every invented name was web-searched on 16 October 2026 and matched no company.

### b.1 Retailer, DC and region

| Item | Value | Notes |
|---|---|---|
| Retailer | **Ruhrkorb** (fictional grocery chain) | Web searches for "Ruhrkorb" alone and with GmbH, Supermarkt, Lebensmittel or Markt returned no company (16 Oct 2026) |
| DC | **Ruhrkorb DC Unna** (fictional) | Unna, east of Dortmund, by the Kamener Kreuz (A1/A2): a real logistics cluster with several large distribution parks (Prologis Park Unna, P3 Kamen, Dachser Unna-Ost) |
| Region | The Ruhr area and its eastern neighbours (Hellweg, Iserlohn), North Rhine-Westphalia | Real towns; the stores are invented |
| Robot cell | "Repack cell 1": 3D camera, scale under the gripper, suction and two-finger gripper | No vendor named; vendors appear only as cited precedents |
| People | Roles only: shift lead, picker at the manual station, on-call picker pool | No personal names or data |

### b.2 Stores and truck cut-offs

Plan order is cut-off first; ties keep this route order. Units are tonight's normal volume (N1). The flagship gets a second truck at 03:30 for the express order of scenario 1.

| # | Id | Store | Units N1 | Cut-off | Notes |
|---:|---|---|---:|---|---|
| 1 | ESS | Essen | 320 | 01:35 | Farthest route, first truck |
| 2 | GEL | Gelsenkirchen | 220 | 01:40 | |
| 3 | BOC | Bochum | 300 | 01:50 | |
| 4 | HER | Herne | 160 | 01:55 | |
| 5 | HAG | Hagen | 240 | 02:00 | |
| 6 | WIT | Witten | 230 | 02:05 | |
| 7 | DOR | Dortmund (flagship) | 600 | 02:30 | Express truck 03:30 |
| 8 | ISE | Iserlohn | 180 | 02:40 | |
| 9 | HAM | Hamm | 260 | 02:40 | Tight tonight |
| 10 | SOE | Soest | 150 | 02:40 | Tight tonight; early closing in scenario 5 |
| 11 | LUN | Lünen | 140 | 05:40 | Short route, second wave |
| 12 | SCH | Schwerte | 200 | 06:00 | Short route, last truck |
| | | **Total** | **3,000** | | |

### b.3 Items (24 SKUs)

Weights are gross weights in the item master, except S07, whose master record holds the label's net content. "Cell" marks the SKUs the cell may handle; together they are 2,100 of 3,000 units, exactly the brief's s = 0.70. Per-SKU success rates average exactly p = 0.91 over those units (validator check). Fragility: low, medium, high, very high.

| SKU | Item (own label, synthetic) | Wave | Master g | Real g | Size mm | Fragility | Grip | Cell | Success | Units N1 |
|---|---|---|---:|---:|---|---|---|---|---:|---:|
| S01 | Fusilli pasta 500 g, box | ambient | 520 | 520 | 190×95×60 | low | suction | yes | 0.93 | 180 |
| S02 | Long-grain rice 1 kg, bag | ambient | 1,010 | 1,010 | 200×120×60 | low | suction | yes | 0.93 | 120 |
| S03 | Corn flakes 375 g, box | ambient | 420 | 420 | 280×190×70 | low | suction | yes | 0.94 | 140 |
| S04 | Tomato passata 500 g, glass bottle | ambient | 780 | 780 | 70×70×200 | high | fingers | yes | 0.88 | 110 |
| S05 | Kidney beans 400 g, can | ambient | 460 | 460 | 75×75×110 | low | fingers | yes | 0.94 | 160 |
| S06 | Chopped tomatoes 400 g, can | ambient | 460 | 460 | 75×75×110 | low | fingers | yes | 0.93 | 150 |
| S07 | Apricot jam 200 g, glass jar | ambient | **200** (net content) | **400** | 75×75×90 | high | suction on lid | yes | 0.87 | 90 |
| S08 | Olive oil 0.5 l, glass bottle | ambient | 900 | 900 | 60×60×280 | high | fingers | yes | 0.86 | 70 |
| S09 | Fresh milk 1 l, carton | chilled | 1,040 | 1,040 | 70×70×195 | medium | suction | yes | 0.92 | 200 |
| S10 | Orange juice 1 l, chilled carton | chilled | 1,050 | 1,050 | 70×70×195 | medium | suction | yes | 0.93 | 110 |
| S11 | Still water 1.5 l, PET bottle | ambient | 1,540 | 1,540 | 90×90×310 | low | fingers | yes | 0.91 | 150 |
| S12 | Coffee beans 500 g, valve bag | ambient | 520 | 520 | 210×110×70 | medium | soft | yes | 0.89 | 80 |
| S13 | Wheat flour 1 kg, paper bag | ambient | 1,010 | 1,010 | 160×100×60 | medium | soft | yes | 0.85 | 90 |
| S14 | Crisps 175 g, bag | ambient | 190 | 190 | 300×200×80 | medium | soft | yes | 0.83 | 100 |
| S15 | Black tea, 20 bags, box | ambient | 60 | 60 | 130×70×70 | low | suction | yes | 0.95 | 70 |
| S16 | Milk chocolate 100 g, bar | ambient | 105 | 105 | 160×80×15 | low | suction | yes | 0.92 | 120 |
| S17 | Butter biscuits 200 g, pack | ambient | 215 | 215 | 200×60×50 | medium | suction | yes | 0.91 | 80 |
| S18 | Natural yoghurt 500 g, cup | chilled | 530 | 530 | 95×95×100 | medium | suction | yes | 0.90 | 80 |
| S19 | Free-range eggs, 10-pack | chilled | 650 | 650 | 250×110×70 | very high | — | no | — | 160 |
| S20 | Still water 6 × 1.5 l, shrink pack | ambient | 9,300 | 9,300 | 280×190×310 | low | — | no (over payload) | — | 120 |
| S21 | Potatoes 2.5 kg, net bag | ambient | 2,520 | 2,520 | 350×250×120 | low | — | no (irregular) | — | 140 |
| S22 | Bananas, about 1 kg, bunch | chilled | 1,000 | 1,000 | 250×180×100 | high | — | no (irregular) | — | 180 |
| S23 | Red wine 0.75 l, glass bottle | ambient | 1,250 | 1,250 | 75×75×300 | high | — | no (fragile, age-restricted) | — | 150 |
| S24 | Fresh basil, pot | chilled | 180 | 180 | 110×110×200 | high | — | no (soft) | — | 150 |

Per-SKU success rates are Assumptions, calibrated so their unit-weighted mean over the night's cell units equals p (Σ units × rate = 1,911.0 over 2,100 units). Each unit's camera confidence and grasp confidence come from seeded draws around a per-SKU base; scenario anomalies (two unsafe units in scenario 1) are fixed in `data/scenarios.js`, not left to chance.

### b.4 Night volume, waves, staff and cell

| Parameter | N1 normal night | N2 peak night | Basis |
|---|---|---|---|
| Units tonight `V` | 3,000 | 4,200 (every store and SKU × 1.4) | Brief (synthetic) |
| Shift | 22:00–06:00 | same | Brief |
| Inbound waves | ambient (18 SKUs) at 22:00; chilled (6 SKUs) at 01:00 | same | Assumption (B2) |
| People | one picker at the manual station; on-call pool for call-ins | same | Brief |
| Cell | one cell, 500 attempts per hour (`r_c`), payload 3 kg | same | Brief (`r_c`), Assumption (payload) |
| Manual rate | 400 picks per hour (`r_m`) | same | Brief |
| Tote limit | 15 kg; heavy items first | same | Assumption (B6) |
| Express order (scenario 1) | 600 units for Dortmund at 02:00, due on its 03:30 truck | — | Assumption (B2) |

### b.5 Barcodes and the Open Food Facts file

- Synthetic items carry **restricted circulation numbers** (EAN-13 with GS1 prefix 20, valid check digit). GS1 member organisations assign the prefixes 02 and 20–29 for use within a region or a company, and RCNs are not GTINs (GS1 GSCN 23-006, ratified March 2023), so they identify no product in open trade. The validator also checks that none equals the Open Food Facts product's GTIN.
- The one real product (decision 4) sits in `data/off_snapshot.js` under ODbL with "Product data: Open Food Facts, ODbL" and a link to openfoodfacts.org, apart from the synthetic world. No product images. The snapshot holds the API record's fields `code`, `product_name`, `brands`, `quantity`, `product_quantity`, `product_quantity_unit`, `packaging_text`, `categories_tags`, the fetch date and the API version, built by `tools/build_off_snapshot.mjs` from an API response (decision 3), never from a page summary.

### b.6 Shadow-mode record

`data/shadow_record.js` (Synthetic) holds shadow decisions from earlier nights: **138 decisions over 7 nights, 128 agreed with the person (92.8 %), 0 missed escalations, 0 agent-caused missed cut-offs.** The example gate (≥ 200 decisions, ≥ 10 nights, ≥ 95 % agreement, no missed escalation, no agent-caused missed cut-off) therefore fails on three counts, and the dial says which.

### b.7 World validator

`js/world_check.js`, run by `tools/check_world.mjs` (CI) and by Diagnostics:

1. The model builds without structural problems; ids unique; every reference resolves.
2. Twelve stores, one flagship, cut-offs within 22:00–06:00 and non-decreasing in plan order.
3. Twenty-four SKUs; the store × SKU allocation adds up to the store totals and the SKU totals exactly; at N2 every store and SKU total is N1's × 1.4, in whole units.
4. Cell share of tonight's units equals 0.70 at N1 and N2; unit-weighted success over cell units equals 0.91 (to 1e-9).
5. Every SKU has weight, size, fragility and grip; cell SKUs fit the payload; manual-only SKUs say why.
6. S07's master weight differs from its real weight (scenario 2); every other SKU's master equals real weight.
7. Synthetic barcodes are RCNs with prefix 20 and a valid check digit; the Open Food Facts product is a GTIN not in the item master, with a snapshot record.
8. The shadow record fails the example gate (scenario expectation) and passes with a known-good fixture (positive control).
9. Calibration targets hold for the scenario seeds (b.8), and every scenario's DES run is reproducible (two runs, same unit log hash).
10. Six scenarios, six scripts; every script valid under the live guardrail policy (`sim_check.js`).

### b.8 Night calibration

The brief asks for one picker, one cell, 22:00–06:00 and staggered cut-offs, with three outcomes. A scratch model (unit-level, seeded, cut-off-first on both stations, failed grasps to the manual station) found the cut-offs above with a dynamic-programming search over 5-minute steps that keeps every target on 12 seeds at once (no store comes closer than 8.5 minutes to flipping a target). Results on 14 seeds, default seed 7:

| Target | Result on seed 7 | All 14 seeds |
|---|---|---|
| N1 hybrid serves all 12 stores on time | Last store 02:21; smallest slack 26 min (no cut-off risk) | Yes |
| N1 manual-only misses several | Misses 4: Dortmund, Iserlohn, Hamm, Soest | Yes (4 each) |
| N2 hybrid misses two | Hamm (−15 min) and Soest (−33 min) | Yes (the same two) |
| Scenario 1 endangers exactly two stores | Hamm (4 min slack) and Soest (0 min) inside the 15-minute risk band; express done 02:50 for its 03:30 truck | Yes (the same two) |

Seed 7 also gives 1,911 successful picks of 2,100 attempts (91.0 %) and 1,089 manual picks (900 manual-only units plus 189 failed grasps), so tonight's labour on that seed equals the plan's 2.7225 hours. M2 replaces the scratch model with `js/nightsim.js`, reruns `tools/calibrate_night.mjs`, and freezes the result in a world-validator check.

The parameters, read by the Phase 0 gate that checks this section:

```json night-calibration
{
  "fresh_at": "01:00",
  "express": { "at": "02:00", "store": "DOR", "units": 600, "due": "03:30" },
  "stores": [
    ["ESS", 320, "01:35"], ["GEL", 220, "01:40"], ["BOC", 300, "01:50"], ["HER", 160, "01:55"],
    ["HAG", 240, "02:00"], ["WIT", 230, "02:05"], ["DOR", 600, "02:30"], ["ISE", 180, "02:40"],
    ["HAM", 260, "02:40"], ["SOE", 150, "02:40"], ["LUN", 140, "05:40"], ["SCH", 200, "06:00"]
  ],
  "skus": [
    ["S01", 180, 0.93, "ambient"], ["S02", 120, 0.93, "ambient"], ["S03", 140, 0.94, "ambient"], ["S04", 110, 0.88, "ambient"],
    ["S05", 160, 0.94, "ambient"], ["S06", 150, 0.93, "ambient"], ["S07", 90, 0.87, "ambient"], ["S08", 70, 0.86, "ambient"],
    ["S09", 200, 0.92, "chilled"], ["S10", 110, 0.93, "chilled"], ["S11", 150, 0.91, "ambient"], ["S12", 80, 0.89, "ambient"],
    ["S13", 90, 0.85, "ambient"], ["S14", 100, 0.83, "ambient"], ["S15", 70, 0.95, "ambient"], ["S16", 120, 0.92, "ambient"],
    ["S17", 80, 0.91, "ambient"], ["S18", 80, 0.90, "chilled"], ["S19", 160, null, "chilled"], ["S20", 120, null, "ambient"],
    ["S21", 140, null, "ambient"], ["S22", 180, null, "chilled"], ["S23", 150, null, "ambient"], ["S24", 150, null, "chilled"]
  ],
  "peak_factor": 1.4,
  "risk_band_min": 15,
  "seeds": [7, 1000, 8919, 16838, 24757, 32676, 40595, 48514, 56433, 64352, 72271, 80190, 88109, 96028]
}
```

---

## c. Engine specification

The engine (`js/engine.js`) is pure and has no randomness. It computes every hour and euro on screen; the agent quotes its results and never computes a figure.

### c.1 Parameters

| Symbol | Parameter | Default | Unit | Source key |
|---|---|---|---|---|
| `N` | Units repacked per year | 6,000,000 | units per year | Assumption (illustrative regional DC, about 24,000 units a day on 250 days) |
| `r_m` | Manual picking rate | 400 | picks per labour hour | IML (proxy; method not stated). G4 tests 600 (KNAPP) |
| `c` | Labour cost, transport and storage, Germany, 2025 | 35.80 | € per hour | EUROSTAT_LC (re-verified 16 Oct 2026, P12) |
| `s` | Share of units the cell may handle | 0.70 | share | Assumption; proxy KNAPP (SKU share, not unit share) |
| `p` | Grasp success rate | 0.91 | share | Assumption; proxy REGISTER (trial) |
| `r_c` | Cell grasp attempts per operating hour | 500 | attempts per hour | Assumption; low end of 500 to 1,400, manufacturer data under optimal conditions (IML) |
| `V` | Units tonight | 3,000 (N1), 4,200 (N2) | units | Synthetic |
| — | Call-in minimum per extra picker | 3 | hours | Assumption |
| — | Premium on call-in hours at night or at short notice | 25 | % | Assumption |
| — | Cost per store order that misses its truck | 250 | € | Assumption |
| — | Nights per year; shift length | 250; 8 | nights; hours | Brief |

### c.2 Formulas

```
H_m   = 1000 / r_m                       manual labour hours per 1,000 units
H_h   = 1000 / r_m × (1 − s·p)           hybrid labour hours per 1,000 units
E     = H × c                            labour € per 1,000 units
A_h   = N / r_m × s·p                    labour hours avoided per year
A_EUR = A_h × c                          € avoided per year (gross)
P_c   = r_c × p                          successful robot picks per cell hour
B     = r_c·p / r_m × c                  break-even all-in cell cost per operating hour
C_h   = N·s / r_c                        cell hours needed per year; check A_EUR = B × C_h
Night: cell hours = s·V / r_c;  hybrid labour hours = V·(1 − s·p) / r_m;  manual-only hours = V / r_m
Call-in: max(3 h, hours used) × c × 1.25
```

### c.3 Golden cases

Mandatory engine tests, copied from the brief, values compared within ±0.005, display strings compared exactly.

Per 1,000 units and per cell hour:

| Case | Change | Manual per 1,000 | Hybrid per 1,000 | Robot picks per cell hour | Break-even € per cell hour |
| --- | --- | --- | --- | --- | --- |
| G1 Default | none | 2.5 h · €89.50 | 0.9075 h · €32.4885 | 455 | 40.7225 |
| G2 Gripper wear | `p` = 0.70 | 2.5 h · €89.50 | 1.275 h · €45.645 | 350 | 31.325 |
| G3 Higher robot share | `s` = 0.75 (proxy: Vulcan's 75% of item types) | 2.5 h · €89.50 | 0.79375 h · €28.41625 | 455 | 40.7225 |
| G4 Faster manual station | `r_m` = 600 | 1.6667 h · €59.6667 | 0.605 h · €21.659 | 455 | 27.1483 |

Per year:

| Case | Labour h avoided | € avoided, gross | Cell hours needed |
| --- | --- | --- | --- |
| G1 Default | 9,555 | 342,069 | 8,400 |
| G2 Gripper wear | 7,350 | 263,130 | 8,400 |
| G3 Higher robot share | 10,237.5 | 366,502.5 | 9,000 |
| G4 Faster manual station | 6,370 | 228,046 | 8,400 |

Display strings: G1 €32.49 and €40.72; G2 €45.65 and €31.33; G3 €28.42 and €366,503; G4 €59.67, €21.66 and €27.15.

Night capacity:

| Case | Units tonight | Cell hours needed | Labour h, hybrid | Labour h, manual only | Labour €, hybrid | Labour €, manual only |
| --- | --- | --- | --- | --- | --- | --- |
| N1 Normal night | 3,000 | 4.2 | 2.7225 | 7.5 | 97.4655 | 268.50 |
| N2 Peak night, +40% | 4,200 | 5.88 | 3.8115 | 10.5 | 136.4517 | 375.90 |

Option costing: **O1**, one picker called in costs 3 × €35.80 × 1.25 = **€134.25** in extra labour.

### c.4 Business-case figures

From the same formulas; tested like the golden cases.

| Figure | Value | Formula |
|---|---|---|
| Saving per 1,000 units | €57.01 | `E_m − E_h` (89.50 − 32.4885) |
| Cells needed for 8,400 cell hours | 4.2 cells on an eight-hour night shift over 250 nights; 1.4 cells round the clock | `C_h ÷ 2,000`; `C_h ÷ 6,000` |
| The demo cell's share | €42,759 | 3,000 units × 250 nights = 750,000 units → `A_EUR` with `N` = 750,000 |
| Gripper wear costs | €78,939 a year | G1 − G2 |
| A 75 % robot share adds | €24,434 a year | G3 − G1, whole euros half up |
| Faster manual station | €228,046 a year | G4 |

Every annual figure carries "illustrative, per reference site, gross, before cell costs", the cells it needs and the break-even cost per operating hour. No payback claim anywhere.

### c.5 Plan and Tonight

The KPI board keeps the two apart in labelled columns.

| | Plan (engine, expected values) | Tonight (simulation, seed shown) |
|---|---|---|
| Labour hours per 1,000 units | `H_m`, `H_h` | manual picks ÷ `r_m` (+ call-in hours) per 1,000 units repacked |
| Labour € per 1,000 units | `E_m`, `E_h` | the above × `c` |
| Robot picks per cell hour | `P_c` | successful picks ÷ cell busy hours |
| Cell hours | `s·V / r_c` | busy hours of the cell |
| Store orders on time | — | n of 12 (plus the express order when there is one) |
| Exceptions | — | failed grasps, rejected items, escalations, corrections |
| Break-even | `B` | — |

### c.6 Discrete-event simulation

**Model.** `js/nightsim.js` is pure. Inputs: world, scenario (volume, waves, anomalies, orders, wear, closings), plan (store order, levers in force), seed, start time. Outputs: an ordered event list, the unit log, store completion times and the state at the next wake-up.

**Entities.** Units (store, SKU, wave, eligibility, real weight, camera confidence, grasp confidence), two stations (the cell; the manual station with one picker, plus a called-in picker when an option adds one), totes (15 kg), trucks (cut-off per store).

**Time.** Integer milliseconds from 22:00. Cell attempt 7,200 ms (`3,600,000 / r_c`); manual pick 9,000 ms (`3,600,000 / r_m`); a rate the presenter changes is rounded to whole milliseconds. Integer arithmetic keeps Node and Chromium identical.

**Scheduling.** Each station takes the available unit with the highest priority: the plan's store order (cut-off first, ties by route order), heavy items first within a store. Express orders take the front by the warehouse system's default (B7) unless an option changes that. Units of a wave are available from its arrival.

**Per unit, cell eligible.** Detection (camera confidence) → world-model check (expected weight, size, grip) → rehearsal (grip type, expected success, grasp confidence) → escalation check (e.2) → attempt (7.2 s) → success (to tote, scale reading) or failure (to the manual queue at the time of failure, no extra penalty: brief model rule). A scale reading that differs from the master weight by more than 25 % (Assumption) writes the observed weight back for the whole SKU (`world_model_correction`) and triggers a new rehearsal for that SKU.

**Randomness.** Each draw is a hash of (seed, unit id, draw name) into [0, 1): **common random numbers**. Changing the plan never changes which units would fail, so options compare fairly and every replay is identical. Per-SKU success rates scale with `p` when the presenter moves it (`p_i' = min(0.99, p_i × p / 0.91)`); gripper wear in scenario 4 multiplies them from its onset.

**Cut-off logic.** A store's order is on time if its last unit is in a tote by its cut-off. The projection behind the cut-off-risk rule reruns the DES from now with **expected outcomes** (fractional failures), so it does not depend on future draws.

**Wake-ups.** Night start; first correction of a SKU; each escalation; a new order; a cut-off risk; night end. Wake-ups in the same simulated minute merge into one.

**Playback.** `js/night.js` plays the event list at ×1, ×2 or ×4 (×1 ≈ 6 simulated minutes per real second, tuned in M4 against the eight-minute script) and fast-forwards idle stretches. It pauses at wake-ups and while a decision is open.

**Tests.** Snapshot per scenario: the hash of the unit log and the store completion times for the scenario seed, frozen in `tests/engine.mjs` with an explicit update command; the same hash in Chromium (`tests/sims.mjs`).

### c.7 Option costing

`js/options.js`, tool `sim_cost_options`. Input: exactly three variants with levers, from the current minute. The engine adds "do nothing". Each variant runs on **20 replications**: replication 0 is tonight's seed, 1–19 derive from it; all variants share the same draws.

| Lever | Effect in the DES |
|---|---|
| `resequence` | A new store order from now on (for example the express order after the two tight stores) |
| `call_in_picker` | A second manual station from a start time, for at least 3 hours |
| `split_order` | Part of an order's cell units go to the manual queue (share, from now) |
| `move_to_next_wave` | A store's remaining lines leave on the next day's wave: counted as a late order, no labour tonight |
| `maintenance_stop` | The cell stops for its duration and restores the nominal success rate (scenario 4) |
| `manual_for_fragile` | Fragile SKUs go to the manual station from now |

Per option the engine returns: extra labour in euros (call-in hours with the minimum and premium; extra manual picks beyond tonight's plan at `c`), expected store orders that miss their truck (mean over replications) and the stores concerned, their cost (× €250), the expected total, the smallest slack, and the outcome on tonight's seed. Scenario 1 in the scratch model (express truck 03:30, 20 replications), for orientation only: doing nothing leaves 0.85 late store orders per night (Soest in 17 of 20; €212.50 expected); calling in a picker from 02:00 to 05:00 and splitting the express order costs €134.25 (O1) and leaves none late; but re-sequencing alone, with the express order after the stores, also leaves none late or at risk (express done by 03:03), at no cost. That makes the decision trivial, so M3 tunes the express order (size and truck time) until each option carries a real trade-off, as in the brief's example "re-sequence and accept a late risk", re-checks the night targets, and freezes the figures as golden option cases.

### c.8 Rounding and display

Full precision inside. Display rounds **half up** with decimal string arithmetic, never `Number.toFixed` (which shows 31.32 for G2's 31.325; see B9). Euros per 1,000 units: two decimals (€32.49). Annual euros: whole (€366,503). Hours per 1,000: up to two decimals (0.91 h, 2.5 h). Night hours: up to two decimals (4.2, 5.88, 2.72). Picks per hour: whole. Euro amounts in option cards: cents where below €1,000.

---

## d. Run events and agent tools

### d.1 Event contract

Inherited from Rebate Hunter with the same envelope and role: `run_start`, `state_change`, `narration`, `reasoning`, `tool_call`, `tool_result`, `option_decision`, `action_draft`, `action_decision`, `report`, `cost_update`, `notice`, `attempt_discarded`, `run_end`. New payloads: `options` (extra labour, late store orders, expected total), `kpi_update` (labour per 1,000, orders on time, night clock), `board_update` → `cell_update`. Dropped: `alert`, whose job `escalation` and `cutoff_risk` take over.

New (the brief's five first):

| Event | Payload |
|---|---|
| `detection` | `{ unit_id, sku, store, barcode, confidence, known }` |
| `grasp_attempt` | `{ unit_id, sku, store, grip, expected_success, grasp_confidence, ok, reason? }` |
| `world_model_correction` | `{ sku, field, old, new, sensor, at, applies_to: "sku" }` |
| `escalation` | `{ escalation_id, rule, unit_id?, sku?, store?, reason, to: "manual_station" \| "person", needs_confirmation }` |
| `autonomy_change` | `{ from, to, by: "user", gate: { met, failing: [criteria] } }` |
| `clock` | `{ t, label, paused, reason? }` |
| `scale_reading` | `{ unit_id, sku, expected_g, observed_g }` |
| `tote_update` | `{ store, tote_no, units, weight_g, status }` |
| `wake` | `{ kind, t, items: [...] }` (what the agent is woken for) |
| `cutoff_risk` | `{ stores: [{ store, projected, cutoff, slack_min }] }` |
| `dispatch` | `{ store, t, on_time, units }` |
| `plan_update` | `{ source: "decision" \| "bounded", option_id?, levers }` |
| `confirmation_request` / `confirmation_decision` | `{ request_id, subject, choices }` / `{ request_id, choice, by: "user" }` |

**Audit volume.** `detection`, `grasp_attempt` and `scale_reading` for ordinary units are "fine" events: the audit keeps them as one compact unit log (one row per unit) instead of thousands of envelopes; exceptions stay full events. The console shows per-tote summaries and every exception.

**Run states.** idle → perceiving → planning → picking → replanning → options → awaiting approval (your decision / your approval / your confirmation) → executing → done (or stopped, aborted, error).

### d.2 Agent wake-ups and model calls

| Wake-up | What the agent does | Model calls |
|---|---|---:|
| night start | reads the night, the plan and the projection; narrates; `sim_advance` | 3 |
| world-model correction | reads expected vs observed and the rehearsal; rebalances the tote; "Revised: 200 g → 400 g"; `sim_advance` | 3 |
| escalation (× 2, merged when close) | acknowledges the handover and its reason; `sim_advance` | 2–3 |
| new order + cut-off risk | projection; prices three options; proposes; decision; applies; drafts; approvals; `sim_advance` | 8 |
| night end | night report; management summary | 2 |
| **Main run total** | | **≈ 19 of 40** |

### d.3 Tool schemas

Twenty-four tools. Reads (`wms_get_*`, `cell_get_*`, `world_get_*`, `world_list_*`, `open_*`) run in parallel; `ui_*` tools that wait for a person and `sim_advance` block.

```json
[
  {"name": "wms_get_night", "description": "Tonight in the warehouse system: shift window, inbound waves with their SKUs and arrival, stores with units, cut-off and truck, people on shift, totals, plan status.", "input_schema": {"type": "object", "properties": {}}},
  {"name": "wms_get_order", "description": "One store order: lines (SKU, quantity, cell or manual), totes, units done, projected last unit, cut-off, express orders.", "input_schema": {"type": "object", "properties": {"store_id": {"type": "string"}}, "required": ["store_id"]}},
  {"name": "wms_get_stock", "description": "Units of each SKU on the pallet or infeed, by wave, still to repack.", "input_schema": {"type": "object", "properties": {"sku_ids": {"type": "array", "items": {"type": "string"}}}}},
  {"name": "wms_rebalance_tote", "description": "Close a store's current tote early and continue in a new one, so no tote exceeds the weight limit. Allowed at every autonomy level.", "input_schema": {"type": "object", "properties": {"store_id": {"type": "string"}, "reason": {"type": "string"}}, "required": ["store_id", "reason"]}},
  {"name": "wms_apply_option", "description": "Apply the levers of the option the person approved, from the current minute. Refused for any other option, in Advise mode, and before an approval.", "input_schema": {"type": "object", "properties": {"option_id": {"type": "string"}}, "required": ["option_id"]}},
  {"name": "cell_get_status", "description": "The cell now: current SKU, attempts, successes, rolling success over the last 100 attempts, gripper state, queues at the cell and the manual station, open escalations.", "input_schema": {"type": "object", "properties": {}}},
  {"name": "cell_get_grasp_plan", "description": "The rehearsal of a grasp against the world model for one SKU: grip type, expected success, grasp confidence, payload check.", "input_schema": {"type": "object", "properties": {"sku_id": {"type": "string"}}, "required": ["sku_id"]}},
  {"name": "cell_route_to_manual", "description": "Send the remaining units of one SKU, or of every fragile SKU, to the manual station from now on, with a one-line reason. A safety action allowed at every autonomy level; only an approved option can return them to the cell.", "input_schema": {"type": "object", "properties": {"sku_id": {"type": "string"}, "fragile_only": {"type": "boolean"}, "reason": {"type": "string"}}, "required": ["reason"]}},
  {"name": "world_get_item", "description": "One item in the world model: master data against observed values, corrections, fragility, grip, cell eligibility. By SKU id or barcode.", "input_schema": {"type": "object", "properties": {"sku_id": {"type": "string"}, "barcode": {"type": "string"}}}},
  {"name": "world_list_corrections", "description": "The corrections log: time, sensor, SKU, field, old value, new value.", "input_schema": {"type": "object", "properties": {}}},
  {"name": "world_propose_entry", "description": "Create a provisional item-master entry for an unknown barcode from a lookup result. It stays unverified and its units stay manual until a person confirms it.", "input_schema": {"type": "object", "properties": {"barcode": {"type": "string"}, "name": {"type": "string"}, "net_content": {"type": "string"}, "source": {"type": "string", "enum": ["open_food_facts", "scale_and_camera"]}}, "required": ["barcode", "name", "source"]}},
  {"name": "open_lookup_barcode", "description": "Open Food Facts product data for a barcode (live in Live mode when reachable, otherwise the bundled snapshot). At most 3 lookups per run; results cached.", "input_schema": {"type": "object", "properties": {"barcode": {"type": "string"}}, "required": ["barcode"]}},
  {"name": "sim_plan_night", "description": "The engine's plan for tonight: store order, cell and manual load, projected last unit per store, slack, and the night figures (cell hours, labour hours, labour euros).", "input_schema": {"type": "object", "properties": {}}},
  {"name": "sim_kpis", "description": "Engine KPIs per 1,000 units, per cell hour and per year, with each parameter's source key; what_if values are labelled as such.", "input_schema": {"type": "object", "properties": {"what_if": {"type": "object", "properties": {"p": {"type": "number"}, "s": {"type": "number"}, "r_m": {"type": "number"}, "r_c": {"type": "number"}, "c": {"type": "number"}, "N": {"type": "number"}}}}}},
  {"name": "sim_project", "description": "Projection from now with the current plan and expected outcomes: projected last unit, cut-off and slack per store; stores at risk.", "input_schema": {"type": "object", "properties": {}}},
  {"name": "sim_cost_options", "description": "Price exactly three variants and the do-nothing baseline on 20 seeded replications of tonight: extra labour, expected late store orders, their cost, expected total, smallest slack, outcome on tonight's seed.", "input_schema": {"type": "object", "properties": {"variants": {"type": "array", "minItems": 3, "maxItems": 3, "items": {"type": "object", "properties": {"variant_id": {"type": "string"}, "name": {"type": "string"}, "levers": {"type": "array", "items": {"type": "object", "properties": {"type": {"type": "string", "enum": ["resequence", "call_in_picker", "split_order", "move_to_next_wave", "maintenance_stop", "manual_for_fragile"]}, "store_ids": {"type": "array", "items": {"type": "string"}}, "share": {"type": "number"}, "start": {"type": "string"}, "minutes": {"type": "integer"}}, "required": ["type"]}}}, "required": ["variant_id", "name", "levers"]}}}, "required": ["variants"]}},
  {"name": "sim_advance", "description": "Let the night run until the next event that needs you; returns it. The night stands still while you work.", "input_schema": {"type": "object", "properties": {}}},
  {"name": "sim_night_report", "description": "Tonight against the plan: units, picks, failures, escalations, corrections, labour hours and euros per 1,000 units, cell hours, store orders on time, seed.", "input_schema": {"type": "object", "properties": {}}},
  {"name": "ui_propose_options", "description": "Show exactly three options plus doing nothing and wait for the person's decision. Figures are filled from the latest sim_cost_options result by variant_id.", "input_schema": {"type": "object", "properties": {"options": {"type": "array", "minItems": 3, "maxItems": 3, "items": {"type": "object", "properties": {"variant_id": {"type": "string"}, "title": {"type": "string"}, "description": {"type": "string"}, "residual_risk": {"type": "string"}}, "required": ["variant_id", "title", "description", "residual_risk"]}}, "recommended_variant_id": {"type": "string"}, "baseline_description": {"type": "string"}}, "required": ["options", "recommended_variant_id", "baseline_description"]}},
  {"name": "ui_await_decision", "description": "After a rejection, wait for the next decision on the remaining options or on doing nothing.", "input_schema": {"type": "object", "properties": {}}},
  {"name": "ui_request_confirmation", "description": "Ask the person to confirm or reject a provisional entry or another handover; waits for the answer.", "input_schema": {"type": "object", "properties": {"subject": {"type": "string"}, "reason": {"type": "string"}, "entry_barcode": {"type": "string"}}, "required": ["subject", "reason"]}},
  {"name": "ui_draft_action", "description": "Queue one outbound action as a draft, pending approval: email (a store or carrier), memo (master data, maintenance, shift handover) or call_in (message to the on-call picker pool). Only the kinds the approved option contains.", "input_schema": {"type": "object", "properties": {"type": {"type": "string", "enum": ["email", "memo", "call_in"]}, "recipient": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}}, "required": ["type", "recipient", "subject", "body"]}},
  {"name": "ui_await_approvals", "description": "Wait until every draft is approved or rejected.", "input_schema": {"type": "object", "properties": {}}},
  {"name": "ui_final_report", "description": "Publish the management summary (Markdown) at night end. Every amount must come from tool results; the outcome follows the decisions.", "input_schema": {"type": "object", "properties": {"markdown": {"type": "string"}, "outcome": {"type": "string", "enum": ["option_decided", "baseline_accepted", "correction_only", "escalation_only", "routine_night"]}}, "required": ["markdown"]}}
]
```

Escalations themselves are raised by code (`js/escalation.js`), never by the model. The agent explains them and, where a person must confirm, asks with `ui_request_confirmation`.

---

## e. Guardrails

### e.1 Amounts

`js/figures.js` and `js/guards.js` (shared with the script checker):

- Every **euro amount** in an option card, a draft, a confirmation or the summary must match a figure a tool returned in scope, within the precision written and never by more than 2 %. Unlike Rebate Hunter there is **no €100 floor**: per-1,000 figures are small (€32.49).
- **Hours** ("2.72 labour hours", "0.91 h") and **rates** ("455 picks per cell hour") are audited the same way.
- Scopes: narration may quote any tool figure; option cards and drafts only the facts and the costed result the options rest on; the summary facts and every non-what-if engine result.
- Refused twice, then shown as unchecked (chip and console line), as in Rebate Hunter.
- Cards and tiles never take a figure from the model: they are filled from engine results by id.

### e.2 Escalation rules (in code, example thresholds a client sets)

| Rule | Trigger | Code does | Agent wakes |
|---|---|---|---|
| E1 Unknown barcode | Barcode not in the item master | Unit to the manual station; Open Food Facts lookup offered | yes |
| E2 Fragile, low confidence | Fragility high or very high and grasp confidence below 0.80 | Unit to the manual station with a one-line reason | yes |
| E3 Repeated failures | Rolling grasp success over the cell's last 100 attempts below 75 % (decision 2; the brief's "three failed grasps on one SKU within 60 simulated minutes" stays available as an option, off by default) | Raises the escalation and logs the rolling rate; the agent then moves fragile SKUs to the manual station (`cell_route_to_manual`) and prices options | yes |
| E4 Cut-off risk | Projected last unit later than cut-off minus 15 minutes | Store flagged on the board | yes |

The model cannot switch a rule off, cannot raise an escalation itself, and cannot send an escalated unit back to the cell.

### e.3 Autonomy policy and shadow-mode gate

| Action class | Examples | Advise | Approve (default) | Bounded (locked) |
|---|---|---|---|---|
| Read, project, price | `wms_get_*`, `sim_*` | yes | yes | yes |
| Safety | `cell_route_to_manual`, `wms_rebalance_tote`, sensor write-back | yes | yes | yes |
| Plan change | `wms_apply_option` | the person applies it in the UI | the agent applies it after approval | the agent applies it within limits (no extra cost, no store at risk); anything else escalates |
| Outbound and master data | drafts | approval each | approval each | approval each |

**Gate** (`js/autonomy.js`): Bounded unlocks after at least 200 shadow decisions over at least 10 nights, at least 95 % agreement with the person, no missed escalation and no agent-caused missed cut-off. The synthetic record fails on decisions (138), nights (7) and agreement (92.8 %), so the dial shows a lock and those three reasons. The wording follows T-Systems p. 9: autonomy is an operating policy, and a stage advances only on evidence. Every change of the dial emits `autonomy_change` and lands in the audit.

### e.4 Decisions, drafts and the summary

From Rebate Hunter, unchanged in spirit: options must be the three variants of the latest `sim_cost_options` (`options_seq` binds a decision to its set); the recommendation must be one of them; drafts only after an approval and only of the kinds the option contains (`call_in` needs a `call_in_picker` lever; a store email needs a change for that store; after "do nothing", only a memo); the summary waits for every draft, and its outcome follows the decisions; AI footer and the mock line added in code by one function for both producers.

### e.5 Run caps and cost

40 model calls and €3 per run (a discarded turn counts); 90 s idle timeout; two transport retries. The cost meter converts at 0.892 EUR per USD (P11). Web search is off: the tools give the agent what it needs, and leaving it out keeps the CSP to one or two hosts.

### e.6 Honesty rules as acceptance criteria

Each is a test (h): "Simulated cell" tag on the board in both modes; SIMULATION badge, tape and watermark on scripted replays only; "Synthetic" on generated data; a "what is real" panel in the intro; the AI disclosure always visible; source key or "Assumption" on every figure in the KPI board and assumptions tab; robot rates as ranges with type tags; no vendor as the simulated robot; no payback claim; cell count and "gross, before cell costs" beside every annual figure; the safety-system note (EU Machinery Regulation (EU) 2023/1230 from 20 January 2027; Directive 2006/42/EC until then).

---

## f. The six scenarios

Every scenario ships with a simulation script, runs live with the same events, and has an acceptance test in `tests/sims.mjs` (Simulation) and `tests/live.mjs` (Live against the fake API). Seeds and anomalies live in `data/scenarios.js`.

| # | Trigger and physical signal | Script outline (wake-ups) | Expected end | Acceptance test |
|---|---|---|---|---|
| 1 | **Express order for the flagship at 02:00** (main run; scenario 2's jar correction happens on the way). N1, seed 7; two unsafe units (an oil bottle lying on its side, a passata bottle with a chipped neck) | night start → jar correction → two escalations → new order + cut-off risk (Hamm, Soest) → options → decision → apply → drafts (call-in, note to Dortmund) → night end | Three costed options plus doing nothing; any plan that moves a cut-off waits for approval | Two stores at risk at 02:00; O1 €134.25 on the call-in card; figures match the engine; 12 of 12 stores and the express order on time after "call in a picker"; replay at ×2 inside the eight-minute plan |
| 2 | **Glassware heavier than master data**: scale reads 400 g for S07 (master 200 g) | night start → correction → `sim_advance` → night end | World-model correction for the whole SKU; new rehearsal before the next jar; tote rebalanced; no options unless a cut-off is at risk | Corrections log row (time, scale, 200 g → 400 g); no second correction for S07; no tote above 15 kg; no options |
| 3 | **Unknown SKU**: camera reads `4037848020859`, not in the item master | night start → escalation E1 → `open_lookup_barcode` (snapshot in Simulation) → provisional entry, unverified → `ui_request_confirmation` → night end | Escalation; units manual until a person confirms | Attribution shown; no product image; at most 3 lookups; confirm and reject paths both play; offline run makes no external request |
| 4 | **Gripper wear**: success falls from 91 % to 70 % from 23:30 | night start → E3 after about 13 min → rolling rate, fragile SKUs to manual, G2 cost effect → options (maintenance stop, manual for fragile + call-in, continue) → night end | Three costed options plus doing nothing | E3 fires; KPI board shows G2 (1.28 h · €45.65 per 1,000 units); options priced |
| 5 | **Early closing**: night of 23→24 Dec 2026 (Thursday); Soest closes at 14:00 under § 4 LÖG NRW and wants its goods earlier: cut-off 02:40 → 01:30 (Assumption) | night start → new constraint → Soest first; feasibility → another store at risk → options → night end | Options when another store slips | The date and legal basis shown (LOEG_NRW, LADSCHLG as background); Soest on time with the approved option |
| 6 | **Peak week**: 4,200 units, no extra staff | night start → cut-off risks (Hamm, Soest) → options (call-in, split, move Soest to the next wave) → night end | Engine shows 5.88 cell hours and 3.81 labour hours against 10.5 by hand (N2); two late without action | N2 figures on screen; Hamm and Soest late with doing nothing |

The recommended stage run is scenario 1 in Live mode; its Simulation at ×2 is the fallback. M4 tunes the playback rate so the run's eight minutes follow the brief's timing table, and records a Live run of scenario 1 with the recorder once you have run it with your key.

---

## g. Screen layout

**1920 × 1080**

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▣ Repack Pilot          [SIMULATION] [✦ You are interacting with an AI system] [ⓘ How it works]      │
│   Repack agent, Ruhrkorb DC Unna (fictional)     [€ per 1,000 units][Orders on time][Night clock][Cost] │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▷ Start agent │ Scenario ▾ │ Model ▾ │ Night ×1 ×2 ×4 │ Autonomy: Advise·Approve·Bounded🔒 │ ● Awaiting your decision │ Abort │ Reset │ Diagnostics │
├───────────────────────────────────────────────────────────────┬──────────────────────────────────────┤
│ Cell board (60 %)                          [Simulated cell]     │ Agent console (40 %)                  │
│  Pallet & bins → camera (conf 0.97) → arm + gripper → scale     │  Perceive · Plan · Pick · Replan · Prepare │
│  Manual station: picker, queue, "handed to a person" chips      │  log: per-tote summaries, exceptions, │
│  12 store lanes: tote fill, weight, cut-off, state              │  corrections, escalations, guardrails │
│  ┌ World model ───────────────────────────────┐                 │                                       │
│  │ S07 jam  expected 200 g · observed 400 g ✓ written back 22:21 │                                       │
│  └─────────────────────────────────────────────┘                │                                       │
├───────────────────────────────────────────────────────────────┴──────────────────────────────────────┤
│ Options │ Outbox │ KPI board │ Assumptions │ Audit        Built by Victor Pflüger        drafts note · Hide │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Header tiles:** "Labour per 1,000 units" (at 22:00 the manual baseline, 2.5 h · €89.50, as in the brief's hook; once the plan stands, the hybrid 0.91 h · €32.49 with the manual figure beneath); "Store orders on time" (12 of 12, tonight, projected; amber or red with risk); "Night clock" (02:00, "paused: your decision"); "Session cost".
- **Control bar:** the autonomy dial is a segmented control; the current level is burgundy (a person's setting); Bounded shows a lock and opens the gate's reasons.
- **Cell board:** SVG and HTML buttons of at least 44 px with full accessible names; popovers for every entity (item, tote, store, sensor, station) that return focus. Floating caption, view toggle (Cell · Totes) and legend card follow the Navigator's map chrome. A sample of picks animates; counters update every unit; nothing moves under reduced motion.
- **Console and progress rail:** the console keeps Rebate Hunter's layout: the progress rail (Perceive · Plan · Pick · Replan · Prepare) on top, then per-tote summaries, every exception, corrections, escalations and Guardrail lines, closed by the run facts. The rail step that waits for a person turns burgundy.
- **World-model panel:** a card on the board: expected against observed for the SKU in focus and the corrections log (time, sensor, old, new).
- **Drawer:** Options; Outbox; KPI board (Plan and Tonight columns, annual figure with cells needed and break-even, "illustrative, per reference site, gross"); Assumptions (each input with its source key or "Assumption", reset to defaults, every change in the audit); Audit.

**1280 × 720:** the header keeps two rows (tiles shrink, captions wrap), the control bar drops its labels (Rebate Hunter's breakpoints). With the drawer open the board loses most of its height; below 260 px it switches to **strip mode**: one row of twelve store chips (fill, cut-off, state) and the world-model card folds into a one-line chip. "Hide" on the drawer brings the full board back.

**Colour roles.** Burgundy: a person (Approve, the dial's chosen level, the rail step that waits, "handed to a person" chips, confirmations). Violet: the AI (AI labels, Hypothesis and Revised lines, the agent's what-ifs, reasoning). Red, amber, green: state (late, at risk, on time or dispatched; failed grasp, escalation, success). Blue: checking (camera detections, rehearsal, sensor readings in the world-model panel, money an option spends). Slate: goods at rest (bins, filling totes). Ink: the cell, labels and the neutral "Simulated cell" tag. Hazard yellow and black: scripted replays only.

---

## h. Test plan and CI

`node tests/run-all.mjs` runs ten suites; GitHub Actions runs the Node suites and then the browser suites on Node 22, ubuntu-24.04, Playwright 1.56.0, on every push and pull request.

| Suite | Checks |
|---|---|
| tokens | `tools/palette.mjs --check`: contrast, brand vs danger, colour-blind pairs incl. the cell board's states on its canvas, token files current |
| world | `tools/check_world.mjs`: validator (b.7), calibration targets (b.8), six scripts under the live guardrail policy |
| unit | Streaming client, retries, cost maths at 0.892, half-up formatting (45.645 → 45.65, 31.325 → 31.33, 366,502.5 → 366,503) |
| engine | Golden G1–G4 per 1,000 and per year, N1–N2, O1, business-case figures and every display string; DES snapshots per scenario; reproducibility; option costing on 20 replications; escalation rules E1–E4 with positive and negative controls; autonomy gate (fails on the synthetic record, passes on a fixture); figure audit (cents, hours, rates, German formats); drafts per option; outcome follows decision |
| smoke | Main Simulation flow with export; cell board by keyboard and mouse, popovers and focus return; reduced motion; intro; Diagnostics; `file://`; missing data file |
| sims | Six scripts with decision plans: no unresolved placeholders, SIMULATION markings, no external request, KPI and board payoff, audit marked simulation |
| live | Fake Claude: scenario 1 end to end (wake-ups, parallel reads, `pause_turn`, a 529 retry, `max_tokens` retry, options, refusal of an amount the engine did not produce, approval, drafts, summary, cost equal to the usage maths, recorder and replay); escalations enforced in code; Open Food Facts fixture, CORS failure and snapshot fallback; Advise and Approve; abort mid-call; 401 |
| accept | Key lifecycle and privacy; Diagnostics: CSP equals config, Open Food Facts probe, failure memory; Abort/Reset matrix in both modes; Simulation fully offline with zero external requests |
| layout | 1920×1080, 1600×900, 1536×864, 1366×768, 1280×720 at idle, during the correction, with options, with drafts, in strip mode: no overflow, tiles never covered, one-row control bar, targets ≥ 40 px (44 px on the board) |
| design | Colour grammar in the running app (board states, dial, rail, AI labels); projector-washout and colour-blind captures |

Every browser suite fails on a CSP violation, a page error or an unexpected console error, as in Rebate Hunter. No suite calls a real API or spends money.

---

## i. Milestones

Your cut, with three moves: option costing (pure engine) moves into M2; the simulation player, script checker and scenario 1's script move into M3, so Simulation mode works end to end at M3; the recorder stays in M4. One feature branch and one pull request per milestone, merged only with green CI and your approval. `main` stays deployable.

| Milestone | Scope | Acceptance criteria |
|---|---|---|
| **M1 Shell (v0.1.0)** | `index.html` with CSP; fonts, tokens, palette check; mode dialog; key handling under `rp.*`; Diagnostics (Anthropic probe, CSP equals config, privacy row, world row); intro window with "what is real"; AI disclosure; empty workspace with the "Simulated cell" tag; drawer shell; `tools/build_world.mjs`, `data/world.js`, `data/off_snapshot.js` (placeholder until decision 3), `data/shadow_record.js`; world validator; CI with tokens, world, unit, smoke | CI green; page loads offline; Diagnostics passes locally with the keyless probe; validator passes; screenshots 1920×1080 and 1280×720; TECH_NOTES §1–6 with dated facts |
| **M2 Physical layer (v0.2.0)** | `engine.js` with golden tests; `nightsim.js`, `rng.js`, calibration tool and frozen targets; `options.js` with replications and O1; `night.js` playback, clock and wake-ups; `world_model.js` and panel; cell board with strip mode; header tiles; KPI board; assumptions tab; an engine-only night (no agent) to drive the screen | Every golden case and display string; snapshots per scenario in Node and Chromium; calibration targets on all seeds; a full night plays at ×1/×2/×4 with correct dispatch states; board keyboard-usable; layout at five sizes |
| **M3 Agent (v0.3.0)** | Tools and schemas; `guards.js`, `figures.js`, `escalation.js`; prompt; Live loop with `sim_advance`; options drawer, outbox, management summary, audit export, run facts; Open Food Facts lookup with cache, cap, snapshot and source memory; simulation player, `sim_vars`, `sim_check`; scenario 1 script; fake-Claude live suite | Scenario 1 end to end in Simulation and against the fake API with the same physical events; refusals visible as Guardrail lines; ≤ 40 calls; offline Simulation makes no external request |
| **M4 Scenarios (v0.4.0)**, re-scoped on 18 Oct 2026 as **M4: Five-minute customer case and six scenarios** (`TECH_NOTES.md` D49–D52) | Scripts for scenarios 2–6; recorder; autonomy dial and gate; acceptance tests per scenario; ~~demo timing tuned to eight minutes~~ the five-minute customer case (D50) | Six scenarios pass in `sims` and `live`; recorder round trip; dial locked with the three reasons; ~~recommended run fits eight minutes at ×2~~ the recommended run fits the five-minute call at ×1 in Simulation (D52; scenario 3 in the Customer view since D62, D63) |
| **M5 Hardening (v1.0.0)** | Layout and design suites complete; README, DEMO_SCRIPT, DATA_SOURCES, TECH_NOTES, DESIGN complete; acceptance checklist with evidence; independent reviewer agent without build context; fixes; a check of the live site (by you, if this session still cannot reach it); release | No high or medium review finding open (REVIEW.md); CI green; live on Pages; checklist ticked |

At each milestone you get: what shipped, the pull request, test results, screenshots and open decisions, in a few lines.

---

## j. Risks and how I will test them

| Risk | Mitigation | Test |
|---|---|---|
| The audience reads vendor rates as guarantees | Ranges and type tags; gripper wear on screen | `design` and `smoke` check tags; scenario 4 |
| The DC-wide annual figure is credited to one cell | Cells needed beside every annual figure; the demo cell's €42,759 shown apart | `engine` (figures), `smoke` (labels present) |
| Simulation taken for a robot integration | "Simulated cell" tag, "what is real" panel, script wording | `smoke`, `design` |
| Live mode fails on stage | Simulation fallback with identical events; Diagnostics pre-flight | `live` (same event sequence as `sims` for scenario 1), `accept` |
| Calibration breaks when the model changes | Targets frozen in the validator; calibration tool reruns the search | `world` on every push |
| Floating point differs between Node and Chromium | Integer milliseconds in the DES, hash-based draws, half-up decimal formatting | Snapshots compared in both |
| Scenario 1's decision is trivial because one option is both cheapest and safest | M3 tunes the express order (c.7) | `engine`: in scenario 1 the cheapest option on expected cost is not also the one with the most slack |
| The agent writes a figure the engine did not produce | Figure audit with cents, hours and rates; cards filled by id | `engine` and `live` refusal cases |
| The agent exceeds 40 calls | Merged wake-ups, compact tool results, blocking `sim_advance` | `live` counts calls on a full run |
| Open Food Facts blocks browsers or rate-limits | Snapshot default; probe; cache; cap of 3; failure memory | `live` and `accept` with fixtures for success, CORS failure and 429 |
| Audit export grows too large | Compact unit log; exceptions as full events | `smoke` checks export size below 1.5 MB |
| The 1280×720 layout gets crowded | Strip mode; folding world card; drawer "Hide" | `layout` at five sizes and five states |
| A name matches a real company | Searched on 16 Oct; searched again at M5 | Manual, recorded in DATA_SOURCES |
| Gross figure taken for net saving | "Gross, before cell costs" and break-even beside every annual figure | `smoke` |
| Model cost on stage | Caps of 40 calls and €3; cost meter; run facts | `live` cost equals usage maths |

---

## Appendix A. Open Food Facts probe for your browser

Open https://example.com in Chrome (any page without a strict content security policy; your prototypes' pages block this host on purpose), press F12, paste into the console and press Enter:

```js
fetch("https://world.openfoodfacts.org/api/v2/product/4037848020859.json?fields=code,product_name,brands,quantity,product_quantity,product_quantity_unit,packaging_text,categories_tags").then(async r=>console.log("OFF", r.status, JSON.stringify(await r.json()))).catch(e=>console.error("OFF blocked:", e))
```

Send me the console line. `OFF 200 {…}` means browsers may read the API, and the JSON is the record for the snapshot. `OFF blocked: TypeError: Failed to fetch` means they may not, and Live mode stays on the snapshot; then please open the same address in a new tab and send me the page text, so the snapshot still comes from the API.

## Appendix B. Phase 0 evidence kept outside the repository

The scratch calibration model, the escalation-rate study, the browser probe scripts and the Phase 0 screenshots stay in the build session's working folder, not in this repository: they are scaffolding, and M2 replaces the model with `js/nightsim.js` and `tools/calibrate_night.mjs`.
