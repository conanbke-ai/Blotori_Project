import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const outputDir = "visual-qa-artifacts";
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function setReactValue(locator, value) {
  await locator.evaluate((element, nextValue) => {
    const isSelect = element instanceof HTMLSelectElement;
    const proto = isSelect ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    descriptor?.set?.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function prepareDraft(page) {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".workspaceV2").waitFor({ state: "visible" });
  await page.waitForTimeout(800);

  const platform = page.locator('label.field:has-text("게시 플랫폼") select').first();
  const topic = page.locator('label.field:has-text("자유 주제") textarea').first();
  const generate = page.getByRole("button", { name: /블로그 글 생성하기/ }).first();

  console.log("qa-counts", { platform: await platform.count(), topic: await topic.count(), generate: await generate.count() });
  await setReactValue(platform, "naver");
  await page.waitForTimeout(200);
  await setReactValue(topic, "50대 목 스트레칭과 스마트폰 자세 관리 팁");
  await page.waitForTimeout(350);

  console.log("qa-input", {
    platform: await platform.inputValue(),
    topic: await topic.inputValue(),
    disabled: await generate.isDisabled(),
  });

  await page.waitForFunction(() => {
    const button = document.querySelector(".generatePrimary");
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 10000 });

  await generate.click();
  await page.locator(".blogPaper").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(700);
}

const cases = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "tablet", viewport: { width: 1024, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

let failed = false;
for (const testCase of cases) {
  const context = await browser.newContext({ viewport: testCase.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.locator(".workspaceV2").waitFor({ state: "visible" });
    await page.screenshot({ path: `${outputDir}/${testCase.name}-empty.png`, fullPage: true });

    await prepareDraft(page);
    await page.screenshot({ path: `${outputDir}/${testCase.name}-preview.png`, fullPage: true });

    const upload = page.locator(".slotUploadInput").first();
    if (await upload.count()) {
      await upload.setInputFiles("public/blotori-icon-transparent.webp");
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${outputDir}/${testCase.name}-image-slot.png`, fullPage: true });
    }

    if (testCase.name === "mobile") {
      await page.getByRole("button", { name: "이미지·검수" }).click();
      await page.waitForTimeout(200);
    }
    const qaTab = page.getByRole("tab", { name: "검수" });
    if (await qaTab.count()) {
      await qaTab.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${outputDir}/${testCase.name}-qa.png`, fullPage: true });
    }
  } catch (error) {
    failed = true;
    console.error(`visual QA failed: ${testCase.name}`, error);
    await page.screenshot({ path: `${outputDir}/${testCase.name}-failure.png`, fullPage: true }).catch(() => undefined);
  } finally {
    await context.close();
  }
}

await browser.close();
if (failed) process.exitCode = 1;
