import type { PlatformId } from "./types";

export type ClipboardMode = "plain" | "rich";

export interface PlatformStrategy {
  id: PlatformId;
  clipboardMode: ClipboardMode;
  headingRule: string;
  paragraphRule: string;
  imageRule: string;
  metadataRule: string;
  generationRules: string[];
}

const strategies: Record<PlatformId, PlatformStrategy> = {
  naver: {
    id: "naver",
    clipboardMode: "rich",
    headingRule: "소제목은 스마트에디터 ONE에서 별도 텍스트 블록으로 옮기기 쉽게 짧은 한글 문장형으로 작성한다. Markdown(#, ##)이나 HTML 태그를 본문에 쓰지 않는다.",
    paragraphRule: "모바일 가독성을 우선해 한 문단을 대체로 2~4문장으로 끊고, 긴 문단이 연속되지 않게 한다. 소제목-설명-이미지-추가설명의 리듬을 만든다.",
    imageRule: "대표 이미지는 제목 아래 첫 시각요소로 두고, 나머지 이미지는 관련 설명 직후에 둔다. 이미지는 본문 복붙에 포함시키지 않고 IMG 라벨로 위치만 표시해 네이버 포토업로더로 따로 넣을 수 있게 한다.",
    metadataRule: "태그는 본문 끝에 해시태그 문장으로 붙이지 말고 별도 태그 입력용 데이터로만 반환한다.",
    generationRules: [
      "네이버 블로그에서 읽는 실제 포스트처럼 도입부가 너무 논문식이지 않게 자연스럽게 시작한다.",
      "정보형 글도 소제목만 나열하지 말고 각 소제목 아래 충분한 설명을 넣되 모바일에서 숨이 막히지 않도록 문단을 나눈다.",
      "본문에 H2, H3, Markdown 기호, HTML 태그, 목차용 앵커 문법을 직접 출력하지 않는다.",
      "이미지 앞뒤 문장이 이미지의 역할을 자연스럽게 이어주도록 한다.",
      "시각 강조가 필요한 문장은 presentation metadata로 표현하고 본문 문자열에는 Markdown 기호를 넣지 않는다.",
    ],
  },
  tistory: {
    id: "tistory",
    clipboardMode: "rich",
    headingRule: "제목은 별도 H1로 가정하고 본문 소제목은 H2 중심, 필요한 경우 H3까지 계층적으로 구성한다.",
    paragraphRule: "검색과 스캔 읽기를 고려해 한 섹션 안에서 핵심 설명-세부 설명-요약이 보이도록 구성한다. 문단은 너무 짧게 쪼개지 말고 정보 단위로 묶는다.",
    imageRule: "이미지는 해당 H2/H3 주제의 설명 직후에 두고, 이미지가 정보 구조를 끊지 않게 한다. 대표 이미지는 상단, 설명 이미지는 관련 섹션 내부에 둔다.",
    metadataRule: "태그는 본문과 분리된 메타데이터로 반환하고, 제목/소제목에 핵심 키워드를 자연스럽게 반영한다.",
    generationRules: [
      "검색형 정보글이라면 H2 단위의 주제가 서로 겹치지 않게 하고 각 섹션이 독립적으로 의미를 갖게 한다.",
      "불필요한 감탄사나 짧은 한 줄 문단을 남발하지 않는다.",
      "목차로 변환하기 쉬운 명확한 소제목 계층을 유지한다.",
    ],
  },
  blogger: {
    id: "blogger",
    clipboardMode: "rich",
    headingRule: "게시물 제목은 별도 제목으로 두고 본문은 H2/H3 헤더 구조가 명확하도록 작성한다.",
    paragraphRule: "범용 웹 문서처럼 한 문단에 하나의 핵심 생각을 담고, 지나친 줄바꿈보다 읽기 쉬운 중간 길이 문단을 사용한다.",
    imageRule: "이미지는 관련 헤더 아래 설명과 함께 배치하고 이미지별 설명/alt 작성에 활용할 수 있는 명확한 라벨을 제공한다.",
    metadataRule: "Blogger의 Labels에 옮길 수 있도록 tags는 본문과 분리해서 반환한다.",
    generationRules: [
      "짧고 명확한 제목과 구조화된 헤더를 사용한다.",
      "각 이미지 프롬프트는 나중에 alt 설명을 작성하기 쉬울 정도로 이미지 목적이 명확해야 한다.",
      "범용적인 HTML 문서 구조로 옮겨도 어색하지 않은 흐름을 만든다.",
    ],
  },
  wordpress: {
    id: "wordpress",
    clipboardMode: "rich",
    headingRule: "페이지/게시물 제목을 H1로 가정하고 본문은 H2, 하위 설명은 H3로 구성한다. 각 섹션이 Gutenberg의 독립 Heading/Paragraph 블록으로 자연스럽게 분리되게 한다.",
    paragraphRule: "문단 하나가 Paragraph 블록 하나가 된다고 생각하고 의미 단위로 작성한다. 목록이 더 적절한 정보는 문장으로 억지로 풀지 말고 목록형 내용을 사용해도 된다.",
    imageRule: "이미지는 독립 Image 블록으로 들어갈 위치를 잡고, 대표 이미지와 본문 이미지를 구분한다. 캡션이나 alt 작성에 활용할 수 있게 이미지 역할을 구체화한다.",
    metadataRule: "태그는 본문과 분리한다. 제목 아래 요약은 excerpt로도 활용할 수 있을 만큼 간결하게 작성한다.",
    generationRules: [
      "Heading, Paragraph, Image, List 블록으로 나누기 쉬운 모듈형 구성을 만든다.",
      "H2 아래에 바로 또 H2가 나오지 않도록 충분한 본문을 채운다.",
      "SEO만을 위한 키워드 반복보다 섹션별 정보 완결성을 우선한다.",
    ],
  },
  brunch: {
    id: "brunch",
    clipboardMode: "plain",
    headingRule: "소제목은 꼭 필요한 전환점에만 사용하고, 지나치게 많은 정보형 H2 나열보다 자연스러운 서사 흐름을 우선한다.",
    paragraphRule: "문장과 문단의 호흡을 살리고, 너무 잘게 쪼갠 모바일형 문단보다 읽는 흐름이 이어지는 서술형 문단을 사용한다.",
    imageRule: "이미지는 서사의 장면 전환이나 분위기 보강에 필요한 위치에 제한적으로 배치한다. 정보 카드식 이미지를 과도하게 사용하지 않는다.",
    metadataRule: "태그/키워드 노출을 본문 중심 요소로 만들지 않는다.",
    generationRules: [
      "브런치형 글은 키워드 나열이나 SEO 문장보다 자연스러운 도입-전개-마무리의 읽는 맛을 우선한다.",
      "정보글이라도 보고서처럼 딱딱하게 쓰지 않고 독자가 따라 읽을 수 있는 맥락을 만든다.",
      "소제목과 이미지 수를 필요 이상으로 늘리지 않는다.",
    ],
  },
  other: {
    id: "other",
    clipboardMode: "rich",
    headingRule: "사용자가 지정한 플랫폼 규칙이 있으면 우선 반영하고, 없으면 제목-H2-H3의 범용 구조를 사용한다.",
    paragraphRule: "한 문단에 하나의 정보 단위를 담는 범용 웹 문서 구조를 사용한다.",
    imageRule: "대표 이미지와 본문 이미지를 구분하고 관련 설명 직후에 배치한다.",
    metadataRule: "태그는 본문과 분리된 메타데이터로 반환한다.",
    generationRules: ["특정 플랫폼 기능을 임의로 가정하지 말고 범용 블로그 구조를 사용한다."],
  },
};

export function getPlatformStrategy(platformId: PlatformId): PlatformStrategy {
  return strategies[platformId] ?? strategies.other;
}
