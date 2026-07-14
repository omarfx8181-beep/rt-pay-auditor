/**
 * Stub photo → the check fills itself. One vision call reads the CURRENT
 * period's stub line by line; CODE does everything else — label→line
 * matching, summing split payments (the June 548 was paid as 2.5u + 7.5u
 * on two rows), pretax/after-tax rollups in integer cents, and the
 * period sanity check. Same rules as every scan here: the user's own
 * key, straight from the browser, nothing stored anywhere.
 */
import { callClaude, filesToContentBlocks } from "./scan.ts";

export interface StubLineItem {
  label: string;
  amount: number;
}

export interface StubLines {
  periodStart: string;
  periodEnd: string;
  earnings: StubLineItem[];
  taxes: StubLineItem[];
  pretax: StubLineItem[];
  aftertax: StubLineItem[];
  gross: number | null;
  net: number | null;
}

export const stubFillInstruction =
  "You are reading ONE employee pay stub (image(s) or PDF pages of the same stub). It covers one biweekly pay period. " +
  "Extract the CURRENT-period amounts only — never YTD columns. " +
  "Respond with ONLY valid JSON, no markdown, no commentary, exactly this schema: " +
  '{"periodStart":"YYYY-MM-DD or empty string","periodEnd":"YYYY-MM-DD or empty string",' +
  '"earnings":[{"label":"the exact line name printed on the stub","amount":1234.56}],' +
  '"taxes":[{"label":"...","amount":123.45}],' +
  '"pretax":[{"label":"...","amount":123.45}],' +
  '"aftertax":[{"label":"...","amount":123.45}],' +
  '"gross":8865.22,"net":5781.99} ' +
  "Rules: earnings = every pay/earnings line (regular, overtime, double time, differentials, adders, bonuses, imputed income, paid leave). " +
  "taxes = withholding lines (federal, state, Social Security, Medicare, paid-leave premiums). " +
  "pretax = before-tax deductions (retirement, medical, dental, FSA). aftertax = after-tax deductions. " +
  "Keep every line as its own item with the stub's exact label — do NOT merge or sum lines. " +
  "Amounts are plain positive numbers without $ or commas. Use null for gross/net only if truly not shown.";

const asItems = (v: unknown): StubLineItem[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((x) => ({
          label: typeof x.label === "string" ? x.label : "",
          amount: typeof x.amount === "number" ? x.amount : Number.parseFloat(String(x.amount ?? "").replace(/[$,]/g, "")),
        }))
        .filter((x) => x.label !== "" && Number.isFinite(x.amount))
    : [];

const asDate = (v: unknown): string => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

const asMoney = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/[$,]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
};

export function parseStubLinesResponse(text: string): StubLines {
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("The response wasn't valid JSON — try a clearer photo, or one page at a time.");
  }
  const p = parsed as Record<string, unknown>;
  const lines: StubLines = {
    periodStart: asDate(p.periodStart),
    periodEnd: asDate(p.periodEnd),
    earnings: asItems(p.earnings),
    taxes: asItems(p.taxes),
    pretax: asItems(p.pretax),
    aftertax: asItems(p.aftertax),
    gross: asMoney(p.gross),
    net: asMoney(p.net),
  };
  if (lines.earnings.length === 0 && lines.gross === null && lines.net === null) {
    throw new Error("No pay lines found — is that a full stub? Try a clearer photo.");
  }
  return lines;
}

/* ---------------- label → audit-key matching (CODE, not the model) ---------------- */

/** First matching rule wins; order matters (family/medical before plain MN). */
const EARNINGS_RULES: Array<[string, RegExp]> = [
  ["bonus548", /548|critical/i],
  ["dt", /double/i],
  ["ot", /overtime|\bo\.?t\.?\b/i],
  ["reg", /regular|straight/i],
  ["weekend", /weekend|wknd/i],
  ["evening", /evening|\beve\b/i],
  ["charge", /charge|308/i],
  ["premium", /premium|320/i],
  ["preceptor", /precept/i],
  ["sto", /sick|\bsto\b/i],
  ["loa", /leave of absence|\bloa\b/i],
  ["medical", /medical leave/i],
];

const TAX_RULES: Array<[string, RegExp]> = [
  ["mnFam", /family/i],
  ["mnMed", /medical/i],
  // OASDI/"Fed MED" style labels must land here, not on federal income tax.
  ["ss", /social security|oasdi|\bss\b/i],
  ["medicare", /medicare|fed\s*med\b/i],
  ["fed", /federal|\bfed\b/i],
  ["mn", /minnesota|\bmn\b|state/i],
];

/** Imputed income is on the stub but is not an enterable check line. */
const IGNORED_EARNINGS = /imput|term life/i;

export interface StubFillResult {
  /** Ready to merge into the check's `actual` map (dollar strings). */
  actual: Record<string, string>;
  matched: Array<{ key: string; label: string; amount: string }>;
  unmatched: Array<{ section: string; label: string; amount: string }>;
  ignored: Array<{ label: string; amount: string }>;
  periodStart: string;
  periodEnd: string;
}

const toCents = (amount: number): number => Math.round(amount * 100);
const centsStr = (cents: number): string => (cents / 100).toFixed(2);

/**
 * Map the stub's lines onto the check's keys. Split payments on one line
 * (two 548 rows) SUM — that is exactly the June failure mode. Pretax and
 * after-tax roll up whole-section. All sums in integer cents.
 */
export function stubLinesToActual(lines: StubLines): StubFillResult {
  const cents = new Map<string, number>();
  const matched: StubFillResult["matched"] = [];
  const unmatched: StubFillResult["unmatched"] = [];
  const ignored: StubFillResult["ignored"] = [];
  const add = (key: string, amount: number) => cents.set(key, (cents.get(key) ?? 0) + toCents(amount));

  for (const item of lines.earnings) {
    if (IGNORED_EARNINGS.test(item.label)) {
      ignored.push({ label: item.label, amount: item.amount.toFixed(2) });
      continue;
    }
    const rule = EARNINGS_RULES.find(([, re]) => re.test(item.label));
    if (rule) {
      add(rule[0], item.amount);
      matched.push({ key: rule[0], label: item.label, amount: item.amount.toFixed(2) });
    } else {
      unmatched.push({ section: "earnings", label: item.label, amount: item.amount.toFixed(2) });
    }
  }

  for (const item of lines.taxes) {
    const rule = TAX_RULES.find(([, re]) => re.test(item.label));
    if (rule) {
      add(rule[0], item.amount);
      matched.push({ key: rule[0], label: item.label, amount: item.amount.toFixed(2) });
    } else {
      unmatched.push({ section: "taxes", label: item.label, amount: item.amount.toFixed(2) });
    }
  }

  // Whole-section rollups — the check audits pretax/after-tax as totals.
  for (const [key, items] of [
    ["pretax", lines.pretax],
    ["aftertax", lines.aftertax],
  ] as const) {
    if (items.length === 0) continue;
    for (const item of items) add(key, item.amount);
    matched.push({
      key,
      label: items.map((i) => i.label).join(" + "),
      amount: centsStr(cents.get(key) ?? 0),
    });
  }

  if (lines.gross !== null) cents.set("gross", toCents(lines.gross));
  if (lines.net !== null) cents.set("net", toCents(lines.net));

  const actual: Record<string, string> = {};
  for (const [key, c] of cents) actual[key] = centsStr(c);

  return { actual, matched, unmatched, ignored, periodStart: lines.periodStart, periodEnd: lines.periodEnd };
}

export async function scanStubForFill(files: File[], apiKey: string): Promise<StubLines> {
  const blocks = await filesToContentBlocks(files);
  if (blocks.length === 0) throw new Error("No readable files — upload a stub photo or PDF.");
  const text = await callClaude(blocks, stubFillInstruction, apiKey, 4000);
  return parseStubLinesResponse(text);
}
