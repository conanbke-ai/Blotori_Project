export type PlatformId = "naver" | "tistory" | "blogger" | "wordpress" | "brunch" | "other";
export type StyleId = "auto" | "custom" | "easy-expert" | "patient-guide" | "professional-column" | "honest-review" | "casual-daily" | "emotional-essay" | "concise-record" | "friendly-info" | "playful";
export type StructureId = "auto" | "custom" | "information" | "guide" | "review" | "story" | "faq" | "checklist" | "comparison";
export type Length = "short" | "medium" | "long";
export type ImageRole = "HERO" | "CONTEXT" | "EXPLAINER" | "PROCESS" | "TIP" | "CAUTION";

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

export interface ImagePlan {
  id: string;
  role: ImageRole;
  label: string;
  placement: string;
  afterSectionId: string | null;
  ratio: "16:9" | "4:3" | "1:1" | "4:5" | "3:2";
  size: string;
  prompt: string;
}

export interface BlogSection {
  id: string;
  heading: string;
  paragraphs: string[];
}

export interface BlogDraft {
  title: string;
  summary: string;
  styleUsed?: string;
  structureUsed?: string;
  intro: string[];
  sections: BlogSection[];
  closing: string[];
  tags: string[];
  images: ImagePlan[];
  warnings: string[];
}
