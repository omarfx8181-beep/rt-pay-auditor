/**
 * The live shift ticker's clock: which logged shift is on the clock
 * RIGHT NOW, and its time window. Schedule scans leave "sched
 * 06:45–19:15" in the note — that's the window. No times known? The
 * UI offers a one-tap "I'm on now". Pure functions; `now` always
 * passed in.
 */
import { num, type ShiftDraft } from "./draft.ts";

const DAY_MS = 24 * 3600_000;

const localIso = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** "sched 06:45–19:15" (any HH:MM–HH:MM in the note) → ms window on the shift's date. */
export function noteWindow(s: ShiftDraft, _now?: Date): { startMs: number; endMs: number } | null {
  if (s.date === "") return null;
  const m = /(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/.exec(s.note ?? "");
  if (!m) return null;
  const [y, mo, d] = s.date.split("-").map(Number);
  const startMs = new Date(y, mo - 1, d, Number(m[1]), Number(m[2])).getTime();
  let endMs = new Date(y, mo - 1, d, Number(m[3]), Number(m[4])).getTime();
  if (endMs <= startMs) endMs += DAY_MS; // night shift crosses midnight
  return { startMs, endMs };
}

export interface LiveShift {
  shift: ShiftDraft;
  startMs: number;
  endMs: number;
}

/**
 * The persisted one-tap start (settings key "onNow"). Carries its own
 * end so staleness is judged by TIME alone — never by whether the
 * shift happens to be in whichever period is on screen (v0 wiped a
 * live ticker just for glancing at last period).
 */
export interface OnNow {
  shiftId: string;
  startMs: number;
  endMs: number;
}

/**
 * The shift whose window contains `now` — today's or yesterday's (a
 * night shift runs past midnight). `manualStart` covers shifts with
 * no schedule times: the person tapped "I'm on now" and we clock
 * `hours` from that tap.
 */
export function findLiveShift(shifts: ShiftDraft[], now: Date, manualStart?: OnNow | null): LiveShift | null {
  const today = localIso(now);
  const yesterday = localIso(new Date(now.getTime() - DAY_MS));
  const nowMs = now.getTime();
  for (const s of shifts) {
    if (s.date !== today && s.date !== yesterday) continue;
    if (num(s.hours) <= 0) continue;
    let window = noteWindow(s);
    if (!window && manualStart && manualStart.shiftId === s.id) {
      window = { startMs: manualStart.startMs, endMs: manualStart.endMs };
    }
    if (window && window.startMs <= nowMs && nowMs < window.endMs) return { shift: s, startMs: window.startMs, endMs: window.endMs };
  }
  return null;
}

/** A today-shift with no times yet — the "I'm on now" candidate. */
export function todayShiftWithoutTimes(shifts: ShiftDraft[], now: Date): ShiftDraft | null {
  const today = localIso(now);
  return shifts.find((s) => s.date === today && num(s.hours) > 0 && noteWindow(s) === null) ?? null;
}
