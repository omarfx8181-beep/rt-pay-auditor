/**
 * The breakdown + the what-if — composed by Home (V3 §4).
 * BreakdownCards is "one level down" from the hero: the story of the
 * number. WhatIfBody is the picking-up-a-shift calculator.
 */
import { computeWhatIf, type EngineConfig, type NetResult, type PeriodResult, type Shift } from "../lib/engine.ts";
import { num, type CfgDraft } from "../lib/draft.ts";
import { fmtCents, fmtNum, fmtRate } from "../lib/format.ts";
import { plainLabel } from "../lib/labels.ts";
import { Card, Field } from "../ui/kit.tsx";

export interface WhatIfDraft {
  hours: string;
  units548: string;
  weekend: boolean;
  charge: string;
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
  const deductions: Array<[string, number]> = [
    ["Federal tax withheld", net.fedCents],
    ["Minnesota tax withheld", net.mnCents],
    ["Social Security", net.ssCents],
    ["Medicare", net.medicareCents],
    ["MN paid family leave", net.mnFamCents],
    ["MN paid medical leave", net.mnMedCents],
    [`Retirement savings — ${cfgDraft.k403bPct}%`, net.k403Cents],
    ["Health, dental & FSA (pretax)", net.s125Cents],
    ["After-tax deductions", net.afterTaxCents],
    ["Life insurance (non-cash)", net.imputedCents],
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card title="What you earned">
        <div className="divide-y divide-surface-line/60">
          {period.lines
            .filter((l) => l.amountCents !== 0)
            .map((l) => (
              <div key={l.key} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 text-sm">{plainLabel(l.key, l.label)}</span>
                {l.qty !== 0 ? (
                  <span className="whitespace-nowrap text-xs tabular-nums text-ink-dim">
                    {fmtNum(l.qty)}
                    {l.isUnits ? "u" : "h"} @{fmtRate(l.rateCents)}
                  </span>
                ) : null}
                <span className="w-24 text-right text-sm tabular-nums">{fmtCents(l.amountCents)}</span>
              </div>
            ))}
          <div className="flex items-baseline justify-between py-2.5">
            <span className="text-headline">Total before taxes</span>
            <span className="text-headline tabular-nums text-pos">{fmtCents(period.grossCents)}</span>
          </div>
        </div>
      </Card>

      <Card title="From pay to take-home">
        <div className="divide-y divide-surface-line/60">
          {deductions.map(([label, cents]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0 flex-1 text-sm">{label}</span>
              <span className="text-sm tabular-nums text-neg">{fmtCents(-cents)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between py-2.5">
            <span className="text-headline">Take-home</span>
            <span className="text-headline tabular-nums text-pos">{fmtCents(net.netCents)}</span>
          </div>
        </div>
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
          <span className="text-ink-dim">Gross added (OT/DT rules applied)</span>
          <span>{fmtCents(wi.dGrossCents)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-ink-dim">Taxes + 403(b) on it</span>
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
        Uses marginal W/H rates ({cfgDraft.marginalFed}% fed + {cfgDraft.marginalMN}% MN) — edit in Me → Advanced.
      </p>
    </div>
  );
}
