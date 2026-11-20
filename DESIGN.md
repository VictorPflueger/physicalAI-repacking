# Repack Pilot: design

How the showcase looks and why. The look is **Vici**, Victor Pflüger's design system, copied into `vici/` from its main branch on the way to 2.0 (`vici/README.md`). Vici decides colours, type, components, icons and the hexagon shapes; this file says what they mean here.

## The brief

- **One screen, one story.** A customer sees what the cell does, how its world model works and what it is worth in five minutes, on a 1080p projector in a lit room or a shared laptop screen.
- **The presenter drives.** Five steps, each one click, one key or one link, and the night only moves when the presenter plays it.
- **One number owns the header:** labour per 1,000 units, by hand and with the cell.
- **Honest.** The cell is simulated, the retailer fictional, the agent's words a scripted replay; the figures are the engine's. The header, the guide and the footer say so.

## Layout

| Part | What it holds |
|---|---|
| Header | The page icon and name, the Simulated tag, *How it works*, the theme switch, and three figures: labour per 1,000 units, units repacked, store orders ready |
| Talk track | Play, the five steps on Vici's stepper (the line between two steps fills as the night plays), back to 22:00 |
| Stage, left | The robot's world model: one item's way through five stations (camera, world model, robot, scale, person), then tonight's pallet, one tile per item |
| Story, right | The step's heading and two sentences, the agent's words, and the step's one thing to do or read: the decision, the labour comparison, or Your DC |
| Footer | What is simulated, and the byline |

The pallet has six columns, so the 18 items for the robot fill three rows and the 6 for people the fourth; the unknown item's place is kept from the start, so nothing moves at 23:10.

## Colour

| Colour | Means |
|---|---|
| Merlot | The person: Play, Confirm entry, the person's station when a person must act, and their answer |
| Fjord | What the world model learns: the jar's weight, and the barcode once you confirm it |
| Honey | What the model doesn't know: the unknown barcode, until you confirm it |
| Lilac | The agent's words |
| Success | Done: every truck gone on time, an item fully picked |
| Ink | Everything else |

A colour never carries meaning alone: every state has its words, and the legend names the marks.

## Rules followed

- **The guide** is Vici's How it works standard: titled *How the showcase works*, chapters *What it does*, *How it works*, *What is real*, *What it is worth* and *How to present*, opening once per tab. Every figure in it is computed, and `tests/figures.mjs` checks the ones written into the page. Start, on the guide that opened by itself, puts focus on Play, the presenter's first click.
- **The byline** is Vici's: "Built by", the portrait, the name and LinkedIn's mark as one link, the globe for the website, both `rel="author"`. The links open a new tab, so a running demo is never lost.
- **Hexagons, not circles.** Markers, cells and the spinner are Vici's hexagons; the app draws nothing round (`tests/hexagon.mjs`).
- **Writing.** British English, sentence case, no eyebrows, no em dashes, a no-break space between a number and its unit, Vici's list of stock words left out (`tests/vici.mjs`).
- **Sizes.** Full at 1920 × 1080; from 1366 × 768 down to 1280 × 720 the stations drop their names and the tiles their icons and pack sizes, the legend's icons going with them, so everything stays in view; below 960 px the page stacks. `tests/showcase.mjs` checks four sizes in both themes.
- **Motion.** One moving thing: the night playing between two steps, the stations changing at most every 0.65 s so a name can be read. Nothing animates under reduced motion.

## Deviations from Vici

- The pause icon is drawn here, in Vici's grid and stroke, until Vici has one.
- Each presenter sentence in the guide is wrapped in one element (`vc-guide__say`), because the sentence carries computed figures in their own elements and Vici's grid would otherwise split it.
- The guide's chapter headings show no focus ring. Vici focuses the heading when a chapter turns, and after a mouse click on Next, Chrome would draw the ring the dialog opened with around the heading.
- Vici spaces the items of a prose list (`li + li`). The stations, the tiles and the legend are lists laid out as grids, so they set that margin back to zero; otherwise every item but the first sits a few pixels lower.
