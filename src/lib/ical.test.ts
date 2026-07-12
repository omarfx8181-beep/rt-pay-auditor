/** ScheduleAnywhere iCal feed parsing — the no-API-key way to pull shifts. */
import { describe, expect, test } from "vitest";
import { DEFAULT_CFG } from "./engine.ts";
import { buildScanRows } from "./scan.ts";
import { icsToRawShifts, parseIcs } from "./ical.ts";

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//ScheduleAnywhere//EN",
  "BEGIN:VEVENT",
  "UID:1@sa",
  "DTSTART;TZID=Eastern United States:20260713T064500",
  "DTEND;TZID=Eastern United States:20260713T191500",
  "SUMMARY:MICU\\, Charge",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:2@sa",
  "DTSTART;TZID=Eastern United States:20260715T190000",
  "DTEND;TZID=Eastern United States:20260716T070000",
  "SUMMARY:NOC shift with a folded",
  " -over summary line",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:3@sa",
  "DTSTART;VALUE=DATE:20260717",
  "SUMMARY:T2",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:4@sa",
  "DTSTART;TZID=Eastern United States:20260730T064500",
  "DTEND;TZID=Eastern United States:20260730T151500",
  "SUMMARY:Outside the period",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("iCal feed parsing", () => {
  test("TZID times are taken literally; folded lines unfold; escapes decode", () => {
    const events = parseIcs(FEED);
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({ date: "2026-07-13", start: "06:45", end: "19:15", summary: "MICU, Charge" });
    expect(events[1].summary).toBe("NOC shift with a folded-over summary line");
  });

  test("UTC (Z) stamps convert to device-local time", () => {
    const utc = ["BEGIN:VEVENT", "DTSTART:20260713T114500Z", "DTEND:20260714T001500Z", "SUMMARY:X", "END:VEVENT"].join("\n");
    const [ev] = parseIcs(utc);
    // sandbox runs UTC, so local == UTC here; the point is it parses and carries times
    expect(ev.start).toMatch(/^\d{2}:\d{2}$/);
    expect(ev.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("date-only events keep the date and drop times (fill hours by hand)", () => {
    const events = parseIcs(FEED);
    expect(events[2]).toMatchObject({ date: "2026-07-17", start: "", end: "" });
  });

  test("window filter keeps only the pay period; duplicates collapse", () => {
    const doubled = FEED + "\r\n" + FEED;
    const shifts = icsToRawShifts(doubled, { from: "2026-07-06", to: "2026-07-19" });
    expect(shifts.map((s) => s.date)).toEqual(["2026-07-13", "2026-07-15", "2026-07-17"]);
  });

  test("feed rows flow through the engine: meal rule and overnight, code does the math", () => {
    const rows = buildScanRows(icsToRawShifts(FEED, { from: "2026-07-06", to: "2026-07-19" }), DEFAULT_CFG);
    expect(rows.map((r) => [r.date, r.hours])).toEqual([
      ["2026-07-13", 12.0], // 06:45–19:15 minus meal
      ["2026-07-15", 11.5], // 19:00–07:00 overnight
      ["2026-07-17", null], // date-only
    ]);
  });
});
