import { AlertTriangle } from "lucide-react";
import { auditLine, dollarsToCents, type EngineConfig, type Shift } from "../lib/engine.ts";
import { num } from "../lib/draft.ts";
import { fmtCents, fmtNum, fmtSignedCents } from "../lib/format.ts";
import { CalloutCard, Card } from "../ui/kit.tsx";
import type { AuditRow } from "../lib/audit.ts";
import type { EmailIdentity } from "../lib/hrEmail.ts";
import HrEmailPanel from "./HrEmailPanel.tsx";

export default function Audit({
  rows,
  actual,
  setActual,
  cfg,
  shifts,
  periodStart,
  periodEnd,
  identity,
  onSaveIdentity,
}: {
  rows: AuditRow[];
  actual: Record<string, string>;
  setActual: (updater: (a: Record<string, string>) => Record<string, string>) => void;
  cfg: EngineConfig;
  shifts: Shift[];
  periodStart: string;
  periodEnd: string;
  identity: EmailIdentity;
  onSaveIdentity: (identity: EmailIdentity) => void;
}) {
  const judged = rows.map((row) => {
    const raw = actual[row.key] ?? "";
    const delta =
      raw === ""
        ? null
        : auditLine(row.expectedCents, dollarsToCents(num(raw)), {
            isUnits: row.isUnits,
            unit548Cents: cfg.unit548Cents,
          });
    return { row, raw, delta };
  });
  const shortRows = judged.filter((j) => j.delta !== null && !j.delta.ok);

  return (
    <div className="space-y-3">
      <p className="font-mono text-sm text-ink-dim">
        Type each line from the real stub into Actual. Anything more than five cents off turns red — in dollars and 548
        units.
      </p>

      <Card>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 sm:gap-x-3">
          <div className="label mb-0 py-1">Line</div>
          <div className="label mb-0 w-24 py-1 text-right sm:w-28">Actual (stub)</div>
          <div className="label mb-0 w-20 py-1 text-right sm:w-24">Δ</div>

          {judged.map(({ row, raw, delta }) => (
            <div key={row.key} className="col-span-3 grid grid-cols-subgrid items-center border-t border-surface-line/60 py-1.5">
              <div className={`min-w-0 py-0.5 pr-1 ${row.strong ? "font-display text-[15px] font-semibold" : "text-sm"}`}>
                <div className="leading-tight">{row.label}</div>
                <div className="font-mono text-[11px] tabular-nums text-ink-dim">expected {fmtCents(row.expectedCents)}</div>
              </div>
              <input
                value={raw}
                onChange={(e) => setActual((a) => ({ ...a, [row.key]: e.target.value }))}
                inputMode="decimal"
                className="input w-24 px-2 py-1.5 text-right font-mono text-xs tabular-nums sm:w-28"
              />
              <div
                className={`w-20 text-right font-mono text-xs tabular-nums sm:w-24 ${
                  delta === null ? "text-ink-dim/60" : delta.ok ? "text-pos" : "text-neg"
                }`}
              >
                {delta === null
                  ? "—"
                  : delta.ok
                    ? "✓"
                    : fmtSignedCents(delta.deltaCents) + (delta.deltaUnits !== null ? ` (${fmtNum(delta.deltaUnits)}u)` : "")}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {shortRows.length > 0 && (
        <CalloutCard tone="neg">
          <div className="mb-2 flex items-center gap-1.5 font-display text-base font-semibold text-neg">
            <AlertTriangle size={15} /> Discrepancy found
          </div>
          <div className="space-y-1.5 text-sm">
            {shortRows.map(({ row, raw, delta }) => {
              const d = delta!;
              const short = d.deltaCents < 0;
              return (
                <div key={row.key}>
                  {row.label}: paid {fmtCents(dollarsToCents(num(raw)))}, expected {fmtCents(row.expectedCents)} →{" "}
                  <span className="font-mono font-semibold tabular-nums text-neg">
                    {short ? "Short" : "Over"} {fmtCents(Math.abs(d.deltaCents))}
                    {d.deltaUnits !== null ? ` (${fmtNum(Math.abs(d.deltaUnits))} units of 548)` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </CalloutCard>
      )}

      {shortRows.length > 0 && (
        <HrEmailPanel
          discrepancies={shortRows.map(({ row, raw, delta }) => ({
            key: row.key,
            label: row.label,
            expectedCents: row.expectedCents,
            paidCents: dollarsToCents(num(raw)),
            deltaCents: delta!.deltaCents,
            deltaUnits: delta!.deltaUnits,
          }))}
          shifts={shifts}
          periodStart={periodStart}
          periodEnd={periodEnd}
          unit548Cents={cfg.unit548Cents}
          initialIdentity={identity}
          onSaveIdentity={onSaveIdentity}
        />
      )}
    </div>
  );
}
