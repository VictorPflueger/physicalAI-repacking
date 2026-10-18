/*
 * REPACK PILOT — simulation scripts (loaded as a classic script). A script is what the agent says and
 * which tools it calls at each wake-up of its scenario's night; the scripted replay (js/simulation.js)
 * plays it through the live agent's own tools (js/tools.js), so every figure on screen is computed by
 * the engine and the night simulation at playback, and every action passes the live guardrails. No
 * figure is typed: {{placeholders}} take them from the tool results of that moment (js/sim_vars.js),
 * and the script checker (js/sim_check.js) replays every decision path headless before a demo.
 *
 * Format (js/script.js): wakes[] with the kinds the night must show there and the steps; a text may be
 * a map by decision ({ B: "…", default: "…" }), and a tool input field may be { $by_decision: { … } }.
 * Scripts are written for their scenario's night at the brief's rates (TECH_NOTES D34).
 *
 * Authored for M3: scenario 1 (the main run, with scenario 2's glass jar on the way). Scenarios 2 to 6
 * follow in M4; until then Simulation plays their nights without the agent.
 */
window.SIM_RUNS = {
  "SC1-EXPRESS": {
    source: "authored",
    scenario: "SC1-EXPRESS",
    world_version: "1.1.0",
    wakes: [
      {
        kinds: ["night_start"],
        steps: [
          { say: "Night shift at Ruhrkorb DC Unna, 22:00. I read tonight's orders, the engine's plan and the projection in one go." },
          { tools: [{ tool: "wms_get_night" }, { tool: "sim_plan_night" }, { tool: "sim_project" }] },
          { say: "Tonight: {{plan.units}} units for {{wms.orders}} store orders, ambient goods on the pallet now and chilled goods from 01:00. The cell may handle {{plan.cell_units}} of them; {{plan.manual_units}} go by hand, with every grasp that fails.\n\nPlan: cut-off first, heavy items first in each tote. The engine plans {{plan.cell_h}} of cell time and {{plan.labour_h}} of labour: {{plan.hybrid_h}} · {{plan.hybrid_eur}} per 1,000 units, against {{plan.manual_h}} · {{plan.manual_eur}} by hand.\n\nCheck: {{risk.sentence}}. The first truck leaves at {{plan.first_cutoff}} for {{plan.first_store}}, the last at {{plan.last_cutoff}} for {{plan.last_store}}. I let the night run and wake when something changes." },
          { tool: "sim_advance" }
        ]
      },
      {
        kinds: ["correction"],
        steps: [
          { say: "{{wake.clock}}: the scale under the gripper read {{corr.new}} for {{corr.name}}; the world model expected {{corr.old}}. I check the item, rehearse the next grasp and look at the tote it went into." },
          { tools: [{ tool: "world_get_item", input: { sku_id: "{{corr.sku}}" } }, { tool: "cell_get_grasp_plan", input: { sku_id: "{{corr.sku}}" } }, { tool: "wms_get_order", input: { store_id: "{{corr.store_id}}" } }] },
          { say: "Revised: {{corr.sku}} weighs {{corr.old}}, as in master data → {{corr.new}}, as the scale weighs it, written back for the whole SKU.\n\nFinding: the label's {{corr.old}} is the jam; the scale lifts the glass jar as well. The next jar is rehearsed with the new weight: {{grasp.S07.grip}}, expected success {{grasp.S07.success}}, {{grasp.S07.payload}}.\n\n{{order.ESS.name}}'s {{order.ESS.tote}} was packed against the old weight. I close it at {{order.ESS.tote_kg}} and start a fresh tote, heavy items first, by the corrected weights." },
          { tool: "wms_rebalance_tote", input: { store_id: "{{corr.store_id}}", reason: "{{corr.sku}} weighs {{corr.new}}, not {{corr.old}}: start a fresh tote by the corrected weights." } },
          { tool: "sim_advance" }
        ]
      },
      {
        kinds: ["escalation"],
        steps: [
          { say: "{{wake.clock}}: escalation E2, twice, raised by the rules in code. {{esc.1.reason}}. {{esc.2.reason}}. Both bottles for {{esc.1.store}} went to a person at the manual station; the cell did not try them." },
          { tool: "cell_get_status" },
          { say: "Confirmed: the cell's rolling success stands at {{cell.rolling}} over its last 100 grasps, so the gripper is fine. Nothing else needs a person." },
          { tool: "sim_advance" }
        ]
      },
      {
        kinds: ["new_order", "cutoff_risk"],
        steps: [
          { say: "{{wake.clock}}: a new order. {{xpr.store}} wants {{xpr.units}} more units on its express truck at {{xpr.due}}, {{xpr.manual_units}} of them by hand. The warehouse system puts an express order first. I check what that does to the other trucks." },
          { tool: "sim_project" },
          { say: "Check: with the express order first, Hamm is projected {{proj.HAM.slack}} and Soest {{proj.SOE.slack}} for their {{proj.HAM.cutoff}} trucks; the express order itself has {{proj.XPR.slack}}.\n\nHypothesis: taking Hamm and Soest first could save both, but it moves the risk onto the express order. I price three options against doing nothing on 20 seeded replications of tonight." },
          { tool: "sim_cost_options", ref: "options" },
          { say: "Finding: doing nothing, Soest misses its truck in {{nothing.late.SOE}} replications and Hamm in {{nothing.late.HAM}}: an expected {{nothing.total}} at {{options.late_cost}} per late store order.\n\nOption A takes Iserlohn, Hamm and Soest before the express order: no extra labour, but the express order misses its truck in {{A.late.XPR}} replications, tonight's included. Expected {{A.total}}.\n\nOption B calls in one picker from 02:00 for the call-in minimum, with the same order: {{B.labour}} of extra labour, and {{B.late_text}} misses its truck. Expected {{B.total}}.\n\nOption C moves Soest to tomorrow's wave: Soest is late for certain, and Hamm goes before the express order. Expected {{C.total}}.\n\nRecommendation: option B. Option A costs {{A.total}} expected and option B {{B.total}}, but A trades two late stores for a late express truck at the flagship, and B is the only option with every truck on time in all {{options.replications}} replications. The call-in is the price of that certainty." },
          {
            propose: {
              input: {
                options: [
                  { variant_id: "A", title: "Re-sequence: Hamm and Soest first", description: "Iserlohn, Hamm and Soest go before the express order at the cell and the manual station. No extra labour.", residual_risk: "The express order misses its {{xpr.due}} truck in {{A.late.XPR}} replications, tonight's included." },
                  { variant_id: "B", title: "Call in one picker, Hamm and Soest first", description: "A second picker joins the manual station from 02:00 for the call-in minimum, with the same order as option A.", residual_risk: "None of the {{options.replications}} replications misses a truck; the call-in is billed for the minimum even if the work ends sooner." },
                  { variant_id: "C", title: "Move Soest to tomorrow's wave", description: "Soest's order leaves tonight's work and goes with tomorrow's wave; Iserlohn and Hamm go before the express order.", residual_risk: "Soest gets no delivery tonight: that store order is late for certain." }
                ],
                recommended_variant_id: "B",
                baseline_description: "The express order stays first: Soest misses its truck in {{nothing.late.SOE}} replications and Hamm in {{nothing.late.HAM}}."
              },
              rejected: {
                A: "Understood: no re-sequence on its own. Your decision on the other options or on doing nothing, please.",
                B: "Understood: no call-in tonight. Your decision on the other options or on doing nothing, please.",
                C: "Understood: Soest stays in tonight's work. Your decision on the other options or on doing nothing, please."
              },
              approved: {
                B: [
                  { tool: "wms_apply_option", input: { option_id: "B" } },
                  { say: "You approved option B. It applies from {{applied.from}}: a second picker at the manual station, and Iserlohn, Hamm and Soest before the express order. I draft the call-in for the on-call pool and a note to the Dortmund store." },
                  { tool: "ui_draft_action", input: { type: "call_in", recipient: "On-call picker pool, Ruhrkorb DC Unna", subject: "Call-in tonight from {{applied.from}}: one picker, manual station", body: "Hello,\n\nRuhrkorb DC Unna needs one picker at the manual station tonight, starting at {{applied.from}}, for the call-in minimum of {{options.call_in_min}}. Please report to the shift lead at the repack cell.\n\nNight shift lead, Ruhrkorb DC Unna" } },
                  { tool: "ui_draft_action", input: { type: "email", recipient: "Ruhrkorb Dortmund, store manager", subject: "Your express order tonight: on the {{xpr.due}} truck", body: "Dear store manager,\n\nyour express order of {{xpr.units}} units reached us at {{wake.clock}}. It goes on your {{xpr.due}} express truck. To keep two other stores on their trucks, we repack them first and have called in a second picker.\n\nNight shift lead, Ruhrkorb DC Unna" } },
                  { tool: "ui_await_approvals" },
                  { say: "Drafts decided: {{drafts.approved}} approved, {{drafts.rejected}} rejected. Nothing was sent; approved drafts are cleared for a person to send. The night goes on with option B." },
                  { tool: "sim_advance" }
                ],
                A: [
                  { tool: "wms_apply_option", input: { option_id: "A" } },
                  { say: "You approved option A. From {{applied.from}}, Iserlohn, Hamm and Soest go before the express order. The express order may now miss its truck, so I draft a note to the Dortmund store." },
                  { tool: "ui_draft_action", input: { type: "email", recipient: "Ruhrkorb Dortmund, store manager", subject: "Your express order tonight may miss the {{xpr.due}} truck", body: "Dear store manager,\n\nyour express order of {{xpr.units}} units reached us at {{wake.clock}}. To keep two other stores on their trucks, we repack them first, so your express order may miss its {{xpr.due}} truck. We will confirm it once the truck has left.\n\nNight shift lead, Ruhrkorb DC Unna" } },
                  { tool: "ui_await_approvals" },
                  { say: "Drafts decided: {{drafts.approved}} approved, {{drafts.rejected}} rejected. Nothing was sent. The night goes on with option A." },
                  { tool: "sim_advance" }
                ],
                C: [
                  { tool: "wms_apply_option", input: { option_id: "C" } },
                  { say: "You approved option C. From {{applied.from}}, Soest's order moves to tomorrow's wave and Hamm goes before the express order. I draft a note to the Soest store and one to the carrier." },
                  { tool: "ui_draft_action", input: { type: "email", recipient: "Ruhrkorb Soest, store manager", subject: "Your order moves to tomorrow's delivery", body: "Dear store manager,\n\nan express order for another store arrived at {{wake.clock}}. To keep the other trucks on time, your order for tonight moves to tomorrow's wave and comes with tomorrow's delivery.\n\nNight shift lead, Ruhrkorb DC Unna" } },
                  { tool: "ui_draft_action", input: { type: "email", recipient: "Carrier dispatch, Soest route", subject: "Soest: no load on tonight's truck", body: "Hello,\n\nSoest's order leaves tonight's wave and travels with tomorrow's. Tonight's truck to Soest has no load from us.\n\nNight shift lead, Ruhrkorb DC Unna" } },
                  { tool: "ui_await_approvals" },
                  { say: "Drafts decided: {{drafts.approved}} approved, {{drafts.rejected}} rejected. Nothing was sent. The night goes on with option C." },
                  { tool: "sim_advance" }
                ],
                baseline: [
                  { say: "You chose to do nothing: the express order stays first. Nothing goes to a store, the carrier or the picker pool. I record the decision for the shift handover." },
                  { tool: "ui_draft_action", input: { type: "memo", recipient: "Shift handover, Ruhrkorb DC Unna", subject: "Express order at {{wake.clock}}: plan kept", body: "At {{wake.clock}} an express order of {{xpr.units}} units for {{xpr.store}} arrived for its {{xpr.due}} truck. Three options were priced against doing nothing; the shift lead kept the plan. Expected: Soest late in {{nothing.late.SOE}} replications and Hamm in {{nothing.late.HAM}}, {{nothing.total}} at {{options.late_cost}} per late store order.\n\nNight shift lead, Ruhrkorb DC Unna" } },
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
          { tool: "sim_night_report" },
          {
            say: {
              B: "Night over. {{night.on_time}} orders made their trucks, the express order included. Labour came to {{night.labour_h}}, {{night.called_in_h}} of it called in: {{night.per1000_h}} · {{night.per1000_eur}} per 1,000 units, against the plan's {{night.plan_h}} · {{night.plan_eur}}. The cell ran {{night.cell_h}} at {{night.picks}} picks per cell hour.",
              A: "Night over. {{night.on_time}} orders made their trucks; late: {{night.late}}. Labour came to {{night.labour_h}}: {{night.per1000_h}} · {{night.per1000_eur}} per 1,000 units, against the plan's {{night.plan_h}} · {{night.plan_eur}}. The cell ran {{night.cell_h}} at {{night.picks}} picks per cell hour.",
              C: "Night over. {{night.on_time}} orders made their trucks; {{night.moved}} moved to tomorrow's wave. Labour came to {{night.labour_h}}: {{night.per1000_h}} · {{night.per1000_eur}} per 1,000 units, against the plan's {{night.plan_h}} · {{night.plan_eur}}. The cell ran {{night.cell_h}} at {{night.picks}} picks per cell hour.",
              baseline: "Night over. {{night.on_time}} orders made their trucks; late: {{night.late}}. Labour came to {{night.labour_h}}: {{night.per1000_h}} · {{night.per1000_eur}} per 1,000 units, against the plan's {{night.plan_h}} · {{night.plan_eur}}. The cell ran {{night.cell_h}} at {{night.picks}} picks per cell hour."
            }
          },
          {
            tool: "ui_final_report",
            input: {
              outcome: { $by_decision: { baseline: "baseline_accepted", default: "option_decided" } },
              markdown: {
                $by_decision: {
                  B: "## Ruhrkorb DC Unna, night shift: an express order at {{xpr.at}}\n\n**What happened.** At {{xpr.at}} the Dortmund flagship ordered {{xpr.units}} more units for its {{xpr.due}} express truck. With the warehouse system's default, express first, Hamm and Soest were projected to miss their {{proj.HAM.cutoff}} trucks.\n\n**If we had done nothing.** Soest late in {{nothing.late.SOE}} replications and Hamm in {{nothing.late.HAM}}: an expected {{nothing.total}} at {{options.late_cost}} per late store order.\n\n**Decision.** You approved option B: one picker called in from {{applied.from}} for the call-in minimum of {{options.call_in_min}}, with Iserlohn, Hamm and Soest before the express order.\n\n| | Do nothing | Option B |\n|---|---|---|\n| Extra labour | {{nothing.labour}} | {{B.labour}} |\n| Late store orders, expected | {{nothing.late}} | {{B.late}} |\n| Their cost | {{nothing.late_eur}} | {{B.late_eur}} |\n| Expected total | {{nothing.total}} | {{B.total}} |\n\n**Tonight.** {{night.on_time}} orders on their trucks, the express order included. Labour {{night.labour_h}} ({{night.called_in_h}} called in), {{night.per1000_h}} · {{night.per1000_eur}} per 1,000 units against the plan's {{night.plan_h}} · {{night.plan_eur}}. The cell ran {{night.cell_h}} at {{night.picks}} picks per cell hour; {{night.failures}} failed grasps went to the manual station.\n\n**Exceptions.** At {{corr.at}} the scale corrected {{corr.sku}} from {{corr.old}} to {{corr.new}} for the whole SKU, and {{rebalance.store}}'s tote was closed early. At {{esc.at}} two fragile bottles went to a person at the manual station (E2).\n\n**Actions.** {{drafts.approved}} of {{drafts.total}} drafts approved, {{drafts.rejected}} rejected. Nothing was sent.\n\n**How we know.** Every hour and euro comes from the deterministic engine and the seeded night simulation (seed {{night.seed}}, {{options.replications}} replications per option). The picking rate and the labour cost are sourced (IML, Eurostat); the cell's rates are assumptions.\n\n*Simulated run: a scripted replay on a simulated cell. Ruhrkorb, its DC, stores and items are fictional.*",
                  A: "## Ruhrkorb DC Unna, night shift: an express order at {{xpr.at}}\n\n**What happened.** At {{xpr.at}} the Dortmund flagship ordered {{xpr.units}} more units for its {{xpr.due}} express truck. With the warehouse system's default, express first, Hamm and Soest were projected to miss their {{proj.HAM.cutoff}} trucks.\n\n**If we had done nothing.** Soest late in {{nothing.late.SOE}} replications and Hamm in {{nothing.late.HAM}}: an expected {{nothing.total}} at {{options.late_cost}} per late store order.\n\n**Decision.** You approved option A: Iserlohn, Hamm and Soest before the express order, with no extra labour.\n\n| | Do nothing | Option A |\n|---|---|---|\n| Extra labour | {{nothing.labour}} | {{A.labour}} |\n| Late store orders, expected | {{nothing.late}} | {{A.late}} |\n| Their cost | {{nothing.late_eur}} | {{A.late_eur}} |\n| Expected total | {{nothing.total}} | {{A.total}} |\n\n**Tonight.** {{night.on_time}} orders on their trucks; late: {{night.late}}. Labour {{night.labour_h}}, {{night.per1000_h}} · {{night.per1000_eur}} per 1,000 units against the plan's {{night.plan_h}} · {{night.plan_eur}}. The cell ran {{night.cell_h}} at {{night.picks}} picks per cell hour; {{night.failures}} failed grasps went to the manual station.\n\n**Exceptions.** At {{corr.at}} the scale corrected {{corr.sku}} from {{corr.old}} to {{corr.new}} for the whole SKU, and {{rebalance.store}}'s tote was closed early. At {{esc.at}} two fragile bottles went to a person at the manual station (E2).\n\n**Actions.** {{drafts.approved}} of {{drafts.total}} drafts approved, {{drafts.rejected}} rejected. Nothing was sent.\n\n**How we know.** Every hour and euro comes from the deterministic engine and the seeded night simulation (seed {{night.seed}}, {{options.replications}} replications per option). The picking rate and the labour cost are sourced (IML, Eurostat); the cell's rates are assumptions.\n\n*Simulated run: a scripted replay on a simulated cell. Ruhrkorb, its DC, stores and items are fictional.*",
                  C: "## Ruhrkorb DC Unna, night shift: an express order at {{xpr.at}}\n\n**What happened.** At {{xpr.at}} the Dortmund flagship ordered {{xpr.units}} more units for its {{xpr.due}} express truck. With the warehouse system's default, express first, Hamm and Soest were projected to miss their {{proj.HAM.cutoff}} trucks.\n\n**If we had done nothing.** Soest late in {{nothing.late.SOE}} replications and Hamm in {{nothing.late.HAM}}: an expected {{nothing.total}} at {{options.late_cost}} per late store order.\n\n**Decision.** You approved option C: Soest's order moved to tomorrow's wave, Iserlohn and Hamm before the express order.\n\n| | Do nothing | Option C |\n|---|---|---|\n| Extra labour | {{nothing.labour}} | {{C.labour}} |\n| Late store orders, expected | {{nothing.late}} | {{C.late}} |\n| Their cost | {{nothing.late_eur}} | {{C.late_eur}} |\n| Expected total | {{nothing.total}} | {{C.total}} |\n\n**Tonight.** {{night.on_time}} orders on their trucks; {{night.moved}} moved to tomorrow's wave. Labour {{night.labour_h}}, {{night.per1000_h}} · {{night.per1000_eur}} per 1,000 units against the plan's {{night.plan_h}} · {{night.plan_eur}}. The cell ran {{night.cell_h}} at {{night.picks}} picks per cell hour; {{night.failures}} failed grasps went to the manual station.\n\n**Exceptions.** At {{corr.at}} the scale corrected {{corr.sku}} from {{corr.old}} to {{corr.new}} for the whole SKU, and {{rebalance.store}}'s tote was closed early. At {{esc.at}} two fragile bottles went to a person at the manual station (E2).\n\n**Actions.** {{drafts.approved}} of {{drafts.total}} drafts approved, {{drafts.rejected}} rejected. Nothing was sent.\n\n**How we know.** Every hour and euro comes from the deterministic engine and the seeded night simulation (seed {{night.seed}}, {{options.replications}} replications per option). The picking rate and the labour cost are sourced (IML, Eurostat); the cell's rates are assumptions.\n\n*Simulated run: a scripted replay on a simulated cell. Ruhrkorb, its DC, stores and items are fictional.*",
                  baseline: "## Ruhrkorb DC Unna, night shift: an express order at {{xpr.at}}\n\n**What happened.** At {{xpr.at}} the Dortmund flagship ordered {{xpr.units}} more units for its {{xpr.due}} express truck. With the warehouse system's default, express first, Hamm and Soest were projected to miss their {{proj.HAM.cutoff}} trucks.\n\n**If we had done nothing.** Soest late in {{nothing.late.SOE}} replications and Hamm in {{nothing.late.HAM}}: an expected {{nothing.total}} at {{options.late_cost}} per late store order.\n\n**Decision.** You chose to do nothing: the express order stayed first. Option B, recommended, would have called in one picker.\n\n| | Do nothing | Option B (recommended) |\n|---|---|---|\n| Extra labour | {{nothing.labour}} | {{B.labour}} |\n| Late store orders, expected | {{nothing.late}} | {{B.late}} |\n| Their cost | {{nothing.late_eur}} | {{B.late_eur}} |\n| Expected total | {{nothing.total}} | {{B.total}} |\n\n**Tonight.** {{night.on_time}} orders on their trucks; late: {{night.late}}. Labour {{night.labour_h}}, {{night.per1000_h}} · {{night.per1000_eur}} per 1,000 units against the plan's {{night.plan_h}} · {{night.plan_eur}}. The cell ran {{night.cell_h}} at {{night.picks}} picks per cell hour; {{night.failures}} failed grasps went to the manual station.\n\n**Exceptions.** At {{corr.at}} the scale corrected {{corr.sku}} from {{corr.old}} to {{corr.new}} for the whole SKU, and {{rebalance.store}}'s tote was closed early. At {{esc.at}} two fragile bottles went to a person at the manual station (E2).\n\n**Actions.** {{drafts.approved}} of {{drafts.total}} drafts approved, {{drafts.rejected}} rejected. Nothing was sent.\n\n**How we know.** Every hour and euro comes from the deterministic engine and the seeded night simulation (seed {{night.seed}}, {{options.replications}} replications per option). The picking rate and the labour cost are sourced (IML, Eurostat); the cell's rates are assumptions.\n\n*Simulated run: a scripted replay on a simulated cell. Ruhrkorb, its DC, stores and items are fictional.*"
                }
              }
            }
          },
          { say: "The management summary is in the console and ready to download. That closes the night." }
        ]
      }
    ]
  }
};
