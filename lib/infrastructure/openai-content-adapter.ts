import OpenAI from "openai";
import { buildPrompt } from "../application/build-prompt";
import { GLOSSARY_GENERATION_INSTRUCTION } from "../domain/glossary";
import {
  KNOWLEDGE_GROUNDING_INSTRUCTION,
  parseKnowledgeCategories,
  shouldUseKnowledgeBase,
} from "../domain/knowledge-policy";
import { buildStyleReferenceInstruction } from "../domain/style-reference";
import type { BlogDraft, GenerateRequest, KnowledgeGrounding } from "../domain/types";

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI 응답에서 JSON을 찾지 못했습니다.");
  return raw.slice(start, end + 1);
}

function outputBudget(input: GenerateRequest) {
  if (input.length === "long") return 7000;
  if (input.length === "short") return 3000;
  return 5000;
}

function ragMaxResults() {
  const parsed = Number(process.env.BLOTORI_RAG_MAX_RESULTS ?? "6");
  if (!Number.isFinite(parsed)) return 6;
  return Math.max(1, Math.min(20, Math.round(parsed)));
}

function resolveRagConfig(input: GenerateRequest) {
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID?.trim();
  const enabled = process.env.BLOTORI_RAG_ENABLED !== "false";
  const categories = parseKnowledgeCategories(process.env.BLOTORI_RAG_CATEGORIES);
  const eligible = shouldUseKnowledgeBase(input, categories);
  if (!enabled || !vectorStoreId || !eligible) return null;
  return { vectorStoreId, maxResults: ragMaxResults() };
}

type LooseAnnotation = { type?: string; filename?: string };
type LooseSearchResult = { filename?: string; file_name?: string };

function extractKnowledgeGrounding(response: unknown, enabled: boolean): KnowledgeGrounding | undefined {
  if (!enabled) return undefined;
  const output = (response as { output?: unknown[] })?.output;
  if (!Array.isArray(output)) {
    return { enabled: true, used: false, provider: "openai-file-search", sourceNames: [], resultCount: 0 };
  }

  const sourceNames = new Set<string>();
  let resultCount = 0;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type === "file_search_call") {
      const results = Array.isArray(record.results) ? record.results : Array.isArray(record.search_results) ? record.search_results : [];
      resultCount += results.length;
      for (const result of results as LooseSearchResult[]) {
        const name = result.filename ?? result.file_name;
        if (name) sourceNames.add(name);
      }
    }
    if (record.type === "message" && Array.isArray(record.content)) {
      for (const contentItem of record.content as Array<Record<string, unknown>>) {
        const annotations = Array.isArray(contentItem.annotations) ? contentItem.annotations : [];
        for (const annotation of annotations as LooseAnnotation[]) {
          if (annotation.type === "file_citation" && annotation.filename) sourceNames.add(annotation.filename);
        }
      }
    }
  }
  return { enabled: true, used: sourceNames.size > 0 || resultCount > 0, provider: "openai-file-search", sourceNames: [...sourceNames], resultCount };
}

export async function generateWithOpenAI(input: GenerateRequest): Promise<BlogDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const client = new OpenAI({ apiKey });
  const rag = resolveRagConfig(input);
  const styleReferenceInstruction = buildStyleReferenceInstruction(input);
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    instructions: `사용자가 지정한 플랫폼, 주제, 카테고리, 문체, 글 구성과 조건을 정확히 반영해 실제 게시 가능한 한국어 블로그 원고를 작성하세요. Blotori, 생성기, API, 설정 화면, 샘플 모드, 프롬프트 사용법 등 도구 자체에 대한 설명은 사용자가 주제로 요청하지 않은 한 본문에 절대 포함하지 마세요. 출력은 JSON만 반환합니다.\n${styleReferenceInstruction}\n${GLOSSARY_GENERATION_INSTRUCTION}${rag ? KNOWLEDGE_GROUNDING_INSTRUCTION : ""}`,
    input: buildPrompt(input),
    max_output_tokens: outputBudget(input),
    ...(rag ? {
      tools: [{ type: "file_search" as const, vector_store_ids: [rag.vectorStoreId], max_num_results: rag.maxResults }],
      tool_choice: "required" as const,
      include: ["file_search_call.results" as const],
    } : {}),
  });

  const draft = JSON.parse(extractJson(response.output_text)) as BlogDraft;
  const knowledgeGrounding = extractKnowledgeGrounding(response, Boolean(rag));
  return knowledgeGrounding ? { ...draft, knowledgeGrounding } : draft;
}
