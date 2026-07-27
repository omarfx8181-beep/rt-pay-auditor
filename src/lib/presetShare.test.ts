/** Beam the pay rules: facility rules ONLY, strict round-trip, junk never applies. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { DEFAULT_CFG_DRAFT } from "./draft.ts";
import { encodeRules, parseSharedRules, RULE_KEYS } from "./presetShare.ts";

describe("presetShare", () => {
  test("encode → parse round-trips the facility rules and tiers", () => {
    const raw = encodeRules("M Health Fairview — RT", DEFAULT_CFG_DRAFT, DEFAULT_TIERS);
    const parsed = parseSharedRules(raw)!;
    expect(parsed.name).toBe("M Health Fairview — RT");
    expect(parsed.rules).toEqual(Object.fromEntries(RULE_KEYS.map((k) => [k, DEFAULT_CFG_DRAFT[k]])));
    expect(parsed.tiers.map((t) => ({ label: t.label, units: t.units }))).toEqual(
      DEFAULT_TIERS.map((t) => ({ label: t.label, units: t.units })),
    );
  });

  test("NOTHING personal or per-period rides along — the review's exact leak list", () => {
    const raw = encodeRules("x", DEFAULT_CFG_DRAFT, DEFAULT_TIERS);
    const parsed = parseSharedRules(raw)!;
    for (const leaked of [
      "baseRate",
      "eveningHours", // period DATA — manufactured false $36.90 shortfalls in v0
      "otRateOverride",
      "k403bPct",
      "med",
      "dent",
      "fsa",
      "fedEff",
      "mnEff",
      "marginalFed",
      "marginalMN",
      "acc",
      "crit",
      "otherAfterTax",
      "imputed",
    ] as const) {
      expect(parsed.rules).not.toHaveProperty(leaked);
      expect(RULE_KEYS).not.toContain(leaked);
    }
    expect(raw).not.toMatch(/sk-ant|apiKey|actual|shifts/);
    expect(raw).not.toContain(DEFAULT_CFG_DRAFT.baseRate);
    expect(raw).not.toContain(DEFAULT_CFG_DRAFT.med);
  });

  test("the payload stays far inside jsQR's ~900-byte decode ceiling", () => {
    const raw = encodeRules("M Health Fairview — Respiratory Therapist", DEFAULT_CFG_DRAFT, DEFAULT_TIERS);
    expect(raw.length).toBeLessThan(700);
  });

  test("junk, foreign QRs, and short payloads → null", () => {
    expect(parseSharedRules("not json")).toBeNull();
    expect(parseSharedRules('"https://example.com"')).toBeNull();
    expect(parseSharedRules('["other-format",1,"n",[],[]]')).toBeNull();
    expect(parseSharedRules('["rtpa-rules",2,"future",[],[]]')).toBeNull(); // unknown version
    expect(parseSharedRules('["rtpa-rules",1,"n",["1","2"],[]]')).toBeNull(); // truncated rules
  });

  test("bad tiers are filtered (negative units included), ids regenerated", () => {
    const raw = JSON.stringify([
      "rtpa-rules",
      1,
      "n",
      RULE_KEYS.map(() => "1"),
      [["12-hr extra", 10], ["negative", -3], ["bad", "x"], "junk", [""]],
    ]);
    const parsed = parseSharedRules(raw)!;
    expect(parsed.tiers).toEqual([{ id: "shared-t1", label: "12-hr extra", units: 10 }]);
  });
});
