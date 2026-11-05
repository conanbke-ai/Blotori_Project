// Render the three plan-derived visual grammars with synthetic drafts only.
// No provider, Naver transfer, OS clipboard, or user data is used.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import Module, { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalTs = Module._extensions[".ts"];
Module._extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  fileName: filename,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const { buildContentLayoutPlan } = require("../../lib/domain/content-layout-plan.ts");
const { applyContentLayoutPlanToGeneratedDraft } = require("../../lib/application/generate-blog-draft.ts");
const { makeMockDraft } = require("../../lib/infrastructure/mock-content-adapter.ts");

const baseInput = {
  platformId: "naver",
  categoryId: "review",
  presetId: "product-review",
  freeTopic: "합성 제품 경험",
  attributes: { productName: "합성 제품", usagePeriod: "합성 사용 기간", pros: "합성 장점", cons: "합성 아쉬운 점", targetUser: "합성 독자" },
  styleIntensity: 3,
  length: "medium",
  imageCount: 4,
};
const fixtures = [
  { name: "experience", styleId: "honest-review", structureId: "review" },
  { name: "information", styleId: "friendly-info", structureId: "information" },
  { name: "curation", styleId: "shareable-info", structureId: "comparison" },
].map((grammar) => {
  const input = { ...baseInput, styleId: grammar.styleId, structureId: grammar.structureId };
  const { plan, generationInput, warnings } = buildContentLayoutPlan(input);
  const draft = applyContentLayoutPlanToGeneratedDraft(makeMockDraft(generationInput, plan), input.imageCount, plan, warnings);
  assert.equal(plan.intent, grammar.name);
  assert.equal(draft.contentLayoutPlan?.intent, grammar.name);
  return { ...grammar, input, plan, draft };
});

const targets = [
  ["localhost", process.env.BLOTORI_LOCAL_URL],
  ["network", process.env.BLOTORI_NETWORK_URL],
].filter(([, url]) => Boolean(url));
if (targets.length === 0) throw new Error("Set BLOTORI_LOCAL_URL or BLOTORI_NETWORK_URL");
const artifactDir = process.env.BLOTORI_QA_ARTIFACT_DIR;
if (artifactDir) mkdirSync(artifactDir, { recursive: true });
const viewports = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "mobile-390x844", width: 390, height: 844 },
];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BLOTORI_QA_BROWSER_EXECUTABLE
    ? { executablePath: process.env.BLOTORI_QA_BROWSER_EXECUTABLE }
    : {}),
});
const results = [];

async function withSyntheticRoutes(context, url, draft, counters) {
  const allowedOrigin = new URL(url).origin;
  await context.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname === "/api/generate") {
      counters.generation += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ draft, mode: "mock", requestId: "visual-grammar-qa" }) });
    }
    if (requestUrl.pathname === "/api/health") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, keyDetected: true, verified: false, message: "SYNTHETIC QA" }) });
    }
    if (requestUrl.origin !== allowedOrigin) {
      counters.external += 1;
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
}

async function generateSynthetic(page, url) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  await page.locator('.draftStorageStatus[data-state="ready"]').waitFor({ state: "attached" });
  await page.locator(".settingsRail select").filter({ has: page.locator('option[value="naver"]') }).first().selectOption("naver");
  await page.locator(".settingsRail textarea").first().fill("합성 시각 문법 QA");
  await page.waitForFunction(() => {
    const button = document.querySelector(".settingsRail .generatePrimary");
    return button && !button.disabled;
  });
  await page.locator(".settingsRail .generatePrimary").click();
}

async function renderFixture(originName, url, fixture, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const counters = { generation: 0, external: 0 };
  try {
    await withSyntheticRoutes(context, url, fixture.draft, counters);
    const page = await context.newPage();
    await generateSynthetic(page, url);
    const paper = page.locator(`.blogPaper[data-visual-grammar="${fixture.name}"]`);
    await paper.waitFor();
    const metrics = await paper.evaluate((node) => ({
      grammar: node.getAttribute("data-visual-grammar"),
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      paperOverflow: node.scrollWidth - node.clientWidth,
      maxWidth: getComputedStyle(node).maxWidth,
      styles: [...node.querySelectorAll(".articleSection")].map((section) => {
        const visualClass = [...section.classList].find((value) => value.startsWith("visual-"));
        return {
          id: section.getAttribute("data-section-id"),
          heading: section.querySelector("h3")?.textContent?.trim() ?? "",
          visualStyle: visualClass?.slice("visual-".length) ?? null,
          paragraphs: [...section.querySelectorAll(".sectionBody > p")].map((paragraph) => paragraph.textContent?.trim() ?? ""),
          className: section.className,
          marginBlock: getComputedStyle(section).marginBlock,
          width: section.getBoundingClientRect().width,
        };
      }),
    }));
    assert.equal(metrics.grammar, fixture.name);
    assert.equal(metrics.bodyOverflow, 0);
    assert.ok(metrics.paperOverflow <= 1);
    assert.deepEqual(
      metrics.styles.map(({ id, heading, visualStyle }) => ({ id, heading, visualStyle })),
      fixture.plan.sections.map(({ id, heading, visualStyle }) => ({ id, heading, visualStyle })),
      "rendered section ids, headings, and visual roles must exactly match the plan",
    );
    const inputSummary = metrics.styles.filter((item) => item.id === "input-summary");
    const inputSummaryDraft = fixture.draft.sections.find((section) => section.id === "input-summary");
    assert.equal(inputSummary.length, 1, "the protected input summary must render exactly once");
    assert.equal(inputSummary[0].visualStyle, "key-point");
    assert.ok(inputSummaryDraft, "the synthetic fixture must retain its input summary rows");
    assert.deepEqual(inputSummary[0].paragraphs, inputSummaryDraft.paragraphs,
      "the protected input summary must render the exact admitted input rows");

    const editorialStyles = metrics.styles.filter((item) => !["input-summary", "food-facts"].includes(item.id));
    const editorialIds = (visualStyle) => editorialStyles
      .filter((item) => item.visualStyle === visualStyle)
      .map((item) => item.id);
    if (fixture.name === "experience") assert.deepEqual(editorialIds("quote"), ["layout-takeaway"]);
    if (fixture.name === "information") assert.deepEqual(editorialIds("key-point"), ["layout-application"]);
    if (fixture.name === "curation") {
      assert.deepEqual(editorialIds("key-point"), ["layout-evidence"]);
      assert.deepEqual(editorialIds("callout"), ["layout-takeaway"]);
    }

    const exportPanel = page.locator(".platformExportPanel");
    await exportPanel.waitFor();
    const details = exportPanel.locator("details").first();
    if (!(await details.getAttribute("open"))) await details.locator("summary").click();
    if (artifactDir && originName === "localhost") {
      const prefix = `${fixture.name}-${viewport.name}`;
      await paper.screenshot({ path: join(artifactDir, `${prefix}-result.png`) });
      await exportPanel.screenshot({ path: join(artifactDir, `${prefix}-export.png`) });
    }
    assert.equal(counters.generation, 1);
    assert.equal(counters.external, 0);
    return { origin: originName, grammar: fixture.name, viewport: viewport.name, status: "PASS", metrics, paidCalls: 0, naverTransfers: 0, clipboardWrites: 0 };
  } finally {
    await context.close();
  }
}

async function verifyMismatchFallback(url) {
  const mismatch = structuredClone(fixtures[0].draft);
  mismatch.sections[0].presentation.visualStyle = "callout";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const counters = { generation: 0, external: 0 };
  try {
    await withSyntheticRoutes(context, url, mismatch, counters);
    const page = await context.newPage();
    await generateSynthetic(page, url);
    await page.locator(".blogPaper").waitFor();
    assert.equal(await page.locator(".blogPaper").getAttribute("data-visual-grammar"), null);
    await page.locator(".sectionOrderExportNotice").first().waitFor();
    assert.equal(counters.external, 0);
  } finally {
    await context.close();
  }
}

try {
  for (const [originName, url] of targets) {
    for (const fixture of fixtures) {
      for (const viewport of viewports) {
        try { results.push(await renderFixture(originName, url, fixture, viewport)); }
        catch (error) { results.push({ origin: originName, grammar: fixture.name, viewport: viewport.name, status: "FAIL", reason: String(error).slice(0, 600) }); }
      }
    }
  }
  await verifyMismatchFallback(targets[0][1]);
} finally {
  await browser.close();
  if (originalTs) Module._extensions[".ts"] = originalTs;
  else delete Module._extensions[".ts"];
}

for (const result of results) console.log("EDITORIAL_VISUAL_QA", JSON.stringify(result));
if (results.some((result) => result.status !== "PASS")) process.exitCode = 1;
else console.log(`EDITORIAL_VISUAL_QA PASS ${results.length}/${results.length} - synthetic fixtures, screenshots=${artifactDir ? basename(artifactDir) : "disabled"}, paid API 0, Naver transfer 0, OS clipboard 0`);
