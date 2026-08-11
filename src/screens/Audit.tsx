/**
 * The check flow: type the stub, get the verdict (V3 brief §4).
 * The verdict banner leads — green celebrates, red says the dollars
 * you're owed and hands you the HR email, amber asks one guided
 * question. The line-by-line table sits below in plain language.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BadgeCheck, CircleAlert, FileDown, Mail, Plus, Trash2 } from "lucide-react";
import { auditLine, dollarsToCents, type EngineConfig, type Shift } from "../lib/engine.ts";
import { num, todayIso, uid } from "../lib/draft.ts";
import { dayLabel, fmtCents, fmtRate, fmtUnits } from "../lib/format.ts";
import { CalloutCard, Card, Disclosure } from "../ui/kit.tsx";
import type { AuditRow } from "../lib/audit.ts";
import { lineCloseEnough, type LineDelta, type Verdict } from "../lib/verdict.ts";
import { buildHrEmail, type EmailIdentity, type HrEmail } from "../lib/hrEmail.ts";
import { buildFollowUpEmail, disputeStatus, nextSendKind, type DisputeSend } from "../lib/disputes.ts";
import { raiseCheck, type RaiseSignal } from "../lib/raiseWatch.ts";
import { type CorrectionDraft, type PayPeriod, type YtdAnchor } from "../lib/periods.ts";
import type { MeSection } from "./Me.tsx";
import HrEmailPanel from "./HrEmailPanel.tsx";
import StubFillPanel from "./StubFillPanel.tsx";
const ProofPacket = lazy(() => import("./ProofPacket.tsx"));

/**
 * The once-per-check burst — twelve bits of terracotta and green, 700ms,
 * only the FIRST time a period turns green. Motion-reduced users get
 * the drawn checkmark alone.
 */
function Burst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const r = 64 + (i % 3) * 22;
        return (
          <span
            key={i}
            className={`burst-bit absolute left-1/2 top-8 size-2 rounded-full ${i % 2 === 0 ? "bg-pos" : "bg-accent"}`}
            style={{ "--bx": `${Math.cos(angle) * r}px`, "--by": `${Math.sin(angle) * r}px` } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

/** The clean-audit celebration: a checkmark that draws itself. */
function CheckDraw() {
  return (
    <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden fill="none" stroke="currentColor">
      <circle cx="14" cy="14" r="12.5" strokeWidth="2" className="draw-circle" />
      <path d="M8.5 14.5l4 4 7-8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="draw-check" />
    </svg>
  );
}

/** No recipient — the mail app picks payroll from the user's contacts. */
const mailtoHref = (e: HrEmail): string =>
  `mailto:?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}`;

/** "Your critical shift bonus was short 5 units ($250.00)." */
function shortSentence(d: LineDelta): string {
  const label = d.label.charAt(0).toLowerCase() + d.label.slice(1);
  const dollars = fmtCents(Math.abs(d.deltaCents));
  return d.deltaUnits !== null
    ? `Your ${label} was short ${fmtUnits(Math.abs(d.deltaUnits))} units (${dollars}).`
    : `Your ${label} was short ${dollars}.`;
}

/** "today", "1 day ago", "12 days ago" — the wait, said once. */
const agoText = (days: number): string => (days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`);

function VerdictBanner({
  verdict,
  emailHref,
  identityMissing,
  celebrating,
  isNewest,
  onCreateNext,
  onReviewEmail,
  sentAt,
  followUpHref,
  onSendTapped,
  onUnlogSend,
  raiseAnswered = false,
}: {
  verdict: Verdict;
  /** mailto: URL with the pre-written draft; null when no shortfall email exists. */
  emailHref: string | null;
  identityMissing: boolean;
  /** First time this check turned green — burst once. */
  celebrating: boolean;
  /** Newest period → a clean check hands you the next step of the rhythm. */
  isNewest: boolean;
  onCreateNext: () => void;
  onReviewEmail: () => void;
  /** The first ask and its age; null until payroll has actually been emailed. */
  sentAt: { at: string; daysAgo: number } | null;
  /** The firmer second ask — only once payroll has sat on it a full cycle. */
  followUpHref: string | null;
  /** The draft was opened. Only asks — a mailto can't know what Mail did with it. */
  onSendTapped: () => void;
  /** Take the last send back off the clock; absent when there's nothing logged. */
  onUnlogSend?: () => void;
  /** The raise callout is showing — it states both rates, so the amber's generic advice stands down. */
  raiseAnswered?: boolean;
}) {
  if (verdict.kind === "intro") return null;

  if (verdict.kind === "progress") {
    return (
      <Card>
        <p className="text-subhead text-ink-dim">
          {verdict.matchedCount} line{verdict.matchedCount === 1 ? "" : "s"} match ✓ — enter take-home to finish.
        </p>
      </Card>
    );
  }

  if (verdict.kind === "green") {
    return (
      <div className="relative">
        {celebrating && <Burst />}
        <CalloutCard tone="pos">
          <div className="flex items-center gap-2 text-title-2 text-pos">
            <CheckDraw /> Your check is right ✓
          </div>
          <p className="mt-2 text-body">
            <span className="font-semibold tabular-nums">{fmtCents(verdict.paidNetCents)}</span> to your account — every
            line checked out. Nice.
          </p>
          {isNewest && (
            <button onClick={onCreateNext} className="pressable mt-2 flex min-h-11 items-center gap-1 text-subhead font-medium text-accent">
              Start the next period →
            </button>
          )}
        </CalloutCard>
      </div>
    );
  }

  if (verdict.kind === "corrected") {
    return (
      <CalloutCard tone="pos">
        <div className="flex items-center gap-2 text-title-2 text-pos">
          <BadgeCheck size={24} /> Made whole — corrected ✓
        </div>
        <p className="mt-2 text-body">
          Was short <span className="font-semibold tabular-nums">{fmtCents(verdict.owedCents)}</span> — the correction
          paid <span className="font-semibold tabular-nums">{fmtCents(verdict.correctionCents)}</span> back. Counted in
          your year totals.
        </p>
        {isNewest && (
          <button onClick={onCreateNext} className="pressable mt-2 flex min-h-11 items-center gap-1 text-subhead font-medium text-accent">
            Start the next period →
          </button>
        )}
      </CalloutCard>
    );
  }

  if (verdict.kind === "red") {
    const [worst, ...rest] = verdict.shortfalls;
    const clean = rest.length === 0 && verdict.earningsOvers.length === 0;
    return (
      <CalloutCard tone="neg">
        <div className="text-title-2 text-neg tabular-nums">You're owed {fmtCents(verdict.owedCents)}</div>
        <p className="mt-2 text-body">
          {shortSentence(worst)}
          {rest.length > 0 && (
            <>
              {" "}
              Also short: {rest.length} more line{rest.length === 1 ? "" : "s"} — the table below has them.
            </>
          )}
          {verdict.earningsOvers.length > 0 && (
            <> Paid over on {verdict.earningsOvers.map((d) => d.label.toLowerCase()).join(", ")} — worth a rate check.</>
          )}
          {clean && <> Everything else matched.</>}
          {verdict.correctionCents > 0 && (
            <>
              {" "}
              A correction paid {fmtCents(verdict.correctionCents)} so far — still{" "}
              <span className="font-semibold tabular-nums">{fmtCents(verdict.owedCents - verdict.correctionCents)}</span>{" "}
              short.
            </>
          )}
        </p>
        {emailHref ? (
          <a href={emailHref} onClick={onSendTapped} className="btn btn-primary pressable mt-3 w-full sm:w-auto">
            <Mail size={16} /> Email HR — draft ready
          </a>
        ) : null}
        {sentAt && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 text-footnote text-ink-dim">
            <span>
              Emailed payroll {dayLabel(sentAt.at)} · {agoText(sentAt.daysAgo)}
            </span>
            {onUnlogSend && (
              <button onClick={onUnlogSend} className="pressable min-h-11 underline">
                Didn't send it? Take it back
              </button>
            )}
          </div>
        )}
        {followUpHref && (
          <a href={followUpHref} onClick={onSendTapped} className="btn btn-ghost pressable mt-2 w-full sm:w-auto">
            <Mail size={16} /> Send a firmer follow-up
          </a>
        )}
        <button onClick={onReviewEmail} className="pressable mt-2 block min-h-11 py-1 text-subhead font-medium text-accent">
          Read or edit it first ↓
        </button>
        {/* The confirmation bar only exists in the moment the draft is
            opened, and iOS hands off to Mail: send it there, relaunch the
            app cold, and nothing was ever logged. Sending from a laptop
            doesn't touch this screen at all. So the clock stays startable
            after the fact — otherwise the follow-up never appears. */}
        {sentAt === null && onSendTapped && (
          <button onClick={onSendTapped} className="pressable mt-1 block min-h-11 py-1 text-footnote text-ink-dim underline">
            Already emailed payroll about this?
          </button>
        )}
        {identityMissing && (
          <p className="text-footnote text-ink-dim">
            Add your name and employee ID below to sign the draft — saved on this device.
          </p>
        )}
        {verdict.taxesFollow && (
          <p className="mt-2.5 text-footnote text-ink-dim">
            Tax lines follow the shorted pay — they'll straighten out with the correction.
          </p>
        )}
      </CalloutCard>
    );
  }

  return (
    <CalloutCard tone="amber">
      <div className="flex items-center gap-2 text-title-2 text-amber">
        <CircleAlert size={22} /> Needs a look
      </div>
      <p className="mt-2 text-body">{verdict.question}</p>
      {/* The raise callout below answers this with both rates and a button —
          repeating the generic advice above it just says it twice. */}
      {verdict.hint !== undefined && !raiseAnswered && <p className="mt-2 text-footnote text-ink-dim">{verdict.hint}</p>}
    </CalloutCard>
  );
}

/**
 * Raise watch. Regular pay ÷ the stub's OWN regular hours IS the base
 * rate — every differential posts on its own line — so a gap past the
 * nickel means the configured rate is stale. A rules nudge, never an
 * earnings shortfall: the money owed is verdict.ts's job and must not
 * double-count. raiseWatch.ts stays silent unless those hours match the
 * shift list, so this never fires on a period that's simply half logged.
 */
function RaiseCallout({
  signal,
  regHours,
  onGoToMe,
}: {
  signal: RaiseSignal;
  regHours: number;
  onGoToMe?: (section: MeSection) => void;
}) {
  const raise = signal.kind === "raise";
  return (
    <CalloutCard tone={raise ? "pos" : "amber"}>
      <p className="text-subhead font-semibold tabular-nums">
        Your stub pays ${fmtRate(signal.impliedRateCents)}/hr — settings say ${fmtRate(signal.baseRateCents)}.
      </p>
      {raise ? (
        <>
          <p className="mt-1 text-footnote text-ink-dim">
            Raise landed? Update your rate so every check checks against it.
          </p>
          {onGoToMe && (
            <button onClick={() => onGoToMe("rate")} className="btn btn-ghost pressable mt-2.5 text-xs">
              Update my rate
            </button>
          )}
        </>
      ) : (
        <p className="mt-1 text-footnote tabular-nums text-ink-dim">
          That's {fmtCents(Math.abs(Math.round(signal.deltaCents * regHours)))} light this check if the old rate is
          right.
        </p>
      )}
    </CalloutCard>
  );
}

/**
 * The one question a mailto can't answer. Opening the mail app is not
 * sending — the draft gets read and closed all the time — and a clock
 * started on a tap silences the follow-up for a full cycle while the
 * screen claims payroll was chased. So the send is confirmed, once,
 * wherever the tap happened: above the tab bar, like the undo toast,
 * because the draft the user actually edits sits at the bottom of the
 * page.
 */
function SendConfirm({ onSent, onNotYet }: { onSent: () => void; onNotYet: () => void }) {
  return (
    <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md md:bottom-6">
      <div className="card flex items-center justify-between gap-3 p-3">
        <span className="min-w-0 flex-1 text-subhead">Did it go to payroll?</span>
        <button onClick={onSent} className="btn btn-primary pressable min-h-9 px-3 py-1.5 text-xs">
          Yes, sent
        </button>
        <button onClick={onNotYet} className="pressable px-2 py-1 text-xs text-ink-dim hover:text-ink">
          Not yet
        </button>
      </div>
    </div>
  );
}

/**
 * Off-cycle correction checks — payroll fixing a mistake mid-week.
 * Logged against THIS period: three fields, listed with a remove, and
 * the verdict flips to "made whole" once they cover the shortfall.
 */
function CorrectionsPanel({
  corrections,
  setCorrections,
  verdict,
}: {
  corrections: CorrectionDraft[];
  setCorrections: (updater: (arr: CorrectionDraft[]) => CorrectionDraft[]) => void;
  verdict: Verdict;
}) {
  const [open, setOpen] = useState(false);
  const [payDate, setPayDate] = useState(todayIso());
  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [note, setNote] = useState("");
  const showInvite = verdict.kind === "red" || verdict.kind === "corrected" || corrections.length > 0;
  if (!showInvite) return null;
  return (
    <Card>
      <div className="mb-1 flex items-center gap-1.5">
        <BadgeCheck size={13} className="text-pos" />
        <span className="eyebrow">Correction checks</span>
      </div>
      {corrections.length > 0 && (
        <div className="mb-2 divide-y divide-surface-line/60 text-xs tabular-nums">
          {corrections.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
              <span className="w-20 shrink-0">{dayLabel(c.payDate)}</span>
              <span className="min-w-0 flex-1 truncate text-ink-dim">{c.note || "correction"}</span>
              <span>
                ${c.gross} · <span className="text-pos">${c.net} to you</span>
              </span>
              <button
                onClick={() => setCorrections((arr) => arr.filter((x) => x.id !== c.id))}
                className="pressable p-2 text-ink-dim hover:text-neg"
                aria-label="Remove correction"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {open ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">
              <span className="label">Paid on</span>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="input w-auto px-2 py-1.5" />
            </label>
            <label className="flex flex-col">
              <span className="label">Gross $</span>
              <input value={gross} onChange={(e) => setGross(e.target.value)} inputMode="decimal" className="input w-24 px-2 py-1.5 text-right text-[16px] tabular-nums" />
            </label>
            <label className="flex flex-col">
              <span className="label">To your account $</span>
              <input value={net} onChange={(e) => setNet(e.target.value)} inputMode="decimal" className="input w-24 px-2 py-1.5 text-right text-[16px] tabular-nums" />
            </label>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="what it fixed — e.g. 548 bonus shortfall"
            className="input px-2.5 py-1.5 text-[16px]"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (num(gross) <= 0 && num(net) <= 0) return;
                setCorrections((arr) => [
                  ...arr,
                  { id: uid(), payDate, gross: gross.trim(), net: net.trim(), note: note.trim(), updatedAt: Date.now() },
                ]);
                setOpen(false);
                setGross("");
                setNet("");
                setNote("");
              }}
              className="btn btn-primary pressable text-xs"
            >
              Log the correction
            </button>
            <button onClick={() => setOpen(false)} className="pressable px-2 text-xs text-ink-dim">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="btn btn-ghost pressable text-xs">
          <Plus size={13} /> Log a correction check
        </button>
      )}
      {open && (
        <p className="mt-2 text-footnote text-ink-dim">
          Once corrections cover the shortfall, this check reads "made whole."
        </p>
      )}
    </Card>
  );
}

export default function Audit({
  recordOnly = false,
  closeEnoughCents = 5,
  celebrate = false,
  onCelebrated,
  isNewest = false,
  onCreateNext,
  corrections,
  setCorrections,
  rows,
  actual,
  setActual,
  verdict,
  cfg,
  shifts,
  regHours,
  periodStart,
  periodEnd,
  identity,
  onSaveIdentity,
  apiKey,
  periods,
  currentId,
  onFillExisting,
  onCreateAndFill,
  onYtdAnchor,
  disputeLog,
  onDisputeLog,
  onDisputeUnlog,
  onGoToMe,
}: {
  /**
   * True when this period has no shifts or leave logged — there's
   * nothing to audit against, so the screen records the stub instead
   * of judging it (no verdict, no HR email, no misleading deltas).
   */
  recordOnly?: boolean;
  /** "Call it even" forgiveness (Me → Advanced) — overs/drift only; unders keep the nickel. */
  closeEnoughCents?: number;
  /** This green is this period's FIRST — burst once, then stamp it. */
  celebrate?: boolean;
  onCelebrated?: () => void;
  isNewest?: boolean;
  onCreateNext?: () => void;
  corrections: CorrectionDraft[];
  setCorrections: (updater: (arr: CorrectionDraft[]) => CorrectionDraft[]) => void;
  rows: AuditRow[];
  actual: Record<string, string>;
  setActual: (updater: (a: Record<string, string>) => Record<string, string>) => void;
  verdict: Verdict;
  cfg: EngineConfig;
  shifts: Shift[];
  /**
   * PeriodResult.regHours — what the SHIFT LIST says was worked at base
   * rate. The stub's own reg hours (actual.regHours) have to match it
   * before any rate is implied from them.
   */
  regHours: number;
  periodStart: string;
  periodEnd: string;
  identity: EmailIdentity;
  onSaveIdentity: (identity: EmailIdentity) => void;
  apiKey: string;
  periods: PayPeriod[];
  currentId: string;
  onFillExisting: (periodId: string, actual: Record<string, string>) => void;
  onCreateAndFill: (startDate: string, endDate: string, actual: Record<string, string>) => void;
  onYtdAnchor: (anchor: YtdAnchor) => void;
  /** Emails already sent about this period; absent until the first one. */
  disputeLog?: DisputeSend[];
  onDisputeLog?: (send: DisputeSend) => void;
  /** Drop the most recent send — a confirmation the user shouldn't have given. */
  onDisputeUnlog?: () => void;
  /** Jump to a card in Me — the raise callout's "update my rate". */
  onGoToMe?: (section: MeSection) => void;
}) {
  const emailRef = useRef<HTMLDivElement>(null);
  const [proofOpen, setProofOpen] = useState(false);

  // The burst fires exactly once per period: `celebrate` is true only
  // until the stamp lands; keep it visually alive for this mount.
  const [celebrating] = useState(celebrate && verdict.kind === "green");
  useEffect(() => {
    if (celebrate && verdict.kind === "green") onCelebrated?.();
  }, [celebrate, verdict.kind, onCelebrated]);

  const judged = rows.map((row) => {
    const raw = actual[row.key] ?? "";
    const d =
      raw === ""
        ? null
        : auditLine(row.expectedCents, dollarsToCents(num(raw)), {
            isUnits: row.isUnits,
            unit548Cents: cfg.unit548Cents,
          });
    const delta = d === null ? null : { ...d, ok: lineCloseEnough(row.kind, d.deltaCents, closeEnoughCents) };
    return { row, raw, delta };
  });
  // The HR email is about pay, not withholding: earnings lines only.
  const earningsOff = judged.filter((j) => j.delta !== null && !j.delta.ok && j.row.kind === "earnings");
  const discrepancies = earningsOff.map(({ row, raw, delta }) => ({
    key: row.key,
    label: row.techLabel, // payroll needs the stub's own names and codes
    expectedCents: row.expectedCents,
    paidCents: dollarsToCents(num(raw)),
    deltaCents: delta!.deltaCents,
    deltaUnits: delta!.deltaUnits,
  }));
  const email =
    discrepancies.length > 0
      ? buildHrEmail({ periodStart, periodEnd, identity, discrepancies, shifts, unit548Cents: cfg.unit548Cents })
      : null;
  const emailHref = email === null ? null : mailtoHref(email);

  // The dispute clock. Only a RED check chases: "made whole" has nothing
  // left to ask for, and the amount asked is what's STILL owed — payroll
  // already paid back whatever a partial correction covered.
  const today = todayIso();
  const status = disputeStatus(disputeLog, today);
  const firstSentAt = [...(disputeLog ?? [])].map((s) => s.at).sort()[0] ?? null;
  const stillOwedCents =
    verdict.kind === "red" ? verdict.owedCents - Math.min(verdict.correctionCents, verdict.owedCents) : 0;
  // Opening the draft only asks; "Yes, sent" starts the clock.
  const [confirmingSend, setConfirmingSend] = useState(false);
  const logSend = () => {
    onDisputeLog?.({ at: today, kind: nextSendKind(disputeLog) });
    setConfirmingSend(false);
  };
  const followUpHref =
    verdict.kind === "red" && status.stage === "overdue" && firstSentAt !== null
      ? mailtoHref(
          buildFollowUpEmail({
            periodStart,
            periodEnd,
            identity,
            owedCents: stillOwedCents,
            firstSentAt,
            todayIso: today,
          }),
        )
      : null;

  // Rate drift off this stub's own regular line — its dollars AND its
  // hours — against the period's own rules.
  const raise = recordOnly
    ? null
    : raiseCheck({
        actualReg: actual.reg,
        stubRegHours: actual.regHours,
        regHours,
        baseRateCents: cfg.baseRateCents,
      });

  return (
    <div className="space-y-3">
      {recordOnly ? (
        <Card>
          <p className="text-subhead">
            Nothing to audit — no shifts logged. Lines you enter still count in your year totals.
          </p>
        </Card>
      ) : (
        <VerdictBanner
          verdict={verdict}
          emailHref={emailHref}
          identityMissing={identity.name.trim() === "" || identity.employeeId.trim() === ""}
          celebrating={celebrating}
          isNewest={isNewest && onCreateNext !== undefined}
          onCreateNext={() => onCreateNext?.()}
          onReviewEmail={() => emailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          sentAt={firstSentAt === null ? null : { at: firstSentAt, daysAgo: status.daysSinceFirst }}
          followUpHref={followUpHref}
          onSendTapped={() => setConfirmingSend(true)}
          onUnlogSend={status.sends > 0 ? onDisputeUnlog : undefined}
          raiseAnswered={raise !== null}
        />
      )}
      {confirmingSend && <SendConfirm onSent={logSend} onNotYet={() => setConfirmingSend(false)} />}

      {raise && <RaiseCallout signal={raise} regHours={regHours} onGoToMe={onGoToMe} />}

      <CorrectionsPanel corrections={corrections} setCorrections={setCorrections} verdict={verdict} />

      <StubFillPanel
        apiKey={apiKey}
        periods={periods}
        currentId={currentId}
        periodStart={periodStart}
        periodEnd={periodEnd}
        onFillCurrent={(filled) => setActual((a) => ({ ...a, ...filled }))}
        onFillExisting={onFillExisting}
        onCreateAndFill={onCreateAndFill}
        onYtdAnchor={onYtdAnchor}
      />

      <p className="text-subhead text-ink-dim">Or type each line from your stub.</p>

      <Card>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 sm:gap-x-3">
          <div className="label mb-0 py-1">Line</div>
          <div className="label mb-0 w-24 py-1 text-right sm:w-28">On the stub</div>
          <div className="label mb-0 w-20 py-1 text-right sm:w-24">Off by</div>

          {judged.map(({ row, raw, delta }) => (
            <div key={row.key} className="col-span-3 grid grid-cols-subgrid items-center border-t border-surface-line/60 py-1.5">
              <div className={`min-w-0 py-0.5 pr-1 ${row.strong ? "text-headline" : "text-sm"}`}>
                <div className="leading-tight">{row.label}</div>
                <div className="text-caption tabular-nums text-ink-dim">expected {fmtCents(row.expectedCents)}</div>
              </div>
              <input
                value={raw}
                onChange={(e) => setActual((a) => ({ ...a, [row.key]: e.target.value }))}
                inputMode="decimal"
                className="input w-24 px-2 py-1.5 text-right text-[16px] tabular-nums sm:w-28"
              />
              <div
                className={`w-20 text-right text-xs tabular-nums sm:w-24 ${
                  delta === null ? "text-ink-dim/60" : recordOnly || delta.ok ? "text-pos" : "text-neg"
                }`}
              >
                {delta === null
                  ? "—"
                  : recordOnly
                    ? "✓ saved"
                    : delta.ok
                      ? "✓ matches"
                      : (delta.deltaCents > 0 ? "+" : "−") +
                        fmtCents(Math.abs(delta.deltaCents)).slice(1) +
                        (delta.deltaUnits !== null ? ` (${fmtUnits(Math.abs(delta.deltaUnits))}u)` : "")}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {!recordOnly && (
        <Disclosure title="How flagging works" hint={`Short flags at a nickel. Drift forgiven to ${fmtCents(closeEnoughCents)}.`}>
          <p className="text-footnote leading-relaxed text-ink-dim">
            Paid short more than a nickel always flags — in dollars, and in bonus units when that's what was shorted.
            Small drift and overpays are forgiven up to {fmtCents(closeEnoughCents)} ("call it even", Me → Advanced).
            Short never clears green.
          </p>
        </Disclosure>
      )}

      {!recordOnly && verdict.kind !== "intro" && (
        <button
          onClick={() => setProofOpen(true)}
          className="pressable flex min-h-11 items-center gap-1.5 py-1 text-subhead font-medium text-accent"
        >
          <FileDown size={16} /> Save this check as a record (PDF)
        </button>
      )}
      {proofOpen && (
        <Suspense fallback={null}>
        <ProofPacket
          rows={rows}
          actual={actual}
          verdict={verdict}
          closeEnoughCents={closeEnoughCents}
          cfg={cfg}
          shifts={shifts}
          periodStart={periodStart}
          periodEnd={periodEnd}
          identity={identity}
          onClose={() => setProofOpen(false)}
        />
        </Suspense>
      )}

      {!recordOnly && verdict.kind !== "corrected" && discrepancies.length > 0 && (
        <div ref={emailRef}>
          <HrEmailPanel
            discrepancies={discrepancies}
            shifts={shifts}
            periodStart={periodStart}
            periodEnd={periodEnd}
            unit548Cents={cfg.unit548Cents}
            initialIdentity={identity}
            onSaveIdentity={onSaveIdentity}
            onSend={() => setConfirmingSend(true)}
          />
        </div>
      )}
    </div>
  );
}
