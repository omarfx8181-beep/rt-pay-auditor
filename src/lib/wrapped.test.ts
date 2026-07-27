/** Year Wrapped: the reel tells the same truth as the Year card. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { ACTUAL_SEED, DEFAULT_CFG_DRAFT, DEMO_SHIFTS } from "./draft.ts";
import type { PayPeriod } from "./periods.ts";
import { buildWrapped } from "./wrapped.ts";

let seq = 0;
const period = (endDate: string, over: Partial<PayPeriod> = {}): PayPeriod => ({
  id: `p${seq++}`,
  startDate: endDate.slice(0, 8) + "01",
  endDate,
  shifts: DEMO_SHIFTS,
  actual: ACTUAL_SEED,
  cfgDraft: DEFAULT_CFG_DRAFT,
  tiers: DEFAULT_TIERS,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe("buildWrapped", () => {
  test("hours, weekends, biggest check, and the caught headline — one year only", () => {
    const shorted = period("2026-06-21", { actual: { ...ACTUAL_SEED, bonus548: "950.00" } });
    const w = buildWrapped([period("2026-07-05"), shorted, period("2025-12-21")], [], "2026", 100)!;
    expect(w.checksCount).toBe(2); // 2025 stays out
    expect(w.biggestCheck).not.toBeNull();
    expect(w.biggestCheck!.netCents).toBeGreaterThan(0);
    expect(w.longestShiftHours).toBeGreaterThanOrEqual(12);
    expect(w.weekendDays).toBeGreaterThan(0); // the demo period works a weekend
    expect(w.caught.caughtCents).toBe(25000); // the shorted June check
    expect(w.ytd.grossCents).toBeGreaterThan(0);
    expect(w.avgCheckNetCents).toBe(Math.round(w.ytd.netCents / 2));
  });

  test("a year with nothing logged → no reel", () => {
    expect(buildWrapped([period("2026-07-05")], [], "2019", 100)).toBeNull();
  });
});
