import { ensureWarnings, normalizeImagePlans } from "../domain/rules";
import { normalizeGlossaryFootnotes } from "../domain/glossary";
import type { BlogDraft, GenerateRequest } from "../domain/types";
import { makeMockDraft } from "../infrastructure/mock-content-adapter";
import { generateWithOpenAI } from "../infrastructure/openai-content-adapter";

export type GenerationMode = "mock" | "api";

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

export async function generateBlogDraft(input: GenerateRequest): Promise<GenerateBlogDraftResult> {
  if (!process.env.OPENAI_API_KEY) {
    if (process.env.BLOTORI_MOCK_MODE === "true") {
      return {
        draft: normalizeDraft(makeMockDraft(input), input.imageCount),
        mode: "mock",
      };
    }

    throw new Error(
      "OPENAI_API_KEY가 서버에서 감지되지 않았습니다. 프로젝트 루트의 .env.local을 확인한 뒤 개발 서버를 완전히 종료하고 npm run dev로 다시 시작해 주세요.",
    );
  }

  const generated = await generateWithOpenAI(input);
  return {
    draft: normalizeDraft(generated, input.imageCount),
    mode: "api",
  };
}
