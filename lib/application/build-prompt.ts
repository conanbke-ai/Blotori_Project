import type { GenerateRequest } from "../domain/types";

function optionalLine(label: string, value?: string) {
  const normalized = value?.trim();
  return normalized ? `- ${label}: ${normalized}` : null;
}

export function buildPrompt(input: GenerateRequest) {
  const contextLines = [
    `- 핵심 주제: ${input.topic.trim()}`,
    optionalLine("카테고리", input.category),
    optionalLine("대상 연령대", input.ageGroup),
    optionalLine("치료/관심 부위", input.bodyPart),
    optionalLine("치료/관리 방법", input.treatmentMethod),
    optionalLine("관련 자세/생활상황", input.posture),
    `- 문체: ${input.tone}`,
    `- 글 길이: ${input.length}`,
    `- 이미지 제작 가이드 수: ${input.imageCount}`,
    optionalLine("추가 메모", input.clinicNote),
  ].filter(Boolean).join("\n");

  return `당신은 한국어 건강정보 블로그 편집자다. 의료광고성 과장 표현을 피하고, 일반 독자가 쉽게 이해할 수 있는 정보성 글을 작성한다.

요청 조건:
${contextLines}

반드시 아래 원칙을 지켜라.
1. 핵심 주제만 필수 입력이다. 카테고리·연령대·부위·치료방법·자세 등 비어 있는 선택 항목을 임의로 추측하거나 글의 핵심축으로 만들어서는 안 된다.
2. 사용자가 특정 치료방법을 입력하지 않았다면 도수치료, 물리치료 등 임의의 치료방법을 새로 선택하지 않는다.
3. 치료 효과를 보장하거나 완치·즉시 개선·100% 같은 단정 표현을 쓰지 않는다.
4. 진단처럼 단정하지 말고 증상이 지속되거나 심하면 의료진 평가가 필요할 수 있음을 필요한 경우에만 자연스럽게 안내한다.
5. AI 이미지 자체는 생성하지 않는다. 대신 외부 이미지 생성기에 그대로 복사할 수 있는 상세한 한국어 프롬프트를 만든다.
6. 이미지 프롬프트에는 이미지 안의 한글/텍스트 생성을 요청하지 않는다. 정보 카드가 필요하면 그래픽 요소만 요청하고 텍스트는 별도 편집을 권장한다.
7. 각 이미지에는 role, placement, afterSectionId, ratio, size를 지정한다. HERO는 맨 위이므로 afterSectionId=null이다.
8. 첫 이미지는 HERO로 한다. 나머지 이미지는 실제 본문 내용에 맞춰 CONTEXT, EXPLAINER, PROCESS, TIP, CAUTION 중 적절한 역할을 선택한다. 특정 역할을 억지로 포함하지 않는다.
9. 이미지를 연속 배치하지 않고, 각 이미지가 설명하는 내용과 직접 연결되는 섹션 뒤에 배치한다.
10. 글은 제목, 짧은 도입, 3~5개 소제목, 마무리로 구성한다. 같은 말을 반복하지 않는다.
11. 일반적인 교육·정보 제공 목적의 문구로 작성한다.

JSON 외의 문장을 절대 출력하지 마라. 다음 형식을 정확히 따른다.
{
  "title": "string",
  "summary": "string",
  "intro": ["paragraph"],
  "sections": [
    { "id": "sec-1", "heading": "string", "paragraphs": ["paragraph"] }
  ],
  "closing": ["paragraph"],
  "tags": ["tag"],
  "images": [
    {
      "id": "임시 ID",
      "role": "HERO|CONTEXT|EXPLAINER|PROCESS|TIP|CAUTION",
      "label": "짧은 설명",
      "placement": "사람이 읽고 바로 찾을 수 있는 삽입 위치 설명",
      "afterSectionId": null,
      "ratio": "16:9|4:3|1:1|4:5|3:2",
      "size": "예: 1200×675",
      "prompt": "외부 이미지 생성기에 복사할 상세 프롬프트"
    }
  ],
  "warnings": []
}`;
}
