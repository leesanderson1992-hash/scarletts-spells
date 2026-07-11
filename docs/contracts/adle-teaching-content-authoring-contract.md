# ADLE Teaching Content Authoring Contract

## Purpose

This contract defines how reviewed teaching content supports 7-UI without hard-coding lesson copy into React components.

## Ownership Layers

| Layer | Owns |
|---|---|
| Teaching content version | objective, child-facing explanation, rule explanation, misconceptions, progressions, example-selection policy, contrast policy, provenance, review status |
| Canonical word metadata | spelling, pronunciation, syllable, schwa, stress, morphemes, morphology notes, word-level facts |
| Reusable linguistic metadata | shared roots, affixes, glosses, origin notes, variant forms where reused across words |
| Composer | child-specific selection, semantic payload emission, fallback eligibility |
| Assignment payload | stable semantic snapshot needed by old assignments |
| Frontend | assets, layout, animation, sound, visual effects, scene implementation |

## Prohibited Patterns

Do not hard-code teaching copy into React components.
Do not create one prose document per micro-skill.
Do not duplicate static content into every assignment row unless snapshot stability requires it.
Do not treat draft workbooks as active runtime truth.

## Content Lifecycle

```text
authored source
-> reconciled with repo taxonomy and canonical truth
-> validated for schema and linguistic facts
-> reviewed and approved
-> versioned
-> activated
-> emitted as stable assignment payloads
```

D4_MOR retained workbook content remains source material. The generated
category-v1 candidate has separate human approval recorded, and the approved
category-v1 source package is frozen under `data/adle/approved/d4-mor/v1/`,
but neither artifact is activated runtime truth.

## D4_MOR 7-UI Candidate Boundary

The existing active D4_MOR teaching content remains current runtime truth. The
category-v1 candidate artifacts under
`docs/implementation/seed-data/adle-7-ui/generated/d4-mor-category-v1/` are
structurally reconciled candidates. Human approval is recorded separately, and
PR 7-UI-E freezes the approved source package at
`data/adle/approved/d4-mor/v1/`. The approved package does not replace or
supersede existing active generic teaching content and does not become runtime
truth until separately activated.

Human approval is recorded at:

- `docs/implementation/seed-data/adle-7-ui/review/d4-mor-human-review-pack/d4-mor-human-approval-record-v1.json`

Use this lifecycle terminology:

```text
retained authored source
-> structurally reconciled candidate
-> structurally validated candidate
-> human linguistic and pedagogical review
-> approved version
-> activated runtime truth
```

Automated transformation or validation is not human review, approval, or
activation.

Human approval still does not imply runtime activation. Activation requires a
separate versioning/content-selection change and must preserve assignment,
evidence, scheduler, and reward semantics.

## D4_MOR Approved Source Package Boundary

The approved D4_MOR category-v1 package is the canonical source package for
future D4_MOR payload and UI work:

- package manifest: `data/adle/approved/d4-mor/v1/d4-mor-v1-manifest.json`;
- package status: `human_approved`, `not_activated`, `runtimeEnabled = false`;
- pilot source fixture:
  `data/adle/approved/d4-mor/v1/d4-mor-prefixes-un-pilot-source-fixture.json`.

Future server-side content-selection work may consume this package in a
separate PR. Client renderers, the composer, Supabase imports, and assignment
payload emission must not consume it until a runtime activation PR explicitly
does that work.

## Theme And Experience Profile

Separate:

- `originThemeKey`: linguistic or origin cue such as neutral, latin, greek.
- `experienceProfileKey`: child-facing experience profile selected by content/configuration.

The frontend owns assets, animation, sound, layout, and scene implementation. Theme/profile keys must not become separate templates merely because they look different.

For D4_MOR category candidates, `microSkillKey` selects a category experience
manifest entry, which selects `experienceProfileKey` and template-variant
selections. `originThemeKey` remains linguistic/origin metadata and must stay
separate from visual asset or layout ownership.
