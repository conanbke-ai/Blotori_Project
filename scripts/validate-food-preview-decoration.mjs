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
  const { buildContentLayoutPlan } = require("../lib/domain/content-layout-plan.ts");
  const { applyContentLayoutPlanToGeneratedDraft } = require("../lib/application/generate-blog-draft.ts");
  const { makeMockDraft } = require("../lib/infrastructure/mock-content-adapter.ts");
  const { buildPlatformExport } = require("../lib/application/platform-exporter.ts");
  const {
    applyFoodPreviewDecoration,
    readFoodPreviewDecoration,
    supportsFoodPreviewDecoration,
  } = require("../lib/domain/food-preview-decoration.ts");

  const input = {
    platformId: "wordpress",
    categoryId: "food",
    presetId: "restaurant-review",
    freeTopic: "합성 식당 방문 기록",
    attributes: {
      place: "합성 식당",
      menu: "합성 메뉴",
      visitPurpose: "점심 방문",
      priceRange: "합성 가격대",
      tastePoint: "담백한 맛",
    },
    styleId: "friendly-info",
    styleIntensity: 3,
    structureId: "review",
    length: "medium",
    imageCount: 4,
  };
  const planned = buildContentLayoutPlan(input);
  const providerDraft = makeMockDraft(planned.generationInput, planned.plan);
  const draft = applyContentLayoutPlanToGeneratedDraft(providerDraft, input.imageCount, planned.plan, planned.warnings);

  assert.equal(supportsFoodPreviewDecoration(draft), true);
  assert.equal(readFoodPreviewDecoration(draft), "default");
  const decorated = applyFoodPreviewDecoration(draft, "visit-guide");
  assert.notEqual(decorated, draft);
  assert.equal(readFoodPreviewDecoration(decorated), "visit-guide");
  assert.equal(decorated.sections, draft.sections, "꾸밈은 문단 배열을 바꾸면 안 됩니다.");
  assert.equal(decorated.images, draft.images, "꾸밈은 사진 배열·귀속을 바꾸면 안 됩니다.");
  assert.equal(decorated.contentLayoutPlan, draft.contentLayoutPlan, "꾸밈은 사실·레이아웃 계획을 바꾸면 안 됩니다.");
  assert.deepEqual(buildPlatformExport(decorated, "wordpress"), buildPlatformExport(draft, "wordpress"), "꾸밈은 WordPress 내보내기를 바꾸면 안 됩니다.");
  assert.deepEqual(buildPlatformExport(decorated, "naver"), buildPlatformExport(draft, "naver"), "꾸밈은 네이버 내보내기를 바꾸면 안 됩니다.");
  assert.equal(readFoodPreviewDecoration(structuredClone(decorated)), "visit-guide", "저장·복원 뒤에도 명시 선택을 유지해야 합니다.");
  assert.equal(applyFoodPreviewDecoration(decorated, "visit-guide"), decorated, "같은 선택은 불필요한 원고 변경을 만들면 안 됩니다.");

  const nonFoodPlanned = buildContentLayoutPlan({
    ...input,
    categoryId: "daily",
    presetId: "",
    attributes: {},
  });
  const nonFood = applyContentLayoutPlanToGeneratedDraft(
    makeMockDraft(nonFoodPlanned.generationInput, nonFoodPlanned.plan),
    input.imageCount,
    nonFoodPlanned.plan,
    nonFoodPlanned.warnings,
  );
  assert.equal(supportsFoodPreviewDecoration(nonFood), false);
  assert.equal(applyFoodPreviewDecoration(nonFood, "visit-guide"), nonFood, "다른 카테고리는 음식 꾸밈으로 변경하면 안 됩니다.");

  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/blotori-theme.css", import.meta.url), "utf8");
  assert.match(pageSource, /aria-label="음식 원고 미리보기 꾸밈"/);
  assert.match(pageSource, /data-food-preview-option="default"/);
  assert.match(pageSource, /data-food-preview-option="visit-guide"/);
  assert.match(pageSource, /data-food-preview-decoration=/);
  assert.match(cssSource, /\.blogPaper\.foodPreview--visitGuide > \.imageSlot/);
  assert.match(cssSource, /\[data-section-id="food-facts"\]/);
  assert.match(cssSource, /@media \(max-width: 760px\)/);

  console.log("PASS food preview decoration: 21 assertions");
} finally {
  Module._extensions[".ts"] = originalTs;
}
