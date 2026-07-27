/**
 * The seven-feature batch: price tags, pickup chips, the scoreboard,
 * the live ticker, the tier-posting scan, QR rules sharing, and the
 * highlight reel — driven through the real UI.
 */
import { expect, test } from "@playwright/test";
import QRCode from "qrcode";
import { gotoApp, lineInput, mockStubApi, tabButton, TINY_PNG } from "./helpers.ts";
import { encodeRules } from "../src/lib/presetShare.ts";
import { DEFAULT_CFG_DRAFT } from "../src/lib/draft.ts";
import { DEFAULT_TIERS } from "../src/lib/engine.ts";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("shift cards carry price tags; the what-if chips price a pickup in one tap", async ({ page }) => {
  await gotoApp(page);
  await tabButton(page, "Shifts").click();
  await expect(page.locator("text=≈ what each adds to your take-home")).toBeVisible();
  await expect(page.locator("button.card", { hasText: "≈ $" }).first()).toBeVisible();

  await tabButton(page, "Home").click();
  await page.locator('button:has-text("What if I pick up a shift?")').click();
  await page.locator('button:has-text("12h pickup · 10u")').click();
  await expect(page.locator('label:has(span:text-is("Hours")) input')).toHaveValue("12");
  await expect(page.locator('label:has(span:text-is("Bonus units")) input')).toHaveValue("10");
  await page.locator('button:has-text("16h double · 8u")').click();
  await expect(page.locator('label:has(span:text-is("Bonus units")) input')).toHaveValue("8");
});

test("catching a shortfall puts it on the scoreboard", async ({ page }) => {
  await gotoApp(page);
  await page.locator('button:has-text("Check my paycheck")').first().click();
  await lineInput(page, "Critical shift bonus").fill("950.00");
  await expect(page.locator("text=You're owed $250.00")).toBeVisible();

  await page.locator('button:has-text("This check")').first().click();
  await expect(page.locator("text=The scoreboard")).toBeVisible();
  await expect(page.locator("text=$250.00 caught")).toBeVisible();
  await expect(page.locator("text=$250.00 still open")).toBeVisible();
});

test("the live ticker counts a shift that's on the clock right now", async ({ page }) => {
  await gotoApp(page);
  await tabButton(page, "Shifts").click();
  await page.locator('button:has-text("Add shift")').first().click();
  await page.locator('label:has(span:text-is("Date")) input').fill(todayIso());
  await page.locator('button:has-text("Done")').click();

  await tabButton(page, "Home").click();
  await page.locator('button:has-text("On shift now? Watch it add up")').click();
  await expect(page.locator("text=On the clock")).toBeVisible();
  await expect(page.locator("text=in your pocket so far")).toBeVisible();
});

test("the bonus-posting scan previews the change, flags the drop, and applies", async ({ page }) => {
  await gotoApp(page);
  await tabButton(page, "Me").click();
  await page.locator('label:has(span:text-is("Anthropic API key")) input').fill("sk-ant-test");
  await mockStubApi(page, {
    tiers: [
      { label: "12-hr extra shift", units: 10 },
      { label: "16-hr extra shift", units: 4 },
      { label: "Night saver special", units: 12 },
    ],
    effective: "2026-07-26",
  });
  await page
    .locator('label:has-text("Scan the weekly posting") input')
    .setInputFiles({ name: "posting.png", mimeType: "image/png", buffer: TINY_PNG });

  await expect(page.locator("text=The posting read — week of")).toBeVisible();
  await expect(page.locator("text=Heads up")).toBeVisible(); // the 16 moved down
  await expect(page.locator("text=+ Night saver special")).toBeVisible();
  await page.locator('button:has-text("Use these tiers")').click();

  // the new tier is now a chip in the shift editor
  await tabButton(page, "Shifts").click();
  await page.locator('button:has-text("Add shift")').first().click();
  await expect(page.locator('button:has-text("Night saver special")')).toBeVisible();
});

test("QR share renders; a coworker's QR imports their rules; the reel plays", async ({ page }) => {
  await gotoApp(page);
  await tabButton(page, "Me").click();

  await page.locator('button:has-text("Hand it to a coworker")').click();
  await expect(page.locator('img[alt*="Pay rules QR"]')).toBeVisible();

  // a "coworker's" QR with a different base rate
  const shared = encodeRules("Other Hospital — RT", { ...DEFAULT_CFG_DRAFT, baseRate: "60.00" }, DEFAULT_TIERS);
  const png = await QRCode.toBuffer(shared, { errorCorrectionLevel: "M", margin: 2, width: 960 });
  await page
    .locator('label:has-text("Import their QR photo") input')
    .setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("text=Scanned: Other Hospital — RT")).toBeVisible();
  await page.locator('button:has-text("Use these rules")').click();
  // the base-rate row is the first input on Me (top card)
  await expect(page.locator("main input").first()).toHaveValue("60.00");

  // the highlight reel opens and advances
  await page.locator('button:has-text("The highlight reel")').click();
  await expect(page.locator("text=Your year so far")).toBeVisible();
  await page.locator('button:has-text("tap for the next one")').click();
  await expect(page.locator("text=You made")).toBeVisible();
});
