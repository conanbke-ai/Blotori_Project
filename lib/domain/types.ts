export type PlatformId = "naver" | "tistory" | "blogger" | "wordpress" | "brunch" | "other";
export type StyleId = "auto" | "custom" | "easy-expert" | "patient-guide" | "professional-column" | "honest-review" | "casual-daily" | "emotional-essay" | "concise-record" | "friendly-info" | "playful" | "shareable-info";
export type StyleIntensity = 1 | 2 | 3 | 4 | 5;
export type StructureId = "auto" | "custom" | "information" | "guide" | "review" | "story" | "faq" | "checklist" | "comparison";
export type Length = "short" | "medium" | "long";
export type ImageRole = "HERO" | "CONTEXT" | "EXPLAINER" | "PROCESS" | "TIP" | "CAUTION";
export type TextAlign = "left" | "center";
export type EmphasisKind = "bold" | "accent" | "highlight";
export type SectionVisualStyle = "standard" | "key-point" | "callout" | "quote" | "glossary";
export type ImageContinuityMode = "independent" | "series";

export interface BlogDNAApplyOptions {
  voice: boolean;
  mood: boolean;
  structure: boolean;
  imageRhythm: boolean;
  visual: boolean;
}

export interface BlogDNAVoiceProfile {
  summary: string;
  endings: string[];
  sentenceRhythm: string;
  paragraphRhythm: string;
  transitions: string[];
  lexicalHabits: string[];
  emotionPattern: string;
  readerDistance: string;
  punctuationHabits: string[];
  avoid: string[];
  metrics?: {
    avgSentenceChars?: number;
    avgParagraphSentences?: number;
    questionRate?: string;
    exclamationRate?: string;
    emoticonDensity?: string;
  };
}

export interface BlogDNAMoodProfile {
  summary: string;
  keywords: string[];
  warmth: string;
  energy: string;
  intimacy: string;
  informationDensity: string;
  visualMood: string;
}

export interface BlogDNAStructureProfile {
  summary: string;
  openingPatterns: string[];
  sectionPatterns: string[];
  closingPatterns: string[];
  fixedPrinciples: string[];
  flexiblePatterns: string[];
  contentBalance: string;
}

export interface BlogDNAImageRhythmProfile {
  summary: string;
  cadence: string;
  grouping: string;
  placementRules: string[];
  rolePreferences: string[];
  adaptationRules: string[];
}

export interface BlogDNAVisualProfile {
  summary: string;
  alignment: string;
  emphasis: string;
  whitespace: string;
  headingStyle: string;
  decorationHabits: string[];
  avoid: string[];
}

export interface BlogDNAVariationProfile {
  identityFidelity: number;
  structureFreedom: number;
  wordingFreedom: number;
  imageFreedom: number;
  antiRepetitionRules: string[];
}

export interface BlogDNAProfile {
  version: 2;
  signature: string;
  confidence: "high" | "medium" | "low";
  evidenceSummary: string;
  voice: BlogDNAVoiceProfile;
  mood: BlogDNAMoodProfile;
  structure: BlogDNAStructureProfile;
  imageRhythm: BlogDNAImageRhythmProfile;
  visual: BlogDNAVisualProfile;
  variation: BlogDNAVariationProfile;
}

export interface ReferenceFileInput {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface GenerateRequest {
  platformId: PlatformId;
  otherPlatform?: string;
  categoryId?: string;
  presetId?: string;
  freeTopic?: string;
  attributes: Record<string, string>;
  extraConditions?: string;
  styleId: StyleId;
  styleIntensity?: StyleIntensity;
  customStyle?: string;
  styleProfileName?: string;
  blogDNA?: BlogDNAProfile;
  blogDNAApply?: Partial<BlogDNAApplyOptions>;
  recentLayoutFingerprints?: string[];
  variationNonce?: string;
  structureId: StructureId;
  customStructure?: string;
  length: Length;
  imageCount: number;
  referenceFiles?: ReferenceFileInput[];
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

export interface KnowledgeGrounding {
  enabled: boolean;
  used: boolean;
  provider: "openai-file-search";
  sourceNames: string[];
  resultCount: number;
}

export interface BlogDraft {
  title: string;
  titleCandidates?: string[];
  titlePurpose?: string;
  summary: string;
  styleUsed?: string;
  structureUsed?: string;
  layoutFingerprint?: string;
  presentation?: DraftPresentation;
  intro: string[];
  sections: BlogSection[];
  closing: string[];
  tags: string[];
  images: ImagePlan[];
  warnings: string[];
  knowledgeGrounding?: KnowledgeGrounding;
}

export interface PlatformExport {
  platformId: PlatformId;
  label: string;
  titleText: string;
  plainText: string;
  html?: string;
  tagsText: string;
  formattingGuide?: string;
  clipboardMode: "plain" | "rich";
}
