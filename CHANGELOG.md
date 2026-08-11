# Changelog

## 1.3.1 — August 2026

Five defects a second adversarial review found in 1.3.0, all fixed before anyone met them.

- **"Add a shift" no longer deletes the shift it just made.** The Home Screen shortcut hands over a complete shift (today, 12 h); an over-eager phantom-shift guard treated "accepted the defaults" as "never touched it" and removed it on Done — after it had already been saved. Done now always keeps; only dismissing the sheet (✕ or backdrop) can take back an untouched hand-off, and any edit — even one you undo — marks it yours.
- **The W-2 box check no longer loses ~$419 of Box 1 per empty period.** An empty window carries no wages but a full period of Section-125 deductions, so each one quietly shrank Boxes 1, 2, 3, 5 and 17. Placeholder periods are now skipped there, the same rule the year totals already use.
- **Kronos rounding: a transfer day is no longer billed as a shave.** Whether the meal was punched or auto-deducted is now decided by a real gap between segments, not by how many punch pairs the day has — a cost-center transfer or a float prints two back-to-back pairs with the meal still auto-deducted, and that was reading as ~$26 of stolen time.
- **Rounding no longer goes silent on the biggest anomalies.** Days too far off to *be* rounding were held back until some other day produced a priced loss, so a 16-hour double whose whole gap was unexplained showed nothing at all. Anomalies now speak for themselves, by date, without being priced as rounding.
- **The dispute clock can be started after the fact.** The confirmation only existed in the moment the draft was opened, so sending from Mail after a cold relaunch — or from a laptop — logged nothing and the follow-up never appeared. A red check with no send logged now offers "Already emailed payroll about this?".
- The Add-a-shift shortcut also fills a *gap* in the pay-period grid instead of silently doing nothing when today sits in a fortnight a schedule scan skipped.

## 1.3.0 — August 2026

The watchdog follows through — catching a shortfall was never the hard part; chasing it was.

- **Dispute follow-up**: opening the HR email asks "did it go to payroll?" — only a confirmed send starts the clock (and "take it back" undoes a mis-tap). The check then carries "Emailed payroll Thu, 7/30 · 12 days ago", and once payroll has had a full cycle (10 days), a **firmer follow-up** draft appears: it cites the first email by date, restates what's still owed after any partial correction, and asks for an off-cycle check by a named date.
- **Raise watch**: a scanned stub's regular line carries its own hours, so the app divides them out and compares the hourly rate payroll actually used to the one in your settings. A landed raise says so; an old rate still being paid shows what the check is light. It stays silent unless the stub's hours corroborate the app's own — a rate is never inferred from a mismatch.
- **Kronos rounding watch**: the timecard scan now reads punch in/out times, and the preview totals what rounding shaved — in minutes and dollars. Fairview's unpaid meal is subtracted first (it is a contract term, not a shave), and any day too far off to be rounding is named rather than priced.
- **Shifts → calendar**: one tap exports the period's shifts as a calendar file; scheduled windows become timed events (nights roll past midnight), everything else lands as an all-day event.
- **Take me there**: "Me → Backup / Year / your rate" pointers are now taps that scroll to the card and flash it.
- **Home Screen shortcuts**: long-press the icon for "Scan stub" or "Add a shift", plus real iOS launch screens (no white flash on open).

## 1.2.0 — July 2026

Faster, smoother, keeping score.

- **Code-splitting**: the main bundle dropped 787→616 kB (gzip 253→192) — the QR share screen alone carried 158 kB of QR libraries that now load only when opened. Wrapped, the tour, onboarding, the how-to, and the PDF record are all on-demand too.
- **Zero-flash launch**: the page paints the right paper color before any code loads (no cream flash for dark-mode users), and the iOS status bar follows the in-app appearance override, not just the system.
- **Slimmer offline cache**: non-latin font subsets left the precache (~40% of it) — still fetchable online, never pre-downloaded.
- **Milestone records** on the scoreboard: first catch, $500+ caught, money clawed back, 5/10 clean checks straight, 10 checks verified, a full year verified. Derived from the same math as everything else — never a stored counter.

## 1.1.0 — July 2026

Everything connects — the features stop being islands.

- **The payday ritual**: opening the app after a payday announces which checks are still waiting to be audited; one tap lands on the oldest.
- The scoreboard's open dollars tap straight into the period that's owed.
- **"I'm taking it — add the shift"** on the what-if card commits the priced pickup as a real shift with the editor open.
- The period switcher carries every check's verdict color (green / "$250.00 owed" / amber / not checked).
- A period's first green check bursts once (reduced-motion safe, stamped so it never replays), and a clean newest check offers "Start the next period."

## 1.0.0 — July 2026

The finished product. Everything below ships behind 185+ unit tests, 16 E2E browser tests, and a CI gate.

### Data safety (the reason this release is 1.0)
- **Backups now carry everything** — goals, YTD anchors, PTO and W-2 config, HR-email identity, tolerances. Earlier backups silently dropped all of it. The API key never rides in a file.
- **Restore on first run** — "New phone? Restore your backup" right on the welcome screen.
- **Crash rescue** — a render error can never white-screen your data; the recovery screen downloads a backup straight from storage.
- **Storage self-defense** — the app asks the browser for persistent storage, shows its health in Me → About, and warns once when running un-installed in iOS Safari (where a quiet tab can be evicted).
- Importing a backup now refreshes the open period immediately (previously the next keystroke could overwrite imported data), runs in one transaction, and flags duplicate-date periods.

### Product shell
- Version 1.0.0 with an About row, this changelog, and a once-per-update "What's new" sheet.
- The installed app checks for updates hourly and when it returns to the foreground.
- Scans handle the real world: offline notice, 90-second timeout, one automatic retry when the service is busy, plain-language errors, and a configurable model id (Me → Advanced).
- Every input is 16px — no more iOS zoom-lurch. Double-taps can't duplicate periods. YTD anchors snap to the biweekly grid.

### Earlier in July 2026 (pre-1.0 highlights)
- The batch of seven: scoreboard, per-shift price tags + pickup chips, bonus-posting scan, "Why is this check different?", live shift ticker, Year Wrapped, QR rules sharing.
- The de-wording pass: numbers lead, each fact stated once.
- Goals tab with the pickup strategizer; timecard true-up; PTO bank auditor; W-2 check; correction checks and the "made whole" verdict; one-directional forgiveness; guided tour; stub/schedule/YTD scans; the verdict engine that reconciles a real stub to the cent.
