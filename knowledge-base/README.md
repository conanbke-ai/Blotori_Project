# Blotori Knowledge Base

이 디렉터리는 블로토리 RAG 전문자료 원본을 두는 로컬 전용 위치입니다.

## 권장 구조

```text
knowledge-base/
├─ _meta/
│  └─ SOURCES.csv
├─ rehabilitation/
│  ├─ guidelines/
│  ├─ neck-posture/
│  ├─ shoulder/
│  ├─ lumbar/
│  ├─ hip-pelvis/
│  ├─ knee/
│  └─ workplace-exercise/
├─ patient-education/
├─ pain-science/
└─ seo/
```

실제 PDF/DOCX/MD/TXT/PPTX/HTML/JSON 원문은 Git에 커밋하지 않습니다.

## 파일명 규칙

각 자료 파일명은 `_meta/SOURCES.csv`의 `source_id`로 시작해야 합니다.

```text
N01_forward_head_posture_review.pdf
S02_shoulder_network_meta_analysis.pdf
E01_patient_education_scoping_review.pdf
```

source_id가 manifest에 없거나 파일명에서 식별되지 않으면 기본 동기화에서 제외됩니다.

## 라이선스 게이트

`_meta/SOURCES.csv`의 핵심 필드:

- `commercial_status`: `ALLOW`, `ALLOW_WITH_ATTRIBUTION`, `REVIEW_REQUIRED`, `RESEARCH_ONLY`, `EXCLUDE`
- `ingest_default`: 기본 색인 포함 여부
- `attribution_required`: 출처표시 필요 여부
- `license_verified_on`: 라이선스 확인일

상용 프로필의 기본 포함 조건은 `ingest_default=true`이면서 `ALLOW` 또는 `ALLOW_WITH_ATTRIBUTION`입니다. `REVIEW_REQUIRED`, `RESEARCH_ONLY`, `EXCLUDE`는 자동으로 제외됩니다.

## 동기화 전 확인

```bash
npm run knowledge:plan
```

실제 업로드 없이 포함/제외 계획을 출력합니다.

연구·개발용 범위를 볼 때:

```bash
npm run knowledge:plan:research
```

## 실제 동기화

상용 기본 코퍼스:

```bash
npm run knowledge:sync
```

연구용 코퍼스:

```bash
npm run knowledge:sync:research
```

기존 상용 vector store에 새 허용 자료를 추가할 때:

```bash
npm run knowledge:append
```

동기화 스크립트는 업로드된 vector-store file에 `source_id`, `domain`, `topic`, `priority`, `evidence_type`, `commercial_status` 속성을 함께 기록합니다.

> `knowledge:sync`는 새 OpenAI vector store를 만들고 `.env.local`에 `OPENAI_VECTOR_STORE_ID`, `BLOTORI_KNOWLEDGE_PROFILE`을 기록합니다.
