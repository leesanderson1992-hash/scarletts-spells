# Comparative ADLE migration-history audit — 2026-09-30

## Re-evaluation — 2026-10-02

The hosted dashboard lists were checked again on 2026-10-02. Staging remains at **118** applied versions, latest `20260929122000_add_canonical_word_only_releaser`. Production has advanced from 141 to **147** applied versions. Its six new versions are `20260929160000_add_disposable_context_bootstrap_and_faults`, `20260929170000_allow_standard_context_api_retention`, `20260929180000_allow_disposable_context_passage_proof`, `20261001100000_increase_context_request_cap`, `20261001110000_fix_contextual_learning_item_finalisation`, and `20261001120000_exclude_contextual_finalisation_from_spelling_trigger`.

Those six files were copied into this branch from `codex/context-main-integration`. Their local Git blobs match the source branch exactly, and their version/name pairs match the production dashboard. The first five also appear on `main`; the last fix is only on `codex/context-main-integration` among the inspected branches. Hosted SQL bodies were **not** hash-compared with the source files. No hosted migration, ledger repair, or database write was performed in this re-evaluation.

The active local directory now has **149** distinct migration versions. All 147 production-applied version/name pairs have corresponding local files; only the two unpublished comparative versions are locally pending in production. Staging now lacks **31** local versions: 29 already applied to production, plus the two comparative versions. Thus the staging divergence has widened by six, and a full-repository push remains unsafe. The six new contextual migrations require their own staging applicability and dependency decisions; the names containing “disposable” do not authorize replay or prove they are harmless.

The comparative SQL regression still passes on its isolated fixture schema. It does not establish that the comparative migrations will apply to the actual staging predecessor chain. The next safe work is a read-only schema/dependency comparison for the 31 staging-pending versions, followed by an exact migration plan; no blanket replay or ledger repair is justified by this inventory alone.

This is a read-only hosted-ledger audit plus local repository reconciliation. No hosted migration, repair, activation, or database write was performed. The operator has deferred credential rotation. Do not include connection secrets in this record.

## Verified version inventory

The Supabase dashboard migration lists showed 118 applied versions in staging and 141 in production. Before local reconciliation, the repository had 134 active migration versions: staging lacked 16 local versions; production lacked the two unpublished comparative versions and had nine applied contextual versions missing locally. The local comparative foundation had wrongly reused production version `20260929120000`, whose hosted name is `add_context_ai_cost_provenance`.

The two unpublished comparative files are now `20260930120000_add_comparative_superlative_adle_v1.sql` and `20260930121000_add_comparative_superlative_finish_v1.sql`. Their SQL content was not altered. The isolated comparative SQL regression passes with the new filenames. Neither hosted ledger has these versions.

Nine production-applied contextual migration files (`20260927120000` through `20260929150000`) were copied from the repository's `experiment/ai-context-benchmark` branch. Each local Git blob matches that branch's blob exactly. Their version/name pairs match the production dashboard. The dashboard's SQL body was not hash-compared with those files, so exact hosted-content equivalence remains a release preflight, not an established fact. The branch also has `20260929160000` and `20260929170000`; they were **not** imported because neither hosted ledger showed them.

After this local reconciliation, there are 143 distinct local versions; all 141 production-applied versions have matching local version/name pairs. Production has only the two unpublished comparative versions pending locally. Staging's 118 applied versions are a subset of the local version inventory, leaving 25 local versions unapplied there: 23 that production has already applied plus the two comparative versions. Names and ordering alone do not establish schema equivalence or make those 25 safe to replay.

## Staging divergence to classify individually

Twelve historical production-applied versions absent from staging:

| Version | Migration |
|---|---|
| `20260421` | `add_false_positive_to_misspelling_instances` |
| `20260707120000` | `fix_teaching_dictionary_display_word_data_quality` |
| `20260717153000` | `add_idempotent_course_task_submission` |
| `20260720090000` | `make_base_word_reflection_atomic` |
| `20260720100000` | `add_canonical_dictionary_dictation_sentences` |
| `20260721110000` | `allow_returned_task_resubmission_after_historical_pending` |
| `20260721140000` | `add_dynamic_prefix_dictionary_profiles` |
| `20260729130000` | `add_closed_compound_dictionary_profiles` |
| `20260729130100` | `allow_closed_compounds_18_item_plan` |
| `20260805070000` | `add_adle_canonical_intake_production_scheduler` |
| `20260829133000` | `retire_verified_adle_legacy_database_functions` |
| `20260902120000` | `integrate_adle_fr3_final_rung_runtime` |

Two contextual versions absent from staging: `20260924120000_add_global_contextual_advisory_review` and `20260924130000_add_parent_confirmed_contextual_learning_handoff`.

Nine further contextual versions absent from staging: `20260927120000_add_contextual_ai_advisory_boundary`, `20260927130000_add_context_feedback_evidence`, `20260928120000_correct_context_feedback_evidence`, `20260929100000_harden_context_shadow_lifecycle`, `20260929110000_add_context_shadow_governance_and_dispatch`, `20260929120000_add_context_ai_cost_provenance`, `20260929130000_add_context_shadow_operations`, `20260929140000_isolate_production_context_provider_proofs`, and `20260929150000_fix_context_digest_schema_qualification`.

The final two staging-pending versions are the unpublished comparative foundation and Finish migrations described above.

## Remaining gate

Do **not** run `supabase db push --include-all`, repair the ledger in bulk, or mark unapplied versions as applied without inspecting the actual hosted schema. For each historical and contextual version, determine whether staging intentionally omits it, already has equivalent schema through another route, or needs the exact forward migration. Compare the hosted SQL bodies against the local files, verify dependencies and effects against staging and production schemas, and record the decision and evidence. Keep the production-only scheduler and retirement migrations especially isolated from a blanket staging replay. Only then prepare an environment-specific dry run whose proposed changes are exactly the reviewed comparative release prerequisites. Publication and activation of comparative lessons remain separate gates.
