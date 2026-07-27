/** Per-shift price tags: whole period with vs without — OT interplay exact. */
import { describe, expect, test } from "vitest";
import { DEFAULT_CFG, type Shift } from "./engine.ts";
import { shiftWorths } from "./worth.ts";

const mk = (id: string, date: string, hours = 12): Shift => ({
  id,
  date,
  hours,
  chargeHours: 0,
  premiumHours: 0,
  preceptorHours: 0,
  units548: 0,
});

// 2026-01-05 is a Monday; Jan 10 a Saturday.
const WEEKDAYS = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-12", "2026-01-13"];

describe("shiftWorths", () => {
  test("past 80 hours, every 12-hr shift's marginal value rides the OT rate", () => {
    const shifts = [...WEEKDAYS, "2026-01-14"].map((d, i) => mk(`s${i}`, d)); // 8 × 12h = 96h
    const worths = shiftWorths(shifts, DEFAULT_CFG);
    // removing any one leaves 84h — still over 80 — so each shift's last
    // 12 hours are exactly the hours that rode the blended OT rate
    expect(worths.get("s0")!.grossCents).toBe(12 * 8574);
    expect(worths.get("s7")!.grossCents).toBe(12 * 8574);
    expect(worths.get("s0")!.netCents).toBeGreaterThan(0);
    expect(worths.get("s0")!.netCents).toBeLessThan(worths.get("s0")!.grossCents);
  });

  test("a Saturday shift carries its weekend pay on top", () => {
    const shifts = [...WEEKDAYS.map((d, i) => mk(`s${i}`, d)), mk("sat", "2026-01-10")]; // 96h, one weekend day
    const worths = shiftWorths(shifts, DEFAULT_CFG);
    expect(worths.get("sat")!.grossCents).toBe(12 * 8574 + 12 * DEFAULT_CFG.weekendDiffCents);
  });

  test("under the OT line a shift is worth straight time", () => {
    const shifts = [mk("a", "2026-01-05"), mk("b", "2026-01-06")]; // 24h — nowhere near 80
    const worths = shiftWorths(shifts, DEFAULT_CFG);
    expect(worths.get("a")!.grossCents).toBe(12 * DEFAULT_CFG.baseRateCents);
  });

  test("no shifts → empty map", () => {
    expect(shiftWorths([], DEFAULT_CFG).size).toBe(0);
  });
});
