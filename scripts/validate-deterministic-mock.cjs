const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const originalTsLoader = Module._extensions[".ts"];
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
  }).outputText;
  module._compile(output, filename);
};

try {
  const { CATEGORY_BLOG_DNA_PRESETS } = require(path.join(process.cwd(), "lib/domain/category-blog-dna.ts"));
  const { makeMockDraft } = require(path.join(process.cwd(), "lib/infrastructure/mock-content-adapter.ts"));
  const { ensureWarnings } = require(path.join(process.cwd(), "lib/domain/rules.ts"));
  const food = CATEGORY_BLOG_DNA_PRESETS.find((preset) => preset.id === "food-photo-diary");
  const education = CATEGORY_BLOG_DNA_PRESETS.find((preset) => preset.id === "education-easy-explain");
  assert.ok(food && education);

  function inputFor(preset) {
    return {
      platformId: "naver",
      categoryId: preset.categoryId,
      freeTopic: "사용자가 입력한 주제",
      attributes: {},
      styleId: "custom",
      styleIntensity: 3,
      styleProfileName: preset.label,
      blogDNA: preset.dna,
      variationNonce: "fixed-seed-42",
      structureId: "auto",
      length: "medium",
      imageCount: 4,
    };
  }

  const foodA = makeMockDraft(inputFor(food));
  const foodB = makeMockDraft(inputFor(food));
  const foodVariations = ["variation-a", "variation-b", "variation-c", "variation-d"]
    .map((variationNonce) => makeMockDraft({ ...inputFor(food), variationNonce }));
  const educationDraft = makeMockDraft(inputFor(education));
  assert.deepEqual(foodA, foodB, "same seed and input must produce identical mock output");
  const variationSignatures = new Set(foodVariations.map((draft) => JSON.stringify({
    headings: draft.sections.map((section) => section.heading),
    anchors: draft.images.map((image) => image.afterSectionId),
    fingerprint: draft.layoutFingerprint,
  })));
  assert.ok(variationSignatures.size >= 2, "same style with new variation nonces must adapt its layout");
  assert.notDeepEqual(foodA.sections.map((section) => section.heading), educationDraft.sections.map((section) => section.heading));
  assert.notEqual(foodA.layoutFingerprint, educationDraft.layoutFingerprint);
  assert.notEqual(foodA.images[1].placement, educationDraft.images[1].placement);
  assert.ok(foodA.title.startsWith("[샘플]"));
  assert.ok(foodA.summary.includes("mock"));
  assert.ok(foodA.warnings.some((warning) => warning.startsWith("샘플 모드:")));
  assert.ok(foodA.images.every((image) => image.prompt.includes("샘플") || image.prompt.includes("글자 없이")));
  assert.ok(!JSON.stringify(foodA).includes("실제 API 모드에서는"));
  assert.ok(!JSON.stringify(foodA).includes("필요한 조건만 입력하면"));
  assert.ok(!ensureWarnings(foodA).warnings.some((warning) => warning.includes("자리표시자")));
  assert.ok(!ensureWarnings(foodA).warnings.some((warning) => warning.includes("소제목")));

  console.log("DETERMINISTIC_MOCK_PASS", JSON.stringify({
    seed: "fixed-seed-42",
    deterministic: true,
    adaptiveVariationCount: variationSignatures.size,
    differentiated: {
      food: foodA.sections.map((section) => section.heading),
      education: educationDraft.sections.map((section) => section.heading),
    },
    examples: {
      food: { title: foodA.title, closing: foodA.closing[0], imagePlacement: foodA.images[1].placement },
      education: { title: educationDraft.title, closing: educationDraft.closing[0], imagePlacement: educationDraft.images[1].placement },
    },
  }));
} finally {
  if (originalTsLoader) Module._extensions[".ts"] = originalTsLoader;
  else delete Module._extensions[".ts"];
}
