/**
 * Discrepancy → HR email, in the format that won the June dispute:
 * a per-line expected/paid/Δ table, the per-shift 548 breakdown, and the
 * "identical shifts pay identically" comparison. Pure function — the
 * Audit screen feeds it and copies the result to the clipboard.
 */
import { formatCents, type Cents, type Shift } from "./engine.ts";
import { periodLabel } from "./periods.ts";
import { dayLabel } from "./format.ts";

export interface EmailIdentity {
  name: string;
  employeeId: string;
  title: string;
  department: string;
}

export const EMPTY_IDENTITY: EmailIdentity = { name: "", employeeId: "", title: "", department: "" };

export interface EmailDiscrepancy {
  key: string;
  label: string;
  expectedCents: Cents;
  paidCents: Cents;
  /** paid − expected; negative = short. */
  deltaCents: Cents;
  /** For unit-based lines (548). */
  deltaUnits: number | null;
}

export interface HrEmail {
  subject: string;
  body: string;
}

/** "5.0", "2.5", "0.25" — at least one decimal so units read as quantities. */
const fmtUnits = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

const or = (s: string, fallback: string) => (s.trim() === "" ? fallback : s.trim());

/** Shifts grouped by identical positive 548 claims, groups of 2+ only. */
export function identicalShiftGroups(shifts: Shift[]): Array<{ units: number; shifts: Shift[] }> {
  const byUnits = new Map<number, Shift[]>();
  for (const s of shifts) {
    if (s.units548 > 0) byUnits.set(s.units548, [...(byUnits.get(s.units548) ?? []), s]);
  }
  return [...byUnits.entries()]
    .filter(([, group]) => group.length >= 2)
    .map(([units, group]) => ({ units, shifts: [...group].sort((a, b) => (a.date < b.date ? -1 : 1)) }))
    .sort((a, b) => b.units - a.units);
}

export function buildHrEmail(args: {
  periodStart: string;
  periodEnd: string;
  identity: EmailIdentity;
  discrepancies: EmailDiscrepancy[];
  shifts: Shift[];
  unit548Cents: Cents;
}): HrEmail | null {
  const shortLines = args.discrepancies.filter((d) => d.deltaCents < 0);
  if (shortLines.length === 0) return null;

  const label = periodLabel(args.periodStart, args.periodEnd);
  const totalShortCents = shortLines.reduce((sum, d) => sum + -d.deltaCents, 0);
  const bonusShort = shortLines.find((d) => d.key === "bonus548");
  const unitsPart =
    bonusShort?.deltaUnits != null ? ` (${fmtUnits(Math.abs(bonusShort.deltaUnits))} units of code 548)` : "";

  const subject = `Pay correction request — ${label} — short ${formatCents(totalShortCents)}${unitsPart}`;

  const name = or(args.identity.name, "[your name]");
  const employeeId = or(args.identity.employeeId, "[employee ID]");
  const title = or(args.identity.title, "RRT");
  const department = or(args.identity.department, "Respiratory Therapy");

  const deltaText = (d: EmailDiscrepancy) => {
    const short = d.deltaCents < 0;
    const dollars = formatCents(Math.abs(d.deltaCents));
    const units = d.deltaUnits != null ? ` (${fmtUnits(Math.abs(d.deltaUnits))} units)` : "";
    return `${short ? "short" : "over"} ${dollars}${units}`;
  };

  const lineTable = [
    "  " + "LINE".padEnd(30) + "EXPECTED".padStart(11) + "PAID".padStart(11) + "  Δ",
    ...args.discrepancies.map(
      (d) =>
        "  " +
        d.label.slice(0, 28).padEnd(30) +
        formatCents(d.expectedCents).padStart(11) +
        formatCents(d.paidCents).padStart(11) +
        "  " +
        deltaText(d),
    ),
  ].join("\n");

  const sections: string[] = [];
  sections.push("Hi Payroll,");
  sections.push(
    `I'm ${name}, ${title}, ${department} (Employee ID ${employeeId}). My paycheck for the period ${label} does not match my timecard. Line by line:`,
  );
  sections.push(lineTable);

  if (bonusShort) {
    const claimed = args.shifts.filter((s) => s.units548 > 0);
    if (claimed.length > 0) {
      const totalUnits = claimed.reduce((a, s) => a + s.units548, 0);
      const shiftTable = [
        "  " + "DATE".padEnd(12) + "SHIFT".padEnd(22) + "UNITS".padStart(7) + "VALUE".padStart(12),
        ...claimed.map(
          (s) =>
            "  " +
            (s.date ? dayLabel(s.date) : "(no date)").padEnd(12) +
            or(s.note ?? "", "—").slice(0, 20).padEnd(22) +
            fmtUnits(s.units548).padStart(7) +
            formatCents(Math.round(s.units548 * args.unit548Cents)).padStart(12),
        ),
        "  " +
          "TOTAL CLAIMED".padEnd(34) +
          fmtUnits(totalUnits).padStart(7) +
          formatCents(Math.round(totalUnits * args.unit548Cents)).padStart(12),
      ].join("\n");
      sections.push(`Critical Shift Bonus (548) — the shifts behind the expected number:\n\n${shiftTable}`);
    }

    const groups = identicalShiftGroups(args.shifts);
    if (groups.length > 0) {
      const lines = groups.map(({ units, shifts }) => {
        const dates = shifts.map((s) => (s.date ? dayLabel(s.date) : "(no date)")).join(" and ");
        const notes = [...new Set(shifts.map((s) => or(s.note ?? "", "")).filter(Boolean))].join(" / ");
        return `the shifts on ${dates} each claim ${fmtUnits(units)} units${notes ? ` (${notes})` : ""}`;
      });
      sections.push(
        `Identical-shift check: ${lines.join("; ")}. Identical shifts pay identically — if one was paid in full, the other is owed the same.`,
      );
    }
  }

  sections.push(
    `Please review and issue an adjustment of ${formatCents(totalShortCents)}${unitsPart} on my next check, or let me know what payroll shows on your end.`,
  );
  sections.push(`Thank you,\n${name}\n${title} · ${department}\nEmployee ID ${employeeId}`);

  return { subject, body: sections.join("\n\n") };
}
