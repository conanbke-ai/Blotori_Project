# ACTIVE_WORK

## Status

`IN_PROGRESS` — Blotori V1 실사용 기준본 구축

## Canonical branch

- `main`

## Current workstream

- `main` 기준 V1 runtime QA / 플랫폼 붙여넣기 검증 / visual acceptance
- TORI 표준 기반 Blotori Composer UI / 플랫폼별 생성·복사 품질 / 제목·문체 전략
- Blotori canonical character/icon asset 적용 + hydration 안정화 + loading motion QA
- 일반 독자용 전문용어 footnote / glossary 생성·정규화·플랫폼 export QA
- 건강·의료 전문자료 Knowledge Base / OpenAI File Search RAG 통합 QA
- Knowledge source manifest / 라이선스 게이트 / 상용·연구 profile 분리 QA
- 외부 생성 이미지 슬롯 drag/drop + 로컬 미리보기 UX

## V1 scope

- [x] 플랫폼 선택 + 자유 주제/카테고리 기반 입력
- [x] 주제별 동적 추가 조건
- [x] 문체 / 글 구성 추천 및 직접 설정
- [x] 문체별 강도 1~5 Strategy (기본값 3)
- [x] 저장·공유형 정보 콘텐츠 문체
- [x] AI 텍스트 생성 1회 구조
- [x] 이미지 역할/프롬프트/삽입 위치 동시 생성
- [x] 이미지 series / independent 연속성 메타데이터
- [x] IMG 라벨 정규화
- [x] 플랫폼별 Generation Strategy 1차
- [x] 목적 × 문체 × 플랫폼 기반 Title Strategy
- [x] 제목 후보 3개 + 후보 적용 UI
- [x] 플랫폼별 Clipboard Exporter 분리
- [x] 읽기 중심 Preview + 편집 모드
- [x] 제목/요약/도입/소제목/본문/마무리/태그 직접 수정
- [x] 이미지 label / placement / prompt 직접 수정
- [x] 이미지 프롬프트 개별 복사
- [x] 플랫폼용 본문 복사 + 태그 별도 복사
- [x] 의료 표현 Rule Engine 1차
- [x] 일반 독자용 전문용어 최대 5개 제한 + 최초 1회 `*` 표시
- [x] `용어해설` 자동 정규화 + 본문 미사용 용어 제거 + 작은 글씨 렌더링
- [x] 플랫폼 export에서 closing 뒤 하단 용어해설 배치
- [x] OpenAI hosted File Search 기반 RAG 연결 구조
- [x] `knowledge-base/` 로컬 자료 디렉터리 + Git 원문 제외 정책
- [x] `knowledge:sync` 새 vector store 생성/업로드/색인/환경변수 기록
- [x] `knowledge:append` 기존 vector store 추가 동기화
- [x] 건강 카테고리 기본 RAG routing + source filename 메타데이터
- [x] `_meta/SOURCES.csv` source catalog / license status / attribution metadata
- [x] commercial/research Knowledge profile 분리
- [x] manifest 미등록·검토중·비상업 자료 기본 색인 차단
- [x] `knowledge:plan` dry-run 포함/제외 사전검증
- [x] vector-store file source/evidence metadata 기록
- [x] Blotori character canonical lock
- [x] Blotori TORI Family 디자인 토큰/테마
- [x] TORI common paw canonical 공통 저장소 등록
- [x] Blotori 색상 파생 paw cursor 기본/pressed 적용
- [x] TOP / BOTTOM 미리보기 이동
- [x] 설정 / 이미지 가이드 접기
- [x] 라우트 진입 Loading 화면
- [x] 콘텐츠 생성 중 Blotori 로딩 오버레이
- [x] 생성 완료 토스트
- [x] 앱 Error / 재시도 화면
- [x] Style preview hydration mismatch 제거
- [x] canonical sheet 기반 Blotori 배경 제거(character cutout) WebP 적용
- [x] Blotori 투명 app icon/fav icon 적용
- [x] canonical Blotori 캐릭터 loading motion 적용
- [x] GitHub Actions `Blotori Validate` 추가
- [x] CI TypeScript check 통과
- [x] CI Next.js production build 통과
- [x] 사용자 생성 이미지 슬롯 업로드/미리보기
- [x] 슬롯별 클릭 파일 선택 + drag/drop
- [x] PNG/JPG/WebP 제한 + 15MB 파일 크기 제한
- [x] 업로드 이미지 실제 비율 미리보기 + 교체/삭제
- [x] 새 원고 생성 시 이전 Object URL 정리
- [x] 이미지 슬롯 변경 CI TypeScript / production build 통과
- [ ] 실제 허용 전문자료를 `knowledge-base/`에 배치 후 `knowledge:plan` 검증
- [ ] 최초 commercial vector store 동기화
- [ ] 실제 OpenAI API + file_search 응답 통합 QA
- [ ] 실제 OpenAI API 응답 통합 QA
- [ ] 실제 네이버 스마트에디터 복붙 보존 테스트
- [ ] rich clipboard 플랫폼 실제 붙여넣기 검증
- [ ] glossary가 포함된 실제 API 응답 / 네이버 붙여넣기 QA
- [ ] desktop / tablet / mobile visual acceptance

## Writing style intensity

- `styleId`와 `styleIntensity(1~5)`를 독립적으로 사용한다.
- 기본 강도는 `3 · 자연스러움`이다.
- 강도는 단순히 유머·이모지를 늘리는 값이 아니다. 각 Style Strategy의 고유 특성을 강화하거나 절제한다.
- `shareable-info`는 훅, 짧은 문단, 체크 포인트, 핵심 강조, 요약, 가벼운 CTA를 중심으로 하는 저장·공유형 정보 콘텐츠 전략이다.
- 자동 추천/직접 설정 문체에도 동일한 강도 개념을 적용한다.
- 문체 강도는 기존 단일 생성 프롬프트에 포함하며 추가 AI 재호출을 만들지 않는다.

상세 기준: `docs/WRITING_STYLE_INTENSITY_STANDARD.md`

## Glossary footnote

- 기본 독자는 일반 블로그 이용자다.
- 쉬운 표현만으로 정확하게 설명할 수 있으면 전문용어를 억지로 넣지 않는다.
- 전문용어는 글 1건당 최대 5개를 기본 상한으로 한다.
- 본문 최초 등장 1회에만 `*`를 붙이고, 하단 `용어해설`에서 짧고 쉬운 1문장으로 설명한다.
- glossary 정규화와 export 변환은 코드 기반으로 수행하며 AI 재호출을 추가하지 않는다.

상세 기준: `docs/BLOTORI_GLOSSARY_FOOTNOTE_STANDARD.md`

## Knowledge Base / RAG

- 별도 모델 학습 없이 OpenAI hosted File Search를 사용한다.
- 기본 적용 범위는 `health`이며 `BLOTORI_RAG_CATEGORIES`로 확장한다.
- 검색은 기존 Responses API 글 생성 요청 안에서 수행하여 애플리케이션 기준 생성 호출은 1회/글을 유지한다.
- 자료가 없거나 vector store가 설정되지 않으면 기존 non-RAG 생성 경로로 fallback한다.
- 전문자료 원문은 저장소에 커밋하지 않는다.
- 실제 검색 여부와 source filename은 `BlogDraft.knowledgeGrounding`에 기록한다.
- `_meta/SOURCES.csv`를 유일한 ingest allowlist로 사용한다.
- 기본 `commercial` profile은 `ALLOW`/`ALLOW_WITH_ATTRIBUTION` + `ingest_default=true`만 색인한다.
- `REVIEW_REQUIRED`, `RESEARCH_ONLY`, `EXCLUDE`, manifest 미등록 자료는 기본 상용 색인에서 제외한다.
- `research` profile은 명시적으로 허용된 연구용 자료까지 포함할 수 있으나 상용 vector store와 분리한다.

상세 기준: `docs/BLOTORI_RAG_KNOWLEDGE_BASE_STANDARD.md`

## Common TORI dependency

- Common paw canonical: `conanbke-ai/Tori_Common_Project/assets/tori-common-standard-paw.webp`
- Common paw policy: `conanbke-ai/Tori_Common_Project/docs/TORI_COMMON_PAW_STANDARD.md`
- Blotori derivative assets:
  - `public/blotori-paw-default.png`
  - `public/blotori-paw-pressed.png`
- Blotori canonical UI assets:
  - `public/blotori-character-transparent.webp`
  - `public/blotori-icon-transparent.webp`
  - legacy UI paths `public/blotori-canonical-mini.webp`, `public/blotori-face-ui.webp` point to the same transparent canonical-derived assets for compatibility.
- Shape/anatomy must remain common; only Blotori palette adaptation is permitted.

## App state UX

Blotori는 단순 spinner가 아니라 아래 상태를 명시적으로 보여준다.

1. `route loading` — canonical Blotori가 노트/카드와 함께 움직이는 진입 모션
2. `empty` — 플랫폼/주제 입력 전 상태
3. `generating` — canonical Blotori 캐릭터 모션 + 단일 AI 요청 대기 중 상태 안내
4. `success` — Blotori icon 기반 생성 완료 피드백
5. `error` — 오류 원인 + 재시도 가능 상태

생성 중 단계 문구는 실제 별도 AI 호출 단계를 의미하지 않는다. 사용자 대기 경험을 위한 진행 안내이며 AI 호출 원칙은 글 1건당 기본 1회를 유지한다.

## Image slot local preview

- 외부에서 ChatGPT/Gemini 등으로 생성한 이미지를 각 `IMG-XX` 슬롯에 바로 넣어 최종 게시물 배치를 확인한다.
- V1에서는 이미지 파일을 서버에 저장하지 않고 브라우저 Object URL로만 미리보기한다.
- 허용 파일: PNG/JPG/WebP, 한 장당 최대 15MB.
- 슬롯 클릭 또는 drag/drop으로 등록하고 `교체`/`삭제`가 가능하다.
- 새 글 생성 시작 시 기존 local preview를 정리해 이전 글 이미지가 새 글에 남지 않게 한다.
- 실제 게시 시 플랫폼 업로더에는 사용자가 원본 파일을 직접 올린다.

## Validation

- GitHub Actions workflow: `.github/workflows/validate.yml`
- Node 22
- `npm run lint` = TypeScript `tsc --noEmit`
- `npm run build` = Next.js production build
- 2026-09-10 최초 CI run에서 TypeScript check / production build 모두 PASS
- 이미지 슬롯 업로드 적용 commit `a0658f75ed03d7a86d2a745d725976999d352629`도 TypeScript check / production build PASS

## Guardrails

- 기본 글 생성은 애플리케이션 기준 AI 1회 호출을 유지한다.
- 이미지 생성 API는 V1에 포함하지 않는다.
- 레이아웃·라벨·복사 변환은 가능한 한 코드 기반으로 처리한다.
- 네이버 자동 로그인/자동 발행 기능은 구현하지 않는다.
- 근거 자료 검색이 실패했을 때 세부 임상 주장을 임의 생성하지 않는다.
- 라이선스/출처가 명확히 승인되지 않은 자료를 상용 Knowledge Base에 자동 색인하지 않는다.
- 승인된 Blotori canonical 캐릭터를 새로 생성한 유사 캐릭터로 대체하지 않는다.
- common paw shape를 프로젝트별로 재해석하지 않는다.
- 캐릭터 cutout은 canonical sheet의 캐릭터 픽셀을 유지하고 배경/주변 sheet 요소만 제거한다.
- 사용자 local preview 이미지는 브라우저 세션용이며 서버 업로드/영구 저장으로 간주하지 않는다.
- 코드 구현 완료를 visual acceptance로 간주하지 않는다.
