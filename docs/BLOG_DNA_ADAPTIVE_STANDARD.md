# Blog DNA + Adaptive Variation Standard

## Goal

Blotori must not reduce a reference blog to a single tone prompt. A saved reference style is treated as an editable **Blog DNA** consisting of voice, mood, structure, image rhythm, visual habits, and variation rules.

The goal is not to clone a post. The goal is to preserve recognizable editorial identity while adapting each new article to its own topic, evidence, photo inventory, and platform constraints.

## Profile layers

- **Voice**: endings, sentence/paragraph rhythm, transitions, lexical habits, emotional expression, reader distance, punctuation/emoticon habits, negative rules.
- **Mood**: warmth, energy, intimacy, information density, visual mood.
- **Structure**: opening/section/closing pattern families, fixed principles, flexible patterns, content balance.
- **Image rhythm**: cadence, grouping, semantic image roles, placement and redistribution rules.
- **Visual**: alignment, emphasis, whitespace, heading and decoration habits.
- **Variation**: identity fidelity and allowed freedom for structure, wording and image layout.

## Adaptive generation

A Blog DNA profile is not a fixed template.

Generation must:
1. keep high-identity habits recognizable;
2. choose among multiple observed opening, section and closing patterns;
3. map images by semantic role rather than slot number;
4. redistribute images when the current article has a different number or kind of images;
5. avoid copying distinctive source sentences;
6. avoid repeating the recent layout fingerprints generated with the same saved profile.

The client stores up to six recent layout fingerprints per saved profile and sends them with the next generation request.

## Confidence rule

URL analysis currently uses searchable public web evidence. If rendered layout, exact image placement or decoration cannot be verified, the analyzer must lower confidence and state the limitation. Medium/low-confidence visual rules are advisory and must not override content or platform naturalness.

Do not introduce arbitrary server-side URL fetching only to improve visual fidelity. A future rendered-browser capture path must use a controlled browser/sandbox and explicit SSRF protections.

## User controls

For a saved Blog DNA profile, the user can independently apply:
- voice
- mood
- structure
- image rhythm
- visual style

All are enabled by default. Disabling one dimension leaves the remaining DNA active.

## Compatibility

Existing v1 saved style records remain valid. They continue to use the legacy signature path when no structured Blog DNA exists. New analyzed styles store both the legacy summary signature and structured Blog DNA.
