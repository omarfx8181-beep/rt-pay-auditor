/**
 * The breakdown + the what-if — composed by Home (V3 §4).
 * Breakdown rows are progressive-disclosure (§3.5): the answer (label +
 * amount) → tap → the story (plain words) → tap → the receipt (formula
 * and the stub's own line name, codes included — this is the one place
 * codes may appear outside the HR email).
 */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { computeWhatIf, type EngineConfig, type NetResult, type PayLine, type PeriodResult, type Shift } from "../lib/engine.ts";
import { num, type CfgDraft } from "../lib/draft.ts";
import { fmtCents, fmtNum, fmtRate, fmtUnits } from "../lib/format.ts";
import { plainLabel } from "../lib/labels.ts";
import { Card, Field } from "../ui/kit.tsx";

export interface WhatIfDraft {
  hours: string;
  units548: string;
  weekend: boolean;
  charge: string;
}

/** One pay line: answer → story → receipt on successive taps. */
function PayRow({
  label,
  amount,
  negative,
  story,
  receipt,
}: {
  label: string;
  amount: string;
  negative?: boolean;
  story: string;
  receipt: string;
}) {
  const [level, setLevel] = useState(0);
  return (
    <div>
      <button
        onClick={() => setLevel((l) => (l + 1) % 3)}
        aria-expanded={level > 0}
        className="pressable flex min-h-11 w-full items-baseline justify-between gap-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1 text-sm">{label}</span>
        <span className={`text-sm tabular-nums ${negative ? "text-neg" : ""}`}>{amount}</span>
        <ChevronDown
          size={13}
          className={`mb-0.5 shrink-0 self-center text-ink-dim/60 transition-transform ${level > 0 ? "rotate-180" : ""}`}
        />
      </button>
      {level >= 1 && <p className="reveal pb-2 pr-6 text-footnote text-ink-dim">{story}</p>}
      {level >= 2 && <p className="reveal pb-2.5 pr-6 text-caption tabular-nums text-ink-dim">{receipt}</p>}
    </div>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-surface-line/60">{children}</div>;
}

/** Plain-words story for an earnings line, from its own quantities. */
function earningsStory(l: PayLine): string {
  if (l.key === "imputed") return "On the stub but never cash — it's taxed, then taken back out.";
  if (l.qty === 0) return "Nothing this period.";
  return l.isUnits
    ? `${fmtUnits(l.qty)} bonus units at ${fmtCents(l.rateCents)} each.`
    : `${fmtNum(l.qty)} hours at $${fmtRate(l.rateCents)}/hr.`;
}

/** The receipt: the stub's own line name and the math, verbatim. */
function earningsReceipt(l: PayLine): string {
  if (l.qty === 0) return `On the stub as "${l.label}" · ${fmtCents(l.amountCents)}`;
  return `On the stub as "${l.label}" · ${l.isUnits ? fmtUnits(l.qty) : fmtNum(l.qty)} × $${fmtRate(l.rateCents)} = ${fmtCents(l.amountCents)}`;
}

export function BreakdownCards({
  period,
  net,
  cfgDraft,
}: {
  period: PeriodResult;
  net: NetResult;
  cfgDraft: CfgDraft;
}) {
  const cashCents = period.grossCents - net.imputedCents;
  const deductions: Array<{ key: string; label: string; cents: number; story: string; receipt: string }> = [
    {
      key: "fed",
      label: "Federal tax withheld",
      cents: net.fedCents,
      story: "Withheld for federal income tax, at the rate calibrated from your real stub.",
      receipt: `${cfgDraft.fedEff}% × ${fmtCents(net.fedTaxableCents)} taxable = ${fmtCents(net.fedCents)}`,
    },
    {
      key: "mn",
      label: "Minnesota tax withheld",
      cents: net.mnCents,
      story: "Withheld for Minnesota income tax, calibrated the same way.",
      receipt: `${cfgDraft.mnEff}% × ${fmtCents(net.fedTaxableCents)} taxable = ${fmtCents(net.mnCents)}`,
    },
    {
      key: "ss",
      label: "Social Security",
      cents: net.ssCents,
      story: "The flat federal cut. Health premiums come out first; retirement savings don't.",
      receipt: `6.2% × ${fmtCents(net.ficaWagesCents)} = ${fmtCents(net.ssCents)}`,
    },
    {
      key: "medicare",
      label: "Medicare",
      cents: net.medicareCents,
      story: "Medicare's flat cut, on the same wages as Social Security.",
      receipt: `1.45% × ${fmtCents(net.ficaWagesCents)} = ${fmtCents(net.medicareCents)}`,
    },
    {
      key: "mnFam",
      label: "MN paid family leave",
      cents: net.mnFamCents,
      story: "Your share of Minnesota's paid-leave program — the standard statewide rate.",
      receipt: `${cfgDraft.mnFam}% × ${fmtCents(period.grossCents)} full pay = ${fmtCents(net.mnFamCents)}`,
    },
    {
      key: "mnMed",
      label: "MN paid medical leave",
      cents: net.mnMedCents,
      story: "The medical share of the same program.",
      receipt: `${cfgDraft.mnMed}% × ${fmtCents(period.grossCents)} full pay = ${fmtCents(net.mnMedCents)}`,
    },
    {
      key: "k403",
      label: `Retirement savings — ${cfgDraft.k403bPct}%`,
      cents: net.k403Cents,
      story: "Into your retirement account before income tax touches it.",
      receipt: `${cfgDraft.k403bPct}% × ${fmtCents(cashCents)} cash pay = ${fmtCents(net.k403Cents)}`,
    },
    {
      key: "s125",
      label: "Health, dental & FSA (pretax)",
      cents: net.s125Cents,
      story: "Your medical, dental, and FSA premiums, taken before tax.",
      receipt: `$${cfgDraft.med} medical + $${cfgDraft.dent} dental + $${cfgDraft.fsa} FSA = ${fmtCents(net.s125Cents)}`,
    },
    {
      key: "aftertax",
      label: "After-tax deductions",
      cents: net.afterTaxCents,
      story: "Accident and critical-illness insurance, plus everything else payroll takes after tax.",
      receipt: `$${cfgDraft.acc} + $${cfgDraft.crit} + $${cfgDraft.otherAfterTax} = ${fmtCents(net.afterTaxCents)}`,
    },
    {
      key: "imputed",
      label: "Life insurance (non-cash)",
      cents: net.imputedCents,
      story: "Employer life insurance the IRS taxes but you never receive as money.",
      receipt: `On the stub as "Imputed – Basic Term Life" · ${fmtCents(net.imputedCents)}`,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card title="What you earned — tap a line for the story, twice for the receipt">
        <Rows>
          {period.lines
            .filter((l) => l.amountCents !== 0)
            .map((l) => (
              <PayRow
                key={l.key}
                label={plainLabel(l.key, l.label)}
                amount={fmtCents(l.amountCents)}
                story={earningsStory(l)}
                receipt={earningsReceipt(l)}
              />
            ))}
          <div className="flex items-baseline justify-between py-2.5">
            <span className="text-headline">Total before taxes</span>
            <span className="text-headline tabular-nums text-pos">{fmtCents(period.grossCents)}</span>
          </div>
        </Rows>
      </Card>

      <Card title="From pay to take-home">
        <Rows>
          {deductions.map((d) => (
            <PayRow key={d.key} label={d.label} amount={fmtCents(-d.cents)} negative story={d.story} receipt={d.receipt} />
          ))}
          <div className="flex items-baseline justify-between py-2.5">
            <span className="text-headline">Take-home</span>
            <span className="text-headline tabular-nums text-pos">{fmtCents(net.netCents)}</span>
          </div>
        </Rows>
      </Card>
    </div>
  );
}

export function WhatIfBody({
  shifts,
  cfg,
  cfgDraft,
  whatIf,
  setWhatIf,
}: {
  shifts: Shift[];
  cfg: EngineConfig;
  cfgDraft: CfgDraft;
  whatIf: WhatIfDraft;
  setWhatIf: (wi: WhatIfDraft) => void;
}) {
  const wi = computeWhatIf(shifts, cfg, {
    hours: num(whatIf.hours),
    units548: num(whatIf.units548),
    weekend: whatIf.weekend,
    chargeHours: num(whatIf.charge),
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Hours" value={whatIf.hours} onChange={(v) => setWhatIf({ ...whatIf, hours: v })} w="w-16" />
        <Field label="Bonus units" value={whatIf.units548} onChange={(v) => setWhatIf({ ...whatIf, units548: v })} w="w-16" />
        <Field label="Charge hrs" value={whatIf.charge} onChange={(v) => setWhatIf({ ...whatIf, charge: v })} w="w-16" />
        <label className="mb-1.5 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={whatIf.weekend}
            onChange={(e) => setWhatIf({ ...whatIf, weekend: e.target.checked })}
            className="size-4 accent-[rgb(var(--accent))]"
          />
          Weekend
        </label>
      </div>
      <div className="space-y-1 text-sm tabular-nums">
        <div className="flex justify-between gap-3">
          <span className="text-ink-dim">Pay added (overtime rules applied)</span>
          <span>{fmtCents(wi.dGrossCents)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-ink-dim">Taxes + retirement on it</span>
          <span className="text-neg">{fmtCents(-(wi.d403Cents + wi.dFicaCents + wi.dLeaveCents + wi.dFedMnCents))}</span>
        </div>
        <div className="flex justify-between gap-3 border-t border-surface-line/60 pt-1.5">
          <span className="font-semibold">Hits your account</span>
          <span className="font-semibold text-pos">
            {fmtCents(wi.dNetCents)} <span className="font-normal text-ink-dim">({fmtCents(wi.perHourCents)}/hr)</span>
          </span>
        </div>
      </div>
      <p className="mt-2 text-footnote text-ink-dim">
        Extra pay is taxed at your top rates ({cfgDraft.marginalFed}% federal + {cfgDraft.marginalMN}% Minnesota) —
        change them in Me → Advanced.
      </p>
    </div>
  );
}
