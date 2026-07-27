/** The live-shift clock: schedule-note windows, midnight crossings, manual starts. */
import { describe, expect, test } from "vitest";
import type { ShiftDraft } from "./draft.ts";
import { findLiveShift, noteWindow, todayShiftWithoutTimes } from "./shiftClock.ts";

const draft = (id: string, date: string, note = "", hours = "12"): ShiftDraft => ({
  id,
  date,
  hours,
  charge: "0",
  premium: "0",
  preceptor: "0",
  units548: "0",
  note,
});

describe("noteWindow", () => {
  test("reads the schedule scan's sched times", () => {
    const w = noteWindow(draft("a", "2026-07-27", "sched 06:45–19:15"))!;
    expect(new Date(w.startMs).getHours()).toBe(6);
    expect(new Date(w.endMs).getHours()).toBe(19);
  });

  test("a night shift's end rolls past midnight", () => {
    const w = noteWindow(draft("a", "2026-07-27", "sched 18:45–07:15"))!;
    expect(w.endMs - w.startMs).toBe(12.5 * 3600_000);
    expect(new Date(w.endMs).getDate()).toBe(28);
  });

  test("no times in the note → null", () => {
    expect(noteWindow(draft("a", "2026-07-27", "16-hr extra"))).toBeNull();
    expect(noteWindow(draft("a", "", "sched 06:45–19:15"))).toBeNull();
  });
});

describe("findLiveShift", () => {
  test("mid-shift now → live; before or after → not", () => {
    const s = draft("a", "2026-07-27", "sched 06:45–19:15");
    expect(findLiveShift([s], new Date(2026, 6, 27, 12, 0))?.shift.id).toBe("a");
    expect(findLiveShift([s], new Date(2026, 6, 27, 5, 0))).toBeNull();
    expect(findLiveShift([s], new Date(2026, 6, 27, 20, 0))).toBeNull();
  });

  test("yesterday's night shift is still live at 3am", () => {
    const s = draft("n", "2026-07-26", "sched 18:45–07:15");
    expect(findLiveShift([s], new Date(2026, 6, 27, 3, 0))?.shift.id).toBe("n");
  });

  test("manual 'I'm on now' start clocks its own stored window", () => {
    const s = draft("m", "2026-07-27", "", "8");
    const startMs = new Date(2026, 6, 27, 7, 0).getTime();
    const onNow = { shiftId: "m", startMs, endMs: startMs + 8 * 3600_000 };
    const live = findLiveShift([s], new Date(2026, 6, 27, 14, 59), onNow);
    expect(live?.endMs).toBe(startMs + 8 * 3600_000);
    expect(findLiveShift([s], new Date(2026, 6, 27, 15, 1), onNow)).toBeNull();
  });

  test("todayShiftWithoutTimes finds the 'I'm on now' candidate", () => {
    const timed = draft("a", "2026-07-27", "sched 06:45–19:15");
    const bare = draft("b", "2026-07-27");
    expect(todayShiftWithoutTimes([timed, bare], new Date(2026, 6, 27, 9, 0))?.id).toBe("b");
    expect(todayShiftWithoutTimes([timed], new Date(2026, 6, 27, 9, 0))).toBeNull();
  });
});
