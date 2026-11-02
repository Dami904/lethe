import { chromium } from "playwright";

const url = process.argv[2] ?? "https://lethe-hydradb.vercel.app";
const outDir = process.argv[3] ?? "/tmp/lethe-shots";

const viewports = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
};

const browser = await chromium.launch({
  executablePath: "/home/userdammy/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args: ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});
for (const [name, viewport] of Object.entries(viewports)) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);
  const height = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewportSize({ width: viewport.width, height });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${name}-full.png`, fullPage: true });
  // also grab hamburger menu open state on mobile
  if (name === "mobile") {
    const menuBtn = page.locator("button[aria-label*='menu' i], button:has-text('MENU')").first();
    if (await menuBtn.count() > 0) {
      await menuBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${outDir}/${name}-menu-open.png` });
    }
  }
  await page.close();
  console.log(`captured ${name}`);
}
await browser.close();
