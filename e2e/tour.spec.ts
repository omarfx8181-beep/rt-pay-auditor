/**
 * The guided tour: offers itself once after onboarding, walks the real
 * screens tab by tab, and never comes back after skip/finish — but
 * replays on demand from Me → How to use this app.
 */
import { expect, test } from "@playwright/test";
import { tabButton } from "./helpers.ts";

test("tour auto-offers once, walks across tabs, and replays from the how-to card", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator('button:has-text("Skip for now")').first().click();
  await page.waitForTimeout(700);

  // Auto-offered after onboarding, starting on the period picker.
  await expect(page.locator("text=Your pay period")).toBeVisible();

  // Walk forward: step 2, 3 (Home), then 4 hops to Shifts by itself.
  await page.locator('button:has-text("Next")').click();
  await expect(page.locator("text=What the check should say")).toBeVisible();
  await page.locator('button:has-text("Next")').click();
  await expect(page.locator("text=Payday? Start here")).toBeVisible();
  await page.locator('button:has-text("Next")').click();
  await expect(page.locator("text=Shifts go in here")).toBeVisible();

  // Back returns to the previous step (and its tab).
  await page.locator('button:has-text("Back")').click();
  await expect(page.locator("text=Payday? Start here")).toBeVisible();

  // Skip ends it; a reload never re-offers.
  await page.locator('button:has-text("Skip tour")').click();
  await expect(page.locator("text=Payday? Start here")).toHaveCount(0);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await expect(page.locator("text=Your pay period")).toHaveCount(0);

  // Replay lives in Me → How to use this app.
  await tabButton(page, "Me").click();
  await page.locator('button:has-text("How to use this app")').click();
  await page.locator('button:has-text("Take the guided tour")').click();
  await expect(page.locator("text=Your pay period")).toBeVisible();
  await page.locator('button:has-text("Skip tour")').click();
});
