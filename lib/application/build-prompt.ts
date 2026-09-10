import { FIELD_DEFINITIONS, getCategory, getPlatform, getPreset, getStructure, getStyle } from "../domain/content-config";
import type { GenerateRequest } from "../domain/types";

function clean(value?: string) {
  return value?.trim() || "";
}

export function buildPrompt(input: GenerateRequest) {
  const platform = getPlatform(input.platformId);
  const category = getCategory(input.categoryId);
  const preset = getPreset(input.categoryId, input.presetId);
  const style = getStyle(input.styleId);
  const structure = getStructure(input.structureId);

  const attributes = Object.entries(input.attributes ?? {})
    .filter(([, value]) => clean(value))
    .map(([key, value]) => `- ${FIELD_DEFINITIONS[key]?.label ?? key}: ${clean(value)}`)
    .join("\n");

  const topicParts = [
    preset ? `- 선택 주제: ${preset.label}` : null,
    clean(input.freeTopic) ? `- 자유 주제/설명: ${clean(input.freeTopic)}` : null,
    category ? `- 상위 카테고리: ${category.label}` : null,
  ].filter(Boolean).join("\n");

  const styleInstruction = input.styleId === "auto"
    ? `주제·플랫폼·독자에 가장 적절한 문체를 1개 선택해 styleUsed에 한국어 이름으로 기록한다. 추천 후보가 있다면 우선 고려하되 억지로 맞추지 않는다.`
    : input.styleId === "custom"
      ? `사용자 지정 문체: ${clean(input.customStyle) || "자연스럽고 읽기 쉬운 블로그 문체"}`
      : `선택 문체: ${style?.label ?? input.styleId} — ${style?.description ?? ""}`;

  const structureInstruction = input.structureId === "auto"
    ? `주제·플랫폼에 가장 적절한 글 구성을 1개 선택해 structureUsed에 한국어 이름으로 기록한다.`
    : input.structureId === "custom"
      ? `사용자 지정 글 구성: ${clean(input.customStructure) || "주제에 맞는 자연스러운 구성"}`
      : `선택 글 구성: ${structure?.label ?? input.structureId} — ${structure?.description ?? ""}`;

  return `당신은 다양한 플랫폼용 한국어 블로그 콘텐츠를 설계하는 전문 편집자다. 사용자의 주제와 목적을 존중하고, 입력되지 않은 사실을 임의로 만들어 핵심 정보처럼 쓰지 않는다.

[플랫폼]
- 플랫폼: ${input.otherPlatform?.trim() || platform.label}
- 작성 힌트: ${platform.writingHint}
- 내보내기 힌트: ${platform.exportHint}

[주제]
${topicParts || "- 자유주제"}

[추가 조건]
${attributes || "- 없음"}
${clean(input.extraConditions) ? `- 기타 조건: ${clean(input.extraConditions)}` : ""}

[출력 설정]
- 글 길이: ${input.length}
- 이미지 제작 가이드 수: ${input.imageCount}
- 문체: ${styleInstruction}
- 글 구성: ${structureInstruction}

반드시 아래 원칙을 지켜라.
1. 카테고리와 주제는 의료에 한정되지 않는다. 음식, 일상, 여행, 리뷰, 교육, 취미 등 입력된 주제에 맞춰 작성한다.
2. 비어 있는 선택 조건은 추측해서 핵심 사실로 만들지 않는다. 특히 연령대, 가격, 장소, 치료방법, 사용기간 같은 구체값을 임의 생성하지 않는다.
3. 건강·의료 주제일 때만 의료광고성 과장 표현과 단정적 진단·치료 보장을 피한다. 다른 카테고리에는 불필요한 의료 경고를 넣지 않는다.
4. 플랫폼 특성에 맞게 문단 길이, 소제목 호흡, 이미지 간격을 조정한다.
5. 이미지 자체는 생성하지 않는다. 외부 이미지 생성기에 그대로 복사할 수 있는 상세 한국어 프롬프트를 만든다.
6. 이미지에는 한글 문구 생성을 요구하지 않는다. 정보 카드가 필요하면 텍스트 없는 그래픽 구성으로 요청한다.
7. 첫 이미지는 HERO이며 afterSectionId=null이다. 나머지는 CONTEXT, EXPLAINER, PROCESS, TIP, CAUTION 중 내용에 맞는 역할을 고른다.
8. 이미지는 연속 배치하지 않고 관련 섹션 뒤에 둔다. placement는 사람이 복붙 후 바로 찾을 수 있게 구체적으로 쓴다.
9. 동일한 내용을 반복하지 않고, 플랫폼과 선택한 글 구성에 맞는 3~6개 섹션으로 작성한다.
10. styleUsed와 structureUsed를 반드시 반환한다.

JSON 외의 문장을 출력하지 마라.
{
  "title": "string",
  "summary": "string",
  "styleUsed": "string",
  "structureUsed": "string",
  "intro": ["paragraph"],
  "sections": [
    { "id": "sec-1", "heading": "string", "paragraphs": ["paragraph"] }
  ],
  "closing": ["paragraph"],
  "tags": ["tag"],
  "images": [
    {
      "id": "temporary",
      "role": "HERO|CONTEXT|EXPLAINER|PROCESS|TIP|CAUTION",
      "label": "짧은 설명",
      "placement": "정확한 삽입 위치",
      "afterSectionId": null,
      "ratio": "16:9|4:3|1:1|4:5|3:2",
      "size": "예: 1200×675",
      "prompt": "외부 이미지 생성기에 복사할 상세 프롬프트"
    }
  ],
  "warnings": []
}`;
}
