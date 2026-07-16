/**
 * How to use this app — the in-app manual (plain words, zero codes).
 * One collapsed card in Me: the biweekly rhythm first, then each flow
 * step by step, using the app's real button names so nothing has to be
 * guessed. Ends with a way to replay the intro tour.
 */
import { BookOpen, RotateCcw } from "lucide-react";
import { Disclosure } from "../ui/kit.tsx";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-surface-line/60 pt-3 first:border-t-0 first:pt-0">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent/10 text-caption font-semibold text-accent">
        {n}
      </span>
      <div className="min-w-0">
        <div className="text-subhead font-semibold">{title}</div>
        <div className="mt-1 space-y-1.5 text-footnote leading-relaxed text-ink-dim">{children}</div>
      </div>
    </div>
  );
}

export default function HowToCard({ onReplayTour }: { onReplayTour: () => void }) {
  return (
    <Disclosure
      title="How to use this app"
      icon={<BookOpen size={13} className="text-accent" />}
      hint="The whole routine, step by step — two minutes to read."
    >
      <div className="space-y-3">
        <Step n={1} title="The rhythm, every two weeks">
          <p>
            Add shifts as you work them (Shifts tab). On payday, open Home → <strong>Check my paycheck</strong> and
            snap the stub. The app compares every line and gives you a color: green, red, or amber. That's the whole
            routine.
          </p>
        </Step>

        <Step n={2} title="One-time setup for photo scans">
          <p>
            Photo scans (schedules, stubs) use your own Anthropic key: create one at console.anthropic.com (API keys →
            Create key), paste it above under <strong>Scans</strong>. It lives only on this phone. Typing everything by
            hand works fine without it.
          </p>
          <p>
            Nothing scans by itself — you always pick the photos, and you always see a preview before anything is
            saved.
          </p>
        </Step>

        <Step n={3} title="Getting shifts in">
          <p>
            Shifts tab → <strong>Pull schedule</strong>: upload ScheduleAnywhere screenshots, or paste the calendar
            feed. Charge, precepting, and transport notes on the schedule fill their extra pay automatically. Days
            beyond this period file themselves into the next periods.
          </p>
          <p>
            Or tap <strong>Add shift</strong> and enter it by hand: date, hours, bonus units (the tier chips add the
            right units), and the extra-pay toggles. After a shift, correct the hours to your real punches — sharper
            inputs, sharper check.
          </p>
        </Step>

        <Step n={4} title="When the check lands">
          <p>
            Home → <strong>Check my paycheck</strong> → <strong>Scan the stub</strong>. Every line fills itself and
            the verdict appears. No key? Type the lines from the stub into the same screen — anything more than a
            nickel off gets flagged.
          </p>
          <p>
            <span className="text-pos">Green</span> — paid in full, done. <span className="text-neg">Red</span> — the
            dollars you're owed, line by line. <span className="text-amber">Amber</span> — nothing shorted, but one
            thing deserves a look (the banner asks the exact question).
          </p>
        </Step>

        <Step n={5} title="If it's red">
          <p>
            The red banner has <strong>Email HR — we've written it for you</strong>: a prewritten email with the
            expected-vs-paid table and the shifts behind it. Add your name and employee ID once (below the banner) so
            it signs itself. <strong>Save this check as a record (PDF)</strong> keeps a dated copy for the dispute.
          </p>
        </Step>

        <Step n={6} title="Your whole year">
          <p>
            Printed stubs from before the app? <strong>Add your year — scan old stubs</strong> (below): photograph a
            batch and each one becomes its own pay period, already filled. Scan the Kronos{" "}
            <strong>Year to Date</strong> screen the same way — it anchors the year and unlocks payroll's own "where
            the money went" split in the Year total card.
          </p>
          <p>
            The Year card's bottom line cross-checks the app against your newest stub: green = they agree, amber =
            something's missing or doubled — scan that stub and it turns green.
          </p>
        </Step>

        <Step n={7} title="Keep it safe">
          <p>
            Everything lives on this phone only — so back it up: <strong>Backup</strong> (below) →{" "}
            <strong>Back up now</strong> → Save to Files → iCloud Drive. New phone or fresh install:{" "}
            <strong>Import</strong> the same file and everything merges back. <strong>Paydays on your calendar</strong>{" "}
            hands iOS the reminders, since the app never phones home.
          </p>
        </Step>

        <button onClick={onReplayTour} className="btn btn-ghost pressable text-xs">
          <RotateCcw size={13} /> Replay the intro tour
        </button>
      </div>
    </Disclosure>
  );
}
