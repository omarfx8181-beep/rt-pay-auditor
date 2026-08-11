/** Kronos rounding watch: punched vs paid, meal out first, losses only, net alongside. */
import { describe, expect, test } from "vitest";
import { DEFAULT_CFG, type EngineConfig } from "./engine.ts";
import { parseTimecardResponse, type TimecardDay } from "./timecard.ts";
import { roundingLoss } from "./rounding.ts";

// $52.00/h — 60 lost minutes reads as exactly $52.00, 15 as $13.00 — on
// the real Fairview rules: half an hour off anything past six.
const CFG: EngineConfig = { ...DEFAULT_CFG, baseRateCents: 5200 };

const day = (date: string, hours: number, ...punches: [string, string][]): TimecardDay => ({
  date,
  hours,
  ...(punches.length > 0 ? { punches: punches.map(([i, o]) => ({ in: i, out: o })) } : {}),
});

// 06:45–11:30 + 12:00–19:30 = 12.25 h on the clock, paid 12.00 → a quarter hour gone.
// Two pairs: the meal is already out of the punched total, nothing to deduct.
const MEAL_SPLIT = day("2026-06-23", 12, ["06:45", "11:30"], ["12:00", "19:30"]);

describe("roundingLoss", () => {
  test("a meal-split day punched 12.25 and paid 12.00 is 15 minutes and $13.00", () => {
    expect(roundingLoss([MEAL_SPLIT], CFG)).toEqual({
      minutes: 15,
      estCents: 1300,
      days: [{ date: "2026-06-23", minutes: 15 }],
      netMinutes: 15,
      netEstCents: 1300,
      unexplained: [],
    });
  });

  test("an AUTO-deducted meal is the rule working, not a shave", () => {
    // SPEC §3: 06:45–19:15 pays 12.00. One punch pair per day is exactly
    // what a card with an auto-deducted meal prints — six of them are six
    // contractual meals, not three hours Kronos took.
    const week = ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26", "2026-06-27"].map((d) =>
      day(d, 12, ["06:45", "19:15"]),
    );
    expect(roundingLoss(week, CFG)).toBeNull();
  });

  test("a shave on TOP of the auto-deducted meal still shows", () => {
    // 06:45–19:22 = 12.617 h; less the half-hour meal that's 12.117 paid as 12.00
    expect(roundingLoss([day("2026-06-24", 12, ["06:45", "19:22"])], CFG)).toEqual({
      minutes: 7,
      estCents: 607,
      days: [{ date: "2026-06-24", minutes: 7 }],
      netMinutes: 7,
      netEstCents: 607,
      unexplained: [],
    });
  });

  test("a day under the meal threshold keeps every punched minute", () => {
    // 07:00–11:07 is 4.12 h — no meal comes off a short shift, so 7 minutes is 7 minutes
    expect(roundingLoss([day("2026-06-24", 4, ["07:00", "11:07"])], CFG)!.minutes).toBe(7);
  });

  test("a night shift rolls past midnight — out before in is not a negative span", () => {
    // 18:45 → 07:07 is 12.37 h, not the −11.63 a plain subtraction gives;
    // less the meal it's 11.87 against 11.75 paid
    expect(roundingLoss([day("2026-06-27", 11.75, ["18:45", "07:07"])], CFG)).toEqual({
      minutes: 7,
      estCents: 607,
      days: [{ date: "2026-06-27", minutes: 7 }],
      netMinutes: 7,
      netEstCents: 607,
      unexplained: [],
    });
  });

  test("paid MORE than punched clamps at zero, and shows up only in the net", () => {
    // 07:00–19:22 less the meal is 11.87 h against 12.00 paid — 8 minutes in Omar's favor
    const paidUp = day("2026-06-25", 12, ["07:00", "19:22"]);
    expect(roundingLoss([MEAL_SPLIT, paidUp], CFG)).toEqual({
      minutes: 15, // the paid-up day contributes nothing here…
      estCents: 1300,
      days: [{ date: "2026-06-23", minutes: 15 }],
      netMinutes: 7, // …only here, where the loss is netted down
      netEstCents: 607,
      unexplained: [],
    });
  });

  test("a gap wider than quarter-hour rounding can make is not rounding", () => {
    // Both directions, both outside the model, neither priced:
    //   the other meal convention — punched out for it AND paid the full span
    const noDeduct = day("2026-06-25", 12.5, ["06:45", "19:15"]);
    //   a missed punch-out — 14 h on the clock against a 12 h shift
    const missed = day("2026-06-27", 12, ["06:45", "20:45"]);
    expect(roundingLoss([MEAL_SPLIT, noDeduct, missed], CFG)).toEqual({
      minutes: 15,
      estCents: 1300,
      days: [{ date: "2026-06-23", minutes: 15 }],
      netMinutes: 15, // the 30-minute "gain" never lands in the net either
      netEstCents: 1300,
      unexplained: ["2026-06-25", "2026-06-27"],
    });
  });

  test("under five lost minutes is noise", () => {
    expect(roundingLoss([day("2026-06-23", 12, ["06:45", "19:19"])], CFG)).toBeNull(); // 4 minutes
    expect(roundingLoss([day("2026-06-23", 12, ["06:45", "19:20"])], CFG)).toEqual({
      minutes: 5,
      estCents: 433,
      days: [{ date: "2026-06-23", minutes: 5 }],
      netMinutes: 5,
      netEstCents: 433,
      unexplained: [],
    });
  });

  test("no punches → null, never a full-shift loss", () => {
    expect(roundingLoss([day("2026-06-23", 12), day("2026-06-25", 12)], CFG)).toBeNull();
    expect(roundingLoss([{ date: "2026-06-23", hours: 12, punches: [] }], CFG)).toBeNull();
    expect(roundingLoss([], CFG)).toBeNull();
  });

  test("unreadable punches drop the whole day, so a half-read never invents a loss or a gain", () => {
    const bad: Array<[string, string]> = [
      ["25:00", "07:00"], // hour out of range
      ["6:4", "19:00"], // minutes truncated
      ["6:45p", "7:15p"], // 12-hour form — reading it wrong would be a 12-hour error
      ["", "19:00"], // half a pair
      ["19:00", "19:00"], // spans nothing: a duplicated misread, not a shift
    ];
    for (const pair of bad) {
      expect(roundingLoss([day("2026-06-25", 12, pair)], CFG)).toBeNull();
    }
    // one bad segment on a two-segment day takes the day with it: the good
    // segment alone is 4.75 h against 12 paid, which would read as a huge gain
    const partial = day("2026-06-25", 12, ["06:45", "11:30"], ["12:00", "bad"]);
    expect(roundingLoss([MEAL_SPLIT, partial], CFG)).toEqual({
      minutes: 15,
      estCents: 1300,
      days: [{ date: "2026-06-23", minutes: 15 }],
      netMinutes: 15,
      netEstCents: 1300,
      unexplained: [],
    });
  });

  test("unusable paid hours skip the day", () => {
    const nan = { date: "2026-06-25", hours: Number.NaN, punches: [{ in: "07:00", out: "19:30" }] };
    expect(roundingLoss([MEAL_SPLIT, nan], CFG)!.netMinutes).toBe(15);
    const zero = { date: "2026-06-25", hours: 0, punches: [{ in: "07:00", out: "19:30" }] };
    expect(roundingLoss([MEAL_SPLIT, zero], CFG)!.netMinutes).toBe(15);
  });

  test("no rate configured still counts the minutes, at no money", () => {
    for (const baseRateCents of [0, -100, Number.NaN]) {
      expect(roundingLoss([MEAL_SPLIT], { ...CFG, baseRateCents })).toEqual({
        minutes: 15,
        estCents: 0,
        days: [{ date: "2026-06-23", minutes: 15 }],
        netMinutes: 15,
        netEstCents: 0,
        unexplained: [],
      });
    }
  });

  test("the meal comes off the period's OWN rules", () => {
    // Rules are per-period data. With no auto-deduct configured, that
    // same 06:45–19:15 against 12.00 paid is a half hour unaccounted
    // for — and half an hour is still too wide to blame on rounding.
    const flat = { ...CFG, mealDeductHours: 0, mealThresholdHours: 0 };
    const got = roundingLoss([MEAL_SPLIT, day("2026-06-24", 12, ["06:45", "19:15"])], flat)!;
    expect(got.unexplained).toEqual(["2026-06-24"]);
    expect(got.minutes).toBe(15); // the meal-split day's quarter hour, and nothing else
  });

  test("the loss gate ignores the net — shaved days show even on a period that came out ahead", () => {
    // 15 + 7 lost, 32 handed back: the two short days are still citable
    const ahead = day("2026-06-29", 12, ["06:45", "18:59"]); // 11.73 h net of the meal, 12.00 paid
    const got = roundingLoss(
      [MEAL_SPLIT, day("2026-06-24", 12, ["06:45", "19:22"]), ahead, { ...ahead, date: "2026-07-01" }],
      CFG,
    )!;
    expect(got.minutes).toBe(22);
    expect(got.days).toHaveLength(2);
    expect(got.netMinutes).toBe(-10);
  });
});

describe("roundingLoss on a real scan payload", () => {
  test("parse → measure, with the parser's all-or-nothing days falling out", () => {
    const read = parseTimecardResponse(
      JSON.stringify({
        periodStart: "2026-06-22",
        periodEnd: "2026-07-05",
        days: [
          { date: "2026-06-23", hours: 12, punches: [{ in: "6:45", out: "11:30" }, { in: "12:00", out: "19:30" }] },
          { date: "2026-06-25", hours: 11.75, punches: [{ in: "18:45", out: "07:07" }] }, // night shift, meal auto-deducted
          { date: "2026-06-27", hours: 8, punches: [{ in: "07:0", out: "15:00" }] }, // unreadable
          { date: "2026-06-29", hours: 8 }, // punch columns never read
        ],
        eveningHours: null,
      }),
    );
    expect(roundingLoss(read.days, CFG)).toEqual({
      minutes: 22,
      estCents: 1907,
      days: [
        { date: "2026-06-23", minutes: 15 },
        { date: "2026-06-25", minutes: 7 },
      ],
      netMinutes: 22,
      netEstCents: 1907,
      unexplained: [],
    });
  });
});
