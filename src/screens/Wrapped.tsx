/**
 * Year Wrapped — the highlight reel. Full-screen ink block, one big
 * number per slide, tap to advance. Every figure is the Year card's
 * own truth (stub-true first, corrections in), told as a story that
 * ends on the app's reason to exist: what it caught.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import type { WrappedStats } from "../lib/wrapped.ts";
import { dayLabel, fmtCents, fmtNum, fmtUnits } from "../lib/format.ts";

interface Slide {
  eyebrow: string;
  big: string;
  sub: string;
  tone?: "pos" | "amber";
}

function buildSlides(s: WrappedStats, unit548Cents: number): Slide[] {
  const slides: Slide[] = [
    {
      eyebrow: "Your year so far",
      big: s.year,
      sub: `${s.checksCount} check${s.checksCount === 1 ? "" : "s"} · ${fmtNum(s.ytd.workedHours)} hours worked`,
    },
    {
      eyebrow: "You made",
      big: fmtCents(s.ytd.totalGrossCents),
      sub: `took home ${fmtCents(s.ytd.totalNetCents)}`,
      tone: "pos",
    },
  ];
  if (s.ytd.otHours > 0) {
    slides.push({
      eyebrow: "Overtime",
      big: `${fmtNum(s.ytd.otHours)} hrs`,
      sub: s.ytd.dtHours > 0 ? `plus ${fmtNum(s.ytd.dtHours)} double-time hrs` : "every one at the higher rate",
    });
  }
  if (s.biggestCheck) {
    slides.push({
      eyebrow: "Biggest check",
      big: fmtCents(s.biggestCheck.netCents),
      sub: `take-home, ${dayLabel(s.biggestCheck.endDate)}`,
      tone: "pos",
    });
  }
  if (s.ytd.units548 > 0) {
    slides.push({
      eyebrow: "Bonus units",
      big: fmtUnits(s.ytd.units548),
      sub: `≈ ${fmtCents(Math.round(s.ytd.units548 * unit548Cents))} in critical-shift bonuses`,
    });
  }
  if (s.weekendDays > 0) {
    slides.push({
      eyebrow: "Weekend days worked",
      big: String(s.weekendDays),
      sub: `longest shift ${fmtNum(s.longestShiftHours)} hours`,
    });
  }
  if (s.caught.caughtCents > 0) {
    slides.push({
      eyebrow: "The watchdog",
      big: fmtCents(s.caught.caughtCents),
      sub: `caught · ${fmtCents(s.caught.recoveredCents)} recovered${
        s.caught.openCents > 0 ? ` · ${fmtCents(s.caught.openCents)} still open` : ""
      }`,
      tone: "amber",
    });
  } else if (s.caught.cleanStreak >= 2) {
    slides.push({
      eyebrow: "Every check clean",
      big: `${s.caught.cleanStreak} in a row`,
      sub: "they know you're watching",
      tone: "pos",
    });
  }
  return slides;
}

export default function Wrapped({
  stats,
  unit548Cents,
  onClose,
}: {
  stats: WrappedStats;
  unit548Cents: number;
  onClose: () => void;
}) {
  const slides = useMemo(() => buildSlides(stats, unit548Cents), [stats, unit548Cents]);
  const [idx, setIdx] = useState(0);
  const reduce = useReducedMotion();
  const last = idx >= slides.length - 1;
  const slide = slides[Math.min(idx, slides.length - 1)];

  const advance = () => {
    if (last) onClose();
    else setIdx((i) => i + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-hero-bg text-hero-fg" role="dialog" aria-label={`${stats.year} highlight reel`}>
      <div className="flex items-center justify-between px-5 pt-[max(20px,env(safe-area-inset-top))]">
        <span className="eyebrow text-hero-fg/50">The highlight reel</span>
        <button onClick={onClose} className="pressable p-2.5 text-hero-fg/70" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      <button onClick={advance} className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 1 } : { opacity: 0, y: -10 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: "easeOut" }}
          >
            <div className="eyebrow text-hero-fg/50">{slide.eyebrow}</div>
            <div
              className={`mt-3 text-hero-num tabular-nums ${
                slide.tone === "pos" ? "text-hero-pos" : slide.tone === "amber" ? "text-amber" : ""
              }`}
            >
              {slide.big}
            </div>
            <div className="mt-2 text-subhead text-hero-fg/60">{slide.sub}</div>
          </motion.div>
        </AnimatePresence>
        <div className="mt-10 text-caption text-hero-fg/40">{last ? "tap to finish" : "tap for the next one"}</div>
      </button>

      <div className="flex justify-center gap-1.5 pb-[max(24px,env(safe-area-inset-bottom))]">
        {slides.map((_, i) => (
          <span key={i} className={`size-1.5 rounded-full ${i === idx ? "bg-hero-fg" : "bg-hero-fg/25"}`} aria-hidden />
        ))}
      </div>
    </div>
  );
}
