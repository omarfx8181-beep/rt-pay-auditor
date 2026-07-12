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

## Stack
Vite + React 19 + TypeScript + Tailwind + Framer Motion (Omar's standard web stack). Vitest for engine tests. PWA: manifest + service worker, installable on iPhone/iPad.

## Commands
`npm run dev` · `npm run test` · `npm run build`

## Working style
Omar wants meticulous, step-by-step work: show the failing/passing test output, explain what changed and why, one milestone at a time. Engine before UI, always.
