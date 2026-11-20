# Vici, copied into this prototype

These files come unchanged from Vici, Victor Pflüger's design system
(<https://victorpflueger.github.io/ViciDesign/index.html>), from its main branch at commit **`929e08d`**
(20 November 2026), on the way to Vici 2.0. That commit brings the How it works guide (`vc-guide`)
and the 2.0 byline this showcase uses; its files still call themselves 1.0.0 until 2.0 is released.
The prototype loads them from here rather than from a CDN, so every page is served from this site alone.

| File here | What it is |
|---|---|
| `dist/vici.min.css` | Vici's stylesheet: tokens, light and dark theme, components, icons |
| `dist/vici.js` | Vici's small script: theme toggle, tooltips, the How it works guide and the behaviours of its components |
| `dist/tokens.json` | Vici's token values, light and dark, for scripts and tests |
| `assets/fonts/*.woff2` | Bricolage Grotesque, Inter, JetBrains Mono and Vici Mask, as the stylesheet expects them |
| `assets/fonts/OFL-*.txt` | The SIL Open Font License of each font family |
| `assets/marks/linkedin.png` | LinkedIn's [in] logo, as LinkedIn publishes it |
| `assets/marks/README.md` | Where the marks come from and how they may be used (it also names marks this copy leaves out) |
| `assets/brand/portrait-96.jpg` | Victor's portrait, 96 × 96 px, for the byline |
| `LICENSE` | Vici's licence |

Keep the folder structure: the stylesheet finds the fonts at `../assets/fonts/`. Never edit these
files; a fix belongs in Vici, and comes here with its next release. `tests/files.mjs` compares every
file with ViciDesign at the commit above.

**Licence.** `LICENSE` covers all of it: Vici's code and its Vici Mask font are MIT-licensed;
Bricolage Grotesque, Inter and JetBrains Mono are under the SIL Open Font License; Victor Pflüger's
name, portrait and logo are reserved for his own use; LinkedIn's logo belongs to LinkedIn.

**Updating.** When Vici 2.0 is tagged, copy the same files from that release (from its `dist/` and
`assets/` folders, and `LICENSE`) over these, change the commit above and in the GitHub Actions
workflow, then run the tests and look at the page in light and dark.
