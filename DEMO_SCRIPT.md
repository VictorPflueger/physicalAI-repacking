# Repack Pilot: the five-minute demo

**For** a head of DC operations or a COO retail logistics. **Goal:** after five minutes they can repeat one sentence: *"The robot works from a model of every item; camera and scale keep it right, what it doesn't know goes to a person, and labour per 1,000 units falls from €89.50 to €32.49."*

## The three figures at the top

| Figure | What it shows | Tonight |
|---|---|---|
| Labour per 1,000 units | What the cell saves: labour by hand against labour with the cell | €89.50 → €32.49, −64 % |
| Detection → decision | How fast the cell acts when a reading disagrees with its model | < 1 s, twice |
| Store orders on time | The service it keeps | 12 of 12 |

## Before the call

1. Chrome or Edge, full screen (F11), 100 % zoom, light theme; other tabs closed, notifications off.
2. Walk the five steps once; ask for their yearly volume and labour cost beforehand.
3. Let the guide open, or start at `?step=plan&guide=0` if you explain the showcase yourself.

## The five minutes

| Time | Step | What to do and say |
|---|---|---|
| 0:00 | Guide | "One night shift in a grocery DC: a robot cell repacks mixed pallets into store orders, working from a model of every item it lifts." Click **Start**; Play begins. |
| 0:30 | 22:00 The plan | Point at the three figures: "What the cell saves, how fast it reacts, and if every truck leaves on time." Then the pallet: "3,000 units for 12 stores. The robot may take 2,100; people take the 900 it may not grip." Space pauses while you talk. |
| 1:15 | 22:17 It learns | "The label says 200 g, the jam alone. The scale weighs 400 g, glass included, and the model learns it in under a second: that's detection to decision." |
| 2:00 | 23:10 It asks | "A barcode the model has never seen. The robot doesn't guess: a rule sends the 6 units to a person at once, and the agent asks us to confirm a new entry." At *Your turn*, click **Confirm entry**. |
| 2:45 | 06:00 The result | Point at the figures again: "12 of 12 store orders on time. Labour came to 2.74 hours where the same units take 7.52 by hand: €98 instead of €269 tonight, 64 % less." |
| 3:30 | Your DC | Type their yearly volume. "Your saving a year, gross, before cell costs. A cell pays while it costs less than this an hour." |
| 4:15 | Close | "The next step is a pilot cell in shadow mode: the agent proposes, your shift lead decides, and we measure how often they agree before it gets more autonomy." |

Say once: *"The agent's words are a scripted replay; the engine calculates every figure."*

## Questions you will get

**Is this a real robot?** No, the cell, camera and scale are simulated. Its rates come from published figures: 500 grasp attempts an hour (the low end of manufacturer data, Fraunhofer IML) and 91 % grasp success (an Amazon trial).

**What is a world model?** What the robot knows about every item: weight, size, fragility, how to grip it. It starts from your item master; camera and scale correct it.

**Under a second, really?** For what the figure counts, yes: the model taking a weight and a rule routing an item are code at the cell. The agent's proposals wait for a person and don't count.

**What exactly did I confirm?** That the barcode is a real item, so the model and the item master know it from now on; without weight or grip, the robot still leaves it to people.

**Our pickers do more than 400 an hour.** Type your rate into Your DC; every figure follows it.

**What does a cell cost?** It depends on the site, so there is no payback claim; the break-even says what a cell may cost an operating hour and still pay.

**Can the AI make up the numbers?** No. A deterministic engine computes every hour and euro; the agent only words them.

**What about regulation?** A real cell needs CE marking under the EU Machinery Regulation (from 20 January 2027), and a person decides on every proposal of the agent.

## If something goes wrong

Press Home and carry on from 22:00. Every step is also a link, such as `?step=result`.
