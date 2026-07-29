/** The payday ritual: which checks are WAITING to be audited. */
import { describe, expect, test } from "vitest";
import { DEFAULT_TIERS } from "./engine.ts";
import { ACTUAL_SEED, DEFAULT_CFG_DRAFT, DEMO_SHIFTS } from "./draft.ts";
import type { PayPeriod } from "./periods.ts";
import { checksWaiting } from "./attention.ts";

let seq = 0;
const period = (endDate: string, over: Partial<PayPeriod> = {}): PayPeriod => ({
  id: `p${seq++}`,
  startDate: endDate.slice(0, 8) + "01",
  endDate,
  shifts: DEMO_SHIFTS,
  actual: {},
  cfgDraft: DEFAULT_CFG_DRAFT,
  tiers: DEFAULT_TIERS,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe("checksWaiting", () => {
  // payday = end + 5 days: 7/05 → paid 7/10, 7/19 → paid 7/24
  test("paydays passed with unfinished checks wait, oldest first; audited ones don't", () => {
    const waiting = checksWaiting(
      [
        period("2026-07-19"), // payday 7/24, unaudited → waiting
        period("2026-07-05", { actual: ACTUAL_SEED }), // audited green → done
        period("2026-06-21"), // payday 6/26, unaudited → waiting (older first)
      ],
      5,
      "2026-07-27",
      100,
    );
    expect(waiting.map((w) => w.endDate)).toEqual(["2026-06-21", "2026-07-19"]);
    expect(waiting[0].payday).toBe("2026-06-26");
  });

  test("a payday still coming, record-only history, and archived periods never wait", () => {
    const waiting = checksWaiting(
      [
        period("2026-08-02"), // payday 8/07 — future
        period("2026-07-19", { shifts: [], actual: { gross: "1", net: "1" } }), // record-only
        period("2026-07-05", { archived: true }), // archived
      ],
      5,
      "2026-07-27",
      100,
    );
    expect(waiting).toEqual([]);
  });
});
