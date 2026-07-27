/**
 * Year Wrapped — the highlight reel. Every number is derived from the
 * periods that already exist (stub-true where entered, engine
 * otherwise), so the reel is the same truth as the Year card, told as
 * a story: hours, weekends, the biggest check, the most-overtime
 * stretch, and the headline — what the app caught.
 */
import { isWeekend } from "./engine.ts";
import { num } from "./draft.ts";
import { periodMoney, rollupYtd, type OtherIncomeDraft, type PayPeriod, type YtdRollup } from "./periods.ts";
import { caughtSummary, type CaughtSummary } from "./caught.ts";

export interface WrappedStats {
  year: string;
  /** Periods in the year with anything logged. */
  checksCount: number;
  ytd: YtdRollup;
  /** Distinct weekend dates worked. */
  weekendDays: number;
  longestShiftHours: number;
  biggestCheck: { endDate: string; grossCents: number; netCents: number } | null;
  mostOt: { endDate: string; otHours: number } | null;
  avgCheckNetCents: number;
  caught: CaughtSummary;
}

export function buildWrapped(
  periods: PayPeriod[],
  otherIncome: OtherIncomeDraft[],
  year: string,
  closeEnoughCents: number,
  todayIso?: string,
): WrappedStats | null {
  const inYear = periods.filter((p) => p.endDate.slice(0, 4) === year);
  const withData = inYear.filter(
    (p) => p.shifts.length > 0 || (p.leave ?? []).length > 0 || (p.actual?.net ?? "") !== "" || (p.actual?.gross ?? "") !== "",
  );
  if (withData.length === 0) return null;

  let weekendDays = 0;
  let longestShiftHours = 0;
  let biggestCheck: WrappedStats["biggestCheck"] = null;
  let mostOt: WrappedStats["mostOt"] = null;
  const weekendSeen = new Set<string>();

  for (const p of withData) {
    for (const s of p.shifts) {
      const hours = num(s.hours);
      if (hours <= 0) continue;
      if (hours > longestShiftHours) longestShiftHours = hours;
      if (s.date !== "" && isWeekend(s.date) && !weekendSeen.has(s.date)) weekendSeen.add(s.date);
    }
    const m = periodMoney(p);
    if (biggestCheck === null || m.netCents > biggestCheck.netCents) {
      biggestCheck = { endDate: p.endDate, grossCents: m.grossCents, netCents: m.netCents };
    }
    if (m.otHours > 0 && (mostOt === null || m.otHours > mostOt.otHours)) {
      mostOt = { endDate: p.endDate, otHours: m.otHours };
    }
  }
  weekendDays = weekendSeen.size;

  const ytd = rollupYtd(periods, year, otherIncome);
  return {
    year,
    checksCount: withData.length,
    ytd,
    weekendDays,
    longestShiftHours,
    biggestCheck,
    mostOt,
    avgCheckNetCents: withData.length > 0 ? Math.round(ytd.netCents / withData.length) : 0,
    caught: caughtSummary(inYear, closeEnoughCents, todayIso),
  };
}
