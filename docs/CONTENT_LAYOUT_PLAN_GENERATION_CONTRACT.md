# 새 원고 편집 계획 생성 계약

상태: 로컬 검토 후보. 기존 저장 원고를 변환하지 않으며 배포 계약이 아니다.

## 결정

- 편집 계획은 새 원고 생성 전에 애플리케이션이 결정적으로 한 번 만든다.
- 같은 계획을 mock/API 생성 입력에 전달하고, 반환된 비-용어해설 섹션의 ID·순서·소제목과 이미지 역할·위치를 검증한다.
- 출력이 계획과 다르면 자동 재정렬하거나 다시 호출하지 않는다. 해당 원고에는 계획을 붙이지 않고 `편집 계획 미적용` 경고를 남긴다.
- `freeTopic`은 공백과 문장부호를 포함한 사용자 입력 원문 그대로 `plan.source.freeTopic`에 기록한다. 존재 여부 판단에만 `trim()`을 사용할 수 있고 원문을 덮어쓰지 않는다.
- 목적 필드는 현재 선택의 `preset.fieldIds ?? category.defaultFieldIds`에 포함된 `goal`, `learningGoal`, `visitPurpose` 중 하나만 허용한다.
- 현재 폼 정의에서는 한 선택 상태에 목적 필드가 둘 이상 활성화되지 않는다. 숨은 이전 preset 값이나 직접 API로 전달된 비활성 목적 필드는 원본 request에서 삭제하지 않고, 파생 생성 입력에서만 제외한다.
- 제외된 목적 필드의 ID는 `plan.source.excludedPurposeFields`에 기록하며 실제 문장 값은 경고에 반복하지 않는다.
- 음식 facts 삽입, 생성 뒤 문단·섹션·이미지 재작성, 네이버 변환 규칙, 기존 저장 원고 migration은 이 후보에 포함하지 않는다.
- 기존 원고당 AI 텍스트 생성 요청 1회 계약을 유지하며 별도 planning 호출을 만들지 않는다.

## 데이터 경계

- `GenerateRequest`: 사용자가 제출한 raw selection. 불변 입력이다.
- `generationInput`: 현재 category/preset schema로 admission한 파생 입력. 비활성 목적 필드만 제외한다.
- `ContentLayoutPlan`: raw selection에서 재현 가능한 파생 계획이다.
- provider draft: mock 또는 API가 계획을 보고 만든 출력이다. 검증 전에 원본 증거로 취급하며 자동 보정하지 않는다.
- saved draft: 검증 성공 시에만 계획을 포함한다. 기존 저장 draft는 읽을 때 계획을 만들지 않는다.

## 검증 증거

`scripts/validate-content-layout-plan-generation.mjs`의 데이터는 전부 synthetic fixture다. 실제 사용자 원고, 계정, 이미지, 운영 DB 또는 provider 응답을 증거로 사용하지 않는다.

## CI 게이트

- `.github/workflows/validate.yml`: `node scripts/validate-content-layout-plan-generation.mjs`
- `.github/workflows/composer-integration-e2e.yml`: `node scripts/qa/validate-layout-plan-feedback-dual-origin.mjs`
- browser job은 기존 `npm ci`와 `npx playwright install --with-deps chromium`을 재사용한다. 새 패키지를 추가하지 않는다.
- server는 `BLOTORI_MOCK_MODE=true`, `BLOTORI_RAG_ENABLED=false`, `OPENAI_API_KEY` unset 상태에서 시작한다.
- 정상·빈 목적·숨은 목적은 keyless mock 생성 경로를 사용한다. ID·순서·이미지 mismatch UI는 Playwright가 명시적 synthetic 응답으로 intercept한다.
- 이 브라우저 QA의 앱 실행 경로에서 실제 OpenAI/provider 호출, 네이버 전송, 계정·운영 데이터 접근은 0회다. 워크플로 준비 단계의 `npm ci`와 Chromium 설치까지 포함한 전체 네트워크 통신 0을 뜻하지 않는다.
