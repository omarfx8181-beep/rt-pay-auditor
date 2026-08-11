/** Shifts → the calendar file the phone imports: windows, all-day fallback, escaping. */
import { describe, expect, test } from "vitest";
import type { ShiftDraft } from "./draft.ts";
import { buildShiftsIcs, shiftsIcsName } from "./shiftsIcs.ts";

const draft = (over: Partial<ShiftDraft> = {}): ShiftDraft => ({
  id: "s1",
  date: "2026-07-27",
  hours: "12",
  charge: "0",
  premium: "0",
  preceptor: "0",
  units548: "0",
  note: "",
  ...over,
});

describe("VCALENDAR envelope", () => {
  test("paired BEGIN/END, CRLF only, calendar name, no trailing newline", () => {
    const ics = buildShiftsIcs([draft(), draft({ id: "s2", date: "2026-07-28" })], "Jun 22 – Jul 5, 2026");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//RT Pay//shifts//EN\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    expect(/[^\r]\n/.test(ics)).toBe(false); // every LF is part of a CRLF
    expect(ics).toContain("X-WR-CALNAME:Jun 22 – Jul 5\\, 2026"); // the name is escaped too
  });

  test("no shifts → a valid empty calendar", () => {
    expect(buildShiftsIcs([], "Empty")).toBe(
      ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RT Pay//shifts//EN", "X-WR-CALNAME:Empty", "END:VCALENDAR"].join("\r\n"),
    );
  });
});

describe("timed events", () => {
  test("a night window rolls DTEND to the next day, floating local (no Z, no TZID)", () => {
    const ics = buildShiftsIcs([draft({ note: "sched 18:30–07:00" })], "cal");
    expect(ics).toContain("DTSTART:20260727T183000");
    expect(ics).toContain("DTEND:20260728T070000");
    expect(ics).not.toContain("TZID");
    expect(/DT(START|END):\d{8}T\d{6}Z/.test(ics)).toBe(false);
  });

  test("a day window stays on its own date", () => {
    const ics = buildShiftsIcs([draft({ note: "sched 06:45–19:15" })], "cal");
    expect(ics).toContain("DTSTART:20260727T064500");
    expect(ics).toContain("DTEND:20260727T191500");
  });

  test("summary carries the hours, trailing zeros trimmed, charge flagged", () => {
    const ics = buildShiftsIcs(
      [draft({ hours: "12.00" }), draft({ id: "s2", date: "2026-07-28", hours: "15.60", charge: "12" })],
      "cal",
    );
    expect(ics).toContain("SUMMARY:Work · 12h");
    expect(ics).toContain("SUMMARY:Work · 15.6h · charge");
  });
});

describe("all-day fallback", () => {
  test("no readable window → VALUE=DATE with an exclusive next-day end", () => {
    const ics = buildShiftsIcs([draft({ note: "16-hr extra" })], "cal");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260727");
    expect(ics).toContain("DTEND;VALUE=DATE:20260728");
    expect(ics).not.toContain("DTSTART:2026");
  });

  test("skips shifts with no date", () => {
    const ics = buildShiftsIcs([draft({ id: "none", date: "" }), draft()], "cal");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).not.toContain("rt-pay-shift-none");
  });
});

describe("text escaping", () => {
  test("the note rides verbatim in DESCRIPTION with commas, semicolons and backslashes escaped", () => {
    const ics = buildShiftsIcs([draft({ note: "Ext > 4h, transport; call-in \\ float" })], "cal");
    expect(ics).toContain("DESCRIPTION:Ext > 4h\\, transport\\; call-in \\\\ float");
  });

  test("a blank note emits no DESCRIPTION line", () => {
    expect(buildShiftsIcs([draft()], "cal")).not.toContain("DESCRIPTION");
  });
});

describe("UIDs", () => {
  test("stable across rebuilds and edits, unique per shift", () => {
    const a = buildShiftsIcs([draft({ hours: "12", note: "" })], "cal");
    const b = buildShiftsIcs([draft({ hours: "15.6", note: "sched 18:30–07:00" })], "cal");
    expect(a).toContain("UID:rt-pay-shift-s1@rt-pay");
    expect(b).toContain("UID:rt-pay-shift-s1@rt-pay"); // same shift, edited → same event
    expect(buildShiftsIcs([draft({ id: "s2" })], "cal")).toContain("UID:rt-pay-shift-s2@rt-pay");
  });
});

test("download name is dated by the period start", () => {
  expect(shiftsIcsName("2026-06-22")).toBe("rt-pay-shifts-2026-06-22.ics");
});
