/** Builds the Audit screen's row list from engine results — v1's auditRows. */
import type { Cents, NetResult, PeriodResult } from "./engine.ts";

export interface AuditRow {
  key: string;
  label: string;
  expectedCents: Cents;
  isUnits?: boolean;
  strong?: boolean;
}

export function buildAuditRows(period: PeriodResult, net: NetResult): AuditRow[] {
  return [
    ...period.lines
      .filter((l) => l.key !== "imputed")
      .map((l) => ({ key: l.key, label: l.label, expectedCents: l.amountCents, isUnits: l.isUnits })),
    { key: "gross", label: "Total gross", expectedCents: period.grossCents, strong: true },
    { key: "fed", label: "Federal W/H", expectedCents: net.fedCents },
    { key: "mn", label: "Minnesota W/H", expectedCents: net.mnCents },
    { key: "ss", label: "Social Security 6.2%", expectedCents: net.ssCents },
    { key: "medicare", label: "Medicare 1.45%", expectedCents: net.medicareCents },
    { key: "mnFam", label: "MN Paid Family Leave EE", expectedCents: net.mnFamCents },
    { key: "mnMed", label: "MN Paid Medical Leave EE", expectedCents: net.mnMedCents },
    { key: "pretax", label: "Pretax (403b + Sec 125)", expectedCents: net.pretaxCents },
    { key: "aftertax", label: "After-tax deductions", expectedCents: net.afterTaxCents },
    { key: "net", label: "Total net", expectedCents: net.netCents, strong: true },
  ];
}
