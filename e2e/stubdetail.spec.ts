/**
 * Every period is inspectable and fillable: the Me card shows the money
 * trio and "Stub details" jumps straight into that period's check
 * screen. A period with no shifts records the stub instead of auditing
 * it — no false "you're owed".
 */
import { expect, test } from "@playwright/test";
import { gotoApp, tabButton } from "./helpers.ts";

test("period cards jump to the stub lines; shift-less periods record, not audit", async ({ page }) => {
  await gotoApp(page);

  // The seeded period card carries the made/taken-out/take-home trio.
  await tabButton(page, "Me").click();
  const seededCard = page.locator("section", { hasText: "Jun 22 – Jul 5, 2026" }).first();
  await expect(seededCard).toContainText("taken out");
  await expect(seededCard).toContainText("stub ✓");

  // Stub details → that period's check screen, verdict and all.
  await seededCard.locator('button:has-text("Stub details")').click();
  await expect(page.locator('h2:has-text("Check my paycheck")')).toBeVisible();
  await expect(page.locator("text=Your check is right")).toBeVisible();

  // Log a bare past stub, then open ITS details → record mode.
  await tabButton(page, "Me").click();
  await page.locator("button", { hasText: "Add your year — scan old stubs" }).click();
  await page.locator('label:has-text("Gross $") input').fill("3000");
  await page.locator('label:has-text("Net $") input').fill("2000");
  await page.locator('button:has-text("Log stub")').click();
  await page.waitForTimeout(500);

  const pastCard = page.locator("section", { hasText: "Jun 8 – Jun 21, 2026" }).first();
  await expect(pastCard).toContainText("made $3,000.00");
  await pastCard.locator('button:has-text("Stub details")').click();
  await expect(page.locator("text=Just recording this one")).toBeVisible();
  await expect(page.locator("text=You're owed")).toHaveCount(0);
  await expect(page.locator("text=✓ saved").first()).toBeVisible(); // gross/net prefilled read as saved, not judged
});
