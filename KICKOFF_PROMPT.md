# Kickoff prompt — paste this into Claude Code

Before pasting: replace `<KNOCKDOWN_PATH>` with the real path to the Knockdown repo on the Mac mini (e.g. `~/Developer/Knockdown`).

---

Read CLAUDE.md and SPEC.md fully before doing anything.

Then execute in this order:

1. **M0 — Design tokens.** The Knockdown repo is at `<KNOCKDOWN_PATH>`. Read its color assets, theme/design-system files, fonts, radii, and key components per SPEC §5. Produce `design/tokens.md` with the extracted palette (named hex values), type scale with web-equivalent fonts, spacing/radii, and 3–4 signature component patterns. Show me tokens.md and wait for my approval before building anything visual.

2. **M1 — Engine first.** Scaffold Vite + React 19 + TypeScript + Tailwind + Vitest. Port the engine from `reference/v1-artifact.jsx` into `src/lib/engine.ts` using integer cents internally. Write every acceptance test from SPEC §3 — including test 6, the June regression — and show me the full passing test output before writing any UI.

Rules that override everything: never alter engine math to make a test pass without asking me; local-first only; nothing leaves the device; API keys never committed.

When M0 and M1 are both done, stop and show me: tokens.md, the test run, and your plan for M2.
