import { TrendingUp } from "lucide-react";
import { computeWhatIf, type EngineConfig, type NetResult, type PeriodResult, type Shift } from "../lib/engine.ts";
import { num, type CfgDraft } from "../lib/draft.ts";
import { fmtCents, fmtNum, fmtRate } from "../lib/format.ts";
import { CalloutCard, Card, Eyebrow, Field } from "../ui/kit.tsx";

export interface WhatIfDraft {
  hours: string;
  units548: string;
  weekend: boolean;
  charge: string;
}

export default function Paycheck({
  period,
  net,
  shifts,
  cfg,
  cfgDraft,
  whatIf,
  setWhatIf,
}: {
  period: PeriodResult;
  net: NetResult;
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

  const deductions: Array<[string, number]> = [
    [`Federal W/H (${cfgDraft.fedEff}% eff.)`, net.fedCents],
    [`Minnesota W/H (${cfgDraft.mnEff}% eff.)`, net.mnCents],
    ["Social Security 6.2%", net.ssCents],
    ["Medicare 1.45%", net.medicareCents],
    ["MN Paid Family Leave", net.mnFamCents],
    ["MN Paid Medical Leave", net.mnMedCents],
    [`403(b) ${cfgDraft.k403bPct}%`, net.k403Cents],
    ["Medical / Dental / FSA (pretax)", net.s125Cents],
    ["After-tax deductions", net.afterTaxCents],
    ["Imputed life (non-cash)", net.imputedCents],
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card title="Earnings — expected">
        <div className="divide-y divide-surface-line/60">
          {period.lines
            .filter((l) => l.amountCents !== 0)
            .map((l) => (
              <div key={l.key} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 text-sm">{l.label}</span>
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
            <span className="font-display text-base font-semibold">Total gross</span>
            <span className="text-base font-semibold tabular-nums text-pos">{fmtCents(period.grossCents)}</span>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <Card title="Gross → net">
          <div className="divide-y divide-surface-line/60">
            {deductions.map(([label, cents]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 text-sm">{label}</span>
                <span className="text-sm tabular-nums text-neg">{fmtCents(-cents)}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between py-2.5">
              <span className="font-display text-base font-semibold">Expected net</span>
              <span className="text-base font-semibold tabular-nums text-pos">{fmtCents(net.netCents)}</span>
            </div>
          </div>
        </Card>

        <CalloutCard tone="accent">
          <Eyebrow accent className="mb-3 flex items-center gap-1.5">
            <TrendingUp size={13} /> What-if: pick up one more shift
          </Eyebrow>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Hours" value={whatIf.hours} onChange={(v) => setWhatIf({ ...whatIf, hours: v })} w="w-16" />
            <Field label="548 units" value={whatIf.units548} onChange={(v) => setWhatIf({ ...whatIf, units548: v })} w="w-16" />
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
              <span className="font-sans text-ink-dim">Gross added (OT/DT rules applied)</span>
              <span>{fmtCents(wi.dGrossCents)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-sans text-ink-dim">Taxes + 403(b) on it</span>
              <span className="text-neg">{fmtCents(-(wi.d403Cents + wi.dFicaCents + wi.dLeaveCents + wi.dFedMnCents))}</span>
            </div>
            <div className="flex justify-between gap-3 border-t border-accent/40 pt-1.5">
              <span className="font-sans font-semibold">Hits your account</span>
              <span className="font-semibold text-pos">
                {fmtCents(wi.dNetCents)} <span className="font-normal text-ink-dim">({fmtCents(wi.perHourCents)}/hr)</span>
              </span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-dim">
            Uses marginal W/H rates ({cfgDraft.marginalFed}% fed + {cfgDraft.marginalMN}% MN) — edit in Rules.
          </p>
        </CalloutCard>
      </div>
    </div>
  );
}
