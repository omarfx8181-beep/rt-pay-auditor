/**
 * Proof packet — a frozen, printable record of one paycheck check
 * (brief §6's proof-packet idea). Everything a dispute needs on one
 * page: the verdict, expected vs stub line by line with the stub's own
 * codes, the shifts behind the numbers, and a timestamp. Renders as a
 * document (always light, ink on white) and prints alone — iOS: Print →
 * share → Save to Files gives a PDF.
 */
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { auditLine, dollarsToCents, type EngineConfig, type Shift } from "../lib/engine.ts";
import { num } from "../lib/draft.ts";
import type { AuditRow } from "../lib/audit.ts";
import type { Verdict } from "../lib/verdict.ts";
import type { EmailIdentity } from "../lib/hrEmail.ts";
import { periodLabel } from "../lib/periods.ts";
import { dayLabel, fmtCents, fmtNum, fmtUnits } from "../lib/format.ts";

function verdictSentence(v: Verdict): string {
  if (v.kind === "green") return `CHECK IS RIGHT — paid in full, ${fmtCents(v.paidNetCents)} net.`;
  if (v.kind === "red")
    return `UNDERPAID ${fmtCents(v.owedCents)} — ${v.shortfalls
      .map((s) => `${s.techLabel} short ${fmtCents(Math.abs(s.deltaCents))}${s.deltaUnits !== null ? ` (${fmtUnits(Math.abs(s.deltaUnits))} units)` : ""}`)
      .join("; ")}.`;
  if (v.kind === "amber") return `NEEDS A LOOK — ${v.question}`;
  return "Check in progress — not all stub lines entered yet.";
}

export default function ProofPacket({
  rows,
  actual,
  verdict,
  cfg,
  shifts,
  periodStart,
  periodEnd,
  identity,
  onClose,
}: {
  rows: AuditRow[];
  actual: Record<string, string>;
  verdict: Verdict;
  cfg: EngineConfig;
  shifts: Shift[];
  periodStart: string;
  periodEnd: string;
  identity: EmailIdentity;
  onClose: () => void;
}) {
  const entered = rows
    .map((row) => {
      const raw = actual[row.key] ?? "";
      if (raw === "") return null;
      const paidCents = dollarsToCents(num(raw));
      const d = auditLine(row.expectedCents, paidCents, { isUnits: row.isUnits, unit548Cents: cfg.unit548Cents });
      return { row, paidCents, d };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const cell = "border border-[#D8CDB8] px-2 py-1 text-left align-top";
  const cellNum = cell + " text-right tabular-nums";

  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-white text-[#14110F] print:static print:overflow-visible">
      <div className="mx-auto max-w-2xl p-6 text-[13px] leading-relaxed">
        <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
          <button onClick={() => window.print()} className="btn btn-primary pressable">
            <Printer size={16} /> Print / Save as PDF
          </button>
          <button onClick={onClose} className="pressable grid size-11 place-items-center rounded-full text-[#685F52]" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <h1 className="text-[22px] font-bold leading-7">Paycheck check record</h1>
        <p className="mt-1 text-[#685F52]">
          Pay period {periodLabel(periodStart, periodEnd)} · generated {generatedAt} · RT Pay
        </p>
        {(identity.name || identity.employeeId) && (
          <p className="text-[#685F52]">
            {identity.name || "—"}
            {identity.title ? `, ${identity.title}` : ""}
            {identity.department ? `, ${identity.department}` : ""}
            {identity.employeeId ? ` · Employee ID ${identity.employeeId}` : ""}
          </p>
        )}

        <p className="mt-4 rounded border border-[#D8CDB8] bg-[#F4EFE6] p-3 font-semibold">{verdictSentence(verdict)}</p>

        <h2 className="mt-5 text-[15px] font-semibold">Expected vs the stub</h2>
        <table className="mt-2 w-full border-collapse tabular-nums">
          <thead>
            <tr className="bg-[#F4EFE6]">
              <th className={cell}>Line (stub name)</th>
              <th className={cellNum}>Expected</th>
              <th className={cellNum}>On the stub</th>
              <th className={cellNum}>Off by</th>
            </tr>
          </thead>
          <tbody>
            {entered.map(({ row, paidCents, d }) => (
              <tr key={row.key} className={row.strong ? "font-semibold" : ""}>
                <td className={cell}>
                  {row.label}
                  {row.techLabel !== row.label ? <span className="text-[#685F52]"> ({row.techLabel})</span> : null}
                </td>
                <td className={cellNum}>{fmtCents(row.expectedCents)}</td>
                <td className={cellNum}>{fmtCents(paidCents)}</td>
                <td className={cellNum}>
                  {d.ok
                    ? "✓"
                    : `${d.deltaCents > 0 ? "+" : "−"}${fmtCents(Math.abs(d.deltaCents)).slice(1)}` +
                      (d.deltaUnits !== null ? ` (${fmtUnits(Math.abs(d.deltaUnits))}u)` : "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {shifts.length > 0 && (
          <>
            <h2 className="mt-5 text-[15px] font-semibold">The shifts behind the expected numbers</h2>
            <table className="mt-2 w-full border-collapse tabular-nums">
              <thead>
                <tr className="bg-[#F4EFE6]">
                  <th className={cell}>Date</th>
                  <th className={cellNum}>Paid hrs</th>
                  <th className={cellNum}>Charge</th>
                  <th className={cellNum}>Premium</th>
                  <th className={cellNum}>Precept</th>
                  <th className={cellNum}>Bonus units</th>
                  <th className={cell}>Note</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id}>
                    <td className={cell}>{s.date ? dayLabel(s.date) : "—"}</td>
                    <td className={cellNum}>{fmtNum(s.hours)}</td>
                    <td className={cellNum}>{s.chargeHours || "—"}</td>
                    <td className={cellNum}>{s.premiumHours || "—"}</td>
                    <td className={cellNum}>{s.preceptorHours || "—"}</td>
                    <td className={cellNum}>{s.units548 || "—"}</td>
                    <td className={cell}>{s.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p className="mt-5 text-[11px] text-[#685F52]">
          Expected values computed by RT Pay's engine (base ${(cfg.baseRateCents / 100).toFixed(2)}/hr · overtime past{" "}
          {cfg.otPeriodHours} hrs/period · double time past {cfg.dtDailyHours} hrs/day · bonus unit{" "}
          {fmtCents(cfg.unit548Cents)}), validated against the real 6/22–7/05 stub to within $0.02. Flag threshold:
          five cents per line. Data lives on the employee's device only.
        </p>
      </div>
    </div>,
    document.body,
  );
}
