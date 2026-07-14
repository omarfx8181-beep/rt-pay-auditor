/**
 * Shifts — friendly cards, edited in a bottom sheet (V3 §4).
 * Each shift shows as date + hours + human tags ("Weekend", "Charge",
 * "2 bonus units") — no codes. Tap to edit in the sheet: big controls,
 * plain toggles for the extra-pay adders, a stepper for bonus units,
 * and the weekly tier chips. Scan stays on top; leave keeps one-tap
 * call-ins; the hour tiles read the period at a glance.
 */
import { useState } from "react";
import { HeartPulse, Minus, Plus, Trash2 } from "lucide-react";
import { isWeekend, LEAVE_LABELS, LEAVE_TYPES, type BonusTier, type EngineConfig, type LeaveType, type PeriodResult } from "../lib/engine.ts";
import { blankLeave, blankShift, num, todayIso, type LeaveDraft, type ShiftDraft } from "../lib/draft.ts";
import { dayLabel, fmtCents, fmtNum, fmtRate, fmtUnits } from "../lib/format.ts";
import { periodLabel } from "../lib/periods.ts";
import { Card, Sheet, StatTile } from "../ui/kit.tsx";
import ScanPanel from "./ScanPanel.tsx";

const round2 = (n: number) => Math.round(n * 100) / 100;

function Tag({ children, tone = "soft" }: { children: React.ReactNode; tone?: "soft" | "pos" | "accent" }) {
  const tones = {
    soft: "bg-surface-soft text-ink-dim",
    pos: "bg-pos/10 text-pos",
    accent: "bg-accent/10 text-accent",
  } as const;
  return <span className={`rounded-full px-2 py-0.5 text-caption ${tones[tone]}`}>{children}</span>;
}

/** The friendly list card: the shift at a glance, tap to edit. */
function ShiftRow({ s, onOpen }: { s: ShiftDraft; onOpen: () => void }) {
  const wknd = s.date !== "" && isWeekend(s.date);
  return (
    <button onClick={onOpen} className="card pressable w-full p-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-headline">{s.date ? dayLabel(s.date) : "No date yet"}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {wknd && <Tag tone="pos">Weekend</Tag>}
            {num(s.units548) > 0 && <Tag tone="accent">{fmtUnits(num(s.units548))} bonus unit{num(s.units548) === 1 ? "" : "s"}</Tag>}
            {num(s.charge) > 0 && <Tag>Charge {s.charge}h</Tag>}
            {num(s.premium) > 0 && <Tag>Premium {s.premium}h</Tag>}
            {num(s.preceptor) > 0 && <Tag>Precepting {s.preceptor}h</Tag>}
            {s.note && <Tag>{s.note}</Tag>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-title-2 tabular-nums">{fmtNum(num(s.hours))}</div>
          <div className="text-caption text-ink-dim">hours</div>
        </div>
      </div>
    </button>
  );
}

/** Plain on/off for an adder; hours editable while on. */
function AdderToggle({
  label,
  hint,
  hours,
  defaultHours,
  onChange,
}: {
  label: string;
  hint: string;
  hours: string;
  defaultHours: string;
  onChange: (v: string) => void;
}) {
  const on = num(hours) > 0;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-surface-line/60 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-subhead">{label}</div>
        <div className="text-footnote text-ink-dim">{hint}</div>
      </div>
      {on && (
        <span className="flex items-center gap-1">
          <input
            value={hours}
            onChange={(e) => onChange(e.target.value)}
            inputMode="decimal"
            className="input w-16 px-2 py-1.5 text-right text-[16px] tabular-nums"
            aria-label={`${label} hours`}
          />
          <span className="text-footnote text-ink-dim">h</span>
        </span>
      )}
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(on ? "0" : defaultHours)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-soft"}`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-surface-card shadow-card transition-all ${on ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

/** The bottom-sheet editor: big controls, plain words, no codes. */
function ShiftSheet({
  s,
  tiers,
  unitValueCents,
  onSet,
  onRemove,
  onCallIn,
  onClose,
}: {
  s: ShiftDraft;
  tiers: BonusTier[];
  unitValueCents: number;
  onSet: (key: keyof ShiftDraft, value: string) => void;
  onRemove: () => void;
  onCallIn: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<"" | "remove" | "callin">("");
  const wknd = s.date !== "" && isWeekend(s.date);
  const units = num(s.units548);
  const stepUnits = (d: number) => onSet("units548", String(round2(Math.max(0, units + d))));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col">
          <span className="label">Date</span>
          <input
            type="date"
            value={s.date}
            onChange={(e) => onSet("date", e.target.value)}
            className="input px-3 py-2.5 text-[16px]"
          />
        </label>
        <label className="flex flex-col">
          <span className="label">Paid hours</span>
          <input
            value={s.hours}
            onChange={(e) => onSet("hours", e.target.value)}
            inputMode="decimal"
            className="input px-3 py-2.5 text-[16px] tabular-nums"
          />
        </label>
      </div>
      <p className="text-footnote text-ink-dim">
        {s.date
          ? wknd
            ? "Weekend — weekend pay adds itself. ✓"
            : "Weekday — weekend pay adds itself on Saturday and Sunday."
          : "Pick a date so weekend pay can apply itself."}
      </p>

      <div>
        <span className="label">Critical shift bonus</span>
        <div className="mt-1 flex items-center gap-3">
          <button
            onClick={() => stepUnits(-1)}
            disabled={units <= 0}
            className="btn btn-ghost pressable size-11 px-0"
            aria-label="One bonus unit fewer"
          >
            <Minus size={17} />
          </button>
          <div className="w-20 text-center">
            <div className="text-title-2 tabular-nums">{fmtUnits(units)}</div>
            <div className="text-caption text-ink-dim">unit{units === 1 ? "" : "s"}</div>
          </div>
          <button onClick={() => stepUnits(1)} className="btn btn-ghost pressable size-11 px-0" aria-label="One bonus unit more">
            <Plus size={17} />
          </button>
          <span className="flex-1 text-right text-subhead tabular-nums text-ink-dim">
            = {fmtCents(Math.round(units * unitValueCents))}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {tiers.map((t) => (
            <button
              key={t.id}
              onClick={() => onSet("units548", String(round2(units + t.units)))}
              className="pressable rounded-full border border-surface-line bg-surface-card px-2.5 py-1.5 text-left text-caption hover:border-accent hover:text-accent"
            >
              {t.label} <span className="font-semibold text-accent">+{fmtUnits(t.units)}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-footnote text-ink-dim">This week's tiers — edit them in Me → Bonus tiers.</p>
      </div>

      <div>
        <span className="label">Extra pay</span>
        <AdderToggle
          label="Charge"
          hint="You ran the unit."
          hours={s.charge}
          defaultHours={s.hours || "12"}
          onChange={(v) => onSet("charge", v)}
        />
        <AdderToggle
          label="Premium"
          hint="Premium-pay shift — a transport day counts the whole day."
          hours={s.premium}
          defaultHours={s.hours || "12"}
          onChange={(v) => onSet("premium", v)}
        />
        <AdderToggle
          label="Precepting"
          hint="You trained someone."
          hours={s.preceptor}
          defaultHours={s.hours || "12"}
          onChange={(v) => onSet("preceptor", v)}
        />
      </div>

      <label className="flex flex-col">
        <span className="label">Note</span>
        <input
          value={s.note}
          onChange={(e) => onSet("note", e.target.value)}
          placeholder="16-hr extra, transport run…"
          className="input px-3 py-2.5 text-[16px]"
        />
      </label>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-surface-line/60 pt-3">
        {confirming === "callin" ? (
          <span className="flex items-center gap-2 text-caption">
            <button onClick={onCallIn} className="pressable min-h-11 font-semibold text-blue">
              Log as sick time?
            </button>
            <button onClick={() => setConfirming("")} className="pressable min-h-11 text-ink-dim">
              Keep the shift
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming("callin")}
            className="pressable flex min-h-11 items-center gap-1 text-caption text-ink-dim hover:text-blue"
          >
            <HeartPulse size={14} /> Called in sick
          </button>
        )}
        {confirming === "remove" ? (
          <span className="flex items-center gap-2 text-caption">
            <button onClick={onRemove} className="pressable min-h-11 font-semibold text-neg">
              Really remove?
            </button>
            <button onClick={() => setConfirming("")} className="pressable min-h-11 text-ink-dim">
              Keep
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming("remove")}
            className="pressable flex min-h-11 items-center gap-1 text-caption text-ink-dim hover:text-neg"
          >
            <Trash2 size={14} /> Remove shift
          </button>
        )}
      </div>

      <button onClick={onClose} className="btn btn-primary pressable w-full">
        Done
      </button>
    </div>
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = shifts.find((s) => s.id === editingId) ?? null;

  const setShift = (id: string, key: keyof ShiftDraft, value: string) =>
    setShifts((arr) => arr.map((s) => (s.id === id ? { ...s, [key]: value } : s)));

  const addShift = () => {
    const fresh = blankShift();
    setShifts((arr) => [...arr, fresh]);
    setEditingId(fresh.id); // new shift opens in the sheet, ready to fill
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

      {shifts.length === 0 ? (
        <Card>
          <p className="text-body">Your shifts live here. The more you add, the sharper your paycheck check.</p>
          <button onClick={addShift} className="btn btn-primary pressable mt-4">
            <Plus size={16} /> Add a shift
          </button>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
            {shifts.map((s) => (
              <ShiftRow key={s.id} s={s} onOpen={() => setEditingId(s.id)} />
            ))}
          </div>
          <button onClick={addShift} className="btn btn-ghost pressable">
            <Plus size={15} /> Add shift
          </button>
        </>
      )}

      <Sheet open={editing !== null} onClose={() => setEditingId(null)} title={editing?.date ? dayLabel(editing.date) : "New shift"}>
        {editing && (
          <ShiftSheet
            s={editing}
            tiers={tiers}
            unitValueCents={cfg.unit548Cents}
            onSet={(key, value) => setShift(editing.id, key, value)}
            onRemove={() => {
              setShifts((arr) => arr.filter((x) => x.id !== editing.id));
              setEditingId(null);
            }}
            onCallIn={() => {
              // Called in for THIS day: the scheduled shift becomes STO leave
              // with the same date and hours.
              const entry = { ...blankLeave("sto"), date: editing.date || todayIso(), hours: editing.hours };
              setLeave((arr) => [...arr, entry]);
              setShifts((arr) => arr.filter((x) => x.id !== editing.id));
              setEditingId(null);
            }}
            onClose={() => setEditingId(null)}
          />
        )}
      </Sheet>

      <Card>
        <div className="mb-1 flex items-center gap-1.5">
          <HeartPulse size={13} className="text-blue" />
          <span className="eyebrow">Leave — sick · LOA · medical</span>
        </div>
        <p className="text-footnote text-ink-dim">
          Calling in? One tap logs today — hours prefill from today's scheduled shift when there is one. Paid at your
          base rate (${fmtRate(cfg.baseRateCents)}/hr), never counts toward overtime, no weekend pay, and these hours
          don't earn PTO. They show on your timecard as Time Off.
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
                <span className="text-footnote text-ink-dim">hrs</span>
                <button
                  onClick={() => setLeave((arr) => arr.filter((x) => x.id !== l.id))}
                  className="pressable p-2.5 text-ink-dim hover:text-neg"
                  aria-label="Remove leave"
                >
                  <Trash2 size={14} />
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
        {period.leaveHours > 0 && <StatTile label="Leave" value={fmtNum(period.leaveHours) + " h"} sub="paid, no PTO earned" />}
      </div>
    </div>
  );
}
