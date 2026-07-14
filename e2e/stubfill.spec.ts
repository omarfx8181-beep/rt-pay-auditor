/** Stub photo → filled check, split-row summing, and the YTD anchor. */
import { expect, test } from "@playwright/test";
import { gotoApp, JUNE_STUB_JSON, lineInput, mockStubApi, tabButton, TINY_PNG } from "./helpers.ts";

test("scan fills every line (split 548 rows sum), verdict green, YTD anchor agrees", async ({ page }) => {
  await mockStubApi(page, JUNE_STUB_JSON);
  await gotoApp(page);

  // key in Me activates the scan panel
  await tabButton(page, "Me").click();
  await page.locator('label:has(span:text-is("Anthropic API key")) input').fill("sk-ant-e2e-not-real");
  await page.waitForTimeout(600);

  await tabButton(page, "Home").click();
  await page.locator('button:has-text("Check my paycheck")').first().click();
  await page.locator('label:has-text("Scan the stub") input[type="file"]').setInputFiles({
    name: "stub.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });

  await expect(page.locator("text=look right?")).toBeVisible();
  await page.locator('button:has-text("Fill the check")').click();

  // 475 + 725 on two stub rows must land as one 1200 line
  await expect(lineInput(page, "Critical shift bonus")).toHaveValue("1200.00");
  await expect(page.locator("text=Your check is right")).toBeVisible();

  // the stub's YTD column anchored the year
  await tabButton(page, "Me").click();
  await expect(page.locator("text=Your newest stub agrees")).toBeVisible();
});
