import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const verify = url.searchParams.get("verify") === "1";
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      keyDetected: false,
      model,
      verified: false,
      message: "OPENAI_API_KEY가 Next.js 서버에서 감지되지 않았습니다.",
    });
  }

  if (!verify) {
    return NextResponse.json({
      ok: true,
      keyDetected: true,
      model,
      verified: false,
      message: "API 키가 서버 환경변수에서 감지되었습니다. 실제 호출 검증은 verify=1에서 수행합니다.",
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
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        keyDetected: true,
        model,
        verified: true,
        message: error instanceof Error ? error.message : "OpenAI API 연결 확인 중 오류가 발생했습니다.",
      },
      { status: 502 },
    );
  }
}
