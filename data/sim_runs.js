/*
 * REPACK PILOT — simulation scripts (loaded as a classic script). A script is what the agent says and
 * which tools it calls at each wake-up of its scenario's night; the scripted replay (js/simulation.js)
 * plays it through the live agent's own tools (js/tools.js), so every figure on screen is computed by
 * the engine and the night simulation at playback, and every action passes the live guardrails. No
 * figure is typed: {{placeholders}} take them from the tool results of that moment (js/sim_vars.js),
 * and the script checker (js/sim_check.js) replays every path a person can take, headless, before a demo.
 *
 * Format (js/script.js): wakes[] with the kinds the night must show there and the steps; a text may be
 * a map by path ({ B: "…", confirmed: "…", default: "…" }), and a tool input field may be
 * { $by_decision: { … } }. Scripts are written for their scenario's night at the brief's rates
 * (TECH_NOTES D34), and word an approved option so that it reads right in Advise mode too, where the
 * person's click applies it.
 *
 * Plain words for a customer (TECH_NOTES D50): short sentences; "simulated nights" for the costing's
 * replications; a rule in code instead of its number; the seed only where the KPI board and the audit
 * keep it. Every night ends with what it is worth (sim_kpis) in the management summary.
 *
 * Scenario 1 is the main run (M3), with scenario 2's glass jar on the way; scenarios 2 to 6 arrived with
 * M4. A recorded live run (js/recorder.js, "Save run as simulation") is appended at the end of this file
 * and then replaces the authored script of its scenario.
 */
window.SIM_RUNS = (() => {
  const SIGN = "Night shift lead, Ruhrkorb DC Unna";
  const FOOTER = "*Simulated run: a scripted replay on a simulated cell. Ruhrkorb, its DC, stores and items are fictional.*";
  const HOW = "**How we know.** Every hour and euro comes from the deterministic engine and the reproducible night simulation, not from the AI. The picking rate and the labour cost are sourced (IML, Eurostat); the cell's rates are assumptions.";
  const HOW_OPTIONS = `${HOW} Each option was priced on {{options.replications}} simulated versions of tonight.`;
  const TONIGHT = "**Tonight.** {{night.on_time}} orders on their trucks; late: {{night.late}}. Labour {{night.labour_h}}, against {{night.by_hand_h}} for the same units by hand. The cell ran {{night.cell_h}} at {{night.picks}} picks per cell hour.";
  const WORTH = "**What it is worth.** {{kpis.hybrid_eur}} of labour per 1,000 units with the cell, against {{kpis.manual_eur}} by hand (−{{kpis.saving_pct}}). For a DC that repacks {{kpis.units_year}} units a year, that is {{kpis.year_eur}} a year with {{kpis.cells}} cells on the night shift, gross, before cell costs. Each cell pays while its all-in cost stays below {{kpis.break_even}} per operating hour.";
  const NIGHT_OVER = "Night over: {{night.on_time}} orders made their trucks; late: {{night.late}}. Labour came to {{night.labour_h}}; by hand, the same units would have taken {{night.by_hand_h}}.";
  const NIGHT_END_READS = { tools: [{ tool: "sim_night_report" }, { tool: "sim_kpis" }] };
  const CLOSE = { say: "The management summary is ready in the console. That closes the night." };
  const md = (...parts) => parts.join("\n\n");

  /** Night start on a normal night: the night, the plan and the projection, then the night runs. */
  const nightStart = (extra = "") => ({
    kinds: ["night_start"],
    steps: [
      { say: "22:00, night shift at Ruhrkorb DC Unna. I read tonight's orders and the plan." },
      { tools: [{ tool: "wms_get_night" }, { tool: "sim_plan_night" }, { tool: "sim_project" }] },
      { say: `Tonight: {{plan.units}} units for {{wms.orders}} stores. The robot can take {{plan.cell_units}}; {{plan.manual_units}} go to the manual station.\n\nPlan: the earliest truck first, heavy items at the bottom of each tote. Labour: {{plan.hybrid_eur}} per 1,000 units with the cell, against {{plan.manual_eur}} by hand.\n\nCheck: {{risk.sentence}}.${extra} I let the night run and step in when something changes.` },
      { tool: "sim_advance" }
    ]
  });

  /** The glass jar's correction: every scenario's night carries the jar whose master data hold 200 g. */
  const jarCorrection = () => ({
    kinds: ["correction"],
    steps: [
      { say: "{{wake.clock}}: the scale has caught a glass jar heavier than the world model expected. I check the item, its next grasp and the tote it went into." },
      { tools: [{ tool: "world_get_item", input: { sku_id: "{{corr.sku}}" } }, { tool: "cell_get_grasp_plan", input: { sku_id: "{{corr.sku}}" } }, { tool: "wms_get_order", input: { store_id: "{{corr.store_id}}" } }] },
      { say: "Revised: the jar weighs {{corr.old}}, as in the master data → {{corr.new}}, as the scale weighs it, for every jar of this item.\n\nFinding: the label's {{corr.old}} is the jam alone; the robot lifts the glass too. The next jar is rehearsed with the new weight before the robot picks it: {{grasp.S07.success}} expected success.\n\n{{corr.store}}'s tote was packed with the old weight, so I close it at {{corr.tote_kg}} and start a fresh one." },
      { tool: "wms_rebalance_tote", input: { store_id: "{{corr.store_id}}", reason: "{{corr.name}} weighs {{corr.new}}, not {{corr.old}}: start a fresh tote by the corrected weights." } },
      { tool: "sim_advance" }
    ]
  });
  const JAR = "At {{corr.at}} the scale caught a glass jar ({{corr.name}}) at {{corr.new}}; its master data said {{corr.old}}, the net content on its label. The world model now holds {{corr.new}} for every jar, and {{rebalance.store}}'s tote was closed early at {{rebalance.kg}}.";

  /** Drafts decided, then the night goes on. */
  const draftsDone = (what) => ({ say: `Drafts: {{drafts.approved}} approved, {{drafts.rejected}} rejected. Nothing was sent; a person sends the approved ones. ${what}` });
  const handoverMemo = (subject, body) => ({ tool: "ui_draft_action", input: { type: "memo", recipient: "Shift handover, Ruhrkorb DC Unna", subject, body: `${body}\n\n${SIGN}` } });

  /** Scenario 1's summary for each decision: what happened, what we decided, tonight, what it is worth. */
  const sc1Summary = (decision, table, tonight) => md(
    "## Ruhrkorb DC Unna, night shift: an express order at {{xpr.at}}",
    "**What happened.** At {{xpr.at}} the Dortmund flagship ordered {{xpr.units}} more units for its {{xpr.due}} express truck. Taken first, as the warehouse system does, it would have made Hamm and Soest miss their {{proj.HAM.cutoff}} trucks: Soest in {{nothing.late.SOE}} simulated nights and Hamm in {{nothing.late.HAM}}, {{nothing.total}} on average at {{options.late_cost}} per late store order.",
    `**What we decided.** ${decision}`,
    table,
    tonight,
    "**Physical AI at work.** " + JAR + " At {{esc.at}} two fragile glass bottles went to a person, by a rule in code.",
    "**Actions.** {{drafts.approved}} of {{drafts.total}} drafts approved, {{drafts.rejected}} rejected. Nothing was sent.",
    WORTH,
    HOW_OPTIONS,
    FOOTER
  );
  const versus = (id, label) => `| | Do nothing | ${label} |\n|---|---|---|\n| Extra labour | {{nothing.labour}} | {{${id}.labour}} |\n| Late store orders, expected | {{nothing.late}} | {{${id}.late}} |\n| Their cost | {{nothing.late_eur}} | {{${id}.late_eur}} |\n| Expected total | {{nothing.total}} | {{${id}.total}} |`;

  return {
    "SC1-EXPRESS": {
      source: "authored",
      scenario: "SC1-EXPRESS",
      world_version: "1.1.0",
      wakes: [
        {
          kinds: ["night_start"],
          steps: [
            { say: "22:00, night shift at Ruhrkorb DC Unna. I read tonight's orders and the plan." },
            { tools: [{ tool: "wms_get_night" }, { tool: "sim_plan_night" }, { tool: "sim_project" }] },
            { say: "Tonight: {{plan.units}} units for {{wms.orders}} stores. The robot can take {{plan.cell_units}}; {{plan.manual_units}} go to the manual station.\n\nPlan: the earliest truck first, heavy items at the bottom of each tote. Labour: {{plan.hybrid_eur}} per 1,000 units with the cell, against {{plan.manual_eur}} by hand.\n\nCheck: {{risk.sentence}}. The first truck leaves at {{plan.first_cutoff}} for {{plan.first_store}}, the last at {{plan.last_cutoff}}. I let the night run and step in when something changes." },
            { tool: "sim_advance" }
          ]
        },
        {
          kinds: ["correction"],
          steps: [
            { say: "{{wake.clock}}: the scale has caught a glass jar heavier than the world model expected. I check the item, its next grasp and the tote it went into." },
            { tools: [{ tool: "world_get_item", input: { sku_id: "{{corr.sku}}" } }, { tool: "cell_get_grasp_plan", input: { sku_id: "{{corr.sku}}" } }, { tool: "wms_get_order", input: { store_id: "{{corr.store_id}}" } }] },
            { say: "Revised: the jar weighs {{corr.old}}, as in the master data → {{corr.new}}, as the scale weighs it, for every jar of this item.\n\nFinding: the label's {{corr.old}} is the jam alone; the robot lifts the glass too. The next jar is rehearsed with the new weight before the robot picks it: {{grasp.S07.success}} expected success.\n\n{{order.ESS.name}}'s tote was packed with the old weight, so I close it at {{order.ESS.tote_kg}} and start a fresh one." },
            { tool: "wms_rebalance_tote", input: { store_id: "{{corr.store_id}}", reason: "{{corr.name}} weighs {{corr.new}}, not {{corr.old}}: start a fresh tote by the corrected weights." } },
            { tool: "sim_advance" }
          ]
        },
        {
          kinds: ["escalation"],
          steps: [
            { say: "{{wake.clock}}: a rule in code handed two fragile glass bottles for {{esc.1.store}} to a person; the robot was not sure enough of its grip. I check that the gripper itself is fine." },
            { tool: "cell_get_status" },
            { say: "Confirmed: the robot still picks {{cell.rolling}} of its last 100 grasps, so the gripper is fine. Nothing else needs a person." },
            { tool: "sim_advance" }
          ]
        },
        {
          kinds: ["new_order", "cutoff_risk"],
          steps: [
            { say: "{{wake.clock}}: the warehouse system puts the express order first, and two trucks come under risk. I check the projection." },
            { tool: "sim_project" },
            { say: "Check: confirmed. With the express order first, Hamm would be {{proj.HAM.slack}} and Soest {{proj.SOE.slack}}.\n\nHypothesis: taking them first could save both, but puts the express order at risk. I price three options against doing nothing, each in 20 simulated versions of tonight." },
            { tool: "sim_cost_options", ref: "options" },
            { say: "Finding: doing nothing costs {{nothing.total}} on average: Soest misses its truck in {{nothing.late.SOE}} simulated nights, Hamm in {{nothing.late.HAM}}.\n\nRecommendation: option B, a second picker from {{wake.clock}} for {{B.labour}}: every truck on time in all {{options.replications}} nights. Option A costs less on average, {{A.total}}, but leaves the flagship's express order late in {{A.late.XPR}} nights, and tonight is one of them." },
            {
              propose: {
                input: {
                  options: [
                    { variant_id: "A", title: "Re-sequence: Hamm and Soest first", description: "Iserlohn, Hamm and Soest go before the express order. No extra labour.", residual_risk: "The express order misses its {{xpr.due}} truck in {{A.late.XPR}} simulated nights, and tonight is one of them." },
                    { variant_id: "B", title: "Call in one picker, Hamm and Soest first", description: "A second picker at the manual station from 02:00, for the call-in minimum of {{options.call_in_min}}; the same order as A.", residual_risk: "The call-in is billed for its minimum, even if the work ends sooner." },
                    { variant_id: "C", title: "Move Soest to tomorrow's wave", description: "Soest's order goes with tomorrow's delivery; Iserlohn and Hamm go before the express order. No extra labour.", residual_risk: "Soest gets no delivery tonight: its order is late for certain." }
                  ],
                  recommended_variant_id: "B",
                  recommendation_reason: "Every truck on time, the express order included. A costs less on average but leaves the express truck to chance.",
                  baseline_description: "The express order stays first: Soest misses its truck in {{nothing.late.SOE}} simulated nights and Hamm in {{nothing.late.HAM}}."
                },
                rejected: {
                  A: "Understood: no re-sequence on its own. Your decision on the other options or on doing nothing, please.",
                  B: "Understood: no call-in tonight. Your decision on the other options or on doing nothing, please.",
                  C: "Understood: Soest stays in tonight's work. Your decision on the other options or on doing nothing, please."
                },
                approved: {
                  B: [
                    { tool: "wms_apply_option", input: { option_id: "B" } },
                    { say: "You approved option B. From {{applied.from}} a second picker works at the manual station, and Iserlohn, Hamm and Soest go before the express order. I draft the call-in and a note to the Dortmund store." },
                    { tool: "ui_draft_action", input: { type: "call_in", recipient: "On-call picker pool, Ruhrkorb DC Unna", subject: "Call-in tonight from {{applied.from}}: one picker, manual station", body: `Hello,\n\nRuhrkorb DC Unna needs one picker at the manual station tonight, starting at {{applied.from}}, for the call-in minimum of {{options.call_in_min}}. Please report to the shift lead at the repack cell.\n\n${SIGN}` } },
                    { tool: "ui_draft_action", input: { type: "email", recipient: "Ruhrkorb Dortmund, store manager", subject: "Your express order tonight: on the {{xpr.due}} truck", body: `Dear store manager,\n\nyour express order of {{xpr.units}} units reached us at {{wake.clock}}. It goes on your {{xpr.due}} express truck. To keep two other stores on their trucks, we repack them first and have called in a second picker.\n\n${SIGN}` } },
                    { tool: "ui_await_approvals" },
                    draftsDone("The night goes on with option B."),
                    { tool: "sim_advance" }
                  ],
                  A: [
                    { tool: "wms_apply_option", input: { option_id: "A" } },
                    { say: "You approved option A. From {{applied.from}} Iserlohn, Hamm and Soest go before the express order. The express order may now miss its truck, so I draft a note to the Dortmund store." },
                    { tool: "ui_draft_action", input: { type: "email", recipient: "Ruhrkorb Dortmund, store manager", subject: "Your express order tonight may miss the {{xpr.due}} truck", body: `Dear store manager,\n\nyour express order of {{xpr.units}} units reached us at {{wake.clock}}. To keep two other stores on their trucks, we repack them first, so your express order may miss its {{xpr.due}} truck. We will confirm it once the truck has left.\n\n${SIGN}` } },
                    { tool: "ui_await_approvals" },
                    draftsDone("The night goes on with option A."),
                    { tool: "sim_advance" }
                  ],
                  C: [
                    { tool: "wms_apply_option", input: { option_id: "C" } },
                    { say: "You approved option C. From {{applied.from}} Soest's order moves to tomorrow's wave, and Hamm goes before the express order. I draft a note to the Soest store and one to the carrier." },
                    { tool: "ui_draft_action", input: { type: "email", recipient: "Ruhrkorb Soest, store manager", subject: "Your order moves to tomorrow's delivery", body: `Dear store manager,\n\nan express order for another store arrived at {{wake.clock}}. To keep the other trucks on time, your order for tonight moves to tomorrow's wave and comes with tomorrow's delivery.\n\n${SIGN}` } },
                    { tool: "ui_draft_action", input: { type: "email", recipient: "Carrier dispatch, Soest route", subject: "Soest: no load on tonight's truck", body: `Hello,\n\nSoest's order leaves tonight's wave and travels with tomorrow's. Tonight's truck to Soest has no load from us.\n\n${SIGN}` } },
                    { tool: "ui_await_approvals" },
                    draftsDone("The night goes on with option C."),
                    { tool: "sim_advance" }
                  ],
                  baseline: [
                    { say: "You chose to do nothing: the express order stays first. Nothing goes to a store, the carrier or the picker pool. I record the decision for the shift handover." },
                    handoverMemo("Express order at {{wake.clock}}: plan kept", "At {{wake.clock}} an express order of {{xpr.units}} units for {{xpr.store}} arrived for its {{xpr.due}} truck. Three options were priced against doing nothing; the shift lead kept the plan. Expected: Soest late in {{nothing.late.SOE}} simulated nights and Hamm in {{nothing.late.HAM}}, {{nothing.total}} at {{options.late_cost}} per late store order."),
                    { tool: "ui_await_approvals" },
                    { say: "The memo is decided: {{drafts.approved}} approved, {{drafts.rejected}} rejected. Nothing was sent. The night goes on with the plan as it was." },
                    { tool: "sim_advance" }
                  ]
                }
              }
            }
          ]
        },
        {
          kinds: ["night_end"],
          steps: [
            NIGHT_END_READS,
            {
              say: {
                B: "Night over: {{night.on_time}} orders made their trucks, the express order included. Labour came to {{night.labour_h}}, {{night.called_in_h}} of it called in for the express order; by hand, the same units would have taken {{night.by_hand_h}}.",
                A: NIGHT_OVER,
                C: "Night over: {{night.on_time}} orders made their trucks; {{night.moved}} moved to tomorrow's wave. Labour came to {{night.labour_h}}; by hand, the same units would have taken {{night.by_hand_h}}.",
                baseline: NIGHT_OVER
              }
            },
            {
              tool: "ui_final_report",
              input: {
                outcome: { $by_decision: { baseline: "baseline_accepted", default: "option_decided" } },
                markdown: {
                  $by_decision: {
                    B: sc1Summary(
                      "You approved option B: one picker called in from {{applied.from}} for the call-in minimum of {{options.call_in_min}}, with Iserlohn, Hamm and Soest before the express order.",
                      versus("B", "Option B"),
                      "**Tonight.** {{night.on_time}} orders on their trucks, the express order included. Labour {{night.labour_h}} with {{night.called_in_h}} called in, against {{night.by_hand_h}} for the same units by hand. The cell ran {{night.cell_h}} at {{night.picks}} picks per cell hour."),
                    A: sc1Summary(
                      "You approved option A: Iserlohn, Hamm and Soest before the express order, with no extra labour.",
                      versus("A", "Option A"),
                      TONIGHT),
                    C: sc1Summary(
                      "You approved option C: Soest's order moved to tomorrow's wave, Iserlohn and Hamm before the express order.",
                      versus("C", "Option C"),
                      "**Tonight.** {{night.on_time}} orders on their trucks; {{night.moved}} moved to tomorrow's wave. Labour {{night.labour_h}}, against {{night.by_hand_h}} for the same units by hand. The cell ran {{night.cell_h}} at {{night.picks}} picks per cell hour."),
                    baseline: sc1Summary(
                      "You chose to do nothing: the express order stayed first. Option B, recommended, would have called in one picker.",
                      versus("B", "Option B (recommended)"),
                      TONIGHT)
                  }
                }
              }
            },
            CLOSE
          ]
        }
      ]
    },

    // ---- Scenario 2: glassware heavier than its master data ------------------------------------------
    "SC2-GLASS": {
      source: "authored",
      scenario: "SC2-GLASS",
      world_version: "1.1.0",
      wakes: [
        nightStart(),
        jarCorrection(),
        {
          kinds: ["night_end"],
          steps: [
            NIGHT_END_READS,
            { tool: "world_list_corrections" },
            { say: `${NIGHT_OVER}\n\nThe world model's corrections log holds {{corrections.count}} entry: {{corrections.list}}. The next jars were rehearsed and packed by the corrected weight; the heaviest tote tonight weighed {{night.heaviest_tote}}, within the {{night.tote_limit}} limit. Nothing needed your decision.` },
            {
              tool: "ui_final_report",
              input: {
                outcome: "correction_only",
                markdown: md(
                  "## Ruhrkorb DC Unna, night shift: a glass jar heavier than its master data",
                  "**What happened.** At {{corr.at}} the scale under the gripper read {{corr.new}} for {{corr.name}}; its master data hold {{corr.old}}, the net content printed on its label. The world model took the measured weight for every unit of the item, and the robot rehearsed the next jar's grasp with it ({{grasp.S07.success}} expected success).",
                  "**Actions.** {{rebalance.store}}'s tote was closed early at {{rebalance.kg}} and a fresh tote started, so the next units went in by the corrected weights. The heaviest tote tonight weighed {{night.heaviest_tote}} (limit {{night.tote_limit}}). No rule called a person and no decision was needed.",
                  TONIGHT,
                  "**Corrections log.** {{corrections.list}}.",
                  WORTH,
                  HOW,
                  FOOTER
                )
              }
            },
            CLOSE
          ]
        }
      ]
    },

    // ---- Scenario 3: an unknown SKU on the pallet ------------------------------------------------------
    "SC3-UNKNOWN": {
      source: "authored",
      scenario: "SC3-UNKNOWN",
      world_version: "1.1.0",
      wakes: [
        nightStart(),
        jarCorrection(),
        {
          kinds: ["escalation"],
          steps: [
            { say: "{{wake.clock}}: the camera reads a barcode the item master does not know, {{esc.1.barcode}}, on {{esc.1.units}} units. A rule in code sends them to {{esc.1.to}}, not to the robot. I check the item master and look the barcode up." },
            { tools: [{ tool: "world_get_item", input: { barcode: "{{esc.1.barcode}}" } }, { tool: "open_lookup_barcode", input: { barcode: "{{esc.1.barcode}}" } }] },
            { say: "Finding: the item master has no entry for {{esc.1.barcode}}, and {{lookup.sentence}}. The robot never picks an item it does not know, so the units stay with a person.\n\nI create a provisional entry from what we know, marked unverified, and ask you to confirm it." },
            { tool: "world_propose_entry", input: { barcode: "{{esc.1.barcode}}", name: "{{lookup.name}}", net_content: "{{lookup.net_content}}", source: "{{lookup.entry_source}}" } },
            {
              confirm: {
                input: {
                  subject: "Provisional entry for barcode {{entry.barcode}}: {{entry.name}}",
                  reason: "The camera read a barcode the item master does not know, and {{lookup.sentence}}. The entry stays unverified until you decide; tonight its units stay with a person either way.",
                  entry_barcode: "{{entry.barcode}}"
                },
                confirmed: [{ say: "You confirmed the entry: it goes into the item master as {{entry.name}}. Tonight's units of the item stay at the manual station." }],
                rejected: [{ say: "You rejected the entry: the barcode stays unknown, and its units stay set aside for a person." }]
              }
            },
            { tool: "sim_advance" }
          ]
        },
        {
          kinds: ["night_end"],
          steps: [
            NIGHT_END_READS,
            { say: `${NIGHT_OVER}\n\nThe {{esc.1.units}} units with barcode {{esc.1.barcode}} went to a person, as the rule requires; nothing else needed your decision.` },
            {
              tool: "ui_final_report",
              input: {
                outcome: "escalation_only",
                markdown: {
                  $by_decision: Object.fromEntries([
                    ["confirmed", "A provisional entry, {{entry.name}}, was created unverified; you confirmed it for the item master. Tonight's units stayed at the manual station."],
                    ["rejected", "A provisional entry, {{entry.name}}, was created unverified; you rejected it. The barcode stays unknown and its units stay set aside for a person."]
                  ].map(([id, decision]) => [id, md(
                    "## Ruhrkorb DC Unna, night shift: an unknown item on the pallet",
                    "**What happened.** At {{esc.at}} the camera read barcode {{esc.1.barcode}} on {{esc.1.units}} units; the item master does not know it. A rule in code sent every unit to a person: the robot never picks an item it does not know.",
                    "**Lookup.** {{lookup.Sentence}}. One lookup of at most three per run. Product data: Open Food Facts, ODbL.",
                    `**Decision.** ${decision}`,
                    TONIGHT,
                    "**Physical AI at work.** " + JAR,
                    WORTH,
                    HOW,
                    FOOTER
                  )]))
                }
              }
            },
            CLOSE
          ]
        }
      ]
    },

    // ---- Scenario 4: gripper wear -------------------------------------------------------------------------
    "SC4-WEAR": {
      source: "authored",
      scenario: "SC4-WEAR",
      world_version: "1.1.0",
      wakes: [
        nightStart(),
        jarCorrection(),
        {
          kinds: ["escalation"],
          steps: [
            { say: "{{wake.clock}}: the robot picked only {{esc.1.rolling}} of its last 100 grasps. A rule in code calls a person to the cell. I read the cell's status." },
            { tool: "cell_get_status" },
            { say: "Confirmed: {{cell.failures}} grasps have failed tonight, and the robot picks {{cell.rolling}} of its last 100. That is the gripper wearing, not one item. A safety step first: from now on fragile items go to a person, so no glass is dropped while the gripper is worn." },
            { tool: "cell_route_to_manual", input: { fragile_only: true, reason: "Gripper wear: grasp success below the rule's threshold. Fragile items go to a person until the gripper is serviced." } },
            { tool: "sim_kpis", input: { what_if: { p: 0.7 } } },
            { say: "Done: from {{routed.from}} fragile items go to the manual station; {{routed.units}} units move there.\n\nWhat-if: if the gripper stayed at {{whatif.p}} success all night, labour would be {{whatif.hybrid_h}} · {{whatif.hybrid_eur}} per 1,000 units, against {{plan.hybrid_h}} · {{plan.hybrid_eur}} at the plan's rate. A labelled what-if, not tonight's figure.\n\nHypothesis: a short maintenance stop costs cell time but ends the failed grasps. I price three options against running on." },
            { tool: "sim_cost_options", ref: "options" },
            { say: "Finding: running on, {{nothing.tonight}}, but the worn gripper keeps sending failed grasps to the manual station.\n\nRecommendation: option A, stop the cell now for a 30-minute gripper service. It {{A.labour_text}} against running on, and {{A.trucks}}: an expected total of {{A.total}}, the lowest. Waiting until 00:30 (option C) saves less, {{C.total}}; a call-in instead (option B) costs {{B.total}}." },
            {
              propose: {
                input: {
                  options: [
                    { variant_id: "A", title: "Maintenance stop now, 30 minutes", description: "The cell stops now for a 30-minute gripper service and restarts with the gripper restored. Fragile items stay with a person.", residual_risk: "The cell stands still for 30 minutes; a longer stop would cut into the time to spare before the 02:40 trucks." },
                    { variant_id: "B", title: "No stop: call in a picker from 01:00", description: "The worn gripper keeps working; a second picker joins the manual station from 01:00 for the call-in minimum and takes the failed grasps.", residual_risk: "Failed grasps go on all night; the call-in is billed for its minimum even if the work ends sooner." },
                    { variant_id: "C", title: "Maintenance stop at 00:30, before the chilled goods", description: "The cell works the ambient goods until 00:30, then stops for a 30-minute service and is ready when the chilled goods arrive at 01:00.", residual_risk: "Until 00:30 the worn gripper keeps failing grasps, so it saves less than a stop now." }
                  ],
                  recommended_variant_id: "A",
                  baseline_description: "Run on with the worn gripper and fragile items with a person: {{nothing.tonight}}, while failed grasps keep going to the manual station."
                },
                rejected: {
                  A: "Understood: no stop now. Your decision on the other options or on running on, please.",
                  B: "Understood: no call-in tonight. Your decision on the other options or on running on, please.",
                  C: "Understood: no stop at 00:30. Your decision on the other options or on running on, please."
                },
                approved: {
                  A: [
                    { tool: "wms_apply_option", input: { option_id: "A" } },
                    { say: "Option A applies from {{applied.from}}: the cell stops for its gripper service and restarts with the gripper restored. Fragile items stay with a person. I draft the maintenance memo." },
                    { tool: "ui_draft_action", input: { type: "memo", recipient: "Maintenance, Ruhrkorb DC Unna", subject: "Repack cell 1: gripper service tonight from {{applied.from}}", body: `Hello,\n\nthe repack cell's grasp success fell below its threshold at {{esc.at}}: {{cell.rolling}} of the last 100 grasps. Please service the gripper in a 30-minute stop from {{applied.from}}. Fragile items stay with a person until then.\n\n${SIGN}` } },
                    { tool: "ui_await_approvals" },
                    draftsDone("The night goes on with option A."),
                    { tool: "sim_advance" }
                  ],
                  B: [
                    { tool: "wms_apply_option", input: { option_id: "B" } },
                    { say: "Option B applies from {{applied.from}}: the cell keeps working, and a second picker joins the manual station from 01:00. I draft the call-in and a maintenance memo for the morning." },
                    { tool: "ui_draft_action", input: { type: "call_in", recipient: "On-call picker pool, Ruhrkorb DC Unna", subject: "Call-in tonight from 01:00: one picker, manual station", body: `Hello,\n\nRuhrkorb DC Unna needs one picker at the manual station tonight, starting at 01:00, for the call-in minimum of {{options.call_in_min}}. Please report to the shift lead at the repack cell.\n\n${SIGN}` } },
                    { tool: "ui_draft_action", input: { type: "memo", recipient: "Maintenance, Ruhrkorb DC Unna", subject: "Repack cell 1: gripper service after the shift", body: `Hello,\n\nthe repack cell's grasp success fell below its threshold at {{esc.at}}: {{cell.rolling}} of the last 100 grasps. It runs on tonight with a called-in picker; please service the gripper after the shift.\n\n${SIGN}` } },
                    { tool: "ui_await_approvals" },
                    draftsDone("The night goes on with option B."),
                    { tool: "sim_advance" }
                  ],
                  C: [
                    { tool: "wms_apply_option", input: { option_id: "C" } },
                    { say: "Option C applies from {{applied.from}}: the cell works on until 00:30, then stops for its gripper service before the chilled goods arrive. I draft the maintenance memo." },
                    { tool: "ui_draft_action", input: { type: "memo", recipient: "Maintenance, Ruhrkorb DC Unna", subject: "Repack cell 1: gripper service tonight at 00:30", body: `Hello,\n\nthe repack cell's grasp success fell below its threshold at {{esc.at}}: {{cell.rolling}} of the last 100 grasps. Please service the gripper in a 30-minute stop from 00:30, before the chilled goods arrive at 01:00.\n\n${SIGN}` } },
                    { tool: "ui_await_approvals" },
                    draftsDone("The night goes on with option C."),
                    { tool: "sim_advance" }
                  ],
                  baseline: [
                    { say: "You chose to run on: no stop and no call-in. Fragile items stay with a person. I record the decision for the shift handover." },
                    handoverMemo("Gripper wear at {{esc.at}}: cell kept running", "At {{esc.at}} the robot picked only {{cell.rolling}} of its last 100 grasps, and a rule in code called a person. Fragile items went to a person; three options were priced against running on, and the shift lead kept the cell running. The gripper needs a service after the shift."),
                    { tool: "ui_await_approvals" },
                    { say: "The memo is decided: {{drafts.approved}} approved, {{drafts.rejected}} rejected. Nothing was sent. The night goes on as it was." },
                    { tool: "sim_advance" }
                  ]
                }
              }
            }
          ]
        },
        {
          kinds: ["night_end"],
          steps: [
            NIGHT_END_READS,
            { say: { default: NIGHT_OVER, A: `${NIGHT_OVER} After the gripper service the robot picked at its normal success rate again.` } },
            {
              tool: "ui_final_report",
              input: {
                outcome: { $by_decision: { baseline: "baseline_accepted", default: "option_decided" } },
                markdown: {
                  $by_decision: Object.fromEntries([["A", "option A: a 30-minute maintenance stop from {{applied.from}}"], ["B", "option B: no stop, one picker called in from 01:00 for the call-in minimum of {{options.call_in_min}}"], ["C", "option C: a 30-minute maintenance stop at 00:30, before the chilled goods"], ["baseline", "to run on with the worn gripper"]].map(([id, what]) => [id, md(
                    "## Ruhrkorb DC Unna, night shift: gripper wear",
                    "**What happened.** From 23:30 the gripper wore: at {{esc.at}} the robot picked only {{esc.1.rolling}} of its last 100 grasps, below the 75 % a rule in code asks for, and a person was called to the cell. Fragile items went to a person from {{routed.from}}. What the wear would cost if it lasted all night is shown as a labelled what-if on the KPI board; a summary quotes no what-if.",
                    `**What we decided.** ${id === "baseline" ? "You chose" : "You approved"} ${what}.`,
                    `| | Running on | ${id === "baseline" ? "Option A (recommended)" : `Option ${id}`} |\n|---|---|---|\n| Extra labour | {{nothing.labour}} | {{${id === "baseline" ? "A" : id}.labour}} |\n| Late store orders, expected | {{nothing.late}} | {{${id === "baseline" ? "A" : id}.late}} |\n| Expected total | {{nothing.total}} | {{${id === "baseline" ? "A" : id}.total}} |`,
                    TONIGHT,
                    "**Physical AI at work.** " + JAR,
                    "**Actions.** {{drafts.approved}} of {{drafts.total}} drafts approved, {{drafts.rejected}} rejected. Nothing was sent.",
                    WORTH,
                    HOW_OPTIONS + " The wear itself, 70 % success from 23:30, is a stress-test assumption.",
                    FOOTER
                  )]))
                }
              }
            },
            CLOSE
          ]
        }
      ]
    },

    // ---- Scenario 5: a store closes early before a holiday ------------------------------------------
    "SC5-EARLY": {
      source: "authored",
      scenario: "SC5-EARLY",
      world_version: "1.1.0",
      wakes: [
        {
          kinds: ["night_start"],
          steps: [
            { say: "22:00 on Wednesday 23 December 2026, night shift at Ruhrkorb DC Unna. I read tonight's orders and the plan." },
            { tools: [{ tool: "wms_get_night" }, { tool: "sim_plan_night" }, { tool: "sim_project" }] },
            { say: "Tonight: {{plan.units}} units for {{wms.orders}} stores. Soest closes at 14:00 on Thursday 24 December, as § 4 (1) no. 2 LÖG NRW allows shops in North Rhine-Westphalia on 24 December when it is a working day; § 3 LadSchlG is the federal background. Its goods must arrive earlier, so its truck leaves at {{wms.SOE.cutoff}}, ahead of Essen's at {{wms.ESS.cutoff}}.\n\nPlan: the earliest truck first, so Soest moves to the front of the robot and the manual station. Check: Soest's last unit is due by {{proj.SOE.by}} for its {{proj.SOE.cutoff}} truck, {{proj.SOE.slack}}. The stores behind it lose a few minutes; the tightest, {{proj.tightest}}, keeps {{proj.tightest_slack}}: {{risk.sentence}}.\n\nFinding: no store slips, so there is nothing to decide tonight and no options to price. Labour: {{plan.hybrid_eur}} per 1,000 units with the cell, against {{plan.manual_eur}} by hand. I let the night run and step in when something changes." },
            { tool: "sim_advance" }
          ]
        },
        jarCorrection(),
        {
          kinds: ["night_end"],
          steps: [
            NIGHT_END_READS,
            { say: `${NIGHT_OVER}\n\nSoest's early truck at {{wms.SOE.cutoff}} took its order, and no other store slipped: the plan absorbed the early closing without a decision.` },
            {
              tool: "ui_final_report",
              input: {
                outcome: "correction_only",
                markdown: md(
                  "## Ruhrkorb DC Unna, night of 23 to 24 December 2026: Soest closes early",
                  "**What changed.** Soest closes at 14:00 on Thursday 24 December, as § 4 (1) no. 2 LÖG NRW allows on 24 December when it is a working day (federal background: § 3 LadSchlG). Its truck left at {{wms.SOE.cutoff}}, ahead of Essen's at {{wms.ESS.cutoff}}.",
                  "**Feasibility.** With the earliest truck first, Soest went to the front of both stations. At 22:00 its last unit was due by {{proj.SOE.by}}, {{proj.SOE.slack}}; the tightest other store, {{proj.tightest}}, kept {{proj.tightest_slack}}. No store slipped, so no options were needed.",
                  TONIGHT,
                  "**Physical AI at work.** " + JAR,
                  WORTH,
                  HOW + " Soest's earlier truck is an assumption of the scenario.",
                  FOOTER
                )
              }
            },
            CLOSE
          ]
        }
      ]
    },

    // ---- Scenario 6: peak week, +40 % volume, no extra staff ---------------------------------------------
    "SC6-PEAK": {
      source: "authored",
      scenario: "SC6-PEAK",
      world_version: "1.1.0",
      wakes: [
        {
          kinds: ["night_start", "cutoff_risk"],
          steps: [
            { say: "22:00, peak week: the orders are larger and the shift has its usual staff. I read tonight's orders and the plan." },
            { tools: [{ tool: "wms_get_night" }, { tool: "sim_plan_night" }, { tool: "sim_project" }] },
            { say: "Tonight: {{plan.units}} units for {{wms.orders}} stores, a {{wms.volume}}. The plan needs {{plan.cell_h}} of cell time and {{plan.labour_h}} of labour, against {{plan.by_hand_h}} by hand.\n\nCheck: the robot cannot finish everything before the early trucks. {{risk.late_names}} would miss theirs, {{proj.HAM.slack}} and {{proj.SOE.slack}}, and {{risk.band_list}} make theirs with less than {{risk.band_minutes}} to spare.\n\nHypothesis: people can take part of the robot's work. I price three options against doing nothing, each in 20 simulated versions of tonight." },
            { tool: "sim_cost_options", ref: "options" },
            { say: "Finding: doing nothing, Hamm misses its truck in {{nothing.late.HAM}} simulated nights and Soest in {{nothing.late.SOE}}. At {{options.late_cost}} per late store order, that is {{nothing.total}} on average.\n\nRecommendation: option A, a picker called in from 01:00 for Hamm's and Soest's units. It costs {{A.total}} with {{A.trucks}}, against {{nothing.total}} for doing nothing. Option B buys more margin for {{B.total}}; option C moves Soest to tomorrow for {{C.total}}." },
            {
              propose: {
                input: {
                  options: [
                    { variant_id: "A", title: "Call in a picker for Hamm and Soest", description: "A second picker joins the manual station from 01:00 for the call-in minimum; Hamm's and Soest's units leave the robot for the manual station from now.", residual_risk: "The tightest truck keeps {{A.slack}}; the call-in is billed for its minimum." },
                    { variant_id: "B", title: "Call in a picker for Iserlohn, Hamm and Soest", description: "As option A, with Iserlohn's units at the manual station as well, for more margin at the 02:40 trucks.", residual_risk: "More manual picks than option A; the call-in is billed for its minimum." },
                    { variant_id: "C", title: "Move Soest to tomorrow's wave", description: "Soest's order leaves tonight's work and goes with tomorrow's wave; nobody is called in.", residual_risk: "Soest gets no delivery tonight, and the robot still cannot finish Hamm in time." }
                  ],
                  recommended_variant_id: "A",
                  baseline_description: "The plan stays as it is: Hamm misses its truck in {{nothing.late.HAM}} simulated nights and Soest in {{nothing.late.SOE}}."
                },
                rejected: {
                  A: "Understood: no call-in for Hamm and Soest alone. Your decision on the other options or on doing nothing, please.",
                  B: "Understood: not with Iserlohn as well. Your decision on the other options or on doing nothing, please.",
                  C: "Understood: Soest stays in tonight's work. Your decision on the other options or on doing nothing, please."
                },
                approved: {
                  A: [
                    { tool: "wms_apply_option", input: { option_id: "A" } },
                    { say: "Option A applies from {{applied.from}}: Hamm's and Soest's units go to the manual station, and a second picker joins it from 01:00. I draft the call-in for the on-call pool." },
                    { tool: "ui_draft_action", input: { type: "call_in", recipient: "On-call picker pool, Ruhrkorb DC Unna", subject: "Call-in tonight from 01:00: one picker, manual station", body: `Hello,\n\nRuhrkorb DC Unna needs one picker at the manual station tonight, starting at 01:00, for the call-in minimum of {{options.call_in_min}}. Peak week: Hamm's and Soest's orders need hands at the manual station. Please report to the shift lead at the repack cell.\n\n${SIGN}` } },
                    { tool: "ui_await_approvals" },
                    draftsDone("The night goes on with option A."),
                    { tool: "sim_advance" }
                  ],
                  B: [
                    { tool: "wms_apply_option", input: { option_id: "B" } },
                    { say: "Option B applies from {{applied.from}}: Iserlohn's, Hamm's and Soest's units go to the manual station, and a second picker joins it from 01:00. I draft the call-in for the on-call pool." },
                    { tool: "ui_draft_action", input: { type: "call_in", recipient: "On-call picker pool, Ruhrkorb DC Unna", subject: "Call-in tonight from 01:00: one picker, manual station", body: `Hello,\n\nRuhrkorb DC Unna needs one picker at the manual station tonight, starting at 01:00, for the call-in minimum of {{options.call_in_min}}. Peak week: Iserlohn's, Hamm's and Soest's orders need hands at the manual station. Please report to the shift lead at the repack cell.\n\n${SIGN}` } },
                    { tool: "ui_await_approvals" },
                    draftsDone("The night goes on with option B."),
                    { tool: "sim_advance" }
                  ],
                  C: [
                    { tool: "wms_apply_option", input: { option_id: "C" } },
                    { say: "Option C applies from {{applied.from}}: Soest's order moves to tomorrow's wave. I draft a note to the Soest store and one to the carrier." },
                    { tool: "ui_draft_action", input: { type: "email", recipient: "Ruhrkorb Soest, store manager", subject: "Your order moves to tomorrow's delivery", body: `Dear store manager,\n\nthis is a peak night, and the repack cell cannot finish every order before the early trucks. Your order for tonight moves to tomorrow's wave and comes with tomorrow's delivery.\n\n${SIGN}` } },
                    { tool: "ui_draft_action", input: { type: "email", recipient: "Carrier dispatch, Soest route", subject: "Soest: no load on tonight's truck", body: `Hello,\n\nSoest's order leaves tonight's wave and travels with tomorrow's. Tonight's truck to Soest has no load from us.\n\n${SIGN}` } },
                    { tool: "ui_await_approvals" },
                    draftsDone("The night goes on with option C."),
                    { tool: "sim_advance" }
                  ],
                  baseline: [
                    { say: "You chose to do nothing: the plan stays as it is. Nothing goes to a store, the carrier or the picker pool. I record the decision for the shift handover." },
                    handoverMemo("Peak night: plan kept", "At 22:00 the peak night's projection put Hamm and Soest after their trucks. Three options were priced against doing nothing; the shift lead kept the plan. Expected: Hamm late in {{nothing.late.HAM}} simulated nights and Soest in {{nothing.late.SOE}}, {{nothing.total}} at {{options.late_cost}} per late store order."),
                    { tool: "ui_await_approvals" },
                    { say: "The memo is decided: {{drafts.approved}} approved, {{drafts.rejected}} rejected. Nothing was sent. The night goes on with the plan as it was." },
                    { tool: "sim_advance" }
                  ]
                }
              }
            }
          ]
        },
        jarCorrection(),
        {
          kinds: ["night_end"],
          steps: [
            NIGHT_END_READS,
            { say: NIGHT_OVER },
            {
              tool: "ui_final_report",
              input: {
                outcome: { $by_decision: { baseline: "baseline_accepted", default: "option_decided" } },
                markdown: {
                  $by_decision: Object.fromEntries([["A", "option A: one picker called in from 01:00 for the call-in minimum of {{options.call_in_min}}, Hamm's and Soest's units to the manual station"], ["B", "option B: one picker called in from 01:00 for the call-in minimum of {{options.call_in_min}}, Iserlohn's, Hamm's and Soest's units to the manual station"], ["C", "option C: Soest's order moved to tomorrow's wave"], ["baseline", "to keep the plan as it was"]].map(([id, what]) => [id, md(
                    "## Ruhrkorb DC Unna, peak night: {{plan.units}} units with the usual staff",
                    "**What happened.** The peak night's plan needs {{plan.cell_h}} of cell time and {{plan.labour_h}} of labour, against {{plan.by_hand_h}} by hand. The robot could not finish everything before the early trucks: at 22:00 Hamm and Soest would have missed theirs ({{proj.HAM.slack}} and {{proj.SOE.slack}}). Doing nothing: Hamm late in {{nothing.late.HAM}} simulated nights and Soest in {{nothing.late.SOE}}, {{nothing.total}} on average at {{options.late_cost}} per late store order.",
                    `**What we decided.** ${id === "baseline" ? "You chose" : "You approved"} ${what}.`,
                    versus(id === "baseline" ? "A" : id, id === "baseline" ? "Option A (recommended)" : `Option ${id}`),
                    TONIGHT,
                    "**Physical AI at work.** " + JAR,
                    "**Actions.** {{drafts.approved}} of {{drafts.total}} drafts approved, {{drafts.rejected}} rejected. Nothing was sent.",
                    WORTH,
                    HOW_OPTIONS + " The +40 % peak volume is a stress-test assumption.",
                    FOOTER
                  )]))
                }
              }
            },
            CLOSE
          ]
        }
      ]
    }
  };
})();
