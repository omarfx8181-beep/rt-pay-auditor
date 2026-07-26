/** Timecard true-up: punches replace hours, evening credit fills itself. */
import { expect, test } from "@playwright/test";
import { gotoApp, mockStubApi, tabButton, TINY_PNG } from "./helpers.ts";

test("timecard scan updates punched hours, adds picked-up days, fills evening credit", async ({ page }) => {
  await mockStubApi(page, {
    periodStart: "2026-06-22",
    periodEnd: "2026-07-05",
    days: [
      { date: "2026-06-23", hours: 15.72 }, // scheduled 15.60 → punched longer
      { date: "2026-06-25", hours: 12.2 }, // already right
      { date: "2026-06-27", hours: 8 }, // picked up, never scheduled
    ],
    eveningHours: 19.2,
  });
  await gotoApp(page);
  await tabButton(page, "Shifts").click();

  await page.locator('label:has(span:text-is("Anthropic API key"))').first(); // no-op; key set below via Me
  await tabButton(page, "Me").click();
  await page.locator('label:has(span:text-is("Anthropic API key")) input').fill("sk-ant-test");
  await page.waitForTimeout(500);
  await tabButton(page, "Shifts").click();

  await page.locator('button:has-text("True-up from the timecard")').click();
  await page.locator('label:has-text("Scan the timecard") input[type="file"]').setInputFiles({
    name: "timecard.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });

  // preview shows the change, the addition, and the evening credit
  await expect(page.locator("text=15.60 →")).toBeVisible();
  await expect(page.locator("text=new — wasn't scheduled")).toBeVisible();
  await expect(page.locator("text=Evening credit this period")).toBeVisible();

  await page.locator('button:has-text("Apply the punches")').click();

  // the shift card now carries the punched hours; the picked-up day exists
  await expect(page.locator("button", { hasText: "Tue, 6/23" }).first()).toContainText("15.72");
  await expect(page.locator("button", { hasText: "Sat, 6/27" }).first()).toBeVisible();

  // evening hours landed in the pay rules
  await tabButton(page, "Me").click();
  const eveningRow = page.locator("div", { hasText: /^Evening hours this period/ }).locator("input").first();
  await expect(eveningRow).toHaveValue("19.2");
});
