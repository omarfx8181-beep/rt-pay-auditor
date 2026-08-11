/** Dispute follow-up: how long payroll has had it, and the firmer second email. */
import { describe, expect, test } from "vitest";
import { EMPTY_IDENTITY, type EmailIdentity } from "./hrEmail.ts";
import { buildFollowUpEmail, disputeStatus, nextSendKind, type DisputeSend } from "./disputes.ts";

const IDENTITY: EmailIdentity = { name: "Omar", employeeId: "123456", title: "RRT", department: "Respiratory Therapy" };

const initial = (at: string): DisputeSend => ({ at, kind: "initial" });
const followup = (at: string): DisputeSend => ({ at, kind: "followup" });

describe("disputeStatus", () => {
  test("nothing sent → nothing waiting", () => {
    expect(disputeStatus(undefined, "2026-07-20")).toEqual({
      stage: "none",
      daysSinceFirst: 0,
      daysSinceLast: 0,
      sends: 0,
    });
    expect(disputeStatus([], "2026-07-20").stage).toBe("none");
  });

  test("9 days is still waiting; 10 is overdue — payroll had a full cycle", () => {
    expect(disputeStatus([initial("2026-07-10")], "2026-07-19")).toMatchObject({ stage: "waiting", daysSinceLast: 9 });
    expect(disputeStatus([initial("2026-07-10")], "2026-07-20")).toMatchObject({ stage: "overdue", daysSinceLast: 10 });
  });

  test("the stage clock runs from the LAST send; the first-send age keeps the whole history", () => {
    expect(disputeStatus([initial("2026-06-29"), followup("2026-07-13")], "2026-07-20")).toEqual({
      stage: "waiting", // 7 days since the chase, 21 since the dispute opened
      daysSinceFirst: 21,
      daysSinceLast: 7,
      sends: 2,
    });
  });

  test("logged out of order still reads first-then-last; a future-dated send never goes negative", () => {
    expect(disputeStatus([followup("2026-07-13"), initial("2026-06-29")], "2026-07-20")).toMatchObject({
      daysSinceFirst: 21,
      daysSinceLast: 7,
    });
    expect(disputeStatus([initial("2026-07-25")], "2026-07-20")).toMatchObject({
      stage: "waiting",
      daysSinceFirst: 0,
      daysSinceLast: 0,
    });
  });

  test("nextSendKind: the first ask, then chases", () => {
    expect(nextSendKind(undefined)).toBe("initial");
    expect(nextSendKind([])).toBe("initial");
    expect(nextSendKind([initial("2026-06-29")])).toBe("followup");
  });
});

describe("buildFollowUpEmail", () => {
  const args = {
    periodStart: "2026-06-22",
    periodEnd: "2026-07-05",
    identity: IDENTITY,
    owedCents: 25000, // the June dispute: 5 units of bonus, $250
    firstSentAt: "2026-07-10",
    todayIso: "2026-07-22",
  };
  const email = buildFollowUpEmail(args);

  test("cites the first email by date and how long it has sat", () => {
    expect(email.body).toContain("my email of Fri, 7/10 (12 days ago)");
  });

  test("restates the period and what's still owed, and asks for an off-cycle check by a date", () => {
    expect(email.subject).toBe("Second request — pay correction Jun 22 – Jul 5, 2026 — still owed $250.00");
    expect(email.body).toContain("Jun 22 – Jul 5, 2026");
    expect(email.body).toContain("$250.00 is still owed");
    expect(email.body).toContain("off-cycle correction check");
    expect(email.body).toContain("Please reply by Mon, 7/27");
  });

  test("signs with the identity; a blank one degrades to visible placeholders", () => {
    expect(email.body).toContain("Thank you,\nOmar\nRRT · Respiratory Therapy\nEmployee ID 123456");
    const blank = buildFollowUpEmail({ ...args, identity: EMPTY_IDENTITY });
    expect(blank.body).toContain("[your name]");
    expect(blank.body).toContain("[employee ID]");
  });

  test("plain English: no payroll codes anywhere, and short enough to read on a phone", () => {
    expect(email.body).not.toMatch(/\b(548|308|320)\b/);
    expect(email.body.trim().split(/\s+/).length).toBeLessThan(120);
  });

  test("the wait reads right at 1 day and on the same day", () => {
    expect(buildFollowUpEmail({ ...args, todayIso: "2026-07-11" }).body).toContain("(1 day ago)");
    expect(buildFollowUpEmail({ ...args, todayIso: "2026-07-10" }).body).toContain("(today)");
  });
});
