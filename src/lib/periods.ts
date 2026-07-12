/**
 * Pay-period records and the pure logic around them: date derivation,
 * labels, YTD rollups, and backup merge. No DB access here — the Dexie
 * layer (src/db/db.ts) stays thin so all of this is unit-testable.
 */
import { computeNet, computePeriod, type BonusTier, type Cents } from "./engine.ts";
import { draftToConfig, draftToLeave, draftToShift, type CfgDraft, type LeaveDraft, type ShiftDraft } from "./draft.ts";

export interface PayPeriod {
  id: string;
  /** YYYY-MM-DD, inclusive. Biweekly: end = start + 13 days. */
  startDate: string;
  endDate: string;
  /** Stored exactly as typed — drafts, not parsed numbers. */
  shifts: ShiftDraft[];
  /** Paid leave (Kronos Time Off codes); absent on pre-leave records. */
  leave?: LeaveDraft[];
  actual: Record<string, string>;
  /**
   * Each period snapshots its own rules: rates and bonus tiers move week
   * to week, and editing today's config must never rewrite an old
   * period's expected values.
   */
  cfgDraft: CfgDraft;
  tiers: BonusTier[];
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export const PERIOD_DAYS = 14;

const pad = (n: number) => String(n).padStart(2, "0");

/** Add days to a YYYY-MM-DD in local time (noon-anchored, DST-safe). */
export const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** "Jun 22 – Jul 5, 2026" */
export const periodLabel = (startDate: string, endDate: string): string => {
  const fmt = (s: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(s + "T12:00:00").toLocaleDateString("en-US", opts);
  return `${fmt(startDate, { month: "short", day: "numeric" })} – ${fmt(endDate, { month: "short", day: "numeric", year: "numeric" })}`;
};

/** The biweekly window right after `latestEndDate`. */
export const nextPeriodRange = (latestEndDate: string): { startDate: string; endDate: string } => {
  const startDate = addDays(latestEndDate, 1);
  return { startDate, endDate: addDays(startDate, PERIOD_DAYS - 1) };
};

/** The biweekly window right before `earliestStartDate` — for logging past stubs. */
export const prevPeriodRange = (earliestStartDate: string): { startDate: string; endDate: string } => {
  const endDate = addDays(earliestStartDate, -1);
  return { startDate: addDays(endDate, -(PERIOD_DAYS - 1)), endDate };
};

/* ---------------- other income (non-Fairview) ---------------- */

export interface OtherIncomeDraft {
  id: string;
  /** YYYY-MM-DD — the pay date; its year buckets the entry. */
  date: string;
  source: string;
  /** Dollars as typed. */
  gross: string;
  /** Dollars as typed; blank = nothing withheld, take-home equals gross. */
  net: string;
  updatedAt: number;
}

/* ---------------- YTD rollups ---------------- */

export interface YtdRollup {
  year: string;
  periodCount: number;
  /** Periods whose stub net has been entered — their numbers are stub-true. */
  stubCount: number;
  /** Fairview money: the stub's actual when entered, engine expected otherwise. */
  grossCents: Cents;
  netCents: Cents;
  /** Non-Fairview income for the year. */
  otherGrossCents: Cents;
  otherNetCents: Cents;
  otherCount: number;
  /** Everything combined — the ticker numbers. */
  totalGrossCents: Cents;
  totalNetCents: Cents;
  units548: number;
  otHours: number;
  dtHours: number;
  workedHours: number;
  leaveHours: number;
}

const parseDollars = (raw: string | undefined): Cents | null => {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  const n = parseFloat(trimmed.replace(/[$,]/g, ""));
  return Number.isNaN(n) ? null : Math.round(n * 100);
};

/**
 * Year totals across every period ending in `year` (archived included)
 * plus other income dated in it. Stub actuals outrank engine estimates:
 * once a period's real gross/net is entered, those are the truth.
 */
export function rollupYtd(periods: PayPeriod[], year: string, otherIncome: OtherIncomeDraft[] = []): YtdRollup {
  const rollup: YtdRollup = {
    year,
    periodCount: 0,
    stubCount: 0,
    grossCents: 0,
    netCents: 0,
    otherGrossCents: 0,
    otherNetCents: 0,
    otherCount: 0,
    totalGrossCents: 0,
    totalNetCents: 0,
    units548: 0,
    otHours: 0,
    dtHours: 0,
    workedHours: 0,
    leaveHours: 0,
  };
  for (const p of periods) {
    if (p.endDate.slice(0, 4) !== year) continue;
    const cfg = draftToConfig(p.cfgDraft);
    const period = computePeriod(p.shifts.map(draftToShift), cfg, (p.leave ?? []).map(draftToLeave));
    const net = computeNet(period.grossCents, cfg);
    const actualGross = parseDollars(p.actual?.gross);
    const actualNet = parseDollars(p.actual?.net);
    rollup.periodCount += 1;
    if (actualNet !== null) rollup.stubCount += 1;
    rollup.grossCents += actualGross ?? period.grossCents;
    rollup.netCents += actualNet ?? net.netCents;
    rollup.units548 += period.units548;
    rollup.otHours += period.otHours;
    rollup.dtHours += period.dtHours;
    rollup.workedHours += period.workedHours;
    rollup.leaveHours += period.leaveHours;
  }
  for (const o of otherIncome) {
    if (o.date.slice(0, 4) !== year) continue;
    const gross = parseDollars(o.gross) ?? 0;
    // blank net = nothing withheld → take-home equals gross
    const net = parseDollars(o.net) ?? gross;
    rollup.otherCount += 1;
    rollup.otherGrossCents += gross;
    rollup.otherNetCents += net;
  }
  rollup.totalGrossCents = rollup.grossCents + rollup.otherGrossCents;
  rollup.totalNetCents = rollup.netCents + rollup.otherNetCents;
  return rollup;
}

/* ---------------- backup export / import ---------------- */

export interface BackupFile {
  app: "rt-pay-auditor";
  /** v1 had periods only; v2 adds otherIncome. Both import fine. */
  version: 1 | 2;
  exportedAt: string;
  periods: PayPeriod[];
  otherIncome?: OtherIncomeDraft[];
}

export const buildBackup = (periods: PayPeriod[], otherIncome: OtherIncomeDraft[], exportedAt: string): BackupFile => ({
  app: "rt-pay-auditor",
  version: 2,
  exportedAt,
  periods,
  otherIncome,
});

export function parseBackup(text: string): BackupFile {
  const obj = JSON.parse(text) as Partial<BackupFile>;
  if (obj?.app !== "rt-pay-auditor" || !Array.isArray(obj.periods)) {
    throw new Error("Not an RT Pay Auditor backup file.");
  }
  for (const p of obj.periods) {
    if (typeof p?.id !== "string" || typeof p?.startDate !== "string" || !Array.isArray(p?.shifts)) {
      throw new Error("Backup file has a malformed period entry.");
    }
  }
  if (obj.otherIncome !== undefined && !Array.isArray(obj.otherIncome)) {
    throw new Error("Backup file has a malformed other-income section.");
  }
  return { ...obj, otherIncome: obj.otherIncome ?? [] } as BackupFile;
}

export interface MergeResult<T> {
  merged: T[];
  added: number;
  updated: number;
  skipped: number;
}

/** Merge by id; the newer updatedAt wins. Existing entries are never dropped. */
export function mergeBackup<T extends { id: string; updatedAt?: number }>(existing: T[], incoming: T[]): MergeResult<T> {
  const byId = new Map(existing.map((p) => [p.id, p]));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const inc of incoming) {
    const cur = byId.get(inc.id);
    if (!cur) {
      byId.set(inc.id, inc);
      added += 1;
    } else if ((inc.updatedAt ?? 0) > (cur.updatedAt ?? 0)) {
      byId.set(inc.id, inc);
      updated += 1;
    } else {
      skipped += 1;
    }
  }
  return { merged: [...byId.values()], added, updated, skipped };
}
