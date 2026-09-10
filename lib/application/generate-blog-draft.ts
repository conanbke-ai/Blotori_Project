import { ensureWarnings, normalizeImagePlans } from "../domain/rules";
import type { BlogDraft, GenerateRequest } from "../domain/types";
import { makeMockDraft } from "../infrastructure/mock-content-adapter";
import { generateWithOpenAI } from "../infrastructure/openai-content-adapter";

export type GenerationMode = "mock" | "api";

export interface GenerateBlogDraftResult {
  draft: BlogDraft;
  mode: GenerationMode;
}

function normalizeDraft(draft: BlogDraft, imageCount: number): BlogDraft {
  return ensureWarnings({
    ...draft,
    images: normalizeImagePlans(draft.images ?? [], imageCount),
    warnings: draft.warnings ?? [],
  });
}

export async function generateBlogDraft(input: GenerateRequest): Promise<GenerateBlogDraftResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      draft: normalizeDraft(makeMockDraft(input), input.imageCount),
      mode: "mock",
    };
  }

  const generated = await generateWithOpenAI(input);
  return {
    draft: normalizeDraft(generated, input.imageCount),
    mode: "api",
  };
}
