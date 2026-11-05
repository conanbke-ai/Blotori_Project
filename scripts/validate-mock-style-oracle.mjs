import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalTs = Module._extensions[".ts"];
const originalApiKey = process.env.OPENAI_API_KEY;
const originalMockMode = process.env.BLOTORI_MOCK_MODE;

function compile(filename) {
  return ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function publicDraftText(draft) {
  return [
    draft.title,
    draft.summary,
    ...(draft.intro ?? []),
    ...(draft.sections ?? []).flatMap((section) => [section.heading, ...(section.paragraphs ?? [])]),
    ...(draft.closing ?? []),
    ...(draft.tags ?? []),
    ...(draft.images ?? []).flatMap((image) => [image.label, image.placement, image.prompt]),
  ].join("\n");
}

const scaffoldPattern = /사용자가 (?:준|제공한) 조건|확인된 입력|실제 내용 대신|실제 게시 전|문단 (?:흐름|호흡)|읽기 흐름|API 연결 전|mock입니다/i;
const casualEnding = /(?:해요|봐요|볼게요)\./;
const formalEnding = /(?:합니다|봅니다|보겠습니다|살펴봅니다)\./;

Module._extensions[".ts"] = (module, filename) => module._compile(compile(filename), filename);

try {
  delete process.env.OPENAI_API_KEY;
  process.env.BLOTORI_MOCK_MODE = "true";

  const { CATEGORY_DEFINITIONS } = require("../lib/domain/content-config.ts");
  const { buildContentLayoutPlan, validateDraftAgainstContentLayoutPlan } = require("../lib/domain/content-layout-plan.ts");
  const { generateBlogDraft } = require("../lib/application/generate-blog-draft.ts");
  const { buildPlatformExport } = require("../lib/application/platform-exporter.ts");
  const { makeMockDraft } = require("../lib/infrastructure/mock-content-adapter.ts");

  const categories = CATEGORY_DEFINITIONS.filter((category) => category.id !== "free");
  assert.equal(categories.length, 19, "the reviewed synthetic matrix must cover all 19 non-free categories");
  const providerCalls = { mock: 0, api: 0 };
  const titles = new Set();
  const voices = new Set();
  let attributeCount = 0;
  let exportCount = 0;

  for (const category of categories) {
    const preset = category.presets[0];
    const fieldIds = preset?.fieldIds ?? category.defaultFieldIds;
    const attributes = Object.fromEntries(fieldIds.map((fieldId) => [fieldId, `fixture::${category.id}::${fieldId}`]));
    attributeCount += fieldIds.length;
    const input = {
      platformId: "naver",
      categoryId: category.id,
      presetId: preset?.id ?? "",
      freeTopic: `합성 주제 ${category.id}`,
      attributes,
      styleId: "auto",
      styleIntensity: 3,
      structureId: "auto",
      length: "medium",
      imageCount: 4,
    };
    const original = structuredClone(input);
    const built = buildContentLayoutPlan(input);
    const generated = await generateBlogDraft(input, {
      mock: (safeInput, plan) => {
        providerCalls.mock += 1;
        return makeMockDraft(safeInput, plan);
      },
      api: async () => {
        providerCalls.api += 1;
        throw new Error("provider call is forbidden in synthetic QA");
      },
    });
    assert.equal(generated.mode, "mock");
    assert.deepEqual(input, original, `${category.id}: generation must not mutate the request`);
    assert.ok(generated.draft.contentLayoutPlan, `${category.id}: validated plan must stay attached`);
    assert.equal(validateDraftAgainstContentLayoutPlan(generated.draft, built.plan).ok, true,
      `${category.id}: mock must satisfy the content layout plan`);
    assert.deepEqual(generated.draft.sections.map((section) => section.id), built.plan.sections.map((section) => section.id),
      `${category.id}: section ids and order must match the plan`);
    assert.deepEqual(generated.draft.images.map((image) => image.afterSectionId), built.plan.imageAnchors.map((anchor) => anchor.afterSectionId),
      `${category.id}: image anchors must match the plan`);

    const publicText = publicDraftText(generated.draft);
    assert.doesNotMatch(publicText, scaffoldPattern, `${category.id}: generation scaffold must not leak into public text`);
    const paragraphs = generated.draft.sections.flatMap((section) => section.paragraphs);
    const duplicateParagraphs = paragraphs.filter((paragraph, index) => paragraphs.indexOf(paragraph) !== index);
    assert.deepEqual(duplicateParagraphs, [], `${category.id}: exact duplicate section paragraphs are forbidden`);
    for (const value of Object.values(attributes)) {
      assert.equal(count(publicText, value), 1, `${category.id}: ${value} must appear exactly once in the public draft`);
    }

    const register = built.plan.observedStyle?.voice.register;
    const narrativeText = [
      ...generated.draft.intro,
      ...generated.draft.sections.filter((section) => section.id !== "food-facts").flatMap((section) => section.paragraphs),
      ...generated.draft.closing,
    ].join("\n");
    voices.add(register ?? "unavailable");
    if (register === "formal" || register === "narrative") {
      assert.match(narrativeText, formalEnding, `${category.id}: formal voice must use formal endings`);
      assert.doesNotMatch(narrativeText, casualEnding, `${category.id}: formal voice must not drift into casual endings`);
    } else if (register === "casual") {
      assert.match(narrativeText, casualEnding, `${category.id}: casual voice must use casual endings`);
      assert.doesNotMatch(narrativeText, formalEnding, `${category.id}: casual voice must not drift into formal endings`);
    } else if (register === "mixed") {
      assert.match(narrativeText, casualEnding, `${category.id}: mixed voice must contain a casual cadence`);
      assert.match(narrativeText, formalEnding, `${category.id}: mixed voice must contain a formal cadence`);
    }

    titles.add(generated.draft.title);
    for (const platformId of ["naver", "wordpress"]) {
      const exported = buildPlatformExport(generated.draft, platformId);
      exportCount += 1;
      assert.doesNotMatch(`${exported.titleText}\n${exported.plainText}\n${exported.html ?? ""}`, scaffoldPattern,
        `${category.id}/${platformId}: generation scaffold must not leak into export`);
      for (const value of Object.values(attributes)) {
        assert.equal(count(exported.plainText, value), 1, `${category.id}/${platformId}: plain export must preserve ${value} once`);
        if (exported.html !== undefined) assert.equal(count(exported.html, value), 1,
          `${category.id}/${platformId}: rich export must preserve ${value} once`);
      }
    }
  }

  const boundaryInput = {
    platformId: "naver",
    categoryId: "health",
    presetId: "treatment-education",
    freeTopic: "합성 신뢰 경계",
    attributes: { situation: "KNOWN_SAFE_VALUE" },
    styleId: "auto",
    styleIntensity: 3,
    structureId: "auto",
    length: "medium",
    imageCount: 2,
  };
  const boundaryPlan = buildContentLayoutPlan(boundaryInput).plan;
  const hostileInput = {
    ...boundaryInput,
    attributes: {
      situation: "KNOWN_SAFE_VALUE",
      unknownField: "UNKNOWN_FIELD_SECRET",
      ageGroup: 42,
      bodyPart: { marker: "NON_STRING_SECRET" },
      symptom: null,
    },
  };
  const hostileBefore = structuredClone(hostileInput);
  let hostileDraft;
  assert.doesNotThrow(() => { hostileDraft = makeMockDraft(hostileInput, boundaryPlan); },
    "mock adapter must ignore hostile attribute shapes without throwing");
  assert.deepEqual(hostileInput, hostileBefore, "hostile attribute filtering must not mutate the request");
  const hostilePublicText = publicDraftText(hostileDraft);
  assert.equal(count(hostilePublicText, "KNOWN_SAFE_VALUE"), 1, "known string attributes remain available once");
  assert.doesNotMatch(hostilePublicText, /UNKNOWN_FIELD_SECRET|NON_STRING_SECRET|\[object Object\]|\b42\b/,
    "unknown or non-string attributes must not reach public mock text");
  const hostileExport = buildPlatformExport(hostileDraft, "naver");
  assert.doesNotMatch(`${hostileExport.plainText}\n${hostileExport.html ?? ""}`, /UNKNOWN_FIELD_SECRET|NON_STRING_SECRET|\[object Object\]|\b42\b/,
    "unknown or non-string attributes must not reach exported mock text");

  assert.deepEqual(providerCalls, { mock: 19, api: 0 });
  assert.equal(titles.size, 19, "category-aware synthetic titles must be distinct across all 19 categories");
  assert.ok(voices.has("formal") && voices.has("casual") && voices.has("mixed"), "formal, casual, and mixed strategies must all be exercised");
  console.log(`Mock style oracle QA PASS: categories=${categories.length}, attributes=${attributeCount}, exports=${exportCount}, hostileCases=1, titles=${titles.size}, providerCalls=${providerCalls.mock}/${providerCalls.api}.`);
} finally {
  Module._extensions[".ts"] = originalTs;
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
  if (originalMockMode === undefined) delete process.env.BLOTORI_MOCK_MODE;
  else process.env.BLOTORI_MOCK_MODE = originalMockMode;
}
