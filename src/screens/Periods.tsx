import { useRef, useState } from "react";
import { Archive, ArchiveRestore, Download, Plus, Trash2, Upload } from "lucide-react";
import { computePeriod, computeNet } from "../lib/engine.ts";
import { draftToConfig, draftToShift } from "../lib/draft.ts";
import { periodLabel, rollupYtd, type PayPeriod } from "../lib/periods.ts";
import { fmtCents, fmtNum } from "../lib/format.ts";
import { Card, Eyebrow } from "../ui/kit.tsx";

export default function Periods({
  periods,
  currentId,
  onSelect,
  onCreateNext,
  onSetDates,
  onToggleArchived,
  onDelete,
  onExport,
  onImportFile,
  importStatus,
}: {
  periods: PayPeriod[];
  currentId: string;
  onSelect: (id: string) => void;
  onCreateNext: () => void;
  onSetDates: (id: string, startDate: string) => void;
  onToggleArchived: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  importStatus: string;
}) {
  const current = periods.find((p) => p.id === currentId);
  const year = (current ?? periods[0])?.endDate.slice(0, 4) ?? String(new Date().getFullYear());
  const ytd = rollupYtd(periods, year);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-sm text-ink-dim">Each period keeps its own rules and stub.</p>
          <button onClick={onCreateNext} className="btn btn-primary pressable shrink-0">
            <Plus size={15} /> New period
          </button>
        </div>

        {periods.map((p) => {
          const cfg = draftToConfig(p.cfgDraft);
          const result = computePeriod(p.shifts.map(draftToShift), cfg);
          const net = computeNet(result.grossCents, cfg);
          const active = p.id === currentId;
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
                  gross {fmtCents(result.grossCents)} · net {fmtCents(net.netCents)} · {fmtNum(result.units548)}u 548
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
        <Card title={`Year to date — ${year}`}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            <div>
              <Eyebrow>Gross</Eyebrow>
              <div className="mt-1 font-display text-xl font-semibold tabular-nums">{fmtCents(ytd.grossCents)}</div>
            </div>
            <div>
              <Eyebrow>Net</Eyebrow>
              <div className="mt-1 font-display text-xl font-semibold tabular-nums text-pos">{fmtCents(ytd.netCents)}</div>
            </div>
            <div>
              <Eyebrow>548 units</Eyebrow>
              <div className="mt-1 font-display text-xl font-semibold tabular-nums">{fmtNum(ytd.units548)}</div>
            </div>
            <div>
              <Eyebrow>Overtime</Eyebrow>
              <div className="mt-1 font-display text-xl font-semibold tabular-nums text-amber">{fmtNum(ytd.otHours)} h</div>
            </div>
            <div>
              <Eyebrow>Double time</Eyebrow>
              <div className="mt-1 font-display text-xl font-semibold tabular-nums text-neg">{fmtNum(ytd.dtHours)} h</div>
            </div>
            <div>
              <Eyebrow>Periods</Eyebrow>
              <div className="mt-1 font-display text-xl font-semibold tabular-nums">{ytd.periodCount}</div>
            </div>
          </div>
          <p className="mt-3 font-mono text-[11px] text-ink-dim">
            Computed from each period's own saved rules — editing today's rates never rewrites history.
          </p>
        </Card>

        <Card title="Backup — yours, on your device">
          <p className="text-sm">
            Everything lives in this browser. Export a JSON backup to iCloud Drive (or anywhere); import merges by
            period — the newer copy of each period wins, nothing is deleted.
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
