/** "Why is this check different?" — engine-line drivers, pure code. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { DEFAULT_CFG_DRAFT, type ShiftDraft } from "./draft.ts";
import type { PayPeriod } from "./periods.ts";
import { checkDiff } from "./checkDiff.ts";

let seq = 0;
const draft = (date: string, hours = "12", units548 = "0"): ShiftDraft => ({
  id: `d${seq++}`,
  date,
  hours,
  charge: "0",
  premium: "0",
  preceptor: "0",
  units548,
  note: "",
});

const period = (startDate: string, endDate: string, shifts: ShiftDraft[], over: Partial<PayPeriod> = {}): PayPeriod => ({
  id: `p${seq++}`,
  startDate,
  endDate,
  shifts,
  actual: {},
  cfgDraft: DEFAULT_CFG_DRAFT,
  tiers: DEFAULT_TIERS,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe("checkDiff", () => {
  // prev: two weekday 12s. cur: four shifts incl. a Saturday with 10 bonus units.
  const prev = period("2026-06-08", "2026-06-21", [draft("2026-06-09"), draft("2026-06-10")]);
  const cur = period("2026-06-22", "2026-07-05", [
    draft("2026-06-23"),
    draft("2026-06-24"),
    draft("2026-06-25"),
    draft("2026-06-27", "12", "10"), // Saturday + 10 units
  ]);

  test("drivers carry the exact dollars: regular hours, bonus units, weekend", () => {
    const d = checkDiff(cur, [prev, cur])!;
    expect(d.prevEnd).toBe("2026-06-21");
    expect(d.shiftsDelta).toBe(2);
    const byKey = Object.fromEntries(d.drivers.map((x) => [x.key, x]));
    expect(byKey.reg.deltaCents).toBe(24 * 5253); // 48h vs 24h straight time
    expect(byKey.reg.qtyDelta).toBe(24);
    expect(byKey.bonus548.deltaCents).toBe(10 * 5000);
    expect(byKey.bonus548.isUnits).toBe(true);
    expect(byKey.weekend.deltaCents).toBe(12 * 200);
    // headline = the same engine money (both periods are estimates here)
    expect(d.grossDeltaCents).toBe(24 * 5253 + 10 * 5000 + 12 * 200);
    expect(d.netDeltaCents).toBeLessThan(d.grossDeltaCents);
    // biggest driver first
    expect(d.drivers[0].key).toBe("reg");
  });

  test("skips empty periods when picking the previous check", () => {
    const empty = period("2026-06-08", "2026-06-21", []);
    const older = period("2026-05-25", "2026-06-07", [draft("2026-05-26")]);
    const d = checkDiff(cur, [older, empty, cur])!;
    expect(d.prevEnd).toBe("2026-06-07");
  });

  test("a stub-only previous check compares totals, never lines", () => {
    // bulk stub scans create exactly this shape: money, no shifts
    const bare = period("2026-06-08", "2026-06-21", [], { actual: { gross: "8850.00", net: "5770.00" } });
    const d = checkDiff(cur, [bare, cur])!;
    expect(d.prevBare).toBe(true);
    expect(d.drivers).toEqual([]); // never "the whole check is new money"
    expect(d.shiftsDelta).toBe(0);
    expect(d.grossDeltaCents).not.toBe(0); // the honest headline survives
  });

  test("driver labels are plain language — never payroll codes", () => {
    const d = checkDiff(cur, [prev, cur])!;
    for (const dr of d.drivers) expect(dr.label).not.toMatch(/548|308|320/);
  });

  test("first period ever → no diff", () => {
    expect(checkDiff(cur, [cur])).toBeNull();
  });
});
