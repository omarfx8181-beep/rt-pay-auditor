/**
 * The year goal — Knockdown's payoff meter, run the opposite way: a
 * target the year FILLS toward, and a plan priced in the currency Omar
 * actually controls: overtime hours, bonus units, extra shifts.
 *
 * Pure functions. The levers come from the engine's own what-if math
 * (computeWhatIf on the current period), so "one more shift" is worth
 * exactly what the what-if card says — same rules, same rounding.
 */
import { computeWhatIf, type Cents, type EngineConfig, type Shift } from "./engine.ts";
import { yearGridEnds, type PayPeriod } from "./periods.ts";

export type GoalKind = "gross" | "takehome";

export interface YearGoal {
  /** Dollars as typed. */
  target: string;
  kind: GoalKind;
}

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
