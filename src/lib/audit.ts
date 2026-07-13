/** Builds the check screen's row list from engine results — v1's auditRows. */
import type { Cents, NetResult, PeriodResult } from "./engine.ts";
import { plainLabel } from "./labels.ts";

export interface AuditRow {
  key: string;
  /** Plain-language label (default views). */
  label: string;
  /** The stub's technical label — receipts and the HR email. */
  techLabel: string;
  expectedCents: Cents;
  /**
   * earnings = money the hospital owes for work; total = arithmetic
   * rollups (gross/net); deduction = taxes and withholdings. The verdict
   * treats them differently: only earnings shortfalls mean "you're owed".
   */
  kind: "earnings" | "total" | "deduction";
  isUnits?: boolean;
  strong?: boolean;
}

export function buildAuditRows(period: PeriodResult, net: NetResult): AuditRow[] {
  const tax = (key: string, techLabel: string, expectedCents: Cents): AuditRow => ({
    key,
    label: plainLabel(key, techLabel),
    techLabel,
    expectedCents,
    kind: "deduction",
  });
  return [
    ...period.lines
      .filter((l) => l.key !== "imputed")
      .map(
        (l): AuditRow => ({
          key: l.key,
          label: plainLabel(l.key, l.label),
          techLabel: l.label,
          expectedCents: l.amountCents,
          kind: "earnings",
          isUnits: l.isUnits,
        }),
      ),
    { key: "gross", label: plainLabel("gross", "Total gross"), techLabel: "Total gross", expectedCents: period.grossCents, kind: "total", strong: true },
    tax("fed", "Federal W/H", net.fedCents),
    tax("mn", "Minnesota W/H", net.mnCents),
    tax("ss", "Social Security 6.2%", net.ssCents),
    tax("medicare", "Medicare 1.45%", net.medicareCents),
    tax("mnFam", "MN Paid Family Leave EE", net.mnFamCents),
    tax("mnMed", "MN Paid Medical Leave EE", net.mnMedCents),
    tax("pretax", "Pretax (403b + Sec 125)", net.pretaxCents),
    tax("aftertax", "After-tax deductions", net.afterTaxCents),
    { key: "net", label: plainLabel("net", "Total net"), techLabel: "Total net", expectedCents: net.netCents, kind: "total", strong: true },
  ];
}
