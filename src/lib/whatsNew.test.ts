/** What's-new gating: once per update, never on fresh installs. */
import { describe, expect, test } from "vitest";
import { RELEASES, releaseToShow } from "./whatsNew.ts";

describe("releaseToShow", () => {
  test("an update from an older version shows the current release once", () => {
    expect(releaseToShow("0.1.0", "1.0.0")?.version).toBe("1.0.0");
  });

  test("fresh install (never seen a version) announces nothing", () => {
    expect(releaseToShow(null, "1.0.0")).toBeNull();
  });

  test("already seen → quiet; unknown current version → quiet", () => {
    expect(releaseToShow("1.0.0", "1.0.0")).toBeNull();
    expect(releaseToShow("1.0.0", "9.9.9")).toBeNull();
  });

  test("every release entry is complete and plain", () => {
    for (const r of RELEASES) {
      expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.points.length).toBeGreaterThan(0);
      for (const p of r.points) expect(p).not.toMatch(/548|308|320/); // codes stay out of announcements
    }
  });
});
