import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Activity, CalendarClock, CalendarRange, FileCheck2, SlidersHorizontal } from "lucide-react";
import {
  AUDIT_TOLERANCE_CENTS,
  computeNet,
  computePeriod,
  dollarsToCents,
  type BonusTier,
} from "./lib/engine.ts";
import { draftToConfig, draftToShift, num, type CfgDraft, type ShiftDraft } from "./lib/draft.ts";
import { buildAuditRows } from "./lib/audit.ts";
import {
  addDays,
  buildBackup,
  mergeBackup,
  nextPeriodRange,
  parseBackup,
  periodLabel,
  PERIOD_DAYS,
  type PayPeriod,
} from "./lib/periods.ts";
import { db, setCurrentPeriodId } from "./db/db.ts";
import { EMPTY_IDENTITY, type EmailIdentity } from "./lib/hrEmail.ts";
import { fmtCents, fmtNum, fmtSignedCents } from "./lib/format.ts";
import { Eyebrow, Hero, TabBar, type Tab } from "./ui/kit.tsx";
import Shifts from "./screens/Shifts.tsx";
import Paycheck, { type WhatIfDraft } from "./screens/Paycheck.tsx";
import Audit from "./screens/Audit.tsx";
import Rules from "./screens/Rules.tsx";
import Periods from "./screens/Periods.tsx";

const TABS: Tab[] = [
  { id: "shifts", label: "Shifts", Icon: CalendarClock },
  { id: "paycheck", label: "Paycheck", Icon: Activity },
  { id: "audit", label: "Audit", Icon: FileCheck2 },
  { id: "rules", label: "Rules", Icon: SlidersHorizontal },
  { id: "periods", label: "Periods", Icon: CalendarRange },
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
  // Surface a storage failure instead of an eternal splash (private
  // browsing modes and sandboxed webviews can block IndexedDB).
  const [dbError, setDbError] = useState("");
  useEffect(() => {
    db.open().catch((e: unknown) => setDbError(String(e instanceof Error ? e.message : e)));
  }, []);

  const periods = useLiveQuery(() => db.periods.orderBy("startDate").reverse().toArray(), []);
  const currentIdSetting = useLiveQuery(() => db.settings.get("currentPeriodId"), []);
  // null = stored-nothing, undefined = still loading (gate render on these
  // so panels mount with the real saved values)
  const identityRow = useLiveQuery(async () => (await db.settings.get("identity")) ?? null, []);
  const apiKeyRow = useLiveQuery(async () => (await db.settings.get("anthropicApiKey")) ?? null, []);

  if (!periods || periods.length === 0 || identityRow === undefined || apiKeyRow === undefined) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="max-w-sm px-6 text-center">
          <Eyebrow accent>Fairview · Biweekly · Kronos</Eyebrow>
          <h1 className="mt-1.5 font-display text-3xl font-semibold">RT Pay Auditor</h1>
          {dbError !== "" && (
            <p className="mt-4 font-mono text-sm text-neg">
              This browser blocked local storage ({dbError}). Open the app directly in Safari or Chrome — everything
              it saves lives on your device.
            </p>
          )}
        </div>
      </div>
    );
  }

  const current = periods.find((p) => p.id === currentIdSetting?.value) ?? periods[0];
  let identity = EMPTY_IDENTITY;
  try {
    if (identityRow) identity = { ...EMPTY_IDENTITY, ...(JSON.parse(identityRow.value) as EmailIdentity) };
  } catch {
    /* corrupt setting → start blank */
  }
  // key by period id: switching periods remounts the workspace with fresh drafts
  return (
    <PeriodWorkspace
      key={current.id}
      record={current}
      periods={periods}
      identity={identity}
      apiKey={apiKeyRow?.value ?? ""}
    />
  );
}

function PeriodWorkspace({
  record,
  periods,
  identity,
  apiKey,
}: {
  record: PayPeriod;
  periods: PayPeriod[];
  identity: EmailIdentity;
  apiKey: string;
}) {
  const [tab, setTab] = useState("shifts");
  const [cfgDraft, setCfgDraft] = useState<CfgDraft>(record.cfgDraft);
  const [tiers, setTiers] = useState<BonusTier[]>(record.tiers);
  const [shiftDrafts, setShiftDrafts] = useState<ShiftDraft[]>(record.shifts);
  const [actual, setActual] = useState<Record<string, string>>(record.actual);
  const [whatIf, setWhatIf] = useState<WhatIfDraft>({ hours: "12", units548: "10", weekend: false, charge: "0" });
  const [importStatus, setImportStatus] = useState("");
  const tabIndex = useRef(0);

  // Persist edits: debounced while typing, flushed on unmount/period switch.
  const snapshot = useRef({ shifts: shiftDrafts, actual, cfgDraft, tiers });
  snapshot.current = { shifts: shiftDrafts, actual, cfgDraft, tiers };
  const dirty = useRef(false);
  useEffect(() => {
    dirty.current = true;
    const t = setTimeout(() => {
      dirty.current = false;
      void db.periods.update(record.id, { ...snapshot.current, updatedAt: Date.now() });
    }, 400);
    return () => clearTimeout(t);
  }, [shiftDrafts, actual, cfgDraft, tiers, record.id]);
  useEffect(
    () => () => {
      if (dirty.current) void db.periods.update(record.id, { ...snapshot.current, updatedAt: Date.now() });
    },
    [record.id],
  );

  const cfg = useMemo(() => draftToConfig(cfgDraft), [cfgDraft]);
  const shifts = useMemo(() => shiftDrafts.map(draftToShift), [shiftDrafts]);
  const period = useMemo(() => computePeriod(shifts, cfg), [shifts, cfg]);
  const net = useMemo(() => computeNet(period.grossCents, cfg), [period.grossCents, cfg]);
  const auditRows = useMemo(() => buildAuditRows(period, net), [period, net]);

  const netDeltaCents = (actual.net ?? "") === "" ? null : dollarsToCents(num(actual.net)) - net.netCents;
  const offCount = auditRows.filter((row) => {
    const raw = actual[row.key] ?? "";
    return raw !== "" && Math.abs(dollarsToCents(num(raw)) - row.expectedCents) > AUDIT_TOLERANCE_CENTS;
  }).length;
  // "Reconciled" only when net matches AND no line anywhere is red — a
  // matching net must not paper over a shorted line elsewhere.
  const reconciled = netDeltaCents !== null && Math.abs(netDeltaCents) <= AUDIT_TOLERANCE_CENTS && offCount === 0;

  const selectTab = (id: string, index: number) => {
    const dx = index > tabIndex.current ? 28 : index < tabIndex.current ? -28 : 0;
    document.documentElement.style.setProperty("--page-dx", `${dx}px`);
    tabIndex.current = index;
    setTab(id);
  };

  /* ---- period management (Periods tab) ---- */

  const createNext = async () => {
    const latest = periods.reduce((a, b) => (a.endDate > b.endDate ? a : b));
    const now = Date.now();
    const fresh: PayPeriod = {
      id: crypto.randomUUID(),
      ...nextPeriodRange(latest.endDate),
      shifts: [],
      actual: {},
      // Rules roll forward from the latest period; history keeps its own.
      // eveningHours is period DATA (manual timecard entry, SPEC §6 Q3),
      // not a rule — a fresh period starts at zero.
      cfgDraft: { ...latest.cfgDraft, eveningHours: "0" },
      tiers: latest.tiers,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.periods.add(fresh);
    await setCurrentPeriodId(fresh.id);
  };

  const exportBackup = async () => {
    const all = await db.periods.toArray();
    const json = JSON.stringify(buildBackup(all, new Date().toISOString()), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rt-pay-auditor-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const backup = parseBackup(await file.text());
      const existing = await db.periods.toArray();
      const { merged, added, updated, skipped } = mergeBackup(existing, backup.periods);
      await db.periods.bulkPut(merged);
      setImportStatus(`Imported: ${added} added, ${updated} updated, ${skipped} unchanged.`);
    } catch (err) {
      setImportStatus(String(err instanceof Error ? err.message : err));
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-28 pt-[max(20px,env(safe-area-inset-top))] md:max-w-5xl md:pb-12">
      <header>
        <Eyebrow accent>Fairview · Biweekly · Kronos</Eyebrow>
        <h1 className="mt-1.5 font-display text-[40px] font-semibold leading-none tracking-tight">RT Pay Auditor</h1>
        <p className="mt-2 font-mono text-sm text-ink-dim">
          Pay period {periodLabel(record.startDate, record.endDate)}
          {record.archived ? " · archived" : ""}
        </p>
      </header>

      <TabBar tabs={TABS} active={tab} onSelect={selectTab} />

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
            cfg={cfg}
            apiKey={apiKey}
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
        {tab === "audit" && (
          <Audit
            rows={auditRows}
            actual={actual}
            setActual={setActual}
            cfg={cfg}
            shifts={shifts}
            periodStart={record.startDate}
            periodEnd={record.endDate}
            identity={identity}
            onSaveIdentity={(id) => void db.settings.put({ key: "identity", value: JSON.stringify(id) })}
          />
        )}
        {tab === "rules" && (
          <Rules
            cfgDraft={cfgDraft}
            setCfgDraft={setCfgDraft}
            tiers={tiers}
            setTiers={setTiers}
            unit548Cents={cfg.unit548Cents}
            apiKey={apiKey}
            onSaveApiKey={(key) => void db.settings.put({ key: "anthropicApiKey", value: key })}
          />
        )}
        {tab === "periods" && (
          <Periods
            periods={periods}
            currentId={record.id}
            onSelect={(id) => void setCurrentPeriodId(id)}
            onCreateNext={() => void createNext()}
            onSetDates={(id, startDate) =>
              void db.periods.update(id, { startDate, endDate: addDays(startDate, PERIOD_DAYS - 1), updatedAt: Date.now() })
            }
            onToggleArchived={(id) => {
              const p = periods.find((x) => x.id === id);
              if (p) void db.periods.update(id, { archived: !p.archived, updatedAt: Date.now() });
            }}
            onDelete={async (id) => {
              if (periods.length <= 1) return;
              await db.periods.delete(id);
              if (id === record.id) {
                const remaining = periods.filter((p) => p.id !== id);
                await setCurrentPeriodId(remaining[0].id);
              }
            }}
            onExport={() => void exportBackup()}
            onImportFile={(f) => void importFile(f)}
            importStatus={importStatus}
          />
        )}
      </main>

      <TabBarSpacer />
    </div>
  );
}

/** Keeps the last content clear of the fixed bottom bar on phones. */
function TabBarSpacer() {
  return <div className="h-2 md:hidden" />;
}
