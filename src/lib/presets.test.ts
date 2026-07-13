/**
 * V3-M7 — the preset must be a faithful, portable copy of the rules the
 * golden tests pin. If the Fairview preset and the engine's own fixture
 * ever drift, this fails before anything ships.
 */
import { describe, expect, test } from "vitest";
import { computePeriod, DEFAULT_CFG, DEFAULT_TIERS } from "./engine.ts";
import { DEFAULT_CFG_DRAFT, draftToConfig } from "./draft.ts";
import { FAIRVIEW_RT_PRESET } from "./presets.ts";

describe("Fairview RT preset (brief §6)", () => {
  test("carries provenance: presetSource and version", () => {
    expect(FAIRVIEW_RT_PRESET.presetSource).toBe("rt-pay built-in");
    expect(FAIRVIEW_RT_PRESET.version).toBe(1);
    expect(FAIRVIEW_RT_PRESET.facility.id).toBe("m-health-fairview");
    expect(FAIRVIEW_RT_PRESET.role.id).toBe("respiratory-therapist");
  });

  test("preset config reproduces the engine's golden fixture exactly", () => {
    // The strongest guarantee: parsing the preset's draft yields the very
    // cents config every golden test runs against.
    expect(draftToConfig(FAIRVIEW_RT_PRESET.cfgDraft)).toEqual(DEFAULT_CFG);
    // …and the legacy aliases still point at the preset.
    expect(DEFAULT_CFG_DRAFT).toBe(FAIRVIEW_RT_PRESET.cfgDraft);
    expect(DEFAULT_TIERS).toBe(FAIRVIEW_RT_PRESET.tiers);
  });

  test("keeps the June-regression tier: 16-hr extra at the old tier = 15 units", () => {
    const t8 = FAIRVIEW_RT_PRESET.tiers.find((t) => t.id === "t8");
    expect(t8?.units).toBe(15);
    expect(t8?.label).toBe("16-hr extra — old tier ($750)");
  });

  test("facility bonus/adder codes match the stub labels the engine emits", () => {
    const lines = computePeriod(
      [{ id: "x", date: "2026-07-01", hours: 12, chargeHours: 1, premiumHours: 1, preceptorHours: 0, units548: 1 }],
      DEFAULT_CFG,
    ).lines;
    for (const [key, code] of Object.entries(FAIRVIEW_RT_PRESET.facility.codes)) {
      const line = lines.find((l) => l.key === key);
      expect(line, `engine emits a line for preset code key "${key}"`).toBeDefined();
      expect(line!.label).toContain(`(${code})`);
    }
  });

  test("pay cycle matches the app's period length", () => {
    expect(FAIRVIEW_RT_PRESET.facility.payCycle).toBe("biweekly");
    expect(FAIRVIEW_RT_PRESET.facility.periodDays).toBe(14);
  });
});
