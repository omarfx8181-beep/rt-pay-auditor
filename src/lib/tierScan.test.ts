/** The bonus-posting scan: strict parsing, loose label matching, drop warnings. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { diffTiers, parseTierResponse } from "./tierScan.ts";

describe("parseTierResponse", () => {
  test("reads fenced JSON, trims labels, keeps fractional units", () => {
    const r = parseTierResponse(
      '```json\n{"tiers":[{"label":" 12-hr extra shift ","units":10},{"label":"Shift extension > 4 hr","units":2.5}],"effective":"2026-07-27"}\n```',
    );
    expect(r.tiers).toEqual([
      { id: "scan-t1", label: "12-hr extra shift", units: 10 },
      { id: "scan-t2", label: "Shift extension > 4 hr", units: 2.5 },
    ]);
    expect(r.effective).toBe("2026-07-27");
  });

  test("junk units and blank labels are dropped; nothing readable throws", () => {
    const r = parseTierResponse('{"tiers":[{"label":"ok","units":1},{"label":"","units":2},{"label":"bad","units":"lots"}]}');
    expect(r.tiers).toHaveLength(1);
    expect(() => parseTierResponse('{"tiers":[]}')).toThrow(/No readable tiers|No tiers/);
    expect(() => parseTierResponse("not json")).toThrow(/valid JSON/);
  });
});

describe("diffTiers", () => {
  test("matches labels loosely (dollar amounts and parens ignored) and flags drops", () => {
    const next = [
      { id: "scan-t1", label: "12-hr extra shift", units: 10 }, // matches "12-hr extra shift ($500)" — unchanged
      { id: "scan-t2", label: "16-hr extra shift", units: 8 }, // drops vs whatever it is today if higher
      { id: "scan-t3", label: "Brand new night tier", units: 12 },
    ];
    const current = [
      { id: "a", label: "12-hr extra shift ($500)", units: 10 },
      { id: "b", label: "16-hr extra shift ($750)", units: 15 },
      { id: "c", label: "Weekend saver", units: 4 },
    ];
    const d = diffTiers(current, next);
    expect(d.changes).toEqual([{ label: "16-hr extra shift", fromUnits: 15, toUnits: 8 }]);
    expect(d.drops).toEqual([{ label: "16-hr extra shift", fromUnits: 15, toUnits: 8 }]);
    expect(d.added.map((t) => t.label)).toEqual(["Brand new night tier"]);
    expect(d.removed.map((t) => t.label)).toEqual(["Weekend saver"]);
  });

  test("identical posting → nothing to report", () => {
    const d = diffTiers(DEFAULT_TIERS, DEFAULT_TIERS);
    expect(d.changes).toEqual([]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});
