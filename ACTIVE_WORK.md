# ACTIVE_WORK

## Status

`IN_PROGRESS` — Blotori V1 실사용 기준본 구축

## Canonical branch

- `main`

## Current workstream

- `main` 기준 V1 runtime QA / 플랫폼 붙여넣기 검증 / visual acceptance
- TORI 표준 기반 Blotori Composer UI / 플랫폼별 생성·복사 품질 / 제목·문체 전략

## V1 scope

- [x] 플랫폼 선택 + 자유 주제/카테고리 기반 입력
- [x] 주제별 동적 추가 조건
- [x] 문체 / 글 구성 추천 및 직접 설정
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
- [ ] 실제 OpenAI API 응답 통합 QA
- [ ] 실제 네이버 스마트에디터 복붙 보존 테스트
- [ ] rich clipboard 플랫폼 실제 붙여넣기 검증
- [ ] 사용자 생성 이미지 슬롯 업로드/미리보기
- [ ] desktop / tablet / mobile visual acceptance

## Common TORI dependency

- Common paw canonical: `conanbke-ai/Tori_Common_Project/assets/tori-common-standard-paw.webp`
- Common paw policy: `conanbke-ai/Tori_Common_Project/docs/TORI_COMMON_PAW_STANDARD.md`
- Blotori derivative assets:
  - `public/blotori-paw-default.png`
  - `public/blotori-paw-pressed.png`
- Shape/anatomy must remain common; only Blotori palette adaptation is permitted.

## App state UX

Blotori는 단순 spinner가 아니라 아래 상태를 명시적으로 보여준다.

1. `route loading` — 앱/라우트 진입 준비
2. `empty` — 플랫폼/주제 입력 전 상태
3. `generating` — 단일 AI 요청 대기 중 상태 안내
4. `success` — 생성 완료 피드백
5. `error` — 오류 원인 + 재시도 가능 상태

생성 중 단계 문구는 실제 별도 AI 호출 단계를 의미하지 않는다. 사용자 대기 경험을 위한 진행 안내이며 AI 호출 원칙은 글 1건당 기본 1회를 유지한다.

## Guardrails

- 기본 글 생성은 AI 1회 호출을 유지한다.
- 이미지 생성 API는 V1에 포함하지 않는다.
- 레이아웃·라벨·복사 변환은 가능한 한 코드 기반으로 처리한다.
- 네이버 자동 로그인/자동 발행 기능은 구현하지 않는다.
- 승인된 Blotori canonical 캐릭터를 새로 생성한 유사 캐릭터로 대체하지 않는다.
- common paw shape를 프로젝트별로 재해석하지 않는다.
- 코드 구현 완료를 visual acceptance로 간주하지 않는다.
