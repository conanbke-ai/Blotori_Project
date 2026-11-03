import { ensureWarnings, normalizeImagePlans } from "../domain/rules";
import { normalizeGlossaryFootnotes } from "../domain/glossary";
import {
  buildContentLayoutPlan,
  validateDraftFactIntegrity,
  validateDraftPresentationAgainstContentLayoutPlan,
} from "../domain/content-layout-plan";
import {
  CONTENT_LAYOUT_PLAN_UNAPPLIED_WARNING_PREFIX,
  FACT_INTEGRITY_BLOCKING_WARNING_PREFIX,
  type ContentLayoutPlan,
} from "../domain/content-layout-plan-contract";
import type { BlogDraft, GenerateRequest } from "../domain/types";
import { makeMockDraft } from "../infrastructure/mock-content-adapter";
import { generateWithOpenAI } from "../infrastructure/openai-content-adapter";

export type GenerationMode = "mock" | "api";

export interface GenerateBlogDraftResult {
  draft: BlogDraft;
  mode: GenerationMode;
}

export interface DraftGenerationProviders {
  mock: (input: GenerateRequest, contentLayoutPlan: ContentLayoutPlan) => BlogDraft;
  api: (input: GenerateRequest, contentLayoutPlan: ContentLayoutPlan) => Promise<BlogDraft>;
}

const defaultProviders: DraftGenerationProviders = {
  mock: makeMockDraft,
  api: generateWithOpenAI,
};

function normalizeDraft(draft: BlogDraft, imageCount: number): BlogDraft {
  const normalized = normalizeGlossaryFootnotes({
    ...draft,
    images: normalizeImagePlans(draft.images ?? [], imageCount),
    warnings: draft.warnings ?? [],
  });

  return ensureWarnings(normalized);
}

/** Attach only the deterministic pre-generation plan that the provider output actually followed. */
export function applyContentLayoutPlanToGeneratedDraft(
  draft: BlogDraft,
  imageCount: number,
  contentLayoutPlan: ContentLayoutPlan,
  inputWarnings: readonly string[] = [],
): BlogDraft {
  const providerValidation = validateDraftPresentationAgainstContentLayoutPlan(draft, contentLayoutPlan);
  const providerFacts = validateDraftFactIntegrity(draft, contentLayoutPlan);
  const normalized = normalizeDraft(draft, imageCount);
  const normalizedValidation = validateDraftPresentationAgainstContentLayoutPlan(normalized, contentLayoutPlan);
  const normalizedFacts = validateDraftFactIntegrity(normalized, contentLayoutPlan);
  const validationReasons = [
    ...providerValidation.reasons.map((reason) => `provider 출력: ${reason}`),
    ...normalizedValidation.reasons.map((reason) => `정규화 결과: ${reason}`),
  ];
  const planApplied = providerValidation.ok && normalizedValidation.ok;
  const factIntegrityPassed = providerFacts.ok && normalizedFacts.ok;
  const planWarnings = planApplied
    ? []
    : [`${CONTENT_LAYOUT_PLAN_UNAPPLIED_WARNING_PREFIX} 생성된 원고가 계획과 일치하지 않았어요. ${validationReasons.join(" ")}`];
  const factReasons = [
    ...providerFacts.reasons.map((reason) => `provider output: ${reason}`),
    ...normalizedFacts.reasons.map((reason) => `normalized output: ${reason}`),
  ];
  const factWarnings = factIntegrityPassed
    ? []
    : [`${FACT_INTEGRITY_BLOCKING_WARNING_PREFIX} 확인되지 않았거나 입력과 충돌하는 맛집 정보가 있어 본문 내보내기를 막았어요. ${factReasons.join(" ")}`];
  return {
    ...normalized,
    contentLayoutPlan: planApplied && factIntegrityPassed ? contentLayoutPlan : undefined,
    factIntegrityPlan: contentLayoutPlan.factPlan,
    warnings: [...new Set([...normalized.warnings, ...inputWarnings, ...planWarnings, ...factWarnings])],
  };
}

export async function generateBlogDraft(
  input: GenerateRequest,
  providers: DraftGenerationProviders = defaultProviders,
): Promise<GenerateBlogDraftResult> {
  const { plan, generationInput, warnings } = buildContentLayoutPlan(input);
  if (!process.env.OPENAI_API_KEY) {
    if (process.env.BLOTORI_MOCK_MODE === "true") {
      return {
        draft: applyContentLayoutPlanToGeneratedDraft(providers.mock(generationInput, plan), input.imageCount, plan, warnings),
        mode: "mock",
      };
    }

    throw new Error(
      "OPENAI_API_KEY가 서버에서 감지되지 않았습니다. 프로젝트 루트의 .env.local을 확인한 뒤 개발 서버를 완전히 종료하고 npm run dev로 다시 시작해 주세요.",
    );
  }

  const generated = await providers.api(generationInput, plan);
  return {
    draft: applyContentLayoutPlanToGeneratedDraft(generated, input.imageCount, plan, warnings),
    mode: "api",
  };
}
