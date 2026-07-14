/** Payday math + the calendar file iOS imports. */
import { describe, expect, test } from "vitest";
import { buildPaydayCalendar, daysUntil, paydayFor, upcomingPaydays } from "./payday.ts";

describe("payday math", () => {
  test("payday = period end + delay (Fairview: the Friday after)", () => {
    expect(paydayFor("2026-07-05", 5)).toBe("2026-07-10"); // Sun end → Fri pay
    expect(paydayFor("2026-07-19", 5)).toBe("2026-07-24");
  });

  test("upcoming paydays walk the biweekly grid", () => {
    expect(upcomingPaydays("2026-07-05", 5, 3)).toEqual(["2026-07-10", "2026-07-24", "2026-08-07"]);
  });

  test("daysUntil is signed — negative once payday has passed", () => {
    expect(daysUntil("2026-07-08", "2026-07-10")).toBe(2);
    expect(daysUntil("2026-07-10", "2026-07-10")).toBe(0);
    expect(daysUntil("2026-07-14", "2026-07-10")).toBe(-4);
  });
});

describe("payday calendar file", () => {
  test("one all-day VEVENT per payday, stable UIDs, valid all-day span", () => {
    const ics = buildPaydayCalendar(["2026-07-10", "2026-07-24"]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260710");
    expect(ics).toContain("DTEND;VALUE=DATE:20260711"); // exclusive end = next day
    expect(ics).toContain("UID:rt-pay-payday-20260710@rt-pay");
    expect(ics).toContain("SUMMARY:Payday — check your stub in RT Pay");
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
  });
});
