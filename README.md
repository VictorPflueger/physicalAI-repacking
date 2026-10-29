# Repack Pilot — a Physical AI repacking showcase

A browser-only showcase of Physical AI in logistics. Repack Pilot shows one night shift in a retail distribution centre: a simulated robot cell, planned by an AI agent, repacks mixed pallets into 12 store orders, and a deterministic engine prices every 1,000 units in labour hours and euros, manual baseline against a hybrid cell. In a five-minute call a customer sees what it does, how it works and what it is worth, around the robot's world model: the robot works from a model of every item, camera and scale keep it right, what it does not know goes to a person, and labour per 1,000 units falls from €89.50 by hand to €32.49 with the cell (`DEMO_SCRIPT.md`).

**Version 0.5.0: the look moves to Vici, Victor's design system, in a light and a dark theme.** Static website, no backend, no build step. Live at **https://victorpflueger.github.io/physicalAI-repacking/** (GitHub Pages from `main`).

| Milestone | What it adds | Status |
|---|---|---|
| M1 Shell (0.1.0) | The screen, the two modes and the key handling, Diagnostics, the intro with "what is real", the synthetic world with its checks, CI | Done |
| M2 Physical layer (0.2.0) | The engine with the brief's golden cases, the seeded night simulation, the cell board, the world-model panel, the header tiles, the KPI board and the assumptions; a night that plays without the agent | Done |
| M3 Agent (0.3.0) | The live agent and its 24 tools, guardrails in code, options, outbox, summary, run facts, the Open Food Facts lookup (on the bundled snapshot), the scripted replay and its checker; scenario 1 end to end in both modes | Done |
| M4 Customer case and scenarios (0.4.0) | Scenarios 2 to 6 with their scripted replays, the recorder, the autonomy dial with its gate, the acceptance suite; the five-minute customer case: How it works as the opener with the engine's figures, a simple console, plain words, option cards that open with the trucks, the closing card on what it is worth, Your DC on the KPI board, the five-minute demo script | Done |
| M4.1 The world model at the centre (0.4.1) | Victor's rework of 19 Oct 2026: the **Customer view**, now the default, with the robot's world model at the centre and What it is worth beside it; scenario 3 as the main run; How it works with the world model in four steps; the demo script for scenario 3; the M4 screen as the **Full view** | Done |
| The look on Vici (0.5.0) | Victor's request of 28 Oct 2026: Vici v1.0.0, his design system, as in Rebate Hunter: its colours, type, components, icons and hexagons, a light and a dark theme, the page icon of the website's card and the byline; no feature, figure or behaviour changed (`TECH_NOTES.md` D70–D83) | This version |
| M5 Hardening (1.0.0) | Layout and design suites, complete documents, an independent review, release | Planned |

`PLAN.md` holds the build plan Victor approved on 16 October 2026; each milestone lands as one pull request with green CI.

---

## What it is and why it matters

Repacking stays manual because fixed automation breaks on variety. Goods arrive in bulk, sorted by type, and must be reassembled per store: "sometimes it's ten items for a small city store, sometimes several hundred for a flagship location" (Detecon, *Two AI Worlds, One Robot*, p. 9). Items differ in shape, weight and fragility, orders change by the hour, and an express order reshuffles priorities. At about 400 picks per hour (IML) and €35.80 per labour hour (EUROSTAT_LC), every 1,000 units cost about €90 in labour.

Robots that perceive and decide now handle most items, but not all of them. The money sits in the split between what the cell does and what people still do, and that split is what Repack Pilot makes visible. At the brief's default inputs, labour falls from €89.50 to €32.49 per 1,000 units: the engine's figure, with every input sourced or labelled Assumption (`DATA_SOURCES.md`).

| Aspect | Repack Pilot |
|---|---|
| Buyer | Head of DC operations; COO retail logistics |
| Question answered | How many store orders can we repack tonight without extra staff, and what does each unit cost us in labour? |
| Headline KPI | Labour hours and € per 1,000 units repacked: manual baseline against hybrid cell |
| Physical AI on screen | Camera and scale readings, grasp rehearsal against the world model, write-back of deviations, replanning, escalation to a person |
| Simulated, and labelled so | Robot cell, camera, scale, gripper, warehouse system, retailer, stores and orders |
| Real | The agent in Live mode, the engine's arithmetic, sourced parameters, and Open Food Facts product data once a browser may read it |

> **Fictional retailer.** Ruhrkorb, its DC in Unna, its stores, orders, items and robot cell are invented and labelled Synthetic. The towns are real; no real store, company or person is described, and no real robot vendor is named as the simulated robot. See `DATA_SOURCES.md`.

## How it works

```
 Presenter's browser: static files from GitHub Pages (or any static host)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                                                                            │
 │   Live agent                          ┐                                    │
 │   Claude tool-use loop, streamed      │   one stream of     ┌───────────┐  │
 │                                       ├─► run events ──────►│ Cell      │  │
 │   Simulation player                   │   (js/events.js)    │ board,    │  │
 │   scripted replay, offline            ┘                     │ KPIs,     │  │
 │                                                             │ console,  │  │
 │   24 tools, the same for both                               │ options,  │  │
 │    wms_*    orders and stock (synthetic warehouse system)   │ outbox,   │  │
 │    cell_*   robot status and grasp plans                    │ audit log │  │
 │    world_*  the world model: read, propose corrections      └───────────┘  │
 │    sim_*    engine, night simulation, option costing                       │
 │    open_*   Open Food Facts lookup ─────────────────────┐                  │
 │    ui_*     options, approvals, escalations: they wait for a person        │
 │                                                         │                  │
 └───────────┬─────────────────────────────────────────────┼──────────────────┘
             │ HTTPS with your API key                      │ HTTPS, no key
             ▼                                              ▼
   api.anthropic.com/v1/messages              world.openfoodfacts.org (once a browser
                                              probe shows it may be read; until then
                                              the bundled snapshot answers)
```

- **Two producers, one screen.** The live agent and the simulation player call the same tools on the same night and emit the same run events, so the screen behaves the same in both modes, and the same decisions give the same night to the millisecond.
- **Synthetic world.** `data/world.js` holds the retailer, its twelve stores with their truck cut-offs, the item master, the inbound waves, the cell and the manual station. It ships as a script, so nothing is fetched, and `js/world_check.js` checks it in CI and in Diagnostics.
- **Numbers from code, not from the model.** A deterministic engine computes every hour and euro; guardrails in code refuse any amount, hour or rate in the agent's text that no tool produced, and the console shows each refusal as a **Guardrail** line. Escalation rules, decisions, drafts and the autonomy gate live in code (`TECH_NOTES.md` §9).
- **A seeded night.** `js/nightsim.js` simulates the night unit by unit: the camera, the world model, every grasp, the scale, the manual station, the totes against the truck cut-offs. The same scenario and seed give the same night in every browser, to the millisecond; `js/night.js` plays it at the chosen speed (`TECH_NOTES.md` §7).
- **Browser-enforced boundaries.** The page's content security policy lets it connect to api.anthropic.com only and loads nothing else from outside: scripts, styles and fonts ship with the page. The key lives in this tab's session storage only, under the app's own name.

## Run it

**Online.** Open https://victorpflueger.github.io/physicalAI-repacking/ in a current Chrome or Edge.

**Locally.** Browsers do not run JavaScript modules from `file://`, so double-clicking `index.html` shows a page that explains this. Start any static web server in the folder instead:

```
python3 -m http.server 8000
```

On Windows, use `py -m http.server 8000`. Then open `http://localhost:8000`. Live mode works locally too, because the Anthropic API accepts browser calls from any origin (`TECH_NOTES.md` §3).

**Updating.** GitHub Pages caches files for up to ten minutes. After an update, hard-reload (**Ctrl + Shift + R**, or **Cmd + Shift + R** on a Mac) and check the version at the bottom of Diagnostics.

## First visit

On a first visit, the **How it works** window opens: what Repack Pilot does and why its world model makes it work, the world model in four steps (it knows every item, camera and scale check it, it learns what differs, it asks a person about what it does not know), why it pays off in three figures from the engine at your inputs (€32.49 per 1,000 units with the cell instead of €89.50 by hand, −64 %; €342,069 a year for a site repacking six million units, on 4.2 cells; a cell pays while it costs less than €40.72 an operating hour) and **what is real**. **How it works** in the header opens it again at any time; it is the opener of the five-minute call.

**Start agent** asks how the agent should run: **Simulation** (no key) or **Live** (your own key).

**Scenario 3, the main run** (since 19 Oct 2026), in the **Customer view**, where the page opens. The left side is the robot's world model: one item's way through the cell (camera, world model, robot, scale, and what goes to a person), the moment, tonight's pallet item by item as the model holds it, and what the model learned. At 22:17 the scale finds the apricot jam's glass jar at 400 g, not 200 g: the model learns it for every jar, and the next one is rehearsed with the new weight. At 23:10 the camera reads a barcode the model does not know: a rule in code hands its 6 units to a person, and a provisional entry waits for you to **Confirm entry** or **Reject**. At 06:00 every store order is on its truck. The right side shows **What it is worth**: labour per 1,000 units by hand and with the cell, tonight's labour against the same units by hand, what the model caught as counts, and **Your DC** for the customer's yearly volume and labour cost. In Simulation at ×1 the night is over about 95 s after the start and the run done at about 105 s, when you confirm 20 s after the model asks (`DEMO_SCRIPT.md`).

**Scenario 1, the express order**, in the **Full view** for longer sessions. At 22:00 the agent reads the night and plans it. At 22:17 the scale finds the glass jar heavier than master data: the world model writes the weight back and the agent closes Essen's tote. At 22:41 two fragile bottles go to a person. At 02:00 an express order for the Dortmund flagship puts Hamm and Soest at risk: the agent prices three options against doing nothing, recommends one, and the night stands still until you decide in the **Options** tab. After your approval the agent applies the option, drafts what it needs (a call-in, a note to the store) and waits until you approve or reject each draft in the **Outbox**; nothing is sent. At 06:00 a closing card sets tonight's labour against the same units by hand and says what the cell is worth; **Your DC: the business case** opens the KPI board, where you type the customer's yearly volume. A management summary closes the night. In Simulation the run takes about 30 s at ×4, 55 s at ×2 and 110 s at ×1, plus your decisions.

**The other four scenarios**, each a scripted replay in Simulation and the live agent in Live: **2**, the glass jar on its own (the world model learns, nothing to decide); **4**, gripper wear (fragile items go to a person, three options with a maintenance stop); **5**, a store closing early on 24 December (the plan absorbs it, nothing to decide); **6**, a peak night of 4,200 units with the usual staff (three options for the two stores that would miss their trucks).

## Reading the screen

- **Two views of one run.** The switch in the header, beside the mode badge, changes between **Customer**, the default, and **Full**; switching never touches the night. The Customer view shows the robot's world model with What it is worth beside it and the console below; the Full view shows the cell board with every store lane, the model choice and the autonomy dial.
- **"You are interacting with an AI system"** stays in the header at all times, and every dialog repeats it in its footer while its backdrop blurs the header.
- **Merlot is you.** Primary and Approve buttons are merlot, and so is the step of the progress rail that waits for you; an item handed to a person wears a merlot frame.
- **Lilac is the AI.** The options, drafts and summary the agent wrote carry an **AI** label with a short explanation.
- **Red, honey and green are the store orders against their trucks:** late, at risk, on time. A word or an icon always says the same thing.
- **The world model** (Customer view) and **the cell board** (Full view) carry a neutral **Simulated cell** tag in both modes. The **SIMULATION** badge, tape and watermark (stripes in the text and surface colours, ink and white in the light theme, always with the word) mark scripted replays only; a live run carries **LIVE**. Generated data carries a neutral **Synthetic** tag with a dashed outline. Along the top, the cell line: the inbound pallet, the camera, the robot cell, the scale and the manual station. Below, a lane per store order filling against its truck cut-off, and the world-model card: expected against observed, and the corrections log. Every station, lane and the world model opens its details with a click or Enter. With the drawer open the board folds down to a strip of store chips.
- **The header tiles:** labour per 1,000 units (the manual baseline, then the hybrid plan), store orders on time, the night clock (with what the night waits for: *the agent's turn*, *your decision*, *your approval*) and the session cost.
- **The progress rail** above the console shows the agent's plan in five steps: Perceive, Plan, Pick, Replan, Prepare. The console opens in a **simple view**: the agent's words and the night's moments by the night clock, your decisions, the closing card and the run facts. **Details** in its head adds every tool call, phase, wake-up and hourly line, and every **Guardrail** refusal stays visible.
- **The autonomy dial** in the control bar: **Advise** (you apply an approved option yourself), **Approve** (the default: the agent applies it after your click) and **Bounded**, locked until the shadow-mode record meets its gate; click it to see why.
- **The drawer** has five tabs: **Options** (three costed options and doing nothing, each opening with what happens to the trucks over 20 simulated nights, then extra labour, late orders and the expected total; the recommended one framed in merlot, with why), **Outbox** (the drafts that wait for your approval), the **KPI board** (what it is worth first, with **Your DC** for the customer's volume and labour cost; then Plan against Tonight, every figure with its source), **Assumptions** (every input, editable, every change in the audit) and **Audit**, which exports as JSON.

The look is Vici, Victor's design system, copied into `vici/`: its colours in a light theme (the default, for projectors in lit rooms) and a dark one, switched with the moon and sun in the header; Inter, Bricolage Grotesque and JetBrains Mono; hexagons wherever another system would draw a circle. Every colour the app draws is checked for contrast in both themes and for colour blindness. `DESIGN.md` explains the system, which Repack Pilot shares with Rebate Hunter, the Navigator and the Timetable Translator.

## The two modes

| | **Simulation** | **Live agent** |
|---|---|---|
| What runs | A scripted replay of a representative agent run, played through the agent's own tools (all six scenarios), or a recorded live run saved with **Save run as simulation** | Claude with real tool calls on the same tools |
| Figures | Computed by the engine and the night simulation at playback; the script types none | Computed by the engine and the night simulation |
| Key and cost | None | Your own Anthropic API key; at most 40 model calls and €3 per run, with a live cost meter |
| Network | None; works fully offline | api.anthropic.com only |
| Labelling | SIMULATION badge, tape and watermark; "Simulated run" in the summary; `"mode": "simulation"` in the audit export | LIVE badge; "Live agent run on a simulated cell" in the summary; `"mode": "live"` |

Replay speed ×1, ×2 or ×4 is set with **Night speed** in the control bar. A scripted replay keeps the rates that shape the night at the brief's values, because its words describe that night; prices you change in the Assumptions tab still apply (`TECH_NOTES.md` D34).

## Your API key

- Live mode asks for an Anthropic API key. It is checked with the free Models list (no tokens used), kept in **this tab's session storage only** under `rp.anthropic.key`, masked in the dialog, never written to local storage, the console, the page or the audit export, and sent only to api.anthropic.com.
- **Use a dedicated key with a low monthly spend limit.** Spend limits are set per workspace: at platform.claude.com, create a workspace, set its limit, and create the key in it.
- **Change or forget the key** from the mode choice.
- All of Victor's prototypes share the `victorpflueger.github.io` origin, so every storage key of this app starts with `rp.`, and it never reads another app's key.

## Diagnostics

**Diagnostics** in the control bar tests, from this browser:

| Row | What it checks |
|---|---|
| Anthropic API | Without a key: one keyless request that the API answers with 401, which proves the browser can reach it (nothing billed). With a key: the free Models list |
| World data integrity | The synthetic world, the scenarios and their nights, the night calibration on 14 seeds, the shadow record and the Open Food Facts file (14 checks, `js/world_check.js`) |
| Simulation scripts | Each scripted replay played headless through the agent's own tools on every decision path: every tool call passes the live guardrails, every placeholder resolves, every figure comes from a tool (`js/sim_check.js`) |
| Open Food Facts | Skipped while live reads are off: no request is sent, and lookups answer from the bundled snapshot |
| Key and privacy | The page's security policy allows exactly the hosts in `js/config.js`; no key in local storage; key redaction works and the audit export carries no key |

Run it on the presentation laptop before a demo. The version is shown at the bottom.

## Where the story comes from

Repack Pilot is Detecon's flagship use case made clickable, run under T-Systems' rules for controlled autonomy (the build brief's anchor table; page numbers checked against both whitepapers on 16 Oct 2026).

| Element | Detecon: *Two AI Worlds, One Robot* | T-Systems: *From industrial data to Physical AI* |
|---|---|---|
| Repacking, allocation and grasping | "In detail: the repacking process in logistics" (p. 9) | Value pool "Intralogistics and supply chain" (p. 10) |
| World model, expected against observed | The cup that weighs 400 g instead of the stored 200 g; Physical AI "rehearses the grip against the model" (p. 7) | Roadmap step Simulate: a twin "needs to answer the question reliably" (p. 8) |
| Feedback loop and escalation | Agentic AI "replans, brings the next item forward, or escalates to a human employee" (p. 10); loop figure (p. 8) | Controlled autonomy: systems "operate within explicit limits, communicate uncertainty, record decisions and escalate exceptions" (p. 5) |
| Autonomy dial and shadow-mode gate | Explainability "a condition for approval" under the EU Machinery Regulation and AI Act (p. 11) | Decision support, approved workflows, bounded execution; "Autonomy is therefore an operating policy" (pp. 8–9) |
| Audit log and human decisions | The shift "from doing the work to overseeing it" (p. 11) | Control record of purpose, owner, data, model version, testing, approval and escalation (p. 11) |
| KPI board and business case | DHL and Locus: 30 to 180 % more picks per hour (p. 10) | Start from "a KPI that leaders already manage" (p. 10) |
| Next step after the demo | Test and validate at the Hyperconnectivity Campus (p. 12) | "Prove the behavior in simulation or shadow mode, and fund expansion only when evidence supports it" (p. 14) |

## Documents

| File | What it holds |
|---|---|
| `PLAN.md` | The approved build plan: architecture, world, engine, events and tools, guardrails, scenarios, screen, tests, milestones |
| `TECH_NOTES.md` | Verified facts with dates (models and prices, the API's request fields, CORS probes, Open Food Facts, the world, the security policy), the engine, the night simulation and the golden option cases, the decision log (D-numbers), the live agent's guardrails, the simulation scripts, verification log and acceptance checklist |
| `DATA_SOURCES.md` | Every source key, the engine's parameters, what is synthetic and what is real, the Open Food Facts licence |
| `DESIGN.md` | The design system on Vici: colour grammar, where the look comes from, checks, agentic patterns, the cell board, the Customer view, the KPI board, the console's two views, the deviations from Vici and the icons to propose for it |
| `DEMO_SCRIPT.md` | The five-minute customer call: the one sentence, the timing, what to say at each moment, questions and answers |
| `tests/README.md` | The test suites and how to run them |

## Tests

`node tests/run-all.mjs` runs the twelve suites of this version: the colour system on Vici's tokens in both themes (`tokens`), the page icon against the website's card (`page-icon`), the copy of Vici (`vici-files`), the synthetic world, the night calibration and the script checker (`world`), the client, formatting and checks (`unit`), the engine, the night simulation and the agent's tools (`engine`), and, in Chromium through Playwright, the workspace and the scripted replay (`smoke`), the nights and the replay in the browser against Node (`sims`), the live loop against a fake Claude for all six scenarios (`live`), the acceptance tests: the key, Diagnostics, Abort and Reset, every scenario offline (`accept`), the layout at five window sizes (`layout`), and Vici's hexagon rule in the files and the rendered app (`hexagon`). GitHub Actions runs them on every push and pull request. No test calls a real API or spends money. Setup and details: `tests/README.md`.

## Sister prototypes

[Rebate Hunter](https://github.com/VictorPflueger/PROC-Rebate-Hunter) (procurement rebates) and the [Supply Chain Navigator](https://github.com/VictorPflueger/supply-chain-navigator) (supply-chain disruptions). Repack Pilot is built on Rebate Hunter's shell, and since 0.5.0 on Vici, the design system all of Victor's prototypes share.

## Author

**Victor Pflüger** · [linkedin.com/in/victorpflueger](https://www.linkedin.com/in/victorpflueger)
