# BLOTORI RAG KNOWLEDGE BASE STANDARD

## 목적

블로토리의 전문 콘텐츠 품질을 높이기 위해 건강·의료 등 근거가 중요한 주제에서 검증된 자료를 검색해 같은 글 생성 요청 안에서 참고한다.

## V1 구조

```text
knowledge-base/
  -> npm run knowledge:sync
  -> OpenAI Files
  -> OpenAI Vector Store
  -> Responses API file_search
  -> 기존 1회 글 생성
  -> BlogDraft.knowledgeGrounding
```

## 기본 정책

1. 별도 모델 학습은 하지 않는다.
2. 건강·의료 카테고리에서만 기본 활성화한다.
3. `BLOTORI_RAG_CATEGORIES=*`로 설정하면 모든 카테고리에 확장할 수 있다.
4. 검색 결과가 없거나 관련성이 낮으면 임상 세부 주장을 임의 생성하지 않는다.
5. 가이드라인, 체계적 문헌고찰, 공공기관 자료를 우선 활용한다.
6. 전문용어는 기존 Glossary Footnote 정책을 따른다.
7. 문서 파일명과 내부 file id는 본문에 직접 노출하지 않는다.
8. 실제 검색 사용 여부와 검색된 source filename은 `knowledgeGrounding` 메타데이터로 남긴다.
9. 라이선스가 불명확한 자료는 상용 Knowledge Base에 넣지 않는다.
10. PDF/DOCX 등 원문 파일은 Git에 커밋하지 않는다.

## 환경변수

```env
OPENAI_VECTOR_STORE_ID=vs_...
BLOTORI_RAG_ENABLED=true
BLOTORI_RAG_CATEGORIES=health
BLOTORI_RAG_MAX_RESULTS=6
BLOTORI_KNOWLEDGE_DIR=knowledge-base
```

## 동기화

새 기준본 생성:

```bash
npm run knowledge:sync
```

기존 vector store 추가:

```bash
npm run knowledge:append
```

## QA

- health 글에서 vector store 설정 시 file_search가 수행되는가
- 일반 카테고리에서는 불필요한 file_search가 수행되지 않는가
- 검색 결과가 없을 때 기존 생성이 깨지지 않는가
- 근거와 다른 과도한 인과·치료 효과가 생성되지 않는가
- 용어해설 최대 5개 정책과 충돌하지 않는가
- `knowledgeGrounding.used/sourceNames/resultCount`가 정상 기록되는가
