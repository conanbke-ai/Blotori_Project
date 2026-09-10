export type PlatformId = "naver" | "tistory" | "blogger" | "wordpress" | "brunch" | "other";
export type StyleId = "auto" | "custom" | "easy-expert" | "patient-guide" | "professional-column" | "honest-review" | "casual-daily" | "emotional-essay" | "concise-record" | "friendly-info" | "playful";
export type StructureId = "auto" | "custom" | "information" | "guide" | "review" | "story" | "faq" | "checklist" | "comparison";
export type Length = "short" | "medium" | "long";
export type ImageRole = "HERO" | "CONTEXT" | "EXPLAINER" | "PROCESS" | "TIP" | "CAUTION";
export type TextAlign = "left" | "center";
export type EmphasisKind = "bold" | "accent" | "highlight";
export type SectionVisualStyle = "standard" | "key-point" | "callout" | "quote";
export type ImageContinuityMode = "independent" | "series";

export interface GenerateRequest {
  platformId: PlatformId;
  otherPlatform?: string;
  categoryId?: string;
  presetId?: string;
  freeTopic?: string;
  attributes: Record<string, string>;
  extraConditions?: string;
  styleId: StyleId;
  customStyle?: string;
  structureId: StructureId;
  customStructure?: string;
  length: Length;
  imageCount: number;
}

export interface TextEmphasis {
  phrase: string;
  kind: EmphasisKind;
}

export interface SectionPresentation {
  headingAlign?: TextAlign;
  bodyAlign?: TextAlign;
  visualStyle?: SectionVisualStyle;
  emphasis?: TextEmphasis[];
}

export interface DraftPresentation {
  titleAlign?: TextAlign;
  introAlign?: TextAlign;
  density?: "airy" | "balanced" | "dense";
}

export interface ImagePlan {
  id: string;
  role: ImageRole;
  label: string;
  placement: string;
  afterSectionId: string | null;
  ratio: "16:9" | "4:3" | "1:1" | "4:5" | "3:2";
  size: string;
  prompt: string;
  continuityMode?: ImageContinuityMode;
  continuityGroup?: string | null;
  subjectProfile?: string;
  referenceImageId?: string | null;
}

export interface BlogSection {
  id: string;
  heading: string;
  paragraphs: string[];
  presentation?: SectionPresentation;
}

export interface BlogDraft {
  title: string;
  titleCandidates?: string[];
  titlePurpose?: string;
  summary: string;
  styleUsed?: string;
  structureUsed?: string;
  presentation?: DraftPresentation;
  intro: string[];
  sections: BlogSection[];
  closing: string[];
  tags: string[];
  images: ImagePlan[];
  warnings: string[];
}

export interface PlatformExport {
  platformId: PlatformId;
  label: string;
  plainText: string;
  html?: string;
  tagsText: string;
  clipboardMode: "plain" | "rich";
}
