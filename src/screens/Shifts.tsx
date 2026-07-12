import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { isWeekend, type BonusTier, type EngineConfig, type PeriodResult } from "../lib/engine.ts";
import { blankShift, num, type ShiftDraft } from "../lib/draft.ts";
import { dayLabel, fmtNum } from "../lib/format.ts";
import { Field, StatTile } from "../ui/kit.tsx";
import ScanPanel from "./ScanPanel.tsx";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One shift: essentials always visible, the extra stuff behind a drop-down. */
function ShiftCard({
  s,
  expanded,
  onToggle,
  setShift,
  onRemove,
  tiers,
}: {
  s: ShiftDraft;
  expanded: boolean;
  onToggle: () => void;
  setShift: (key: keyof ShiftDraft, value: string) => void;
  onRemove: () => void;
  tiers: BonusTier[];
}) {
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
            className="input w-auto px-2.5 py-1.5 font-mono text-xs"
          />
          <div className={`mt-1 font-mono text-[10px] ${wknd ? "font-semibold text-pos" : "text-ink-dim"}`}>
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
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-dim">
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
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col">
              <span className="label">Add bonus tier</span>
              <select
                value=""
                onChange={(e) => {
                  const tier = tiers.find((t) => t.id === e.target.value);
                  if (tier) setShift("units548", String(round2(num(s.units548) + tier.units)));
                }}
                className="input w-auto max-w-[180px] px-2.5 py-1.5 font-mono text-xs"
              >
                <option value="">+ tier…</option>
                {tiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} (+{t.units}u)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-32 flex-1 flex-col">
              <span className="label">Note</span>
              <input
                value={s.note}
                onChange={(e) => setShift("note", e.target.value)}
                className="input px-2.5 py-1.5 font-mono text-xs"
              />
            </label>
            <button
              onClick={onRemove}
              className="pressable mb-1 flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-ink-dim hover:text-neg"
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
  tiers,
  period,
  unit548Label,
  cfg,
  apiKey,
  feedUrl,
  periodStart,
  periodEnd,
}: {
  shifts: ShiftDraft[];
  setShifts: (updater: (arr: ShiftDraft[]) => ShiftDraft[]) => void;
  tiers: BonusTier[];
  period: PeriodResult;
  unit548Label: string;
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
      <ScanPanel
        apiKey={apiKey}
        feedUrl={feedUrl}
        periodStart={periodStart}
        periodEnd={periodEnd}
        cfg={cfg}
        onApply={(mode, drafts) => setShifts((arr) => (mode === "replace" ? drafts : [...arr, ...drafts]))}
      />

      <p className="font-mono text-sm text-ink-dim">
        Date, hours, and 548 units up front — everything else is in each card's drop-down. Weekend diff applies itself
        on Sat/Sun. 1 unit = {unit548Label}.
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
            tiers={tiers}
          />
        ))}
      </div>

      <button onClick={addShift} className="btn btn-ghost pressable">
        <Plus size={15} /> Add shift
      </button>

      <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
        <StatTile label="Regular" value={fmtNum(period.regHours) + " h"} />
        <StatTile label="Overtime" value={fmtNum(period.otHours) + " h"} tone="amber" />
        <StatTile label="Double time" value={fmtNum(period.dtHours) + " h"} tone="neg" />
        <StatTile label="Total worked" value={fmtNum(period.workedHours) + " h"} tone="pos" />
      </div>
    </div>
  );
}
