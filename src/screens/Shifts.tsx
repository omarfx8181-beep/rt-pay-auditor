import { useState } from "react";
import { ChevronDown, HeartPulse, Plus, Trash2 } from "lucide-react";
import { isWeekend, LEAVE_LABELS, LEAVE_TYPES, type BonusTier, type EngineConfig, type LeaveType, type PeriodResult } from "../lib/engine.ts";
import { blankLeave, blankShift, num, todayIso, type LeaveDraft, type ShiftDraft } from "../lib/draft.ts";
import { dayLabel, fmtCents, fmtNum, fmtRate } from "../lib/format.ts";
import { periodLabel } from "../lib/periods.ts";
import { Card, Field, StatTile } from "../ui/kit.tsx";
import ScanPanel from "./ScanPanel.tsx";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One shift: essentials always visible, the extra stuff behind a drop-down. */
function ShiftCard({
  s,
  expanded,
  onToggle,
  setShift,
  onRemove,
  onCallIn,
  tiers,
}: {
  s: ShiftDraft;
  expanded: boolean;
  onToggle: () => void;
  setShift: (key: keyof ShiftDraft, value: string) => void;
  onRemove: () => void;
  onCallIn: () => void;
  tiers: BonusTier[];
}) {
  const [tierMenuOpen, setTierMenuOpen] = useState(false);
  const [confirmCallIn, setConfirmCallIn] = useState(false);
  const wknd = s.date !== "" && isWeekend(s.date);
  const extras: string[] = [];
  if (num(s.charge) > 0) extras.push(`chg ${s.charge}`);
  if (num(s.premium) > 0) extras.push(`prem ${s.premium}`);
  if (num(s.preceptor) > 0) extras.push(`pre ${s.preceptor}`);

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <input
            type="date"
            value={s.date}
            onChange={(e) => setShift("date", e.target.value)}
            className="input w-auto px-2.5 py-1.5 text-xs"
          />
          <div className={`mt-1 text-[10px] ${wknd ? "font-semibold text-pos" : "text-ink-dim"}`}>
            {s.date ? dayLabel(s.date) + (wknd ? " · wknd diff" : "") : "no date — no weekend diff"}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Field label="Paid hrs" value={s.hours} onChange={(v) => setShift("hours", v)} w="w-16" />
          <Field label="548 units" value={s.units548} onChange={(v) => setShift("units548", v)} w="w-14" />
        </div>
      </div>

      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="pressable mt-3 flex w-full items-center justify-between gap-2 border-t border-surface-line/60 pt-2.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-dim">
          {extras.length > 0 || s.note ? (
            <>
              {extras.join(" · ")}
              {extras.length > 0 && s.note ? " · " : ""}
              {s.note}
            </>
          ) : (
            "adders · tiers · note"
          )}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-ink-dim transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="reveal mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Charge" value={s.charge} onChange={(v) => setShift("charge", v)} w="w-full" />
            <Field label="Premium" value={s.premium} onChange={(v) => setShift("premium", v)} w="w-full" />
            <Field label="Precept" value={s.preceptor} onChange={(v) => setShift("preceptor", v)} w="w-full" />
          </div>
          <div>
            <button
              onClick={() => setTierMenuOpen((v) => !v)}
              aria-expanded={tierMenuOpen}
              className="pressable flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-dim hover:text-ink"
            >
              Add bonus tier
              <ChevronDown size={13} className={`transition-transform ${tierMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {tierMenuOpen && (
              <div className="reveal mt-2 flex flex-wrap gap-1.5">
                {tiers.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setShift("units548", String(round2(num(s.units548) + t.units)));
                      setTierMenuOpen(false);
                    }}
                    className="pressable rounded-full border border-surface-line bg-surface-card px-2.5 py-1 text-left text-[11px] hover:border-accent hover:text-accent"
                  >
                    {t.label} <span className="font-semibold text-accent">+{t.units}u</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-32 flex-1 flex-col">
              <span className="label">Note</span>
              <input
                value={s.note}
                onChange={(e) => setShift("note", e.target.value)}
                className="input px-2.5 py-1.5 text-xs"
              />
            </label>
            {confirmCallIn ? (
              <span className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider">
                <button onClick={onCallIn} className="pressable font-semibold text-blue">
                  Convert to STO?
                </button>
                <button onClick={() => setConfirmCallIn(false)} className="pressable text-ink-dim hover:text-ink">
                  Keep
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmCallIn(true)}
                className="pressable mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-ink-dim hover:text-blue"
              >
                <HeartPulse size={13} /> Called in sick
              </button>
            )}
            <button
              onClick={onRemove}
              className="pressable mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-ink-dim hover:text-neg"
            >
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Shifts({
  shifts,
  setShifts,
  leave,
  setLeave,
  tiers,
  period,
  cfg,
  apiKey,
  feedUrl,
  periodStart,
  periodEnd,
}: {
  shifts: ShiftDraft[];
  setShifts: (updater: (arr: ShiftDraft[]) => ShiftDraft[]) => void;
  leave: LeaveDraft[];
  setLeave: (updater: (arr: LeaveDraft[]) => LeaveDraft[]) => void;
  tiers: BonusTier[];
  period: PeriodResult;
  cfg: EngineConfig;
  apiKey: string;
  feedUrl: string;
  periodStart: string;
  periodEnd: string;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setShift = (id: string, key: keyof ShiftDraft, value: string) =>
    setShifts((arr) => arr.map((s) => (s.id === id ? { ...s, [key]: value } : s)));

  const addShift = () => {
    const fresh = blankShift();
    setShifts((arr) => [...arr, fresh]);
    setExpandedIds((prev) => new Set(prev).add(fresh.id)); // new shift opens ready to fill
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-large-title tracking-tight">Shifts</h1>
        <p className="mt-1 text-subhead text-ink-dim">Pay period {periodLabel(periodStart, periodEnd)}</p>
      </div>

      <ScanPanel
        apiKey={apiKey}
        feedUrl={feedUrl}
        periodStart={periodStart}
        periodEnd={periodEnd}
        cfg={cfg}
        onApply={(mode, drafts) => setShifts((arr) => (mode === "replace" ? drafts : [...arr, ...drafts]))}
      />

      <p className="text-sm text-ink-dim">
        Date, hours, and 548 units up front — everything else is in each card's drop-down. Weekend diff applies itself
        on Sat/Sun. 1 unit = {fmtCents(cfg.unit548Cents)}.
      </p>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        {shifts.map((s) => (
          <ShiftCard
            key={s.id}
            s={s}
            expanded={expandedIds.has(s.id)}
            onToggle={() => toggle(s.id)}
            setShift={(key, value) => setShift(s.id, key, value)}
            onRemove={() => setShifts((arr) => arr.filter((x) => x.id !== s.id))}
            onCallIn={() => {
              // Called in for THIS day: the scheduled shift becomes STO leave
              // with the same date and hours.
              const entry = { ...blankLeave("sto"), date: s.date || todayIso(), hours: s.hours };
              setLeave((arr) => [...arr, entry]);
              setShifts((arr) => arr.filter((x) => x.id !== s.id));
            }}
            tiers={tiers}
          />
        ))}
      </div>

      <button onClick={addShift} className="btn btn-ghost pressable">
        <Plus size={15} /> Add shift
      </button>

      <Card>
        <div className="mb-1 flex items-center gap-1.5">
          <HeartPulse size={13} className="text-blue" />
          <span className="eyebrow">Leave — sick · LOA · medical</span>
        </div>
        <p className="text-[11px] text-ink-dim">
          Calling in? One tap logs TODAY — hours prefill from today's scheduled shift when there is one. Paid at base
          rate ({fmtRate(cfg.baseRateCents)}/hr), never counts toward the 80-hr OT line, no weekend diff, and these
          hours don't accrue PTO. Kronos shows them as Time Off pay codes.
        </p>

        {leave.length > 0 && (
          <div className="mt-3 space-y-2">
            {leave.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 border-t border-surface-line/60 pt-2">
                <span className="w-32 text-xs">{LEAVE_LABELS[l.type]}</span>
                <input
                  type="date"
                  value={l.date}
                  onChange={(e) => setLeave((arr) => arr.map((x) => (x.id === l.id ? { ...x, date: e.target.value } : x)))}
                  className="input w-auto px-2 py-1 text-xs"
                />
                <input
                  value={l.hours}
                  onChange={(e) => setLeave((arr) => arr.map((x) => (x.id === l.id ? { ...x, hours: e.target.value } : x)))}
                  inputMode="decimal"
                  className="input w-16 px-2 py-1 text-right text-xs tabular-nums"
                />
                <span className="text-[11px] text-ink-dim">hrs</span>
                <button
                  onClick={() => setLeave((arr) => arr.filter((x) => x.id !== l.id))}
                  className="pressable p-1 text-ink-dim hover:text-neg"
                  aria-label="Remove leave"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {LEAVE_TYPES.map((type: LeaveType) => (
            <button
              key={type}
              onClick={() => {
                // Same-day call-in: today's date, and today's scheduled hours when known.
                const todaysShift = shifts.find((s) => s.date === todayIso() && num(s.hours) > 0);
                const entry = blankLeave(type);
                if (todaysShift) entry.hours = todaysShift.hours;
                setLeave((arr) => [...arr, entry]);
              }}
              className="btn btn-ghost pressable text-xs"
            >
              <Plus size={13} /> {LEAVE_LABELS[type]}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
        <StatTile label="Regular" value={fmtNum(period.regHours) + " h"} />
        <StatTile label="Overtime" value={fmtNum(period.otHours) + " h"} tone="amber" />
        <StatTile label="Double time" value={fmtNum(period.dtHours) + " h"} tone="neg" />
        <StatTile label="Total worked" value={fmtNum(period.workedHours) + " h"} tone="pos" />
        {period.leaveHours > 0 && <StatTile label="Leave (base)" value={fmtNum(period.leaveHours) + " h"} sub="non-PTO-accruing" />}
      </div>
    </div>
  );
}
