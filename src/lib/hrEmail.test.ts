/**
 * M4 — the HR email generator, tested on the exact June scenario the app
 * was born from (SPEC §3 test 6 carried into the deliverable).
 */
import { describe, expect, test } from "vitest";
import { DEFAULT_CFG } from "./engine.ts";
import { DEMO_SHIFTS, draftToShift } from "./draft.ts";
import { buildHrEmail, identicalShiftGroups, type EmailDiscrepancy } from "./hrEmail.ts";

const SHIFTS = DEMO_SHIFTS.map(draftToShift);

const IDENTITY = { name: "Omar", employeeId: "123456", title: "RRT", department: "Respiratory Therapy" };

const bonusShort250: EmailDiscrepancy = {
  key: "bonus548",
  label: "Critical Shift Bonus (548)",
  expectedCents: 120000,
  paidCents: 95000,
  deltaCents: -25000,
  deltaUnits: -5,
};

describe("HR email generator", () => {
  test("June scenario: subject and ask carry short $250.00 (5.0 units of code 548)", () => {
    const email = buildHrEmail({
      periodStart: "2026-06-22",
      periodEnd: "2026-07-05",
      identity: IDENTITY,
      discrepancies: [bonusShort250],
      shifts: SHIFTS,
      unit548Cents: DEFAULT_CFG.unit548Cents,
    });
    expect(email).not.toBeNull();
    expect(email!.subject).toBe(
      "Pay correction request — Jun 22 – Jul 5, 2026 — short $250.00 (5.0 units of code 548)",
    );
    expect(email!.body).toContain("short $250.00 (5.0 units)");
    expect(email!.body).toContain("adjustment of $250.00 (5.0 units of code 548)");
    expect(email!.body).toContain("Employee ID 123456");
  });

  test("per-shift 548 table lists every claiming shift and the claimed total", () => {
    const email = buildHrEmail({
      periodStart: "2026-06-22",
      periodEnd: "2026-07-05",
      identity: IDENTITY,
      discrepancies: [bonusShort250],
      shifts: SHIFTS,
      unit548Cents: DEFAULT_CFG.unit548Cents,
    })!;
    expect(email.body).toContain("16-hr extra");
    expect(email.body).toMatch(/TOTAL CLAIMED\s+24\.0\s+\$1,200\.00/);
  });

  test("identical-shift comparison names the 6/28 and 7/5 16-hr shifts", () => {
    const groups = identicalShiftGroups(SHIFTS);
    expect(groups[0]).toMatchObject({ units: 8 });
    expect(groups[0].shifts.map((s) => s.date)).toEqual(["2026-06-28", "2026-07-05"]);

    const email = buildHrEmail({
      periodStart: "2026-06-22",
      periodEnd: "2026-07-05",
      identity: IDENTITY,
      discrepancies: [bonusShort250],
      shifts: SHIFTS,
      unit548Cents: DEFAULT_CFG.unit548Cents,
    })!;
    expect(email.body).toMatch(/Identical-shift check:.*Sun, 6\/28 and Sun, 7\/5 each claim 8\.0 units/);
    expect(email.body).toContain("if one was paid in full, the other is owed the same");
  });

  test("dollar-only lines report dollars without a unit count; overs are labeled over", () => {
    const otShort: EmailDiscrepancy = {
      key: "ot",
      label: "Overtime (> 80 hrs/period)",
      expectedCents: 135469,
      paidCents: 130000,
      deltaCents: -5469,
      deltaUnits: null,
    };
    const weekendOver: EmailDiscrepancy = {
      key: "weekend",
      label: "Adder – Weekend Differential",
      expectedCents: 6140,
      paidCents: 7140,
      deltaCents: 1000,
      deltaUnits: null,
    };
    const email = buildHrEmail({
      periodStart: "2026-06-22",
      periodEnd: "2026-07-05",
      identity: IDENTITY,
      discrepancies: [otShort, weekendOver],
      shifts: SHIFTS,
      unit548Cents: DEFAULT_CFG.unit548Cents,
    })!;
    expect(email.body).toContain("short $54.69");
    expect(email.body).toContain("over $10.00");
    expect(email.subject).toContain("short $54.69");
    expect(email.subject).not.toContain("units"); // no 548 shortfall in this one
  });

  test("no shortfalls → no email (overpayments alone don't generate one)", () => {
    const onlyOver: EmailDiscrepancy = {
      key: "weekend",
      label: "Adder – Weekend Differential",
      expectedCents: 6140,
      paidCents: 7140,
      deltaCents: 1000,
      deltaUnits: null,
    };
    expect(
      buildHrEmail({
        periodStart: "2026-06-22",
        periodEnd: "2026-07-05",
        identity: IDENTITY,
        discrepancies: [onlyOver],
        shifts: SHIFTS,
        unit548Cents: DEFAULT_CFG.unit548Cents,
      }),
    ).toBeNull();
  });

  test("blank identity degrades to visible placeholders, never empty strings", () => {
    const email = buildHrEmail({
      periodStart: "2026-06-22",
      periodEnd: "2026-07-05",
      identity: { name: "", employeeId: "", title: "", department: "" },
      discrepancies: [bonusShort250],
      shifts: SHIFTS,
      unit548Cents: DEFAULT_CFG.unit548Cents,
    })!;
    expect(email.body).toContain("[your name]");
    expect(email.body).toContain("[employee ID]");
  });
});
