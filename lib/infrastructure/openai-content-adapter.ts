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

export async function generateWithOpenAI(input: GenerateRequest): Promise<BlogDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    instructions: "의료·건강 정보성 블로그 초안을 구조화된 JSON으로 작성하세요. 출력은 JSON만 반환합니다.",
    input: buildPrompt(input),
  });

  return JSON.parse(extractJson(response.output_text)) as BlogDraft;
}
