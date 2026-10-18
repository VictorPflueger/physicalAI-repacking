/*
 * REPACK PILOT — the six demo scenarios (build brief, "The six demo scenarios"; PLAN.md §f).
 *
 * Six scenarios cover the three ways reality deviates in a repacking cell: the order book changes,
 * the item differs from its master data, or the robot degrades. Each scenario holds what the control
 * bar and the run header show, and its night for the simulation (js/nightsim.js):
 *   volume     "n1" (3,000 units) or "n2" (4,200, the peak night)
 *   seed       the night's seed: every grasp outcome and reading is a hash of it (js/rng.js)
 *   express    an express order: arrival, store, units, the truck it is due on, and its mix ("chilled":
 *              the flagship's chilled lines only; default its whole mix) (Assumption, PLAN.md B2; D32)
 *   unsafe     units the camera finds unsafe to grip (fixed here, not left to chance)
 *   unknown    an item whose barcode the item master does not know: units, when the camera sees it
 *   wear       gripper wear: from when, and the success rate it falls to (Assumption)
 *   cutoffs    truck cut-offs that differ from the world's on this night (Assumption)
 * Every scenario carries the world's glass jar, whose master data hold 200 g (scenario 2).
 *
 * Scenario 3's barcode is a real product in Open Food Facts (PLAN.md decision 4); everything else in
 * these scenarios is Synthetic.
 *
 * Loaded as a classic script so the app works without any same-origin fetch.
 */
window.SCENARIOS = [
  {
    id: "SC1-EXPRESS", number: 1, main_run: true,
    title: "Express order for the flagship store at 02:00",
    short: "Express order at 02:00",
    category: "The order book changes",
    trigger: "A chilled express top-up of 400 units for the Dortmund flagship lands at 02:00 for its next truck at 02:45 and puts two smaller stores' cut-offs at risk.",
    night: {
      volume: "n1", seed: 7,
      // Tuned in M3 (PLAN.md §c.7, TECH_NOTES D32): a chilled top-up competes with Hamm and Soest for the
      // manual station, so re-sequencing them first puts the express order's own truck at risk.
      express: { at: "02:00", store: "DOR", units: 400, due: "02:45", mix: "chilled" },
      unsafe: [
        { unit: "BOC:S08:2", grasp_confidence: 0.62, reason: "Olive oil bottle lying on its side" },
        { unit: "BOC:S04:0", grasp_confidence: 0.71, reason: "Passata bottle with a chipped neck" }
      ]
    },
    ends_in: "options",
    basis: "Detecon, Two AI Worlds, One Robot, p. 9: priorities shift \"the moment an express order comes in\""
  },
  {
    id: "SC2-GLASS", number: 2,
    title: "Glassware heavier than master data",
    short: "Glass jar heavier than master data",
    category: "The item differs from its master data",
    trigger: "The scale reads 400 g for a glass jar of apricot jam whose master data list 200 g, the net content on its label.",
    night: { volume: "n1", seed: 7 },
    ends_in: "correction",
    basis: "Detecon, Two AI Worlds, One Robot, p. 7: the cup that weighs 400 g instead of the stored 200 g"
  },
  {
    id: "SC3-UNKNOWN", number: 3,
    title: "Unknown SKU on the pallet",
    short: "Unknown SKU",
    category: "The item differs from its master data",
    trigger: "The camera reads a barcode that is not in the item master.",
    barcode: "4037848020859",
    night: { volume: "n1", seed: 7, unknown: { barcode: "4037848020859", units: 6, at: "23:10" } },
    ends_in: "escalation",
    basis: "Amazon's Pick robot rejected 19.4% of pick requests in a trial (REGISTER); Vulcan asks a person to tag in (VULCAN)"
  },
  {
    id: "SC4-WEAR", number: 4,
    title: "Gripper wear",
    short: "Gripper wear",
    category: "The robot degrades",
    trigger: "Rolling grasp success falls from 91 % to 70 %.",
    night: { volume: "n1", seed: 7, wear: { from: "23:30", success: 0.70 } },
    ends_in: "options",
    basis: "Stress test; the 70 % is an assumption"
  },
  {
    id: "SC5-EARLY", number: 5,
    title: "Store closes early before a holiday",
    short: "Early closing on 24 Dec",
    category: "The order book changes",
    trigger: "Soest closes at 14:00 on Thursday 24 December 2026 and needs its goods earlier.",
    night_start_date: "2026-12-23",
    night: { volume: "n1", seed: 7, cutoffs: { SOE: "01:30" } },
    ends_in: "options",
    basis: "§ 4 (1) no. 2 LÖG NRW: shops in North Rhine-Westphalia may open until 14:00 on 24 December when it is a working day (LOEG_NRW); federal background § 3 LadSchlG (LADSCHLG)"
  },
  {
    id: "SC6-PEAK", number: 6,
    title: "Peak week, +40% volume, no extra staff",
    short: "Peak week +40 %",
    category: "The order book changes",
    trigger: "Tonight's volume rises from 3,000 to 4,200 units, with no extra staff.",
    night: { volume: "n2", seed: 7 },
    ends_in: "options",
    basis: "Stress test; Detecon, Two AI Worlds, One Robot, p. 10: peaks should not \"immediately\" require extra staff"
  }
];
