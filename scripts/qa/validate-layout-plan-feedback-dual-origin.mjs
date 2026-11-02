// Actual browser Product Flow QA. Normal paths use the local keyless mock route;
// mismatch paths intercept only /api/generate with declared synthetic drafts.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const origins = [
  ["localhost", process.env.BLOTORI_LOCAL_URL],
  ["network", process.env.BLOTORI_NETWORK_URL],
];
if (origins.some(([, url]) => !url)) throw new Error("Set BLOTORI_LOCAL_URL and BLOTORI_NETWORK_URL");
if (new URL(origins[0][1]).origin === new URL(origins[1][1]).origin) throw new Error("Two different Origins are required");
const screenshotDir = process.env.BLOTORI_QA_SCREENSHOT_DIR;
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

function syntheticDraft(name, warning = "") {
  return {
    title: `합성 ${name} 원고`,
    titleCandidates: [`합성 ${name} 원고`],
    summary: "실제 사용자·provider 데이터가 아닌 UI 상태 fixture입니다.",
    intro: ["원고는 계획 미적용 상황에서도 보존됩니다."],
    sections: [
      { id: "synthetic-a", heading: "첫 번째 합성 섹션", paragraphs: ["섹션 본문도 그대로 표시됩니다."] },
      { id: "synthetic-b", heading: "두 번째 합성 섹션", paragraphs: ["검수 탭에서 미적용 이유를 확인합니다."] },
    ],
    closing: ["합성 fixture 종료"],
    tags: ["SYNTHETIC"],
    images: [],
    warnings: warning ? [`편집 계획 미적용: ${warning}`] : [],
  };
}

async function routeHealth(context) {
  await context.route("**/api/health**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, keyDetected: false, verified: false, model: "offline-mock", message: "Synthetic browser QA" }),
  }));
}

async function openComposer(context, origin) {
  await routeHealth(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.__qaErrors = errors;
  const response = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20000 });
  assert.equal(response?.status(), 200);
  await page.locator(".workspaceV2").waitFor();
  await page.waitForFunction(() => document.querySelector(".draftStorageStatus")?.getAttribute("data-state") === "ready", null, { timeout: 12000 });
  return { page, errors };
}

function selectWithOption(page, value) {
  return page.locator(".settingsRail select").filter({ has: page.locator(`option[value="${value}"]`) }).first();
}

async function prepareBasicGeneration(page, topic) {
  await selectWithOption(page, "naver").selectOption("naver");
  await page.locator('.settingsRail textarea[placeholder*="자유롭게 입력"]').fill(topic);
  await page.waitForFunction(() => {
    const button = document.querySelector(".settingsRail .generatePrimary");
    return Boolean(button && !button.disabled);
  });
}

async function generateAndRead(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector(".settingsRail .generatePrimary");
    return Boolean(button && !button.disabled);
  }, null, { timeout: 10000 });
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname === "/api/generate", { timeout: 15000 });
  await page.locator(".settingsRail .generatePrimary").click({ force: true });
  let response;
  try {
    response = await responsePromise;
  } catch (error) {
    const state = await page.locator(".settingsRail .generatePrimary").evaluate((button) => ({ disabled: button.disabled, text: button.textContent }));
    throw new Error(`${error}\nbutton=${JSON.stringify(state)}\npageErrors=${JSON.stringify(page.__qaErrors)}`);
  }
  assert.equal(response.status(), 200);
  return response.json();
}

async function readStoredDraft(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("blotori-draft-workspace");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("workspaces", "readonly");
      const request = tx.objectStore("workspaces").getAll();
      request.onsuccess = () => resolve(request.result.at(-1)?.draft ?? null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    };
  }));
}

async function assertToastInsideViewport(page, state) {
  const toast = page.locator(`.successToast[data-state="${state}"]`);
  await toast.waitFor({ timeout: 10000 });
  const box = await toast.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box && viewport);
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
    `${state} toast must stay inside viewport`);
  return toast;
}

async function runNormal(originName, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  let generateCalls = 0;
  context.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/generate") generateCalls += 1; });
  try {
    const { page, errors } = await openComposer(context, origin);
    await selectWithOption(page, "naver").selectOption("naver");
    await selectWithOption(page, "health").selectOption("health");
    await selectWithOption(page, "treatment-education").selectOption("treatment-education");
    await page.locator('.settingsRail textarea[placeholder*="자유롭게 입력"]').fill(`정상 계획 ${originName}`);
    const body = await generateAndRead(page);
    assert.equal(body.mode, "mock", "normal browser path must use local keyless mock mode");
    assert.equal(body.draft.contentLayoutPlan.source.purposeField, null, "empty optional purpose is not admitted evidence");
    const toast = await assertToastInsideViewport(page, "complete");
    await toast.getByText("블로토리가 원고를 완성했어요.", { exact: true }).waitFor();
    assert.equal(generateCalls, 1);
    await page.locator("#inspector-tab-qa").click();
    await page.locator(".layoutPlanStatus").getByText(/편집 계획 v1/).waitFor();
    const title = await page.locator(".previewTitle").innerText();
    const sectionOrder = await page.locator(".articleSection").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-section-id")));
    await page.locator('.draftStorageStatus[data-state="saved"]').waitFor({ timeout: 12000 });
    const beforeSwitch = await readStoredDraft(page);
    await selectWithOption(page, "wordpress").selectOption("wordpress");
    await page.locator('.draftStorageStatus[data-state="saved"]').waitFor({ timeout: 12000 });
    const afterSwitch = await readStoredDraft(page);
    assert.deepEqual(afterSwitch, beforeSwitch, "platform switch must not mutate stored draft or plan");
    assert.equal(await page.locator(".previewTitle").innerText(), title);
    assert.deepEqual(await page.locator(".articleSection").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-section-id"))), sectionOrder);
    assert.deepEqual(errors, []);
    results.push({ origin: originName, case: "normal-empty-purpose-platform-switch", status: "PASS", generateCalls });
  } finally {
    await context.close();
  }
}

async function runHiddenPurpose(originName, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  try {
    const { page, errors } = await openComposer(context, origin);
    await selectWithOption(page, "naver").selectOption("naver");
    await selectWithOption(page, "food").selectOption("food");
    await selectWithOption(page, "restaurant-review").selectOption("restaurant-review");
    const secret = `숨은 방문 목적 원문 ${originName}`;
    await page.locator("label.field").filter({ hasText: "방문 목적" }).locator("input").fill(secret);
    await selectWithOption(page, "restaurant-review").selectOption("food-introduction");
    const body = await generateAndRead(page);
    assert.deepEqual(body.draft.contentLayoutPlan.source.excludedPurposeFields, ["visitPurpose"]);
    await assertToastInsideViewport(page, "complete");
    await page.locator("#inspector-tab-qa").click();
    await page.getByText(/사용하지 않는 목적 필드/, { exact: false }).waitFor();
    assert.ok(!(await page.locator("body").innerText()).includes(secret), "excluded raw purpose text must not leak into rendered draft or warning");
    assert.deepEqual(errors, []);
    results.push({ origin: originName, case: "hidden-purpose", status: "PASS" });
  } finally {
    await context.close();
  }
}

async function runMismatch(originName, origin, mismatch, viewport, reducedMotion = "no-preference") {
  const context = await browser.newContext({ viewport, reducedMotion, serviceWorkers: "block" });
  let generateCalls = 0;
  const reason = mismatch === "id" ? "섹션 ID가 계획과 다릅니다."
    : mismatch === "order" ? "섹션 순서가 계획과 다릅니다."
      : "이미지 역할·위치가 계획과 다릅니다.";
  await context.route("**/api/generate", (route) => {
    if (route.request().method() !== "POST") return route.abort("blockedbyclient");
    generateCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ draft: syntheticDraft(`${mismatch}-${originName}`, reason), mode: "mock", requestId: `synthetic-${mismatch}` }),
    });
  });
  try {
    const { page, errors } = await openComposer(context, origin);
    await prepareBasicGeneration(page, `합성 ${mismatch} mismatch`);
    await generateAndRead(page);
    const toast = await assertToastInsideViewport(page, "plan-unapplied");
    await toast.getByText("원고는 보존했지만 편집 계획은 적용하지 않았어요.", { exact: true }).waitFor();
    await toast.getByText(/‘검수’ 탭에서 이유를 확인/).waitFor();
    assert.equal(await toast.locator(".successPaw").innerText(), "!");
    assert.equal(await page.locator("#inspector-tab-qa").getAttribute("aria-selected"), "true");
    assert.equal(generateCalls, 1);
    await page.waitForTimeout(3200);
    assert.equal(await toast.isVisible(), true, "warning feedback must outlast the normal 2.6 second success message");
    await page.getByText(`합성 ${mismatch}-${originName} 원고`, { exact: true }).first().waitFor();
    if (viewport.width <= 520) {
      const launcher = page.locator(".mobileReviewLauncher");
      await launcher.click();
      await page.locator("#image-review-panel").waitFor();
      await page.getByText(reason, { exact: false }).waitFor();
      const close = page.getByRole("button", { name: "이미지·검수 닫기" });
      await close.click();
      await page.waitForFunction(() => document.activeElement?.classList.contains("mobileReviewLauncher"));
    } else {
      await page.getByText(reason, { exact: false }).waitFor();
    }
    if (reducedMotion === "reduce") assert.equal(await toast.evaluate((node) => getComputedStyle(node).animationName), "none");
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, `${originName}-${mismatch}-${viewport.width}.png`), fullPage: true });
    const dismiss = toast.getByRole("button", { name: "생성 결과 알림 닫기" });
    await dismiss.click();
    await toast.waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    results.push({ origin: originName, case: `mismatch-${mismatch}-${viewport.width}`, status: "PASS", generateCalls });
  } finally {
    await context.close();
  }
}

async function runLegacyRestore(originName, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  let generateCalls = 0;
  await context.route("**/api/generate", (route) => {
    generateCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ draft: syntheticDraft(`legacy-${originName}`), mode: "mock", requestId: "synthetic-legacy" }) });
  });
  try {
    const { page, errors } = await openComposer(context, origin);
    await prepareBasicGeneration(page, `기존 저장 원고 ${originName}`);
    await generateAndRead(page);
    await page.locator('.draftStorageStatus[data-state="saved"]').waitFor({ timeout: 12000 });
    const before = await readStoredDraft(page);
    await page.locator('.successToast[data-state="complete"] button').click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('.draftStorageStatus[data-state="ready"], .draftStorageStatus[data-state="saved"]').first().waitFor({ timeout: 12000 });
    assert.equal(generateCalls, 1, "reload of a legacy draft must not regenerate");
    assert.equal(await page.locator(".successToast").count(), 0, "restore must not replay completion feedback");
    const qaTab = page.locator("#inspector-tab-qa");
    if (!(await qaTab.isVisible())) {
      await page.locator(".reviewLauncher:visible, .mobileReviewLauncher:visible").first().click();
    }
    await qaTab.click();
    await page.locator(".layoutPlanStatus--legacy").waitFor();
    assert.deepEqual(await readStoredDraft(page), before);
    assert.deepEqual(errors, []);
    results.push({ origin: originName, case: "legacy-restore", status: "PASS", generateCalls });
  } finally {
    await context.close();
  }
}

try {
  for (const [name, origin] of origins) {
    await runNormal(name, origin);
    await runHiddenPurpose(name, origin);
  }
  await runMismatch(origins[0][0], origins[0][1], "id", { width: 1440, height: 900 });
  await runMismatch(origins[0][0], origins[0][1], "order", { width: 1440, height: 900 });
  await runMismatch(origins[1][0], origins[1][1], "image", { width: 390, height: 844 }, "reduce");
  await runLegacyRestore(origins[0][0], origins[0][1]);
} finally {
  await browser.close();
}

for (const result of results) console.log("LAYOUT_PLAN_FEEDBACK_QA", JSON.stringify(result));
console.log("LAYOUT_PLAN_FEEDBACK_QA PASS: dual-Origin real keyless mock + synthetic mismatch UI; desktop/mobile; no paid provider or user data.");
