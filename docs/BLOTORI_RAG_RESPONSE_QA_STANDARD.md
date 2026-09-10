# Blotori RAG Response QA Standard

## 목적

Knowledge Base가 존재한다는 사실만으로 건강 콘텐츠를 근거 기반이라고 판정하지 않는다. 실제 생성 응답이 File Search를 사용했고, 참조 source를 추적할 수 있으며, 일반 독자용 glossary 및 의료 표현 guardrail을 지켰는지를 검증한다.

## 실행

일반 보고:

```bash
npm run qa:rag -- tmp/health-draft.json
```

실제 상용 RAG acceptance:

```bash
npm run qa:rag:strict -- tmp/health-draft.json
```

`qa:rag:strict`는 실제 File Search 사용을 요구한다.

## 필수 acceptance

1. `knowledgeGrounding.enabled=true`
2. `knowledgeGrounding.used=true`
3. `sourceNames`가 1개 이상 존재
4. 참조 파일명이 source_id prefix를 가지며 `_meta/SOURCES.csv`에 등록됨
5. glossary 전문용어 최대 5개
6. glossary 용어는 본문 최초 등장 1회에만 `*`
7. 동일 glossary 용어 반복 별표 금지
8. 특정 자세·근육·관절을 통증/질환의 단일 확정 원인으로 표현하지 않음
9. `반드시`, `무조건`, `완치`, `100%` 같은 의료 과장 표현 금지

## 경고 항목

- `resultCount=0`인데 citation만 존재하는 경우
- source filename에 source_id가 없는 경우
- 근거 기반 글인데 개인차/불확실성 표현이 약한 경우
- manifest가 로컬에서 확인되지 않는 경우

## QA fixture

실제 API 호출 결과의 `BlogDraft` JSON을 파일로 저장해 validator에 전달한다. API key와 vector store가 없는 CI에서는 실제 File Search를 강제로 호출하지 않는다. 실제 API acceptance는 로컬/배포 QA에서 수행한다.

## Stop condition

상용 건강 콘텐츠 RAG acceptance는 다음이 모두 충족될 때만 완료 처리한다.

- Knowledge audit strict PASS
- commercial vector store sync 완료
- 실제 health 샘플 3종 이상에서 RAG response QA strict PASS
- 목/자세, 어깨, 통증/환자교육처럼 서로 다른 source domain을 최소 1회씩 검색
- 사람이 최종 원고를 읽었을 때 출처 내용과 반대되는 임상 주장 없음
- 일반 독자가 읽기 어려울 정도의 전문용어 남발 없음
