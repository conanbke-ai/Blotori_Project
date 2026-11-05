import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const origin = process.env.BLOTORI_LOCAL_URL;
if (!origin) throw new Error("BLOTORI_LOCAL_URL is required");
const allowedOrigin = new URL(origin).origin;
const screenshotDir = process.env.BLOTORI_QA_SCREENSHOT_DIR
  ? path.resolve(process.env.BLOTORI_QA_SCREENSHOT_DIR)
  : null;
if (screenshotDir) await fs.mkdir(screenshotDir, { recursive: true });

const externalAttempts = [];
const pageErrors = [];
let generateCalls = 0;

function allowedRequest(urlString) {
  const url = new URL(urlString);
  return url.protocol === "data:" || url.protocol === "blob:" || url.origin === allowedOrigin;
}

async function selectWithOption(page, value) {
  const locator = page.locator(".settingsRail:visible select").filter({ has: page.locator(`option[value="${value}"]`) });
  assert.equal(await locator.count(), 1, `exactly one visible select must contain option: ${value}`);
  await locator.selectOption(value);
}

async function openMobilePanel(page, panel) {
  const label = panel === "settings" ? "입력 및 문체" : "초안";
  const tab = page.getByRole("button", { name: label, exact: true });
  await tab.click();
  await page.locator(`[data-mobile-panel="${panel}"]`).waitFor({ state: "visible" });
  assert.equal(await tab.evaluate((node) => node.classList.contains("active")), true,
    `${label} tab must be active when its panel is visible`);
}

async function fillTravelFields(page) {
  const groups = page.locator(".settingsRail > .settingGroup");
  let fieldGroup;
  for (let index = 0; index < await groups.count(); index += 1) {
    const marker = (await groups.nth(index).locator(":scope > .settingGroupHeader > span").first().textContent().catch(() => ""))?.trim();
    if (marker === "5") fieldGroup = groups.nth(index);
  }
  assert.ok(fieldGroup, "travel field group missing");
  const inputs = fieldGroup.locator('input:not([type="file"]):not([type="checkbox"]):not([type="radio"])');
  const values = ["합성 여행지", "입력 확인 장소", "하루", "친구 1명", "바다 산책"];
  assert.equal(await inputs.count(), values.length);
  for (let index = 0; index < values.length; index += 1) await inputs.nth(index).fill(values[index]);
}

async function generate(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector(".generatePrimary");
    return Boolean(button && !button.disabled);
  });
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname === "/api/generate", { timeout: 30000 });
  await page.locator(".generatePrimary").click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const generated = await response.json();
  assert.equal(generated.mode, "mock", "portable toolbar QA must remain in synthetic mock mode");
  await page.locator(".blogPaper .previewTitle").waitFor({ timeout: 20000 });
  await page.locator(".generationOverlay").waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
  const toastClose = page.locator(".successToast button");
  if (await toastClose.count()) await toastClose.click();
}

async function openGeneratedPage(browser, viewport, label) {
  const context = await browser.newContext({ viewport, locale: "ko-KR", serviceWorkers: "block" });
  await context.addInitScript(() => {
    window.__toolbarQaClipboardWrites = 0;
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          write: async () => { window.__toolbarQaClipboardWrites += 1; },
          writeText: async () => { window.__toolbarQaClipboardWrites += 1; },
        },
      });
    } catch {}
  });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (!allowedRequest(url)) {
      externalAttempts.push({ label, url, method: route.request().method() });
      await route.abort("blockedbyclient");
      return;
    }
    if (new URL(url).pathname === "/api/health") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, keyDetected: false, verified: false, model: "offline-mock", message: "Synthetic mobile copy toolbar QA" }),
      });
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push({ label, message: error.message }));
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/generate") generateCalls += 1;
  });
  const response = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30000 });
  assert.equal(response?.status(), 200);
  await page.locator(".workspaceV2").waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelector(".draftStorageStatus")?.getAttribute("data-state") === "ready", null, { timeout: 15000 });
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}" });
  await selectWithOption(page, "naver");
  await selectWithOption(page, "travel");
  await selectWithOption(page, "travel-review");
  await page.locator(".settingsRail > .settingGroup").nth(1).locator("textarea").fill("합성 QA: 모바일 복사 도구와 여행 구성");
  await fillTravelFields(page);
  await generate(page);
  return { context, page };
}

async function toolbarMetrics(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    const bar = document.querySelector(".previewActionBar");
    const scroller = document.querySelector(".blogScroller");
    const relevant = [...document.querySelectorAll([
      ".previewActionBar button",
      ".segmentedMode button",
      ".inspectorTabs button",
      ".draftImageActions button",
      ".draftImageActions a",
      ".draftImageError button",
      ".draftImagePlacement select",
      ".slotUploadActions button",
      ".slotInfo button",
      ".copyButton",
      ".sectionOrderControls button",
    ].join(","))].filter(visible).map((node) => ({
      label: (node.getAttribute("aria-label") || node.textContent || "").trim().slice(0, 60),
      ...box(node),
    }));
    const actionButtons = bar ? [...bar.querySelectorAll("button")].filter(visible) : [];
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollerOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : null,
      scrollerHeight: scroller?.clientHeight ?? null,
      actionBar: bar ? box(bar) : null,
      visibleActionLabels: actionButtons.map((node) => node.textContent?.trim() ?? ""),
      actionButtonRows: new Set(actionButtons.map((node) => Math.round(node.getBoundingClientRect().top))).size,
      undersizedRelevant: relevant.filter((item) => item.width < 44 || item.height < 44),
    };
  });
}

async function optionalScreenshot(page, name) {
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, name), animations: "disabled" });
}

const browser = await chromium.launch({ headless: true });
const records = [];
try {
  for (const width of [390, 360]) {
    const label = `mobile-${width}`;
    const { context, page } = await openGeneratedPage(browser, { width, height: 844 }, label);
    try {
      const closed = await toolbarMetrics(page);
      assert.ok(closed.actionBar && closed.actionBar.height <= 64, `${label} closed action bar height ${closed.actionBar?.height}`);
      assert.ok(closed.scrollerHeight >= 260, `${label} scroller height ${closed.scrollerHeight}`);
      assert.equal(closed.documentOverflow, 0);
      assert.equal(closed.scrollerOverflow, 0);
      assert.equal(closed.undersizedRelevant.length, 0, `${label} undersized: ${JSON.stringify(closed.undersizedRelevant)}`);

      const primary = page.locator(".previewCopyActions > .secondaryAction");
      const toggle = page.locator(".previewCopyMoreToggle");
      await primary.waitFor({ state: "visible" });
      await toggle.waitFor({ state: "visible" });
      await primary.focus();
      await page.keyboard.press("Tab");
      const focus = await toggle.evaluate((node) => ({
        active: document.activeElement === node,
        focusVisible: node.matches(":focus-visible"),
        outlineStyle: getComputedStyle(node).outlineStyle,
      }));
      assert.ok(focus.active && focus.focusVisible && focus.outlineStyle !== "none", `${label} toggle needs visible keyboard focus`);
      await page.keyboard.press("Enter");
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      assert.equal(await page.locator(".previewCopyMoreActions.isOpen button").count(), 3);
      const open = await toolbarMetrics(page);
      assert.equal(open.undersizedRelevant.length, 0, `${label} open undersized: ${JSON.stringify(open.undersizedRelevant)}`);
      assert.equal(open.documentOverflow, 0);
      assert.equal(open.scrollerOverflow, 0);
      await optionalScreenshot(page, `${label}-open.png`);

      const plain = page.locator(".previewCopyMoreActions.isOpen [data-copy-plain]");
      await plain.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => {
        const button = document.querySelector(".previewCopyMoreToggle");
        return button?.getAttribute("aria-expanded") === "false" && document.activeElement === button;
      });
      assert.equal(await page.evaluate(() => window.__toolbarQaClipboardWrites), 1);

      await toggle.click();
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      await openMobilePanel(page, "settings");
      await selectWithOption(page, "tistory");
      await selectWithOption(page, "naver");
      await openMobilePanel(page, "preview");
      await toggle.waitFor({ state: "visible" });
      assert.equal(await toggle.getAttribute("aria-expanded"), "false", `${label} platform changes must close the menu`);

      await toggle.click();
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      await openMobilePanel(page, "settings");
      await generate(page);
      await page.locator('[data-mobile-panel="preview"]').waitFor({ state: "visible" });
      await toggle.waitFor({ state: "visible" });
      assert.equal(await toggle.getAttribute("aria-expanded"), "false", `${label} a new draft must close the menu`);
      await optionalScreenshot(page, `${label}-closed.png`);
      records.push({ label, closed, open, focus, clipboardWrites: 1, platformReset: true, newDraftReset: true });
    } finally {
      await context.close();
    }
  }

  const { context, page } = await openGeneratedPage(browser, { width: 1440, height: 900 }, "desktop-1440");
  try {
    const metrics = await toolbarMetrics(page);
    assert.equal(await page.locator(".previewCopyMoreToggle").isVisible(), false);
    assert.equal(metrics.visibleActionLabels.length, 6, "desktop must show TOP, rich, plain, guide, tags and END actions");
    assert.match(metrics.visibleActionLabels[0], /TOP/);
    assert.match(metrics.visibleActionLabels.at(-1), /END/);
    assert.equal(metrics.actionButtonRows, 1, "desktop toolbar must remain a single row");
    assert.equal(metrics.documentOverflow, 0);
    assert.equal(metrics.scrollerOverflow, 0);
    await optionalScreenshot(page, "desktop-1440.png");
    records.push({ label: "desktop-1440", metrics });
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}

assert.ok(generateCalls >= 5, `expected synthetic generations across mobile reset and desktop paths, received ${generateCalls}`);
assert.deepEqual(externalAttempts, []);
assert.deepEqual(pageErrors, []);
console.log("BLOTORI_MOBILE_COPY_TOOLBAR_QA_PASS", JSON.stringify({
  records,
  generateCalls,
  externalAttempts,
  pageErrors,
  actualAiCalls: 0,
  naverTransfers: 0,
  osClipboardWrites: 0,
  evidence: "SYNTHETIC_MOCK_BROWSER_ONLY",
}));
