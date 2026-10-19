import type { BlogDNAApplyOptions, BlogDNAProfile, GenerateRequest } from "./types";

const DEFAULT_APPLY: BlogDNAApplyOptions = {
  voice: true,
  mood: true,
  structure: true,
  imageRhythm: true,
  visual: true,
};

function clamp01(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, Number(value)));
}

function list(values: string[] | undefined, fallback = "- 관찰 근거 부족") {
  const safe = (values ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 12);
  return safe.length ? safe.map((value) => `- ${value}`).join("\n") : fallback;
}

export function normalizeBlogDNA(profile: BlogDNAProfile): BlogDNAProfile {
  return {
    ...profile,
    version: 2,
    signature: profile.signature?.trim() || "참고 블로그의 편집 DNA",
    confidence: profile.confidence === "high" || profile.confidence === "medium" ? profile.confidence : "low",
    evidenceSummary: profile.evidenceSummary?.trim() || "분석 근거가 제한적입니다.",
    variation: {
      identityFidelity: clamp01(profile.variation?.identityFidelity, 0.84),
      structureFreedom: clamp01(profile.variation?.structureFreedom, 0.4),
      wordingFreedom: clamp01(profile.variation?.wordingFreedom, 0.5),
      imageFreedom: clamp01(profile.variation?.imageFreedom, 0.42),
      antiRepetitionRules: (profile.variation?.antiRepetitionRules ?? []).slice(0, 12),
    },
  };
}

export function buildBlogDNAInstruction(input: GenerateRequest) {
  if (!input.blogDNA) return "";

  const dna = normalizeBlogDNA(input.blogDNA);
  const apply = { ...DEFAULT_APPLY, ...(input.blogDNAApply ?? {}) };
  const recent = (input.recentLayoutFingerprints ?? []).filter(Boolean).slice(-6);

  const parts = [
    `[Blog DNA — 참고 블로그의 편집 정체성]\n프로필명: ${input.styleProfileName || "저장 블로그 스타일"}\n분석 신뢰도: ${dna.confidence}\n근거/한계: ${dna.evidenceSummary}\n핵심 요약: ${dna.signature}`,
  ];

  if (apply.voice) {
    parts.push(`[Voice DNA]
핵심: ${dna.voice.summary}
종결/어미 성향:
${list(dna.voice.endings)}
문장 리듬: ${dna.voice.sentenceRhythm}
문단 리듬: ${dna.voice.paragraphRhythm}
전환 표현군:
${list(dna.voice.transitions)}
어휘 습관:
${list(dna.voice.lexicalHabits)}
감정 표현: ${dna.voice.emotionPattern}
독자와 거리: ${dna.voice.readerDistance}
문장부호/이모지 습관:
${list(dna.voice.punctuationHabits)}
이 스타일에서 피할 표현:
${list(dna.voice.avoid)}`);
  }

  if (apply.mood) {
    parts.push(`[Mood DNA]
핵심: ${dna.mood.summary}
키워드: ${(dna.mood.keywords ?? []).join(", ") || "관찰 근거 부족"}
온도감: ${dna.mood.warmth}
에너지: ${dna.mood.energy}
친밀도: ${dna.mood.intimacy}
정보 밀도: ${dna.mood.informationDensity}
시각 분위기: ${dna.mood.visualMood}`);
  }

  if (apply.structure) {
    parts.push(`[Structure DNA]
핵심: ${dna.structure.summary}
가능한 도입 패턴:
${list(dna.structure.openingPatterns)}
자주 쓰는 전개 패턴:
${list(dna.structure.sectionPatterns)}
가능한 마무리 패턴:
${list(dna.structure.closingPatterns)}
정체성에 가까운 원칙:
${list(dna.structure.fixedPrinciples)}
콘텐츠에 맞게 바꿔도 되는 부분:
${list(dna.structure.flexiblePatterns)}
정보/경험/감정 배분: ${dna.structure.contentBalance}`);
  }

  if (apply.imageRhythm) {
    parts.push(`[Image Rhythm DNA]
핵심: ${dna.imageRhythm.summary}
박자: ${dna.imageRhythm.cadence}
묶음 성향: ${dna.imageRhythm.grouping}
배치 규칙:
${list(dna.imageRhythm.placementRules)}
선호 이미지 역할:
${list(dna.imageRhythm.rolePreferences)}
사진 수/종류 변화 시 적응 규칙:
${list(dna.imageRhythm.adaptationRules)}`);
  }

  if (apply.visual) {
    parts.push(`[Visual DNA]
핵심: ${dna.visual.summary}
정렬: ${dna.visual.alignment}
강조: ${dna.visual.emphasis}
여백/줄바꿈: ${dna.visual.whitespace}
소제목: ${dna.visual.headingStyle}
꾸밈 습관:
${list(dna.visual.decorationHabits)}
피할 꾸밈:
${list(dna.visual.avoid)}`);
  }

  parts.push(`[Adaptive Variation — 공장형 방지]
- 정체성 유지도: ${dna.variation.identityFidelity.toFixed(2)}
- 구조 변주 자유도: ${dna.variation.structureFreedom.toFixed(2)}
- 표현 변주 자유도: ${dna.variation.wordingFreedom.toFixed(2)}
- 이미지 배치 변주 자유도: ${dna.variation.imageFreedom.toFixed(2)}
- 위 수치는 원본의 고정 템플릿을 복사하라는 뜻이 아니다. 정체성은 유지하되 새 콘텐츠의 정보량, 사진 수, 사진 역할, 실제 경험 흐름에 맞춰 자연스럽게 재편집한다.
- 같은 도입 문장, 같은 소제목 순서, 같은 이미지 슬롯 순서, 같은 마무리 문구를 기계적으로 반복하지 않는다.
- 원본의 고유 문장이나 인상적인 문구를 복제하지 않는다. 어휘군·리듬·편집 습관만 적용한다.
- 사진은 번호가 아니라 역할(HERO/공간/메뉴/디테일/과정/설명 등)로 매핑하고, 입력 가능한 이미지 수에 맞춰 묶거나 분산한다.
- 분석 신뢰도가 medium/low인 시각·이미지 규칙은 강제하지 말고 콘텐츠와 플랫폼 자연스러움을 우선한다.
추가 반복 방지 규칙:
${list(dna.variation.antiRepetitionRules)}
최근 생성 레이아웃 지문:
${recent.length ? recent.map((value) => `- ${value}`).join("\n") : "- 없음"}
이번 결과의 layoutFingerprint에는 실제 선택한 도입 방식 + 섹션 흐름 + 이미지 리듬 + 마무리 방식을 120자 이내로 요약한다. 최근 지문과 동일하거나 거의 같은 흐름을 피한다.
variation nonce: ${input.variationNonce || "none"}`);

  return parts.join("\n\n");
}
