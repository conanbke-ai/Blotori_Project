# Blotori Writing Style QA Fixture

Purpose: verify prompt/style changes before spending API calls.

This is a manual acceptance fixture, not a replacement for final model integration QA.

## Fixture input

- Platform: Naver Blog
- Category: health / medical
- Topic: neck stiffness and limited rotation
- Method: exercise therapy / stretching
- Structure: information
- Length: medium

## PLAYFUL acceptance

Expected tone:

- clearly sounds like a light, lively Korean information blog
- still medically cautious and accurate
- headings may be conversational questions/statements
- does not fall back to hospital brochure prose
- `-합니다/-됩니다` is not repeated mechanically
- at least several sections contain natural spoken connectors or light reactions
- no forced meme slang, excessive emoji, or jokes about pain/patients

### PASS-style example

Title example:

`목이 뻣뻣할 때, 무조건 세게 늘리면 더 잘 풀릴까요?`

Body example:

`아침에 고개를 돌리는데 “어라, 왜 여기서 멈추지?” 싶은 날이 있죠. 이럴 때 가장 먼저 떠올리는 게 목을 쭉쭉 늘리는 스트레칭인데요. 세게 당긴다고 더 빨리 풀리는 건 아니에요. 오히려 통증이 커지거나 움직임이 더 불편해진다면 강도를 낮추고 상태부터 확인하는 게 먼저예요.`

Heading example:

`목이 안 돌아간다고 바로 끝까지 돌릴 필요는 없어요`

Body example:

`스트레칭은 ‘얼마나 많이 움직였느냐’보다 불편하지 않은 범위에서 부드럽게 반복했느냐가 더 중요해요. 특정 방향에서 유독 당기거나 아프다면 거기서 억지로 밀어붙이지 않는 게 포인트예요. 몸이 “오늘은 여기까지!” 하고 신호를 보내는데 굳이 설득전(?)을 벌일 필요는 없으니까요.`

## PLAYFUL fail examples

The following tone is a FAIL when `playful` was selected:

`목 디스크의 상태와 신경 자극 정도는 사람마다 다르기 때문에 주변 사람의 운동법을 그대로 따라 하기보다 전문의료진의 안내를 우선해야 합니다.`

Reason: information may be valid, but the wording is indistinguishable from formal patient guidance when used throughout the post.

Another FAIL pattern:

- every heading ends in `~방법`, `~정리`, `~안내`
- every paragraph uses only `~합니다 / ~됩니다 / ~해야 합니다`
- only one playful sentence appears in an otherwise formal article

## PATIENT GUIDE contrast

Expected:

`목 움직임이 불편할 때는 먼저 통증이 심해지는 방향을 피하고, 편안한 범위에서 천천히 움직여 보세요. 움직임이 갑자기 제한됐거나 팔 저림처럼 다른 증상이 함께 나타난다면 스트레칭을 무리하게 이어가기보다 상태를 확인하는 것이 좋습니다.`

This should feel calmer and more instructional than PLAYFUL.

## Review rule

If PLAYFUL and PATIENT GUIDE could be swapped without the reader noticing a meaningful tone difference, style generation is not accepted.
