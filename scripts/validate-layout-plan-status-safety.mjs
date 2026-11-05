import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalTsx = Module._extensions[".tsx"];
const originalTs = Module._extensions[".ts"];
const originalCss = Module._extensions[".css"];
const compile = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  fileName: filename,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
Module._extensions[".tsx"] = compile;
Module._extensions[".ts"] = compile;
Module._extensions[".css"] = (module) => { module.exports = {}; };

try {
  const { renderToStaticMarkup } = require("react-dom/server");
  const { default: LayoutPlanStatus, readLayoutPlanStatus, safeDraftForLayoutPlanDisplay } = require("../app/LayoutPlanStatus.tsx");
  const fixtures = [
    undefined,
    null,
    {},
    { version: 1, intent: "experience" },
    { version: 1, intent: "wrong", sections: [], naverLoss: [], missingFacts: [] },
    { version: 1, intent: "experience", sections: [{ id: "a", heading: "A", priority: 1 }], naverLoss: [], missingFacts: [] },
    { version: 1, intent: "experience", sections: [{ id: "a", heading: "A", priority: -1.5, paragraphRange: [3, 1] }], naverLoss: [], missingFacts: [] },
    { version: 1, intent: "experience", sections: [
      { id: "a", heading: "A", priority: 1, paragraphRange: [1, 2] },
      { id: "a", heading: "B", priority: 2, paragraphRange: [1, 2] },
    ], naverLoss: [], missingFacts: [] },
  ];
  assert.deepEqual(readLayoutPlanStatus(fixtures[0]), { kind: "legacy" });
  assert.deepEqual(readLayoutPlanStatus(fixtures[1]), { kind: "legacy" });
  for (const fixture of fixtures.slice(2)) {
    const before = JSON.stringify(fixture);
    assert.deepEqual(readLayoutPlanStatus(fixture), { kind: "invalid" });
    const draft = { contentLayoutPlan: fixture };
    const html = renderToStaticMarkup(LayoutPlanStatus({ draft }));
    assert.match(html, /편집 계획 확인 필요/);
    assert.doesNotMatch(html, /undefined|null/);
    assert.equal(JSON.stringify(fixture), before, "inspection must not mutate an incomplete plan");
    assert.notEqual(safeDraftForLayoutPlanDisplay(draft), draft);
    assert.equal(safeDraftForLayoutPlanDisplay(draft).contentLayoutPlan, undefined);
    assert.equal(JSON.stringify(fixture), before, "display safety copy must not mutate persisted data");
  }
  const planned = {
    version: 1, intent: "curation",
    sections: [{ id: "internal", heading: "최종 판단", priority: 1, paragraphRange: [1, 2] }],
    naverLoss: [{ feature: "card", outcome: "DEGRADED" }], missingFacts: ["price"],
  };
  const before = JSON.stringify(planned);
  const view = readLayoutPlanStatus(planned);
  assert.equal(view.kind, "planned");
  assert.match(renderToStaticMarkup(LayoutPlanStatus({ draft: { contentLayoutPlan: planned } })), /큐레이션 흐름/);
  assert.equal(JSON.stringify(planned), before);
  assert.equal(safeDraftForLayoutPlanDisplay({ contentLayoutPlan: planned }).contentLayoutPlan, planned);
  console.log("Layout plan safety QA PASS: missing, legacy, incomplete, and planned values render without mutation.");
} finally {
  if (originalTsx) Module._extensions[".tsx"] = originalTsx; else delete Module._extensions[".tsx"];
  if (originalTs) Module._extensions[".ts"] = originalTs; else delete Module._extensions[".ts"];
  if (originalCss) Module._extensions[".css"] = originalCss; else delete Module._extensions[".css"];
}
