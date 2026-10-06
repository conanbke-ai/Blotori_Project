import type { ImageRole, PlatformId, StructureId, StyleId } from "./types";

export interface OptionDefinition {
  value: string;
  label: string;
}

export interface FieldDefinition {
  id: string;
  label: string;
  type: "text" | "select";
  placeholder?: string;
  options?: OptionDefinition[];
}

export interface TopicPreset {
  id: string;
  label: string;
  description: string;
  fieldIds: string[];
  recommendedStyleIds: StyleId[];
  recommendedStructureIds: StructureId[];
  suggestedImageRoles: ImageRole[];
}

export interface CategoryDefinition {
  id: string;
  label: string;
  description: string;
  defaultFieldIds: string[];
  presets: TopicPreset[];
}

export interface PlatformProfile {
  id: PlatformId;
  label: string;
  description: string;
  writingHint: string;
  exportHint: string;
}

export interface StyleDefinition {
  id: Exclude<StyleId, "auto" | "custom">;
  label: string;
  description: string;
}

export interface StructureDefinition {
  id: Exclude<StructureId, "auto" | "custom">;
  label: string;
  description: string;
}

const ageOptions = ["전 연령", "10대", "20대", "30대", "40대", "50대", "60대 이상"].map((value) => ({ value, label: value }));

export const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  ageGroup: { id: "ageGroup", label: "연령대", type: "select", options: ageOptions },
  audience: { id: "audience", label: "주요 독자", type: "text", placeholder: "예: 직장인, 초보자, 부모님 세대" },
  bodyPart: { id: "bodyPart", label: "부위", type: "text", placeholder: "예: 목·어깨, 허리, 무릎" },
  treatmentMethod: { id: "treatmentMethod", label: "치료·관리 방법", type: "text", placeholder: "예: 도수치료, 운동치료, 생활관리" },
  symptom: { id: "symptom", label: "증상·고민", type: "text", placeholder: "예: 뻐근함, 움직임 불편, 피로감" },
  situation: { id: "situation", label: "상황", type: "text", placeholder: "예: 장시간 PC 사용, 등산 후, 출근 전" },
  goal: { id: "goal", label: "글의 목적", type: "text", placeholder: "예: 이해하기 쉽게 교육, 생활 팁 중심" },
  place: { id: "place", label: "장소·가게", type: "text", placeholder: "예: 성수동 카페, 시장 이름" },
  menu: { id: "menu", label: "메뉴·먹거리", type: "text", placeholder: "예: 라떼, 케이크, 국밥" },
  visitPurpose: { id: "visitPurpose", label: "방문 목적", type: "text", placeholder: "예: 데이트, 가족 외식, 혼밥" },
  priceRange: { id: "priceRange", label: "가격대", type: "text", placeholder: "예: 1인 2만원대" },
  tastePoint: { id: "tastePoint", label: "맛·인상 포인트", type: "text", placeholder: "예: 담백함, 매콤함, 양이 많음" },
  event: { id: "event", label: "일상 이벤트", type: "text", placeholder: "예: 출근, 주말 나들이, 집 정리" },
  mood: { id: "mood", label: "분위기·감정", type: "text", placeholder: "예: 가볍게, 차분하게, 웃긴 에피소드 중심" },
  people: { id: "people", label: "함께한 사람", type: "text", placeholder: "예: 혼자, 친구, 가족" },
  destination: { id: "destination", label: "여행지·장소", type: "text", placeholder: "예: 제주도, 북촌, 오사카" },
  tripType: { id: "tripType", label: "여행 형태", type: "text", placeholder: "예: 당일치기, 2박 3일, 혼자 여행" },
  duration: { id: "duration", label: "기간", type: "text", placeholder: "예: 하루, 주말, 3박 4일" },
  highlight: { id: "highlight", label: "강조할 포인트", type: "text", placeholder: "예: 동선, 사진 명소, 음식" },
  productName: { id: "productName", label: "제품·서비스명", type: "text", placeholder: "예: 키보드 모델명, 앱 이름" },
  usagePeriod: { id: "usagePeriod", label: "사용 기간", type: "text", placeholder: "예: 1개월 사용" },
  pros: { id: "pros", label: "장점", type: "text", placeholder: "직접 느낀 장점을 적어주세요" },
  cons: { id: "cons", label: "아쉬운 점", type: "text", placeholder: "직접 느낀 아쉬운 점을 적어주세요" },
  targetUser: { id: "targetUser", label: "추천 대상", type: "text", placeholder: "예: 개발자, 입문자, 가성비 중시 사용자" },
  material: { id: "material", label: "정리할 자료", type: "text", placeholder: "예: 강의 내용, 책 한 챕터, 교육자료" },
  difficulty: { id: "difficulty", label: "난이도", type: "select", options: ["입문", "기초", "중급", "심화"].map((value) => ({ value, label: value })) },
  learningGoal: { id: "learningGoal", label: "학습 목표", type: "text", placeholder: "예: 초보자가 개념을 이해하도록" },
  activity: { id: "activity", label: "취미·활동", type: "text", placeholder: "예: 러닝, 전시 관람, 게임" },
  experienceLevel: { id: "experienceLevel", label: "경험 수준", type: "text", placeholder: "예: 입문 2개월, 오래 즐긴 취미" },

  brand: { id: "brand", label: "브랜드·대상", type: "text", placeholder: "예: 갤럭시, 자동차 모델, 화장품 브랜드" },
  budget: { id: "budget", label: "예산·가격", type: "text", placeholder: "예: 20만원 이하, 월 10만원" },
  skinType: { id: "skinType", label: "피부·스타일 조건", type: "text", placeholder: "예: 건성, 민감성, 미니멀룩" },
  childAge: { id: "childAge", label: "아이 연령·상황", type: "text", placeholder: "예: 초등 3학년, 18개월" },
  petType: { id: "petType", label: "반려동물", type: "text", placeholder: "예: 강아지, 고양이" },
  propertyType: { id: "propertyType", label: "부동산 유형", type: "text", placeholder: "예: 아파트, 오피스텔, 상가" },
  region: { id: "region", label: "지역", type: "text", placeholder: "예: 부천 중동, 서울 성수" },
  financeTopic: { id: "financeTopic", label: "재테크 주제", type: "text", placeholder: "예: ETF, 연금, 절세" },
  careerTopic: { id: "careerTopic", label: "취업·커리어 주제", type: "text", placeholder: "예: 신입 개발자, 면접, 이직" },
  vehicle: { id: "vehicle", label: "차량·모델", type: "text", placeholder: "예: 아이오닉 6, 중형 SUV" },
  gameTitle: { id: "gameTitle", label: "게임·콘텐츠명", type: "text", placeholder: "예: 게임명, 영화, 드라마, 애니" },
  roomType: { id: "roomType", label: "공간·인테리어", type: "text", placeholder: "예: 원룸, 주방, 거실" },
  campaignGoal: { id: "campaignGoal", label: "마케팅 목표", type: "text", placeholder: "예: 유입 증가, 전환, 브랜딩" },
  keywords: { id: "keywords", label: "꼭 넣을 키워드", type: "text", placeholder: "쉼표로 여러 개 입력 가능" },
};

export const PLATFORM_PROFILES: PlatformProfile[] = [
  { id: "naver", label: "네이버 블로그", description: "모바일 가독성과 이미지 흐름을 중시", writingHint: "짧은 문단과 명확한 소제목, 이미지 사이의 자연스러운 호흡을 우선한다.", exportHint: "복붙 시 구조가 무너지지 않도록 단순한 단일 컬럼 흐름을 사용한다." },
  { id: "tistory", label: "티스토리", description: "정보 구조와 검색 친화적 소제목 구성", writingHint: "H2/H3로 옮기기 쉬운 계층형 소제목과 정보 밀도를 우선한다.", exportHint: "HTML 편집기로 확장할 수 있도록 섹션 구조를 명확하게 유지한다." },
  { id: "blogger", label: "Blogger", description: "단순하고 범용적인 블로그 문서 구조", writingHint: "복잡한 장식보다 제목-소제목-문단의 명확한 흐름을 우선한다.", exportHint: "범용 HTML 또는 일반 텍스트로 옮기기 쉬운 구조를 유지한다." },
  { id: "wordpress", label: "WordPress", description: "콘텐츠 블록과 SEO형 계층 구조에 적합", writingHint: "검색 의도에 맞는 제목과 계층적 소제목, 요약 가능한 문단 구성을 우선한다.", exportHint: "블록 에디터에 옮기기 쉬운 독립 섹션 구조를 유지한다." },
  { id: "brunch", label: "브런치스토리", description: "긴 호흡의 글과 서사형 콘텐츠에 적합", writingHint: "과도한 키워드 나열보다 자연스러운 문장 흐름과 읽는 맛을 우선한다.", exportHint: "이미지보다 본문 서사의 연속성이 깨지지 않도록 구성한다." },
  { id: "other", label: "기타", description: "직접 플랫폼을 지정하거나 범용 형식 사용", writingHint: "사용자가 입력한 플랫폼 특성이 있으면 반영하고, 없으면 범용 블로그 구조를 사용한다.", exportHint: "특정 에디터 기능에 의존하지 않는 범용 구조를 유지한다." },
];

export const STYLE_DEFINITIONS: StyleDefinition[] = [
  { id: "easy-expert", label: "이해하기 쉬운 전문 설명형", description: "전문 내용을 일반 독자에게 쉽게 풀어 설명" },
  { id: "patient-guide", label: "안내·교육형", description: "차분하고 친절하게 순서와 주의점을 안내" },
  { id: "professional-column", label: "전문가 칼럼형", description: "근거와 맥락을 중심으로 밀도 있게 정리" },
  { id: "honest-review", label: "솔직한 후기형", description: "좋았던 점과 아쉬운 점을 과장 없이 표현" },
  { id: "casual-daily", label: "편안한 일상형", description: "친구에게 이야기하듯 자연스럽고 가볍게 작성" },
  { id: "emotional-essay", label: "감성 에세이형", description: "장면과 감정을 살린 부드러운 서술" },
  { id: "concise-record", label: "짧고 담백한 기록형", description: "군더더기 없이 핵심 경험과 정보만 정리" },
  { id: "friendly-info", label: "친근한 정보형", description: "정보 전달과 친근한 블로그 말투를 균형 있게 사용" },
  { id: "playful", label: "가볍고 유쾌한 문체", description: "적당한 리액션과 위트를 살린 밝은 톤" },
  { id: "shareable-info", label: "저장·공유형 정보 콘텐츠", description: "짧은 문단·핵심 강조·체크 포인트·요약으로 빠르게 읽고 저장하기 좋은 정보형 콘텐츠" },
];

export const STRUCTURE_DEFINITIONS: StructureDefinition[] = [
  { id: "information", label: "정보 정리형", description: "핵심 개념과 포인트를 순서대로 정리" },
  { id: "guide", label: "가이드형", description: "처음부터 끝까지 따라가기 쉽게 단계형으로 구성" },
  { id: "review", label: "후기형", description: "경험-장점-아쉬운 점-총평 흐름" },
  { id: "story", label: "스토리형", description: "상황과 경험을 시간 흐름에 따라 전개" },
  { id: "faq", label: "Q&A형", description: "독자가 궁금해할 질문에 답하는 구성" },
  { id: "checklist", label: "체크리스트형", description: "확인할 점과 팁을 항목 중심으로 정리" },
  { id: "comparison", label: "비교형", description: "둘 이상의 대상이나 선택지를 기준별로 비교" },
];

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    id: "health",
    label: "건강·의료",
    description: "건강정보, 치료·관리 교육, 자세·생활습관",
    defaultFieldIds: ["audience", "situation", "goal"],
    presets: [
      { id: "treatment-education", label: "치료·관리 교육자료 정리", description: "특정 치료·관리 방법을 이해하기 쉽게 설명", fieldIds: ["ageGroup", "bodyPart", "treatmentMethod", "symptom", "situation", "goal"], recommendedStyleIds: ["easy-expert", "patient-guide", "professional-column"], recommendedStructureIds: ["information", "guide", "faq"], suggestedImageRoles: ["HERO", "EXPLAINER", "PROCESS", "TIP"] },
      { id: "posture-lifestyle", label: "자세·생활습관 정보", description: "생활 습관과 자세를 중심으로 설명", fieldIds: ["ageGroup", "bodyPart", "situation", "symptom", "goal"], recommendedStyleIds: ["friendly-info", "easy-expert", "patient-guide"], recommendedStructureIds: ["information", "checklist", "guide"], suggestedImageRoles: ["HERO", "CONTEXT", "EXPLAINER", "TIP"] },
      { id: "symptom-information", label: "증상·부위 정보", description: "특정 증상이나 신체 부위를 정보성으로 정리", fieldIds: ["ageGroup", "bodyPart", "symptom", "situation", "goal"], recommendedStyleIds: ["easy-expert", "friendly-info", "professional-column"], recommendedStructureIds: ["information", "faq", "checklist"], suggestedImageRoles: ["HERO", "EXPLAINER", "TIP", "CAUTION"] },
    ],
  },
  {
    id: "food",
    label: "음식·맛집",
    description: "맛집, 카페, 먹거리 소개와 후기",
    defaultFieldIds: ["place", "menu", "tastePoint"],
    presets: [
      { id: "restaurant-review", label: "맛집 방문 후기", description: "직접 방문 경험을 중심으로 정리", fieldIds: ["place", "menu", "visitPurpose", "priceRange", "tastePoint"], recommendedStyleIds: ["honest-review", "casual-daily", "friendly-info"], recommendedStructureIds: ["review", "story", "information"], suggestedImageRoles: ["HERO", "CONTEXT", "EXPLAINER", "TIP"] },
      { id: "food-introduction", label: "먹거리 소개", description: "음식이나 메뉴의 특징을 중심으로 소개", fieldIds: ["menu", "place", "tastePoint", "priceRange", "audience"], recommendedStyleIds: ["friendly-info", "honest-review", "playful"], recommendedStructureIds: ["information", "review", "checklist"], suggestedImageRoles: ["HERO", "CONTEXT", "EXPLAINER"] },
    ],
  },
  {
    id: "daily",
    label: "일상·라이프",
    description: "하루 기록, 루틴, 소소한 경험 공유",
    defaultFieldIds: ["event", "mood", "people"],
    presets: [
      { id: "daily-record", label: "일상 기록", description: "하루의 장면과 감정을 자연스럽게 기록", fieldIds: ["event", "mood", "people", "highlight"], recommendedStyleIds: ["casual-daily", "concise-record", "emotional-essay"], recommendedStructureIds: ["story", "information"], suggestedImageRoles: ["HERO", "CONTEXT", "TIP"] },
      { id: "routine-share", label: "루틴·생활 팁 공유", description: "반복하는 습관이나 루틴을 정리", fieldIds: ["event", "audience", "situation", "highlight"], recommendedStyleIds: ["friendly-info", "shareable-info", "casual-daily"], recommendedStructureIds: ["guide", "checklist", "story"], suggestedImageRoles: ["HERO", "PROCESS", "TIP"] },
    ],
  },
  {
    id: "travel",
    label: "여행·장소",
    description: "여행기, 장소 소개, 동선과 팁",
    defaultFieldIds: ["destination", "tripType", "highlight"],
    presets: [
      { id: "travel-review", label: "여행·장소 후기", description: "직접 다녀온 경험을 중심으로 정리", fieldIds: ["destination", "tripType", "duration", "people", "highlight"], recommendedStyleIds: ["casual-daily", "emotional-essay", "friendly-info"], recommendedStructureIds: ["story", "review", "guide"], suggestedImageRoles: ["HERO", "CONTEXT", "PROCESS", "TIP"] },
      { id: "destination-guide", label: "여행지 가이드", description: "장소 정보와 방문 팁 중심", fieldIds: ["destination", "tripType", "duration", "audience", "highlight"], recommendedStyleIds: ["friendly-info", "shareable-info", "easy-expert"], recommendedStructureIds: ["guide", "checklist", "information"], suggestedImageRoles: ["HERO", "CONTEXT", "EXPLAINER", "TIP"] },
    ],
  },
  {
    id: "review",
    label: "제품·서비스 리뷰",
    description: "직접 사용한 제품이나 서비스의 후기·비교",
    defaultFieldIds: ["productName", "usagePeriod", "targetUser"],
    presets: [
      { id: "product-review", label: "제품 사용 후기", description: "사용 경험을 장단점과 함께 정리", fieldIds: ["productName", "usagePeriod", "pros", "cons", "targetUser"], recommendedStyleIds: ["honest-review", "friendly-info", "concise-record"], recommendedStructureIds: ["review", "comparison", "checklist"], suggestedImageRoles: ["HERO", "CONTEXT", "EXPLAINER", "TIP"] },
      { id: "service-review", label: "서비스 사용 후기", description: "앱·서비스·시설 등의 이용 경험 정리", fieldIds: ["productName", "usagePeriod", "pros", "cons", "targetUser"], recommendedStyleIds: ["honest-review", "casual-daily", "friendly-info"], recommendedStructureIds: ["review", "information", "comparison"], suggestedImageRoles: ["HERO", "CONTEXT", "PROCESS", "TIP"] },
    ],
  },
  {
    id: "education",
    label: "교육·정보 정리",
    description: "개념, 강의, 책, 자료를 읽기 쉽게 재구성",
    defaultFieldIds: ["material", "audience", "learningGoal"],
    presets: [
      { id: "concept-summary", label: "개념 정리", description: "어려운 개념을 단계적으로 설명", fieldIds: ["material", "difficulty", "audience", "learningGoal", "keywords"], recommendedStyleIds: ["easy-expert", "shareable-info", "friendly-info"], recommendedStructureIds: ["information", "guide", "faq"], suggestedImageRoles: ["HERO", "EXPLAINER", "PROCESS", "TIP"] },
      { id: "material-summary", label: "교육자료 요약·정리", description: "자료 내용을 독자 수준에 맞춰 재구성", fieldIds: ["material", "difficulty", "audience", "learningGoal", "keywords"], recommendedStyleIds: ["easy-expert", "shareable-info", "concise-record"], recommendedStructureIds: ["information", "checklist", "guide"], suggestedImageRoles: ["HERO", "EXPLAINER", "TIP"] },
    ],
  },
  {
    id: "hobby",
    label: "취미·문화",
    description: "취미 활동, 전시·공연·콘텐츠 경험과 추천",
    defaultFieldIds: ["activity", "experienceLevel", "highlight"],
    presets: [
      { id: "experience-share", label: "경험 공유", description: "직접 해본 경험과 느낌을 중심으로 작성", fieldIds: ["activity", "experienceLevel", "people", "highlight"], recommendedStyleIds: ["casual-daily", "honest-review", "emotional-essay"], recommendedStructureIds: ["story", "review", "information"], suggestedImageRoles: ["HERO", "CONTEXT", "TIP"] },
      { id: "recommendation", label: "추천·입문 가이드", description: "처음 시작하는 독자에게 추천과 팁 제공", fieldIds: ["activity", "experienceLevel", "audience", "highlight"], recommendedStyleIds: ["friendly-info", "shareable-info", "easy-expert"], recommendedStructureIds: ["guide", "checklist", "information"], suggestedImageRoles: ["HERO", "EXPLAINER", "PROCESS", "TIP"] },
    ],
  },
  {
    id: "tech",
    label: "IT·테크",
    description: "IT 제품, 앱, 소프트웨어, 디지털 서비스 리뷰와 활용",
    defaultFieldIds: ["productName", "usagePeriod", "targetUser"],
    presets: [
      { id: "it-product-review", label: "IT 제품 실사용 리뷰", description: "기기·주변기기의 실사용 경험과 장단점", fieldIds: ["productName", "usagePeriod", "pros", "cons", "targetUser"], recommendedStyleIds: ["honest-review", "friendly-info", "concise-record"], recommendedStructureIds: ["review", "comparison", "checklist"], suggestedImageRoles: ["HERO", "CONTEXT", "EXPLAINER", "TIP"] },
      { id: "app-software-guide", label: "앱·소프트웨어 활용 가이드", description: "기능과 사용법을 단계적으로 정리", fieldIds: ["productName", "audience", "goal", "keywords"], recommendedStyleIds: ["easy-expert", "friendly-info", "shareable-info"], recommendedStructureIds: ["guide", "information", "faq"], suggestedImageRoles: ["HERO", "PROCESS", "EXPLAINER", "TIP"] },
    ],
  },
  {
    id: "beauty-fashion",
    label: "뷰티·패션",
    description: "화장품, 스킨케어, 패션, 스타일링 후기와 추천",
    defaultFieldIds: ["brand", "skinType", "priceRange"],
    presets: [
      { id: "beauty-review", label: "뷰티 제품 후기", description: "사용감·발림·지속력 등 체감 중심 리뷰", fieldIds: ["brand", "productName", "skinType", "usagePeriod", "pros", "cons"], recommendedStyleIds: ["honest-review", "casual-daily", "friendly-info"], recommendedStructureIds: ["review", "comparison", "information"], suggestedImageRoles: ["HERO", "CONTEXT", "EXPLAINER", "TIP"] },
      { id: "fashion-style", label: "패션·스타일링 기록", description: "코디, 착용감, 스타일 포인트 중심", fieldIds: ["brand", "productName", "situation", "mood", "priceRange"], recommendedStyleIds: ["casual-daily", "emotional-essay", "honest-review"], recommendedStructureIds: ["story", "review", "checklist"], suggestedImageRoles: ["HERO", "CONTEXT", "TIP"] },
    ],
  },
  {
    id: "parenting-family",
    label: "육아·가족",
    description: "육아 기록, 교육, 가족 생활, 결혼·가족 정보",
    defaultFieldIds: ["childAge", "situation", "goal"],
    presets: [
      { id: "parenting-diary", label: "육아 일상 기록", description: "아이와의 하루와 변화 과정을 자연스럽게 기록", fieldIds: ["childAge", "event", "mood", "highlight"], recommendedStyleIds: ["casual-daily", "emotional-essay", "friendly-info"], recommendedStructureIds: ["story", "information"], suggestedImageRoles: ["HERO", "CONTEXT", "TIP"] },
      { id: "parenting-info", label: "육아·가족 정보형", description: "지원제도·생활팁·준비사항을 정리", fieldIds: ["childAge", "audience", "situation", "goal"], recommendedStyleIds: ["friendly-info", "shareable-info", "easy-expert"], recommendedStructureIds: ["information", "checklist", "guide"], suggestedImageRoles: ["HERO", "EXPLAINER", "TIP"] },
    ],
  },
  {
    id: "pets",
    label: "반려동물",
    description: "반려동물 일상, 용품, 건강·생활 관리 정보",
    defaultFieldIds: ["petType", "event", "goal"],
    presets: [
      { id: "pet-diary", label: "반려동물 일상 기록", description: "사진과 에피소드 중심의 반려생활 기록", fieldIds: ["petType", "event", "mood", "highlight"], recommendedStyleIds: ["casual-daily", "playful", "emotional-essay"], recommendedStructureIds: ["story", "review"], suggestedImageRoles: ["HERO", "CONTEXT", "TIP"] },
      { id: "pet-guide", label: "반려생활 정보·용품 가이드", description: "용품 사용기와 생활 팁을 실용적으로 정리", fieldIds: ["petType", "productName", "usagePeriod", "pros", "cons"], recommendedStyleIds: ["friendly-info", "honest-review", "easy-expert"], recommendedStructureIds: ["review", "guide", "checklist"], suggestedImageRoles: ["HERO", "CONTEXT", "PROCESS", "TIP"] },
    ],
  },
  {
    id: "real-estate",
    label: "부동산",
    description: "임장, 지역 분석, 주거·상가 정보",
    defaultFieldIds: ["region", "propertyType", "goal"],
    presets: [
      { id: "field-report", label: "임장·현장 기록", description: "직접 본 입지·주변환경·단지 체감을 기록", fieldIds: ["region", "propertyType", "situation", "highlight"], recommendedStyleIds: ["professional-column", "friendly-info", "concise-record"], recommendedStructureIds: ["story", "information", "checklist"], suggestedImageRoles: ["HERO", "CONTEXT", "EXPLAINER", "TIP"] },
      { id: "area-analysis", label: "지역·입지 분석", description: "교통·생활권·가격·개발 이슈를 구조적으로 분석", fieldIds: ["region", "propertyType", "audience", "goal"], recommendedStyleIds: ["professional-column", "easy-expert", "shareable-info"], recommendedStructureIds: ["information", "comparison", "checklist"], suggestedImageRoles: ["HERO", "EXPLAINER", "TIP"] },
    ],
  },
  {
    id: "finance",
    label: "재테크·경제",
    description: "투자, 절세, 금융, 경제정보",
    defaultFieldIds: ["financeTopic", "audience", "goal"],
    presets: [
      { id: "finance-explainer", label: "재테크 개념 설명", description: "복잡한 금융 개념을 쉽게 풀어 설명", fieldIds: ["financeTopic", "audience", "difficulty", "goal"], recommendedStyleIds: ["easy-expert", "professional-column", "shareable-info"], recommendedStructureIds: ["information", "faq", "comparison"], suggestedImageRoles: ["HERO", "EXPLAINER", "TIP", "CAUTION"] },
      { id: "market-note", label: "경제·시장 정리", description: "이슈와 숫자를 맥락 중심으로 정리", fieldIds: ["financeTopic", "keywords", "audience", "goal"], recommendedStyleIds: ["professional-column", "concise-record", "easy-expert"], recommendedStructureIds: ["information", "comparison"], suggestedImageRoles: ["HERO", "EXPLAINER", "TIP"] },
    ],
  },
  {
    id: "career",
    label: "취업·커리어",
    description: "취업 준비, 자격증, 직무, 이직, 업무 노하우",
    defaultFieldIds: ["careerTopic", "audience", "goal"],
    presets: [
      { id: "job-prep-guide", label: "취업 준비 가이드", description: "시험·면접·서류·준비과정을 단계적으로 정리", fieldIds: ["careerTopic", "audience", "difficulty", "goal"], recommendedStyleIds: ["friendly-info", "shareable-info", "easy-expert"], recommendedStructureIds: ["guide", "checklist", "faq"], suggestedImageRoles: ["HERO", "PROCESS", "TIP"] },
      { id: "career-experience", label: "직무·이직 경험담", description: "실제 경험과 배운 점 중심의 커리어 기록", fieldIds: ["careerTopic", "experienceLevel", "mood", "highlight"], recommendedStyleIds: ["honest-review", "casual-daily", "professional-column"], recommendedStructureIds: ["story", "review", "information"], suggestedImageRoles: ["HERO", "CONTEXT", "TIP"] },
    ],
  },
  {
    id: "auto",
    label: "자동차",
    description: "자동차 리뷰, 시승, 유지관리, 비교",
    defaultFieldIds: ["vehicle", "usagePeriod", "targetUser"],
    presets: [
      { id: "car-review", label: "자동차 시승·실사용 리뷰", description: "주행감·공간·편의기능·단점을 실제 체감 중심으로 정리", fieldIds: ["vehicle", "usagePeriod", "pros", "cons", "targetUser"], recommendedStyleIds: ["honest-review", "professional-column", "friendly-info"], recommendedStructureIds: ["review", "comparison", "checklist"], suggestedImageRoles: ["HERO", "CONTEXT", "EXPLAINER", "TIP"] },
      { id: "car-info", label: "차량 정보·비교형", description: "스펙과 선택 기준을 구조적으로 비교", fieldIds: ["vehicle", "budget", "targetUser", "keywords"], recommendedStyleIds: ["easy-expert", "professional-column", "shareable-info"], recommendedStructureIds: ["comparison", "information", "faq"], suggestedImageRoles: ["HERO", "EXPLAINER", "TIP"] },
    ],
  },
  {
    id: "gaming-entertainment",
    label: "게임·엔터테인먼트",
    description: "게임, 영화, 드라마, 애니, 방송, 연예 콘텐츠",
    defaultFieldIds: ["gameTitle", "mood", "highlight"],
    presets: [
      { id: "game-review", label: "게임 플레이 후기", description: "플레이 경험, 재미, 장단점을 중심으로 리뷰", fieldIds: ["gameTitle", "usagePeriod", "pros", "cons", "targetUser"], recommendedStyleIds: ["casual-daily", "honest-review", "playful"], recommendedStructureIds: ["review", "story", "comparison"], suggestedImageRoles: ["HERO", "CONTEXT", "EXPLAINER"] },
      { id: "media-review", label: "영화·드라마·애니 감상", description: "작품 정보와 감상을 스포일러 강도에 맞춰 구성", fieldIds: ["gameTitle", "mood", "highlight", "audience"], recommendedStyleIds: ["emotional-essay", "honest-review", "casual-daily"], recommendedStructureIds: ["review", "story", "information"], suggestedImageRoles: ["HERO", "CONTEXT", "TIP"] },
    ],
  },
  {
    id: "living-interior",
    label: "리빙·인테리어",
    description: "집꾸미기, 공간 개선, 살림, 인테리어 정보",
    defaultFieldIds: ["roomType", "budget", "goal"],
    presets: [
      { id: "home-makeover", label: "공간 변화·집꾸미기 기록", description: "전후 사진과 선택 이유를 중심으로 공간 변화를 기록", fieldIds: ["roomType", "budget", "mood", "highlight"], recommendedStyleIds: ["casual-daily", "honest-review", "friendly-info"], recommendedStructureIds: ["story", "review", "guide"], suggestedImageRoles: ["HERO", "CONTEXT", "PROCESS", "TIP"] },
      { id: "interior-guide", label: "인테리어 정보·가이드", description: "자재·배치·수납·비용 정보를 실용적으로 정리", fieldIds: ["roomType", "budget", "audience", "goal"], recommendedStyleIds: ["friendly-info", "shareable-info", "easy-expert"], recommendedStructureIds: ["guide", "checklist", "comparison"], suggestedImageRoles: ["HERO", "EXPLAINER", "PROCESS", "TIP"] },
    ],
  },
  {
    id: "marketing-business",
    label: "마케팅·비즈니스",
    description: "마케팅, 브랜딩, 콘텐츠 운영, 실무 노하우",
    defaultFieldIds: ["campaignGoal", "audience", "goal"],
    presets: [
      { id: "marketing-case", label: "마케팅 사례 분석", description: "문제·전략·실행·성과·배움을 사례 중심으로 정리", fieldIds: ["brand", "campaignGoal", "audience", "highlight"], recommendedStyleIds: ["professional-column", "easy-expert", "shareable-info"], recommendedStructureIds: ["information", "comparison", "story"], suggestedImageRoles: ["HERO", "EXPLAINER", "TIP"] },
      { id: "business-howto", label: "실무 노하우 가이드", description: "업무 절차와 체크포인트를 실용적으로 정리", fieldIds: ["campaignGoal", "audience", "difficulty", "goal"], recommendedStyleIds: ["friendly-info", "shareable-info", "easy-expert"], recommendedStructureIds: ["guide", "checklist", "faq"], suggestedImageRoles: ["HERO", "PROCESS", "EXPLAINER", "TIP"] },
    ],
  },
  {
    id: "outdoor-sports",
    label: "스포츠·아웃도어",
    description: "스포츠, 등산, 캠핑, 낚시 등 야외 활동",
    defaultFieldIds: ["activity", "experienceLevel", "highlight"],
    presets: [
      { id: "outdoor-diary", label: "아웃도어 경험 기록", description: "코스·장비·현장감과 체감을 사진 중심으로 기록", fieldIds: ["activity", "experienceLevel", "destination", "highlight"], recommendedStyleIds: ["casual-daily", "honest-review", "friendly-info"], recommendedStructureIds: ["story", "review", "guide"], suggestedImageRoles: ["HERO", "CONTEXT", "PROCESS", "TIP"] },
      { id: "outdoor-guide", label: "코스·장비 입문 가이드", description: "초보자를 위한 준비물·코스·주의사항 정리", fieldIds: ["activity", "experienceLevel", "audience", "goal"], recommendedStyleIds: ["friendly-info", "shareable-info", "easy-expert"], recommendedStructureIds: ["guide", "checklist", "information"], suggestedImageRoles: ["HERO", "EXPLAINER", "PROCESS", "CAUTION"] },
    ],
  },
  {
    id: "free",
    label: "자유주제",
    description: "카테고리에 맞지 않는 어떤 주제든 자유롭게 작성",
    defaultFieldIds: ["audience", "situation", "keywords"],
    presets: [],
  },
];

export function getCategory(categoryId?: string) {
  return CATEGORY_DEFINITIONS.find((category) => category.id === categoryId);
}

export function getPreset(categoryId?: string, presetId?: string) {
  return getCategory(categoryId)?.presets.find((preset) => preset.id === presetId);
}

export function getPlatform(platformId: PlatformId) {
  return PLATFORM_PROFILES.find((platform) => platform.id === platformId) ?? PLATFORM_PROFILES[0];
}

export function getStyle(styleId?: string) {
  return STYLE_DEFINITIONS.find((style) => style.id === styleId);
}

export function getStructure(structureId?: string) {
  return STRUCTURE_DEFINITIONS.find((structure) => structure.id === structureId);
}
