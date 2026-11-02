import type { ImageRole, SectionVisualStyle, StructureId } from "./types";

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
  };
  sections: ContentLayoutSection[];
  paragraphChars: [number, number];
  headingDensity: "sparse" | "regular" | "high";
  imageAnchors: Array<{ slot: number; role: ImageRole; afterSectionId: string | null }>;
  typography: { title: "editorial" | "utility" | "feature"; body: "narrative" | "scannable" | "mixed" };
  emphasis: { maxPerSection: number; kinds: Array<"bold" | "accent" | "highlight">; cardLimit: number };
  naverLoss: Array<{ feature: string; outcome: "EQUIVALENT" | "DEGRADED" }>;
  missingFacts: string[];
  consistencyWarnings?: string[];
}
