const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const workspace = process.cwd();
const originalTsLoader = Module._extensions[".ts"];
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  module._compile(output, filename);
};

try {
  const { CATEGORY_BLOG_DNA_LIBRARY_META, CATEGORY_BLOG_DNA_PRESETS } = require(path.join(workspace, "lib/domain/category-blog-dna.ts"));
  const { CATEGORY_DEFINITIONS } = require(path.join(workspace, "lib/domain/content-config.ts"));
  const { buildPrompt } = require(path.join(workspace, "lib/application/build-prompt.ts"));
  const { composeGenerationRequest } = require(path.join(workspace, "lib/application/compose-generation-request.ts"));
  const { buildPlatformExport } = require(path.join(workspace, "lib/application/platform-exporter.ts"));
  const { ensureWarnings, findDraftQualityIssues, findUnsupportedFactSignals } = require(path.join(workspace, "lib/domain/rules.ts"));

  assert.equal(CATEGORY_BLOG_DNA_LIBRARY_META.biasCorrected, false, "uncertified V2 must stay inactive");
  assert.equal(CATEGORY_BLOG_DNA_PRESETS.length, 45, "current V1/curated fallback must expose 45 presets");
  assert.equal(new Set(CATEGORY_BLOG_DNA_PRESETS.map((preset) => preset.categoryId)).size, 19, "all 19 categories must be represented");
  const composerCategoryIds = new Set(CATEGORY_DEFINITIONS.map((category) => category.id));
  for (const categoryId of new Set(CATEGORY_BLOG_DNA_PRESETS.map((preset) => preset.categoryId))) {
    assert.ok(composerCategoryIds.has(categoryId), `${categoryId}: Blog DNA category must be selectable in Composer`);
  }

  for (const preset of CATEGORY_BLOG_DNA_PRESETS) {
    const input = {
      platformId: "naver",
      categoryId: preset.categoryId,
      freeTopic: `${preset.label} fixture 주제`,
      attributes: {},
      styleId: "custom",
      styleIntensity: 3,
      customStyle: preset.dna.signature,
      styleProfileName: preset.label,
      blogDNA: preset.dna,
      blogDNAApply: { voice: true, mood: true, structure: true, imageRhythm: true, visual: true },
      recentLayoutFingerprints: ["질문 도입 → 세 구간 → 단독 이미지 → 한 줄 요약"],
      variationNonce: `fixture-${preset.id}`,
      structureId: "auto",
      length: "medium",
      imageCount: 4,
    };
    const prompt = buildPrompt(input);
    for (const expected of [
      preset.dna.voice.summary,
      preset.dna.voice.paragraphRhythm,
      preset.dna.structure.summary,
      preset.dna.structure.closingPatterns[0],
      preset.dna.imageRhythm.summary,
      preset.dna.imageRhythm.placementRules[0],
      preset.dna.visual.summary,
      preset.dna.visual.headingStyle,
      `variation nonce: fixture-${preset.id}`,
    ]) assert.ok(prompt.includes(expected), `${preset.id}: missing prompt DNA ${expected}`);
    assert.match(prompt, /방문·구매·사용·시식·숙박했다고 명시하지 않았다면/);
    assert.match(prompt, /ImagePlan은 편집자용 가이드/);
  }

  const selectedPreset = CATEGORY_BLOG_DNA_PRESETS.find((preset) => preset.categoryId === "food");
  assert.ok(selectedPreset, "food category preset fixture must exist");
  const explicitPayload = composeGenerationRequest({
    platformId: "naver",
    categoryId: "food",
    freeTopic: "명시적 생성 컨텍스트 fixture",
    attributes: {},
    styleId: "auto",
    styleIntensity: 3,
    structureId: "auto",
    length: "medium",
    imageCount: 4,
  }, {
    overrides: {
      styleId: "custom",
      customStyle: selectedPreset.dna.signature,
      styleProfileName: selectedPreset.label,
      blogDNA: selectedPreset.dna,
      blogDNAApply: { voice: true, mood: true, structure: true, imageRhythm: true, visual: true },
      recentLayoutFingerprints: ["이전 레이아웃"],
    },
    layoutHistoryKey: "category:fixture",
    variationPrefix: "category-variation",
  }, "category-variation-fixed");
  assert.equal(explicitPayload.styleProfileName, selectedPreset.label);
  assert.equal(explicitPayload.blogDNA, selectedPreset.dna);
  assert.deepEqual(explicitPayload.recentLayoutFingerprints, ["이전 레이아웃"]);
  assert.equal(explicitPayload.variationNonce, "category-variation-fixed");
  const explicitPrompt = buildPrompt(explicitPayload);
  assert.ok(explicitPrompt.includes(selectedPreset.dna.voice.summary));
  assert.ok(explicitPrompt.includes(selectedPreset.dna.imageRhythm.summary));

  const baseDraft = {
    title: "직접 고친 제목",
    summary: "편집된 요약",
    intro: ["도입 문단은 사용자가 직접 편집할 수 있습니다."],
    sections: [
      { id: "sec-1", heading: "첫 번째 관찰", paragraphs: ["내용과 경험을 구체적으로 설명하는 첫 문단입니다."], presentation: { visualStyle: "key-point" } },
      { id: "sec-2", heading: "다음 선택 기준", paragraphs: ["앞 문단과 다른 길이와 흐름으로 선택 기준을 설명합니다."] },
    ],
    closing: ["마지막에는 독자에게 맞는 판단 기준을 남깁니다."],
    tags: ["fixture", "편집"],
    images: [{ id: "IMG-01-HERO", role: "HERO", label: "대표 이미지", placement: "제목 아래", afterSectionId: null, ratio: "16:9", size: "1200×675", prompt: "fixture" }],
    warnings: [],
  };
  const exported = buildPlatformExport(baseDraft, "naver");
  assert.equal(exported.titleText, "직접 고친 제목");
  assert.ok(exported.plainText.includes("첫 번째 관찰"));
  assert.ok(exported.plainText.includes("앞 문단과 다른 길이"));
  assert.ok(!exported.plainText.includes("IMG-01-HERO"));
  assert.ok(!exported.plainText.includes("제목 아래"));
  assert.ok(!exported.html.includes("IMG-01-HERO"));
  assert.ok(exported.imageGuideText.includes("IMG-01-HERO"));
  assert.ok(exported.imageGuideText.includes("제목 아래"));
  assert.ok(exported.formattingGuide.includes("핵심 포인트"));

  const badDraft = {
    ...baseDraft,
    intro: ["그리고 실제 API 모드에서는 내용을 생성합니다."],
    sections: [
      { id: "a", heading: "핵심 내용", paragraphs: ["그리고 비슷한 길이의 문장을 반복해서 적습니다."] },
      { id: "b", heading: "핵심 내용!", paragraphs: ["그리고 비슷한 길이의 문장을 반복해 또 적어요."] },
      { id: "c", heading: "다음 내용", paragraphs: ["그리고 비슷한 길이의 문장을 다시 적어 둡니다."] },
    ],
    closing: ["그리고 비슷한 길이로 마지막 문단도 작성합니다."],
  };
  const issues = findDraftQualityIssues(badDraft);
  assert.ok(issues.some((issue) => issue.includes("소제목")));
  assert.ok(issues.some((issue) => issue.includes("자리표시자")));
  assert.ok(issues.some((issue) => issue.includes("연결 방식")));
  assert.ok(ensureWarnings(badDraft).warnings.length >= 3);

  const unsupportedDraft = {
    ...baseDraft,
    intro: ["어제 직접 방문했고 가격은 29,000원이었어요."],
    sections: [{ id: "fact", heading: "소요 시간", paragraphs: ["준비에는 40분이 걸렸습니다."] }],
    closing: ["제가 먹어봤을 때 가장 좋았어요."],
  };
  const evidenceInput = {
    platformId: "naver", freeTopic: "가을 메뉴 선택법", attributes: {}, styleId: "friendly-info",
    structureId: "information", length: "short", imageCount: 2,
  };
  const unsupported = findUnsupportedFactSignals(unsupportedDraft, evidenceInput);
  assert.ok(unsupported.some((issue) => issue.includes("1인칭")));
  assert.ok(unsupported.some((issue) => issue.includes("29,000원") && issue.includes("40분")));
  assert.ok(ensureWarnings(unsupportedDraft, evidenceInput).warnings.some((warning) => warning.includes("근거 확인")));

  const studioSource = fs.readFileSync(path.join(workspace, "app/BlotoriAssetStudio.tsx"), "utf8");
  assert.doesNotMatch(studioSource, /window\.fetch\s*=/, "asset studio must not override global fetch");
  assert.match(studioSource, /onGenerationContextChange/, "asset studio must publish explicit generation context");
  assert.match(studioSource, /\['pasted_text', '글 붙여넣기'\]/, "pasted-text DNA entry must remain available");
  assert.match(studioSource, /\['manual', '직접 설정'\]/, "manual DNA entry must remain available");
  const analyzeRoute = fs.readFileSync(path.join(workspace, "app/api/style/analyze/route.ts"), "utf8");
  assert.match(analyzeRoute, /sourceType === "pasted_text" \|\| sourceType === "manual"/, "local text/manual path must avoid URL validation");
  assert.match(analyzeRoute, /source\.length > 20000/, "local input size guard must remain active");

  console.log("BLOG_DNA_PRODUCT_FLOW_PASS", JSON.stringify({
    presets: CATEGORY_BLOG_DNA_PRESETS.length,
    categories: new Set(CATEGORY_BLOG_DNA_PRESETS.map((preset) => preset.categoryId)).size,
    fallback: CATEGORY_BLOG_DNA_LIBRARY_META,
    qualityIssuesDetected: issues.length,
    unsupportedFactSignalsDetected: unsupported.length,
    flows: ["generate-prompt", "edit", "preview-contract", "export", "pasted-text", "manual", "v1-curated-fallback"],
  }));
} finally {
  if (originalTsLoader) Module._extensions[".ts"] = originalTsLoader;
  else delete Module._extensions[".ts"];
}
