/**
 * The check flow: type the stub, get the verdict (V3 brief §4).
 * The verdict banner leads — green celebrates, red says the dollars
 * you're owed and hands you the HR email, amber asks one guided
 * question. The line-by-line table sits below in plain language.
 */
import { useRef } from "react";
import { BadgeCheck, CircleAlert, Mail } from "lucide-react";
import { auditLine, dollarsToCents, type EngineConfig, type Shift } from "../lib/engine.ts";
import { num } from "../lib/draft.ts";
import { fmtCents, fmtUnits } from "../lib/format.ts";
import { CalloutCard, Card } from "../ui/kit.tsx";
import type { AuditRow } from "../lib/audit.ts";
import type { LineDelta, Verdict } from "../lib/verdict.ts";
import { buildHrEmail, type EmailIdentity } from "../lib/hrEmail.ts";
import HrEmailPanel from "./HrEmailPanel.tsx";

/** "Your critical shift bonus was short 5.0 units ($250.00)." */
function shortSentence(d: LineDelta): string {
  const label = d.label.charAt(0).toLowerCase() + d.label.slice(1);
  const dollars = fmtCents(Math.abs(d.deltaCents));
  return d.deltaUnits !== null
    ? `Your ${label} was short ${fmtUnits(Math.abs(d.deltaUnits))} units (${dollars}).`
    : `Your ${label} was short ${dollars}.`;
}

function VerdictBanner({
  verdict,
  emailHref,
  identityMissing,
  onReviewEmail,
}: {
  verdict: Verdict;
  /** mailto: URL with the pre-written draft; null when no shortfall email exists. */
  emailHref: string | null;
  identityMissing: boolean;
  onReviewEmail: () => void;
}) {
  if (verdict.kind === "intro") return null;

  if (verdict.kind === "progress") {
    return (
      <Card>
        <p className="text-subhead text-ink-dim">
          So far so good — {verdict.matchedCount} line{verdict.matchedCount === 1 ? "" : "s"} match ✓. Enter the
          take-home line to finish the check.
        </p>
      </Card>
    );
  }

  if (verdict.kind === "green") {
    return (
      <CalloutCard tone="pos">
        <div className="flex items-center gap-2 text-title-2 text-pos">
          <BadgeCheck size={24} /> Your check is right ✓
        </div>
        <p className="mt-2 text-body">
          Paid in full — <span className="font-semibold tabular-nums">{fmtCents(verdict.paidNetCents)}</span> to your
          account. Every shift, differential, and bonus checked out. Nice.
        </p>
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
            <> Also short: {rest.map((d) => `${d.label.toLowerCase()} (${fmtCents(Math.abs(d.deltaCents))})`).join(", ")}.</>
          )}
          {verdict.earningsOvers.length > 0 && (
            <> Paid over on {verdict.earningsOvers.map((d) => d.label.toLowerCase()).join(", ")} — worth a rate check.</>
          )}
          {clean && <> Everything else matched.</>}
        </p>
        {emailHref ? (
          <a href={emailHref} className="btn btn-primary pressable mt-3 w-full sm:w-auto">
            <Mail size={16} /> Email HR — we've written it for you
          </a>
        ) : null}
        <button onClick={onReviewEmail} className="pressable mt-2 block min-h-11 py-1 text-subhead font-medium text-accent">
          Read or edit it first ↓
        </button>
        {identityMissing && (
          <p className="text-footnote text-ink-dim">
            The draft signs with placeholders until you add your name and employee ID below — one time, saved on this
            device.
          </p>
        )}
        {verdict.taxesFollow && (
          <p className="mt-2.5 text-footnote text-ink-dim">
            Good news: you caught it. The stub's tax lines follow the shorted pay — they'll straighten out when it's
            corrected.
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
    </CalloutCard>
  );
}

export default function Audit({
  rows,
  actual,
  setActual,
  verdict,
  cfg,
  shifts,
  periodStart,
  periodEnd,
  identity,
  onSaveIdentity,
}: {
  rows: AuditRow[];
  actual: Record<string, string>;
  setActual: (updater: (a: Record<string, string>) => Record<string, string>) => void;
  verdict: Verdict;
  cfg: EngineConfig;
  shifts: Shift[];
  periodStart: string;
  periodEnd: string;
  identity: EmailIdentity;
  onSaveIdentity: (identity: EmailIdentity) => void;
}) {
  const emailRef = useRef<HTMLDivElement>(null);

  const judged = rows.map((row) => {
    const raw = actual[row.key] ?? "";
    const delta =
      raw === ""
        ? null
        : auditLine(row.expectedCents, dollarsToCents(num(raw)), {
            isUnits: row.isUnits,
            unit548Cents: cfg.unit548Cents,
          });
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
  const emailHref = email
    ? `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`
    : null;

  return (
    <div className="space-y-3">
      <VerdictBanner
        verdict={verdict}
        emailHref={emailHref}
        identityMissing={identity.name.trim() === "" || identity.employeeId.trim() === ""}
        onReviewEmail={() => emailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      <p className="text-subhead text-ink-dim">
        Type each line from your stub. Anything more than a nickel off gets flagged — in dollars, and in bonus units
        where that's what was shorted.
      </p>

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
                  delta === null ? "text-ink-dim/60" : delta.ok ? "text-pos" : "text-neg"
                }`}
              >
                {delta === null
                  ? "—"
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

      {discrepancies.length > 0 && (
        <div ref={emailRef}>
          <HrEmailPanel
            discrepancies={discrepancies}
            shifts={shifts}
            periodStart={periodStart}
            periodEnd={periodEnd}
            unit548Cents={cfg.unit548Cents}
            initialIdentity={identity}
            onSaveIdentity={onSaveIdentity}
          />
        </div>
      )}
    </div>
  );
}
