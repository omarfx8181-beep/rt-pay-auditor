/**
 * "Snap the stub — we'll fill it in": photo/PDF → every check line
 * typed for you (V3 follow-up to M5; the brief's core positioning).
 * The model only reads; the mapper in lib/stubFill.ts does the matching
 * and math, and nothing applies without the preview's say-so.
 */
import { useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { scanStubForFill, stubLinesToActual, type StubFillResult } from "../lib/stubFill.ts";
import { plainLabel } from "../lib/labels.ts";
import { dayLabel } from "../lib/format.ts";
import { CalloutCard, Eyebrow } from "../ui/kit.tsx";

type State =
  | { status: "idle" }
  | { status: "working" }
  | { status: "error"; msg: string }
  | { status: "preview"; result: StubFillResult };

export default function StubFillPanel({
  apiKey,
  periodStart,
  periodEnd,
  onFill,
}: {
  apiKey: string;
  periodStart: string;
  periodEnd: string;
  onFill: (actual: Record<string, string>) => void;
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

  if (!apiKey) {
    return (
      <p className="text-footnote text-ink-dim">
        Tip: add your Anthropic API key in Me → Schedule scan and this check can fill itself from a photo of the stub.
      </p>
    );
  }

  return (
    <CalloutCard tone="accent">
      <Eyebrow accent className="mb-1 flex items-center gap-1.5">
        <Camera size={13} /> Skip the typing
      </Eyebrow>

      {state.status !== "preview" && (
        <>
          <p className="text-sm">
            Snap the stub — we'll read every line and fill the check for you. The photo goes straight from your browser
            to the API with your key; nothing is stored anywhere.
          </p>
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

      {state.status === "preview" && (
        <div className="space-y-3">
          <p className="text-sm">
            We read {state.result.matched.length} line{state.result.matched.length === 1 ? "" : "s"} — look right?
          </p>

          {state.result.periodEnd !== "" && state.result.periodEnd !== periodEnd && (
            <p className="rounded-xl bg-amber/10 px-3 py-2 text-footnote text-amber">
              Heads up: this stub says {dayLabel(state.result.periodEnd)}, but you're checking{" "}
              {dayLabel(periodStart)} – {dayLabel(periodEnd)}. Switch periods on Home if it's the wrong one.
            </p>
          )}

          <div className="divide-y divide-accent/20 text-xs tabular-nums">
            {state.result.matched.map((m, i) => (
              <div key={m.key + i} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{plainLabel(m.key, m.label)}</span>
                <span>${m.amount}</span>
              </div>
            ))}
            {"gross" in state.result.actual && (
              <div className="flex items-baseline justify-between gap-3 py-1.5 font-semibold">
                <span>Total before taxes</span>
                <span>${state.result.actual.gross}</span>
              </div>
            )}
            {"net" in state.result.actual && (
              <div className="flex items-baseline justify-between gap-3 py-1.5 font-semibold">
                <span>Take-home</span>
                <span>${state.result.actual.net}</span>
              </div>
            )}
            {state.result.unmatched.map((u, i) => (
              <div key={"u" + i} className="flex items-baseline justify-between gap-3 py-1.5 text-ink-dim/70">
                <span className="min-w-0 flex-1 truncate">{u.label} — didn't recognize, left out</span>
                <span>${u.amount}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                onFill(state.result.actual);
                setState({ status: "idle" });
              }}
              className="btn btn-primary pressable text-xs"
            >
              Fill the check ({Object.keys(state.result.actual).length} lines)
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
      )}
    </CalloutCard>
  );
}
