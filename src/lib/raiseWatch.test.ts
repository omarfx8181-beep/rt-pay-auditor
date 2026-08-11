/** Raise watch: reg$ ÷ the STUB's own reg hours vs the configured rate, nickel tolerance. */
import { describe, expect, test } from "vitest";
import { computePeriod, DEFAULT_CFG } from "./engine.ts";
import { ACTUAL_SEED, DEMO_SHIFTS, draftToShift } from "./draft.ts";
import { raiseCheck } from "./raiseWatch.ts";

// 80 reg hours × $52.00 = $4,160.00 — round numbers make the drift cases readable.
const BASE = 5200;
const HOURS = 80;
const at = (rateCents: number) => ((rateCents * HOURS) / 100).toFixed(2);
/** The corroborated shape: the stub's hours and the engine's agree. */
const on = (actualReg: string, hours: number, baseRateCents: number) => ({
  actualReg,
  stubRegHours: hours.toFixed(2),
  regHours: hours,
  baseRateCents,
});

describe("raiseCheck", () => {
  test("the real 6/22–7/05 stub implies exactly the configured rate", () => {
    const demo = computePeriod(DEMO_SHIFTS.map(draftToShift), DEFAULT_CFG);
    // the assumption this lib rests on: reg line = reg hours × base rate
    expect(demo.regHours).toBe(80);
    expect(raiseCheck(on(ACTUAL_SEED.reg, demo.regHours, DEFAULT_CFG.baseRateCents))).toBeNull();
  });

  test("exact match is no signal", () => {
    expect(raiseCheck(on("4160.00", HOURS, BASE))).toBeNull();
  });

  test("a nickel of drift either way is rounding, not a raise", () => {
    expect(raiseCheck(on(at(BASE + 5), HOURS, BASE))).toBeNull();
    expect(raiseCheck(on(at(BASE - 5), HOURS, BASE))).toBeNull();
  });

  test("six cents clears the tolerance in both directions", () => {
    expect(raiseCheck(on(at(BASE + 6), HOURS, BASE))).toEqual({
      impliedRateCents: 5206,
      baseRateCents: BASE,
      deltaCents: 6,
      kind: "raise",
    });
    expect(raiseCheck(on(at(BASE - 6), HOURS, BASE))).toEqual({
      impliedRateCents: 5194,
      baseRateCents: BASE,
      deltaCents: -6,
      kind: "below",
    });
  });

  test("a real raise: $52.00 configured, stub pays $53.50 over 61.5 reg hours", () => {
    // 61.5 h × $53.50 = $3,290.25, typed off the stub with its $ and comma
    expect(raiseCheck(on("$3,290.25", 61.5, 5200))).toEqual({
      impliedRateCents: 5350,
      baseRateCents: 5200,
      deltaCents: 150,
      kind: "raise",
    });
  });

  test("paid below the configured rate — the raise that never landed", () => {
    // same 61.5 h at the OLD $52.00 while the rules already say $53.50
    expect(raiseCheck(on("3198.00", 61.5, 5350))).toEqual({
      impliedRateCents: 5200,
      baseRateCents: 5350,
      deltaCents: -150,
      kind: "below",
    });
  });

  test("no hours on the stub's regular line → no rate claim", () => {
    // Dollars alone cannot tell a raise from a shift the app never got:
    // without the stub's own quantity there is nothing to divide by.
    for (const stubRegHours of [undefined, "", "   ", "abc", "0", "-12"]) {
      expect(raiseCheck({ actualReg: at(BASE + 200), stubRegHours, regHours: HOURS, baseRateCents: BASE })).toBeNull();
    }
  });

  test("hours that disagree with the shift list are an hours problem, not a raise", () => {
    // The routine pre-true-up state: six 12 h shifts logged, payroll paid
    // 73.5. $3,860.96 ÷ 72 would read as a $53.62 raise off a $52.53 rate.
    expect(
      raiseCheck({ actualReg: "3860.96", stubRegHours: "73.50", regHours: 72, baseRateCents: 5253 }),
    ).toBeNull();
    // Two of six shifts logged against a full stub: $160.88/hr, once.
    expect(raiseCheck({ actualReg: "3861.00", stubRegHours: "73.50", regHours: 24, baseRateCents: 5253 })).toBeNull();
    // Leave bundled into the regular line prints the bundled hours.
    expect(raiseCheck({ actualReg: "4368.00", stubRegHours: "84.00", regHours: 72, baseRateCents: 5200 })).toBeNull();
    // A hundredth of an hour apart is how the stub printed it, not a mismatch…
    expect(
      raiseCheck({ actualReg: at(BASE + 200), stubRegHours: "80.01", regHours: HOURS, baseRateCents: BASE }),
    ).not.toBeNull();
    // …a tenth is a different set of hours.
    expect(
      raiseCheck({ actualReg: at(BASE + 200), stubRegHours: "80.10", regHours: HOURS, baseRateCents: BASE }),
    ).toBeNull();
  });

  test("nothing to read → null", () => {
    for (const actualReg of [undefined, "", "   ", "abc", "$0.00", "-250.00"]) {
      expect(raiseCheck({ actualReg, stubRegHours: "80.00", regHours: HOURS, baseRateCents: BASE })).toBeNull();
    }
  });

  test("too little signal → null", () => {
    expect(raiseCheck(on("4160.00", 0, BASE))).toBeNull();
    expect(raiseCheck(on("26.00", 0.5, BASE))).toBeNull();
    expect(raiseCheck({ actualReg: "4160.00", stubRegHours: "80.00", regHours: Number.NaN, baseRateCents: BASE })).toBeNull();
    expect(raiseCheck(on("4160.00", HOURS, 0))).toBeNull();
  });
});
