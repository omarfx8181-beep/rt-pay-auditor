/**
 * ScheduleAnywhere iCalendar feed → shifts. The feed (Employee →
 * iCalendar → Copy URL) carries last week + up to six weeks of posted
 * schedule as VEVENTs — no API key, no screenshots. This parser is
 * deliberately literal: a shift's clock time is what the schedule
 * says, so TZID-local times are taken at face value; only true UTC
 * ("Z") times are converted to the device's timezone. The engine still
 * computes paid hours (meal rule, overnight) — code does the math.
 */
import type { RawScanShift } from "./scan.ts";

export interface IcsEvent {
  /** YYYY-MM-DD of the (local) start. */
  date: string;
  /** "HH:MM", or "" for all-day/date-only events. */
  start: string;
  end: string;
  summary: string;
  location: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Unfold RFC 5545 folded lines (CRLF followed by space/tab). */
const unfold = (text: string): string[] =>
  text
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .split(/\r?\n/);

interface ParsedStamp {
  date: string;
  time: string; // "" for date-only
}

/**
 * DTSTART/DTEND value → local date + clock time.
 * - "20260713T064500" (with or without TZID param) → literal 06:45
 * - "20260713T114500Z" → converted to the device's local time
 * - "20260713" (VALUE=DATE) → date only, no time
 */
function parseStamp(value: string): ParsedStamp | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , zulu] = m;
  if (h === undefined) return { date: `${y}-${mo}-${d}`, time: "" };
  if (zulu) {
    const local = new Date(Date.UTC(+y, +mo - 1, +d, +h!, +mi!));
    return {
      date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`,
      time: `${pad(local.getHours())}:${pad(local.getMinutes())}`,
    };
  }
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

/** Minimal VEVENT extraction; ignores everything the schedule doesn't need. */
export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let cur: Partial<Record<"start" | "end" | "summary" | "location", string>> | null = null;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT/i.test(line)) {
      cur = {};
      continue;
    }
    if (/^END:VEVENT/i.test(line)) {
      if (cur?.start) {
        const start = parseStamp(cur.start);
        const end = cur.end ? parseStamp(cur.end) : null;
        if (start) {
          events.push({
            date: start.date,
            start: start.time,
            end: end?.time ?? "",
            summary: cur.summary ?? "",
            location: cur.location ?? "",
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const name = line.slice(0, sep).split(";")[0].toUpperCase();
    const value = line.slice(sep + 1);
    if (name === "DTSTART") cur.start = value;
    else if (name === "DTEND") cur.end = value;
    else if (name === "SUMMARY") cur.summary = value.replace(/\\([,;nN])/g, (_, c) => (c === "," || c === ";" ? c : "\n")).trim();
    else if (name === "LOCATION") cur.location = value.replace(/\\([,;nN])/g, (_, c) => (c === "," || c === ";" ? c : "\n")).trim();
  }
  return events;
}

/**
 * Feed events → the scan pipeline's raw shifts, filtered to a date
 * window (the current pay period) and de-duplicated by date+start.
 */
export function icsToRawShifts(text: string, window?: { from: string; to: string }): RawScanShift[] {
  const seen = new Set<string>();
  const shifts: RawScanShift[] = [];
  for (const ev of parseIcs(text)) {
    if (window && (ev.date < window.from || ev.date > window.to)) continue;
    const key = `${ev.date}|${ev.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = [ev.summary, ev.location].filter(Boolean).join(" · ");
    shifts.push({ date: ev.date, start: ev.start, end: ev.end, label });
  }
  return shifts.sort((a, b) => (a.date < b.date ? -1 : 1));
}
