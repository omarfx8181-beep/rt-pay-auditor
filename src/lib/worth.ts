/**
 * What each shift REALLY added — the whole period computed with and
 * without it, so overtime and double-time interplay is exact: the
 * shift that tipped the period past 80 hours carries the OT money it
 * unlocked. Net rides the same engine (fixed deductions cancel in the
 * diff). Pure functions, integer cents.
 */
import { computeNet, computePeriod, type Cents, type EngineConfig, type LeaveEntry, type Shift } from "./engine.ts";

export interface ShiftWorth {
  grossCents: Cents;
  netCents: Cents;
}

/** Marginal value of every shift in the period, keyed by shift id. */
export function shiftWorths(shifts: Shift[], cfg: EngineConfig, leave: LeaveEntry[] = []): Map<string, ShiftWorth> {
  const map = new Map<string, ShiftWorth>();
  if (shifts.length === 0) return map;
  const all = computePeriod(shifts, cfg, leave);
  const allNet = computeNet(all.grossCents, cfg).netCents;
  for (const s of shifts) {
    const rest = computePeriod(
      shifts.filter((x) => x.id !== s.id),
      cfg,
      leave,
    );
    const restNet = computeNet(rest.grossCents, cfg).netCents;
    map.set(s.id, { grossCents: all.grossCents - rest.grossCents, netCents: allNet - restNet });
  }
  return map;
}
