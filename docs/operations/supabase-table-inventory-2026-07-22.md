# Supabase Production Table Inventory — 2026-07-22

## Purpose

This document is the durable index of the current Scarlett's Spells production
Supabase tables. It exists to support a later, separately authorised schema
cleanup without confusing an empty table with an obsolete table.

This is an evidence record and cleanup-planning input. It does not authorise:

- production writes or deletes
- dropping tables, columns, constraints, policies, functions, or data
- applying or repairing migrations
- running `supabase db push`
- abandoning a contracted but not-yet-populated subsystem

Re-run the inventory immediately before planning or performing cleanup. Row
counts and runtime dependencies can change after this snapshot.

## Snapshot basis

- Environment: hosted production Supabase
- Inspected: `2026-07-22`, read-only
- Scope: `public` schema base tables
- Production base-table count: `89`
- Evidence used: exact production row counts, application `.from(...)` calls,
  runtime RPC calls and table dependencies, operational scripts, active and
  archived migrations, and current product contracts
- Repository state: the working tree already contained unrelated uncommitted
  work; this inventory did not modify product code or Supabase

## Status vocabulary

| Status | Meaning | Cleanup implication |
|---|---|---|
| `current` | Used by the product runtime or an active operational/admin pipeline. | Do not remove. |
| `ready-empty` | Implemented and wired, but contains no production rows at this snapshot. | Empty is not deletion evidence. |
| `dormant` | Scaffolded and unpopulated, so it has no current effective data use. | Requires an explicit retain/abandon product decision. |
| `legacy-compatibility` | Superseded but still read or represented in compatibility code. | Remove code dependencies before schema cleanup. |
| `legacy-historical` | No current runtime writer/use, but historical rows or foreign-key dependencies remain. | Export and dependency proof required. |
| `obsolete` | No runtime use and no production data; a replacement is established. | Strong cleanup candidate, still requiring dependency proof. |

## Cleanup candidate register

This register is ordered by investigation priority, not by permission to
delete.

### Priority A — strongest retirement candidates

| Table | Rows | Classification | Known blockers and required proof |
|---|---:|---|---|
| `word_progress` | 0 | `obsolete` | `practice_attempts.word_progress_id` and `writing_issues.linked_word_progress_id` have inbound foreign keys. Prove both columns contain no required historical references, remove compatibility schema deliberately, and verify all RPC/function bodies before dropping. |
| `practice_attempts` | 0 | `legacy-compatibility` | Dashboard and Insights still read it. Remove or replace those reads and verify no dynamic/RPC writer before dropping. |
| `word_families` | 55 | `legacy-historical` | `daily_assignments.word_family_id`, `misspelling_instances.word_family_id`, and `word_progress.word_family_id` reference it. Export the 55 rows, classify every non-null reference, and migrate or null legacy references before removal. |
| `child_gold_bar_ledger_events` | 5 | `legacy-historical` | Old sync helper remains in `lib/rewards/ledger.ts`, although no current caller was found. Preserve/export ledger history and remove the helper before cleanup. |
| `spelling_reward_events` | 0 | `legacy-compatibility` | Current reward read model still reads it as compatibility input. Remove the compatibility query and prove Word Treasure covers every supported display/reward path. |
| `spelling_reward_states` | 0 | `legacy-compatibility` | Current read model and gold-bar conversion action still reference it. Remove compatibility/conversion paths and verify no historical hosted rows appear before cleanup. |

An archived migration already intended to drop `word_progress`, but production
still contains it. Treat production reality as authoritative and do not replay
that archived migration:
`supabase/migrations_archive/pre_baseline_2026_05/20260510_phase5_final_destructive_cleanup.sql`.

### Priority B — dormant subsystem, hold for product decision

The seven canonical spelling word-map tables are all empty. Some current
writing-engine loaders already query them, and
`docs/contracts/canonical-spelling-word-map-contract.md` defines the intended
subsystem. They are not legacy merely because the production import has not
happened.

| Table | Rows | Intended role |
|---|---:|---|
| `canonical_spelling_word_map_import_batches` | 0 | Import provenance and lifecycle. |
| `canonical_spelling_word_metadata` | 0 | Word-level spelling metadata. |
| `canonical_spelling_word_map_diversity_groups` | 0 | Practice-selection diversity groups. |
| `canonical_spelling_word_map_words` | 0 | Curated word banks by micro-skill. |
| `canonical_spelling_word_map_contrast_pairs` | 0 | Instructional contrast pairs. |
| `canonical_spelling_word_map_diagnostic_examples` | 0 | Diagnostic misspelling examples. |
| `canonical_spelling_word_map_route_support` | 0 | Supported teaching and practice routes. |

Do not remove these tables unless the canonical word-map contract is formally
retired or replaced. If abandoned, remove runtime loaders, import scripts,
tests, migrations, and contract references as one reviewed slice.

## Complete production inventory

### ADLE learning system

| Table | Rows | Status | Current use |
|---|---:|---|---|
| `adle_activity_templates` | 32 | `current` | Activity catalog used by the daily lesson composer. |
| `adle_assignment_attempt_events` | 4 | `current` | Immutable child-attempt evidence from ADLE assignments. |
| `adle_authentic_use_events` | 60 | `current` | Authentic spelling-use evidence emitted from reviewed writing. |
| `adle_base_word_family_pilot_runs` | 0 | `ready-empty` | Guards and tracks base-word-family pilot runs. |
| `adle_base_word_transfer_miss_events` | 0 | `ready-empty` | Records first transfer misses through base-word completion RPCs. |
| `adle_evidence_policy_versions` | 1 | `current` | Governance registry mirroring the active evidence-policy constants. |
| `adle_family_methods` | 8 | `current` | Maps skill families to permitted teaching methods. |
| `adle_learning_items` | 3 | `current` | ADLE child word-learning, pause, and reteach state. |
| `adle_probe_runs` | 0 | `ready-empty` | Diagnostic probe-run records. |
| `adle_review_bundles` | 1 | `current` | Groups scheduled reviews into forward-moving bundles. |
| `adle_review_outcome_events` | 3 | `current` | Immutable scheduled-review outcomes. |
| `adle_review_policy_versions` | 1 | `current` | Review-scheduling policy versions. |
| `adle_review_schedule_words` | 3 | `current` | Per-child word review schedule and paused-word state. |
| `adle_slippage_events` | 0 | `ready-empty` | Later mistakes on previously secure words. |
| `adle_taught_word_history` | 3 | `current` | History of taught and exposed words. |

### Canonical teaching dictionary

| Table | Rows | Status | Current use |
|---|---:|---|---|
| `canonical_teaching_dictionary_banding_overrides` | 0 | `ready-empty` | Optional human overrides to calculated word bands. |
| `canonical_teaching_dictionary_banding_versions` | 1 | `current` | Active banding methodology/version. |
| `canonical_teaching_dictionary_base_word_families` | 87 | `current` | Approved base-word family definitions used by morphology runtime. |
| `canonical_teaching_dictionary_base_word_family_members` | 227 | `current` | Canonical words bound to base-word families and teaching roles. |
| `canonical_teaching_dictionary_content_versions` | 240 | `current` | Versioned teaching explanations and progressions by micro-skill. |
| `canonical_teaching_dictionary_dictation_sentences` | 878 | `current` | Approved per-word dictation sentence content. |
| `canonical_teaching_dictionary_field_reviews` | 2,640 | `current` | Operational field-level human-review evidence. |
| `canonical_teaching_dictionary_import_batches` | 5 | `current` | Import provenance and release history. |
| `canonical_teaching_dictionary_readiness_reports` | 240 | `current` | Readiness results and blockers for content versions. |
| `canonical_teaching_dictionary_skill_level_allocation` | 370 | `current` | Teaching skills allocated across difficulty levels. |
| `canonical_teaching_dictionary_sources` | 21 | `current` | Source, licence, and provenance records. |
| `canonical_teaching_dictionary_word_banding` | 875 | `current` | Calculated word difficulty/banding. |
| `canonical_teaching_dictionary_word_metadata` | 875 | `current` | Morphology and teaching metadata used by the composer. |
| `canonical_teaching_dictionary_word_support` | 991 | `current` | Word-to-micro-skill support and teaching eligibility. |
| `canonical_teaching_dictionary_words` | 878 | `current` | Canonical teaching-word identity and display data. |

### Canonical spelling word map

| Table | Rows | Status | Current use |
|---|---:|---|---|
| `canonical_spelling_word_map_import_batches` | 0 | `dormant` | Unpopulated import provenance. |
| `canonical_spelling_word_metadata` | 0 | `dormant` | Unpopulated spelling metadata. |
| `canonical_spelling_word_map_diversity_groups` | 0 | `dormant` | Unpopulated diversity-group catalog. |
| `canonical_spelling_word_map_words` | 0 | `dormant` | Unpopulated curated word banks. |
| `canonical_spelling_word_map_contrast_pairs` | 0 | `dormant` | Unpopulated instructional contrast pairs. |
| `canonical_spelling_word_map_diagnostic_examples` | 0 | `dormant` | Unpopulated diagnostic examples. |
| `canonical_spelling_word_map_route_support` | 0 | `dormant` | Unpopulated route support. |

### Courses, assignments, and submissions

| Table | Rows | Status | Current use |
|---|---:|---|---|
| `assignment_items` | 24 | `current` | Ordered items bound to daily spelling and ADLE assignments. |
| `children` | 13 | `current` | Child profiles and parent ownership. |
| `course_checkpoints` | 1 | `current` | Dated course milestones. |
| `course_goal_task_sources` | 0 | `ready-empty` | Generated-task provenance back to course goals. |
| `course_goals` | 0 | `ready-empty` | Course-level goal authoring. |
| `course_modules` | 37 | `current` | Structural course modules. |
| `course_phases` | 21 | `current` | Dated phases within courses. |
| `course_tasks` | 73 | `current` | Authored lessons, assignments, tests, and writing tasks. |
| `courses` | 14 | `current` | Top-level course records. |
| `daily_assignments` | 50 | `current` | Transitional delivery header for writing-practice and ADLE work. |
| `focus_blocks` | 0 | `ready-empty` | Optional course planning/focus-block structure. |
| `personal_lesson_templates` | 3 | `current` | Parent-owned reusable structured lesson templates. |
| `task_completions` | 70 | `current` | Course-task completion state. |
| `task_day_plans` | 21 | `current` | Tasks mapped to individual planned days. |
| `task_submission_drafts` | 14 | `current` | Autosaved work before submission. |
| `task_submission_payloads` | 261 | `current` | Structured lesson and writing response payloads. |
| `task_submission_processing_jobs` | 1 | `current` | Idempotent submission-processing state. |
| `task_submissions` | 333 | `current` | Submitted task responses and review state. |
| `task_week_selections` | 22 | `current` | Week-level task scheduling selections. |

`daily_assignments` remains active but is explicitly transitional runtime debt;
canonical targeted-writing truth lives in `writing_issues`,
`writing_issue_correction_attempts`, and `learning_items`.

### Writing engine and review

| Table | Rows | Status | Current use |
|---|---:|---|---|
| `learning_item_evidence` | 24 | `current` | Evidence contributing to learning-item progression. |
| `learning_item_issue_links` | 12 | `current` | Links learning items to their reviewed writing issues. |
| `learning_items` | 12 | `current` | Canonical targeted-writing learning state. |
| `micro_skill_catalog` | 240 | `current` | Canonical spelling, punctuation, and morphology skill catalog. |
| `micro_skill_clusters` | 47 | `current` | Related micro-skill groups. |
| `micro_skill_families` | 8 | `current` | Highest-level skill-family groups. |
| `misspelling_instances` | 434 | `current` | Detected spelling observations from writing samples. |
| `parent_verifications` | 26 | `current` | Parent decisions confirming or rejecting suggested issues. |
| `parent_verified_spelling_candidate_mappings` | 10 | `current` | Parent-local candidate spelling-to-skill mappings. |
| `returned_correction_replay_recommendations` | 0 | `ready-empty` | Deferred replay recommendations for returned corrections. |
| `spelling_canonical_mapping_events` | 490 | `current` | Audit log for canonical mapping changes. |
| `spelling_canonical_mapping_recommendations` | 9 | `current` | Candidate mappings awaiting admin curation. |
| `spelling_canonical_mappings` | 190 | `current` | Curated canonical mappings used by the resolver. |
| `spelling_catalog_review_case_decisions` | 18 | `current` | Decisions on catalog review cases. |
| `spelling_catalog_review_cases` | 22 | `current` | Catalog-quality work items. |
| `spelling_seed_import_batches` | 1 | `current` | Seed-import provenance. |
| `spelling_seed_import_rows` | 191 | `current` | Reviewable import candidates, not canonical truth until adopted. |
| `writing_false_positive_suppressions` | 5 | `current` | Suppresses known false-positive suggestions. |
| `writing_issue_correction_attempts` | 46 | `current` | Child responses to returned writing corrections. |
| `writing_issue_suggestions` | 2 | `current` | Machine-generated issues awaiting disposition. |
| `writing_issues` | 51 | `current` | Parent-reviewed canonical writing issues. |
| `writing_samples` | 319 | `current` | Authentic submitted writing and analysis state. |

### Rewards and Word Treasure

| Table | Rows | Status | Current use |
|---|---:|---|---|
| `child_gold_coin_ledger_events` | 36 | `current` | Authoritative append-only coin ledger. |
| `child_word_treasures` | 3 | `current` | Canonical child Word Treasure state. |
| `child_word_treasure_events` | 3 | `current` | Immutable Word Treasure lifecycle events. |
| `child_word_treasure_evidence_candidates` | 0 | `ready-empty` | Authentic-writing evidence awaiting Treasure qualification. |
| `gold_coin_transfer_requests` | 1 | `current` | Parent-managed coin redemption/transfer workflow. |
| `child_gold_bar_ledger_events` | 5 | `legacy-historical` | Superseded gold-bar ledger. |
| `spelling_reward_events` | 0 | `legacy-compatibility` | Superseded by Word Treasure events, still read for compatibility. |
| `spelling_reward_states` | 0 | `legacy-compatibility` | Superseded by Word Treasures, still used by compatibility code. |

### Other legacy tables

| Table | Rows | Status | Current use |
|---|---:|---|---|
| `practice_attempts` | 0 | `legacy-compatibility` | Dashboard/Insights read-only compatibility; no current writer found. |
| `word_families` | 55 | `legacy-historical` | Old word-family catalog retained through historical foreign keys. |
| `word_progress` | 0 | `obsolete` | Replaced by learning items, evidence, schedules, and reward state. |

## Production migration drift

These locally declared or referenced tables were absent from production at the
snapshot and are not part of the 89-table count:

| Missing table | Intended use | Local source |
|---|---|---|
| `adle_child_learning_reflections` | Private child reflection attached to an ADLE assignment. | `supabase/migrations/20260714170000_add_adle_child_learning_reflections.sql` |
| `canonical_teaching_dictionary_prefix_profiles` | Data-driven morphology-prefix lesson profiles. | `supabase/migrations/20260721140000_add_dynamic_prefix_dictionary_profiles.sql` |
| `canonical_teaching_dictionary_prefix_members` | Canonical words and teaching metadata belonging to prefix profiles. | `supabase/migrations/20260721140000_add_dynamic_prefix_dictionary_profiles.sql` |

Later base-word completion SQL expects the reflection table, and the in-progress
dynamic-prefix runtime queries the prefix tables. Reconcile migration reality
before treating either path as production-ready. Follow
`docs/operations/supabase-migration-policy.md`; this inventory does not
authorise applying the missing migrations.

## Required pre-cleanup proof

Before approving any destructive cleanup slice:

1. Re-run exact hosted row counts and catalog the table owners, RLS, grants,
   policies, triggers, indexes, constraints, inbound/outbound foreign keys,
   views, functions, and RPC bodies.
2. Search application runtime, scripts, tests, documentation, migrations, and
   generated artifacts for exact table references.
3. Identify dynamic table-name usage and server-side SQL dependencies that a
   literal `.from(...)` search cannot see.
4. Export material historical rows and record a recovery location and hash.
5. Remove or migrate product dependencies in a non-destructive slice first.
6. Prove local rebuild and staging behavior under the migration policy.
7. Use a unique forward migration with an explicit rollback/recovery plan.
8. Re-run protected-table counts and end-to-end product checks after cleanup.
9. Update this inventory with the migration version, decision record, and new
   production count. Move retired table entries to a dated cleanup history;
   do not silently erase them from the record.

## Suggested retirement order

If separately approved after proof, the likely dependency order is:

1. Remove dashboard and Insights reads of `practice_attempts`.
2. Remove reward compatibility reads/actions and the unused legacy gold-bar
   helper.
3. Export the legacy reward and word-family records.
4. Remove obsolete inbound foreign-key columns/references deliberately.
5. Drop `practice_attempts`, then `word_progress`, then `word_families` only
   after their remaining dependencies are zero.
6. Drop legacy reward tables only after Word Treasure and coin-ledger parity is
   verified.
7. Leave the canonical spelling word-map subsystem untouched unless a product
   decision retires its contract.

## Related authority

- `docs/operations/supabase-migration-policy.md`
- `docs/operations/supabase-baseline-reconciliation-plan.md`
- `docs/contracts/canonical-spelling-word-map-contract.md`
- `docs/contracts/reward-system-contract.md`
- `docs/contracts/targeted-writing-practice-contract.md`
- `docs/architecture/targeted-writing-practice-architecture.md`
- `lib/writing-practice/types.ts`
- `lib/rewards/read-model.ts`
