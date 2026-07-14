/** Schedule paste: adder detection, period splitting, filing, and undo. */
import { expect, test } from "@playwright/test";
import { gotoApp, SPANNING_ICS, tabButton } from "./helpers.ts";

test("a pasted calendar detects roles, splits by period, files future shifts, and replace can be undone", async ({
  page,
}) => {
  await gotoApp(page);
  await tabButton(page, "Shifts").click();

  await page.locator('button:has-text("Paste calendar text")').click();
  await page.locator("textarea").fill(SPANNING_ICS);
  await page.locator('button:has-text("Read schedule")').click();

  // grouped preview with detected roles
  await expect(page.locator("text=This period ·")).toBeVisible();
  await expect(page.locator("text=Files itself into")).toHaveCount(2);
  await expect(page.locator("text=Charge ✓")).toBeVisible();
  await expect(page.locator("text=Premium ✓")).toBeVisible(); // Transport day

  // replace the seeded shifts → undo brings all 8 back
  await page.locator('button:has-text("Replace shifts (1)")').click();
  await expect(page.locator("text=Replaced 8 shifts.")).toBeVisible();
  await expect(page.locator("button.card")).toHaveCount(1);
  await page.locator('button:has-text("Undo")').click();
  await expect(page.locator("button.card")).toHaveCount(8);

  // the future shifts were still filed into their own periods
  await tabButton(page, "Home").click();
  await page.locator('button:has-text("Jun 22")').first().click();
  await expect(page.locator('button:has-text("Jul 6 – Jul 19")').first()).toBeVisible();
  await page.locator('button:has-text("Jul 6 – Jul 19")').first().click();
  await page.waitForTimeout(700);
  await tabButton(page, "Shifts").click();
  await expect(page.locator('button.card:has-text("7/8")')).toHaveCount(1);
});
