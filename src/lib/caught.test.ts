/** The trophy case: caught dollars, recoveries, and the clean streak — derived, never stored. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { ACTUAL_SEED, DEFAULT_CFG_DRAFT, DEMO_SHIFTS } from "./draft.ts";
import type { PayPeriod } from "./periods.ts";
import { caughtSummary, periodVerdict } from "./caught.ts";

let seq = 0;
const period = (endDate: string, over: Partial<PayPeriod> = {}): PayPeriod => ({
  id: `p${seq++}`,
  startDate: endDate.slice(0, 8) + "01",
  endDate,
  shifts: DEMO_SHIFTS,
  actual: ACTUAL_SEED,
  cfgDraft: DEFAULT_CFG_DRAFT,
  tiers: DEFAULT_TIERS,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const SHORTED = { ...ACTUAL_SEED, bonus548: "950.00" }; // the real June dispute: 5 units / $250 short
const CORRECTION = { id: "c1", payDate: "2026-06-24", gross: "250.00", net: "180.50", note: "548 fix", updatedAt: 1 };

describe("periodVerdict — offline rebuild", () => {
  test("the seeded period is green; shorting the bonus makes it red for exactly $250", () => {
    expect(periodVerdict(period("2026-07-05"), 100).kind).toBe("green");
    const red = periodVerdict(period("2026-07-05", { actual: SHORTED }), 100);
    expect(red.kind).toBe("red");
    if (red.kind === "red") expect(red.owedCents).toBe(25000);
  });
});

describe("caughtSummary", () => {
  test("caught, recovered, open, and the streak — across a mixed history", () => {
    const s = caughtSummary(
      [
        period("2026-06-07", { actual: SHORTED }), // oldest: red, still open
        period("2026-06-21", { actual: SHORTED, corrections: [CORRECTION] }), // corrected — made whole
        period("2026-07-05"), // newest: green
      ],
      100,
    );
    expect(s.caughtCents).toBe(50000); // two $250 catches
    expect(s.recoveredCents).toBe(25000); // one paid back
    expect(s.openCents).toBe(25000); // one still owed
    expect(s.caughtCount).toBe(2);
    expect(s.checkedCount).toBe(3);
    expect(s.cleanStreak).toBe(2); // green + made-whole; the open red breaks it
    expect(s.firstCaughtEnd).toBe("2026-06-07"); // watching since the first catch
  });

  test("record-only and unfinished periods neither count nor break the streak", () => {
    const s = caughtSummary(
      [
        period("2026-07-05"), // green
        period("2026-07-19", { shifts: [], actual: { gross: "100.00", net: "80.00" } }), // record-only
        period("2026-08-02", { actual: {} }), // shifts logged, check not started
      ],
      100,
    );
    expect(s.checkedCount).toBe(1);
    expect(s.cleanStreak).toBe(1);
    expect(s.caughtCents).toBe(0);
  });

  test("an amber (needs-a-look) check pauses the streak without counting as caught", () => {
    const s = caughtSummary(
      [
        period("2026-07-05"), // older green
        period("2026-07-19", { actual: { ...ACTUAL_SEED, fed: "1130.64" } }), // newest: tax drift → amber
      ],
      100,
    );
    expect(s.caughtCents).toBe(0);
    expect(s.cleanStreak).toBe(0);
  });
});
