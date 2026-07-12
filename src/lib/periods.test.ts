/** M3 unit tests — period date logic, YTD rollups, backup merge. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { ACTUAL_SEED, DEFAULT_CFG_DRAFT, DEMO_SHIFTS } from "./draft.ts";
import {
  addDays,
  mergeBackup,
  nextPeriodRange,
  parseBackup,
  periodLabel,
  rollupYtd,
  type PayPeriod,
} from "./periods.ts";

const demoPeriod = (over: Partial<PayPeriod> = {}): PayPeriod => ({
  id: "p1",
  startDate: "2026-06-22",
  endDate: "2026-07-05",
  shifts: DEMO_SHIFTS,
  actual: ACTUAL_SEED,
  cfgDraft: DEFAULT_CFG_DRAFT,
  tiers: DEFAULT_TIERS,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe("period dates", () => {
  test("addDays crosses month ends without timezone drift", () => {
    expect(addDays("2026-07-05", 1)).toBe("2026-07-06");
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-07-06", 13)).toBe("2026-07-19");
  });

  test("nextPeriodRange: the biweekly window right after the last period", () => {
    expect(nextPeriodRange("2026-07-05")).toEqual({ startDate: "2026-07-06", endDate: "2026-07-19" });
  });

  test("periodLabel reads like a pay stub header", () => {
    expect(periodLabel("2026-06-22", "2026-07-05")).toBe("Jun 22 – Jul 5, 2026");
  });
});

describe("YTD rollup", () => {
  test("demo period rolls up to its golden engine numbers", () => {
    const ytd = rollupYtd([demoPeriod()], "2026");
    expect(ytd.periodCount).toBe(1);
    expect(ytd.grossCents).toBe(886520);
    expect(ytd.netCents).toBe(578197);
    expect(ytd.units548).toBe(24);
    expect(ytd.otHours).toBeCloseTo(15.8, 10);
    expect(ytd.dtHours).toBeCloseTo(16.6, 10);
  });

  test("periods from other years are excluded", () => {
    const ytd = rollupYtd(
      [demoPeriod(), demoPeriod({ id: "p0", startDate: "2025-12-15", endDate: "2025-12-28" })],
      "2026",
    );
    expect(ytd.periodCount).toBe(1);
  });

  test("two identical periods double every total", () => {
    const ytd = rollupYtd([demoPeriod(), demoPeriod({ id: "p2" })], "2026");
    expect(ytd.grossCents).toBe(2 * 886520);
    expect(ytd.netCents).toBe(2 * 578197);
    expect(ytd.units548).toBe(48);
  });
});

describe("backup merge", () => {
  test("parseBackup rejects foreign or malformed files", () => {
    expect(() => parseBackup('{"app":"other","periods":[]}')).toThrow(/not an rt pay auditor/i);
    expect(() => parseBackup('{"app":"rt-pay-auditor","periods":[{"nope":true}]}')).toThrow(/malformed/i);
  });

  test("merge by id: newer updatedAt wins, older is skipped, new ids are added", () => {
    const mine = demoPeriod({ updatedAt: 100 });
    const theirsOlder = demoPeriod({ updatedAt: 50, actual: {} });
    const theirsNewer = demoPeriod({ updatedAt: 200, actual: {} });
    const brandNew = demoPeriod({ id: "p9", updatedAt: 10 });

    const a = mergeBackup([mine], [theirsOlder, brandNew]);
    expect(a.added).toBe(1);
    expect(a.updated).toBe(0);
    expect(a.skipped).toBe(1);
    expect(a.merged.find((p) => p.id === "p1")?.updatedAt).toBe(100);

    const b = mergeBackup([mine], [theirsNewer]);
    expect(b.updated).toBe(1);
    expect(b.merged.find((p) => p.id === "p1")?.updatedAt).toBe(200);
  });
});
