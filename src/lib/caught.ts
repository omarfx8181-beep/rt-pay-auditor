/**
 * The trophy case — what this app has CAUGHT. Every period's verdict
 * is recomputable offline (each snapshots its own config and tiers),
 * so the lifetime tally is derived truth, never a stored counter:
 * shortfalls flagged, corrections recovered, dollars still open, and
 * the clean-check streak. This is the app's whole reason to exist,
 * kept as a number.
 */
import { computeNet, computePeriod, type Cents } from "./engine.ts";
import { draftToConfig, draftToLeave, draftToShift } from "./draft.ts";
import { buildAuditRows } from "./audit.ts";
import { computeVerdict, type Verdict } from "./verdict.ts";
import { correctionTotals, type PayPeriod } from "./periods.ts";

/** Rebuild any period's verdict from its own snapshot — no live state needed. */
export function periodVerdict(p: PayPeriod, closeEnoughCents: number): Verdict {
  const cfg = draftToConfig(p.cfgDraft);
  const period = computePeriod(p.shifts.map(draftToShift), cfg, (p.leave ?? []).map(draftToLeave));
  const net = computeNet(period.grossCents, cfg);
  const rows = buildAuditRows(period, net);
  return computeVerdict(rows, p.actual ?? {}, cfg.unit548Cents, closeEnoughCents, correctionTotals(p).grossCents);
}

export interface CaughtSummary {
  /** Shortfall dollars the app flagged, all time (open + recovered). */
  caughtCents: Cents;
  /** Of those, dollars payroll has paid back via corrections. */
  recoveredCents: Cents;
  /** Still outstanding. */
  openCents: Cents;
  /** Periods where something was caught. */
  caughtCount: number;
  /** Periods with a finished check (a full verdict). */
  checkedCount: number;
  /** Consecutive newest checks that are clean (paid right or made whole). */
  cleanStreak: number;
  /** End date of the earliest catch — "watching since". */
  firstCaughtEnd: string | null;
}

/**
 * Walk every auditable period (has shifts or leave AND a finished
 * verdict). Record-only periods are history, not audits — they never
 * count for or against.
 */
export function caughtSummary(periods: PayPeriod[], closeEnoughCents: number): CaughtSummary {
  const sorted = [...periods].sort((a, b) => (a.endDate < b.endDate ? 1 : -1)); // newest first
  let caughtCents = 0;
  let recoveredCents = 0;
  let openCents = 0;
  let caughtCount = 0;
  let checkedCount = 0;
  let cleanStreak = 0;
  let streakAlive = true;
  let firstCaughtEnd: string | null = null;

  for (const p of sorted) {
    const auditable = p.shifts.length > 0 || (p.leave ?? []).length > 0;
    if (!auditable) continue;
    const v = periodVerdict(p, closeEnoughCents);
    if (v.kind === "intro" || v.kind === "progress") continue; // not finished — skip, don't judge

    checkedCount += 1;
    if (v.kind === "red") {
      const paidBack = Math.min(v.correctionCents, v.owedCents);
      caughtCents += v.owedCents;
      recoveredCents += paidBack;
      openCents += v.owedCents - paidBack;
      caughtCount += 1;
      firstCaughtEnd = p.endDate;
      streakAlive = false;
    } else if (v.kind === "corrected") {
      caughtCents += v.owedCents;
      recoveredCents += v.owedCents; // made whole — the catch paid off
      caughtCount += 1;
      firstCaughtEnd = p.endDate;
      if (streakAlive) cleanStreak += 1; // recovered counts as clean
    } else if (v.kind === "green") {
      if (streakAlive) cleanStreak += 1;
    } else {
      // amber — nothing shorted, but it needs a look; the streak pauses here
      streakAlive = false;
    }
  }

  return { caughtCents, recoveredCents, openCents, caughtCount, checkedCount, cleanStreak, firstCaughtEnd };
}
