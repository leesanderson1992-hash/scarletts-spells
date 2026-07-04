# Version 3.0 Phase 5A: Curriculum Readiness Rules

## Purpose

Phase 5A turns the completed Phase 4 curriculum metadata audit into
decision-complete readiness rules for ADLE first-exposure teaching.

The key boundary remains:

```text
Canonical Truth answers: What is true about English?
Child Proficiency answers: What does this child currently know?
```

Curriculum readiness belongs to Canonical Truth. It decides whether reviewed
curriculum metadata is good enough for ADLE to teach, review, or skip a
micro-skill. It does not describe whether a child has learned the micro-skill.

Phase 5A is docs-only. It authorizes no migrations, imports, runtime generation,
assignment hooks, evidence writes, proficiency writes, or production data
mutation.

## Source context

Phase 4 is complete as a docs-only audit:

- `docs/implementation/version-3-phase-4-curriculum-metadata-inventory-audit.md`

Known current assets:

- 240 active assignable D4 micro-skills in the Domain 4 seed artifact.
- 88 word-bank rows and 99 word metadata rows in the local/dev word-map pilot.
- 40 diversity groups, 30 contrast pairs, 20 diagnostic examples, and 30 route
  support rows in the pilot workbook.
- Local/dev-only canonical word-map storage and import tooling.
- Contract boundaries that prevent word-map rows from becoming runtime,
  resolver, evidence, proficiency, reward, or assignment truth.

Known gaps:

- no production teaching dictionary schema
- no reviewed first-exposure teaching metadata
- no child-friendly explanation layer
- no accepted readiness implementation
- no every-word evidence/proficiency implementation
- no ADLE runtime consumer

## Readiness subject

The readiness subject is a reviewed curriculum content version for one
`micro_skill_key`.

Readiness is not attached directly to:

- a child
- a `learning_item`
- a single word-bank row
- a diagnostic misspelling row
- a resolver mapping
- an assignment item
- a reward state

Future storage may represent readiness as a table row, imported artifact row, or
versioned repo artifact. The consuming contract is the same: ADLE may only use
accepted readiness state and blocker vocabulary from this document.

## Accepted readiness states

Use exactly these readiness states:

| State | Meaning | First exposure? | Guided review? |
|---|---|---:|---:|
| `not_ready` | No meaningful curriculum metadata exists for this micro-skill version. | No | No |
| `content_gap` | Some metadata exists, but required content fields are missing or insufficient. | No | Maybe |
| `source_or_license_gap` | Content exists, but source, licence, attribution, or importability is unclear or unsuitable. | No | No |
| `needs_manual_review` | Required fields exist, but one or more required human reviews are missing or not passed. | No | Maybe |
| `ready_for_guided_review_only` | Reviewed reminder/practice content exists for use after prior teaching, but first-exposure teaching is incomplete. | No | Yes |
| `ready_for_first_exposure` | P0 first-exposure fields and required review gates are complete. | Yes | Yes |
| `rejected` | Content was reviewed and must not be used. | No | No |
| `superseded` | Content was replaced by a newer version and must not be selected for new composition. | No | No |

State precedence is fail-closed:

1. `rejected`
2. `superseded`
3. `source_or_license_gap`
4. `not_ready`
5. `content_gap`
6. `needs_manual_review`
7. `ready_for_guided_review_only`
8. `ready_for_first_exposure`

If several blockers exist, the report may list all blockers, but the visible
state should use the highest-priority failing state above.

## Exact blocker reasons

Readiness reports and future ADLE composer skip metadata must use these blocker
reasons. Route-local wording may explain a blocker to developers, but it must
map back to one of these values.

| Blocker | State family | Meaning |
|---|---|---|
| `missing_teaching_objective` | `content_gap` | No concise adult-facing objective defines what ADLE is teaching. |
| `missing_child_friendly_explanation` | `content_gap` | No child-facing explanation is available for first exposure. |
| `missing_rule_explanation` | `content_gap` | No rule, pattern, or noticing instruction explains what to do. |
| `missing_anchor_word` | `content_gap` | Legacy/fallback blocker only. Misspelling-driven lessons use the corrected approved word as the dynamic anchor at runtime. |
| `missing_ordered_example_words` | `content_gap` | No reviewed `support_example` words are available for the micro-skill. |
| `insufficient_ordered_example_words` | `content_gap` | Reviewed support words exist but do not meet the minimum for the chosen activity/progression. |
| `missing_first_exposure_progression` | `content_gap` | No approved/planned first-exposure activity progression is defined. |
| `missing_review_progression` | `content_gap` | No guided-review progression exists where guided review is claimed. |
| `missing_source` | `source_or_license_gap` | Source or authorship is absent. |
| `missing_licence` | `source_or_license_gap` | Licence or source-use note is absent. |
| `source_not_importable` | `source_or_license_gap` | Source terms, provenance, or format do not allow promotion/import. |
| `source_requires_legal_review` | `source_or_license_gap` | Source may be usable only after legal review. |
| `missing_confidence` | `needs_manual_review` | No confidence level is recorded for the field or content version. |
| `missing_review_status` | `needs_manual_review` | Required field-level review status is absent. |
| `needs_pedagogy_review` | `needs_manual_review` | Pedagogy review has not passed. |
| `needs_child_language_review` | `needs_manual_review` | Child-facing language review has not passed. |
| `needs_british_english_review` | `needs_manual_review` | British English spelling/pronunciation review has not passed where relevant. |
| `needs_accessibility_review` | `needs_manual_review` | Accessibility/dyslexia-friendly review has not passed. |
| `needs_legal_review` | `source_or_license_gap` | Legal/source-use review has not passed. |
| `unreviewed_ai_generated_content` | `needs_manual_review` | AI-generated draft content has not been manually approved. |
| `copyrighted_reference_only_content` | `source_or_license_gap` | Content may be used for reference during review but not imported or surfaced. |
| `unsupported_activity_key` | `content_gap` | A progression references an activity not accepted by the Instructional Activity Registry plan. |
| `unsupported_practice_route` | `content_gap` | A progression references a route not supported for this micro-skill/content shape. |

No blocker may imply child proficiency. For example,
`missing_ordered_example_words` means canonical teaching content is incomplete;
it does not mean the child is unable to spell those words.

## Field tiers

### P0 first-exposure fields

A content version can become `ready_for_first_exposure` only when these fields
exist, meet quality rules, and pass required review gates:

| Field | Required treatment | Blocking reason if missing or inadequate |
|---|---|---|
| `teaching_objective` | Required for every first exposure. | `missing_teaching_objective` |
| `child_friendly_explanation` | Required for every first exposure. | `missing_child_friendly_explanation` |
| `rule_explanation` | Required adult-facing rule, pattern, or noticing explanation for every first exposure. This is teacher/parent-readable rule support, not a parent-guidance feature. | `missing_rule_explanation` |
| `common_misconceptions` | Required misconception/trap description for reviewable teaching content. | `missing_rule_explanation` |
| reviewed support words | Required for every first exposure. The corrected approved word supplied by the importer/resolver may become the dynamic lesson anchor at runtime. | `missing_ordered_example_words` or `insufficient_ordered_example_words` |
| `first_exposure_progression` | Required for every first exposure. | `missing_first_exposure_progression`, `unsupported_activity_key`, or `unsupported_practice_route` |
| `guided_practice_progression` | Required for promoted content so ADLE can move from supported practice toward independence. | `missing_review_progression` |
| `example_selection_guidance` | Required policy for selecting examples from approved support rows and metadata. It must not hard-code ordered examples. | `missing_ordered_example_words` |
| `source` | Required for every promoted field, including internal authorship. | `missing_source` |
| `licence` or `source_use_note` | Required for every promoted field, including internally authored content. | `missing_licence` |
| `confidence` | Required for every promoted field. | `missing_confidence` |
| field-level `review_status` | Required for every P0 field. | `missing_review_status` and relevant review blockers |

Minimum P0 quality rules:

- The child-facing explanation must be child-safe, specific, and short enough
  for a lesson.
- The rule explanation must describe what the child should notice or do.
- Reviewed support words must be age-appropriate, dialect-appropriate, and linked to the target micro-skill.
- Runtime ordering should be calculated from metadata such as difficulty, frequency, complexity, route, and review context rather than manually authored as Teaching Dictionary truth.
- `sample_preview_word_key`, when present, is only an admin-review illustration
  and must not be treated as a fixed runtime anchor or readiness requirement.
- The first-exposure progression must reference only accepted or explicitly
  planned Instructional Activity Registry concepts.
- Source/licence status must be explicit even for internally authored content.
- Review status must be field-aware, not just row-aware.

### P1 family-dependent fields

P1 fields are required only for micro-skill families where absence would make
the teaching unsafe, confusing, or too weak for the intended route.

| Field | Required when | Advisory when | Blocker |
|---|---|---|---|
| `memory_tip` or `mnemonic` | The rule is arbitrary, irregular, easily confused, or relies on recall support. | The rule is transparent and directly observable. | `missing_child_friendly_explanation` if the lesson depends on it and no alternative support exists. |
| `contrast_words` | Homophones, confusable graphemes, near-neighbour spellings, common reversal/confusion patterns, or contrast activities. For `D4_HOM`, the other reviewed `support_example` words in the same micro-skill count as the homophone contrast pair/set. | Simple CVC, transparent short-vowel, or single-pattern exposure. | `insufficient_ordered_example_words` or `unsupported_practice_route`, depending on route. |
| `common_misconceptions` | Known trap patterns, irregulars, morphology shifts, suffix/drop/keep/change rules, and any content using guided error correction. | Very simple recognition-only review. | `missing_rule_explanation` if misconception handling is necessary for first exposure. |
| `review_proofreading_progression` | Any content claiming `ready_for_guided_review_only` or `ready_for_first_exposure` plus guided review support. | First-exposure-only planning before review routes are enabled. | `missing_review_progression` |
| `contrast_policy_guidance` | Homophones, confusables, grapheme choices, or routes where contrast is allowed or required. For homophone pair/set micro-skills, guidance should describe how to introduce the same-micro-skill support words as contrasts. | Transparent single-pattern teaching where contrast may overload the learner. | `insufficient_ordered_example_words` or `unsupported_practice_route`, depending on route. |
| `phoneme`, `stress`, or `schwa` metadata | Pronunciation, schwa, stress, syllable, or phoneme-grapheme teaching families. | Orthographic-only patterns where pronunciation metadata is not used. | `missing_rule_explanation` if the rule depends on it. |
| `morphology` metadata | Prefix, suffix, root, word-family, inflection, derivation, or morphemic spelling families. | Non-morphology spelling patterns. | `missing_rule_explanation` if the rule depends on it. |

Phase 5B may refine family names and machine-readable applicability rules, but
it must preserve this principle: P1 fields become blockers only when the
micro-skill family or activity route depends on them.

### P2 advisory fields

P2 fields support selection, reporting, tuning, and better practice quality.
They do not block first exposure by themselves:

- `frequency`
- `age_band`
- `complexity_band`
- `diversity_group`
- `word_class`
- `dialect_notes`
- `route_support_notes`
- `diagnostic_example_notes`

If a P2 field is used to justify a P0 decision, that decision must be reviewed
through the relevant P0/P1 field instead of letting the advisory field carry
readiness.

### P3 future fields

P3 fields are future enrichment and must not block readiness in Phase 5A:

- analytics tuning labels
- model-generated sequencing suggestions
- extended decodability metrics
- rich audio metadata
- school-year curriculum crosswalks
- A/B testing tags
- UI display variants

P3 fields may be collected as draft metadata later, but they must not affect
ADLE readiness or child-facing teaching until promoted through a later accepted
contract update.

## Guided review versus first exposure

`ready_for_guided_review_only` is allowed when ADLE can safely remind or
practice a micro-skill that has already been taught elsewhere, but cannot teach
it from scratch.

Guided review requires:

- reviewed support examples, plus contrast or review examples where the route
  requires them. For `D4_HOM`, two or more reviewed support examples in the
  same homophone micro-skill satisfy the contrast set requirement.
- reviewed short reminder or reviewed rule cue
- reviewed `guided_practice_progression` and
  `review_proofreading_progression`
- explicit source/licence/confidence
- field-level review statuses for the fields being surfaced

Guided review does not require:

- full child-friendly first-exposure explanation
- full first-exposure progression
- complete misconception teaching
- complete contrast set, unless the route uses contrast

First exposure requires all P0 first-exposure fields and review gates. ADLE must
not upgrade guided-review-only content into first exposure through generated
copy, generic fallback words, or route-local explanations.

## Review-status vocabulary

Use this field-level review-status vocabulary:

| Status | Meaning | Child-facing use |
|---|---|---:|
| `draft` | Authored but not ready for review. | No |
| `ai_draft` | AI-generated or AI-assisted content awaiting manual review. | No |
| `in_review` | Human review started but not complete. | No |
| `changes_requested` | Review found issues that must be fixed. | No |
| `approved_for_guided_review` | Field may be surfaced only in reminder/practice contexts. | Guided review only |
| `approved_for_first_exposure` | Field may be surfaced in first-exposure teaching. | Yes |
| `rejected` | Field must not be used. | No |
| `superseded` | Field was replaced by a newer version. | No |

Row-level status may summarize the content version, but readiness must be
calculated from field-level statuses.

AI-generated content may only be `ai_draft`, `in_review`,
`changes_requested`, `rejected`, `superseded`, or manually promoted to an
approved status. It must never be treated as approved merely because generation
succeeded.

## Review gates

Required field-level gates:

| Gate | Required for first exposure | Required for guided review |
|---|---:|---:|
| source/licence review | Yes | Yes |
| pedagogy review | Yes | For surfaced rule/reminder fields |
| child-facing language review | Yes | For surfaced child-facing text |
| British English review | Yes where spelling, dialect, pronunciation, or examples can vary | Yes where surfaced content can vary |
| accessibility/dyslexia-friendly review | Yes | For surfaced child-facing text and practice routes |
| final readiness review | Yes | Yes |

Human approval is required before:

- child-facing explanations become first-exposure truth
- word-to-micro-skill mappings become canonical teaching truth
- misspelling patterns inform canonical teaching metadata
- generated metadata is promoted from draft to reviewed content
- British English spelling or pronunciation decisions affect readiness

## Source and licence requirements

Every promoted field must carry source/use lineage.

Accepted source categories:

- `internal_authored`
- `internal_reviewed_seed`
- `public_domain`
- `open_licensed`
- `licensed_vendor`
- `reference_only`
- `ai_assisted_draft`

Rules:

- Internally authored content still needs `source` and `licence` or
  `source_use_note`.
- `reference_only` content may guide human review but must not be imported or
  surfaced to children as final copy.
- `ai_assisted_draft` content must remain draft until manually reviewed.
- Any unclear source must block with `missing_source`, `missing_licence`,
  `source_requires_legal_review`, `needs_legal_review`, or
  `source_not_importable`.

## Manual-review workflow

The accepted workflow is:

1. Draft metadata is created or imported into a non-runtime review surface.
2. Source/licence lineage is recorded before content review.
3. Field-level review statuses are assigned for P0/P1 fields.
4. Reviewers check pedagogy, child-facing language, British English,
   accessibility/dyslexia friendliness, and legal/source suitability.
5. Changes are requested or fields are approved for guided review or first
   exposure.
6. A final readiness review calculates state and blockers for the content
   version.
7. Only accepted readiness states may be consumed by a future ADLE composer.

Reviewer identity, timestamp, version, and review notes are required design
inputs for Phase 5B, but Phase 5A does not define storage.

## Readiness report shape

Future validators, import dry-runs, and ADLE diagnostics should report this
shape, whether as JSON, table output, or a database view:

```text
micro_skill_key
content_version
readiness_state
first_exposure_allowed
guided_review_allowed
blockers[]
warnings[]
p0_field_statuses[]
p1_field_statuses[]
p2_field_statuses[]
source_summary
licence_summary
review_summary
activity_progression_summary
supersedes_content_version
generated_at
```

Each blocker entry should include:

```text
blocker_reason
field_key
severity
review_gate
message
```

Severity values:

- `blocking_first_exposure`
- `blocking_guided_review`
- `advisory`

Warnings may describe advisory P2/P3 gaps, weak confidence, sparse examples
above the route minimum, or future improvement opportunities. Warnings must not
secretly block readiness.

## Mapping to future ADLE skip/readiness statuses

Future ADLE composer skip reasons must map from Phase 5A readiness state and
blockers rather than inventing route-local readiness vocabulary.

| Phase 5A state/blocker | Future composer skip/readiness status |
|---|---|
| `not_ready` | `missing_curriculum_readiness` |
| `content_gap` | `missing_teaching_metadata` |
| `source_or_license_gap` | `missing_curriculum_readiness` |
| `needs_manual_review` | `missing_curriculum_readiness` |
| `ready_for_guided_review_only` during `INTRODUCTION_REQUIRED` | `missing_teaching_metadata` |
| `ready_for_guided_review_only` during review/guided practice | no readiness skip |
| `ready_for_first_exposure` | no readiness skip |
| `rejected` | `missing_curriculum_readiness` |
| `superseded` | `missing_curriculum_readiness` |
| `unsupported_activity_key` | `missing_activity_strategy` |
| `unsupported_practice_route` | `unsupported_practice_route` |
| `missing_ordered_example_words` or `insufficient_ordered_example_words` | `missing_required_words` |

Composer output may include both the coarse composer skip reason and the exact
Phase 5A blocker list for diagnostics.

## Storage and import boundaries for Phase 5B

Phase 5B may design storage and import expansion only after this Phase 5A rule
set is accepted.

Phase 5B may design:

- `canonical_words`
- `canonical_word_metadata`
- `micro_skill_word_support`
- misspelling diagnosis remains outside the Teaching Dictionary CSV review pass and is owned by the existing bulk seed importer/resolver path
- curriculum-readiness tables or artifacts
- validator expansion
- dry-run import reports
- local/dev-only schema migration plan

Phase 5B must preserve:

- no production import by default
- no hosted Supabase mutation
- no assignment-generation hooks
- no resolver behavior changes
- no evidence/proficiency writes
- no automatic canonical promotion
- no generated content promoted without manual review

## Acceptance criteria

Phase 5A is complete when this document defines:

- exact readiness states
- exact blocker reasons
- P0/P1/P2/P3 field treatment
- first-exposure versus guided-review-only distinction
- source/licence review requirements
- manual-review workflow
- readiness report format
- explicit mapping to future ADLE skip/readiness statuses
- explicit non-goals

## Explicit non-goals

Phase 5A does not authorize:

- runtime generation
- assignment-generation hooks
- production import
- hosted Supabase mutation
- migrations
- validator implementation
- schema creation
- resolver changes
- evidence writes
- proficiency scoring writes
- Word Treasure behavior changes
- automatic canonical promotion
- invented teaching content as final truth
- treating taxonomy existence as curriculum readiness
