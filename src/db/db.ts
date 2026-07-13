/**
 * Local-first storage: Dexie over IndexedDB, same stack as Knockdown.
 * Nothing leaves the device (CLAUDE.md rule 3). All period logic lives
 * in src/lib/periods.ts — this layer only reads and writes.
 */
import Dexie, { type EntityTable } from "dexie";
import { FAIRVIEW_RT_PRESET } from "../lib/presets.ts";
import { ACTUAL_SEED, DEMO_SHIFTS } from "../lib/draft.ts";
import type { OtherIncomeDraft, PayPeriod } from "../lib/periods.ts";

interface Setting {
  key: string;
  value: string;
}

export const db = new Dexie("rt-pay-auditor") as Dexie & {
  periods: EntityTable<PayPeriod, "id">;
  settings: EntityTable<Setting, "key">;
  otherIncome: EntityTable<OtherIncomeDraft, "id">;
};

db.version(1).stores({
  periods: "id, startDate, endDate, archived",
  settings: "key",
});

db.version(2).stores({
  periods: "id, startDate, endDate, archived",
  settings: "key",
  otherIncome: "id, date",
});

// First run: seed the validated 6/22–7/05 demo period so a fresh install
// lands on real, reconciled numbers (Knockdown's seed.ts pattern).
// Rules come from the Fairview RT preset — periods carry a snapshot of
// preset data, never a reference (V3-M7, brief §6).
db.on("populate", (tx) => {
  const now = Date.now();
  const seed: PayPeriod = {
    id: crypto.randomUUID(),
    startDate: "2026-06-22",
    endDate: "2026-07-05",
    shifts: DEMO_SHIFTS,
    actual: ACTUAL_SEED,
    cfgDraft: FAIRVIEW_RT_PRESET.cfgDraft,
    tiers: FAIRVIEW_RT_PRESET.tiers,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  void tx.table("periods").add(seed);
  void tx.table("settings").add({ key: "currentPeriodId", value: seed.id });
});

export const setCurrentPeriodId = (id: string) => db.settings.put({ key: "currentPeriodId", value: id });
