# DATA_SOURCES — what Repack Pilot is built on

Repack Pilot uses **no data from the user or any client, and no personal data.** Everything is one of four things:

1. **Synthetic data.** Invented for this prototype and labelled Synthetic wherever it is shown: the retailer Ruhrkorb, its DC, its twelve stores and tonight's orders, the item master, the robot cell and its readings, and the shadow-mode record.
2. **Sourced parameters.** The inputs of the labour engine, each with a source key from the build brief or the label Assumption (§2).
3. **Open data.** One real product from Open Food Facts, kept apart from the synthetic world under its own licence (§4).
4. **Reference texts.** The two whitepapers for the framing, two shop-hours laws for scenario 5, and the GS1 rule that keeps the synthetic barcodes out of open trade.

**Version 0.2.0** (milestone M2, the physical layer), 16 October 2026. On screen: the synthetic world, the night simulation of the simulated cell, and the engine's figures with their sources on the KPI board and in the Assumptions tab. The Open Food Facts lookup arrives with M3. The model prices and the exchange rate behind the cost meter are operating data, recorded in `TECH_NOTES.md` §1.

> **Fictional retailer.** Ruhrkorb, Ruhrkorb DC Unna, its stores, orders, items, robot cell and shadow record are invented. The towns are real places in North Rhine-Westphalia; no real store, company or person in them is described. No robot vendor is named as the simulated robot.

---

## 1. Source keys

The keys carry over from the build brief, whose author opened and checked every page on 15 October 2026. Four keys are new; they and the rows marked *re-read* were checked in this build on 16 October 2026 (times UTC).

| Key | Source | Publisher, year | Type | Used for |
|---|---|---|---|---|
| IML | [Pick-Robotik: Fraunhofer IML Marktstudie](https://industriemagazin.at/logistik/pick-robotik-materialfluss-fraunhofer/) | Industriemagazin, reporting a Fraunhofer IML market study, 2026 | Press | Manual rate `r_m` (proxy; method not stated); the robot range of 500 to 1,400 picks per hour (manufacturer data, optimal conditions); adoption figures |
| EUROSTAT_LC | [Labour cost levels by NACE Rev. 2 activity (lc_lci_lev), Germany, NACE H](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lc_lci_lev?geo=DE&nace_r2=H&lcstruct=D1_D4_MD5&unit=EUR&format=JSON&lang=EN) | Eurostat, 2026 | Public statistics | Labour cost `c` = €35.80 per hour (2025; 2024: €35.10). *Re-read* in Phase 0: dataset updated 23 Apr 2026 (`PLAN.md` §1.4, P12) |
| KNAPP | [KNAPP's Pick-it-Easy robot proves a powerhouse for electrical wholesaler Obeta](https://warehousenews.co.uk/2021/02/knapps-pick-it-easy-robot-proves-a-powerhouse-for-electrical-wholesaler-obeta-2/) | Warehouse News, 2021 | Vendor/customer case | Proxy for `s` (70 % of pickable SKUs, an SKU share, not a unit share); G4's 600 picks per hour |
| REGISTER | [Amazon robots make progress picking](https://www.theregister.com/2025/05/13/amazon_robots_make_progress_picking/) | The Register, 2025 | Press, summarising Amazon's research paper | Proxy for `p` (91 % over 12,000 attempts in a trial); scenario 3 (19.4 % of pick requests rejected) |
| VULCAN | [Amazon Vulcan robot: pick, stow, touch](https://www.aboutamazon.com/news/operations/amazon-vulcan-robot-pick-stow-touch) | Amazon, 2025 | Vendor | G3's 75 % of item types; scenario 3 (a person tags in) |
| DHL | [Locus Robotics: robotic picking](https://dhl.com/global-en/delivered/innovation/locus-robotics-robotic-picking.html) | DHL, 2023 | Vendor/customer case | Context on the KPI board (30 to 180 % more units picked per hour with AMRs) |
| OTTO | [Otto Group partners with Covariant to deploy AI robotics](https://www.robotics247.com/article/online_retailer_otto_group_partners_with_covariant_to_deploy_ai_robotics_systems_for_its_logistics_network/covariant) | Robotics 24/7, 2023 | Press | Adoption in Germany (context) |
| OFF | [Open Food Facts terms of use](https://world.openfoodfacts.org/terms-of-use) | Open Food Facts, 2026 | Dataset licence | Scenario 3's product record (§4) |
| OFF_API | [Open Food Facts API documentation](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/) | Open Food Facts, 2026 | Documentation | Hosts, rate limits, User-Agent, licences. *Re-read* 16 Oct 2026, 09:57 (`TECH_NOTES.md` §4) |
| LADSCHLG | [§ 3 Ladenschlussgesetz](https://lxgesetze.de/ladschlg/3) (mirror of the federal text) | lxgesetze.de | Law | Scenario 5, federal background |
| **LOEG_NRW** (new) | [§ 4 Ladenöffnungsgesetz NRW](https://lexmea.de/de/gesetz/loeg-nrw/4) (mirror of the text in the Justizportal NRW) | Land North Rhine-Westphalia | Law | Scenario 5: § 4 (1) no. 2, shops "dürfen … am 24. Dezember an Werktagen bis 14 Uhr geöffnet sein". Read 16 Oct 2026, 09:58. The stores are in North Rhine-Westphalia, where the Land law applies (`PLAN.md` B3) |
| **GS1_RCN** (new) | [GSCN 23-006, "RCN updates"](https://www.gs1.org/docs/barcodes/GSCN-23-006-RCN.pdf) | GS1, ratified March 2023 | Standard | Synthetic barcodes: prefixes 02 and 20–29 are restricted circulation numbers, and "RCNs are not GTINs". Read 16 Oct 2026, 09:57 |
| **ECB_FX** (new) | [ECB euro reference rates, daily XML](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml) | European Central Bank | Public statistics | The cost meter's fixed 1 USD = 0.892 EUR (reference date 15 Oct 2026, €1 = $1.1208). Read 16 Oct 2026, 09:54 (`TECH_NOTES.md` §1) |
| **MACHREG** (new) | [Regulation (EU) 2023/1230 on machinery](https://osha.europa.eu/en/legislation/directive/regulation-20231230eu-machinery) (EU-OSHA's page on the Regulation; official text: [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2023/1230/oj)) | European Union, 2023 | Law | The KPI board's safety note. EU-OSHA: "The Regulation applies from 20 January 2027" and it "replaces Directive 2006/42/EC"; Article 51 repeals the Directive with effect from 20 January 2027 (read in a summary of Article 51, [presencis.com](https://cdn.presencis.com/regulations/machinery-regulation/article-51/); the EUR-Lex text was too long for the page fetcher to reach Article 51). Read 16 Oct 2026 |
| WP_DETECON | *Two AI Worlds, One Robot* | Detecon, 2026 | Whitepaper, project file | Framing: the repacking process (p. 9), the cup example (p. 7), the feedback loop (p. 8), peaks (p. 10) |
| WP_TSI | *From industrial data to Physical AI*, v5 of 15 September 2026 | T-Systems, 2026 | Whitepaper, project file | Framing: controlled autonomy (p. 5), Simulate and the gate between stages (pp. 8–9), the control record (p. 11) |

The brief's safety note (a real cell needs conformity assessment and CE marking under the EU Machinery Regulation (EU) 2023/1230, which applies from 20 January 2027, and under Directive 2006/42/EC until then) ships on the KPI board with its dates checked (MACHREG, `TECH_NOTES.md` D29); the demo script carries it from M4.

## 2. Engine parameters

The engine (`js/engine.js`) computes every hour and euro on screen from these inputs. The values are the brief's, unchanged; the Assumptions tab shows each with its key or the label Assumption and lets the presenter change it for this tab, every change in the audit (`TECH_NOTES.md` D30).

| Symbol | Parameter | Default | Unit | Key |
|---|---|---|---|---|
| `N` | Units repacked per year | 6,000,000 | units per year | Assumption: illustrative regional DC, about 24,000 units a day on 250 days |
| `r_m` | Manual picking rate | 400 | picks per labour hour | IML (proxy; method not stated); G4 tests 600 (KNAPP) |
| `c` | Labour cost, transport and storage, Germany, 2025 | 35.80 | € per hour | EUROSTAT_LC |
| `s` | Share of units the cell may handle | 0.70 | share | Assumption; proxy KNAPP |
| `p` | Grasp success rate | 0.91 | share | Assumption; proxy REGISTER (trial) |
| `r_c` | Cell grasp attempts per operating hour | 500 | attempts per hour | Assumption: low end of 500 to 1,400, manufacturer data under optimal conditions (IML) |
| `V` | Units tonight | 3,000 (N1), 4,200 (N2) | units | Synthetic |
| — | Call-in minimum per extra picker | 3 | hours | Assumption |
| — | Premium on call-in hours at night or at short notice | 25 | % | Assumption |
| — | Cost per store order that misses its truck | 250 | € | Assumption: for example a special delivery run; set per client |
| — | Nights per year; shift length | 250; 8 | nights; hours | Brief |

Robot rates appear as ranges with their type tag ("manufacturer data, optimal conditions", "trial"), never as guarantees.

### 2.1 The night simulation's own assumptions

The night simulation (`js/nightsim.js`, `TECH_NOTES.md` §7.2) needs a few values the brief does not give. Each is an Assumption, shown in the Assumptions tab or on the board where it acts; the escalation thresholds are example values a client sets.

| Value | Default | Where it acts | Basis |
|---|---|---|---|
| Grasp attempt; manual pick | 7.2 s; 9 s | From `r_c` = 500 and `r_m` = 400 | Brief (`r_c`, `r_m`) |
| Scale tolerance before a write-back | 25 % from the world model's weight | The world model corrects the whole SKU | Assumption |
| Cut-off risk band (E4) | 15 minutes | A store projected inside it is at risk | Assumption (brief) |
| Fragile item, low confidence (E2) | grasp confidence below 0.80 on a high or very high fragility item | To a person at the manual station | Assumption |
| Repeated failures (E3) | success over the last 100 attempts below 75 % | A person is called to the cell | Assumption (`TECH_NOTES.md` D2) |
| Camera confidence | 0.93 to 0.99, drawn per unit | Shown on detections | Assumption |
| Grasp confidence | 0.95 (low fragility), 0.92 (medium), 0.89 (high), 0.86 (very high), ± 0.04 per unit | The rehearsal and E2 | Assumption |
| Projection refresh | every 15 minutes while work remains, and at every correction, escalation and new order | Cut-off risk | Assumption |
| Option costing | 20 replications per option, common random numbers | Expected late orders and their cost | Assumption (`TECH_NOTES.md` D1) |
| Scenario 1 | 600 express units for Dortmund at 02:00, due 03:30; an olive-oil bottle lying on its side (grasp confidence 0.62) and a passata bottle with a chipped neck (0.71) | The night's events | Assumption, Synthetic |
| Scenario 3 | 6 units of barcode 4037848020859 at 23:10 | E1 | Synthetic (the product is real, §4) |
| Scenario 4 | grasp success falls to 70 % from 23:30 | E3 | Assumption |
| Scenario 5 | Soest's cut-off 01:30 instead of 02:40 | The plan | Assumption (§3.6) |
| Playback | ×1 about 6 simulated minutes per second; a stretch without events faster | The screen only, never a figure | Presentation |

## 3. The synthetic world: what is invented and what is real

Generated by `tools/build_world.mjs` (world 1.0.0) from the tables in `PLAN.md` §b, checked by `js/world_check.js` in CI and in Diagnostics. Every figure in it is Synthetic or an Assumption.

### 3.1 Retailer, DC and region

| Item | Value | Real or invented |
|---|---|---|
| Retailer | **Ruhrkorb**, a grocery chain | Invented. Web searches for "Ruhrkorb", alone and with GmbH, Supermarkt, Lebensmittel or Markt, returned no company (16 Oct 2026); searched again at M5 |
| DC | **Ruhrkorb DC Unna** | Invented, placed in a real logistics cluster by the Kamener Kreuz (A1/A2), home to large distribution parks such as Prologis Park Unna, P3 Kamen and Dachser Unna-Ost |
| Towns | Essen, Gelsenkirchen, Bochum, Herne, Hagen, Witten, Dortmund, Iserlohn, Hamm, Soest, Lünen, Schwerte | Real towns in the Ruhr area and its eastern neighbours; the stores are invented |
| People | Shift lead, picker at the manual station, on-call picker pool | Roles only; no names, no personal data |
| Robot cell | "Repack cell 1": 3D camera, a scale under the gripper, suction and a two-finger gripper | Simulated; no robot, camera or scale is connected, and no vendor is named |

### 3.2 Stores and truck cut-offs (tonight, N1)

Plan order is cut-off first; ties keep route order. At N2 (peak) every store and SKU total is × 1.4, in whole units.

| # | Store | Units N1 | Cut-off | Note |
|---:|---|---:|---|---|
| 1 | Essen | 320 | 01:35 | Farthest route, first truck |
| 2 | Gelsenkirchen | 220 | 01:40 | |
| 3 | Bochum | 300 | 01:50 | |
| 4 | Herne | 160 | 01:55 | |
| 5 | Hagen | 240 | 02:00 | |
| 6 | Witten | 230 | 02:05 | |
| 7 | Dortmund (flagship) | 600 | 02:30 | A second truck at 03:30 takes express orders |
| 8 | Iserlohn | 180 | 02:40 | |
| 9 | Hamm | 260 | 02:40 | |
| 10 | Soest | 150 | 02:40 | |
| 11 | Lünen | 140 | 05:40 | Short route, second wave |
| 12 | Schwerte | 200 | 06:00 | Short route, last truck |
| | **Total** | **3,000** | | |

The cut-offs come from the Phase 0 night calibration (`PLAN.md` §b.8), which meets the brief's four night targets on 14 of 14 seeds.

### 3.3 Items

24 own-label grocery items with invented names, weights, sizes, fragility and grip. 18 may go to the cell and carry 2,100 of the 3,000 units (the brief's s = 0.70); their per-SKU grasp success rates (0.83 to 0.95) are Assumptions whose unit-weighted mean is exactly the brief's p = 0.91. Six go to the manual station, each with its reason: eggs (very fragile), a six-pack of water (over the cell's 3 kg payload), potatoes and bananas (irregular shape), red wine (fragile and age-restricted) and basil (soft plant).

- **The glass jar (scenario 2).** S07, apricot jam 200 g in a glass jar: the item master holds 200 g, the net content on its label, and the simulated scale will read 400 g. It is synthetic on purpose: a simulated 400 g reading on a real product would state a false fact about it (`TECH_NOTES.md` D4). Every other item's master weight equals what the scale will read.
- **Barcodes.** Restricted circulation numbers with GS1 prefix 20 and a valid check digit (GS1_RCN), so they identify no product in open trade.

### 3.4 Night, people, cell and tote

| Parameter | Value | Basis |
|---|---|---|
| Shift | 22:00–06:00 | Brief |
| Inbound waves | Ambient goods on the pallets at 22:00; chilled goods from a fresh hub at 01:00 | Assumption (`PLAN.md` B2) |
| Manual station | One picker at 400 picks per hour; an on-call pool for call-ins | Brief (`r_m`, IML) |
| Cell | One cell, 500 attempts per hour, 3 kg payload | Brief (`r_c`), Assumption (payload) |
| Tote | 15 kg limit, heavy items first | Assumption (`PLAN.md` B6) |
| Express order (scenario 1) | 600 units for Dortmund at 02:00, due on its 03:30 truck | Assumption (`PLAN.md` B2) |

### 3.5 Shadow-mode record

`data/shadow_record.js` holds seven earlier nights in which the agent only recommended and a person decided: **138 decisions, 128 the same as the person's (92.8 %), no missed escalation, no agent-caused missed cut-off.** Synthetic, drawn from a fixed seed. The brief's example gate (at least 200 decisions over at least 10 nights, at least 95 % agreement, no missed escalation, no agent-caused missed cut-off) therefore fails on three counts on purpose, so Bounded stays locked and the dial says why (M4).

### 3.6 The six scenarios

| # | Scenario | Real | Invented |
|---|---|---|---|
| 1 | Express order for the flagship store at 02:00 | The pattern: priorities shift "the moment an express order comes in" (WP_DETECON p. 9) | The order, its 600 units, the stores at risk |
| 2 | Glassware heavier than master data | The cup example (WP_DETECON p. 7); labels state net content, a scale weighs the object | The jar, its two weights |
| 3 | Unknown SKU on the pallet | The product behind barcode 4037848020859 (Open Food Facts, §4); robots reject or hand over items they cannot handle (REGISTER, VULCAN) | Its arrival on Ruhrkorb's pallet |
| 4 | Gripper wear | — (stress test) | The drop from 91 % to 70 % (Assumption) |
| 5 | Store closes early before a holiday | 24 December 2026 is a Thursday; § 4 (1) no. 2 LÖG NRW (LOEG_NRW), § 3 LadSchlG as background (LADSCHLG) | Soest's earlier cut-off |
| 6 | Peak week, +40 % volume, no extra staff | Peaks should not "immediately" require extra staff (WP_DETECON p. 10) | The 4,200 units |

## 4. Open Food Facts

| Topic | What applies |
|---|---|
| Licence | Database under the Open Database License (ODbL), contents under the Database Contents License (DbCL), images under CC BY-SA (OFF, OFF_API) |
| Attribution | "Product data: Open Food Facts, ODbL" with a link to openfoodfacts.org, wherever the product is shown, and here |
| Where the data lives | `data/off_snapshot.js`, a file of its own under ODbL, apart from the synthetic world. It holds no record yet (status `pending`): the record is built from an API response, never from a page summary (`TECH_NOTES.md` D3, D14) |
| Fields kept | `code`, `product_name`, `brands`, `quantity`, `product_quantity`, `product_quantity_unit`, `packaging_text`, `categories_tags`, the fetch date and the API version |
| Images | None. Neutral icons avoid the CC BY-SA duties |
| The product | `4037848020859`, "Bio Elisen-Lebkuchen vegan – Nürnberger Bio Originale – 210g", sold in Germany, packaging not filled in (product page, 16 Oct 2026). A seasonal item arriving in October before the item master knows it |
| Live lookups (M3) | Only in Live mode, at most 3 per run, cached; no search. The documented limit is 15 product reads per minute per IP address |
| User-Agent | The API asks for `AppName/Version (ContactEmail)`. Chromium drops a custom User-Agent on `fetch`, so none is sent: a known deviation (`TECH_NOTES.md` §4, P5) |
| Browser access | Not documented, and not yet probed from a browser (`TECH_NOTES.md` §4). Until a probe shows that browsers may read the API, the content security policy does not list the host and Live mode uses the snapshot |

## 5. Front-end assets

The fonts Barlow, Barlow Semi Condensed and IBM Plex Mono (Fontsource 5.3.0, SIL Open Font License 1.1) are served from the app itself, so no visitor data goes to a font service; their licences are in `fonts/`. The author photo in the drawer bar is Victor Pflüger's own, as in Rebate Hunter. The logo and favicon are drawn for this app. There is no runtime library and no CDN.

## 6. Caveats to mention when presenting

1. **The cell is simulated.** No robot, camera or scale is connected; the "Simulated cell" tag stays on the cell in both modes, and the intro's "what is real" panel says what is simulated.
2. **The world is synthetic.** Ruhrkorb, its stores, orders and items are invented; the towns are real.
3. **Robot rates are ranges and proxies,** from manufacturer data under optimal conditions, a vendor case and a trial, not guarantees (the Assumptions tab says which).
4. **The annual figure is gross**, before cell costs, and always shown with the number of cells it needs and the break-even cost per cell hour. There is no payback claim.
5. **The simulated cell is not a safety system** (the brief's safety note, §1).

## 7. What Repack Pilot does **not** use

- No client data, no personal data, no warehouse-management or robot integration: the `wms_*` and `cell_*` tools (M3) read the synthetic world in the browser.
- No real robot vendor as the simulated robot; vendors appear only as cited precedents.
- No product images, and no Open Food Facts data inside the synthetic world.
- No server-side web search (`TECH_NOTES.md` §2) and no scraping: the only live sources are the Claude API and, from M3 and once probed, the Open Food Facts API.
