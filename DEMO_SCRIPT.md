# Repack Pilot: the five-minute demo

**For** a head of DC operations or a COO retail logistics. **Goal:** after five minutes they can repeat one sentence: *"The robot works from a model of every item; camera and scale keep it right, what it doesn't know goes to a person, and labour per 1,000 units falls from €89.50 to €32.49."*

## Before the call

1. Open the page in Chrome or Edge, full screen (F11), 100 % zoom, the light theme. Close other tabs and silence notifications.
2. Walk the five steps once. Ask for the customer's yearly volume and labour cost beforehand if you can.
3. Start at `?step=plan&guide=0` if you explain the showcase yourself; otherwise let the guide open and show its first chapter.

## The five minutes

| Time | Step | What to do and say |
|---|---|---|
| 0:00 | Guide | "One night shift in a grocery DC. A robot cell repacks mixed pallets into store orders, and what makes that work is its world model: what the robot knows about every item it lifts." Click **Start**. |
| 0:30 | 22:00 The plan | Point at the pallet. "Tonight: 3,000 units for 12 stores. The robot may take 2,100; people take the 900 it may not grip, such as eggs and wine." Click **Play**. |
| 1:15 | 22:17 It learns | "The label says 200 g, the jam alone. The robot lifts the glass too, so the scale weighs 400 g, and from now on the model expects that for every jar." |
| 2:00 | 23:10 It asks | "A barcode the model has never seen. The robot doesn't guess: a rule in code sends the 6 units to a person, and the agent asks us to confirm a new entry." Click **Confirm entry**. |
| 2:45 | 06:00 The result | "Every truck left on time. Labour came to 2.74 hours where the same units take 7.52 by hand: €98 instead of €269 tonight, 64 % less." |
| 3:30 | Your DC | Type their yearly volume. "This is your saving a year, gross, before cell costs. A cell pays while it costs less than this an hour." |
| 4:15 | Close | "The next step is a pilot cell in shadow mode: the agent proposes, your shift lead decides, and we measure how often they agree before it gets more autonomy." |

Say once that it's a scripted replay: *"The agent's words are a scripted replay of its run; the engine calculates every figure as the night plays."*

## Questions you will get

**Is this a real robot?** No. The cell, its camera and scale are simulated. Its rates are assumptions taken from published figures: 500 grasp attempts an hour, the low end of manufacturer data reported by Fraunhofer IML, and 91 % grasp success from a trial Amazon published.

**What is a world model?** What the robot knows about every item: weight, size, fragility, how to grip it. It starts from your item master; camera and scale correct it.

**What exactly did I confirm?** That the barcode belongs to a real item, so the model and the item master know it from now on. The entry has no weight or grip yet, so the robot leaves it to people until it does.

**Our pickers do more than 400 an hour.** Type your rate into Your DC; every figure follows it.

**What does a cell cost?** That depends on the site, so there is no payback claim. The break-even says what a cell may cost an operating hour and still pay.

**Can the AI make up the numbers?** No. A deterministic engine computes every hour and euro; the agent only words them.

**What about regulation?** A real cell needs conformity assessment and CE marking under the EU Machinery Regulation, which applies from 20 January 2027, and a person stays in charge of every decision the agent proposes.

## If something goes wrong

Click the restart arrow beside the steps, or press Home, and carry on from 22:00. Every step is also a link, so you can open `?step=result` in a new tab.
