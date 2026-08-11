/** Timecard true-up: parsing, window coverage, punch-over-schedule apply. */
import { describe, expect, test } from "vitest";
import { applyTimecard, parseTimecardResponse, timecardCoverage } from "./timecard.ts";
import { blankShift } from "./draft.ts";

const RESPONSE = JSON.stringify({
  periodStart: "2026-06-22",
  periodEnd: "2026-07-05",
  days: [
    { date: "2026-06-23", hours: 15.72 }, // punched longer than scheduled
    { date: "2026-06-25", hours: 12.2 }, // matches exactly
    { date: "2026-06-27", hours: 8 }, // never scheduled — picked-up shift
    { date: "bad-date", hours: 12 }, // dropped
    { date: "2026-06-28", hours: 0 }, // zero → dropped
  ],
  eveningHours: 18.45,
});

describe("parseTimecardResponse", () => {
  test("reads days, drops junk, keeps the evening total", () => {
    const read = parseTimecardResponse("```json\n" + RESPONSE + "\n```");
    expect(read.days).toHaveLength(3);
    expect(read.eveningHours).toBe(18.45);
    expect(read.periodEnd).toBe("2026-07-05");
    expect(parseTimecardResponse(JSON.stringify({ days: [{ date: "2026-06-23", hours: 12 }], eveningHours: null })).eveningHours).toBeNull();
    expect(() => parseTimecardResponse(JSON.stringify({ days: [] }))).toThrow(/no worked days/i);
  });
});

const PUNCHED = JSON.stringify({
  periodStart: "2026-06-22",
  periodEnd: "2026-07-05",
  days: [
    { date: "2026-06-23", hours: 12, punches: [{ in: "6:45", out: "11:30" }, { in: "12:00", out: "19:30" }] }, // meal split, unpadded hour
    { date: "2026-06-25", hours: 12, punches: [{ in: "18:45", out: "07:00" }] }, // night shift
    { date: "2026-06-27", hours: 8, punches: [{ in: "07:0", out: "15:00" }] }, // one bad time takes the day's punches
    { date: "2026-06-29", hours: 8, punches: [] }, // punch columns not legible
    { date: "2026-07-01", hours: 8, punches: "nope" }, // not even an array
  ],
  eveningHours: null,
});

describe("parseTimecardResponse — punches", () => {
  test("reads pairs, pads the hour, keeps the day when its punches are junk", () => {
    const days = parseTimecardResponse(PUNCHED).days;
    expect(days).toHaveLength(5); // punches never cost a day its hours
    expect(days[0].punches).toEqual([
      { in: "06:45", out: "11:30" },
      { in: "12:00", out: "19:30" },
    ]);
    expect(days[1].punches).toEqual([{ in: "18:45", out: "07:00" }]);
    for (const i of [2, 3, 4]) {
      expect(days[i].punches).toBeUndefined();
      expect(days[i].hours).toBe(8);
    }
  });

  test("a scan without punches parses exactly as before — no stray key", () => {
    expect(parseTimecardResponse(RESPONSE).days).toStrictEqual([
      { date: "2026-06-23", hours: 15.72 },
      { date: "2026-06-25", hours: 12.2 },
      { date: "2026-06-27", hours: 8 },
    ]);
  });
});

describe("timecardCoverage", () => {
  test("counts days inside vs outside the open period", () => {
    const read = parseTimecardResponse(RESPONSE);
    expect(timecardCoverage(read.days, "2026-06-22", "2026-07-05")).toEqual({ inside: 3, outside: 0 });
    expect(timecardCoverage(read.days, "2026-07-06", "2026-07-19")).toEqual({ inside: 0, outside: 3 });
  });
});

describe("applyTimecard — punches are the truth", () => {
  const scheduled = [
    { ...blankShift(), date: "2026-06-23", hours: "15.60", charge: "4", note: "kept" },
    { ...blankShift(), date: "2026-06-25", hours: "12.20" },
    { ...blankShift(), date: "2026-06-30", hours: "12.00" }, // no timecard day → untouched
  ];

  test("updates mismatches, keeps adders, adds picked-up days, leaves the rest", () => {
    const read = parseTimecardResponse(RESPONSE);
    const plan = applyTimecard(scheduled, read.days);
    expect(plan.changed).toEqual([{ date: "2026-06-23", from: "15.60", to: "15.72" }]);
    const updated = plan.shifts.find((s) => s.date === "2026-06-23")!;
    expect(updated.hours).toBe("15.72");
    expect(updated.charge).toBe("4"); // adders survive the true-up
    expect(updated.note).toBe("kept");
    expect(plan.unchanged).toBe(1); // 6/25 already right
    expect(plan.added).toEqual([{ date: "2026-06-27", hours: 8 }]);
    expect(plan.shifts.find((s) => s.date === "2026-06-27")!.hours).toBe("8");
    expect(plan.shifts.find((s) => s.date === "2026-06-30")!.hours).toBe("12.00");
    expect(plan.shifts.map((s) => s.date)).toEqual(["2026-06-23", "2026-06-25", "2026-06-27", "2026-06-30"]);
  });
});
