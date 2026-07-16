/**
 * The workspace remount seams — switching the current period re-keys the
 * whole workspace, and neither the active tab nor the delete-undo window
 * may be lost in the swap (both live above the remount in App).
 */
import { expect, test } from "@playwright/test";
import { gotoApp, tabButton } from "./helpers.ts";

test("period switching keeps the tab, and deleting the current period still offers undo", async ({ page }) => {
  await gotoApp(page);

  await tabButton(page, "Me").click();
  await expect(page.locator('h1:text-is("Me")')).toBeVisible();

  // Creating the next period switches current → workspace remounts → must stay on Me.
  await page.locator('button:has-text("New period")').click();
  await expect(page.locator('h1:text-is("Me")')).toBeVisible();
  await expect(page.locator("section", { hasText: "Jul 6 – Jul 19, 2026" }).first()).toBeVisible();

  // Deleting the CURRENT period also remounts — the undo toast must survive it.
  await page.locator('button:has-text("Delete")').first().click();
  await page.locator('button:has-text("Really delete?")').click();
  const toast = page.locator("text=Deleted Jul 6 – Jul 19, 2026");
  await expect(toast).toBeVisible();

  await page.locator('button:has-text("Undo")').click();
  await expect(page.locator("section", { hasText: "Jul 6 – Jul 19, 2026" }).first()).toBeVisible();
  await expect(page.locator('h1:text-is("Me")')).toBeVisible();
});
