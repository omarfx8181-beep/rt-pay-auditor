/** M3 unit tests — period date logic, YTD rollups, backup merge. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { ACTUAL_SEED, DEFAULT_CFG_DRAFT, DEMO_SHIFTS } from "./draft.ts";
import {
  addDays,
  buildBackup,
  mergeBackup,
  nextPeriodRange,
  parseBackup,
  periodLabel,
  prevPeriodRange,
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

describe("YTD rollup — stub actuals outrank engine estimates", () => {
  test("demo period uses its STUB numbers (real gross/net beat expected)", () => {
    const ytd = rollupYtd([demoPeriod()], "2026");
    expect(ytd.periodCount).toBe(1);
    expect(ytd.stubCount).toBe(1);
    expect(ytd.grossCents).toBe(886522); // $8,865.22 off the stub, not 886520 expected
    expect(ytd.netCents).toBe(578199);
    expect(ytd.units548).toBe(24);
    expect(ytd.otHours).toBeCloseTo(15.8, 10);
    expect(ytd.dtHours).toBeCloseTo(16.6, 10);
  });

  test("a period without a stub falls back to engine expected", () => {
    const noStub = demoPeriod({ id: "p2", actual: {} });
    const ytd = rollupYtd([noStub], "2026");
    expect(ytd.stubCount).toBe(0);
    expect(ytd.grossCents).toBe(886520); // engine-exact
    expect(ytd.netCents).toBe(578197);
  });

  test("periods from other years are excluded", () => {
    const ytd = rollupYtd(
      [demoPeriod(), demoPeriod({ id: "p0", startDate: "2025-12-15", endDate: "2025-12-28" })],
      "2026",
    );
    expect(ytd.periodCount).toBe(1);
  });

  test("deduction buckets: stub lines outrank engine estimates, and split gross − net exactly", () => {
    const ytd = rollupYtd([demoPeriod()], "2026");
    expect(ytd.bucketPeriodCount).toBe(1);
    expect(ytd.bucketSkippedCount).toBe(0);
    expect(ytd.taxesCents).toBe(229840); // fed+mn+ss+medicare+mnFam+mnMed off the stub
    expect(ytd.pretaxCents).toBe(68398);
    expect(ytd.aftertaxCents).toBe(9904);
    expect(ytd.imputedCents).toBe(181);
    expect(ytd.taxesCents + ytd.pretaxCents + ytd.aftertaxCents + ytd.imputedCents).toBe(ytd.grossCents - ytd.netCents);
  });

  test("deduction buckets: engine estimates fill in when no stub lines exist — still exact", () => {
    const ytd = rollupYtd([demoPeriod({ actual: {} })], "2026");
    expect(ytd.bucketPeriodCount).toBe(1);
    expect(ytd.taxesCents + ytd.pretaxCents + ytd.aftertaxCents + ytd.imputedCents).toBe(886520 - 578197);
  });

  test("deduction buckets: line actuals alone are detail — a stub-filled period with no shifts splits", () => {
    const filled = demoPeriod({ id: "pf", shifts: [] });
    const ytd = rollupYtd([filled], "2026");
    expect(ytd.bucketPeriodCount).toBe(1);
    expect(ytd.taxesCents).toBe(229840);
    expect(ytd.pretaxCents).toBe(68398);
  });

  test("deduction buckets: a totals-only period can't be split — counted, never guessed", () => {
    const totalsOnly = demoPeriod({ id: "pt", shifts: [], actual: { gross: "3000", net: "2000" } });
    const ytd = rollupYtd([demoPeriod(), totalsOnly], "2026");
    expect(ytd.bucketPeriodCount).toBe(1);
    expect(ytd.bucketSkippedCount).toBe(1);
    expect(ytd.grossCents).toBe(886522 + 300000); // totals still count in the year
    expect(ytd.taxesCents).toBe(229840); // buckets stay stub-true — no invented split
  });

  test("deduction buckets: an empty period contributes nothing and isn't 'totals only'", () => {
    const empty = demoPeriod({ id: "pe", shifts: [], actual: {} });
    const ytd = rollupYtd([empty], "2026");
    expect(ytd.bucketPeriodCount).toBe(0);
    expect(ytd.bucketSkippedCount).toBe(0);
    expect(ytd.taxesCents).toBe(0);
  });

  test("other income rolls into the totals; blank net means nothing withheld", () => {
    const ytd = rollupYtd([demoPeriod()], "2026", [
      { id: "o1", date: "2026-03-15", source: "Side gig", gross: "1,200.50", net: "1000", updatedAt: 1 },
      { id: "o2", date: "2026-05-01", source: "Cash job", gross: "300", net: "", updatedAt: 1 },
      { id: "o3", date: "2025-11-01", source: "Last year", gross: "999", net: "", updatedAt: 1 },
    ]);
    expect(ytd.otherCount).toBe(2); // 2025 entry excluded
    expect(ytd.otherGrossCents).toBe(120050 + 30000);
    expect(ytd.otherNetCents).toBe(100000 + 30000); // blank net → equals gross
    expect(ytd.totalGrossCents).toBe(886522 + 150050);
    expect(ytd.totalNetCents).toBe(578199 + 130000);
  });
});

describe("past-stub entry", () => {
  test("prevPeriodRange steps back exactly one biweekly window", () => {
    expect(prevPeriodRange("2026-06-22")).toEqual({ startDate: "2026-06-08", endDate: "2026-06-21" });
  });
});

describe("backup merge", () => {
  test("parseBackup rejects foreign or malformed files", () => {
    expect(() => parseBackup('{"app":"other","periods":[]}')).toThrow(/not an rt pay auditor/i);
    expect(() => parseBackup('{"app":"rt-pay-auditor","periods":[{"nope":true}]}')).toThrow(/malformed/i);
  });

  test("v2 round-trips other income; v1 files (no otherIncome) still import", () => {
    const other = [{ id: "o1", date: "2026-03-15", source: "Side gig", gross: "100", net: "", updatedAt: 5 }];
    const v2 = parseBackup(JSON.stringify(buildBackup([demoPeriod()], other, "2026-07-12T00:00:00Z")));
    expect(v2.otherIncome).toHaveLength(1);
    const v1 = parseBackup('{"app":"rt-pay-auditor","version":1,"exportedAt":"x","periods":[]}');
    expect(v1.otherIncome).toEqual([]);
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
