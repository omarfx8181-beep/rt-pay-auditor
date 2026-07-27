/**
 * "Why is this check different?" — answered by pure code, never a
 * guess. Headline: the real money delta between two periods (stub
 * numbers when entered, engine otherwise, corrections included).
 * Drivers: the engine's own pay lines diffed key by key with each
 * period's OWN rules — so "two fewer shifts" and "the bonus tier
 * moved" both show up as the dollars they actually are.
 */
import { computePeriod, type Cents } from "./engine.ts";
import { draftToConfig, draftToLeave, draftToShift } from "./draft.ts";
import { periodMoney, type PayPeriod } from "./periods.ts";

export interface DiffDriver {
  key: string;
  /** Plain label from the engine line ("Regular hours", "Weekend pay"…). */
  label: string;
  /** Signed: + = this check has more of it. */
  deltaCents: Cents;
  /** Signed hours (or bonus-units) change behind the dollars. */
  qtyDelta: number;
  /** True when qtyDelta is bonus units, not hours. */
  isUnits: boolean;
}

export interface CheckDiff {
  prevStart: string;
  prevEnd: string;
  /** Real-money deltas (stub-true where available, corrections in). */
  grossDeltaCents: Cents;
  netDeltaCents: Cents;
  /** Engine-side drivers, biggest first, dollar-plus only. */
  drivers: DiffDriver[];
  /** +2 = two more shifts this period. */
  shiftsDelta: number;
}

const lineMap = (p: PayPeriod) => {
  const cfg = draftToConfig(p.cfgDraft);
  const result = computePeriod(p.shifts.map(draftToShift), cfg, (p.leave ?? []).map(draftToLeave));
  const map = new Map<string, { label: string; amountCents: Cents; qty: number; isUnits: boolean }>();
  for (const l of result.lines) {
    if (l.nonCash) continue; // imputed life is noise here — never cash
    map.set(l.key, { label: l.label, amountCents: l.amountCents, qty: l.qty, isUnits: l.isUnits === true });
  }
  return map;
};

/**
 * Diff `cur` against the period paid just before it. Null when
 * there's no previous period to compare.
 */
export function checkDiff(cur: PayPeriod, periods: PayPeriod[]): CheckDiff | null {
  const prev = periods
    .filter((p) => p.endDate < cur.endDate && (p.shifts.length > 0 || (p.leave ?? []).length > 0 || (p.actual?.net ?? "") !== ""))
    .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];
  if (!prev) return null;

  const curMoney = periodMoney(cur);
  const prevMoney = periodMoney(prev);

  const curLines = lineMap(cur);
  const prevLines = lineMap(prev);
  const keys = new Set([...curLines.keys(), ...prevLines.keys()]);
  const drivers: DiffDriver[] = [];
  for (const key of keys) {
    const a = curLines.get(key);
    const b = prevLines.get(key);
    const deltaCents = (a?.amountCents ?? 0) - (b?.amountCents ?? 0);
    if (Math.abs(deltaCents) < 100) continue; // sub-dollar noise
    drivers.push({
      key,
      label: (a ?? b)!.label,
      deltaCents,
      qtyDelta: (a?.qty ?? 0) - (b?.qty ?? 0),
      isUnits: (a ?? b)!.isUnits,
    });
  }
  drivers.sort((x, y) => Math.abs(y.deltaCents) - Math.abs(x.deltaCents));

  return {
    prevStart: prev.startDate,
    prevEnd: prev.endDate,
    grossDeltaCents: curMoney.grossCents - prevMoney.grossCents,
    netDeltaCents: curMoney.netCents - prevMoney.netCents,
    drivers,
    shiftsDelta: cur.shifts.length - prev.shifts.length,
  };
}
