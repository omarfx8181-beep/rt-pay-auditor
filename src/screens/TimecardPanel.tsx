/**
 * "True-up from the timecard" — after the period, snap Kronos and the
 * punches replace scheduled hours; the evening-credit total fills the
 * one box that still needed typing. Preview first, always.
 */
import { useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import type { ShiftDraft } from "../lib/draft.ts";
import { applyTimecard, scanTimecard, timecardCoverage, type TimecardApplyPlan, type TimecardRead } from "../lib/timecard.ts";
import { dayLabel, fmtNum } from "../lib/format.ts";
import { Disclosure } from "../ui/kit.tsx";

type State =
  | { status: "idle" }
  | { status: "working" }
  | { status: "error"; msg: string }
  | { status: "preview"; read: TimecardRead; plan: TimecardApplyPlan };

export default function TimecardPanel({
  apiKey,
  shifts,
  periodStart,
  periodEnd,
  onApply,
}: {
  apiKey: string;
  shifts: ShiftDraft[];
  periodStart: string;
  periodEnd: string;
  onApply: (shifts: ShiftDraft[], eveningHours: number | null) => void;
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  const handleFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    setState({ status: "working" });
    try {
      const read = await scanTimecard(files, apiKey);
      const cover = timecardCoverage(read.days, periodStart, periodEnd);
      if (cover.inside === 0) {
        throw new Error(
          `Those days aren't in this pay period (${dayLabel(periodStart)} – ${dayLabel(periodEnd)}). Open the right period first — Me → Stub details, or the picker on Home.`,
        );
      }
      const inWindow = read.days.filter((d) => d.date >= periodStart && d.date <= periodEnd);
      setState({ status: "preview", read: { ...read, days: inWindow }, plan: applyTimecard(shifts, inWindow) });
    } catch (err) {
      setState({ status: "error", msg: String(err instanceof Error ? err.message : err) });
    }
  };

  return (
    <Disclosure
      title="True-up from the timecard"
      icon={<ClipboardCheck size={13} className="text-accent" />}
      hint="After the period: snap Kronos, punches replace scheduled hours, evening credit fills itself."
    >
      {state.status !== "preview" && (
        <>
          {apiKey ? (
            <label className="btn btn-ghost pressable mt-1 cursor-pointer text-xs">
              <ClipboardCheck size={14} /> Scan the timecard
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
          ) : (
            <button
              onClick={() => setState({ status: "error", msg: "Needs your API key — add it in Me → Scans." })}
              className="btn btn-ghost pressable mt-1 text-xs"
            >
              <ClipboardCheck size={14} /> Scan the timecard
            </button>
          )}
        </>
      )}

      {state.status === "working" && (
        <div className="mt-3 flex items-center gap-2 text-sm text-accent">
          <Loader2 size={15} className="animate-spin" /> Reading the timecard…
        </div>
      )}
      {state.status === "error" && (
        <div className="mt-3 text-sm text-neg">
          {state.msg}{" "}
          <button onClick={() => setState({ status: "idle" })} className="ml-2 text-ink-dim underline">
            dismiss
          </button>
        </div>
      )}

      {state.status === "preview" && (
        <div className="space-y-3">
          <div className="divide-y divide-surface-line/60 text-xs tabular-nums">
            {state.plan.changed.map((c) => (
              <div key={c.date} className="flex items-baseline justify-between gap-3 py-1.5">
                <span>{dayLabel(c.date)}</span>
                <span>
                  {c.from || "—"} → <span className="font-semibold">{c.to} h</span>
                </span>
              </div>
            ))}
            {state.plan.added.map((d) => (
              <div key={d.date} className="flex items-baseline justify-between gap-3 py-1.5">
                <span>
                  {dayLabel(d.date)} <span className="text-accent">new — wasn't scheduled</span>
                </span>
                <span className="font-semibold">{fmtNum(d.hours)} h</span>
              </div>
            ))}
            {state.plan.unchanged > 0 && (
              <div className="py-1.5 text-ink-dim">
                {state.plan.unchanged} day{state.plan.unchanged === 1 ? "" : "s"} already match the punches ✓
              </div>
            )}
            {state.read.eveningHours !== null && (
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <span>Evening credit this period</span>
                <span className="font-semibold">{fmtNum(state.read.eveningHours)} h → fills itself</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                onApply(state.plan.shifts, state.read.eveningHours);
                setState({ status: "idle" });
              }}
              className="btn btn-primary pressable text-xs"
            >
              Apply the punches
              {state.plan.changed.length > 0 ? ` (${state.plan.changed.length} updated` : " ("}
              {state.plan.added.length > 0 ? `${state.plan.changed.length > 0 ? ", " : ""}${state.plan.added.length} added` : ""}
              {")"}
            </button>
            <button onClick={() => setState({ status: "idle" })} className="pressable px-2 text-xs text-ink-dim">
              Discard
            </button>
          </div>
          <p className="text-footnote text-ink-dim">
            Bonus units, charge, precepting, and notes stay exactly as you set them — only the hours change.
          </p>
        </div>
      )}
    </Disclosure>
  );
}
