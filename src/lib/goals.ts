/**
 * The year goal — Knockdown's payoff meter, run the opposite way: a
 * target the year FILLS toward, and a plan priced in the currency Omar
 * actually controls: overtime hours, bonus units, extra shifts.
 *
 * Pure functions. The levers come from the engine's own what-if math
 * (computeWhatIf on the current period), so "one more shift" is worth
 * exactly what the what-if card says — same rules, same rounding.
 */
import { computeWhatIf, type BonusTier, type Cents, type EngineConfig, type Shift } from "./engine.ts";
import { yearGridEnds, type PayPeriod } from "./periods.ts";

export type GoalKind = "gross" | "takehome";

export interface YearGoal {
  /** Dollars as typed. */
  target: string;
  kind: GoalKind;
  /** Pickup lengths available to this person (hours) — the strategizer's menu. */
  lengths?: number[];
  /** Max pickups per check as typed; blank = whatever it takes. */
  maxPickups?: string;
}

/** The lengths a hospital pickup comes in. */
export const PICKUP_LENGTHS = [8, 12, 16] as const;

/** settings key "goals" → JSON Record<year, YearGoal>. */
export type GoalsSetting = Record<string, YearGoal>;

/** What one extra unit of effort is WORTH, gross and take-home. */
export interface GoalLevers {
  /** One extra 12-hour shift, engine-priced against the current period. */
  perShiftGrossCents: Cents;
  perShiftNetCents: Cents;
  /** One overtime hour. */
  perOtHourGrossCents: Cents;
  perOtHourNetCents: Cents;
  /** One critical-shift bonus unit. */
  perUnitGrossCents: Cents;
  perUnitNetCents: Cents;
}

/**
 * Price the levers with the engine. The net side reuses the 12-hour
 * what-if's gross→net ratio (marginal taxes on extra pay); with no
 * shifts yet, it falls back to the config's marginal stack.
 */
export function goalLevers(shifts: Shift[], cfg: EngineConfig): GoalLevers {
  const wi = computeWhatIf(shifts, cfg, { hours: 12, units548: 0, weekend: false, chargeHours: 0 });
  const fallbackKeep =
    1 - (cfg.k403bPct + cfg.ssPct + cfg.medicarePct + cfg.mnFamPct + cfg.mnMedPct + cfg.marginalFedPct + cfg.marginalMnPct) / 100;
  const keep = wi.dGrossCents > 0 ? wi.dNetCents / wi.dGrossCents : fallbackKeep;
  const otRateCents = cfg.otRateOverrideCents !== null && cfg.otRateOverrideCents > 0 ? cfg.otRateOverrideCents : cfg.baseRateCents * cfg.otMult;
  return {
    perShiftGrossCents: wi.dGrossCents,
    perShiftNetCents: wi.dNetCents,
    perOtHourGrossCents: Math.round(otRateCents),
    perOtHourNetCents: Math.round(otRateCents * keep),
    perUnitGrossCents: cfg.unit548Cents,
    perUnitNetCents: Math.round(cfg.unit548Cents * keep),
  };
}

export interface GoalPlan {
  targetCents: Cents;
  kind: GoalKind;
  madeCents: Cents;
  remainingCents: Cents;
  /** 0..1, clamped. */
  progress: number;
  done: boolean;
  /** Checks in the year / already paid-out / still coming. */
  checksInYear: number;
  checksElapsed: number;
  checksLeft: number;
  /** made − straight-line-by-now; + = ahead of pace, − = behind. */
  paceDeltaCents: Cents;
  /** Your average real check so far. */
  avgPerCheckCents: Cents;
  /** What each remaining check must deliver to land the goal. */
  neededPerCheckCents: Cents;
  /** The gap each remaining check has to close beyond your average. 0 = pace already does it. */
  extraPerCheckCents: Cents;
  /** The gap translated into effort, per remaining check. */
  otHoursPerCheck: number;
  unitsPerCheck: number;
  /** Extra 12-hr shifts across the REST of the year. */
  extraShiftsTotal: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildGoalPlan(args: {
  targetCents: Cents;
  kind: GoalKind;
  madeCents: Cents;
  periods: PayPeriod[];
  year: string;
  todayIso: string;
  levers: GoalLevers;
}): GoalPlan | null {
  const { targetCents, kind, madeCents, periods, year, todayIso, levers } = args;
  if (targetCents <= 0) return null;
  const ends = yearGridEnds(periods, year);
  const checksInYear = ends.length;
  const checksElapsed = ends.filter((e) => e <= todayIso).length;
  const checksLeft = checksInYear - checksElapsed;
  const remainingCents = Math.max(0, targetCents - madeCents);
  const progress = Math.min(1, targetCents > 0 ? madeCents / targetCents : 0);
  const paceDeltaCents = checksInYear > 0 ? madeCents - Math.round((targetCents * checksElapsed) / checksInYear) : 0;
  const avgPerCheckCents = checksElapsed > 0 ? Math.round(madeCents / checksElapsed) : 0;
  const neededPerCheckCents = checksLeft > 0 ? Math.round(remainingCents / checksLeft) : remainingCents;
  const extraPerCheckCents = Math.max(0, neededPerCheckCents - avgPerCheckCents);

  const perOtHour = kind === "gross" ? levers.perOtHourGrossCents : levers.perOtHourNetCents;
  const perUnit = kind === "gross" ? levers.perUnitGrossCents : levers.perUnitNetCents;
  const perShift = kind === "gross" ? levers.perShiftGrossCents : levers.perShiftNetCents;

  return {
    targetCents,
    kind,
    madeCents,
    remainingCents,
    progress,
    done: remainingCents === 0,
    checksInYear,
    checksElapsed,
    checksLeft,
    paceDeltaCents,
    avgPerCheckCents,
    neededPerCheckCents,
    extraPerCheckCents,
    otHoursPerCheck: perOtHour > 0 ? round1(extraPerCheckCents / perOtHour) : 0,
    unitsPerCheck: perUnit > 0 ? round1(extraPerCheckCents / perUnit) : 0,
    extraShiftsTotal: perShift > 0 && checksLeft > 0 ? round1((extraPerCheckCents * checksLeft) / perShift) : 0,
  };
}

/* ---------------- the pickup strategizer ---------------- */

/**
 * The extra-shift bonus units a pickup of this length earns, from THIS
 * week's tiers — a 12-hr extra is 10 units ($500), the current 16-hr
 * tier is 8. Superseded tiers (label says "old") never count; no
 * matching tier (an 8, usually) → no units.
 */
export function tierUnitsForLength(tiers: BonusTier[], hours: number): number {
  const hit = tiers.find((t) => !/old/i.test(t.label) && new RegExp(`\\b${hours}\\b`).test(t.label) && /extra/i.test(t.label));
  return hit ? hit.units : 0;
}

export interface PickupValue {
  hours: number;
  units: number;
  grossCents: Cents;
  netCents: Cents;
}

/**
 * What a real pickup PAYS, length by length — engine what-if math on
 * the current period (OT reality included) plus the tier bonus the
 * length actually carries.
 */
export function pickupValues(shifts: Shift[], cfg: EngineConfig, tiers: BonusTier[], lengths: number[]): PickupValue[] {
  return [...lengths]
    .sort((a, b) => a - b)
    .map((hours) => {
      const units = tierUnitsForLength(tiers, hours);
      const wi = computeWhatIf(shifts, cfg, { hours, units548: units, weekend: false, chargeHours: 0 });
      return { hours, units, grossCents: wi.dGrossCents, netCents: wi.dNetCents };
    });
}

export interface PickupRecipe {
  /** e.g. [{hours: 16, count: 1}, {hours: 8, count: 1}] per check. */
  parts: Array<{ hours: number; count: number }>;
  pickupsPerCheck: number;
  addsPerCheckCents: Cents;
  /** True when the recipe covers the per-check gap. */
  covers: boolean;
  /** The most your stated availability can add per check. */
  maxAddablePerCheckCents: Cents;
}

const MAX_PICKUPS_HARD = 6;

/**
 * The concrete combo: fewest pickups per check that cover the gap
 * (ties → least overshoot). Small space, searched exactly. When even
 * the max doesn't cover, the recipe is the best the availability can
 * do and `covers` is false — the UI owes the person the honest landing
 * spot, not a fantasy.
 */
export function buildPickupPlan(
  extraPerCheckCents: Cents,
  values: PickupValue[],
  kind: GoalKind,
  maxPickupsPerCheck: number,
): PickupRecipe | null {
  if (values.length === 0) return null;
  const cap = maxPickupsPerCheck > 0 ? Math.min(maxPickupsPerCheck, MAX_PICKUPS_HARD) : MAX_PICKUPS_HARD;
  const worth = (v: PickupValue) => (kind === "gross" ? v.grossCents : v.netCents);
  if (extraPerCheckCents <= 0) {
    return { parts: [], pickupsPerCheck: 0, addsPerCheckCents: 0, covers: true, maxAddablePerCheckCents: cap * Math.max(...values.map(worth)) };
  }

  let best: { counts: number[]; total: Cents; n: number } | null = null;
  let maxAddable = 0;
  const counts = new Array<number>(values.length).fill(0);
  const walk = (idx: number, used: number, total: Cents) => {
    if (total > maxAddable && used <= cap) maxAddable = total;
    if (total >= extraPerCheckCents) {
      if (
        best === null ||
        used < best.n ||
        (used === best.n && total < best.total)
      ) {
        best = { counts: [...counts], total, n: used };
      }
      return; // adding more only overshoots further
    }
    if (idx >= values.length || used >= cap) return;
    for (let c = 0; used + c <= cap; c++) {
      counts[idx] = c;
      walk(idx + 1, used + c, total + c * worth(values[idx]));
    }
    counts[idx] = 0;
  };
  walk(0, 0, 0);

  if (best === null) {
    // availability can't cover — best effort = the max-value fill
    const sorted = [...values].sort((a, b) => worth(b) - worth(a));
    const parts = sorted[0] ? [{ hours: sorted[0].hours, count: cap }] : [];
    const adds = sorted[0] ? cap * worth(sorted[0]) : 0;
    return { parts, pickupsPerCheck: cap, addsPerCheckCents: adds, covers: false, maxAddablePerCheckCents: adds };
  }
  const chosen = best as { counts: number[]; total: Cents; n: number };
  const parts = chosen.counts
    .map((count, i) => ({ hours: values[i].hours, count }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.hours - a.hours);
  return {
    parts,
    pickupsPerCheck: chosen.n,
    addsPerCheckCents: chosen.total,
    covers: true,
    maxAddablePerCheckCents: Math.max(maxAddable, chosen.total),
  };
}

/** Parse the stored goals setting; junk → no goals. */
export function parseGoals(raw: string | undefined | null): GoalsSetting {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as GoalsSetting;
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
