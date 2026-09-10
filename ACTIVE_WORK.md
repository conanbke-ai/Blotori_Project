# ACTIVE_WORK

## Status

`IN_PROGRESS` — V1 기준본 구축

## Canonical branch

- `main`

## V1 scope

- [x] 입력 폼
- [x] AI 텍스트 생성 1회 구조
- [x] 이미지 역할/프롬프트/삽입 위치 동시 생성
- [x] IMG 라벨 정규화
- [x] 읽기 중심 블로그 Preview
- [x] 본문 직접 수정
- [x] 이미지 프롬프트 개별 복사
- [x] 전체 원고 복사
- [x] 의료 표현 Rule Engine 1차
- [x] API key 미설정 Mock mode
- [ ] 실제 OpenAI API 응답 통합 테스트
- [ ] 실제 네이버 스마트에디터 복붙 보존 테스트
- [ ] 사용자 생성 이미지 슬롯 업로드/미리보기

## Guardrails

- 기본 글 생성은 AI 1회 호출을 유지한다.
- 이미지 생성 API는 V1에 포함하지 않는다.
- 레이아웃·라벨·복사 변환은 가능한 한 코드 기반으로 처리한다.
- 네이버 자동 로그인/자동 발행 기능은 구현하지 않는다.
