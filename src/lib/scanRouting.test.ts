/**
 * Scan routing: a stub files itself into the period it belongs to, and a
 * schedule spanning the boundary splits by pay period. Pure decisions,
 * fully pinned here before any UI relies on them.
 */
import { describe, expect, test } from "vitest";
import { groupRowsByPeriod, matchStubPeriod } from "./scanRouting.ts";
import { ytdThroughDate, type PayPeriod } from "./periods.ts";
import { DEMO_SHIFTS, DEFAULT_CFG_DRAFT, ACTUAL_SEED } from "./draft.ts";
import { DEFAULT_TIERS } from "./engine.ts";
import type { ScanRow } from "./scan.ts";

const period = (id: string, startDate: string, endDate: string, extra?: Partial<PayPeriod>): PayPeriod => ({
  id,
  startDate,
  endDate,
  shifts: [],
  leave: [],
  actual: {},
  cfgDraft: DEFAULT_CFG_DRAFT,
  tiers: DEFAULT_TIERS,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

// June (seeded, with real shifts + stub) and July (current, empty — like
// createNext, its per-period evening hours start at zero).
const JUNE = period("june", "2026-06-22", "2026-07-05", { shifts: DEMO_SHIFTS, actual: ACTUAL_SEED });
const JULY = period("july", "2026-07-06", "2026-07-19", { cfgDraft: { ...DEFAULT_CFG_DRAFT, eveningHours: "0" } });
const PERIODS = [JUNE, JULY];

describe("matchStubPeriod — a stub knows where it belongs", () => {
  test("stub for the open period → current (no routing)", () => {
    expect(matchStubPeriod(PERIODS, "july", "2026-07-06", "2026-07-19")).toEqual({ kind: "current" });
  });

  test("stub for another logged period → route to it", () => {
    const r = matchStubPeriod(PERIODS, "july", "2026-06-22", "2026-07-05");
    expect(r.kind).toBe("existing");
    if (r.kind === "existing") expect(r.period.id).toBe("june");
  });

  test("end date alone is enough — containment, not equality", () => {
    const r = matchStubPeriod(PERIODS, "july", "", "2026-06-28");
    expect(r.kind).toBe("existing");
    if (r.kind === "existing") expect(r.period.id).toBe("june");
  });

  test("stub for a period the app has never seen → create its window", () => {
    const r = matchStubPeriod(PERIODS, "july", "2026-05-25", "2026-06-07");
    expect(r).toEqual({ kind: "create", startDate: "2026-05-25", endDate: "2026-06-07" });
  });

  test("no start date on the stub → biweekly window derived from the end", () => {
    const r = matchStubPeriod(PERIODS, "july", "", "2026-06-07");
    expect(r).toEqual({ kind: "create", startDate: "2026-05-25", endDate: "2026-06-07" });
  });

  test("unreadable dates → stay on the current period", () => {
    expect(matchStubPeriod(PERIODS, "july", "", "")).toEqual({ kind: "current" });
  });
});

describe("groupRowsByPeriod — schedules split across the boundary", () => {
  const row = (id: string, date: string): ScanRow => ({ id, date, start: "06:45", end: "19:15", label: "", hours: 12 });

  test("rows split into current, next period, and skipped-outside", () => {
    const g = groupRowsByPeriod(
      [
        row("a", "2026-07-08"), // current
        row("b", "2026-07-19"), // current, last day
        row("c", "2026-07-20"), // next period, first day
        row("d", "2026-07-28"), // next period
        row("e", "2026-06-30"), // the past → outside
        row("f", "2026-09-15"), // beyond the horizon → outside
      ],
      "2026-07-06",
      "2026-07-19",
    );
    expect(g.current.map((r) => r.id)).toEqual(["a", "b"]);
    expect(g.future).toHaveLength(1);
    expect(g.future[0]).toMatchObject({ startDate: "2026-07-20", endDate: "2026-08-02" });
    expect(g.future[0].rows.map((r) => r.id)).toEqual(["c", "d"]);
    expect(g.outside.map((r) => r.id)).toEqual(["e", "f"]);
  });

  test("two periods ahead stay on the biweekly grid", () => {
    const g = groupRowsByPeriod([row("x", "2026-08-05")], "2026-07-06", "2026-07-19");
    expect(g.future[0]).toMatchObject({ startDate: "2026-08-03", endDate: "2026-08-16" });
  });

  test("undated rows stay with the period being looked at", () => {
    const g = groupRowsByPeriod([row("u", "")], "2026-07-06", "2026-07-19");
    expect(g.current).toHaveLength(1);
  });
});

describe("ytdThroughDate — the app's own year total through a stub's YTD date", () => {
  test("stub-true periods outrank estimates, cut off at asOfEnd, same year only", () => {
    const throughJune = ytdThroughDate(PERIODS, "2026-07-05");
    // June has the real stub entered → its actual gross/net count.
    expect(throughJune.grossCents).toBe(886522);
    expect(throughJune.netCents).toBe(578199);
    expect(throughJune.periodCount).toBe(1); // July ends after asOfEnd
    expect(throughJune.stubCount).toBe(1);

    const lastYear = ytdThroughDate(PERIODS, "2025-12-31");
    expect(lastYear.periodCount).toBe(0);
  });

  test("estimated periods contribute their computed values until a stub lands", () => {
    const withEmptyJuly = ytdThroughDate(PERIODS, "2026-07-19");
    expect(withEmptyJuly.periodCount).toBe(2);
    expect(withEmptyJuly.stubCount).toBe(1);
    // Shiftless July still carries the $1.81 imputed-life line — an
    // estimate, exactly what the anchor comparison is meant to expose.
    expect(withEmptyJuly.grossCents).toBe(886522 + 181);
  });
});
