import type { BlogDraft, GenerateRequest, ImagePlan } from "../domain/types";

function clean(value?: string) {
  return value?.trim() || "";
}

export function makeMockDraft(input: GenerateRequest): BlogDraft {
  const topic = input.topic.trim();
  const ageGroup = clean(input.ageGroup);
  const bodyPart = clean(input.bodyPart);
  const treatmentMethod = clean(input.treatmentMethod);
  const posture = clean(input.posture);
  const contextLabel = [ageGroup, bodyPart, posture].filter(Boolean).join(" · ");

  const images: ImagePlan[] = [
    {
      id: "IMG-01-HERO",
      role: "HERO",
      label: "대표 이미지",
      placement: "제목 바로 아래",
      afterSectionId: null,
      ratio: "16:9",
      size: "1200×675",
      prompt: `${topic} 주제를 직관적으로 보여주는 밝고 깔끔한 건강정보 블로그 대표 이미지. ${contextLabel ? `${contextLabel} 맥락을 자연스럽게 반영하고, ` : ""}과장된 통증이나 치료 전후 연출 없이 전문적이면서 친근한 분위기, 깨끗한 배경, 이미지 안에 글자나 로고 없음.`,
    },
    {
      id: "IMG-02-CONTEXT",
      role: "CONTEXT",
      label: "상황 설명 이미지",
      placement: "첫 번째 핵심 설명 섹션 아래",
      afterSectionId: "sec-1",
      ratio: "4:3",
      size: "1200×900",
      prompt: `${topic}와 관련된 일상 상황이나 배경을 이해하기 쉽게 보여주는 건강 교육용 비주얼. ${posture ? `${posture} 상황을 자연스럽게 표현하고, ` : ""}현실적인 인체 비율과 편안한 분위기, 과도한 교정·치료 효과 연출 금지, 이미지 안에 글자 없음.`,
    },
    {
      id: "IMG-03-EXPLAINER",
      role: "EXPLAINER",
      label: "핵심 설명 이미지",
      placement: "두 번째 핵심 설명 섹션 아래",
      afterSectionId: "sec-2",
      ratio: "4:3",
      size: "1200×900",
      prompt: `${topic}의 핵심 개념을 시각적으로 이해할 수 있는 건강정보 설명 이미지. ${bodyPart ? `${bodyPart}와 관련된 구조나 움직임을 과장 없이 보여주고, ` : ""}복잡한 텍스트 없이 장면과 그래픽 요소 중심, 밝고 정돈된 의료·건강 콘텐츠 스타일.`,
    },
    {
      id: "IMG-04-TIP",
      role: "TIP",
      label: "생활관리 이미지",
      placement: "생활 속에서 참고할 점 섹션 아래",
      afterSectionId: "sec-4",
      ratio: "4:5",
      size: "1080×1350",
      prompt: `${topic}와 관련해 일상에서 참고할 수 있는 무리 없는 생활관리 장면들을 하나의 깔끔한 건강정보 비주얼로 구성. ${treatmentMethod ? `${treatmentMethod}을 치료 효과처럼 과장하지 말고 보조적 정보 맥락으로만 반영. ` : ""}친근하고 밝은 일러스트, 텍스트나 숫자 없이 아이콘과 장면만 사용.`,
    },
  ];

  const sec3Heading = treatmentMethod
    ? `${treatmentMethod}, 어떤 관점에서 살펴볼까요?`
    : "관리나 확인이 필요한 경우";

  const sec3Paragraph = treatmentMethod
    ? `${treatmentMethod}에 대한 적용 여부와 방법은 개인의 상태와 목적에 따라 달라질 수 있습니다. 특정 방법이 모든 사람에게 동일하게 적합하다고 단정하기보다 현재 상태와 생활 환경을 함께 살펴보는 것이 중요합니다.`
    : `불편감이나 기능 저하가 지속되거나 일상생활에 영향을 준다면 현재 상태를 정확히 확인하는 과정이 필요할 수 있습니다. 한 가지 원인이나 방법으로 단정하기보다 개인의 상황에 맞는 평가와 관리 방향을 확인하는 것이 좋습니다.`;

  return {
    title: `${topic}, 알아두면 좋은 핵심 포인트`,
    summary: `${topic}를 이해할 때 도움이 되는 기본 정보와 생활 속에서 함께 살펴볼 점을 정리한 글입니다.`,
    intro: [
      `${topic}는 생활습관이나 현재 상태에 따라 체감되는 양상이 다를 수 있습니다. 먼저 핵심 개념을 이해하고, 자신에게 해당하는 상황이 무엇인지 차분히 살펴보는 것이 좋습니다.`,
    ],
    sections: [
      {
        id: "sec-1",
        heading: `${topic}를 이해할 때 먼저 볼 점`,
        paragraphs: [
          `${topic}를 한 가지 원인이나 결과로만 설명하기는 어렵습니다. 개인의 생활환경과 움직임, 현재 느끼는 불편의 양상 등을 함께 살펴보는 것이 이해에 도움이 됩니다.`,
        ],
      },
      {
        id: "sec-2",
        heading: posture ? `${posture} 상황에서 함께 확인할 부분` : "일상에서 함께 확인할 부분",
        paragraphs: [
          posture
            ? `${posture}이 반복되거나 오래 이어지는 경우에는 몸의 사용 패턴과 휴식 간격을 함께 살펴볼 수 있습니다. 한 번에 완벽한 자세를 만들기보다 같은 상태가 지나치게 오래 지속되지 않도록 조정하는 접근이 현실적입니다.`
            : `일상에서 같은 자세나 움직임이 오래 반복되는지, 휴식과 활동의 균형은 어떤지 살펴보는 것이 좋습니다. 무리한 변화보다 지속 가능한 범위에서 조정하는 것이 중요합니다.`,
        ],
      },
      {
        id: "sec-3",
        heading: sec3Heading,
        paragraphs: [sec3Paragraph],
      },
      {
        id: "sec-4",
        heading: "생활 속에서 함께 챙기면 좋은 점",
        paragraphs: [
          `불편을 무조건 참거나 반대로 과도하게 움직임을 제한하기보다 현재 상태에 맞는 범위에서 생활 패턴을 조정하는 것이 좋습니다. 증상이 지속되거나 심해진다면 필요한 평가를 받아보는 것도 고려할 수 있습니다.`,
        ],
      },
    ],
    closing: [
      `${topic}에 대한 정보는 자신의 상태를 이해하는 출발점으로 활용하는 것이 좋습니다. 실제 관리 방향은 개인의 증상과 생활 환경에 따라 달라질 수 있습니다.`,
    ],
    tags: [
      topic.replace(/\s/g, ""),
      clean(input.category).replace(/\s/g, ""),
      bodyPart.replace(/\s/g, ""),
      treatmentMethod.replace(/\s/g, ""),
      "건강정보",
    ].filter(Boolean),
    images: images.slice(0, input.imageCount),
    warnings: [],
  };
}
