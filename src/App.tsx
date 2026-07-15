import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, CircleUserRound, House } from "lucide-react";
import { computeNet, computePeriod, type BonusTier } from "./lib/engine.ts";
import { draftToConfig, draftToLeave, draftToShift, type CfgDraft, type LeaveDraft, type ShiftDraft } from "./lib/draft.ts";
import { buildAuditRows } from "./lib/audit.ts";
import { computeVerdict } from "./lib/verdict.ts";
import {
  addDays,
  buildBackup,
  mergeBackup,
  nextPeriodRange,
  parseBackup,
  rollupYtd,
  PERIOD_DAYS,
  type PayPeriod,
  type YtdAnchor,
} from "./lib/periods.ts";
import type { FutureBatch } from "./lib/scanRouting.ts";
import { scanRowsToDrafts } from "./lib/scan.ts";
import { db, setCurrentPeriodId } from "./db/db.ts";
import { EMPTY_IDENTITY, type EmailIdentity } from "./lib/hrEmail.ts";
import { TabBar, type Tab } from "./ui/kit.tsx";
import Home from "./screens/Home.tsx";
import Shifts from "./screens/Shifts.tsx";
import type { WhatIfDraft } from "./screens/Paycheck.tsx";
import { FAIRVIEW_RT_PRESET } from "./lib/presets.ts";
import { buildPaydayCalendar, upcomingPaydays } from "./lib/payday.ts";
import Me, { newOtherIncome, type AppearanceMode, type QuestionAnswer } from "./screens/Me.tsx";
import Onboarding from "./screens/Onboarding.tsx";

const TABS: Tab[] = [
  { id: "home", label: "Home", Icon: House },
  { id: "shifts", label: "Shifts", Icon: CalendarClock },
  { id: "me", label: "Me", Icon: CircleUserRound },
];

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
  const feedUrlRow = useLiveQuery(async () => (await db.settings.get("icalFeedUrl")) ?? null, []);
  const appearanceRow = useLiveQuery(async () => (await db.settings.get("appearance")) ?? null, []);
  const answersRow = useLiveQuery(async () => (await db.settings.get("questionAnswers")) ?? null, []);
  const onboardingRow = useLiveQuery(async () => (await db.settings.get("onboarding")) ?? null, []);
  const anchorsRow = useLiveQuery(async () => (await db.settings.get("ytdAnchors")) ?? null, []);
  const lastBackupRow = useLiveQuery(async () => (await db.settings.get("lastBackupAt")) ?? null, []);
  const paydayDelayRow = useLiveQuery(async () => (await db.settings.get("paydayDelayDays")) ?? null, []);
  // Where onboarding drops the user ("Scan my schedule" → Shifts).
  const [postOnboardTab, setPostOnboardTab] = useState<"home" | "shifts">("home");

  // Reflect the chosen appearance on <html>; "system" removes the override.
  const appearance = (appearanceRow?.value as AppearanceMode) || "system";
  useEffect(() => {
    if (appearance === "system") delete document.documentElement.dataset.mode;
    else document.documentElement.dataset.mode = appearance;
  }, [appearance]);

  if (
    !periods ||
    periods.length === 0 ||
    identityRow === undefined ||
    apiKeyRow === undefined ||
    feedUrlRow === undefined ||
    appearanceRow === undefined ||
    answersRow === undefined ||
    onboardingRow === undefined ||
    anchorsRow === undefined ||
    lastBackupRow === undefined ||
    paydayDelayRow === undefined
  ) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="max-w-sm px-6 text-center">
          <h1 className="text-large-title tracking-tight">RT Pay</h1>
          <p className="mt-2 text-subhead text-ink-dim">Know what the check should say — before it lands.</p>
          {dbError !== "" && (
            <p className="mt-4 text-sm text-neg">
              This browser blocked local storage ({dbError}). Open the app directly in Safari or Chrome — everything it
              saves lives on your device.
            </p>
          )}
        </div>
      </div>
    );
  }

  const current = periods.find((p) => p.id === currentIdSetting?.value) ?? periods[0];

  // First run (and after updates until dismissed): the guided setup.
  if (onboardingRow?.value !== "done") {
    return (
      <Onboarding
        initialStep={Number.parseInt(onboardingRow?.value ?? "0", 10) || 0}
        baseRate={current.cfgDraft.baseRate}
        onStep={(step) => void db.settings.put({ key: "onboarding", value: String(step) })}
        onSaveBaseRate={(rate) =>
          void db.periods.update(current.id, {
            cfgDraft: { ...current.cfgDraft, baseRate: rate },
            updatedAt: Date.now(),
          })
        }
        onDone={(goTo) => {
          setPostOnboardTab(goTo);
          void db.settings.put({ key: "onboarding", value: "done" });
        }}
      />
    );
  }

  let identity = EMPTY_IDENTITY;
  try {
    if (identityRow) identity = { ...EMPTY_IDENTITY, ...(JSON.parse(identityRow.value) as EmailIdentity) };
  } catch {
    /* corrupt setting → start blank */
  }
  let answers: Record<string, QuestionAnswer> = {};
  try {
    if (answersRow) answers = JSON.parse(answersRow.value) as Record<string, QuestionAnswer>;
  } catch {
    /* corrupt setting → all questions open */
  }
  let ytdAnchors: Record<string, YtdAnchor> = {};
  try {
    if (anchorsRow) ytdAnchors = JSON.parse(anchorsRow.value) as Record<string, YtdAnchor>;
  } catch {
    /* corrupt setting → no anchors until the next stub scan */
  }
  // key by period id: switching periods remounts the workspace with fresh drafts
  return (
    <PeriodWorkspace
      key={current.id}
      record={current}
      periods={periods}
      identity={identity}
      apiKey={apiKeyRow?.value ?? ""}
      feedUrl={feedUrlRow?.value ?? ""}
      appearance={appearance}
      answers={answers}
      ytdAnchors={ytdAnchors}
      lastBackupAt={lastBackupRow ? Number(lastBackupRow.value) || null : null}
      paydayDelayDays={paydayDelayRow ? Number(paydayDelayRow.value) || FAIRVIEW_RT_PRESET.facility.paydayDelayDays : FAIRVIEW_RT_PRESET.facility.paydayDelayDays}
      initialTab={postOnboardTab}
    />
  );
}

function PeriodWorkspace({
  record,
  periods,
  identity,
  apiKey,
  feedUrl,
  appearance,
  answers,
  ytdAnchors,
  lastBackupAt,
  paydayDelayDays,
  initialTab = "home",
}: {
  record: PayPeriod;
  periods: PayPeriod[];
  identity: EmailIdentity;
  apiKey: string;
  feedUrl: string;
  appearance: AppearanceMode;
  answers: Record<string, QuestionAnswer>;
  ytdAnchors: Record<string, YtdAnchor>;
  lastBackupAt: number | null;
  paydayDelayDays: number;
  initialTab?: "home" | "shifts";
}) {
  const [tab, setTab] = useState<string>(initialTab);
  const [cfgDraft, setCfgDraft] = useState<CfgDraft>(record.cfgDraft);
  const [tiers, setTiers] = useState<BonusTier[]>(record.tiers);
  const [shiftDrafts, setShiftDrafts] = useState<ShiftDraft[]>(record.shifts);
  const [leaveDrafts, setLeaveDrafts] = useState<LeaveDraft[]>(record.leave ?? []);
  const [actual, setActual] = useState<Record<string, string>>(record.actual);
  const [whatIf, setWhatIf] = useState<WhatIfDraft>({ hours: "12", units548: "10", weekend: false, charge: "0" });
  const [importStatus, setImportStatus] = useState("");
  const tabIndex = useRef(initialTab === "shifts" ? 1 : 0);

  // Persist edits: debounced while typing, flushed on unmount/period switch.
  const snapshot = useRef({ shifts: shiftDrafts, leave: leaveDrafts, actual, cfgDraft, tiers });
  snapshot.current = { shifts: shiftDrafts, leave: leaveDrafts, actual, cfgDraft, tiers };
  const dirty = useRef(false);
  useEffect(() => {
    dirty.current = true;
    const t = setTimeout(() => {
      dirty.current = false;
      void db.periods.update(record.id, { ...snapshot.current, updatedAt: Date.now() });
    }, 400);
    return () => clearTimeout(t);
  }, [shiftDrafts, leaveDrafts, actual, cfgDraft, tiers, record.id]);
  useEffect(
    () => () => {
      if (dirty.current) void db.periods.update(record.id, { ...snapshot.current, updatedAt: Date.now() });
    },
    [record.id],
  );

  const cfg = useMemo(() => draftToConfig(cfgDraft), [cfgDraft]);
  const shifts = useMemo(() => shiftDrafts.map(draftToShift), [shiftDrafts]);
  const leave = useMemo(() => leaveDrafts.map(draftToLeave), [leaveDrafts]);
  const period = useMemo(() => computePeriod(shifts, cfg, leave), [shifts, cfg, leave]);
  const net = useMemo(() => computeNet(period.grossCents, cfg), [period.grossCents, cfg]);
  const auditRows = useMemo(() => buildAuditRows(period, net), [period, net]);

  const otherIncome = useLiveQuery(() => db.otherIncome.orderBy("date").reverse().toArray(), []) ?? [];
  const year = record.endDate.slice(0, 4);
  const ytd = useMemo(() => rollupYtd(periods, year, otherIncome), [periods, year, otherIncome]);

  const verdict = useMemo(() => computeVerdict(auditRows, actual, cfg.unit548Cents), [auditRows, actual, cfg.unit548Cents]);

  const selectTab = (id: string, index: number) => {
    const dx = index > tabIndex.current ? 28 : index < tabIndex.current ? -28 : 0;
    document.documentElement.style.setProperty("--page-dx", `${dx}px`);
    tabIndex.current = index;
    setTab(id);
  };

  /* ---- period management ---- */

  const createNext = async () => {
    const latest = periods.reduce((a, b) => (a.endDate > b.endDate ? a : b));
    const now = Date.now();
    const fresh: PayPeriod = {
      id: crypto.randomUUID(),
      ...nextPeriodRange(latest.endDate),
      shifts: [],
      leave: [],
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

  // Historical stub: a period with just the real gross/net; rules snapshot
  // from the earliest period (closest in time to the old stub).
  const logPastStub = async (endDate: string, gross: string, net: string, startDate?: string) => {
    const earliest = periods.reduce((a, b) => (a.startDate < b.startDate ? a : b));
    const now = Date.now();
    await db.periods.add({
      id: crypto.randomUUID(),
      startDate: startDate ?? addDays(endDate, -(PERIOD_DAYS - 1)),
      endDate,
      shifts: [],
      leave: [],
      actual: { gross: gross.trim(), net: net.trim() },
      cfgDraft: { ...earliest.cfgDraft, eveningHours: "0" },
      tiers: earliest.tiers,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  };

  /* ---- scan routing: fills and shifts land in the period they belong to ---- */

  /** Rules snapshot for a period created from a scan: nearest in time. */
  const nearestCfg = (endDate: string) => {
    const ms = (s: string) => new Date(s + "T12:00:00").getTime();
    return periods.reduce((a, b) => (Math.abs(ms(a.endDate) - ms(endDate)) <= Math.abs(ms(b.endDate) - ms(endDate)) ? a : b));
  };

  const fillOtherPeriod = async (id: string, filled: Record<string, string>) => {
    const target = periods.find((p) => p.id === id);
    if (!target) return;
    await db.periods.update(id, { actual: { ...target.actual, ...filled }, updatedAt: Date.now() });
    await setCurrentPeriodId(id); // open the period the stub belongs to
  };

  const createPeriodAndFill = async (startDate: string, endDate: string, filled: Record<string, string>) => {
    const nearest = nearestCfg(endDate);
    const now = Date.now();
    const fresh: PayPeriod = {
      id: crypto.randomUUID(),
      startDate,
      endDate,
      shifts: [],
      leave: [],
      actual: filled,
      cfgDraft: { ...nearest.cfgDraft, eveningHours: "0" },
      tiers: nearest.tiers,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.periods.add(fresh);
    await setCurrentPeriodId(fresh.id);
  };

  /** Keep the newest stub's YTD per year — older scans never regress it. */
  const saveYtdAnchor = (anchor: YtdAnchor) => {
    const existing = ytdAnchors[anchor.year];
    if (existing && existing.asOfEnd > anchor.asOfEnd) return;
    // Same as-of day: a stub-column capture (gross/net only) must not wipe
    // a summary anchor that carries payroll's own deduction buckets.
    if (existing && existing.asOfEnd === anchor.asOfEnd && existing.taxesCents != null && anchor.taxesCents == null) return;
    void db.settings.put({ key: "ytdAnchors", value: JSON.stringify({ ...ytdAnchors, [anchor.year]: anchor }) });
  };

  /** Schedule rows for upcoming periods: find-or-create each window, append. */
  const fileFutureShifts = async (batches: FutureBatch[]) => {
    for (const batch of [...batches].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))) {
      const drafts = scanRowsToDrafts(batch.rows);
      const existing = periods.find((p) => batch.startDate >= p.startDate && batch.startDate <= p.endDate);
      if (existing) {
        await db.periods.update(existing.id, { shifts: [...existing.shifts, ...drafts], updatedAt: Date.now() });
      } else {
        const nearest = nearestCfg(batch.endDate);
        const now = Date.now();
        await db.periods.add({
          id: crypto.randomUUID(),
          startDate: batch.startDate,
          endDate: batch.endDate,
          shifts: drafts,
          leave: [],
          actual: {},
          cfgDraft: { ...nearest.cfgDraft, eveningHours: "0" },
          tiers: nearest.tiers,
          archived: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  };

  const backupJson = async () => {
    const all = await db.periods.toArray();
    const others = await db.otherIncome.toArray();
    return JSON.stringify(buildBackup(all, others, new Date().toISOString()), null, 2);
  };
  const stampBackup = () => void db.settings.put({ key: "lastBackupAt", value: String(Date.now()) });
  const backupName = () => `rt-pay-backup-${new Date().toISOString().slice(0, 10)}.json`;

  const exportBackup = async () => {
    const url = URL.createObjectURL(new Blob([await backupJson()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = backupName();
    a.click();
    URL.revokeObjectURL(url);
    stampBackup();
  };

  // The two-tap path: share sheet → Save to Files → iCloud Drive.
  const shareBackup = async () => {
    const file = new File([await backupJson()], backupName(), { type: "application/json" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "RT Pay backup" });
        stampBackup();
      } catch {
        /* user closed the sheet — no stamp, no error */
      }
    } else {
      await exportBackup(); // desktop browsers: plain download, still stamped
    }
  };

  const downloadPaydays = () => {
    const ics = buildPaydayCalendar(upcomingPaydays(record.endDate, paydayDelayDays, 13));
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "rt-pay-paydays.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Nudge once real data exists and the last backup is old news.
  const backupStale =
    periods.length > 1 && (lastBackupAt === null || Date.now() - lastBackupAt > 28 * 24 * 60 * 60 * 1000);

  const importFile = async (file: File) => {
    try {
      const backup = parseBackup(await file.text());
      const existing = await db.periods.toArray();
      const periodsMerge = mergeBackup(existing, backup.periods);
      await db.periods.bulkPut(periodsMerge.merged);
      const existingOther = await db.otherIncome.toArray();
      const otherMerge = mergeBackup(existingOther, backup.otherIncome ?? []);
      await db.otherIncome.bulkPut(otherMerge.merged);
      setImportStatus(
        `Imported: ${periodsMerge.added + otherMerge.added} added, ${periodsMerge.updated + otherMerge.updated} updated, ${periodsMerge.skipped + otherMerge.skipped} unchanged.`,
      );
    } catch (err) {
      setImportStatus(String(err instanceof Error ? err.message : err));
    }
  };

  return (
    // print:hidden — printing is reserved for the proof packet, which
    // portals outside this shell and prints alone.
    <div className="mx-auto min-h-screen w-full max-w-2xl px-5 pb-28 pt-[max(20px,env(safe-area-inset-top))] print:hidden md:max-w-5xl md:pb-12">
      <TabBar tabs={TABS} active={tab} onSelect={selectTab} />

      <main key={tab} className="page-enter md:mt-5">
        {tab === "home" && (
          <Home
            record={record}
            periods={periods}
            onSelectPeriod={(id) => void setCurrentPeriodId(id)}
            onCreateNext={() => void createNext()}
            period={period}
            net={net}
            verdict={verdict}
            auditRows={auditRows}
            actual={actual}
            setActual={setActual}
            cfg={cfg}
            cfgDraft={cfgDraft}
            shifts={shifts}
            whatIf={whatIf}
            setWhatIf={setWhatIf}
            identity={identity}
            onSaveIdentity={(id) => void db.settings.put({ key: "identity", value: JSON.stringify(id) })}
            apiKey={apiKey}
            onFillExisting={(id, filled) => void fillOtherPeriod(id, filled)}
            onCreateAndFill={(startDate, endDate, filled) => void createPeriodAndFill(startDate, endDate, filled)}
            onYtdAnchor={saveYtdAnchor}
            ytd={ytd}
            year={year}
            paydayDelayDays={paydayDelayDays}
            backupStale={backupStale}
            onGoToShifts={() => selectTab("shifts", 1)}
            onGoToMe={() => selectTab("me", 2)}
          />
        )}
        {tab === "shifts" && (
          <Shifts
            shifts={shiftDrafts}
            setShifts={setShiftDrafts}
            leave={leaveDrafts}
            setLeave={setLeaveDrafts}
            tiers={tiers}
            period={period}
            cfg={cfg}
            apiKey={apiKey}
            feedUrl={feedUrl}
            periodStart={record.startDate}
            periodEnd={record.endDate}
            onFileFuture={(batches) => void fileFutureShifts(batches)}
          />
        )}
        {tab === "me" && (
          <Me
            cfgDraft={cfgDraft}
            setCfgDraft={setCfgDraft}
            tiers={tiers}
            setTiers={setTiers}
            unit548Cents={cfg.unit548Cents}
            apiKey={apiKey}
            onSaveApiKey={(key) => void db.settings.put({ key: "anthropicApiKey", value: key })}
            feedUrl={feedUrl}
            onSaveFeedUrl={(url) => void db.settings.put({ key: "icalFeedUrl", value: url })}
            appearance={appearance}
            onSetAppearance={(mode) => void db.settings.put({ key: "appearance", value: mode })}
            answers={answers}
            onSaveAnswers={(next) => void db.settings.put({ key: "questionAnswers", value: JSON.stringify(next) })}
            periods={periods}
            currentId={record.id}
            ytd={ytd}
            ytdAnchor={ytdAnchors[year] ?? null}
            otherIncome={otherIncome}
            onSelect={(id) => void setCurrentPeriodId(id)}
            onCreateNext={() => void createNext()}
            onLogPastStub={(endDate, gross, net, startDate) => void logPastStub(endDate, gross, net, startDate)}
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
            onRestorePeriod={(period) => void db.periods.add(period)}
            onAddOther={() => void db.otherIncome.add(newOtherIncome())}
            onUpdateOther={(id, patch) => void db.otherIncome.update(id, { ...patch, updatedAt: Date.now() })}
            onDeleteOther={(id) => void db.otherIncome.delete(id)}
            onExport={() => void exportBackup()}
            onImportFile={(f) => void importFile(f)}
            importStatus={importStatus}
            lastBackupAt={lastBackupAt}
            onShareBackup={() => void shareBackup()}
            onYtdAnchor={saveYtdAnchor}
            onDownloadPaydays={downloadPaydays}
            paydayDelay={String(paydayDelayDays)}
            onSetPaydayDelay={(v) => void db.settings.put({ key: "paydayDelayDays", value: v })}
          />
        )}
      </main>
    </div>
  );
}
