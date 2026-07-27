/**
 * Two more places payroll can be wrong, same distrust applied:
 * the time-off bank (PTO/STO accrual) and, come January, the W-2.
 * Both live as collapsed cards under Me → Your periods & data.
 */
import { Landmark, ShieldCheck } from "lucide-react";
import type { Cents } from "../lib/engine.ts";
import type { PayPeriod } from "../lib/periods.ts";
import { auditPto, PTO_TOLERANCE_HOURS, ptoValueCents, type PtoConfig } from "../lib/pto.ts";
import { estimateW2, EMPTY_W2, type W2Typed } from "../lib/w2.ts";
import { num } from "../lib/draft.ts";
import { fmtCents, fmtNum } from "../lib/format.ts";
import { Disclosure } from "../ui/kit.tsx";

function MiniRow({
  label,
  hint,
  value,
  onChange,
  suffix,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  type?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-surface-line/60 py-2.5 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <div className="text-subhead">{label}</div>
        {hint ? <div className="mt-0.5 text-footnote text-ink-dim">{hint}</div> : null}
      </div>
      <span className="flex shrink-0 items-center gap-1.5">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={type === "date" ? undefined : "decimal"}
          className={`input ${type === "date" ? "w-auto" : "w-24"} px-2.5 py-2 text-right text-[16px] tabular-nums`}
        />
        {suffix ? <span className="w-8 text-footnote text-ink-dim">{suffix}</span> : null}
      </span>
    </div>
  );
}

export function PtoCard({
  periods,
  pto,
  onSavePto,
  baseRateCents,
}: {
  periods: PayPeriod[];
  pto: PtoConfig;
  onSavePto: (next: PtoConfig) => void;
  baseRateCents: Cents;
}) {
  const set = (key: keyof PtoConfig) => (v: string) => onSavePto({ ...pto, [key]: v });
  const audit = auditPto(periods, pto);
  return (
    <Disclosure
      title="Time off bank — is Kronos right?"
      icon={<Landmark size={13} className="text-blue" />}
      hint="Checks your PTO balance against your logged hours."
    >
      <MiniRow
        label="Accrual rate"
        hint="Hours per hour worked — e.g. 0.0577, on your accrual statement."
        value={pto.accrualPerHour}
        onChange={set("accrualPerHour")}
        suffix="hrs"
      />
      <MiniRow label="Bank cap" hint="Blank if your bank has no ceiling." value={pto.capHours} onChange={set("capHours")} suffix="hrs" />
      <MiniRow
        label="Known-good balance"
        hint="Off a stub or Kronos on a day you trusted it."
        value={pto.startBalance}
        onChange={set("startBalance")}
        suffix="hrs"
      />
      <MiniRow label="…as of" type="date" value={pto.asOf} onChange={set("asOf")} />
      <MiniRow label="Kronos shows right now" value={pto.kronosSays} onChange={set("kronosSays")} suffix="hrs" />

      {audit === null ? (
        <p className="mt-3 text-footnote text-ink-dim">Enter the accrual rate and a known-good balance to start.</p>
      ) : (
        <div className="mt-3 border-t border-surface-line/60 pt-3">
          <p className="text-subhead">
            The bank should read <span className="font-semibold tabular-nums">{fmtNum(audit.expectedHours)} hours</span>{" "}
            <span className="text-ink-dim">(≈ {fmtCents(ptoValueCents(audit.expectedHours, baseRateCents))} at your base rate)</span>
          </p>
          <p className="mt-1 text-footnote tabular-nums text-ink-dim">
            {pto.startBalance || "0"} to start + {fmtNum(audit.accruedHours)} earned on {fmtNum(audit.workedHours)} worked hrs −{" "}
            {fmtNum(audit.usedHours)} sick used{audit.capped ? " · capped" : ""}
          </p>
          {audit.deltaHours !== null &&
            (Math.abs(audit.deltaHours) <= PTO_TOLERANCE_HOURS ? (
              <p className="mt-2 text-footnote text-pos">✓ Kronos agrees, within rounding.</p>
            ) : audit.deltaHours > 0 ? (
              <p className="mt-2 text-footnote text-amber">
                Kronos shows {fmtNum(audit.deltaHours)} hours LESS than expected — that's ≈{" "}
                {fmtCents(ptoValueCents(audit.deltaHours, baseRateCents))} of bank time. Worth asking payroll.
              </p>
            ) : (
              <p className="mt-2 text-footnote text-ink-dim">
                Kronos shows {fmtNum(-audit.deltaHours)} hours more than the app expects — a grant or adjustment the
                app hasn't seen? Update the known-good balance to today and it re-anchors.
              </p>
            ))}
          {audit.skippedPeriods > 0 && (
            <p className="mt-2 text-footnote text-ink-dim">
              {audit.skippedPeriods} backfilled check{audit.skippedPeriods === 1 ? "" : "s"} carry only totals — no
              hours to accrue from. Anchor the balance after them for a clean start.
            </p>
          )}
        </div>
      )}
    </Disclosure>
  );
}

export function W2Card({
  periods,
  year,
  typed,
  onSaveTyped,
}: {
  periods: PayPeriod[];
  year: string;
  typed: W2Typed;
  onSaveTyped: (next: W2Typed) => void;
}) {
  const est = estimateW2(periods, year);
  if (est === null) return null;
  const rows: Array<{ key: keyof W2Typed; label: string; estCents: Cents }> = [
    { key: "box1", label: "Box 1 — wages", estCents: est.box1Cents },
    { key: "box2", label: "Box 2 — federal withheld", estCents: est.box2Cents },
    { key: "box3", label: "Box 3 — Social Security wages", estCents: est.box3Cents },
    { key: "box5", label: "Box 5 — Medicare wages", estCents: est.box5Cents },
    { key: "box16", label: "Box 16 — MN wages", estCents: est.box16Cents },
    { key: "box17", label: "Box 17 — MN withheld", estCents: est.box17Cents },
  ];
  return (
    <Disclosure
      title={`W-2 check — ${year}`}
      icon={<ShieldCheck size={13} className="text-accent" />}
      hint="When the W-2 arrives in January: what each box should say, from your own year."
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2">
        <div className="label mb-0 py-1">Box</div>
        <div className="label mb-0 w-24 py-1 text-right">Should say</div>
        <div className="label mb-0 w-24 py-1 text-right">Your W-2</div>
        {rows.map((r) => {
          const raw = typed[r.key] ?? "";
          const deltaCents = raw.trim() === "" ? null : Math.round(num(raw.replace(/[$,]/g, "")) * 100) - r.estCents;
          return (
            <div key={r.key} className="col-span-3 grid grid-cols-subgrid items-center border-t border-surface-line/60 py-1.5">
              <div className="min-w-0 pr-1">
                <div className="text-sm leading-tight">{r.label}</div>
                {deltaCents !== null && (
                  <div className={`text-caption tabular-nums ${Math.abs(deltaCents) <= 100 ? "text-pos" : "text-amber"}`}>
                    {Math.abs(deltaCents) <= 100 ? "✓ matches" : `${deltaCents > 0 ? "+" : "−"}${fmtCents(Math.abs(deltaCents)).slice(1)} off`}
                  </div>
                )}
              </div>
              <div className="w-24 text-right text-sm tabular-nums text-ink-dim">{fmtCents(r.estCents)}</div>
              <input
                value={raw}
                onChange={(e) => onSaveTyped({ ...EMPTY_W2, ...typed, [r.key]: e.target.value })}
                inputMode="decimal"
                className="input w-24 px-2 py-1.5 text-right text-[16px] tabular-nums"
                aria-label={`${r.label} from your W-2`}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-footnote text-ink-dim">
        Estimates from your logged year — anything more than a dollar off is worth a question before you file.
        {est.totalsOnlyCount > 0 &&
          ` ${est.totalsOnlyCount} check${est.totalsOnlyCount === 1 ? "" : "s"} carry only totals, so their pretax split is estimated.`}
        {est.correctionGrossCents > 0 && " Correction-check withholding isn't visible to the app, so boxes 2 and 17 may read low."}
        {" "}High earners: the Social Security wage cap isn't modeled.
      </p>
    </Disclosure>
  );
}
