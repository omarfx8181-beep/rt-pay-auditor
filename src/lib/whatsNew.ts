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
    version: "1.3.0",
    date: "August 2026",
    title: "The watchdog follows through",
    points: [
      "Email payroll about a shortfall and the app starts a clock — after 10 quiet days it writes you a firmer follow-up.",
      "Every scanned stub checks its own hourly rate: a raise that landed shows up, and one that didn't gets flagged.",
      "Snap the Kronos timecard and see what rounding cost you — in minutes and in dollars.",
      "Send your shifts to the phone's calendar in one tap.",
      "Long-press the app icon for Scan stub or Add a shift, and a proper launch screen instead of a white flash.",
    ],
  },
  {
    version: "1.2.0",
    date: "July 2026",
    title: "Faster, smoother, and keeping score",
    points: [
      "The app opens noticeably faster — rarely-used screens now load only when you need them.",
      "No more white flash launching in dark mode, and the iPhone status bar finally matches your chosen look.",
      "The scoreboard earns records: first catch, money clawed back, 5 clean checks straight, a full year verified.",
    ],
  },
  {
    version: "1.1.0",
    date: "July 2026",
    title: "Everything connects",
    points: [
      "Open the app after payday and it tells you which checks are waiting to be audited — one tap lands on the oldest.",
      "The scoreboard's \"still open\" dollars now open the dispute they count.",
      "\"I'm taking it\" on the what-if card turns the priced pickup into a real shift, sheet open, ready for its date.",
      "The period switcher shows every check's color — green, red with the dollars, amber.",
      "A first-ever green check gets a little celebration, and a clean newest check offers to start the next period.",
    ],
  },
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
