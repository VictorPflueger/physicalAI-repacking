# Tests (for developers)

The showcase needs no Node.js, npm or build step. These suites check it; GitHub Actions runs all of them on every push and pull request (`.github/workflows/tests.yml`).

| Suite | Command | Checks |
|---|---|---|
| figures | `node tests/figures.mjs` | Every value figure recomputed from the engine's formulas; the night's fingerprint equal to 0.5.0's main run; tonight's units, hours and euros recomputed from the unit log; detection to decision measured from the night's events; the five steps at their moments with those figures; the talk track and the docs naming the three key figures; every figure written into `index.html` and the guide equal to the computed one |
| files | `node tests/files.mjs` | Every file the page loads exists; every module import resolves and every module is used; the suites and the workflow name real files; `data/world.js` is what `tools/build_world.mjs` writes; `vici/` holds exactly the files its README lists, byte for byte as in ViciDesign at the pinned commit, which is on its main branch; no stand-in for what Vici ships |
| lean | `node tests/lean.mjs` | At most 12 modules, 2,200 lines of JavaScript and 1,100 of CSS; no network, key or model code; a policy that connects nowhere; README and demo script within their word counts |
| vici | `node tests/vici.mjs` | Vici's own `guideProblems`, `bylineProblems` and `writingProblems` on the page (the guide naming every key figure), on every sentence the steps write, and on the README, the demo script and the design notes |
| showcase | `node tests/showcase.mjs` | In Chromium: boot without errors or outside requests; the five steps by click, key and address; Play, Pause and the stop at each step; the three key figures top right with the night's values; the decision; Your DC against the engine; the layout at 1920 × 1080, 1366 × 768 and 1280 × 720 in both themes, and 375 px |
| guide | `node tests/guide-behaviour.mjs` | The guide's behaviour as Vici's standard and its own render check describe it, over http; every chapter fits 1280 × 720 and 1366 × 768 without scrolling |
| contrast | `node tests/contrast.mjs` | WCAG 2.2 AA for every visible text in ten states, light and dark, at two sizes |
| hexagon | `node tests/hexagon.mjs` | Vici's hexagon rule in the app's files and the rendered page, both themes |

`node tests/run-all.mjs` runs them in that order and ends with `ALL SUITES PASSED`. Name suites to run only those: `node tests/run-all.mjs figures vici`.

## Setup

The browser suites need Playwright with Chromium:

```
npm install -g playwright@1.56.0
npx playwright install chromium
NODE_PATH="$(npm root -g)" node tests/run-all.mjs
```

On Windows PowerShell: `$env:NODE_PATH = (npm root -g); node tests/run-all.mjs`.

The `files` and `vici` suites use a checkout of ViciDesign next to this repository (`../ViciDesign`, or the folder in `VICI_DIR`). Without one they say so and pass; with `--require-vici`, as on GitHub Actions, they fail instead.

Options: `CHROME_PATH` uses another Chrome or Chromium; `RP_TEST_OUT` sets the folder for screenshots (default: the system's temp folder, `repack-pilot-tests/`). The suites serve the page on 127.0.0.1, ports 8865 to 8867 and one between 8790 and 9089, and block every other host.
