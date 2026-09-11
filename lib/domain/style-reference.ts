import type { GenerateRequest, StyleReferenceMode } from "./types";

const MAX_REFERENCE_CHARS = 12000;

export function normalizeStyleReferenceText(value?: string) {
  return (value ?? "").replace(/\r\n/g, "\n").trim().slice(0, MAX_REFERENCE_CHARS);
}

export function resolveStyleReferenceMode(input: GenerateRequest): StyleReferenceMode {
  return input.styleReferenceMode ?? "preset";
}

export function validateStyleReference(input: GenerateRequest) {
  const mode = resolveStyleReferenceMode(input);
  if (mode === "single-post" && !normalizeStyleReferenceText(input.referencePostText)) {
    return "특정 포스팅 참고 모드에서는 참고할 글 본문을 붙여넣어 주세요.";
  }
  if (mode === "personal-profile" && !input.personalStyleProfile?.trim()) {
    return "내 블로그 스타일 프로필이 아직 없습니다. 우선 기본 문체나 특정 포스팅 참고를 사용해 주세요.";
  }
  return null;
}

export function buildStyleReferenceInstruction(input: GenerateRequest) {
  const mode = resolveStyleReferenceMode(input);
  if (mode === "personal-profile") {
    return `[문체 참조 모드: 내 블로그 스타일]\n아래 Style Profile의 추상적 특징만 반영한다. 기존 글의 고유 문장, 표현, 제목, 사례를 복사하거나 근접 재현하지 않는다.\n- Style Profile: ${input.personalStyleProfile?.trim()}`;
  }

  if (mode === "single-post") {
    const reference = normalizeStyleReferenceText(input.referencePostText);
    return `[문체 참조 모드: 특정 포스팅 1회 참고]\n아래 참고 글은 이번 생성에서만 문체와 구성 특성을 분석하기 위한 자료다. 사실 정보의 근거로 사용하지 말고, 참고 글의 문장·표현·사례·고유 비유를 복사하거나 근접 재현하지 않는다. 대신 문장 길이, 존댓말/말끝, 문단 호흡, 소제목 패턴, 질문형 문장 빈도, 전문용어 밀도, 이모지 사용, 도입/마무리 방식 같은 추상적 스타일 특징만 추출해 새 글에 적용한다.\n\n[일회성 참고 글]\n${reference}`;
  }

  return "[문체 참조 모드: 블로토리 기본 문체]\n선택된 Blotori 문체 Strategy만 사용한다.";
}
