/**
 * UI drafts: everything the user types lives as strings (like v1's state)
 * and is parsed HERE, at the boundary, into the engine's typed cents
 * config. The engine itself never sees a string. Seeds are v1's
 * DEFAULT_CFG / DEMO_SHIFTS / ACTUAL_SEED verbatim.
 */
import { DEFAULT_CFG, dollarsToCents, type EngineConfig, type LeaveEntry, type LeaveType, type Shift } from "./engine.ts";
import { FAIRVIEW_RT_PRESET } from "./presets.ts";

/** v1's num(): parse-or-zero at the input boundary. */
export const num = (v: string): number => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

/** Unique across reloads — shifts persist now, so a counter would collide. */
export const uid = (): string => crypto.randomUUID();

/* ---------------- config draft ---------------- */

export interface CfgDraft {
  baseRate: string;
  otMult: string;
  dtMult: string;
  otPeriod: string;
  dtDaily: string;
  otRateOverride: string;
  weekendDiff: string;
  eveningDiff: string;
  eveningHours: string;
  chargeRate: string;
  premiumRate: string;
  preceptorRate: string;
  unit548: string;
  imputed: string;
  k403bPct: string;
  med: string;
  dent: string;
  fsa: string;
  fedEff: string;
  mnEff: string;
  marginalFed: string;
  marginalMN: string;
  mnFam: string;
  mnMed: string;
  acc: string;
  crit: string;
  otherAfterTax: string;
  mealDeduct: string;
  mealThreshold: string;
}

/**
 * The seed config now LIVES in the Fairview RT preset (V3-M7, §6 —
 * rules are data, not constants); this alias keeps every existing
 * import working. Values are v1 DEFAULT_CFG decoded from the stub
 * (PP 6/22–7/05), unchanged.
 */
export const DEFAULT_CFG_DRAFT: CfgDraft = FAIRVIEW_RT_PRESET.cfgDraft;

export function draftToConfig(d: CfgDraft): EngineConfig {
  return {
    baseRateCents: dollarsToCents(num(d.baseRate)),
    otMult: num(d.otMult),
    dtMult: num(d.dtMult),
    otPeriodHours: num(d.otPeriod),
    dtDailyHours: num(d.dtDaily),
    otRateOverrideCents: num(d.otRateOverride) > 0 ? dollarsToCents(num(d.otRateOverride)) : null,
    weekendDiffCents: dollarsToCents(num(d.weekendDiff)),
    eveningDiffCents: dollarsToCents(num(d.eveningDiff)),
    eveningHours: num(d.eveningHours),
    chargeRateCents: dollarsToCents(num(d.chargeRate)),
    premiumRateCents: dollarsToCents(num(d.premiumRate)),
    preceptorRateCents: dollarsToCents(num(d.preceptorRate)),
    unit548Cents: dollarsToCents(num(d.unit548)),
    imputedCents: dollarsToCents(num(d.imputed)),
    k403bPct: num(d.k403bPct),
    medCents: dollarsToCents(num(d.med)),
    dentCents: dollarsToCents(num(d.dent)),
    fsaCents: dollarsToCents(num(d.fsa)),
    fedEffPct: num(d.fedEff),
    mnEffPct: num(d.mnEff),
    marginalFedPct: num(d.marginalFed),
    marginalMnPct: num(d.marginalMN),
    mnFamPct: num(d.mnFam),
    mnMedPct: num(d.mnMed),
    ssPct: DEFAULT_CFG.ssPct,
    medicarePct: DEFAULT_CFG.medicarePct,
    accCents: dollarsToCents(num(d.acc)),
    critCents: dollarsToCents(num(d.crit)),
    otherAfterTaxCents: dollarsToCents(num(d.otherAfterTax)),
    mealDeductHours: num(d.mealDeduct),
    mealThresholdHours: num(d.mealThreshold),
  };
}

/* ---------------- shift drafts ---------------- */

export interface ShiftDraft {
  id: string;
  date: string;
  hours: string;
  charge: string;
  premium: string;
  preceptor: string;
  units548: string;
  note: string;
}

export function draftToShift(s: ShiftDraft): Shift {
  return {
    id: s.id,
    date: s.date,
    hours: num(s.hours),
    chargeHours: num(s.charge),
    premiumHours: num(s.premium),
    preceptorHours: num(s.preceptor),
    units548: num(s.units548),
    note: s.note,
  };
}

export function blankShift(): ShiftDraft {
  return { id: uid(), date: "", hours: "12", charge: "0", premium: "0", preceptor: "0", units548: "0", note: "" };
}

/* ---------------- leave drafts (Kronos Time Off codes) ---------------- */

export interface LeaveDraft {
  id: string;
  date: string;
  hours: string;
  type: LeaveType;
}

export function draftToLeave(l: LeaveDraft): LeaveEntry {
  return { id: l.id, date: l.date, hours: num(l.hours), type: l.type };
}

/** Device-local YYYY-MM-DD. */
export const todayIso = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Calling in is a same-day event: new leave defaults to TODAY. */
export function blankLeave(type: LeaveType): LeaveDraft {
  return { id: uid(), date: todayIso(), hours: "12", type };
}

/** v1 DEMO_SHIFTS — the real 6/22–7/05 period. */
export const DEMO_SHIFTS: ShiftDraft[] = [
  { id: uid(), date: "2026-06-23", hours: "15.60", charge: "0", premium: "12", preceptor: "0", units548: "2", note: "Ext > 4h" },
  { id: uid(), date: "2026-06-24", hours: "14.40", charge: "0", premium: "12", preceptor: "0", units548: "4", note: "Ext + transport" },
  { id: uid(), date: "2026-06-25", hours: "12.20", charge: "12", premium: "12", preceptor: "0", units548: "0", note: "" },
  { id: uid(), date: "2026-06-28", hours: "14.90", charge: "0", premium: "0", preceptor: "0", units548: "8", note: "16-hr extra" },
  { id: uid(), date: "2026-06-30", hours: "12.00", charge: "4", premium: "0", preceptor: "0", units548: "0", note: "" },
  { id: uid(), date: "2026-07-01", hours: "11.80", charge: "12", premium: "0", preceptor: "0", units548: "0", note: "" },
  { id: uid(), date: "2026-07-02", hours: "15.70", charge: "12", premium: "0", preceptor: "0", units548: "2", note: "Ext > 4h" },
  { id: uid(), date: "2026-07-05", hours: "15.80", charge: "12", premium: "0", preceptor: "0", units548: "8", note: "16-hr extra" },
];

/** v1 ACTUAL_SEED — the real stub, line by line, for the Audit tab. */
export const ACTUAL_SEED: Record<string, string> = {
  reg: "4202.40",
  ot: "1354.71",
  dt: "1744.00",
  weekend: "61.40",
  evening: "36.90",
  charge: "156.00",
  premium: "108.00",
  preceptor: "0",
  bonus548: "1200.00",
  imputed: "1.81",
  gross: "8865.22",
  fed: "1120.64",
  mn: "492.55",
  ss: "523.72",
  medicare: "122.49",
  mnFam: "11.96",
  mnMed: "27.04",
  pretax: "683.98",
  aftertax: "99.04",
  net: "5781.99",
};
