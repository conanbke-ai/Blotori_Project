import type { BlogDraft, GenerateRequest } from "../domain/types";
import type { ContentLayoutPlan } from "../domain/content-layout-plan-contract";

export type GenerationMode = "mock" | "api";

export interface ContentGenerationPort {
  readonly mode: GenerationMode;
  generate(input: GenerateRequest, plan: ContentLayoutPlan): Promise<BlogDraft>;
}
