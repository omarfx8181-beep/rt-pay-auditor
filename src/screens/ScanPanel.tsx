import { useState, type ClipboardEvent } from "react";
import { Loader2, ScanLine, X } from "lucide-react";
import { isWeekend, type EngineConfig } from "../lib/engine.ts";
import type { ShiftDraft } from "../lib/draft.ts";
import { buildScanRows, parseScheduleImages, scanRowsToDrafts, type ScanRow } from "../lib/scan.ts";
import { dayLabel, fmtNum } from "../lib/format.ts";
import { CalloutCard, Eyebrow } from "../ui/kit.tsx";

type ScanState =
  | { status: "idle" }
  | { status: "working"; msg: string }
  | { status: "error"; msg: string }
  | { status: "preview"; rows: ScanRow[] };

export default function ScanPanel({
  apiKey,
  cfg,
  onApply,
}: {
  apiKey: string;
  cfg: EngineConfig;
  onApply: (mode: "replace" | "append", drafts: ShiftDraft[]) => void;
}) {
  const [scan, setScan] = useState<ScanState>({ status: "idle" });

  const handleFiles = async (fileList: Iterable<File>) => {
    const files = Array.from(fileList).filter((f) => f.type?.startsWith("image/"));
    if (!files.length) return;
    setScan({ status: "working", msg: `Reading ${files.length} screenshot${files.length > 1 ? "s" : ""}…` });
    try {
      const raw = await parseScheduleImages(files, apiKey);
      const rows = buildScanRows(raw, cfg);
      if (!rows.length) throw new Error("No shifts detected — try a tighter screenshot of just your row.");
      setScan({ status: "preview", rows });
    } catch (err) {
      setScan({ status: "error", msg: String(err instanceof Error ? err.message : err) });
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) void handleFiles(files);
  };

  const apply = (mode: "replace" | "append", rows: ScanRow[]) => {
    onApply(mode, scanRowsToDrafts(rows));
    setScan({ status: "idle" });
  };

  return (
    <CalloutCard tone="accent" className="focus:outline-none" >
      <div tabIndex={0} onPaste={onPaste}>
        <div className="flex flex-wrap items-center gap-3">
          <Eyebrow accent className="flex items-center gap-1.5">
            <ScanLine size={13} /> Scan schedule
          </Eyebrow>
          {apiKey ? (
            <>
              <label className="btn btn-ghost pressable cursor-pointer text-xs">
                Upload ScheduleAnywhere screenshot(s)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="font-mono text-[11px] text-ink-dim">
                or click this panel and paste · pre-fills dates + scheduled hours ({cfg.mealDeductHours} hr meal off
                shifts &gt; {cfg.mealThresholdHours} hrs)
              </span>
            </>
          ) : (
            <span className="font-mono text-[11px] text-ink-dim">
              Add your Anthropic API key under Rules → Schedule scan first. It stays on this device — the screenshots
              go straight from your browser to the API with your key.
            </span>
          )}
        </div>

        {scan.status === "working" && (
          <div className="mt-3 flex items-center gap-2 font-mono text-sm text-accent">
            <Loader2 size={15} className="animate-spin" /> {scan.msg}
          </div>
        )}

        {scan.status === "error" && (
          <div className="mt-3 text-sm text-neg">
            {scan.msg}{" "}
            <button onClick={() => setScan({ status: "idle" })} className="ml-2 text-ink-dim underline">
              dismiss
            </button>
          </div>
        )}

        {scan.status === "preview" && (
          <div className="mt-3 space-y-3">
            <div className="divide-y divide-accent/20 font-mono text-xs">
              {scan.rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-20 shrink-0 font-sans">{dayLabel(r.date)}</span>
                  <span className="w-28 shrink-0 text-ink-dim">{r.start ? `${r.start}–${r.end}` : "(no times)"}</span>
                  <span className="w-14 shrink-0 tabular-nums">{r.hours != null ? fmtNum(r.hours) + " h" : "—"}</span>
                  <span className="min-w-0 flex-1 truncate font-sans text-ink-dim">
                    {r.label}
                    {r.date && isWeekend(r.date) ? " · wknd" : ""}
                  </span>
                  <button
                    onClick={() =>
                      setScan((s) =>
                        s.status === "preview" ? { ...s, rows: s.rows.filter((x) => x.id !== r.id) } : s,
                      )
                    }
                    className="pressable text-ink-dim hover:text-neg"
                    aria-label="Remove row"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => apply("replace", scan.rows)} className="btn btn-primary pressable text-xs">
                Replace shifts ({scan.rows.length})
              </button>
              <button onClick={() => apply("append", scan.rows)} className="btn btn-ghost pressable text-xs">
                Add to existing
              </button>
              <button onClick={() => setScan({ status: "idle" })} className="pressable px-2 font-mono text-xs text-ink-dim">
                Discard
              </button>
            </div>
            <p className="font-mono text-[11px] text-ink-dim">
              These are scheduled hours — after each shift, adjust paid hrs to your actual punches and add 548 units.
            </p>
          </div>
        )}
      </div>
    </CalloutCard>
  );
}
