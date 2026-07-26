/**
 * Goals — Knockdown's payoff meter run the OPPOSITE way: the year fills
 * toward a target instead of a debt draining to zero. One goal per
 * year (before taxes or take-home), a fill bar with milestone dots, a
 * plan priced in the currency that actually exists here — overtime
 * hours, bonus units, extra shifts (engine what-if math, not vibes) —
 * and every check of the year as a bar you can tap into.
 */
import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import type { BonusTier, EngineConfig, Shift } from "../lib/engine.ts";
import { periodMoney, rollupYtd, yearGridEnds, type OtherIncomeDraft, type PayPeriod } from "../lib/periods.ts";
import { buildGoalPlan, buildPickupPlan, goalLevers, PICKUP_LENGTHS, pickupValues, type GoalKind, type GoalsSetting, type YearGoal } from "../lib/goals.ts";
import { num, todayIso } from "../lib/draft.ts";
import { dayLabel, fmtCents, fmtNum, fmtUnits } from "../lib/format.ts";
import { Card, Eyebrow, Hero, StatTile } from "../ui/kit.tsx";

/** The fill meter — accent→pos gradient, milestone dots at 25/50/75. */
function GoalMeter({ progress, onHero = false }: { progress: number; onHero?: boolean }) {
  const pct = Math.min(100, Math.max(progress * 100, progress > 0 ? 2 : 0));
  return (
    <div className={`relative h-2.5 w-full overflow-hidden rounded-full ${onHero ? "bg-white/15" : "bg-surface-soft"}`}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: "linear-gradient(90deg, rgb(var(--accent)), rgb(var(--pos)))" }}
      />
      {[25, 50, 75].map((m) => (
        <span
          key={m}
          className={`absolute top-1/2 size-1 -translate-y-1/2 rounded-full ${onHero ? "bg-white/40" : "bg-surface-card"}`}
          style={{ left: `${m}%` }}
          aria-hidden
        />
      ))}
    </div>
  );
}

export default function Goals({
  periods,
  otherIncome,
  year,
  shifts,
  cfg,
  tiers,
  goals,
  onSaveGoals,
  onOpenPeriodDetails,
}: {
  periods: PayPeriod[];
  otherIncome: OtherIncomeDraft[];
  /** The open period's year — default view. */
  year: string;
  /** Current period's shifts — the levers price against today's reality. */
  shifts: Shift[];
  cfg: EngineConfig;
  /** This week's bonus tiers — a pickup's worth includes its tier units. */
  tiers: BonusTier[];
  goals: GoalsSetting;
  onSaveGoals: (next: GoalsSetting) => void;
  onOpenPeriodDetails: (id: string) => void;
}) {
  const [yearView, setYearView] = useState(year);
  const years = useMemo(
    () =>
      [...new Set([...periods.map((p) => p.endDate.slice(0, 4)), ...Object.keys(goals), year])].sort().reverse(),
    [periods, goals, year],
  );
  const goal = goals[yearView];
  const [draft, setDraft] = useState(goal?.target ?? "");
  const [maxDraft, setMaxDraft] = useState(goal?.maxPickups ?? "");
  const kind: GoalKind = goal?.kind ?? "gross";
  const lengths = goal?.lengths ?? [...PICKUP_LENGTHS];

  const persist = (patch: Partial<YearGoal>) => {
    const merged: YearGoal = { target: draft.trim(), kind, lengths, maxPickups: maxDraft.trim(), ...patch };
    const next = { ...goals };
    if (merged.target === "" || num(merged.target.replace(/[$,]/g, "")) <= 0) delete next[yearView];
    else next[yearView] = merged;
    onSaveGoals(next);
  };

  const ytd = useMemo(() => rollupYtd(periods, yearView, otherIncome), [periods, yearView, otherIncome]);
  const madeCents = kind === "gross" ? ytd.totalGrossCents : ytd.totalNetCents;
  const levers = useMemo(() => goalLevers(shifts, cfg), [shifts, cfg]);
  const plan = useMemo(
    () =>
      buildGoalPlan({
        targetCents: Math.round(num((goal?.target ?? "").replace(/[$,]/g, "")) * 100),
        kind,
        madeCents,
        periods,
        year: yearView,
        todayIso: todayIso(),
        levers,
      }),
    [goal, kind, madeCents, periods, yearView, levers],
  );


  // Every grid check of the year → a bar (tap = that period's stub detail).
  const bars = useMemo(() => {
    const ends = yearGridEnds(periods, yearView);
    return ends.map((end) => {
      const p = periods.find((x) => x.endDate === end);
      const m = p ? periodMoney(p) : null;
      return { end, p, cents: m === null ? 0 : kind === "gross" ? m.grossCents : m.netCents, stubTrue: m?.stubTrue ?? false, corrected: (m?.correctionGrossCents ?? 0) > 0 };
    });
  }, [periods, yearView, kind]);
  const maxBar = Math.max(1, ...bars.map((b) => b.cents));

  const kindWord = kind === "gross" ? "before taxes" : "take-home";
  const values = useMemo(() => pickupValues(shifts, cfg, tiers, lengths), [shifts, cfg, tiers, lengths]);
  const pickup =
    plan && !plan.done && plan.extraPerCheckCents > 0
      ? buildPickupPlan(plan.extraPerCheckCents, values, kind, Math.max(0, Math.floor(num(maxDraft))))
      : null;
  const hoursWord = (h: number) => (h === 16 ? "sixteen" : h === 12 ? "twelve" : h === 8 ? "eight" : `${h}-hr`);
  const landingCents =
    plan && pickup ? plan.madeCents + (plan.avgPerCheckCents + pickup.maxAddablePerCheckCents) * plan.checksLeft : 0;
  const oneEvery = plan && plan.extraShiftsTotal > 0 ? Math.max(1, Math.round(plan.checksLeft / plan.extraShiftsTotal)) : 0;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-large-title tracking-tight">Goals</h1>
        <p className="mt-1 text-subhead text-ink-dim">Pick the number — the plan prices the shifts.</p>
      </div>

      {years.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => {
                setYearView(y);
                setDraft(goals[y]?.target ?? "");
                setMaxDraft(goals[y]?.maxPickups ?? "");
              }}
              className={`btn px-3 py-1.5 text-xs ${y === yearView ? "btn-primary" : "btn-ghost"} pressable`}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {plan ? (
        <div id="tour-goal">
        <Hero>
          <div className="flex items-start justify-between gap-3">
            <Eyebrow className="text-hero-fg/50">Your {yearView} goal</Eyebrow>
            {plan.done ? (
              <span className="rounded-full bg-hero-pos/15 px-2.5 py-1 text-caption text-hero-pos">Goal reached ✓</span>
            ) : (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-caption tabular-nums text-hero-fg/70">
                {Math.round(plan.progress * 100)}%
              </span>
            )}
          </div>
          <div className="mt-3 text-hero-num tabular-nums">{fmtCents(plan.madeCents)}</div>
          <div className="mt-1 text-subhead text-hero-fg/60">
            of {fmtCents(plan.targetCents)} {kindWord}
          </div>
          <div className="mt-4">
            <GoalMeter progress={plan.progress} onHero />
          </div>
          <p className={`mt-3 text-footnote ${plan.done ? "text-hero-pos" : plan.paceDeltaCents >= 0 ? "text-hero-pos" : "text-amber"}`}>
            {plan.done
              ? "Made it — everything from here is gravy."
              : plan.paceDeltaCents >= 0
                ? `Ahead of pace by ${fmtCents(plan.paceDeltaCents)} — ${plan.checksLeft} check${plan.checksLeft === 1 ? "" : "s"} to go.`
                : `Behind even pace by ${fmtCents(-plan.paceDeltaCents)} — the plan below closes it.`}
          </p>
        </Hero>
        </div>
      ) : (
        <Card>
          <div className="mb-1 flex items-center gap-1.5">
            <Target size={14} className="text-accent" />
            <span className="eyebrow">Set your {yearView} goal</span>
          </div>
          <p className="text-body">
            What should this year add up to? Pick a number and the plan below turns it into overtime hours, bonus
            units, or extra shifts — priced with your real rates.
          </p>
        </Card>
      )}

      <Card title="Your goal">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-40 flex-1 flex-col sm:max-w-56">
            <span className="label">Target for {yearView}</span>
            <span className="flex items-center gap-1.5">
              <span className="text-headline text-ink-dim">$</span>
              <input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  persist({ target: e.target.value.trim() });
                }}
                inputMode="decimal"
                placeholder="120,000"
                className="input flex-1 px-3 py-2.5 text-right text-[16px] tabular-nums"
              />
            </span>
          </label>
          <div className="flex gap-1.5">
            {(["gross", "takehome"] as const).map((k) => (
              <button
                key={k}
                onClick={() => persist({ kind: k })}
                className={`btn px-3 py-2 text-xs ${kind === k ? "btn-primary" : "btn-ghost"} pressable`}
              >
                {k === "gross" ? "Before taxes" : "Take-home"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-footnote text-ink-dim">
          Counts everything the Year card counts — Fairview checks (corrections included) plus other income.
        </p>
      </Card>

      {plan && !plan.done && (
        <Card title="The plan to get there">
          <div className="space-y-1 text-sm tabular-nums">
            <div className="flex justify-between gap-3">
              <span className="text-ink-dim">Checks left this year</span>
              <span>{plan.checksLeft}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-dim">Each one needs to bring in</span>
              <span>{fmtCents(plan.neededPerCheckCents)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-dim">Your average check so far</span>
              <span>{fmtCents(plan.avgPerCheckCents)}</span>
            </div>
          </div>
          {plan.extraPerCheckCents === 0 ? (
            <p className="mt-3 border-t border-surface-line/60 pt-3 text-subhead text-pos">
              Your normal pace already lands this goal — keep doing exactly what you're doing.
            </p>
          ) : (
            <div className="mt-3 border-t border-surface-line/60 pt-3">
              <p className="text-subhead">
                That's <span className="font-semibold tabular-nums">{fmtCents(plan.extraPerCheckCents)}</span> more
                than your average check. Any one of these covers it:
              </p>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-dim">Overtime, per check</span>
                  <span className="font-semibold tabular-nums">+{fmtNum(plan.otHoursPerCheck)} hrs</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-dim">Bonus units, per check</span>
                  <span className="font-semibold tabular-nums">+{fmtUnits(plan.unitsPerCheck)} units</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-dim">Extra 12-hr shifts, rest of the year</span>
                  <span className="font-semibold tabular-nums">
                    {fmtUnits(plan.extraShiftsTotal)}
                    {oneEvery > 1 ? ` (≈1 every ${oneEvery} checks)` : ""}
                  </span>
                </div>
              </div>
            </div>
          )}
          <p className="mt-3 text-footnote text-ink-dim">
            Priced with your real rates: one extra 12-hr shift is worth{" "}
            {fmtCents(kind === "gross" ? levers.perShiftGrossCents : levers.perShiftNetCents)} {kindWord} right now —
            the same math as the what-if card.
          </p>
          {ytd.periodCount < plan.checksElapsed && (
            <p className="mt-1.5 text-footnote text-amber">
              {plan.checksElapsed - ytd.periodCount} of this year's checks aren't logged yet, so the average reads low
              and the plan overshoots — scan those old stubs (Me → Add your year) and this gets honest.
            </p>
          )}
        </Card>
      )}

      {plan && !plan.done && plan.extraPerCheckCents > 0 && (
        <Card title="Strategize the pickups — what do you have open?">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="label">Shifts you can pick up</span>
              <div className="mt-1 flex gap-1.5">
                {PICKUP_LENGTHS.map((h) => {
                  const on = lengths.includes(h);
                  return (
                    <button
                      key={h}
                      onClick={() => {
                        const next = on ? lengths.filter((x) => x !== h) : [...lengths, h];
                        if (next.length > 0) persist({ lengths: next });
                      }}
                      className={`btn px-3 py-2 text-xs ${on ? "btn-primary" : "btn-ghost"} pressable`}
                    >
                      {h === 16 ? "16s (double)" : `${h}s`}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex flex-col">
              <span className="label">Days open, per check</span>
              <input
                value={maxDraft}
                onChange={(e) => {
                  setMaxDraft(e.target.value);
                  persist({ maxPickups: e.target.value.trim() });
                }}
                inputMode="numeric"
                placeholder="no limit"
                className="input w-24 px-2.5 py-2 text-right text-[16px] tabular-nums"
              />
            </label>
          </div>

          <p className="mt-3 text-footnote tabular-nums text-ink-dim">
            What one pays right now:{" "}
            {values
              .map(
                (v) =>
                  `a ${hoursWord(v.hours)} ≈ ${fmtCents(kind === "gross" ? v.grossCents : v.netCents)}${
                    v.units > 0 ? ` (incl. its ${fmtUnits(v.units)} bonus units)` : ""
                  }`,
              )
              .join(" · ")}
            . Doubles pay double time past 12 hours — already counted.
          </p>

          {pickup && (
            <div className="mt-3 border-t border-surface-line/60 pt-3">
              {pickup.covers ? (
                <>
                  <p className="text-subhead">
                    Per check:{" "}
                    <span className="font-semibold">
                      {pickup.parts.map((p) => `${p.count} × ${hoursWord(p.hours)}`).join(" + ")}
                    </span>{" "}
                    — adds ≈<span className="font-semibold tabular-nums">{fmtCents(pickup.addsPerCheckCents)}</span>{" "}
                    against the {fmtCents(plan.extraPerCheckCents)} gap ✓
                  </p>
                  <p className="mt-1 text-footnote text-ink-dim">
                    That's {pickup.pickupsPerCheck * plan.checksLeft} pickup
                    {pickup.pickupsPerCheck * plan.checksLeft === 1 ? "" : "s"} across the rest of the year (
                    {pickup.pickupsPerCheck}/check · {plan.checksLeft} checks left).
                  </p>
                </>
              ) : (
                <>
                  <p className="text-subhead text-amber">
                    Your open days top out at ≈{fmtCents(pickup.maxAddablePerCheckCents)} per check — the goal needs{" "}
                    {fmtCents(plan.extraPerCheckCents)} extra.
                  </p>
                  <p className="mt-1 text-footnote text-ink-dim">
                    At that availability the year lands around{" "}
                    <span className="font-semibold tabular-nums">{fmtCents(landingCents)}</span> {kindWord}. Open up
                    more days, add lengths above, or set the target there and call it honest.
                  </p>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      <Card title={`Every check of ${yearView} — tap a bar to open it`}>
        <div className="flex h-28 items-end gap-[3px]">
          {bars.map((b) => {
            const h = b.cents > 0 ? Math.max(6, (b.cents / maxBar) * 100) : 0;
            return (
              <button
                key={b.end}
                onClick={() => b.p && onOpenPeriodDetails(b.p.id)}
                disabled={!b.p}
                aria-label={`Check ending ${dayLabel(b.end)}${b.cents > 0 ? `, ${fmtCents(b.cents)}` : ", nothing logged"}`}
                className="group relative flex h-full flex-1 items-end rounded-sm"
              >
                {b.cents > 0 ? (
                  <span
                    className="w-full rounded-sm transition-all"
                    style={{
                      height: `${h}%`,
                      background: b.stubTrue ? "linear-gradient(180deg, rgb(var(--accent)), rgb(var(--pos)))" : "rgb(var(--surface-line))",
                    }}
                  />
                ) : (
                  <span className="h-[3px] w-full rounded-sm bg-surface-soft" />
                )}
                {b.corrected && <span className="absolute -top-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-pos" aria-hidden />}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-caption text-ink-dim">
          <span>Jan</span>
          <span>Apr</span>
          <span>Jul</span>
          <span>Oct</span>
          <span>Dec</span>
        </div>
        <p className="mt-2 text-footnote text-ink-dim">
          Solid bars are real stubs; pale bars are estimates; a green dot means a correction check landed.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Overtime" value={fmtNum(ytd.otHours) + " h"} tone="amber" sub="this year" />
        <StatTile label="Double time" value={fmtNum(ytd.dtHours) + " h"} tone="neg" sub="this year" />
        <StatTile label="Bonus units" value={fmtUnits(ytd.units548)} tone="accent" sub={`≈ ${fmtCents(Math.round(ytd.units548 * cfg.unit548Cents))}`} />
        <StatTile label="Worked" value={fmtNum(ytd.workedHours) + " h"} tone="pos" sub="this year" />
      </div>
    </div>
  );
}
