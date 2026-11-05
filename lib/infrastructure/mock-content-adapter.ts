import { FIELD_DEFINITIONS, getCategory, getPlatform, getPreset, getStructure, getStyle } from "../domain/content-config";
import type { ContentLayoutPlan } from "../domain/content-layout-plan-contract";
import type { BlogDraft, GenerateRequest, ImagePlan } from "../domain/types";
import { foodReviewOutputLines } from "../domain/food-review";
import {
  CATEGORY_INPUT_SUMMARY_SECTION_ID,
  formatCategoryInputSummaryRows,
  projectCategoryInputSummary,
} from "../domain/category-input-summary";

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

type MockVoice = "formal" | "casual" | "mixed";

function resolveMockVoice(input: GenerateRequest, contentLayoutPlan?: ContentLayoutPlan): MockVoice {
  const register = contentLayoutPlan?.observedStyle?.voice.register;
  if (["formal", "narrative"].includes(register ?? "")) return "formal";
  if (register === "mixed") return "mixed";
  if (register === "casual") return "casual";
  const voice = input.blogDNA?.voice;
  const formal = Boolean(voice?.summary.includes("합니다") || voice?.endings.some((ending) => ending.includes("합니다")));
  const casual = Boolean(voice?.summary.includes("해요") || voice?.endings.some((ending) => ending.includes("해요")));
  if (formal && casual) return "mixed";
  if (formal) return "formal";
  if (casual) return "casual";
  if (["easy-expert", "patient-guide", "professional-column", "shareable-info"].includes(input.styleId)) return "formal";
  if (["casual-daily", "emotional-essay", "playful"].includes(input.styleId)) return "casual";
  return "mixed";
}

function voiced(voice: MockVoice, casual: string, formal: string, sequence: number) {
  if (voice === "formal") return formal;
  if (voice === "casual") return casual;
  return sequence % 2 === 0 ? casual : formal;
}

const observedOpeningText = {
  "brief-image-first": "첫 장면으로 빠르게 들어가는 짧은 도입",
  "explain-then-image": "핵심 맥락을 먼저 짚는 도입",
  "concise-title": "간결한 제목과 바로 이어지는 본문",
  "search-intent-title": "선택한 주제를 먼저 드러내는 도입",
} as const;
const observedSectionText = {
  "scene-caption-sequence": "장면과 짧은 설명을 번갈아 잇는 흐름",
  "text-image-interleave": "본문과 계획된 사진을 교차하는 흐름",
  "heading-explanation-image": "소제목과 설명 뒤 사진이 이어지는 흐름",
  "section-bundle": "소제목 단위로 설명과 사진을 묶는 흐름",
} as const;
const observedClosingText = {
  "brief-verdict": "확인된 내용만 남기는 짧은 판단",
  "limited-tags": "관련 태그만 간결하게 정리",
  "tag-bundle": "마무리 뒤 태그를 묶는 구성",
  "search-tags": "선택한 주제 중심 태그 구성",
} as const;
const observedImageText = {
  interleaved: "본문과 사진을 번갈아 잇는 흐름",
  "section-transition": "내용이 바뀌는 지점에 사진을 두는 흐름",
  grouped: "관련 사진을 한 장면처럼 묶는 흐름",
} as const;

function observedPattern<T extends string>(values: T[] | undefined, catalog: Record<T, string>, fallback: string) {
  const value = values?.[0];
  return value ? catalog[value] : fallback;
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

interface MockAttribute {
  fieldId: string;
  label: string;
  value: string;
}

function distributeAttributes(attributes: MockAttribute[], sectionCount: number) {
  const buckets = Array.from({ length: Math.max(1, sectionCount) }, () => [] as MockAttribute[]);
  attributes.forEach((attribute, index) => buckets[index % buckets.length].push(attribute));
  return buckets;
}

function attributeSentence(attributes: MockAttribute[], voice: MockVoice, sequence: number) {
  if (attributes.length === 0) return "";
  const details = attributes.map(({ label, value }) => `${label}은 '${value}'`).join(", ");
  return voiced(
    voice,
    `이번 내용에서는 ${details}에 초점을 맞춰요.`,
    `이번 내용에서는 ${details}에 초점을 맞춥니다.`,
    sequence,
  );
}

function plannedParagraphs(
  baseParagraph: string,
  minimum: number,
  topic: string,
  heading: string,
  attributes: MockAttribute[],
  voice: MockVoice,
  sequence: number,
): string[] {
  const details = attributeSentence(attributes, voice, sequence);
  const candidates = [
    details ? `${baseParagraph} ${details}` : baseParagraph,
    voiced(
      voice,
      `${heading}을 살펴볼 때는 ${topic}과 직접 관련된 기준부터 차례로 비교해 봐요.`,
      `${heading}을 살펴볼 때는 ${topic}과 직접 관련된 기준부터 차례로 비교합니다.`,
      sequence + 1,
    ),
    voiced(
      voice,
      `${heading}에서는 ${topic}에 대해 단정하기 어려운 부분을 따로 구분해서 봐요.`,
      `${heading}에서는 ${topic}에 대해 단정하기 어려운 부분을 따로 구분해서 봅니다.`,
      sequence + 2,
    ),
  ];
  return candidates.slice(0, Math.max(1, Math.min(minimum, candidates.length)));
}

function emphasisPhrase(paragraph: string) {
  const firstSentence = paragraph.split(/[.!?]/)[0]?.trim() ?? "";
  return firstSentence.length <= 28 ? firstSentence : firstSentence.slice(0, 28).trim();
}

export function makeMockDraft(input: GenerateRequest, contentLayoutPlan?: ContentLayoutPlan): BlogDraft {
  const preset = getPreset(input.categoryId, input.presetId);
  const category = getCategory(input.categoryId);
  const platform = getPlatform(input.platformId);
  const topic = input.freeTopic?.trim() || preset?.label || category?.label || "자유주제";
  const styleUsed = input.styleId === "auto" ? (preset?.recommendedStyleIds[0] ? getStyle(preset.recommendedStyleIds[0])?.label : "친근한 정보형") : input.styleId === "custom" ? (input.customStyle?.trim() || "직접 설정 문체") : (getStyle(input.styleId)?.label || input.styleId);
  const structureUsed = input.structureId === "auto" ? (preset?.recommendedStructureIds[0] ? getStructure(preset.recommendedStructureIds[0])?.label : "정보 정리형") : input.structureId === "custom" ? (input.customStructure?.trim() || "직접 설정 구성") : (getStructure(input.structureId)?.label || input.structureId);
  const rawAttributes = Object.entries(input.attributes ?? {}).flatMap(([fieldId, value]) => {
    const field = FIELD_DEFINITIONS[fieldId];
    if (!field || typeof value !== "string" || !value.trim()) return [];
    return [{ fieldId, label: field.label, value: value.trim() }];
  });
  const hasInputSummaryPlan = contentLayoutPlan?.sections.some((section) => section.id === CATEGORY_INPUT_SUMMARY_SECTION_ID) ?? false;
  const inputSummaryItems = hasInputSummaryPlan ? projectCategoryInputSummary(input) : [];
  const inputSummaryFieldIds = new Set(inputSummaryItems.map((item) => item.fieldId));
  const inputSummaryRows = hasInputSummaryPlan ? formatCategoryInputSummaryRows(input) : [];
  // Food facts have one exact provenance section. Do not repeat unverified raw values
  // in narrative paragraphs, emphasis, or image prompts where they can look confirmed.
  const attributes = contentLayoutPlan?.factPlan?.scope === "food-review"
    ? []
    : rawAttributes.filter((attribute) => !inputSummaryFieldIds.has(attribute.fieldId));
  const dna = input.blogDNA;
  const observed = contentLayoutPlan?.observedStyle;
  const seed = seedValue(input);
  const voice = resolveMockVoice(input, contentLayoutPlan);
  let voiceSequence = 0;
  const end = (casual: string, formalText: string) => voiced(voice, casual, formalText, voiceSequence++);
  const openingPattern = dna
    ? pick(dna.structure.openingPatterns, seed, "독자가 궁금해할 맥락부터 시작")
    : observedPattern(observed?.opening, observedOpeningText, "독자가 궁금해할 맥락부터 시작");
  const sectionPattern = dna
    ? pick(dna.structure.sectionPatterns, seed >>> 3, "핵심 관점 → 확인할 점 → 활용 기준")
    : observedPattern(observed?.sections, observedSectionText, "핵심 관점 → 확인할 점 → 활용 기준");
  const closingPattern = dna
    ? pick(dna.structure.closingPatterns, seed >>> 7, "핵심 요약 → 다음 행동")
    : observedPattern(observed?.closing, observedClosingText, "핵심 요약 → 다음 행동");
  const secondaryPattern = dna
    ? pick(dna.structure.sectionPatterns, (seed >>> 11) + 1, "선택 기준 → 적용 순서")
    : observedPattern(observed?.sections.slice(1), observedSectionText, "선택 기준 → 적용 순서");
  const observedImageRhythm = observed
    ? observedImageText[observed.image.placement]
    : "내용 전환점의 역할별 이미지";
  const headings = uniqueHeadings([
    patternHeading(openingPattern, "왜 이 주제를 살펴보는지"),
    patternHeading(sectionPattern, "살펴볼 핵심 관점"),
    patternHeading(secondaryPattern, "적용 전에 확인할 점"),
    patternHeading(closingPattern, "나에게 맞게 정리하기"),
  ]);
  const imageAnchor = 1 + (seed % 3);
  const nextImageAnchor = 1 + (imageAnchor % 3);

  const images: ImagePlan[] = [
    { id: "IMG-01-HERO", role: "HERO", label: "대표 이미지", placement: dna?.imageRhythm.placementRules[0] || "제목 바로 아래", afterSectionId: null, ratio: "16:9", size: "1200×675", prompt: `${topic} 주제를 상징적으로 보여주는 ${platform.label}용 샘플 이미지 구상. 확인되지 않은 장소·인물·수치 표현 제외. 이미지 안에 글자와 로고 없음.` },
    { id: "IMG-02-CONTEXT", role: "CONTEXT", label: "맥락 이미지", placement: `${headings[imageAnchor - 1]} 아래 · ${dna?.imageRhythm.summary || observedImageRhythm}`, afterSectionId: `sec-${imageAnchor}`, ratio: "4:3", size: "1200×900", prompt: `${topic}의 맥락을 과장 없이 보여주는 샘플 장면. 구체 사실을 새로 만들지 않고 주제의 분위기만 시각화.` },
    { id: "IMG-03-EXPLAINER", role: "EXPLAINER", label: "구조 설명 이미지", placement: `${headings[nextImageAnchor - 1]} 아래 · ${dna?.imageRhythm.grouping || observedImageRhythm}`, afterSectionId: `sec-${nextImageAnchor}`, ratio: "4:3", size: "1200×900", prompt: `${topic}에서 살펴볼 관점을 글자 없이 구분하는 정돈된 설명 이미지.` },
    { id: "IMG-04-TIP", role: "TIP", label: "선택 기준 이미지", placement: `${headings[2]} 아래`, afterSectionId: "sec-3", ratio: "4:5", size: "1080×1350", prompt: `${topic}의 선택 기준을 상징물과 여백으로 표현하는 샘플 비주얼. 확인되지 않은 효능·가격·평가 제외.` },
    { id: "IMG-05-CAUTION", role: "CAUTION", label: "확인 사항 이미지", placement: `${headings[3]} 아래`, afterSectionId: "sec-4", ratio: "3:2", size: "1200×800", prompt: `${topic}을 다룰 때 추가 확인이 필요한 부분을 차분하게 표현한 샘플 이미지.` },
  ];

  const categoryLabel = category?.label || "블로그";
  const baseSections = [
    { id: "sec-1", heading: headings[0], paragraphs: [end(`${topic}을 ${categoryLabel} 관점에서 차분히 살펴봐요.`, `${topic}을 ${categoryLabel} 관점에서 차분히 살펴봅니다.`)] },
    { id: "sec-2", heading: headings[1], paragraphs: [end(`${topic}을 판단할 때 눈여겨볼 기준을 하나씩 나눠 봐요.`, `${topic}을 판단할 때 눈여겨볼 기준을 하나씩 나누어 봅니다.`)] },
    { id: "sec-3", heading: headings[2], paragraphs: [end(`${topic}과 관련된 내용을 비교할 때는 서로 다른 기준을 섞지 않고 봐요.`, `${topic}과 관련된 내용을 비교할 때는 서로 다른 기준을 섞지 않고 살펴봅니다.`)] },
    { id: "sec-4", heading: headings[3], paragraphs: [end(`마지막에는 ${topic}을 선택하거나 활용할 때 중요했던 기준을 간단히 정리해요.`, `마지막에는 ${topic}을 선택하거나 활용할 때 중요했던 기준을 간단히 정리합니다.`)] },
  ];
  const unplannedAttributeBuckets = distributeAttributes(attributes, baseSections.length);
  const unplannedSections = baseSections.map((base, index) => {
    const details = attributeSentence(unplannedAttributeBuckets[index], voice, index);
    return { ...base, paragraphs: [details ? `${base.paragraphs[0]} ${details}` : base.paragraphs[0]] };
  });
  let emphasisRemaining = contentLayoutPlan?.emphasis.minimumSections ?? 0;
  const narrativeSectionCount = contentLayoutPlan?.sections.filter((section) => !["food-facts", CATEGORY_INPUT_SUMMARY_SECTION_ID].includes(section.id)).length ?? baseSections.length;
  const plannedAttributeBuckets = distributeAttributes(attributes, narrativeSectionCount);
  let plannedAttributeIndex = 0;
  const plannedSections = contentLayoutPlan
    ? contentLayoutPlan.sections.map((planned, index) => {
        const fixedInformationSection = planned.id === "food-facts" || planned.id === CATEGORY_INPUT_SUMMARY_SECTION_ID;
        const narrativeIndex = fixedInformationSection ? index : plannedAttributeIndex;
        const base = baseSections[narrativeIndex % baseSections.length];
        const factParagraphs = planned.id === "food-facts" && contentLayoutPlan.factPlan
          ? foodReviewOutputLines(contentLayoutPlan.factPlan)
          : planned.id === CATEGORY_INPUT_SUMMARY_SECTION_ID
            ? inputSummaryRows
          : undefined;
        const paragraphs = factParagraphs ?? plannedParagraphs(
          base.paragraphs[0],
          planned.paragraphRange[0],
          topic,
          planned.heading,
          plannedAttributeBuckets[fixedInformationSection ? plannedAttributeIndex : plannedAttributeIndex++] ?? [],
          voice,
          index * 3,
        );
        const addEmphasis = !factParagraphs && emphasisRemaining > 0 && contentLayoutPlan.emphasis.maxPerSection > 0;
        if (addEmphasis) emphasisRemaining -= 1;
        return {
          ...base,
          id: planned.id,
          heading: planned.heading,
          paragraphs,
          presentation: {
            visualStyle: planned.visualStyle,
            headingAlign: "left" as const,
            bodyAlign: "left" as const,
            emphasis: addEmphasis ? [{
              phrase: emphasisPhrase(paragraphs[0]),
              kind: contentLayoutPlan.emphasis.kinds[index % contentLayoutPlan.emphasis.kinds.length] ?? "bold",
            }] : [],
          },
        };
      })
    : unplannedSections;
  const plannedImages = contentLayoutPlan
    ? contentLayoutPlan.imageAnchors.map((anchor, index) => {
        const image = images[index] ?? images.at(-1)!;
        return {
          ...image,
          id: `IMG-${String(index + 1).padStart(2, "0")}-${anchor.role}`,
          role: anchor.role,
          afterSectionId: anchor.afterSectionId,
          display: anchor.display,
          placement: anchor.afterSectionId === null ? "제목 바로 아래" : "계획된 섹션 바로 아래",
        };
      })
    : images.slice(0, input.imageCount);
  const titleAngle = contentLayoutPlan?.intent === "experience"
    ? "경험의 핵심을 살펴보기"
    : contentLayoutPlan?.intent === "curation"
      ? "선택 기준을 비교하기"
      : "먼저 알아둘 핵심";

  return {
    title: `[샘플] ${topic}, ${categoryLabel}에서 ${titleAngle}`,
    titleCandidates: [
      `[샘플] ${topic}, ${categoryLabel}에서 ${titleAngle}`,
      `[샘플] ${topic}: ${categoryLabel} 관점으로 살펴보기`,
      `[샘플] ${topic}을 고를 때 확인할 ${categoryLabel} 기준`,
    ],
    titlePurpose: "합성 결과의 구성·문체 확인용",
    summary: `${categoryLabel} 관점에서 ${topic}의 핵심과 선택 기준을 정리한 합성 예시입니다.`,
    styleUsed,
    structureUsed,
    layoutFingerprint: `${openingPattern} → ${sectionPattern} → ${dna?.imageRhythm.summary || observedImageRhythm} → ${closingPattern}`.slice(0, 120),
    presentation: contentLayoutPlan ? {
      titleAlign: contentLayoutPlan.typography.titleAlign ?? "left",
      introAlign: contentLayoutPlan.typography.introAlign ?? "left",
      density: contentLayoutPlan.typography.density ?? "balanced",
    } : { titleAlign: dna?.visual.alignment.includes("중앙") ? "center" : "left", introAlign: "left", density: dna?.mood.informationDensity.includes("높") ? "dense" : "balanced" },
    intro: [end(
      `${topic}에서 궁금한 점부터 짚고, 판단에 필요한 기준을 차례로 살펴볼게요.`,
      `${topic}에서 궁금한 점부터 짚고, 판단에 필요한 기준을 차례로 살펴보겠습니다.`,
    )],
    sections: plannedSections,
    closing: [end(`${topic}을 다시 볼 때는 나에게 중요한 기준부터 확인해 보세요.`, `${topic}을 다시 볼 때는 자신에게 중요한 기준부터 확인하시기 바랍니다.`)],
    tags: [topic.replace(/\s/g, ""), category?.label.replace(/\s/g, "") || "블로그", platform.label.replace(/\s/g, "")],
    images: plannedImages,
    warnings: ["샘플 모드: 문체·구성·이미지 배치 확인용이며, 게시 전 실제 정보와 근거를 추가해야 합니다."],
  };
}
