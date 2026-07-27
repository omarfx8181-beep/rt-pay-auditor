/**
 * Beam the pay rules — the FACILITY's rules and this week's tiers as
 * one QR code another phone scans. No server, no account: the QR is
 * the transport.
 *
 * The contract is strict: facility RULES only. Never the sharer's
 * base rate, tax elections, insurance premiums, 403(b) percentage, or
 * per-period data like evening hours — those stay the receiver's own
 * on import (the review caught v0 leaking all of them).
 *
 * Payload is a compact ARRAY (keys carried by position): jsQR only
 * decodes reliably up to roughly version-21 codes (~900 bytes).
 */
import type { BonusTier } from "./engine.ts";
import type { CfgDraft } from "./draft.ts";

/**
 * The shareable facility rules, in canonical order — position IS the
 * schema. Append only; never reorder. Everything NOT here is personal
 * or per-period and never rides in a QR.
 */
export const RULE_KEYS = [
  "otMult",
  "dtMult",
  "otPeriod",
  "dtDaily",
  "weekendDiff",
  "eveningDiff",
  "chargeRate",
  "premiumRate",
  "preceptorRate",
  "unit548",
  "mnFam",
  "mnMed",
  "mealDeduct",
  "mealThreshold",
] as const satisfies readonly (keyof CfgDraft)[];

const MARK = "rtpa-rules";

export interface SharedRules {
  name: string;
  /** Facility rules only — merge over the receiver's config, never replace it. */
  rules: Partial<CfgDraft>;
  tiers: BonusTier[];
}

/** → ["rtpa-rules", 1, name, [rule values in RULE_KEYS order], [[label, units]…]] */
export function encodeRules(name: string, cfgDraft: CfgDraft, tiers: BonusTier[]): string {
  return JSON.stringify([
    MARK,
    1,
    name.slice(0, 60),
    RULE_KEYS.map((k) => cfgDraft[k] ?? ""),
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
  if (!Array.isArray(vals) || vals.length < RULE_KEYS.length) return null;
  if (vals.slice(0, RULE_KEYS.length).some((v) => typeof v !== "string")) return null;
  const rules = Object.fromEntries(RULE_KEYS.map((k, i) => [k, vals[i] as string])) as Partial<CfgDraft>;
  const tiers: BonusTier[] = (Array.isArray(rawTiers) ? rawTiers : [])
    .filter((t): t is [unknown, unknown] => Array.isArray(t) && t.length >= 2)
    .filter((t) => typeof t[0] === "string" && (t[0] as string).trim() !== "")
    .filter((t) => Number.isFinite(Number(t[1])) && Number(t[1]) >= 0)
    .map((t, i) => ({ id: `shared-t${i + 1}`, label: String(t[0]), units: Number(t[1]) }));
  return {
    name: typeof name === "string" && name.trim() !== "" ? name : "Shared pay rules",
    rules,
    tiers,
  };
}
