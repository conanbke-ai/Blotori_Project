import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { BlogDNAProfile } from "../../../../lib/domain/types";
import { captureRenderedBlogEvidence, type RenderedBlogEvidence } from "../../../../lib/infrastructure/rendered-blog-capture";

export const runtime = "nodejs";

type SourceType = "blog" | "post" | "pasted_text" | "manual";

type AnalysisResponse = {
  suggestedName?: string;
  signature?: string;
  blogDNA?: BlogDNAProfile;
};

function extractJson(text: string) {
  const fenced = text.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/i)?.[1];
  const raw = (fenced ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("블로그 스타일 분석 결과를 읽지 못했습니다.");
  return JSON.parse(raw.slice(start, end + 1)) as AnalysisResponse;
}

function renderedEvidenceText(evidence: RenderedBlogEvidence) {
  const pages = evidence.pages.map((page, pageIndex) => ({
    page: pageIndex + 1,
    url: page.url,
    title: page.title,
    viewport: page.viewport,
    documentHeight: page.documentHeight,
    frameCount: page.frameCount,
    headings: page.headings.slice(0, 24),
    blocks: page.blocks.slice(0, 80).map((block) => ({
      order: block.order,
      tag: block.tag,
      text: block.text.slice(0, 260),
      align: block.align,
      fontSize: block.fontSize,
      fontWeight: block.fontWeight,
      backgroundColor: block.backgroundColor,
      marginTop: block.marginTop,
      marginBottom: block.marginBottom,
      width: block.width,
      height: block.height,
    })),
    images: page.images.slice(0, 70).map((image) => ({
      order: image.order,
      alt: image.alt,
      width: image.width,
      height: image.height,
      top: image.top,
      nearestTextBefore: image.nearestTextBefore,
      nearestTextAfter: image.nearestTextAfter,
    })),
    textPreview: page.textPreview.slice(0, 9000),
  }));
  return JSON.stringify({
    captureType: "rendered-browser",
    capturedAt: evidence.capturedAt,
    limitation: evidence.limitation,
    pages,
  });
}

function validUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function fallbackDNA(signature: string): BlogDNAProfile {
  return {
    version: 2,
    signature,
    confidence: "low",
    evidenceSummary: "기존 문체 분석 결과를 호환용 Blog DNA로 변환했습니다. 시각·이미지 리듬 근거는 제한적입니다.",
    voice: {
      summary: signature,
      endings: [],
      sentenceRhythm: "분석 정보 부족",
      paragraphRhythm: "분석 정보 부족",
      transitions: [],
      lexicalHabits: [],
      emotionPattern: "분석 정보 부족",
      readerDistance: "분석 정보 부족",
      punctuationHabits: [],
      avoid: [],
    },
    mood: {
      summary: "분석 정보 부족",
      keywords: [],
      warmth: "unknown",
      energy: "unknown",
      intimacy: "unknown",
      informationDensity: "unknown",
      visualMood: "unknown",
    },
    structure: {
      summary: "분석 정보 부족",
      openingPatterns: [],
      sectionPatterns: [],
      closingPatterns: [],
      fixedPrinciples: [],
      flexiblePatterns: [],
      contentBalance: "분석 정보 부족",
    },
    imageRhythm: {
      summary: "링크의 실제 렌더링/이미지 배치를 충분히 확인하지 못함",
      cadence: "adaptive",
      grouping: "adaptive",
      placementRules: [],
      rolePreferences: [],
      adaptationRules: ["실제 입력 이미지 수와 콘텐츠 의미를 우선해 자연스럽게 재배치한다."],
    },
    visual: {
      summary: "링크의 실제 렌더링/꾸밈을 충분히 확인하지 못함",
      alignment: "adaptive",
      emphasis: "adaptive",
      whitespace: "adaptive",
      headingStyle: "adaptive",
      decorationHabits: [],
      avoid: [],
    },
    variation: {
      identityFidelity: 0.82,
      structureFreedom: 0.38,
      wordingFreedom: 0.48,
      imageFreedom: 0.42,
      antiRepetitionRules: [
        "같은 도입 문장과 동일한 소제목 순서를 반복하지 않는다.",
        "스타일의 정체성은 유지하되 블록 순서는 콘텐츠에 맞게 변주한다.",
      ],
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sourceType?: SourceType; source?: string };
    const sourceType = body.sourceType;
    const source = body.source?.trim() ?? "";
    if (!sourceType || !["blog", "post", "pasted_text", "manual"].includes(sourceType) || !source) {
      return NextResponse.json({ error: "참고 방식과 내용을 확인해 주세요." }, { status: 400 });
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
    let renderedEvidence: RenderedBlogEvidence | null = null;
    let renderedCaptureError = "";
    if (isUrl && process.env.BLOTORI_RENDERED_ANALYSIS !== "off") {
      try {
        renderedEvidence = await captureRenderedBlogEvidence(source, sourceType);
      } catch (error) {
        renderedCaptureError = error instanceof Error ? error.message : "렌더링 캡처 실패";
      }
    }
    const scope =
      sourceType === "blog"
        ? "해당 블로그에서 공개적으로 확인 가능한 여러 글의 공통 편집 DNA. 가능하면 여러 대표/최근 글의 공통점과 변주 폭을 함께 파악한다."
        : sourceType === "post"
          ? "해당 단일 포스팅의 편집 DNA"
          : sourceType === "pasted_text"
            ? "사용자가 붙여넣은 글의 문체와 구조"
            : "사용자가 설명한 목표 스타일";

    const input = `다음 자료를 바탕으로 한국어 블로그의 'Blog DNA'를 분석하라.
참고 범위: ${scope}
자료: ${source}
${renderedEvidence ? `\n[실제 브라우저 렌더링 증거]\n${renderedEvidenceText(renderedEvidence)}\n` : ""}
${renderedCaptureError ? `\n[렌더링 캡처 제한]\n${renderedCaptureError}\n실제 브라우저 렌더링 증거를 확보하지 못했으므로 시각/이미지 배치에 대해 추측하지 않는다.\n` : ""}

목표는 원문 문장을 복사하는 것이 아니라, 새 주제에도 자연스럽게 이식할 수 있는 편집 규칙을 추출하는 것이다.
특정 문구/표현을 그대로 재사용하지 말고 패턴·분포·리듬으로 설명한다.

반드시 다음을 분리해서 분석한다.
1) voice: 종결어미, 문장 길이, 문단 호흡, 전환어, 어휘 습관, 감정표현, 독자와 거리, 문장부호/ㅋㅋ/ㅎㅎ/이모지, 피해야 할 표현.
2) mood: 따뜻함/차분함/수다스러움/전문성/감성/정보밀도 등 블로그 전체 분위기.
3) structure: 도입 패턴, 섹션 전개, 마무리, 고정에 가까운 원칙과 유연하게 바뀌는 부분, 정보:경험:감정 비율.
4) imageRhythm: 이미지가 텍스트 사이에서 어떤 박자로 등장하는지, 묶음 배치, 역할, 사진 수가 달라질 때 어떻게 재분배해야 자연스러운지.
5) visual: 정렬, 강조, 여백, 소제목, 구분선/박스/이모지/캡션 등 꾸밈 습관.
6) variation: 공장형 반복을 막기 위한 변주 폭. 정체성은 유지하되 구조/표현/사진 배치를 매번 동일하게 만들지 않는다.

중요:
- 실제 브라우저 렌더링 증거가 있으면 DOM 순서, 이미지 위치/크기, 정렬, 여백, 소제목, 강조와 스크린샷을 함께 사용한다.
- 렌더링 증거가 없거나 일부 페이지만 수집됐다면 추측하지 말고 confidence를 medium/low로 낮추고 evidenceSummary에 한계를 명시한다.
- DOM에서 관찰된 값과 스크린샷의 인상이 충돌하면 구체적인 위치/개수는 DOM을 우선하고 분위기/시각적 밀도는 스크린샷을 보조 근거로 사용한다.
- '블로그 전체'는 한 글의 우연한 특징을 전체 스타일이라고 단정하지 않는다.
- 이미지 수나 내용이 원본과 다르면 슬롯 번호를 고정하지 말고 역할 중심으로 재배치한다.
- 같은 스타일을 여러 번 생성해도 동일한 도입/섹션 순서/사진 패턴/마무리를 반복하지 않도록 variation 규칙을 만든다.
- identityFidelity, structureFreedom, wordingFreedom, imageFreedom은 0~1 숫자로 작성한다. 기본적으로 정체성은 높게, 변주 자유도는 중간 정도로 설정한다.

JSON만 반환한다:
{
  "suggestedName": "짧은 스타일 이름",
  "signature": "이 스타일을 한 문단으로 요약한 재사용 지침",
  "blogDNA": {
    "version": 2,
    "signature": "signature와 같은 핵심 요약",
    "confidence": "high|medium|low",
    "evidenceSummary": "확인한 범위와 한계",
    "voice": {
      "summary": "문체 핵심",
      "endings": ["자주 쓰는 어미군/비율적 성향"],
      "sentenceRhythm": "평균 길이와 리듬",
      "paragraphRhythm": "문단 호흡",
      "transitions": ["전환 표현군"],
      "lexicalHabits": ["어휘 습관"],
      "emotionPattern": "감정 표현 방식",
      "readerDistance": "독자와 거리",
      "punctuationHabits": ["문장부호/이모지/ㅋㅋ/ㅎㅎ 습관"],
      "avoid": ["이 스타일에서 거의 하지 않는 표현"],
      "metrics": {
        "avgSentenceChars": 0,
        "avgParagraphSentences": 0,
        "questionRate": "low|medium|high 또는 관찰치",
        "exclamationRate": "low|medium|high 또는 관찰치",
        "emoticonDensity": "none|low|medium|high"
      }
    },
    "mood": {
      "summary": "전체 분위기",
      "keywords": ["3~8개"],
      "warmth": "설명",
      "energy": "설명",
      "intimacy": "설명",
      "informationDensity": "설명",
      "visualMood": "설명"
    },
    "structure": {
      "summary": "글 흐름",
      "openingPatterns": ["여러 가능한 도입 패턴"],
      "sectionPatterns": ["자주 쓰는 섹션 전개 패턴"],
      "closingPatterns": ["여러 가능한 마무리 패턴"],
      "fixedPrinciples": ["정체성에 가까워 자주 유지할 원칙"],
      "flexiblePatterns": ["콘텐츠에 따라 바꿔도 되는 부분"],
      "contentBalance": "정보/경험/감정 배분"
    },
    "imageRhythm": {
      "summary": "이미지 리듬",
      "cadence": "텍스트 대비 이미지 박자",
      "grouping": "연속/단독 이미지 성향",
      "placementRules": ["이미지 위치 규칙"],
      "rolePreferences": ["대표/외관/메뉴/디테일/과정/설명 등 역할 성향"],
      "adaptationRules": ["이미지 수·종류가 달라질 때 재분배 규칙"]
    },
    "visual": {
      "summary": "꾸밈 스타일",
      "alignment": "정렬 성향",
      "emphasis": "강조 성향",
      "whitespace": "여백/줄바꿈",
      "headingStyle": "소제목 스타일",
      "decorationHabits": ["박스/구분선/이모지/캡션 등"],
      "avoid": ["거의 사용하지 않는 꾸밈"]
    },
    "variation": {
      "identityFidelity": 0.85,
      "structureFreedom": 0.4,
      "wordingFreedom": 0.5,
      "imageFreedom": 0.4,
      "antiRepetitionRules": ["최근 생성물과 겹치지 않게 할 규칙"]
    }
  }
}`;

    const screenshots = (renderedEvidence?.pages ?? [])
      .map((page) => page.screenshotDataUrl)
      .filter((value): value is string => Boolean(value))
      .slice(0, 4);
    const responseInput = screenshots.length
      ? [{
          role: "user" as const,
          content: [
            { type: "input_text", text: input },
            ...screenshots.map((imageUrl) => ({ type: "input_image", image_url: imageUrl })),
          ],
        }]
      : input;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      input: responseInput as never,
      ...(isUrl ? { tools: [{ type: "web_search" } as never] } : {}),
      max_output_tokens: 4200,
    });

    const parsed = extractJson(response.output_text);
    if (!parsed.signature) throw new Error("분석된 블로그 스타일이 비어 있습니다.");
    const blogDNA = parsed.blogDNA ?? fallbackDNA(parsed.signature);
    return NextResponse.json({
      suggestedName: parsed.suggestedName || "새 블로그 스타일",
      signature: parsed.signature,
      blogDNA: { ...blogDNA, version: 2, signature: parsed.signature },
      analysisEvidence: isUrl ? {
        rendered: Boolean(renderedEvidence),
        renderedPageCount: renderedEvidence?.pages.length ?? 0,
        screenshotsUsed: screenshots.length,
        webSearchSupplement: true,
        limitation: renderedEvidence?.limitation || renderedCaptureError || undefined,
      } : {
        rendered: false,
        renderedPageCount: 0,
        screenshotsUsed: 0,
        webSearchSupplement: false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "블로그 스타일 분석 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
