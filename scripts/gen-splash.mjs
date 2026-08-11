/**
 * Renders the iOS launch images in public/splash/.
 *
 * iOS only shows a startup image when a <link rel="apple-touch-startup-image">
 * media query matches the device EXACTLY, and the PNG is in physical pixels —
 * so every entry here is (CSS width × CSS height × scale) and the matching tag
 * in index.html must repeat the same three numbers. Regenerate with:
 *
 *   node scripts/gen-splash.mjs
 *
 * Not wired into `npm run build`: the output is committed, and the wordmark
 * falls back to whatever serif the build machine has (see FONT_STACK).
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const OUT_DIR = fileURLToPath(new URL("../public/splash/", import.meta.url));
const EXECUTABLE_PATH = "/opt/pw-browsers/chromium";

const PAPER = "#F4EFE6";
const INK = "#14110F";
const ACCENT = "#C8642F";
// same stack as BrandMark in src/ui/kit.tsx — 'New York' only resolves on
// Apple hardware, so a Linux run renders the generic serif instead.
const FONT_STACK = "'New York', Georgia, 'Times New Roman', serif";

/** Portrait CSS dimensions + scale, one per device family we cover. */
const TARGETS = [
  { width: 430, height: 932, scale: 3 }, // iPhone 15/16 Pro Max
  { width: 428, height: 926, scale: 3 }, // iPhone 12/13/14 Pro Max
  { width: 393, height: 852, scale: 3 }, // iPhone 15/16, 14 Pro
  { width: 390, height: 844, scale: 3 }, // iPhone 12/13/14
  { width: 820, height: 1180, scale: 2 }, // iPad Air
];

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; background: ${PAPER}; }
  body { display: flex; align-items: center; justify-content: center; }
  .mark {
    font-family: ${FONT_STACK};
    font-size: 9vh;
    letter-spacing: -0.025em;
    color: ${INK};
    line-height: 1;
  }
  .dot { color: ${ACCENT}; }
</style></head>
<body><span class="mark">RT<span class="dot">.</span></span></body></html>`;

export const splashName = ({ width, height, scale }) => `splash-${width}x${height}-${scale}x.png`;

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });
try {
  for (const target of TARGETS) {
    const context = await browser.newContext({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: target.scale,
    });
    const page = await context.newPage();
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: OUT_DIR + splashName(target), type: "png" });
    await context.close();
    console.log(
      `${splashName(target)}  ${target.width * target.scale}×${target.height * target.scale} px`,
    );
  }
} finally {
  await browser.close();
}
