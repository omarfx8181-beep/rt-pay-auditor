/**
 * Scan routing — every scan lands in the RIGHT pay period by itself.
 * Pure decisions only (no DB): which period a scanned stub belongs to
 * (or the window to create), and how schedule rows split across the
 * current period, upcoming periods, and out-of-range dates.
 */
import { addDays, nextPeriodRange, PERIOD_DAYS, type PayPeriod, type YtdAnchor } from "./periods.ts";
import { paydayFor } from "./payday.ts";
import type { ScanRow } from "./scan.ts";
import type { ScannedYtdSummary } from "./stubScan.ts";

/* ---------------- stub → period ---------------- */

export type StubRoute =
  | { kind: "current" }
  | { kind: "existing"; period: PayPeriod }
  | { kind: "create"; startDate: string; endDate: string };

/**
 * Where does a scanned stub belong? The period containing its end date;
 * otherwise a new window derived from the stub's own dates. No parsed
 * end date → the open period (nothing to route by).
 */
export function matchStubPeriod(periods: PayPeriod[], currentId: string, parsedStart: string, parsedEnd: string): StubRoute {
  if (parsedEnd === "") return { kind: "current" };
  const hit = periods.find((p) => parsedEnd >= p.startDate && parsedEnd <= p.endDate);
  if (hit) return hit.id === currentId ? { kind: "current" } : { kind: "existing", period: hit };
  return {
    kind: "create",
    startDate: parsedStart !== "" ? parsedStart : addDays(parsedEnd, -(PERIOD_DAYS - 1)),
    endDate: parsedEnd,
  };
}

/* ---------------- YTD summary → year anchor ---------------- */

/**
 * A YTD summary printed on `asOfDate` reflects every check PAID by that
 * date — so the anchor runs through the latest period whose payday has
 * already landed. Candidate ends are the known periods extended forward
 * on the biweekly grid; no readable date → the latest known period end.
 */
export function anchorEndFor(asOfDate: string, periods: PayPeriod[], paydayDelayDays: number): string {
  if (periods.length === 0) return asOfDate;
  const ends = [...new Set(periods.map((p) => p.endDate))].sort();
  let cursor = ends[ends.length - 1];
  for (let i = 0; i < 27; i++) {
    cursor = nextPeriodRange(cursor).endDate;
    ends.push(cursor);
  }
  if (asOfDate === "") return [...new Set(periods.map((p) => p.endDate))].sort().pop()!;
  const paid = ends.filter((end) => paydayFor(end, paydayDelayDays) <= asOfDate);
  return paid.length > 0 ? paid[paid.length - 1] : asOfDate;
}

/**
 * Summary totals → the year anchor. Net = gross − taxes − pretax −
 * after-tax − imputed (imputed is taxed, never cash), all integer cents;
 * any missing section → net stays unknown rather than guessed.
 */
export function summaryToAnchor(
  summary: ScannedYtdSummary,
  periods: PayPeriod[],
  paydayDelayDays: number,
  capturedAt: number,
): YtdAnchor | null {
  if (summary.grossCents <= 0) return null;
  const parts = [summary.taxesCents, summary.pretaxCents, summary.aftertaxCents, summary.imputedCents];
  const netCents = parts.every((v): v is number => v !== null)
    ? summary.grossCents - parts.reduce((a, b) => a! + b!, 0)!
    : null;
  const asOfEnd = anchorEndFor(summary.asOfDate, periods, paydayDelayDays);
  if (asOfEnd === "") return null;
  return {
    year: asOfEnd.slice(0, 4),
    asOfEnd,
    grossCents: summary.grossCents,
    netCents,
    taxesCents: summary.taxesCents,
    pretaxCents: summary.pretaxCents,
    aftertaxCents: summary.aftertaxCents,
    imputedCents: summary.imputedCents,
    capturedAt,
  };
}

/* ---------------- schedule rows → periods ---------------- */

export interface FutureBatch {
  startDate: string;
  endDate: string;
  rows: ScanRow[];
}

export interface RowGroups {
  /** Rows inside the open period. */
  current: ScanRow[];
  /** Rows in upcoming biweekly windows (grid-aligned off the current one). */
  future: FutureBatch[];
  /** Dated before the period or past the horizon — shown, never applied. */
  outside: ScanRow[];
}

/**
 * Split scanned schedule rows by pay period. Future windows step off the
 * current period's grid, so created periods always align. Undated rows
 * count as current (the user is looking at this period).
 */
export function groupRowsByPeriod(rows: ScanRow[], currentStart: string, currentEnd: string, horizon = 2): RowGroups {
  const groups: RowGroups = { current: [], future: [], outside: [] };
  const windows: Array<{ startDate: string; endDate: string }> = [];
  let cursor = { startDate: currentStart, endDate: currentEnd };
  for (let i = 0; i < horizon; i++) {
    cursor = nextPeriodRange(cursor.endDate);
    windows.push(cursor);
  }
  for (const row of rows) {
    if (row.date === "" || (row.date >= currentStart && row.date <= currentEnd)) {
      groups.current.push(row);
      continue;
    }
    const win = windows.find((w) => row.date >= w.startDate && row.date <= w.endDate);
    if (win) {
      const batch = groups.future.find((b) => b.startDate === win.startDate);
      if (batch) batch.rows.push(row);
      else groups.future.push({ ...win, rows: [row] });
    } else {
      groups.outside.push(row);
    }
  }
  groups.future.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  return groups;
}
