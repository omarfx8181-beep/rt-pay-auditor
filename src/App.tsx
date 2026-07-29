import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, CircleUserRound, House, Target } from "lucide-react";
import { computeNet, computePeriod, type BonusTier } from "./lib/engine.ts";
import { blankShift, draftToConfig, draftToLeave, draftToShift, type CfgDraft, type LeaveDraft, type ShiftDraft } from "./lib/draft.ts";
import { buildAuditRows } from "./lib/audit.ts";
import { computeVerdict } from "./lib/verdict.ts";
import {
  addDays,
  buildBackup,
  mergeBackup,
  mergeYtdAnchorSettings,
  nextPeriodRange,
  overlappingEnds,
  parseBackup,
  periodLabel,
  rollupYtd,
  correctionTotals,
  PERIOD_DAYS,
  type CorrectionDraft,
  type PayPeriod,
  type YtdAnchor,
} from "./lib/periods.ts";
import type { FutureBatch } from "./lib/scanRouting.ts";
import { buildYearCsv, yearCsvName } from "./lib/csv.ts";
import { scanRowsToDrafts, setScanModel } from "./lib/scan.ts";
import { db, setCurrentPeriodId } from "./db/db.ts";
import { EMPTY_IDENTITY, type EmailIdentity } from "./lib/hrEmail.ts";
import { TabBar, UndoToast, type Tab } from "./ui/kit.tsx";
import Home from "./screens/Home.tsx";
import Shifts from "./screens/Shifts.tsx";
import type { WhatIfDraft } from "./screens/Paycheck.tsx";
import { FAIRVIEW_RT_PRESET, PRESETS } from "./lib/presets.ts";
import { buildPaydayCalendar, upcomingPaydays } from "./lib/payday.ts";
import Me, { newOtherIncome, type AppearanceMode, type QuestionAnswer } from "./screens/Me.tsx";
import Onboarding from "./screens/Onboarding.tsx";
import Tour from "./screens/Tour.tsx";
import Goals from "./screens/Goals.tsx";
import { parseGoals, type GoalsSetting } from "./lib/goals.ts";
import { parsePto, type PtoConfig } from "./lib/pto.ts";
import { parseW2Setting, type W2Typed } from "./lib/w2.ts";
import type { OnNow } from "./lib/shiftClock.ts";
import { isInstalled, isIos, requestPersist } from "./lib/storageHealth.ts";
import { applyUpdate, onUpdateReady } from "./lib/swUpdate.ts";
import { releaseToShow } from "./lib/whatsNew.ts";
import WhatsNewSheet from "./screens/WhatsNew.tsx";

const TABS: Tab[] = [
  { id: "home", label: "Home", Icon: House },
  { id: "shifts", label: "Shifts", Icon: CalendarClock },
  { id: "goals", label: "Goals", Icon: Target },
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
  const closeEnoughRow = useLiveQuery(async () => (await db.settings.get("closeEnough")) ?? null, []);
  const goalsRow = useLiveQuery(async () => (await db.settings.get("goals")) ?? null, []);
  const ptoRow = useLiveQuery(async () => (await db.settings.get("pto")) ?? null, []);
  const w2Row = useLiveQuery(async () => (await db.settings.get("w2")) ?? null, []);
  // The active tab lives HERE, above the per-period workspace: switching
  // periods remounts the workspace (key=id) and must not yank the user
  // back to Home. Onboarding's "Scan my schedule" lands on Shifts.
  const [tab, setTab] = useState<string>("home");
  // Importing a backup rewrites periods UNDER the mounted workspace; its
  // key must change or stale drafts clobber the imported data on the
  // next keystroke. The nonce forces the remount.
  const [importNonce, setImportNonce] = useState(0);
  // Same reason for the delete-undo window: deleting the CURRENT period
  // switches periods, and the toast must survive that remount.
  const [deletedPeriod, setDeletedPeriod] = useState<{ period: PayPeriod; wasCurrent: boolean } | null>(null);
  useEffect(() => {
    if (deletedPeriod === null) return;
    const t = setTimeout(() => setDeletedPeriod(null), 8000);
    return () => clearTimeout(t);
  }, [deletedPeriod]);

  // v1.0 shell: ask the browser to never evict our storage (installed
  // Home Screen apps are safe on iOS; browser tabs need the grant).
  useEffect(() => {
    void requestPersist();
  }, []);

  // A new build installed and is waiting — offer the restart, never force it.
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => onUpdateReady(() => setUpdateReady(true)), []);

  // The scan model is config, not a constant — Anthropic retires ids
  // on their schedule (Me → Advanced overrides; blank = default).
  const scanModelRow = useLiveQuery(async () => (await db.settings.get("scanModel")) ?? null, []);
  useEffect(() => {
    setScanModel(scanModelRow?.value ?? null);
  }, [scanModelRow]);

  // Announce updates once per version. Fresh installs record silently
  // (onboarding's onDone stamps the version); data that predates the
  // stamp means an UPDATE from pre-1.0 — those get the announcement.
  const lastSeenRow = useLiveQuery(async () => (await db.settings.get("lastSeenVersion")) ?? null, []);
  const release =
    onboardingRow?.value === "done" && lastSeenRow !== undefined
      ? releaseToShow(lastSeenRow?.value ?? "0.0.0", __APP_VERSION__)
      : null;

  // The guided tour hops tabs, so it lives up here too. It offers itself
  // exactly once (after onboarding), and replays from Me → How to use.
  const tourRow = useLiveQuery(async () => (await db.settings.get("tourDone")) ?? null, []);
  const [tourStep, setTourStep] = useState<number | null>(null);
  useEffect(() => {
    if (tourRow === null && onboardingRow?.value === "done") setTourStep((s) => s ?? 0);
  }, [tourRow, onboardingRow]);
  const endTour = () => {
    setTourStep(null);
    void db.settings.put({ key: "tourDone", value: "1" });
  };

  // "Stub details" on any period card jumps straight into that period's
  // check screen. The intent lives up here because opening another
  // period remounts the workspace; Home consumes it once on mount.
  const [homeIntent, setHomeIntent] = useState<{ view: "check" | "breakdown"; periodId: string } | null>(null);
  const openPeriodDetails = (id: string) => {
    // The intent names its period: the workspace may mount once more for
    // the OLD current period before the switch lands, and that interim
    // mount must not consume it.
    setHomeIntent({ view: "check", periodId: id });
    setTab("home");
    void setCurrentPeriodId(id);
  };

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
    paydayDelayRow === undefined ||
    closeEnoughRow === undefined ||
    goalsRow === undefined ||
    ptoRow === undefined ||
    w2Row === undefined
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

  // A new phone's first move is often a RESTORE, not a setup — the
  // onboarding offers it, and it must work before any state exists.
  const restoreFromFile = async (file: File): Promise<string> => {
    const backup = parseBackup(await file.text());
    if (backup.periods.length === 0) {
      throw new Error("That backup has no pay periods — pick a different file.");
    }
    const existing = await db.periods.toArray();
    // The fresh install's demo seed must not survive a restore — the
    // backup carries the user's REAL copy of that window, and merge-by-id
    // would keep both, double-counting a full check in the year.
    const backupIds = new Set(backup.periods.map((p) => p.id));
    const pristineSeedIds = existing.filter((p) => p.updatedAt === p.createdAt && !backupIds.has(p.id)).map((p) => p.id);
    const periodsMerge = mergeBackup(existing, backup.periods);
    const existingOther = await db.otherIncome.toArray();
    const otherMerge = mergeBackup(existingOther, backup.otherIncome ?? []);
    await db.transaction("rw", db.periods, db.otherIncome, db.settings, async () => {
      await db.periods.bulkPut(periodsMerge.merged);
      for (const id of pristineSeedIds) await db.periods.delete(id);
      await db.otherIncome.bulkPut(otherMerge.merged);
      await applyBackupSettings(backup.settings ?? {});
      await db.settings.put({ key: "onboarding", value: "done" });
      await db.settings.put({ key: "lastSeenVersion", value: __APP_VERSION__ });
    });
    const newest = [...backup.periods].sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];
    if (newest) await setCurrentPeriodId(newest.id);
    setImportNonce((n) => n + 1);
    return `Restored ${periodsMerge.added + periodsMerge.updated} period${periodsMerge.added + periodsMerge.updated === 1 ? "" : "s"}.`;
  };

  // First run (and after updates until dismissed): the guided setup.
  if (onboardingRow?.value !== "done") {
    return (
      <Onboarding
        initialStep={Number.parseInt(onboardingRow?.value ?? "0", 10) || 0}
        baseRate={current.cfgDraft.baseRate}
        onRestore={(file) => restoreFromFile(file)}
        onStep={(step) => void db.settings.put({ key: "onboarding", value: String(step) })}
        onSaveBaseRate={(rate) =>
          void db.periods.update(current.id, {
            cfgDraft: { ...current.cfgDraft, baseRate: rate },
            updatedAt: Date.now(),
          })
        }
        onPickPreset={(i) => {
          const preset = PRESETS[i];
          if (preset && preset !== PRESETS[0]) {
            void db.periods.update(current.id, { cfgDraft: preset.cfgDraft, tiers: preset.tiers, updatedAt: Date.now() });
          }
        }}
        onDone={(goTo) => {
          setTab(goTo);
          void db.settings.put({ key: "onboarding", value: "done" });
          // A fresh setup has nothing "new" — stamp so no announcement fires.
          void db.settings.put({ key: "lastSeenVersion", value: __APP_VERSION__ });
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
  const deletePeriod = async (id: string) => {
    if (periods.length <= 1) return;
    const p = periods.find((x) => x.id === id);
    if (!p) return;
    setDeletedPeriod({ period: p, wasCurrent: id === current.id });
    await db.periods.delete(id);
    if (id === current.id) {
      const remaining = periods.filter((x) => x.id !== id);
      await setCurrentPeriodId(remaining[0].id);
    }
  };
  const undoDelete = () => {
    const d = deletedPeriod;
    setDeletedPeriod(null);
    if (!d) return;
    void db.periods.add(d.period);
    if (d.wasCurrent) void setCurrentPeriodId(d.period.id);
  };

  // key by period id: switching periods remounts the workspace with fresh drafts
  return (
    <>
      <PeriodWorkspace
        key={`${current.id}:${importNonce}`}
        record={current}
        periods={periods}
        identity={identity}
        apiKey={apiKeyRow?.value ?? ""}
        feedUrl={feedUrlRow?.value ?? ""}
        appearance={appearance}
        answers={answers}
        ytdAnchors={ytdAnchors}
        lastBackupAt={lastBackupRow ? Number(lastBackupRow.value) || null : null}
        paydayDelayDays={parsePaydayDelay(paydayDelayRow?.value)}
        closeEnoughCents={parseCloseEnough(closeEnoughRow?.value)}
        goals={parseGoals(goalsRow?.value)}
        pto={parsePto(ptoRow?.value)}
        w2Typed={parseW2Setting(w2Row?.value)}
        scanModel={scanModelRow?.value ?? ""}
        tab={tab}
        setTab={setTab}
        onDeletePeriod={(id) => void deletePeriod(id)}
        onImported={() => setImportNonce((n) => n + 1)}
        onStartTour={() => setTourStep(0)}
        onOpenPeriodDetails={openPeriodDetails}
        homeIntent={homeIntent}
        onHomeIntentConsumed={() => setHomeIntent(null)}
      />
      {deletedPeriod && (
        <UndoToast
          message={`Deleted ${periodLabel(deletedPeriod.period.startDate, deletedPeriod.period.endDate)}.`}
          onUndo={undoDelete}
          onDismiss={() => setDeletedPeriod(null)}
        />
      )}
      {updateReady && (
        <div className="fixed inset-x-0 bottom-[max(88px,calc(env(safe-area-inset-bottom)+72px))] z-40 mx-auto flex w-fit max-w-[calc(100vw-40px)] items-center gap-3 rounded-full border border-surface-line bg-surface-card py-1.5 pl-4 pr-1.5 shadow-lg">
          <span className="text-footnote">A new version is ready.</span>
          <button onClick={() => applyUpdate()} className="btn btn-primary pressable min-h-9 px-3 py-1.5 text-xs">
            Restart
          </button>
        </div>
      )}
      {tourStep !== null && <Tour step={tourStep} onStep={setTourStep} onDone={endTour} setTab={setTab} />}
      {release && tourStep === null && (
        <WhatsNewSheet
          release={release}
          onClose={() => void db.settings.put({ key: "lastSeenVersion", value: __APP_VERSION__ })}
        />
      )}
    </>
  );
}

/**
 * Settings from a backup FILL GAPS — they never overwrite a value this
 * device already has (an old file must not regress newer goals, PTO,
 * or identity). YTD anchors are the exception: they carry their own
 * capturedAt, so the newer capture wins per year in either direction.
 */
async function applyBackupSettings(settings: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    if (key === "ytdAnchors") {
      const local = await db.settings.get("ytdAnchors");
      await db.settings.put({ key, value: mergeYtdAnchorSettings(local?.value, value) });
    } else if ((await db.settings.get(key)) === undefined) {
      await db.settings.put({ key, value });
    }
  }
}

/**
 * "Call it even" forgiveness, stored as a dollars string. Default $1.00 —
 * stubs and estimates never agree to the penny. The nickel under-guard
 * lives in the verdict lib regardless of this value.
 */
function parseCloseEnough(raw: string | undefined): number {
  if (raw === undefined) return 100;
  const n = Number.parseFloat(raw.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 100;
}

/** Stored days → number; 0 is a real answer (payday ON period end), only junk falls back. */
function parsePaydayDelay(raw: string | undefined): number {
  if (raw === undefined) return FAIRVIEW_RT_PRESET.facility.paydayDelayDays;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : FAIRVIEW_RT_PRESET.facility.paydayDelayDays;
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
  closeEnoughCents,
  goals,
  pto,
  w2Typed,
  scanModel,
  tab,
  setTab,
  onDeletePeriod,
  onImported,
  onStartTour,
  onOpenPeriodDetails,
  homeIntent,
  onHomeIntentConsumed,
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
  closeEnoughCents: number;
  goals: GoalsSetting;
  pto: PtoConfig;
  w2Typed: Record<string, W2Typed>;
  /** Me → Advanced override for the scan model id; blank = default. */
  scanModel: string;
  tab: string;
  setTab: (tab: string) => void;
  onDeletePeriod: (id: string) => void;
  /** A backup import changed data under this mount — the parent remounts us. */
  onImported: () => void;
  onStartTour: () => void;
  onOpenPeriodDetails: (id: string) => void;
  homeIntent: { view: "check" | "breakdown"; periodId: string } | null;
  onHomeIntentConsumed: () => void;
}) {
  const [cfgDraft, setCfgDraft] = useState<CfgDraft>(record.cfgDraft);
  const [tiers, setTiers] = useState<BonusTier[]>(record.tiers);
  const [shiftDrafts, setShiftDrafts] = useState<ShiftDraft[]>(record.shifts);
  const [leaveDrafts, setLeaveDrafts] = useState<LeaveDraft[]>(record.leave ?? []);
  const [corrections, setCorrections] = useState<CorrectionDraft[]>(record.corrections ?? []);
  const [actual, setActual] = useState<Record<string, string>>(record.actual);
  const [whatIf, setWhatIf] = useState<WhatIfDraft>({ hours: "12", units548: "10", weekend: false, charge: "0" });
  const [importStatus, setImportStatus] = useState("");
  // "I'm taking it" on the what-if card: the new shift opens in the
  // Shifts sheet ready for its date. Lives here — Shifts remounts per
  // tab switch and consumes it on mount.
  const [shiftsEditIntent, setShiftsEditIntent] = useState<string | null>(null);
  const tabIndex = useRef(tab === "shifts" ? 1 : tab === "goals" ? 2 : tab === "me" ? 3 : 0);

  // Persist edits: debounced while typing, flushed on unmount/period switch.
  // The mount render is NOT an edit — writing it back would stamp a fresh
  // updatedAt on every period merely viewed, and backup merge trusts
  // updatedAt to mean "this copy really is newer".
  const snapshot = useRef({ shifts: shiftDrafts, leave: leaveDrafts, corrections, actual, cfgDraft, tiers });
  snapshot.current = { shifts: shiftDrafts, leave: leaveDrafts, corrections, actual, cfgDraft, tiers };
  const dirty = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    dirty.current = true;
    const t = setTimeout(() => {
      dirty.current = false;
      void db.periods.update(record.id, { ...snapshot.current, updatedAt: Date.now() });
    }, 400);
    return () => clearTimeout(t);
  }, [shiftDrafts, leaveDrafts, corrections, actual, cfgDraft, tiers, record.id]);
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

  // The live-ticker's one-tap "I'm on now" — a settings row so it
  // survives tab switches and the workspace remount alike.
  const onNowRow = useLiveQuery(async () => (await db.settings.get("onNow")) ?? null, []);
  const onNow = useMemo((): OnNow | null => {
    if (!onNowRow?.value) return null;
    try {
      const v = JSON.parse(onNowRow.value) as OnNow;
      return typeof v?.shiftId === "string" && Number.isFinite(v?.startMs) && Number.isFinite(v?.endMs) ? v : null;
    } catch {
      return null;
    }
  }, [onNowRow]);
  const onSetOnNow = (v: OnNow | null) => {
    if (v === null) void db.settings.delete("onNow");
    else void db.settings.put({ key: "onNow", value: JSON.stringify(v) });
  };

  // Un-installed iOS Safari can clear a quiet tab's storage — once real
  // data exists, say so ONCE, warmly, on Home.
  const installNudgeRow = useLiveQuery(async () => (await db.settings.get("installNudge")) ?? null, []);
  const installNudge = installNudgeRow === null && periods.length > 1 && isIos() && !isInstalled();

  const correctionGrossCents = useMemo(
    () => correctionTotals({ ...record, corrections }).grossCents,
    [record, corrections],
  );
  const verdict = useMemo(
    () => computeVerdict(auditRows, actual, cfg.unit548Cents, closeEnoughCents, correctionGrossCents),
    [auditRows, actual, cfg.unit548Cents, closeEnoughCents, correctionGrossCents],
  );

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

  // Historical stub: a period with the real gross/net — and, when a scan
  // read the stub's lines, the full itemized actual map, so the year's
  // deduction buckets stay stub-true. Rules snapshot from the earliest
  // period (closest in time to the old stub).
  const logPastStub = async (endDate: string, gross: string, net: string, startDate?: string, actual?: Record<string, string>) => {
    // Same date already logged (re-entry, re-scan, double-tap)? Update
    // that period — never a twin. Incoming values MERGE over what's
    // there (itemized lines survive a totals-only re-entry), and if the
    // twin is the OPEN period the workspace remounts so stale drafts
    // can't revert the save.
    const twin = periods.find((p) => p.endDate === endDate);
    if (twin) {
      const incoming = actual ?? { gross: gross.trim(), net: net.trim() };
      await db.periods.update(twin.id, { actual: { ...twin.actual, ...incoming }, updatedAt: Date.now() });
      if (twin.id === record.id) onImported();
      return;
    }
    const earliest = periods.reduce((a, b) => (a.startDate < b.startDate ? a : b));
    const now = Date.now();
    await db.periods.add({
      id: crypto.randomUUID(),
      startDate: startDate ?? addDays(endDate, -(PERIOD_DAYS - 1)),
      endDate,
      shifts: [],
      leave: [],
      actual: actual ?? { gross: gross.trim(), net: net.trim() },
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
    const settingRows = await db.settings.toArray();
    const settings = Object.fromEntries(settingRows.map((s) => [s.key, s.value]));
    return JSON.stringify(buildBackup(all, others, settings, new Date().toISOString()), null, 2);
  };
  const stampBackup = () => void db.settings.put({ key: "lastBackupAt", value: String(Date.now()) });
  const backupName = () => `rt-pay-backup-${new Date().toISOString().slice(0, 10)}.json`;

  // Revoke AFTER the download has had time to start — a synchronous revoke
  // can cancel the fetch on iOS Safari.
  const revokeLater = (url: string) => setTimeout(() => URL.revokeObjectURL(url), 30_000);

  const exportBackup = async () => {
    const url = URL.createObjectURL(new Blob([await backupJson()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = backupName();
    a.click();
    revokeLater(url);
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

  // Tax-time export: the selected year as one spreadsheet.
  const downloadYearCsv = (y: string) => {
    const url = URL.createObjectURL(new Blob([buildYearCsv(periods, y, otherIncome)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = yearCsvName(y);
    a.click();
    revokeLater(url);
  };

  const downloadPaydays = () => {
    const ics = buildPaydayCalendar(upcomingPaydays(record.endDate, paydayDelayDays, 13));
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "rt-pay-paydays.ics";
    a.click();
    revokeLater(url);
  };

  // Nudge once real data exists and the last backup is old news.
  const backupStale =
    periods.length > 1 && (lastBackupAt === null || Date.now() - lastBackupAt > 28 * 24 * 60 * 60 * 1000);

  const importFile = async (file: File) => {
    try {
      const backup = parseBackup(await file.text());
      const existing = await db.periods.toArray();
      const periodsMerge = mergeBackup(existing, backup.periods);
      const existingOther = await db.otherIncome.toArray();
      const otherMerge = mergeBackup(existingOther, backup.otherIncome ?? []);
      // One transaction — an interrupted import never half-lands.
      await db.transaction("rw", db.periods, db.otherIncome, db.settings, async () => {
        await db.periods.bulkPut(periodsMerge.merged);
        await db.otherIncome.bulkPut(otherMerge.merged);
        await applyBackupSettings(backup.settings ?? {});
      });
      const dupes = overlappingEnds(periodsMerge.merged);
      setImportStatus(
        `Imported: ${periodsMerge.added + otherMerge.added} added, ${periodsMerge.updated + otherMerge.updated} updated, ${periodsMerge.skipped + otherMerge.skipped} unchanged.` +
          (dupes.length > 0
            ? ` Heads up: ${dupes.length} date${dupes.length === 1 ? "" : "s"} now ${dupes.length === 1 ? "has" : "have"} two periods — review below and delete the empty twin.`
            : ""),
      );
      onImported();
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
            tiers={tiers}
            onNow={onNow}
            onSetOnNow={onSetOnNow}
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
            closeEnoughCents={closeEnoughCents}
            corrections={corrections}
            setCorrections={setCorrections}
            backupStale={backupStale}
            installNudge={installNudge}
            onDismissInstallNudge={() => void db.settings.put({ key: "installNudge", value: "done" })}
            onGoToShifts={() => selectTab("shifts", 1)}
            onGoToMe={() => selectTab("me", 3)}
            onOpenPeriodDetails={onOpenPeriodDetails}
            onCelebrated={() => void db.periods.update(record.id, { celebratedAt: Date.now() })}
            onAddShift={(hours, units548, charge) => {
              const fresh = { ...blankShift(), hours, units548, charge };
              setShiftDrafts((arr) => [...arr, fresh]);
              setShiftsEditIntent(fresh.id);
              selectTab("shifts", 1);
            }}
            initialView={homeIntent?.periodId === record.id ? homeIntent.view : null}
            onViewConsumed={onHomeIntentConsumed}
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
            onSetEveningHours={(hours) => setCfgDraft((d) => ({ ...d, eveningHours: hours }))}
            initialEditId={shiftsEditIntent}
            onEditConsumed={() => setShiftsEditIntent(null)}
          />
        )}
        {tab === "goals" && (
          <Goals
            periods={periods}
            otherIncome={otherIncome}
            year={year}
            shifts={shifts}
            cfg={cfg}
            tiers={tiers}
            goals={goals}
            onSaveGoals={(next) => void db.settings.put({ key: "goals", value: JSON.stringify(next) })}
            onOpenPeriodDetails={onOpenPeriodDetails}
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
            year={year}
            ytdAnchors={ytdAnchors}
            otherIncome={otherIncome}
            onSelect={(id) => void setCurrentPeriodId(id)}
            onCreateNext={() => void createNext()}
            onLogPastStub={(endDate, gross, net, startDate, actual) => void logPastStub(endDate, gross, net, startDate, actual)}
            onSetDates={(id, startDate) =>
              void db.periods.update(id, { startDate, endDate: addDays(startDate, PERIOD_DAYS - 1), updatedAt: Date.now() })
            }
            onToggleArchived={(id) => {
              const p = periods.find((x) => x.id === id);
              if (p) void db.periods.update(id, { archived: !p.archived, updatedAt: Date.now() });
            }}
            onDelete={onDeletePeriod}
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
            closeEnough={(closeEnoughCents / 100).toFixed(2)}
            onSetCloseEnough={(v) => void db.settings.put({ key: "closeEnough", value: v })}
            scanModel={scanModel}
            onSaveScanModel={(v) => void db.settings.put({ key: "scanModel", value: v.trim() })}
            onReplayTour={() => void db.settings.put({ key: "onboarding", value: "0" })}
            onStartTour={onStartTour}
            onOpenDetails={onOpenPeriodDetails}
            onDownloadYearCsv={downloadYearCsv}
            pto={pto}
            onSavePto={(next) => void db.settings.put({ key: "pto", value: JSON.stringify(next) })}
            w2Typed={w2Typed}
            onSaveW2={(yr, next) => void db.settings.put({ key: "w2", value: JSON.stringify({ ...w2Typed, [yr]: next }) })}
            baseRateCents={cfg.baseRateCents}
            closeEnoughCents={closeEnoughCents}
          />
        )}
      </main>
    </div>
  );
}
