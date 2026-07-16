/** Stub upload — response parsing and duplicate-safe placement. */
import { describe, expect, test } from "vitest";
import { parseStubResponse, parseYtdSummary, planStubImports, scannedStubActual, stubStartDate } from "./stubScan.ts";
import type { PayPeriod } from "./periods.ts";

const RESPONSE = JSON.stringify({
  stubs: [
    { endDate: "2026-06-07", startDate: "2026-05-25", gross: "8100.12", net: "5300.44" },
    { endDate: "2026-07-05", startDate: "", gross: 8865.22, net: 5781.99 }, // duplicate of the demo period
    { endDate: "not-a-date", gross: "1", net: "1" }, // dropped
  ],
});

const existing = [{ startDate: "2026-06-22", endDate: "2026-07-05" } as PayPeriod];

describe("stub scan", () => {
  test("parses fenced or plain JSON, drops dateless rows, stringifies amounts", () => {
    const stubs = parseStubResponse("```json\n" + RESPONSE + "\n```");
    expect(stubs).toHaveLength(2);
    expect(stubs[1]).toMatchObject({ endDate: "2026-07-05", gross: "8865.22", net: "5781.99" });
    expect(() => parseStubResponse("here are your stubs!")).toThrow(/valid json/i);
  });

  test("placement: stubs inside existing periods are duplicates, the rest get added", () => {
    const plan = planStubImports(existing, parseStubResponse(RESPONSE));
    expect(plan.toAdd.map((s) => s.endDate)).toEqual(["2026-06-07"]);
    expect(plan.duplicates.map((s) => s.endDate)).toEqual(["2026-07-05"]);
  });

  test("start date: stub's own when shown, end − 13 days otherwise", () => {
    expect(stubStartDate({ endDate: "2026-06-07", startDate: "2026-05-25", gross: "", net: "", lines: null })).toBe("2026-05-25");
    expect(stubStartDate({ endDate: "2026-06-07", startDate: "", gross: "", net: "", lines: null })).toBe("2026-05-25");
  });

  test("same stub scanned twice in one batch collapses to one add", () => {
    const twice = parseStubResponse(RESPONSE).concat(parseStubResponse(RESPONSE));
    const plan = planStubImports(existing, twice);
    expect(plan.toAdd).toHaveLength(1);
  });
});

describe("YTD summary parsing", () => {
  test("summary block parses to cents; absent or empty → null", () => {
    const withSummary = JSON.stringify({
      stubs: [],
      ytdSummary: { asOfDate: "2026-07-14", gross: 103320.11, taxes: 20225.79, pretax: 12516.42, aftertax: 1168.51, imputed: 24.13 },
    });
    const s = parseYtdSummary(withSummary);
    expect(s).toMatchObject({ asOfDate: "2026-07-14", grossCents: 10332011, taxesCents: 2022579 });
    expect(parseYtdSummary(JSON.stringify({ stubs: [], ytdSummary: null }))).toBeNull();
    expect(parseYtdSummary(RESPONSE)).toBeNull(); // stub-only responses unchanged
  });

  test("missing amounts stay null; junk gross rejects the summary", () => {
    const partial = parseYtdSummary(JSON.stringify({ stubs: [], ytdSummary: { asOfDate: "", gross: "103,320.11", taxes: null } }));
    expect(partial).toMatchObject({ grossCents: 10332011, taxesCents: null, asOfDate: "" });
    expect(parseYtdSummary(JSON.stringify({ stubs: [], ytdSummary: { gross: "n/a" } }))).toBeNull();
  });
});

describe("itemized stubs (line detail per old stub)", () => {
  const WITH_LINES = JSON.stringify({
    stubs: [
      {
        endDate: "2026-06-07",
        startDate: "2026-05-25",
        gross: "8865.22",
        net: "5781.99",
        lines: {
          earnings: [
            { label: "Regular Straight Time", amount: 4202.4 },
            { label: "Critical Shift Bonus (548)", amount: 475.0 },
            { label: "Critical Shift Bonus (548)", amount: 725.0 },
            { label: "Imputed - Basic Term Life", amount: 1.81 },
          ],
          taxes: [
            { label: "Federal W/H", amount: 1120.64 },
            { label: "MN Paid Family Leave EE", amount: 11.96 },
          ],
          pretax: [{ label: "403(b)", amount: 265.9 }, { label: "Medical", amount: 418.08 }],
          aftertax: [{ label: "Accident", amount: 99.04 }],
        },
      },
      { endDate: "2026-05-24", startDate: "", gross: "3000", net: "2000", lines: null },
    ],
    ytdSummary: null,
  });

  test("lines parse per stub; empty or missing sections collapse to null", () => {
    const stubs = parseStubResponse(WITH_LINES);
    expect(stubs[0].lines?.earnings).toHaveLength(4);
    expect(stubs[1].lines).toBeNull();
    const empty = parseStubResponse(JSON.stringify({ stubs: [{ endDate: "2026-05-24", lines: { earnings: [], taxes: [], pretax: [], aftertax: [] } }] }));
    expect(empty[0].lines).toBeNull();
  });

  test("scannedStubActual: split 548 rows sum, sections roll up, stub totals win, imputed ignored", () => {
    const [detailed, bare] = parseStubResponse(WITH_LINES);
    const actual = scannedStubActual(detailed);
    expect(actual.reg).toBe("4202.40");
    expect(actual.bonus548).toBe("1200.00"); // 475 + 725 in cents
    expect(actual.fed).toBe("1120.64");
    expect(actual.mnFam).toBe("11.96");
    expect(actual.pretax).toBe("683.98"); // 265.90 + 418.08
    expect(actual.aftertax).toBe("99.04");
    expect(actual.gross).toBe("8865.22"); // the stub's own total, not a sum
    expect(actual.net).toBe("5781.99");
    expect(actual.imputed).toBeUndefined(); // non-cash line is not an enterable check line
    expect(scannedStubActual(bare)).toEqual({ gross: "3000", net: "2000" });
  });
});
