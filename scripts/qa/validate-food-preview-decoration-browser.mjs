import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";

const origin = process.env.BLOTORI_LOCAL_URL ?? process.env.BLOTORI_QA_URL;
if (!origin) throw new Error("BLOTORI_LOCAL_URL or BLOTORI_QA_URL is required");

const diagnosticsDir = process.env.BLOTORI_FOOD_PREVIEW_DIAGNOSTIC_DIR;
if (diagnosticsDir) await mkdir(diagnosticsDir, { recursive: true });

const originUrl = new URL(origin);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  serviceWorkers: "block",
});
const page = await context.newPage();
const externalRequests = [];
const browserErrors = [];

page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.protocol !== "blob:" && url.origin !== originUrl.origin) externalRequests.push(request.url());
});
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });

function selectWithOption(value) {
  return page.locator(".settingsRail select").filter({ has: page.locator(`option[value="${value}"]`) }).first();
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

function syntheticPng(index) {
  const width = 320;
  const height = 200;
  const palettes = [
    [[44, 112, 108], [216, 239, 232]],
    [[198, 104, 75], [255, 226, 203]],
    [[57, 91, 122], [207, 231, 239]],
    [[151, 113, 55], [250, 232, 181]],
  ];
  const [primary, secondary] = palettes[index];
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    rows[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const color = (x + y) % 96 < 58 ? primary : secondary;
      const offset = row + 1 + x * 4;
      rows[offset] = color[0]; rows[offset + 1] = color[1]; rows[offset + 2] = color[2]; rows[offset + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function previewState() {
  return page.locator(".blogPaper").evaluate((paper) => {
    const summary = paper.querySelector(".summary");
    const title = paper.querySelector(".previewTitle");
    const factCard = paper.querySelector('[data-section-id="food-facts"]');
    const hero = paper.querySelector(":scope > .imageSlot");
    return {
      decoration: paper.getAttribute("data-food-preview-decoration"),
      text: paper.textContent,
      sections: [...paper.querySelectorAll(".articleSection")].map((section) => ({
        id: section.getAttribute("data-section-id"),
        text: section.textContent,
      })),
      images: [...paper.querySelectorAll(".imageSlot")].map((slot) => ({
        id: slot.getAttribute("data-image-id"),
        afterSectionId: slot.closest(".articleSection")?.getAttribute("data-section-id") ?? null,
        hasLocalImage: Boolean(slot.querySelector("[data-draft-image]")),
      })),
      imageMetrics: [...paper.querySelectorAll("[data-draft-image]")].map((image) => {
        const bounds = image.getBoundingClientRect();
        return { id: image.getAttribute("data-draft-image"), width: bounds.width, height: bounds.height };
      }),
      styles: {
        summaryBackground: summary ? getComputedStyle(summary).backgroundColor : "",
        titleBorder: title ? getComputedStyle(title).borderBottomWidth : "",
        factCardBackground: factCard ? getComputedStyle(factCard).backgroundColor : "",
        heroBorder: hero ? getComputedStyle(hero).borderTopWidth : "",
      },
    };
  });
}

async function capture(name) {
  if (!diagnosticsDir) return;
  await page.screenshot({ path: join(diagnosticsDir, `${name}-workspace.png`), fullPage: true });
  await page.locator(".blogPaper").screenshot({ path: join(diagnosticsDir, `${name}-article.png`) });
  await page.locator('.imageSlot[data-image-id="IMG-01-HERO"]').screenshot({ path: join(diagnosticsDir, `${name}-hero.png`) });
  await page.locator('.imageSlot[data-image-id="IMG-02-CONTEXT"]').screenshot({ path: join(diagnosticsDir, `${name}-section-photo.png`) });
  await page.locator('[data-draft-image="IMG-01-HERO"]').screenshot({ path: join(diagnosticsDir, `${name}-hero-photo.png`) });
  await page.locator('[data-draft-image="IMG-02-CONTEXT"]').screenshot({ path: join(diagnosticsDir, `${name}-section-photo-image.png`) });
  await page.locator('[data-section-id="food-facts"]').screenshot({ path: join(diagnosticsDir, `${name}-food-facts.png`) });
}

try {
  const response = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 25_000 });
  assert.equal(response?.status(), 200);
  await page.locator(".workspaceV2").waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector(".draftStorageStatus")?.getAttribute("data-state") === "ready", null, { timeout: 15_000 });

  const health = await page.evaluate(async () => (await fetch("/api/health", { cache: "no-store" })).json());
  assert.equal(health.keyDetected, false, "browser QA must not expose or use an API key");

  await selectWithOption("wordpress").selectOption("wordpress");
  await selectWithOption("food").selectOption("food");
  await selectWithOption("restaurant-review").selectOption("restaurant-review");
  await page.getByLabel("자유 주제·추가 설명").fill("합성 식당 방문정보 가이드 QA");
  await page.getByLabel("장소·가게").fill("합성 식당");
  await page.getByLabel("메뉴·먹거리").fill("합성 메뉴");
  await page.getByLabel("방문 목적").fill("점심 방문");
  await page.getByLabel("가격대").fill("합성 가격대");
  await page.getByLabel("맛·인상 포인트").fill("담백한 맛");

  const generationResponse = page.waitForResponse((item) => item.request().method() === "POST"
    && new URL(item.url()).pathname === "/api/generate", { timeout: 20_000 });
  await page.getByRole("button", { name: "✦ 블로그 초안 만들기" }).click();
  const generated = await generationResponse;
  assert.equal(generated.status(), 200);
  assert.equal((await generated.json()).mode, "mock", "screen QA must use the keyless mock adapter");
  await page.locator('[data-food-preview-decoration="default"]').waitFor({ timeout: 15_000 });

  const imageInputs = page.locator(".draftImageInput");
  assert.ok(await imageInputs.count() >= 4, "synthetic food draft must expose four photo slots");
  for (let index = 0; index < 4; index += 1) {
    await imageInputs.nth(index).setInputFiles({ name: `synthetic-food-${index + 1}.png`, mimeType: "image/png", buffer: syntheticPng(index) });
  }
  await page.locator("[data-draft-image]").nth(3).waitFor({ timeout: 15_000 });

  const defaultState = await previewState();
  assert.equal(defaultState.decoration, "default");
  assert.equal(defaultState.images.filter((image) => image.hasLocalImage).length, 4);
  assert.equal(defaultState.imageMetrics.length, 4);
  assert.ok(defaultState.imageMetrics[0].width > defaultState.imageMetrics[3].width, "대표 사진이 후속 사진보다 넓어야 합니다.");
  await capture("food-preview-default-1280");

  await page.locator('[data-food-preview-option="visit-guide"]').click();
  await page.locator('[data-food-preview-decoration="visit-guide"]').waitFor();
  const guideState = await previewState();
  assert.deepEqual(guideState.sections, defaultState.sections, "decoration must preserve section order and facts");
  assert.deepEqual(guideState.images, defaultState.images, "decoration must preserve photo ownership");
  assert.notEqual(guideState.styles.summaryBackground, defaultState.styles.summaryBackground);
  assert.notEqual(guideState.styles.titleBorder, defaultState.styles.titleBorder);
  assert.notEqual(guideState.styles.factCardBackground, defaultState.styles.factCardBackground);
  assert.notEqual(guideState.styles.heroBorder, defaultState.styles.heroBorder);
  await capture("food-preview-visit-guide-1280");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePreviewTab = page.locator(".mobileWorkspaceTabs").getByRole("button", { name: "초안" });
  if (await mobilePreviewTab.isVisible()) await mobilePreviewTab.click();
  await page.locator('[data-food-preview-option="default"]').click();
  await page.locator('[data-food-preview-decoration="default"]').waitFor();
  const mobileDefaultState = await previewState();
  await capture("food-preview-default-390");
  await page.locator('[data-food-preview-option="visit-guide"]').click();
  await page.locator('[data-food-preview-decoration="visit-guide"]').waitFor();
  const mobileGuideState = await previewState();
  assert.deepEqual(mobileGuideState.sections, mobileDefaultState.sections);
  assert.deepEqual(mobileGuideState.images, mobileDefaultState.images);
  assert.notDeepEqual(mobileGuideState.styles, mobileDefaultState.styles, "390px에서도 기본과 방문정보 가이드가 구분되어야 합니다.");
  const control = page.locator(".foodPreviewDecorationControl");
  await control.scrollIntoViewIfNeeded();
  const bounds = await control.boundingBox();
  assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 391, `390px decoration control overflow: ${JSON.stringify(bounds)}`);
  assert.equal(await page.locator("[data-draft-image]").count(), 4);
  await capture("food-preview-visit-guide-390");

  assert.deepEqual(externalRequests, []);
  assert.deepEqual(browserErrors, []);
  console.log("FOOD_PREVIEW_DECORATION_BROWSER_PASS", JSON.stringify({
    viewports: { default: [1280, 390], visitGuide: [1280, 390] },
    localImages: 4,
    sectionOrder: guideState.sections.map((section) => section.id),
    imageAnchors: guideState.images.map(({ id, afterSectionId }) => ({ id, afterSectionId })),
    changedStyles: guideState.styles,
    providerCalls: 0,
    externalRequests: 0,
    userData: 0,
  }));
} finally {
  await context.close();
  await browser.close();
}
