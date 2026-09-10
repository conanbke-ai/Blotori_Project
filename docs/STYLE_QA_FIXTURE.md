# Blotori Writing Style QA Fixture

Purpose: verify prompt/style design before spending API calls.

This document is a **development-time acceptance fixture only**. It must not be implemented as a runtime `generate → reject → call AI again` loop. Blotori's normal generation remains one AI request per post; style quality should be improved by better first-call instructions, not paid retries.

## Fixture input

- Platform: Naver Blog
- Category: health / medical
- Topic: neck stiffness and limited rotation
- Method: exercise therapy / stretching
- Structure: information
- Length: medium

## PLAYFUL target

Expected tone:

- clearly reads like a lively Korean personal/information blog, not a hospital brochure
- information and safety boundaries remain accurate
- conversational rhythm appears in title, intro, headings, transitions, and closing — not only one joke sentence
- short reactions, parenthetical asides, light everyday comparisons, and direct reader address are allowed
- `-합니다/-됩니다/-해야 합니다` never becomes the dominant rhythm
- humor must never trivialize pain, patients, safety, or medical uncertainty

### Target-style example

Title example:

`목이 뻣뻣하다? 일단 목부터 쭉쭉 늘리는 건 잠깐만요 👀`

Intro example:

`아침에 고개 한 번 돌렸는데 “어? 여기까지만 가네?” 싶은 날 있죠. 이럴 때 괜히 승부욕(?)이 생겨서 목을 더 세게 돌리고 싶어지는데요. 잠깐만요. 목 스트레칭은 누가 더 많이 꺾나 겨루는 게임이 아니거든요.`

Heading example:

`목이 안 돌아간다고 끝까지 밀어붙이기? 목 입장도 좀 들어봅시다`

Body example:

`편하게 움직이는 범위 안에서 좌우로 천천히 움직여 보는 것부터 시작해도 충분해요. 특정 방향에서 갑자기 찌릿하거나 통증이 확 올라오면 거기서 스톱. 몸이 이미 “오늘은 여기까지!”라고 알려주고 있는데 굳이 협상 테이블까지 끌고 갈 필요는 없죠 ㅋㅋ.`

`그렇다고 하루 종일 목을 봉인(?)해둘 필요도 없어요. 무리 없는 범위에서 조금씩 움직이면서 변화를 보는 게 포인트예요. 세게 한 번보다 편하게 여러 번. 생각보다 이쪽이 훨씬 현실적인 접근입니다.`

## Brochure-tone anti-pattern

When `playful` is selected, an article dominated by sentences like the following indicates that the prompt profile is too weak and should be fixed **before release**, not automatically retried at runtime:

`목 디스크의 상태와 신경 자극 정도는 사람마다 다르기 때문에 주변 사람의 운동법을 그대로 따라 하기보다 전문의료진의 안내를 우선해야 합니다.`

The factual content may be valid, but if most of the post uses this rhythm, the selected style has disappeared.

Other anti-patterns:

- every heading ends in `~방법`, `~정리`, `~안내`
- every paragraph uses only `~합니다 / ~됩니다 / ~해야 합니다`
- only one playful sentence appears in an otherwise formal article
- humor appears only in parentheses while all main sentences remain brochure-like

## PATIENT GUIDE contrast

Expected:

`목 움직임이 불편할 때는 먼저 통증이 심해지는 방향을 피하고, 편안한 범위에서 천천히 움직여 보세요. 움직임이 갑자기 제한됐거나 팔 저림처럼 다른 증상이 함께 나타난다면 스트레칭을 무리하게 이어가기보다 상태를 확인하는 것이 좋습니다.`

This should feel calmer and more instructional than PLAYFUL.

## Development review rule

If PLAYFUL and PATIENT GUIDE could be swapped without a reader noticing a meaningful tone difference, strengthen the style profile itself. Do not solve that problem by silently spending another API call.
