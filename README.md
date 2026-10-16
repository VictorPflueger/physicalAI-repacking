# Repack Pilot — a Physical AI repacking showcase

A browser-only showcase of Physical AI in logistics. Repack Pilot shows one night shift in a retail distribution centre: a simulated robot cell, planned by an AI agent, repacks mixed pallets into 12 store orders, and a deterministic engine prices every 1,000 units in labour hours and euros, manual baseline against a hybrid cell. In eight minutes the audience sees the robot meet a surprise, the world model learn from it, the agent replan, a person decide and the euro figure move.

**Version 0.2.0: the physical layer (milestone M2).** Static website, no backend, no build step. Live at **https://victorpflueger.github.io/physicalAI-repacking/** (GitHub Pages from `main`).

| Milestone | What it adds | Status |
|---|---|---|
| M1 Shell (0.1.0) | The screen, the two modes and the key handling, Diagnostics, the intro with "what is real", the synthetic world with its checks, CI | Done |
| M2 Physical layer (0.2.0) | The engine with the brief's golden cases, the seeded night simulation, the cell board, the world-model panel, the header tiles, the KPI board and the assumptions; a night that plays without the agent | This version |
| M3 Agent (0.3.0) | The live agent and its tools, guardrails in code, options, outbox, summary, Open Food Facts lookup, Simulation replays; scenario 1 end to end | Next |
| M4 Scenarios (0.4.0) | Scenarios 2 to 6, the recorder, the autonomy dial with its gate, the eight-minute demo script | Planned |
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
| Real | The agent in Live mode, the engine's arithmetic, sourced parameters, the optional Open Food Facts lookup |

> **Fictional retailer.** Ruhrkorb, its DC in Unna, its stores, orders, items and robot cell are invented and labelled Synthetic. The towns are real; no real store, company or person is described, and no real robot vendor is named as the simulated robot. See `DATA_SOURCES.md`.

## How it works

```
 Presenter's browser: static files from GitHub Pages (or any static host)
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                                                                            │
 │   Live agent (M3)                     ┐                                    │
 │   Claude tool-use loop, streamed      │   one stream of     ┌───────────┐  │
 │                                       ├─► run events ──────►│ Cell      │  │
 │   Simulation player (M3)              │   (js/events.js)    │ board,    │  │
 │   scripted replay, offline            ┘                     │ KPIs,     │  │
 │                                                             │ console,  │  │
 │   Tools the agent calls (M3)                                │ options,  │  │
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
   api.anthropic.com/v1/messages              world.openfoodfacts.org (M3, once a
                                              browser probe shows it may be read)
```

- **Two producers, one screen.** The live agent and the simulation player emit the same run events, so the screen behaves the same in both modes.
- **Synthetic world.** `data/world.js` holds the retailer, its twelve stores with their truck cut-offs, the item master, the inbound waves, the cell and the manual station. It ships as a script, so nothing is fetched, and `js/world_check.js` checks it in CI and in Diagnostics.
- **Numbers from code, not from the model.** A deterministic engine computes every hour and euro; guardrails (M3) reject any amount in the agent's text that the engine did not produce. Escalation rules and the autonomy gate live in code.
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

On a first visit, a short window explains what Repack Pilot does, how it works (perceive, plan, pick, replan, prepare), why it pays off and **what is real**. **How it works** in the header opens it again at any time.

**Start agent** asks how the agent should run: **Simulation** (no key) or **Live** (your own key). In this version either choice plays tonight's night **without the agent**, a *night preview* with its own badge: the cell board, the header tiles, the console and the KPI board follow the night at the chosen speed, and at each moment the agent will take its turn (a correction, an escalation, the express order) the night pauses briefly. A night takes about 60 s at ×1, 30 s at ×2 and 15 s at ×4. No model is called and nothing is sent; the agent arrives with M3.

## Reading the screen

- **"You are interacting with an AI system"** stays in the header at all times.
- **Burgundy is you.** Primary and Approve buttons are burgundy, and so is the step of the progress rail that waits for you.
- **Violet is the AI.** What the agent wrote will carry an **AI** label (M3).
- **Red, amber and green are the store orders against their trucks:** late, at risk, on time. A word or an icon always says the same thing.
- **The cell board** carries a neutral **Simulated cell** tag in both modes. The hazard-style **SIMULATION** badge is kept for scripted replays (M3). Generated data carries a dashed **Synthetic** chip. Along the top, the cell line: the inbound pallet, the camera, the robot cell, the scale and the manual station. Below, a lane per store order filling against its truck cut-off, and the world-model card: expected against observed, and the corrections log. Every station, lane and the world model opens its details with a click or Enter. With the drawer open the board folds down to a strip of store chips.
- **The header tiles:** labour per 1,000 units (the manual baseline, then the hybrid plan), store orders on time, the night clock and the session cost.
- **The progress rail** above the console shows the agent's plan in five steps: Perceive, Plan, Pick, Replan, Prepare. The console logs the night's moments by the night clock.
- **The drawer** has five tabs: Options and Outbox (with the agent, M3), the **KPI board** (Plan against Tonight, the annual figure with the cells it needs, every figure with its source), **Assumptions** (every input, editable, every change in the audit) and **Audit**, which exports as JSON.

Every colour is generated from the one burgundy and checked for contrast and colour blindness. `DESIGN.md` explains the system, which Repack Pilot shares with Rebate Hunter and the Navigator.

## The two modes

The agent's runs arrive with M3; until then both choices play the night preview. This is how the two modes will differ:

| | **Simulation** | **Live agent** |
|---|---|---|
| What runs | A scripted replay of a representative agent run (M3) | Claude with real tool calls (M3) |
| Figures | Computed by the engine at playback | Computed by the engine |
| Key and cost | None | Your own Anthropic API key; capped at 40 model calls and €3 per run |
| Network | None; works fully offline | api.anthropic.com (and Open Food Facts once probed) |
| Labelling | SIMULATION badge and tape, `"mode": "simulation"` in the audit export | LIVE badge, `"mode": "live"` |

Replay speed ×1, ×2 or ×4 is set with **Night speed** in the control bar.

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
| `TECH_NOTES.md` | Verified facts with dates (models and prices, CORS probes, Open Food Facts, the world, the security policy), the engine and the night simulation, the decision log (D-numbers), verification log and acceptance checklist |
| `DATA_SOURCES.md` | Every source key, the engine's parameters, what is synthetic and what is real, the Open Food Facts licence |
| `DESIGN.md` | The design system: colour grammar, palette, checks, agentic patterns, the cell board, the KPI board |
| `tests/README.md` | The test suites and how to run them |

`DEMO_SCRIPT.md`, the eight-minute script, follows with the scenarios (M4).

## Tests

`node tests/run-all.mjs` runs the seven suites of this version: the colour system (`tokens`), the synthetic world and the night calibration (`world`), the client, formatting and checks (`unit`), the engine and the night simulation (`engine`), and, in Chromium through Playwright, the workspace and the night (`smoke`), the six nights in the browser against Node (`sims`) and the layout at five window sizes (`layout`). GitHub Actions runs them on every push and pull request. No test calls a real API or spends money. Setup and details: `tests/README.md`.

## Sister prototypes

[Rebate Hunter](https://github.com/VictorPflueger/PROC-Rebate-Hunter) (procurement rebates) and the [Supply Chain Navigator](https://github.com/VictorPflueger/supply-chain-navigator) (supply-chain disruptions). Repack Pilot is built on Rebate Hunter's shell and design system.

## Author

**Victor Pflüger** · [linkedin.com/in/victorpflueger](https://www.linkedin.com/in/victorpflueger)
