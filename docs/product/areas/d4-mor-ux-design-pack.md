# D4_MOR Morphology UX Design Pack

## Status

Status: `approved D4_MOR category-v1 source package frozen for 7-UI-E; not activated`.

Source artifacts:

- `docs/implementation/seed-data/adle-7-ui/source-artifacts/2026-07-10-d4-mor/D4_MOR_template_design_pack.md`
- `docs/implementation/seed-data/adle-7-ui/source-artifacts/2026-07-10-d4-mor/D4_MOR_content_workbook_v1.xlsx`

The retained artifacts are draft source material, not runtime truth.

Generated category-v1 candidate artifacts:

- `docs/implementation/seed-data/adle-7-ui/generated/d4-mor-category-v1/`

The existing active D4_MOR teaching content remains current runtime truth. The
category-v1 generated artifacts are structurally reconciled candidates, and the
approved category-v1 source package is frozen separately at:

- `data/adle/approved/d4-mor/v1/d4-mor-v1-manifest.json`

The approved package is not activated, imported into Supabase, emitted by the
composer, or used by the child runtime. It does not become runtime truth until a
separate activation/content-selection PR.

Human approval record:

- `docs/implementation/seed-data/adle-7-ui/review/d4-mor-human-review-pack/d4-mor-human-approval-record-v1.json`

## Scope

D4_MOR has 24 active assignable micro-skills in the repository taxonomy across:

- base words;
- prefixes;
- suffixes;
- compounds;
- word families;
- roots.

The category matrix is:

- `docs/implementation/seed-data/adle-7-ui/control-matrix/d4-mor-experience-readiness-matrix.csv`

## Corrected Global Principle

Use this global wording:

> Keeper carries the core meaning.

Do not use `Keeper never changes` as a category-wide rule. Individual micro-skills teach whether spelling is preserved, changed, doubled, dropped, spaced, hyphenated, or shifted.

## Category Primitives

D4_MOR category primitives include:

- morpheme tiles;
- assembly rails;
- split handles;
- meaning flips;
- word-family displays;
- root artifact cards;
- morphology-aware post-submit feedback.

Shared mechanics include introduction, strip/build, meaning match, build word, controlled spelling, dictation, review, and probe framing.

7-UI-F adds the first reusable primitive layer: approved D4_MOR source records
can be adapted into small typed view models and rendered through shared
child-experience components, morphology tiles/sequences, assembly rails,
meaning flips, transformation views, post-submit diffs, gloss cards, root
artifact cards, word-family views, and a development-only preview route.

This is a visual/platform proof only. Rich manipulation verbs such as flippable
tiles, jigsaw tile shapes, pointer/touch dragging, magnetic snapping, split
handles, CoverShutter, BinSort, LessonGuide, and guided beat scripts remain
7-UI-G vertical runtime pilot work.

## Micro-skill Experience Profile

Each micro-skill receives:

- reviewed teaching content;
- intended template sequence;
- origin theme key;
- experience profile key;
- interaction variants;
- distractor policy;
- fallback readiness.

A micro-skill should not normally receive its own React component.

## Schema Edge Cases To Resolve

Before D4_MOR payload freeze, resolve:

- open compounds with spaces;
- hyphenated compounds;
- multiple roots or bases;
- linking vowels and connector letters;
- alternative root forms such as `meter/metre` and `scrib/script`;
- root aliases such as `phon` versus word-form `phone`;
- character split points around punctuation and separators;
- spelling transformations such as final-e deletion in `famous`;
- whether incidental bases need global gloss rows or local word metadata only.

## Reconciliation Findings

Workbook inspection found:

- 24/24 D4_MOR micro-skills covered.
- 168 word-bank rows, 7 per micro-skill.
- 24 distractor rows, 1 per micro-skill.
- Valid JSON in anchor and word-bank morpheme fields.
- 8 legacy split/concat issues requiring schema resolution before runtime
  payloads.

7-UI-C generated structurally reconciled candidate artifacts that resolve those
legacy issues as semantic source data:

- parts and joins/separators are authoritative;
- `splitPoints[]` is a derived view-model field, not source truth;
- open and hyphenated compounds use explicit `space`/`hyphen` joins;
- `fame + ous -> famous` is represented with `drop_final_e`;
- slash-delimited root aliases such as `scrib/script` and `meter/metre` are
  split into explicit candidate identities and variant relationships.

7-UI-D records human approval for all 24 D4_MOR micro-skills, all exception
review rows, and representative cluster spot checks. The generated candidates
remain separate from runtime truth and are not activated.

7-UI-E freezes the human-approved candidate plus approval record into the
approved D4_MOR category-v1 source package under `data/adle/approved/d4-mor/v1/`.
The package includes a runtime-neutral `D4_MOR_PREFIXES_UN` pilot source
fixture only; it does not define a final assignment payload or support-word
selection algorithm.

Detailed validation artifact:

- `docs/implementation/seed-data/adle-7-ui/validation/d4-mor-workbook-reconciliation-2026-07-10.json`
- `docs/implementation/seed-data/adle-7-ui/generated/d4-mor-category-v1/d4-mor-category-v1-summary.json`

## Rollout Groups

After `D4_MOR_PREFIXES_UN` vertical proof and category contract freeze:

1. Base-word skills.
2. Remaining prefix skills.
3. Suffix skills.
4. Compounds.
5. Word families.
6. Roots.

## Completion Rule

D4_MOR is not complete merely because tile components exist. Completion requires every D4_MOR micro-skill to have approved content, intended rich experience, safe fallback, preserved evidence/scheduler semantics, accessibility validation, and representative owner/child validation.
