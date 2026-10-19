# Repack Pilot — five-minute demo script

**Audience:** a customer: a head of DC operations or a COO retail logistics, in a five-minute call; partners and principals rehearse with it. **Goal:** in five minutes the customer understands what Repack Pilot does, how its world model works and what it is worth, and can repeat one sentence: *"The robot works from a world model of every item; camera and scale keep it right, what it does not know goes to a person, and labour per 1,000 units falls from €89.50 to €32.49."*

**Recommended run:** Scenario 3, **Unknown item on the pallet**, in **Simulation** at **×1**, in the **Customer view** (TECH_NOTES D62–D69). It is the world model's night: a glass jar the model learns from and an item it does not know, with every store on its truck. The night is a scripted replay of the agent through its own tools, labelled SIMULATION; every hour and euro is computed by the engine at playback. It runs the same every time and needs no key and no network. Say once that it is a replay: *"This is a recorded run of the agent; the live version runs the same night on Claude."*

**Longer sessions:** the **Full view** with every store lane and station, scenario 1's express order with its costed options, **Live** on Sonnet 5.5 and the autonomy dial (see "If you have more time"). A live night spends minutes on model calls alone, so it does not fit five minutes.

---

## Pre-flight (15 minutes before, on the presenting laptop)

1. Open the site in Chrome or Edge and hard-reload (**Ctrl + Shift + R**). On a browser's first visit the **How Repack Pilot works** window opens by itself; close it for now. Close other tabs and silence notifications.
2. Click **Diagnostics → Run all tests**. Every row passes except Open Food Facts, which is skipped by design; the footer shows **Repack Pilot 0.4.1**.
3. Rehearse once at **×4**: **Start agent → Run simulation**, click **Confirm entry** when the world model asks, type a volume into **Your DC**, then click **Reference site** and **Reset**.
4. Set the stage: **Customer** in the view switch (in the header, beside the mode badge), Scenario **Unknown item**, Night **×1**. Share a window of 1920 × 1080 (full screen, **F11**) at 100 % zoom. The status pill reads **Idle**.
5. Have the customer's yearly volume and labour cost ready if you know them; otherwise ask for them at 2:45.

## The five minutes at a glance

Times after the start of the call. The run's times were measured on 19 Oct 2026 in Chromium at 1920 × 1080, with the entry confirmed 20 s after the world model asks for it (TECH_NOTES §11); "run" gives the seconds after the click on **Run simulation**.

| Time | Segment | On screen |
|---|---|---|
| 0:00–0:45 | What it does, how it works, what it is worth | The **How it works** window: the sentence, the world model in four steps, three figures from the engine |
| 0:45–0:50 | Start | Start agent → **Run simulation** |
| 0:50–1:10 | The model at work (run 0–19 s) | Tonight's pallet in the model; each item's way from the camera through the model to the robot and the scale |
| 1:10–1:30 | The model learns (run 19 s) | The jar that weighs 400 g, not 200 g, written back for every jar |
| 1:30–2:05 | The model asks (run 40 s; Confirm entry at 55 s, you confirm at 75 s) | A barcode the model does not know; its 6 units go to a person; you confirm the entry |
| 2:05–2:25 | The decision (run 75–95 s) | *Entry confirmed*: the barcode is in the model, still without weight or grip |
| 2:25–2:45 | What tonight was worth (run 95–102 s) | Night over: labour with the cell against the same work by hand; the summary |
| 2:45–4:15 | What it is worth for you | **Your DC** in What it is worth: type the customer's volume |
| 4:15–5:00 | Close | The next step: a pilot cell in shadow mode |

---

## 1. What it does, how it works, what it is worth (0:00–0:45)

Click **How it works** in the header. Read the sentence at the top, then point at the three blocks.

About 100 words, 40 seconds: say it, do not read the window out.

> "This is the night shift in a grocery distribution centre. A robot cell repacks mixed pallets into store orders, and what makes that work is its world model: what the robot knows about every item it lifts."

Point at the four steps: *Knows, Checks, Learns, Asks*.

> "It knows each item's weight, size and grip. Camera and scale check every item against it, and the robot rehearses each grasp first. A reading that clearly differs is learned for every unit. What it does not know goes to a person."

Point at **Why it pays off**:

> "In labour, that is €32.49 per 1,000 units instead of €89.50 by hand, minus 64 %. Your own site's figure comes at the end."

Point at **What is real**: the cell, the warehouse system and the retailer are simulated and labelled so; real are the engine's arithmetic and its sourced inputs, such as the labour cost. The cell's rates are labelled assumptions.

## 2. Start (0:45–0:50)

Click **Start agent** in the window, then **Run simulation**.

> "A recorded run of the agent; the engine calculates every figure as it plays."

## 3. The night (0:50–2:45)

Talk over the screen; do not read it out. The left side is the robot's world model: one item's way through the cell at the top, then the moment, tonight's pallet item by item, and what the model learned. The right side shows **What it is worth**, and below it the agent's own words.

| Moment | You say |
|---|---|
| **22:00, the plan.** *Tonight's pallet*: the model holds all 24 items of tonight's 3,000 units; the robot may take 2,100. The items start to flow: camera → world model → robot → scale. The labour tile turns from €89.50 to **€32.49** | "This is the robot's world model: every item on tonight's pallet. Each item passes the camera, the model says what to expect, the robot rehearses its grasp against the model, picks it, and the scale checks the weight. Eggs, bananas, wine, basil: the model knows the robot may not grip those, so they are for people from the start." |
| **22:17, the jar.** *The model learned*: the apricot jam weighs 400 g on the scale, not 200 g as in the master data. The jar's tile turns blue, *corrected 22:17* | "Here's the robot learning. The label says 200 g — that's the jam; the robot lifts the glass too. The model now holds 400 g for every jar on the pallet, and the next jar is rehearsed with the new weight before the robot picks it. One reading corrects the whole item, and every later jar weighs what the model now expects." |
| **23:10, the unknown item.** *Not in the model*: barcode 4037848020859; the robot never picks an item it does not know; its 6 units go to a person. A provisional entry waits: **Confirm entry** | "And this is what the model does not know: a barcode it has never seen. The robot does not guess. A rule in code sends the units to a person, and the agent asks us to confirm a provisional entry." |

Click **Confirm entry**.

| Moment | You say |
|---|---|
| **23:10, the decision** (call time 2:05). *Entry confirmed*: the barcode is in the model from now on, still without weight or grip; the tile says *confirmed by you* | "Now the barcode is in the model, as a provisional entry. It has no weight or grip yet, so tonight's six units stay with the person: the robot only picks what it can rehearse." |
| **06:00, night over.** *Night over*: the model learned 2 things tonight. What it is worth, Tonight: 2.74 h · €98.00 of labour with the cell (1,089 + 6 set aside); by hand 7.52 h · €269.04; per 1,000 repacked €32.67; 12 of 12 store orders on their trucks | "Every truck on time. Labour came to 2.74 hours where the same work takes 7.52 by hand: €98 instead of €269 tonight. The model learned two things along the way." |
| **The management summary**: its card sits in the agent's column, and the console's last line, **Run complete**, carries **Open management summary** too | "And a summary for the morning: what happened, what we decided, what it is worth." |

If a customer asks why tonight is €32.67 per 1,000 units and the plan €32.49: the six units the model did not know went to a person. Labour counts every unit a person handled, those six included, and the figure per 1,000 divides it by the 3,000 units repacked; the comparison by hand counts the same 3,006 units.

## 4. What it is worth for you (2:45–4:15)

Point at **Your DC** in What it is worth.

> "This is the business case for a reference site: six million units a year, €342,069 a year before cell costs, with 4.2 cells on the night shift. Each cell pays while its all-in cost stays below €40.72 an hour. What's your yearly volume?"

Type it into **Units repacked a year** and press **Enter** (for example 10,000,000: €570,115 a year with 7 cells). If they know their labour cost per hour, type it into **Labour cost** too.

> "There's no payback figure here on purpose: robot cost, maintenance and integration differ by site. The break-even tells you what a cell may cost and still pay."

If they know their picking rate by hand, change **Manual picking rate** in the **Assumptions** tab: every figure follows.

On a smaller screen, What it is worth shows the year with a **Your DC** button: it opens the KPI board with the same inputs, and with **Plan and tonight**, each figure with its source (IML, Eurostat) or the label Assumption. While the KPI board is open, the world model keeps the item's way and the moment, and What it is worth makes room for the board; **Hide** brings both back.

## 5. Close (4:15–5:00)

> "So: the robot works from a world model of every item; camera and scale keep it right, what it does not know goes to a person, and labour per 1,000 units falls from €89.50 to €32.49. The sensible next step is a pilot cell in shadow mode: the agent proposes, your shift lead decides, and we measure the agreement before it gets any more autonomy."

Afterwards: **Reference site** in What it is worth (or Reset) puts the inputs back.

---

## If you have more time

- **The Full view** (**Full** in the view switch, in the header beside the mode badge): the cell board with every store lane against its truck time, the stations and the world-model card, the console beside it, and the autonomy dial: **Bounded** is locked until the shadow-mode record shows 200 decisions over 10 nights with 95 % agreement (click it to show why).
- **An express order** (scenario 1): the flagship orders 400 more units at 02:00 and two stores' trucks come under risk; the agent prices three options against doing nothing over 20 simulated nights, recommends calling in a picker and says why; you approve it and its drafts.
- **Live** (5–10 minutes): **Start agent → Continue with my API key**. The same night, reasoned by Claude on your key; the console shows the model's words, and the cost meter the spend (a few tens of cents). The agent decides its own words; the guardrails stay the same.
- **Gripper wear** (scenario 4): the robot's success falls to 70 %; a rule calls a person, fragile items go to the manual station, and a 30-minute maintenance stop turns out cheaper than running on.
- **Peak week** (scenario 6): 4,200 units with the usual staff; a called-in picker for two stores keeps every truck on time.
- **Holiday closing** (scenario 5) and **the glass jar alone** (scenario 2): nights the plan absorbs without a decision.
- **Details** in the console: every tool call the agent made, with its result.

## Contingencies

**The replay stops or shows an error.** Read the console's last line in one sentence, click **Reset**, then **Start agent → Run simulation** again at **×2**.

**A slow laptop.** Use **×2**: the run then takes about half as long; talk over the moments as above.

**The window is smaller than 1920 × 1080.** The layout works down to 1280 × 720: the world model tightens (tiles without their unit lines and pack sizes, the badge's one word beside the bar), What it is worth shows the year with a **Your DC** button that opens the KPI board, and the agent's column drops its progress rail.

## Questions you will get

| Question | Answer |
|---|---|
| "What is a world model?" | "What the robot knows about every item: weight, size, fragility, how to grip it, and the robot's own state. It starts from your item master, and the camera and the scale correct it; the robot rehearses each grasp against it. It does not think for itself: the agent plans with it, and people decide." |
| "Is this a real robot?" | "No: the cell, its camera, scale and gripper are simulated, and labelled so. Its rates are labelled assumptions, set from published figures: 500 grasp attempts an hour, the low end of manufacturer data under optimal conditions, as reported by Fraunhofer IML, and 91 % grasp success, from a trial Amazon published. The next step is a real cell in shadow mode." |
| "What exactly did I confirm?" | "That the barcode belongs to a real item on this pallet, so the world model and the item master know it from now on. The entry is provisional: the lookup found no product, so its weight and grip are still missing, and the robot leaves it to people until they are known. In a pilot, your item master or the first weighing would complete it." |
| "What if one reading is wrong?" | "The model writes a reading back only when it is more than 25 % off, and every later unit checks it: tonight every later jar weighed 400 g, as the model then expected." |
| "Our pickers do more than 400 an hour." | "Then change the manual picking rate in the Assumptions tab. It is a proxy from research Fraunhofer IML cites, and every figure follows your value." |
| "Which robot vendor?" | "None is named, on purpose. The case depends on the rates, not the brand; you can change them in the Assumptions tab." |
| "What does a cell cost?" | "That's site-specific, so there's no payback claim. The break-even says a cell pays while its all-in cost stays below €40.72 an operating hour at these rates." |
| "Can the AI make up the numbers?" | "No. A deterministic engine computes every hour and euro; the AI only words them, and code refuses any amount the engine did not produce." |
| "What if the AI is wrong?" | "It proposes; your shift lead decides. Fragile items, unknown items and a failing gripper go to a person by rules in code, and nothing is sent without approval. More autonomy only after shadow-mode evidence." |
| "What is 0.2 of a cell?" | "The cell time the volume needs: 8,400 cell hours a year, which is 4.2 cells on an eight-hour night shift. In practice five cells, or four that run a little longer each night." |
| "Does it work with our warehouse system?" | "The world model starts from your item master, and the agent talks to the warehouse through a handful of tools: orders, totes, the cell's status. Connecting those to your systems is the integration step of a pilot." |
| "What about regulation?" | "It discloses that you are dealing with an AI system, keeps a person in charge of every outbound action and logs every step for export. A real cell also needs conformity assessment and CE marking under the EU Machinery Regulation from 20 January 2027." |

## After the demo

- Click **Reference site** in What it is worth or on the KPI board, or **Reset**, so the next presenter starts from the brief's inputs.
- If you ran Live: **Start agent → Change or forget key → Forget key**, or close the tab.
