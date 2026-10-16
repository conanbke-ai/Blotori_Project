# 블로토리 개인용 원고 품질 평가 (API 추가 호출 없음)

상태: **평가 도구 구현 / 실제 API 생성 원고 샘플 미평가**

기존 OpenAI 연동, 원고 생성·편집·IndexedDB 저장은 변경하지 않는다. 현재 저장된 원고를 명시적으로 JSON으로 내보내어 별도 평가한다. 브라우저 IndexedDB를 테스트 도구에서 자동 추출하지 않는다.

## 대표 평가 케이스

| 케이스 | 조건 | 수동 평가 핵심 |
| --- | --- | --- |
| NAVER_INFO | 네이버 / 정보형 / 자료가 있는 설명형 | 정보 정확성, 근거 일치, 문단 흐름, 전문용어 |
| NAVER_REVIEW | 네이버 / 솔직한 후기형 / 체험 근거 명시 | 실사용 경험 꾸며내지 않기, 세부 사실, 자연스러운 1인칭 |
| NAVER_DNA | 네이버 / 승인된 블로그 DNA / 정보형 또는 후기형 | 어미·문단 리듬·전개·이미지 간격의 유사성, 원문 복제 금지 |

평가 파일(개인정보·API 키 제거):
```json
{
  "caseId": "NAVER_INFO",
  "mode": "api",
  "request": {
    "platformId": "naver",
    "freeTopic": "입력한 주제",
    "imageCount": 3,
    "attributes": {},
    "extraConditions": "확인된 사용자 제공 근거"
  },
  "draft": {
    "title": "생성한 제목",
    "intro": ["도입"],
    "sections": [{"id":"sec-1","heading":"첫 소제목","paragraphs":["본문"]}],
    "closing": ["마무리"],
    "images": [{"id":"IMG-01-HERO"}]
  }
}
```

위 예시는 **스키마 형태를 보여주는 가상 예시**이며 실제 블로그 원고 평가 결과가 아니다. 실제 파일에는 생성 결과의 나머지 필드를 유지해도 된다.

```bash
node scripts/qa/review-draft-quality.mjs \
  --input artifacts/naver-info-case.json \
  --out artifacts/naver-info-quality.json
```

`artifacts/`는 Git 제외. API 키·실명·연락처·비공개 원고를 저장소에 커밋하지 않는다.

## 합격 기준

1. 기계 검사: 제목/본문 누락 0, 동일 소제목 0, 동일 문단 0, 요청 이미지 수 충족. 발견한 숫자나 가격은 근거 확인 후보로 표시(자동으로 허위 판단하지 않음).
2. 사람 검수: 사실 근거·문체 자연스러움·후기 경험의 진실성·블로그 DNA 충실도·이미지 위치를 각 1~5점으로 매긴다.
3. 허위 체험담, 꾸며낸 가격·시간·효능, 출처 없는 확정적 주장은 점수와 무관하게 **게시 전 수정 필수**.
4. Mock은 UI·파이프라인 확인용일 뿐 실제 AI 글 품질 합격 근거가 아니다.

도구는 기존 원고를 읽기만 하며 OpenAI API를 호출하거나 자동으로 원고를 재생성하지 않는다. 수동 평가는 여전히 PENDING이다.
