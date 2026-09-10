import type { StyleId } from "./types";

export interface StyleStrategy {
  id: Exclude<StyleId, "auto" | "custom">;
  instruction: string;
}

const strategies: StyleStrategy[] = [
  {
    id: "easy-expert",
    instruction: "전문 용어가 나오면 바로 쉬운 말로 풀어 설명한다. 문장은 지나치게 딱딱하지 않게 쓰되 정보 정확도를 우선한다. 한 문단은 대체로 2~4문장, 핵심 개념 뒤에는 짧은 예시나 생활 맥락을 붙인다. 보고서체·논문체를 피한다.",
  },
  {
    id: "patient-guide",
    instruction: "독자에게 차분히 안내하는 존댓말을 사용한다. '먼저', '이럴 때는', '기억해두면 좋은 점은'처럼 순서를 안내하는 표현을 자연스럽게 사용한다. 겁을 주거나 단정하지 않고, 이해와 행동에 도움이 되는 설명을 우선한다.",
  },
  {
    id: "professional-column",
    instruction: "차분하고 밀도 있는 칼럼 문체를 사용한다. 감탄사와 가벼운 리액션은 최소화하고, 주장-이유-맥락 순서가 분명해야 한다. 같은 어미를 반복하지 말고 문장 리듬을 안정적으로 유지한다.",
  },
  {
    id: "honest-review",
    instruction: "직접 써보거나 경험한 사람이 말하듯 작성한다. 장점만 늘어놓지 말고 아쉬운 점과 조건을 함께 적는다. '좋았어요'로 끝내지 말고 왜 그렇게 느꼈는지 구체적으로 설명한다. 광고 문구처럼 과장하지 않는다.",
  },
  {
    id: "casual-daily",
    instruction: "친한 사람에게 하루 이야기를 들려주듯 자연스러운 존댓말/블로그 구어체로 쓴다. 짧은 리액션과 개인적인 관찰을 섞고 문장 길이를 다양하게 한다. 다만 의미 없는 감탄사와 과도한 이모지는 쓰지 않는다.",
  },
  {
    id: "emotional-essay",
    instruction: "장면과 감정을 먼저 보여주고 정보를 뒤따르게 한다. 문장을 부드럽게 연결하고 여운 있는 표현을 사용한다. 키워드 나열이나 설명서 같은 말투는 피한다.",
  },
  {
    id: "concise-record",
    instruction: "짧고 담백하게 쓴다. 한 문장에 한 가지 핵심만 담고 중복 표현을 지운다. 감탄사·수식어를 줄이고 필요한 정보와 경험만 남긴다.",
  },
  {
    id: "friendly-info",
    instruction: "정보는 정확히 주되 말투는 친근하게 유지한다. '쉽게 말하면', '예를 들어', '한 번 체크해볼 부분은' 같은 연결 표현을 적절히 사용한다. 지나치게 상담문이나 교과서처럼 보이지 않게 한다.",
  },
  {
    id: "playful",
    instruction: "가볍고 유쾌한 블로그 말투를 분명하게 사용한다. 짧은 리액션, 말맛 있는 연결, 가벼운 비유나 한마디 농담을 섞되 정보 자체를 희화화하지 않는다. 같은 정중한 설명체만 반복하지 말고 '은근히 여기서 차이가 납니다', '이게 생각보다 포인트예요', '괜히 몸이 먼저 신호를 보내는 게 아니죠'처럼 살아 있는 구어 표현을 적절히 사용한다. 문단마다 농담을 넣지는 말고 전체 글의 20~30% 정도에서 밝은 리듬이 느껴지게 한다. 의료·안전 주제에서는 증상이나 환자를 웃음거리로 만들지 않는다.",
  },
];

export function getStyleStrategy(styleId: StyleId): StyleStrategy | undefined {
  if (styleId === "auto" || styleId === "custom") return undefined;
  return strategies.find((item) => item.id === styleId);
}
