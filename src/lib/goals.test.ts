/** The year goal: grid counting, pace, and engine-priced levers. */
import { describe, expect, test } from "vitest";
import { DEFAULT_CFG, DEFAULT_TIERS } from "./engine.ts";
import { ACTUAL_SEED, DEFAULT_CFG_DRAFT, DEMO_SHIFTS, draftToShift } from "./draft.ts";
import { yearGridEnds, type PayPeriod } from "./periods.ts";
import { buildGoalPlan, buildPickupPlan, goalLevers, parseGoals, pickupValues, tierUnitsForLength } from "./goals.ts";

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

describe("the pickup strategizer", () => {
  test("tier units by length: 12 → 10u, 16 → the CURRENT 8u (never the old tier), 8 → none", () => {
    expect(tierUnitsForLength(DEFAULT_TIERS, 12)).toBe(10);
    expect(tierUnitsForLength(DEFAULT_TIERS, 16)).toBe(8);
    expect(tierUnitsForLength(DEFAULT_TIERS, 8)).toBe(0);
  });

  test("a pickup's worth = OT hours + its tier bonus (the real extra-shift math)", () => {
    const values = pickupValues(SHIFTS, DEFAULT_CFG, DEFAULT_TIERS, [8, 12, 16]);
    // demo period is past 80h, so pickup hours ride the blended OT rate
    expect(values.find((v) => v.hours === 12)!.grossCents).toBe(12 * 8574 + 10 * 5000); // $1,528.88
    // a 16 is 12 OT hours + 4 DOUBLE-TIME hours (past the 12h/day line) + its tier
    expect(values.find((v) => v.hours === 16)!.grossCents).toBe(12 * 8574 + 4 * 10506 + 8 * 5000); // $1,849.12
    expect(values.find((v) => v.hours === 8)!.grossCents).toBe(8 * 8574); // no tier for an 8
  });

  test("recipe: fewest pickups that cover, least overshoot on ties", () => {
    const values = pickupValues(SHIFTS, DEFAULT_CFG, DEFAULT_TIERS, [8, 12, 16]);
    // gap $2,000/check → no single pickup covers ($1,849.12 max);
    // among pairs, 12+8 ($2,214.80) covers with the least overshoot
    const plan = buildPickupPlan(200000, values, "gross", 0)!;
    expect(plan.covers).toBe(true);
    expect(plan.pickupsPerCheck).toBe(2);
    expect(plan.parts).toEqual([
      { hours: 12, count: 1 },
      { hours: 8, count: 1 },
    ]);
    expect(plan.addsPerCheckCents).toBe(12 * 8574 + 10 * 5000 + 8 * 8574);
  });

  test("availability that can't reach → covers false, best effort reported honestly", () => {
    const values = pickupValues(SHIFTS, DEFAULT_CFG, DEFAULT_TIERS, [8]);
    const plan = buildPickupPlan(500000, values, "gross", 2)!; // $5k gap, two 8s max
    expect(plan.covers).toBe(false);
    expect(plan.parts).toEqual([{ hours: 8, count: 2 }]);
    expect(plan.maxAddablePerCheckCents).toBe(2 * 8 * 8574);
  });

  test("no gap → empty recipe, already covered", () => {
    const values = pickupValues(SHIFTS, DEFAULT_CFG, DEFAULT_TIERS, [12]);
    const plan = buildPickupPlan(0, values, "gross", 3)!;
    expect(plan.covers).toBe(true);
    expect(plan.parts).toEqual([]);
  });
});
