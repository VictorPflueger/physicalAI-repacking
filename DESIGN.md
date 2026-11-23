# Repack Pilot: design

How the showcase looks and why. The look is **Vici**, Victor Pflüger's design system, copied into `vici/` from its main branch (`vici/README.md`). Vici decides colours, type, components, icons and the hexagon shapes; this file says what they mean here.

## The brief

- **One screen, one story.** A customer sees what the cell does, how its world model works and what it is worth in five minutes, on a 1080p projector in a lit room or a shared laptop screen.
- **It plays by itself, and a presenter can drive.** Closing the guide starts Play. Each step stays as long as its words take to read, 7 to 14 seconds; in its last seconds the night plays on to the next step, and the bar under the story says when the page moves on. Play waits only at 23:10, where the bar says *Your turn* and holds Confirm entry, and it ends on Replay at Your DC. A click, a key or a link shows any step at once and pauses Play.
- **Three key figures, top right,** each marked `data-vc-kpi` and explained in a row of its own in the guide's *How it works*: labour per 1,000 units (the saving, by hand and with the cell), detection to decision (how fast the cell acts when a reading disagrees with its model) and store orders on time (the service). Labour per 1,000 units comes first; the units count sits with the pallet, because it shows progress, not a benefit.
- **Honest.** The cell is simulated, the retailer fictional, the agent's words a scripted replay; the figures are the engine's. SIMULATION in the header, the sentence under it and the guide say so.

## Layout

| Part | What it holds |
|---|---|
| Header | The page icon and name, SIMULATION, *How it works*, the theme switch, and the three key figures: labour per 1,000 units, detection to decision, store orders on time |
| Under the header | One sentence on what the page shows and that the retailer is fictional, with the byline beside it |
| Talk track | Play, Pause and Replay on one secondary button, then the five steps on Vici's stepper: the rail to the next step fills as Play reads the current one, and 23:10's marker stays merlot until you answer |
| Stage, left | The robot's world model: one item's way through five named stations (camera, world model, robot, scale, person), then tonight's pallet, one tile per item, with the count of units repacked |
| Story, right | The step's heading and two sentences, the agent's words, and the step's one thing to read: your answer with the decision log, the labour comparison, or Your DC. Right under it, the bar that says in words what happens next or what to do, with its one action |

The pallet has six columns, so the 18 items for the robot fill three rows and the 6 for people the fourth; the unknown item's place is kept from the start, so nothing moves at 23:10.

## Colour

| Colour | Means |
|---|---|
| Merlot | The person: the bar when it is your turn, Confirm entry, the person's station when a person must act, and your answer |
| Fjord | What the world model learns: the jar's weight, and the barcode once you confirm it |
| Honey | What the model doesn't know: the unknown barcode, until you confirm it |
| Lilac | The agent's words |
| Success | Done: every truck gone on time, an item fully picked |
| Ink | Everything else |

A colour never carries meaning alone: every state has its words, and the legend names the marks.

## Rules followed

- **The guide** is Vici's How it works standard: titled *How the showcase works*, chapters *What it does*, *How it works* (a row for each key figure: what it measures and its value), *What is real* and *How to present*, opening in every new tab. Every figure in it is computed, and `tests/figures.mjs` checks the ones written into the page. Closing the guide that opened by itself starts Play; Start puts focus on it.
- **The byline** is Vici's: "Built by", the portrait, the name and LinkedIn's mark as one link, the globe for the website, both `rel="author"`, in the strip under the header beside the sentence. The links open a new tab, so a running demo is never lost.
- **Play and the bar** follow Rebate Hunter 8.0.0 and the Price Variance Agent. Play is secondary, so the one primary action on screen is the bar's. At 23:10 the bar sits right under the agent's question and says what confirming changes; Confirm entry carries `vc-attention`, Reject is the outlined second choice, and the answer goes into the decision log.
- **Hexagons, not circles.** Markers, cells and the spinner are Vici's hexagons; the app draws nothing round (`tests/hexagon.mjs`).
- **Writing.** British English, sentence case, no eyebrows, no em dashes, a no-break space between a number and its unit, Vici's list of stock words left out (`tests/vici.mjs`).
- **Sizes.** Full at 1920 × 1080; from 1366 × 768 down to 1280 × 720 the tiles drop their icons and pack sizes, the legend's icons going with them, so everything stays in view. The stations keep their names and one height, so the pallet never jumps; below 960 px the page stacks. `tests/showcase.mjs` checks four sizes in both themes.
- **Motion.** One moving thing: the night playing between two steps, the stations changing at most every 0.65 s so a name can be read. The bar under the story slides in when it asks something new, and `vc-attention` rings Confirm entry three times. Under reduced motion only the ring's resting frame stays.

## Deviations from Vici

- Vici spaces the items of a prose list (`li + li`). The stations, the tiles and the legend are lists laid out as grids, so they set that margin back to zero; otherwise every item but the first sits a few pixels lower.
