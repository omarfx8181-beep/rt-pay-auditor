/**
 * "Snap the stub — we'll fill it in": photo/PDF → every check line
 * typed for you. The stub files itself into the period it belongs to
 * (created if the app has never seen it), and its YTD column anchors
 * the year totals. The model only reads; lib/stubFill.ts does the
 * matching and math, lib/scanRouting.ts picks the destination, and
 * nothing applies without the preview's say-so.
 */
import { useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { scanStubForFill, stubLinesToActual, type StubFillResult } from "../lib/stubFill.ts";
import { matchStubPeriod, type StubRoute } from "../lib/scanRouting.ts";
import { periodLabel, type PayPeriod, type YtdAnchor } from "../lib/periods.ts";
import { plainLabel } from "../lib/labels.ts";
import { CalloutCard, Eyebrow } from "../ui/kit.tsx";

type State =
  | { status: "idle" }
  | { status: "working" }
  | { status: "error"; msg: string }
  | { status: "preview"; result: StubFillResult };

export default function StubFillPanel({
  apiKey,
  periods,
  currentId,
  periodStart,
  periodEnd,
  onFillCurrent,
  onFillExisting,
  onCreateAndFill,
  onYtdAnchor,
}: {
  apiKey: string;
  periods: PayPeriod[];
  currentId: string;
  periodStart: string;
  periodEnd: string;
  onFillCurrent: (actual: Record<string, string>) => void;
  onFillExisting: (periodId: string, actual: Record<string, string>) => void;
  onCreateAndFill: (startDate: string, endDate: string, actual: Record<string, string>) => void;
  onYtdAnchor: (anchor: YtdAnchor) => void;
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  const handleFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    setState({ status: "working" });
    try {
      const lines = await scanStubForFill(files, apiKey);
      setState({ status: "preview", result: stubLinesToActual(lines) });
    } catch (err) {
      setState({ status: "error", msg: String(err instanceof Error ? err.message : err) });
    }
  };

  const apply = (result: StubFillResult, route: StubRoute) => {
    if (route.kind === "current") onFillCurrent(result.actual);
    else if (route.kind === "existing") onFillExisting(route.period.id, result.actual);
    else onCreateAndFill(route.startDate, route.endDate, result.actual);
    if (result.ytdGrossCents !== null) {
      const asOfEnd = result.periodEnd !== "" ? result.periodEnd : periodEnd;
      onYtdAnchor({
        year: asOfEnd.slice(0, 4),
        asOfEnd,
        grossCents: result.ytdGrossCents,
        netCents: result.ytdNetCents,
        capturedAt: Date.now(),
      });
    }
    setState({ status: "idle" });
  };

  return (
    <CalloutCard tone="accent">
      <Eyebrow accent className="mb-1 flex items-center gap-1.5">
        <Camera size={13} /> Skip the typing
      </Eyebrow>

      {state.status !== "preview" && (
        <>
          <p className="text-sm">
            Snap the stub — we'll read every line, file it into the right pay period, and note the year-to-date totals.
            The photo goes straight from your browser to the API with your key; nothing is stored anywhere.
          </p>
          {apiKey ? (
            <label className="btn btn-primary pressable mt-3 cursor-pointer">
              <Camera size={16} /> Scan the stub
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
              onClick={() =>
                setState({
                  status: "error",
                  msg: "One-time setup: add your Anthropic API key in Me → Scans, then this button reads stubs by itself.",
                })
              }
              className="btn btn-primary pressable mt-3"
            >
              <Camera size={16} /> Scan the stub
            </button>
          )}
        </>
      )}

      {state.status === "working" && (
        <div className="mt-3 flex items-center gap-2 text-sm text-accent">
          <Loader2 size={15} className="animate-spin" /> Reading your stub…
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

      {state.status === "preview" &&
        (() => {
          const { result } = state;
          const route = matchStubPeriod(periods, currentId, result.periodStart, result.periodEnd);
          const destLabel =
            route.kind === "existing"
              ? periodLabel(route.period.startDate, route.period.endDate)
              : route.kind === "create"
                ? periodLabel(route.startDate, route.endDate)
                : periodLabel(periodStart, periodEnd);
          return (
            <div className="space-y-3">
              <p className="text-sm">
                We read {result.matched.length} line{result.matched.length === 1 ? "" : "s"} — look right?
              </p>

              {route.kind === "existing" && (
                <p className="rounded-xl bg-accent/10 px-3 py-2 text-footnote">
                  This stub is <span className="font-semibold">{destLabel}</span> — it'll fill that period and open it.
                </p>
              )}
              {route.kind === "create" && (
                <p className="rounded-xl bg-accent/10 px-3 py-2 text-footnote">
                  This stub is <span className="font-semibold">{destLabel}</span> — new to the app. We'll start that
                  period and fill it.
                </p>
              )}

              <div className="divide-y divide-accent/20 text-xs tabular-nums">
                {result.matched.map((m, i) => (
                  <div key={m.key + i} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate">{plainLabel(m.key, m.label)}</span>
                    <span>${m.amount}</span>
                  </div>
                ))}
                {"gross" in result.actual && (
                  <div className="flex items-baseline justify-between gap-3 py-1.5 font-semibold">
                    <span>Total before taxes</span>
                    <span>${result.actual.gross}</span>
                  </div>
                )}
                {"net" in result.actual && (
                  <div className="flex items-baseline justify-between gap-3 py-1.5 font-semibold">
                    <span>Take-home</span>
                    <span>${result.actual.net}</span>
                  </div>
                )}
                {result.ytdGrossCents !== null && (
                  <div className="flex items-baseline justify-between gap-3 py-1.5 text-ink-dim">
                    <span>Year to date so far (anchors your year totals)</span>
                    <span>${(result.ytdGrossCents / 100).toFixed(2)}</span>
                  </div>
                )}
                {result.unmatched.map((u, i) => (
                  <div key={"u" + i} className="flex items-baseline justify-between gap-3 py-1.5 text-ink-dim/70">
                    <span className="min-w-0 flex-1 truncate">{u.label} — didn't recognize, left out</span>
                    <span>${u.amount}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => apply(result, route)} className="btn btn-primary pressable text-xs">
                  {route.kind === "current"
                    ? `Fill the check (${Object.keys(result.actual).length} lines)`
                    : route.kind === "existing"
                      ? `Fill ${destLabel}`
                      : `Start ${destLabel} and fill it`}
                </button>
                <button onClick={() => setState({ status: "idle" })} className="pressable px-2 text-xs text-ink-dim">
                  Discard
                </button>
              </div>
              <p className="text-footnote text-ink-dim">
                Filling replaces just these lines — anything else you typed stays. Every number is still checked by the
                engine, not the photo.
              </p>
            </div>
          );
        })()}
    </CalloutCard>
  );
}
