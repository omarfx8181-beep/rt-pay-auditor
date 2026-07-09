/**
 * Pay-period records and the pure logic around them: date derivation,
 * labels, YTD rollups, and backup merge. No DB access here — the Dexie
 * layer (src/db/db.ts) stays thin so all of this is unit-testable.
 */
import { computeNet, computePeriod, type BonusTier, type Cents } from "./engine.ts";
import { draftToConfig, draftToShift, type CfgDraft, type ShiftDraft } from "./draft.ts";

export interface PayPeriod {
  id: string;
  /** YYYY-MM-DD, inclusive. Biweekly: end = start + 13 days. */
  startDate: string;
  endDate: string;
  /** Stored exactly as typed — drafts, not parsed numbers. */
  shifts: ShiftDraft[];
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

/* ---------------- YTD rollups ---------------- */

export interface YtdRollup {
  year: string;
  periodCount: number;
  grossCents: Cents;
  netCents: Cents;
  units548: number;
  otHours: number;
  dtHours: number;
  workedHours: number;
}

/** Engine-computed totals for every period ending in `year` (archived included). */
export function rollupYtd(periods: PayPeriod[], year: string): YtdRollup {
  const rollup: YtdRollup = {
    year,
    periodCount: 0,
    grossCents: 0,
    netCents: 0,
    units548: 0,
    otHours: 0,
    dtHours: 0,
    workedHours: 0,
  };
  for (const p of periods) {
    if (p.endDate.slice(0, 4) !== year) continue;
    const cfg = draftToConfig(p.cfgDraft);
    const period = computePeriod(p.shifts.map(draftToShift), cfg);
    const net = computeNet(period.grossCents, cfg);
    rollup.periodCount += 1;
    rollup.grossCents += period.grossCents;
    rollup.netCents += net.netCents;
    rollup.units548 += period.units548;
    rollup.otHours += period.otHours;
    rollup.dtHours += period.dtHours;
    rollup.workedHours += period.workedHours;
  }
  return rollup;
}

/* ---------------- backup export / import ---------------- */

export interface BackupFile {
  app: "rt-pay-auditor";
  version: 1;
  exportedAt: string;
  periods: PayPeriod[];
}

export const buildBackup = (periods: PayPeriod[], exportedAt: string): BackupFile => ({
  app: "rt-pay-auditor",
  version: 1,
  exportedAt,
  periods,
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
  return obj as BackupFile;
}

export interface MergeResult {
  merged: PayPeriod[];
  added: number;
  updated: number;
  skipped: number;
}

/** Merge by id; the newer updatedAt wins. Existing periods are never dropped. */
export function mergeBackup(existing: PayPeriod[], incoming: PayPeriod[]): MergeResult {
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
