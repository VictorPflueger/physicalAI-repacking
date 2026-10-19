# Repack Pilot — five-minute demo script

**Audience:** a customer: a head of DC operations or a COO retail logistics, in a five-minute call; partners and principals rehearse with it. **Goal:** in five minutes the customer understands what Repack Pilot does, how it works and what it is worth, and can repeat one sentence: *"The robot repacks most of the pallet, people do the rest, every store makes its truck, and labour per 1,000 units falls from €89.50 to €32.49."*

**Recommended run:** Scenario 1, **Express order at 02:00**, in **Simulation** at **×1** (TECH_NOTES D52). The night is a scripted replay of the agent through its own tools, labelled SIMULATION; every hour and euro is computed by the engine at playback. It runs the same every time and needs no key and no network, so it fits the call. Say once that it is a replay: *"This is a recorded run of the agent; the live version runs the same night on Claude."*

**Longer sessions:** the same scenario in **Live** on Sonnet 5.5, the other five scenarios, and the autonomy dial (see "If you have more time"). A live night spends minutes on model calls alone, so it does not fit five minutes.

---

## Pre-flight (15 minutes before, on the presenting laptop)

1. Open the site in Chrome or Edge and hard-reload (**Ctrl + Shift + R**). On a browser's first visit the **How Repack Pilot works** window opens by itself; close it for now. Close other tabs and silence notifications.
2. Click **Diagnostics → Run all tests**. Every row passes except Open Food Facts, which is skipped by design; the footer shows **Repack Pilot 0.4.0**.
3. Rehearse once at **×4**: **Start agent → Run simulation**, approve **option B** and both drafts, open the **KPI board**, type a volume into **Your DC**, then click **Reference site** and **Reset**.
4. Set the stage: Scenario **Express order at 02:00**, Night **×1**, Autonomy **Approve**, the console in its simple view (**Details** off). Share a window of 1920 × 1080 (full screen, **F11**) at 100 % zoom. The status pill reads **Idle**.
5. Have the customer's yearly volume and labour cost ready if you know them; otherwise ask for them at 3:15.

## The five minutes at a glance

Times after the start of the call. The run's times were measured on 19 Oct 2026 in Chromium at 1920 × 1080, with the decision taken 30 s after the options appear and the drafts approved 5 s after they appear (TECH_NOTES §11); "run" gives the seconds after the click on **Run simulation**.

| Time | Segment | On screen |
|---|---|---|
| 0:00–0:45 | What it does, how it works, what it is worth | The **How it works** window: the sentence, five steps, three figures from the engine |
| 0:45–0:50 | Start | Start agent → **Run simulation** |
| 0:50–1:10 | The plan (run 0–18 s) | The plan in the console; the labour tile turns to €32.49 with −64 % |
| 1:10–1:30 | The robot learns (run 18 s) | The jar that weighs 400 g, not 200 g |
| 1:30–1:50 | People do the rest (run 37 s) | Two fragile bottles go to a person |
| 1:50–2:45 | You decide (run 60–112 s) | The express order, three costed options and doing nothing; approve **B** |
| 2:45–3:15 | Nothing is sent (run 126–141 s) | Two drafts approved; the night runs to 06:00; the closing card; the summary |
| 3:15–4:30 | What it is worth for you | **Your DC: the business case** → the KPI board; type the customer's volume |
| 4:30–5:00 | Close | The next step: a pilot cell in shadow mode |

---

## 1. What it does, how it works, what it is worth (0:00–0:45)

Click **How it works** in the header. Read the sentence at the top, then point at the three blocks.

> "This is one night shift in a grocery distribution centre. A robot cell and an AI agent repack the mixed pallets into twelve store orders before the trucks leave. The robot takes most of the units, people take the rest, and you decide whenever the plan has to change."

Point at the five steps: *Perceive, Plan, Pick, Replan, Prepare* — the same steps sit above the console during the run.

Point at **Why it pays off**:

> "Labour per 1,000 units: €32.49 with the cell instead of €89.50 by hand, minus 64 %. For a DC that repacks six million units a year, that is about €342,000 a year with four cells on the night shift, before cell costs. And each cell pays as long as it costs less than €40.72 an hour, all in. We'll come back to your own volume at the end."

Point at **What is real**: the cell and the retailer are simulated and labelled so; the engine's arithmetic and the sourced rates are real.

## 2. Start (0:45–0:50)

Click **Start agent** in the window, then **Run simulation**.

> "I'm running the recorded version, so it fits our call. Every figure you'll see is calculated now by the engine, not by the AI."

## 3. The night (0:50–3:15)

Talk over the night; do not read the console out. The board on the left shows the robot cell and the twelve stores with their truck times; the console on the right shows only what the agent says and the moments that matter (**Details** adds every tool call).

| Moment | You say |
|---|---|
| **22:00, the plan.** The labour tile turns from €89.50 to **€32.49** with **−64 %** beneath | "The agent reads tonight's orders and plans: earliest truck first, heavy items at the bottom of each tote. That's the plan: €32.49 per 1,000 units instead of €89.50 by hand." |
| **22:17, the jar.** *World model corrected*: the apricot jam weighs 400 g on the scale; its master data say 200 g. The agent's **Revised** line strikes the old weight | "Here's the robot learning. The label says 200 g — that's the jam. The robot lifts the glass too, so the scale reads 400 g. The cell corrects its world model for every jar of this item and rehearses the next grasp with the new weight. The agent closes the store's tote early so it stays within its weight limit." |
| **22:41, the bottles.** *Handed to a person*: an olive-oil bottle lying on its side, a passata bottle with a chipped neck | "And here's the split: when the robot isn't sure of its grip on something fragile, a rule in code hands it to a person. Robot for most units, people for the rest." |
| **02:00, the express order.** *Express order* and *Trucks at risk*; Hamm and Soest turn amber on the board | "Now the night changes: the flagship orders 400 more units for its 02:45 express truck. If the express order goes first, Hamm and Soest miss their trucks." |
| **The options.** The drawer opens: A, B, C and doing nothing, each with what happens to the trucks first; **Why recommended** on B | "The agent priced three options against doing nothing, each in 20 simulated versions of tonight. Doing nothing costs €462.50 on average. Option A is cheaper on average but leaves the express truck to chance; B calls in a picker for €134.25 and keeps every truck on time. The agent recommends B — and nothing happens until I decide." |

Click **Approve** on **B**.

| Moment | You say |
|---|---|
| **The drafts.** The Outbox opens: a call-in for the on-call pool and a note to the Dortmund store, each *Pending approval* | "It drafts what the decision needs. Nothing is ever sent: these wait for a person." |

Click **Approve all**. The night runs on; the trucks turn green.

| Moment | You say |
|---|---|
| **06:00, the closing card.** *Night over. All 13 orders on time.* Tonight: 5.86 h of labour with the cell, 3 h of it called in, against 8.5 h for the same 3,400 units by hand; then what it is worth | "Every truck made it, the express order included. Even on a night with a surprise and a call-in, the cell used 5.86 hours of labour where the same units take 8.5 by hand." |
| **The management summary** appears below it | "And a summary for the morning: what happened, what we decided, what it is worth." |

If a customer asks why tonight's figure per 1,000 units is higher than the plan, point at the called-in hours: the express order added 400 units at 02:00, and the picker is billed for its three-hour minimum.

## 4. What it is worth for you (3:15–4:30)

Click **Your DC: the business case** in the closing card. The KPI board opens on **What it is worth**.

> "This is the business case for a reference site: six million units a year, €342,069 a year before cell costs, with 4.2 cells on the night shift. Each cell pays while its all-in cost stays below €40.72 an hour. What's your yearly volume?"

Type it into **Units repacked a year** and press **Enter** (for example 10,000,000: €570,115 a year with 7 cells). If they know their labour cost per hour, type it into **Labour cost** too.

> "There's no payback figure here on purpose: robot cost, maintenance and integration differ by site. The break-even tells you what a cell may cost and still pay."

Below it, **Plan and tonight** sets the engine's plan beside tonight's simulated night, each figure with its source (IML, Eurostat) or the label Assumption.

## 5. Close (4:30–5:00)

> "So: the robot repacks most of the pallet, people do the rest, every store makes its truck, and labour per 1,000 units falls from €89.50 to €32.49. The sensible next step is a pilot cell running in shadow mode: the agent proposes, your shift lead decides, and we measure the agreement before it gets any more autonomy."

If the customer asks about autonomy, point at the dial in the control bar: **Bounded** is locked until the shadow-mode record shows 200 decisions over 10 nights with 95 % agreement (click it to show why).

Afterwards: **Reference site** on the KPI board (or Reset) puts the inputs back.

---

## If you have more time

- **Live** (5–10 minutes): **Start agent → Continue with my API key**. The same night, reasoned by Claude on your key; the console shows the model's words, and the cost meter the spend (a few tens of cents). The agent decides its own words; the guardrails stay the same.
- **Gripper wear** (scenario 4): the robot's success falls to 70 %; a rule calls a person, fragile items go to the manual station, and a 30-minute maintenance stop turns out cheaper than running on. The KPI board shows what the wear would cost all night as a labelled what-if.
- **Peak week** (scenario 6): 4,200 units with the usual staff; the cell is the bottleneck, and a called-in picker for two stores keeps every truck on time.
- **An unknown item** (scenario 3): a barcode the item master does not know; the units go to a person, and the agent asks you to confirm a provisional entry.
- **Holiday closing** (scenario 5) and **the glass jar alone** (scenario 2): nights the plan absorbs without a decision.
- **Details** in the console: every tool call the agent made, with its result.

## Contingencies

**The replay stops or shows an error.** Read the console's last line in one sentence, click **Reset**, then **Start agent → Run simulation** again at **×2**.

**A slow laptop.** Use **×2**: the run then takes about half as long; talk over the moments as above.

**The window is smaller than 1920 × 1080.** The layout works down to 1280 × 720; at that size the option cards stand two by two (scroll for C and doing nothing), and the closing card scrolls up in the console: open the KPI board for the figures.

## Questions you will get

| Question | Answer |
|---|---|
| "Is this a real robot?" | "No: the cell, its camera, scale and gripper are simulated, and labelled so. Its rates come from published sources and labelled assumptions: 500 grasp attempts an hour, the low end of manufacturer data, and 91 % grasp success, from a published Amazon trial. The next step is a real cell in shadow mode." |
| "Which robot vendor?" | "None is named, on purpose. The case depends on the rates, not the brand; you can change them in the Assumptions tab." |
| "What does a cell cost?" | "That's site-specific, so there's no payback claim. The break-even says a cell pays while its all-in cost stays below €40.72 an operating hour at these rates." |
| "Can the AI make up the numbers?" | "No. A deterministic engine computes every hour and euro; the AI only words them, and code refuses any amount the engine did not produce." |
| "What if the AI is wrong?" | "It proposes; your shift lead decides. Fragile items, unknown items and a failing gripper go to a person by rules in code, and nothing is sent without approval. More autonomy only after shadow-mode evidence." |
| "Why does tonight cost more per 1,000 units than the plan?" | "Because of the express order: 400 more units at 02:00 and three hours of called-in labour. It is still below the 8.5 hours the same units take by hand." |
| "Does it work with our warehouse system?" | "The agent talks to the warehouse through a handful of tools: orders, totes, the cell's status. Connecting those to your system is the integration step of a pilot." |
| "What about regulation?" | "It discloses that you are dealing with an AI system, keeps a person in charge of every outbound action and logs every step for export. A real cell also needs conformity assessment and CE marking under the EU Machinery Regulation from 20 January 2027." |

## After the demo

- Click **Reference site** on the KPI board, or **Reset**, so the next presenter starts from the brief's inputs.
- If you ran Live: **Start agent → Change or forget key → Forget key**, or close the tab.
