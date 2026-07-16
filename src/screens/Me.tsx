/**
 * Me — settings + your data (V3 brief §4).
 * Top level stays human: role & employer, base rate, pay rules in plain
 * rows, schedule scan, appearance. Every tax / 403(b) / Section-125 /
 * MN-Paid-Leave / effective-rate field lives behind the collapsed
 * Advanced disclosure with pre-filled defaults and one-line explanations.
 * The old Periods tab (year totals, past stubs, other income, backup,
 * period management) lives here too, under "Your periods & data".
 */
import { useMemo, useRef, useState } from "react";
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
import { periodLabel, prevPeriodRange, rollupYtd, ytdThroughDate, type OtherIncomeDraft, type PayPeriod, type YtdAnchor, type YtdRollup } from "../lib/periods.ts";
import { planStubImports, scannedStubActual, scanStubFiles, stubStartDate, type ScannedStub } from "../lib/stubScan.ts";
import { summaryToAnchor } from "../lib/scanRouting.ts";
import { dayLabel, fmtCents } from "../lib/format.ts";
import { CalloutCard, Card, Disclosure, Eyebrow } from "../ui/kit.tsx";
import HowToCard from "./HowTo.tsx";

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

/**
 * Tier units keep a local draft string while typing — parsing on every
 * keystroke ate decimal points ("2.5" became "25" because "2." parsed
 * to 2 and re-rendered before the 5 landed).
 */
function TierUnitsInput({ units, onCommit }: { units: number; onCommit: (units: number) => void }) {
  const [draft, setDraft] = useState(String(units));
  const editing = useRef(false);
  if (!editing.current && draft !== String(units)) setDraft(String(units));
  return (
    <input
      value={draft}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onCommit(num(e.target.value));
      }}
      onBlur={() => {
        editing.current = false;
        setDraft(String(units));
      }}
      inputMode="decimal"
      className="input w-16 px-2.5 py-1.5 text-right text-sm tabular-nums"
      aria-label="Tier bonus units"
    />
  );
}

/* ---- upload a year of stubs: files → preview → periods ---- */
function StubScanPanel({
  apiKey,
  periods,
  paydayDelayDays,
  onLogPastStub,
  onYtdAnchor,
}: {
  apiKey: string;
  periods: PayPeriod[];
  paydayDelayDays: number;
  onLogPastStub: (endDate: string, gross: string, net: string, startDate?: string, actual?: Record<string, string>) => void;
  onYtdAnchor: (anchor: YtdAnchor) => void;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "working" }
    | { status: "error"; msg: string }
    | { status: "preview"; toAdd: ScannedStub[]; duplicates: ScannedStub[]; anchor: YtdAnchor | null }
  >({ status: "idle" });

  const handleFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    setState({ status: "working" });
    try {
      const scanned = await scanStubFiles(files, apiKey);
      const plan = planStubImports(periods, scanned.stubs);
      const anchor = scanned.summary ? summaryToAnchor(scanned.summary, periods, paydayDelayDays, Date.now()) : null;
      if (plan.toAdd.length === 0 && plan.duplicates.length === 0 && anchor === null) {
        throw new Error("No stubs or year-to-date summary detected in those files.");
      }
      setState({ status: "preview", ...plan, anchor });
    } catch (err) {
      setState({ status: "error", msg: String(err instanceof Error ? err.message : err) });
    }
  };

  return (
    <div className="space-y-3">
      {apiKey ? (
        <label className="btn btn-ghost pressable cursor-pointer text-xs">
          <FileScan size={14} /> Scan stub PDFs or photos
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
      ) : (
        <button
          onClick={() => {
            setState({
              status: "error",
              msg: "Scanning needs your Anthropic API key — it's the Scans card just above. Add it once and this button does the rest.",
            });
            document.getElementById("scan-credentials")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          className="btn btn-ghost pressable text-xs"
        >
          <FileScan size={14} /> Scan stub PDFs or photos
        </button>
      )}

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
          {state.anchor && (
            <p className="rounded-xl bg-accent/10 px-3 py-2 text-footnote">
              Year to date from the summary: <span className="font-semibold tabular-nums">{fmtCents(state.anchor.grossCents)}</span> made
              {state.anchor.netCents !== null && (
                <>
                  {" "}· <span className="font-semibold tabular-nums">{fmtCents(state.anchor.netCents)}</span> take-home
                </>
              )}
              , through {dayLabel(state.anchor.asOfEnd)} — this anchors the Year card above.
            </p>
          )}
          <div className="divide-y divide-surface-line/60 text-xs tabular-nums">
            {state.toAdd.map((s) => (
              <div key={s.endDate} className="flex items-baseline justify-between gap-3 py-1.5">
                <span>
                  ends {dayLabel(s.endDate)}
                  {s.lines !== null && <span className="ml-1.5 text-pos">itemized ✓</span>}
                </span>
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
            {(state.toAdd.length > 0 || state.anchor) && (
              <button
                onClick={() => {
                  for (const s of state.toAdd) onLogPastStub(s.endDate, s.gross, s.net, stubStartDate(s), scannedStubActual(s));
                  if (state.anchor) onYtdAnchor(state.anchor);
                  setState({ status: "idle" });
                }}
                className="btn btn-primary pressable text-xs"
              >
                {state.toAdd.length > 0
                  ? `Add ${state.toAdd.length} period${state.toAdd.length > 1 ? "s" : ""}${state.anchor ? " + set the year anchor" : ""}`
                  : "Set the year anchor"}
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

/* ---- the year money story: pay in, everything taken out, take-home ---- */

function MoneyRow({
  label,
  hint,
  amount,
  tone,
  strong,
}: {
  label: string;
  hint?: string;
  amount: string;
  tone?: "dim" | "pos";
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className={`text-subhead ${strong ? "font-semibold" : ""}`}>{label}</div>
        {hint ? <div className="text-caption text-ink-dim">{hint}</div> : null}
      </div>
      <span
        className={`shrink-0 text-subhead tabular-nums ${strong ? "font-semibold" : ""} ${
          tone === "dim" ? "text-ink-dim" : tone === "pos" ? "text-pos" : ""
        }`}
      >
        {amount}
      </span>
    </div>
  );
}

/**
 * Gross → every bucket that comes out → take-home. Payroll's own YTD
 * split (a scanned Year-to-Date summary) outranks the app's per-period
 * sums; the app path keeps its arithmetic exact with a "not itemized"
 * line covering checks logged only as totals.
 */
function YearMoneyStory({ ytd, anchor }: { ytd: YtdRollup; anchor: YtdAnchor | null }) {
  const payroll =
    anchor !== null &&
    anchor.taxesCents != null &&
    anchor.pretaxCents != null &&
    anchor.aftertaxCents != null &&
    anchor.netCents !== null
      ? {
          source: `Payroll's own totals through ${dayLabel(anchor.asOfEnd)}, from your scanned year-to-date summary.`,
          grossCents: anchor.grossCents,
          taxesCents: anchor.taxesCents,
          pretaxCents: anchor.pretaxCents,
          aftertaxCents: anchor.aftertaxCents,
          imputedCents: anchor.imputedCents ?? 0,
          netCents: anchor.netCents,
        }
      : null;
  if (payroll === null && (ytd.periodCount === 0 || ytd.grossCents <= 0)) return null;
  const rows = payroll ?? {
    source:
      "App totals for Fairview checks — real stub numbers where you've scanned or typed them, estimates elsewhere. Scan a year-to-date summary and payroll's own split takes over.",
    grossCents: ytd.grossCents,
    taxesCents: ytd.taxesCents,
    pretaxCents: ytd.pretaxCents,
    aftertaxCents: ytd.aftertaxCents,
    imputedCents: ytd.imputedCents,
    netCents: ytd.netCents,
  };
  // Exactly zero on the payroll path (net was derived from these buckets);
  // on the app path it's whatever the buckets can't account for.
  const residualCents =
    rows.grossCents - rows.taxesCents - rows.pretaxCents - rows.aftertaxCents - rows.imputedCents - rows.netCents;
  const showResidual = Math.abs(residualCents) >= 100;
  return (
    <div className="mt-3 border-t border-surface-line/60 pt-3">
      <Eyebrow>Where the money went</Eyebrow>
      <div className="mt-2">
        <MoneyRow label="Pay before anything comes out" amount={fmtCents(rows.grossCents)} />
        <MoneyRow
          label="Taxes withheld"
          hint="Federal, Minnesota, Social Security, Medicare, MN paid leave"
          amount={"−" + fmtCents(rows.taxesCents)}
          tone="dim"
        />
        <MoneyRow
          label="Retirement + health insurance"
          hint="Pretax — 403(b), medical, dental, FSA"
          amount={"−" + fmtCents(rows.pretaxCents)}
          tone="dim"
        />
        <MoneyRow
          label="After-tax deductions"
          hint="Accident, critical illness, the rest"
          amount={"−" + fmtCents(rows.aftertaxCents)}
          tone="dim"
        />
        {rows.imputedCents !== 0 && (
          <MoneyRow
            label="Life insurance the hospital adds"
            hint="Counted as pay for taxes — never cash in your check"
            amount={"−" + fmtCents(rows.imputedCents)}
            tone="dim"
          />
        )}
        {showResidual && (
          <MoneyRow
            label={residualCents >= 0 ? "Not itemized yet" : "Line estimates run a little high"}
            hint={
              ytd.bucketSkippedCount > 0
                ? `${ytd.bucketSkippedCount} check${ytd.bucketSkippedCount === 1 ? " is" : "s are"} logged as totals only — scan ${
                    ytd.bucketSkippedCount === 1 ? "its stub" : "those stubs"
                  } to fill this in`
                : "The gap between stub totals and the app's line estimates"
            }
            amount={(residualCents >= 0 ? "−" : "+") + fmtCents(Math.abs(residualCents))}
            tone="dim"
          />
        )}
        <div className="mt-1.5 border-t border-surface-line/60 pt-2">
          <MoneyRow label="Take-home" amount={fmtCents(rows.netCents)} tone="pos" strong />
          <MoneyRow label="Taken out altogether" amount={fmtCents(rows.grossCents - rows.netCents)} tone="dim" />
        </div>
      </div>
      <p className="mt-2 text-caption text-ink-dim">{rows.source}</p>
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
  year,
  ytdAnchors,
  otherIncome,
  onSelect,
  onCreateNext,
  onLogPastStub,
  onSetDates,
  onToggleArchived,
  onDelete,
  onAddOther,
  onUpdateOther,
  onDeleteOther,
  onExport,
  onImportFile,
  importStatus,
  lastBackupAt,
  onShareBackup,
  onYtdAnchor,
  onDownloadPaydays,
  paydayDelay,
  onSetPaydayDelay,
  onReplayTour,
  onStartTour,
  onDownloadYearCsv,
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
  /** The open period's year — the Year card's default view. */
  year: string;
  ytdAnchors: Record<string, YtdAnchor>;
  otherIncome: OtherIncomeDraft[];
  onSelect: (id: string) => void;
  onCreateNext: () => void;
  onLogPastStub: (endDate: string, gross: string, net: string, startDate?: string, actual?: Record<string, string>) => void;
  onSetDates: (id: string, startDate: string) => void;
  onToggleArchived: (id: string) => void;
  onDelete: (id: string) => void;
  onAddOther: () => void;
  onUpdateOther: (id: string, patch: Partial<OtherIncomeDraft>) => void;
  onDeleteOther: (id: string) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  importStatus: string;
  lastBackupAt: number | null;
  onShareBackup: () => void;
  onYtdAnchor: (anchor: YtdAnchor) => void;
  onDownloadPaydays: () => void;
  paydayDelay: string;
  onSetPaydayDelay: (v: string) => void;
  onReplayTour: () => void;
  onStartTour: () => void;
  onDownloadYearCsv: (year: string) => void;
}) {
  const set = (key: keyof CfgDraft) => (value: string) => setCfgDraft((d) => ({ ...d, [key]: value }));
  // The Year card can look at ANY year with data, not just the open
  // period's — same rollup, same anchors, chip-switched below.
  const [yearView, setYearView] = useState(year);
  const years = useMemo(
    () =>
      [...new Set([
        ...periods.map((p) => p.endDate.slice(0, 4)),
        ...otherIncome.map((o) => o.date.slice(0, 4)),
        ...Object.keys(ytdAnchors),
      ])]
        .sort()
        .reverse(),
    [periods, otherIncome, ytdAnchors],
  );
  const ytd = useMemo(() => rollupYtd(periods, yearView, otherIncome), [periods, yearView, otherIncome]);
  const ytdAnchor = ytdAnchors[yearView] ?? null;
  const [key, setKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [feed, setFeed] = useState(feedUrl);
  const [payDelay, setPayDelay] = useState(paydayDelay);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const unanswered = OPEN_QUESTIONS.filter((q) => !answers[q.id]);
  const answered = OPEN_QUESTIONS.filter((q) => answers[q.id]);

  const fileRef = useRef<HTMLInputElement>(null);
  // Delete needs a second tap; the undo toast itself lives in App, above
  // the workspace remount that deleting the current period triggers.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

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

      <HowToCard onStartTour={onStartTour} onReplayTour={onReplayTour} />

      {/* ---- pay rules, in human rows ---- */}
      <div className="pt-3">
        <Eyebrow className="mb-2">Your pay & the rules behind it</Eyebrow>
      </div>
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
              <TierUnitsInput
                units={t.units}
                onCommit={(units) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, units } : x)))}
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

      <div className="pt-3">
        <Eyebrow className="mb-2">Set up once — scans, look & feel, tax numbers</Eyebrow>
      </div>
      {/* ---- scan credentials (schedule + stub scans share these) ---- */}
      <div id="scan-credentials">
      <Card title="Scans — your credentials, your device">
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
          The Anthropic API key powers every scan — schedule screenshots, stub photos on the check screen, and the
          bulk stub upload below. Images go straight from your browser to the API; nothing is stored anywhere else.
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
      </div>

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


      {/* ---- your periods & data (the old Periods tab) ---- */}
      <div className="pt-3">
        <Eyebrow className="mb-2">Your periods & data</Eyebrow>
        <div className="space-y-3">
          <div id="tour-year">
          <Card title={`Year total — ${yearView}`}>
            {years.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {years.map((y) => (
                  <button
                    key={y}
                    onClick={() => setYearView(y)}
                    className={`btn px-3 py-1.5 text-xs ${y === yearView ? "btn-primary" : "btn-ghost"} pressable`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
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
            <YearMoneyStory ytd={ytd} anchor={ytdAnchor} />
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
            <button onClick={() => onDownloadYearCsv(yearView)} className="btn btn-ghost pressable mt-3 text-xs">
              <Download size={13} /> Download {yearView} as a spreadsheet
            </button>
            <p className="mt-1.5 text-caption text-ink-dim">
              Every period with gross, take-home, and the deduction split — for taxes or a loan file.
            </p>
          </Card>
          </div>

          <Disclosure
            title="Add your year — scan old stubs"
            icon={<ReceiptText size={13} className="text-accent" />}
            hint="Scan a whole year of stub PDFs or photos at once — or type each one by hand."
          >
            <div className="space-y-4">
              <StubScanPanel
                apiKey={apiKey}
                periods={periods}
                paydayDelayDays={Number(paydayDelay) || 5}
                onLogPastStub={onLogPastStub}
                onYtdAnchor={onYtdAnchor}
              />
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

          <div id="tour-backup">
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
          </div>

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
                        take-home{" "}
                        <span className="text-pos">
                          {fmtCents(Math.round(num(p.actual.net.replace(/[$,]/g, "")) * 100))}
                        </span>{" "}
                        · stub ✓
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
