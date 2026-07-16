/**
 * Pay-stub upload: PDF(s)/screenshot(s) → {period end, gross, net} per
 * stub, via the user's own API key. The model only READS the stubs; code
 * decides placement (period windows, duplicate detection) — the same
 * code-does-the-math split as the schedule scan.
 */
import { callClaude, filesToContentBlocks } from "./scan.ts";
import { addDays, PERIOD_DAYS, type PayPeriod } from "./periods.ts";
import { parseLineItems, stubLinesToActual, type StubLineItem } from "./stubFill.ts";

export interface ScannedStub {
  endDate: string;
  /** Blank when the stub didn't show it; placement derives end − 13. */
  startDate: string;
  gross: string;
  net: string;
  /**
   * The stub's own line sections, when readable — these let an old
   * period import fully itemized (its deductions split into buckets)
   * instead of as bare totals. Null when the model returned totals only.
   */
  lines: {
    earnings: StubLineItem[];
    taxes: StubLineItem[];
    pretax: StubLineItem[];
    aftertax: StubLineItem[];
  } | null;
}

export const stubInstruction =
  "You are reading payroll documents for one employee: pay stub(s) (one biweekly period each) and/or a YEAR-TO-DATE " +
  "pay summary screen (pay types with YTD hours/wages plus YTD deduction sections — not a single-period stub). " +
  "For EVERY stub found across all pages and images, extract: the pay period end date, the pay period start date if shown, " +
  "the CURRENT-period total gross pay, the CURRENT-period net pay (take-home), and — when the stub's line detail is " +
  "readable — its CURRENT-period lines by section: earnings (every pay line incl. imputed income and paid leave), " +
  "taxes (withholding lines), pretax deductions, aftertax deductions, each as {label: the stub's exact printed line " +
  "name, amount}. Keep every line its own item; never merge lines; never use YTD columns for stubs. " +
  "If a YTD summary is present, also extract its TOTAL rows: total YTD earnings/wages (gross), total YTD employee " +
  "taxes withheld, total YTD pretax deductions, total YTD after-tax deductions, any YTD imputed income (e.g. imputed " +
  "basic term life, part of earnings), and the as-of date printed on or near the screen. Ignore employer/company-side " +
  "sections entirely. Never fabricate stubs from a YTD summary. " +
  'Respond with ONLY valid JSON, no markdown, no commentary, exactly this schema: {"stubs":[{"endDate":"YYYY-MM-DD","startDate":"YYYY-MM-DD or empty string","gross":"1234.56","net":"789.01",' +
  '"lines":{"earnings":[{"label":"Regular Straight Time","amount":4202.40}],"taxes":[],"pretax":[],"aftertax":[]}}],' +
  '"ytdSummary":{"asOfDate":"YYYY-MM-DD or empty string","gross":103320.11,"taxes":20225.79,"pretax":12516.42,"aftertax":1168.51,"imputed":24.13}} ' +
  'Use "lines":null when a stub\'s line detail is not readable, and "ytdSummary":null when no YTD summary is present ' +
  "(null for any of its amounts not shown). Amounts are plain numbers without $ or commas. De-duplicate identical stubs.";

const parseJson = (text: string): unknown => {
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("The response wasn't valid JSON — try clearer stub images or one PDF at a time.");
  }
};

const asLines = (v: unknown): ScannedStub["lines"] => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const lines = {
    earnings: parseLineItems(o.earnings),
    taxes: parseLineItems(o.taxes),
    pretax: parseLineItems(o.pretax),
    aftertax: parseLineItems(o.aftertax),
  };
  return lines.earnings.length + lines.taxes.length + lines.pretax.length + lines.aftertax.length > 0 ? lines : null;
};

export function parseStubResponse(text: string): ScannedStub[] {
  const parsed = parseJson(text);
  const stubs = (parsed as { stubs?: unknown })?.stubs;
  if (!Array.isArray(stubs)) throw new Error("No stubs found in the response.");
  return stubs
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .filter((s) => typeof s.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.endDate))
    .map((s) => ({
      endDate: String(s.endDate),
      startDate: typeof s.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.startDate) ? s.startDate : "",
      gross: typeof s.gross === "string" || typeof s.gross === "number" ? String(s.gross) : "",
      net: typeof s.net === "string" || typeof s.net === "number" ? String(s.net) : "",
      lines: asLines(s.lines),
    }));
}

/**
 * A scanned stub → the period's `actual` map. With line detail, the
 * stubFill mapper does the label→key matching and split-row summing and
 * the period imports fully itemized; without it, bare gross/net (exactly
 * the old behavior). The stub's own totals always win over summed lines.
 */
export function scannedStubActual(stub: ScannedStub): Record<string, string> {
  const totals: Record<string, string> = {};
  if (stub.gross.trim() !== "") totals.gross = stub.gross.trim();
  if (stub.net.trim() !== "") totals.net = stub.net.trim();
  if (stub.lines === null) return totals;
  const mapped = stubLinesToActual({
    periodStart: stub.startDate,
    periodEnd: stub.endDate,
    earnings: stub.lines.earnings,
    taxes: stub.lines.taxes,
    pretax: stub.lines.pretax,
    aftertax: stub.lines.aftertax,
    gross: null,
    net: null,
    ytdGross: null,
    ytdNet: null,
  });
  return { ...mapped.actual, ...totals };
}

export interface StubImportPlan {
  toAdd: ScannedStub[];
  duplicates: ScannedStub[];
}

/** A stub whose end date falls inside an existing period is already logged. */
export function planStubImports(existing: PayPeriod[], scanned: ScannedStub[]): StubImportPlan {
  const plan: StubImportPlan = { toAdd: [], duplicates: [] };
  const seenEnds = new Set<string>();
  for (const stub of [...scanned].sort((a, b) => (a.endDate < b.endDate ? -1 : 1))) {
    const insideExisting = existing.some((p) => stub.endDate >= p.startDate && stub.endDate <= p.endDate);
    if (insideExisting || seenEnds.has(stub.endDate)) plan.duplicates.push(stub);
    else {
      seenEnds.add(stub.endDate);
      plan.toAdd.push(stub);
    }
  }
  return plan;
}

export const stubStartDate = (stub: ScannedStub): string =>
  stub.startDate !== "" ? stub.startDate : addDays(stub.endDate, -(PERIOD_DAYS - 1));

/* ---------------- the Year-to-Date summary screen ---------------- */

/**
 * Kronos-style "Year to Date" screens list YTD totals by section rather
 * than per-period stubs. The model returns the TOTAL rows; code turns
 * them into the year anchor (net derived in cents, employer sections
 * ignored by instruction).
 */
export interface ScannedYtdSummary {
  /** "" when the screen didn't show a readable date. */
  asOfDate: string;
  grossCents: number;
  taxesCents: number | null;
  pretaxCents: number | null;
  aftertaxCents: number | null;
  imputedCents: number | null;
}

const asCents = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** The response's ytdSummary block, or null when none was in the files. */
export function parseYtdSummary(text: string): ScannedYtdSummary | null {
  const parsed = parseJson(text);
  const raw = (parsed as { ytdSummary?: unknown })?.ytdSummary;
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const grossCents = asCents(s.gross);
  if (grossCents === null || grossCents <= 0) return null;
  const asOfDate = typeof s.asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.asOfDate) ? s.asOfDate : "";
  return {
    asOfDate,
    grossCents,
    taxesCents: asCents(s.taxes),
    pretaxCents: asCents(s.pretax),
    aftertaxCents: asCents(s.aftertax),
    imputedCents: asCents(s.imputed),
  };
}

export interface StubScanResult {
  stubs: ScannedStub[];
  summary: ScannedYtdSummary | null;
}

export async function scanStubFiles(files: File[], apiKey: string): Promise<StubScanResult> {
  const blocks = await filesToContentBlocks(files);
  if (blocks.length === 0) throw new Error("No readable files — upload stub PDFs or screenshots.");
  // Line detail is ~10× the tokens of bare totals; 8k covers a batch of
  // six-ish stubs comfortably. Bigger piles just go in as more batches.
  const text = await callClaude(blocks, stubInstruction, apiKey, 8000);
  return { stubs: parseStubResponse(text), summary: parseYtdSummary(text) };
}
