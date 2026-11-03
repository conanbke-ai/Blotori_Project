import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { normalizeReviewedCategoryBlogPresetsV2 } from "./category-blog-presets-admission.mjs";

export const OBSERVED_STYLE_RUNTIME_SCHEMA_VERSION = 1;
export const OBSERVED_STYLE_ADMISSION_VERSION = 1;
export const OBSERVED_STYLE_SELECTION_POLICY = "largest-observed-sample-then-confidence-v1";
export const REVIEWED_SOURCE_SHA256 = "311817592919b060961676c36bc455c313ade87f19fd3e1f5f1a6688dc7ffde3";
export const REVIEWED_ADMISSION_PROJECTION_SHA256 = "1c4ba619eb114451b92b71c69eb1d4a88a39f821af634ec69dda9607840a12d2";

const confidenceRank = Object.freeze({ high: 0, medium: 1 });

const voiceRegister = new Map([
  ["합니다체 중심, 리액션 표현이 비교적 활발", ["formal", "active"]],
  ["해요체 중심, 리액션 표현이 비교적 활발", ["casual", "active"]],
  ["합니다체 중심, 감탄·이모지 사용은 절제", ["formal", "restrained"]],
  ["해요체 중심", ["casual", "neutral"]],
  ["합니다체 중심", ["formal", "neutral"]],
  ["혼합 종결어미", ["mixed", "neutral"]],
  ["혼합 종결어미, 감탄·이모지 사용은 절제", ["mixed", "restrained"]],
  ["서술형 평서체 비중이 높음", ["narrative", "neutral"]],
  ["서술형 평서체 비중이 높음, 감탄·이모지 사용은 절제", ["narrative", "restrained"]],
  ["혼합 종결어미, 리액션 표현이 비교적 활발", ["mixed", "active"]],
]);

const openingTokens = new Map([
  ["도입 텍스트를 짧게 쓰고 빠르게 첫 이미지로 진입", "brief-image-first"],
  ["도입 설명 후 첫 이미지 진입", "explain-then-image"],
  ["간결한 제목으로 시작", "concise-title"],
  ["검색 의도와 핵심 키워드를 제목에 충분히 포함", "search-intent-title"],
]);

const sectionTokens = new Map([
  ["사진/장면 → 짧은 설명 → 다음 장면", "scene-caption-sequence"],
  ["텍스트와 이미지를 자주 교차", "text-image-interleave"],
  ["소제목 → 설명 → 관련 이미지", "heading-explanation-image"],
  ["섹션 단위로 텍스트와 이미지를 묶음", "section-bundle"],
]);

const closingTokens = new Map([
  ["짧은 총평 또는 추천 대상", "brief-verdict"],
  ["필요한 태그만 제한적으로 사용", "limited-tags"],
  ["짧은 총평 뒤 해시태그 묶음", "tag-bundle"],
  ["검색 키워드형 해시태그를 비교적 많이 사용", "search-tags"],
]);

const visualTokens = Object.freeze({
  alignment: new Map([["중앙 정렬 사용 빈도가 높음", "center-mixed"], ["좌측 정렬 중심", "left"]]),
  emphasis: new Map([["강조 요소를 자주 사용", "frequent"], ["강조 요소는 제한적", "selective"]]),
  whitespace: new Map([["짧은 문단과 넓은 호흡", "airy"], ["중간~긴 설명 호흡", "dense"]]),
  headingStyle: new Map([["소제목보다 흐름 중심", "flow-led"], ["소제목 구획이 명확", "heading-led"]]),
});

function fail(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  throw error;
}

function exactToken(map, value, label) {
  const token = map.get(value);
  if (!token) fail("UNMAPPED_AGGREGATE_GUIDANCE", label);
  return token;
}

function exactTokens(map, values, label) {
  if (!Array.isArray(values) || values.length === 0) fail("UNMAPPED_AGGREGATE_GUIDANCE", label);
  return [...new Set(values.map((value, index) => exactToken(map, value, `${label}[${index}]`)))].sort();
}

function paragraphMetrics(value) {
  const match = /^중앙값 문단 길이 약 (\d{1,3})자, 짧은 문단 비율 약 (\d{1,3})%$/.exec(value);
  if (!match) fail("UNMAPPED_AGGREGATE_GUIDANCE", "paragraphRhythm");
  const medianChars = Number(match[1]);
  const shortRatePercent = Number(match[2]);
  if (medianChars < 1 || medianChars > 300 || shortRatePercent < 0 || shortRatePercent > 100) {
    fail("AGGREGATE_METRIC_OUT_OF_RANGE", "paragraphRhythm");
  }
  return {
    medianChars,
    shortRatePercent,
    band: medianChars <= 35 || shortRatePercent >= 90 ? "compact" : medianChars <= 80 ? "balanced" : "extended",
  };
}

function cadenceMetrics(value) {
  const match = /^게시글당 이미지 중앙값 (\d{1,3})개, 텍스트↔이미지 전환 중앙값 (\d{1,3})회$/.exec(value);
  if (!match) fail("UNMAPPED_AGGREGATE_GUIDANCE", "imageRhythm.cadence");
  const medianImages = Number(match[1]);
  const medianTransitions = Number(match[2]);
  if (medianImages > 200 || medianTransitions > 200) fail("AGGREGATE_METRIC_OUT_OF_RANGE", "imageRhythm.cadence");
  return { medianImages, medianTransitions };
}

function groupingMetrics(value) {
  const match = /^평균 이미지 묶음 길이 (\d{1,2}\.\d), 최대 연속 이미지 중앙값 (\d{1,2})개$/.exec(value);
  if (!match) fail("UNMAPPED_AGGREGATE_GUIDANCE", "imageRhythm.grouping");
  const averageGroupLength = Number(match[1]);
  const maxConsecutiveImages = Number(match[2]);
  if (averageGroupLength > 20 || maxConsecutiveImages > 20) fail("AGGREGATE_METRIC_OUT_OF_RANGE", "imageRhythm.grouping");
  return { averageGroupLength, maxConsecutiveImages };
}

function imageTokens(summary) {
  const density = summary.startsWith("사진 비중이 매우 높음") ? "very-high"
    : summary.startsWith("사진 비중이 높은 편") ? "high"
      : summary.startsWith("사진을 적절히 사용") ? "balanced"
        : summary.startsWith("텍스트 중심") ? "text-led"
          : null;
  const placement = summary.includes("사진과 짧은 텍스트를 자주 교차") ? "interleaved"
    : summary.includes("이미지를 섹션 전환점에 배치") ? "section-transition"
      : summary.includes("사진을 2장 이상 묶어서") ? "grouped"
        : null;
  if (!density || !placement || !summary.endsWith("사진 묶음 사이 텍스트가 짧음")) {
    fail("UNMAPPED_AGGREGATE_GUIDANCE", "imageRhythm.summary");
  }
  return { density, placement };
}

function runtimeTokens(guidance) {
  if (!guidance || typeof guidance !== "object") fail("AGGREGATE_GUIDANCE_REQUIRED", "guidance");
  const [register, reaction] = exactToken(voiceRegister, guidance.voice?.summary, "voice.summary");
  return {
    voice: { register, reaction },
    paragraph: paragraphMetrics(guidance.paragraphRhythm),
    opening: exactTokens(openingTokens, guidance.opening, "opening"),
    sections: exactTokens(sectionTokens, guidance.sections, "sections"),
    closing: exactTokens(closingTokens, guidance.closing, "closing"),
    image: {
      ...imageTokens(guidance.imageRhythm?.summary),
      ...cadenceMetrics(guidance.imageRhythm?.cadence),
      ...groupingMetrics(guidance.imageRhythm?.grouping),
    },
    visual: {
      alignment: exactToken(visualTokens.alignment, guidance.visual?.alignment, "visual.alignment"),
      emphasis: exactToken(visualTokens.emphasis, guidance.visual?.emphasis, "visual.emphasis"),
      whitespace: exactToken(visualTokens.whitespace, guidance.visual?.whitespace, "visual.whitespace"),
      headingStyle: exactToken(visualTokens.headingStyle, guidance.visual?.headingStyle, "visual.headingStyle"),
    },
  };
}

function selectDefault(presets) {
  const ranked = [...presets].sort((left, right) => right.observedBlogCount - left.observedBlogCount
    || confidenceRank[left.confidence] - confidenceRank[right.confidence]
    || left.id.localeCompare(right.id));
  return ranked[0]?.id ?? null;
}

export function materializeObservedStyleRuntime(admittedProjection) {
  if (admittedProjection?.fixtureClassification !== "source-derived") fail("SOURCE_DERIVED_PROJECTION_REQUIRED", "fixtureClassification");
  if (artifactSha256(admittedProjection) !== REVIEWED_ADMISSION_PROJECTION_SHA256
    || admittedProjection.source?.sha256 !== REVIEWED_SOURCE_SHA256
    || admittedProjection.source?.biasCorrected !== true || admittedProjection.source?.deduplicatedSources !== true
    || admittedProjection.source?.inputBlogs !== 274 || admittedProjection.source?.categoryMemberships !== 319
    || admittedProjection.counts?.categories !== 19 || admittedProjection.counts?.presets !== 62
    || admittedProjection.counts?.admitted !== 58 || admittedProjection.counts?.rejected !== 4
    || admittedProjection.counts?.inputBlogs !== 274 || admittedProjection.counts?.categoryMemberships !== 319
    || admittedProjection.categories?.length !== 19) {
    fail("REVIEWED_ADMISSION_PROJECTION_MISMATCH", "projection hash or fixed source contract");
  }
  const categories = admittedProjection.categories.map((category) => {
    const admitted = category.presets.filter((preset) => preset.admission === "ADMITTED").map((preset) => ({
      id: preset.id,
      confidence: preset.confidence,
      observedBlogCount: preset.observedBlogCount,
      tokens: runtimeTokens(preset.guidance),
    }));
    const rejected = category.presets.filter((preset) => preset.admission === "REJECTED")
      .map((preset) => ({ id: preset.id, reason: preset.reason }));
    return {
      categoryId: category.categoryId,
      selectionPolicy: OBSERVED_STYLE_SELECTION_POLICY,
      defaultPresetId: selectDefault(admitted),
      admitted,
      rejected,
    };
  });
  const runtimePresetCount = categories.reduce((count, category) => count + category.admitted.length, 0);
  const rejectedCount = categories.reduce((count, category) => count + category.rejected.length, 0);
  if (runtimePresetCount !== admittedProjection.counts.admitted || rejectedCount !== admittedProjection.counts.rejected) {
    fail("RUNTIME_COUNT_MISMATCH", "runtime rows must preserve admission counts");
  }
  return {
    schemaVersion: OBSERVED_STYLE_RUNTIME_SCHEMA_VERSION,
    artifactClassification: "source-derived-aggregate-style-tokens",
    admissionVersion: OBSERVED_STYLE_ADMISSION_VERSION,
    source: {
      sha256: admittedProjection.source.sha256,
      generatedAt: admittedProjection.source.generatedAt,
      upstreamGeneratedAt: admittedProjection.source.upstreamGeneratedAt,
      inputBlogs: admittedProjection.source.inputBlogs,
      categoryMemberships: admittedProjection.source.categoryMemberships,
      biasCorrected: admittedProjection.source.biasCorrected,
      deduplicatedSources: admittedProjection.source.deduplicatedSources,
    },
    counts: {
      categories: categories.length,
      sourcePresets: admittedProjection.counts.presets,
      admitted: runtimePresetCount,
      rejected: rejectedCount,
    },
    categories,
  };
}

export function materializeReviewedSource(sourceBytes) {
  return materializeObservedStyleRuntime(normalizeReviewedCategoryBlogPresetsV2(sourceBytes));
}

export function stableArtifactJson(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function artifactSha256(artifact) {
  return createHash("sha256").update(stableArtifactJson(artifact)).digest("hex");
}

export function canonicalArtifactJson(value) {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) fail("CANONICAL_JSON_UNSUPPORTED", typeof value);
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalArtifactJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalArtifactJson(value[key])}`).join(",")}}`;
}

export function canonicalArtifactSha256(artifact) {
  return createHash("sha256").update(canonicalArtifactJson(artifact)).digest("hex");
}

export function materializeObservedStyleRuntimeManifest(artifact) {
  return {
    schemaVersion: 1,
    artifact: "observed-style-runtime-v1.json",
    artifactSha256: artifactSha256(artifact),
    canonicalProjectionSha256: canonicalArtifactSha256(artifact),
    sourceSha256: REVIEWED_SOURCE_SHA256,
    classification: "source-derived-aggregate-style-tokens",
    admissionVersion: OBSERVED_STYLE_ADMISSION_VERSION,
    selectionPolicy: OBSERVED_STYLE_SELECTION_POLICY,
    counts: { ...artifact.counts },
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [sourcePath, outputPath] = process.argv.slice(2);
  if (!sourcePath || !outputPath) {
    console.error("Usage: node materialize-observed-style-runtime.mjs <reviewed-source.json> <runtime-output.json>");
    process.exitCode = 2;
  } else {
    try {
      const artifact = materializeReviewedSource(readFileSync(sourcePath));
      writeFileSync(outputPath, stableArtifactJson(artifact), "utf8");
      console.log(JSON.stringify({ outputPath, sha256: artifactSha256(artifact), counts: artifact.counts }));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
