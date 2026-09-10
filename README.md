# Blotori_Project

네이버 블로그용 건강정보 콘텐츠를 **기본 AI 호출 1회**로 구성하고, 이미지 제작 프롬프트와 삽입 위치까지 함께 제공하는 내부용 Blog Composer입니다.

## V1 목표

`조건 입력 → 글/이미지 기획 1회 생성 → 이미지 프롬프트 복사 → 동일 라벨 위치에 이미지 삽입 → 네이버용 원고 복사`

자동 이미지 생성과 네이버 자동 발행은 V1 범위에서 제외해 API 비용과 플랫폼 의존성을 낮춥니다.

## 주요 기능

- 연령대 / 치료·관심 부위 / 치료·관리 방법 / 자세 / 문체 / 글 길이 입력
- OpenAI Responses API 기본 1회 호출
- 제목, 도입, 소제목, 본문, 마무리, 태그 동시 생성
- `IMG-01-HERO`, `IMG-02-POSTURE` 형식의 일관된 이미지 라벨
- 이미지별 역할, 삽입 위치, 권장 비율, 권장 크기, 생성 프롬프트 제공
- 본문과 이미지 제작 가이드가 동일 라벨을 공유해 위치 혼동 방지
- 제목/본문 직접 수정 시 추가 AI 호출 없음
- 이미지 프롬프트 개별 복사 및 전체 원고 복사
- 의료 관련 과장·단정 표현 일부를 Rule Engine으로 감지
- `OPENAI_API_KEY`가 없으면 Mock 모드로 UI 테스트 가능

## 실행

```bash
npm install
cp .env.example .env.local
# .env.local에 OPENAI_API_KEY 입력
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.6-luna
```

## 구조

```text
app/
├─ page.tsx                       # Composer UI / Preview
└─ api/generate/route.ts          # Controller

lib/
├─ application/
│  ├─ generate-blog-draft.ts      # Service / orchestration
│  └─ build-prompt.ts             # Prompt builder
├─ domain/
│  ├─ types.ts                    # Blog domain contracts
│  └─ rules.ts                    # Label normalization / safety rules
└─ infrastructure/
   ├─ openai-content-adapter.ts    # OpenAI Responses API adapter
   └─ mock-content-adapter.ts      # API key 없는 개발용 adapter
```

현재 V1에는 영속 저장소가 없으므로 Repository 계층은 두지 않습니다. 히스토리 저장이 추가될 때 Repository를 별도 계층으로 추가합니다.

## AI 비용 원칙

정상적인 `생성` 동작은 텍스트 AI를 기본 1회만 호출합니다. 다음 동작은 추가 AI 호출이 없습니다.

- 이미지 프롬프트 복사
- 본문 직접 수정
- 이미지 위치/크기 가이드 표시
- 전체 원고 복사

이미지는 프로그램이 생성하지 않습니다. 사용자는 `IMG-XX-ROLE` 프롬프트를 원하는 이미지 생성 도구에 붙여 넣고 같은 라벨 위치에 삽입합니다.

## V1 이후 후보

- 생성 이미지 업로드 → 동일 IMG 슬롯 자동 장착 및 최종 미리보기
- 섹션/이미지 블록 드래그 재배치
- HTML + plain text Clipboard export 실제 네이버 에디터 검증
- 검수된 치료 설명/기관 문구 프리셋
- LocalStorage → SQLite/Postgres 히스토리 Repository
- 의료광고 Rule Set 및 운영자 최종 검수 체크리스트 강화

> Rule Engine은 법률 자문이나 의료광고 사전심의를 대체하지 않습니다. 실제 게시 전 최종 검토가 필요합니다.
