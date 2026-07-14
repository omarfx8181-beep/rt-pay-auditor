/**
 * Payday awareness without notifications (SPEC §8 forbids push): the
 * app knows when periods end, so it can say when the stub should exist
 * and hand iOS Calendar a file of upcoming paydays to do the reminding.
 * Payday = period end + a configurable delay (Fairview pays the Friday
 * after the period closes; the preset seeds 5 days, editable in Me).
 */
import { addDays, PERIOD_DAYS } from "./periods.ts";

export const paydayFor = (periodEnd: string, delayDays: number): string => addDays(periodEnd, delayDays);

/** Upcoming paydays on the biweekly grid, starting from this period's. */
export function upcomingPaydays(currentEnd: string, delayDays: number, count: number): string[] {
  const out: string[] = [];
  let end = currentEnd;
  for (let i = 0; i < count; i++) {
    out.push(paydayFor(end, delayDays));
    end = addDays(end, PERIOD_DAYS);
  }
  return out;
}

/** Whole days from `fromIso` to `toIso` (negative = payday has passed). */
export const daysUntil = (fromIso: string, toIso: string): number =>
  Math.round((new Date(toIso + "T12:00:00").getTime() - new Date(fromIso + "T12:00:00").getTime()) / 86400000);

/**
 * All-day VEVENTs, one per payday — import once and iOS Calendar owns
 * the reminders. Pure string building; nothing leaves the device.
 */
export function buildPaydayCalendar(paydays: string[]): string {
  const stamp = (iso: string) => iso.replaceAll("-", "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RT Pay//paydays//EN",
    ...paydays.flatMap((day) => [
      "BEGIN:VEVENT",
      `UID:rt-pay-payday-${stamp(day)}@rt-pay`,
      `DTSTART;VALUE=DATE:${stamp(day)}`,
      `DTEND;VALUE=DATE:${stamp(addDays(day, 1))}`,
      "SUMMARY:Payday — check your stub in RT Pay",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
