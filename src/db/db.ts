/**
 * Local-first storage: Dexie over IndexedDB, same stack as Knockdown.
 * Nothing leaves the device (CLAUDE.md rule 3). All period logic lives
 * in src/lib/periods.ts — this layer only reads and writes.
 */
import Dexie, { type EntityTable } from "dexie";
import { DEFAULT_TIERS } from "../lib/engine.ts";
import { ACTUAL_SEED, DEFAULT_CFG_DRAFT, DEMO_SHIFTS } from "../lib/draft.ts";
import type { PayPeriod } from "../lib/periods.ts";

interface Setting {
  key: string;
  value: string;
}

export const db = new Dexie("rt-pay-auditor") as Dexie & {
  periods: EntityTable<PayPeriod, "id">;
  settings: EntityTable<Setting, "key">;
};

db.version(1).stores({
  periods: "id, startDate, endDate, archived",
  settings: "key",
});

// First run: seed the validated 6/22–7/05 demo period so a fresh install
// lands on real, reconciled numbers (Knockdown's seed.ts pattern).
db.on("populate", (tx) => {
  const now = Date.now();
  const seed: PayPeriod = {
    id: crypto.randomUUID(),
    startDate: "2026-06-22",
    endDate: "2026-07-05",
    shifts: DEMO_SHIFTS,
    actual: ACTUAL_SEED,
    cfgDraft: DEFAULT_CFG_DRAFT,
    tiers: DEFAULT_TIERS,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  void tx.table("periods").add(seed);
  void tx.table("settings").add({ key: "currentPeriodId", value: seed.id });
});

export const setCurrentPeriodId = (id: string) => db.settings.put({ key: "currentPeriodId", value: id });
