import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SourceType = "blog" | "post" | "pasted_text" | "manual";

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("문체 분석 결과를 읽지 못했습니다.");
  return JSON.parse(raw.slice(start, end + 1)) as { suggestedName?: string; signature?: string };
}

function validUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch { return false; }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sourceType?: SourceType; source?: string };
    const sourceType = body.sourceType;
    const source = body.source?.trim() ?? "";
    if (!sourceType || !["blog", "post", "pasted_text", "manual"].includes(sourceType) || !source) {
      return NextResponse.json({ error: "문체 참고 방식과 내용을 확인해 주세요." }, { status: 400 });
    }
    if ((sourceType === "blog" || sourceType === "post") && !validUrl(source)) {
      return NextResponse.json({ error: "http 또는 https 블로그 주소를 입력해 주세요." }, { status: 400 });
    }
    if ((sourceType === "pasted_text" || sourceType === "manual") && source.length > 20000) {
      return NextResponse.json({ error: "붙여넣는 글은 20,000자 이하로 줄여 주세요." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 503 });
    const client = new OpenAI({ apiKey });
    const isUrl = sourceType === "blog" || sourceType === "post";
    const scope = sourceType === "blog" ? "해당 블로그에서 공개적으로 확인 가능한 여러 글의 공통 문체" : sourceType === "post" ? "해당 단일 포스팅의 문체" : sourceType === "pasted_text" ? "사용자가 붙여넣은 글의 문체" : "사용자가 설명한 목표 문체";
    const input = `다음 자료를 바탕으로 한국어 블로그 글쓰기 문체 프로필을 만들어라.\n참고 범위: ${scope}\n자료: ${source}\n\n원문 문장을 길게 인용하거나 복제하지 말고 스타일 특성만 추출한다. 다음 요소를 구체적으로 분석한다: 말투/종결어미, 문장 길이, 문단 호흡, 도입 방식, 소제목 방식, 정보와 경험의 배치, 질문·감탄·이모지 사용, 전환 표현, 강조 방식, 마무리 방식. 접근할 수 없는 링크라면 추측하지 말고 signature에 '링크 내용을 충분히 확인하지 못함'을 명시한다.\n\nJSON만 출력한다:\n{"suggestedName":"짧은 한국어 문체 이름","signature":"재사용 가능한 한국어 문체 지침. 8~12개 항목 정도"}`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input,
      ...(isUrl ? { tools: [{ type: "web_search" } as never] } : {}),
      max_output_tokens: 1400,
    });
    const parsed = extractJson(response.output_text);
    if (!parsed.signature) throw new Error("분석된 문체가 비어 있습니다.");
    return NextResponse.json({ suggestedName: parsed.suggestedName || "새 문체", signature: parsed.signature });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "문체 분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
