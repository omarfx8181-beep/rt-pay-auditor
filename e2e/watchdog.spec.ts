/**
 * The watchdog's follow-through: chasing a shortfall past the first
 * email, handing the shifts to the phone's calendar, and the "take me
 * there" jumps into Me.
 */
import { expect, test } from "@playwright/test";
import { gotoApp, lineInput, tabButton } from "./helpers.ts";

test("the dispute clock starts on a confirmed send, not on opening the draft", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: "Check my paycheck" }).click();

  // the June scenario again: bonus paid 5 units short
  await lineInput(page, "Critical shift bonus").fill("950.00");
  await expect(page.getByText("You're owed $250.00")).toBeVisible();
  await page.waitForTimeout(600); // the period write debounces at 400ms

  // a mailto anchor — opening the draft only asks; reading it and
  // closing Mail must not claim payroll was chased
  await page.getByRole("link", { name: /Email HR/ }).click();
  await expect(page.getByText("Did it go to payroll?")).toBeVisible();
  await page.getByRole("button", { name: "Not yet" }).click();
  await expect(page.getByText(/Emailed payroll/)).toHaveCount(0);

  await page.getByRole("link", { name: /Email HR/ }).click();
  await page.getByRole("button", { name: "Yes, sent" }).click();
  await expect(page.getByText(/Emailed payroll/)).toBeVisible();

  await page.waitForTimeout(600);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Check my paycheck" }).click();
  await expect(page.getByText(/Emailed payroll/)).toBeVisible();

  // and a confirmation given by mistake comes back off the clock
  await page.getByRole("button", { name: /Take it back/ }).click();
  await expect(page.getByText(/Emailed payroll/)).toHaveCount(0);
});

test("sending the edited draft from the email panel starts the same clock", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: "Check my paycheck" }).click();
  await lineInput(page, "Critical shift bonus").fill("950.00");
  await expect(page.getByText("You're owed $250.00")).toBeVisible();

  // the path the banner itself recommends — the only one that sends an edited body
  await page.getByRole("button", { name: /Read or edit it first/ }).click();
  await page.getByRole("link", { name: "Open in Mail" }).click();
  await page.getByRole("button", { name: "Yes, sent" }).click();
  await expect(page.getByText(/Emailed payroll/)).toBeVisible();
});

test("Add to calendar downloads the period's shifts as an .ics", async ({ page }) => {
  await gotoApp(page);
  await tabButton(page, "Shifts").click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Add to calendar" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("rt-pay-shifts-2026-06-22.ics");
});

test("the Add-a-shift shortcut keeps the shift when you accept what it filled in", async ({ page }) => {
  // The shortcut hands over a COMPLETE shift (today, 12 h). Accepting it
  // and tapping Done used to delete it — already saved, so a real delete,
  // and the check would then expect 12 hours less than was worked.
  await gotoApp(page);
  await page.goto("/?action=add-shift", { waitUntil: "networkidle" });
  await expect(page.locator("nav button").first()).toBeVisible({ timeout: 20_000 }); // app booted
  // the shortcut writes a period and opens the sheet — wait for the sheet
  // itself, never a fixed beat (a slow runner loses the race)
  await expect(page.locator('label:has(span:text-is("Paid hours")) input')).toHaveValue("12", { timeout: 15000 });

  await page.getByRole("button", { name: "Done" }).first().click();
  await page.waitForTimeout(600);
  await expect(page.getByText("No shifts yet")).toHaveCount(0);
  await expect(page.locator("text=/12.00 of 80.00 hrs/")).toBeVisible();

  // and it survives the reload, i.e. it really reached storage
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await tabButton(page, "Shifts").click();
  await expect(page.locator("text=/12.00 of 80.00 hrs/")).toBeVisible();
});

test("dismissing that same sheet without touching it takes the shift back", async ({ page }) => {
  await gotoApp(page);
  await page.goto("/?action=add-shift", { waitUntil: "networkidle" });
  await expect(page.locator("nav button").first()).toBeVisible({ timeout: 20_000 }); // app booted
  await expect(page.locator('label:has(span:text-is("Paid hours")) input')).toHaveValue("12", { timeout: 15000 });
  await page.getByRole("button", { name: "Close" }).click(); // ✕ = "didn't mean to"
  await page.waitForTimeout(600);
  await expect(page.getByText("No shifts yet")).toBeVisible();
});

test("the year line lands on Me with the Year card in view", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: /so far · made/ }).click();

  await expect(page.getByRole("heading", { name: "Me", exact: true })).toBeVisible();
  await expect(page.locator("#me-year")).toBeInViewport();
});

test('"Update my rate" has a target that holds the rate', async ({ page }) => {
  // The raise callout sends you to #me-rate; the base rate sits a card
  // ABOVE the pay rules, so #me-rules would scroll it off the top edge.
  await gotoApp(page);
  await tabButton(page, "Me").click();
  await expect(page.locator("#me-rate").getByText("Your base hourly rate")).toBeVisible();
});
