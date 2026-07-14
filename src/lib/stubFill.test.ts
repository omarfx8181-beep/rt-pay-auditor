/**
 * Stub → check auto-fill: the mapper is pure code (the model only reads),
 * so it gets the full treatment — Omar's real stub shape, the June
 * split-payment case, rollups in cents, and the fallthrough buckets.
 */
import { describe, expect, test } from "vitest";
import { parseStubLinesResponse, stubLinesToActual, type StubLines } from "./stubFill.ts";

/** Omar's real 6/22–7/05 stub, as the vision call would return it. */
const REAL_STUB: StubLines = {
  periodStart: "2026-06-22",
  periodEnd: "2026-07-05",
  earnings: [
    { label: "Regular Straight Time", amount: 4202.4 },
    { label: "Overtime", amount: 1354.71 },
    { label: "Double Time", amount: 1744.0 },
    { label: "Adder – Weekend Differential", amount: 61.4 },
    { label: "Shift – Evening", amount: 36.9 },
    { label: "Adder – Charge Pay (308)", amount: 156.0 },
    { label: "Adder – Premium Pay (320)", amount: 108.0 },
    { label: "Critical Shift Bonus (548)", amount: 1200.0 },
    { label: "Imputed – Basic Term Life", amount: 1.81 },
  ],
  taxes: [
    { label: "Federal W/H", amount: 1120.64 },
    { label: "Minnesota W/H", amount: 492.55 },
    { label: "Social Security", amount: 523.72 },
    { label: "Medicare", amount: 122.49 },
    { label: "MN Paid Family Leave EE", amount: 11.96 },
    { label: "MN Paid Medical Leave EE", amount: 27.04 },
  ],
  pretax: [
    { label: "403(b)", amount: 265.9 },
    { label: "Medical", amount: 276.61 },
    { label: "Dental", amount: 64.55 },
    { label: "FSA", amount: 76.92 },
  ],
  aftertax: [
    { label: "Voluntary Accident", amount: 6.12 },
    { label: "Critical Illness", amount: 5.19 },
    { label: "Other After-Tax", amount: 87.73 },
  ],
  gross: 8865.22,
  net: 5781.99,
};

describe("stubLinesToActual — the real stub maps onto every check line", () => {
  const r = stubLinesToActual(REAL_STUB);

  test("every earnings line lands on its key", () => {
    expect(r.actual.reg).toBe("4202.40");
    expect(r.actual.ot).toBe("1354.71");
    expect(r.actual.dt).toBe("1744.00");
    expect(r.actual.weekend).toBe("61.40");
    expect(r.actual.evening).toBe("36.90");
    expect(r.actual.charge).toBe("156.00");
    expect(r.actual.premium).toBe("108.00");
    expect(r.actual.bonus548).toBe("1200.00");
  });

  test("taxes land, with family/medical leave never swallowed by plain MN", () => {
    expect(r.actual.fed).toBe("1120.64");
    expect(r.actual.mn).toBe("492.55");
    expect(r.actual.ss).toBe("523.72");
    expect(r.actual.medicare).toBe("122.49");
    expect(r.actual.mnFam).toBe("11.96");
    expect(r.actual.mnMed).toBe("27.04");
  });

  test("pretax and after-tax roll up whole-section, in cents", () => {
    expect(r.actual.pretax).toBe("683.98"); // 265.90+276.61+64.55+76.92
    expect(r.actual.aftertax).toBe("99.04"); // 6.12+5.19+87.73
  });

  test("gross/net pass through; imputed life is ignored, not unmatched", () => {
    expect(r.actual.gross).toBe("8865.22");
    expect(r.actual.net).toBe("5781.99");
    expect(r.unmatched).toHaveLength(0);
    expect(r.ignored).toEqual([{ label: "Imputed – Basic Term Life", amount: "1.81" }]);
    expect(r.periodEnd).toBe("2026-07-05");
  });

  test("critical-illness insurance stays after-tax — never mistaken for the 548 bonus", () => {
    expect(r.actual.bonus548).toBe("1200.00"); // not 1205.19
  });
});

describe("stubLinesToActual — the June failure mode and the fallthroughs", () => {
  test("split 548 payments on two rows SUM (2.5u + 7.5u = the short June stub)", () => {
    const june: StubLines = {
      ...REAL_STUB,
      earnings: [
        ...REAL_STUB.earnings.filter((e) => !e.label.includes("548")),
        { label: "Critical Shift Bonus (548)", amount: 125.0 },
        { label: "Critical Shift Bonus (548)", amount: 375.0 },
      ],
    };
    expect(stubLinesToActual(june).actual.bonus548).toBe("500.00");
  });

  test("unrecognized lines are surfaced, never silently dropped or guessed", () => {
    const weird: StubLines = {
      ...REAL_STUB,
      earnings: [...REAL_STUB.earnings, { label: "Mystery Adder (999)", amount: 42.0 }],
    };
    const r = stubLinesToActual(weird);
    expect(r.unmatched).toEqual([{ section: "earnings", label: "Mystery Adder (999)", amount: "42.00" }]);
    expect(Object.values(r.actual)).not.toContain("42.00");
  });

  test("ADP-style FICA labels: Fed OASDI/EE → Social Security, Fed MED/EE → Medicare", () => {
    const adp: StubLines = {
      ...REAL_STUB,
      taxes: [
        { label: "Fed OASDI/EE", amount: 523.72 },
        { label: "Fed MED/EE", amount: 122.49 },
        { label: "Federal Income Tax", amount: 1120.64 },
        { label: "MN State Income Tax", amount: 492.55 },
      ],
    };
    const r = stubLinesToActual(adp);
    expect(r.actual.ss).toBe("523.72");
    expect(r.actual.medicare).toBe("122.49");
    expect(r.actual.fed).toBe("1120.64");
    expect(r.actual.mn).toBe("492.55");
  });
});

describe("parseStubLinesResponse", () => {
  test("strips accidental fences and accepts string amounts", () => {
    const lines = parseStubLinesResponse(
      '```json\n{"periodStart":"","periodEnd":"2026-07-05","earnings":[{"label":"Regular","amount":"4,202.40"}],"taxes":[],"pretax":[],"aftertax":[],"gross":null,"net":"5781.99"}\n```',
    );
    expect(lines.earnings[0].amount).toBe(4202.4);
    expect(lines.net).toBe(5781.99);
    expect(lines.gross).toBeNull();
  });

  test("garbage in → a human error, not a crash", () => {
    expect(() => parseStubLinesResponse("sorry, I can't")).toThrow(/valid JSON/);
    expect(() =>
      parseStubLinesResponse('{"earnings":[],"taxes":[],"pretax":[],"aftertax":[],"gross":null,"net":null}'),
    ).toThrow(/No pay lines/);
  });
});
