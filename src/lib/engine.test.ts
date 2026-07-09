/**
 * SPEC.md §3 — golden acceptance tests.
 *
 * The fixture is the real pay period 6/22–7/05 whose stub the v1 engine
 * reconciled to $0.02. Stub dollar values are facts, not parameters:
 * if a test here fails after an engine change, the engine is wrong —
 * do not touch the expected values without asking Omar (CLAUDE.md rule 1).
 */
import { describe, expect, test } from "vitest";
import {
  AUDIT_TOLERANCE_CENTS,
  DEFAULT_CFG,
  DEFAULT_TIERS,
  auditLine,
  computeNet,
  computePeriod,
  scheduleHours,
  unitsToCents,
  type Shift,
} from "./engine.ts";

/**
 * SPEC §3 period fixture — mirrors v1 DEMO_SHIFTS:
 * paid hours [15.6, 14.4, 12.2, 14.9, 12.0, 11.8, 15.7, 15.8];
 * weekend dates (Sun 6/28, Sun 7/5) carry 14.9 + 15.8;
 * charge 52 h · premium 36 h · 548 = 24 units.
 */
const FIXTURE_SHIFTS: Shift[] = [
  { id: "s1", date: "2026-06-23", hours: 15.6, chargeHours: 0, premiumHours: 12, preceptorHours: 0, units548: 2 },
  { id: "s2", date: "2026-06-24", hours: 14.4, chargeHours: 0, premiumHours: 12, preceptorHours: 0, units548: 4 },
  { id: "s3", date: "2026-06-25", hours: 12.2, chargeHours: 12, premiumHours: 12, preceptorHours: 0, units548: 0 },
  { id: "s4", date: "2026-06-28", hours: 14.9, chargeHours: 0, premiumHours: 0, preceptorHours: 0, units548: 8 },
  { id: "s5", date: "2026-06-30", hours: 12.0, chargeHours: 4, premiumHours: 0, preceptorHours: 0, units548: 0 },
  { id: "s6", date: "2026-07-01", hours: 11.8, chargeHours: 12, premiumHours: 0, preceptorHours: 0, units548: 0 },
  { id: "s7", date: "2026-07-02", hours: 15.7, chargeHours: 12, premiumHours: 0, preceptorHours: 0, units548: 2 },
  { id: "s8", date: "2026-07-05", hours: 15.8, chargeHours: 12, premiumHours: 0, preceptorHours: 0, units548: 8 },
];

// DEFAULT_CFG already carries the §3 fixture settings (evening 18.45 h,
// OT override $85.74, deduction seeds) — assert so drift is loud.
const CFG = DEFAULT_CFG;

describe("SPEC §3 fixture sanity", () => {
  test("DEFAULT_CFG carries the fixture's evening hours, OT override, and deduction seeds", () => {
    expect(CFG.eveningHours).toBe(18.45);
    expect(CFG.otRateOverrideCents).toBe(8574);
    expect(CFG.medCents + CFG.dentCents + CFG.fsaCents).toBe(41808); // $418.08 Sec 125
    expect(CFG.accCents + CFG.critCents + CFG.otherAfterTaxCents).toBe(9904); // $99.04 after-tax
    expect(CFG.imputedCents).toBe(181);
  });

  test("fixture totals: 52 charge h, 36 premium h, 24 units, 30.7 weekend h", () => {
    const p = computePeriod(FIXTURE_SHIFTS, CFG);
    expect(p.lines.find((l) => l.key === "charge")?.qty).toBe(52);
    expect(p.lines.find((l) => l.key === "premium")?.qty).toBe(36);
    expect(p.units548).toBe(24);
    expect(p.lines.find((l) => l.key === "weekend")?.qty).toBe(30.7);
  });
});

describe("SPEC §3 golden acceptance tests", () => {
  test("1 · hour split: reg = 80.00, ot = 15.80, dt = 16.60", () => {
    const p = computePeriod(FIXTURE_SHIFTS, CFG);
    expect(p.regHours).toBe(80);
    expect(p.otHours).toBe(15.8);
    expect(p.dtHours).toBe(16.6);
    expect(p.workedHours).toBe(112.4);
  });

  test("2 · gross = $8,865.20, within ±$0.05 of the real stub ($8,865.22)", () => {
    const p = computePeriod(FIXTURE_SHIFTS, CFG);
    expect(p.grossCents).toBe(886520); // engine-exact
    const stubGrossCents = 886522;
    expect(Math.abs(p.grossCents - stubGrossCents)).toBeLessThanOrEqual(5);
  });

  test("3 · 403(b) = $265.90 exact · SS = $523.72 exact · Medicare = $122.48–122.49", () => {
    const p = computePeriod(FIXTURE_SHIFTS, CFG);
    const n = computeNet(p.grossCents, CFG);
    expect(n.k403Cents).toBe(26590);
    expect(n.ssCents).toBe(52372);
    expect(n.medicareCents).toBeGreaterThanOrEqual(12248);
    expect(n.medicareCents).toBeLessThanOrEqual(12249);
  });

  test("4 · net = $5,781.97, within ±$0.05 of the real stub ($5,781.99)", () => {
    const p = computePeriod(FIXTURE_SHIFTS, CFG);
    const n = computeNet(p.grossCents, CFG);
    expect(n.netCents).toBe(578197); // engine-exact
    const stubNetCents = 578199;
    expect(Math.abs(n.netCents - stubNetCents)).toBeLessThanOrEqual(5);
  });

  test("5 · schedule hours: meal rule, overnight, short shift, missing time", () => {
    expect(scheduleHours("06:45", "19:15", CFG)).toBe(12.0);
    expect(scheduleHours("06:45", "23:15", CFG)).toBe(16.0);
    expect(scheduleHours("19:00", "07:00", CFG)).toBe(11.5); // overnight
    expect(scheduleHours("10:00", "14:00", CFG)).toBe(4.0); // ≤ 6 h → no meal
    expect(scheduleHours("", "19:15", CFG)).toBeNull();
    expect(scheduleHours("06:45", "", CFG)).toBeNull();
    expect(scheduleHours("6:45", "19:15", CFG)).toBe(12.0); // 1-digit hour parses
  });

  test("6 · June regression (PERMANENT): 16-hr shift at old tier paid 2.5u + 7.5u audits as SHORT 5.0 units = $250", () => {
    // The bug that started this project: a 16-hour extra shift under the
    // old tier owes 15 units = $750; payroll paid 2.5u + 7.5u = 10u = $500.
    const oldTier16 = DEFAULT_TIERS.find((t) => t.id === "t8");
    expect(oldTier16?.label).toBe("16-hr extra — old tier ($750)");
    expect(oldTier16?.units).toBe(15);

    const owedCents = unitsToCents(oldTier16!.units, CFG.unit548Cents);
    expect(owedCents).toBe(75000); // $750.00

    const paidUnits = 2.5 + 7.5; // two partial payments on the stub
    expect(paidUnits).toBe(10);
    const paidCents = unitsToCents(paidUnits, CFG.unit548Cents);
    expect(paidCents).toBe(50000); // $500.00

    const audit = auditLine(owedCents, paidCents, {
      isUnits: true,
      unit548Cents: CFG.unit548Cents,
    });
    expect(audit.ok).toBe(false); // must flag red
    expect(audit.deltaCents).toBe(-25000); // short $250.00
    expect(audit.deltaUnits).toBe(-5); // short 5.0 units of 548
  });

  test("7 · audit tolerance: |Δ| ≤ $0.05 green, beyond red; unit deltas = Δ$ ÷ unit value", () => {
    expect(AUDIT_TOLERANCE_CENTS).toBe(5);
    // exactly at tolerance, both directions → green
    expect(auditLine(100000, 100005).ok).toBe(true);
    expect(auditLine(100000, 99995).ok).toBe(true);
    // one cent past tolerance → red
    expect(auditLine(100000, 100006).ok).toBe(false);
    expect(auditLine(100000, 99994).ok).toBe(false);
    // unit delta is dollars ÷ unit value: $10 over on 548 = +0.2u
    const over = auditLine(75000, 76000, { isUnits: true, unit548Cents: CFG.unit548Cents });
    expect(over.deltaUnits).toBe(0.2);
    // non-unit lines report no unit delta
    expect(auditLine(100000, 90000).deltaUnits).toBeNull();
  });
});

describe("rounding regressions (from adversarial port review)", () => {
  test("pctOf applies rates at full decimal precision — 5-decimal calibrated rates don't quantize", () => {
    // Re-calibrating from a new stub can yield >4-decimal effective rates.
    // 13.69775% of fedTaxable $8,181.22 is exactly $1,120.64306255 → $1,120.64;
    // a rate quantized to 13.6978% would (wrongly) give $1,120.65.
    const p = computePeriod(FIXTURE_SHIFTS, CFG);
    const n = computeNet(p.grossCents, { ...CFG, fedEffPct: 13.69775 });
    expect(n.fedTaxableCents).toBe(818122);
    expect(n.fedCents).toBe(112064);
  });

  test("unit shortfalls round half AWAY from zero and mirror overpayments; no -0", () => {
    const opts = { isUnits: true, unit548Cents: CFG.unit548Cents };
    // short $2.25 = 0.045u → reported as short 0.05u, never 0.04u
    expect(auditLine(75000, 74775, opts).deltaUnits).toBe(-0.05);
    // mirrored overpayment reports the same magnitude
    expect(auditLine(75000, 75225, opts).deltaUnits).toBe(0.05);
    // a red $0.25 shortfall is 0.01u, not -0 ("0.00 units" would hide it)
    const tiny = auditLine(75000, 74975, opts);
    expect(tiny.ok).toBe(false);
    expect(tiny.deltaUnits).toBe(-0.01);
    expect(Object.is(tiny.deltaUnits, -0)).toBe(false);
  });

  test("half-cent line amounts round up deterministically (documented v1 divergence)", () => {
    // 13.25 h shift → 1.25 DT h × $105.06 = $131.325 exactly. The cents
    // engine rounds the true half up to $131.33; v1's float representation
    // (131.32499999...) happened to round down. Deterministic half-up is
    // the intended behavior of the port.
    const p = computePeriod(
      [{ id: "x", date: "2026-07-01", hours: 13.25, chargeHours: 0, premiumHours: 0, preceptorHours: 0, units548: 0 }],
      CFG,
    );
    expect(p.dtHours).toBe(1.25);
    expect(p.lines.find((l) => l.key === "dt")?.amountCents).toBe(13133);
  });
});

describe("full-stub reconciliation (v1 parity)", () => {
  test("every expected line lands within audit tolerance of the real stub", () => {
    // v1 ACTUAL_SEED, in cents — the entire real stub, line by line.
    const stub: Record<string, number> = {
      reg: 420240, ot: 135471, dt: 174400, weekend: 6140, evening: 3690,
      charge: 15600, premium: 10800, preceptor: 0, bonus548: 120000,
      gross: 886522, fed: 112064, mn: 49255, ss: 52372, medicare: 12249,
      mnFam: 1196, mnMed: 2704, pretax: 68398, aftertax: 9904, net: 578199,
    };
    const p = computePeriod(FIXTURE_SHIFTS, CFG);
    const n = computeNet(p.grossCents, CFG);
    const expected: Record<string, number> = {
      ...Object.fromEntries(
        p.lines.filter((l) => l.key !== "imputed").map((l) => [l.key, l.amountCents]),
      ),
      gross: p.grossCents,
      fed: n.fedCents, mn: n.mnCents, ss: n.ssCents, medicare: n.medicareCents,
      mnFam: n.mnFamCents, mnMed: n.mnMedCents,
      pretax: n.pretaxCents, aftertax: n.afterTaxCents, net: n.netCents,
    };
    for (const [key, actualCents] of Object.entries(stub)) {
      const { ok, deltaCents } = auditLine(expected[key]!, actualCents);
      expect.soft(ok, `${key}: expected ${expected[key]} vs stub ${actualCents} (Δ ${deltaCents})`).toBe(true);
    }
  });
});
