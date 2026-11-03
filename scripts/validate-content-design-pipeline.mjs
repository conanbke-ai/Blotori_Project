import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalTs = Module._extensions[".ts"];

function compile(filename) {
  return ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
}

Module._extensions[".ts"] = (module, filename) => module._compile(compile(filename), filename);

try {
  const { buildContentLayoutPlan, validateDraftAgainstContentLayoutPlan } = require("../lib/domain/content-layout-plan.ts");
  const { buildPrompt } = require("../lib/application/build-prompt.ts");
  const { applyContentLayoutPlanToGeneratedDraft } = require("../lib/application/generate-blog-draft.ts");
  const { makeMockDraft } = require("../lib/infrastructure/mock-content-adapter.ts");
  const { buildPlatformExport } = require("../lib/application/platform-exporter.ts");

  const cases = [
    { categoryId: "food", presetId: "restaurant-review", attributes: { visitPurpose: "친구와 저녁 식사" }, styleId: "honest-review", structureId: "review" },
    { categoryId: "health", presetId: "treatment-education", attributes: { audience: "초보자", goal: "확인 순서 안내" }, styleId: "friendly-info", structureId: "guide" },
    { categoryId: "travel", presetId: "destination-guide", attributes: { place: "입력으로 확인된 장소" }, styleId: "shareable-info", structureId: "checklist" },
    { categoryId: "education", presetId: "concept-summary", attributes: { learningGoal: "핵심 개념 구분" }, styleId: "professional-column", structureId: "information" },
  ].map((item, index) => ({
    platformId: index % 2 === 0 ? "naver" : "wordpress",
    freeTopic: `합성 주제 ${index + 1}`,
    styleIntensity: index === 3 ? 5 : 3,
    length: "medium",
    imageCount: 4,
    ...item,
  }));

  const summaries = [];
  for (const input of cases) {
    const before = structuredClone(input);
    const { plan, generationInput } = buildContentLayoutPlan(input);
    const draft = makeMockDraft(generationInput, plan);
    assert.deepEqual(input, before, `${input.categoryId}: raw request must stay immutable`);
    const layoutValidation = validateDraftAgainstContentLayoutPlan(draft, plan);
    assert.equal(layoutValidation.ok, true, `${input.categoryId}: mock output must implement the design plan: ${layoutValidation.reasons.join(" | ")}`);

    const cards = draft.sections.filter((section) => section.id !== "food-facts"
      && !["standard", "glossary"].includes(section.presentation?.visualStyle ?? "standard"));
    const emphasized = draft.sections.filter((section) => (section.presentation?.emphasis?.length ?? 0) > 0);
    assert.ok(cards.length > 0 && cards.length <= plan.emphasis.cardLimit, `${input.categoryId}: card rhythm must be deliberate`);
    assert.ok(emphasized.length >= (plan.emphasis.minimumSections ?? 0), `${input.categoryId}: planned emphasis must exist`);
    const foodFacts = draft.sections.find((section) => section.id === "food-facts");
    if (input.categoryId === "food") {
      assert.equal(foodFacts?.presentation?.visualStyle, "key-point");
      assert.ok((foodFacts?.paragraphs.length ?? 0) > 0 && (foodFacts?.paragraphs.length ?? 0) <= 4);
      assert.equal(foodFacts?.paragraphs.some((line) => /미확인|사용자 입력·미검증/.test(line)), false);
      assert.equal(plan.imageAnchors.some((anchor) => anchor.afterSectionId === "food-facts"), false);
    }
    for (const [index, section] of draft.sections.entries()) {
      const range = plan.sections[index].paragraphRange;
      assert.ok(section.paragraphs.length >= range[0] && section.paragraphs.length <= range[1]);
      for (const emphasis of section.presentation?.emphasis ?? []) {
        assert.ok(section.paragraphs.some((paragraph) => paragraph.includes(emphasis.phrase)));
      }
    }
    assert.equal(draft.presentation?.density, plan.typography.density);
    assert.deepEqual(draft.images.map((image) => image.display), plan.imageAnchors.map((anchor) => anchor.display));

    const prompt = buildPrompt(generationInput, plan);
    assert.match(prompt, /visualStyle=/);
    assert.match(prompt, /minimumSections=/);
    assert.match(prompt, /width=100%/);
    assert.match(prompt, new RegExp(`density=${plan.typography.density}`));

    const embeddedImages = draft.images.map((image) => ({
      imageId: image.id,
      mimeType: "image/png",
      byteLength: 1,
      src: "data:image/png;base64,AA==",
    }));
    const exported = buildPlatformExport(draft, input.platformId, embeddedImages);
    assert.ok(exported.html);
    assert.match(exported.html, /width:(?:50|75|100)%/);
    assert.ok(exported.html.includes("background-color") || exported.html.includes("border-left"), `${input.categoryId}: card treatment must survive rich export`);
    assert.ok(exported.html.includes("<strong>") || exported.html.includes("font-weight"), `${input.categoryId}: emphasis must survive rich export`);
    for (const image of draft.images) assert.match(exported.imageGuideText, new RegExp(image.id));

    const decoratedIndex = draft.sections.findIndex((section) => section.presentation?.visualStyle !== "standard");
    const visualMismatch = structuredClone(draft);
    visualMismatch.sections[decoratedIndex].presentation.visualStyle = "standard";
    assert.equal(validateDraftAgainstContentLayoutPlan(visualMismatch, plan).ok, false);

    const emphasisMismatch = structuredClone(draft);
    emphasisMismatch.sections.forEach((section) => { section.presentation.emphasis = []; });
    assert.equal(validateDraftAgainstContentLayoutPlan(emphasisMismatch, plan).ok, false);

    const paragraphMismatch = structuredClone(draft);
    paragraphMismatch.sections[0].paragraphs = [];
    assert.equal(validateDraftAgainstContentLayoutPlan(paragraphMismatch, plan).ok, false);

    const densityMismatch = structuredClone(draft);
    densityMismatch.presentation.density = densityMismatch.presentation.density === "dense" ? "airy" : "dense";
    assert.equal(validateDraftAgainstContentLayoutPlan(densityMismatch, plan).ok, false);

    const imageDisplayMismatch = structuredClone(draft);
    imageDisplayMismatch.images[0].display.widthPercent = 25;
    assert.equal(validateDraftAgainstContentLayoutPlan(imageDisplayMismatch, plan).ok, false);
    const unapplied = applyContentLayoutPlanToGeneratedDraft(imageDisplayMismatch, input.imageCount, plan);
    assert.equal(unapplied.contentLayoutPlan, undefined, "mismatch must stay visible instead of being auto-repaired");

    summaries.push({
      categoryId: input.categoryId,
      intent: plan.intent,
      paragraphs: draft.sections.map((section) => section.paragraphs.length),
      visualStyles: draft.sections.map((section) => section.presentation?.visualStyle),
      emphasisSections: emphasized.length,
      imageWidths: draft.images.map((image) => image.display?.widthPercent),
      density: draft.presentation?.density,
    });
  }

  console.log("CONTENT_DESIGN_PIPELINE_SYNTHETIC_PASS", JSON.stringify({
    cases: cases.length,
    summaries,
    rejected: ["visualStyle", "emphasis", "paragraphCount", "density", "imageDisplay"],
    externalCalls: 0,
    providerCalls: 0,
    naverTransfers: 0,
    userData: 0,
    evidence: "SYNTHETIC_FIXTURE_ONLY",
  }));
} finally {
  if (originalTs) Module._extensions[".ts"] = originalTs;
  else delete Module._extensions[".ts"];
}
