/**
 * Scan the weekly bonus posting → the tiers update themselves. The
 * preview is the contract: every change shown before anything is
 * saved, and a tier moving DOWN is called out loud — a quiet tier
 * drop is exactly how the original $250 shortfall happened.
 */
import { useState } from "react";
import { ArrowDown, Loader2, ScanLine } from "lucide-react";
import type { BonusTier } from "../lib/engine.ts";
import { diffTiers, scanTierPosting, type TierDiff, type TierScanResult } from "../lib/tierScan.ts";
import { dayLabel, fmtUnits } from "../lib/format.ts";

type State =
  | { status: "idle" }
  | { status: "working" }
  | { status: "error"; msg: string }
  | { status: "preview"; result: TierScanResult; diff: TierDiff };

export default function TierScanPanel({
  apiKey,
  tiers,
  onApply,
}: {
  apiKey: string;
  tiers: BonusTier[];
  onApply: (next: BonusTier[]) => void;
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  const handleFiles = async (files: FileList) => {
    setState({ status: "working" });
    try {
      const result = await scanTierPosting(Array.from(files), apiKey);
      setState({ status: "preview", result, diff: diffTiers(tiers, result.tiers) });
    } catch (err) {
      setState({ status: "error", msg: String(err instanceof Error ? err.message : err) });
    }
  };

  if (state.status === "preview") {
    const { result, diff } = state;
    const unchanged = diff.changes.length === 0 && diff.added.length === 0 && diff.removed.length === 0;
    return (
      <div className="mt-3 border-t border-surface-line/60 pt-3">
        <p className="text-subhead font-semibold">
          The posting read{result.effective ? ` — week of ${dayLabel(result.effective)}` : ""}:
        </p>
        {unchanged ? (
          <p className="mt-1.5 text-footnote text-pos">Matches today's tiers ✓ — nothing changes.</p>
        ) : (
          <div className="mt-1.5 space-y-1 text-footnote tabular-nums">
            {diff.changes.map((c) => (
              <div key={c.label} className={`flex items-center gap-1.5 ${c.toUnits < c.fromUnits ? "text-amber" : "text-ink"}`}>
                {c.toUnits < c.fromUnits && <ArrowDown size={12} />}
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                <span>
                  {fmtUnits(c.fromUnits)} → <strong>{fmtUnits(c.toUnits)}</strong> units
                </span>
              </div>
            ))}
            {diff.added.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 text-pos">
                <span className="min-w-0 flex-1 truncate">+ {t.label}</span>
                <span>{fmtUnits(t.units)} units</span>
              </div>
            ))}
            {diff.removed.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 text-ink-dim">
                <span className="min-w-0 flex-1 truncate line-through">{t.label}</span>
                <span>gone</span>
              </div>
            ))}
          </div>
        )}
        {diff.drops.length > 0 && (
          <p className="mt-1.5 text-footnote text-amber">
            Heads up — {diff.drops.length === 1 ? "a tier moved down" : `${diff.drops.length} tiers moved down`}. Extra
            shifts pay less this week.
          </p>
        )}
        <div className="mt-2.5 flex gap-2">
          {!unchanged && (
            <button onClick={() => { onApply(state.result.tiers); setState({ status: "idle" }); }} className="btn btn-primary pressable text-xs">
              Use these tiers
            </button>
          )}
          <button onClick={() => setState({ status: "idle" })} className="pressable px-2 text-xs text-ink-dim">
            {unchanged ? "Done" : "Discard"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-surface-line/60 pt-3">
      {state.status === "working" ? (
        <div className="flex items-center gap-2 text-sm text-accent">
          <Loader2 size={15} className="animate-spin" /> Reading the posting…
        </div>
      ) : (
        <>
          {apiKey ? (
            <label className="btn btn-ghost pressable cursor-pointer text-xs">
              <ScanLine size={14} /> Scan the weekly posting
              <input
                type="file"
                accept="image/*,application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          ) : (
            <button
              onClick={() => setState({ status: "error", msg: "Needs your API key — add it under Scans below." })}
              className="btn btn-ghost pressable text-xs"
            >
              <ScanLine size={14} /> Scan the weekly posting
            </button>
          )}
          {state.status === "error" && (
            <p className="mt-2 text-footnote text-neg">
              {state.msg}{" "}
              <button onClick={() => setState({ status: "idle" })} className="text-ink-dim underline">
                dismiss
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
