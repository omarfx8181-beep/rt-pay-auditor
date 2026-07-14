import type { Page } from "@playwright/test";

/** Load the app and clear first-run onboarding if it appears. */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800); // Dexie seed + first render
  const skip = page.locator('button:has-text("Skip for now")').first();
  if (await skip.count()) {
    await skip.click();
    await page.waitForTimeout(600);
  }
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
