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
  const {
    buildContentLayoutPlan,
    resolveContentLayoutVisualGrammar,
    validateDraftAgainstContentLayoutPlan,
  } = require("../lib/domain/content-layout-plan.ts");
  const { buildPrompt } = require("../lib/application/build-prompt.ts");
  const { applyContentLayoutPlanToGeneratedDraft } = require("../lib/application/generate-blog-draft.ts");
  const { makeMockDraft } = require("../lib/infrastructure/mock-content-adapter.ts");
  const { buildPlatformExport } = require("../lib/application/platform-exporter.ts");

  const cases = [
    { categoryId: "food", presetId: "restaurant-review", attributes: { visitPurpose: "친구와 저녁 식사" }, styleId: "honest-review", structureId: "review" },
    { categoryId: "health", presetId: "treatment-education", attributes: { ageGroup: "초보자", goal: "확인 순서 안내" }, styleId: "friendly-info", structureId: "guide" },
    { categoryId: "travel", presetId: "destination-guide", attributes: { destination: "입력으로 확인된 장소" }, styleId: "shareable-info", structureId: "checklist" },
    { categoryId: "education", presetId: "concept-summary", attributes: { learningGoal: "핵심 개념 구분" }, styleId: "professional-column", structureId: "information" },
  ].map((item, index) => ({
    platformId: index % 2 === 0 ? "naver" : "wordpress",
    freeTopic: `합성 주제 ${index + 1}`,
    styleIntensity: index === 3 ? 5 : 3,
    length: "medium",
    imageCount: 4,
    ...item,
  }));

  const grammarBase = {
    platformId: "naver",
    categoryId: "review",
    presetId: "product-review",
    freeTopic: "동일한 합성 제품 경험",
    attributes: {
      productName: "합성 제품",
      usagePeriod: "합성 사용 기간",
      pros: "합성 장점",
      cons: "합성 아쉬운 점",
      targetUser: "합성 독자",
    },
    styleIntensity: 3,
    length: "medium",
    imageCount: 4,
  };
  const grammarCases = [
    { name: "experience", intent: "experience", styleId: "honest-review", structureId: "review" },
    { name: "information", intent: "information", styleId: "friendly-info", structureId: "information" },
    { name: "curation", intent: "curation", styleId: "shareable-info", structureId: "comparison" },
  ];

  const grammarSummaries = [];
  let experiencePlan;
  for (const grammar of grammarCases) {
    const input = { ...grammarBase, styleId: grammar.styleId, structureId: grammar.structureId };
    const { plan, generationInput, warnings } = buildContentLayoutPlan(input);
    assert.deepEqual(warnings, [], `${grammar.name}: active grammar fixture must not be filtered`);
    const draft = makeMockDraft(generationInput, plan);
    assert.equal(plan.intent, grammar.intent);
    if (grammar.intent === "experience") experiencePlan = structuredClone(plan);
    assert.equal(plan.typography.body, grammar.intent === "experience" ? "narrative" : grammar.intent === "information" ? "scannable" : "mixed");
    assert.deepEqual(draft.sections.map((section) => section.id), plan.sections.map((section) => section.id));
    assert.equal(validateDraftAgainstContentLayoutPlan(draft, plan).ok, true);

    const visualStyles = draft.sections
      .filter((section) => section.id !== "input-summary")
      .map((section) => section.presentation?.visualStyle ?? "standard");
    const count = (style) => visualStyles.filter((value) => value === style).length;
    if (grammar.intent === "experience") {
      assert.equal(count("quote"), 1, "experience grammar needs one restrained closing quote");
      assert.equal(count("key-point") + count("callout"), 0);
    } else if (grammar.intent === "information") {
      assert.equal(count("key-point"), 1, "information grammar needs one scannable key point");
      assert.equal(count("quote") + count("callout"), 0);
    } else {
      assert.equal(count("key-point"), 1, "curation grammar needs one evidence card");
      assert.equal(count("callout"), 1, "curation grammar needs one decision card");
      assert.equal(count("quote"), 0);
    }

    for (const [index, image] of draft.images.entries()) {
      assert.deepEqual(image.display, plan.imageAnchors[index].display);
      if (image.role === "EXPLAINER" || image.role === "PROCESS") assert.equal(image.display?.widthPercent, 75);
    }
    for (const platformId of ["naver", "wordpress"]) {
      const exported = buildPlatformExport(draft, platformId);
      assert.ok(exported.html, `${grammar.name}/${platformId}: rich export must stay available`);
      assert.ok(exported.html.includes("background-color") || exported.html.includes("border"));
    }
    grammarSummaries.push({
      name: grammar.name,
      intent: plan.intent,
      headingDensity: plan.headingDensity,
      density: plan.typography.density,
      visualStyles,
      imageWidths: draft.images.map((image) => image.display?.widthPercent),
    });
  }

  assert.ok(experiencePlan, "experience plan fixture must exist");
  const highExperience = buildContentLayoutPlan({
    ...grammarBase,
    styleIntensity: 4,
    styleId: "honest-review",
    structureId: "review",
  });
  assert.deepEqual(highExperience.warnings, []);
  assert.equal(highExperience.plan.emphasis.cardLimit, 2);
  const highExperienceDraft = makeMockDraft(highExperience.generationInput, highExperience.plan);
  assert.equal(highExperienceDraft.sections.filter((section) => section.presentation?.visualStyle === "quote").length, 2,
    "intensity >= 4 keeps the established two-card experience rhythm");

  const highFood = buildContentLayoutPlan({
    platformId: "naver",
    categoryId: "food",
    presetId: "restaurant-review",
    freeTopic: "합성 고강도 맛집 리뷰",
    attributes: {
      place: "합성 식당",
      menu: "합성 메뉴",
      visitPurpose: "합성 방문 목적",
      priceRange: "합성 가격대",
      tastePoint: "합성 맛 특징",
    },
    styleId: "honest-review",
    styleIntensity: 5,
    structureId: "review",
    length: "medium",
    imageCount: 4,
  });
  assert.deepEqual(highFood.warnings, []);
  assert.equal(highFood.plan.emphasis.cardLimit, 2);
  const highFoodDraft = makeMockDraft(highFood.generationInput, highFood.plan);
  const highFoodFacts = highFoodDraft.sections.find((section) => section.id === "food-facts");
  assert.equal(highFoodFacts?.presentation?.visualStyle, "key-point");
  assert.equal(highFoodDraft.sections.filter((section) => section.id !== "food-facts"
    && section.presentation?.visualStyle === "quote").length, 2,
  "food facts preserve their provenance card while non-food sections keep the high-intensity two-quote contract");
  const observedVisualVariant = structuredClone(experiencePlan);
  observedVisualVariant.headingDensity = "high";
  observedVisualVariant.typography.density = "dense";
  assert.deepEqual(resolveContentLayoutVisualGrammar(observedVisualVariant, true), {
    intent: "experience",
    headingDensity: "high",
    density: "dense",
  }, "observed heading and whitespace tokens must override the intent defaults");
  assert.equal(resolveContentLayoutVisualGrammar(observedVisualVariant, false), undefined,
    "a plan/draft mismatch must remove every grammar projection attribute");
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const themeSource = readFileSync(new URL("../app/blotori-theme.css", import.meta.url), "utf8");
  assert.match(pageSource, /data-heading-density=\{visualGrammar\?\.headingDensity\}/);
  assert.match(pageSource, /data-visual-density=\{visualGrammar\?\.density\}/);
  assert.match(themeSource, /data-heading-density="high"/);
  assert.match(themeSource, /data-visual-density="dense"/);
  grammarSummaries.push({
    name: "experience-observed-high-dense",
    intent: observedVisualVariant.intent,
    headingDensity: observedVisualVariant.headingDensity,
    density: observedVisualVariant.typography.density,
    evidence: "SYNTHETIC_PLAN_PROJECTION",
  });

  const summaries = [];
  for (const input of cases) {
    const before = structuredClone(input);
    const { plan, generationInput, warnings } = buildContentLayoutPlan(input);
    assert.deepEqual(warnings, [], `${input.categoryId}: active fixture must not be filtered`);
    const draft = makeMockDraft(generationInput, plan);
    assert.deepEqual(input, before, `${input.categoryId}: raw request must stay immutable`);
    const layoutValidation = validateDraftAgainstContentLayoutPlan(draft, plan);
    assert.equal(layoutValidation.ok, true, `${input.categoryId}: mock output must implement the design plan: ${layoutValidation.reasons.join(" | ")}`);

    const cards = draft.sections.filter((section) => !["food-facts", "input-summary"].includes(section.id)
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
    grammarCases: grammarSummaries,
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
