# Targeted Writing Practice Preflight Seed Spec

## Status

- Status: `Complete`
- Closed on: `8 May 2026`
- Current relevance: historical implementation record
- Follow-on work: seed expansion and later workbook-derived extensions now live in the main MVP/runtime docs rather than this preflight spec

## Purpose

This document locks the preflight inputs for the first learning-items-first MVP implementation work.

Use it to define:
- the starter Domain 4 seed subset
- the assignable template set for early runtime
- the lexicon policy for spelling detection
- what is imported now, seeded but non-assignable, or deferred

This is the implementation-facing preflight spec for the seed layer.

Read this alongside:
- [docs/implementation/targeted-writing-practice-mvp-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-mvp-plan.md:1)
- [docs/pedagogy/mastery-domain-4-spelling.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/mastery-domain-4-spelling.md:1)
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)

Source workbook:
- `/Users/katiesanderson/Downloads/domain-4-mastery-node-seed-map.xlsx`

## Locked preflight decisions

These are now fixed for MVP preflight:

- use British spellings as canonical valid forms
- allow names as valid words
- allow brand words and project vocabulary where approved
- keep brand and project safe words child-specific or course-specific where possible
- stop the first import after the first `12-25` nodes
- use the safer first-cut subset of `15` assignable nodes
- seed morphology metadata now, but do not make morphology assignable in MVP 1
- use parent-confirmed positive evidence as part of later competency movement

## Assignable task templates for Levels 1-3

Use this as the first runtime-allowed template set.

### Level 1

- `T01` Recognition Sort
- `T02` Meaning / Rule Match

### Level 2

- `T03` Guided Error Correction
- `T04` Guided Rule Application

### Level 3

- `T05` Controlled Production
- `T06` Contrast Choice
- `T08` Error Correction Set

### Deferred from early runtime

- `T07` Sentence Context Choice
- `T09` Authentic Transfer Writing
- `T10` Proofreading Pass
- `T11` Delayed Mixed Review
- `T12` Reflection / Explanation

These may remain seeded as metadata or reference rows, but they are not part of the first assignable route set.

## Import now

Import these workbook layers now as the starter seed pack, using the smallest honest runtime shape:

- canonical runtime rows for:
  - `Skill Families`
  - `Skill Clusters`
  - the first 15 assignable `Micro-Skills`
- canonical runtime metadata on those 15 assignable catalog rows for:
  - `Word Bank`
  - `Prerequisites and Related Nodes` where both ends are inside the seeded subset
  - `Interleaving Groups` where they support the seeded subset
- machine-readable seed artifacts for:
  - the same 15 assignable micro-skills and their workbook-derived metadata
  - non-assignable morphology nodes that cannot yet become runtime catalog rows without inventing fake practice routes

Import scope remains restricted to the curated MVP subset below.

## Assignable MVP 1 subset

The first assignable subset is the first 15 nodes in workbook order.

### Families represented in assignable MVP 1

- `D4_PG` Phoneme-grapheme spelling

### Clusters represented in assignable MVP 1

- `D4_PG_CVC_SHORT_VOWELS`
- `D4_PG_CONSONANT_DIGRAPHS`

### Assignable node IDs

1. `D4_PG_CVC_SHORT_VOWELS_SHORT_A`
2. `D4_PG_CVC_SHORT_VOWELS_SHORT_E`
3. `D4_PG_CVC_SHORT_VOWELS_SHORT_I`
4. `D4_PG_CVC_SHORT_VOWELS_SHORT_O`
5. `D4_PG_CVC_SHORT_VOWELS_SHORT_U`
6. `D4_PG_CVC_SHORT_VOWELS_INITIAL_CONSONANT`
7. `D4_PG_CVC_SHORT_VOWELS_FINAL_CONSONANT`
8. `D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING`
9. `D4_PG_CVC_SHORT_VOWELS_VOWEL_DISCRIMINATION`
10. `D4_PG_CVC_SHORT_VOWELS_CHECK_VOWEL`
11. `D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL`
12. `D4_PG_CONSONANT_DIGRAPHS_CH_INITIAL_FINAL`
13. `D4_PG_CONSONANT_DIGRAPHS_TH_UNVOICED`
14. `D4_PG_CONSONANT_DIGRAPHS_TH_VOICED`
15. `D4_PG_CONSONANT_DIGRAPHS_WH_INITIAL`

### Seed the matching Word Bank rows now

Import only word-bank rows attached to these seeded node IDs in MVP 1. In the current runtime shape, these live as starter metadata on the seeded catalog rows and in the machine-readable seed artifacts.

### Seed the matching relationships now

Import only prerequisite and related-node rows where both ends of the relationship are inside the seeded subset. In the current runtime shape, these live as starter metadata on the seeded catalog rows and in the machine-readable seed artifacts.

## Seed now but non-assignable

These can exist in catalog/reference data without entering assignment selection:

- `D4_MOR` family metadata
- morphology clusters in canonical runtime tables
- morphology nodes in machine-readable seed artifacts only until the runtime catalog can represent non-assignable nodes without fabricated `practice_route` values
- Level 4 and Level 5 family-template mappings
- positive-evidence-compatible routes for later slices
- interleaving groups that touch deferred nodes only

This allows the repo to preserve taxonomy and future routing intent without overstating MVP 1 runtime breadth.

## Defer

Defer these from MVP 1 seed-driven runtime behavior:

- nodes after the first 15 assignable node IDs
- consonant blends and later clusters as assignable runtime content
- full morphology runtime
- full syllable-spelling runtime
- full common-pattern runtime
- broad cross-family interleaving logic
- multi-domain routing

## Lexicon policy

The detector and suggestion layer should use a tiered lexicon structure.

### Global layers

- British valid words
- known names
- core tricky words
- common misspelling pairs
- starter seeded word-bank words

### Scoped layers

- child-specific safe words
- course-specific safe words
- approved brand words
- approved project vocabulary

### Policy rules

- British spellings are the canonical valid forms in MVP
- names are allowed
- brand words are allowed only when explicitly approved in scoped safe-word layers where possible
- project vocabulary should be scoped to the relevant child or course where possible
- do not rely on one giant raw dictionary as the whole spelling-detection strategy
- preserve curated common-misspelling mappings and heuristics even if the valid-word list expands

## Positive evidence definitions required by runtime

These evidence types are now part of the preflight contract:

| Evidence type | Meaning | Competency signal |
|---|---|---|
| `authentic_correct_use` | correct use in real submitted work | Level 4 evidence |
| `delayed_authentic_correct_use` | correct use in real work after time delay | Level 5 evidence candidate |
| `repeated_correct_use` | correct use across multiple later submissions | strong Level 5 evidence candidate |
| `parent_confirmation` | parent confirms it was genuine independent use | allows meaningful competency update |

Rules:
- one correct authentic occurrence increases evidence
- repeated correct use over time supports retained mastery
- parent confirmation remains required before competency changes materially

## Seed artifact expectation

The repo should preserve this preflight subset in machine-readable starter seed artifacts before runtime code begins depending on it.

The starter manifest and related seed artifacts should record:
- families
- clusters
- assignable node IDs
- assignable node metadata, starter word banks, seeded relationships, and seeded interleaving groups
- non-assignable seeded families
- non-assignable morphology cluster metadata
- non-assignable morphology node metadata
- allowed templates for Levels 1-3
- lexicon policy flags

## Done when

Preflight seed work is complete when:
- the starter subset is frozen
- the assignable template set is frozen
- the lexicon policy is frozen
- positive evidence definitions are present in the relevant docs
- the repo has machine-readable starter seed artifacts for the first MVP subset
- the first 15 assignable runtime catalog rows carry honest workbook-derived starter metadata
- non-assignable morphology clusters are seeded in canonical runtime tables
- non-assignable morphology nodes are preserved in machine-readable seed artifacts rather than being forced into fake assignable runtime rows
