/*
 * REPACK PILOT — reference inputs for the scripted replays and the tests (loaded as a classic script).
 *
 * The option variants a script prices with sim_cost_options are written once, here: the scenario's
 * script takes them by reference ({ tool: "sim_cost_options", ref: "options" }), and the engine suite
 * prices the same variants for its frozen golden option cases (tests/engine.mjs, PLAN.md §c.7), so a
 * script and its test cannot drift apart. Every figure is computed by the engine and the night
 * simulation; nothing here is a result.
 *
 * Scenario 1, at its 02:00 wake-up (the express order and the cut-off risk for Hamm and Soest):
 *   A  Re-sequence: Iserlohn, Hamm and Soest before the express order (no extra labour, a late risk
 *      for the express order).
 *   B  Call in one picker from 02:00 for the call-in minimum, with the same re-sequence.
 *   C  Move Soest to tomorrow's wave; Iserlohn and Hamm before the express order.
 *
 * Scenario 4, at the escalation E3 (23:43), after the agent has sent fragile items to the manual
 * station (a safety action):
 *   A  A maintenance stop of the cell now, 30 minutes (Assumption: the length of a gripper service).
 *   B  No stop: call in one picker from 01:00, when the chilled goods arrive, to take the failed grasps.
 *   C  A maintenance stop at 00:30, before the chilled goods, 30 minutes.
 *
 * Scenario 6, at night start (22:00, Hamm and Soest projected late on the peak night):
 *   A  Call in one picker from 01:00; Hamm's and Soest's cell units go to the manual station.
 *   B  The same with Iserlohn's cell units as well.
 *   C  Move Soest to tomorrow's wave.
 */
window.REFERENCE_CASES = {
  "SC1-EXPRESS": {
    options: {
      variants: [
        { variant_id: "A", name: "Re-sequence: Hamm and Soest first", levers: [{ type: "resequence", store_ids: ["ISE", "HAM", "SOE", "XPR"] }] },
        { variant_id: "B", name: "Call in one picker, Hamm and Soest first", levers: [{ type: "call_in_picker", start: "02:00", minutes: 180 }, { type: "resequence", store_ids: ["ISE", "HAM", "SOE", "XPR"] }] },
        { variant_id: "C", name: "Move Soest to tomorrow's wave", levers: [{ type: "move_to_next_wave", store_ids: ["SOE"] }, { type: "resequence", store_ids: ["ISE", "HAM", "XPR"] }] }
      ]
    }
  },
  "SC4-WEAR": {
    options: {
      variants: [
        { variant_id: "A", name: "Maintenance stop now, 30 minutes", levers: [{ type: "maintenance_stop", minutes: 30 }] },
        { variant_id: "B", name: "No stop: call in one picker from 01:00", levers: [{ type: "call_in_picker", start: "01:00", minutes: 180 }] },
        { variant_id: "C", name: "Maintenance stop at 00:30, 30 minutes", levers: [{ type: "maintenance_stop", start: "00:30", minutes: 30 }] }
      ]
    }
  },
  "SC6-PEAK": {
    options: {
      variants: [
        { variant_id: "A", name: "Call in a picker for Hamm and Soest", levers: [{ type: "call_in_picker", start: "01:00", minutes: 180 }, { type: "split_order", store_ids: ["HAM", "SOE"], share: 1 }] },
        { variant_id: "B", name: "Call in a picker for Iserlohn, Hamm and Soest", levers: [{ type: "call_in_picker", start: "01:00", minutes: 180 }, { type: "split_order", store_ids: ["ISE", "HAM", "SOE"], share: 1 }] },
        { variant_id: "C", name: "Move Soest to tomorrow's wave", levers: [{ type: "move_to_next_wave", store_ids: ["SOE"] }] }
      ]
    }
  }
};
