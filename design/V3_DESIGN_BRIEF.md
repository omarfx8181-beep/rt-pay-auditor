# RT Pay Auditor — V3 Design & Product Upgrade Plan (Build Brief for Claude Code)

## TL;DR
- **The product idea is genuinely differentiated and worth investing in polish:** no competitor does plain-language, hospital-code-level *pay-stub auditing* (decoding things like the code 548 "critical shift bonus" at $50/unit) with schedule-photo scan and a one-tap "you're owed $X, here's the email to HR" moment. The closest app, ShiftWorth ($7.99 one-time), is nurse-only, requires manual rate entry, and can't read an actual stub. RT Pay's moat is decoding the real stub in plain English.
- **The redesign should be a "simple-by-default, detail-on-demand" rebuild around Apple's Clarity/Deference/Depth principles:** collapse the technical 4-tab layout (Shifts/Paycheck/Audit/Rules) into a 3-tab flow (Home "This Check" / Shifts / Me), hide all payroll config (effective tax rate, 403b %, Section 125, MN Paid Leave 0.44%) behind an "Advanced" disclosure, and make the audit verdict the emotional hero — green "Your check is right ✓" vs. red "You're owed $250."
- **Ground the marketing in real, cited wage-theft evidence:** the Economic Policy Institute estimates wage theft costs U.S. workers "more than $50 billion a year"; hospital payroll meltdowns have produced multi-million-dollar settlements (UMass Memorial $1.2M for ~3,178 workers; Ascension/Sacred Heart $19.7M), and a June 2026 Manatee County audit found one paramedic underpaid $9,000 — proof the problem RT Pay solves is real and expensive.

---

## 1. Live-Site Audit Findings (Keep / Fix / Cut)

**Assessment method & limitation.** The live app is a client-side JavaScript single-page app; server-side fetching returns only the HTML shell and metadata. Directly verifiable from served metadata:

- **Title:** "RT Pay Auditor"
- **App title (home-screen/PWA):** "RT Pay"
- **Meta description / tagline:** "Know what the check should say before it lands."
- **Theme color:** `#171310` (a warm, near-black brown — a strong, premium-feeling dark base)
- **PWA-ready:** `mobile-web-app-capable: yes`, `apple-mobile-web-app-*` tags present, `viewport-fit=cover` (correctly notch/safe-area aware for iPhone)

### KEEP (what's already good)
- **The tagline is excellent.** "Know what the check should say before it lands" is plain-language, benefit-led, and emotionally on-target. Promote it to the marketing hero and onboarding welcome screen verbatim.
- **The short PWA name "RT Pay"** is clean and app-like. Keep it as the installed/home-screen name.
- **The warm near-black theme color (`#171310`)** already signals "premium, not clinical." Keep it as the dark-mode base rather than defaulting to a cold gray/blue.
- **PWA installability + safe-area handling** is correct and should be preserved — it lets the web app feel native on an iPhone home screen.
- **The core computation engine** (base, OT after 80/period, DT after 12/day, differentials, adders, code 548 units, taxes, 403b, MN Paid Leave, Section 125) is the actual product value. Keep it; only change how its outputs are *presented*.

### FIX
- **Naming is inconsistent** ("RT Pay Auditor" vs. "RT Pay"). Standardize: product/marketing name "RT Pay," and describe the function as "your paycheck auditor" — "Auditor" as a noun in the logo reads slightly clinical for a nervous everyday user.
- **The 4-tab technical IA** (Shifts / Paycheck / Audit / Rules) exposes internal architecture, not user goals. "Rules" especially is a developer/config concept. Restructure (see §4).
- **Jargon-forward outputs** ("variance on code 548," "effective tax rate," "Section 125") must be translated to plain money language in the default view, with the technical label available on tap.
- **First-run orientation.** A first-time RT landing on a tab bar with empty Shifts/Paycheck/Audit/Rules has no idea where to start. Needs a guided setup (see §4).

### CUT (from the default/first-run experience — not delete, demote)
- **Any always-visible tax-rate, 403b-percentage, Section-125, or MN-Paid-Leave configuration fields.** Move behind "Advanced." Ship sensible defaults so a user never has to touch them to get a correct answer.
- **A standalone "Rules" tab.** Absorb into Settings → "Your pay setup."
- **Dense spreadsheet-style tables as the primary audit view.** Replace with a summary-first card (detail on demand).

---

## 2. Market Landscape, Positioning & Marketing-Usable Stats

### Competitive landscape
| Product | What it does | Price | Gap vs. RT Pay |
|---|---|---|---|
| **ShiftWorth** ("Nurse Pay Stub & Differential") | Closest direct competitor. Per-shift breakdown, FLSA blended OT, "Paycheck Verify" (compare what you type in vs. its estimate), PDF proof packet for HR/union, Facility Profiles, 8/80 rule, offline | Free core; **Pro $7.99 one-time** | Nurse-only; **user must type in the paycheck number manually — no stub reading**; no hospital-specific bonus-code decoding; iOS 17+ only; no displayed ratings yet |
| **ShiftCheck** (Klikkit) | Compares worked shifts vs. payslip, line-by-line discrepancy, dispute draft | Freemium (2 checks/mo free) | UK-oriented, broad shift workers, not hospital-code aware |
| **NursePayScale** | Web tool that verifies pay against real union contracts/step grids | Free | UC hospitals only; web, not a polished app; no schedule scan |
| **NurseGrid** | Shift calendar, swaps, credential tracking; 600k+ nurses | Free (mgr tier paid) | Scheduling, **not pay** — no audit at all; users complain it "feels aged" |
| **NursePayCalc / Harvest / Connecteam calculators** | Free web estimators for differential + OT | Free | Estimate only; no stub audit, no persistence, no HR action |
| **DailyPay / EarnIn** (earned-wage access) | Show accrued earnings, early cash-out | Free to employee | Show *access* to pay, not *correctness* of pay; polished UX worth studying |

### Positioning statement (use as north star)
> **RT Pay is the only app that reads your actual hospital paycheck and tells you — in plain English — whether you got every dollar and every bonus you earned.** Calculators guess what you *should* make. RT Pay proves what you *were* paid, decodes the codes your hospital uses (differentials, charge/preceptor premiums, the code 548 critical-shift bonus), and hands you the exact email to send HR when you've been shorted.

Three defensible wedges no competitor combines: (1) **schedule-photo scan → pre-filled shifts**; (2) **line-by-line stub decoding with hospital-specific bonus codes**; (3) **plain-language verdict + one-tap HR email**. ShiftWorth's biggest weakness — it can't read a stub and makes the nurse re-type everything — is exactly RT Pay's strongest wedge. No app-based competitor currently displays App Store ratings; the category is wide open for the best-designed entrant.

### Marketing-usable stats (verified with sources — cite before publishing)
1. **"Wage theft costs U.S. workers more than $50 billion a year."** — Economic Policy Institute (Eisenbrey & Meixell). A separate EPI report found 2.4 million workers lose $8 billion annually (~$3,300/year each) to minimum wage violations alone.
2. **"When a hospital's payroll breaks, it breaks big."** — After the December 2021 Kronos/UKG ransomware outage: UMass Memorial Health settled for **$1.2 million** covering ~3,178 hourly workers; Ascension Health and Sacred Heart Health System (FL) settled related wage disputes for **$19.7 million**.
3. **"One paramedic was underpaid $9,000."** — A June 2026 Manatee County (FL) audit found the county underpaid EMS workers by at least **$336,607** over nine months; 200+ employees owed back pay; UKG "not correctly counting hours worked toward the calculation of overtime." A Volusia County audit (March 2026) found workers underpaid up to $2,000 — and one overpaid $62,000 and forced to repay.
4. **"You're not imagining it — the stub really is confusing."** — Workforce Institute at Kronos survey: **42%** of employees say taxes and deductions on their paycheck are confusing; **49%** would job-hunt after just two payroll mistakes.

*Context for the RT audience:* an RRT at Fairview earns roughly $37–45/hour (Indeed: ~$36.88 avg; ZipRecruiter Minneapolis: $45.11 avg, most $31.59–$55.96). One mis-coded differential or missed OT block on an 80-hour period is easily a $100–$400 hit — real money, every two weeks.

---

## 3. Design System Spec (Apple-Minimalism, Eye-Catching)

Philosophy, distilled from Apple's HIG (Clarity, Deference, Depth), Apple Card/Wallet transaction clarity, Copilot Money, and Linear: **content leads, chrome recedes; one accent reserved for action and money; weight and size — not color — create hierarchy; simple by default, detail on tap.**

### 3.1 Color (hex values)
Reserve saturated color almost entirely for **money status** and **interactive elements**. Everything else is warm neutral.

**Light (default):**
- `--bg` warm paper: `#FAF9F6`
- `--surface` card: `#FFFFFF`
- `--surface-sunken`: `#F2F0EB`
- `--hairline`: `#E7E3DC`
- `--ink` primary text: `#1C1917`
- `--ink-2` secondary: `#6B6560`
- `--ink-3` tertiary/placeholder: `#9B948D`
- `--accent` (brand + interactive): emerald `#0E7C5A`
- `--accent-pressed`: `#0A5E44`
- `--positive` "check is right": `#0E7C5A`
- `--shortfall` "you're owed": `#C4362B`
- `--amber` "needs a look": `#C98A2B`

**Dark (built on the existing theme color):**
- `--bg`: `#14110D`
- `--surface`: `#1F1B16`
- `--hairline`: `#332C24`
- `--ink`: `#F5F2EC`; `--ink-2`: `#B8B0A6`
- `--accent`: `#2FB98A`; `--shortfall`: `#E5675B`; `--amber`: `#E0A64E`

Rule: **red and green never carry meaning alone** — always pair with an icon (✓ / ↑) and words ("Paid in full" / "You're owed $250").

### 3.2 Typography
System font stack — **SF Pro on Apple, Inter as web fallback**. One family; hierarchy from **size + weight**. No Ultralight/Thin. **All currency uses tabular figures.**

| Token | Size / Line | Weight | Use |
|---|---|---|---|
| Hero number | 40 / 44 | Bold | The big "$5,782" on Home & verdict |
| Large Title | 34 / 40 | Bold | Screen titles |
| Title 2 | 22 / 28 | Semibold | Section headers |
| Headline | 17 / 22 | Semibold | Card titles, primary buttons |
| Body | 17 / 24 | Regular | Default text (17pt legibility floor) |
| Subhead | 15 / 20 | Regular | Secondary rows |
| Footnote | 13 / 18 | Regular | Helper text |
| Caption | 12 / 16 | Medium | Labels, chips, technical code labels |

Support dynamic text sizing.

### 3.3 Spacing & layout
- **4px base unit; 8pt rhythm:** 4 / 8 / 12 / 16 / 24 / 32 / 48. Screen side margins 20px.
- **Generous whitespace over dividers** — group with space, not heavy lines.
- **Cards:** radius 20px, `--surface`, soft shadow (`0 1px 3px rgba(0,0,0,0.06)`), 20px internal padding.
- **Minimum 44×44pt tap targets.**

### 3.4 Component patterns
- **Status hero card** — big tabular number + one-line verdict + colored status pill (Apple Card balance style).
- **Summary row → detail-on-demand:** plain label + amount; tap expands to math and the real payroll code.
- **Verdict banner:** full-width, color-coded, icon + headline + one primary action.
- **Bottom sheets** for editing a shift or a rate — keeps spatial context, feels fast.
- **Empty states that feel filled:** friendly line + one button.
- **Micro-interactions, restrained:** subtle count-up on the hero number, gentle checkmark draw on a clean audit, optimistic UI. No confetti overload.

### 3.5 Dense financial tables, the friendly way
- **Default view = the answer:** "This paycheck: expected **$5,782** — Stub matched ✓."
- **One level down = the story:** "Base pay … $3,120 · Overtime … $612 · Night differential … $340 · Critical-shift bonus (12 units) … $600."
- **Two levels down = the receipt:** formula, hours, rate, and the literal code ("code 548 · $50 × 12 units"). Technical detail is *reachable*, never *default*.

---

## 4. Screen-by-Screen Redesign Spec (with plain-language copy)

### IA restructure
**Old:** Shifts · Paycheck · Audit · Rules
**New:** 1. **Home — "This Check"** · 2. **Shifts** · 3. **Me**
"Audit" becomes the **primary action** on Home ("Check my paycheck"); "Rules" is absorbed into **Me → Your pay setup** with technical config under **Advanced**.

### First-run onboarding (under 90 seconds, 3–4 single-purpose screens)
One question per screen, explain why, show value fast, skippable/resumable.
1. **Welcome:** "Know what your check should say — before it lands." · "RT Pay checks your hospital paycheck line-by-line and flags anything you're owed." · [Get started]
2. **Role/employer preset:** "Where do you work?" → *M Health Fairview · Respiratory Therapist* preselected → **pre-loads differential, OT, and bonus rules**. Reassurance: "This stays on your device."
3. **Base pay:** "What's your base hourly rate?" · Big input, numeric pad. Helper: "You can add night, weekend, and charge pay later — we've already set the usual Fairview rates."
4. **Add shifts:** "Add your shifts — or just snap your schedule." · [📷 Scan my schedule] / [Add manually] / [Skip for now] → lands on a populated Home.

### Home — "This Check"
- **Hero card:** big tabular "$5,782," label "Expected take-home this period" (net default, gross toggle), status pill.
- **Primary action:** **"Check my paycheck."**
- **What-if card:** "Thinking about picking up a shift? See what you'd actually take home →"
- Quiet period selector at top.
- **Empty state:** "No shifts yet. Add a few — or snap your schedule — and we'll show what your next check should look like." · [Scan schedule] [Add a shift]

### Shifts
- Calendar/list; each shift a friendly card: date, hours, human tags ("Night," "Charge," "Weekend") — not codes.
- **Add shift = bottom sheet**, big time controls, plain toggles + "Critical shift bonus" units stepper.
- **"Scan schedule"** prominent; after scan, friendly confirm ("We found 6 shifts — look right?").
- **Empty state:** "Your shifts live here. The more you add, the sharper your paycheck check."

### Audit result — "The verdict" (the emotional hero)
- **✅ Correct (green):** "**Your check is right. ✓** Paid in full — **$5,782.14**. Every shift, differential, and bonus checked out. Nice." [See the breakdown]
- **🟥 Shorted (red) — hero flow:** "**You're owed $250.** Your critical-shift bonus was short 5 units ($250). Everything else matched." **[Email HR — we've written it for you]** [See the breakdown]
- **🟠 Needs a look (amber):** "Something doesn't line up — let's double-check one thing." → one guided question.

**One-tap HR email (signature "wow"):** pre-fills a polite, specific draft — "Hi [Manager], reviewing my 6/1–6/14 stub I show 12 critical-shift units (code 548) but was paid for 7. Could you check a $250 difference? Thank you, [Name]." Opens mail composer pre-addressed. Plain language on screen; the code appears in the email because HR needs it.

### Me (Settings) — with Advanced disclosure
- **Top level:** Your role & employer · Your base rate · Your usual shifts · Notifications.
- **"Your pay rules"** in human rows: "Night differential: +$X/hr," "Overtime after 80 hrs," "Critical shift bonus: $50/unit."
- **"Advanced" (collapsed):** effective tax rate, 403(b) %, Section 125, MN Paid Leave (0.44% employee share, 2026). Each with a plain one-liner ("Set to the standard Minnesota rate — most people never change it").

### Copy voice guidelines
- **Say the money, not the mechanism:** "You were shorted $250," never "variance detected on code 548."
- **Second person, active, warm.** Numbers are the hero; words short.
- **Reassure on privacy** at every data step ("stays on your device").
- **Codes live in the email to HR, not in the user's face.**
- **Celebrate correctness.** Never scold or alarm — a shortfall is "good news: you caught it."

---

## 5. Prioritized Implementation Roadmap

### Quick wins
1. Rename & re-tab: 4 → 3 (Home/Shifts/Me); fold Rules into Me; "Check my paycheck" as Home action.
2. Ship design tokens (§3) as CSS variables; status-hero card on Home.
3. Plain-language pass on every default-view string.
4. Move all tax/403b/125/MN-Paid-Leave config behind Advanced with defaults.
5. Verdict screen redesign (green/red/amber, icon + words + one action).
6. Tabular figures + one accent everywhere money appears.

### Medium
7. Guided first-run onboarding (4 screens, Fairview RT preset).
8. One-tap HR email with pre-filled draft.
9. Progressive-disclosure pay rows.
10. Empty states + micro-interactions.
11. Bottom-sheet shift editor.

### Bigger lifts
12. Schedule-scan hardening + friendly confirm-and-correct flow.
13. Facility/role preset architecture (§6).
14. Dark mode on `#171310`/`#14110D`.
15. Pro tier + paywall plumbing (audit history, PDF proof export).

### Benchmarks that change priorities
- First-run completion < ~60% → cut onboarding to 3 screens, default harder (aim 70%+).
- Scan frustration (high correction rate) → demote scan, lead with fast manual add.
- Users rarely reach the audit → make "Check my paycheck" bolder and/or add a payday reminder.

---

## 6. Future-Expansion Groundwork (design for it, don't build it)

- **Multi-hospital presets:** model pay rules as a portable **Facility Profile** data object (differential rates, OT thresholds, bonus codes, workweek start, deduction defaults) — never hardcoded logic. Adding a hospital = adding a JSON preset.
- **Other roles (RN, CNA, rad tech):** **role** is a preset layered on a facility; onboarding already anticipates it.
- **Community "pay rules" library:** presets are data, so a future "someone at your hospital already set this up" import is natural. Store `presetSource` and `version` now.
- **Monetization:** Free personal tier (unlimited shifts + expected pay + audit verdict). Pro: audit history, **PDF proof-packet export**, multi-employer profiles, what-if scenarios. Price against ShiftWorth's $7.99 one-time — match with a one-time unlock or modest annual (~$9.99–$14.99). Avoid aggressive subscription framing; NurseGrid's "100% free" anchors willingness-to-pay low, so any price must be clearly justified by the audit/proof value.
- **Guardrails now:** on-device by default (privacy as a trust wedge, said in onboarding); rules-driven, preset-injected engine; version every preset.

---

### One-line build summary
Rebuild RT Pay as a 3-tab, simple-by-default paycheck auditor: warm-minimal Apple-style design system (emerald `#0E7C5A` accent, SF Pro/Inter, tabular figures, 8pt spacing, 20px cards), a 4-screen guided onboarding that pre-loads M Health Fairview RT pay rules, a status-hero Home ("This check: expected $5,782 — matched ✓"), a green/red/amber verdict with a one-tap pre-written HR email as the hero moment, and every payroll technicality hidden behind an Advanced disclosure — architected so hospitals and roles are swappable presets, not code.
