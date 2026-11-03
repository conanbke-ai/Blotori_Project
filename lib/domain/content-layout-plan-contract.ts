import type { ImageRole, SectionVisualStyle, StructureId, TextAlign } from "./types";
import type { FactPlan } from "./fact-provenance";
import type { ObservedPresetProvenance, ObservedStyleGuidance } from "./observed-style";

export const PRESENTATION_PLAN_MISMATCH_WARNING_PREFIX = "편집 표현 계획 불일치:";
export const FACT_INTEGRITY_BLOCKING_WARNING_PREFIX = "사실 무결성 차단:";
/** Backward-compatible name for callers that only need the presentation warning prefix. */
export const CONTENT_LAYOUT_PLAN_UNAPPLIED_WARNING_PREFIX = PRESENTATION_PLAN_MISMATCH_WARNING_PREFIX;

export type ContentIntent = "experience" | "information" | "curation";
export type ContentPurposeField = "goal" | "learningGoal" | "visitPurpose";
export type ContentSectionKind = "scene" | "food" | "practical" | "verdict" | "context" | "evidence" | "application" | "takeaway";

export interface ContentLayoutSection {
  id: string;
  kind: ContentSectionKind;
  heading: string;
  priority: number;
  requiredAnyOf: string[];
  optionalFactKeys: string[];
  paragraphRange: [number, number];
  visualStyle: SectionVisualStyle;
}
export interface ContentLayoutPlan {
  version: 1;
  intent: ContentIntent;
  source: {
    categoryId: string;
    presetId: string;
    styleId: string;
    structureId: StructureId;
    blogDNA: boolean;
    /** Additive v1 provenance fields. Older persisted v1 plans may omit them. */
    freeTopic?: string;
    purposeField?: ContentPurposeField | null;
    purposeValue?: string;
    excludedPurposeFields?: ContentPurposeField[];
    /** Server-derived reviewed aggregate provenance. Never accepted from the client request. */
    observedStyle?: ObservedPresetProvenance;
  };
  /** Constrained aggregate style tokens. Free-form source text is never stored here. */
  observedStyle?: ObservedStyleGuidance;
  sections: ContentLayoutSection[];
  paragraphChars: [number, number];
  headingDensity: "sparse" | "regular" | "high";
  imageAnchors: Array<{
    slot: number;
    role: ImageRole;
    afterSectionId: string | null;
    /** Additive v1 display intent. Older persisted v1 plans may omit it. */
    display?: { widthPercent: 25 | 50 | 75 | 100; align: "left" | "center" | "right" };
  }>;
  typography: {
    title: "editorial" | "utility" | "feature";
    body: "narrative" | "scannable" | "mixed";
    /** Additive v1 presentation intent. Older persisted v1 plans may omit it. */
    titleAlign?: TextAlign;
    introAlign?: TextAlign;
    density?: "airy" | "balanced" | "dense";
  };
  emphasis: {
    maxPerSection: number;
    kinds: Array<"bold" | "accent" | "highlight">;
    cardLimit: number;
    /** Minimum number of sections that must carry a valid, in-paragraph emphasis. */
    minimumSections?: number;
  };
  naverLoss: Array<{ feature: string; outcome: "EQUIVALENT" | "DEGRADED" }>;
  missingFacts: string[];
  /** Optional additive provenance projection. Older persisted v1 plans omit it. */
  factPlan?: FactPlan;
  consistencyWarnings?: string[];
}
