# BlogChart Full Corpus V1

## Goal

Build Blotori's launch-time category style library from real public blog behavior rather than invented templates.

The corpus is a one-time launch materialization source, not a runtime dependency and not a recurring ranking monitor.

## Seed

Source: BlogChart theme chart.

Validated seed gate:
- themes: 31
- ranked slots per theme: 10
- total ranked slots: 310

Every ranked blog keeps theme, rank, platform and source URL metadata.

## Coverage rule

For every ranked blog:
1. enumerate all publicly listable posts;
2. analyze every public post rather than sampling representative posts;
3. record blocked/private/not-open posts as failures instead of silently dropping them;
4. aggregate per-blog distributions and coverage;
5. cluster whole-blog profiles by Blotori category;
6. synthesize structured Blog DNA presets from observed clusters.

Naver enumeration uses PostTitleListAsync pagination until totalCount/list termination.
Non-Naver sources currently support Tistory sitemap enumeration and Aladin category pagination. Unsupported or blocked sources are recorded explicitly.

## Per-post evidence

The corpus extracts, where available:
- title length;
- text characters;
- sentence/paragraph counts and lengths;
- short paragraph rate;
- ending-style ratios (합니다체 / 해요체 / 죠·쥬 / 평서체 / 명사형);
- question, exclamation, ellipsis, ㅋㅋ/ㅎㅎ, ㅠㅠ/ㅜㅜ and emoji rates;
- image count and images per 1,000 characters;
- text ↔ image transition count;
- first-image entry timing;
- image run count and average/max image run length;
- text components between image runs;
- headings;
- bold/strong emphasis;
- centered/left aligned blocks;
- lists and quotes;
- maps and videos;
- hashtag count;
- closing paragraph length and hashtag-ending behavior.

## Whole-blog profile

Every blog artifact records:
- total listed posts;
- analyzed posts;
- failed posts;
- success rate;
- first/last dates where available;
- distribution summaries (mean, p25, median, p75, p90);
- voice totals;
- visual/structural totals;
- representative median-near posts;
- failure evidence;
- deterministic corpus digest.

## Pilot evidence

The Naver full-corpus pipeline was tested against `roooad`:
- total listed: 543
- analyzed: 543
- failed: 0
- success rate: 1.0
- fullCoverage: true

This validates that the implementation can exhaust an entire public Naver blog instead of sampling a few posts.

## Category synthesis

Whole-blog metrics are standardized and clustered into up to five category archetypes.
The synthesis stage converts those clusters into `BlogDNAProfile`-compatible presets containing:
- Voice
- Mood
- Structure
- Image Rhythm
- Visual
- Variation
- source member blogs/ranks/themes
- total listed/analyzed/failed coverage

The materialized output is:
- `data/blog-corpus/category-blog-presets-v1.json`
- `data/blog-corpus/coverage-v1.json`

Blotori prefers observed materialized presets for categories that have them and falls back to curated launch presets only while materialization is absent.

## Materialization workflow

Workflow: `.github/workflows/materialize-blog-corpus-v1.yml`

The workflow:
1. snapshots and validates 31 × TOP10;
2. runs theme corpus jobs in parallel;
3. exhausts Naver and supported non-Naver posts;
4. writes per-theme coverage;
5. clusters blog profiles;
6. synthesizes structured presets;
7. writes global coverage;
8. uploads artifacts;
9. persists the observed preset library to the feature branch.

Do not mark V1 corpus as fully materialized until the global coverage artifact and persisted data files are present.
