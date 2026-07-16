/** The year spreadsheet: rows per period, totals that match the Year card. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { ACTUAL_SEED, DEFAULT_CFG_DRAFT, DEMO_SHIFTS } from "./draft.ts";
import { rollupYtd, type PayPeriod } from "./periods.ts";
import { buildYearCsv, yearCsvName } from "./csv.ts";

const demoPeriod = (over: Partial<PayPeriod> = {}): PayPeriod => ({
  id: "p1",
  startDate: "2026-06-22",
  endDate: "2026-07-05",
  shifts: DEMO_SHIFTS,
  actual: ACTUAL_SEED,
  cfgDraft: DEFAULT_CFG_DRAFT,
  tiers: DEFAULT_TIERS,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe("buildYearCsv", () => {
  test("stub-true period row carries its buckets; totals equal the rollup", () => {
    const csv = buildYearCsv([demoPeriod()], "2026");
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("Gross,Take-home,Taxes withheld");
    expect(lines[1]).toContain("2026-06-22,2026-07-05,stub,8865.22,5781.99,2298.40,683.98,99.04,1.81");
    const rollup = rollupYtd([demoPeriod()], "2026");
    expect(lines[2]).toContain(`TOTAL 2026`);
    expect(lines[2]).toContain((rollup.totalGrossCents / 100).toFixed(2));
  });

  test("totals-only periods leave bucket cells blank and add the honesty note", () => {
    const totalsOnly = demoPeriod({ id: "p2", startDate: "2026-06-08", endDate: "2026-06-21", shifts: [], actual: { gross: "3000", net: "2000" } });
    const csv = buildYearCsv([demoPeriod(), totalsOnly], "2026");
    const totalsRow = csv.split("\r\n").find((l) => l.includes("2026-06-08"))!;
    expect(totalsRow).toContain("stub,3000.00,2000.00,,,,");
    expect(csv).toContain("1 period(s) carry only totals");
    // periods sort oldest-first for a readable sheet
    expect(csv.indexOf("2026-06-08")).toBeLessThan(csv.indexOf("2026-06-22"));
  });

  test("other income rows quote commas and blank net falls back to gross", () => {
    const csv = buildYearCsv([demoPeriod()], "2026", [
      { id: "o1", date: "2026-03-15", source: "Gig, weekend", gross: "1,200.50", net: "", updatedAt: 1 },
    ]);
    expect(csv).toContain('"Other income — Gig, weekend",2026-03-15,2026-03-15,as entered,1200.50,1200.50');
  });

  test("file name carries the year", () => {
    expect(yearCsvName("2026")).toBe("rt-pay-2026.csv");
  });
});
