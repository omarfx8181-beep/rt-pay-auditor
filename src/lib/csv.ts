/**
 * Tax-time export: one spreadsheet of the year — every pay period with
 * gross, take-home, and the deduction buckets where the period is
 * itemized, plus other income and a totals row that matches the Year
 * card exactly (same rollup, same house rule: stub beats estimate).
 * Plain CSV, dollars with two decimals, no $ signs — opens anywhere.
 */
import { periodLabel, periodMoney, rollupYtd, type OtherIncomeDraft, type PayPeriod } from "./periods.ts";
import type { Cents } from "./engine.ts";

const money = (cents: Cents): string => (cents / 100).toFixed(2);
const moneyOr = (cents: Cents | undefined): string => (cents === undefined ? "" : money(cents));

/** RFC-4180 quoting — only when the value needs it. */
const cell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

const row = (cells: string[]): string => cells.map(cell).join(",");

export const yearCsvName = (year: string): string => `rt-pay-${year}.csv`;

export function buildYearCsv(periods: PayPeriod[], year: string, otherIncome: OtherIncomeDraft[] = []): string {
  const inYear = periods
    .filter((p) => p.endDate.slice(0, 4) === year)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const others = otherIncome
    .filter((o) => o.date.slice(0, 4) === year)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const rollup = rollupYtd(periods, year, otherIncome);

  const lines: string[] = [
    row([
      "Pay period",
      "Start",
      "End",
      "Source",
      "Gross",
      "Take-home",
      "Taxes withheld",
      "Retirement + insurance (pretax)",
      "After-tax deductions",
      "Life insurance (non-cash)",
    ]),
  ];

  for (const p of inYear) {
    const m = periodMoney(p);
    lines.push(
      row([
        periodLabel(p.startDate, p.endDate),
        p.startDate,
        p.endDate,
        m.stubTrue ? "stub" : "estimate",
        money(m.grossCents),
        money(m.netCents),
        moneyOr(m.buckets?.taxesCents),
        moneyOr(m.buckets?.pretaxCents),
        moneyOr(m.buckets?.aftertaxCents),
        moneyOr(m.buckets?.imputedCents),
      ]),
    );
  }

  for (const o of others) {
    const gross = money(Math.round((Number.parseFloat(o.gross.replace(/[$,]/g, "")) || 0) * 100));
    const netRaw = o.net.trim() === "" ? gross : money(Math.round((Number.parseFloat(o.net.replace(/[$,]/g, "")) || 0) * 100));
    lines.push(row([`Other income — ${o.source || "unnamed"}`, o.date, o.date, "as entered", gross, netRaw, "", "", "", ""]));
  }

  lines.push(
    row([
      `TOTAL ${year}`,
      "",
      "",
      `${rollup.stubCount}/${rollup.periodCount} periods stub-true`,
      money(rollup.totalGrossCents),
      money(rollup.totalNetCents),
      rollup.bucketPeriodCount > 0 ? money(rollup.taxesCents) : "",
      rollup.bucketPeriodCount > 0 ? money(rollup.pretaxCents) : "",
      rollup.bucketPeriodCount > 0 ? money(rollup.aftertaxCents) : "",
      rollup.bucketPeriodCount > 0 ? money(rollup.imputedCents) : "",
    ]),
  );
  if (rollup.bucketSkippedCount > 0) {
    lines.push(
      row([
        `Note: ${rollup.bucketSkippedCount} period(s) carry only totals — their deduction split isn't itemized, so bucket columns cover the itemized periods only.`,
      ]),
    );
  }

  return lines.join("\r\n") + "\r\n";
}
