import { getCategory, getPlatform, getPreset, getStructure, getStyle } from "../domain/content-config";
import type { BlogDraft, GenerateRequest, ImagePlan } from "../domain/types";

export function makeMockDraft(input: GenerateRequest): BlogDraft {
  const preset = getPreset(input.categoryId, input.presetId);
  const category = getCategory(input.categoryId);
  const platform = getPlatform(input.platformId);
  const topic = input.freeTopic?.trim() || preset?.label || category?.label || "자유주제";
  const styleUsed = input.styleId === "auto" ? (preset?.recommendedStyleIds[0] ? getStyle(preset.recommendedStyleIds[0])?.label : "친근한 정보형") : input.styleId === "custom" ? (input.customStyle?.trim() || "직접 설정 문체") : (getStyle(input.styleId)?.label || input.styleId);
  const structureUsed = input.structureId === "auto" ? (preset?.recommendedStructureIds[0] ? getStructure(preset.recommendedStructureIds[0])?.label : "정보 정리형") : input.structureId === "custom" ? (input.customStructure?.trim() || "직접 설정 구성") : (getStructure(input.structureId)?.label || input.structureId);
  const attrs = Object.values(input.attributes ?? {}).filter(Boolean).join(", ");

  const images: ImagePlan[] = [
    { id: "IMG-01-HERO", role: "HERO", label: "대표 이미지", placement: "제목 바로 아래", afterSectionId: null, ratio: "16:9", size: "1200×675", prompt: `${topic} 주제를 직관적으로 표현하는 ${platform.label}용 대표 이미지. ${attrs ? `${attrs} 맥락을 자연스럽게 반영. ` : ""}깔끔하고 실제 블로그에 어울리는 구성, 과도한 텍스트와 로고 없음.` },
    { id: "IMG-02-CONTEXT", role: "CONTEXT", label: "상황 이미지", placement: "첫 번째 본문 섹션 아래", afterSectionId: "sec-1", ratio: "4:3", size: "1200×900", prompt: `${topic}의 상황과 맥락을 한눈에 이해할 수 있는 자연스러운 블로그 이미지. 실제 생활 장면처럼 구성하고 이미지 안에 글자 없음.` },
    { id: "IMG-03-EXPLAINER", role: "EXPLAINER", label: "핵심 설명 이미지", placement: "두 번째 본문 섹션 아래", afterSectionId: "sec-2", ratio: "4:3", size: "1200×900", prompt: `${topic}의 핵심 포인트를 시각적으로 설명하는 정돈된 이미지. 정보 전달이 명확하되 글자 없이 장면과 그래픽 요소 중심.` },
    { id: "IMG-04-TIP", role: "TIP", label: "팁 이미지", placement: "마무리 전 팁 섹션 아래", afterSectionId: "sec-3", ratio: "4:5", size: "1080×1350", prompt: `${topic}와 관련된 실용적인 팁이나 기억할 포인트를 이미지로 보여주는 블로그용 비주얼. 친근하고 깔끔하며 텍스트 없음.` },
    { id: "IMG-05-CAUTION", role: "CAUTION", label: "확인 포인트 이미지", placement: "마무리 직전", afterSectionId: "sec-4", ratio: "3:2", size: "1200×800", prompt: `${topic}에서 놓치기 쉬운 확인 포인트를 차분하게 표현한 블로그용 이미지. 과장되지 않은 시각 요소, 이미지 안에 글자 없음.` },
  ];

  return {
    title: `${topic}, 블로그 글 구성 예시`,
    summary: `${platform.label}에 맞춰 ${structureUsed} 구성과 ${styleUsed} 문체로 만든 샘플입니다.`,
    styleUsed,
    structureUsed,
    intro: [`${topic}에 대해 독자가 자연스럽게 이해할 수 있도록 핵심 맥락부터 정리해보겠습니다.`],
    sections: [
      { id: "sec-1", heading: "먼저 살펴볼 배경", paragraphs: [`${topic}를 이해하기 전에 어떤 상황과 맥락에서 이 주제를 다루는지 간단히 짚어보는 부분입니다. ${attrs ? `입력된 조건은 ${attrs}입니다.` : "필요한 조건만 입력하면 해당 맥락을 반영합니다."}`] },
      { id: "sec-2", heading: "핵심 내용 정리", paragraphs: [`주제에 맞는 핵심 정보나 경험을 독자가 읽기 편한 순서로 정리합니다. 실제 API 모드에서는 선택한 주제와 추가 조건을 바탕으로 내용이 생성됩니다.`] },
      { id: "sec-3", heading: "함께 참고하면 좋은 점", paragraphs: [`선택한 글 구성에 맞춰 팁, 후기, 비교, 가이드 등 필요한 섹션이 유동적으로 만들어집니다.`] },
      { id: "sec-4", heading: "마무리", paragraphs: [`플랫폼 특성에 맞게 문단 길이와 이미지 배치 호흡을 조정해 최종 원고를 구성합니다.`] },
    ],
    closing: [`필요하면 직접 입력한 추가 조건을 반영해 더 구체적인 글로 만들 수 있습니다.`],
    tags: [topic.replace(/\s/g, ""), category?.label.replace(/\s/g, "") || "블로그", platform.label.replace(/\s/g, "")],
    images: images.slice(0, input.imageCount),
    warnings: [],
  };
}
