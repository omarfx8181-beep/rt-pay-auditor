/**
 * The time-off bank auditor — the paycheck distrust, aimed at the
 * second number hospitals fumble: PTO/STO accrual. You tell it the
 * accrual rate and a known starting balance; it already knows every
 * worked hour and every sick day you logged, so it can say what the
 * bank SHOULD read and compare it to what Kronos says.
 */
import type { Cents } from "./engine.ts";
import { periodMoney, type PayPeriod } from "./periods.ts";
import { num } from "./draft.ts";

export interface PtoConfig {
  /** Bank hours earned per hour worked, as typed (e.g. "0.0577"). */
  accrualPerHour: string;
  /** Bank cap in hours; blank = no cap. */
  capHours: string;
  /** Known-good balance to start from (off a stub or Kronos)… */
  startBalance: string;
  /** …as of this date — accrual counts periods ENDING AFTER it. */
  asOf: string;
  /** What Kronos shows right now, as typed; blank = nothing to compare. */
  kronosSays: string;
}

export const EMPTY_PTO: PtoConfig = { accrualPerHour: "", capHours: "", startBalance: "", asOf: "", kronosSays: "" };

export function parsePto(raw: string | undefined | null): PtoConfig {
  if (!raw) return EMPTY_PTO;
  try {
    return { ...EMPTY_PTO, ...(JSON.parse(raw) as Partial<PtoConfig>) };
  } catch {
    return EMPTY_PTO;
  }
}

export interface PtoAudit {
  /** Hours the bank should hold today. */
  expectedHours: number;
  accruedHours: number;
  /** STO hours logged in the app since asOf (they leave the bank). */
  usedHours: number;
  workedHours: number;
  /** Periods that carried worked hours; totals-only periods can't contribute. */
  countedPeriods: number;
  skippedPeriods: number;
  capped: boolean;
  /** expected − kronosSays; null when kronosSays is blank. + = Kronos shows too little. */
  deltaHours: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Null until the config has a rate and an as-of date. */
export function auditPto(periods: PayPeriod[], cfg: PtoConfig): PtoAudit | null {
  const rate = num(cfg.accrualPerHour);
  if (rate <= 0 || cfg.asOf === "") return null;
  let workedHours = 0;
  let usedHours = 0;
  let countedPeriods = 0;
  let skippedPeriods = 0;
  for (const p of periods) {
    if (p.endDate <= cfg.asOf) continue;
    const m = periodMoney(p);
    if (m.workedHours > 0) {
      workedHours += m.workedHours;
      countedPeriods += 1;
    } else if (m.stubTrue) {
      // a backfilled totals-only check — real money, but no hours to accrue from
      skippedPeriods += 1;
    }
    for (const l of p.leave ?? []) if (l.type === "sto") usedHours += num(l.hours);
  }
  const accruedHours = round2(workedHours * rate);
  const uncapped = num(cfg.startBalance) + accruedHours - usedHours;
  const cap = num(cfg.capHours);
  const capped = cap > 0 && uncapped > cap;
  const expectedHours = round2(capped ? cap : uncapped);
  const kronos = cfg.kronosSays.trim() === "" ? null : num(cfg.kronosSays);
  return {
    expectedHours,
    accruedHours,
    usedHours: round2(usedHours),
    workedHours: round2(workedHours),
    countedPeriods,
    skippedPeriods,
    capped,
    deltaHours: kronos === null ? null : round2(expectedHours - kronos),
  };
}

/** Hours the audit forgives — Kronos rounds per pay period. */
export const PTO_TOLERANCE_HOURS = 0.5;

/** Cents value of the bank at the base rate — what the hours are worth. */
export const ptoValueCents = (hours: number, baseRateCents: Cents): Cents => Math.round(hours * baseRateCents);
