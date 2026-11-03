import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AdmissionValidationError,
  EXPECTED_CATEGORY_THEME_MAP,
  EXPECTED_DEDUPLICATION_KEY,
  EXPECTED_TOP10_SOURCE,
  REVIEWED_ADMISSION_CONTRACT,
  normalizeReviewedCategoryBlogPresetsV2,
  normalizeSyntheticCategoryBlogPresetsV2ForTest,
  sha256,
  summarizeAdmission,
} from "./blog-corpus/category-blog-presets-admission.mjs";

const manifest = JSON.parse(readFileSync(new URL("./fixtures/category-blog-presets-admission.manifest.json", import.meta.url), "utf8"));
const preservedContract = manifest.fixtures.find((fixture) => fixture.classification === "source-derived");
assert.ok(preservedContract, "source-derived fixture contract must be declared");
assert.equal(preservedContract.id, REVIEWED_ADMISSION_CONTRACT.id);
assert.equal(preservedContract.sha256, REVIEWED_ADMISSION_CONTRACT.sha256);
assert.equal(preservedContract.expectedInputBlogs, REVIEWED_ADMISSION_CONTRACT.inputBlogs);
assert.equal(Object.isFrozen(REVIEWED_ADMISSION_CONTRACT), true);
assert.equal(Object.isFrozen(EXPECTED_CATEGORY_THEME_MAP), true);
assert.equal(Object.values(EXPECTED_CATEGORY_THEME_MAP).every(Object.isFrozen), true);
assert.equal(manifest.fixtures.find((fixture) => fixture.id === "synthetic-admission-contract-v1")?.classification, "synthetic");

function syntheticDna(confidence = "high") {
  return {
    version: 2,
    confidence,
    voice: {
      summary: "aggregate voice guidance",
      endings: ["consistent ending family"],
      sentenceRhythm: "mixed short and medium sentences",
      paragraphRhythm: "one or two sentences per paragraph",
      transitions: ["topic transition"],
      lexicalHabits: ["reader-oriented wording"],
      emotionPattern: "measured warmth",
      readerDistance: "friendly but bounded",
      punctuationHabits: ["limited exclamation"],
      avoid: ["copied signature phrases"],
    },
    structure: {
      openingPatterns: ["context-led opening"],
      sectionPatterns: ["evidence then interpretation"],
      closingPatterns: ["bounded takeaway"],
    },
    imageRhythm: {
      summary: "images separate major sections",
      cadence: "regular",
      grouping: "single-image groups",
      placementRules: ["after a completed section"],
      rolePreferences: ["context", "evidence"],
      adaptationRules: ["reduce slots before repeating a role"],
    },
    visual: {
      summary: "scannable aggregate visual guidance",
      alignment: "mostly left",
      emphasis: "sparse bold emphasis",
      whitespace: "regular section gaps",
      headingStyle: "short descriptive headings",
      decorationHabits: ["limited separators"],
      avoid: ["source-specific logos"],
    },
  };
}

function makeSyntheticFixture() {
  const generatedAt = "2026-10-08T02:07:18.823Z";
  let memberIndex = 0;
  const categories = {};
  for (const [categoryId, themes] of Object.entries(EXPECTED_CATEGORY_THEME_MAP)) {
    const ids = categoryId === "food"
      ? ["food-observed-01", "food-observed-02", "food-observed-03"]
      : [`${categoryId}-observed-01`];
    const presets = ids.map((id) => {
      memberIndex += 1;
      return {
        id,
        categoryId,
        label: "synthetic label that must not be emitted",
        description: "synthetic description that must not be emitted",
        tags: ["synthetic-tag"],
        sourceMeta: {
          kind: "blogchart-top10-full-corpus",
          schemaVersion: 2,
          generatedAt,
          blogCount: 1,
          totalListedPosts: 5,
          analyzedPosts: 5,
          failedPosts: 0,
          successRate: 1,
          textCoverageRate: 1,
          visualCoverageRate: 1,
          visualOnlyRate: 0,
          members: [{ theme: themes[0], platform: "synthetic", rank: 1, sourceUrl: `https://fixture.invalid/source-${memberIndex}` }],
        },
        dna: syntheticDna(),
      };
    });
    categories[categoryId] = { themes: [...themes], analyzedBlogs: presets.length, presets };
  }
  return {
    schemaVersion: 2,
    generatedAt,
    source: EXPECTED_TOP10_SOURCE,
    deduplicatedSources: true,
    deduplicationKey: EXPECTED_DEDUPLICATION_KEY,
    inputBlogs: memberIndex,
    categories,
  };
}

function normalizeSynthetic(library) {
  const sourceBytes = Buffer.from(JSON.stringify(library));
  return normalizeSyntheticCategoryBlogPresetsV2ForTest(sourceBytes, {
    expectedSha256: sha256(sourceBytes),
    expectedInputBlogs: library.inputBlogs,
  });
}

function expectCode(callback, code) {
  assert.throws(callback, (error) => error instanceof AdmissionValidationError && error.code === code);
}

const fixture = makeSyntheticFixture();
const first = normalizeSynthetic(fixture);
const second = normalizeSynthetic(structuredClone(fixture));
assert.deepEqual(first, second, "normalization must be deterministic");
assert.equal(first.fixtureClassification, "synthetic", "synthetic fixtures must not be relabeled as captured evidence");
assert.equal(first.source.biasCorrected, false, "synthetic fixtures must never claim reviewed bias correction");
assert.deepEqual(first.counts, {
  categories: 19,
  presets: 21,
  admitted: 19,
  rejected: 2,
  inputBlogs: 21,
  categoryMemberships: 21,
});
assert.deepEqual(first.categories.find((category) => category.categoryId === "food").presets.map((preset) => [preset.id, preset.admission, preset.reason]), [
  ["food-observed-01", "ADMITTED", "ADMITTED_AGGREGATE_STYLE_ONLY"],
  ["food-observed-02", "REJECTED", "FOOD_SHADOW_ACTIVATION_BLOCKED"],
  ["food-observed-03", "REJECTED", "FOOD_SHADOW_ACTIVATION_BLOCKED"],
]);
const serialized = JSON.stringify(first);
for (const forbidden of ["https://", "fixture.invalid", "sourceUrl", "members", "synthetic label", "synthetic description", "synthetic-tag"]) {
  assert.equal(serialized.includes(forbidden), false, `normalized output must exclude ${forbidden}`);
}
assert.equal(first.categories.every((category) => category.presets.every((preset) => preset.admission === "REJECTED" || preset.guidance)), true);
assert.equal(first.categories.every((category) => category.presets.every((preset) => preset.admission === "ADMITTED" || preset.guidance === undefined)), true);

const curated = structuredClone(fixture);
curated.categories.health.presets[0].sourceMeta.kind = "launch-curated";
const curatedResult = normalizeSynthetic(curated);
assert.deepEqual(curatedResult.categories.find((category) => category.categoryId === "health").presets[0], {
  id: "health-observed-01",
  confidence: "high",
  observedBlogCount: 1,
  admission: "REJECTED",
  reason: "PROVENANCE_NOT_OBSERVED_TOP10",
});
assert.equal(JSON.stringify(curatedResult).includes("launch-curated"), false, "curated input must not be relabeled as observed provenance");

const lowConfidence = structuredClone(fixture);
lowConfidence.categories.tech.presets[0].dna.confidence = "low";
assert.equal(normalizeSynthetic(lowConfidence).categories.find((category) => category.categoryId === "tech").presets[0].reason, "LOW_CONFIDENCE");

const rawReference = structuredClone(fixture);
rawReference.categories.travel.presets[0].dna.voice.summary = "copied from https://fixture.invalid/post";
assert.equal(normalizeSynthetic(rawReference).categories.find((category) => category.categoryId === "travel").presets[0].reason, "RAW_SOURCE_REFERENCE_IN_GUIDANCE");

const sourceBytes = Buffer.from(JSON.stringify(fixture));
expectCode(() => normalizeSyntheticCategoryBlogPresetsV2ForTest(sourceBytes, { expectedSha256: "0".repeat(64), expectedInputBlogs: fixture.inputBlogs }), "HASH_MISMATCH");

const wrongSource = structuredClone(fixture);
wrongSource.source = "launch-curated";
expectCode(() => normalizeSynthetic(wrongSource), "SOURCE_NOT_ALLOWLISTED");
const selfSignedUnreviewedBytes = Buffer.from(JSON.stringify(wrongSource));
expectCode(() => normalizeReviewedCategoryBlogPresetsV2(selfSignedUnreviewedBytes, {
  expectedSha256: sha256(selfSignedUnreviewedBytes),
  expectedInputBlogs: wrongSource.inputBlogs,
  expectedSource: wrongSource.source,
  categoryThemeMap: wrongSource.categories,
}), "HASH_MISMATCH");

const notDeduplicated = structuredClone(fixture);
notDeduplicated.deduplicatedSources = false;
expectCode(() => normalizeSynthetic(notDeduplicated), "SOURCES_NOT_DEDUPLICATED");

const wrongInputCount = structuredClone(fixture);
wrongInputCount.inputBlogs += 1;
expectCode(() => normalizeSynthetic(wrongInputCount), "INPUT_BLOG_COUNT_MISMATCH");

const wrongMapping = structuredClone(fixture);
wrongMapping.categories.food.themes = ["unreviewed-theme"];
expectCode(() => normalizeSynthetic(wrongMapping), "CATEGORY_MAPPING_MISMATCH");

const preservedPath = process.argv[2];
if (preservedPath) {
  const sourceDerived = normalizeReviewedCategoryBlogPresetsV2(readFileSync(preservedPath));
  const summary = summarizeAdmission(sourceDerived);
  assert.equal(summary.fixtureClassification, "source-derived");
  assert.equal(summary.counts.categories, preservedContract.expectedCategories);
  assert.equal(summary.counts.presets, preservedContract.expectedPresetRows);
  assert.equal(summary.counts.admitted, preservedContract.expectedAdmittedRows);
  assert.equal(summary.counts.rejected, preservedContract.expectedRejectedRows);
  assert.equal(summary.counts.categoryMemberships, preservedContract.expectedCategoryMemberships);
  assert.deepEqual(summary.exclusions, preservedContract.expectedExclusions);
  assert.equal(JSON.stringify(sourceDerived).includes("http"), false, "source-derived normalized output must not expose source URLs");
  console.log(`Preserved source-derived fixture PASS: ${JSON.stringify(summary.counts)}; exclusions=${JSON.stringify(summary.exclusions)}.`);
}

console.log("Category blog preset admission QA PASS: SYNTHETIC 19 categories/21 rows; deterministic allowlist projection; food shadow 02/03, low confidence, non-observed provenance, raw references, hash/source/dedup/input-count/category-map boundaries verified; no runtime, provider, network, or user data used.");
