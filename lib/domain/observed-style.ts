import runtimeArtifact from "../../data/blog-corpus/observed-style-runtime-v1.json";
import runtimeManifest from "../../data/blog-corpus/observed-style-runtime-v1.manifest.json";
import type { GenerateRequest } from "./types";
import { canonicalSha256 } from "./sync-sha256";

export const OBSERVED_STYLE_RULE_VERSION = 1;
export const OBSERVED_STYLE_LIBRARY_ID = "observed-style-runtime-v1";
export const OBSERVED_STYLE_SELECTION_POLICY = "largest-observed-sample-then-confidence-v1";
export const REVIEWED_OBSERVED_STYLE_SOURCE_SHA256 = "311817592919b060961676c36bc455c313ade87f19fd3e1f5f1a6688dc7ffde3";
export const REVIEWED_OBSERVED_STYLE_ARTIFACT_SHA256 = "47f3b93a79f0c06cb3eeab3178a639017d9b52f9718046436530e7dd027864a5";
export const REVIEWED_OBSERVED_STYLE_CANONICAL_SHA256 = "49eace43f4b10370786357fcfce8e74fe7a19470e6a889cb838fe615c267bb8b";

export type ObservedVoiceRegister = "formal" | "casual" | "mixed" | "narrative";
export type ObservedReaction = "active" | "restrained" | "neutral";
export type ObservedParagraphBand = "compact" | "balanced" | "extended";
export type ObservedOpeningMode = "brief-image-first" | "explain-then-image" | "concise-title" | "search-intent-title";
export type ObservedSectionFlow = "scene-caption-sequence" | "text-image-interleave" | "heading-explanation-image" | "section-bundle";
export type ObservedClosingMode = "brief-verdict" | "limited-tags" | "tag-bundle" | "search-tags";
export type ObservedImageDensity = "very-high" | "high" | "balanced" | "text-led";
export type ObservedImagePlacement = "interleaved" | "section-transition" | "grouped";
export type ObservedAlignment = "center-mixed" | "left";
export type ObservedEmphasis = "frequent" | "selective";
export type ObservedWhitespace = "airy" | "dense";
export type ObservedHeadingStyle = "flow-led" | "heading-led";

export interface ObservedStyleGuidance {
  voice: { register: ObservedVoiceRegister; reaction: ObservedReaction };
  paragraph: { medianChars: number; shortRatePercent: number; band: ObservedParagraphBand };
  opening: ObservedOpeningMode[];
  sections: ObservedSectionFlow[];
  closing: ObservedClosingMode[];
  image: {
    density: ObservedImageDensity;
    placement: ObservedImagePlacement;
    medianImages: number;
    medianTransitions: number;
    averageGroupLength: number;
    maxConsecutiveImages: number;
  };
  visual: {
    alignment: ObservedAlignment;
    emphasis: ObservedEmphasis;
    whitespace: ObservedWhitespace;
    headingStyle: ObservedHeadingStyle;
  };
}

export type ObservedStyleTrait = "voice" | "paragraph" | "structure" | "image" | "visual";

export interface ObservedPresetProvenance {
  status: "applied" | "suppressed" | "unavailable";
  libraryId: typeof OBSERVED_STYLE_LIBRARY_ID;
  runtimeSchemaVersion: 1;
  artifactClassification: "source-derived-aggregate-style-tokens";
  sourceSha256: string;
  artifactSha256: string;
  canonicalProjectionSha256: string;
  admissionVersion: 1;
  ruleVersion: 1;
  selectionMode: "category-auto" | "none";
  selectionPolicy: typeof OBSERVED_STYLE_SELECTION_POLICY;
  categoryId: string;
  topicPresetId: string;
  runtimePresetId?: string;
  toggles: Record<ObservedStyleTrait, boolean>;
  suppressedReasons: string[];
}

export interface ObservedStyleResolution {
  provenance: ObservedPresetProvenance;
  guidance?: ObservedStyleGuidance;
}

type RuntimePreset = {
  id: string;
  confidence: "high" | "medium";
  observedBlogCount: number;
  tokens: ObservedStyleGuidance;
};

type RuntimeCategory = {
  categoryId: string;
  selectionPolicy: typeof OBSERVED_STYLE_SELECTION_POLICY;
  defaultPresetId: string;
  admitted: RuntimePreset[];
  rejected: Array<{ id: string; reason: string }>;
};

type RuntimeLibrary = {
  schemaVersion: 1;
  artifactClassification: "source-derived-aggregate-style-tokens";
  admissionVersion: 1;
  source: {
    sha256: string;
    inputBlogs: number;
    categoryMemberships: number;
    biasCorrected: true;
    deduplicatedSources: true;
  };
  counts: { categories: number; sourcePresets: number; admitted: number; rejected: number };
  categories: RuntimeCategory[];
};

const categoryIds = new Set([
  "health", "food", "daily", "travel", "review", "education", "hobby", "tech", "beauty-fashion",
  "parenting-family", "pets", "real-estate", "finance", "career", "auto", "gaming-entertainment",
  "living-interior", "marketing-business", "outdoor-sports",
]);
const values = <T extends string>(items: readonly T[]) => new Set<string>(items);
const voiceRegisters = values(["formal", "casual", "mixed", "narrative"] as const);
const reactions = values(["active", "restrained", "neutral"] as const);
const paragraphBands = values(["compact", "balanced", "extended"] as const);
const openingModes = values(["brief-image-first", "explain-then-image", "concise-title", "search-intent-title"] as const);
const sectionFlows = values(["scene-caption-sequence", "text-image-interleave", "heading-explanation-image", "section-bundle"] as const);
const closingModes = values(["brief-verdict", "limited-tags", "tag-bundle", "search-tags"] as const);
const imageDensities = values(["very-high", "high", "balanced", "text-led"] as const);
const imagePlacements = values(["interleaved", "section-transition", "grouped"] as const);
const alignments = values(["center-mixed", "left"] as const);
const emphases = values(["frequent", "selective"] as const);
const whitespaces = values(["airy", "dense"] as const);
const headingStyles = values(["flow-led", "heading-led"] as const);
const forbiddenRuntimeText = /https?:|www\.|sourceUrl|representative|label|description|"members"\s*:|instruction|영업시간|주소|가격|메뉴|제품명|ignore previous|system prompt/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function onlyStrings(value: unknown, allowed: Set<string>, minimum = 0): value is string[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= allowed.size
    && new Set(value).size === value.length
    && value.every((item) => typeof item === "string" && allowed.has(item));
}

function inRange(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function isObservedStyleGuidance(value: unknown): value is ObservedStyleGuidance {
  if (!isRecord(value) || forbiddenRuntimeText.test(JSON.stringify(value))) return false;
  const voice = value.voice;
  const paragraph = value.paragraph;
  const image = value.image;
  const visual = value.visual;
  return isRecord(voice) && voiceRegisters.has(String(voice.register)) && reactions.has(String(voice.reaction))
    && isRecord(paragraph) && inRange(paragraph.medianChars, 1, 300) && inRange(paragraph.shortRatePercent, 0, 100)
    && paragraphBands.has(String(paragraph.band))
    && onlyStrings(value.opening, openingModes) && onlyStrings(value.sections, sectionFlows) && onlyStrings(value.closing, closingModes)
    && isRecord(image) && imageDensities.has(String(image.density)) && imagePlacements.has(String(image.placement))
    && inRange(image.medianImages, 0, 200) && inRange(image.medianTransitions, 0, 200)
    && inRange(image.averageGroupLength, 0, 20) && inRange(image.maxConsecutiveImages, 0, 20)
    && isRecord(visual) && alignments.has(String(visual.alignment)) && emphases.has(String(visual.emphasis))
    && whitespaces.has(String(visual.whitespace)) && headingStyles.has(String(visual.headingStyle));
}

function parseRuntimePreset(value: unknown): RuntimePreset | null {
  if (!isRecord(value) || typeof value.id !== "string" || !/^[a-z0-9-]+-observed-\d{2}$/.test(value.id)
    || !["high", "medium"].includes(String(value.confidence))
    || !Number.isInteger(value.observedBlogCount) || Number(value.observedBlogCount) < 1
    || !isObservedStyleGuidance(value.tokens)
    || !(value.tokens as ObservedStyleGuidance).opening.length
    || !(value.tokens as ObservedStyleGuidance).sections.length
    || !(value.tokens as ObservedStyleGuidance).closing.length) return null;
  return value as unknown as RuntimePreset;
}

function defaultPresetId(presets: RuntimePreset[]) {
  const confidenceRank = { high: 0, medium: 1 } as const;
  return [...presets].sort((left, right) => right.observedBlogCount - left.observedBlogCount
    || confidenceRank[left.confidence] - confidenceRank[right.confidence]
    || left.id.localeCompare(right.id))[0]?.id;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function parseObservedStyleRuntimeForTest(artifact: unknown, manifest: unknown): RuntimeLibrary | null {
  try {
    if (!isRecord(artifact) || !isRecord(manifest)
      || forbiddenRuntimeText.test(JSON.stringify(artifact)) || forbiddenRuntimeText.test(JSON.stringify(manifest))
      || artifact.schemaVersion !== 1 || artifact.artifactClassification !== "source-derived-aggregate-style-tokens"
      || artifact.admissionVersion !== 1 || manifest.schemaVersion !== 1
      || manifest.classification !== artifact.artifactClassification || manifest.admissionVersion !== 1
      || manifest.selectionPolicy !== OBSERVED_STYLE_SELECTION_POLICY
      || manifest.sourceSha256 !== REVIEWED_OBSERVED_STYLE_SOURCE_SHA256
      || manifest.artifactSha256 !== REVIEWED_OBSERVED_STYLE_ARTIFACT_SHA256
      || manifest.canonicalProjectionSha256 !== REVIEWED_OBSERVED_STYLE_CANONICAL_SHA256
      || canonicalSha256(artifact) !== REVIEWED_OBSERVED_STYLE_CANONICAL_SHA256
      || !isRecord(manifest.counts) || manifest.counts.categories !== 19 || manifest.counts.sourcePresets !== 62
      || manifest.counts.admitted !== 58 || manifest.counts.rejected !== 4
      || !isRecord(artifact.source) || artifact.source.sha256 !== manifest.sourceSha256
      || artifact.source.biasCorrected !== true || artifact.source.deduplicatedSources !== true
      || artifact.source.inputBlogs !== 274 || artifact.source.categoryMemberships !== 319
      || !isRecord(artifact.counts) || artifact.counts.categories !== 19 || artifact.counts.sourcePresets !== 62
      || artifact.counts.admitted !== 58 || artifact.counts.rejected !== 4
      || !Array.isArray(artifact.categories) || artifact.categories.length !== 19) return null;
    const seenCategories = new Set<string>();
    const seenPresets = new Set<string>();
    let admittedCount = 0;
    let rejectedCount = 0;
    const categories: RuntimeCategory[] = [];
    for (const raw of artifact.categories) {
      if (!isRecord(raw) || typeof raw.categoryId !== "string" || !categoryIds.has(raw.categoryId)
        || seenCategories.has(raw.categoryId) || raw.selectionPolicy !== OBSERVED_STYLE_SELECTION_POLICY
        || typeof raw.defaultPresetId !== "string" || !Array.isArray(raw.admitted) || !Array.isArray(raw.rejected)) return null;
      seenCategories.add(raw.categoryId);
      const admitted: RuntimePreset[] = [];
      for (const item of raw.admitted) {
        const preset = parseRuntimePreset(item);
        if (!preset || seenPresets.has(preset.id) || !preset.id.startsWith(`${raw.categoryId}-observed-`)) return null;
        seenPresets.add(preset.id);
        admitted.push(preset);
      }
      if (!admitted.length || raw.defaultPresetId !== defaultPresetId(admitted)) return null;
      for (const item of raw.rejected) {
        if (!isRecord(item) || typeof item.id !== "string" || seenPresets.has(item.id)
          || !item.id.startsWith(`${raw.categoryId}-observed-`)
          || !["FOOD_SHADOW_ACTIVATION_BLOCKED", "LOW_CONFIDENCE"].includes(String(item.reason))) return null;
        seenPresets.add(item.id);
      }
      admittedCount += admitted.length;
      rejectedCount += raw.rejected.length;
      categories.push({
        categoryId: raw.categoryId,
        selectionPolicy: OBSERVED_STYLE_SELECTION_POLICY,
        defaultPresetId: raw.defaultPresetId,
        admitted,
        rejected: raw.rejected as Array<{ id: string; reason: string }>,
      });
    }
    if (admittedCount !== 58 || rejectedCount !== 4) return null;
    return structuredClone({ ...(artifact as unknown as RuntimeLibrary), categories });
  } catch {
    return null;
  }
}

const parsedRuntimeLibrary = parseObservedStyleRuntimeForTest(runtimeArtifact, runtimeManifest);
const runtimeLibrary = parsedRuntimeLibrary ? deepFreeze(structuredClone(parsedRuntimeLibrary)) : null;

function emptyToggles(): Record<ObservedStyleTrait, boolean> {
  return { voice: false, paragraph: false, structure: false, image: false, visual: false };
}

function baseProvenance(input: GenerateRequest): ObservedPresetProvenance {
  return {
    status: "unavailable",
    libraryId: OBSERVED_STYLE_LIBRARY_ID,
    runtimeSchemaVersion: 1,
    artifactClassification: "source-derived-aggregate-style-tokens",
    sourceSha256: REVIEWED_OBSERVED_STYLE_SOURCE_SHA256,
    artifactSha256: REVIEWED_OBSERVED_STYLE_ARTIFACT_SHA256,
    canonicalProjectionSha256: REVIEWED_OBSERVED_STYLE_CANONICAL_SHA256,
    admissionVersion: 1,
    ruleVersion: OBSERVED_STYLE_RULE_VERSION,
    selectionMode: "none",
    selectionPolicy: OBSERVED_STYLE_SELECTION_POLICY,
    categoryId: input.categoryId ?? "",
    topicPresetId: input.presetId ?? "",
    toggles: emptyToggles(),
    suppressedReasons: [],
  };
}

export function resolveObservedStyleGuidance(input: GenerateRequest): ObservedStyleResolution {
  const provenance = baseProvenance(input);
  if (!runtimeLibrary) {
    provenance.suppressedReasons.push("RUNTIME_ARTIFACT_INVALID");
    return { provenance };
  }
  if (!input.categoryId || !categoryIds.has(input.categoryId)) {
    provenance.suppressedReasons.push("CATEGORY_NOT_REVIEWED");
    return { provenance };
  }
  const category = runtimeLibrary.categories.find((item) => item.categoryId === input.categoryId);
  if (!category) {
    provenance.suppressedReasons.push("CATEGORY_NOT_ADMITTED");
    return { provenance };
  }
  if (input.styleId !== "auto") {
    provenance.status = "suppressed";
    provenance.suppressedReasons.push("EXPLICIT_STYLE_SELECTION");
    return { provenance };
  }
  if (input.blogDNA || input.styleProfileName || input.customStyle?.trim()) {
    provenance.status = "suppressed";
    provenance.suppressedReasons.push("EXPLICIT_BLOG_DNA_OR_STYLE_PROFILE");
    return { provenance };
  }
  const preset = category.admitted.find((item) => item.id === category.defaultPresetId);
  if (!preset) {
    provenance.suppressedReasons.push("CATEGORY_DEFAULT_NOT_ADMITTED");
    return { provenance };
  }
  provenance.status = "applied";
  provenance.selectionMode = "category-auto";
  provenance.runtimePresetId = preset.id;
  provenance.toggles = { voice: true, paragraph: true, structure: input.structureId === "auto", image: true, visual: true };
  if (input.structureId !== "auto") provenance.suppressedReasons.push("EXPLICIT_STRUCTURE_SELECTION");
  const guidance = structuredClone(preset.tokens);
  if (!provenance.toggles.structure) {
    guidance.opening = [];
    guidance.sections = [];
    guidance.closing = [];
  }
  return { provenance, guidance };
}

const voicePrompt = {
  formal: "Use a consistent formal Korean sentence ending.",
  casual: "Use a consistent conversational Korean ending.",
  mixed: "Use controlled mixed Korean endings without abrupt shifts.",
  narrative: "Use calm declarative Korean narration.",
} as const;
const reactionPrompt = {
  active: "Allow restrained reactions only where the supplied experience supports them.",
  restrained: "Keep exclamations and emoji restrained.",
  neutral: "Keep reactions neutral.",
} as const;
const openingPrompt = {
  "brief-image-first": "Keep the opening brief before the first planned image.",
  "explain-then-image": "Give a short orientation before the first planned image.",
  "concise-title": "Keep the title concise.",
  "search-intent-title": "Reflect the selected topic intent in the title without adding facts.",
} as const;
const sectionPrompt = {
  "scene-caption-sequence": "Alternate a supported scene with a short explanation.",
  "text-image-interleave": "Interleave planned images and text instead of stacking all text together.",
  "heading-explanation-image": "Use heading, explanation, then the related planned image.",
  "section-bundle": "Keep each heading, explanation, and planned image in one section group.",
} as const;
const closingPrompt = {
  "brief-verdict": "End with a brief judgment grounded only in supplied information.",
  "limited-tags": "Use only a limited set of relevant tags.",
  "tag-bundle": "Place a compact tag group after the conclusion.",
  "search-tags": "Use relevant selected-topic tags without inventing entities.",
} as const;

export function observedStylePrompt(guidance: ObservedStyleGuidance, provenance: ObservedPresetProvenance): string {
  if (provenance.status !== "applied" || !isObservedStyleGuidance(guidance)) return "";
  const lines = [
    "[REVIEWED CATEGORY STYLE TOKENS v1]",
    "These are aggregate presentation tendencies, not factual source material. Never copy a source sentence or invent a place, price, schedule, product, or event.",
  ];
  if (provenance.toggles.voice) lines.push(voicePrompt[guidance.voice.register], reactionPrompt[guidance.voice.reaction]);
  if (provenance.toggles.paragraph) lines.push(`Use the planned ${guidance.paragraph.band} paragraph rhythm and the exact paragraph ranges in the layout plan.`);
  if (provenance.toggles.structure) {
    lines.push(...guidance.opening.map((item) => openingPrompt[item]));
    lines.push(...guidance.sections.map((item) => sectionPrompt[item]));
    lines.push(...guidance.closing.map((item) => closingPrompt[item]));
  }
  if (provenance.toggles.image) {
    lines.push(guidance.image.placement === "interleaved"
      ? "Follow the planned interleaved image anchors."
      : guidance.image.placement === "grouped"
        ? "Keep planned adjacent image groups together."
        : "Use planned images at section transitions.");
  }
  if (provenance.toggles.visual) {
    lines.push(guidance.visual.headingStyle === "heading-led" ? "Keep section boundaries explicit." : "Keep visual flow continuous between sections.");
    lines.push(guidance.visual.emphasis === "frequent" ? "Use emphasis only up to the layout-plan maximum." : "Use emphasis selectively.");
  }
  return lines.join("\n");
}

export function validateObservedStylePlanProjection(
  guidance: unknown,
  provenance: unknown,
  source?: unknown,
): string[] {
  if (guidance === undefined && provenance === undefined) return [];
  if (!isRecord(provenance)) return ["Observed style provenance is missing or invalid."];
  if (provenance.libraryId !== OBSERVED_STYLE_LIBRARY_ID || provenance.runtimeSchemaVersion !== 1
    || provenance.artifactClassification !== "source-derived-aggregate-style-tokens"
    || provenance.sourceSha256 !== REVIEWED_OBSERVED_STYLE_SOURCE_SHA256
    || provenance.artifactSha256 !== REVIEWED_OBSERVED_STYLE_ARTIFACT_SHA256 || provenance.admissionVersion !== 1
    || provenance.canonicalProjectionSha256 !== REVIEWED_OBSERVED_STYLE_CANONICAL_SHA256
    || provenance.ruleVersion !== OBSERVED_STYLE_RULE_VERSION || provenance.selectionPolicy !== OBSERVED_STYLE_SELECTION_POLICY
    || typeof provenance.categoryId !== "string" || typeof provenance.topicPresetId !== "string") {
    return ["Observed style provenance does not match the reviewed runtime artifact."];
  }
  if (source !== undefined) {
    if (!isRecord(source) || typeof source.categoryId !== "string" || typeof source.presetId !== "string"
      || typeof source.styleId !== "string" || typeof source.structureId !== "string"
      || typeof source.blogDNA !== "boolean") {
      return ["Observed style source context is invalid."];
    }
    if (provenance.categoryId !== source.categoryId || provenance.topicPresetId !== source.presetId) {
      return ["Observed style provenance does not match the layout-plan source context."];
    }
    if (provenance.status === "applied" && (source.styleId !== "auto" || source.blogDNA !== false)) {
      return ["Applied observed style conflicts with an explicit source style selection."];
    }
    if (provenance.status === "applied" && (!isRecord(provenance.toggles)
      || provenance.toggles.structure !== (source.structureId === "auto"))) {
      return ["Observed structure toggles do not match the layout-plan source selection."];
    }
  }
  if (!isRecord(provenance.toggles)
    || Object.keys(provenance.toggles).sort().join(",") !== "image,paragraph,structure,visual,voice"
    || !Object.values(provenance.toggles).every((value) => typeof value === "boolean")) {
    return ["Observed style toggles are invalid."];
  }
  if (!Array.isArray(provenance.suppressedReasons)
    || new Set(provenance.suppressedReasons).size !== provenance.suppressedReasons.length
    || !provenance.suppressedReasons.every((item) => typeof item === "string")) {
    return ["Observed style suppression record is invalid."];
  }
  if (!["applied", "suppressed", "unavailable"].includes(String(provenance.status))) {
    return ["Observed style status is invalid."];
  }
  const allTogglesOff = Object.values(provenance.toggles).every((value) => value === false);
  if (provenance.status === "suppressed") {
    const category = runtimeLibrary?.categories.find((item) => item.categoryId === provenance.categoryId);
    const allowedReasons = ["EXPLICIT_STYLE_SELECTION", "EXPLICIT_BLOG_DNA_OR_STYLE_PROFILE"];
    if (guidance !== undefined || provenance.selectionMode !== "none" || provenance.runtimePresetId !== undefined
      || !allTogglesOff || !category || provenance.suppressedReasons.length !== 1
      || !allowedReasons.includes(String(provenance.suppressedReasons[0]))) {
      return ["Suppressed observed style provenance is invalid."];
    }
    return [];
  }
  if (provenance.status === "unavailable") {
    const category = runtimeLibrary?.categories.find((item) => item.categoryId === provenance.categoryId);
    const reason = provenance.suppressedReasons[0];
    const reasonMatchesRuntime = provenance.suppressedReasons.length === 1 && (
      (reason === "RUNTIME_ARTIFACT_INVALID" && runtimeLibrary === null)
      || (reason === "CATEGORY_NOT_REVIEWED" && !categoryIds.has(provenance.categoryId))
      || (reason === "CATEGORY_NOT_ADMITTED" && categoryIds.has(provenance.categoryId) && !category)
      || (reason === "CATEGORY_DEFAULT_NOT_ADMITTED" && Boolean(category)
        && !category?.admitted.some((item) => item.id === category.defaultPresetId))
    );
    if (guidance !== undefined || provenance.selectionMode !== "none" || provenance.runtimePresetId !== undefined
      || !allTogglesOff || !reasonMatchesRuntime) {
      return ["Unavailable observed style provenance is invalid."];
    }
    return [];
  }
  if (!isObservedStyleGuidance(guidance)) return ["Observed style guidance is invalid."];
  if (provenance.selectionMode !== "category-auto" || typeof provenance.runtimePresetId !== "string") {
    return ["Observed style provenance does not match category-auto selection."];
  }
  const category = runtimeLibrary?.categories.find((item) => item.categoryId === provenance.categoryId);
  const preset = category?.admitted.find((item) => item.id === provenance.runtimePresetId);
  if (!category || category.defaultPresetId !== provenance.runtimePresetId || !preset) {
    return ["Observed style guidance is not the reviewed category default."];
  }
  if (provenance.toggles.voice !== true || provenance.toggles.paragraph !== true
    || typeof provenance.toggles.structure !== "boolean" || provenance.toggles.image !== true
    || provenance.toggles.visual !== true) {
    return ["Observed style toggles are invalid."];
  }
  if ((provenance.toggles.structure === false) !== provenance.suppressedReasons.includes("EXPLICIT_STRUCTURE_SELECTION")
    || provenance.suppressedReasons.some((item) => item !== "EXPLICIT_STRUCTURE_SELECTION")) {
    return ["Observed style suppression record is invalid."];
  }
  const expected = structuredClone(preset.tokens);
  if (provenance.toggles.structure === false) {
    expected.opening = [];
    expected.sections = [];
    expected.closing = [];
  }
  if (JSON.stringify(expected) !== JSON.stringify(guidance)) {
    return ["Observed style guidance is not the reviewed applied projection."];
  }
  return [];
}

export const OBSERVED_STYLE_RUNTIME_META = Object.freeze({
  available: Boolean(runtimeLibrary),
  artifactSha256: REVIEWED_OBSERVED_STYLE_ARTIFACT_SHA256,
  canonicalProjectionSha256: REVIEWED_OBSERVED_STYLE_CANONICAL_SHA256,
  sourceSha256: REVIEWED_OBSERVED_STYLE_SOURCE_SHA256,
  categories: runtimeLibrary?.counts.categories ?? 0,
  admitted: runtimeLibrary?.counts.admitted ?? 0,
  rejected: runtimeLibrary?.counts.rejected ?? 0,
});

export const canonicalObservedStyleDigestForTest = canonicalSha256;
