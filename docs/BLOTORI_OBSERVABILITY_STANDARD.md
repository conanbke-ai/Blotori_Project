# Blotori Observability Standard

## 목적

운영 중 생성 실패, RAG 검색 실패, 느린 응답, 근거자료 미사용을 request 단위로 추적한다. 블로그 원문, 프롬프트 전문, 사용자 자유입력 전문, API key, vector store id는 로그에 기록하지 않는다.

## Correlation

모든 `/api/generate` 요청은 UUID `requestId`를 발급한다.

- 응답 JSON: `requestId`
- 응답 header: `x-blotori-request-id`
- 서버 로그: `requestId`

사용자가 오류를 신고하면 requestId로 해당 요청의 시작/완료/실패/RAG warning 로그를 연결한다.

## Structured events

### generation.started

- requestId
- platformId
- category/presetId
- model

### generation.completed

- durationMs
- RAG enabled/used
- RAG result count
- RAG source count

### rag.empty_result

RAG 대상 요청인데 file search 결과가 최종 근거로 사용되지 않은 경우 warning.

### generation.failed

- durationMs
- errorCode
- 정제된 오류 메시지

오류 분류 기본값:

- `OPENAI_CONFIG_ERROR`
- `RAG_ERROR`
- `AI_RESPONSE_PARSE_ERROR`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_RATE_LIMIT`
- `GENERATION_ERROR`
- `UNKNOWN_ERROR`

## 운영 Health

`GET /api/ops/health`

OpenAI 설정, RAG 활성화 상태, vector store 설정 여부만 노출한다. 비밀값 자체는 노출하지 않는다.

## 초기 모니터링 지표

배포 로그 플랫폼에서 JSON 필드를 기준으로 집계한다.

- generation success rate
- generation error rate
- p50 / p95 generation duration
- RAG used rate
- RAG empty-result rate
- 평균 RAG result count
- 평균 RAG source count
- errorCode별 발생 건수

## 초기 alert 기준

운영 데이터가 쌓이기 전 임시 기준이며 실제 트래픽 이후 조정한다.

- 15분 generation error rate >= 10%: warning
- 15분 generation error rate >= 25%: critical
- 15분 RAG empty-result rate >= 20% (RAG 요청 10건 이상): warning
- p95 generation duration >= 30s: warning
- `OPENAI_CONFIG_ERROR` 또는 `RAG_ERROR` 연속 3건: critical

## Privacy

로그 금지:

- 블로그 원고 전문
- 사용자가 입력한 자유주제/상세상황 전문
- 의료 증상 서술 전문
- 업로드 문서 내용
- API key
- vector store id
- raw OpenAI response

운영 로그에는 식별/집계에 필요한 최소 메타데이터만 남긴다.

## 향후

V1은 stdout JSON 구조화 로그를 사용한다. Render 등 배포 플랫폼 로그에서 검색 가능하다. 트래픽이 늘면 OpenTelemetry/Sentry 또는 별도 로그 저장소를 Adapter로 추가하고 application/domain 계층은 외부 모니터링 SDK에 직접 의존하지 않는다.
