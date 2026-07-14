/**
 * Pay-stub upload: PDF(s)/screenshot(s) → {period end, gross, net} per
 * stub, via the user's own API key. The model only READS the stubs; code
 * decides placement (period windows, duplicate detection) — the same
 * code-does-the-math split as the schedule scan.
 */
import { callClaude, filesToContentBlocks } from "./scan.ts";
import { addDays, PERIOD_DAYS, type PayPeriod } from "./periods.ts";

export interface ScannedStub {
  endDate: string;
  /** Blank when the stub didn't show it; placement derives end − 13. */
  startDate: string;
  gross: string;
  net: string;
}

export const stubInstruction =
  "You are reading payroll documents for one employee: pay stub(s) (one biweekly period each) and/or a YEAR-TO-DATE " +
  "pay summary screen (pay types with YTD hours/wages plus YTD deduction sections — not a single-period stub). " +
  "For EVERY stub found across all pages and images, extract: the pay period end date, the pay period start date if shown, " +
  "the CURRENT-period total gross pay, and the CURRENT-period net pay (take-home). Never use YTD columns for stubs. " +
  "If a YTD summary is present, also extract its TOTAL rows: total YTD earnings/wages (gross), total YTD employee " +
  "taxes withheld, total YTD pretax deductions, total YTD after-tax deductions, any YTD imputed income (e.g. imputed " +
  "basic term life, part of earnings), and the as-of date printed on or near the screen. Ignore employer/company-side " +
  "sections entirely. Never fabricate stubs from a YTD summary. " +
  'Respond with ONLY valid JSON, no markdown, no commentary, exactly this schema: {"stubs":[{"endDate":"YYYY-MM-DD","startDate":"YYYY-MM-DD or empty string","gross":"1234.56","net":"789.01"}],' +
  '"ytdSummary":{"asOfDate":"YYYY-MM-DD or empty string","gross":103320.11,"taxes":20225.79,"pretax":12516.42,"aftertax":1168.51,"imputed":24.13}} ' +
  'Use "ytdSummary":null when no YTD summary is present, and null for any of its amounts not shown. ' +
  "Amounts are plain numbers without $ or commas. De-duplicate identical stubs.";

const parseJson = (text: string): unknown => {
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("The response wasn't valid JSON — try clearer stub images or one PDF at a time.");
  }
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
    }));
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
  const text = await callClaude(blocks, stubInstruction, apiKey, 4000);
  return { stubs: parseStubResponse(text), summary: parseYtdSummary(text) };
}
