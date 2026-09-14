import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const outputDir = "visual-qa-artifacts";
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function prepareDraft(page) {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator('label.field:has-text("게시 플랫폼") select').selectOption("naver");
  await page.locator('label.field:has-text("자유 주제") textarea').fill("50대 목 스트레칭과 스마트폰 자세 관리 팁");
  await page.getByRole("button", { name: /블로그 글 생성하기/ }).click();
  await page.locator(".blogPaper").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(500);
}

const cases = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "tablet", viewport: { width: 1024, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

for (const testCase of cases) {
  const context = await browser.newContext({ viewport: testCase.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${outputDir}/${testCase.name}-empty.png`, fullPage: true });

  await prepareDraft(page);
  await page.screenshot({ path: `${outputDir}/${testCase.name}-preview.png`, fullPage: true });

  const upload = page.locator(".slotUploadInput").first();
  if (await upload.count()) {
    await upload.setInputFiles("public/blotori-icon-transparent.webp");
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${outputDir}/${testCase.name}-image-slot.png`, fullPage: true });
  }

  if (testCase.name === "mobile") {
    await page.getByRole("button", { name: "이미지·검수" }).click();
  }
  const qaTab = page.getByRole("tab", { name: "검수" });
  if (await qaTab.count()) {
    await qaTab.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${outputDir}/${testCase.name}-qa.png`, fullPage: true });
  }

  await context.close();
}

await browser.close();
