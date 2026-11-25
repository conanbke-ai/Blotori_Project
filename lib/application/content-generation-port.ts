import type { BlogDraft, GenerateRequest } from "../domain/types";

export type GenerationMode = "mock" | "api";

export interface ContentGenerationPort {
  readonly mode: GenerationMode;
  generate(input: GenerateRequest): Promise<BlogDraft>;
}
