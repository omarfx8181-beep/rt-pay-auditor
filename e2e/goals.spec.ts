/**
 * The Goals tab: set a year target, the meter fills, the plan prices
 * the gap in overtime/bonus/extra shifts, bars deep-link into checks.
 */
import { expect, test } from "@playwright/test";
import { gotoApp, tabButton } from "./helpers.ts";

test("year goal: meter, engine-priced plan, persistence, and bar deep-links", async ({ page }) => {
  await gotoApp(page);
  await tabButton(page, "Goals").click();

  // empty state invites a goal
  await expect(page.locator("text=Set your 2026 goal")).toBeVisible();

  // set $150k before taxes
  await page.locator('label:has-text("Target for 2026") input').fill("150000");
  await expect(page.locator("text=of $150,000.00 before taxes")).toBeVisible();
  await expect(page.locator("text=Behind even pace")).toBeVisible(); // one check in, July

  // the plan translates the gap into effort
  await expect(page.locator("text=The plan to get there")).toBeVisible();
  await expect(page.locator("text=Needed per check")).toBeVisible();
  await expect(page.locator("text=Overtime, per check")).toBeVisible();
  await expect(page.locator("text=Extra 12-hr shifts, rest of the year")).toBeVisible();

  // year-in-bars: the June check is a solid bar that opens its stub detail
  await page.locator('button[aria-label*="Sun, 7/5"]').click();
  await expect(page.locator('h2:has-text("Check my paycheck")')).toBeVisible();

  // the strategizer: pickup menu, priced values, honest top-out
  await tabButton(page, "Goals").click();
  await expect(page.locator("text=Plan your pickups")).toBeVisible();
  await expect(page.locator("text=12h ≈")).toBeVisible();
  await page.locator('label:has-text("Days open, per check") input').fill("2");
  await expect(page.locator("text=Tops out at")).toBeVisible(); // $150k gap dwarfs 2 pickups
  await expect(page.locator("text=Year lands ≈")).toBeVisible();

  // the goal survives a reload (settle beat: the goal persists via a
  // fire-and-forget settings put)
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await tabButton(page, "Goals").click();
  await expect(page.locator("text=of $150,000.00 before taxes")).toBeVisible();

  // switching to take-home reprices the same goal
  await page.locator('button:has-text("Take-home")').last().click();
  await expect(page.locator("text=of $150,000.00 take-home")).toBeVisible();
});
