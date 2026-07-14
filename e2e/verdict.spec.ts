/** The three-state verdict over the seeded real period. */
import { expect, test } from "@playwright/test";
import { gotoApp, lineInput } from "./helpers.ts";

test("seeded stub is green; shorting the bonus flips red with exactly $250; tax drift is amber", async ({ page }) => {
  await gotoApp(page);
  await page.locator('button:has-text("Check my paycheck")').first().click();

  // green — the seeded ACTUAL matches the engine
  await expect(page.locator("text=Your check is right")).toBeVisible();
  await expect(page.locator("text=Paid in full")).toBeVisible();

  // red — the June scenario: bonus paid 5 units short
  await lineInput(page, "Critical shift bonus").fill("950.00");
  await expect(page.locator("text=You're owed $250.00")).toBeVisible();
  await expect(page.locator("text=short 5 units")).toBeVisible();
  await expect(page.locator('a:has-text("Email HR")')).toBeVisible();

  // the mailto draft carries the code and the exact ask
  const href = await page.locator('a:has-text("Email HR")').getAttribute("href");
  expect(decodeURIComponent(href ?? "")).toContain("short $250.00 (5.0 units of code 548)");

  // amber — bonus restored, federal withholding drifts
  await lineInput(page, "Critical shift bonus").fill("1200.00");
  await lineInput(page, "Federal tax").fill("1130.64");
  await expect(page.locator("text=Needs a look")).toBeVisible();
  await expect(page.locator("text=Federal tax took more")).toBeVisible();
});

test("the proof packet opens with the verdict and the line table", async ({ page }) => {
  await gotoApp(page);
  await page.locator('button:has-text("Check my paycheck")').first().click();
  await page.locator('button:has-text("Save this check as a record")').click();
  await expect(page.locator("text=Paycheck check record")).toBeVisible();
  await expect(page.locator("text=CHECK IS RIGHT — paid in full")).toBeVisible();
  await expect(page.locator("text=Expected vs the stub")).toBeVisible();
});
