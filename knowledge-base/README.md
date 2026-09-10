# Blotori Knowledge Base

이 디렉터리는 블로토리 RAG 전문자료 원본을 두는 로컬 전용 위치입니다.

- 권장 분류: `rehabilitation/`, `patient-education/`, `pain-science/`, `seo/` 등
- 지원 대상: PDF, DOCX, MD, TXT, PPTX, HTML, JSON
- 실제 자료 원본은 Git에 커밋하지 않습니다. `.gitignore`가 이 디렉터리의 원문을 제외합니다.
- 라이선스와 출처는 별도 메타 파일에서 관리하는 것을 권장합니다.

동기화:

```bash
npm run knowledge:sync
```

기존 vector store에 파일을 추가할 때:

```bash
npm run knowledge:append
```

`knowledge:sync`는 새 OpenAI vector store를 만들고 `.env.local`에 `OPENAI_VECTOR_STORE_ID`를 기록합니다.
