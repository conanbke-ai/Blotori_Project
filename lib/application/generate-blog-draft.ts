import { ensureWarnings, normalizeImagePlans } from "../domain/rules";
import { normalizeGlossaryFootnotes } from "../domain/glossary";
import type { BlogDraft, GenerateRequest } from "../domain/types";
import type { ContentGenerationPort, GenerationMode } from "./content-generation-port";

export type { GenerationMode } from "./content-generation-port";

export interface GenerateBlogDraftResult {
  draft: BlogDraft;
  mode: GenerationMode;
}

function normalizeDraft(draft: BlogDraft, imageCount: number): BlogDraft {
  const normalized = normalizeGlossaryFootnotes({
    ...draft,
    images: normalizeImagePlans(draft.images ?? [], imageCount),
    warnings: draft.warnings ?? [],
  });

  return ensureWarnings(normalized);
}

export async function generateBlogDraft(input: GenerateRequest, provider: ContentGenerationPort): Promise<GenerateBlogDraftResult> {
  const generated = await provider.generate(input);
  return {
    draft: normalizeDraft(generated, input.imageCount),
    mode: provider.mode,
  };
}
