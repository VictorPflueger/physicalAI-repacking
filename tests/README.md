# Tests (optional, for developers)

Repack Pilot itself needs no Node.js, npm or build step. These scripts are the checks behind the acceptance checklist in `TECH_NOTES.md` §12. Run them after changing code or data. GitHub Actions runs them on every push and pull request (`.github/workflows/tests.yml`).

The suites grow with the milestones: `engine` arrives with the engine and the night simulation (M2), `sims` and `live` with the agent and its scripted replays (M3), `accept`, `layout` and `design` with the scenarios and the hardening (M4 and M5), as in Rebate Hunter.

## What runs

| Suite | Command | Checks |
|---|---|---|
| tokens | `node tools/palette.mjs --check` | The colour system: WCAG 2.2 contrast for every text and state pairing, burgundy kept apart from danger, the board states, cost bars and brand kept apart under simulated protanopia, deuteranopia and tritanopia, and `css/tokens.css` and `design/tokens.json` up to date with the generator. Node.js only |
| world | `node tools/check_world.mjs` | The synthetic world (12 stores in plan order, 24 SKUs, the allocation exact at 3,000 and 4,200 units, s = 0.70 and p = 0.91, the item master, the glass jar's two weights, restricted-circulation barcodes, waves, cell and tote), the six scenarios, the shadow record against the example gate (with a passing control), the Open Food Facts file's attribution, and that `data/world.js` and `data/shadow_record.js` are exactly what `tools/build_world.mjs` writes (12 checks). Node.js only |
| unit | `node tests/unit.mjs` | Streaming client: SSE parsing, thinking signatures, retries, aborts, truncated streams; cost maths per model at 0.892 EUR per USD; half-up display rounding (31.325 → 31.33, where `toFixed` gives 31.32); the night-shift clock and EAN-13 check digits; the world checks against 14 broken copies of the world (each must fail the right check); the shadow-mode gate (the synthetic record fails on decisions, nights and agreement, a control passes at exactly 95 %); key masking and redaction; storage keys under `rp.` (16 tests). Node.js only |
| smoke | `node tests/smoke.mjs` | The idle workspace (disclosure, badge, self-hosted fonts, the Simulated cell tag, the Synthetic world facts, six scenarios, the rail, no external request, storage keys under `rp.`); the intro window (first visit, five steps, three value points, what is real, at most 260 words, reopen, start); the mode choice, Simulation and Live with the key dialog against an API stand-in (format check, a rejected key not stored, an accepted key in session storage only, never in local storage, the page or the console, change and forget the key, only the free key check sent); Diagnostics (keyless probe, world and privacy rows); the drawer's five tabs and the audit export (version, mode, the notice, no key); five viewports from 1920×1080 to 1280×720 with the drawer closed and open (no horizontal overflow, one-row control bar, header badges and the cell panel's caption, tag and overview clear of each other and inside the panel, the overview whole with its Synthetic label in view, controls of at least 40 px); contrast in the running page at 1920×1080 and 1280×720 (every visible text in eleven states meets its WCAG 2.2 duty against its real background; inactive controls exempt; a control pair at 4.44:1 must be caught); the page's policy blocking any other host; `file://`; a missing data file (20 cases) |

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

The suites serve the app on `127.0.0.1` port 8865 (Rebate Hunter's use 8765 to 8770, so both can run side by side).
