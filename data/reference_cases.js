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
  }
};
