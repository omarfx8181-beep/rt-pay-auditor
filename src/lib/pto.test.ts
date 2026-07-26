/** The time-off bank auditor + the W-2 box estimates. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { ACTUAL_SEED, DEFAULT_CFG_DRAFT, DEMO_SHIFTS, uid } from "./draft.ts";
import type { PayPeriod } from "./periods.ts";
import { auditPto, EMPTY_PTO, parsePto } from "./pto.ts";
import { estimateW2, parseW2Setting } from "./w2.ts";

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

describe("auditPto", () => {
  const CFG = { accrualPerHour: "0.05", capHours: "", startBalance: "40", asOf: "2026-06-21", kronosSays: "" };

  test("accrues on worked hours after asOf, spends logged sick time", () => {
    const withSick = demoPeriod({
      leave: [{ id: uid(), date: "2026-07-01", hours: "12", type: "sto" }],
    });
    const audit = auditPto([withSick], CFG)!;
    expect(audit.workedHours).toBe(112.4); // demo period's worked hours
    expect(audit.accruedHours).toBe(5.62); // 112.4 × 0.05
    expect(audit.usedHours).toBe(12);
    expect(audit.expectedHours).toBe(40 + 5.62 - 12);
    expect(audit.deltaHours).toBeNull(); // nothing typed from Kronos yet
  });

  test("periods before asOf don't count; totals-only checks are skipped and counted", () => {
    const old = demoPeriod({ id: "old", startDate: "2026-05-25", endDate: "2026-06-07" });
    const totalsOnly = demoPeriod({ id: "t", startDate: "2026-07-06", endDate: "2026-07-19", shifts: [], actual: { gross: "3000", net: "2000" } });
    const audit = auditPto([old, demoPeriod(), totalsOnly], CFG)!;
    expect(audit.countedPeriods).toBe(1);
    expect(audit.skippedPeriods).toBe(1);
  });

  test("cap holds the bank down; Kronos comparison yields the delta", () => {
    const audit = auditPto([demoPeriod()], { ...CFG, capHours: "42", kronosSays: "40.5" })!;
    expect(audit.capped).toBe(true);
    expect(audit.expectedHours).toBe(42);
    expect(audit.deltaHours).toBe(1.5); // Kronos shows 1.5h too little
  });

  test("unconfigured → null; junk settings parse to empty", () => {
    expect(auditPto([demoPeriod()], EMPTY_PTO)).toBeNull();
    expect(parsePto("junk")).toEqual(EMPTY_PTO);
  });
});

describe("estimateW2 — box math from the year's own data", () => {
  test("demo period: box 1 = gross − 403(b) − S125; boxes 3/5 keep the 403(b)", () => {
    const est = estimateW2([demoPeriod()], "2026")!;
    // stub-true: gross 886522, pretax 68398; S125 = 27661+6455+7692 = 41808 → 403(b) = 26590
    expect(est.box1Cents).toBe(886522 - 26590 - 41808);
    expect(est.box3Cents).toBe(886522 - 41808);
    expect(est.box5Cents).toBe(est.box3Cents);
    expect(est.box2Cents).toBe(112064); // stub's federal line
    expect(est.box17Cents).toBe(49255); // stub's Minnesota line
    expect(est.box16Cents).toBe(est.box1Cents);
    expect(est.totalsOnlyCount).toBe(0);
  });

  test("corrections add wages to every box's base; empty year → null", () => {
    const withCorr = demoPeriod({ corrections: [{ id: "c", payDate: "2026-07-15", gross: "250", net: "180", note: "", updatedAt: 1 }] });
    const est = estimateW2([withCorr], "2026")!;
    expect(est.correctionGrossCents).toBe(25000);
    expect(est.box1Cents).toBe(886522 + 25000 - 26590 - 41808);
    expect(est.box3Cents).toBe(886522 - 41808 + 25000);
    expect(estimateW2([], "2026")).toBeNull();
    expect(parseW2Setting("junk")).toEqual({});
  });
});
