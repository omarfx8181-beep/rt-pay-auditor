/** The year goal: grid counting, pace, and engine-priced levers. */
import { describe, expect, test } from "vitest";
import { DEFAULT_CFG, DEFAULT_TIERS } from "./engine.ts";
import { ACTUAL_SEED, DEFAULT_CFG_DRAFT, DEMO_SHIFTS, draftToShift } from "./draft.ts";
import { yearGridEnds, type PayPeriod } from "./periods.ts";
import { buildGoalPlan, goalLevers, parseGoals } from "./goals.ts";

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

const SHIFTS = DEMO_SHIFTS.map(draftToShift);

describe("yearGridEnds", () => {
  test("extends the grid across the whole year from one known period", () => {
    const ends = yearGridEnds([demoPeriod()], "2026");
    expect(ends).toContain("2026-07-05");
    expect(ends[0]).toBe("2026-01-04"); // walks back to the year's first grid end
    expect(ends[ends.length - 1]).toBe("2026-12-20");
    expect(ends.length).toBe(26); // biweekly 2026 on this grid
    expect(new Set(ends).size).toBe(ends.length);
  });

  test("empty input has no grid", () => {
    expect(yearGridEnds([], "2026")).toEqual([]);
  });
});

describe("goalLevers — engine-priced effort", () => {
  test("one extra shift is worth exactly what the what-if card says", () => {
    const levers = goalLevers(SHIFTS, DEFAULT_CFG);
    // The demo period is past 80 straight hours, so 12 more hours are OT.
    expect(levers.perShiftGrossCents).toBe(12 * 8574); // 12h × blended OT rate
    expect(levers.perShiftNetCents).toBeLessThan(levers.perShiftGrossCents);
    expect(levers.perOtHourGrossCents).toBe(8574);
    expect(levers.perUnitGrossCents).toBe(5000);
    expect(levers.perUnitNetCents).toBeGreaterThan(2500); // marginal stack keeps well over half
  });
});

describe("buildGoalPlan", () => {
  const levers = goalLevers(SHIFTS, DEFAULT_CFG);

  test("progress, pace, and per-check plan from real numbers", () => {
    // Goal $150k gross; one real check ($8,865.22) with 14 grid checks elapsed by 7/15.
    const plan = buildGoalPlan({
      targetCents: 15000000,
      kind: "gross",
      madeCents: 886522,
      periods: [demoPeriod()],
      year: "2026",
      todayIso: "2026-07-15",
      levers,
    })!;
    expect(plan.checksInYear).toBe(26);
    expect(plan.checksElapsed).toBe(14); // ends through 7/5 inclusive
    expect(plan.checksLeft).toBe(12);
    expect(plan.remainingCents).toBe(15000000 - 886522);
    expect(plan.progress).toBeCloseTo(886522 / 15000000, 5);
    // straight line by check 14 of 26 = 8,076,923¢ — far ahead of 886,522 made
    expect(plan.paceDeltaCents).toBeLessThan(0);
    expect(plan.neededPerCheckCents).toBe(Math.round((15000000 - 886522) / 12));
    expect(plan.extraPerCheckCents).toBe(plan.neededPerCheckCents - Math.round(886522 / 14));
    expect(plan.otHoursPerCheck).toBeCloseTo(plan.extraPerCheckCents / 8574, 0);
    expect(plan.extraShiftsTotal).toBeGreaterThan(0);
  });

  test("a goal your pace already covers needs zero extra effort", () => {
    const plan = buildGoalPlan({
      targetCents: 1000000, // $10k when $8.8k is already in with 12 checks left
      kind: "gross",
      madeCents: 886522,
      periods: [demoPeriod()],
      year: "2026",
      todayIso: "2026-07-15",
      levers,
    })!;
    expect(plan.extraPerCheckCents).toBe(0);
    expect(plan.otHoursPerCheck).toBe(0);
    expect(plan.paceDeltaCents).toBeGreaterThan(0); // ahead of straight-line
  });

  test("goal reached → done, remaining zero, progress capped at 1", () => {
    const plan = buildGoalPlan({
      targetCents: 800000,
      kind: "takehome",
      madeCents: 886522,
      periods: [demoPeriod()],
      year: "2026",
      todayIso: "2026-07-15",
      levers,
    })!;
    expect(plan.done).toBe(true);
    expect(plan.remainingCents).toBe(0);
    expect(plan.progress).toBe(1);
  });

  test("no target → no plan; junk settings parse to empty", () => {
    expect(buildGoalPlan({ targetCents: 0, kind: "gross", madeCents: 0, periods: [], year: "2026", todayIso: "2026-07-15", levers })).toBeNull();
    expect(parseGoals("not json")).toEqual({});
    expect(parseGoals(null)).toEqual({});
    expect(parseGoals(JSON.stringify({ "2026": { target: "150000", kind: "gross" } }))["2026"].target).toBe("150000");
  });
});
