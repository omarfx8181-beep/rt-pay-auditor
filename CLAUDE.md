# RT Pay Auditor — Claude Code project memory

## What this is
A paycheck auditor PWA for a Registered Respiratory Therapist at M Health Fairview (biweekly pay, Kronos timekeeping). Enter shifts → engine computes expected gross and net → audit against the real stub → flag shortfalls in dollars AND bonus units (code 548). Born from a real dispute where a 16-hour bonus was paid at 10 of 15 units ($250 short) and nobody caught it for weeks.

v1 lives at `reference/v1-artifact.jsx` — a working single-file React artifact whose engine reconciles a real pay stub to within $0.02. Treat it as the spec made executable.

## Hard rules
1. NEVER change engine math without the golden tests passing (SPEC.md → Acceptance tests). If a change breaks them, stop and ask Omar — do not "fix" the test.
2. All money math in integer cents internally; format to dollars only at render. (v1 uses float + round-to-2; porting to cents is part of Milestone 1.)
3. Local-first, same philosophy as Knockdown: no backend, no accounts, no telemetry, nothing leaves the device. Persistence = localStorage/IndexedDB plus JSON export/import for backups to iCloud Drive.
4. Design system = Knockdown's. Milestone 0 extracts real tokens from the Knockdown repo before any UI work — do not invent a palette.
5. The schedule-scan feature calls the Anthropic API with Omar's own key, entered in Settings and stored locally only. Never hardcode, never commit; .gitignore any env files.
6. Pay rules change (bonus tiers move week to week). Everything that can change is config, not constants.

## Current state (V3, July 2026)
V3 shipped: a presentation/IA rebuild per `design/V3_DESIGN_BRIEF.md`, with one deviation Omar chose at the M2 review gate — **colors stayed Knockdown** (terracotta/cream/espresso, `design/tokens.md` §2) on the V3 structure (3-tab IA, SF Pro/Inter single family, V3 type scale, 20px cards). Do not swap the palette again without asking.

- IA: **Home "This Check"** (period picker, status hero, Check my paycheck → verdict, breakdown, what-if) · **Shifts** (cards + bottom-sheet editor, schedule scan) · **Me** (pay rules in plain rows, Advanced disclosure for all tax config, open questions, periods/data/backup). First run shows a 4-screen onboarding (skippable; `settings.onboarding`).
- The verdict is a pure lib (`src/lib/verdict.ts`, tested): green/red/amber; only EARNINGS shortfalls make a red and sum into "you're owed" — gross/net echoes and stub tax drift never double-count. Red opens a prewritten `mailto:` (generator: `src/lib/hrEmail.ts`).
- Plain language is a hard rule in default views; payroll codes (548/308/320) appear only in breakdown *receipts* (two taps down), `techLabel`s, and the HR email. Label map: `src/lib/labels.ts`.
- Pay rules are preset DATA: `src/lib/presets.ts` (Facility Profile + Role, `presetSource`/`version`; Fairview RT is preset #1). `DEFAULT_CFG_DRAFT`/`DEFAULT_TIERS` are aliases into it; a presets test pins `draftToConfig(preset.cfgDraft) === DEFAULT_CFG`.
- Scans (all with Omar's own key, browser → API only): schedule screenshots/.ics (`scan.ts`, `ical.ts`), bulk past-stub gross/net (`stubScan.ts`), and current-stub line extraction that auto-fills the check (`stubFill.ts` — the mapper is code, tested; the model only reads). Scans self-route (`scanRouting.ts`, tested): a stub files into the period it belongs to (created if unseen, then opened), schedules split across the current + next two periods, and each stub's YTD column is kept as a per-year anchor (`ytdAnchors` setting) that Me's Year card cross-checks against `ytdThroughDate` — stub-true values outrank estimates.
- Deploy: push to `main` → `.github/workflows/pages.yml` (tests must pass) → gh-pages → https://omarfx8181-beep.github.io/rt-pay-auditor/.

## Stack
Vite + React 19 + TypeScript + Tailwind + Framer Motion (Omar's standard web stack). Vitest for engine tests. PWA: manifest + service worker, installable on iPhone/iPad.

## Commands
`npm run dev` · `npm run test` · `npm run build`

## Working style
Omar wants meticulous, step-by-step work: show the failing/passing test output, explain what changed and why, one milestone at a time. Engine before UI, always.
