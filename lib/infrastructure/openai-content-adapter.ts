import OpenAI from "openai";
import { buildPrompt } from "../application/build-prompt";
import type { BlogDraft, GenerateRequest } from "../domain/types";

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

export async function generateWithOpenAI(input: GenerateRequest): Promise<BlogDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    instructions:
      "사용자가 지정한 플랫폼, 주제, 카테고리, 문체, 글 구성과 조건을 정확히 반영해 실제 게시 가능한 한국어 블로그 원고를 작성하세요. Blotori, 생성기, API, 설정 화면, 샘플 모드, 프롬프트 사용법 등 도구 자체에 대한 설명은 사용자가 주제로 요청하지 않은 한 본문에 절대 포함하지 마세요. 출력은 JSON만 반환합니다.",
    input: buildPrompt(input),
    max_output_tokens: outputBudget(input),
  });

  return JSON.parse(extractJson(response.output_text)) as BlogDraft;
}
