/**
 * Facility Profile + Role presets — V3 brief §6 groundwork.
 *
 * Pay rules are DATA, not code: everything a hospital/role pair needs —
 * differential rates, OT/DT thresholds, bonus codes and tiers, pay
 * cycle, deduction defaults — lives in one portable object. Adding a
 * hospital or role someday = adding a preset, not touching the engine.
 * `presetSource` and `version` ship now so future imports ("someone at
 * your hospital already set this up") and migrations can tell presets
 * apart. No switching UI yet — Fairview RT is the one and only preset,
 * and everything seeds from it.
 *
 * This module is intentionally dependency-free at runtime (type-only
 * imports), so engine.ts and draft.ts can consume it without cycles.
 */
import type { BonusTier } from "./engine.ts";
import type { CfgDraft } from "./draft.ts";

export interface FacilityProfile {
  id: string;
  name: string;
  /** Timekeeping system, for copy that names it ("your timecard"). */
  timekeeping: string;
  payCycle: "biweekly";
  periodDays: number;
  /** Days from period end to the money landing (Fairview: the Friday after). */
  paydayDelayDays: number;
  /**
   * The stub codes this facility uses, by engine line key. Receipts and
   * the HR email speak these; default views never do.
   */
  codes: Record<string, string>;
}

export interface RolePreset {
  id: string;
  name: string;
  shortName: string;
}

export interface PayRulesPreset {
  /** Where the preset came from — built-in now, community/import later. */
  presetSource: string;
  /** Bump when the rules change, so imports and migrations can compare. */
  version: number;
  facility: FacilityProfile;
  role: RolePreset;
  /**
   * Period config seed in UI-draft form (strings — exactly what periods
   * store). Decoded from Omar's real 6/22–7/05 stub; reconciles to $0.02.
   * The presets test pins draftToConfig(cfgDraft) === engine DEFAULT_CFG.
   */
  cfgDraft: CfgDraft;
  /** This facility's current bonus tiers — they change week to week. */
  tiers: BonusTier[];
}

export const FAIRVIEW_RT_PRESET: PayRulesPreset = {
  presetSource: "rt-pay built-in",
  version: 1,
  facility: {
    id: "m-health-fairview",
    name: "M Health Fairview",
    timekeeping: "Kronos",
    payCycle: "biweekly",
    periodDays: 14,
    paydayDelayDays: 5,
    codes: { bonus548: "548", charge: "308", premium: "320" },
  },
  role: {
    id: "respiratory-therapist",
    name: "Respiratory Therapist",
    shortName: "RT",
  },
  // v1 DEFAULT_CFG, decoded from the stub (PP 6/22–7/05) — verbatim.
  cfgDraft: {
    baseRate: "52.53",
    otMult: "1.5",
    dtMult: "2.0",
    otPeriod: "80",
    dtDaily: "12",
    otRateOverride: "85.74",
    weekendDiff: "2.00",
    eveningDiff: "2.00",
    eveningHours: "18.45",
    chargeRate: "3.00",
    premiumRate: "3.00",
    preceptorRate: "3.00",
    unit548: "50",
    imputed: "1.81",
    k403bPct: "3.0",
    med: "276.61",
    dent: "64.55",
    fsa: "76.92",
    fedEff: "13.6977",
    mnEff: "6.0205",
    marginalFed: "22",
    marginalMN: "6.8",
    mnFam: "0.135",
    mnMed: "0.305",
    acc: "6.12",
    crit: "5.19",
    otherAfterTax: "87.73",
    mealDeduct: "0.5",
    mealThreshold: "6",
  },
  // v1 DEFAULT_TIERS verbatim — the weekly incentive sheet as data.
  tiers: [
    { id: "t1", label: "Shift extension > 4 hr", units: 2 },
    { id: "t2", label: "Shift extension ≤ 4 hr (confirm)", units: 1 },
    { id: "t3", label: "12-hr extra shift ($500)", units: 10 },
    { id: "t4", label: "16-hr extra shift (current)", units: 8 },
    { id: "t5", label: "Transport run ≤ 4 hr", units: 1 },
    { id: "t6", label: "Transport run > 4 hr", units: 2 },
    { id: "t7", label: "4-hr extra — old tier ($125)", units: 2.5 },
    { id: "t8", label: "16-hr extra — old tier ($750)", units: 15 },
  ],
};
