import { useMemo, useRef, useState } from "react";
import { Activity, CalendarClock, FileCheck2, SlidersHorizontal } from "lucide-react";
import {
  AUDIT_TOLERANCE_CENTS,
  DEFAULT_TIERS,
  computeNet,
  computePeriod,
  dollarsToCents,
  type BonusTier,
} from "./lib/engine.ts";
import {
  ACTUAL_SEED,
  DEFAULT_CFG_DRAFT,
  DEMO_SHIFTS,
  draftToConfig,
  draftToShift,
  num,
  type CfgDraft,
  type ShiftDraft,
} from "./lib/draft.ts";
import { buildAuditRows } from "./lib/audit.ts";
import { fmtCents, fmtNum, fmtSignedCents } from "./lib/format.ts";
import { Eyebrow, Hero, TabBar, type Tab } from "./ui/kit.tsx";
import Shifts from "./screens/Shifts.tsx";
import Paycheck, { type WhatIfDraft } from "./screens/Paycheck.tsx";
import Audit from "./screens/Audit.tsx";
import Rules from "./screens/Rules.tsx";

const TABS: Tab[] = [
  { id: "shifts", label: "Shifts", Icon: CalendarClock },
  { id: "paycheck", label: "Paycheck", Icon: Activity },
  { id: "audit", label: "Audit", Icon: FileCheck2 },
  { id: "rules", label: "Rules", Icon: SlidersHorizontal },
];

function VitalStat({ label, value, sub, color = "" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <div className="eyebrow text-hero-fg/50">{label}</div>
      <div className={`mt-1 font-display text-[26px] font-semibold leading-none tabular-nums sm:text-[30px] ${color}`}>
        {value}
      </div>
      {sub ? <div className="mt-1.5 font-mono text-[11px] text-hero-fg/50">{sub}</div> : null}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("shifts");
  const [cfgDraft, setCfgDraft] = useState<CfgDraft>(DEFAULT_CFG_DRAFT);
  const [tiers, setTiers] = useState<BonusTier[]>(DEFAULT_TIERS);
  const [shiftDrafts, setShiftDrafts] = useState<ShiftDraft[]>(DEMO_SHIFTS);
  const [actual, setActual] = useState<Record<string, string>>(ACTUAL_SEED);
  const [whatIf, setWhatIf] = useState<WhatIfDraft>({ hours: "12", units548: "10", weekend: false, charge: "0" });
  const tabIndex = useRef(0);

  const cfg = useMemo(() => draftToConfig(cfgDraft), [cfgDraft]);
  const shifts = useMemo(() => shiftDrafts.map(draftToShift), [shiftDrafts]);
  const period = useMemo(() => computePeriod(shifts, cfg), [shifts, cfg]);
  const net = useMemo(() => computeNet(period.grossCents, cfg), [period.grossCents, cfg]);
  const auditRows = useMemo(() => buildAuditRows(period, net), [period, net]);

  // Vitals Δ = stub net vs expected net; red count from all filled audit lines.
  const netDeltaCents = actual.net === "" ? null : dollarsToCents(num(actual.net)) - net.netCents;
  const reconciled = netDeltaCents !== null && Math.abs(netDeltaCents) <= AUDIT_TOLERANCE_CENTS;
  const offCount = auditRows.filter((row) => {
    const raw = actual[row.key] ?? "";
    return raw !== "" && Math.abs(dollarsToCents(num(raw)) - row.expectedCents) > AUDIT_TOLERANCE_CENTS;
  }).length;

  // Directional slide, like Knockdown's tab swipe.
  const selectTab = (id: string, index: number) => {
    const dx = index > tabIndex.current ? 28 : index < tabIndex.current ? -28 : 0;
    document.documentElement.style.setProperty("--page-dx", `${dx}px`);
    tabIndex.current = index;
    setTab(id);
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-28 pt-[max(20px,env(safe-area-inset-top))]">
      <header>
        <Eyebrow accent>Fairview · Biweekly · Kronos</Eyebrow>
        <h1 className="mt-1.5 font-display text-[40px] font-semibold leading-none tracking-tight">RT Pay Auditor</h1>
        <p className="mt-2 font-mono text-sm text-ink-dim">Know what the check should say before it lands.</p>
      </header>

      <Hero className="mt-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <VitalStat label="Expected gross" value={fmtCents(period.grossCents)} sub={fmtNum(period.workedHours) + " hrs worked"} />
          <VitalStat label="Expected net" value={fmtCents(net.netCents)} sub={"taxes " + fmtCents(net.taxesCents)} />
          <VitalStat
            label="548 units"
            value={fmtNum(period.units548)}
            sub={fmtCents(Math.round(period.units548 * cfg.unit548Cents)) + " bonus"}
          />
          <VitalStat
            label="Δ stub vs expected"
            value={netDeltaCents === null ? "—" : fmtSignedCents(netDeltaCents)}
            sub={netDeltaCents === null ? "enter the stub in Audit" : reconciled ? "Reconciled ✓" : `${offCount} line(s) off — see Audit`}
            color={netDeltaCents === null ? "" : reconciled ? "text-hero-pos" : "text-hero-neg"}
          />
        </div>
      </Hero>

      <main key={tab} className="page-enter mt-5">
        {tab === "shifts" && (
          <Shifts
            shifts={shiftDrafts}
            setShifts={setShiftDrafts}
            tiers={tiers}
            period={period}
            unit548Label={fmtCents(cfg.unit548Cents)}
          />
        )}
        {tab === "paycheck" && (
          <Paycheck
            period={period}
            net={net}
            shifts={shifts}
            cfg={cfg}
            cfgDraft={cfgDraft}
            whatIf={whatIf}
            setWhatIf={setWhatIf}
          />
        )}
        {tab === "audit" && <Audit rows={auditRows} actual={actual} setActual={setActual} cfg={cfg} />}
        {tab === "rules" && (
          <Rules
            cfgDraft={cfgDraft}
            setCfgDraft={setCfgDraft}
            tiers={tiers}
            setTiers={setTiers}
            unit548Cents={cfg.unit548Cents}
          />
        )}
      </main>

      <TabBar tabs={TABS} active={tab} onSelect={selectTab} />
    </div>
  );
}
