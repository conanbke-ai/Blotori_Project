import type { GenerateRequest, PlatformId, StyleId } from "./types";
import { getStyleStrategy } from "./style-strategy";

const platformTitleRules: Record<PlatformId, string> = {
  naver: "검색어를 억지로 나열하지 말고 한국어 블로그에서 자연스럽게 클릭되는 문장형 제목을 우선한다. 핵심 주제어는 가능하면 앞쪽 절반에 자연스럽게 포함한다.",
  tistory: "검색 의도가 분명한 정보형 제목을 우선하되 키워드 반복은 피한다. 제목만 읽어도 글에서 얻을 정보가 예상되어야 한다.",
  blogger: "짧고 명확한 웹 문서형 제목을 우선한다. 번역투나 과도한 수식어를 피한다.",
  wordpress: "검색 의도와 정보 이득이 명확한 제목을 우선한다. H1로 사용했을 때 자연스러운 완결형 제목이어야 한다.",
  brunch: "검색 키워드보다 읽고 싶은 문장과 서사적 호기심을 우선한다. 지나치게 SEO형으로 보이지 않게 한다.",
  other: "플랫폼 정보가 없으면 주제와 독자 목적이 명확한 범용 블로그 제목을 만든다.",
};

const styleTitleRules: Partial<Record<StyleId, string>> = {
  "easy-expert": "전문성을 잃지 않되 일반 독자가 바로 이해할 수 있는 쉬운 제목을 쓴다.",
  "patient-guide": "불안을 자극하지 않고 무엇을 알게 되는지 차분히 안내하는 제목을 쓴다.",
  "professional-column": "가볍거나 낚시성 표현 없이 논점과 맥락이 드러나는 칼럼형 제목을 쓴다.",
  "honest-review": "직접 경험한 느낌과 판단 기준이 드러나는 후기형 제목을 쓴다.",
  "casual-daily": "친구에게 이야기를 꺼내듯 자연스럽고 생활감 있는 제목을 쓴다.",
  "emotional-essay": "장면이나 감정, 여운을 살리는 제목을 쓴다. 정보 키워드 나열을 피한다.",
  "concise-record": "군더더기 없이 짧고 명확한 제목을 쓴다.",
  "friendly-info": "정보성이 분명하면서도 딱딱하지 않은 제목을 쓴다.",
  playful: "가벼운 말맛과 호기심을 살리되 과장·낚시성 표현은 피한다.",
};

function clean(value?: string) {
  return value?.trim() || "";
}

export function buildTitleInstruction(input: GenerateRequest): string {
  const explicitGoal = clean(input.attributes?.goal);
  const styleRule = styleTitleRules[input.styleId] ?? getStyleStrategy(input.styleId)?.instruction ?? "선택한 문체와 제목의 말투가 일치해야 한다.";
  const purposeRule = explicitGoal
    ? `사용자가 지정한 글의 목적은 “${explicitGoal}”이다. 제목부터 이 목적이 자연스럽게 드러나야 한다.`
    : "별도 목적이 없으면 주제 프리셋·글 구성·독자를 바탕으로 가장 자연스러운 목적을 추론한다. 정보 정리형이면 정보 이득, 가이드형이면 해결/행동, 후기형이면 경험/평가, 스토리형이면 호기심과 장면을 우선한다.";

  return [
    purposeRule,
    platformTitleRules[input.platformId],
    styleRule,
    "제목 후보를 정확히 3개 만든다. 세 후보는 같은 문장을 조금 바꾼 수준이 아니라 서로 다른 각도를 가져야 한다.",
    "후보 1은 목적 적합성을 가장 우선하고, 후보 2는 독자 호기심/자연스러움을, 후보 3은 플랫폼 적합성과 검색/발견 가능성을 우선한다.",
    "‘정리’, ‘안내’, ‘정보’, ‘가이드’ 같은 명사를 습관적으로 제목 끝에 붙이지 않는다. 실제로 그 단어가 가장 자연스러운 경우에만 허용한다.",
    "입력 키워드를 쉼표로 나열하거나 ‘A B C 정리’처럼 기계적으로 조합하지 않는다.",
    "과장, 공포, 완치/보장, 클릭베이트는 사용하지 않는다.",
    "세 후보 중 본문 목적·문체·플랫폼에 가장 잘 맞는 하나를 title로 선택한다.",
  ].join("\n");
}
