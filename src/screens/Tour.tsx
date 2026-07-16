/**
 * The guided tour — Knockdown-style coach marks over the REAL app.
 * The screen dims, one control at a time gets the spotlight (a box-shadow
 * cutout that tracks the element), and a card explains it in two lines
 * with Back / Next. Steps hop tabs by themselves; a step whose target
 * never renders (empty period, no meter yet) is skipped in the direction
 * of travel, so the tour works on a full app and a fresh one alike.
 */
import { useEffect, useRef, useState } from "react";

export interface TourStep {
  tab: string;
  /** DOM id of the element to spotlight. */
  target: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    tab: "home",
    target: "tour-period",
    title: "Your pay period",
    body: "Everything on screen belongs to this two-week window. Tap it to jump between periods or start the next one.",
  },
  {
    tab: "home",
    target: "tour-hero",
    title: "What the check should say",
    body: "The engine prices every shift you log — this is your expected take-home. Flip to “Before taxes” any time.",
  },
  {
    tab: "home",
    target: "tour-check",
    title: "Payday? Start here",
    body: "Snap the stub and every line checks itself. Green = paid right · red = you're owed, with the HR email pre-written · amber = one thing to look at.",
  },
  {
    tab: "shifts",
    target: "tour-scan",
    title: "Shifts go in here",
    body: "Snap your ScheduleAnywhere screen, paste the calendar feed, or add shifts by hand. Charge, precepting, and transport fill their own extra pay.",
  },
  {
    tab: "shifts",
    target: "tour-ot",
    title: "The overtime meter",
    body: "Straight hours marching toward the overtime line. Past it, every extra hour pays the overtime rate — prime time to pick up a shift.",
  },
  {
    tab: "me",
    target: "scan-credentials",
    title: "One-time setup",
    body: "Your own Anthropic key powers the photo scans. It lives on this phone only — nothing you scan is stored anywhere.",
  },
  {
    tab: "me",
    target: "tour-year",
    title: "Your whole year",
    body: "Total made, take-home, and where every dollar went. Scan old stubs below it to build history, or download the year as a spreadsheet.",
  },
  {
    tab: "me",
    target: "tour-backup",
    title: "Keep it safe",
    body: "Everything lives on this phone — two taps here saves a backup to iCloud Drive. That's the tour: log shifts, snap the stub, get paid right.",
  },
];

function Dots({ step, count }: { step: number; count: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-accent" : "w-1.5 bg-surface-line"}`} />
      ))}
    </div>
  );
}

export default function Tour({
  step,
  onStep,
  onDone,
  setTab,
}: {
  step: number;
  onStep: (step: number) => void;
  onDone: () => void;
  setTab: (tab: string) => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dir = useRef(1);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(190);
  const s = TOUR_STEPS[step];

  useEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [step, rect]);

  const go = (next: number) => {
    dir.current = next > step ? 1 : -1;
    if (next < 0) return;
    if (next >= TOUR_STEPS.length) onDone();
    else onStep(next);
  };

  useEffect(() => {
    setTab(s.tab);
    setRect(null);
    let cancelled = false;
    let tries = 0;
    let timer = 0;
    const measure = () => {
      const el = document.getElementById(s.target);
      if (el && !cancelled) setRect(el.getBoundingClientRect());
    };
    const find = () => {
      if (cancelled) return;
      const el = document.getElementById(s.target);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // measure after the smooth scroll settles, then track movement
        timer = window.setTimeout(measure, 420);
        window.addEventListener("scroll", measure, true);
        window.addEventListener("resize", measure);
      } else if (++tries < 8) {
        timer = window.setTimeout(find, 130);
      } else {
        // target never rendered (empty state) → skip in the travel direction
        const next = step + (dir.current || 1);
        if (next < 0 || next >= TOUR_STEPS.length) onDone();
        else onStep(next);
      }
    };
    find();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Below the target when it sits in the top half, above otherwise —
  // and always CLAMPED inside the viewport: a tall target (the scan
  // panel) must never shove the card's buttons off-screen.
  const cardStyle = (() => {
    if (rect === null) return { bottom: 90 };
    const below = rect.top + rect.height / 2 < window.innerHeight / 2;
    const desired = below ? rect.bottom + 16 : rect.top - cardH - 16;
    return { top: Math.min(Math.max(12, desired), window.innerHeight - cardH - 12) };
  })();

  return (
    <div role="dialog" aria-modal="true" aria-label={`App tour, step ${step + 1} of ${TOUR_STEPS.length}: ${s.title}`}>
      {/* dim everything; a tap on the dim advances */}
      <button aria-label="Next" onClick={() => go(step + 1)} className="fixed inset-0 z-[64] cursor-default bg-transparent" />
      {rect && (
        <div
          className="pointer-events-none fixed z-[65] rounded-2xl transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 200vmax rgba(20, 17, 15, 0.55)",
          }}
        />
      )}
      {rect === null && <div className="pointer-events-none fixed inset-0 z-[65] bg-ink/55" aria-hidden />}
      <div className="fixed inset-x-4 z-[66] mx-auto max-w-sm" style={cardStyle}>
        <div ref={cardRef} className="card p-4 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <Dots step={step} count={TOUR_STEPS.length} />
            <button onClick={onDone} className="pressable min-h-9 px-1 text-caption text-ink-dim hover:text-ink">
              Skip tour
            </button>
          </div>
          <div className="mt-2 text-headline">{s.title}</div>
          <p className="mt-1 text-footnote leading-relaxed text-ink-dim">{s.body}</p>
          <div className="mt-3 flex items-center justify-end gap-2">
            {step > 0 && (
              <button onClick={() => go(step - 1)} className="btn btn-ghost pressable min-h-10 text-xs">
                Back
              </button>
            )}
            <button onClick={() => go(step + 1)} className="btn btn-primary pressable min-h-10 text-xs">
              {step === TOUR_STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
