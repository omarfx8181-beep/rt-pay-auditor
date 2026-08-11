import type { Page } from "@playwright/test";

/**
 * Load the app; clear first-run onboarding and the auto-offered tour.
 *
 * The tour arrives a beat AFTER onboarding closes, so asking "is it on
 * screen yet?" races it: on a slow runner the answer is no, the test
 * walks on, and the tour's full-screen overlay then swallows the next
 * click somewhere unrelated. Wait for it, dismiss it, and don't hand
 * the page back until its dialog is actually gone.
 */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "networkidle" });
  // Wait for the app to RENDER, not for a fixed beat. A cold runner can
  // still be seeding Dexie at 800 ms, and asking "is the skip button
  // there?" too early answers no — leaving onboarding up for the rest of
  // the test, where nothing else can be reached behind it.
  const skip = page.locator('button:has-text("Skip for now")').first();
  const tabs = page.locator("nav button").first();
  await Promise.race([
    skip.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {}),
    tabs.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {}),
  ]);
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
  const tour = page.locator('[role="dialog"][aria-label^="App tour"]');
  await tour.waitFor({ state: "visible", timeout: 4000 }).catch(() => {}); // already dismissed on a re-run
  const skipTour = page.locator('button:has-text("Skip tour")').first();
  if (await skipTour.count()) {
    await skipTour.click();
  }
  await tour.waitFor({ state: "detached", timeout: 4000 }).catch(() => {});
  await tabs.waitFor({ state: "visible", timeout: 20_000 }); // the workspace is up
}

export const tabButton = (page: Page, label: string) =>
  page.locator("nav button").filter({ hasText: new RegExp(`^${label}$`, "i") }).first();

export const lineInput = (page: Page, label: string) =>
  page.locator(`div.col-span-3:has-text("${label}") input`).first();

/** One event inside the seeded June period, one each in the next two. */
export const SPANNING_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "DTSTART:20260630T064500",
  "DTEND:20260630T191500",
  "SUMMARY:MICU Charge",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20260708T064500",
  "DTEND:20260708T191500",
  "SUMMARY:RT Day",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20260721T190000",
  "DTEND:20260722T070000",
  "SUMMARY:Transport",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

/** The real June stub as the vision call would return it (all correct). */
export const JUNE_STUB_JSON = {
  periodStart: "2026-06-22",
  periodEnd: "2026-07-05",
  earnings: [
    { label: "Regular Straight Time", amount: 4202.4 },
    { label: "Overtime", amount: 1354.71 },
    { label: "Double Time", amount: 1744.0 },
    { label: "Adder – Weekend Differential", amount: 61.4 },
    { label: "Shift – Evening", amount: 36.9 },
    { label: "Adder – Charge Pay (308)", amount: 156.0 },
    { label: "Adder – Premium Pay (320)", amount: 108.0 },
    { label: "Critical Shift Bonus (548)", amount: 475.0 },
    { label: "Critical Shift Bonus (548)", amount: 725.0 },
  ],
  taxes: [
    { label: "Federal W/H", amount: 1120.64 },
    { label: "Minnesota W/H", amount: 492.55 },
    { label: "Social Security", amount: 523.72 },
    { label: "Medicare", amount: 122.49 },
    { label: "MN Paid Family Leave EE", amount: 11.96 },
    { label: "MN Paid Medical Leave EE", amount: 27.04 },
  ],
  pretax: [{ label: "403(b) + Medical + Dental + FSA", amount: 683.98 }],
  aftertax: [{ label: "After-tax", amount: 99.04 }],
  gross: 8865.22,
  net: 5781.99,
  ytdGross: 8865.22,
  ytdNet: 5781.99,
};

/** Route-mock the Anthropic API with a canned stub-lines response. */
export async function mockStubApi(page: Page, payload: unknown): Promise<void> {
  await page.context().route("https://api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
    }),
  );
}

/** 1×1 transparent PNG for file-input uploads. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
