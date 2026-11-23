# Repack Pilot

A five-minute customer showcase of Physical AI in a grocery distribution centre. You watch one night shift: a robot cell that works from a model of every item repacks 3,000 units for 12 stores, learns that a jam jar weighs 400 g, hands a barcode it has never seen to a person, and cuts labour per 1,000 units from €89.50 by hand to €32.49 with the cell.

**Live:** https://victorpflueger.github.io/physicalAI-repacking/

It is a static page: no backend, no build step, no request to any other site. The robot cell, the retailer and its stores are simulated and fictional; the arithmetic and its sourced inputs are real.

## The three figures

The top right of the page holds the showcase's key figures. The guide's *How it works* chapter explains them, a row each, and the talk track points at them.

| Figure | What it shows | Tonight |
|---|---|---|
| Labour per 1,000 units | What the cell saves: the engine's labour cost by hand and with the cell | €89.50 → €32.49, −64 % |
| Detection → decision | How fast the cell acts when a reading disagrees with its model: from the scale's or the camera's reading to the model taking the weight, or a rule sending the units to a person | < 1 s, twice |
| Store orders on time | The service the cell keeps | 12 of 12 |

## The talk track

The page opens with Vici's guide, *How the showcase works*, in every new tab. Its last chapter is the talk track, and the same five steps are the buttons under the header. Each step is one minute when you present.

| Step | What the room sees | What you say |
|---|---|---|
| 22:00 The plan | The three figures; 24 items in the world model, 2,100 units for the robot, 900 for people | "What the cell saves, how fast it reacts, and if every truck leaves on time." |
| 22:17 It learns | The scale weighs the apricot jam jar at 400 g, the master data say 200 g | "The model learns it in under a second." |
| 23:10 It asks | A barcode the model doesn't know: its 6 units go to a person. The bar under the story says *Your turn*: click **Confirm entry** | "The robot never picks what it doesn't know; the units go to a person at once." |
| 06:00 The result | 12 of 12 store orders on time, 2.74 h of labour against 7.52 h by hand | "With 64 % less labour." |
| Your DC | The customer's yearly volume, labour cost and picking rate, priced by the engine | "The next step is a pilot cell in shadow mode." |

`DEMO_SCRIPT.md` has the timings, the pre-flight and the questions you will get.

**Moving through it.** Closing the guide starts **Play**, which gives each step 7 to 14 seconds while the night plays on; the bar under the story says when it moves on. It waits at 23:10 for your answer, which the decision log keeps, and ends on Replay at Your DC. Space pauses while you talk. A click on a step, 1 to 5, the arrow keys or a clicker move between steps and pause; Home starts again at 22:00.

**Links.** The address holds the step: `?step=plan`, `learns`, `asks`, `result` or `your-dc`. Add `&guide=0` to keep the guide closed, or open `?guide=present` to start at the talk track.

## What is real

| | |
|---|---|
| Simulated | The robot cell, its camera and scale, the warehouse system, the retailer Ruhrkorb and its 12 stores in real Ruhr towns |
| Scripted | The agent's words: a scripted replay of the agent's run, the same night 0.5.0 showed |
| Sourced | 400 picks an hour by hand (Fraunhofer IML) and €35.80 an hour of labour (Eurostat, Germany, 2025) |
| Assumed | The robot may take 70 % of units, succeeds on 91 % of grasps and tries 500 an hour |

The yearly figure is gross, before cell costs. There is no payback claim, because a cell's cost differs by site; the break-even says what a cell may cost an hour and still pay. `DATA_SOURCES.md` lists every source.

## How it works

```
data/world.js      the synthetic world: stores, truck times, 24 items, tonight's 3,000 units
js/nightsim.js     simulates the night unit by unit, seeded: camera, world model, grasp, scale, people
js/engine.js       prices the work: hours and euros per 1,000 units, a year, the break-even
js/story.js        the five steps and every sentence the page says, with the figures filled in
js/timeline.js     the night at any moment, for jumping and for playing between steps
js/view.js         draws the stations, the pallet, the story, the bar under it, the log and Your DC
js/main.js         starts it, plays it at reading pace, follows clicks, keys and the address
```

The night is the same in every browser to the millisecond. `tests/figures.mjs` recomputes the figures from the formulas and the unit log, checks the night's fingerprint against 0.5.0's main run, and checks every figure written in the page and the guide.

The look is Vici, Victor's design system, copied into `vici/` (`vici/README.md`).

## Run it

Browsers don't run the page's modules from a file. Serve the folder instead:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. On Windows: `py -m http.server 8000`.

## Tests

```
NODE_PATH="$(npm root -g)" node tests/run-all.mjs
```

Eight suites: the figures, the files, how lean the app stays, Vici's own guide, byline and writing checks, the showcase in Chromium (steps, keys, links, playback, the decision, Your DC, four window sizes, both themes), the guide's behaviour, contrast, and Vici's hexagon rule. GitHub Actions runs them on every push. `tests/README.md` has the setup.

## History

0.7.0 (23 November 2026) hands the decision to the visitor: a *Your turn* bar at 23:10, Play at reading pace that ends on Replay, SIMULATION with a sentence and the byline under the header, and the key figures' rows in *How it works*.

0.6.0 (20 November 2026) turned the prototype into this one-screen showcase. Release 0.5.0, the lab version with six scenarios, a live agent on Claude, the full cell board, costed options, drafts, the autonomy dial and the audit log, is in the git history at commit `c319649`, with its build plan and technical notes.

## Author

Built by Victor Pflüger · [LinkedIn](https://www.linkedin.com/in/victorpflueger) · [Website](https://victorpflueger.github.io/VIP/index.html)
