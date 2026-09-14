import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const outputDir = "visual-qa-artifacts";
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

function attachDiagnostics(page, name) {
  page.on("pageerror", (error) => console.error(`[${name}] pageerror`, error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) console.log(`[${name}] console:${message.type()}`, message.text());
  });
  page.on("requestfailed", (request) => console.log(`[${name}] requestfailed`, request.url(), request.failure()?.errorText));
  page.on("response", (response) => {
    if (response.status() >= 400) console.log(`[${name}] http`, response.status(), response.url());
  });
}

async function logAssetStatus(page, name) {
  const emptyMascot = page.locator("img.blotoriMascotEmpty").first();
  if (await emptyMascot.count()) {
    console.log(`[${name}] empty-mascot`, await emptyMascot.evaluate((img) => ({
      src: img.currentSrc,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    })));
  }
  console.log(`[${name}] canonical-fetch`, await page.evaluate(async () => {
    const response = await fetch("/blotori-canonical-mini.webp", { cache: "no-store" });
    const body = await response.arrayBuffer();
    return {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      bytes: body.byteLength,
    };
  }));
}

async function seedSavedStyle(page) {
  await page.evaluate(() => {
    const now = new Date().toISOString();
    localStorage.setItem("blotori.style-profiles.v1", JSON.stringify([{
      id: "qa-style",
      name: "QA 친근한 정보체",
      sourceType: "manual",
      signature: "부드러운 해요체. 문단은 2~3문장. 공감 질문으로 시작하고 정보 뒤에 짧은 생활 팁을 붙인다.",
      defaultIntensity: 3,
      createdAt: now,
      updatedAt: now,
    }]));
    localStorage.setItem("blotori.selected-style.v1", "qa-style");
  });
}

async function captureAssetStudio(page, name) {
  const referenceGroup = page.locator(".referenceMaterialGroup");
  await referenceGroup.waitFor({ state: "visible", timeout: 10000 });
  const referenceInput = referenceGroup.locator('input[type="file"]');
  await referenceInput.setInputFiles({
    name: "qa-reference.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("QA reference material for Blotori browser acceptance."),
  });
  await page.waitForTimeout(250);
  const row = page.getByText("qa-reference.txt", { exact: true });
  if (!(await row.count())) throw new Error("reference material row did not render");

  const rail = page.locator(".settingsRail");
  const styleGroup = page.locator(".styleProfileGroup");
  await styleGroup.scrollIntoViewIfNeeded();
  await page.waitForTimeout(180);
  await styleGroup.locator(".styleBuilder").evaluate((node) => { node.open = true; });
  await page.waitForTimeout(120);
  const selected = styleGroup.locator("select").first();
  if ((await selected.inputValue()) !== "qa-style") throw new Error("saved style did not restore from localStorage");

  await page.screenshot({ path: `${outputDir}/${name}-asset-studio.png`, fullPage: true });
  await rail.evaluate((node) => { node.scrollTop = 0; });
}

async function prepareDraft(page, name) {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await seedSavedStyle(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".workspaceV2").waitFor({ state: "visible" });
  await page.waitForTimeout(600);
  await logAssetStatus(page, name);

  if (name !== "mobile") {
    const hideSettings = page.getByRole("button", { name: "작성 설정 열기 또는 접기" });
    if (await hideSettings.count()) {
      await hideSettings.click();
      await page.waitForTimeout(150);
      console.log(`[${name}] hydration-toggle`, { settingsVisibleAfterHide: await page.locator(".settingsRail").isVisible().catch(() => false) });
      await hideSettings.click();
      await page.waitForTimeout(150);
    }
  }

  if (name === "desktop") await captureAssetStudio(page, name);

  const platform = page.locator('label.field:has-text("게시 플랫폼") select').first();
  const topic = page.locator('label.field:has-text("자유 주제") textarea').first();
  const generate = page.getByRole("button", { name: /블로그 글 생성하기/ }).first();

  console.log(`[${name}] qa-counts`, { platform: await platform.count(), topic: await topic.count(), generate: await generate.count() });
  await platform.selectOption("naver");
  await topic.fill("50대 목 스트레칭과 스마트폰 자세 관리 팁");
  await page.waitForTimeout(250);

  console.log(`[${name}] qa-input`, {
    platform: await platform.inputValue(),
    topic: await topic.inputValue(),
    disabled: await generate.isDisabled(),
  });

  await page.waitForFunction(() => {
    const button = document.querySelector(".generatePrimary");
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 10000 });

  const loading = page.locator(".generationOverlay");
  await generate.click();
  await loading.waitFor({ state: "visible", timeout: 3000 });
  if (name === "desktop") await page.screenshot({ path: `${outputDir}/${name}-loading.png`, fullPage: true });
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
  attachDiagnostics(page, testCase.name);
  try {
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.locator(".workspaceV2").waitFor({ state: "visible" });
    await page.screenshot({ path: `${outputDir}/${testCase.name}-empty.png`, fullPage: true });

    await prepareDraft(page, testCase.name);
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
