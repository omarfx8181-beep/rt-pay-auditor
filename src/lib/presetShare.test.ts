/** Beam the pay rules: compact round-trip, junk never applies, QR-sized. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { DEFAULT_CFG_DRAFT } from "./draft.ts";
import { CFG_KEYS, encodeRules, parseSharedRules } from "./presetShare.ts";

describe("presetShare", () => {
  test("CFG_KEYS carries every config field — position is the schema", () => {
    expect([...CFG_KEYS].sort()).toEqual(Object.keys(DEFAULT_CFG_DRAFT).sort());
  });

  test("encode → parse round-trips the whole setup", () => {
    const raw = encodeRules("M Health Fairview — RT", DEFAULT_CFG_DRAFT, DEFAULT_TIERS);
    const parsed = parseSharedRules(raw)!;
    expect(parsed.name).toBe("M Health Fairview — RT");
    expect(parsed.cfgDraft).toEqual(DEFAULT_CFG_DRAFT);
    expect(parsed.tiers.map((t) => ({ label: t.label, units: t.units }))).toEqual(
      DEFAULT_TIERS.map((t) => ({ label: t.label, units: t.units })),
    );
  });

  test("the payload stays inside jsQR's ~900-byte decode ceiling", () => {
    const raw = encodeRules("M Health Fairview — Respiratory Therapist", DEFAULT_CFG_DRAFT, DEFAULT_TIERS);
    expect(raw.length).toBeLessThan(900);
  });

  test("rules only — no shifts, stubs, or keys ever ride along", () => {
    const raw = encodeRules("x", DEFAULT_CFG_DRAFT, DEFAULT_TIERS);
    expect(raw).not.toMatch(/sk-ant|apiKey|actual|shifts/);
  });

  test("junk, foreign QRs, and short payloads → null", () => {
    expect(parseSharedRules("not json")).toBeNull();
    expect(parseSharedRules('"https://example.com"')).toBeNull();
    expect(parseSharedRules('["other-format",1,"n",[],[]]')).toBeNull();
    expect(parseSharedRules('["rtpa-rules",2,"future",[],[]]')).toBeNull(); // unknown version
    expect(parseSharedRules('["rtpa-rules",1,"n",["1","2"],[]]')).toBeNull(); // truncated config
  });

  test("bad tiers are filtered, ids regenerated", () => {
    const raw = JSON.stringify([
      "rtpa-rules",
      1,
      "n",
      CFG_KEYS.map(() => "1"),
      [["12-hr extra", 10], ["bad", "x"], "junk", [""]],
    ]);
    const parsed = parseSharedRules(raw)!;
    expect(parsed.tiers).toEqual([{ id: "shared-t1", label: "12-hr extra", units: 10 }]);
  });
});
