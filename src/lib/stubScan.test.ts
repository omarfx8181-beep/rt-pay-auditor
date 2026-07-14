/** Stub upload — response parsing and duplicate-safe placement. */
import { describe, expect, test } from "vitest";
import { parseStubResponse, parseYtdSummary, planStubImports, stubStartDate } from "./stubScan.ts";
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
    expect(stubStartDate({ endDate: "2026-06-07", startDate: "2026-05-25", gross: "", net: "" })).toBe("2026-05-25");
    expect(stubStartDate({ endDate: "2026-06-07", startDate: "", gross: "", net: "" })).toBe("2026-05-25");
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
