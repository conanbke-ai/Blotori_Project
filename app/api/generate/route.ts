import { NextResponse } from "next/server";
import { generateBlogDraft } from "../../../lib/application/generate-blog-draft";
import { validateStyleReference } from "../../../lib/domain/style-reference";
import type { GenerateRequest } from "../../../lib/domain/types";
import { classifyError, createRequestId, logEvent } from "../../../lib/infrastructure/observability";

export const runtime = "nodejs";

function isValidInput(input: Partial<GenerateRequest>): input is GenerateRequest {
  const hasTopic = Boolean(input.presetId || input.freeTopic?.trim());
  const intensityValid = input.styleIntensity == null || (Number.isInteger(input.styleIntensity) && Number(input.styleIntensity) >= 1 && Number(input.styleIntensity) <= 5);
  return Boolean(input.platformId && hasTopic && input.styleId && intensityValid && input.structureId && input.length && Number.isInteger(input.imageCount) && Number(input.imageCount) >= 2 && Number(input.imageCount) <= 5);
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = Date.now();
  let input: Partial<GenerateRequest> | undefined;

  try {
    input = (await request.json()) as Partial<GenerateRequest>;
    if (!isValidInput(input)) {
      logEvent("warn", { event: "generation.rejected", requestId, durationMs: Date.now() - startedAt, status: "invalid_input", platformId: input.platformId, category: input.presetId });
      return NextResponse.json({ error: "플랫폼, 주제, 출력 설정을 확인해 주세요.", requestId }, { status: 400, headers: { "x-blotori-request-id": requestId } });
    }

    const styleReferenceError = validateStyleReference(input);
    if (styleReferenceError) {
      logEvent("warn", { event: "generation.rejected", requestId, durationMs: Date.now() - startedAt, status: "invalid_style_reference", platformId: input.platformId, category: input.presetId });
      return NextResponse.json({ error: styleReferenceError, requestId }, { status: 400, headers: { "x-blotori-request-id": requestId } });
    }

    logEvent("info", { event: "generation.started", requestId, status: "started", platformId: input.platformId, category: input.presetId, model: process.env.OPENAI_MODEL || "gpt-5.6-luna" });
    const result = await generateBlogDraft({ ...input, styleIntensity: input.styleIntensity ?? 3, attributes: input.attributes ?? {} });
    const grounding = result.draft.knowledgeGrounding;

    logEvent("info", { event: "generation.completed", requestId, durationMs: Date.now() - startedAt, status: "success", platformId: input.platformId, category: input.presetId, model: process.env.OPENAI_MODEL || "gpt-5.6-luna", ragEnabled: grounding?.enabled ?? false, ragUsed: grounding?.used ?? false, ragResultCount: grounding?.resultCount ?? 0, ragSourceCount: grounding?.sourceNames?.length ?? 0 });

    if (grounding?.enabled && !grounding.used) {
      logEvent("warn", { event: "rag.empty_result", requestId, durationMs: Date.now() - startedAt, status: "warning", category: input.presetId, ragEnabled: true, ragUsed: false, ragResultCount: grounding.resultCount, ragSourceCount: grounding.sourceNames.length, message: "RAG가 활성화됐지만 검색 근거가 사용되지 않았습니다." });
    }

    return NextResponse.json({ ...result, requestId }, { headers: { "x-blotori-request-id": requestId } });
  } catch (error) {
    const classified = classifyError(error);
    logEvent("error", { event: "generation.failed", requestId, durationMs: Date.now() - startedAt, status: "error", platformId: input?.platformId, category: input?.presetId, model: process.env.OPENAI_MODEL || "gpt-5.6-luna", errorCode: classified.code, message: classified.message });
    return NextResponse.json({ error: error instanceof Error ? error.message : "생성 중 오류가 발생했습니다.", requestId }, { status: 500, headers: { "x-blotori-request-id": requestId } });
  }
}
