import { useRef, useState } from "react";
import { Archive, ArchiveRestore, Banknote, Download, FileScan, Loader2, Plus, ReceiptText, Trash2, Upload } from "lucide-react";
import { computePeriod, computeNet } from "../lib/engine.ts";
import { draftToConfig, draftToLeave, draftToShift, num, todayIso, uid } from "../lib/draft.ts";
import { periodLabel, prevPeriodRange, type OtherIncomeDraft, type PayPeriod, type YtdRollup } from "../lib/periods.ts";
import { planStubImports, scanStubFiles, stubStartDate, type ScannedStub } from "../lib/stubScan.ts";
import { fmtCents, dayLabel } from "../lib/format.ts";
import { Card, Disclosure, Eyebrow } from "../ui/kit.tsx";

/* ---- upload a year of stubs: files → preview → periods ---- */
function StubScanPanel({
  apiKey,
  periods,
  onLogPastStub,
}: {
  apiKey: string;
  periods: PayPeriod[];
  onLogPastStub: (endDate: string, gross: string, net: string, startDate?: string) => void;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "working" }
    | { status: "error"; msg: string }
    | { status: "preview"; toAdd: ScannedStub[]; duplicates: ScannedStub[] }
  >({ status: "idle" });

  const handleFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    setState({ status: "working" });
    try {
      const scanned = await scanStubFiles(files, apiKey);
      const plan = planStubImports(periods, scanned);
      if (plan.toAdd.length === 0 && plan.duplicates.length === 0) throw new Error("No stubs detected in those files.");
      setState({ status: "preview", ...plan });
    } catch (err) {
      setState({ status: "error", msg: String(err instanceof Error ? err.message : err) });
    }
  };

  if (!apiKey) {
    return (
      <p className="font-mono text-[11px] text-ink-dim">
        Uploading stubs needs your Anthropic API key (Rules → Schedule scan) — the files go straight from your browser
        to the API with your key.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <label className="btn btn-ghost pressable cursor-pointer text-xs">
        <FileScan size={14} /> Upload stub PDFs / screenshots
        <input
          type="file"
          accept="application/pdf,.pdf,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {state.status === "working" && (
        <div className="flex items-center gap-2 font-mono text-sm text-accent">
          <Loader2 size={15} className="animate-spin" /> Reading your stubs…
        </div>
      )}
      {state.status === "error" && (
        <div className="text-sm text-neg">
          {state.msg}{" "}
          <button onClick={() => setState({ status: "idle" })} className="ml-2 text-ink-dim underline">
            dismiss
          </button>
        </div>
      )}
      {state.status === "preview" && (
        <div className="space-y-2">
          <div className="divide-y divide-surface-line/60 font-mono text-xs tabular-nums">
            {state.toAdd.map((s) => (
              <div key={s.endDate} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="font-sans">ends {dayLabel(s.endDate)}</span>
                <span>
                  ${s.gross} · <span className="text-pos">${s.net}</span>
                </span>
              </div>
            ))}
            {state.duplicates.map((s) => (
              <div key={"d" + s.endDate} className="flex items-baseline justify-between gap-3 py-1.5 text-ink-dim/60">
                <span className="font-sans">ends {dayLabel(s.endDate)}</span>
                <span>already logged — skipped</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {state.toAdd.length > 0 && (
              <button
                onClick={() => {
                  for (const s of state.toAdd) onLogPastStub(s.endDate, s.gross, s.net, stubStartDate(s));
                  setState({ status: "idle" });
                }}
                className="btn btn-primary pressable text-xs"
              >
                Add {state.toAdd.length} period{state.toAdd.length > 1 ? "s" : ""}
              </button>
            )}
            <button onClick={() => setState({ status: "idle" })} className="pressable px-2 font-mono text-xs text-ink-dim">
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Periods({
  periods,
  currentId,
  ytd,
  otherIncome,
  apiKey,
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
  apiKey: string;
  onSelect: (id: string) => void;
  onCreateNext: () => void;
  onLogPastStub: (endDate: string, gross: string, net: string, startDate?: string) => void;
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

  // Manual past-stub entry walks backward from the earliest period.
  const earliest = periods.reduce((a, b) => (a.startDate < b.startDate ? a : b));
  const suggested = prevPeriodRange(earliest.startDate);
  const [stubEnd, setStubEnd] = useState(suggested.endDate);
  const [stubGross, setStubGross] = useState("");
  const [stubNet, setStubNet] = useState("");
  const stubEndTouched = useRef(false);
  const stubEndValue = stubEndTouched.current ? stubEnd : suggested.endDate;

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
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
          <p className="mt-3 font-mono text-[11px] text-ink-dim">
            Fairview {fmtCents(ytd.grossCents)} ({ytd.stubCount}/{ytd.periodCount} stub-true) · other{" "}
            {fmtCents(ytd.otherGrossCents)} · real stub numbers always outrank estimates.
          </p>
        </Card>

        <Disclosure
          title="Add your year — stubs in bulk"
          icon={<ReceiptText size={13} className="text-accent" />}
          hint="Upload a year of stub PDFs at once, or type them one per period."
        >
          <div className="space-y-4">
            <StubScanPanel apiKey={apiKey} periods={periods} onLogPastStub={onLogPastStub} />
            <div className="border-t border-surface-line/60 pt-3">
              <p className="font-mono text-[11px] text-ink-dim">
                Or by hand — the date steps back one period per entry:
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
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
                    stubEndTouched.current = false;
                    setStubGross("");
                    setStubNet("");
                  }}
                  className="btn btn-primary pressable text-xs"
                >
                  <Plus size={13} /> Log stub
                </button>
              </div>
            </div>
          </div>
        </Disclosure>

        <Disclosure
          title={`Other income — ${ytd.otherCount ? fmtCents(ytd.otherGrossCents) + " this year" : "none yet"}`}
          icon={<Banknote size={13} className="text-pos" />}
          hint="Money from anywhere else, so the year totals cover everything."
        >
          <p className="font-mono text-[11px] text-ink-dim">
            Leave net empty if nothing was withheld — take-home then equals gross.
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
        </Disclosure>

        <Disclosure
          title="Backup — yours, on your device"
          icon={<Download size={13} className="text-blue" />}
          hint="Export or merge-import everything as one JSON file."
        >
          <div className="flex flex-wrap gap-2">
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
        </Disclosure>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-sm text-ink-dim">Pay periods, newest first.</p>
          <button onClick={onCreateNext} className="btn btn-primary pressable shrink-0">
            <Plus size={15} /> New period
          </button>
        </div>

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
                  <span className="min-w-0 flex-1 truncate font-display text-lg font-semibold">
                    {periodLabel(p.startDate, p.endDate)}
                  </span>
                  {active && <span className="eyebrow shrink-0 text-accent">Current</span>}
                  {p.archived && !active && <span className="eyebrow shrink-0">Archived</span>}
                </div>
                <div className="mt-1 font-mono text-xs tabular-nums text-ink-dim">
                  {hasStub ? (
                    <>
                      take-home <span className="text-pos">${p.actual.net}</span> · stub ✓
                    </>
                  ) : (
                    <>take-home {fmtCents(net.netCents)} · expected</>
                  )}
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
