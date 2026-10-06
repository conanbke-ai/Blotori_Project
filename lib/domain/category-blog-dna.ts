import type { BlogDNAProfile } from "./types";

export interface CategoryBlogDNAPreset {
  id: string;
  categoryId: string;
  label: string;
  description: string;
  tags: string[];
  sourceMeta: {
    kind: "launch-curated";
    version: "v1";
    referenceThemes: string[];
    note: string;
  };
  dna: BlogDNAProfile;
}

type PresetInput = Omit<CategoryBlogDNAPreset, "dna" | "sourceMeta"> & {
  referenceThemes: string[];
  voice: string;
  mood: string;
  structure: string;
  image: string;
  visual: string;
  avoid?: string[];
  openings?: string[];
  sections?: string[];
  closings?: string[];
  tags?: string[];
  identity?: number;
  structureFreedom?: number;
};

function makePreset(input: PresetInput): CategoryBlogDNAPreset {
  const voiceEndings = input.voice.includes("합니다")
    ? ["-합니다/-됩니다 중심", "필요할 때 -해요를 섞어 거리감을 낮춤"]
    : ["-해요/-했어요 중심", "짧은 감상은 구어체 종결 허용"];
  return {
    id: input.id,
    categoryId: input.categoryId,
    label: input.label,
    description: input.description,
    tags: input.tags ?? [],
    sourceMeta: {
      kind: "launch-curated",
      version: "v1",
      referenceThemes: input.referenceThemes,
      note: "출시용 기본 프리셋. 공개 상위 블로그의 반복적으로 관찰되는 편집 패턴을 일반화하되 특정 블로그 문장을 복제하지 않는다.",
    },
    dna: {
      version: 2,
      signature: `${input.voice} / ${input.structure} / ${input.image}`,
      confidence: "medium",
      evidenceSummary: "출시 초기용 카테고리 대표 패턴을 사람이 검수해 정리한 프리셋입니다. 특정 블로그 한 곳의 복제본이 아닙니다.",
      voice: {
        summary: input.voice,
        endings: voiceEndings,
        sentenceRhythm: "짧은 문장과 중간 길이 문장을 섞고 한 문장에 핵심 하나를 둔다.",
        paragraphRhythm: "모바일에서 2~4문장 단위로 끊고 이미지 전후에는 더 짧게 호흡한다.",
        transitions: ["먼저", "그리고", "특히", "개인적으로", "마지막으로"],
        lexicalHabits: ["구체적 체감", "핵심 먼저", "불필요한 과장 최소화"],
        emotionPattern: input.mood,
        readerDistance: "친근하되 정보 신뢰감을 잃지 않는 거리",
        punctuationHabits: ["느낌표는 포인트에서만", "이모지는 카테고리 톤에 맞게 소량"],
        avoid: input.avoid ?? ["같은 감탄 표현 반복", "광고성 최상급 남발", "매 글 동일한 첫 문장"],
      },
      mood: {
        summary: input.mood,
        keywords: (input.tags ?? []).slice(0, 8),
        warmth: "중간 이상",
        energy: "콘텐츠 목적에 따라 중간",
        intimacy: "개인 경험형이면 높게, 정보형이면 중간",
        informationDensity: "중간~높음",
        visualMood: input.visual,
      },
      structure: {
        summary: input.structure,
        openingPatterns: input.openings ?? ["상황/문제 한 줄 → 핵심 기대효과", "개인 경험 한 줄 → 오늘 다룰 내용"],
        sectionPatterns: input.sections ?? ["핵심 정보 → 세부 설명 → 체감/예시", "장면/사진 → 짧은 설명 → 다음 포인트"],
        closingPatterns: input.closings ?? ["핵심 한 줄 요약 → 추천 대상", "개인 총평 → 다음 행동 팁"],
        fixedPrinciples: ["주제와 직접 관련된 정보부터 보여준다.", "내용 없는 메타 문장을 넣지 않는다."],
        flexiblePatterns: ["소제목 수", "사진 묶음 수", "도입 방식", "마무리 문구"],
        contentBalance: "카테고리 목적에 맞게 정보/경험/감정 비율을 조절한다.",
      },
      imageRhythm: {
        summary: input.image,
        cadence: "긴 텍스트 덩어리를 피하고 핵심 전환 지점마다 이미지를 배치한다.",
        grouping: "단독 큰 이미지와 2~3장 묶음을 콘텐츠에 따라 섞는다.",
        placementRules: ["대표 이미지는 초반", "설명 대상 이미지 바로 전후에 관련 텍스트", "같은 역할 이미지는 필요하면 묶음"],
        rolePreferences: ["HERO", "CONTEXT", "EXPLAINER", "TIP"],
        adaptationRules: ["사진 수가 적으면 섹션을 압축한다.", "사진 수가 많으면 역할별로 묶어 분산한다.", "슬롯 번호보다 이미지 의미를 우선한다."],
      },
      visual: {
        summary: input.visual,
        alignment: "본문 좌측 중심, 짧은 포인트만 선택적 중앙 정렬",
        emphasis: "핵심 구절 0~2개만 굵게/하이라이트",
        whitespace: "모바일 기준 넉넉한 문단 간격",
        headingStyle: "내용이 예상되는 짧은 소제목",
        decorationHabits: ["과도한 박스 대신 사진·소제목·여백으로 리듬 구성"],
        avoid: ["장식 남발", "긴 중앙 정렬 본문", "한 섹션에 과도한 강조"],
      },
      variation: {
        identityFidelity: input.identity ?? 0.82,
        structureFreedom: input.structureFreedom ?? 0.42,
        wordingFreedom: 0.52,
        imageFreedom: 0.46,
        antiRepetitionRules: [
          "최근 글과 동일한 도입 패턴을 연속 사용하지 않는다.",
          "소제목 순서를 콘텐츠에 맞게 바꾼다.",
          "사진 묶음 크기와 위치를 매 글 동일하게 고정하지 않는다.",
          "마무리 문구를 그대로 반복하지 않는다.",
        ],
      },
    },
  };
}

export const CATEGORY_BLOG_DNA_PRESETS: CategoryBlogDNAPreset[] = [
  makePreset({
    id: "health-friendly-guide", categoryId: "health", label: "친절한 생활건강 가이드", description: "생활 속 상황에서 시작해 쉬운 설명과 실천 팁으로 이어지는 건강정보형", referenceThemes: ["건강/의학", "다이어트"], tags: ["친절", "생활팁", "쉬운설명"], voice: "부드러운 해요체로 전문 내용을 쉽게 풀고 단정적인 치료 보장은 피한다.", mood: "안심되고 차분한 교육 분위기", structure: "생활 속 고민 → 원인/배경 → 실천 포인트 → 주의점 → 요약", image: "자세·동작·생활상황 이미지를 설명 직후 배치", visual: "깨끗하고 차분하며 체크포인트가 잘 보이는 구성"
  }),
  makePreset({
    id: "health-saveable-info", categoryId: "health", label: "저장형 건강정보 정리", description: "핵심 요약과 체크포인트를 빠르게 훑을 수 있는 정보형", referenceThemes: ["건강/의학", "다이어트"], tags: ["저장형", "체크포인트", "정보밀도"], voice: "짧고 명확한 해요체, 핵심을 먼저 말하는 설명형", mood: "정돈되고 실용적인 정보 카드 느낌", structure: "한눈 요약 → 핵심 3~5개 → 상세 설명 → 주의사항 → 기억할 한 줄", image: "설명용 이미지와 핵심 포인트 이미지를 일정 간격으로 배치", visual: "여백은 넉넉하고 핵심 강조는 선명하되 과하지 않음"
  }),
  makePreset({
    id: "health-expert-column", categoryId: "health", label: "근거 중심 전문가 칼럼", description: "맥락과 근거를 중심으로 깊이 있게 설명하는 칼럼형", referenceThemes: ["건강/의학", "교육/학문"], tags: ["전문", "근거", "칼럼"], voice: "합니다체 중심의 신뢰감 있는 설명에 쉬운 재설명을 섞는다.", mood: "차분하고 전문적이며 과장 없는 분위기", structure: "문제 정의 → 배경/근거 → 핵심 해석 → 적용/주의 → 결론", image: "장식용보다 설명·도식 역할 이미지를 우선", visual: "텍스트 중심의 절제된 전문 레이아웃", identity: 0.88, structureFreedom: 0.32
  }),

  makePreset({
    id: "food-photo-diary", categoryId: "food", label: "사진 중심 맛집 후기", description: "사진 사이에 짧은 체감 코멘트를 넣는 자연스러운 방문 후기형", referenceThemes: ["음식정보"], tags: ["사진중심", "맛집후기", "일상"], voice: "친근한 해요체와 짧은 구어체 감상을 섞고 리액션은 자연스럽게 쓴다.", mood: "친구에게 다녀온 곳을 보여주는 밝고 편안한 분위기", structure: "방문 계기 → 기본정보 → 외관/내부 → 메뉴 → 음식 흐름 → 총평", image: "큰 단독 사진과 2~3장 묶음 사이에 1~2문장 코멘트를 반복", visual: "흰 배경과 넓은 여백, 사진 존재감이 큰 구성", openings:["짧은 방문 계기 → 대표사진","한 줄 총평 → 장소 소개"], sections:["기본정보 → 공간 → 메뉴 → 음식별 체감","사진 → 짧은 반응 → 다음 사진"], closings:["재방문의사/추천대상 → 주변 코스 한 줄","가장 좋았던 포인트 → 짧은 추천"]
  }),
  makePreset({
    id: "food-detailed-review", categoryId: "food", label: "꼼꼼한 정보형 맛집 리뷰", description: "위치·가격·메뉴·맛·서비스를 빠짐없이 정리하는 리뷰형", referenceThemes: ["음식정보"], tags: ["상세정보", "가격", "메뉴"], voice: "친근하지만 정보 전달이 분명한 해요체", mood: "실용적이고 신뢰할 수 있는 방문 정보", structure: "핵심 정보 → 접근/주차 → 공간 → 메뉴/가격 → 음식별 후기 → 장단점 → 총평", image: "정보 항목과 대응되는 사진을 바로 붙이고 메뉴판/가격 이미지를 초중반에 배치", visual: "소제목과 정보 강조가 분명한 깔끔한 리뷰"
  }),
  makePreset({
    id: "food-cafe-mood", categoryId: "food", label: "감성 카페·공간 기록", description: "공간 분위기와 장면을 사진 중심으로 천천히 보여주는 감성형", referenceThemes: ["음식정보", "사진", "디자인/편집"], tags: ["감성", "카페", "공간"], voice: "짧고 부드러운 해요체, 감정과 장면 묘사를 절제해서 사용", mood: "차분하고 따뜻한 공간 기록 분위기", structure: "첫인상 → 공간/빛/좌석 → 메뉴 → 디테일 → 머문 느낌 → 짧은 마무리", image: "큰 사진 비중을 높이고 텍스트는 사진 사이 짧게 배치", visual: "여백이 넓고 장식은 최소화한 이미지 우선 레이아웃"
  }),

  makePreset({
    id: "daily-photo-journal", categoryId: "daily", label: "사진 많은 일상 다이어리", description: "하루 장면을 사진과 짧은 말로 이어가는 자연스러운 일상형", referenceThemes: ["사진", "육아"], tags: ["일상", "사진", "다이어리"], voice: "말하듯 편한 해요체와 짧은 감상 위주", mood: "개인적이고 편안하며 꾸미지 않은 기록", structure: "오늘의 장면 → 작은 사건들 → 느낀 점 → 한 줄 마무리", image: "사진 1~3장마다 짧은 코멘트, 장면 순서를 자연스럽게 유지", visual: "사진과 여백 중심의 가벼운 기록형"
  }),
  makePreset({
    id: "daily-routine-share", categoryId: "daily", label: "루틴·생활팁 공유", description: "직접 해보는 생활 루틴을 경험과 팁으로 정리", referenceThemes: ["육아", "인테리어정보", "다이어트"], tags: ["루틴", "생활팁", "경험"], voice: "친근하고 실용적인 해요체", mood: "현실적이고 따라 하기 쉬운 분위기", structure: "왜 시작했는지 → 실제 루틴 → 해보며 바뀐 점 → 팁 → 요약", image: "과정 이미지와 전후 장면을 핵심 단계에 배치", visual: "체크포인트는 보이되 생활 블로그 느낌 유지"
  }),
  makePreset({
    id: "daily-concise-record", categoryId: "daily", label: "짧고 담백한 하루 기록", description: "군더더기 없이 몇 장면과 생각만 남기는 기록형", referenceThemes: ["사진", "도서정보"], tags: ["담백", "짧은글", "기록"], voice: "짧은 문장과 절제된 해요체", mood: "조용하고 담백한 개인 기록", structure: "장면 → 짧은 생각 → 다음 장면 → 한 문장 마무리", image: "사진 수가 적어도 억지로 늘리지 않고 장면 전환점에만 배치", visual: "최소 장식, 넓은 여백, 짧은 문단"
  }),

  makePreset({
    id: "travel-photo-story", categoryId: "travel", label: "사진 중심 여행기", description: "시간 흐름과 사진을 따라가며 현장감을 살리는 여행형", referenceThemes: ["국내여행", "해외여행", "사진"], tags: ["여행기", "사진", "현장감"], voice: "친근한 해요체와 현장 감상을 자연스럽게 섞는다.", mood: "설레고 생생하지만 과장되지 않은 여행 기록", structure: "출발/도착 → 장소별 이동 → 먹거리/장면 → 인상 깊은 포인트 → 마무리", image: "장소 전환마다 대표 사진, 디테일 사진은 2~3장 묶음", visual: "사진을 크게 보여주고 동선은 짧은 소제목으로 정리"
  }),
  makePreset({
    id: "travel-itinerary-guide", categoryId: "travel", label: "동선·코스 정보형", description: "시간·동선·비용·팁을 중심으로 저장하기 좋은 여행 가이드", referenceThemes: ["국내여행", "해외여행"], tags: ["코스", "동선", "여행정보"], voice: "명확하고 친근한 정보형 해요체", mood: "계획 세우기 쉬운 실용적인 분위기", structure: "코스 요약 → 시간순 동선 → 장소별 포인트 → 비용/교통 → 주의/팁 → 추천대상", image: "지도성/장소 대표 이미지와 실제 동선 사진을 섞어 배치", visual: "소제목과 시간 흐름이 한눈에 보이는 정보형"
  }),
  makePreset({
    id: "travel-stay-review", categoryId: "travel", label: "숙소·공간 상세 후기", description: "체크인부터 객실·부대시설·주변까지 꼼꼼히 보는 숙소 후기", referenceThemes: ["국내여행", "해외여행"], tags: ["숙소", "호텔", "상세후기"], voice: "솔직하고 구체적인 해요체", mood: "실사용자 관점의 차분한 리뷰", structure: "예약/위치 → 체크인 → 객실 → 욕실/뷰 → 부대시설 → 장단점 → 총평", image: "공간별 대표 사진을 순서대로 배치하고 디테일은 묶음 처리", visual: "공간 구분이 명확한 사진 중심 리뷰"
  }),

  makePreset({
    id: "review-hands-on", categoryId: "review", label: "실사용 중심 제품 후기", description: "스펙보다 실제 사용 장면과 체감을 중심으로 쓰는 리뷰", referenceThemes: ["IT리뷰", "자동차리뷰", "뷰티"], tags: ["실사용", "제품후기", "장단점"], voice: "솔직하고 구체적인 해요체", mood: "광고보다 실제 사용자에 가까운 현실적인 분위기", structure: "구매/사용 계기 → 첫인상 → 실제 사용 → 좋았던 점 → 아쉬운 점 → 추천대상", image: "언박싱·사용 장면·디테일 사진을 기능 설명과 붙여 배치", visual: "제품 사진과 핵심 체감 포인트가 명확한 리뷰"
  }),
  makePreset({
    id: "review-comparison", categoryId: "review", label: "비교·선택 가이드", description: "여러 선택지를 기준별로 비교해 결론을 돕는 정보형", referenceThemes: ["IT리뷰", "자동차리뷰", "뷰티"], tags: ["비교", "선택", "가이드"], voice: "간결한 설명형 해요체와 객관적 비교 문장", mood: "정돈되고 판단하기 쉬운 분위기", structure: "누구를 위한 비교인지 → 핵심 차이 → 기준별 비교 → 실제 체감 → 선택 가이드", image: "동일 조건 비교 이미지나 기능별 사진을 대응 배치", visual: "비교 포인트가 선명한 구조적 레이아웃"
  }),
  makePreset({
    id: "review-visual-unboxing", categoryId: "review", label: "비주얼 언박싱·첫인상", description: "사진과 첫인상을 빠른 호흡으로 보여주는 가벼운 리뷰", referenceThemes: ["IT리뷰", "패션/스타일", "뷰티"], tags: ["언박싱", "사진", "첫인상"], voice: "짧고 밝은 해요체, 즉각적인 체감 표현", mood: "가볍고 시각적인 신제품 소개 분위기", structure: "첫인상 → 구성품 → 디자인 디테일 → 첫 사용 → 짧은 총평", image: "큰 단독 컷과 디테일 2~3장 묶음을 적극 활용", visual: "사진 우선, 텍스트 짧게, 장식은 최소"
  }),

  makePreset({
    id: "education-easy-explain", categoryId: "education", label: "쉽게 풀어주는 개념 설명", description: "어려운 내용을 일반 독자가 이해하도록 단계적으로 풀어주는 설명형", referenceThemes: ["교육/학문", "도서정보"], tags: ["개념", "쉬운설명", "교육"], voice: "친절한 해요체로 전문용어를 바로 풀어 설명한다.", mood: "차분하고 이해를 돕는 수업 같은 분위기", structure: "왜 필요한지 → 핵심 개념 → 쉬운 예시 → 자주 헷갈리는 점 → 요약", image: "도식·예시·단계 이미지 위주", visual: "핵심어와 예시 구분이 명확한 학습형"
  }),
  makePreset({
    id: "education-study-note", categoryId: "education", label: "공부 노트·복습형", description: "배운 내용을 핵심과 함정 위주로 다시 정리하는 노트형", referenceThemes: ["교육/학문", "도서정보"], tags: ["복습", "노트", "시험"], voice: "담백하고 정확한 해요체, 중요한 함정은 짧게 단정", mood: "집중도 높은 개인 학습노트 분위기", structure: "핵심 개념 → 기억 포인트 → 예시 → 자주 틀리는 부분 → 확인 질문", image: "설명에 꼭 필요한 도식/표만 제한적으로 배치", visual: "텍스트 중심, 강조 규칙이 일정한 노트형"
  }),
  makePreset({
    id: "education-saveable-summary", categoryId: "education", label: "저장·공유형 핵심 요약", description: "짧은 문단과 체크포인트로 빠르게 복습할 수 있는 요약형", referenceThemes: ["교육/학문", "도서정보"], tags: ["요약", "저장", "체크포인트"], voice: "짧고 명확한 정보형 해요체", mood: "빠르게 훑고 다시 보기 좋은 정돈된 분위기", structure: "3줄 요약 → 핵심 항목 → 예시 → 체크리스트 → 한 줄 결론", image: "정보 카드나 개념 도식 역할 이미지를 중간중간 배치", visual: "짧은 소제목과 제한된 하이라이트 중심"
  }),

  makePreset({
    id: "hobby-experience-diary", categoryId: "hobby", label: "취미 경험 다이어리", description: "직접 해본 과정과 느낌을 사진과 함께 자연스럽게 기록", referenceThemes: ["사진", "등산", "캠핑", "음악"], tags: ["취미", "경험", "사진"], voice: "개인적인 해요체와 솔직한 체감 표현", mood: "즐기는 사람의 온도가 느껴지는 편안한 분위기", structure: "시작 계기 → 해본 과정 → 좋았던 순간 → 어려웠던 점 → 다음 계획", image: "과정 사진과 결과 사진을 시간 흐름에 맞춰 배치", visual: "사진과 개인 코멘트가 번갈아 나오는 가벼운 구성"
  }),
  makePreset({
    id: "hobby-beginner-guide", categoryId: "hobby", label: "초보 입문 가이드", description: "처음 시작하는 사람에게 준비물·순서·실수 방지 팁을 알려주는 형", referenceThemes: ["등산", "캠핑", "사진", "음악"], tags: ["입문", "준비물", "가이드"], voice: "친근하고 실용적인 해요체", mood: "초보도 부담 없이 시작할 수 있는 분위기", structure: "누구에게 맞는지 → 준비물 → 시작 순서 → 흔한 실수 → 비용/팁 → 다음 단계", image: "준비물·과정·예시 이미지를 단계와 맞춰 배치", visual: "체크리스트와 단계가 잘 보이는 실용형"
  }),
  makePreset({
    id: "hobby-culture-review", categoryId: "hobby", label: "전시·공연·콘텐츠 감상", description: "정보보다 장면과 감상을 살리되 스포일러는 조절하는 문화 후기", referenceThemes: ["영화", "음악", "디자인/편집", "만화/애니"], tags: ["감상", "문화", "에세이"], voice: "부드러운 해요체와 장면 중심 감상", mood: "개인 취향이 드러나는 차분한 문화 기록", structure: "보게 된 계기 → 첫인상 → 기억에 남은 요소 → 개인 해석/감상 → 추천 대상", image: "공간·포스터·디테일 이미지를 감상 흐름에 맞게 배치", visual: "여백과 짧은 인용/강조를 활용하는 감성형"
  }),
  makePreset({
    id: "tech-hands-on", categoryId: "tech", label: "실사용 IT 리뷰", description: "스펙 나열보다 실제 사용 경험과 체감을 중심으로 쓰는 테크 리뷰", referenceThemes: ["IT리뷰"], tags: ["IT", "실사용", "리뷰"], voice: "구체적이고 친근한 해요체, 전문용어는 바로 풀어 설명", mood: "깔끔하고 실용적인 테크 리뷰 분위기", structure: "사용 계기 → 첫인상 → 주요 기능 → 실사용 체감 → 장단점 → 추천 대상", image: "제품 전체컷·디테일·실사용 화면을 기능 설명과 붙여 배치", visual: "제품 사진과 핵심 포인트가 또렷한 미니멀 리뷰"
  }),
  makePreset({
    id: "tech-guide", categoryId: "tech", label: "앱·기능 활용 가이드", description: "기능을 따라 하기 쉽게 단계별로 설명하는 사용법 중심", referenceThemes: ["IT리뷰", "교육/학문"], tags: ["가이드", "앱", "사용법"], voice: "명확한 해요체, 단계마다 짧고 정확한 안내", mood: "정돈되고 따라 하기 쉬운 분위기", structure: "무엇을 해결하는지 → 준비 → 단계별 사용법 → 자주 막히는 지점 → 팁", image: "단계별 화면·설정 캡처를 과정 순서대로 배치", visual: "스크린샷과 번호 흐름이 명확한 실용형"
  }),

  makePreset({
    id: "beauty-honest", categoryId: "beauty-fashion", label: "솔직한 뷰티 사용기", description: "발림·지속력·사용감과 장단점을 실제 체감 중심으로 정리", referenceThemes: ["뷰티"], tags: ["뷰티", "사용감", "후기"], voice: "친근한 해요체와 구체적 체감 표현", mood: "개인 취향이 드러나는 밝고 솔직한 분위기", structure: "사용 계기 → 제형/첫인상 → 사용 과정 → 장점 → 아쉬움 → 추천 대상", image: "패키지·제형·사용 전후·디테일 컷을 설명에 맞춰 배치", visual: "밝고 깨끗하며 이미지 비중이 높은 구성"
  }),
  makePreset({
    id: "fashion-diary", categoryId: "beauty-fashion", label: "패션·스타일링 다이어리", description: "코디와 착용 장면을 사진 중심으로 보여주는 스타일 기록", referenceThemes: ["패션/스타일", "사진"], tags: ["패션", "코디", "사진"], voice: "가볍고 자연스러운 해요체, 짧은 코디 코멘트", mood: "감각적이고 개인 취향이 느껴지는 분위기", structure: "오늘의 룩 → 착용 포인트 → 디테일 → 다른 조합 → 총평", image: "전신컷·디테일·다른 각도 사진을 번갈아 배치", visual: "사진 우선, 여백 넓고 장식은 최소"
  }),

  makePreset({
    id: "parenting-diary-dna", categoryId: "parenting-family", label: "따뜻한 육아 일상", description: "아이의 하루와 변화, 가족의 감정을 자연스럽게 기록", referenceThemes: ["육아"], tags: ["육아", "가족", "일상"], voice: "부드러운 해요체와 짧은 감정 표현", mood: "따뜻하고 개인적인 가족 기록 분위기", structure: "오늘의 상황 → 아이 반응 → 부모의 생각 → 작은 변화 → 마무리", image: "장면 사진 사이에 짧은 코멘트를 넣고 시간 흐름을 살림", visual: "사진과 여백 중심의 부드러운 기록형"
  }),
  makePreset({
    id: "parenting-info-dna", categoryId: "parenting-family", label: "육아 정보·준비 가이드", description: "지원제도·준비물·생활팁을 빠르게 찾기 쉽게 정리", referenceThemes: ["육아", "교육/학문"], tags: ["육아정보", "가이드", "체크리스트"], voice: "친절하고 명확한 해요체", mood: "안심되고 실용적인 정보 분위기", structure: "대상/상황 → 핵심 요약 → 준비사항 → 단계/팁 → 주의 → 한 줄 요약", image: "설명용 이미지와 체크포인트를 단계에 맞춰 배치", visual: "체크리스트와 핵심 강조가 잘 보이는 구성"
  }),

  makePreset({
    id: "pets-diary-dna", categoryId: "pets", label: "반려동물 사진 일기", description: "사진과 짧은 에피소드로 반려생활을 기록", referenceThemes: ["반려동물"], tags: ["반려동물", "사진", "일상"], voice: "귀엽고 편안한 해요체, 리액션은 소량", mood: "밝고 애정 어린 일상 분위기", structure: "오늘의 사건 → 반응 → 사진 장면 → 짧은 감상 → 마무리", image: "사진 1~3장마다 짧은 문장을 배치", visual: "사진 존재감이 크고 꾸밈은 가볍게"
  }),
  makePreset({
    id: "pets-guide-dna", categoryId: "pets", label: "반려생활 실용 가이드", description: "용품·생활관리·초보 팁을 경험 기반으로 정리", referenceThemes: ["반려동물"], tags: ["용품", "생활관리", "가이드"], voice: "친근하지만 과장 없는 정보형 해요체", mood: "현실적이고 신뢰감 있는 생활관리 분위기", structure: "문제/필요 → 선택 기준 → 사용 경험 → 장단점 → 팁 → 추천 대상", image: "용품·사용 장면·전후 상황을 정보와 연결", visual: "정보와 사진이 균형 잡힌 실용형"
  }),

  makePreset({
    id: "realestate-field", categoryId: "real-estate", label: "현장 임장 리포트", description: "직접 걸어본 입지와 생활권을 현장 사진과 함께 정리", referenceThemes: ["부동산정보"], tags: ["임장", "입지", "현장"], voice: "담백한 해요체와 객관적 관찰 문장", mood: "현장감 있고 분석적인 분위기", structure: "지역 개요 → 이동 동선 → 상권/교통 → 단지/환경 → 체감 장단점 → 총평", image: "거리·시설·단지·지도성 이미지를 동선 순서대로 배치", visual: "사진과 분석 포인트가 명확한 리포트형"
  }),
  makePreset({
    id: "realestate-analysis", categoryId: "real-estate", label: "지역·입지 분석형", description: "교통·생활권·가격·개발요인을 구조적으로 분석", referenceThemes: ["부동산정보"], tags: ["지역분석", "입지", "데이터"], voice: "신뢰감 있는 설명형, 쉬운 재설명을 섞은 전문가 톤", mood: "차분하고 데이터 중심의 분위기", structure: "핵심 요약 → 교통 → 생활권 → 가격/수요 → 개발 이슈 → 리스크 → 결론", image: "지도·표·현장 사진을 핵심 주장에 붙여 배치", visual: "텍스트와 도식 중심의 정돈된 분석형", identity:0.88, structureFreedom:0.32
  }),

  makePreset({
    id: "finance-easy", categoryId: "finance", label: "쉽게 읽는 재테크 설명", description: "금융 개념과 선택 기준을 일반 독자에게 쉽게 설명", referenceThemes: ["재테크정보"], tags: ["재테크", "쉬운설명", "정보"], voice: "쉽고 정확한 해요체, 숫자는 맥락과 함께 설명", mood: "차분하고 실용적인 금융 정보 분위기", structure: "왜 중요한지 → 개념 → 예시 → 장단점 → 주의 → 한 줄 정리", image: "도식·비교·핵심 수치 이미지를 설명 직후 배치", visual: "과도한 장식 없이 핵심 수치와 비교가 잘 보이는 구성"
  }),
  makePreset({
    id: "finance-market", categoryId: "finance", label: "시장·경제 브리핑형", description: "시장 이슈와 숫자의 의미를 짧고 밀도 있게 정리", referenceThemes: ["재테크정보"], tags: ["시장", "경제", "브리핑"], voice: "간결한 합니다체/해요체 혼합, 원인과 의미를 분리해 설명", mood: "빠르고 정돈된 브리핑 분위기", structure: "무슨 일이 있었나 → 왜 움직였나 → 숫자/근거 → 영향 → 앞으로 볼 것", image: "차트·수치·핵심 이슈 이미지를 구간별 배치", visual: "정보 밀도는 높지만 문단과 강조는 절제"
  }),

  makePreset({
    id: "career-guide-dna", categoryId: "career", label: "취업 준비 체크리스트형", description: "서류·시험·면접 준비를 단계와 체크포인트로 정리", referenceThemes: ["취업정보"], tags: ["취업", "면접", "체크리스트"], voice: "명확하고 응원하는 해요체", mood: "실용적이고 부담을 줄여주는 분위기", structure: "목표 → 준비 순서 → 체크포인트 → 흔한 실수 → 일정/팁 → 요약", image: "단계·체크리스트·예시 화면 위주", visual: "스캔하기 쉬운 구조적 레이아웃"
  }),
  makePreset({
    id: "career-story-dna", categoryId: "career", label: "직무·이직 경험담", description: "실제 경험과 시행착오, 배운 점을 중심으로 쓰는 커리어 기록", referenceThemes: ["취업정보"], tags: ["이직", "직무", "경험"], voice: "솔직한 해요체와 차분한 회고 문장", mood: "현실적이고 공감 가능한 커리어 분위기", structure: "상황 → 고민 → 시도 → 결과 → 배운 점 → 추천/조언", image: "문서·업무환경·과정 이미지를 필요한 지점에만 배치", visual: "텍스트 중심, 장식은 최소"
  }),

  makePreset({
    id: "auto-drive-review", categoryId: "auto", label: "시승·실사용 자동차 후기", description: "주행감·공간·편의기능·단점을 실제 체감 위주로 리뷰", referenceThemes: ["자동차리뷰"], tags: ["자동차", "시승", "실사용"], voice: "구체적이고 솔직한 해요체", mood: "전문성과 개인 체감이 균형 잡힌 분위기", structure: "첫인상 → 주행 → 실내/공간 → 기능 → 장점 → 아쉬움 → 총평", image: "외관·실내·디테일·주행 관련 이미지를 항목별 배치", visual: "자동차 사진 비중이 높고 설명은 짧게"
  }),
  makePreset({
    id: "auto-compare-dna", categoryId: "auto", label: "차량 비교·선택 가이드", description: "가격·공간·성능·용도 기준으로 선택을 돕는 비교형", referenceThemes: ["자동차리뷰"], tags: ["비교", "선택", "차량"], voice: "객관적이고 쉬운 설명형", mood: "판단하기 쉬운 정돈된 분위기", structure: "비교 대상 → 핵심 차이 → 기준별 비교 → 사용자 유형별 추천 → 결론", image: "비교 가능한 외관/실내/기능 이미지를 대응 배치", visual: "비교 기준과 결론이 한눈에 보이는 구성"
  }),

  makePreset({
    id: "game-playlog", categoryId: "gaming-entertainment", label: "게임 플레이 로그형", description: "플레이 경험과 재미 포인트를 장면 중심으로 기록", referenceThemes: ["게임"], tags: ["게임", "플레이", "후기"], voice: "가볍고 생동감 있는 해요체, 리액션은 적당히", mood: "즐겁고 현장감 있는 플레이 분위기", structure: "시작 계기 → 첫인상 → 핵심 플레이 → 좋았던 점 → 아쉬움 → 추천 대상", image: "게임 화면을 장면 흐름에 맞춰 배치", visual: "스크린샷 중심의 빠른 호흡"
  }),
  makePreset({
    id: "media-review-dna", categoryId: "gaming-entertainment", label: "영화·드라마·애니 감상형", description: "작품 정보와 개인 감상을 균형 있게 정리", referenceThemes: ["영화","만화/애니","방송/연예"], tags: ["감상", "콘텐츠", "리뷰"], voice: "부드러운 해요체와 개인 해석 중심", mood: "취향과 감상이 드러나는 차분한 분위기", structure: "보게 된 계기 → 첫인상 → 기억에 남은 요소 → 감상/해석 → 추천 대상", image: "포스터·장면·공간성 이미지를 과하지 않게 배치", visual: "텍스트와 이미지 균형이 좋은 감상형"
  }),

  makePreset({
    id: "interior-beforeafter", categoryId: "living-interior", label: "비포·애프터 공간 기록", description: "공간 변화와 선택 이유를 전후 사진 중심으로 기록", referenceThemes: ["인테리어정보"], tags: ["인테리어", "비포애프터", "공간"], voice: "친근하고 구체적인 해요체", mood: "깔끔하고 변화가 잘 느껴지는 분위기", structure: "문제 상황 → 계획 → 과정 → 완성 → 사용 체감 → 비용/팁", image: "전후 사진과 과정 디테일을 명확히 대응 배치", visual: "큰 공간 사진과 넓은 여백 중심"
  }),
  makePreset({
    id: "living-guide-dna", categoryId: "living-interior", label: "살림·인테리어 실용 가이드", description: "수납·배치·자재·비용 정보를 따라 하기 쉽게 정리", referenceThemes: ["인테리어정보"], tags: ["살림", "수납", "가이드"], voice: "친절하고 실용적인 해요체", mood: "정돈되고 현실적인 생활정보 분위기", structure: "문제 → 선택 기준 → 방법 → 비용/주의 → 사용 팁 → 요약", image: "과정·도구·완성 사진을 단계별 배치", visual: "체크포인트가 잘 보이는 깔끔한 정보형"
  }),

  makePreset({
    id: "marketing-case-dna", categoryId: "marketing-business", label: "마케팅 사례 분석", description: "문제·전략·실행·성과를 사례 중심으로 분석", referenceThemes: ["마케팅"], tags: ["마케팅", "사례", "전략"], voice: "전문적이지만 읽기 쉬운 설명형", mood: "실무적이고 분석적인 분위기", structure: "상황 → 문제 → 전략 → 실행 → 결과 → 배운 점", image: "캠페인 예시·퍼널·수치 이미지를 주장과 연결", visual: "텍스트와 도식이 균형 잡힌 비즈니스형"
  }),
  makePreset({
    id: "business-howto-dna", categoryId: "marketing-business", label: "실무 노하우 가이드", description: "업무 절차와 체크포인트를 실전형으로 정리", referenceThemes: ["마케팅"], tags: ["실무", "노하우", "가이드"], voice: "명확한 해요체, 불필요한 수사는 줄임", mood: "빠르게 적용할 수 있는 실용적 분위기", structure: "목표 → 준비 → 단계 → 예시 → 실수 방지 → 체크리스트", image: "프로세스·예시 화면·핵심 체크포인트 중심", visual: "번호와 소제목이 분명한 실무형"
  }),

  makePreset({
    id: "outdoor-triplog", categoryId: "outdoor-sports", label: "등산·캠핑·낚시 현장 기록", description: "코스와 장비, 현장 사진과 체감을 함께 담는 아웃도어 기록", referenceThemes: ["등산","캠핑","낚시","스포츠"], tags: ["아웃도어", "현장", "코스"], voice: "활기찬 해요체와 솔직한 체감 표현", mood: "현장감 있고 활동적인 분위기", structure: "준비 → 이동/코스 → 주요 장면 → 장비/체감 → 팁 → 마무리", image: "코스 전환마다 대표 사진, 장비·풍경은 묶음 활용", visual: "사진 비중이 높고 이동 흐름이 보이는 구성"
  }),
  makePreset({
    id: "outdoor-guide-dna", categoryId: "outdoor-sports", label: "초보 아웃도어 가이드", description: "준비물·코스·안전·장비를 초보자 눈높이에서 정리", referenceThemes: ["등산","캠핑","낚시","스포츠"], tags: ["초보", "준비물", "안전"], voice: "친절하고 명확한 해요체", mood: "안심되고 따라 하기 쉬운 분위기", structure: "누구에게 맞는지 → 준비물 → 코스/순서 → 안전 → 비용/팁 → 체크리스트", image: "준비물·코스·주의 포인트 이미지를 단계에 맞춰 배치", visual: "체크리스트와 경고 포인트가 잘 보이는 실용형"
  }),

];

export function getCategoryBlogDNAPresets(categoryId?: string) {
  if (!categoryId) return [];
  return CATEGORY_BLOG_DNA_PRESETS.filter((preset) => preset.categoryId === categoryId);
}

export function getCategoryBlogDNAPreset(id?: string) {
  if (!id) return undefined;
  return CATEGORY_BLOG_DNA_PRESETS.find((preset) => preset.id === id);
}
