/**
 * Average hours each week — the number benefits forms, FTE checks,
 * and "how much am I actually working?" conversations ask for.
 *
 * Finished checks only: a period still running is half a fortnight
 * and would drag the average down. Periods with no shifts and no
 * leave are unlogged history (or bare stub records) — they carry no
 * hours, so they can't vote. Hours come from periodMoney, the same
 * engine numbers the Worked tile already shows.
 */
import { periodMoney, type PayPeriod } from "./periods.ts";

export interface WeeklyHours {
  /** Hours actually worked, averaged per week. */
  weeklyHours: number;
  /** Worked + PTO/leave per week — what paid-hours forms usually want. */
  weeklyPaidHours: number;
  /** Worked hours per check (two weeks). */
  perCheckHours: number;
  checksCounted: number;
  workedHours: number;
  leaveHours: number;
}

export function weeklyHours(periods: PayPeriod[], year: string, todayIso: string): WeeklyHours | null {
  let workedHours = 0;
  let leaveHours = 0;
  let checksCounted = 0;
  for (const p of periods) {
    if (p.endDate.slice(0, 4) !== year) continue;
    if (p.endDate >= todayIso) continue; // still running
    if (p.shifts.length === 0 && (p.leave ?? []).length === 0) continue; // no hours logged
    const m = periodMoney(p);
    workedHours += m.workedHours;
    leaveHours += m.leaveHours;
    checksCounted += 1;
  }
  if (checksCounted === 0) return null;
  const weeks = checksCounted * 2; // biweekly grid — every check is two weeks
  return {
    weeklyHours: workedHours / weeks,
    weeklyPaidHours: (workedHours + leaveHours) / weeks,
    perCheckHours: workedHours / checksCounted,
    checksCounted,
    workedHours,
    leaveHours,
  };
}
