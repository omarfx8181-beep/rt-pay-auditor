/**
 * RT Pay Auditor — pay engine, ported from reference/v1-artifact.jsx.
 *
 * The v1 engine reconciled the real 6/22–7/05 stub to within $0.02 using
 * floats + round-to-2. This port keeps every formula and its rounding
 * order, but all money is integer cents; dollars exist only at the
 * formatting edge. Hours are snapped to hundredths ("centihours") before
 * any multiplication so decimal inputs never pick up float dust.
 *
 * Golden acceptance tests: SPEC.md §3 / src/lib/engine.test.ts.
 * NEVER change math here without those tests passing (CLAUDE.md rule 1).
 */

/** Integer number of cents. */
export type Cents = number;

/* ================= money & rounding helpers ================= */

export const dollarsToCents = (dollars: number): Cents => Math.round(dollars * 100);

export const centsToDollars = (cents: Cents): number => cents / 100;

/** "-$1,354.69" style, matching v1's $fmt. */
export const formatCents = (cents: Cents): string => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${whole}.${String(abs % 100).padStart(2, "0")}`;
};

/** Decimal hours → integer centihours (hundredths of an hour). */
const toCenti = (hours: number): number => Math.round(hours * 100);

/**
 * centihours × rate(cents/hr) → cents, rounded half-up like v1's r2.
 * Both factors are integers ≤ ~1e7, so the product is exact in a double.
 * True half-cent products (e.g. 1.25 h × $105.06 = $131.325) round UP
 * deterministically; v1's float math rounded some of these ties down by
 * representation accident. Pinned by test "half-cent line amounts".
 */
const centiTimesRate = (centi: number, rateCents: number): Cents =>
  Math.round((centi * rateCents) / 100);

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/**
 * pct% of a cents amount. The rate is applied at its full decimal
 * precision via exact BigInt arithmetic (round half away from zero), so
 * calibrated rates — 13.6977 or finer, e.g. re-derived from a new stub —
 * never quantize. Rates so extreme they stringify in exponent notation
 * fall back to float math.
 */
const pctOf = (cents: Cents, pct: number): Cents => {
  const s = String(pct);
  if (!DECIMAL_RE.test(s)) return Math.round((cents * pct) / 100);
  const negative = s.startsWith("-") !== cents < 0;
  const [intPart, fracPart = ""] = s.replace("-", "").split(".");
  const rateScaled = BigInt(intPart + fracPart); // pct × 10^fracPart.length
  const denominator = 100n * 10n ** BigInt(fracPart.length);
  const numerator = BigInt(Math.abs(Math.round(cents))) * rateScaled;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const magnitude = Number(2n * remainder >= denominator ? quotient + 1n : quotient);
  return magnitude === 0 ? 0 : negative ? -magnitude : magnitude;
};

/** 548 units (may be fractional, e.g. 2.5u) → cents. */
export const unitsToCents = (units: number, unitValueCents: Cents): Cents =>
  Math.round(units * unitValueCents);

/* ================= dates ================= */

/** Sat/Sun check on a YYYY-MM-DD string; same semantics as v1. */
export const isWeekend = (dateStr: string): boolean => {
  const d = new Date(dateStr + "T12:00:00");
  const g = d.getDay();
  return g === 0 || g === 6;
};

/* ================= config ================= */

export interface BonusTier {
  id: string;
  label: string;
  units: number;
}

export interface EngineConfig {
  baseRateCents: Cents;
  otMult: number;
  dtMult: number;
  /** OT after this many straight hours per pay period. */
  otPeriodHours: number;
  /** DT for hours over this many in a day. */
  dtDailyHours: number;
  /** FLSA blended OT rate calibrated from the stub; null → base × otMult. */
  otRateOverrideCents: Cents | null;
  weekendDiffCents: Cents;
  eveningDiffCents: Cents;
  /** Period-level manual entry until the code-301 rule is confirmed (SPEC §6 Q3). */
  eveningHours: number;
  chargeRateCents: Cents;
  premiumRateCents: Cents;
  /** Unconfirmed — stub shows YTD only (SPEC §6 Q4). */
  preceptorRateCents: Cents;
  unit548Cents: Cents;
  imputedCents: Cents;
  k403bPct: number;
  medCents: Cents;
  dentCents: Cents;
  fsaCents: Cents;
  /** Calibrated effective withholding rates. */
  fedEffPct: number;
  mnEffPct: number;
  /** Marginal rates, used only for what-if deltas. */
  marginalFedPct: number;
  marginalMnPct: number;
  /** MN Paid Leave EE, % of full gross. */
  mnFamPct: number;
  mnMedPct: number;
  ssPct: number;
  medicarePct: number;
  accCents: Cents;
  critCents: Cents;
  otherAfterTaxCents: Cents;
  /** Schedule-scan meal rule. */
  mealDeductHours: number;
  mealThresholdHours: number;
}

/** Seed config decoded from the real stub (PP 6/22–7/05) — v1 DEFAULT_CFG in cents. */
export const DEFAULT_CFG: EngineConfig = {
  baseRateCents: 5253,
  otMult: 1.5,
  dtMult: 2.0,
  otPeriodHours: 80,
  dtDailyHours: 12,
  otRateOverrideCents: 8574,
  weekendDiffCents: 200,
  eveningDiffCents: 200,
  eveningHours: 18.45,
  chargeRateCents: 300,
  premiumRateCents: 300,
  preceptorRateCents: 300,
  unit548Cents: 5000,
  imputedCents: 181,
  k403bPct: 3.0,
  medCents: 27661,
  dentCents: 6455,
  fsaCents: 7692,
  fedEffPct: 13.6977,
  mnEffPct: 6.0205,
  marginalFedPct: 22,
  marginalMnPct: 6.8,
  mnFamPct: 0.135,
  mnMedPct: 0.305,
  ssPct: 6.2,
  medicarePct: 1.45,
  accCents: 612,
  critCents: 519,
  otherAfterTaxCents: 8773,
  mealDeductHours: 0.5,
  mealThresholdHours: 6,
};

/** v1 DEFAULT_TIERS verbatim — tiers change weekly, so this is config, not law. */
export const DEFAULT_TIERS: BonusTier[] = [
  { id: "t1", label: "Shift extension > 4 hr", units: 2 },
  { id: "t2", label: "Shift extension ≤ 4 hr (confirm)", units: 1 },
  { id: "t3", label: "12-hr extra shift ($500)", units: 10 },
  { id: "t4", label: "16-hr extra shift (current)", units: 8 },
  { id: "t5", label: "Transport run ≤ 4 hr", units: 1 },
  { id: "t6", label: "Transport run > 4 hr", units: 2 },
  { id: "t7", label: "4-hr extra — old tier ($125)", units: 2.5 },
  { id: "t8", label: "16-hr extra — old tier ($750)", units: 15 },
];

/* ================= period gross ================= */

export interface Shift {
  id: string;
  /** YYYY-MM-DD; empty string when unset (no weekend diff applied). */
  date: string;
  hours: number;
  chargeHours: number;
  premiumHours: number;
  preceptorHours: number;
  units548: number;
  note?: string;
}

export interface PayLine {
  key: string;
  label: string;
  /** Hours for hourly lines, 548 units for the bonus line, 0 for imputed. */
  qty: number;
  /**
   * Cents per hour/unit. Integer for all seeded config; may be fractional
   * only when the OT fallback base × 1.5 lands on a half cent — amounts
   * are still rounded to whole cents.
   */
  rateCents: number;
  amountCents: Cents;
  isUnits?: boolean;
  nonCash?: boolean;
}

export interface PeriodResult {
  lines: PayLine[];
  grossCents: Cents;
  workedHours: number;
  regHours: number;
  otHours: number;
  dtHours: number;
  units548: number;
}

export function computePeriod(shifts: Shift[], cfg: EngineConfig): PeriodResult {
  const dtDailyCenti = toCenti(cfg.dtDailyHours);
  const otPeriodCenti = toCenti(cfg.otPeriodHours);

  let straightCenti = 0;
  let dtCenti = 0;
  let workedCenti = 0;
  let weekendCenti = 0;
  let chargeCenti = 0;
  let premiumCenti = 0;
  let preceptCenti = 0;
  let units548 = 0;

  for (const s of shifts) {
    const hCenti = toCenti(s.hours);
    workedCenti += hCenti;
    dtCenti += Math.max(0, hCenti - dtDailyCenti);
    straightCenti += Math.min(hCenti, dtDailyCenti);
    if (s.date && isWeekend(s.date)) weekendCenti += hCenti;
    chargeCenti += toCenti(s.chargeHours);
    premiumCenti += toCenti(s.premiumHours);
    preceptCenti += toCenti(s.preceptorHours);
    units548 += s.units548;
  }

  const regCenti = Math.min(straightCenti, otPeriodCenti);
  const otCenti = Math.max(0, straightCenti - otPeriodCenti);
  const otRateCents =
    cfg.otRateOverrideCents !== null && cfg.otRateOverrideCents > 0
      ? cfg.otRateOverrideCents
      : cfg.baseRateCents * cfg.otMult;
  const dtRateCents = cfg.baseRateCents * cfg.dtMult;
  const eveningCenti = toCenti(cfg.eveningHours);

  const lines: PayLine[] = [
    { key: "reg", label: "Regular Straight Time", qty: regCenti / 100, rateCents: cfg.baseRateCents, amountCents: centiTimesRate(regCenti, cfg.baseRateCents) },
    { key: "ot", label: `Overtime (> ${cfg.otPeriodHours} hrs/period)`, qty: otCenti / 100, rateCents: otRateCents, amountCents: centiTimesRate(otCenti, otRateCents) },
    { key: "dt", label: `Double Time (> ${cfg.dtDailyHours} hrs/day)`, qty: dtCenti / 100, rateCents: dtRateCents, amountCents: centiTimesRate(dtCenti, dtRateCents) },
    { key: "weekend", label: "Adder – Weekend Differential", qty: weekendCenti / 100, rateCents: cfg.weekendDiffCents, amountCents: centiTimesRate(weekendCenti, cfg.weekendDiffCents) },
    { key: "evening", label: "Shift – Evening", qty: eveningCenti / 100, rateCents: cfg.eveningDiffCents, amountCents: centiTimesRate(eveningCenti, cfg.eveningDiffCents) },
    { key: "charge", label: "Adder – Charge Pay (308)", qty: chargeCenti / 100, rateCents: cfg.chargeRateCents, amountCents: centiTimesRate(chargeCenti, cfg.chargeRateCents) },
    { key: "premium", label: "Adder – Premium Pay (320)", qty: premiumCenti / 100, rateCents: cfg.premiumRateCents, amountCents: centiTimesRate(premiumCenti, cfg.premiumRateCents) },
    { key: "preceptor", label: "Adder – Preceptor Pay", qty: preceptCenti / 100, rateCents: cfg.preceptorRateCents, amountCents: centiTimesRate(preceptCenti, cfg.preceptorRateCents) },
    { key: "bonus548", label: "Critical Shift Bonus (548)", qty: units548, rateCents: cfg.unit548Cents, amountCents: unitsToCents(units548, cfg.unit548Cents), isUnits: true },
    { key: "imputed", label: "Imputed – Basic Term Life", qty: 0, rateCents: 0, amountCents: cfg.imputedCents, nonCash: true },
  ];

  const grossCents = lines.reduce((acc, l) => acc + l.amountCents, 0);

  return {
    lines,
    grossCents,
    workedHours: workedCenti / 100,
    regHours: regCenti / 100,
    otHours: otCenti / 100,
    dtHours: dtCenti / 100,
    units548,
  };
}

/* ================= gross → net ================= */

export interface NetResult {
  k403Cents: Cents;
  s125Cents: Cents;
  ficaWagesCents: Cents;
  ssCents: Cents;
  medicareCents: Cents;
  mnFamCents: Cents;
  mnMedCents: Cents;
  fedTaxableCents: Cents;
  fedCents: Cents;
  mnCents: Cents;
  afterTaxCents: Cents;
  taxesCents: Cents;
  pretaxCents: Cents;
  netCents: Cents;
  imputedCents: Cents;
}

export function computeNet(grossCents: Cents, cfg: EngineConfig): NetResult {
  const imputedCents = cfg.imputedCents;
  // 403(b) comes off CASH gross (gross minus non-cash imputed life).
  const cashCents = grossCents - imputedCents;
  const k403Cents = pctOf(cashCents, cfg.k403bPct);
  const s125Cents = cfg.medCents + cfg.dentCents + cfg.fsaCents;
  // FICA wages exclude Section 125 only — 403(b) stays FICA-taxable.
  const ficaWagesCents = grossCents - s125Cents;
  const ssCents = pctOf(ficaWagesCents, cfg.ssPct);
  const medicareCents = pctOf(ficaWagesCents, cfg.medicarePct);
  // MN Paid Leave EE is on FULL gross.
  const mnFamCents = pctOf(grossCents, cfg.mnFamPct);
  const mnMedCents = pctOf(grossCents, cfg.mnMedPct);
  const fedTaxableCents = grossCents - k403Cents - s125Cents;
  const fedCents = pctOf(fedTaxableCents, cfg.fedEffPct);
  const mnCents = pctOf(fedTaxableCents, cfg.mnEffPct);
  const afterTaxCents = cfg.accCents + cfg.critCents + cfg.otherAfterTaxCents;
  const taxesCents = fedCents + mnCents + ssCents + medicareCents + mnFamCents + mnMedCents;
  const pretaxCents = k403Cents + s125Cents;
  // Imputed life is taxed but never cash, so it comes off at the end.
  const netCents = grossCents - taxesCents - pretaxCents - afterTaxCents - imputedCents;

  return {
    k403Cents,
    s125Cents,
    ficaWagesCents,
    ssCents,
    medicareCents,
    mnFamCents,
    mnMedCents,
    fedTaxableCents,
    fedCents,
    mnCents,
    afterTaxCents,
    taxesCents,
    pretaxCents,
    netCents,
    imputedCents,
  };
}

/* ================= schedule scan hours ================= */

const toMin = (t: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t ?? "").trim());
  return m ? Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2])) : null;
};

/**
 * Scheduled paid hours from "HH:MM" start/end, or null when either time is
 * missing/unparseable. End at or before start rolls over midnight
 * (overnight shift). Shifts longer than the meal threshold lose the meal
 * deduction. Result in decimal hours, 2 dp — hours, not money.
 */
export function scheduleHours(start: string, end: string, cfg: EngineConfig): number | null {
  const a = toMin(start);
  const b = toMin(end);
  if (a === null || b === null) return null;
  let mins = b - a;
  if (mins <= 0) mins += 1440; // overnight shift
  let h = mins / 60;
  if (h > cfg.mealThresholdHours) h -= cfg.mealDeductHours;
  return Math.round(h * 100) / 100;
}

/* ================= audit ================= */

/** SPEC §3.7: anything within five cents of the stub is green. */
export const AUDIT_TOLERANCE_CENTS = 5;

export interface AuditDelta {
  /** actual − expected; negative means the stub paid short. */
  deltaCents: Cents;
  /** |Δ| ≤ tolerance. */
  ok: boolean;
  /** Δ$ ÷ 548 unit value, for unit-based lines only (2 dp). */
  deltaUnits: number | null;
}

export function auditLine(
  expectedCents: Cents,
  actualCents: Cents,
  opts: { isUnits?: boolean; unit548Cents?: Cents; toleranceCents?: number } = {},
): AuditDelta {
  const tolerance = opts.toleranceCents ?? AUDIT_TOLERANCE_CENTS;
  const deltaCents = actualCents - expectedCents;
  const ok = Math.abs(deltaCents) <= tolerance;
  let deltaUnits: number | null = null;
  if (opts.isUnits && opts.unit548Cents) {
    // Round half AWAY from zero so a shortfall is never understated and
    // over/short mirror each other (Math.round would take -0.045 to -0.04
    // but +0.045 to +0.05, and collapse small shortfalls to -0).
    const magnitude = Math.round((Math.abs(deltaCents) / opts.unit548Cents) * 100) / 100;
    deltaUnits = magnitude === 0 ? 0 : Math.sign(deltaCents) * magnitude;
  }
  return { deltaCents, ok, deltaUnits };
}

/* ================= what-if ================= */

export interface WhatIfInput {
  hours: number;
  units548: number;
  weekend: boolean;
  chargeHours: number;
}

export interface WhatIfResult {
  dGrossCents: Cents;
  d403Cents: Cents;
  dFicaCents: Cents;
  dLeaveCents: Cents;
  dFedMnCents: Cents;
  dNetCents: Cents;
  perHourCents: Cents;
}

// Any fixed Saturday/Monday works — only the weekday matters to the engine.
const WHATIF_WEEKEND_DATE = "2000-01-01"; // Saturday
const WHATIF_WEEKDAY_DATE = "2000-01-03"; // Monday

/**
 * v1's marginal model: recompute the whole period with one hypothetical
 * extra shift so OT/DT rules apply to the marginal hours, then take
 * marginal (not effective) withholding on the added gross.
 */
export function computeWhatIf(shifts: Shift[], cfg: EngineConfig, wi: WhatIfInput): WhatIfResult {
  const hypo: Shift = {
    id: "hypo",
    date: wi.weekend ? WHATIF_WEEKEND_DATE : WHATIF_WEEKDAY_DATE,
    hours: wi.hours,
    chargeHours: wi.chargeHours,
    premiumHours: 0,
    preceptorHours: 0,
    units548: wi.units548,
  };
  const base = computePeriod(shifts, cfg);
  const withHypo = computePeriod([...shifts, hypo], cfg);
  const dGrossCents = withHypo.grossCents - base.grossCents;
  const d403Cents = pctOf(dGrossCents, cfg.k403bPct);
  const dFicaCents = pctOf(dGrossCents, cfg.ssPct + cfg.medicarePct);
  const dLeaveCents = pctOf(dGrossCents, cfg.mnFamPct + cfg.mnMedPct);
  const dFedMnCents = pctOf(dGrossCents - d403Cents, cfg.marginalFedPct + cfg.marginalMnPct);
  const dNetCents = dGrossCents - d403Cents - dFicaCents - dLeaveCents - dFedMnCents;
  const perHourCents = wi.hours > 0 ? Math.round(dNetCents / wi.hours) : 0;
  return { dGrossCents, d403Cents, dFicaCents, dLeaveCents, dFedMnCents, dNetCents, perHourCents };
}
