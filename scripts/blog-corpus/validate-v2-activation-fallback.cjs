const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const workspace = process.cwd();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "blotori-v2-fallback-"));
const compiledPath = path.join(temporaryRoot, "category-blog-dna.cjs");
const sourcePath = path.join(workspace, "lib/domain/category-blog-dna.ts");
const currentV1 = JSON.parse(fs.readFileSync(path.join(workspace, "data/blog-corpus/category-blog-presets-v1.json"), "utf8"));
const currentV2 = JSON.parse(fs.readFileSync(path.join(workspace, "data/blog-corpus/category-blog-presets-v2.json"), "utf8"));

try {
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  fs.writeFileSync(compiledPath, compiled);

  function loadWith(v1, v2) {
    const originalLoad = Module._load;
    Module._load = function fixtureLoad(request, parent, isMain) {
      if (request.endsWith("category-blog-presets-v1.json")) return v1;
      if (request.endsWith("category-blog-presets-v2.json")) return v2;
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[compiledPath];
    try { return require(compiledPath); }
    finally {
      Module._load = originalLoad;
      delete require.cache[compiledPath];
    }
  }

  const actual = loadWith(currentV1, currentV2);
  assert.equal(actual.CATEGORY_BLOG_DNA_LIBRARY_META.biasCorrected, false);
  assert.equal(actual.CATEGORY_BLOG_DNA_LIBRARY_META.materialized, false);
  assert.equal(actual.CATEGORY_BLOG_DNA_LIBRARY_META.schemaVersion, 1);
  assert.ok(actual.CATEGORY_BLOG_DNA_PRESETS.length > 0);
  assert.ok(actual.CATEGORY_BLOG_DNA_PRESETS.every((preset) => preset.sourceMeta.kind === "launch-curated"));

  const v1Preset = { id: "fixture-v1", categoryId: "health" };
  const v2Preset = { id: "fixture-v2", categoryId: "tech" };
  const v1Library = { schemaVersion: 1, generatedAt: "fixture-v1", source: "fixture-v1", inputBlogs: 1, categories: { health: { presets: [v1Preset] } } };
  const uncertifiedV2 = { schemaVersion: 2, generatedAt: "fixture-v2", source: "fixture-v2", inputBlogs: 1, deduplicatedSources: false, categories: { tech: { presets: [v2Preset] } } };
  const incompleteV2 = { ...uncertifiedV2, deduplicatedSources: true, categories: {} };
  const certifiedV2 = { ...uncertifiedV2, deduplicatedSources: true };

  const v1Fallback = loadWith(v1Library, uncertifiedV2);
  assert.ok(v1Fallback.CATEGORY_BLOG_DNA_PRESETS.some((preset) => preset.id === "fixture-v1"));
  assert.ok(!v1Fallback.CATEGORY_BLOG_DNA_PRESETS.some((preset) => preset.id === "fixture-v2"));
  assert.equal(v1Fallback.CATEGORY_BLOG_DNA_LIBRARY_META.biasCorrected, false);

  const incompleteFallback = loadWith(v1Library, incompleteV2);
  assert.ok(incompleteFallback.CATEGORY_BLOG_DNA_PRESETS.some((preset) => preset.id === "fixture-v1"));
  assert.equal(incompleteFallback.CATEGORY_BLOG_DNA_LIBRARY_META.biasCorrected, false);

  const activeV2 = loadWith(v1Library, certifiedV2);
  assert.ok(activeV2.CATEGORY_BLOG_DNA_PRESETS.some((preset) => preset.id === "fixture-v2"));
  assert.ok(!activeV2.CATEGORY_BLOG_DNA_PRESETS.some((preset) => preset.id === "fixture-v1"));
  assert.equal(activeV2.CATEGORY_BLOG_DNA_LIBRARY_META.biasCorrected, true);
  assert.equal(activeV2.CATEGORY_BLOG_DNA_LIBRARY_META.sourceDeduplicated, true);

  console.log("V2_ACTIVATION_FALLBACK_PASS", JSON.stringify({
    current: actual.CATEGORY_BLOG_DNA_LIBRARY_META,
    curatedPresets: actual.CATEGORY_BLOG_DNA_PRESETS.length,
    cases: ["current-curated", "uncertified-v2-to-v1", "incomplete-v2-to-v1", "certified-v2-active"],
  }));
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
