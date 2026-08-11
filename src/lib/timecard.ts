/**
 * Timecard true-up: snap the Kronos timecard and the punches replace
 * the scheduled hours — and the one number Omar still types by hand
 * every period (evening credit hours, the code-301 dance) fills
 * itself. The model only reads; CODE matches days to shifts and
 * decides every change, shown in a preview before anything applies.
 */
import { callClaude, filesToContentBlocks } from "./scan.ts";
import { blankShift, num, type ShiftDraft } from "./draft.ts";

export interface TimecardDay {
  date: string;
  /** Paid/worked hours the timecard shows for that day. */
  hours: number;
  /**
   * The day's punch in/out times, 24h "HH:MM", one entry per worked
   * segment (a meal break splits the day into two). Absent when the
   * punch columns weren't legible — see asPunches: it's all-or-nothing
   * per day, so a present list is the day's WHOLE span. rounding.ts
   * reads these against `hours`.
   */
  punches?: { in: string; out: string }[];
}

export interface TimecardRead {
  periodStart: string;
  periodEnd: string;
  days: TimecardDay[];
  /** The period's evening-credit total (e.g. "Shift – Evening"), if printed. */
  eveningHours: number | null;
}

export const timecardInstruction =
  "You are reading a Kronos timecard screen for ONE employee and ONE biweekly pay period. " +
  "Extract each WORKED day's date and its total paid/worked hours for that day (combine multiple punches per day). " +
  "For each of those days ALSO list its punch in/out times exactly as printed in the punch columns, one entry per " +
  "worked segment — a meal break that splits the day gives two entries — written as 24-hour HH:MM. Transcribe the " +
  "printed minutes verbatim: never round them, never derive them from the paid total, never fill in one you cannot " +
  "read. The whole point is the gap between punched and paid, so an invented punch is worse than none. " +
  "Also extract the pay period start and end dates if shown, and the period TOTAL of evening/shift-differential " +
  'credit hours (pay codes like "Shift - Evening" or 301) if a totals section shows one. ' +
  'Respond with ONLY valid JSON, no markdown, no commentary, exactly this schema: {"periodStart":"YYYY-MM-DD or empty string",' +
  '"periodEnd":"YYYY-MM-DD or empty string","days":[{"date":"YYYY-MM-DD","hours":12.25,' +
  '"punches":[{"in":"06:45","out":"11:30"},{"in":"12:00","out":"19:18"}]}],"eveningHours":18.45} ' +
  'Use "punches":[] for a day whose in/out times are not legible, and "eveningHours":null when no ' +
  "evening/differential total is shown. Hours are plain decimal numbers. " +
  "Skip time-off/PTO days — worked days only. Never invent days that are not on the screen.";

const asDate = (v: unknown): string => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** 24h "HH:MM" → zero-padded; "" for anything else. A misread AM/PM is a 12-hour error, so 12-hour forms drop. */
const asClock = (v: unknown): string => {
  const m = typeof v === "string" ? /^\s*(\d{1,2}):(\d{2})\s*$/.exec(v) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
};

/**
 * Punch pairs, all-or-nothing per day: one unreadable time and the whole
 * day's list goes. A partial list understates the punched span, which
 * reads as rounding paying you UP — a phantom gain that would mask real
 * losses on other days. Absent/empty/unreadable → undefined, scan carries on.
 */
const asPunches = (v: unknown): TimecardDay["punches"] => {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const pairs: { in: string; out: string }[] = [];
  for (const raw of v) {
    const p = (raw ?? {}) as Record<string, unknown>;
    const start = asClock(p.in);
    const end = asClock(p.out);
    if (start === "" || end === "") return undefined;
    pairs.push({ in: start, out: end });
  }
  return pairs;
};

export function parseTimecardResponse(text: string): TimecardRead {
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("The response wasn't valid JSON — try a clearer shot of the timecard.");
  }
  const p = parsed as Record<string, unknown>;
  const rawDays = Array.isArray(p.days) ? p.days : [];
  const days = rawDays
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d): TimecardDay => {
      const punches = asPunches(d.punches);
      return {
        date: asDate(d.date),
        hours: typeof d.hours === "number" ? d.hours : Number.parseFloat(String(d.hours ?? "")),
        ...(punches ? { punches } : {}),
      };
    })
    .filter((d) => d.date !== "" && Number.isFinite(d.hours) && d.hours > 0);
  if (days.length === 0) throw new Error("No worked days found — is that the timecard view?");
  const evening = typeof p.eveningHours === "number" && Number.isFinite(p.eveningHours) && p.eveningHours >= 0 ? p.eveningHours : null;
  return { periodStart: asDate(p.periodStart), periodEnd: asDate(p.periodEnd), days, eveningHours: evening };
}

/** How many timecard days fall inside the open period's window. */
export const timecardCoverage = (days: TimecardDay[], startDate: string, endDate: string): { inside: number; outside: number } => {
  let inside = 0;
  for (const d of days) if (d.date >= startDate && d.date <= endDate) inside += 1;
  return { inside, outside: days.length - inside };
};

export interface TimecardApplyPlan {
  /** The full shift list after applying (updates + additions). */
  shifts: ShiftDraft[];
  /** Shifts whose hours the punches changed. */
  changed: Array<{ date: string; from: string; to: string }>;
  /** Timecard days with no scheduled shift → new shifts. */
  added: TimecardDay[];
  /** Shifts already matching their punches (within 0.01 h). */
  unchanged: number;
}

const fmtHours = (h: number): string => String(Math.round(h * 100) / 100);

/**
 * Punches are the truth: matching dates take the timecard's hours
 * (adders/units/notes untouched), days the schedule never had become
 * new shifts. Shifts with no timecard day are left alone — a second
 * screenshot may still be coming.
 */
export function applyTimecard(shifts: ShiftDraft[], days: TimecardDay[]): TimecardApplyPlan {
  const plan: TimecardApplyPlan = { shifts: [...shifts], changed: [], added: [], unchanged: 0 };
  for (const day of days) {
    const idx = plan.shifts.findIndex((s) => s.date === day.date);
    if (idx === -1) {
      const fresh = { ...blankShift(), date: day.date, hours: fmtHours(day.hours) };
      plan.shifts.push(fresh);
      plan.added.push(day);
    } else {
      const current = plan.shifts[idx];
      if (Math.abs(num(current.hours) - day.hours) > 0.01) {
        plan.changed.push({ date: day.date, from: current.hours, to: fmtHours(day.hours) });
        plan.shifts[idx] = { ...current, hours: fmtHours(day.hours) };
      } else {
        plan.unchanged += 1;
      }
    }
  }
  plan.shifts.sort((a, b) => (a.date === "" ? 1 : b.date === "" ? -1 : a.date < b.date ? -1 : 1));
  return plan;
}

export async function scanTimecard(files: File[], apiKey: string): Promise<TimecardRead> {
  const blocks = await filesToContentBlocks(files);
  if (blocks.length === 0) throw new Error("No readable files — snap the Kronos timecard screen.");
  const text = await callClaude(blocks, timecardInstruction, apiKey, 3000); // punch pairs roughly triple the per-day payload
  return parseTimecardResponse(text);
}
