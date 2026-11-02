import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const original = Module._extensions[".ts"];
Module._extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

try {
  const { applyDraftSectionOrder, editableSectionIds, moveDraftSection } = require("../lib/domain/draft-section-order.ts");
  const draft = {
    title: "fixture", summary: "", intro: [], closing: [], tags: [], warnings: [],
    sections: [
      { id: "a", heading: "A", paragraphs: ["a"] },
      { id: "b", heading: "B", paragraphs: ["b"] },
      { id: "c", heading: "C", paragraphs: ["c"] },
      { id: "glossary", heading: "Glossary", paragraphs: ["g"], presentation: { visualStyle: "glossary" } },
    ],
    images: [{ id: "IMG-01", label: "hero", placement: "B 뒤", size: "wide", prompt: "p", afterSectionId: "b", role: "HERO", ratio: "16:9" }],
    contentLayoutPlan: {
      version: 1, intent: "information", source: { categoryId: "", presetId: "", styleId: "auto", structureId: "auto", blogDNA: false },
      sections: [
        { id: "a", heading: "A", priority: 1, paragraphRange: [1, 2] },
        { id: "b", heading: "B", priority: 2, paragraphRange: [1, 2] },
        { id: "c", heading: "C", priority: 3, paragraphRange: [1, 2] },
      ], naverLoss: [], missingFacts: [], paragraphChars: [1, 2], headingDensity: "regular", imageAnchors: [],
      typography: { title: "utility", body: "scannable" }, emphasis: { maxPerSection: 1, kinds: ["bold"], cardLimit: 1 },
    },
  };
  const original = structuredClone(draft);
  const imagesBefore = JSON.stringify(draft.images);
  const moved = moveDraftSection(draft, "b", "up");
  assert.deepEqual(editableSectionIds(moved), ["b", "a", "c"]);
  assert.deepEqual(moved.sections.map((section) => section.id), ["b", "a", "c", "glossary"]);
  assert.deepEqual(moved.contentLayoutPlan.sections.map((section) => [section.id, section.priority]), [["b", 1], ["a", 2], ["c", 3]]);
  assert.equal(JSON.stringify(moved.images), imagesBefore, "image anchors must not change");
  assert.equal(JSON.stringify(draft), JSON.stringify(original), "move must not mutate its input");

  const repeated = moveDraftSection(moved, "b", "down");
  assert.deepEqual(repeated, original, "repeating the inverse move must restore the original draft");
  const undone = applyDraftSectionOrder(moved, ["a", "b", "c"]);
  assert.deepEqual(undone, original, "undo order must restore section and plan priorities exactly");
  assert.equal(moveDraftSection(original, "a", "up"), original, "boundary move must be a no-op");
  assert.equal(applyDraftSectionOrder(original, ["a", "b", "missing"]), original, "invalid order must be a no-op");

  const legacy = { ...original, contentLayoutPlan: undefined };
  assert.deepEqual(editableSectionIds(moveDraftSection(legacy, "c", "up")), ["a", "c", "b"]);
  const incomplete = { ...original, contentLayoutPlan: {} };
  assert.deepEqual(moveDraftSection(incomplete, "b", "up").contentLayoutPlan, {}, "incomplete plans must be preserved unchanged");

  const interspersedGlossary = {
    ...original,
    sections: [original.sections[0], original.sections[3], original.sections[1], original.sections[2]],
  };
  const reorderedAroundGlossary = applyDraftSectionOrder(interspersedGlossary, ["c", "a", "b"]);
  assert.deepEqual(reorderedAroundGlossary.sections.map((section) => section.id), ["c", "glossary", "a", "b"],
    "a glossary section between editable sections must retain its position while other sections reorder");
  assert.deepEqual(reorderedAroundGlossary.contentLayoutPlan.sections.map((section) => [section.id, section.priority]),
    [["c", 1], ["a", 2], ["b", 3]], "the matching plan must follow editable section order without a glossary entry");
  assert.deepEqual(interspersedGlossary.sections.map((section) => section.id), ["a", "glossary", "b", "c"],
    "reordering must not mutate the source draft");
  console.log("Draft section order QA PASS: move, repeat, undo, plan priority, glossary, legacy, and image anchors are stable.");
} finally {
  if (original) Module._extensions[".ts"] = original; else delete Module._extensions[".ts"];
}
