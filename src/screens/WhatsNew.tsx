/**
 * The once-per-update announcement — an update swapped in silently,
 * this is where the app says so in plain words. One card, one tap out.
 */
import { Sparkles } from "lucide-react";
import type { Release } from "../lib/whatsNew.ts";

export default function WhatsNewSheet({ release, onClose }: { release: Release; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="What's new">
      <div className="reveal w-full max-w-md rounded-t-2xl bg-surface-card p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-lg sm:rounded-2xl sm:pb-5">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-accent" />
          <span className="eyebrow">Updated · {release.date}</span>
        </div>
        <h2 className="mt-2 text-title-2">{release.title}</h2>
        <ul className="mt-3 space-y-2">
          {release.points.map((p) => (
            <li key={p} className="flex gap-2 text-footnote leading-relaxed text-ink-dim">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="btn btn-primary pressable mt-5 w-full">
          Nice — carry on
        </button>
      </div>
    </div>
  );
}
