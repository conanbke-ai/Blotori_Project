# Blotori Character Canonical Lock

## Status

`APPROVED / CANONICAL / LOCKED`

The user-approved Blotori character standard sheet is the canonical visual reference for Blotori character generation and product branding.

## Canonical identity

- Character: `Blotori / 블로토리`
- Role: Blog Editor / Recorder / Story Composer
- Approval date: `2026-09-10`
- Canonical SHA-256: `4cfcdea79ce5b074afbbba589a200a7ff1711cac8c5805439ff4dccd7395643a`
- Canonical Library path: `/TORI_STANDARDS/BLOTORI/BLOTORI_CHARACTER_STANDARD_CANONICAL.png`
- Canonical Library file id: `file_00000000fdbc8208b81daca482403c0c`

## Fixed character elements

Use the approved sheet exactly as the visual baseline.

- TORI MASTER white-rabbit body and face proportions
- long upright ears with pink inner ears
- large aqua-teal eyes
- cream editor outfit with sky/teal piping
- coral accent details
- teal editor pouch
- notebook/tablet + pen/stylus + image-card editor props
- clean, warm, polished semi-3D TORI Family rendering direction

## Prohibited substitutions

Do not replace the canonical with a newly generated "similar" sheet without explicit user approval.

Do not drift into:

- Mystori detective hat / magnifying-glass identity
- Nongtori agriculture / dominant green identity
- Untori lavender / fortune-teller identity
- a different rabbit face, body proportion, ear length, hand/foot anatomy, or rendering style

## UI crop rule

UI assets may crop the canonical character, but they must preserve the original character pixels and remove any sheet/background residue. Header/app icons must use a transparent crop with intentional breathing room; they must not be an opaque square screenshot. Hero/loading character assets must not include disconnected alpha debris, artificial gray/blue halos, or transforms that clip ears/body.

The 2026-09-16 UI correction uses a transparent full-character crop, a tighter transparent face icon crop, and explicit visible-size loading rules; visual acceptance still requires rendered screenshot review rather than asset/CI success alone.

## Change procedure

Any future canonical replacement requires all of the following:

1. explicit user approval of the replacement image,
2. new canonical hash,
3. update of this lock file,
4. update of `docs/BLOTORI_DESIGN_STANDARD.md`,
5. update of the common TORI character registry in `conanbke-ai/Tori_Common_Project`,
6. overlap check against every currently registered TORI character.

Pose/expression/crop variations may be derived from the canonical as long as the fixed identity does not change.
