import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const EXPECTED_TOP10_SOURCE = "BlogChart TOP10 x public full-post corpus · bias-corrected text/visual eligibility";
export const EXPECTED_DEDUPLICATION_KEY = "canonical source URL within app category";

const categoryThemeMap = {
  health: ["health-medical", "diet"],
  food: ["food"],
  daily: ["parenting", "photography"],
  travel: ["domestic-travel", "overseas-travel"],
  review: ["it-review", "car-review", "beauty"],
  education: ["education", "books"],
  hobby: ["design", "music", "photography"],
  tech: ["it-review"],
  "beauty-fashion": ["beauty", "fashion"],
  "parenting-family": ["parenting", "wedding"],
  pets: ["pets"],
  "real-estate": ["real-estate"],
  finance: ["finance"],
  career: ["jobs"],
  auto: ["car-review"],
  "gaming-entertainment": ["games", "movies", "comics-anime", "entertainment", "celebrities"],
  "living-interior": ["interior"],
  "marketing-business": ["marketing"],
  "outdoor-sports": ["sports", "hiking", "camping", "fishing"],
};
for (const themes of Object.values(categoryThemeMap)) Object.freeze(themes);
export const EXPECTED_CATEGORY_THEME_MAP = Object.freeze(categoryThemeMap);

export const REVIEWED_ADMISSION_CONTRACT = Object.freeze({
  id: "preserved-category-blog-presets-v2-311817592919b060",
  sha256: "311817592919b060961676c36bc455c313ade87f19fd3e1f5f1a6688dc7ffde3",
  inputBlogs: 274,
  source: EXPECTED_TOP10_SOURCE,
  deduplicationKey: EXPECTED_DEDUPLICATION_KEY,
  categoryThemeMap: EXPECTED_CATEGORY_THEME_MAP,
  biasCorrected: true,
});

const BLOCKED_PRESETS = new Map([
  ["food-observed-02", "FOOD_SHADOW_ACTIVATION_BLOCKED"],
  ["food-observed-03", "FOOD_SHADOW_ACTIVATION_BLOCKED"],
]);
const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const URL_LIKE = /(?:https?:\/\/|www\.|sourceUrl|representativePosts?)/i;

export class AdmissionValidationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "AdmissionValidationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new AdmissionValidationError(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, code, label) {
  if (!isRecord(value)) fail(code, `${label} must be an object`);
  return value;
}

function requireString(value, code, label) {
  if (typeof value !== "string" || value.trim().length === 0) fail(code, `${label} must be a nonblank string`);
  return value;
}

function requireInteger(value, code, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) fail(code, `${label} must be an integer >= ${minimum}`);
  return value;
}

function requireRate(value, code, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(code, `${label} must be a finite number between 0 and 1`);
  }
  return value;
}

function requireStringArray(value, code, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    fail(code, `${label} must be an array of nonblank strings`);
  }
  return [...value];
}

function sameStringSet(left, right) {
  return left.length === right.length
    && [...left].sort().every((item, index) => item === [...right].sort()[index]);
}

export function sha256(sourceBytes) {
  return createHash("sha256").update(sourceBytes).digest("hex");
}

function validateLibraryEnvelope(library, actualSha256, contract) {
  if (typeof contract.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(contract.sha256)) {
    fail("EXPECTED_HASH_REQUIRED", "a 64-character expected SHA-256 is required");
  }
  if (actualSha256 !== contract.sha256.toLowerCase()) {
    fail("HASH_MISMATCH", `expected ${contract.sha256.toLowerCase()}, received ${actualSha256}`);
  }
  requireInteger(contract.inputBlogs, "EXPECTED_INPUT_COUNT_REQUIRED", "expectedInputBlogs", 1);
  if (library.schemaVersion !== 2) fail("SCHEMA_VERSION_MISMATCH", "schemaVersion must equal 2");
  if (library.source !== contract.source) fail("SOURCE_NOT_ALLOWLISTED", "source does not match the reviewed bias-corrected source");
  requireString(library.generatedAt, "GENERATED_AT_INVALID", "generatedAt");
  if (Number.isNaN(Date.parse(library.generatedAt))) fail("GENERATED_AT_INVALID", "generatedAt must be an ISO date-time");
  if (library.inputBlogs !== contract.inputBlogs) {
    fail("INPUT_BLOG_COUNT_MISMATCH", `expected ${contract.inputBlogs}, received ${library.inputBlogs}`);
  }
  if (library.deduplicatedSources !== true) fail("SOURCES_NOT_DEDUPLICATED", "deduplicatedSources must be true");
  if (library.deduplicationKey !== contract.deduplicationKey) {
    fail("DEDUPLICATION_KEY_MISMATCH", "deduplicationKey does not match the reviewed canonical URL rule");
  }
  const categories = requireRecord(library.categories, "CATEGORIES_INVALID", "categories");
  const expectedCategoryIds = Object.keys(contract.categoryThemeMap);
  const actualCategoryIds = Object.keys(categories);
  if (!sameStringSet(actualCategoryIds, expectedCategoryIds)) {
    fail("CATEGORY_MAPPING_MISMATCH", "category IDs do not exactly match the reviewed app-category mapping");
  }
}

function validateSourceMeta(sourceMeta, presetId, categoryId, expectedThemes, generatedAt) {
  const code = "SOURCE_META_INVALID";
  requireRecord(sourceMeta, code, `${presetId}.sourceMeta`);
  if (sourceMeta.schemaVersion !== 2) fail(code, `${presetId}.sourceMeta.schemaVersion must equal 2`);
  const sourceMetaGeneratedAt = requireString(sourceMeta.generatedAt, code, `${presetId}.sourceMeta.generatedAt`);
  const sourceMetaTime = Date.parse(sourceMetaGeneratedAt);
  if (Number.isNaN(sourceMetaTime) || sourceMetaTime > Date.parse(generatedAt)) {
    fail(code, `${presetId}.sourceMeta.generatedAt must be a valid upstream timestamp not later than the library`);
  }
  const blogCount = requireInteger(sourceMeta.blogCount, code, `${presetId}.sourceMeta.blogCount`, 1);
  const totalListedPosts = requireInteger(sourceMeta.totalListedPosts, code, `${presetId}.sourceMeta.totalListedPosts`, 1);
  const analyzedPosts = requireInteger(sourceMeta.analyzedPosts, code, `${presetId}.sourceMeta.analyzedPosts`);
  const failedPosts = requireInteger(sourceMeta.failedPosts, code, `${presetId}.sourceMeta.failedPosts`);
  if (analyzedPosts + failedPosts !== totalListedPosts) {
    fail(code, `${presetId} analyzedPosts + failedPosts must equal totalListedPosts`);
  }
  const successRate = requireRate(sourceMeta.successRate, code, `${presetId}.sourceMeta.successRate`);
  const calculatedSuccessRate = analyzedPosts / totalListedPosts;
  if (Math.abs(successRate - calculatedSuccessRate) > 0.00011) fail(code, `${presetId}.sourceMeta.successRate is inconsistent`);
  for (const key of ["textCoverageRate", "visualCoverageRate", "visualOnlyRate"]) {
    if (sourceMeta[key] !== undefined) requireRate(sourceMeta[key], code, `${presetId}.sourceMeta.${key}`);
  }
  if (!Array.isArray(sourceMeta.members) || sourceMeta.members.length !== blogCount) {
    fail(code, `${presetId}.sourceMeta.members length must equal blogCount`);
  }
  const memberUrls = sourceMeta.members.map((member, index) => {
    requireRecord(member, code, `${presetId}.sourceMeta.members[${index}]`);
    if (!expectedThemes.includes(member.theme)) fail(code, `${presetId} member theme is outside ${categoryId} mapping`);
    const sourceUrl = requireString(member.sourceUrl, code, `${presetId}.sourceMeta.members[${index}].sourceUrl`);
    let parsed;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      fail(code, `${presetId} contains an invalid source URL`);
    }
    if (parsed.protocol !== "https:") fail(code, `${presetId} source URLs must use https`);
    return sourceUrl;
  });
  if (new Set(memberUrls).size !== memberUrls.length) fail(code, `${presetId} contains duplicate source URLs`);
  return {
    kind: sourceMeta.kind,
    blogCount,
    analyzedPosts,
    failedPosts,
    successRate,
    textCoverageRate: sourceMeta.textCoverageRate,
    visualCoverageRate: sourceMeta.visualCoverageRate,
    visualOnlyRate: sourceMeta.visualOnlyRate,
    generatedAt: sourceMetaGeneratedAt,
    memberUrls,
  };
}

function aggregateGuidance(dna, presetId) {
  try {
    requireRecord(dna, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna`);
    if (dna.version !== 2) fail("AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.version must equal 2`);
    const voice = requireRecord(dna.voice, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice`);
    const structure = requireRecord(dna.structure, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.structure`);
    const imageRhythm = requireRecord(dna.imageRhythm, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.imageRhythm`);
    const visual = requireRecord(dna.visual, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.visual`);
    const guidance = {
      voice: {
        summary: requireString(voice.summary, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice.summary`),
        endings: requireStringArray(voice.endings, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice.endings`),
        sentenceRhythm: requireString(voice.sentenceRhythm, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice.sentenceRhythm`),
        paragraphRhythm: requireString(voice.paragraphRhythm, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice.paragraphRhythm`),
        transitions: requireStringArray(voice.transitions, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice.transitions`),
        lexicalHabits: requireStringArray(voice.lexicalHabits, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice.lexicalHabits`),
        emotionPattern: requireString(voice.emotionPattern, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice.emotionPattern`),
        readerDistance: requireString(voice.readerDistance, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice.readerDistance`),
        punctuationHabits: requireStringArray(voice.punctuationHabits, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice.punctuationHabits`),
        avoid: requireStringArray(voice.avoid, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice.avoid`),
      },
      paragraphRhythm: requireString(voice.paragraphRhythm, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.voice.paragraphRhythm`),
      opening: requireStringArray(structure.openingPatterns, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.structure.openingPatterns`),
      sections: requireStringArray(structure.sectionPatterns, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.structure.sectionPatterns`),
      closing: requireStringArray(structure.closingPatterns, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.structure.closingPatterns`),
      imageRhythm: {
        summary: requireString(imageRhythm.summary, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.imageRhythm.summary`),
        cadence: requireString(imageRhythm.cadence, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.imageRhythm.cadence`),
        grouping: requireString(imageRhythm.grouping, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.imageRhythm.grouping`),
        placementRules: requireStringArray(imageRhythm.placementRules, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.imageRhythm.placementRules`),
        rolePreferences: requireStringArray(imageRhythm.rolePreferences, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.imageRhythm.rolePreferences`),
        adaptationRules: requireStringArray(imageRhythm.adaptationRules, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.imageRhythm.adaptationRules`),
      },
      visual: {
        summary: requireString(visual.summary, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.visual.summary`),
        alignment: requireString(visual.alignment, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.visual.alignment`),
        emphasis: requireString(visual.emphasis, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.visual.emphasis`),
        whitespace: requireString(visual.whitespace, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.visual.whitespace`),
        headingStyle: requireString(visual.headingStyle, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.visual.headingStyle`),
        decorationHabits: requireStringArray(visual.decorationHabits, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.visual.decorationHabits`),
        avoid: requireStringArray(visual.avoid, "AGGREGATE_GUIDANCE_INVALID", `${presetId}.dna.visual.avoid`),
      },
    };
    if (URL_LIKE.test(JSON.stringify(guidance))) {
      return { reason: "RAW_SOURCE_REFERENCE_IN_GUIDANCE", guidance: null };
    }
    return { reason: null, guidance };
  } catch (error) {
    if (error instanceof AdmissionValidationError) return { reason: error.code, guidance: null };
    throw error;
  }
}

function admissionReason(presetId, sourceKind, confidence, guidanceReason) {
  if (sourceKind !== "blogchart-top10-full-corpus") return "PROVENANCE_NOT_OBSERVED_TOP10";
  if (!CONFIDENCE_VALUES.has(confidence)) return "INVALID_CONFIDENCE";
  if (BLOCKED_PRESETS.has(presetId)) return BLOCKED_PRESETS.get(presetId);
  if (confidence === "low") return "LOW_CONFIDENCE";
  if (guidanceReason) return guidanceReason;
  return "ADMITTED_AGGREGATE_STYLE_ONLY";
}

function normalizeWithContract(sourceBytes, contract, fixtureClassification) {
  const bytes = Buffer.isBuffer(sourceBytes) ? sourceBytes : Buffer.from(sourceBytes);
  const actualSha256 = sha256(bytes);
  let library;
  try {
    library = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("INVALID_JSON", "source is not valid JSON");
  }
  requireRecord(library, "INVALID_LIBRARY", "library");
  validateLibraryEnvelope(library, actualSha256, contract);

  const categoryThemeMap = contract.categoryThemeMap;
  const presetIds = new Set();
  const globalMemberUrls = new Set();
  const sourceMetaGeneratedAtValues = new Set();
  let categoryMemberships = 0;
  const categories = Object.entries(categoryThemeMap).map(([categoryId, expectedThemes]) => {
    const category = requireRecord(library.categories[categoryId], "CATEGORY_INVALID", categoryId);
    const themes = requireStringArray(category.themes, "CATEGORY_INVALID", `${categoryId}.themes`);
    if (!sameStringSet(themes, expectedThemes)) fail("CATEGORY_MAPPING_MISMATCH", `${categoryId} themes do not match the reviewed mapping`);
    const analyzedBlogs = requireInteger(category.analyzedBlogs, "CATEGORY_INVALID", `${categoryId}.analyzedBlogs`, 1);
    if (!Array.isArray(category.presets) || category.presets.length === 0) fail("CATEGORY_INVALID", `${categoryId}.presets must not be empty`);
    const categoryMemberUrls = [];
    const presets = [...category.presets]
      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      .map((preset) => {
        requireRecord(preset, "PRESET_INVALID", `${categoryId} preset`);
        const id = requireString(preset.id, "PRESET_INVALID", `${categoryId}.preset.id`);
        if (presetIds.has(id)) fail("DUPLICATE_PRESET_ID", id);
        presetIds.add(id);
        if (preset.categoryId !== categoryId) fail("PRESET_CATEGORY_MISMATCH", `${id} does not belong to ${categoryId}`);
        const sourceMeta = validateSourceMeta(preset.sourceMeta, id, categoryId, expectedThemes, library.generatedAt);
        sourceMetaGeneratedAtValues.add(sourceMeta.generatedAt);
        categoryMemberUrls.push(...sourceMeta.memberUrls);
        for (const url of sourceMeta.memberUrls) globalMemberUrls.add(url);
        const confidence = preset.dna?.confidence;
        const aggregate = aggregateGuidance(preset.dna, id);
        const reason = admissionReason(id, sourceMeta.kind, confidence, aggregate.reason);
        const admitted = reason === "ADMITTED_AGGREGATE_STYLE_ONLY";
        return {
          id,
          confidence: CONFIDENCE_VALUES.has(confidence) ? confidence : null,
          observedBlogCount: sourceMeta.blogCount,
          admission: admitted ? "ADMITTED" : "REJECTED",
          reason,
          ...(admitted ? { guidance: aggregate.guidance } : {}),
        };
      });
    if (categoryMemberUrls.length !== analyzedBlogs || new Set(categoryMemberUrls).size !== analyzedBlogs) {
      fail("CATEGORY_DEDUPLICATION_MISMATCH", `${categoryId} analyzedBlogs must equal unique preset-member URLs`);
    }
    categoryMemberships += categoryMemberUrls.length;
    return { categoryId, sourceThemes: [...expectedThemes], analyzedBlogs, presets };
  });

  if (globalMemberUrls.size !== library.inputBlogs) {
    fail("INPUT_BLOG_COUNT_MISMATCH", `library declares ${library.inputBlogs}, but ${globalMemberUrls.size} unique source URLs were observed`);
  }
  if (sourceMetaGeneratedAtValues.size !== 1) {
    fail("SOURCE_META_INVALID", "all observed presets must share one upstream generatedAt timestamp");
  }
  const allPresets = categories.flatMap((category) => category.presets);
  const admitted = allPresets.filter((preset) => preset.admission === "ADMITTED").length;
  const rejected = allPresets.length - admitted;
  return {
    schemaVersion: 1,
    fixtureClassification,
    source: {
      sha256: actualSha256,
      schemaVersion: library.schemaVersion,
      generatedAt: library.generatedAt,
      upstreamGeneratedAt: [...sourceMetaGeneratedAtValues][0],
      source: library.source,
      inputBlogs: library.inputBlogs,
      categoryMemberships,
      deduplicatedSources: true,
      deduplicationKey: library.deduplicationKey,
      biasCorrected: contract.biasCorrected === true,
    },
    counts: {
      categories: categories.length,
      presets: allPresets.length,
      admitted,
      rejected,
      inputBlogs: library.inputBlogs,
      categoryMemberships,
    },
    categories,
  };
}

export function normalizeReviewedCategoryBlogPresetsV2(sourceBytes) {
  return normalizeWithContract(sourceBytes, REVIEWED_ADMISSION_CONTRACT, "source-derived");
}

export function normalizeSyntheticCategoryBlogPresetsV2ForTest(sourceBytes, { expectedSha256, expectedInputBlogs }) {
  const syntheticContract = {
    ...REVIEWED_ADMISSION_CONTRACT,
    id: "synthetic-admission-contract-v1",
    sha256: expectedSha256,
    inputBlogs: expectedInputBlogs,
    biasCorrected: false,
  };
  return normalizeWithContract(sourceBytes, syntheticContract, "synthetic");
}

export function summarizeAdmission(result) {
  const exclusions = {};
  const categories = result.categories.map((category) => {
    const admitted = category.presets.filter((preset) => preset.admission === "ADMITTED").length;
    const rejected = category.presets.length - admitted;
    for (const preset of category.presets) {
      if (preset.admission === "REJECTED") exclusions[preset.reason] = (exclusions[preset.reason] ?? 0) + 1;
    }
    return { categoryId: category.categoryId, analyzedBlogs: category.analyzedBlogs, presets: category.presets.length, admitted, rejected };
  });
  return { fixtureClassification: result.fixtureClassification, source: result.source, counts: result.counts, exclusions, categories };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [sourcePath, mode] = process.argv.slice(2);
  if (!sourcePath) {
    console.error("Usage: node category-blog-presets-admission.mjs <reviewed-source.json> [--summary]");
    process.exitCode = 2;
  } else {
    try {
      const result = normalizeReviewedCategoryBlogPresetsV2(readFileSync(sourcePath));
      console.log(JSON.stringify(mode === "--summary" ? summarizeAdmission(result) : result, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
