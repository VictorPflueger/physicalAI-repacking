# Repack Pilot

A browser-only Physical AI showcase. Repack Pilot shows one night shift in a retail distribution centre: a simulated robot cell, planned by an AI agent, repacks a mixed pallet into 12 store orders, and a deterministic engine prices every 1,000 units in labour hours and euros, manual baseline against a hybrid cell.

**Status: Phase 0, planning.** There is no app code yet. The build plan is in [PLAN.md](PLAN.md); milestone M1 starts once Victor approves it.

What the finished prototype will be:

- **Two modes:** Simulation (a labelled scripted replay, offline, no key) and Live (Claude with the presenter's own API key, kept in session storage only). Both drive the same screen with the same events.
- **Platform:** static HTML, CSS and vanilla JavaScript modules on GitHub Pages. No backend, no build step, no runtime CDN, self-hosted fonts.
- **Data:** a synthetic world, labelled Synthetic, plus Open Food Facts product data under ODbL where used. No client data, no personal data, and no real robot vendor presented as the simulated robot.
- **Live site** (from M1): https://victorpflueger.github.io/physicalAI-repacking/

Sister prototypes: [Rebate Hunter](https://github.com/VictorPflueger/PROC-Rebate-Hunter) and the [Supply Chain Navigator](https://github.com/VictorPflueger/supply-chain-navigator).

## Author

**Victor Pflüger** · [linkedin.com/in/victorpflueger](https://www.linkedin.com/in/victorpflueger)
