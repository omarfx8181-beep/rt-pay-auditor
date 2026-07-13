/**
 * First-run onboarding — 4 single-purpose screens, under 90 seconds
 * (V3 brief §4). One question per screen, why it's asked, skippable at
 * every step, resumable (the step persists). Privacy reassurance where
 * data enters. Completing (or skipping) hands off to the app.
 */
import { useState } from "react";
import { Camera, Check, ChevronLeft, Plus } from "lucide-react";
import { num } from "../lib/draft.ts";
import { FAIRVIEW_RT_PRESET } from "../lib/presets.ts";

const STEPS = 4;

function Dots({ step }: { step: number }) {
  return (
    <div className="flex justify-center gap-1.5">
      {Array.from({ length: STEPS }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-accent" : "w-1.5 bg-surface-line"}`}
        />
      ))}
    </div>
  );
}

export default function Onboarding({
  initialStep,
  baseRate: initialBaseRate,
  onStep,
  onSaveBaseRate,
  onDone,
}: {
  initialStep: number;
  baseRate: string;
  onStep: (step: number) => void;
  onSaveBaseRate: (rate: string) => void;
  onDone: (goTo: "home" | "shifts") => void;
}) {
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), STEPS - 1));
  const [rate, setRate] = useState(initialBaseRate);

  const go = (s: number) => {
    setStep(s);
    onStep(s);
  };
  const finishRate = () => {
    if (num(rate) > 0) onSaveBaseRate(rate.trim());
    go(3);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]">
      <div className="flex min-h-11 items-center justify-between">
        {step > 0 ? (
          <button
            onClick={() => go(step - 1)}
            className="pressable inline-flex min-h-11 items-center gap-0.5 py-2 pr-3 text-subhead font-medium text-accent"
          >
            <ChevronLeft size={18} /> Back
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={() => onDone("home")}
          className="pressable min-h-11 px-2 py-2 text-subhead text-ink-dim"
        >
          Skip for now
        </button>
      </div>

      <div key={step} className="page-enter flex flex-1 flex-col justify-center py-6">
        {step === 0 && (
          <div>
            <div className="eyebrow text-accent">RT Pay</div>
            <h1 className="mt-3 text-large-title tracking-tight">
              Know what your check should say — before it lands.
            </h1>
            <p className="mt-4 text-body text-ink-dim">
              RT Pay checks your hospital paycheck line by line and flags anything you're owed.
            </p>
            <button onClick={() => go(1)} className="btn btn-primary pressable mt-8 w-full">
              Get started
            </button>
            <p className="mt-4 text-center text-footnote text-ink-dim">
              No account, no cloud — everything stays on this device.
            </p>
          </div>
        )}

        {step === 1 && (
          <div>
            <h1 className="text-title-2">Where do you work?</h1>
            <div className="mt-4 rounded-2xl border border-accent bg-accent/10 p-5 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-headline">{FAIRVIEW_RT_PRESET.facility.name}</div>
                  <div className="mt-0.5 text-subhead text-ink-dim">{FAIRVIEW_RT_PRESET.role.name}</div>
                </div>
                <span className="grid size-7 place-items-center rounded-full bg-accent text-on-accent">
                  <Check size={16} strokeWidth={2.5} />
                </span>
              </div>
            </div>
            <p className="mt-4 text-footnote text-ink-dim">
              This loads {FAIRVIEW_RT_PRESET.facility.name}'s weekend, evening, overtime, and bonus rules for you.
              More hospitals and roles are coming — they're presets, not code.
            </p>
            <p className="mt-2 text-footnote text-ink-dim">This stays on your device.</p>
            <button onClick={() => go(2)} className="btn btn-primary pressable mt-8 w-full">
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 className="text-title-2">What's your base hourly rate?</h1>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="text-hero-num text-ink-dim">$</span>
              <input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                autoFocus
                className="input flex-1 px-4 py-3 text-hero-num tabular-nums"
                aria-label="Base hourly rate in dollars"
              />
              <span className="text-title-2 text-ink-dim">/hr</span>
            </div>
            <p className="mt-4 text-footnote text-ink-dim">
              It's on your stub next to "Regular." You can add evening, weekend, and charge pay later — we've already
              set the usual Fairview rates.
            </p>
            <button onClick={finishRate} disabled={num(rate) <= 0} className="btn btn-primary pressable mt-8 w-full">
              Continue
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 className="text-title-2">Add your shifts — or just snap your schedule.</h1>
            <div className="mt-6 space-y-2.5">
              <button onClick={() => onDone("shifts")} className="btn btn-primary pressable w-full">
                <Camera size={17} /> Scan my schedule
              </button>
              <button onClick={() => onDone("shifts")} className="btn btn-ghost pressable w-full">
                <Plus size={17} /> Add manually
              </button>
              <button
                onClick={() => onDone("home")}
                className="pressable block min-h-11 w-full py-2 text-center text-subhead text-ink-dim"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}
      </div>

      <Dots step={step} />
    </div>
  );
}
