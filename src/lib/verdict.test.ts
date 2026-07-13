/**
 * V3-M3 — the three-state verdict, tested on the real reconciled period
 * (DEMO_SHIFTS / ACTUAL_SEED) and on the June scenario the app exists for.
 * These are additive UI-logic tests; the golden engine tests (SPEC §3)
 * stay untouched.
 */
import { describe, expect, test } from "vitest";
import { computeNet, computePeriod, DEFAULT_CFG } from "./engine.ts";
import { ACTUAL_SEED, DEMO_SHIFTS, draftToShift } from "./draft.ts";
import { buildAuditRows } from "./audit.ts";
import { computeVerdict } from "./verdict.ts";

const period = computePeriod(DEMO_SHIFTS.map(draftToShift), DEFAULT_CFG);
const net = computeNet(period.grossCents, DEFAULT_CFG);
const rows = buildAuditRows(period, net);
const U = DEFAULT_CFG.unit548Cents;

describe("verdict — green / red / amber over the real period", () => {
  test("the full real stub → green, paid in full at the stub's net", () => {
    const v = computeVerdict(rows, ACTUAL_SEED, U);
    expect(v.kind).toBe("green");
    if (v.kind === "green") expect(v.paidNetCents).toBe(578199);
  });

  test("June scenario: bonus paid 5 units short → red, owed exactly $250", () => {
    // Stub pays 19u instead of 24u ($950 vs $1,200); gross/net/taxes echo it.
    const actual = { ...ACTUAL_SEED, bonus548: "950.00", gross: "8615.22", net: "5531.99", fed: "1090.00" };
    const v = computeVerdict(rows, actual, U);
    expect(v.kind).toBe("red");
    if (v.kind === "red") {
      expect(v.owedCents).toBe(25000); // $250, from the earnings line ONLY —
      expect(v.shortfalls).toHaveLength(1); // gross/net echoes never double-count
      expect(v.shortfalls[0].key).toBe("bonus548");
      expect(v.shortfalls[0].deltaUnits).toBe(-5);
      expect(v.earningsOvers).toHaveLength(0);
      expect(v.taxesFollow).toBe(true); // stub withheld on the short gross
    }
  });

  test("two shorted lines add up; largest leads", () => {
    // engine-exact OT is $1,354.69; $1,329.69 is exactly $25 short
    const actual = { ...ACTUAL_SEED, bonus548: "950.00", ot: "1329.69" }; // −$250 and −$25
    const v = computeVerdict(rows, actual, U);
    expect(v.kind).toBe("red");
    if (v.kind === "red") {
      expect(v.owedCents).toBe(27500);
      expect(v.shortfalls.map((s) => s.key)).toEqual(["bonus548", "ot"]);
    }
  });

  test("earnings line paid OVER → amber with a rate-check question, not red", () => {
    const actual = { ...ACTUAL_SEED, weekend: "71.40" }; // +$10 over
    const v = computeVerdict(rows, actual, U);
    expect(v.kind).toBe("amber");
    if (v.kind === "amber") {
      expect(v.focus?.key).toBe("weekend");
      expect(v.question).toContain("Weekend pay");
    }
  });

  test("deduction drifting from config → amber pointing at Me → Advanced", () => {
    const actual = { ...ACTUAL_SEED, fed: "1130.64" }; // +$10 withheld
    const v = computeVerdict(rows, actual, U);
    expect(v.kind).toBe("amber");
    if (v.kind === "amber") {
      expect(v.focus?.key).toBe("fed");
      expect(v.question).toContain("Federal tax");
      expect(v.question).toContain("Advanced");
    }
  });

  test("lines all match but totals disagree → amber asks about missing lines", () => {
    const actual = { ...ACTUAL_SEED, net: "5700.00" };
    const v = computeVerdict(rows, actual, U);
    expect(v.kind).toBe("amber");
    if (v.kind === "amber") expect(v.question).toContain("totals");
  });

  test("partial entry, everything matching, no net yet → progress", () => {
    const v = computeVerdict(rows, { reg: ACTUAL_SEED.reg, ot: ACTUAL_SEED.ot }, U);
    expect(v.kind).toBe("progress");
    if (v.kind === "progress") expect(v.matchedCount).toBe(2);
  });

  test("nothing entered → intro", () => {
    expect(computeVerdict(rows, {}, U).kind).toBe("intro");
  });

  test("within the five-cent tolerance still counts as matching (SPEC §3.7)", () => {
    const actual = { ...ACTUAL_SEED }; // seed's gross/net are ±2¢ from engine-exact
    const v = computeVerdict(rows, actual, U);
    expect(v.kind).toBe("green");
  });
});
