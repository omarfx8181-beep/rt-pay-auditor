# Changelog

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
