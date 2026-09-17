import { chromium } from "playwright";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const assets = [
  "/blotori-canonical-mini.webp",
  "/blotori-character-transparent.webp",
  "/blotori-face-ui.webp",
  "/blotori-icon-transparent.webp",
];

const browser = await chromium.launch({ headless: true });
for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 900 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  const result = await page.evaluate(async (paths) => {
    const load = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ src, ok: true, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ src, ok: false, width: img.naturalWidth, height: img.naturalHeight });
      img.src = `${src}?probe=${Date.now()}-${Math.random()}`;
    });
    return Promise.all(paths.map(load));
  }, assets);
  console.log("asset-probe", viewport.width, JSON.stringify(result));
  await page.close();
}
await browser.close();
