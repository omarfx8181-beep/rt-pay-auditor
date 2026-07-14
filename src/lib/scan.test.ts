/** M5 — schedule-scan parsing and the code-does-the-math split. */
import { describe, expect, test } from "vitest";
import { DEFAULT_CFG } from "./engine.ts";
import { buildScanRows, parseScanResponse, scanRowsToDrafts } from "./scan.ts";

const JUNE_JSON = JSON.stringify({
  shifts: [
    { date: "2026-07-02", start: "06:45", end: "19:15", label: "MICU" },
    { date: "2026-06-28", start: "06:45", end: "23:15", label: "" },
    { date: "2026-07-04", start: "19:00", end: "07:00", label: "NOC" },
    { date: "2026-07-06", start: "", end: "", label: "T2" },
  ],
});

describe("scan response parsing", () => {
  test("plain JSON parses; markdown fences are stripped", () => {
    expect(parseScanResponse(JUNE_JSON)).toHaveLength(4);
    expect(parseScanResponse("```json\n" + JUNE_JSON + "\n```")).toHaveLength(4);
  });

  test("garbage and shapeless responses throw, dateless rows are dropped", () => {
    expect(() => parseScanResponse("I found three shifts for you!")).toThrow(/valid json/i);
    expect(() => parseScanResponse('{"notShifts": []}')).toThrow(/no shifts/i);
    expect(parseScanResponse('{"shifts":[{"date":"","start":"06:45"},{"date":"2026-07-02"}]}')).toHaveLength(1);
  });
});

describe("code computes the hours, not the model (SPEC §3 test 5 rules)", () => {
  test("meal rule, overnight, and missing times land per the engine", () => {
    const rows = buildScanRows(parseScanResponse(JUNE_JSON), DEFAULT_CFG);
    expect(rows.map((r) => [r.date, r.hours])).toEqual([
      ["2026-06-28", 16.0], // 06:45–23:15
      ["2026-07-02", 12.0], // 06:45–19:15, meal off
      ["2026-07-04", 11.5], // 19:00–07:00 overnight
      ["2026-07-06", null], // code only, no times
    ]);
  });

  test("drafts carry schedule provenance in the note and default missing hours to 12", () => {
    const drafts = scanRowsToDrafts(buildScanRows(parseScanResponse(JUNE_JSON), DEFAULT_CFG));
    expect(drafts[1]).toMatchObject({ date: "2026-07-02", hours: "12", note: "MICU · sched 06:45–19:15" });
    expect(drafts[3]).toMatchObject({ date: "2026-07-06", hours: "12", note: "T2 · sched — fill hrs" });
    expect(drafts.every((d) => d.units548 === "0" && d.charge === "0")).toBe(true);
    expect(drafts.every((d) => d.note.length <= 42)).toBe(true);
  });
});

describe("role designations auto-fill extra-pay hours (payroll rules, Jul 2026)", () => {
  const draftsFor = (label: string, start = "06:45", end = "19:15") =>
    scanRowsToDrafts(
      buildScanRows(parseScanResponse(JSON.stringify({ shifts: [{ date: "2026-07-08", start, end, label }] })), DEFAULT_CFG),
    )[0];

  test('"MICU Charge" → charge hours = the shift\'s paid hours', () => {
    expect(draftsFor("MICU Charge")).toMatchObject({ hours: "12", charge: "12", premium: "0", preceptor: "0" });
    expect(draftsFor("T2 CHG")).toMatchObject({ charge: "12" });
  });

  test('"Precept" in any form → preceptor hours', () => {
    expect(draftsFor("Precepting — new grad")).toMatchObject({ preceptor: "12", charge: "0" });
    expect(draftsFor("NICU PCPT")).toMatchObject({ preceptor: "12" });
  });

  test("a transport day earns premium for the WHOLE day", () => {
    expect(draftsFor("Transport")).toMatchObject({ premium: "12", charge: "0", preceptor: "0" });
  });

  test("plain unit labels set nothing; detection follows the 12-hour fallback when times are missing", () => {
    expect(draftsFor("MICU")).toMatchObject({ charge: "0", premium: "0", preceptor: "0" });
    expect(draftsFor("Charge", "", "")).toMatchObject({ hours: "12", charge: "12" });
  });

  test('no false positives from lookalikes ("premie" is not premium)', () => {
    expect(draftsFor("NICU premie team")).toMatchObject({ premium: "0" });
  });
});
