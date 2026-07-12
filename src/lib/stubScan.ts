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
  "You are reading pay stub(s) for one employee. Each stub covers one biweekly pay period. " +
  "For EVERY stub found across all pages and images, extract: the pay period end date, the pay period start date if shown, " +
  "the CURRENT-period total gross pay, and the CURRENT-period net pay (take-home). Never use YTD columns. " +
  'Respond with ONLY valid JSON, no markdown, no commentary, exactly this schema: {"stubs":[{"endDate":"YYYY-MM-DD","startDate":"YYYY-MM-DD or empty string","gross":"1234.56","net":"789.01"}]} ' +
  "Amounts are plain numbers without $ or commas. De-duplicate identical stubs.";

export function parseStubResponse(text: string): ScannedStub[] {
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("The response wasn't valid JSON — try clearer stub images or one PDF at a time.");
  }
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

export async function scanStubFiles(files: File[], apiKey: string): Promise<ScannedStub[]> {
  const blocks = await filesToContentBlocks(files);
  if (blocks.length === 0) throw new Error("No readable files — upload stub PDFs or screenshots.");
  const text = await callClaude(blocks, stubInstruction, apiKey, 4000);
  return parseStubResponse(text);
}
