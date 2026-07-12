import { useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { BonusTier } from "../lib/engine.ts";
import { num, type CfgDraft } from "../lib/draft.ts";
import { fmtCents } from "../lib/format.ts";
import { CalloutCard, Card, Field } from "../ui/kit.tsx";

const OPEN_QUESTIONS: Array<{ id: string; text: string }> = [
  { id: "transport", text: "Transport: $50 up to 4 hrs, $100 beyond — does door-to-door time count, or only the transferred hours?" },
  { id: "twelve500", text: '"12 = $500" — confirmed as the 12-hr extra-shift tier (10 units)?' },
  { id: "code301", text: "What does code 301 (Eve Mgr, −4.00/day) remove? Until known, evening hours are entered manually from the timecard." },
  { id: "preceptor", text: "Preceptor adder rate — stub shows YTD only; seeded at $3/hr." },
];

export interface QuestionAnswer {
  answer: string;
  answeredAt: number;
}

export type AppearanceMode = "system" | "light" | "dark";

export default function Rules({
  cfgDraft,
  setCfgDraft,
  tiers,
  setTiers,
  unit548Cents,
  apiKey,
  onSaveApiKey,
  feedUrl,
  onSaveFeedUrl,
  appearance,
  onSetAppearance,
  answers,
  onSaveAnswers,
}: {
  cfgDraft: CfgDraft;
  setCfgDraft: (updater: (d: CfgDraft) => CfgDraft) => void;
  tiers: BonusTier[];
  setTiers: (updater: (t: BonusTier[]) => BonusTier[]) => void;
  unit548Cents: number;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  feedUrl: string;
  onSaveFeedUrl: (url: string) => void;
  appearance: AppearanceMode;
  onSetAppearance: (mode: AppearanceMode) => void;
  answers: Record<string, QuestionAnswer>;
  onSaveAnswers: (answers: Record<string, QuestionAnswer>) => void;
}) {
  const set = (key: keyof CfgDraft) => (value: string) => setCfgDraft((d) => ({ ...d, [key]: value }));
  const [key, setKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [feed, setFeed] = useState(feedUrl);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const unanswered = OPEN_QUESTIONS.filter((q) => !answers[q.id]);
  const answered = OPEN_QUESTIONS.filter((q) => answers[q.id]);

  return (
    <div className="space-y-3">
      <Card title="Rates & rules — decoded from your stub">
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          <Field label="Base rate" value={cfgDraft.baseRate} onChange={set("baseRate")} suffix="$/hr" />
          <Field label="DT after (daily)" value={cfgDraft.dtDaily} onChange={set("dtDaily")} suffix="hrs" w="w-16" />
          <Field label="OT after (period)" value={cfgDraft.otPeriod} onChange={set("otPeriod")} suffix="hrs" w="w-16" />
          <Field label="OT blended rate" value={cfgDraft.otRateOverride} onChange={set("otRateOverride")} suffix="$/hr (blank = 1.5× base)" />
          <Field label="Weekend diff" value={cfgDraft.weekendDiff} onChange={set("weekendDiff")} suffix="$/hr" w="w-16" />
          <Field label="Evening diff" value={cfgDraft.eveningDiff} onChange={set("eveningDiff")} suffix="$/hr" w="w-16" />
          <Field label="Evening hrs (period)" value={cfgDraft.eveningHours} onChange={set("eveningHours")} suffix="from timecard" warn w="w-16" />
          <Field label="Charge adder" value={cfgDraft.chargeRate} onChange={set("chargeRate")} suffix="$/hr" w="w-16" />
          <Field label="Premium adder" value={cfgDraft.premiumRate} onChange={set("premiumRate")} suffix="$/hr" w="w-16" />
          <Field label="Preceptor adder" value={cfgDraft.preceptorRate} onChange={set("preceptorRate")} suffix="$/hr (confirm)" warn w="w-16" />
          <Field label="548 unit value" value={cfgDraft.unit548} onChange={set("unit548")} suffix="$/unit" w="w-16" />
          <Field label="Imputed life" value={cfgDraft.imputed} onChange={set("imputed")} suffix="$/check" w="w-16" />
          <Field label="Meal deduction" value={cfgDraft.mealDeduct} onChange={set("mealDeduct")} suffix="hr (schedule scan)" w="w-16" />
          <Field label="Meal if shift >" value={cfgDraft.mealThreshold} onChange={set("mealThreshold")} suffix="hrs" w="w-16" />
        </div>
      </Card>

      <Card title="Bonus tiers — edit as the weekly incentive changes">
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={t.id} className="flex items-center gap-2">
              <input
                value={t.label}
                onChange={(e) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                className="input min-w-0 flex-1 px-2.5 py-1.5 text-sm"
              />
              <input
                value={String(t.units)}
                onChange={(e) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, units: num(e.target.value) } : x)))}
                inputMode="decimal"
                className="input w-16 px-2.5 py-1.5 text-right font-mono text-sm tabular-nums"
              />
              <span className="w-20 font-mono text-xs tabular-nums text-ink-dim">= {fmtCents(Math.round(t.units * unit548Cents))}</span>
              <button
                onClick={() => setTiers((arr) => arr.filter((_, j) => j !== i))}
                className="pressable p-1 text-ink-dim hover:text-neg"
                aria-label="Remove tier"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setTiers((arr) => [...arr, { id: "t" + Date.now(), label: "New tier", units: 1 }])}
            className="btn btn-ghost pressable"
          >
            <Plus size={15} /> Add tier
          </button>
        </div>
      </Card>

      <Card title="Taxes & deductions — validated against your stub to the penny">
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          <Field label="403(b)" value={cfgDraft.k403bPct} onChange={set("k403bPct")} suffix="% of cash gross" w="w-16" />
          <Field label="Medical pretax" value={cfgDraft.med} onChange={set("med")} suffix="$/check" />
          <Field label="Dental pretax" value={cfgDraft.dent} onChange={set("dent")} suffix="$/check" w="w-20" />
          <Field label="FSA" value={cfgDraft.fsa} onChange={set("fsa")} suffix="$/check" w="w-20" />
          <Field label="Fed W/H effective" value={cfgDraft.fedEff} onChange={set("fedEff")} suffix="%" w="w-20" />
          <Field label="MN W/H effective" value={cfgDraft.mnEff} onChange={set("mnEff")} suffix="%" w="w-20" />
          <Field label="Fed marginal (what-if)" value={cfgDraft.marginalFed} onChange={set("marginalFed")} suffix="%" w="w-16" />
          <Field label="MN marginal (what-if)" value={cfgDraft.marginalMN} onChange={set("marginalMN")} suffix="%" w="w-16" />
          <Field label="MN Fam Leave EE" value={cfgDraft.mnFam} onChange={set("mnFam")} suffix="%" w="w-16" />
          <Field label="MN Med Leave EE" value={cfgDraft.mnMed} onChange={set("mnMed")} suffix="%" w="w-16" />
          <Field label="Voluntary accident" value={cfgDraft.acc} onChange={set("acc")} suffix="$/check" w="w-16" />
          <Field label="Critical illness" value={cfgDraft.crit} onChange={set("crit")} suffix="$/check" w="w-16" />
          <Field label="Other after-tax" value={cfgDraft.otherAfterTax} onChange={set("otherAfterTax")} suffix="$ (coffee, cafeteria…)" w="w-20" />
        </div>
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-dim">
          Baked in: FICA wages = gross − medical/dental/FSA (403(b) stays FICA-taxable) · MN Paid Leave = % of full gross ·
          net subtracts the non-cash imputed life. These reconciled your 6/22–7/05 stub to within $0.02.
        </p>
      </Card>

      <Card title="Schedule scan — your credentials, your device">
        <p className="text-sm">
          Best way to pull shifts: your ScheduleAnywhere <strong>calendar feed</strong> — in ScheduleAnywhere go to
          Employee → iCalendar → Copy URL. No API key needed. Both values below live only in this browser: never in
          the repo, never in JSON backups.
        </p>
        <div className="mt-3">
          <label className="flex flex-col sm:max-w-xl">
            <span className="label">ScheduleAnywhere feed URL</span>
            <input
              value={feed}
              onChange={(e) => {
                setFeed(e.target.value);
                onSaveFeedUrl(e.target.value.trim());
              }}
              placeholder="https://www.scheduleanywhere.com/ical/…"
              autoComplete="off"
              className="input px-2.5 py-1.5 font-mono text-sm"
            />
          </label>
        </div>
        <p className="mt-4 text-sm">
          Screenshot scanning is the fallback (schedule grids the feed doesn't cover). It uses your own Anthropic API
          key, sending screenshots straight from your browser to the API.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex min-w-64 flex-1 flex-col sm:max-w-md">
            <span className="label">Anthropic API key</span>
            <input
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                onSaveApiKey(e.target.value.trim());
              }}
              placeholder="sk-ant-…"
              autoComplete="off"
              className="input px-2.5 py-1.5 font-mono text-sm"
            />
          </label>
          <button
            onClick={() => setShowKey((v) => !v)}
            className="btn btn-ghost pressable px-3"
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </Card>

      <Card title="Appearance">
        <div className="flex gap-1.5">
          {(["system", "light", "dark"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onSetAppearance(mode)}
              className={`btn px-3.5 py-2 text-xs capitalize ${appearance === mode ? "btn-primary" : "btn-ghost"} pressable`}
            >
              {mode}
            </button>
          ))}
        </div>
        <p className="mt-2 font-mono text-[11px] text-ink-dim">
          System follows your phone. Dark is the warm espresso set from the Knockdown tokens.
        </p>
      </Card>

      {unanswered.length > 0 && (
        <CalloutCard tone="amber">
          <div className="mb-2 flex items-center gap-1.5 font-display text-base font-semibold text-amber">
            <AlertTriangle size={15} /> Open questions — confirm with payroll, then edit above
          </div>
          <div className="space-y-3">
            {unanswered.map((q) => (
              <div key={q.id} className="text-sm">
                <div>{q.text}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <input
                    value={drafts[q.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    placeholder="payroll's answer…"
                    className="input min-w-48 flex-1 px-2.5 py-1.5 font-mono text-xs sm:max-w-md"
                  />
                  <button
                    onClick={() => {
                      const answer = (drafts[q.id] ?? "").trim();
                      if (answer === "") return;
                      onSaveAnswers({ ...answers, [q.id]: { answer, answeredAt: Date.now() } });
                    }}
                    className="btn btn-ghost pressable text-xs"
                  >
                    <CheckCircle2 size={13} /> Mark answered
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CalloutCard>
      )}

      {answered.length > 0 && (
        <Card title="Config history — answered questions">
          <div className="space-y-3">
            {answered.map((q) => {
              const a = answers[q.id];
              return (
                <div key={q.id} className="text-sm">
                  <div className="text-ink-dim">{q.text}</div>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-sm text-pos">✓ {a.answer}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                      {new Date(a.answeredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <button
                      onClick={() => {
                        const next = { ...answers };
                        delete next[q.id];
                        onSaveAnswers(next);
                        setDrafts((d) => ({ ...d, [q.id]: a.answer }));
                      }}
                      className="pressable flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink-dim hover:text-ink"
                    >
                      <RotateCcw size={11} /> Reopen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-[11px] text-ink-dim">
            Answers live here as history — remember to update the matching rate or tier above.
          </p>
        </Card>
      )}
    </div>
  );
}
