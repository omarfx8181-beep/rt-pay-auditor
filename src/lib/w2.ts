/**
 * The W-2 check — January's version of "is the check right?". From the
 * year's own data, estimate what each W-2 box SHOULD say, then compare
 * the real form when it arrives. Box math (employee side):
 *   box 1/16  = gross − 403(b) − Section 125   (imputed life stays IN)
 *   box 3/5   = gross − Section 125            (403(b) stays FICA-taxable)
 *   box 2/17  = federal / Minnesota withheld
 * Estimates, honestly labeled: Section 125 is the fixed per-check
 * premium from each period's own rules; 403(b) is the rest of that
 * period's pretax; correction checks add wages whose withholding the
 * app can't see.
 */
import type { Cents } from "./engine.ts";
import { computeNet, computePeriod } from "./engine.ts";
import { draftToConfig, draftToLeave, draftToShift } from "./draft.ts";
import { isPlaceholder, parseDollars, periodMoney, type PayPeriod } from "./periods.ts";

export interface W2Estimate {
  year: string;
  box1Cents: Cents;
  box2Cents: Cents;
  box3Cents: Cents;
  box5Cents: Cents;
  box16Cents: Cents;
  box17Cents: Cents;
  /** Periods included / carrying only totals (their pretax split is engine-estimated at zero detail). */
  periodCount: number;
  totalsOnlyCount: number;
  /** Correction wages included in box 1 whose withholding the app can't see. */
  correctionGrossCents: Cents;
}

export function estimateW2(periods: PayPeriod[], year: string): W2Estimate | null {
  const inYear = periods.filter((p) => p.endDate.slice(0, 4) === year);
  if (inYear.length === 0) return null;
  const est: W2Estimate = {
    year,
    box1Cents: 0,
    box2Cents: 0,
    box3Cents: 0,
    box5Cents: 0,
    box16Cents: 0,
    box17Cents: 0,
    periodCount: 0,
    totalsOnlyCount: 0,
    correctionGrossCents: 0,
  };
  for (const p of inYear) {
    // An empty window the grid rolled forward has no wages, but it still
    // carries a full period of Section-125 deductions and a negative
    // engine withholding — left in, each one quietly took ~$419 off Box 1.
    if (isPlaceholder(p)) continue;
    const m = periodMoney(p);
    const cfg = draftToConfig(p.cfgDraft);
    const engineNet = computeNet(computePeriod(p.shifts.map(draftToShift), cfg, (p.leave ?? []).map(draftToLeave)).grossCents, cfg);
    const s125 = cfg.medCents + cfg.dentCents + cfg.fsaCents;
    const pretax = m.buckets?.pretaxCents ?? engineNet.pretaxCents;
    const k403 = Math.max(0, pretax - s125);
    est.periodCount += 1;
    if (m.buckets === null) est.totalsOnlyCount += 1;
    est.correctionGrossCents += m.correctionGrossCents;
    est.box1Cents += m.grossCents - k403 - s125;
    est.box3Cents += m.grossCents - m.correctionGrossCents - s125;
    est.box5Cents += m.grossCents - m.correctionGrossCents - s125;
    est.box2Cents += parseDollars(p.actual?.fed) ?? engineNet.fedCents;
    est.box17Cents += parseDollars(p.actual?.mn) ?? engineNet.mnCents;
  }
  // Correction wages are FICA wages too — add them back (no S125 on an
  // off-cycle check).
  est.box3Cents += est.correctionGrossCents;
  est.box5Cents += est.correctionGrossCents;
  est.box16Cents = est.box1Cents;
  return est;
}

export interface W2Typed {
  box1: string;
  box2: string;
  box3: string;
  box5: string;
  box16: string;
  box17: string;
}

export const EMPTY_W2: W2Typed = { box1: "", box2: "", box3: "", box5: "", box16: "", box17: "" };

export function parseW2Setting(raw: string | undefined | null): Record<string, W2Typed> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, W2Typed>;
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
