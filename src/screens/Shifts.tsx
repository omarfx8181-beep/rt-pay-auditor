import { Plus, Trash2 } from "lucide-react";
import { isWeekend, type BonusTier, type PeriodResult } from "../lib/engine.ts";
import { blankShift, num, type ShiftDraft } from "../lib/draft.ts";
import { dayLabel, fmtNum } from "../lib/format.ts";
import { Field, StatTile } from "../ui/kit.tsx";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function Shifts({
  shifts,
  setShifts,
  tiers,
  period,
  unit548Label,
}: {
  shifts: ShiftDraft[];
  setShifts: (updater: (arr: ShiftDraft[]) => ShiftDraft[]) => void;
  tiers: BonusTier[];
  period: PeriodResult;
  unit548Label: string;
}) {
  const setShift = (id: string, key: keyof ShiftDraft, value: string) =>
    setShifts((arr) => arr.map((s) => (s.id === id ? { ...s, [key]: value } : s)));

  return (
    <div className="space-y-3">
      <p className="font-mono text-sm text-ink-dim">
        One card per shift. Weekend diff applies itself on Sat/Sun dates. 1 unit of 548 = {unit548Label}.
      </p>

      {shifts.map((s) => {
        const wknd = s.date !== "" && isWeekend(s.date);
        return (
          <section key={s.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <input
                  type="date"
                  value={s.date}
                  onChange={(e) => setShift(s.id, "date", e.target.value)}
                  className="input w-auto px-2.5 py-1.5 font-mono text-xs"
                />
                <div className={`mt-1 font-mono text-[10px] ${wknd ? "font-semibold text-pos" : "text-ink-dim"}`}>
                  {s.date ? dayLabel(s.date) + (wknd ? " · wknd diff" : "") : "no date — no weekend diff"}
                </div>
              </div>
              <button
                onClick={() => setShifts((arr) => arr.filter((x) => x.id !== s.id))}
                className="pressable p-1 text-ink-dim hover:text-neg"
                aria-label="Remove shift"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
              <Field label="Paid hrs" value={s.hours} onChange={(v) => setShift(s.id, "hours", v)} w="w-full" />
              <Field label="Charge" value={s.charge} onChange={(v) => setShift(s.id, "charge", v)} w="w-full" />
              <Field label="Premium" value={s.premium} onChange={(v) => setShift(s.id, "premium", v)} w="w-full" />
              <Field label="Precept" value={s.preceptor} onChange={(v) => setShift(s.id, "preceptor", v)} w="w-full" />
              <Field label="548 units" value={s.units548} onChange={(v) => setShift(s.id, "units548", v)} w="w-full" />
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col">
                <span className="label">Add bonus tier</span>
                <select
                  value=""
                  onChange={(e) => {
                    const tier = tiers.find((t) => t.id === e.target.value);
                    if (tier) setShift(s.id, "units548", String(round2(num(s.units548) + tier.units)));
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
                  onChange={(e) => setShift(s.id, "note", e.target.value)}
                  className="input px-2.5 py-1.5 font-mono text-xs"
                />
              </label>
            </div>
          </section>
        );
      })}

      <button onClick={() => setShifts((arr) => [...arr, blankShift()])} className="btn btn-ghost pressable">
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
