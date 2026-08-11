/**
 * Kronos rounding watch — the timecard prints when you PUNCHED and what
 * it PAID, and those are not the same number. Rounding to the quarter
 * hour shaves minutes off one day and hands them back on another, and
 * the shaved ones are money nobody sees: the stub only ever shows the
 * paid side, so there is nothing there to audit against.
 *
 * Punched minus paid is NOT the shave on its own. Two things come out
 * of that gap first, or the note invents money:
 *
 *  - The unpaid meal. A shift past the meal threshold is paid half an
 *    hour less than its span (engine.scheduleHours, cfg.mealDeductHours
 *    / cfg.mealThresholdHours — 06:45–19:15 pays 12.00), and a card
 *    whose meal is AUTO-deducted prints one punch pair for the day. So
 *    a single unbroken pair past the threshold loses the meal before
 *    the diff. A day punched out for the meal prints two pairs and has
 *    already excluded it — those are left alone.
 *  - Anything bigger than rounding can physically be. Snapping to the
 *    quarter hour moves each punch by at most half a grain, so a day
 *    can drift by at most MAX_ROUNDING_MINUTES_PER_PUNCH per punch. A
 *    wider gap is a missed punch, the other meal convention, or a
 *    misread — possibly real money, but not rounding and not citable
 *    as it. Those days sit out in `unexplained` instead of being
 *    priced, in both directions: an over-subtracted meal would
 *    otherwise read as a phantom GAIN and hide real losses.
 *
 * Two figures, and the honest read needs both.
 *
 * `minutes`/`estCents` are the CONSERVATIVE total — only the days that
 * paid SHORT, each clamped at zero, gains never netted against them.
 * Those are the days that can be pointed at one by one, and they are
 * what a dispute is made of.
 *
 * `netMinutes`/`netEstCents` are that same period with the paid-up days
 * counted back in. Kronos rounding is meant to be symmetric and usually
 * nearly is, so a UI that quotes the loss alone will eventually send
 * Omar to payroll over a period that came out ahead. Show both: the
 * loss is the finding, the net is whether it's worth the email.
 *
 * Pure, integer cents.
 */
import type { Cents, EngineConfig } from "./engine.ts";
import type { TimecardDay } from "./timecard.ts";

/** Under this many lost minutes across the whole period it's noise, not a finding. */
export const ROUNDING_NOISE_MINUTES = 5;

/**
 * The most one punch moves when Kronos snaps it to the quarter hour:
 * half a grain, rounded up to the whole minute the timecard prints.
 */
export const MAX_ROUNDING_MINUTES_PER_PUNCH = 8;

const MINUTES_PER_DAY = 24 * 60;

/** A day's whole drift budget: two punches to a pair. */
const roundingCeiling = (pairs: number): number => MAX_ROUNDING_MINUTES_PER_PUNCH * 2 * pairs;

/** 24h "HH:MM" → minutes past midnight; null for anything else. */
const clockMinutes = (v: unknown): number | null => {
  const m = typeof v === "string" ? /^\s*(\d{1,2}):(\d{2})\s*$/.exec(v) : null;
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  return hours > 23 || mins > 59 ? null : hours * 60 + mins;
};

/**
 * Minutes on the clock across the day's segments, or null when the day
 * isn't measurable. All-or-nothing, matching timecard.asPunches: one
 * unreadable or zero-length pair and the whole day drops, because a
 * partial span reads as a phantom GAIN that would hide real losses
 * elsewhere. A day with no punches is likewise null, never zero — zero
 * against 12 paid hours would invent a full-shift loss.
 */
const punchedMinutes = (day: TimecardDay): number | null => {
  if (!Array.isArray(day.punches) || day.punches.length === 0) return null;
  let total = 0;
  for (const p of day.punches) {
    const start = clockMinutes(p?.in);
    const end = clockMinutes(p?.out);
    if (start === null || end === null || start === end) return null;
    total += end < start ? end + MINUTES_PER_DAY - start : end - start; // out before in = the shift rolled past midnight
  }
  return total;
};

export interface RoundingLoss {
  /** Minutes summed over the short days only — the citable total. */
  minutes: number;
  estCents: Cents;
  /** The short days, in the order given. Days rounding paid up are not here. */
  days: { date: string; minutes: number }[];
  /** Losses minus the paid-up days. Negative means the period came out ahead overall. */
  netMinutes: number;
  netEstCents: Cents;
  /** Dates whose gap is too wide to be rounding — measured, never priced. */
  unexplained: string[];
}

/**
 * What Kronos rounding cost over these timecard days, at the period's
 * own rules (base rate and meal deduction both come off `cfg`).
 *
 * Null when nothing is worth saying: no day carried legible punches, or
 * the losses total under ROUNDING_NOISE_MINUTES. The gate is on the LOSS
 * total, not the net — 20 minutes shaved off two days is still worth
 * seeing on a period that netted 20 minutes ahead, which is exactly why
 * both numbers come back. It is also a gate on ROUNDING: days outside
 * the model ride along with a finding, they never make one.
 *
 * Days pass through unmeasured when they have no punches, when any punch
 * is unreadable, or when paid hours aren't a positive number.
 * `cfg.baseRateCents` at zero or unset prices the minutes at nothing
 * rather than dropping them — the time is real before the rate is
 * configured.
 */
export function roundingLoss(days: TimecardDay[], cfg: EngineConfig): RoundingLoss | null {
  const rate = Number.isFinite(cfg.baseRateCents) && cfg.baseRateCents > 0 ? cfg.baseRateCents : 0;
  const cents = (mins: number): Cents => Math.round((mins * rate) / 60) || 0; // `|| 0` keeps -0 out of the output
  const mealMinutes = Number.isFinite(cfg.mealDeductHours) ? Math.round(cfg.mealDeductHours * 60) : 0;
  const mealThreshold = Number.isFinite(cfg.mealThresholdHours) ? cfg.mealThresholdHours * 60 : Number.POSITIVE_INFINITY;
  const short: { date: string; minutes: number }[] = [];
  const unexplained: string[] = [];
  let minutes = 0;
  let netMinutes = 0;
  for (const day of days) {
    const punched = punchedMinutes(day);
    if (punched === null || !Number.isFinite(day.hours) || day.hours <= 0) continue;
    const pairs = day.punches?.length ?? 0; // punched !== null means at least one
    // One unbroken pair past the threshold = the meal was auto-deducted, never punched.
    const worked = pairs === 1 && punched > mealThreshold ? punched - mealMinutes : punched;
    const delta = Math.round(worked - day.hours * 60);
    if (Math.abs(delta) > roundingCeiling(pairs)) {
      unexplained.push(day.date);
      continue;
    }
    netMinutes += delta;
    if (delta >= 1) {
      minutes += delta;
      short.push({ date: day.date, minutes: delta });
    }
  }
  // A period with no legible punches can never accumulate a loss, so it falls out here too.
  if (minutes < ROUNDING_NOISE_MINUTES) return null;
  return {
    minutes,
    estCents: cents(minutes),
    days: short,
    netMinutes,
    netEstCents: cents(netMinutes),
    unexplained,
  };
}
