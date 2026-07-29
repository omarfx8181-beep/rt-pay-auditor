/**
 * Milestone B — the connective tissue: the what-if commits real shifts,
 * a clean check hands over the next period, paydays announce waiting
 * checks, and the scoreboard's open dollars open their dispute.
 */
import { expect, test } from "@playwright/test";
import { gotoApp, lineInput, tabButton } from "./helpers.ts";

test("what-if 'I'm taking it' lands in Shifts with the priced shift open in the sheet", async ({ page }) => {
  await gotoApp(page);
  await page.locator('button:has-text("What if I pick up a shift?")').click();
  await page.locator('button:has-text("12h pickup · 10 units")').click();
  await page.locator('button:has-text("I\'m taking it — add the shift")').click();

  await expect(page.locator('h2:has-text("New shift")')).toBeVisible(); // the sheet, ready for its date
  await expect(page.locator('label:has(span:text-is("Paid hours")) input')).toHaveValue("12");
});

test("a clean newest check offers the next period; its payday later announces the waiting check", async ({ page }) => {
  await gotoApp(page);
  await page.locator('button:has-text("Check my paycheck")').first().click();
  await expect(page.locator("text=Your check is right")).toBeVisible();

  // green hands over the rhythm's next step
  await page.locator('button:has-text("Start the next period")').click();
  await expect(page.getByRole("button", { name: "Jul 6 – Jul 19, 2026" })).toBeVisible();

  // that period's payday (Jul 24) has passed — once it has shifts, it's a waiting check
  await tabButton(page, "Shifts").click();
  await page.locator('button:has-text("Add a shift"), button:has-text("Add shift")').first().click();
  await page.locator('label:has(span:text-is("Date")) input').fill("2026-07-10");
  await page.locator('button:has-text("Done")').click();
  await tabButton(page, "Home").click();

  await expect(page.locator("text=Payday was")).toBeVisible();
  await page.locator('button:has-text("Payday was")').click();
  await expect(page.locator('h2:has-text("Check my paycheck")')).toBeVisible();
});

test("the scoreboard's open dollars tap into the dispute they count", async ({ page }) => {
  await gotoApp(page);
  await page.locator('button:has-text("Check my paycheck")').first().click();
  await lineInput(page, "Critical shift bonus").fill("950.00");
  await expect(page.locator("text=You're owed $250.00")).toBeVisible();

  await page.locator('button:has-text("This check")').first().click();
  await expect(page.locator("text=$250.00 caught")).toBeVisible();
  await page.locator('button:has-text("still open")').click();
  await expect(page.locator('h2:has-text("Check my paycheck")')).toBeVisible();
});
