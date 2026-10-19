import { getCategory, getPlatform, getPreset, getStructure, getStyle } from "../domain/content-config";
import type { BlogDraft, GenerateRequest, ImagePlan } from "../domain/types";

function seedValue(input: GenerateRequest) {
  const value = [input.categoryId, input.presetId, input.freeTopic, input.styleProfileName, input.variationNonce].filter(Boolean).join("|");
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function pick<T>(values: T[] | undefined, seed: number, fallback: T): T {
  return values?.length ? values[seed % values.length] : fallback;
}

function patternHeading(pattern: string, fallback?: string) {
  const first = pattern.split(/→|\||\//)[0]?.trim();
  return first && first.length <= 28 ? first : (fallback || "주제 흐름 살펴보기");
}

function usesFormalVoice(input: GenerateRequest) {
  const voice = input.blogDNA?.voice;
  return Boolean(voice?.summary.includes("합니다") || voice?.endings.some((ending) => ending.includes("합니다")));
}

function uniqueHeadings(candidates: string[]) {
  const fallbacks = ["주제에 들어가는 장면", "관점별로 살펴보기", "선택 전에 확인할 점", "나에게 맞게 정리하기"];
  const seen = new Set<string>();
  return candidates.map((candidate, index) => {
    const normalized = candidate.replace(/\s+/g, "");
    const heading = seen.has(normalized) ? fallbacks[index] : candidate;
    seen.add(heading.replace(/\s+/g, ""));
    return heading;
  });
}

export function makeMockDraft(input: GenerateRequest): BlogDraft {
  const preset = getPreset(input.categoryId, input.presetId);
  const category = getCategory(input.categoryId);
  const platform = getPlatform(input.platformId);
  const topic = input.freeTopic?.trim() || preset?.label || category?.label || "자유주제";
  const styleUsed = input.styleId === "auto" ? (preset?.recommendedStyleIds[0] ? getStyle(preset.recommendedStyleIds[0])?.label : "친근한 정보형") : input.styleId === "custom" ? (input.customStyle?.trim() || "직접 설정 문체") : (getStyle(input.styleId)?.label || input.styleId);
  const structureUsed = input.structureId === "auto" ? (preset?.recommendedStructureIds[0] ? getStructure(preset.recommendedStructureIds[0])?.label : "정보 정리형") : input.structureId === "custom" ? (input.customStructure?.trim() || "직접 설정 구성") : (getStructure(input.structureId)?.label || input.structureId);
  const attrs = Object.values(input.attributes ?? {}).filter(Boolean).join(", ");
  const dna = input.blogDNA;
  const seed = seedValue(input);
  const formal = usesFormalVoice(input);
  const end = (casual: string, formalText: string) => formal ? formalText : casual;
  const openingPattern = pick(dna?.structure.openingPatterns, seed, "독자가 궁금해할 맥락부터 시작");
  const sectionPattern = pick(dna?.structure.sectionPatterns, seed >>> 3, "핵심 관점 → 확인할 점 → 활용 기준");
  const closingPattern = pick(dna?.structure.closingPatterns, seed >>> 7, "핵심 요약 → 다음 행동");
  const secondaryPattern = pick(dna?.structure.sectionPatterns, (seed >>> 11) + 1, "선택 기준 → 적용 순서");
  const headings = uniqueHeadings([
    patternHeading(openingPattern, "왜 이 주제를 살펴보는지"),
    patternHeading(sectionPattern, "살펴볼 핵심 관점"),
    patternHeading(secondaryPattern, "적용 전에 확인할 점"),
    patternHeading(closingPattern, "나에게 맞게 정리하기"),
  ]);
  const imageAnchor = 1 + (seed % 3);
  const nextImageAnchor = 1 + (imageAnchor % 3);

  const images: ImagePlan[] = [
    { id: "IMG-01-HERO", role: "HERO", label: "대표 이미지", placement: dna?.imageRhythm.placementRules[0] || "제목 바로 아래", afterSectionId: null, ratio: "16:9", size: "1200×675", prompt: `${topic} 주제를 상징적으로 보여주는 ${platform.label}용 샘플 이미지 구상. ${attrs ? `사용자가 입력한 ${attrs} 조건만 반영. ` : "확인되지 않은 장소·인물·수치 표현 제외. "}이미지 안에 글자와 로고 없음.` },
    { id: "IMG-02-CONTEXT", role: "CONTEXT", label: "맥락 이미지", placement: `${headings[imageAnchor - 1]} 아래 · ${dna?.imageRhythm.summary || "맥락 전환 지점"}`, afterSectionId: `sec-${imageAnchor}`, ratio: "4:3", size: "1200×900", prompt: `${topic}의 맥락을 과장 없이 보여주는 샘플 장면. 구체 사실을 새로 만들지 않고 사용자가 제공한 범위만 시각화.` },
    { id: "IMG-03-EXPLAINER", role: "EXPLAINER", label: "구조 설명 이미지", placement: `${headings[nextImageAnchor - 1]} 아래 · ${dna?.imageRhythm.grouping || "단독 설명 이미지"}`, afterSectionId: `sec-${nextImageAnchor}`, ratio: "4:3", size: "1200×900", prompt: `${topic}에서 살펴볼 관점을 글자 없이 구분하는 정돈된 설명 이미지.` },
    { id: "IMG-04-TIP", role: "TIP", label: "선택 기준 이미지", placement: `${headings[2]} 아래`, afterSectionId: "sec-3", ratio: "4:5", size: "1080×1350", prompt: `${topic}의 선택 기준을 상징물과 여백으로 표현하는 샘플 비주얼. 확인되지 않은 효능·가격·평가 제외.` },
    { id: "IMG-05-CAUTION", role: "CAUTION", label: "확인 사항 이미지", placement: `${headings[3]} 아래`, afterSectionId: "sec-4", ratio: "3:2", size: "1200×800", prompt: `${topic}을 다룰 때 추가 확인이 필요한 부분을 차분하게 표현한 샘플 이미지.` },
  ];

  return {
    title: `[샘플] ${topic} — ${patternHeading(sectionPattern, structureUsed)}`,
    titleCandidates: [
      `[샘플] ${topic} — ${patternHeading(sectionPattern, structureUsed)}`,
      `[샘플] ${topic}, ${patternHeading(openingPattern, "어디서 시작할까")}`,
      `[샘플] ${topic}: ${patternHeading(closingPattern, "선택 기준 정리")}`,
    ],
    titlePurpose: "API 연결 전 구성·문체 확인용 샘플",
    summary: `${platform.label}용 mock입니다. 다음 특성을 반영합니다: ${dna?.signature || `${structureUsed} 구성과 ${styleUsed} 문체`}. 확인되지 않은 사실은 채우지 않습니다.`,
    styleUsed,
    structureUsed,
    layoutFingerprint: `${openingPattern} → ${sectionPattern} → ${dna?.imageRhythm.summary || "역할별 이미지"} → ${closingPattern}`.slice(0, 120),
    presentation: { titleAlign: dna?.visual.alignment.includes("중앙") ? "center" : "left", introAlign: "left", density: dna?.mood.informationDensity.includes("높") ? "dense" : "balanced" },
    intro: [end(
      `${topic}을 어떤 순서와 분위기로 풀어낼지 먼저 보여드릴게요. 이 화면은 사실을 지어내지 않는 구성 확인용 샘플이에요.`,
      `${topic}을 어떤 순서와 분위기로 풀어낼지 먼저 제시합니다. 이 화면은 사실을 지어내지 않는 구성 확인용 샘플입니다.`,
    )],
    sections: [
      { id: "sec-1", heading: headings[0], paragraphs: [end(`${openingPattern} 흐름으로 독자가 주제에 들어오는 지점을 잡아요. ${attrs ? `사용자가 준 조건(${attrs})까지만 사용해요.` : "구체 정보가 없으므로 배경 사실은 단정하지 않아요."}`, `${openingPattern} 흐름으로 독자가 주제에 들어오는 지점을 설정합니다. ${attrs ? `사용자가 제공한 조건(${attrs})까지만 사용합니다.` : "구체 정보가 없으므로 배경 사실은 단정하지 않습니다."}`)] },
      { id: "sec-2", heading: headings[1], paragraphs: [end(`${sectionPattern} 순서가 이 프리셋의 중심이에요. 실제 내용 대신 어떤 관점을 확인해야 하는지 구조만 선명하게 보여줘요.`, `${sectionPattern} 순서가 이 프리셋의 중심입니다. 실제 내용 대신 확인할 관점의 구조만 명확히 제시합니다.`)] },
      { id: "sec-3", heading: headings[2], paragraphs: [end(`${dna?.voice.paragraphRhythm || "문단 호흡을 달리해 읽는 리듬을 만듭니다."} 사진은 ${dna?.imageRhythm.summary || "내용 전환점에 역할별로 배치해요."}`, `${dna?.voice.paragraphRhythm || "문단 호흡을 달리해 읽는 리듬을 구성합니다."} 사진은 ${dna?.imageRhythm.summary || "내용 전환점에 역할별로 배치합니다."}`)] },
      { id: "sec-4", heading: headings[3], paragraphs: [end(`마지막에는 ${closingPattern} 방식으로 정리해요. 판단에 필요한 실제 정보는 사용자가 확인한 자료로 채워야 해요.`, `마지막에는 ${closingPattern} 방식으로 정리합니다. 판단에 필요한 실제 정보는 사용자가 확인한 자료로 보완해야 합니다.`)] },
    ],
    closing: [end(`분위기는 '${dna?.mood.summary || "선택한 분위기"}' 방향을 유지하고, 다음 단계에서는 확인된 자료만 더해 완성해보세요.`, `분위기는 '${dna?.mood.summary || "선택한 분위기"}' 방향을 유지하고, 다음 단계에서는 확인된 자료만 추가해 완성하시기 바랍니다.`)],
    tags: [topic.replace(/\s/g, ""), category?.label.replace(/\s/g, "") || "블로그", platform.label.replace(/\s/g, "")],
    images: images.slice(0, input.imageCount),
    warnings: ["샘플 모드: 문체·구성·이미지 배치 확인용이며, 게시 전 실제 정보와 근거를 추가해야 합니다."],
  };
}
