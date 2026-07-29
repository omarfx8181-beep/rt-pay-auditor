/** Average hours each week — finished checks only, honest denominators. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { ACTUAL_SEED, DEFAULT_CFG_DRAFT, DEMO_SHIFTS, type LeaveDraft } from "./draft.ts";
import type { PayPeriod } from "./periods.ts";
import { weeklyHours } from "./workweek.ts";

let seq = 0;
const period = (endDate: string, over: Partial<PayPeriod> = {}): PayPeriod => ({
  id: `p${seq++}`,
  startDate: endDate.slice(0, 8) + "01",
  endDate,
  shifts: DEMO_SHIFTS, // 112.40 worked hours per fortnight
  actual: ACTUAL_SEED,
  cfgDraft: DEFAULT_CFG_DRAFT,
  tiers: DEFAULT_TIERS,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const TODAY = "2026-07-29";

describe("weeklyHours", () => {
  test("averages worked hours over finished checks; a running period stays out", () => {
    const w = weeklyHours(
      [period("2026-06-21"), period("2026-07-05"), period("2026-08-02")], // last one still running
      "2026",
      TODAY,
    );
    expect(w?.checksCounted).toBe(2);
    expect(w?.workedHours).toBeCloseTo(224.8, 1);
    expect(w?.weeklyHours).toBeCloseTo(56.2, 1);
    expect(w?.perCheckHours).toBeCloseTo(112.4, 1);
  });

  test("record-only periods and other years carry no hours vote", () => {
    const w = weeklyHours(
      [
        period("2026-07-05"),
        period("2026-06-21", { shifts: [], actual: { gross: "1000.00", net: "800.00" } }), // record-only
        period("2025-12-21"), // other year
      ],
      "2026",
      TODAY,
    );
    expect(w?.checksCounted).toBe(1);
    expect(w?.weeklyHours).toBeCloseTo(56.2, 1);
  });

  test("PTO rides the paid average, never the worked one", () => {
    const leave: LeaveDraft[] = [{ id: "l1", date: "2026-07-04", hours: "24", type: "sto" }];
    const w = weeklyHours([period("2026-07-05", { leave })], "2026", TODAY);
    expect(w?.weeklyHours).toBeCloseTo(56.2, 1);
    expect(w?.weeklyPaidHours).toBeCloseTo(68.2, 1); // +24 h over two weeks = +12/week
    expect(w?.leaveHours).toBe(24);
  });

  test("a leave-only fortnight still counts as a finished check", () => {
    const leave: LeaveDraft[] = [{ id: "l2", date: "2026-06-15", hours: "72", type: "sto" }];
    const w = weeklyHours([period("2026-06-21", { shifts: [], actual: {}, leave })], "2026", TODAY);
    expect(w?.checksCounted).toBe(1);
    expect(w?.weeklyHours).toBe(0);
    expect(w?.weeklyPaidHours).toBeCloseTo(36, 1);
  });

  test("null when no finished check carries hours", () => {
    expect(weeklyHours([period("2026-08-02")], "2026", TODAY)).toBeNull();
    expect(weeklyHours([], "2026", TODAY)).toBeNull();
  });
});
