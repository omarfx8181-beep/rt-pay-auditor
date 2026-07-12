import { useRef, useState } from "react";
import { Archive, ArchiveRestore, Banknote, Download, Plus, ReceiptText, Trash2, Upload } from "lucide-react";
import { computePeriod, computeNet } from "../lib/engine.ts";
import { draftToConfig, draftToLeave, draftToShift, num, todayIso, uid } from "../lib/draft.ts";
import { periodLabel, prevPeriodRange, type OtherIncomeDraft, type PayPeriod, type YtdRollup } from "../lib/periods.ts";
import { fmtCents, fmtNum } from "../lib/format.ts";
import { Card, Eyebrow } from "../ui/kit.tsx";

export default function Periods({
  periods,
  currentId,
  ytd,
  otherIncome,
  onSelect,
  onCreateNext,
  onLogPastStub,
  onSetDates,
  onToggleArchived,
  onDelete,
  onAddOther,
  onUpdateOther,
  onDeleteOther,
  onExport,
  onImportFile,
  importStatus,
}: {
  periods: PayPeriod[];
  currentId: string;
  ytd: YtdRollup;
  otherIncome: OtherIncomeDraft[];
  onSelect: (id: string) => void;
  onCreateNext: () => void;
  onLogPastStub: (endDate: string, gross: string, net: string) => void;
  onSetDates: (id: string, startDate: string) => void;
  onToggleArchived: (id: string) => void;
  onDelete: (id: string) => void;
  onAddOther: () => void;
  onUpdateOther: (id: string, patch: Partial<OtherIncomeDraft>) => void;
  onDeleteOther: (id: string) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  importStatus: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  // Past-stub entry walks backward from the earliest period, one stub at a time.
  const earliest = periods.reduce((a, b) => (a.startDate < b.startDate ? a : b));
  const suggested = prevPeriodRange(earliest.startDate);
  const [stubEnd, setStubEnd] = useState(suggested.endDate);
  const [stubGross, setStubGross] = useState("");
  const [stubNet, setStubNet] = useState("");
  const stubEndTouched = useRef(false);
  // follow the moving suggestion until the user picks a date themselves
  const stubEndValue = stubEndTouched.current ? stubEnd : suggested.endDate;

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-sm text-ink-dim">Each period keeps its own rules and stub.</p>
          <button onClick={onCreateNext} className="btn btn-primary pressable shrink-0">
            <Plus size={15} /> New period
          </button>
        </div>

        <Card>
          <div className="mb-1 flex items-center gap-1.5">
            <ReceiptText size={13} className="text-accent" />
            <span className="eyebrow">Log past stubs — build your year fast</span>
          </div>
          <p className="font-mono text-[11px] text-ink-dim">
            Type gross + net off each old stub. The date steps back one period at a time, so a year is ~26 quick
            entries. Open any of them later to audit line by line.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col">
              <span className="label">Period end</span>
              <input
                type="date"
                value={stubEndValue}
                onChange={(e) => {
                  stubEndTouched.current = true;
                  setStubEnd(e.target.value);
                }}
                className="input w-auto px-2 py-1.5 font-mono text-xs"
              />
            </label>
            <label className="flex flex-col">
              <span className="label">Gross $</span>
              <input
                value={stubGross}
                onChange={(e) => setStubGross(e.target.value)}
                inputMode="decimal"
                className="input w-24 px-2 py-1.5 text-right font-mono text-xs tabular-nums"
              />
            </label>
            <label className="flex flex-col">
              <span className="label">Net $</span>
              <input
                value={stubNet}
                onChange={(e) => setStubNet(e.target.value)}
                inputMode="decimal"
                className="input w-24 px-2 py-1.5 text-right font-mono text-xs tabular-nums"
              />
            </label>
            <button
              onClick={() => {
                if (stubEndValue === "" || (num(stubGross) === 0 && num(stubNet) === 0)) return;
                onLogPastStub(stubEndValue, stubGross, stubNet);
                stubEndTouched.current = false; // snap back to the moving suggestion
                setStubGross("");
                setStubNet("");
              }}
              className="btn btn-primary pressable text-xs"
            >
              <Plus size={13} /> Log stub
            </button>
          </div>
        </Card>

        {periods.map((p) => {
          const cfg = draftToConfig(p.cfgDraft);
          const result = computePeriod(p.shifts.map(draftToShift), cfg, (p.leave ?? []).map(draftToLeave));
          const net = computeNet(result.grossCents, cfg);
          const active = p.id === currentId;
          const hasStub = (p.actual?.net ?? "") !== "";
          return (
            <section
              key={p.id}
              className={`card p-4 ${active ? "border-accent" : ""} ${p.archived ? "opacity-70" : ""}`}
            >
              <button onClick={() => onSelect(p.id)} className="block w-full text-left">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-lg font-semibold">{periodLabel(p.startDate, p.endDate)}</span>
                  {active && <span className="eyebrow text-accent">Current</span>}
                  {p.archived && !active && <span className="eyebrow">Archived</span>}
                </div>
                <div className="mt-1 font-mono text-xs tabular-nums text-ink-dim">
                  {hasStub
                    ? `stub · gross $${p.actual.gross || "—"} · net $${p.actual.net}`
                    : `expected · gross ${fmtCents(result.grossCents)} · net ${fmtCents(net.netCents)} · ${fmtNum(result.units548)}u 548`}
                </div>
              </button>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-surface-line/60 pt-3">
                <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-ink-dim">
                  Starts
                  <input
                    type="date"
                    value={p.startDate}
                    onChange={(e) => e.target.value && onSetDates(p.id, e.target.value)}
                    className="input w-auto px-2 py-1 font-mono text-xs"
                  />
                </label>
                <button
                  onClick={() => onToggleArchived(p.id)}
                  className="pressable flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-ink-dim hover:text-ink"
                >
                  {p.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                  {p.archived ? "Unarchive" : "Archive"}
                </button>
                {confirmingDelete === p.id ? (
                  <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                    <button onClick={() => onDelete(p.id)} className="pressable font-semibold text-neg">
                      Really delete?
                    </button>
                    <button onClick={() => setConfirmingDelete(null)} className="pressable text-ink-dim hover:text-ink">
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmingDelete(p.id)}
                    disabled={periods.length === 1}
                    className="pressable flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-ink-dim hover:text-neg disabled:opacity-40"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="space-y-3">
        <Card title={`Year total — ${ytd.year}`}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <div>
              <Eyebrow>Total made</Eyebrow>
              <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{fmtCents(ytd.totalGrossCents)}</div>
            </div>
            <div>
              <Eyebrow>Take-home</Eyebrow>
              <div className="mt-1 font-display text-2xl font-semibold tabular-nums text-pos">{fmtCents(ytd.totalNetCents)}</div>
            </div>
          </div>
          <div className="mt-4 space-y-1.5 border-t border-surface-line/60 pt-3 font-mono text-xs tabular-nums">
            <div className="flex justify-between gap-3">
              <span className="text-ink-dim">Fairview ({ytd.stubCount}/{ytd.periodCount} periods stub-true)</span>
              <span>
                {fmtCents(ytd.grossCents)} · <span className="text-pos">{fmtCents(ytd.netCents)}</span>
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-dim">Other income ({ytd.otherCount})</span>
              <span>
                {fmtCents(ytd.otherGrossCents)} · <span className="text-pos">{fmtCents(ytd.otherNetCents)}</span>
              </span>
            </div>
            <div className="flex justify-between gap-3 pt-1 text-ink-dim">
              <span>548 {fmtNum(ytd.units548)}u · OT {fmtNum(ytd.otHours)}h · DT {fmtNum(ytd.dtHours)}h · leave {fmtNum(ytd.leaveHours)}h</span>
            </div>
          </div>
          <p className="mt-3 font-mono text-[11px] text-ink-dim">
            Stub numbers outrank estimates: once a period's real gross/net is entered, the year uses it.
          </p>
        </Card>

        <Card>
          <div className="mb-1 flex items-center gap-1.5">
            <Banknote size={13} className="text-pos" />
            <span className="eyebrow">Other income — every paycheck in one place</span>
          </div>
          <p className="font-mono text-[11px] text-ink-dim">
            Anything from outside Fairview. Leave net empty if nothing was withheld — take-home then equals gross.
          </p>
          {otherIncome.length > 0 && (
            <div className="mt-3 space-y-2">
              {otherIncome.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-2 border-t border-surface-line/60 pt-2">
                  <input
                    type="date"
                    value={o.date}
                    onChange={(e) => onUpdateOther(o.id, { date: e.target.value })}
                    className="input w-auto px-2 py-1 font-mono text-xs"
                  />
                  <input
                    value={o.source}
                    onChange={(e) => onUpdateOther(o.id, { source: e.target.value })}
                    placeholder="where from"
                    className="input min-w-24 flex-1 px-2 py-1 font-mono text-xs"
                  />
                  <input
                    value={o.gross}
                    onChange={(e) => onUpdateOther(o.id, { gross: e.target.value })}
                    inputMode="decimal"
                    placeholder="gross"
                    className="input w-20 px-2 py-1 text-right font-mono text-xs tabular-nums"
                  />
                  <input
                    value={o.net}
                    onChange={(e) => onUpdateOther(o.id, { net: e.target.value })}
                    inputMode="decimal"
                    placeholder="net"
                    className="input w-20 px-2 py-1 text-right font-mono text-xs tabular-nums"
                  />
                  <button
                    onClick={() => onDeleteOther(o.id)}
                    className="pressable p-1 text-ink-dim hover:text-neg"
                    aria-label="Remove income"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={onAddOther} className="btn btn-ghost pressable mt-3 text-xs">
            <Plus size={13} /> Add income
          </button>
        </Card>

        <Card title="Backup — yours, on your device">
          <p className="text-sm">
            Everything lives in this browser — periods and other income both. Export a JSON backup to iCloud Drive;
            import merges by entry, newer wins, nothing is deleted.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={onExport} className="btn btn-primary pressable">
              <Download size={15} /> Export JSON
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn btn-ghost pressable">
              <Upload size={15} /> Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {importStatus && <p className="mt-2 font-mono text-[11px] text-ink-dim">{importStatus}</p>}
        </Card>
      </div>
    </div>
  );
}

export const newOtherIncome = (): OtherIncomeDraft => ({
  id: uid(),
  date: todayIso(),
  source: "",
  gross: "",
  net: "",
  updatedAt: Date.now(),
});
