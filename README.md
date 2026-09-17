# Blotori_Project

Blotori는 TORI Family의 **멀티플랫폼 블로그 제작 워크스페이스**입니다.

주제와 몇 가지 조건을 입력하면 플랫폼별 문서 구조, 제목 후보, 문체·강조 전략, 이미지 기획과 삽입 위치를 **기본 AI 호출 1회**로 생성하고, 실제 게시물 형태의 미리보기에서 직접 수정·검수·복사할 수 있습니다.

## V1 제품 목표

`플랫폼/주제 설정 → 글·이미지 기획 1회 생성 → 실제 게시물 미리보기 → 이미지 슬롯 배치 → 표현·근거 검수 → 플랫폼용 복사`

자동 이미지 생성과 플랫폼 자동 로그인/자동 발행은 V1 범위에서 제외해 API 비용과 플랫폼 의존성을 낮춥니다.

## 지원 플랫폼

- Naver Blog
- Tistory
- Blogger
- WordPress
- Brunchstory
- Other / custom platform

플랫폼 선택은 단순 라벨이 아니라 생성 전략과 Clipboard export 형식을 실제로 변경합니다.

## 주요 기능

### Composer

- 플랫폼 선택 + 자유 주제/카테고리 기반 입력
- 주제별 동적 추가 조건
- 문체 / 글 구성 자동 추천 및 직접 설정
- 문체별 강도 1~5 Strategy
- 글 길이 / 이미지 수 / 기타 조건 설정
- OpenAI Responses API 기본 1회 호출

### Draft / Preview

- 제목 후보 3개 + 즉시 적용
- 제목, 도입, 소제목, 본문, 마무리, 태그 동시 생성
- 읽기 중심 Preview + 직접 편집 모드
- 플랫폼별 표현 및 레이아웃 메타데이터 적용
- 플랫폼용 본문 복사 + 태그 별도 복사

### Image planning

- `IMG-01-HERO` 형태의 일관된 이미지 라벨
- 이미지별 역할, 삽입 위치, 권장 비율, 권장 크기, 생성 프롬프트 제공
- series / independent 연속성 메타데이터
- 이미지 프롬프트 개별 복사
- 외부에서 만든 PNG/JPG/WebP 이미지를 슬롯에 drag/drop 또는 클릭 등록
- 실제 비율 미리보기 + 교체/삭제
- 한 장당 최대 15MB, 브라우저 Object URL 기반 로컬 미리보기

### Knowledge / QA

- 의료 표현 Rule Engine 1차
- 일반 독자용 전문용어 최대 5개 + 최초 1회 `*` 표시
- 하단 `용어해설` 자동 정규화
- OpenAI hosted File Search 기반 Knowledge Base / RAG
- Knowledge source manifest + commercial/research profile 분리
- 생성 결과의 근거 사용 여부 및 source metadata 기록
- 게시 전 이미지 / 근거 / 용어해설 / 주의 표현 검수 UI

## UI 구조

Blotori V1 UI는 단순 설정 폼이 아니라 **작성 워크스페이스**로 구성합니다.

```text
작성 설정 ── 게시물 미리보기 ── 이미지·검수
```

- 왼쪽: 플랫폼 / 주제 / 동적 조건 / 문체·구성 / 출력 설정
- 중앙: 실제 플랫폼형 게시물 Preview / 직접 편집 / 제목 후보 / 이미지 슬롯
- 오른쪽: 이미지 프롬프트 및 게시 전 품질 검수
- Desktop: 3열 독립 스크롤
- Mobile: `설정 / 미리보기 / 이미지·검수` 단일 패널 탭 전환

상세 시각 기준은 `docs/BLOTORI_DESIGN_STANDARD.md`를 canonical로 사용합니다.

## 실행

```bash
npm install
cp .env.example .env.local
# .env.local에 OPENAI_API_KEY 입력
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6-luna
```

## 구조

```text
app/
├─ page.tsx                       # Composer workspace / Preview / QA inspector
├─ workspace-v2.css               # workspace information architecture / responsive UI
└─ api/generate/route.ts          # Controller

lib/
├─ application/
│  ├─ generate-blog-draft.ts      # Service / orchestration
│  ├─ build-prompt.ts             # Prompt builder
│  └─ platform-exporter.ts        # platform Clipboard strategy
├─ domain/
│  ├─ types.ts                    # Blog domain contracts
│  ├─ content-config.ts           # categories / styles / structures / platform profiles
│  └─ rules.ts                    # label normalization / safety rules
└─ infrastructure/
   ├─ openai-content-adapter.ts    # OpenAI Responses API adapter
   └─ mock-content-adapter.ts      # API key 없는 개발용 adapter
```

현재 V1에는 영속 저장소가 없으므로 Repository 계층은 두지 않습니다. 히스토리 저장이 추가될 때 Repository를 별도 계층으로 추가합니다.

## AI 비용 원칙

정상적인 `생성` 동작은 애플리케이션 기준 텍스트 AI를 기본 1회만 호출합니다. 다음 동작은 추가 AI 호출이 없습니다.

- 제목 후보 적용
- 이미지 프롬프트 복사
- 본문 직접 수정
- 이미지 위치/크기 가이드 표시
- 이미지 local preview 등록/교체/삭제
- 플랫폼용 Clipboard export
- glossary 정규화

이미지는 프로그램이 생성하지 않습니다. 사용자는 `IMG-XX-ROLE` 프롬프트를 원하는 이미지 생성 도구에 붙여 넣고 같은 라벨 위치에 삽입합니다.

## V1 완료 전 QA

- 실제 OpenAI API + File Search 응답 통합 검증
- 실제 네이버 스마트에디터 복붙 보존 테스트
- rich clipboard 플랫폼 붙여넣기 검증
- glossary 포함 실제 API 응답 QA
- desktop / tablet / mobile visual acceptance
- hover / focus / long-content scroll / panel collapse 검증
- 대표 Naver / WordPress 원고 검증

> Rule Engine은 법률 자문이나 의료광고 사전심의를 대체하지 않습니다. 실제 게시 전 최종 검토가 필요합니다.
