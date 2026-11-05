// Synthetic, offline integration contract. Never calls OpenAI, Naver, or an external API.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalExtension = Module._extensions[".ts"];
const originalApiKey = process.env.OPENAI_API_KEY;
const originalMockMode = process.env.BLOTORI_MOCK_MODE;

Module._extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  fileName: filename,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
    resolveJsonModule: true,
  },
}).outputText, filename);

function occurrences(value, search) {
  return value.split(search).length - 1;
}

try {
  delete process.env.OPENAI_API_KEY;
  process.env.BLOTORI_MOCK_MODE = "true";

  const {
    buildContentLayoutPlan,
    contentLayoutPrompt,
    validateDraftAgainstContentLayoutPlan,
    validateDraftPresentationAgainstContentLayoutPlan,
  } = require("../lib/domain/content-layout-plan.ts");
  const { CATEGORY_DEFINITIONS } = require("../lib/domain/content-config.ts");
  const {
    foodReviewOutputLines,
    validFoodReviewFactPlan,
    validFoodReviewFacts,
    validateFoodReviewDraftFacts,
  } = require("../lib/domain/food-review.ts");
  const { buildPrompt } = require("../lib/application/build-prompt.ts");
  const { generateBlogDraft } = require("../lib/application/generate-blog-draft.ts");
  const { buildPlatformExport, canExportDraft } = require("../lib/application/platform-exporter.ts");
  const { makeMockDraft } = require("../lib/infrastructure/mock-content-adapter.ts");

  const input = {
    platformId: "naver",
    categoryId: "food",
    presetId: "restaurant-review",
    freeTopic: "합성 맛집 사실성 QA",
    attributes: {
      place: "  합성 식당 A  ",
      menu: "합성 메뉴 B",
      visitPurpose: "합성 가족 식사",
      priceRange: "합성 1인 가격대",
      tastePoint: "합성 담백함",
      hours: "오전 10시",
      address: "합성 도로 1",
      visit: "실제 방문",
    },
    styleId: "honest-review",
    styleIntensity: 3,
    structureId: "review",
    length: "medium",
    imageCount: 2,
  };
  const rawBefore = structuredClone(input);
  const { plan, generationInput } = buildContentLayoutPlan(input);
  const factPlan = plan.factPlan;
  assert.ok(factPlan);
  assert.equal(factPlan.scope, "food-review");
  assert.equal(validFoodReviewFactPlan(factPlan), true);
  assert.deepEqual(input, rawBefore, "plan resolution must not mutate the raw request");
  assert.equal(factPlan.facts.find((fact) => fact.key === "place").rawValue, "  합성 식당 A  ");
  assert.equal(factPlan.facts.find((fact) => fact.key === "place").value, "합성 식당 A");
  assert.deepEqual(factPlan.facts.filter((fact) => fact.status === "RAW_USER_INPUT").map((fact) => fact.key),
    ["place", "orderedMenu", "visitPurpose", "priceRange", "taste"]);
  assert.equal(factPlan.facts.some((fact) => fact.status === "USER_CONFIRMED"), false,
    "raw form values must not be silently promoted to confirmed facts");
  assert.deepEqual(factPlan.facts.filter((fact) => fact.status === "UNKNOWN").map((fact) => fact.key),
    ["visit", "hours", "address"]);
  assert.deepEqual(plan.missingFacts, ["방문 경험", "영업시간", "주소"]);
  assert.ok(plan.sections.some((section) => section.id === "food-facts" && section.heading === "방문 정보"));
  assert.equal(generationInput.attributes.hours, undefined);
  assert.equal(generationInput.attributes.address, undefined);
  assert.equal(generationInput.attributes.visit, undefined);
  assert.equal(generationInput.attributes.visitPurpose, "합성 가족 식사");

  const prompt = buildPrompt(generationInput, plan);
  for (const value of ["합성 식당 A", "합성 메뉴 B", "합성 가족 식사", "합성 1인 가격대", "합성 담백함"]) {
    assert.equal(occurrences(prompt, value), 1, `projected raw fact must appear exactly once: ${value}`);
  }
  assert.match(prompt, /visit=UNKNOWN/);
  assert.match(prompt, /hours=UNKNOWN/);
  assert.match(prompt, /address=UNKNOWN/);
  assert.doesNotMatch(prompt, /미확인\s*\)/);
  assert.doesNotMatch(prompt, /오전 10시|합성 도로 1|실제 방문/);

  let normalCalls = 0;
  const providers = {
    mock: (providerInput, providerPlan) => {
      normalCalls += 1;
      return makeMockDraft(providerInput, providerPlan);
    },
    api: async () => { throw new Error("synthetic fixture must not call the API provider"); },
  };
  const generated = await generateBlogDraft(input, providers);
  assert.equal(normalCalls, 1);
  assert.ok(generated.draft.contentLayoutPlan);
  const expectedLines = foodReviewOutputLines(factPlan);
  const factSection = generated.draft.sections.find((section) => section.id === "food-facts");
  assert.deepEqual(factSection?.paragraphs, expectedLines);
  assert.equal(factSection?.presentation?.visualStyle, "key-point");
  assert.ok(expectedLines.length >= 2 && expectedLines.length <= 4);
  assert.equal(expectedLines.some((line) => /미확인|사용자 입력|사용자 확인|외부 자료/.test(line)), false,
    "publication rows must not expose internal provenance or unknown placeholders");
  assert.equal(validateDraftAgainstContentLayoutPlan(generated.draft, plan).ok, true);

  const draftBeforeExport = structuredClone(generated.draft);
  const naverExport = buildPlatformExport(generated.draft, "naver");
  const wordpressExport = buildPlatformExport(generated.draft, "wordpress");
  for (const line of expectedLines) {
    assert.match(naverExport.plainText, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(wordpressExport.plainText, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(naverExport.html?.includes(line), `Naver rich export lost fact line: ${line}`);
    assert.ok(wordpressExport.html?.includes(line), `WordPress rich export lost fact line: ${line}`);
  }
  assert.doesNotMatch(naverExport.plainText, /사용자 입력·미검증|미확인/);
  assert.doesNotMatch(wordpressExport.html ?? "", /사용자 입력·미검증|미확인/);
  assert.deepEqual(generated.draft, draftBeforeExport, "platform export must not mutate the canonical draft");

  const presentationMismatch = structuredClone(generated.draft);
  const presentationSectionIndex = presentationMismatch.sections.findIndex((section) => section.id !== "food-facts");
  presentationMismatch.sections[presentationSectionIndex].presentation.visualStyle = "quote";
  assert.equal(validateDraftPresentationAgainstContentLayoutPlan(presentationMismatch, plan).ok, false);
  assert.doesNotThrow(() => buildPlatformExport(presentationMismatch, "naver"),
    "presentation mismatch must remain a QA warning instead of blocking fact-safe export");

  const editedFactMismatch = structuredClone(generated.draft);
  const editedFactSection = editedFactMismatch.sections.find((section) => section.id === "food-facts");
  editedFactSection.paragraphs[0] = "방문 경험: 다녀옴";
  editedFactMismatch.warnings = [];
  assert.throws(() => buildPlatformExport(editedFactMismatch, "naver"),
    "export must revalidate fact integrity after user edits even without a stale warning");

  const editedMetadataMismatch = structuredClone(generated.draft);
  editedMetadataMismatch.warnings = [];
  editedMetadataMismatch.tags.push("영업시간: 24시간");
  editedMetadataMismatch.images[0].prompt += " 주소: 합성로 1";
  assert.throws(() => buildPlatformExport(editedMetadataMismatch, "wordpress"),
    "export must revalidate unknown claims added to tags and image guidance");

  const overlappingTopicInput = {
    ...input,
    freeTopic: "Alpha Place review",
    attributes: { ...input.attributes, place: "Alpha Place" },
  };
  const overlappingBuild = buildContentLayoutPlan(overlappingTopicInput);
  const overlappingDraft = makeMockDraft(overlappingBuild.generationInput, overlappingBuild.plan);
  overlappingDraft.factIntegrityPlan = overlappingBuild.plan.factPlan;
  assert.equal(canExportDraft(overlappingDraft), true,
    "a fact value that overlaps freeTopic is valid narrative context, not a raw-value containment failure");

  const confinedInput = {
    ...input,
    freeTopic: "Weekend review",
    attributes: { ...input.attributes, place: "Alpha Place" },
  };
  const confinedBuild = buildContentLayoutPlan(confinedInput);
  const confinedDraft = makeMockDraft(confinedBuild.generationInput, confinedBuild.plan);
  const confinedFactSection = confinedDraft.sections.find((section) => section.id === "food-facts");
  assert.equal(confinedFactSection?.paragraphs.join(" ").replaceAll(/\s/g, "").includes("AlphaPlace"), true,
    "fact-bound place input must remain in the exact provenance section");
  const confinedGenericText = [
    confinedDraft.summary,
    ...confinedDraft.intro,
    ...confinedDraft.closing,
    ...confinedDraft.tags,
    ...confinedDraft.sections.filter((section) => section.id !== "food-facts").flatMap((section) => [
      ...section.paragraphs,
      ...(section.presentation?.emphasis?.map((emphasis) => emphasis.phrase) ?? []),
    ]),
    ...confinedDraft.images.map((image) => image.prompt),
  ].join(" ").replaceAll(/\s/g, "");
  assert.equal(confinedGenericText.includes("AlphaPlace"), false,
    "fact-bound place input must not feed generic narrative, emphasis, tags, or image prompts, including whitespace variants");

  const correctedWithStaleWarning = structuredClone(generated.draft);
  correctedWithStaleWarning.warnings.push("사실 무결성 차단: 이전 검수 결과");
  assert.equal(canExportDraft(correctedWithStaleWarning), true,
    "export-time fact revalidation must supersede a stale warning after correction");

  const missingInput = { ...input, attributes: { place: "", menu: "", visitPurpose: "", priceRange: "", tastePoint: "" } };
  const missingBuild = buildContentLayoutPlan(missingInput);
  const missingPlan = missingBuild.plan;
  const missingLines = foodReviewOutputLines(missingPlan.factPlan);
  assert.deepEqual(missingPlan.missingFacts, ["방문 경험", "장소", "실제 주문", "방문 목적", "가격대", "영업시간", "주소"]);
  assert.deepEqual(missingLines, []);
  assert.equal(missingPlan.sections.some((section) => section.id === "food-facts"), false,
    "an empty public fact card must not be rendered; unknowns belong in status UI only");
  const missingClaimDraft = makeMockDraft(missingBuild.generationInput, missingPlan);
  const missingClaimSectionIndex = missingClaimDraft.sections.findIndex((section) => section.id !== "food-facts");
  missingClaimDraft.sections[missingClaimSectionIndex] = {
    ...missingClaimDraft.sections[missingClaimSectionIndex],
    paragraphs: [...missingClaimDraft.sections[missingClaimSectionIndex].paragraphs,
      "식당은 합성 가게입니다.", "메뉴는 합성 국수입니다.", "맛은 담백합니다."],
  };
  const missingClaimReasons = validateDraftAgainstContentLayoutPlan(missingClaimDraft, missingPlan).reasons.join(" ");
  assert.match(missingClaimReasons, /장소/);
  assert.match(missingClaimReasons, /실제 주문/);
  assert.match(missingClaimReasons, /맛·식감 체감/);

  const englishUnknownClaims = makeMockDraft(missingBuild.generationInput, missingPlan);
  englishUnknownClaims.sections[0].paragraphs.push("Opening hours: 09:00 to 18:00", "Located at 1 Example Street");
  const englishUnknownReasons = validateDraftAgainstContentLayoutPlan(englishUnknownClaims, missingPlan).reasons.join(" ");
  assert.match(englishUnknownReasons, /영업시간/);
  assert.match(englishUnknownReasons, /주소/);
  const combinedEnglishClaim = makeMockDraft(missingBuild.generationInput, missingPlan);
  combinedEnglishClaim.sections[0].paragraphs.push("Open daily from dawn to dusk at 123 Example Street.");
  const combinedEnglishReasons = validateDraftAgainstContentLayoutPlan(combinedEnglishClaim, missingPlan).reasons.join(" ");
  assert.match(combinedEnglishReasons, /영업시간/);
  assert.match(combinedEnglishReasons, /주소/);

  assert.equal(validFoodReviewFacts({ price: { status: "USER_CONFIRMED", value: "10000", checkedAt: "2026-02-30" } }), false);
  assert.equal(validFoodReviewFacts({ hours: { status: "EXTERNAL_VERIFIED", value: "10-18", sourceUrl: "http://example.com", checkedAt: "2026-11-03" } }), true,
    "structural validity is separate from HTTPS admission");

  let conflictCalls = 0;
  const conflict = await generateBlogDraft(input, {
    mock: (providerInput, providerPlan) => {
      conflictCalls += 1;
      const draft = makeMockDraft(providerInput, providerPlan);
      return { ...draft, sections: draft.sections.map((section) => section.id === "food-facts"
        ? { ...section, paragraphs: section.paragraphs.map((line, index) => index === 1 ? "장소: 조작된 장소" : line) }
        : section) };
    },
    api: async () => { throw new Error("synthetic fixture must not call the API provider"); },
  });
  assert.equal(conflictCalls, 1);
  assert.equal(conflict.draft.contentLayoutPlan, undefined);
  assert.ok(conflict.draft.warnings.some((warning) => warning.includes("사실 무결성 차단")));
  assert.ok(conflict.draft.factIntegrityPlan, "fact plan must survive for export-time revalidation");
  assert.ok(conflict.draft.sections.some((section) => section.paragraphs.includes("장소: 조작된 장소")),
    "provider output must be preserved for QA instead of silently rewritten");
  assert.throws(() => buildPlatformExport(conflict.draft, "naver"), /검수 전 내보낼 수 없습니다/,
    "fact-plan mismatch drafts must not reach plain or rich export");

  let hallucinationCalls = 0;
  const hallucination = await generateBlogDraft(input, {
    mock: (providerInput, providerPlan) => {
      hallucinationCalls += 1;
      const draft = makeMockDraft(providerInput, providerPlan);
      return { ...draft, sections: draft.sections.map((section) => section.id === "food-facts" ? section
        : { ...section, paragraphs: [...section.paragraphs,
          "문을 여는 때는 아침부터 저녁까지입니다.", "합성구 골목에 자리합니다."] }) };
    },
    api: async () => { throw new Error("synthetic fixture must not call the API provider"); },
  });
  assert.equal(hallucinationCalls, 1);
  assert.equal(hallucination.draft.contentLayoutPlan, undefined);
  assert.ok(hallucination.draft.warnings.some((warning) => warning.includes("영업시간")));
  assert.ok(hallucination.draft.warnings.some((warning) => warning.includes("주소")));
  assert.throws(() => buildPlatformExport(hallucination.draft, "wordpress"), /검수 전 내보낼 수 없습니다/);

  const unknownScopeDraft = { ...structuredClone(generated.draft), factIntegrityPlan: { version: 1, scope: "future-scope", facts: [] } };
  assert.equal(validFoodReviewFactPlan(unknownScopeDraft.factIntegrityPlan), false);
  assert.equal(canExportDraft(unknownScopeDraft), false);
  assert.doesNotThrow(() => validateFoodReviewDraftFacts(unknownScopeDraft, unknownScopeDraft.factIntegrityPlan));
  assert.throws(() => buildPlatformExport(unknownScopeDraft, "naver"), /검수 전 내보낼 수 없습니다/);
  const missingFactsPlanDraft = { ...structuredClone(generated.draft), factIntegrityPlan: { version: 1, scope: "food-review" } };
  assert.equal(canExportDraft(missingFactsPlanDraft), false,
    "a persisted food plan without facts must fail closed without throwing a TypeError");
  assert.doesNotThrow(() => validateFoodReviewDraftFacts(missingFactsPlanDraft, missingFactsPlanDraft.factIntegrityPlan));
  const undatedVolatilePlan = structuredClone(factPlan);
  const undatedHours = undatedVolatilePlan.facts.find((fact) => fact.key === "hours");
  Object.assign(undatedHours, { status: "USER_CONFIRMED", value: "24/7" });
  assert.equal(validFoodReviewFactPlan(undatedVolatilePlan), false,
    "volatile user-confirmed hours require a valid checkedAt date");
  const undatedVolatileDraft = { ...structuredClone(generated.draft), factIntegrityPlan: undatedVolatilePlan };
  assert.equal(canExportDraft(undatedVolatileDraft), false);
  assert.throws(() => buildPlatformExport(undatedVolatileDraft, "wordpress"), /검수 전 내보낼 수 없습니다/);
  undatedHours.checkedAt = "2026-11-03";
  assert.equal(validFoodReviewFactPlan(undatedVolatilePlan), true);
  assert.ok(foodReviewOutputLines(undatedVolatilePlan).some((line) => line.includes("영업시간: 24/7")));

  const nonFoodCategories = CATEGORY_DEFINITIONS.filter((category) => category.id !== "food");
  assert.equal(nonFoodCategories.length, 19);
  for (const category of nonFoodCategories) {
    const otherInput = { ...input, categoryId: category.id, presetId: category.presets[0]?.id, attributes: {} };
    const otherPlan = buildContentLayoutPlan(otherInput).plan;
    assert.equal(otherPlan.factPlan, undefined, `food fact plan leaked into ${category.id}`);
    assert.deepEqual(otherPlan.missingFacts, [], `food missing facts leaked into ${category.id}`);
    assert.equal(otherPlan.sections.some((section) => section.id === "food-facts"), false,
      `food section leaked into ${category.id}`);
  }
  assert.doesNotMatch(contentLayoutPrompt({ ...plan, factPlan: { version: 1, scope: "future-common-facts", facts: [] } }),
    /맛집 사실 경계/, "future common fact plans must not inherit food-specific prompt rules");

  const statusSource = readFileSync(new URL("../app/LayoutPlanStatus.tsx", import.meta.url), "utf8");
  assert.match(statusSource, /확인되지 않아 생성하지 않은 정보/);
  assert.match(statusSource, /plan\.missingFacts\.join/);
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /form\.platformId && canExportDraft\(draft\)/,
    "copy/export preview must use fact-integrity validation instead of presentation warning text");
  assert.match(pageSource, /copyText\(platformExport\.tagsText, "tags"\)/,
    "tag copy must use the same guarded export projection");
  assert.match(pageSource, /본문·태그·이미지 가이드 내보내기를 잠갔어요/,
    "the fact-integrity export block must remain visible after the transient generation toast closes");
  assert.match(pageSource, /validateDraftPresentationAgainstContentLayoutPlan\(draft, draft\.contentLayoutPlan\)/,
    "presentation QA must be recomputed after draft edits instead of relying on generation-time warnings");
  const storageSource = readFileSync(new URL("../lib/infrastructure/draft-workspace-storage.ts", import.meta.url), "utf8");
  assert.match(storageSource, /optional\(value\.factIntegrityPlan, validFoodReviewFactPlan\)/,
    "persisted drafts must runtime-validate the new fact plan before restore or save");
  const promptSource = readFileSync(new URL("../lib/application/build-prompt.ts", import.meta.url), "utf8");
  const mockSource = readFileSync(new URL("../lib/infrastructure/mock-content-adapter.ts", import.meta.url), "utf8");
  assert.match(promptSource, /!projectedFactFields\.has\(key\)/,
    "fact-bound form fields must be excluded from the generic attributes prompt by source key");
  assert.match(mockSource,
    /const attributes = contentLayoutPlan\?\.factPlan\?\.scope === "food-review"\s*\?\s*\[\]\s*:\s*rawAttributes\.filter\(\(attribute\) => !inputSummaryFieldIds\.has\(attribute\.fieldId\)\);/,
    "mock food narrative and images must receive no generic attributes, while non-food summaries exclude already projected fields");
  assert.deepEqual(input, rawBefore, "generation and export fixtures must leave raw input unchanged");

  console.log(JSON.stringify({
    result: "FOOD_REVIEW_GENERATION_CONTRACT_SYNTHETIC_PASS",
    currentFormFactsProjectedAsRaw: 5,
    explicitUnknownFacts: 3,
    conflictRejected: true,
    unknownHoursClaimRejected: true,
    unknownAddressClaimRejected: true,
    mismatchedDraftExportBlocked: true,
    presentationMismatchExportAllowedWithDynamicQaWarning: true,
    editedFactRevalidatedAtExport: true,
    editedMetadataRevalidatedAtExport: true,
    overlappingTopicAllowed: true,
    factBoundFieldsConfinedStructurally: true,
    knownEnglishUnknownClaimsRejected: true,
    combinedEnglishHoursAddressClaimRejected: true,
    malformedPersistedPlansFailClosed: true,
    undatedVolatileFactsFailClosed: true,
    publicFactRows: expectedLines.length,
    correctedDraftCanRecoverFromStaleWarning: true,
    platformExportsChecked: ["naver", "wordpress"],
    nonFoodCategoriesUnchanged: nonFoodCategories.length,
    providerCallsPerCase: 1,
    externalCalls: 0,
    userData: 0,
  }));
} finally {
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
  if (originalMockMode === undefined) delete process.env.BLOTORI_MOCK_MODE;
  else process.env.BLOTORI_MOCK_MODE = originalMockMode;
  if (originalExtension) Module._extensions[".ts"] = originalExtension;
  else delete Module._extensions[".ts"];
}
