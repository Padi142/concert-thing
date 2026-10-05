// Captures README screenshots from the demo server (`pnpm run screenshots:serve`).
// Usage: PLAYWRIGHT_CORE=/path/to/playwright-core CHROMIUM=/usr/bin/chromium-browser node scripts/screenshots/capture.mjs
import { mkdir } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const base = process.env.DEMO_URL ?? "http://localhost:5199";
const out = new URL("../../docs/screenshots/", import.meta.url);
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const desktop = { viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function shot(name, options, path, steps = async () => {}, colorScheme = "light") {
  const context = await browser.newContext({ ...options, colorScheme, locale: "en-GB", timezoneId: "Europe/Prague" });
  const page = await context.newPage();
  page.on("dialog", dialog => dialog.dismiss());
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await steps(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: new URL(`${name}.png`, out).pathname });
  await context.close();
  console.log(`captured ${name}`);
}

const click = label => async page => { await page.getByRole("button", { name: label }).first().click(); await page.waitForLoadState("networkidle"); };
const showSongs = async page => { await page.getByText(/Songs in this video/).scrollIntoViewIfNeeded(); };
const steps = (...actions) => async page => { for (const action of actions) await action(page); };

await shot("library", desktop, "/");
await shot("library-dark", desktop, "/", undefined, "dark");
await shot("show", desktop, "/", click("Open Fontaines D.C. — Romance Tour"));
await shot("media-detail", desktop, "/", steps(click("Open IMG_4810.MOV"), showSongs));
await shot("queue", desktop, "/", steps(async page => page.getByRole("button", { name: "Queue" }).first().click()));
await shot("admin", desktop, "/?admin", steps(async page => page.getByRole("button", { name: "Admin" }).first().click()));
await shot("public-share", desktop, "/share/R8mTz4");
await shot("mobile-library", phone, "/");
await shot("mobile-detail", phone, "/", steps(click("Open IMG_4810.MOV"), showSongs));

await browser.close();
