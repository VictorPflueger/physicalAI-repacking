# Tests (optional, for developers)

Repack Pilot itself needs no Node.js, npm or build step. These scripts are the checks behind the acceptance checklist in `TECH_NOTES.md` §12. Run them after changing code or data. GitHub Actions runs them on every push and pull request (`.github/workflows/tests.yml`).

The suites grow with the milestones, as in Rebate Hunter: `engine`, `sims` and `layout` arrived with the engine and the night simulation (M2); the scripted replays join `sims` and the `live` suite arrives with the agent (M3); `accept` and `design` follow with the scenarios and the hardening (M4, M5).

## What runs

| Suite | Command | Checks |
|---|---|---|
| tokens | `node tools/palette.mjs --check` | The colour system: WCAG 2.2 contrast for every text and state pairing, burgundy kept apart from danger, the board states, cost bars and brand kept apart under simulated protanopia, deuteranopia and tritanopia, and `css/tokens.css` and `design/tokens.json` up to date with the generator (45 checks). Node.js only |
| world | `node tools/check_world.mjs` | The synthetic world (12 stores in plan order, 24 SKUs, the allocation exact at 3,000 and 4,200 units, s = 0.70 and p = 0.91, the item master, the glass jar's two weights, restricted-circulation barcodes, waves, cell and tote), the six scenarios and their nights, the night calibration on all 14 seeds, every scenario's night reproducible, the shadow record against the example gate (with a passing control), the Open Food Facts file's attribution, and that `data/world.js` and `data/shadow_record.js` are exactly what `tools/build_world.mjs` writes (15 checks). Node.js only |
| unit | `node tests/unit.mjs` | Streaming client: SSE parsing, thinking signatures, retries, aborts, truncated streams; cost maths per model at 0.892 EUR per USD; half-up display rounding (31.325 → 31.33, where `toFixed` gives 31.32); the night-shift clock and EAN-13 check digits; the world checks against 14 broken copies of the world (each must fail the right check); the shadow-mode gate (the synthetic record fails on decisions, nights and agreement, a control passes at exactly 95 %); key masking and redaction; storage keys under `rp.` (16 tests). Node.js only |
| engine | `node tests/engine.mjs` | The brief's golden cases G1 to G4 per 1,000 units, per cell hour and per year, N1 and N2, O1 and the business case within ±0.005, and every display string exactly; the night simulation's snapshots per scenario (unit-log hash and every order's completion, frozen in `tests/snapshots/des.json`; `--update-snapshots` rewrites them after a deliberate change), reproducibility, the calibration on 14 seeds, tonight on the calibrated seed equal to the plan, projections without future draws; the escalation rules E1 to E4, each firing where it should and nowhere else; the world model's one write-back; the levers; option costing on 20 replications with O1; the night on the screen: the night plan holds only what the warehouse system knows at 22:00, wake-ups follow the events of their moment, the manual queue counted from events, cut-off times that agree with their minutes to spare, the player emitting every event once and in order and waiting at each wake-up, a stopped night logging nothing from after the stop, the audit keeping exceptions and dropping ordinary units (26 tests). Node.js only |
| smoke | `node tests/smoke.mjs` | The idle workspace (disclosure, badge, self-hosted fonts, the Simulated cell tag, the board at 22:00 with twelve lanes, five stations and the Synthetic world model, the header tiles at the manual baseline, six scenarios and scenario 5's night, the rail, no external request, storage keys under `rp.`); the intro window; the mode choice with its note on this build, the night preview by Simulation and by Live with the key dialog against an API stand-in (format check, a rejected key not stored, an accepted key in session storage only, never in local storage, the page or the console, change and forget the key, only the free key check sent), Abort; Diagnostics (keyless probe, 14 world checks, privacy row); the drawer's five tabs and the audit export of a stopped night (version, mode `preview`, the chosen mode, the night's hash, a partial unit log instead of the ordinary units' events, no key); scenario 1 to night end at ×4, ×2 and ×1 (every lane's dispatch state, the orders-on-time tile, the KPI board's Tonight column and the night report equal to the simulation computed in Node, and the playback rate); the board by keyboard and mouse (18 buttons of at least 44 px in the Tab order, popovers named for their entity, Escape gives the focus back, a popover follows the night, nothing animates under reduced motion); the KPI board at the defaults and with p = 0.70 from the Assumptions tab (G1, G2, sources on every row, no payback claim, a refused value, the audit, Reset); scenario 2's one write-back in the panel, the popover, the log, the console and the audit, no tote over 15 kg; contrast in the running page at 1920×1080 and 1280×720 (every visible text in thirteen states meets its WCAG 2.2 duty; a control pair at 4.44:1 must be caught); the page's policy blocking any other host; `file://`; a missing data file (14 cases) |
| sims | `node tests/sims.mjs` | The six scenario nights computed in Chromium equal the snapshot frozen in Node: hash, every order's completion, the wake-ups (1 case; the scripted replays join in M3) |
| layout | `node tests/layout.mjs` | 1920×1080, 1600×900, 1536×864, 1366×768 and 1280×720, each idle, idle with the drawer open, the 22:17 correction, the 02:00 express order and that moment with the drawer open on the KPI board (the last three inside the night's pause for the agent's turn), on Playwright's clock, paused after boot so the night moves only when the suite moves it: no horizontal overflow, the header tiles in view and never covered, the header at most 14 % of the window's height, a one-row control bar, the board's caption, chip and tag clear of each other, every store lane whole and in view, the board fitting its panel, its Synthetic label and Simulated cell tag in view, targets of at least 40 px (44 px on the board); at 02:00 the store-order tile and the KPI board's Tonight row equal the night simulation computed in Node (30 cases) |

`node tests/run-all.mjs` runs everything in that order and prints a summary. Name suites to run only those (`node tests/run-all.mjs unit smoke`); name cases to run only those within a suite (`node tests/smoke.mjs modes diag`).

No test calls a real API or spends money: api.anthropic.com is answered by a stand-in inside the browser. The app loads nothing else from outside (no CDN, no tiles), and the suites block any other request.

## Setup for the browser suites

You need Node.js 20 or later and Playwright with Chromium. Install them once, outside this folder:

```
npm install -g playwright@1.56.0
npx playwright install chromium
```

The GitHub Actions workflow pins the same version, the one the suites were last run with.

Then run with Node's module path pointing at the global packages:

```
NODE_PATH="$(npm root -g)" node tests/run-all.mjs
```

On Windows PowerShell: `$env:NODE_PATH = (npm root -g); node tests/run-all.mjs`.

Options (environment variables):
- `PLAYWRIGHT_MODULE`: path to a Playwright installation, instead of `NODE_PATH`.
- `CHROME_PATH`: use this Chrome or Chromium binary instead of Playwright's.
- `RP_TEST_OUT`: folder for screenshots, downloads and result files (default: the system temp folder, `repack-pilot-tests/`).

The suites serve the app on `127.0.0.1`: smoke on port 8865, sims on 8866, layout on 8867 (Rebate Hunter's use 8765 to 8770, so both can run side by side).
