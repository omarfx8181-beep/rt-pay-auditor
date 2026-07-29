/**
 * "What's new" — releases as data, shown once per version. A fresh
 * install never sees it (nothing is new to someone who just arrived);
 * an update shows the newest entry once, then stays quiet.
 */

export interface Release {
  version: string;
  date: string;
  title: string;
  /** Plain-language bullets — numbers lead, one line each. */
  points: string[];
}

export const RELEASES: Release[] = [
  {
    version: "1.0.0",
    date: "July 2026",
    title: "RT Pay 1.0 — the finished product",
    points: [
      "Backups now carry EVERYTHING — goals, year anchors, PTO, W-2, identity. Restore on a new phone from the first screen.",
      "The app asks iOS to protect its storage, and tells you when installing to the Home Screen would protect it better.",
      "A crash can never trap your data — the recovery screen downloads a backup straight from storage.",
      "Scans handle dead zones honestly: offline notice, timeouts, and plain words instead of error codes.",
      "The app checks for updates hourly and tells you what changed — like right now.",
    ],
  },
];

/**
 * Which release to show: the current one, once, and only to someone
 * who has SEEN a previous version (null lastSeen = fresh install →
 * nothing to announce, just record).
 */
export function releaseToShow(lastSeenVersion: string | null, currentVersion: string): Release | null {
  if (lastSeenVersion === null || lastSeenVersion === currentVersion) return null;
  return RELEASES.find((r) => r.version === currentVersion) ?? null;
}
