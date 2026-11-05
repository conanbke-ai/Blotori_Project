import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalTs = Module._extensions[".ts"];
const originalTsx = Module._extensions[".tsx"];
const originalCss = Module._extensions[".css"];
const originalApiKey = process.env.OPENAI_API_KEY;
const originalMockMode = process.env.BLOTORI_MOCK_MODE;

function compile(filename, jsx = false) {
  return ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  }).outputText;
}

Module._extensions[".ts"] = (module, filename) => module._compile(compile(filename), filename);
Module._extensions[".tsx"] = (module, filename) => module._compile(compile(filename, true), filename);
Module._extensions[".css"] = (module) => { module.exports = {}; };

try {
  const { CATEGORY_DEFINITIONS } = require("../lib/domain/content-config.ts");
  const {
    buildContentLayoutPlan,
    CONTENT_LAYOUT_PLAN_INPUT_WARNING_PREFIX,
    validateDraftAgainstContentLayoutPlan,
  } = require("../lib/domain/content-layout-plan.ts");
  const { buildPrompt } = require("../lib/application/build-prompt.ts");
  const {
    applyContentLayoutPlanToGeneratedDraft,
    generateBlogDraft,
  } = require("../lib/application/generate-blog-draft.ts");
  const { makeMockDraft } = require("../lib/infrastructure/mock-content-adapter.ts");
  const { buildPlatformExport } = require("../lib/application/platform-exporter.ts");
  const { readLayoutPlanStatus } = require("../app/LayoutPlanStatus.tsx");

  const purposeFields = ["goal", "learningGoal", "visitPurpose"];
  const selectionStates = CATEGORY_DEFINITIONS.flatMap((category) => [
    { categoryId: category.id, presetId: "", fieldIds: category.defaultFieldIds },
    ...category.presets.map((preset) => ({ categoryId: category.id, presetId: preset.id, fieldIds: preset.fieldIds })),
  ]);
  const purposeCounts = selectionStates.map((state) => purposeFields.filter((field) => state.fieldIds.includes(field)));
  assert.equal(CATEGORY_DEFINITIONS.length, 20);
  assert.equal(CATEGORY_DEFINITIONS.reduce((count, category) => count + category.presets.length, 0), 15);
  assert.equal(selectionStates.length, 35);
  assert.equal(purposeCounts.filter((fields) => fields.length === 0).length, 23);
  assert.equal(purposeCounts.filter((fields) => fields.length === 1).length, 12);
  assert.equal(purposeCounts.filter((fields) => fields.length > 1).length, 0);
  assert.deepEqual(Object.fromEntries(purposeFields.map((field) => [field, purposeCounts.filter((fields) => fields.includes(field)).length])), {
    goal: 8,
    learningGoal: 3,
    visitPurpose: 1,
  });
  const generationFixtures = CATEGORY_DEFINITIONS.flatMap((category) => category.presets.length > 0
    ? category.presets.map((preset) => ({ categoryId: category.id, presetId: preset.id, fieldIds: preset.fieldIds }))
    : [{ categoryId: category.id, presetId: "", fieldIds: category.defaultFieldIds }]);
  const knownNonPurposeFields = [...new Set(selectionStates.flatMap((state) => state.fieldIds))]
    .filter((field) => !purposeFields.includes(field));
  assert.equal(generationFixtures.length, 28, "every selectable preset and every presetless category needs a synthetic admission fixture");
  assert.equal(generationFixtures.reduce((count, fixture) => count + fixture.fieldIds.length, 0), 111);

  const baseInput = {
    platformId: "naver",
    categoryId: "health",
    presetId: "treatment-education",
    freeTopic: "  초보자를 위한 C++ 입문 — 1단계  ",
    attributes: { audience: "초보자", goal: "정보 가이드" },
    styleId: "friendly-info",
    styleIntensity: 3,
    structureId: "auto",
    length: "medium",
    imageCount: 4,
  };
  const inputBefore = structuredClone(baseInput);
  const first = buildContentLayoutPlan(baseInput);
  const second = buildContentLayoutPlan(baseInput);
  assert.deepEqual(baseInput, inputBefore, "plan derivation must not mutate raw selection");
  assert.deepEqual(first, second, "same raw selection must produce the same derived plan");
  assert.equal(first.plan.source.freeTopic, baseInput.freeTopic, "freeTopic provenance must preserve exact raw text");
  assert.equal(first.plan.source.purposeField, "goal");
  assert.equal(first.plan.source.purposeValue, baseInput.attributes.goal);
  assert.deepEqual(first.plan.source.excludedPurposeFields, []);
  assert.equal(first.generationInput.attributes.audience, undefined);
  assert.ok(first.warnings.some((warning) => warning.includes("사용하지 않는 상세 입력")));
  assert.equal(first.plan.intent, "information");

  const emptyPurpose = buildContentLayoutPlan({ ...baseInput, attributes: { audience: "초보자", goal: "   " } });
  assert.equal(emptyPurpose.plan.source.purposeField, null, "an active schema field is not evidence until a nonblank value is supplied");
  assert.equal(emptyPurpose.plan.source.purposeValue, "");
  assert.equal(emptyPurpose.generationInput.attributes.goal, undefined);

  const education = buildContentLayoutPlan({
    ...baseInput,
    categoryId: "education",
    presetId: "concept-summary",
    attributes: { learningGoal: "개념을 이해하는 방법" },
  });
  assert.equal(education.plan.source.purposeField, "learningGoal");
  assert.equal(education.plan.source.purposeValue, "개념을 이해하는 방법");

  const restaurant = buildContentLayoutPlan({
    ...baseInput,
    categoryId: "food",
    presetId: "restaurant-review",
    attributes: { visitPurpose: "친구와 방문 경험" },
  });
  assert.equal(restaurant.plan.source.purposeField, "visitPurpose");
  assert.equal(restaurant.plan.intent, "experience");
  assert.equal(restaurant.plan.sections.some((section) => section.id === "food-facts"), true);
  assert.equal(restaurant.plan.factPlan?.scope, "food-review");
  assert.equal(restaurant.plan.factPlan?.facts.find((fact) => fact.key === "visitPurpose")?.value, "친구와 방문 경험");

  const stalePurposeInput = {
    ...baseInput,
    categoryId: "food",
    presetId: "food-introduction",
    attributes: { menu: "샘플 메뉴", visitPurpose: "이전 preset의 숨은 값" },
  };
  const staleBefore = structuredClone(stalePurposeInput);
  const stale = buildContentLayoutPlan(stalePurposeInput);
  assert.deepEqual(stalePurposeInput, staleBefore);
  assert.equal(stale.generationInput.attributes.visitPurpose, undefined);
  assert.equal(stale.plan.source.purposeField, null);
  assert.deepEqual(stale.plan.source.excludedPurposeFields, ["visitPurpose"]);
  assert.match(stale.warnings[0], /사용하지 않는 목적 필드/);
  assert.doesNotMatch(stale.warnings[0], /이전 preset의 숨은 값/, "warning must not repeat raw purpose text");
  assert.doesNotMatch(buildPrompt(stale.generationInput, stale.plan), /이전 preset의 숨은 값/);

  const directRequest = buildContentLayoutPlan({
    ...baseInput,
    attributes: { goal: "정보 정리", learningGoal: "숨은 교육 목표", visitPurpose: "숨은 방문 목적" },
  });
  assert.equal(directRequest.generationInput.attributes.goal, "정보 정리");
  assert.equal(directRequest.generationInput.attributes.learningGoal, undefined);
  assert.equal(directRequest.generationInput.attributes.visitPurpose, undefined);
  assert.deepEqual(directRequest.plan.source.excludedPurposeFields, ["learningGoal", "visitPurpose"]);
  assert.equal(directRequest.warnings.length, 1);

  let retainedActiveFields = 0;
  let rejectedInactiveFields = 0;
  for (const fixture of generationFixtures) {
    const attributes = Object.fromEntries(fixture.fieldIds.map((field) => [field, `VALID_${fixture.categoryId}_${fixture.presetId || "default"}_${field}`]));
    const rawInput = {
      ...baseInput,
      categoryId: fixture.categoryId,
      presetId: fixture.presetId,
      attributes,
    };
    const rawBefore = structuredClone(rawInput);
    const admitted = buildContentLayoutPlan(rawInput);
    assert.deepEqual(rawInput, rawBefore, `${fixture.categoryId}/${fixture.presetId || "default"} raw input must remain immutable`);
    for (const field of fixture.fieldIds) {
      assert.equal(admitted.generationInput.attributes[field], attributes[field], `${fixture.categoryId}/${fixture.presetId || "default"} must retain ${field}`);
      retainedActiveFields += 1;
    }

    const inactiveField = knownNonPurposeFields.find((field) => !fixture.fieldIds.includes(field));
    assert.ok(inactiveField, `${fixture.categoryId}/${fixture.presetId || "default"} requires a known inactive field fixture`);
    const leakSentinel = `INACTIVE_LEAK_${fixture.categoryId}_${fixture.presetId || "default"}`;
    const injectedInput = {
      ...rawInput,
      attributes: { ...attributes, [inactiveField]: leakSentinel },
    };
    const injectedBefore = structuredClone(injectedInput);
    const filtered = buildContentLayoutPlan(injectedInput);
    assert.deepEqual(injectedInput, injectedBefore, "inactive filtering must not mutate raw input");
    assert.equal(filtered.generationInput.attributes[inactiveField], undefined, `${fixture.categoryId}/${fixture.presetId || "default"} must reject ${inactiveField}`);
    assert.ok(filtered.warnings.some((warning) => warning.includes("사용하지 않는 상세 입력")));
    assert.ok(filtered.warnings.some((warning) => warning.startsWith(CONTENT_LAYOUT_PLAN_INPUT_WARNING_PREFIX)));
    assert.ok(filtered.warnings.some((warning) => warning.includes(inactiveField)));
    assert.doesNotMatch(filtered.warnings.join("\n"), new RegExp(leakSentinel), "warnings must not repeat rejected values");

    const filteredPrompt = buildPrompt(filtered.generationInput, filtered.plan);
    const filteredProviderDraft = makeMockDraft(filtered.generationInput, filtered.plan);
    const filteredDraft = applyContentLayoutPlanToGeneratedDraft(
      filteredProviderDraft,
      injectedInput.imageCount,
      filtered.plan,
      filtered.warnings,
    );
    const filteredExport = buildPlatformExport(filteredDraft, "naver");
    assert.doesNotMatch(filteredPrompt, new RegExp(leakSentinel), "inactive value must not leak into prompt");
    assert.doesNotMatch(JSON.stringify(filteredDraft), new RegExp(leakSentinel), "inactive value must not leak into mock draft");
    assert.doesNotMatch(JSON.stringify(filteredExport), new RegExp(leakSentinel), "inactive value must not leak into export");
    rejectedInactiveFields += 1;
  }
  assert.equal(retainedActiveFields, 111);
  assert.equal(rejectedInactiveFields, 28);

  const foodAttributes = {
    place: "합성 식당",
    menu: "합성 메뉴",
    visitPurpose: "합성 방문 목적",
    priceRange: "합성 가격대",
    tastePoint: "합성 맛 특징",
  };
  const cleanFood = buildContentLayoutPlan({
    ...baseInput,
    categoryId: "food",
    presetId: "restaurant-review",
    attributes: foodAttributes,
  });
  const injectedFood = buildContentLayoutPlan({
    ...baseInput,
    categoryId: "food",
    presetId: "restaurant-review",
    attributes: { ...foodAttributes, symptom: "INACTIVE_FOOD_LEAK" },
  });
  assert.deepEqual(injectedFood.plan.factPlan, cleanFood.plan.factPlan, "inactive filtering must not change admitted food fact provenance");
  assert.equal(injectedFood.generationInput.attributes.symptom, undefined);

  const freeCategory = buildContentLayoutPlan({
    ...baseInput,
    categoryId: "free",
    presetId: "",
    attributes: { audience: "합성 독자", situation: "합성 상황", keywords: "합성 키워드", menu: "FREE_CATEGORY_LEAK" },
  });
  assert.deepEqual(freeCategory.generationInput.attributes, {
    audience: "합성 독자",
    situation: "합성 상황",
    keywords: "합성 키워드",
  });

  const unknownCategory = buildContentLayoutPlan({
    ...baseInput,
    categoryId: "unknown-category",
    presetId: "",
    attributes: { audience: "UNKNOWN_CATEGORY_LEAK" },
  });
  assert.deepEqual(unknownCategory.generationInput.attributes, {}, "unknown categories must fail closed rather than infer a schema");
  assert.ok(unknownCategory.warnings.some((warning) => warning.includes("카테고리를 확인할 수 없어")));

  const mismatchedPreset = buildContentLayoutPlan({
    ...baseInput,
    categoryId: "health",
    presetId: "restaurant-review",
    attributes: { audience: "MISMATCHED_PRESET_LEAK", goal: "MISMATCHED_PURPOSE_LEAK" },
  });
  assert.deepEqual(mismatchedPreset.generationInput.attributes, {}, "a nonempty mismatched preset must fail closed rather than use category defaults");
  assert.ok(mismatchedPreset.warnings.some((warning) => warning.includes("주제 구성을 현재 카테고리에서 확인할 수 없어")));
  assert.doesNotMatch(buildPrompt(mismatchedPreset.generationInput, mismatchedPreset.plan), /MISMATCHED_(?:PRESET|PURPOSE)_LEAK/);

  const hostileUnknownKey = `unknown\nPRIVATE_KEY_${"x".repeat(256)}`;
  const malformedAttributes = buildContentLayoutPlan({
    ...baseInput,
    attributes: { goal: "합성 목적", [hostileUnknownKey]: "UNKNOWN_KEY_VALUE_LEAK", audience: 123 },
  });
  assert.deepEqual(malformedAttributes.generationInput.attributes, { goal: "합성 목적" });
  assert.ok(malformedAttributes.warnings.some((warning) => warning.includes("알 수 없는 상세 입력 1개")));
  assert.ok(malformedAttributes.warnings.some((warning) => warning.includes("문자열이 아닌 상세 입력 1개")));
  assert.doesNotMatch(malformedAttributes.warnings.join("\n"), /PRIVATE_KEY_|UNKNOWN_KEY_VALUE_LEAK/,
    "unknown keys and rejected values must not be copied into persisted warnings");
  assert.doesNotMatch(buildPrompt(malformedAttributes.generationInput, malformedAttributes.plan), /PRIVATE_KEY_|UNKNOWN_KEY_VALUE_LEAK|123/);

  const numericPurpose = buildContentLayoutPlan({ ...baseInput, attributes: { goal: 123 } });
  assert.deepEqual(numericPurpose.generationInput.attributes, {});
  assert.equal(numericPurpose.plan.source.purposeField, null);
  assert.ok(numericPurpose.warnings.some((warning) => warning.includes("문자열이 아닌 상세 입력 1개")));

  const numericFoodFact = buildContentLayoutPlan({
    ...baseInput,
    categoryId: "food",
    presetId: "restaurant-review",
    attributes: { ...foodAttributes, place: 123 },
  });
  assert.equal(numericFoodFact.generationInput.attributes.place, undefined);
  assert.equal(numericFoodFact.plan.factPlan?.facts.find((fact) => fact.key === "place")?.status, "UNKNOWN");
  assert.ok(numericFoodFact.warnings.some((warning) => warning.includes("문자열이 아닌 상세 입력 1개")));

  const prompt = buildPrompt(first.generationInput, first.plan);
  for (const section of first.plan.sections) {
    assert.match(prompt, new RegExp(`id=${section.id}`));
    assert.ok(prompt.includes(`소제목=${section.heading}`));
  }
  assert.match(prompt, /각 id와 소제목은 철자까지 그대로 사용/);

  const providerDraft = makeMockDraft(first.generationInput, first.plan);
  const providerBefore = structuredClone(providerDraft);
  assert.equal(validateDraftAgainstContentLayoutPlan(providerDraft, first.plan).ok, true);
  const plannedDraft = applyContentLayoutPlanToGeneratedDraft(providerDraft, baseInput.imageCount, first.plan, first.warnings);
  assert.deepEqual(providerDraft, providerBefore, "plan application must not mutate provider evidence");
  assert.equal(plannedDraft.contentLayoutPlan, first.plan);
  assert.equal(readLayoutPlanStatus(plannedDraft.contentLayoutPlan).kind, "planned");

  const glossaryDraft = {
    ...providerDraft,
    sections: [...providerDraft.sections, { id: "glossary", heading: "용어해설", paragraphs: ["합성 용어"], presentation: { visualStyle: "glossary" } }],
  };
  assert.equal(validateDraftAgainstContentLayoutPlan(glossaryDraft, first.plan).ok, true, "glossary section is outside editable plan ordering");

  const mismatches = [
    { ...providerDraft, sections: providerDraft.sections.slice(1) },
    { ...providerDraft, sections: providerDraft.sections.map((section, index) => index === 1 ? { ...section, id: providerDraft.sections[0].id } : section) },
    { ...providerDraft, sections: [...providerDraft.sections, { id: "extra", heading: "추가", paragraphs: ["합성"] }] },
    { ...providerDraft, sections: [providerDraft.sections[1], providerDraft.sections[0], ...providerDraft.sections.slice(2)] },
    { ...providerDraft, sections: providerDraft.sections.map((section, index) => index === 0 ? { ...section, heading: `${section.heading} 변경` } : section) },
    { ...providerDraft, images: providerDraft.images.map((image, index) => index === 1 ? { ...image, afterSectionId: "wrong" } : image) },
    { ...providerDraft, images: providerDraft.images.slice(0, -1) },
    { ...providerDraft, images: providerDraft.images.map((image, index) => index === 1 ? { ...image, role: "CAUTION" } : image) },
    { ...providerDraft, images: [...providerDraft.images, { ...providerDraft.images.at(-1), id: "EXTRA-IMAGE" }] },
    { ...providerDraft, images: [providerDraft.images[1], providerDraft.images[0], ...providerDraft.images.slice(2)] },
  ];
  for (const mismatch of mismatches) {
    const before = structuredClone(mismatch);
    const validation = validateDraftAgainstContentLayoutPlan(mismatch, first.plan);
    assert.equal(validation.ok, false);
    const unapplied = applyContentLayoutPlanToGeneratedDraft(mismatch, baseInput.imageCount, first.plan);
    assert.equal(unapplied.contentLayoutPlan, undefined);
    assert.ok(unapplied.warnings.some((warning) => warning.startsWith("편집 표현 계획 불일치:")));
    assert.deepEqual(mismatch, before, "mismatch handling must not repair or mutate provider evidence");
  }

  const planless = { ...plannedDraft, contentLayoutPlan: undefined };
  assert.equal(readLayoutPlanStatus(planless.contentLayoutPlan).kind, "legacy");
  const exportBefore = structuredClone(plannedDraft);
  assert.deepEqual(buildPlatformExport(plannedDraft, "naver"), buildPlatformExport(planless, "naver"), "plan metadata must not change export projection");
  assert.deepEqual(plannedDraft, exportBefore, "export must not mutate the planned draft or provenance");
  assert.equal(plannedDraft.contentLayoutPlan, first.plan, "export must not mutate plan provenance");

  let apiCalls = 0;
  process.env.OPENAI_API_KEY = "synthetic-fixture-only";
  delete process.env.BLOTORI_MOCK_MODE;
  const apiResult = await generateBlogDraft(baseInput, {
    mock: () => { throw new Error("mock provider must not run in API fixture"); },
    api: async (input, plan) => {
      apiCalls += 1;
      return makeMockDraft(input, plan);
    },
  });
  assert.equal(apiCalls, 1, "one article must keep one provider generation call");
  assert.equal(apiResult.mode, "api");
  assert.equal(readLayoutPlanStatus(apiResult.draft.contentLayoutPlan).kind, "planned");

  let mismatchApiCalls = 0;
  const mismatchResult = await generateBlogDraft(baseInput, {
    mock: () => { throw new Error("mock provider must not run in mismatch API fixture"); },
    api: async (input, plan) => {
      mismatchApiCalls += 1;
      const draft = makeMockDraft(input, plan);
      return { ...draft, images: [...draft.images, { ...draft.images.at(-1), id: "EXTRA-IMAGE" }] };
    },
  });
  assert.equal(mismatchApiCalls, 1, "mismatched output must not trigger a retry");
  assert.equal(mismatchResult.draft.contentLayoutPlan, undefined);
  assert.ok(mismatchResult.draft.warnings.some((warning) => warning.startsWith("편집 표현 계획 불일치:")));

  let staleApiCalls = 0;
  const staleResult = await generateBlogDraft(stalePurposeInput, {
    mock: () => { throw new Error("mock provider must not run in stale-purpose API fixture"); },
    api: async (input, plan) => {
      staleApiCalls += 1;
      assert.equal(input.attributes.visitPurpose, undefined);
      return makeMockDraft(input, plan);
    },
  });
  assert.equal(staleApiCalls, 1);
  assert.ok(staleResult.draft.warnings.some((warning) => /사용하지 않는 목적 필드/.test(warning)));
  assert.ok(staleResult.draft.warnings.some((warning) => warning.startsWith(CONTENT_LAYOUT_PLAN_INPUT_WARNING_PREFIX)));
  assert.doesNotMatch(JSON.stringify(staleResult.draft), /이전 preset의 숨은 값/);

  let mockCalls = 0;
  delete process.env.OPENAI_API_KEY;
  process.env.BLOTORI_MOCK_MODE = "true";
  const mockResult = await generateBlogDraft(baseInput, {
    mock: (input, plan) => {
      mockCalls += 1;
      return makeMockDraft(input, plan);
    },
    api: async () => { throw new Error("API provider must not run in mock fixture"); },
  });
  assert.equal(mockCalls, 1);
  assert.equal(mockResult.mode, "mock");
  assert.equal(readLayoutPlanStatus(mockResult.draft.contentLayoutPlan).kind, "planned");
  assert.deepEqual(baseInput, inputBefore, "full generation must leave the raw request unchanged");

  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /warning\.startsWith\(CONTENT_LAYOUT_PLAN_INPUT_WARNING_PREFIX\)/,
    "generation completion must route admission warnings to the QA tab");
  assert.match(pageSource, /inputAdmissionWarning \? "input-adjusted"/,
    "generation completion must expose an input-adjusted live status");
  assert.match(pageSource, /setInspectorTab\("qa"\)/,
    "warning completion must select the QA tab");

  console.log("Content layout plan generation QA PASS: 20 categories/15 presets/35 selection states; 28 generation fixtures retained 111/111 active fields and rejected 28/28 injected inactive fields before prompt/mock/export; unknown category and mismatched preset fail closed; raw freeTopic preserved; purpose admission and exclusion recorded; deterministic plan→prompt→mock/API ID contract; mismatch left unapplied without mutation or retry; legacy and export projections unchanged. Fixtures are SYNTHETIC; no provider, Naver, external service, or user data used.");
} finally {
  if (originalTs) Module._extensions[".ts"] = originalTs; else delete Module._extensions[".ts"];
  if (originalTsx) Module._extensions[".tsx"] = originalTsx; else delete Module._extensions[".tsx"];
  if (originalCss) Module._extensions[".css"] = originalCss; else delete Module._extensions[".css"];
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalApiKey;
  if (originalMockMode === undefined) delete process.env.BLOTORI_MOCK_MODE; else process.env.BLOTORI_MOCK_MODE = originalMockMode;
}
