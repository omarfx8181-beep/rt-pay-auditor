/** First-run onboarding: resumable mid-flow, done sticks. */
import { expect, test } from "@playwright/test";

test("onboarding resumes at the saved step and never reappears once done", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  await expect(page.locator("text=Know what your check should say")).toBeVisible();
  await page.locator('button:has-text("Get started")').click();
  await expect(page.locator("text=Where do you work?")).toBeVisible();
  await page.locator('button:has-text("Continue")').click();
  await expect(page.locator("text=base hourly rate")).toBeVisible();

  // reload mid-flow → same step
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await expect(page.locator("text=base hourly rate")).toBeVisible();

  await page.locator('button:has-text("Continue")').click();
  await page.locator('button:has-text("Skip for now")').last().click();
  await expect(page.locator("text=Expected take-home")).toBeVisible();

  // done persists
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await expect(page.locator("text=Expected take-home")).toBeVisible();
});
