# Blotori Design Standard

## 1. Identity

Blotori is the TORI Family blog editor / recorder character and product identity.

- Role: blog editor, recorder, visual story composer
- Personality: organized, friendly, expressive
- Core phrase: `글과 이미지를 엮어, 이야기를 완성해요.`
- Product promise: turn a topic and a few conditions into a platform-appropriate post structure, visual emphasis plan, and image guide.

## 2. TORI MASTER fixed rules

Blotori must keep the common TORI MASTER identity.

Fixed:

- white rabbit base
- common face structure and proportions
- long upright ears and pink inner ears
- rounded paws / feet
- small nose and soft cheek volume
- fluffy round tail
- same cute, polished, soft-shaded TORI family rendering direction

Variable only by project role:

- iris color
- outfit color / detail
- equipment / props
- project accent colors
- pose and expression

Do not redraw the master body into a different rabbit style, change facial proportions, shorten ears, humanize hands/feet, or replace the family rendering direction.

## 3. Blotori character direction

### Theme

`EDITOR / RECORDER / STORY COMPOSER`

### Palette

- Blotori Sky: `#69C7D5`
- Blotori Teal: `#2D8FA0`
- Blotori Navy: `#315B7A`
- Blotori Coral: `#FF8B72`
- Blotori Cream: `#FFF9F2`
- Warm Paper: `#FFFDF9`

Avoid dominant green (Nongtori), detective navy/beige as the only palette (Mystori), and lavender/purple dominance (Untori).

### Character props

Preferred:

- small editor notebook or thin tablet
- pen / stylus
- small image-card or page-card motif
- compact crossbody editor pouch

Do not use Mystori's magnifying glass or detective cap as Blotori's primary identity.

### Outfit direction

- light cream editor jacket / cardigan or short utility vest
- sky/teal piping
- small coral accent button, ribbon tab, or bookmark detail
- neat, compact silhouette; no oversized sleeves
- simple pouch for note cards / stylus

### Eye direction

- teal-aqua family distinct from Nongtori green
- glossy TORI MASTER eye rendering maintained

## 4. UI visual language

The Blotori product UI should inherit TORI Family brand language rather than generic SaaS dashboard styling.

### Surface

- warm white / cream background
- rounded panels (18–24px)
- thin sky/teal borders
- soft shadows
- small paw motifs used as decorative accents, not noise
- Korean-first readable typography with small English support labels

### Interaction

- minimum 44px interactive targets
- hover/focus states must be visible
- reduced-motion friendly
- settings, preview, and image-guide regions may scroll independently on desktop
- mobile collapses to a single-column app flow
- long preview should not force the short settings form to grow to the same height
- TOP / BOTTOM navigation stays available for long content

### Composer hierarchy

1. brand/header strip
2. input/settings rail
3. actual post preview as the primary visual area
4. image prompt / placement guide rail
5. compact floating navigation

The preview must visually dominate. Settings and image guides are support tools and may be collapsed.

## 5. Content presentation

Blotori does not output plain text only. The generation result may contain presentation metadata which the platform renderer interprets.

Allowed presentation decisions:

- title / short intro center alignment when appropriate
- bold emphasis
- project accent emphasis
- highlight marker treatment
- key-point card
- callout card
- quote section
- image-first emphasis when text decoration is inferior

Rules:

- do not center-align long explanatory paragraphs
- do not emphasize more than necessary
- emphasis phrases must exist in the real generated paragraph
- presentation cannot violate the selected platform's native conventions
- image positions are semantic slots, not arbitrary decoration

## 6. Platform behavior

Platform choice must materially change both generation and export behavior.

- Naver: short mobile-friendly paragraphs, native-editor-friendly plain structure, images inserted separately using IMG slots, tags kept separate from body
- Tistory: H2/H3-friendly information hierarchy and rich/HTML-oriented export
- Blogger: conventional H2/H3 web-document flow, labels separate
- WordPress: Gutenberg-friendly modular sections and block-oriented export
- Brunchstory: fewer headings, longer narrative rhythm, limited informational card clutter
- Other: generic portable structure unless user provides a platform-specific rule

## 7. Asset policy

Do not invent a new TORI base asset in CSS/SVG and call it the standard character.

Until an approved Blotori character sheet / cutout is available in the repository, use the Blotori wordmark + paw motif in product UI. Once an approved asset exists, consume that shared canonical asset rather than re-drawing per screen.

## 8. Visual QA

Code completion is not visual acceptance.

Required before final UI PASS:

- desktop rendered screenshot review
- tablet / narrow desktop review
- mobile review
- hover/focus states
- long-content scrolling
- settings collapse / guide collapse
- TOP / BOTTOM controls
- preview vs edit mode
- representative Naver and WordPress content samples

Actual rendered UI outranks static design intent when judging spacing, density, clipping, or hierarchy.
