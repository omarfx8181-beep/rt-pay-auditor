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
  test("annotation parens are ignored: a posting's bare '16-hr extra shift' still matches '(current)' and flags the drop", () => {
    const d = diffTiers(DEFAULT_TIERS, [{ id: "s1", label: "16-hr extra shift", units: 4 }]);
    expect(d.changes).toEqual([{ label: "16-hr extra shift", fromUnits: 8, toUnits: 4 }]);
    expect(d.drops).toHaveLength(1);
    expect(d.added).toEqual([]); // never duplicated as "new"
  });

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

  test("hour lengths inside parens stay distinct — no phantom drops, no masked adds", () => {
    const current = [
      { id: "a", label: "Extra shift (8 hr)", units: 5 },
      { id: "b", label: "Extra shift (12 hr)", units: 10 },
    ];
    // identical posting → silence
    const same = diffTiers(current, [
      { id: "s1", label: "Extra shift (8 hr)", units: 5 },
      { id: "s2", label: "Extra shift (12 hr)", units: 10 },
    ]);
    expect(same.changes).toEqual([]);
    expect(same.drops).toEqual([]);
    // a genuinely new 16-hr tier is reported as added, not swallowed
    const withNew = diffTiers(current, [
      { id: "s1", label: "Extra shift (8 hr)", units: 5 },
      { id: "s2", label: "Extra shift (12 hr)", units: 10 },
      { id: "s3", label: "Extra shift (16 hr)", units: 12 },
    ]);
    expect(withNew.changes).toEqual([]);
    expect(withNew.added.map((t) => t.label)).toEqual(["Extra shift (16 hr)"]);
  });
});
