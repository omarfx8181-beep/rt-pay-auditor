/**
 * The weekly bonus-posting scan: snap the incentive sheet and the
 * tiers update themselves — the last manual config chore, gone. The
 * model only READS the posting; code validates, diffs against the
 * current tiers, and flags drops (a tier quietly moving down is
 * exactly the $250 dispute that started this app).
 */
import { callClaude, filesToContentBlocks } from "./scan.ts";
import type { BonusTier } from "./engine.ts";

export const tierInstruction =
  "You are reading a hospital's critical-shift / extra-shift bonus incentive posting (a screenshot, photo, flyer, or " +
  "message). It lists bonus TIERS: a shift description (e.g. \"12-hr extra shift\", \"16-hr extra shift\", \"shift " +
  "extension over 4 hours\") and how many bonus units (sometimes shown as a dollar amount where one unit = $50, or " +
  "stated directly as units) each earns. Extract every tier. " +
  'Respond with ONLY valid JSON, no markdown: {"tiers":[{"label":"12-hr extra shift","units":10}],"effective":"YYYY-MM-DD or empty string"}. ' +
  "Keep labels short and human (include the hour length when stated). Units are plain numbers; if the posting shows " +
  "dollars and one unit is $50, divide by 50. \"effective\" is the week/date the posting applies to, when printed.";

export interface TierScanResult {
  tiers: BonusTier[];
  effective: string;
}

export function parseTierResponse(text: string): TierScanResult {
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("The response wasn't valid JSON — try a tighter photo of just the posting.");
  }
  const raw = (parsed as { tiers?: unknown })?.tiers;
  if (!Array.isArray(raw)) throw new Error("No tiers found in the response.");
  const tiers = raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .filter((t) => typeof t.label === "string" && t.label.trim() !== "" && Number.isFinite(Number(t.units)) && Number(t.units) >= 0)
    .map((t, i) => ({ id: `scan-t${i + 1}`, label: String(t.label).trim(), units: Number(t.units) }));
  if (tiers.length === 0) throw new Error("No readable tiers in the posting.");
  const effective = (parsed as { effective?: unknown })?.effective;
  return { tiers, effective: typeof effective === "string" ? effective : "" };
}

/**
 * Labels match loosely. Case, spacing, dollar amounts, and pure
 * annotations in parens — "(current)", "(confirm)", "($500)" — don't
 * count; parenthetical content that carries a NUMBER does ("(8 hr)"
 * vs "(12 hr)" are different tiers); over/under distinctions ("> 4
 * hr" vs "≤ 4 hr") are kept as words.
 */
const tierKey = (label: string): string =>
  label
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, (_, inner: string) => {
      const noMoney = inner.replace(/\$\s?[\d,.]+/g, "");
      return /\d/.test(noMoney) ? ` ${noMoney} ` : " ";
    })
    .replace(/\$\s?[\d,.]+/g, "")
    .replace(/[>≥]/g, " over ")
    .replace(/[<≤]/g, " under ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export interface TierChange {
  label: string;
  fromUnits: number;
  toUnits: number;
}

export interface TierDiff {
  /** Matched tiers whose units moved. */
  changes: TierChange[];
  /** The dangerous subset: units went DOWN. */
  drops: TierChange[];
  /** New tiers with no counterpart today. */
  added: BonusTier[];
  /** Current tiers the posting no longer lists. */
  removed: BonusTier[];
}

export function diffTiers(current: BonusTier[], next: BonusTier[]): TierDiff {
  const curByKey = new Map(current.map((t) => [tierKey(t.label), t]));
  const nextKeys = new Set(next.map((t) => tierKey(t.label)));
  const changes: TierChange[] = [];
  for (const n of next) {
    const cur = curByKey.get(tierKey(n.label));
    if (cur && cur.units !== n.units) changes.push({ label: n.label, fromUnits: cur.units, toUnits: n.units });
  }
  return {
    changes,
    drops: changes.filter((c) => c.toUnits < c.fromUnits),
    added: next.filter((n) => !curByKey.has(tierKey(n.label))),
    removed: current.filter((c) => !nextKeys.has(tierKey(c.label))),
  };
}

export async function scanTierPosting(files: File[], apiKey: string): Promise<TierScanResult> {
  const blocks = await filesToContentBlocks(files);
  const text = await callClaude(blocks, tierInstruction, apiKey, 2000);
  return parseTierResponse(text);
}
