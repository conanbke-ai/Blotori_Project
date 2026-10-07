# BlogChart Full Corpus V2 — Bias Guard

## Why V2 exists

V1 treated posts with fewer than 20 extracted text characters as failures.
That was acceptable for pure NLP evaluation but wrong for Blotori because a short-text post can still be highly informative for:
- image count and density;
- image grouping;
- text ↔ image transitions;
- first-image timing;
- alignment and whitespace;
- map/video/gallery usage;
- visual-first editorial rhythm.

This rule disproportionately excluded photo-first blogs and could bias category Blog DNA toward text-heavy posts.

## Eligibility model

Every successfully fetched post is classified independently across dimensions.

### textEligible

A post is text-eligible when extracted body text is at least 20 characters.

Text-eligible posts contribute to:
- ending-style ratios;
- sentence and paragraph length;
- punctuation, laugh and emoji rates;
- headings and text emphasis;
- hashtags and closing-text patterns;
- text-to-image ratios where a text denominator is meaningful.

### visualEligible

A post is visual-eligible when it contains at least one observable visual/layout component such as:
- image;
- image component;
- gallery;
- map;
- video.

Visual-eligible posts contribute to:
- image counts;
- image-run length/count;
- text ↔ image transitions;
- first-image timing;
- text components between image runs;
- centered layout behavior;
- gallery/map/video patterns.

### visualOnly

A post can be visual-eligible while not text-eligible.
These posts remain valid Visual DNA evidence and are no longer recorded as collection failures.

### textOnly

A post can be text-eligible without a visual component.
These posts remain valid Voice/Structure evidence without diluting image rhythm statistics.

### true failure

Only genuine collection/access failures count as failures, including:
- source HTTP errors after retries;
- blocked/private/not-open posts;
- irrecoverable fetch failures;
- irrecoverable parse failures.

Short text alone is not a failure.

## Separate statistical populations

V2 never forces one denominator across all dimensions.

- Voice/text distributions use only text-eligible posts.
- Image/layout distributions use only visual-eligible posts.
- Title/overall observation metrics can use all observable posts.
- Coverage explicitly records textEligible, visualEligible, visualOnly, textOnly, minimalObservable and unobservable counts.

This prevents visual-only posts from contaminating voice statistics and prevents text-only posts from suppressing visual rhythm statistics.

## Category-level anti-bias rules

Each ranked blog becomes one whole-blog profile before category clustering.
A blog with 20,000 posts therefore does not get 20x the category weight of a blog with 1,000 posts.

If the same source blog appears in multiple BlogChart themes that map into the same Blotori category, it is deduplicated by canonical source URL before clustering.
Its matched themes remain in provenance, but it contributes one source profile to the category.

## Preset evidence

Bias-corrected presets expose:
- observed success rate;
- text coverage rate;
- visual coverage rate;
- visual-only rate;
- actual access failures;
- source blog count;
- matched themes.

The app activates V2 only when:
- schemaVersion >= 2;
- source deduplication is certified;
- materialized presets are present.

Otherwise it falls back to the previous observed V1 library, then curated launch defaults.

## QA gates

V2 fails materialization if:
- 31 themes / 310 ranked slots are not represented;
- any ranked slot is missing from coverage;
- required Blog DNA dimensions are missing;
- coverage rates are invalid;
- true access-failure rate exceeds the guard threshold;
- source-deduplication certification is absent.

Synthetic regression additionally verifies:
- visual-only posts affect image statistics;
- visual-only posts do not affect voice endings;
- text-only posts affect voice but not visual distributions;
- short visual posts are not counted as true failures.

A real photography-blog regression is also run against a source that previously produced hundreds of EMPTY_OR_TOO_SHORT exclusions.

## Materialization

Workflow:
`.github/workflows/materialize-blog-corpus-v2.yml`

Certified post-processing:
`.github/workflows/certify-blog-corpus-v2.yml`

Production target:
`data/blog-corpus/category-blog-presets-v2.json`

Until a certified V2 is materialized, Blotori does not activate the V2 library.
