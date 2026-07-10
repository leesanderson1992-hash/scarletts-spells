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

D4_MOR content is currently retained as draft authored source only.

## Theme And Experience Profile

Separate:

- `originThemeKey`: linguistic or origin cue such as neutral, latin, greek.
- `experienceProfileKey`: child-facing experience profile selected by content/configuration.

The frontend owns assets, animation, sound, layout, and scene implementation. Theme/profile keys must not become separate templates merely because they look different.
