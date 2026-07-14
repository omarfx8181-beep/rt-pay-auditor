/**
 * Me — settings + your data (V3 brief §4).
 * Top level stays human: role & employer, base rate, pay rules in plain
 * rows, schedule scan, appearance. Every tax / 403(b) / Section-125 /
 * MN-Paid-Leave / effective-rate field lives behind the collapsed
 * Advanced disclosure with pre-filled defaults and one-line explanations.
 * The old Periods tab (year totals, past stubs, other income, backup,
 * period management) lives here too, under "Your periods & data".
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Banknote,
  CalendarPlus,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileScan,
  Loader2,
  Plus,
  ReceiptText,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { computeNet, computePeriod, type BonusTier } from "../lib/engine.ts";
import { draftToConfig, draftToLeave, draftToShift, num, todayIso, uid, type CfgDraft } from "../lib/draft.ts";
import { FAIRVIEW_RT_PRESET } from "../lib/presets.ts";
import { periodLabel, prevPeriodRange, ytdThroughDate, type OtherIncomeDraft, type PayPeriod, type YtdAnchor, type YtdRollup } from "../lib/periods.ts";
import { planStubImports, scanStubFiles, stubStartDate, type ScannedStub } from "../lib/stubScan.ts";
import { dayLabel, fmtCents } from "../lib/format.ts";
import { CalloutCard, Card, Disclosure, Eyebrow, UndoToast } from "../ui/kit.tsx";

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

/** One human-readable rule: plain words left, the number right. */
function RuleRow({
  label,
  hint,
  value,
  onChange,
  suffix,
  warn,
  wide,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  warn?: boolean;
  wide?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-surface-line/60 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className={`text-subhead ${warn ? "text-amber" : ""}`}>{label}</div>
        {hint ? <div className="mt-0.5 text-footnote text-ink-dim">{hint}</div> : null}
      </div>
      <span className="flex shrink-0 items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className={`input ${wide ? "w-24" : "w-20"} px-2.5 py-2 text-right text-[16px] tabular-nums`}
        />
        {suffix ? <span className="w-9 text-footnote text-ink-dim">{suffix}</span> : null}
      </span>
    </div>
  );
}

/* ---- upload a year of stubs: files → preview → periods ---- */
function StubScanPanel({
  apiKey,
  periods,
  onLogPastStub,
}: {
  apiKey: string;
  periods: PayPeriod[];
  onLogPastStub: (endDate: string, gross: string, net: string, startDate?: string) => void;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "working" }
    | { status: "error"; msg: string }
    | { status: "preview"; toAdd: ScannedStub[]; duplicates: ScannedStub[] }
  >({ status: "idle" });

  const handleFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    setState({ status: "working" });
    try {
      const scanned = await scanStubFiles(files, apiKey);
      const plan = planStubImports(periods, scanned);
      if (plan.toAdd.length === 0 && plan.duplicates.length === 0) throw new Error("No stubs detected in those files.");
      setState({ status: "preview", ...plan });
    } catch (err) {
      setState({ status: "error", msg: String(err instanceof Error ? err.message : err) });
    }
  };

  if (!apiKey) {
    return (
      <p className="text-footnote text-ink-dim">
        Uploading stubs needs your Anthropic API key (Me → Schedule scan) — the files go straight from your browser to
        the API with your key.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <label className="btn btn-ghost pressable cursor-pointer text-xs">
        <FileScan size={14} /> Upload stub PDFs / screenshots
        <input
          type="file"
          accept="application/pdf,.pdf,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {state.status === "working" && (
        <div className="flex items-center gap-2 text-sm text-accent">
          <Loader2 size={15} className="animate-spin" /> Reading your stubs…
        </div>
      )}
      {state.status === "error" && (
        <div className="text-sm text-neg">
          {state.msg}{" "}
          <button onClick={() => setState({ status: "idle" })} className="ml-2 text-ink-dim underline">
            dismiss
          </button>
        </div>
      )}
      {state.status === "preview" && (
        <div className="space-y-2">
          <div className="divide-y divide-surface-line/60 text-xs tabular-nums">
            {state.toAdd.map((s) => (
              <div key={s.endDate} className="flex items-baseline justify-between gap-3 py-1.5">
                <span>ends {dayLabel(s.endDate)}</span>
                <span>
                  ${s.gross} · <span className="text-pos">${s.net}</span>
                </span>
              </div>
            ))}
            {state.duplicates.map((s) => (
              <div key={"d" + s.endDate} className="flex items-baseline justify-between gap-3 py-1.5 text-ink-dim/60">
                <span>ends {dayLabel(s.endDate)}</span>
                <span>already logged — skipped</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {state.toAdd.length > 0 && (
              <button
                onClick={() => {
                  for (const s of state.toAdd) onLogPastStub(s.endDate, s.gross, s.net, stubStartDate(s));
                  setState({ status: "idle" });
                }}
                className="btn btn-primary pressable text-xs"
              >
                Add {state.toAdd.length} period{state.toAdd.length > 1 ? "s" : ""}
              </button>
            )}
            <button onClick={() => setState({ status: "idle" })} className="pressable px-2 text-xs text-ink-dim">
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Me({
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
  periods,
  currentId,
  ytd,
  ytdAnchor,
  otherIncome,
  onSelect,
  onCreateNext,
  onLogPastStub,
  onSetDates,
  onToggleArchived,
  onDelete,
  onRestorePeriod,
  onAddOther,
  onUpdateOther,
  onDeleteOther,
  onExport,
  onImportFile,
  importStatus,
  lastBackupAt,
  onShareBackup,
  onDownloadPaydays,
  paydayDelay,
  onSetPaydayDelay,
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
  periods: PayPeriod[];
  currentId: string;
  ytd: YtdRollup;
  ytdAnchor: YtdAnchor | null;
  otherIncome: OtherIncomeDraft[];
  onSelect: (id: string) => void;
  onCreateNext: () => void;
  onLogPastStub: (endDate: string, gross: string, net: string, startDate?: string) => void;
  onSetDates: (id: string, startDate: string) => void;
  onToggleArchived: (id: string) => void;
  onDelete: (id: string) => void;
  onRestorePeriod: (period: PayPeriod) => void;
  onAddOther: () => void;
  onUpdateOther: (id: string, patch: Partial<OtherIncomeDraft>) => void;
  onDeleteOther: (id: string) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  importStatus: string;
  lastBackupAt: number | null;
  onShareBackup: () => void;
  onDownloadPaydays: () => void;
  paydayDelay: string;
  onSetPaydayDelay: (v: string) => void;
}) {
  const set = (key: keyof CfgDraft) => (value: string) => setCfgDraft((d) => ({ ...d, [key]: value }));
  const [key, setKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [feed, setFeed] = useState(feedUrl);
  const [payDelay, setPayDelay] = useState(paydayDelay);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const unanswered = OPEN_QUESTIONS.filter((q) => !answers[q.id]);
  const answered = OPEN_QUESTIONS.filter((q) => answers[q.id]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  // One undo window after a period delete — the record rides in state.
  const [deleted, setDeleted] = useState<PayPeriod | null>(null);
  useEffect(() => {
    if (deleted === null) return;
    const t = setTimeout(() => setDeleted(null), 8000);
    return () => clearTimeout(t);
  }, [deleted]);

  // Manual past-stub entry walks backward from the earliest period.
  const earliest = periods.reduce((a, b) => (a.startDate < b.startDate ? a : b));
  const suggested = prevPeriodRange(earliest.startDate);
  const [stubEnd, setStubEnd] = useState(suggested.endDate);
  const [stubGross, setStubGross] = useState("");
  const [stubNet, setStubNet] = useState("");
  const stubEndTouched = useRef(false);
  const stubEndValue = stubEndTouched.current ? stubEnd : suggested.endDate;

  return (
    <div className="space-y-3">
      <h1 className="text-large-title tracking-tight">Me</h1>

      {/* ---- role & employer (from the preset) + the one number that matters ---- */}
      <Card>
        <div className="text-headline">{FAIRVIEW_RT_PRESET.facility.name}</div>
        <div className="mt-0.5 text-subhead text-ink-dim">{FAIRVIEW_RT_PRESET.role.name} · paid every two weeks</div>
        <div className="mt-3 border-t border-surface-line/60 pt-1">
          <RuleRow
            label="Your base hourly rate"
            hint="The one number everything builds on."
            value={cfgDraft.baseRate}
            onChange={set("baseRate")}
            suffix="$/hr"
            wide
          />
        </div>
        <p className="mt-3 text-footnote text-ink-dim">Everything you enter stays on this device.</p>
      </Card>

      {/* ---- pay rules, in human rows ---- */}
      <Card title="Your pay rules">
        <RuleRow label="Weekend pay" hint="Extra per hour on Saturday and Sunday — applies itself." value={cfgDraft.weekendDiff} onChange={set("weekendDiff")} suffix="$/hr" />
        <RuleRow label="Evening pay" hint="Extra per hour on evening shifts." value={cfgDraft.eveningDiff} onChange={set("eveningDiff")} suffix="$/hr" />
        <RuleRow
          label="Evening hours this period"
          hint="Copied from your timecard each period — Kronos credits evening hours, then removes 4 a day for day staff, so shifts alone can't compute it."
          value={cfgDraft.eveningHours}
          onChange={set("eveningHours")}
          suffix="hrs"
          warn
        />
        <RuleRow label="Overtime starts after" hint="Straight hours in a pay period before overtime kicks in." value={cfgDraft.otPeriod} onChange={set("otPeriod")} suffix="hrs" />
        <RuleRow label="Double time starts after" hint="Hours in a single day before double time kicks in." value={cfgDraft.dtDaily} onChange={set("dtDaily")} suffix="hrs" />
        <RuleRow label="Charge pay" hint="Extra per hour when you're charge." value={cfgDraft.chargeRate} onChange={set("chargeRate")} suffix="$/hr" />
        <RuleRow label="Premium pay" hint="Extra per hour on premium shifts." value={cfgDraft.premiumRate} onChange={set("premiumRate")} suffix="$/hr" />
        <RuleRow label="Preceptor pay" hint="Extra per hour while precepting — confirmed with payroll." value={cfgDraft.preceptorRate} onChange={set("preceptorRate")} suffix="$/hr" />
        <RuleRow label="Critical shift bonus" hint="What one bonus unit is worth." value={cfgDraft.unit548} onChange={set("unit548")} suffix="$/unit" />
      </Card>

      <Card title="Bonus tiers — they change week to week">
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
                className="input w-16 px-2.5 py-1.5 text-right text-sm tabular-nums"
              />
              <span className="w-20 text-xs tabular-nums text-ink-dim">= {fmtCents(Math.round(t.units * unit548Cents))}</span>
              <button
                onClick={() => setTiers((arr) => arr.filter((_, j) => j !== i))}
                className="pressable p-2.5 text-ink-dim hover:text-neg"
                aria-label="Remove tier"
              >
                <Trash2 size={15} />
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

      {/* ---- schedule scan credentials ---- */}
      <Card title="Schedule scan — your credentials, your device">
        <p className="text-sm">
          Best way to pull shifts: your ScheduleAnywhere <strong>calendar feed</strong> — in ScheduleAnywhere go to
          Employee → iCalendar → Copy URL. No API key needed. Both values below live only in this browser: never in the
          repo, never in JSON backups.
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
              className="input px-2.5 py-1.5 text-sm"
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
              className="input px-2.5 py-1.5 text-sm"
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
        <p className="mt-2 text-footnote text-ink-dim">System follows your phone.</p>
      </Card>

      {/* ---- everything technical, one collapsed disclosure ---- */}
      <Disclosure
        title="Advanced"
        icon={<SlidersHorizontal size={13} className="text-ink-dim" />}
        hint="Taxes and deductions — set from your real stub. Most people never open this."
      >
        <div className="space-y-5">
          <div>
            <Eyebrow className="mb-1">Retirement & benefits</Eyebrow>
            <RuleRow label="Retirement savings" hint="Percent of each check into your 403(b), pretax." value={cfgDraft.k403bPct} onChange={set("k403bPct")} suffix="%" />
            <RuleRow label="Medical insurance" hint="Per check, pretax." value={cfgDraft.med} onChange={set("med")} suffix="$" wide />
            <RuleRow label="Dental insurance" hint="Per check, pretax." value={cfgDraft.dent} onChange={set("dent")} suffix="$" />
            <RuleRow label="FSA contribution" hint="Per check, pretax." value={cfgDraft.fsa} onChange={set("fsa")} suffix="$" />
          </div>
          <div>
            <Eyebrow className="mb-1">Taxes</Eyebrow>
            <RuleRow label="Federal tax rate" hint="Calibrated from your stub to the penny — no need to touch it." value={cfgDraft.fedEff} onChange={set("fedEff")} suffix="%" wide />
            <RuleRow label="Minnesota tax rate" hint="Calibrated from your stub to the penny." value={cfgDraft.mnEff} onChange={set("mnEff")} suffix="%" wide />
            <RuleRow label="Federal rate on extra pay" hint="Only used by the what-if card." value={cfgDraft.marginalFed} onChange={set("marginalFed")} suffix="%" />
            <RuleRow label="Minnesota rate on extra pay" hint="Only used by the what-if card." value={cfgDraft.marginalMN} onChange={set("marginalMN")} suffix="%" />
            <RuleRow label="MN family leave" hint="The standard statewide rate — most people never change it." value={cfgDraft.mnFam} onChange={set("mnFam")} suffix="%" />
            <RuleRow label="MN medical leave" hint="The standard statewide rate — most people never change it." value={cfgDraft.mnMed} onChange={set("mnMed")} suffix="%" />
          </div>
          <div>
            <Eyebrow className="mb-1">Other deductions</Eyebrow>
            <RuleRow label="Accident insurance" hint="Per check, after tax." value={cfgDraft.acc} onChange={set("acc")} suffix="$" />
            <RuleRow label="Critical illness insurance" hint="Per check, after tax." value={cfgDraft.crit} onChange={set("crit")} suffix="$" />
            <RuleRow label="Everything else after tax" hint="Coffee, cafeteria, anything payroll takes after taxes." value={cfgDraft.otherAfterTax} onChange={set("otherAfterTax")} suffix="$" />
            <RuleRow label="Life insurance (imputed)" hint="Taxed but never cash — it's on the stub, not in your account." value={cfgDraft.imputed} onChange={set("imputed")} suffix="$" />
          </div>
          <div>
            <Eyebrow className="mb-1">Fine tuning</Eyebrow>
            <RuleRow label="Overtime blended rate" hint="From your stub; leave blank to use 1.5× base." value={cfgDraft.otRateOverride} onChange={set("otRateOverride")} suffix="$/hr" wide />
            <RuleRow label="Meal break taken off" hint="Hours the schedule scan subtracts from long shifts." value={cfgDraft.mealDeduct} onChange={set("mealDeduct")} suffix="hrs" />
            <RuleRow label="…on shifts longer than" hint="Shifts at or under this keep their full hours." value={cfgDraft.mealThreshold} onChange={set("mealThreshold")} suffix="hrs" />
            <RuleRow
              label="Payday lands after"
              hint="Days from period end to the money arriving — Fairview pays the Friday after."
              value={payDelay}
              onChange={(v) => {
                setPayDelay(v);
                onSetPaydayDelay(v.trim());
              }}
              suffix="days"
            />
          </div>
          <p className="text-footnote leading-relaxed text-ink-dim">
            Baked in: Social Security 6.2% and Medicare 1.45% apply to gross minus your pretax medical, dental, and FSA
            (retirement savings stay taxable there); Minnesota paid leave applies to full gross. These reconciled your
            6/22–7/05 stub to within $0.02.
          </p>
        </div>
      </Disclosure>

      {unanswered.length > 0 && (
        <CalloutCard tone="amber">
          <div className="mb-2 flex items-center gap-1.5 text-headline text-amber">
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
                    className="input min-w-48 flex-1 px-2.5 py-1.5 text-xs sm:max-w-md"
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
        <Card title="Answered questions">
          <div className="space-y-3">
            {answered.map((q) => {
              const a = answers[q.id];
              return (
                <div key={q.id} className="text-sm">
                  <div className="text-ink-dim">{q.text}</div>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm text-pos">✓ {a.answer}</span>
                    <span className="text-caption text-ink-dim">
                      {new Date(a.answeredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <button
                      onClick={() => {
                        const next = { ...answers };
                        delete next[q.id];
                        onSaveAnswers(next);
                        setDrafts((d) => ({ ...d, [q.id]: a.answer }));
                      }}
                      className="pressable flex items-center gap-1 text-caption text-ink-dim hover:text-ink"
                    >
                      <RotateCcw size={11} /> Reopen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-footnote text-ink-dim">
            Answers live here as history — remember to update the matching rate or tier above.
          </p>
        </Card>
      )}

      {/* ---- your periods & data (the old Periods tab) ---- */}
      <div className="pt-3">
        <Eyebrow className="mb-2">Your periods & data</Eyebrow>
        <div className="space-y-3">
          <Card title={`Year total — ${ytd.year}`}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div>
                <Eyebrow>Total made</Eyebrow>
                <div className="mt-1 text-title-2 tabular-nums">{fmtCents(ytd.totalGrossCents)}</div>
              </div>
              <div>
                <Eyebrow>Take-home</Eyebrow>
                <div className="mt-1 text-title-2 tabular-nums text-pos">{fmtCents(ytd.totalNetCents)}</div>
              </div>
            </div>
            <p className="mt-3 text-footnote text-ink-dim">
              Fairview {fmtCents(ytd.grossCents)} ({ytd.stubCount}/{ytd.periodCount} stub-true) · other{" "}
              {fmtCents(ytd.otherGrossCents)} · real stub numbers always outrank estimates.
            </p>
            {ytdAnchor &&
              (() => {
                const through = ytdThroughDate(periods, ytdAnchor.asOfEnd);
                const deltaCents = through.grossCents - ytdAnchor.grossCents;
                const ok = Math.abs(deltaCents) <= 5;
                const netDeltaCents = ytdAnchor.netCents !== null ? through.netCents - ytdAnchor.netCents : null;
                const netOk = netDeltaCents === null || Math.abs(netDeltaCents) <= 5;
                return (
                  <p
                    className={`mt-2 border-t border-surface-line/60 pt-2 text-footnote ${ok && netOk ? "text-pos" : "text-amber"}`}
                  >
                    {ok ? (
                      <>
                        ✓ Your newest stub agrees: {fmtCents(ytdAnchor.grossCents)} made through{" "}
                        {dayLabel(ytdAnchor.asOfEnd)}
                        {netOk ? (
                          ytdAnchor.netCents !== null ? ", take-home included." : "."
                        ) : (
                          <>
                            {" "}
                            — but take-home drifts {fmtCents(Math.abs(netDeltaCents!))}: a deduction changed somewhere.
                            Check a recent stub's tax lines against Me → Advanced.
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        Your newest stub says {fmtCents(ytdAnchor.grossCents)} made through {dayLabel(ytdAnchor.asOfEnd)} —
                        the app has {fmtCents(through.grossCents)} across {through.periodCount} period
                        {through.periodCount === 1 ? "" : "s"} ({deltaCents > 0 ? "+" : "−"}
                        {fmtCents(Math.abs(deltaCents))}). A period may be missing, doubled, or still an estimate — scan
                        or log its stub and this line turns green.
                      </>
                    )}
                  </p>
                );
              })()}
          </Card>

          <Disclosure
            title="Add your year — stubs in bulk"
            icon={<ReceiptText size={13} className="text-accent" />}
            hint="Upload a year of stub PDFs at once, or type them one per period."
          >
            <div className="space-y-4">
              <StubScanPanel apiKey={apiKey} periods={periods} onLogPastStub={onLogPastStub} />
              <div className="border-t border-surface-line/60 pt-3">
                <p className="text-footnote text-ink-dim">Or by hand — the date steps back one period per entry:</p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col">
                    <span className="label">Period end</span>
                    <input
                      type="date"
                      value={stubEndValue}
                      onChange={(e) => {
                        stubEndTouched.current = true;
                        setStubEnd(e.target.value);
                      }}
                      className="input w-auto px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="label">Gross $</span>
                    <input
                      value={stubGross}
                      onChange={(e) => setStubGross(e.target.value)}
                      inputMode="decimal"
                      className="input w-24 px-2 py-1.5 text-right text-xs tabular-nums"
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="label">Net $</span>
                    <input
                      value={stubNet}
                      onChange={(e) => setStubNet(e.target.value)}
                      inputMode="decimal"
                      className="input w-24 px-2 py-1.5 text-right text-xs tabular-nums"
                    />
                  </label>
                  <button
                    onClick={() => {
                      if (stubEndValue === "" || (num(stubGross) === 0 && num(stubNet) === 0)) return;
                      onLogPastStub(stubEndValue, stubGross, stubNet);
                      stubEndTouched.current = false;
                      setStubGross("");
                      setStubNet("");
                    }}
                    className="btn btn-primary pressable text-xs"
                  >
                    <Plus size={13} /> Log stub
                  </button>
                </div>
              </div>
            </div>
          </Disclosure>

          <Disclosure
            title={`Other income — ${ytd.otherCount ? fmtCents(ytd.otherGrossCents) + " this year" : "none yet"}`}
            icon={<Banknote size={13} className="text-pos" />}
            hint="Money from anywhere else, so the year totals cover everything."
          >
            <p className="text-footnote text-ink-dim">Leave net empty if nothing was withheld — take-home then equals gross.</p>
            {otherIncome.length > 0 && (
              <div className="mt-3 space-y-2">
                {otherIncome.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center gap-2 border-t border-surface-line/60 pt-2">
                    <input
                      type="date"
                      value={o.date}
                      onChange={(e) => onUpdateOther(o.id, { date: e.target.value })}
                      className="input w-auto px-2 py-1 text-xs"
                    />
                    <input
                      value={o.source}
                      onChange={(e) => onUpdateOther(o.id, { source: e.target.value })}
                      placeholder="where from"
                      className="input min-w-24 flex-1 px-2 py-1 text-xs"
                    />
                    <input
                      value={o.gross}
                      onChange={(e) => onUpdateOther(o.id, { gross: e.target.value })}
                      inputMode="decimal"
                      placeholder="gross"
                      className="input w-20 px-2 py-1 text-right text-xs tabular-nums"
                    />
                    <input
                      value={o.net}
                      onChange={(e) => onUpdateOther(o.id, { net: e.target.value })}
                      inputMode="decimal"
                      placeholder="net"
                      className="input w-20 px-2 py-1 text-right text-xs tabular-nums"
                    />
                    <button
                      onClick={() => onDeleteOther(o.id)}
                      className="pressable p-2.5 text-ink-dim hover:text-neg"
                      aria-label="Remove income"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={onAddOther} className="btn btn-ghost pressable mt-3 text-xs">
              <Plus size={13} /> Add income
            </button>
          </Disclosure>

          <Disclosure
            title="Backup — yours, on your device"
            icon={<Download size={13} className="text-accent" />}
            hint={
              lastBackupAt
                ? `Last backed up ${new Date(lastBackupAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — everything as one JSON file.`
                : "Never backed up yet — two taps puts everything in iCloud Drive."
            }
          >
            <p className="text-footnote text-ink-dim">
              {lastBackupAt
                ? `Last backed up ${new Date(lastBackupAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
                : "Never backed up yet."}{" "}
              Back up now opens the share sheet — Save to Files → iCloud Drive and your whole pay history survives a
              lost phone.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={onShareBackup} className="btn btn-primary pressable">
                <Upload size={15} /> Back up now
              </button>
              <button onClick={onExport} className="btn btn-ghost pressable">
                <Download size={15} /> Download JSON
              </button>
              <button onClick={() => fileRef.current?.click()} className="btn btn-ghost pressable">
                Import
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImportFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            {importStatus && <p className="mt-2 text-footnote text-ink-dim">{importStatus}</p>}
          </Disclosure>

          <Card title="Paydays on your calendar">
            <p className="text-footnote text-ink-dim">
              The next 13 paydays as calendar events — let iOS do the reminding, since nothing here ever phones home.
              Payday timing is set under Advanced.
            </p>
            <button onClick={onDownloadPaydays} className="btn btn-ghost pressable mt-3">
              <CalendarPlus size={15} /> Add paydays to your calendar
            </button>
          </Card>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-sm text-ink-dim">Pay periods, newest first.</p>
            <button onClick={onCreateNext} className="btn btn-primary pressable shrink-0">
              <Plus size={15} /> New period
            </button>
          </div>

          {periods.map((p) => {
            const cfg = draftToConfig(p.cfgDraft);
            const result = computePeriod(p.shifts.map(draftToShift), cfg, (p.leave ?? []).map(draftToLeave));
            const net = computeNet(result.grossCents, cfg);
            const active = p.id === currentId;
            const hasStub = (p.actual?.net ?? "") !== "";
            return (
              <section key={p.id} className={`card p-4 ${active ? "border-accent" : ""} ${p.archived ? "opacity-70" : ""}`}>
                <button onClick={() => onSelect(p.id)} className="block w-full text-left">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-headline">{periodLabel(p.startDate, p.endDate)}</span>
                    {active && <span className="eyebrow shrink-0 text-accent">Current</span>}
                    {p.archived && !active && <span className="eyebrow shrink-0">Archived</span>}
                  </div>
                  <div className="mt-1 text-xs tabular-nums text-ink-dim">
                    {hasStub ? (
                      <>
                        take-home <span className="text-pos">${p.actual.net}</span> · stub ✓
                      </>
                    ) : (
                      <>take-home {fmtCents(net.netCents)} · expected</>
                    )}
                  </div>
                </button>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-surface-line/60 pt-3">
                  <label className="flex items-center gap-2 text-caption text-ink-dim">
                    Starts
                    <input
                      type="date"
                      value={p.startDate}
                      onChange={(e) => e.target.value && onSetDates(p.id, e.target.value)}
                      className="input w-auto px-2 py-1 text-xs"
                    />
                  </label>
                  <button
                    onClick={() => onToggleArchived(p.id)}
                    className="pressable flex min-h-11 items-center gap-1 text-caption text-ink-dim hover:text-ink"
                  >
                    {p.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                    {p.archived ? "Unarchive" : "Archive"}
                  </button>
                  {confirmingDelete === p.id ? (
                    <span className="flex items-center gap-2 text-caption">
                      <button
                        onClick={() => {
                          setDeleted(p);
                          setConfirmingDelete(null);
                          onDelete(p.id);
                        }}
                        className="pressable min-h-11 font-semibold text-neg"
                      >
                        Really delete?
                      </button>
                      <button onClick={() => setConfirmingDelete(null)} className="pressable min-h-11 text-ink-dim hover:text-ink">
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingDelete(p.id)}
                      disabled={periods.length === 1}
                      className="pressable flex min-h-11 items-center gap-1 text-caption text-ink-dim hover:text-neg disabled:opacity-40"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {deleted && (
        <UndoToast
          message={`Deleted ${periodLabel(deleted.startDate, deleted.endDate)}.`}
          onUndo={() => {
            const p = deleted;
            setDeleted(null);
            onRestorePeriod(p);
          }}
          onDismiss={() => setDeleted(null)}
        />
      )}
    </div>
  );
}

export const newOtherIncome = (): OtherIncomeDraft => ({
  id: uid(),
  date: todayIso(),
  source: "",
  gross: "",
  net: "",
  updatedAt: Date.now(),
});
