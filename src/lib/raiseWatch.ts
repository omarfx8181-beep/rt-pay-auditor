/**
 * Raise watch — every real stub implies a base hourly rate, so compare
 * it to the configured one and a landed (or missing) raise is caught the
 * day the stub arrives.
 *
 * The regular line is base rate × regular hours and nothing else:
 * weekend and evening differentials, charge/premium/preceptor adders,
 * overtime and double time each post as their own line (engine.ts
 * computePeriod), so reg$ ÷ regHours is the rate payroll actually used.
 *
 * Which regHours, though. Dollars ÷ hours cannot tell a rate change from
 * an hours mismatch — 72 logged hours against a stub that paid 73.5
 * implies a raise that never happened, and two of six shifts logged
 * implies $160/hr — so the divisor has to be the stub's OWN quantity for
 * that line, read off the stub next to the dollars (stubFill.ts). The
 * engine's PeriodResult.regHours comes in alongside it as corroboration:
 * they must agree, or the shift list and the stub are describing
 * different work and nothing here can be said about the rate. That gate
 * also covers the leave trap — paid leave is base rate too but bills on
 * its own line (PeriodResult.leaveHours), and a stub that bundles leave
 * into regular pay prints the bundled hours, which won't match.
 *
 * Pure, integer cents.
 */
import type { Cents } from "./engine.ts";
import { parseDollars } from "./periods.ts";

/** Below this the gap is stub rounding, not a rate change. */
export const RAISE_TOLERANCE_CENTS = 5;

/**
 * The engine snaps hours to hundredths, so agreement is judged in those:
 * one of them apart is how the stub printed the number, not different work.
 */
const HOURS_TOLERANCE_CENTI = 1;

export interface RaiseSignal {
  impliedRateCents: Cents;
  baseRateCents: Cents;
  /** Signed implied − configured: positive is a raise, negative is short. */
  deltaCents: Cents;
  kind: "raise" | "below";
}

/** "73.50", "73.5 hrs" → 73.5; null for anything unreadable or non-positive. */
const parseHours = (raw: string | undefined): number | null => {
  const n = parseFloat((raw ?? "").trim().replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The rate this stub implies against the configured one, or null when
 * there is no signal: unreadable/empty/non-positive regular pay, no
 * configured rate, or a gap inside the rounding tolerance.
 *
 * Also null — deliberately — whenever the divisor can't be trusted: no
 * hours read off the stub's regular line, under an hour of them, or
 * hours that disagree with what the shift list says was worked. A stale
 * rate is a nudge; naming the wrong number would send Omar to Me to
 * type a rate payroll never paid, and every future check would audit
 * against it.
 */
export function raiseCheck(args: {
  /** The stub's regular-pay line exactly as typed — "$4,202.40", blanks and all. */
  actualReg: string | undefined;
  /** The hours printed on that same line, from the stub itself. */
  stubRegHours: string | undefined;
  /** PeriodResult.regHours — straight time capped at the OT line. */
  regHours: number;
  baseRateCents: Cents;
}): RaiseSignal | null {
  const { regHours, baseRateCents } = args;
  const actualRegCents = parseDollars(args.actualReg);
  if (actualRegCents === null || !Number.isFinite(actualRegCents) || actualRegCents <= 0) return null;
  if (!Number.isFinite(baseRateCents) || baseRateCents <= 0) return null;
  const stubHours = parseHours(args.stubRegHours);
  if (stubHours === null || stubHours < 1) return null; // a sliver of an hour can't imply a rate
  const centi = Math.round(stubHours * 100); // engine idiom: hours snap to hundredths first
  if (!(Math.abs(centi - Math.round(regHours * 100)) <= HOURS_TOLERANCE_CENTI)) return null; // NaN-safe
  const impliedRateCents = Math.round((actualRegCents * 100) / centi);
  const deltaCents = impliedRateCents - baseRateCents;
  if (Math.abs(deltaCents) <= RAISE_TOLERANCE_CENTS) return null;
  return { impliedRateCents, baseRateCents, deltaCents, kind: deltaCents > 0 ? "raise" : "below" };
}
