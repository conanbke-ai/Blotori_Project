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
  assert.deepEqual(first.warnings, []);
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
  assert.equal(restaurant.plan.sections.some((section) => section.id.startsWith("food-")), false, "food-specific sections are outside this candidate");

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
    assert.ok(unapplied.warnings.some((warning) => warning.startsWith("편집 계획 미적용:")));
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
  assert.ok(mismatchResult.draft.warnings.some((warning) => warning.startsWith("편집 계획 미적용:")));

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

  console.log("Content layout plan generation QA PASS: 20 categories/15 presets/35 selection states; raw freeTopic preserved; purpose admission and exclusion recorded; deterministic plan→prompt→mock/API ID contract; mismatch left unapplied without mutation or retry; legacy and export projections unchanged. Fixtures are SYNTHETIC; no provider or user data used.");
} finally {
  if (originalTs) Module._extensions[".ts"] = originalTs; else delete Module._extensions[".ts"];
  if (originalTsx) Module._extensions[".tsx"] = originalTsx; else delete Module._extensions[".tsx"];
  if (originalCss) Module._extensions[".css"] = originalCss; else delete Module._extensions[".css"];
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalApiKey;
  if (originalMockMode === undefined) delete process.env.BLOTORI_MOCK_MODE; else process.env.BLOTORI_MOCK_MODE = originalMockMode;
}
