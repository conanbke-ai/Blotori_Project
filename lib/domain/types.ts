export type Tone = "friendly" | "professional" | "warm";
export type Length = "short" | "medium" | "long";
export type ImageRole = "HERO" | "CONTEXT" | "EXPLAINER" | "PROCESS" | "TIP" | "CAUTION";

export interface GenerateRequest {
  topic: string;
  category?: string;
  ageGroup?: string;
  bodyPart?: string;
  treatmentMethod?: string;
  posture?: string;
  tone: Tone;
  length: Length;
  imageCount: number;
  clinicNote?: string;
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
  intro: string[];
  sections: BlogSection[];
  closing: string[];
  tags: string[];
  images: ImagePlan[];
  warnings: string[];
}
