# RT Pay — your paycheck auditor

**Know what the check should say — before it lands.**

A local-first PWA that checks a hospital paycheck line by line. Built for a
Registered Respiratory Therapist at M Health Fairview (biweekly pay, Kronos
timekeeping), born from a real dispute where a 16-hour bonus was paid at 10
of 15 units — $250 short — and nobody caught it for weeks.

Live app: **https://omarfx8181-beep.github.io/rt-pay-auditor/** (installable
on iPhone/iPad — Share → Add to Home Screen).

## What it does

- **Home — "This Check."** Expected take-home for the period as a status
  hero card, with a Take-home / Before-taxes toggle and a status pill.
- **Check my paycheck.** Snap a photo of the stub (or type it) and get the
  verdict: green *"Your check is right ✓"*, red *"You're owed $X"* with the
  shortfall in plain words and bonus units, or amber *"Needs a look"* with
  one guided question.
- **One-tap HR email.** A red verdict writes the correction email for you —
  period dates, expected/paid/short per line, the per-shift bonus table,
  the identical-shift comparison, and the payroll codes HR needs — and
  opens it in Mail.
- **Shifts.** Friendly cards edited in a bottom sheet; pull shifts from a
  ScheduleAnywhere calendar feed, an .ics file, or schedule screenshots.
- **What-if.** What one more shift actually puts in your account, with
  overtime rules applied to the marginal hours.
- **Me.** Pay rules in human rows; every tax/retirement/pretax field lives
  behind a collapsed Advanced section, pre-filled from a real stub. Periods,
  year totals, bulk stub import, other income, and JSON backup live here too.

## Privacy

No backend, no accounts, no telemetry. Everything lives in the browser
(IndexedDB) with JSON export/import for backups. The only network calls are
the optional scans (schedule screenshots, stub photos), which go straight
from the browser to the Anthropic API using **your own key**, entered in
Me → Schedule scan and stored on-device only.

## Engine

All money math runs in integer cents (`src/lib/engine.ts`), ported from a
v1 artifact that reconciled a real stub to $0.02: OT after 80 straight
hours/period at a blended rate, daily double time after 12, weekend/evening
differentials, charge/premium/preceptor adders, the code-548 critical-shift
bonus in units, and net-pay math (FICA wage base, MN Paid Leave, calibrated
effective withholding). Pay rules are **preset data**, not code
(`src/lib/presets.ts` — Facility Profile + Role, versioned).

The golden acceptance tests in `SPEC.md` §3 are law: never change engine
math without them green (see `CLAUDE.md`).

## Development

```
npm run dev       # Vite dev server
npm run test      # Vitest (engine golden tests + verdict/preset/scan suites)
npm run test:e2e  # Playwright flows over the production build (API route-mocked)
npm run build     # tsc + production build (VITE_BASE=/rt-pay-auditor/ for Pages)
```

E2E note: set `PW_CHROMIUM=/path/to/chromium` to reuse a preinstalled
browser instead of downloading one; CI installs Chromium itself and a
failed flow blocks the deploy.

Vite + React 19 + TypeScript + Tailwind v4 + Framer Motion + Dexie.
Deploys to GitHub Pages from `main` via `.github/workflows/pages.yml`.
Design system: Knockdown palette (see `design/tokens.md`) on the V3
structure specified in `design/V3_DESIGN_BRIEF.md`.
