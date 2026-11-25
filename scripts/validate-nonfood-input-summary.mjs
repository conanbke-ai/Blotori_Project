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

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

Module._extensions[".ts"] = (module, filename) => module._compile(compile(filename), filename);

try {
  const { CATEGORY_DEFINITIONS, FIELD_DEFINITIONS } = require("../lib/domain/content-config.ts");
  const { buildContentLayoutPlan, validateDraftAgainstContentLayoutPlan } = require("../lib/domain/content-layout-plan.ts");
  const {
    CATEGORY_INPUT_SUMMARY_SECTION_ID,
    formatCategoryInputSummaryRows,
    projectCategoryInputSummary,
    validateInputSummaryAgainstGenerationInput,
  } = require("../lib/domain/category-input-summary.ts");
  const { buildPrompt } = require("../lib/application/build-prompt.ts");
  const { applyContentLayoutPlanToGeneratedDraft } = require("../lib/application/generate-blog-draft.ts");
  const { makeMockDraft } = require("../lib/infrastructure/mock-content-adapter.ts");
  const { buildPlatformExport } = require("../lib/application/platform-exporter.ts");

  const nonFoodCategories = CATEGORY_DEFINITIONS.filter((category) => category.id !== "food");
  const states = nonFoodCategories.flatMap((category) => category.presets.length > 0
    ? category.presets.map((preset) => ({ category, presetId: preset.id, fieldIds: preset.fieldIds }))
    : [{ category, presetId: "", fieldIds: category.defaultFieldIds }]);
  assert.equal(nonFoodCategories.length, 19);
  assert.equal(states.length, 26);
  assert.equal(states.reduce((count, state) => count + state.fieldIds.length, 0), 101);

  const knownFieldIds = Object.keys(FIELD_DEFINITIONS);
  let projectedSlots = 0;
  let exportedRows = 0;
  for (const [stateIndex, state] of states.entries()) {
    const stateName = `${state.category.id}/${state.presetId || "default"}`;
    const attributes = Object.fromEntries(state.fieldIds.map((fieldId, index) => [fieldId, `USER_${stateIndex}_${index}_${fieldId}`]));
    const rawInput = {
      platformId: "naver",
      categoryId: state.category.id,
      presetId: state.presetId,
      freeTopic: `합성 주제 ${stateIndex}`,
      attributes,
      styleId: "friendly-info",
      styleIntensity: 3,
      structureId: "information",
      length: "medium",
      imageCount: 3,
    };
    const rawBefore = structuredClone(rawInput);
    const { plan, generationInput, warnings } = buildContentLayoutPlan(rawInput);
    assert.deepEqual(rawInput, rawBefore, `${stateName}: raw input changed`);
    assert.deepEqual(warnings, [], `${stateName}: active supplied values must be admitted`);
    const items = projectCategoryInputSummary(generationInput);
    const rows = formatCategoryInputSummaryRows(generationInput);
    projectedSlots += items.length;
    assert.deepEqual(items.map((item) => item.fieldId), state.fieldIds, `${stateName}: configured order changed`);
    assert.deepEqual(items.map((item) => item.value), state.fieldIds.map((fieldId) => attributes[fieldId]));
    const planned = plan.sections.find((section) => section.id === CATEGORY_INPUT_SUMMARY_SECTION_ID);
    assert.ok(planned, `${stateName}: input-summary plan missing`);
    assert.equal(planned.visualStyle, "key-point");
    assert.deepEqual(planned.optionalFactKeys, state.fieldIds);
    assert.deepEqual(planned.paragraphRange, [state.fieldIds.length, state.fieldIds.length]);

    const prompt = buildPrompt(generationInput, plan);
    assert.match(prompt, /INPUT SUMMARY - EXACT USER INPUT/);
    const providerDraft = makeMockDraft(generationInput, plan);
    const summary = providerDraft.sections.find((section) => section.id === CATEGORY_INPUT_SUMMARY_SECTION_ID);
    assert.deepEqual(summary?.paragraphs, rows, `${stateName}: mock rows must be exact`);
    assert.deepEqual(validateInputSummaryAgainstGenerationInput(providerDraft, generationInput, plan), []);
    assert.equal(validateDraftAgainstContentLayoutPlan(providerDraft, plan).ok, true);
    const canonical = applyContentLayoutPlanToGeneratedDraft(providerDraft, rawInput.imageCount, plan, warnings, generationInput);
    assert.ok(canonical.contentLayoutPlan, `${stateName}: valid summary must attach the plan`);
    for (const row of rows) {
      assert.equal(providerDraft.sections.flatMap((section) => section.paragraphs).filter((paragraph) => paragraph === row).length, 1);
      for (const platformId of ["naver", "wordpress"]) {
        const exported = buildPlatformExport(canonical, platformId);
        assert.equal(occurrences(exported.plainText, row), 1, `${stateName}/${platformId}: plain row count`);
        assert.equal(occurrences(exported.html, row), 1, `${stateName}/${platformId}: html row count`);
        exportedRows += 1;
      }
    }
    assert.deepEqual(rawInput, rawBefore, `${stateName}: mock/export changed raw input`);

    const missing = structuredClone(rawInput);
    missing.attributes = { [state.fieldIds[0]]: "   " };
    const inactiveField = knownFieldIds.find((fieldId) => !state.fieldIds.includes(fieldId));
    missing.attributes[inactiveField] = `INACTIVE_${stateIndex}`;
    missing.attributes[`unknown_${stateIndex}`] = `UNKNOWN_${stateIndex}`;
    missing.attributes[state.fieldIds.at(-1)] = 42;
    const filtered = buildContentLayoutPlan(missing);
    assert.deepEqual(projectCategoryInputSummary(filtered.generationInput), []);
    assert.equal(filtered.plan.sections.some((section) => section.id === CATEGORY_INPUT_SUMMARY_SECTION_ID), false);
    const filteredPrompt = buildPrompt(filtered.generationInput, filtered.plan);
    const filteredDraft = makeMockDraft(filtered.generationInput, filtered.plan);
    const filteredExport = buildPlatformExport(filteredDraft, "naver");
    assert.doesNotMatch(filteredPrompt, new RegExp(`INACTIVE_${stateIndex}|UNKNOWN_${stateIndex}`));
    assert.doesNotMatch(JSON.stringify(filteredDraft), new RegExp(`INACTIVE_${stateIndex}|UNKNOWN_${stateIndex}`));
    assert.doesNotMatch(JSON.stringify(filteredExport), new RegExp(`INACTIVE_${stateIndex}|UNKNOWN_${stateIndex}`));
  }
  assert.equal(projectedSlots, 101);

  for (const presetId of ["restaurant-review", "food-introduction"]) {
    const food = buildContentLayoutPlan({
      platformId: "naver",
      categoryId: "food",
      presetId,
      freeTopic: "음식 경계 합성",
      attributes: { place: "입력 장소", menu: "입력 메뉴", tastePoint: "입력 맛" },
      styleId: "honest-review",
      styleIntensity: 3,
      structureId: "review",
      length: "medium",
      imageCount: 2,
    });
    assert.deepEqual(projectCategoryInputSummary(food.generationInput), []);
    assert.equal(food.plan.sections.some((section) => section.id === CATEGORY_INPUT_SUMMARY_SECTION_ID), false);
    assert.equal(Boolean(food.plan.factPlan), presetId === "restaurant-review");
  }

  const grammarStyles = [
    { styleIntensity: 1, styleId: "honest-review", structureId: "review", intent: "experience" },
    { styleIntensity: 3, styleId: "friendly-info", structureId: "information", intent: "information" },
    { styleIntensity: 5, styleId: "shareable-info", structureId: "comparison", intent: "curation" },
  ];
  for (const grammar of grammarStyles) {
    const built = buildContentLayoutPlan({
      platformId: "wordpress",
      categoryId: "review",
      presetId: "product-review",
      freeTopic: "문법 합성",
      attributes: { productName: "사용자 제품", usagePeriod: "사용자 기간" },
      ...grammar,
      length: "medium",
      imageCount: 3,
    });
    assert.equal(built.plan.intent, grammar.intent);
    const draft = makeMockDraft(built.generationInput, built.plan);
    assert.equal(draft.sections.find((section) => section.id === CATEGORY_INPUT_SUMMARY_SECTION_ID)?.presentation?.visualStyle, "key-point");
    assert.deepEqual(validateInputSummaryAgainstGenerationInput(draft, built.generationInput, built.plan), []);
    assert.equal(validateDraftAgainstContentLayoutPlan(draft, built.plan).ok, true);
  }

  const mismatchBase = buildContentLayoutPlan({
    platformId: "naver", categoryId: "travel", presetId: "destination-guide", freeTopic: "불일치 합성",
    attributes: { destination: "사용자 목적지" }, styleId: "friendly-info", styleIntensity: 3,
    structureId: "guide", length: "short", imageCount: 1,
  });
  const [mismatchRow] = formatCategoryInputSummaryRows(mismatchBase.generationInput);
  const [mismatchItem] = projectCategoryInputSummary(mismatchBase.generationInput);
  assert.ok(mismatchRow && mismatchItem, "mismatch fixture requires one admitted summary row");

  const narrativeDuplicateDraft = makeMockDraft(mismatchBase.generationInput, mismatchBase.plan);
  const narrativeDuplicateSection = narrativeDuplicateDraft.sections.find((section) => (
    section.id !== CATEGORY_INPUT_SUMMARY_SECTION_ID && section.paragraphs.length > 0
  ));
  assert.ok(narrativeDuplicateSection, "mismatch fixture requires a narrative paragraph");
  narrativeDuplicateSection.paragraphs[0] = `${narrativeDuplicateSection.paragraphs[0]} ${mismatchRow}`;
  const narrativeDuplicateRejected = applyContentLayoutPlanToGeneratedDraft(
    narrativeDuplicateDraft, 1, mismatchBase.plan, [], mismatchBase.generationInput,
  );
  assert.equal(narrativeDuplicateRejected.contentLayoutPlan, undefined, "a summary row embedded in narrative must fail closed");
  assert.ok(narrativeDuplicateRejected.warnings.some((warning) => warning.includes("input summary")));

  const sameParagraphDuplicateDraft = makeMockDraft(mismatchBase.generationInput, mismatchBase.plan);
  const sameParagraphDuplicateSection = sameParagraphDuplicateDraft.sections.find((section) => (
    section.id !== CATEGORY_INPUT_SUMMARY_SECTION_ID && section.paragraphs.length > 0
  ));
  assert.ok(sameParagraphDuplicateSection, "duplicate fixture requires a narrative paragraph");
  sameParagraphDuplicateSection.paragraphs[0] = `${sameParagraphDuplicateSection.paragraphs[0]} ${mismatchRow} / ${mismatchRow}`;
  const sameParagraphDuplicateRejected = applyContentLayoutPlanToGeneratedDraft(
    sameParagraphDuplicateDraft, 1, mismatchBase.plan, [], mismatchBase.generationInput,
  );
  assert.equal(sameParagraphDuplicateRejected.contentLayoutPlan, undefined, "two summary rows in one paragraph must fail closed");
  assert.ok(sameParagraphDuplicateRejected.warnings.some((warning) => warning.includes("input summary")));

  const valueOnlyNarrativeDraft = makeMockDraft(mismatchBase.generationInput, mismatchBase.plan);
  const valueOnlyNarrativeSection = valueOnlyNarrativeDraft.sections.find((section) => (
    section.id !== CATEGORY_INPUT_SUMMARY_SECTION_ID && section.paragraphs.length > 0
  ));
  assert.ok(valueOnlyNarrativeSection, "value-only fixture requires a narrative paragraph");
  valueOnlyNarrativeSection.paragraphs[0] = `${valueOnlyNarrativeSection.paragraphs[0]} ${mismatchItem.value}`;
  const valueOnlyAccepted = applyContentLayoutPlanToGeneratedDraft(
    valueOnlyNarrativeDraft, 1, mismatchBase.plan, [], mismatchBase.generationInput,
  );
  assert.ok(valueOnlyAccepted.contentLayoutPlan, "natural value-only narrative repetition must stay allowed");

  const nestedSummaryBase = buildContentLayoutPlan({
    platformId: "naver", categoryId: "finance", presetId: "", freeTopic: "nested summary fixture",
    attributes: {
      audience: "BEGINNER_NESTED",
      goal: `${FIELD_DEFINITIONS.audience.label}: BEGINNER_NESTED`,
    },
    styleId: "friendly-info", styleIntensity: 3,
    structureId: "information", length: "short", imageCount: 1,
  });
  const nestedRows = formatCategoryInputSummaryRows(nestedSummaryBase.generationInput);
  assert.equal(nestedRows.length, 2, "nested fixture requires two admitted summary rows");
  assert.ok(nestedRows[1].includes(nestedRows[0]), "nested fixture must contain the first full row inside the second row");
  const nestedSummaryDraft = makeMockDraft(nestedSummaryBase.generationInput, nestedSummaryBase.plan);
  assert.deepEqual(
    nestedSummaryDraft.sections.find((section) => section.id === CATEGORY_INPUT_SUMMARY_SECTION_ID)?.paragraphs,
    nestedRows,
    "nested summary rows must preserve exact configured order",
  );
  const nestedSummaryAccepted = applyContentLayoutPlanToGeneratedDraft(
    nestedSummaryDraft, 1, nestedSummaryBase.plan, [], nestedSummaryBase.generationInput,
  );
  assert.ok(nestedSummaryAccepted.contentLayoutPlan, "nested full-row text inside another valid summary row must stay allowed");

  const anchoredSummaryPlan = structuredClone(mismatchBase.plan);
  anchoredSummaryPlan.imageAnchors[0].afterSectionId = CATEGORY_INPUT_SUMMARY_SECTION_ID;
  const anchoredSummaryDraft = makeMockDraft(mismatchBase.generationInput, anchoredSummaryPlan);
  const anchoredSummaryValidation = validateDraftAgainstContentLayoutPlan(anchoredSummaryDraft, anchoredSummaryPlan);
  assert.equal(anchoredSummaryValidation.ok, false, "a stored or tampered plan cannot anchor an image to input-summary");
  assert.ok(anchoredSummaryValidation.reasons.some((reason) => reason.includes("protected fixed-information section")));

  const mismatchedDraft = makeMockDraft(mismatchBase.generationInput, mismatchBase.plan);
  mismatchedDraft.sections.find((section) => section.id === CATEGORY_INPUT_SUMMARY_SECTION_ID).paragraphs[0] = "목적지: 추론된 장소";
  const rejected = applyContentLayoutPlanToGeneratedDraft(
    mismatchedDraft, 1, mismatchBase.plan, [], mismatchBase.generationInput,
  );
  assert.equal(rejected.contentLayoutPlan, undefined, "wrong summary rows must fail closed to the existing plan-unapplied state");
  assert.ok(rejected.warnings.some((warning) => warning.includes("input summary")));

  const legacyPlan = structuredClone(mismatchBase.plan);
  legacyPlan.sections = legacyPlan.sections.filter((section) => section.id !== CATEGORY_INPUT_SUMMARY_SECTION_ID)
    .map((section, index) => ({ ...section, priority: index + 1 }));
  legacyPlan.imageAnchors = legacyPlan.imageAnchors.map((anchor) => anchor.afterSectionId === CATEGORY_INPUT_SUMMARY_SECTION_ID
    ? { ...anchor, afterSectionId: legacyPlan.sections[0]?.id ?? null }
    : anchor);
  const legacyDraft = makeMockDraft({ ...mismatchBase.generationInput, attributes: {} }, legacyPlan);
  assert.equal(validateDraftAgainstContentLayoutPlan(legacyDraft, legacyPlan).ok, true, "old saved plans without input-summary stay valid");

  console.log(`Non-food input summary PASS: 19 categories, 26 states, ${projectedSlots} admitted slots, ${exportedRows} row/platform export assertions; food boundary and legacy plans unchanged.`);
} finally {
  Module._extensions[".ts"] = originalTs;
}
