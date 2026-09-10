import type { GenerateRequest } from "./types";

export const DEFAULT_KNOWLEDGE_CATEGORIES = ["health"] as const;

export const KNOWLEDGE_GROUNDING_INSTRUCTION = `
[전문자료 Knowledge Base / RAG]
- file_search 도구가 제공되면, 건강·의료 등 근거가 중요한 사실 설명을 작성하기 전에 관련 자료를 먼저 검색한다.
- 검색된 자료는 근거로 사용하되, 한 문서의 표현을 절대적 사실처럼 과장하지 않는다. 가이드라인·체계적 문헌고찰·공공기관 자료처럼 근거 수준이 높은 자료를 우선 해석한다.
- 검색 결과가 사용자 조건과 직접 관련되지 않으면 억지로 끼워 맞추지 않는다.
- 자료에서 확인되지 않은 세부 수치, 진단, 치료 효과, 인과관계를 만들어내지 않는다.
- 특정 자세·근육·관절 하나를 증상의 확정 원인으로 단정하지 않는다. 관찰 가능한 사실과 관련 가능 요인을 구분한다.
- 서로 다른 자료의 결론이 다르거나 근거가 제한적이면 단정적인 표현 대신 '관련될 수 있다', '개인에 따라 다를 수 있다'처럼 근거 수준에 맞게 표현한다.
- 블로그 본문은 일반 독자를 대상으로 하므로 논문 문장을 그대로 옮기거나 전문용어를 남발하지 않는다. 필요한 전문용어만 사용하고 기존 용어해설 규칙을 따른다.
- 파일명, file id, 내부 검색 결과, 벡터스토어 정보는 블로그 본문이나 태그에 노출하지 않는다. 출처 표시는 별도 기능에서 관리한다.
- 검색 결과가 충분하지 않으면 세부 임상 주장을 임의 생성하지 말고 일반적이고 안전한 수준으로 설명한다.
`;

export function parseKnowledgeCategories(raw?: string): string[] {
  const parsed = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return parsed.length ? parsed : [...DEFAULT_KNOWLEDGE_CATEGORIES];
}

export function shouldUseKnowledgeBase(input: GenerateRequest, allowedCategories: string[]): boolean {
  if (allowedCategories.includes("*")) return true;
  if (input.categoryId && allowedCategories.includes(input.categoryId)) return true;

  // 건강 카테고리를 직접 고르지 않았어도 건강 전용 입력값을 사용한 경우에는
  // 전문자료 grounding을 허용한다.
  const healthSignals = ["bodyPart", "treatmentMethod", "symptom"];
  return allowedCategories.includes("health") && healthSignals.some((key) => Boolean(input.attributes?.[key]?.trim()));
}
