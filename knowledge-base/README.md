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

```bash
npm run knowledge:organize:plan
npm run knowledge:organize
```

- manifest의 `source_id/domain/topic/commercial_status`를 우선 사용합니다.
- `.url`은 `_meta/source-links/`, `RESEARCH_ONLY`는 `_research-only/`로 분리합니다.
- 불확실한 자료는 삭제하지 않고 `_incoming/unclassified/`에 둡니다.
- 같은 이름이 이미 있으면 `_2`, `_3` 형태로 보존합니다.

## Knowledge Audit

정리 후 반드시 audit을 실행합니다.

```bash
npm run knowledge:audit
```

보고서만 출력하며 blocker가 있어도 종료코드는 성공입니다. 상용 색인 전 검증은 strict 모드를 사용합니다.

```bash
npm run knowledge:audit:strict
```

주요 blocker:

- `SOURCES.csv` source_id 중복/누락
- 허용되지 않은 `commercial_status`
- 상용 기본 색인 자료의 license 또는 `license_verified_on` 누락
- manifest에 등록되지 않은 파일이 canonical 디렉터리에 존재
- manifest 기준 canonical 디렉터리와 실제 파일 위치 불일치
- `RESEARCH_ONLY` 자료가 `_research-only/` 밖에 존재

warning 예:

- `_incoming/unclassified/` 잔여 자료
- 상용 manifest source에 대응하는 로컬 원문이 아직 없음
- 한 source_id에 여러 원문 파일 존재
- RAG 미지원 확장자

`knowledge:plan`, `knowledge:sync`, `knowledge:append`는 strict audit을 자동으로 먼저 실행합니다. blocker가 있으면 OpenAI 업로드 전에 중단됩니다.

## 파일명 규칙

전문자료 파일명은 `_meta/SOURCES.csv`의 `source_id`로 시작합니다.

```text
N01_forward_head_posture_review.pdf
S02_shoulder_network_meta_analysis.pdf
E01_patient_education_scoping_review.pdf
```

## 라이선스 게이트

`_meta/SOURCES.csv` 핵심 필드:

- `commercial_status`: `ALLOW`, `ALLOW_WITH_ATTRIBUTION`, `REVIEW_REQUIRED`, `RESEARCH_ONLY`, `EXCLUDE`
- `ingest_default`: 기본 색인 포함 여부
- `attribution_required`: 출처표시 필요 여부
- `license_verified_on`: 라이선스 확인일

상용 프로필은 `ingest_default=true`이면서 `ALLOW` 또는 `ALLOW_WITH_ATTRIBUTION`인 자료만 기본 포함합니다.

## 권장 작업 순서

```text
원문/링크 추가
  -> knowledge:organize:plan
  -> knowledge:organize
  -> knowledge:audit
  -> _incoming/unclassified 및 blocker 보완
  -> knowledge:audit:strict
  -> knowledge:plan
  -> knowledge:sync 또는 knowledge:append
```

연구용 계획/동기화:

```bash
npm run knowledge:plan:research
npm run knowledge:sync:research
```

상용:

```bash
npm run knowledge:plan
npm run knowledge:sync
npm run knowledge:append
```

동기화 스크립트는 vector-store file에 `source_id`, `domain`, `topic`, `priority`, `evidence_type`, `commercial_status` 속성을 기록합니다.
