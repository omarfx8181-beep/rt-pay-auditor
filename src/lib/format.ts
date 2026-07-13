/** UI-edge formatting. Money leaves cents ONLY here (CLAUDE.md rule 2). */
import { centsToDollars, formatCents, type Cents } from "./engine.ts";

export const fmtCents = formatCents;

export const fmtSignedCents = (c: Cents): string => (c >= 0 ? "+" : "") + formatCents(c);

/** Hours / units / rates, 2 dp with grouping — v1's hFmt. */
export const fmtNum = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtRate = (rateCents: number): string => fmtNum(centsToDollars(rateCents));

/** Bonus units read like counts: "5", "2.5" — no trailing zeros. */
export const fmtUnits = (n: number): string =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** "Sun 6/28" from YYYY-MM-DD — v1's dayLabel. */
export const dayLabel = (dateStr: string): string => {
  const d = new Date(dateStr + "T12:00:00");
  return Number.isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
};
