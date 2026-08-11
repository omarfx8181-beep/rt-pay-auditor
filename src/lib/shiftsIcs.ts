/**
 * The period's shifts as a calendar file: import once and the phone's
 * calendar shows the work days. Times come from the schedule scan's
 * "sched HH:MM–HH:MM" note (same parse as the live ticker, so nights
 * roll past midnight) and are written as LOCAL floating times — no Z,
 * no TZID — so the phone shows the wall clock the schedule posted. No
 * readable window → an all-day event rather than a guessed start.
 * Same line discipline as the payday calendar (payday.ts): CRLF, no
 * folding, UIDs derived from the shift id so a re-import updates the
 * event instead of duplicating it.
 */
import { num, type ShiftDraft } from "./draft.ts";
import { fmtUnits } from "./format.ts";
import { addDays } from "./periods.ts";
import { noteWindow } from "./shiftClock.ts";

const pad = (n: number) => String(n).padStart(2, "0");

const dateStamp = (iso: string): string => iso.replaceAll("-", "");

const localStamp = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
};

/** RFC 5545 text escaping — the inverse of ical.ts's unescape; backslash first. */
const esc = (v: string): string => v.replace(/\\/g, "\\\\").replace(/([;,])/g, "\\$1").replace(/\r?\n/g, "\\n");

/** "Work · 12h", "Work · 15.6h · charge" — plain language, no payroll codes. */
const summaryFor = (s: ShiftDraft): string => {
  const hours = num(s.hours);
  const parts = ["Work"];
  if (hours > 0) parts.push(`${fmtUnits(hours)}h`);
  if (num(s.charge) > 0) parts.push("charge");
  return parts.join(" · ");
};

/** A work shift is busy time, so no TRANSP (paydays are the transparent ones). */
function veventLines(s: ShiftDraft): string[] {
  const window = noteWindow(s);
  const note = s.note ?? "";
  return [
    "BEGIN:VEVENT",
    `UID:rt-pay-shift-${s.id}@rt-pay`,
    ...(window
      ? [`DTSTART:${localStamp(window.startMs)}`, `DTEND:${localStamp(window.endMs)}`]
      : [`DTSTART;VALUE=DATE:${dateStamp(s.date)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(s.date, 1))}`]),
    `SUMMARY:${esc(summaryFor(s))}`,
    ...(note === "" ? [] : [`DESCRIPTION:${esc(note)}`]),
    "END:VEVENT",
  ];
}

export const shiftsIcsName = (startDate: string): string => `rt-pay-shifts-${startDate}.ics`;

/** Pure string building; nothing leaves the device. Dateless shifts are skipped. */
export function buildShiftsIcs(shifts: ShiftDraft[], calendarName: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RT Pay//shifts//EN",
    ...(calendarName.trim() === "" ? [] : [`X-WR-CALNAME:${esc(calendarName)}`]),
    ...shifts.filter((s) => s.date !== "").flatMap(veventLines),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
