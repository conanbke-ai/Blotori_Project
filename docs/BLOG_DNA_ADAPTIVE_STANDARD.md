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

## Rendered evidence

URL analysis first attempts a guarded headless Chromium capture.

For a single post, Blotori records:
- rendered text blocks and heading order;
- computed alignment, font size/weight, margins and block dimensions;
- rendered image order, dimensions, vertical position and nearest surrounding text;
- frame count and the richest visible frame;
- a full-page JPEG screenshot when it remains within the capture size limit.

For a blog root, Blotori also discovers likely same-site post links and captures up to three additional content-rich pages. The analyzer then derives common patterns and variation instead of treating one post as the whole blog.

The rendered DOM summary and screenshots are passed to the analysis model together. Public web search remains a supplementary source for context.

## Network safety and confidence

The capture path accepts only HTTP/HTTPS, resolves requested and subresource hosts, and rejects localhost, private, link-local, documentation/test ranges, multicast and other special IP ranges before browser requests are allowed. Redirected requests are guarded by the same policy.

If Chromium cannot start, a page blocks automation, no stable post candidates are found, or visual evidence is incomplete, analysis falls back to searchable public web evidence and explicitly lowers confidence. Medium/low-confidence visual rules are advisory and must not override content or platform naturalness.

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
