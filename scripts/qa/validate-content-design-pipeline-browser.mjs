import assert from "node:assert/strict";

const playwrightModule = process.env.BLOTORI_PLAYWRIGHT_MODULE ?? "playwright";
const { chromium } = await import(playwrightModule);
const origin = process.env.BLOTORI_QA_URL;
if (!origin) throw new Error("Set BLOTORI_QA_URL");

const browser = await chromium.launch({
  headless: true,
  ...(process.env.BLOTORI_CHROMIUM_EXECUTABLE ? { executablePath: process.env.BLOTORI_CHROMIUM_EXECUTABLE } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

function selectWithOption(value) {
  return page.locator(".settingsRail select").filter({ has: page.locator(`option[value="${value}"]`) }).first();
}

function publicDraftText(draft) {
  return [draft.title, draft.summary, ...(draft.intro ?? []), ...(draft.closing ?? []), ...(draft.tags ?? []),
    ...(draft.sections ?? []).flatMap((section) => [section.heading, ...(section.paragraphs ?? [])]),
    ...(draft.images ?? []).flatMap((image) => [image.label, image.placement, image.prompt])].join("\n");
}

const internalObservedTokenPattern = /compact paragraph rhythm|balanced paragraph rhythm|extended paragraph rhythm|very-high\s*\/|section-transition|\binterleaved\b/i;
const casualObservedFlowSentence = "짧은 문단으로 빠르게 이어지는 호흡을 유지하고, 사진은 본문과 사진을 번갈아 잇는 흐름에 맞춰 배치해요.";
const formalObservedFlowSentence = "짧고 중간 길이 문단을 섞은 호흡을 유지하고, 사진은 내용이 바뀌는 지점에 사진을 두는 흐름에 맞춰 배치합니다.";

try {
  await context.route("**/api/health**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, keyDetected: false, verified: false, model: "offline-mock", message: "Synthetic browser QA" }),
  }));
  const response = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20000 });
  assert.equal(response?.status(), 200);
  await page.locator(".workspaceV2").waitFor();
  await page.waitForFunction(() => document.querySelector(".draftStorageStatus")?.getAttribute("data-state") === "ready", null, { timeout: 12000 });

  await selectWithOption("naver").selectOption("naver");
  await selectWithOption("food").selectOption("food");
  await selectWithOption("restaurant-review").selectOption("restaurant-review");
  await page.locator('.settingsRail textarea[placeholder*="자유롭게 입력"]').fill("합성 맛집 구성 QA");
  await page.locator('.settingsRail input[placeholder*="성수동 카페"]').fill("합성 식당 A");
  await page.locator('.settingsRail input[placeholder*="라떼"]').fill("합성 메뉴 B");
  await page.locator('.settingsRail input[placeholder*="데이트"]').fill("합성 가족 식사");
  await page.locator('.settingsRail input[placeholder*="1인 2만원대"]').fill("합성 1인 가격대");
  await page.locator('.settingsRail input[placeholder*="담백함"]').fill("합성 담백함");
  await page.waitForFunction(() => {
    const button = document.querySelector(".settingsRail .generatePrimary");
    return Boolean(button && !button.disabled);
  });
  const responsePromise = page.waitForResponse((item) => item.request().method() === "POST"
    && new URL(item.url()).pathname === "/api/generate", { timeout: 15000 });
  await page.locator(".settingsRail .generatePrimary").click();
  const generatedResponse = await responsePromise;
  assert.equal(generatedResponse.status(), 200);
  const generated = await generatedResponse.json();
  assert.equal(generated.mode, "mock");
  const draft = generated.draft;
  assert.ok(draft.contentLayoutPlan);
  assert.equal(draft.contentLayoutPlan.source.observedStyle?.status, "applied");
  assert.equal(draft.contentLayoutPlan.source.observedStyle?.selectionMode, "category-auto");
  assert.equal(draft.contentLayoutPlan.source.observedStyle?.runtimePresetId, "food-observed-01");
  assert.equal(draft.contentLayoutPlan.observedStyle?.voice.register, "casual");
  assert.doesNotMatch(publicDraftText(draft), internalObservedTokenPattern);
  assert.equal(publicDraftText(draft).includes(casualObservedFlowSentence), true);
  await page.getByText(casualObservedFlowSentence, { exact: true }).first().waitFor();

  await page.locator(".articleSection.visual-callout").waitFor({ timeout: 10000 });
  await page.locator(".articleSection .textEmphasis").first().waitFor();
  const sections = await page.locator(".articleSection").evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute("data-section-id"),
    className: node.className,
    paragraphCount: node.querySelectorAll(".sectionBody > p").length,
    background: getComputedStyle(node).backgroundColor,
    backgroundImage: getComputedStyle(node).backgroundImage,
    borderLeftWidth: getComputedStyle(node).borderLeftWidth,
    headingBorderLeftWidth: getComputedStyle(node.querySelector("h3")).borderLeftWidth,
  })));
  assert.deepEqual(sections.map((item) => item.id), draft.contentLayoutPlan.sections.map((item) => item.id));
  assert.deepEqual(sections.map((item) => item.paragraphCount), draft.sections.map((item) => item.paragraphs.length));
  const factCard = sections.find((item) => item.id === "food-facts");
  assert.ok(factCard?.className.includes("visual-key-point"));
  assert.ok(factCard.paragraphCount >= 2 && factCard.paragraphCount <= 4);
  assert.equal(factCard.background, "rgba(0, 0, 0, 0)", "Naver fact card must remain a conservative heading treatment");
  assert.ok(Number.parseFloat(factCard.headingBorderLeftWidth) > 0);
  const factCardText = await page.locator('[data-section-id="food-facts"]').innerText();
  assert.doesNotMatch(factCardText, /미확인|사용자 입력·미검증|사용자 확인|외부 자료 확인/);
  for (const value of ["합성 식당 A", "합성 메뉴 B", "합성 가족 식사", "합성 1인 가격대", "합성 담백함"]) {
    assert.match(factCardText, new RegExp(value));
  }
  assert.equal(draft.contentLayoutPlan.imageAnchors.some((anchor) => anchor.afterSectionId === "food-facts"), false);
  await page.evaluate(() => document.querySelector("#inspector-tab-qa")?.click());
  await page.locator(".layoutPlanStatus").waitFor({ state: "attached", timeout: 10000 });
  const layoutStatusText = await page.locator(".layoutPlanStatus").textContent() ?? "";
  assert.match(layoutStatusText, /입력 정보 상태/);
  assert.match(layoutStatusText, /입력됨\(미검증\)/);
  assert.match(layoutStatusText, /확인되지 않아 생성하지 않은 정보.*방문 경험.*영업시간.*주소/s);
  const card = sections.find((item) => item.className.includes("visual-callout"));
  const visualRules = await page.evaluate(() => [...document.styleSheets].flatMap((sheet) => {
    try { return [...sheet.cssRules].flatMap((rule) => "selectorText" in rule && rule.selectorText.includes("visual-callout") ? [rule.cssText] : []); }
    catch { return []; }
  }));
  assert.ok(card && Number.parseFloat(card.headingBorderLeftWidth) > 0, JSON.stringify({ card, visualRules }));
  assert.equal(card.background, "rgba(0, 0, 0, 0)", "Naver preview must not overstate full-card fidelity");
  assert.match(await page.locator("[data-naver-preview-boundary]").innerText(), /SmartEditor.*검증되지/);
  const exportedText = await page.locator('[data-export-preview="true"]').textContent() ?? "";
  assert.doesNotMatch(exportedText, /미확인|사용자 입력·미검증|사용자 확인|외부 자료 확인/);
  assert.doesNotMatch(exportedText, internalObservedTokenPattern);
  assert.equal(exportedText.includes(casualObservedFlowSentence), true);
  const emphasisWeight = await page.locator(".articleSection .textEmphasis").first().evaluate((node) => Number.parseInt(getComputedStyle(node).fontWeight, 10));
  assert.ok(emphasisWeight >= 700);

  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==", "base64");
  const fileInputs = page.locator(".draftImageInput");
  assert.ok(await fileInputs.count() >= 4);
  for (let index = 0; index < 4; index += 1) {
    await fileInputs.nth(index).setInputFiles({ name: `synthetic-${index + 1}.png`, mimeType: "image/png", buffer: tinyPng });
  }
  await page.locator("[data-draft-image]").nth(3).waitFor({ timeout: 10000 });
  const imageWidths = await page.locator("[data-draft-image]").evaluateAll((nodes) => nodes.map((node) => Number.parseFloat(node.style.width)));
  assert.deepEqual(imageWidths, draft.contentLayoutPlan.imageAnchors.map((item) => item.display.widthPercent));

  await page.locator("[data-section-edit-mode]").click();
  const firstHeadingEditor = page.locator(".sectionHeadingEdit").first();
  const originalHeading = await firstHeadingEditor.inputValue();
  await firstHeadingEditor.fill(`${originalHeading} 편집`);
  const presentationNotice = page.locator('.sectionOrderExportNotice[role="status"]').filter({ hasText: "편집 계획과 달라요" });
  await presentationNotice.waitFor({ timeout: 10000 });
  assert.ok(await page.locator(".platformExportPanel").count() > 0,
    "presentation mismatch must remain exportable while showing a refreshed QA warning");
  await firstHeadingEditor.fill(originalHeading);
  await page.getByRole("button", { name: "미리보기" }).click();

  await selectWithOption("health").selectOption("health");
  await selectWithOption("treatment-education").selectOption("treatment-education");
  await page.locator('.settingsRail textarea[placeholder*="자유롭게 입력"]').fill("합성 건강 정보 QA");
  const nonFoodResponsePromise = page.waitForResponse((item) => item.request().method() === "POST"
    && new URL(item.url()).pathname === "/api/generate", { timeout: 15000 });
  await page.locator(".settingsRail .generatePrimary").click();
  const nonFoodResponse = await nonFoodResponsePromise;
  assert.equal(nonFoodResponse.status(), 200);
  const nonFoodGenerated = await nonFoodResponse.json();
  const nonFoodDraft = nonFoodGenerated.draft;
  assert.ok(nonFoodDraft.contentLayoutPlan);
  assert.equal(nonFoodDraft.contentLayoutPlan.source.observedStyle?.runtimePresetId, "health-observed-01");
  assert.equal(nonFoodDraft.contentLayoutPlan.observedStyle?.voice.register, "formal");
  assert.notDeepEqual(nonFoodDraft.contentLayoutPlan.paragraphChars, draft.contentLayoutPlan.paragraphChars);
  assert.notEqual(nonFoodDraft.contentLayoutPlan.observedStyle?.image.placement, draft.contentLayoutPlan.observedStyle?.image.placement);
  assert.doesNotMatch(publicDraftText(nonFoodDraft), internalObservedTokenPattern);
  assert.equal(publicDraftText(nonFoodDraft).includes(formalObservedFlowSentence), true);
  assert.equal(nonFoodDraft.contentLayoutPlan.factPlan, undefined);
  assert.equal(nonFoodDraft.sections.some((section) => section.id === "food-facts"), false);
  await page.waitForFunction(() => !document.querySelector('[data-section-id="food-facts"]')
    && document.querySelector('[data-section-id="layout-evidence"]'), null, { timeout: 10000 });
  await page.locator(".articleSection.visual-key-point").waitFor({ timeout: 10000 });
  await page.locator(".articleSection .textEmphasis").first().waitFor();
  await page.getByText(formalObservedFlowSentence, { exact: true }).first().waitFor();
  const nonFoodExportedText = await page.locator('[data-export-preview="true"]').textContent() ?? "";
  assert.equal(nonFoodExportedText.includes(formalObservedFlowSentence), true);
  assert.doesNotMatch(nonFoodExportedText, internalObservedTokenPattern);
  const nonFoodSections = await page.locator(".articleSection").evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute("data-section-id"),
    className: node.className,
    paragraphCount: node.querySelectorAll(".sectionBody > p").length,
  })));
  assert.deepEqual(nonFoodSections.map((item) => item.id), nonFoodDraft.contentLayoutPlan.sections.map((item) => item.id));
  assert.deepEqual(nonFoodSections.map((item) => item.paragraphCount), nonFoodDraft.sections.map((item) => item.paragraphs.length));

  await page.route("**/api/generate", async (route) => {
    const upstream = await route.fetch();
    const body = await upstream.json();
    const factSection = body.draft.sections.find((section) => section.id === "food-facts");
    if (factSection) factSection.paragraphs[0] = "방문 경험: 합성 변조";
    else body.draft.images[0].prompt += " Opening hours: 24/7";
    body.draft.contentLayoutPlan = undefined;
    body.draft.warnings.push("사실 무결성 차단: 합성 브라우저 검수용 변조");
    await route.fulfill({ response: upstream, json: body });
  });
  await selectWithOption("food").selectOption("food");
  await selectWithOption("restaurant-review").selectOption("restaurant-review");
  await page.locator('.settingsRail textarea[placeholder*="자유롭게 입력"]').fill("합성 사실 차단 QA");
  const blockedResponsePromise = page.waitForResponse((item) => item.request().method() === "POST"
    && new URL(item.url()).pathname === "/api/generate", { timeout: 15000 });
  await page.locator(".settingsRail .generatePrimary").click();
  assert.equal((await blockedResponsePromise).status(), 200);
  await page.locator('.sectionOrderExportNotice[role="alert"]').waitFor({ timeout: 10000 });
  assert.match(await page.locator('.sectionOrderExportNotice[role="alert"]').innerText(), /본문·태그·이미지 가이드 내보내기를 잠갔어요/);
  assert.equal(await page.locator(".platformExportPanel").count(), 0,
    "fact-integrity blocking must suppress every platform export projection");
  assert.deepEqual(errors, []);

  console.log("CONTENT_DESIGN_PIPELINE_BROWSER_SYNTHETIC_PASS", JSON.stringify({
    sections: sections.map(({ id, className, paragraphCount }) => ({ id, className, paragraphCount })),
    publicFoodFactRows: factCard.paragraphCount,
    emphasisWeight,
    imageWidths,
    nonFoodSections,
    factBlockingRendered: true,
    presentationMismatchWarningRefreshed: true,
    observedCategoryAuto: [
      draft.contentLayoutPlan.source.observedStyle?.runtimePresetId,
      nonFoodDraft.contentLayoutPlan.source.observedStyle?.runtimePresetId,
    ],
    providerCalls: 0,
    externalCalls: 0,
    naverTransfers: 0,
    evidence: "LOCAL_MOCK_BROWSER_FIXTURE",
  }));
} finally {
  await context.close();
  await browser.close();
}
