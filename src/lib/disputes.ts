/**
 * Dispute follow-up bookkeeping. The June shortfall sat for weeks
 * because nobody CHASED it — one email, no reply, silence. A period
 * logs each send; this lib says how long payroll has held it and
 * writes the firmer second ask. Pure: the check screen logs and sends.
 */
import { formatCents, type Cents } from "./engine.ts";
import { addDays, periodLabel } from "./periods.ts";
import { daysUntil } from "./payday.ts";
import { dayLabel } from "./format.ts";
import type { EmailIdentity, HrEmail } from "./hrEmail.ts";

export interface DisputeSend {
  /** YYYY-MM-DD */
  at: string;
  kind: "initial" | "followup";
}

/** A full biweekly cycle: past this, payroll had a whole run to fix it. */
export const OVERDUE_DAYS = 10;

/** The reply window the follow-up asks for — one work week. */
const REPLY_DAYS = 5;

export interface DisputeStatus {
  stage: "none" | "waiting" | "overdue";
  daysSinceFirst: number;
  daysSinceLast: number;
  sends: number;
}

/**
 * Where a dispute stands today. The clock that decides the stage runs
 * from the LAST send (a follow-up buys payroll another cycle); the
 * first-send age carries the whole history for the email to cite.
 */
export function disputeStatus(log: DisputeSend[] | undefined, todayIso: string): DisputeStatus {
  const sends = log?.length ?? 0;
  if (sends === 0) return { stage: "none", daysSinceFirst: 0, daysSinceLast: 0, sends: 0 };

  const dates = log!.map((s) => s.at).sort(); // logged order isn't guaranteed
  // A send dated ahead of today (typo, clock skew) reads as today, never negative.
  const since = (iso: string) => Math.max(0, daysUntil(iso, todayIso));
  const daysSinceLast = since(dates[dates.length - 1]);

  return {
    stage: daysSinceLast >= OVERDUE_DAYS ? "overdue" : "waiting",
    daysSinceFirst: since(dates[0]),
    daysSinceLast,
    sends,
  };
}

/** The first ask is the initial one; everything after it chases. */
export const nextSendKind = (log: DisputeSend[] | undefined): DisputeSend["kind"] =>
  (log?.length ?? 0) === 0 ? "initial" : "followup";

const or = (s: string, fallback: string) => (s.trim() === "" ? fallback : s.trim());

/** "today", "1 day ago", "12 days ago" — the wait, stated once. */
const agoText = (days: number): string => (days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`);

/**
 * The second ask: same facts, less patience. It cites the first email
 * by date, restates what's still owed, and names a reply-by date — the
 * line tables went out the first time (buildHrEmail), so this stays
 * short enough to read on a phone.
 */
export function buildFollowUpEmail(args: {
  periodStart: string;
  periodEnd: string;
  identity: EmailIdentity;
  owedCents: Cents;
  firstSentAt: string;
  todayIso: string;
}): HrEmail {
  const label = periodLabel(args.periodStart, args.periodEnd);
  const owed = formatCents(args.owedCents);
  const waited = Math.max(0, daysUntil(args.firstSentAt, args.todayIso));
  const replyBy = dayLabel(addDays(args.todayIso, REPLY_DAYS));

  const name = or(args.identity.name, "[your name]");
  const employeeId = or(args.identity.employeeId, "[employee ID]");
  const title = or(args.identity.title, "RRT");
  const department = or(args.identity.department, "Respiratory Therapy");

  const subject = `Second request — pay correction ${label} — still owed ${owed}`;

  const sections = [
    "Hi Payroll,",
    `I'm following up on my email of ${dayLabel(args.firstSentAt)} (${agoText(waited)}) about my paycheck for ${label}. I have not received a correction or a reply.`,
    `${owed} is still owed for that period. Please issue an off-cycle correction check for it rather than holding it to the next pay cycle.`,
    `Please reply by ${replyBy} with the amount payroll will pay and the date it will be paid. If your records disagree with mine, send me what you show and I will go through it line by line.`,
    `Thank you,\n${name}\n${title} · ${department}\nEmployee ID ${employeeId}`,
  ];

  return { subject, body: sections.join("\n\n") };
}
