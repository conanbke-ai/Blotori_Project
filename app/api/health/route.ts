import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

function parseCategories(value?: string) {
  return (value ?? "health")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function knowledgeStatus() {
  const enabled = process.env.BLOTORI_RAG_ENABLED !== "false";
  const vectorStoreDetected = Boolean(process.env.OPENAI_VECTOR_STORE_ID?.trim());
  const categories = parseCategories(process.env.BLOTORI_RAG_CATEGORIES);
  const parsedMax = Number(process.env.BLOTORI_RAG_MAX_RESULTS ?? "6");
  const maxResults = Number.isFinite(parsedMax) ? Math.max(1, Math.min(20, Math.round(parsedMax))) : 6;

  return {
    enabled,
    vectorStoreDetected,
    ready: enabled && vectorStoreDetected,
    categories,
    maxResults,
    message: !enabled
      ? "RAG가 환경설정에서 비활성화되어 있습니다."
      : vectorStoreDetected
        ? "Knowledge Base 연결 설정이 감지되었습니다. 실제 사용 여부는 생성 결과의 근거 사용 상태에서 확인합니다."
        : "OPENAI_VECTOR_STORE_ID가 없어 Knowledge Base 검색은 사용되지 않습니다.",
  };
}

function diagnostics() {
  const cwd = process.cwd();
  const envFiles = [".env.local", ".env", ".env.development.local", ".env.development", ".env.local.txt", ".env.txt"];
  const envFileStatus = Object.fromEntries(envFiles.map((name) => [name, existsSync(join(cwd, name))]));
  const openAiVariableNames = Object.keys(process.env)
    .filter((name) => /OPENAI|GPT|BLOTORI_RAG/i.test(name))
    .sort();

  return { cwd, envFileStatus, openAiVariableNames };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const verify = url.searchParams.get("verify") === "1";
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const diag = diagnostics();
  const knowledge = knowledgeStatus();

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      keyDetected: false,
      model,
      verified: false,
      message: "OPENAI_API_KEY가 Next.js 서버에서 감지되지 않았습니다.",
      knowledge,
      diagnostics: diag,
    });
  }

  if (!verify) {
    return NextResponse.json({
      ok: true,
      keyDetected: true,
      model,
      verified: false,
      message: "API 키가 서버 환경변수에서 감지되었습니다. 실제 호출 검증은 연결 테스트에서 수행합니다.",
      knowledge,
      diagnostics: diag,
    });
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      input: "Reply with only OK.",
      max_output_tokens: 16,
    });

    return NextResponse.json({
      ok: true,
      keyDetected: true,
      model,
      verified: true,
      message: "OpenAI API 실제 호출까지 확인되었습니다.",
      sample: response.output_text.trim().slice(0, 32),
      knowledge,
      diagnostics: diag,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        keyDetected: true,
        model,
        verified: true,
        message: error instanceof Error ? error.message : "OpenAI API 연결 확인 중 오류가 발생했습니다.",
        knowledge,
        diagnostics: diag,
      },
      { status: 502 },
    );
  }
}
