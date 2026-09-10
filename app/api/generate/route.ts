import { NextResponse } from "next/server";
import { generateBlogDraft } from "../../../lib/application/generate-blog-draft";
import type { GenerateRequest } from "../../../lib/domain/types";

export const runtime = "nodejs";

function isValidInput(input: Partial<GenerateRequest>): input is GenerateRequest {
  const hasTopic = Boolean(input.presetId || input.freeTopic?.trim());
  return Boolean(
    input.platformId &&
      hasTopic &&
      input.styleId &&
      input.structureId &&
      input.length &&
      Number.isInteger(input.imageCount) &&
      Number(input.imageCount) >= 2 &&
      Number(input.imageCount) <= 5,
  );
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Partial<GenerateRequest>;
    if (!isValidInput(input)) {
      return NextResponse.json({ error: "플랫폼, 주제, 출력 설정을 확인해 주세요." }, { status: 400 });
    }

    const result = await generateBlogDraft({ ...input, attributes: input.attributes ?? {} });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
