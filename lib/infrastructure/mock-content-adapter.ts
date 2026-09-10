import type { BlogDraft, GenerateRequest, ImagePlan } from "../domain/types";

export function makeMockDraft(input: GenerateRequest): BlogDraft {
  const images: ImagePlan[] = [
      {
        id: "IMG-01-HERO",
        role: "HERO",
        label: "대표 이미지",
        placement: "제목 바로 아래",
        afterSectionId: null,
        ratio: "16:9",
        size: "1200×675",
        prompt: `${input.ageGroup} 한국인 성인이 ${input.posture} 상황에서 ${input.bodyPart}의 가벼운 불편함을 느끼는 자연스러운 장면. 밝고 깔끔한 재활·건강정보 블로그용 비주얼, 과장된 통증 표정 금지, 전문적이면서 친근한 분위기, 자연광, 깨끗한 배경, 이미지 안에 글자나 로고 없음.`,
      },
      {
        id: "IMG-02-POSTURE",
        role: "POSTURE",
        label: "자세 비교 이미지",
        placement: "‘평소 자세에서 먼저 확인해볼 부분’ 섹션 아래",
        afterSectionId: "sec-2",
        ratio: "4:3",
        size: "1200×900",
        prompt: `${input.posture}에서 부담이 커질 수 있는 자세와 보다 편안한 자세를 좌우로 비교하는 건강 교육용 일러스트. ${input.ageGroup} 한국인 성인, 해부학적으로 자연스러운 체형, 과도한 교정 연출 금지, 밝은 베이지와 블루 계열, 정돈된 병원·재활 블로그 스타일, 이미지 안에 글자 없음.`,
      },
      {
        id: "IMG-03-TREATMENT",
        role: "TREATMENT",
        label: `${input.treatmentMethod} 안내 이미지`,
        placement: `‘${input.treatmentMethod}, 어떻게 접근할까요?’ 섹션 아래`,
        afterSectionId: "sec-3",
        ratio: "4:3",
        size: "1200×900",
        prompt: `${input.treatmentMethod} 상담 또는 관리 장면을 표현한 전문적인 건강정보 이미지. 의료진과 성인이 안전하고 자연스러운 자세로 설명을 나누는 모습, 치료 효과를 과장하는 전후 표현 금지, 깨끗하고 편안한 재활의학 분위기, 이미지 안에 글자 없음.`,
      },
      {
        id: "IMG-04-TIP",
        role: "TIP",
        label: "생활관리 이미지",
        placement: "‘생활 속에서 함께 챙기면 좋은 습관’ 섹션 아래",
        afterSectionId: "sec-4",
        ratio: "4:5",
        size: "1080×1350",
        prompt: `${input.bodyPart} 부담을 줄이기 위해 작업환경 조정, 짧은 휴식, 가벼운 움직임을 실천하는 장면들을 하나의 깔끔한 건강정보 비주얼로 구성. 친근하고 밝은 일러스트, 과장된 스트레칭 금지, 텍스트나 숫자 없이 아이콘과 장면만 사용.`,
      },
  ];

  return {
    title: `${input.ageGroup} ${input.bodyPart} 불편감, ${input.posture}에서 살펴볼 점`,
    summary: `${input.ageGroup}에서 ${input.bodyPart}에 부담을 줄 수 있는 생활 자세와 ${input.treatmentMethod}에 대해 이해하기 쉽게 정리한 정보성 글입니다.`,
    intro: [
      `${input.posture}이 오래 이어지면 ${input.bodyPart} 주변에 부담이 느껴질 수 있습니다. 같은 자세를 반복하는 생활에서는 불편감이 생기는 이유를 이해하고, 평소 자세와 움직임을 함께 살펴보는 것이 도움이 됩니다.`,
    ],
    sections: [
      {
        id: "sec-1",
        heading: `${input.bodyPart}가 불편해지는 데 자세가 영향을 줄 수 있는 이유`,
        paragraphs: [
          `우리 몸은 한 부위만 따로 움직이기보다 여러 관절과 근육이 함께 균형을 맞춥니다. ${input.posture}처럼 특정 자세가 길어지면 일부 근육은 계속 긴장하고 다른 부위는 움직임이 줄어들 수 있습니다.`,
          `불편감의 원인은 사람마다 다르므로 통증의 위치만으로 원인을 단정하기보다는 생활 습관과 움직임을 함께 살펴보는 것이 좋습니다.`,
        ],
      },
      {
        id: "sec-2",
        heading: `평소 자세에서 먼저 확인해볼 부분`,
        paragraphs: [
          `화면 높이, 의자 깊이, 팔의 위치처럼 작은 요소도 자세 유지에 영향을 줍니다. 한 번에 완벽한 자세를 만들기보다 오래 같은 자세를 유지하지 않도록 중간중간 몸을 움직이는 것이 현실적인 관리 방법입니다.`,
        ],
      },
      {
        id: "sec-3",
        heading: `${input.treatmentMethod}, 어떻게 접근할까요?`,
        paragraphs: [
          `${input.treatmentMethod}은 개인의 상태와 움직임을 확인한 뒤 필요한 부위를 평가하고 관리 방향을 정하는 과정으로 이해할 수 있습니다. 적용 방법과 횟수는 증상과 상태에 따라 달라질 수 있습니다.`,
          `불편감이 오래 지속되거나 일상생활에 영향을 줄 정도라면 의료진의 평가를 받아 현재 상태에 맞는 방법을 확인하는 것이 필요할 수 있습니다.`,
        ],
      },
      {
        id: "sec-4",
        heading: `생활 속에서 함께 챙기면 좋은 습관`,
        paragraphs: [
          `작업 환경을 자신의 몸에 맞게 조정하고, 한 자세가 길어지지 않도록 짧은 휴식을 두는 것이 좋습니다. 무리한 동작보다 편안한 범위에서 가볍게 움직이는 습관을 만들어보세요.`,
        ],
      },
    ],
    closing: [
      `${input.bodyPart}의 불편감은 한 가지 원인만으로 설명하기 어려운 경우가 많습니다. 생활 자세를 점검하고, 필요한 경우 상태를 평가받아 자신에게 맞는 관리 방법을 찾는 것이 중요합니다.`,
    ],
    tags: [input.bodyPart.replace(/\s/g, ""), input.treatmentMethod.replace(/\s/g, ""), "자세관리", "생활습관", input.ageGroup],
    images: images.slice(0, input.imageCount),
    warnings: [],
  };
}
