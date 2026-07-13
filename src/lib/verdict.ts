/**
 * The verdict — the emotional hero of the check flow (V3 brief §4).
 *
 * Three states over what the user has typed from the stub:
 *   green — every entered line matches and the take-home line is in:
 *           the check is right.
 *   red   — at least one EARNINGS line paid short: you're owed money.
 *           Only earnings shortfalls make a red; gross/net are arithmetic
 *           echoes of them and taxes on the stub follow the shorted gross,
 *           so neither counts as a separate problem.
 *   amber — nothing shorted, but something doesn't line up (an earnings
 *           line paid over, a deduction drifting from config, or totals
 *           that disagree with matching lines). One guided question.
 * Plus two pre-verdict states: intro (nothing typed) and progress
 * (typing underway, everything matching so far).
 *
 * Pure function over audit rows; no engine math is touched here — deltas
 * come from engine.auditLine (SPEC §3.7 tolerance).
 */
import { auditLine, dollarsToCents, type Cents } from "./engine.ts";
import { num } from "./draft.ts";
import type { AuditRow } from "./audit.ts";

export interface LineDelta {
  key: string;
  label: string;
  techLabel: string;
  kind: AuditRow["kind"];
  expectedCents: Cents;
  paidCents: Cents;
  /** paid − expected; negative = the stub paid short. */
  deltaCents: Cents;
  /** For unit-based lines: Δ$ ÷ unit value. */
  deltaUnits: number | null;
}

export type Verdict =
  | { kind: "intro" }
  | { kind: "progress"; matchedCount: number }
  | { kind: "green"; paidNetCents: Cents }
  | {
      kind: "red";
      /** Sum of earnings shortfalls — the number the headline leads with. */
      owedCents: Cents;
      /** Largest shortfall first. */
      shortfalls: LineDelta[];
      /** Other earnings lines off in the paid-over direction. */
      earningsOvers: LineDelta[];
      /** True when stub tax lines are off too (they follow the short gross). */
      taxesFollow: boolean;
    }
  | { kind: "amber"; question: string; focus: LineDelta | null };

export function computeVerdict(rows: AuditRow[], actual: Record<string, string>, unit548Cents: Cents): Verdict {
  const entered: LineDelta[] = [];
  for (const row of rows) {
    const raw = actual[row.key] ?? "";
    if (raw === "") continue;
    const paidCents = dollarsToCents(num(raw));
    const d = auditLine(row.expectedCents, paidCents, { isUnits: row.isUnits, unit548Cents });
    entered.push({
      key: row.key,
      label: row.label,
      techLabel: row.techLabel,
      kind: row.kind,
      expectedCents: row.expectedCents,
      paidCents,
      deltaCents: d.ok ? 0 : d.deltaCents,
      deltaUnits: d.ok ? null : d.deltaUnits,
    });
  }
  if (entered.length === 0) return { kind: "intro" };

  const offs = entered.filter((e) => e.deltaCents !== 0);
  const netEntry = entered.find((e) => e.key === "net");

  if (offs.length === 0) {
    if (netEntry) return { kind: "green", paidNetCents: netEntry.paidCents };
    return { kind: "progress", matchedCount: entered.length };
  }

  const earningsOffs = offs.filter((e) => e.kind === "earnings");
  const shortfalls = earningsOffs.filter((e) => e.deltaCents < 0).sort((a, b) => a.deltaCents - b.deltaCents);
  const earningsOvers = earningsOffs.filter((e) => e.deltaCents > 0);

  if (shortfalls.length > 0) {
    return {
      kind: "red",
      owedCents: shortfalls.reduce((acc, s) => acc - s.deltaCents, 0),
      shortfalls,
      earningsOvers,
      taxesFollow: offs.some((e) => e.kind === "deduction"),
    };
  }

  // Nothing shorted → one guided question, most likely explanation first.
  if (earningsOvers.length > 0) {
    const f = earningsOvers[0];
    return {
      kind: "amber",
      focus: f,
      question:
        `${f.label} paid more than expected — lucky, or did a rate change? ` +
        "If the rate changed, update it in Me → Your pay rules so future checks stay exact.",
    };
  }
  const deductionOff = offs.find((e) => e.kind === "deduction");
  if (deductionOff) {
    const dir = deductionOff.deltaCents > 0 ? "more" : "less";
    return {
      kind: "amber",
      focus: deductionOff,
      question:
        `Your pay lines all match, but ${deductionOff.label} took ${dir} than expected. ` +
        "If that's the new normal, update it in Me → Advanced so future checks stay exact.",
    };
  }
  // Only gross/net disagree while every entered line matches.
  return {
    kind: "amber",
    focus: offs[0],
    question:
      "Every line you entered matches, but the totals don't — double-check that every line from the stub is entered, especially deductions.",
  };
}
