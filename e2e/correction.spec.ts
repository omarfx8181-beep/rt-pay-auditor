/**
 * Off-cycle correction checks: a shorted period + payroll's mid-week
 * fix = "made whole", and the money shows up everywhere.
 */
import { expect, test } from "@playwright/test";
import { gotoApp, lineInput, tabButton } from "./helpers.ts";

test("a red check flips to made-whole once the correction covers it", async ({ page }) => {
  await gotoApp(page);
  await page.locator('button:has-text("Check my paycheck")').first().click();

  // the June scenario: bonus 5 units short
  await lineInput(page, "Critical shift bonus").fill("950.00");
  await expect(page.locator("text=You're owed $250.00")).toBeVisible();

  // log payroll's mid-week correction stub
  await page.locator('button:has-text("Log a correction check")').click();
  await page.locator('label:has(span:text-is("Gross $")) input').fill("250.00");
  await page.locator('label:has(span:text-is("To your account $")) input').fill("180.50");
  await page.locator('input[placeholder*="what it fixed"]').fill("548 bonus shortfall");
  await page.locator('button:has-text("Log the correction")').click();

  await expect(page.locator("text=Made whole — corrected ✓")).toBeVisible();
  await expect(page.locator("text=You're owed $250.00")).toHaveCount(0);
  await expect(page.locator('a:has-text("Email HR")')).toHaveCount(0);

  // the hero pill agrees
  await page.locator('button:has-text("This check")').first().click();
  await expect(page.locator("text=Made whole")).toBeVisible();

  // and the period card carries the extra money + the tag
  await tabButton(page, "Me").click();
  const card = page.locator("section", { hasText: "Jun 22 – Jul 5, 2026" }).first();
  await expect(card).toContainText("corrected ✓");
  await expect(card).toContainText("$5,962.49"); // 5,781.99 stub net + 180.50 correction
});
