/**
 * Home — "This Check" (V3 brief §4).
 * The answer lives here: a quiet period selector, the status hero card,
 * "Check my paycheck" as the primary action, the what-if card, and a
 * quiet year line. Detail is one tap down: the check flow and the full
 * breakdown are sub-views of Home, not tabs.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Check, ChevronDown, ChevronLeft, CircleAlert, Play, Plus, ScanLine, ShieldCheck } from "lucide-react";
import type { BonusTier, EngineConfig, NetResult, PeriodResult, Shift } from "../lib/engine.ts";
import { num, todayIso, type CfgDraft } from "../lib/draft.ts";
import type { AuditRow } from "../lib/audit.ts";
import type { Verdict } from "../lib/verdict.ts";
import type { EmailIdentity } from "../lib/hrEmail.ts";
import { periodLabel, type CorrectionDraft, type PayPeriod, type YtdAnchor, type YtdRollup } from "../lib/periods.ts";
import { daysUntil, paydayFor } from "../lib/payday.ts";
import { caughtSummary } from "../lib/caught.ts";
import { checkDiff } from "../lib/checkDiff.ts";
import { findLiveShift, todayShiftWithoutTimes, type OnNow } from "../lib/shiftClock.ts";
import { shiftWorths } from "../lib/worth.ts";
import { dayLabel, fmtCents, fmtNum, fmtUnits } from "../lib/format.ts";
import { Card, Disclosure, Eyebrow, Hero } from "../ui/kit.tsx";
import Audit from "./Audit.tsx";
import { BreakdownCards, WhatIfBody, type WhatIfDraft } from "./Paycheck.tsx";

/**
 * The live shift ticker — open the app ON shift and watch the money
 * count. Window from the schedule scan's note times, or a one-tap
 * "I'm on now". Pure morale; the engine's marginal math underneath.
 */
function LiveTicker({
  record,
  shifts,
  cfg,
  onNow,
  onSetOnNow,
}: {
  record: PayPeriod;
  shifts: Shift[];
  cfg: EngineConfig;
  onNow: OnNow | null;
  onSetOnNow: (v: OnNow | null) => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const iv = setInterval(() => setNowMs(Date.now()), reduce ? 5000 : 1000);
    return () => clearInterval(iv);
  }, []);

  const now = new Date(nowMs);
  const live = findLiveShift(record.shifts, now, onNow);
  const candidate = live ? null : todayShiftWithoutTimes(record.shifts, now);
  const worths = useMemo(() => shiftWorths(shifts, cfg), [shifts, cfg]);

  // A manual start goes stale by TIME only (window + an hour) — never
  // because some other period happens to be on screen.
  useEffect(() => {
    if (onNow && nowMs > onNow.endMs + 3600_000) onSetOnNow(null);
  }, [onNow, nowMs, onSetOnNow]);

  if (live) {
    const w = worths.get(live.shift.id);
    if (!w || w.netCents <= 0) return null;
    const frac = Math.min(1, Math.max(0, (nowMs - live.startMs) / (live.endMs - live.startMs)));
    const endLabel = new Date(live.endMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>On the clock</Eyebrow>
          <span className="flex items-center gap-1.5 text-caption text-pos">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos/60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-pos" />
            </span>
            live
          </span>
        </div>
        <div className="mt-2 text-title-2 tabular-nums text-pos">{fmtCents(Math.round(w.netCents * frac))}</div>
        <div className="mt-0.5 text-footnote tabular-nums text-ink-dim">
          in your pocket so far · {fmtCents(w.netCents)} by {endLabel}
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-soft">
          <div
            className="h-full rounded-full bg-pos transition-all motion-reduce:transition-none"
            style={{ width: `${frac * 100}%` }}
          />
        </div>
      </Card>
    );
  }

  if (candidate) {
    return (
      <button
        onClick={() => {
          const startMs = Date.now();
          onSetOnNow({ shiftId: candidate.id, startMs, endMs: startMs + Math.max(1, num(candidate.hours)) * 3600_000 });
        }}
        className="pressable mx-auto flex min-h-11 items-center gap-1.5 px-3 py-1 text-footnote font-medium text-accent"
      >
        <Play size={13} /> On shift now? Watch it add up
      </button>
    );
  }
  return null;
}

/** The scoreboard — what the watchdog has caught, and the streak. */
function TrophyCase({ periods, closeEnoughCents }: { periods: PayPeriod[]; closeEnoughCents: number }) {
  const s = useMemo(() => caughtSummary(periods, closeEnoughCents, todayIso()), [periods, closeEnoughCents]);
  if (s.caughtCents === 0 && s.cleanStreak < 2) return null;
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>The scoreboard</Eyebrow>
        <ShieldCheck size={14} className="text-pos" />
      </div>
      {s.caughtCents > 0 && (
        <>
          <div className="mt-1 text-title-2 tabular-nums text-pos">{fmtCents(s.caughtCents)} caught</div>
          <p className="mt-0.5 text-footnote tabular-nums text-ink-dim">
            {s.firstCaughtEnd ? `since ${dayLabel(s.firstCaughtEnd)}` : ""}
            {s.recoveredCents > 0 && ` · ${fmtCents(s.recoveredCents)} recovered`}
            {s.openCents > 0 && <span className="text-neg"> · {fmtCents(s.openCents)} still open</span>}
          </p>
        </>
      )}
      {s.cleanStreak >= 2 && (
        <p className={`text-footnote text-pos ${s.caughtCents > 0 ? "mt-1.5" : "mt-1"}`}>
          {s.cleanStreak} clean checks in a row — they know you're watching.
        </p>
      )}
    </Card>
  );
}

/** "Why is this check different?" — engine drivers, plain rows. */
function WhyDifferent({ record, periods }: { record: PayPeriod; periods: PayPeriod[] }) {
  const d = useMemo(() => checkDiff(record, periods), [record, periods]);
  // Mid-entry a period is half a check — comparisons only mislead. Same
  // finished-only rule as the scoreboard.
  if (record.endDate >= todayIso()) return null;
  if (!d || (Math.abs(d.netDeltaCents) < 100 && d.drivers.length === 0)) return null;
  const up = d.netDeltaCents >= 0;
  return (
    <Disclosure
      title="Why is this check different?"
      hint={`${up ? "+" : "−"}${fmtCents(Math.abs(d.netDeltaCents))} take-home vs last check.`}
    >
      {d.prevBare ? (
        <p className="text-footnote text-ink-dim">
          Last check was logged from its stub only — totals compare, lines can't.
        </p>
      ) : (
        <div className="space-y-1.5 text-sm">
          {d.shiftsDelta !== 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-dim">Shifts</span>
              <span className="font-medium tabular-nums">{d.shiftsDelta > 0 ? "+" : ""}{d.shiftsDelta}</span>
            </div>
          )}
          {d.drivers.slice(0, 5).map((dr) => (
            <div key={dr.key} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-ink-dim">
                {dr.label}
                {dr.qtyDelta !== 0 && (
                  <span className="tabular-nums">
                    {" "}({dr.qtyDelta > 0 ? "+" : "−"}
                    {dr.isUnits ? fmtUnits(Math.abs(dr.qtyDelta)) + " units" : fmtNum(Math.abs(dr.qtyDelta)) + " hrs"})
                  </span>
                )}
              </span>
              <span className={`font-medium tabular-nums ${dr.deltaCents >= 0 ? "text-pos" : "text-neg"}`}>
                {dr.deltaCents >= 0 ? "+" : "−"}{fmtCents(Math.abs(dr.deltaCents))}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-footnote text-ink-dim">vs {periodLabel(d.prevStart, d.prevEnd)}</p>
    </Disclosure>
  );
}

/**
 * Restrained count-up for the hero number (V3 §3.4): 0 → value on first
 * mount, previous → next on changes. Honors prefers-reduced-motion.
 */
function useCountUp(targetCents: number, ms = 600): number {
  const [value, setValue] = useState(targetCents);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    const from = prev.current ?? 0;
    prev.current = targetCents;
    if (from === targetCents || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(targetCents);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (targetCents - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetCents, ms]);
  return value;
}

/** Status pill styled for the ink-block hero (on-hero money colors). */
function StatusPill({ verdict }: { verdict: Verdict }) {
  if (verdict.kind === "green") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-hero-pos/15 px-2.5 py-1 text-caption text-hero-pos">
        <Check size={12} strokeWidth={2.5} /> Looks right
      </span>
    );
  }
  if (verdict.kind === "red") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-hero-neg/20 px-2.5 py-1 text-caption tabular-nums text-hero-neg">
        <CircleAlert size={12} strokeWidth={2.5} /> You're owed {fmtCents(verdict.owedCents)}
      </span>
    );
  }
  if (verdict.kind === "corrected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-hero-pos/15 px-2.5 py-1 text-caption text-hero-pos">
        <Check size={12} strokeWidth={2.5} /> Made whole
      </span>
    );
  }
  if (verdict.kind === "amber") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-caption text-amber">
        <CircleAlert size={12} strokeWidth={2.5} /> Needs a look
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-caption text-hero-fg/70">
      {verdict.kind === "progress" ? "Check in progress" : "Not checked yet"}
    </span>
  );
}

/** Quiet period switcher — full period management lives in Me. */
function PeriodPicker({
  periods,
  currentId,
  onSelect,
  onCreateNext,
}: {
  periods: PayPeriod[];
  currentId: string;
  onSelect: (id: string) => void;
  onCreateNext: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = periods.find((p) => p.id === currentId) ?? periods[0];
  return (
    <div id="tour-period" className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-full border border-surface-line bg-surface-card px-3.5 py-2 text-subhead font-medium shadow-card"
      >
        <CalendarRange size={15} className="text-ink-dim" />
        {periodLabel(current.startDate, current.endDate)}
        <ChevronDown size={15} className={`text-ink-dim transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <button
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}
      {open && (
        <div className="reveal absolute left-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-40px)] rounded-2xl border border-surface-line bg-surface-card p-2 shadow-lg">
          <div className="max-h-72 overflow-y-auto">
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onSelect(p.id);
                  setOpen(false);
                }}
                className={`pressable flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-subhead ${
                  p.id === current.id ? "bg-accent/10 font-semibold text-accent" : "hover:bg-surface-soft"
                } ${p.archived ? "opacity-60" : ""}`}
              >
                <span>{periodLabel(p.startDate, p.endDate)}</span>
                <span className="text-caption text-ink-dim">
                  {p.id === current.id ? "current" : p.archived ? "archived" : (p.actual?.net ?? "") !== "" ? "checked" : ""}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              onCreateNext();
              setOpen(false);
            }}
            className="pressable mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl border-t border-surface-line/60 px-3 py-2.5 text-left text-subhead font-semibold text-accent"
          >
            <Plus size={15} /> Start the next period
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home({
  record,
  periods,
  onSelectPeriod,
  onCreateNext,
  period,
  net,
  verdict,
  auditRows,
  actual,
  setActual,
  cfg,
  cfgDraft,
  shifts,
  tiers,
  onNow,
  onSetOnNow,
  whatIf,
  setWhatIf,
  identity,
  onSaveIdentity,
  apiKey,
  onFillExisting,
  onCreateAndFill,
  onYtdAnchor,
  ytd,
  year,
  paydayDelayDays,
  closeEnoughCents,
  corrections,
  setCorrections,
  backupStale,
  onGoToShifts,
  onGoToMe,
  initialView,
  onViewConsumed,
}: {
  record: PayPeriod;
  periods: PayPeriod[];
  onSelectPeriod: (id: string) => void;
  onCreateNext: () => void;
  period: PeriodResult;
  net: NetResult;
  verdict: Verdict;
  auditRows: AuditRow[];
  actual: Record<string, string>;
  setActual: (updater: (a: Record<string, string>) => Record<string, string>) => void;
  cfg: EngineConfig;
  cfgDraft: CfgDraft;
  shifts: Shift[];
  tiers: BonusTier[];
  onNow: OnNow | null;
  onSetOnNow: (v: OnNow | null) => void;
  whatIf: WhatIfDraft;
  setWhatIf: (wi: WhatIfDraft) => void;
  identity: EmailIdentity;
  onSaveIdentity: (identity: EmailIdentity) => void;
  apiKey: string;
  onFillExisting: (periodId: string, actual: Record<string, string>) => void;
  onCreateAndFill: (startDate: string, endDate: string, actual: Record<string, string>) => void;
  onYtdAnchor: (anchor: YtdAnchor) => void;
  ytd: YtdRollup;
  year: string;
  paydayDelayDays: number;
  closeEnoughCents: number;
  corrections: CorrectionDraft[];
  setCorrections: (updater: (arr: CorrectionDraft[]) => CorrectionDraft[]) => void;
  backupStale: boolean;
  onGoToShifts: () => void;
  onGoToMe: () => void;
  /** One-shot deep link from a period card ("Stub details") — consumed on mount. */
  initialView: "check" | "breakdown" | null;
  onViewConsumed: () => void;
}) {
  const [view, setView] = useState<"main" | "check" | "breakdown">(initialView ?? "main");
  useEffect(() => {
    if (initialView) onViewConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showGross, setShowGross] = useState(false);
  const heroCents = useCountUp(showGross ? period.grossCents : net.netCents);
  const empty = shifts.length === 0 && period.leaveHours === 0;

  // Quiet payday line while the check hasn't happened yet.
  const payday = paydayFor(record.endDate, paydayDelayDays);
  const untilPayday = daysUntil(todayIso(), payday);
  const showPayday =
    (verdict.kind === "intro" || verdict.kind === "progress") && untilPayday <= 3 && untilPayday >= -10;
  const paydayLine =
    untilPayday > 0
      ? `Payday ${dayLabel(payday)} — stub lands in Workday.`
      : untilPayday === 0
        ? "Payday today — snap your stub."
        : `Paid ${dayLabel(payday)} — snap your stub.`;

  if (view !== "main") {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setView("main")}
          className="pressable inline-flex min-h-11 items-center gap-1 py-2 text-subhead font-medium text-accent"
        >
          <ChevronLeft size={18} /> This check
        </button>
        <h2 className="text-title-2">{view === "check" ? "Check my paycheck" : "The breakdown"}</h2>
        {view === "check" ? (
          <Audit
            recordOnly={shifts.length === 0 && period.leaveHours === 0}
            closeEnoughCents={closeEnoughCents}
            corrections={corrections}
            setCorrections={setCorrections}
            rows={auditRows}
            actual={actual}
            setActual={setActual}
            verdict={verdict}
            cfg={cfg}
            shifts={shifts}
            periodStart={record.startDate}
            periodEnd={record.endDate}
            identity={identity}
            onSaveIdentity={onSaveIdentity}
            apiKey={apiKey}
            periods={periods}
            currentId={record.id}
            onFillExisting={onFillExisting}
            onCreateAndFill={onCreateAndFill}
            onYtdAnchor={onYtdAnchor}
          />
        ) : (
          <BreakdownCards period={period} net={net} cfgDraft={cfgDraft} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <PeriodPicker periods={periods} currentId={record.id} onSelect={onSelectPeriod} onCreateNext={onCreateNext} />
        {record.archived ? <span className="text-caption text-ink-dim">archived</span> : null}
      </div>

      {empty ? (
        <Card>
          <p className="text-body">No shifts yet — add them to see what this check should pay.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={onGoToShifts} className="btn btn-primary pressable">
              <ScanLine size={16} /> Scan schedule
            </button>
            <button onClick={onGoToShifts} className="btn btn-ghost pressable">
              <Plus size={16} /> Add a shift
            </button>
          </div>
        </Card>
      ) : (
        <>
          <LiveTicker record={record} shifts={shifts} cfg={cfg} onNow={onNow} onSetOnNow={onSetOnNow} />
          <div id="tour-hero">
          <Hero>
            <div className="flex items-start justify-between gap-3">
              <Eyebrow className="text-hero-fg/50">This check</Eyebrow>
              <StatusPill verdict={verdict} />
            </div>
            <div className="mt-3 text-hero-num tabular-nums">{fmtCents(heroCents)}</div>
            <div className="mt-1 text-subhead text-hero-fg/60">Expected this check</div>
            <div className="mt-3 inline-flex rounded-full bg-white/10 p-0.5">
              {([false, true] as const).map((gross) => (
                <button
                  key={String(gross)}
                  onClick={() => setShowGross(gross)}
                  className={`min-h-8 rounded-full px-3 py-1 text-caption transition ${
                    showGross === gross ? "bg-hero-fg font-semibold text-hero-bg" : "text-hero-fg/60"
                  }`}
                >
                  {gross ? "Before taxes" : "Take-home"}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-footnote text-hero-fg/60">
              <span>{fmtNum(period.workedHours)} hours</span>
              <span>{fmtUnits(period.units548)} bonus units</span>
              <span>{showGross ? `${fmtCents(net.netCents)} take-home` : `${fmtCents(period.grossCents)} before taxes`}</span>
            </div>
          </Hero>
          </div>

          <button id="tour-check" onClick={() => setView("check")} className="btn btn-primary pressable w-full">
            Check my paycheck
          </button>
          {showPayday && <p className="text-center text-footnote text-ink-dim">{paydayLine}</p>}
          <button
            onClick={() => setView("breakdown")}
            className="pressable mx-auto block min-h-11 px-3 py-2 text-subhead font-medium text-accent"
          >
            See the breakdown →
          </button>

          <WhyDifferent record={record} periods={periods} />

          <Disclosure title="What if I pick up a shift?" hint="One more shift, priced after taxes.">
            <WhatIfBody shifts={shifts} cfg={cfg} cfgDraft={cfgDraft} tiers={tiers} whatIf={whatIf} setWhatIf={setWhatIf} />
          </Disclosure>
        </>
      )}

      <TrophyCase periods={periods} closeEnoughCents={closeEnoughCents} />

      <button
        onClick={onGoToMe}
        className="pressable flex w-full items-baseline justify-between gap-3 rounded-2xl border border-surface-line bg-surface-card px-5 py-4 text-left shadow-card"
      >
        <span className="text-subhead text-ink-dim">
          {year} so far · made <span className="font-semibold text-ink">{fmtCents(ytd.totalGrossCents)}</span> · take-home{" "}
          <span className="font-semibold text-pos">{fmtCents(ytd.totalNetCents)}</span>
        </span>
        <span className="text-ink-dim">→</span>
      </button>

      {backupStale && (
        <button onClick={onGoToMe} className="pressable block w-full px-2 py-1 text-center text-footnote text-amber">
          Backup overdue — Me → Backup.
        </button>
      )}
    </div>
  );
}
