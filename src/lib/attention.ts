/**
 * The payday ritual — what's WAITING. The app was born from a
 * shortfall nobody caught for weeks, and it can only catch what gets
 * opened and checked. This lib answers, on every open: has a payday
 * passed whose check was never audited? Pure derived state.
 */
import { paydayFor } from "./payday.ts";
import { periodVerdict } from "./caught.ts";
import type { PayPeriod } from "./periods.ts";

export interface WaitingCheck {
  periodId: string;
  endDate: string;
  payday: string;
}

/**
 * Periods whose payday has passed but whose check was never finished
 * (verdict still intro/progress). Record-only history (no shifts or
 * leave) doesn't wait — there's nothing to audit. Oldest first.
 */
export function checksWaiting(
  periods: PayPeriod[],
  paydayDelayDays: number,
  todayIso: string,
  closeEnoughCents: number,
): WaitingCheck[] {
  const waiting: WaitingCheck[] = [];
  for (const p of periods) {
    if (p.archived) continue;
    if (p.shifts.length === 0 && (p.leave ?? []).length === 0) continue;
    const payday = paydayFor(p.endDate, paydayDelayDays);
    if (payday > todayIso) continue;
    const v = periodVerdict(p, closeEnoughCents);
    if (v.kind === "intro" || v.kind === "progress") {
      waiting.push({ periodId: p.id, endDate: p.endDate, payday });
    }
  }
  return waiting.sort((a, b) => (a.endDate < b.endDate ? -1 : 1));
}
