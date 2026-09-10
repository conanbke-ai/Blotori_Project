# Blotori Knowledge Base

이 디렉터리는 블로토리 RAG 전문자료 원본을 두는 로컬 전용 위치입니다.

## Canonical 구조

```text
knowledge-base/
├─ _meta/
│  ├─ SOURCES.csv
│  └─ source-links/
├─ _incoming/
│  └─ unclassified/
├─ _research-only/
├─ rehabilitation/
│  ├─ guidelines/
│  ├─ anatomy-kinesiology/
│  ├─ cervical-neck/
│  ├─ thoracic/
│  ├─ shoulder/
│  ├─ lumbar/
│  ├─ hip-pelvis/
│  ├─ knee/
│  ├─ ankle-foot/
│  ├─ posture/
│  └─ exercise/
│     ├─ general/
│     └─ workplace/
├─ patient-education/
│  ├─ general/
│  ├─ behavior-change/
│  └─ health-literacy/
├─ pain-science/
│  ├─ chronic-pain/
│  ├─ central-sensitization/
│  └─ multimodal/
└─ seo/
   ├─ naver/
   ├─ tistory/
   ├─ wordpress/
   └─ writing-psychology/
```

실제 PDF/DOCX/MD/TXT/PPTX/HTML/JSON 원문은 Git에 커밋하지 않습니다.

## 자동 정리

현재 `knowledge-base/` 루트나 예전 `01_guidelines`, `02_neck_posture` 같은 폴더에 자료를 넣어둔 경우 먼저 정리 계획을 확인합니다.

```bash
npm run knowledge:organize:plan
```

실제 이동:

```bash
npm run knowledge:organize
```

정리 규칙:

- `_meta/SOURCES.csv`에 등록된 `source_id`가 파일명 앞에 있으면 manifest의 `domain/topic/commercial_status`를 우선 사용합니다.
- `.url` 출처 링크는 `_meta/source-links/`로 이동합니다.
- `RESEARCH_ONLY` 자료는 `_research-only/`로 이동합니다.
- manifest에 없으면 파일명 키워드로 보수적으로 1차 분류합니다.
- 분류가 불확실하면 `_incoming/unclassified/`에 남깁니다.
- 기존 파일은 삭제하지 않고 이동하며, 같은 이름이 이미 있으면 `_2`, `_3` 형태로 보존합니다.

## 파일명 규칙

각 전문자료 파일명은 가능하면 `_meta/SOURCES.csv`의 `source_id`로 시작합니다.

```text
N01_forward_head_posture_review.pdf
S02_shoulder_network_meta_analysis.pdf
E01_patient_education_scoping_review.pdf
```

source_id가 manifest에 없거나 파일명에서 식별되지 않으면 상용 기본 동기화에서 제외됩니다.

## 라이선스 게이트

`_meta/SOURCES.csv`의 핵심 필드:

- `commercial_status`: `ALLOW`, `ALLOW_WITH_ATTRIBUTION`, `REVIEW_REQUIRED`, `RESEARCH_ONLY`, `EXCLUDE`
- `ingest_default`: 기본 색인 포함 여부
- `attribution_required`: 출처표시 필요 여부
- `license_verified_on`: 라이선스 확인일

상용 프로필의 기본 포함 조건은 `ingest_default=true`이면서 `ALLOW` 또는 `ALLOW_WITH_ATTRIBUTION`입니다. `REVIEW_REQUIRED`, `RESEARCH_ONLY`, `EXCLUDE`는 자동으로 제외됩니다.

## 권장 작업 순서

```text
원문/링크 추가
  -> npm run knowledge:organize:plan
  -> npm run knowledge:organize
  -> _incoming/unclassified 수동 확인
  -> _meta/SOURCES.csv 보완
  -> npm run knowledge:plan
  -> npm run knowledge:sync 또는 knowledge:append
```

연구·개발용 범위를 볼 때:

```bash
npm run knowledge:plan:research
```

상용 기본 코퍼스 실제 동기화:

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

동기화 스크립트는 vector-store file에 `source_id`, `domain`, `topic`, `priority`, `evidence_type`, `commercial_status` 속성을 함께 기록합니다.

> `knowledge:sync`는 새 OpenAI vector store를 만들고 `.env.local`에 `OPENAI_VECTOR_STORE_ID`, `BLOTORI_KNOWLEDGE_PROFILE`을 기록합니다.
