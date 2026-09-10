# ACTIVE_WORK

## Status

`IN_PROGRESS` — Blotori V1 실사용 기준본 구축

## Canonical branch

- `main`

## Current workstream

- `main` 기준 V1 runtime QA / 플랫폼 붙여넣기 검증 / visual acceptance
- TORI 표준 기반 Blotori Composer UI / 플랫폼별 생성·복사 품질 / 제목·문체 전략
- 일반 독자용 전문용어 footnote / glossary 생성·정규화·플랫폼 export QA
- 건강·의료 전문자료 Knowledge Base / OpenAI File Search RAG 통합 QA

## V1 scope

- [x] 플랫폼 선택 + 자유 주제/카테고리 기반 입력
- [x] 주제별 동적 추가 조건
- [x] 문체 / 글 구성 추천 및 직접 설정
- [x] AI 텍스트 생성 1회 구조
- [x] 플랫폼별 Generation Strategy / Clipboard Exporter
- [x] 의료 표현 Rule Engine 1차
- [x] 일반 독자용 전문용어 최대 5개 + 최초 1회 `*` + 하단 용어해설
- [x] OpenAI hosted File Search 기반 RAG 연결 구조
- [x] `knowledge-base/` 로컬 자료 디렉터리 + Git 원문 제외 정책
- [x] `knowledge:sync` 새 vector store 생성/업로드/색인/환경변수 기록
- [x] `knowledge:append` 기존 vector store 추가 동기화
- [x] 건강 카테고리 기본 RAG routing + source filename 메타데이터
- [ ] 실제 전문자료를 `knowledge-base/`에 배치 후 최초 vector store 동기화
- [ ] 실제 OpenAI API + file_search 응답 통합 QA
- [ ] 실제 네이버 스마트에디터 복붙 보존 테스트
- [ ] glossary 포함 네이버 붙여넣기 QA
- [ ] 사용자 생성 이미지 슬롯 업로드/미리보기
- [ ] desktop / tablet / mobile visual acceptance

## Knowledge Base / RAG

- 별도 모델 학습 없이 OpenAI File Search를 사용한다.
- 기본 적용 범위는 `health`이며 `BLOTORI_RAG_CATEGORIES`로 확장한다.
- 검색은 기존 Responses API 글 생성 요청 안에서 수행하여 애플리케이션 기준 생성 호출은 1회/글을 유지한다.
- 자료가 없거나 vector store가 설정되지 않으면 기존 non-RAG 생성 경로로 fallback한다.
- 전문자료 원문은 저장소에 커밋하지 않는다.
- 상용화 전 각 자료의 라이선스/출처를 확인한다.

상세 기준: `docs/BLOTORI_RAG_KNOWLEDGE_BASE_STANDARD.md`

## Glossary footnote

- 기본 독자는 일반 블로그 이용자다.
- 쉬운 표현만으로 정확하게 설명할 수 있으면 전문용어를 억지로 넣지 않는다.
- 전문용어는 글 1건당 최대 5개를 기본 상한으로 한다.
- 본문 최초 등장 1회에만 `*`를 붙이고 하단 `용어해설`에서 짧고 쉽게 설명한다.

상세 기준: `docs/BLOTORI_GLOSSARY_FOOTNOTE_STANDARD.md`

## Guardrails

- 기본 글 생성은 애플리케이션 기준 AI 1회 호출을 유지한다.
- 이미지 생성 API는 V1에 포함하지 않는다.
- 네이버 자동 로그인/자동 발행 기능은 구현하지 않는다.
- 근거 자료 검색이 실패했을 때 세부 임상 주장을 임의 생성하지 않는다.
- 코드 구현 완료를 visual acceptance로 간주하지 않는다.
