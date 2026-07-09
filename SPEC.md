# RT Pay Auditor — v2 Build Spec

Owner: Omar · Target: local-first PWA styled in the Knockdown design language.
Reference implementation: `reference/v1-artifact.jsx` (engine validated against a real stub to $0.02).

---

## 1 · Product in one paragraph

Fairview pays biweekly through Kronos with a layered system: base rate, daily double-time, period overtime, four differentials/adders, and a unit-based bonus code (548) whose tiers change week to week. Errors happen and are hard to see — a real June error paid a 16-hour bonus at 10 of 15 units and took a three-email HR thread to fix. This app makes the expected paycheck computable and every stub auditable: scan the schedule to pre-fill shifts, adjust to actual punches, and on payday get a line-by-line red/green against the stub with shortfalls expressed in both dollars and 548 units — plus a one-tap HR email when something is red.

## 2 · Decoded pay system (seed config — everything editable)

| Rule | Value | Validation |
|---|---|---|
| Base rate | $52.53/hr | 80 × 52.53 = $4,202.40 = stub exact |
| Double time | hours > 12/day at 2.0× base | demo period sums to 16.60 h = stub exact |
| Overtime | remaining straight hours > 80/period at 1.5× | 112.4 − 80 − 16.6 = 15.8 h = stub exact |
| OT blended rate | FLSA regular-rate blend; observed $85.74/hr | keep as override field (blank = base × 1.5) |
| Weekend differential | $2/hr, all Sat/Sun hours, automatic | 30.70 h = stub exact |
| Evening differential | $2/hr; eligible hours NOT derivable yet (code 301 unknown) | manual period-level input until Q3 answered |
| Adders 308 Charge / 320 Premium / Preceptor | $3/hr each (preceptor unconfirmed) | 52 h and 36 h = stub exact |
| Code 548 Critical Shift Bonus | $50 per unit | 24 units = $1,200 = stub exact |
| Bonus tiers (change weekly — editable table) | ext > 4 h = 2u · 12-hr extra = 10u ($500) · 16-hr extra = 8u current / 15u old tier · transport ≤ 4 h = 1u, > 4 h = 2u | June-period math + Omar's rules |
| Meal deduction (schedule scan only) | 0.5 h off scheduled shifts > 6 h | 6:45–19:15 → 12.00 h |

Net-pay formulas (validated to the penny):
- 403(b) = 3% × cash gross, where cash gross = gross − imputed life ($1.81)
- FICA wages = gross − Section 125 pretax (medical + dental + FSA). 403(b) is NOT FICA-exempt.
- Social Security 6.2%, Medicare 1.45% of FICA wages
- MN Paid Leave EE = 0.135% family + 0.305% medical, on full gross
- Fed / MN withholding = calibrated effective rates on (gross − all pretax): 13.6977% / 6.0205% — user-editable; separate marginal rates (22% / 6.8%) used only for what-if deltas
- Net = gross − taxes − pretax − after-tax − imputed (imputed is taxed but never cash)

## 3 · Acceptance tests (golden — write these in Vitest FIRST, Milestone 1)

Period fixture: paid hours [15.6, 14.4, 12.2, 14.9, 12.0, 11.8, 15.7, 15.8]; weekend dates carry 14.9 + 15.8; charge 52 h; premium 36 h; 548 = 24 units; evening 18.45 h; OT override 85.74; deduction seeds exactly as in `reference/v1-artifact.jsx` DEFAULT_CFG.

1. Hour split: reg = 80.00, ot = 15.80, dt = 16.60
2. Gross = $8,865.20 ± $0.05 (real stub: $8,865.22)
3. 403(b) = $265.90 exact · SS = $523.72 exact · Medicare = $122.48–122.49
4. Net = $5,781.97 ± $0.05 (real stub: $5,781.99)
5. Schedule hours: 06:45–19:15 → 12.00 · 06:45–23:15 → 16.00 · 19:00–07:00 (overnight) → 11.50 · 10:00–14:00 → 4.00 (no meal) · missing time → null
6. **June regression (the bug that started this):** a 16-hr shift at the old tier owes 15u = $750; payments of 2.5u + 7.5u = 10u must audit as SHORT 5.0 units = $250. This test is permanent.
7. Audit tolerance: |Δ| ≤ $0.05 is green; unit deltas reported as Δ$ ÷ unit value.

## 4 · v2 features (beyond v1)

1. **Persistence + pay periods.** Every period saved locally (IndexedDB preferred), with a period picker, archive, and YTD rollups (gross, net, 548 units, OT/DT hours). JSON export/import for backup.
2. **Discrepancy → HR email.** When audit finds a red line, one tap generates the email in the format that won the June dispute: per-shift table, owed vs paid in units and dollars, "identical shift X was paid in full" comparison line, employee ID field. Copy-to-clipboard.
3. **Schedule scan.** Port v1's flow exactly: image(s) → Anthropic vision call → strict JSON {date, start, end, label} → CODE computes paid hours (meal rule, overnight) → preview → replace/append. Difference from the artifact: user's own API key from Settings (stored locally). Model string and prompt are in v1 — keep the code-does-the-math split.
4. **What-if.** Keep v1's marginal-rate model: recompute the period with a hypothetical shift so OT/DT rules apply to the marginal hours; show $/hr take-home.
5. **PWA.** Manifest, icons, service worker, offline-first. Installable on iPhone/iPad.
6. **Open-questions panel.** The four unknowns below stay amber-flagged in Settings until answered, then become config history.

## 5 · Design — the Knockdown language (Milestone 0)

The design system is NOT invented here. Extract it from the Knockdown repo (Omar provides the path):

1. Read `Assets.xcassets` color sets, any `Theme*/DesignSystem*/Color+*` Swift files, font modifiers, corner radii, spacing, and the debt-payoff progress components.
2. Write `design/tokens.md`: named hex palette (light + dark if both exist), type scale and families with web equivalents, radii, shadows, spacing scale, and 3–4 signature component patterns (cards, progress, primary button, list rows).
3. Map tokens into `tailwind.config` and build a small `ui/` kit before any screens.
4. Keep v1's one signature idea — the vitals strip (Gross / Net / 548 units / Δ vs stub) — but restyle it fully in Knockdown tokens. It should feel like a Knockdown module, not a medical monitor.
5. Voice: Knockdown's copy principle applies — honest, motivating, dead simple, no jargon, no dark patterns. "Short $250 (5.0 units)" beats "variance detected."

If the Knockdown repo path is unavailable, STOP and ask for 2–3 screenshots to extract tokens from instead. Do not proceed on a guessed palette.

## 6 · Open pay-rule questions (amber until payroll answers)

1. Transport bonus: $50 up to 4 h, $100 beyond — does door-to-door time count, or only transferred hours? (6/24 run: 3.0 h transferred but paid 2u.)
2. "12 = $500": confirmed as the 12-hour extra-shift tier (10 units)?
3. Code 301 (Eve Mgr, −4.00/day): what does it remove? Blocks auto-computing evening hours.
4. Preceptor adder rate: stub shows YTD only; seeded $3/hr.

## 7 · Milestones (each ends with tests green + a demo)

- **M0** — Extract Knockdown tokens → `design/tokens.md` + Tailwind config + ui kit.
- **M1** — Scaffold Vite/React/TS/Tailwind. Port engine to `src/lib/engine.ts` in integer cents. All §3 tests green in Vitest. No UI yet.
- **M2** — Shifts + Paycheck + Audit + Rules screens in Knockdown style, in-memory.
- **M3** — Persistence, pay-period picker, YTD, JSON export/import.
- **M4** — Discrepancy → HR email generator.
- **M5** — Schedule scan (API key in Settings) + PWA packaging.

## 8 · Out of scope (guard rails)

No cloud sync, no accounts/auth, no payroll-provider integrations, no push notifications, no multi-user. This is one person's auditor. Anything beyond that goes through Omar first — the PayrollCore/SwiftUI port is a separate future decision, and this web app becomes its spec when that day comes.
