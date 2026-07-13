/**
 * Home — "This Check" (V3 brief §4).
 * The answer lives here: a quiet period selector, the status hero card,
 * "Check my paycheck" as the primary action, the what-if card, and a
 * quiet year line. Detail is one tap down: the check flow and the full
 * breakdown are sub-views of Home, not tabs.
 */
import { useState } from "react";
import { CalendarRange, Check, ChevronDown, ChevronLeft, CircleAlert, Plus, ScanLine } from "lucide-react";
import type { EngineConfig, NetResult, PeriodResult, Shift } from "../lib/engine.ts";
import type { CfgDraft } from "../lib/draft.ts";
import type { AuditRow } from "../lib/audit.ts";
import type { Verdict } from "../lib/verdict.ts";
import type { EmailIdentity } from "../lib/hrEmail.ts";
import { periodLabel, type PayPeriod, type YtdRollup } from "../lib/periods.ts";
import { fmtCents, fmtNum, fmtUnits } from "../lib/format.ts";
import { Card, Disclosure, Eyebrow, Hero } from "../ui/kit.tsx";
import Audit from "./Audit.tsx";
import { BreakdownCards, WhatIfBody, type WhatIfDraft } from "./Paycheck.tsx";

/** Status pill styled for the ink-block hero (on-hero money colors). */
function StatusPill({ verdict }: { verdict: Verdict }) {
  if (verdict.kind === "green") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-hero-pos/15 px-2.5 py-1 text-caption text-hero-pos">
        <Check size={12} strokeWidth={2.5} /> Checked — looks right
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
    <div className="relative">
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
  whatIf,
  setWhatIf,
  identity,
  onSaveIdentity,
  ytd,
  year,
  onGoToShifts,
  onGoToMe,
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
  whatIf: WhatIfDraft;
  setWhatIf: (wi: WhatIfDraft) => void;
  identity: EmailIdentity;
  onSaveIdentity: (identity: EmailIdentity) => void;
  ytd: YtdRollup;
  year: string;
  onGoToShifts: () => void;
  onGoToMe: () => void;
}) {
  const [view, setView] = useState<"main" | "check" | "breakdown">("main");
  const [showGross, setShowGross] = useState(false);
  const empty = shifts.length === 0 && period.leaveHours === 0;

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
          <p className="text-body">
            No shifts yet. Add a few — or snap your schedule — and we'll show what your next check should look like.
          </p>
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
          <Hero>
            <div className="flex items-start justify-between gap-3">
              <Eyebrow className="text-hero-fg/50">This check</Eyebrow>
              <StatusPill verdict={verdict} />
            </div>
            <div className="mt-3 text-hero-num tabular-nums">
              {fmtCents(showGross ? period.grossCents : net.netCents)}
            </div>
            <div className="mt-1 text-subhead text-hero-fg/60">
              {showGross ? "Expected pay before taxes" : "Expected take-home this period"}
            </div>
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
              <span>{fmtCents(period.grossCents)} before taxes</span>
            </div>
          </Hero>

          <button onClick={() => setView("check")} className="btn btn-primary pressable w-full">
            Check my paycheck
          </button>
          <button
            onClick={() => setView("breakdown")}
            className="pressable mx-auto block min-h-11 px-3 py-2 text-subhead font-medium text-accent"
          >
            See the breakdown →
          </button>

          <Disclosure
            title="What if I pick up a shift?"
            hint="See what one more shift would actually put in your account."
          >
            <WhatIfBody shifts={shifts} cfg={cfg} cfgDraft={cfgDraft} whatIf={whatIf} setWhatIf={setWhatIf} />
          </Disclosure>
        </>
      )}

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
    </div>
  );
}
