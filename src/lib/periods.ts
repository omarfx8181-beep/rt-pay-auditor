/**
 * Pay-period records and the pure logic around them: date derivation,
 * labels, YTD rollups, and backup merge. No DB access here — the Dexie
 * layer (src/db/db.ts) stays thin so all of this is unit-testable.
 */
import { computeNet, computePeriod, type BonusTier, type Cents } from "./engine.ts";
import { draftToConfig, draftToLeave, draftToShift, type CfgDraft, type LeaveDraft, type ShiftDraft } from "./draft.ts";
// Type only — disputes.ts imports this module at runtime, so the edge
// must stay erasable.
import type { DisputeSend } from "./disputes.ts";

/**
 * An off-cycle correction check — payroll fixing a mistake with a
 * mid-week stub on an off week. It BELONGS to the period it corrects:
 * its money counts there (and in every rollup), and when its gross
 * covers the period's shortfall the verdict reads "made whole".
 */
export interface CorrectionDraft {
  id: string;
  /** YYYY-MM-DD the correction check was paid — any day, off the grid. */
  payDate: string;
  /** Dollars as typed. */
  gross: string;
  net: string;
  note: string;
  updatedAt: number;
}

export interface PayPeriod {
  id: string;
  /** YYYY-MM-DD, inclusive. Biweekly: end = start + 13 days. */
  startDate: string;
  endDate: string;
  /** Stored exactly as typed — drafts, not parsed numbers. */
  shifts: ShiftDraft[];
  /** Paid leave (Kronos Time Off codes); absent on pre-leave records. */
  leave?: LeaveDraft[];
  /** Off-cycle correction checks for this period; absent on older records. */
  corrections?: CorrectionDraft[];
  /**
   * What the stub itself says, by audit-row key, exactly as typed or
   * scanned. Dollars throughout, bar one quantity: `regHours`, the
   * regular line's own hours, which corroborate a rate change
   * (raiseWatch.ts). Absent keys are lines nobody entered.
   */
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
  /** Stamped the first time this check turns green — the celebration fires once. */
  celebratedAt?: number;
  /**
   * Every HR email actually SENT about this period's shortfall, oldest
   * first. Absent until the first send; disputes.ts sorts defensively.
   */
  disputeLog?: DisputeSend[];
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

/**
 * The period this date falls inside, or null. "Today's period" is not
 * the open one — the period being audited is normally last month's —
 * so anything dated today has to look itself up.
 */
export const periodCovering = <T extends { startDate: string; endDate: string }>(
  periods: T[],
  dateStr: string,
): T | null => periods.find((p) => p.startDate <= dateStr && dateStr <= p.endDate) ?? null;

/** A year of biweekly windows — past this, the date is wrong, not the grid. */
const MAX_CATCH_UP_PERIODS = 26;

/**
 * The windows to add so the grid reaches `dateStr`, oldest first: empty
 * when it already does, and empty when it can't get there inside
 * MAX_CATCH_UP_PERIODS (a clock years off must not spawn periods).
 */
export const periodRangesThrough = (
  latestEndDate: string,
  dateStr: string,
): Array<{ startDate: string; endDate: string }> => {
  const ranges: Array<{ startDate: string; endDate: string }> = [];
  let end = latestEndDate;
  while (end < dateStr && ranges.length < MAX_CATCH_UP_PERIODS) {
    const range = nextPeriodRange(end);
    ranges.push(range);
    end = range.endDate;
  }
  return end >= dateStr ? ranges : [];
};

/**
 * The biweekly window holding `dateStr`, on the same grid as
 * `anchorStartDate`. Rolling forward can't reach a date that sits in a
 * HOLE below the newest period — a schedule scan files only the blocks
 * it saw, so a skipped fortnight leaves a real gap — so that window is
 * derived arithmetically instead. Null past MAX_CATCH_UP_PERIODS in
 * either direction: that far off is a wrong date, not a gap.
 */
export const gridWindowFor = (
  anchorStartDate: string,
  dateStr: string,
): { startDate: string; endDate: string } | null => {
  const day = 86_400_000;
  const days = Math.round(
    (new Date(dateStr + "T12:00:00").getTime() - new Date(anchorStartDate + "T12:00:00").getTime()) / day,
  );
  const steps = Math.floor(days / PERIOD_DAYS);
  if (Math.abs(steps) > MAX_CATCH_UP_PERIODS) return null;
  const startDate = addDays(anchorStartDate, steps * PERIOD_DAYS);
  return { startDate, endDate: addDays(startDate, PERIOD_DAYS - 1) };
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
  /**
   * Where the Fairview money went, summed only across periods that carry
   * line detail (shifts entered, or stub deduction lines filled in) —
   * stub lines outrank engine estimates per line. A period logged as
   * bare gross/net can't be split, so it counts in `bucketSkippedCount`
   * instead of polluting the buckets.
   */
  bucketPeriodCount: number;
  bucketSkippedCount: number;
  taxesCents: Cents;
  pretaxCents: Cents;
  aftertaxCents: Cents;
  imputedCents: Cents;
}

/** Audit-row keys for the six employee taxes; actual values live under these. */
const TAX_KEYS = ["fed", "mn", "ss", "medicare", "mnFam", "mnMed"] as const;
const DEDUCTION_KEYS = [...TAX_KEYS, "pretax", "aftertax"] as const;

/**
 * One period's money, resolved by the house rule everywhere shares:
 * stub actuals outrank engine estimates, per line. Buckets are null on a
 * totals-only period (bare gross/net — the split is unknowable) and on
 * an empty one (nothing to split).
 */
export interface PeriodMoney {
  grossCents: Cents;
  netCents: Cents;
  /** True when the stub's real net was entered — the numbers are stub-true. */
  stubTrue: boolean;
  buckets: { taxesCents: Cents; pretaxCents: Cents; aftertaxCents: Cents; imputedCents: Cents } | null;
  /** Off-cycle correction money, already INCLUDED in gross/net above. */
  correctionGrossCents: Cents;
  correctionNetCents: Cents;
  units548: number;
  otHours: number;
  dtHours: number;
  workedHours: number;
  leaveHours: number;
}

/** Total gross/net across a period's correction checks, in cents. */
export function correctionTotals(p: PayPeriod): { grossCents: Cents; netCents: Cents } {
  let grossCents = 0;
  let netCents = 0;
  for (const c of p.corrections ?? []) {
    grossCents += parseDollars(c.gross) ?? 0;
    netCents += parseDollars(c.net) ?? 0;
  }
  return { grossCents, netCents };
}

/**
 * A period holding NOTHING — no shifts, no leave, not one stub line — is
 * a window the grid rolled forward, not a paycheck. The engine still
 * prices one (imputed life posts per period, and the fixed deductions
 * come out against no pay, so it reads +$1.81 gross and MINUS $403.20
 * take-home), so anything summing periods must skip these or it invents
 * money nobody was paid or docked. Corrections are real money and count
 * even here, so callers add them back separately.
 */
export const isPlaceholder = (p: PayPeriod): boolean =>
  p.shifts.length === 0 &&
  (p.leave?.length ?? 0) === 0 &&
  !Object.values(p.actual ?? {}).some((v) => (v ?? "").trim() !== "");

export function periodMoney(p: PayPeriod): PeriodMoney {
  const cfg = draftToConfig(p.cfgDraft);
  const period = computePeriod(p.shifts.map(draftToShift), cfg, (p.leave ?? []).map(draftToLeave));
  const net = computeNet(period.grossCents, cfg);
  const actualGross = parseDollars(p.actual?.gross);
  const actualNet = parseDollars(p.actual?.net);
  const placeholder = isPlaceholder(p);
  const hasLineDetail =
    p.shifts.length > 0 ||
    (p.leave?.length ?? 0) > 0 ||
    DEDUCTION_KEYS.some((k) => (p.actual?.[k] ?? "").trim() !== "");
  let buckets: PeriodMoney["buckets"] = null;
  if (hasLineDetail) {
    const engineTax: Record<(typeof TAX_KEYS)[number], Cents> = {
      fed: net.fedCents,
      mn: net.mnCents,
      ss: net.ssCents,
      medicare: net.medicareCents,
      mnFam: net.mnFamCents,
      mnMed: net.mnMedCents,
    };
    buckets = {
      taxesCents: TAX_KEYS.reduce((acc, k) => acc + (parseDollars(p.actual?.[k]) ?? engineTax[k]), 0),
      pretaxCents: parseDollars(p.actual?.pretax) ?? net.pretaxCents,
      aftertaxCents: parseDollars(p.actual?.aftertax) ?? net.afterTaxCents,
      imputedCents: net.imputedCents,
    };
  }
  const corrections = correctionTotals(p);
  return {
    grossCents: (actualGross ?? (placeholder ? 0 : period.grossCents)) + corrections.grossCents,
    netCents: (actualNet ?? (placeholder ? 0 : net.netCents)) + corrections.netCents,
    stubTrue: actualNet !== null,
    buckets,
    correctionGrossCents: corrections.grossCents,
    correctionNetCents: corrections.netCents,
    units548: period.units548,
    otHours: period.otHours,
    dtHours: period.dtHours,
    workedHours: period.workedHours,
    leaveHours: period.leaveHours,
  };
}

export const parseDollars = (raw: string | undefined): Cents | null => {
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
    bucketPeriodCount: 0,
    bucketSkippedCount: 0,
    taxesCents: 0,
    pretaxCents: 0,
    aftertaxCents: 0,
    imputedCents: 0,
  };
  for (const p of periods) {
    if (p.endDate.slice(0, 4) !== year) continue;
    const m = periodMoney(p);
    rollup.periodCount += 1;
    if (m.stubTrue) rollup.stubCount += 1;
    rollup.grossCents += m.grossCents;
    rollup.netCents += m.netCents;
    rollup.units548 += m.units548;
    rollup.otHours += m.otHours;
    rollup.dtHours += m.dtHours;
    rollup.workedHours += m.workedHours;
    rollup.leaveHours += m.leaveHours;
    if (m.buckets) {
      rollup.bucketPeriodCount += 1;
      rollup.taxesCents += m.buckets.taxesCents;
      rollup.pretaxCents += m.buckets.pretaxCents;
      rollup.aftertaxCents += m.buckets.aftertaxCents;
      rollup.imputedCents += m.buckets.imputedCents;
    } else if (parseDollars(p.actual?.gross) !== null || m.stubTrue) {
      rollup.bucketSkippedCount += 1;
    }
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

/* ---------------- YTD anchor (scanned from a stub's YTD column) ---------------- */

/**
 * A stub's own year-to-date totals, captured during a stub scan. The one
 * number payroll and the app must agree on: if the app's periods through
 * the same date sum to something else, a period is missing, duplicated,
 * or still an estimate.
 */
export interface YtdAnchor {
  year: string;
  /** The period-end date the stub's YTD column runs through. */
  asOfEnd: string;
  grossCents: Cents;
  netCents: Cents | null;
  /**
   * Payroll's own YTD buckets, when the anchor came from a scanned
   * Year-to-Date summary (absent on stub-column anchors and anchors
   * stored before these fields existed).
   */
  taxesCents?: Cents | null;
  pretaxCents?: Cents | null;
  aftertaxCents?: Cents | null;
  imputedCents?: Cents | null;
  capturedAt: number;
}

export interface YtdThroughDate {
  grossCents: Cents;
  netCents: Cents;
  periodCount: number;
  /** Periods in range whose numbers are stub-true (real gross/net entered). */
  stubCount: number;
}

/**
 * Fairview totals across periods ending in asOfEnd's year, through
 * asOfEnd inclusive — same stub-outranks-estimate resolution as
 * rollupYtd, so an anchor comparison is apples to apples.
 */
export function ytdThroughDate(periods: PayPeriod[], asOfEnd: string): YtdThroughDate {
  const year = asOfEnd.slice(0, 4);
  const out: YtdThroughDate = { grossCents: 0, netCents: 0, periodCount: 0, stubCount: 0 };
  for (const p of periods) {
    if (p.endDate.slice(0, 4) !== year || p.endDate > asOfEnd) continue;
    // periodMoney includes correction checks — payroll's YTD does too.
    const m = periodMoney(p);
    out.periodCount += 1;
    if (m.stubTrue) out.stubCount += 1;
    out.grossCents += m.grossCents;
    out.netCents += m.netCents;
  }
  return out;
}

/**
 * Every biweekly period END falling in `year`, on the grid the known
 * periods define (extended both directions). 26 most years, 27 some —
 * derived, never assumed. Empty input → empty (no grid to stand on).
 */
export function yearGridEnds(periods: PayPeriod[], year: string): string[] {
  if (periods.length === 0) return [];
  const ends = new Set(periods.map((p) => p.endDate));
  const sorted = [...ends].sort();
  for (let i = 1, cursor = sorted[sorted.length - 1]; i <= 40; i++) ends.add((cursor = addDays(cursor, PERIOD_DAYS)));
  for (let i = 1, cursor = sorted[0]; i <= 40; i++) ends.add((cursor = addDays(cursor, -PERIOD_DAYS)));
  return [...ends].filter((e) => e.slice(0, 4) === year).sort();
}

/* ---------------- backup export / import ---------------- */

export interface BackupFile {
  app: "rt-pay-auditor";
  /** v1 periods only; v2 adds otherIncome; v3 adds settings. All import fine. */
  version: 1 | 2 | 3;
  exportedAt: string;
  periods: PayPeriod[];
  otherIncome?: OtherIncomeDraft[];
  /**
   * v3: the whole product state — goals, YTD anchors, PTO/W-2 config,
   * identity, tolerances… A restore on a new phone loses NOTHING
   * (earlier versions silently dropped all of it).
   */
  settings?: Record<string, string>;
}

/**
 * Never exported: the API key (secret) and per-device transients —
 * wizard progress, nudge dismissals, and stamps that describe THIS
 * device, not the data. (A rescue file taken mid-onboarding must never
 * throw an established device back into the setup wizard.)
 */
export const PRIVATE_SETTING_KEYS = [
  "anthropicApiKey",
  "currentPeriodId",
  "onNow",
  "onboarding",
  "lastBackupAt",
  "installNudge",
  "lastSeenVersion",
];

export function buildBackup(
  periods: PayPeriod[],
  otherIncome: OtherIncomeDraft[],
  settings: Record<string, string>,
  exportedAt: string,
): BackupFile {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (!PRIVATE_SETTING_KEYS.includes(k)) safe[k] = v;
  }
  return { app: "rt-pay-auditor", version: 3, exportedAt, periods, otherIncome, settings: safe };
}

export function parseBackup(text: string): BackupFile {
  const obj = JSON.parse(text) as Partial<BackupFile>;
  if (obj?.app !== "rt-pay-auditor" || !Array.isArray(obj.periods)) {
    throw new Error("Not an RT Pay Auditor backup file.");
  }
  if (typeof obj.version === "number" && obj.version > 3) {
    throw new Error("This backup was made by a newer RT Pay — update the app first, then import.");
  }
  for (const p of obj.periods) {
    // A poison row restored onto a fresh phone becomes an unfixable
    // crash loop — refuse the file up front instead.
    if (
      typeof p?.id !== "string" ||
      typeof p?.startDate !== "string" ||
      typeof p?.endDate !== "string" ||
      !Array.isArray(p?.shifts) ||
      typeof p?.cfgDraft !== "object" ||
      p?.cfgDraft === null ||
      !Array.isArray(p?.tiers)
    ) {
      throw new Error("Backup file has a malformed period entry.");
    }
  }
  if (obj.otherIncome !== undefined && !Array.isArray(obj.otherIncome)) {
    throw new Error("Backup file has a malformed other-income section.");
  }
  const settings: Record<string, string> = {};
  if (obj.settings !== undefined) {
    if (typeof obj.settings !== "object" || obj.settings === null || Array.isArray(obj.settings)) {
      throw new Error("Backup file has a malformed settings section.");
    }
    for (const [k, v] of Object.entries(obj.settings)) {
      if (typeof v === "string" && !PRIVATE_SETTING_KEYS.includes(k)) settings[k] = v;
    }
  }
  return { ...obj, otherIncome: obj.otherIncome ?? [], settings } as BackupFile;
}

/**
 * YTD anchors carry their own capturedAt — merging two anchor maps
 * keeps the NEWER capture per year, so importing an old backup can
 * never regress payroll's ground truth (mirrors saveYtdAnchor's
 * "older scans never regress it" rule).
 */
export function mergeYtdAnchorSettings(localRaw: string | undefined, incomingRaw: string | undefined): string {
  const parse = (raw: string | undefined): Record<string, YtdAnchor> => {
    if (!raw) return {};
    try {
      const obj = JSON.parse(raw) as Record<string, YtdAnchor>;
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  };
  const local = parse(localRaw);
  const incoming = parse(incomingRaw);
  const merged: Record<string, YtdAnchor> = { ...local };
  for (const [year, anc] of Object.entries(incoming)) {
    const cur = merged[year];
    if (!cur || (anc?.capturedAt ?? 0) > (cur.capturedAt ?? 0)) merged[year] = anc;
  }
  return JSON.stringify(merged);
}

/**
 * Two devices can each have created "the same" period with different
 * ids — merged, they double-count the year. Flag shared end dates so
 * the import status can say so out loud.
 */
export function overlappingEnds(periods: PayPeriod[]): string[] {
  const seen = new Map<string, number>();
  for (const p of periods) seen.set(p.endDate, (seen.get(p.endDate) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([end]) => end).sort();
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
