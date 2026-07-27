/**
 * Beam the pay rules — your whole setup (rates, rules, this week's
 * tiers) as one QR code another phone scans. No server, no account:
 * the QR IS the transport, and nothing personal rides along — pay
 * RULES only, never shifts, stubs, or the API key.
 *
 * The payload is a compact ARRAY (keys carried by position, not name):
 * jsQR reliably decodes only up to roughly version-21 codes (~900
 * bytes), and the named-JSON form of a full config blows past that.
 */
import type { BonusTier } from "./engine.ts";
import type { CfgDraft } from "./draft.ts";

/** Canonical field order — position IS the schema. Append only; never reorder. */
export const CFG_KEYS = [
  "baseRate",
  "otMult",
  "dtMult",
  "otPeriod",
  "dtDaily",
  "otRateOverride",
  "weekendDiff",
  "eveningDiff",
  "eveningHours",
  "chargeRate",
  "premiumRate",
  "preceptorRate",
  "unit548",
  "imputed",
  "k403bPct",
  "med",
  "dent",
  "fsa",
  "fedEff",
  "mnEff",
  "marginalFed",
  "marginalMN",
  "mnFam",
  "mnMed",
  "acc",
  "crit",
  "otherAfterTax",
  "mealDeduct",
  "mealThreshold",
] as const satisfies readonly (keyof CfgDraft)[];

const MARK = "rtpa-rules";

export interface SharedRules {
  name: string;
  cfgDraft: CfgDraft;
  tiers: BonusTier[];
}

/** → ["rtpa-rules", 1, name, [cfg values in CFG_KEYS order], [[label, units]…]] */
export function encodeRules(name: string, cfgDraft: CfgDraft, tiers: BonusTier[]): string {
  return JSON.stringify([
    MARK,
    1,
    name.slice(0, 60),
    CFG_KEYS.map((k) => cfgDraft[k] ?? ""),
    tiers.map((t) => [t.label.slice(0, 60), t.units]),
  ]);
}

/** Strict parse — junk, foreign QRs, and truncated payloads all → null. */
export function parseSharedRules(raw: string): SharedRules | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed[0] !== MARK || parsed[1] !== 1) return null;
  const [, , name, vals, rawTiers] = parsed as [string, number, unknown, unknown, unknown];
  if (!Array.isArray(vals) || vals.length < CFG_KEYS.length) return null;
  if (vals.slice(0, CFG_KEYS.length).some((v) => typeof v !== "string")) return null;
  const cfgDraft = Object.fromEntries(CFG_KEYS.map((k, i) => [k, vals[i] as string])) as unknown as CfgDraft;
  const tiers: BonusTier[] = (Array.isArray(rawTiers) ? rawTiers : [])
    .filter((t): t is [unknown, unknown] => Array.isArray(t) && t.length >= 2)
    .filter((t) => typeof t[0] === "string" && (t[0] as string).trim() !== "" && Number.isFinite(Number(t[1])))
    .map((t, i) => ({ id: `shared-t${i + 1}`, label: String(t[0]), units: Number(t[1]) }));
  return {
    name: typeof name === "string" && name.trim() !== "" ? name : "Shared pay rules",
    cfgDraft,
    tiers,
  };
}
