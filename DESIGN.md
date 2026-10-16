# Repack Pilot — design system

How Repack Pilot looks, why it looks that way, and how to change it without breaking it. Version 0.1.0 (milestone M1, the shell), 16 October 2026.

Repack Pilot shares its design system with its sister prototypes **Rebate Hunter** (7.1.0) and the **Navigator** (1.1.0): the same burgundy source colour, the same generated palette value for value, the same type, components, colour grammar and agentic patterns. The logo, the names and the domain words differ, and so does the centrepiece: where the Navigator shows a map and Rebate Hunter a rebate board, Repack Pilot shows a **cell board**: the inbound pallet, the simulated robot cell with its camera, scale and gripper, the manual station and twelve store totes against their truck cut-offs. The board arrives with M2; in M1 its panel shows the night it will draw (§7).

---

## 1. The brief

- **Burgundy at the centre.** White paper, burgundy for identity, mostly pastel colours (stakeholder direction for the Navigator, 12 October 2026, kept by Rebate Hunter and here).
- **Legible in 60 seconds.** A partner who has never seen the tool should get the point from across a room, on a 1080p projector, often in a lit room: *the robot handles most of the pallet, people handle the rest, these stores make their trucks, and this is what every 1,000 units cost in labour.*
- **Agentic and physical.** An AI agent plans and a simulated cell acts on screen. At every moment the viewer must be able to tell who is acting (the agent, the cell or the person who has to decide) and what is simulated.

## 2. Methods, and what each one decided

| Method | Source | What it decided |
|---|---|---|
| Perceptual colour in OKLCH | CSS Color 4; Evil Martians, *OKLCH in CSS* | One generator builds every colour from the brand burgundy. Equal OKLCH lightness means equal visual weight, so tints of different hues line up |
| Functional 12-step scales | Radix Colors, *Understanding the scale* | Each step has one job: 1–2 backgrounds, 3–5 component backgrounds, 6–8 borders, 9–10 solids, 11–12 text |
| Hue harmonisation | Material Color Utilities, `Blend.harmonize` | Supporting hues (the goods' slate, blue, violet) turn towards burgundy by half the distance, at most 15° |
| Colour-blind-safe state hues | Okabe & Ito, *Color Universal Design*; Machado, Oliveira & Fernandes (2009) | The red, amber and green of the night's states are fixed hues, and the build fails if they come too close under simulated colour blindness |
| Design tokens | W3C Design Tokens Format Module 2025.10 | The palette ships as `design/tokens.json` (OKLCH, with hex fallbacks) next to the CSS custom properties |
| Accessibility | WCAG 2.2 | Contrast duties for every pairing, focus ring, target size, no meaning by colour alone |
| Agentic UX patterns | Yocco, *Designing For Agentic AI*, Smashing Magazine, Feb 2026 | The progress rail (intent preview), the autonomy dial, the handover to the person, the audit trail |
| AI labelling | IBM Carbon for AI; Pickering, *Tooltips & Toggletips* | An **AI** label on the options, drafts and summary the agent wrote, with a short explanation one click away (M3) |
| Emphasis | Google, *Expressive Design: Google's UX Research* (Material 3 Expressive) | One emphasised action per moment: colour, size and containment go to the step that needs the person |
| Projection | VUMC Edge for Scholars, *Optimizing Colors for Projected Presentations* | Pastels never carry meaning alone; every pastel fill has a deeper stroke or text step |
| Dashboard patterns | Bach et al., *Dashboard Design Patterns* (2022) | Each KPI tile pairs one value with a line of context; the KPI board keeps Plan (engine) and Tonight (simulation) in labelled columns (M2) |

## 3. Colour grammar

Each colour means one thing, everywhere.

| Colour | Means | Where you see it | Never used for |
|---|---|---|---|
| **Burgundy** | Identity, and **the person in charge** | Primary buttons; every Approve button; the progress step that waits for you (*Your decision*, *Your approval*); the recommended option's frame; the focus ring; the logo | The state of a store order or the cell |
| **Red, amber, green** | **The night's states**: a store order late (or a grasp failed), at risk, on time (or a pick landed) | The store totes and their cut-offs, KPI tints, status chips, the cost bars (from M2) | Decoration, and buttons other than the two destructive ones |
| **Blue** | Readings and checks, and the money an option spends | Camera and scale readings, grasp rehearsal, *Check* steps in the console, Diagnostics while a test runs, links to sources, the extra-labour bar | |
| **Violet** | **The AI's voice** | AI labels, hypotheses and revisions, the reasoning summaries, the streaming cursor, model calls in the audit, the AI disclosure icon | Anything a person decided |
| **Slate** | **Goods at rest** | Items on the pallet, filled units in a tote, the board's canvas | |
| **Ink** | Everything else: the agent's work | Text, tool calls, separators, neutral controls, guardrail notes, and the **"Simulated cell"** tag | |
| **Hazard yellow and black** | **Scripted replay** | The SIMULATION badge, tape and watermark (M3). Deliberately outside the palette, so a replay can never pass for a live run | The cell itself |

On stage, in one sentence: *"Burgundy is you, violet is the AI, red, amber and green are the store orders against their trucks."*

**Two honesty marks, two different jobs.** The cell is simulated in both modes, so its tag is neutral ink on paper with a strong border (`.sim-cell-tag`), in the panel's top right corner whatever the mode. The hazard-style SIMULATION badge is reserved for scripted replays, as in the reference prototypes (build brief, "Honesty rules"). Generated data carries a dashed **Synthetic** chip in muted ink (`.chip[data-tone="synthetic"]`).

Every status colour comes with a second cue (WCAG 1.4.1): a word (*Late*, *At risk*, *On time*), an icon, a larger marker or a heavier line. The danger red appears on two buttons only, **Abort** and **Forget key**, because they stop or delete something.

## 4. How the palette is made

`tools/palette.mjs` generates every colour from one input, `SOURCE = "#7a1e3a"`, which is `oklch(0.394 0.127 7.1)`. It is Rebate Hunter's generator with the same source; the 96 token values in `css/tokens.css` are identical to Rebate Hunter's (compared file to file on 16 Oct 2026; only the header comment differs).

1. **Ladder.** Steps 1–8 share one lightness ladder across all families (L 0.993 → 0.772), so a tint of red and a tint of blue at the same step weigh the same. Steps 9–12 are set per family, so that solids and text meet their contrast duties.
2. **Tints.** Chroma grows with the step. Burgundy tints use 75 % of the usual chroma, so the pale steps read as rosewood, not candy pink.
3. **Ink.** The neutrals carry the burgundy hue at very low chroma, so every grey on the page belongs to the brand. Shadows are tinted with the darkest burgundy, never black.
4. **Harmonisation.** Where colour is atmosphere, hues turn towards burgundy by Material's rule (half the hue distance, at most 15°, applied to OKLCH hue): slate and blue move from 250° to 265°, violet from 295° to 310°.
5. **Fixed state hues.** Where colour is meaning, hues are fixed: danger 29°, warning 57°, success 170°. Red is deeper than amber and the green leans blue (the "bluish green" of Okabe and Ito), so the three differ in lightness and on the blue–yellow axis, which red–green colour blindness preserves. Red also stays clear of burgundy.
6. **Gamut.** Colours outside sRGB are brought in by lowering chroma only; lightness and hue stay.

| Family | Hue | Role in Repack Pilot |
|---|---|---|
| `wine` | 7.1° (source) | Brand, actions, the person's decisions |
| `ink` | 7.1°, very low chroma | Text, surfaces, borders, the Simulated cell tag |
| `slate` | 265° (harmonised) | Goods at rest; the board's canvas |
| `danger` | 29° (fixed) | Late or failed; destructive actions |
| `warning` | 57° (fixed) | At risk |
| `success` | 170° (fixed) | On time, picked, approved, confirmed |
| `info` | 265° (harmonised) | Readings and checks; extra labour an option spends |
| `violet` | 310° (harmonised) | The AI's voice |

**Outputs.** `css/tokens.css` holds the primitives (`--wine-1` … `--violet-12`) as hex, each with its OKLCH value in a comment. `design/tokens.json` holds the same primitives in the W3C Design Tokens Format 2025.10 plus the role aliases. Both files are generated: never edit them by hand.

**Roles.** `css/style.css` maps primitives to roles and contains no colour values of its own, apart from white and the simulation colours. Components use roles: `--brand`, `--text-muted`, `--line`, `--border-control`, `--violet-text` and so on. The night's states have their own roles, read by the cell board: `--late`, `--at-risk`, `--on-time` with their `-fill` variants, `--goods` for goods at rest and `--canvas` for the board's background.

**Type.** Barlow for the interface, Barlow Semi Condensed for figures and headings, IBM Plex Mono for tool names and ids; all self-hosted (`fonts/`, SIL Open Font License 1.1).

## 5. The checks

`node tools/palette.mjs --check` runs 45 checks and fails the build if any fails. It is the first suite in `node tests/run-all.mjs`. Figures from the run of 16 Oct 2026:

**Contrast (WCAG 2.2), 32 pairings.** Body text 15.85:1 on paper (AAA, needs 7). Muted and faint text 6.89:1 and 4.99:1 on paper (needs 4.5). White on burgundy 10.12:1. Burgundy text 8.23:1. Input and toggle borders 4.00:1, and every state stroke and icon on paper: danger 5.69, warning 3.32, success 3.62, blue 4.36, violet 5.00, slate 5.52 (WCAG 1.4.11, needs 3). Each family's text step is also checked on its own tint. The late stroke on its board fill reaches 3.95:1.

**Burgundy vs danger, 2 checks.** Hue gap 21.89° (needs 18°), lightness gap 0.14 (needs 0.12).

**Colour-blind separation, 9 pairs.** Each pair is simulated for normal vision, protanopia, deuteranopia and tritanopia with the Machado et al. (2009) matrices at full severity, applied in linear RGB. The smallest OKLab distance must be at least 0.10, five times the 0.02 just-noticeable difference that CSS Color 4 uses for gamut mapping.

| Pair | Smallest ΔEOK | Worst case |
|---|---|---|
| Late vs at risk | 0.120 | deuteranopia |
| Late vs on time | 0.111 | deuteranopia |
| At risk vs on time | 0.104 | protanopia |
| Late vs goods at rest (slate) | 0.156 | protanopia |
| At risk vs goods at rest | 0.188 | protanopia |
| On time vs goods at rest | 0.113 | deuteranopia |
| Cost bars: extra labour (blue) vs cost of late orders (amber) | 0.237 | protanopia |
| Cost bars: extra labour vs doing nothing (red) | 0.228 | deuteranopia |
| Burgundy (your decision) vs danger (late) | 0.130 | protanopia |

**Token files, 2 checks.** `css/tokens.css` and `design/tokens.json` must match what the generator produces now.

**Contrast in the running page.** The palette check tests primitives; `tests/smoke.mjs` (case `contrast`) measures every visible text element of the running page against its real background, at 1920×1080 and 1280×720, in eleven states: the intro, the idle workspace, Diagnostics, the five drawer tabs, the mode choice, the key dialog with its message, and the notice with its banner. Normal text needs 4.5:1 and large text 3:1; inactive controls have no duty (WCAG 1.4.3). On 16 Oct 2026 no text fell short.

**A gap the palette shares with its sisters.** Rebate Hunter's review (REVIEW.md, W9) found that the checker takes the app background to be `ink-2`, while the page paints it `ink-3` (porcelain), and that faint text on porcelain measures 4.44:1, below 4.5. The same holds here, because the palettes are identical. No M1 screen puts faint text on porcelain, and the `contrast` case uses exactly that pair as its control: the test must catch it, or it fails. The fix belongs in all three prototypes together, so their palettes stay identical; until then new components keep faint text off porcelain, and the `contrast` case guards it.

## 6. Agentic patterns

Yocco's six patterns for agentic AI, and where each one lives:

| Pattern | In Repack Pilot |
|---|---|
| Intent preview | The **progress rail** shows the agent's plan in five steps before a run starts (Perceive, Plan, Pick, Replan, Prepare), and the intro window explains them. In place from M1 |
| Autonomy dial | Advise, Approve (default) and Bounded. Bounded stays locked until the shadow-mode gate is met; the dial names the criteria it fails (M4; the gate logic and the synthetic record are in M1, `js/autonomy.js`) |
| Explainable rationale | The world-model panel's expected against observed, the corrections log, the reasoning summaries, the AI label's explanation, and **Guardrail** notes when the code refuses a step (M2, M3) |
| Confidence signal | Camera and grasp confidence on each detection; a world-model entry from Open Food Facts marked *unverified* until a person confirms it (M2, M3) |
| Action audit and undo | The Audit tab and its JSON export (from M1). Undo is not needed: nothing leaves the outbox |
| Escalation pathway | Rules in code hand an item or a decision to a person with a one-line reason: an unknown barcode, a fragile item with low grasp confidence, falling grasp success, a store close to its cut-off (M3) |

**Progress rail** (`js/progress.js`). Five steps, the same as the intro. Ink while the agent works, with a pulse on the current step. Burgundy with *Your decision*, *Your approval* or *Your confirmation* when the run waits for a person. A tick when done, a stop mark where a run ended early, a dashed circle for steps a run did not need. It never moves backwards when the agent revisits an earlier phase. It is an ordered list, the current step carries `aria-current="step"`, and each step's state is spelled out for screen readers. The intro numbers the same five steps in the colours the app uses for those moments: blue for readings and checks, ink for the agent's planning, green for picks that land, amber for a night at risk, burgundy for your decision.

**Handover** (`js/handover.js`). The run state *awaiting approval* covers three moments, so the status pill, the console's phase line and the rail all name the human step the same way: **Awaiting your decision** while the options wait, **Awaiting your approval** while the drafts wait, and **Awaiting your confirmation** while an escalated item waits.

## 7. The cell panel

**In M1.** The panel keeps the board's frame: a caption at top left (*Ruhrkorb DC Unna* and tonight's scenario), the **Simulated cell** tag at top right, and in the middle a card with the night the board will draw: the flow from pallet to truck, the stores with their cut-offs, tonight's units, the two inbound waves and the two stations, all from the synthetic world, with the Synthetic chip. The card follows the panel's height (container queries in `css/cell.css`): it drops the flow on a shorter panel, folds to its title and one summary line when the drawer is open, and to the summary line alone on the shortest panels, so it never needs to scroll and its Synthetic label stays in view. The caption, the tag and the card never overlap (`tests/smoke.mjs`, case `viewports`, at five sizes with the drawer closed and open).

**From M2.** The board itself, in SVG and built like Rebate Hunter's: the pallet, camera detections with their confidence, each grasp rehearsal and attempt, scale readings, and the totes filling against their cut-offs. Every entity is a focusable button of at least 44 px with a popover, and nothing moves under reduced motion.

## 8. Built for the room

- **Size.** The root font scales with the window, from 15 px up to about 17 px at 1920 px wide. Every HTML control is at least 40 × 40 px, well above the 24 px minimum of WCAG 2.5.8 (`tests/smoke.mjs`, case `viewports`, at five sizes with the drawer closed and open).
- **Focus.** A 2 px burgundy ring outside a 2 px white gap: 10:1 against paper, meeting WCAG 2.4.13 Focus Appearance. Dialogs trap the focus and give it back when they close.
- **Emphasis.** One emphasised action per moment: *Start agent* when idle, the recommended option's Approve when a decision waits.
- **Words.** Labels name what a person understands: *Start agent*, *Night speed*, *Your decision*, *Forget key*. The same action keeps the same name through the flow.
- **Motion.** In M1: a spinner while something loads, dialogs and console entries fading in, and the rail's pulse during a run. All of it stops under `prefers-reduced-motion` (`css/style.css`), and so will the board's motion (M2).

## 9. Testing the design

| Command | What it does |
|---|---|
| `node tools/palette.mjs --check` | The 45 colour checks above (Node.js only) |
| `node tests/smoke.mjs viewports contrast` | Five viewports from 1920×1080 to 1280×720, drawer closed and open: no overflow, one-row control bar, header badges clear of each other, the cell panel's caption, tag and card clear of each other and inside the panel, controls of at least 40 px; contrast in the running page in eleven states at two sizes |

The `layout` and `design` suites follow with the board (M2 to M5), as in Rebate Hunter: the board's states in the running app, the colour grammar of the dial and the rail, and projector-washout and colour-blind captures.

## 10. Changing things safely

**Keep the sister apps in step.** The palette and the shared shell modules are meant to stay identical to Rebate Hunter's (`PLAN.md` §a.4 lists them). Change them in all the repositories in the same way, or the prototypes drift apart.

**Change the brand colour.** Edit `SOURCE` in `tools/palette.mjs` and run `node tools/palette.mjs`. Both token files are rewritten and the checks run. If one fails, adjust that family's solid or text lightness in `FAMILIES` and run it again. Then update `favicon.svg`, the only file that cannot read the tokens; the logo in the page is drawn from the tokens.

**Add a colour.** Add a family to `FAMILIES`, give it contrast duties in `PAIRS`, and add separation pairs to `SEPARATE` if it carries meaning next to other colours. Map it to a role in `css/style.css` and use the role, not the primitive.

**Keep the grammar.**
- Burgundy only for identity and for what a person does or decides.
- Status colours only for the night's states, and always with a word, an icon or a shape.
- Violet only for what the AI wrote or thinks. New AI-written content gets an AI label.
- Hazard yellow only for scripted replays; the cell's own tag stays neutral ink.
- No new hex values in components: use a role.
- New interactive elements are at least 40 × 40 px (44 px on the board) and use the shared focus ring.

## Sources

- CSS Color Module Level 4, gamut mapping (JND 0.02): https://drafts.csswg.org/css-color-4/
- Evil Martians, *OKLCH in CSS: why we moved from RGB and HSL*: https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl
- Radix Colors, *Understanding the scale*: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Material Color Utilities, `Blend.harmonize`: https://api.flutter.dev/flutter/package-material_color_utilities_blend_blend/Blend/harmonize.html
- Okabe & Ito, *Color Universal Design*: https://jfly.uni-koeln.de/color/
- Machado, Oliveira & Fernandes (2009), *A physiologically-based model for simulation of color vision deficiency*, IEEE TVCG 15(6): https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
- W3C Design Tokens Format Module 2025.10: https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Victor Yocco, *Designing For Agentic AI: Practical UX Patterns For Control, Consent, And Accountability*, Smashing Magazine, 11 Feb 2026: https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/
- IBM Carbon for AI, AI label usage: https://carbondesignsystem.com/components/ai-label/usage/
- Heydon Pickering, *Tooltips & Toggletips*, Inclusive Components: https://inclusive-components.design/tooltips-toggletips/
- Google Design, *Expressive Design: Google's UX Research*: https://design.google/library/expressive-material-design-google-research
- VUMC Edge for Scholars, *Optimizing Colors for Projected Presentations*: https://edgeforscholars.vumc.org/optimizing-colors-for-projected-presentations
- Bach et al., *Dashboard Design Patterns*, IEEE VIS 2022: https://arxiv.org/abs/2205.00757
