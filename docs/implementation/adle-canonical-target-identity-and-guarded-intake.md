# ADLE canonical target identity and guarded intake

Status: implementation record. Verify deployment and activation state from the
current migration ledger and release evidence; this document does not establish
environment activation.

## Runtime contract

- `adle_learning_items.canonical_word_id` is the canonical teaching target.
- The item micro-skill is the catalogued error route. Runtime never derives a key from explanatory wording.
- `adle_learning_item_sources` preserves every parent-verified spelling source attached to the active child + word + skill item.
- One active schedule word is shared across routes. `adle_review_schedule_word_routes` is mandatory when more than one active route exists.
- Attempt and outcome route tables attribute one word event to every linked route without duplicating evidence or rewards.
- The newest attached route controls activation; the strictest linked production requirement controls the production task.

## Readiness and failure behavior

The intake resolver returns one eligible identity or a named blocker. It requires an approved candidate, one assignment-approved canonical target, an active assignable Domain 4 catalog skill, exact approved non-contrast support, signed-off content, a production-enabled route, route-specific content, and child-band eligibility.

Missing exact-target content blocks Part 2. A same-skill support word is never substituted for the learner's canonical target. A multi-route schedule without explicit links also fails closed.

## Guarded rollout

1. Apply `20260722180000_add_adle_canonical_intake_and_shared_routes.sql` locally or to staging.
2. Keep `ADLE_CANONICAL_INTAKE_ENABLED=disabled`.
3. Run `npm run adle:canonical-intake-audit` with staging credentials. This is read-only.
4. Run `npm run adle:shared-route-reconcile` with staging credentials. The default is a dry run.
5. Apply linkage only with `npm run adle:shared-route-reconcile -- --apply APPLY_ADLE_SHARED_ROUTE_LINKS_TO_STAGING`.
6. Re-run the audit and `npm run adle:canonical-intake-regression`.
7. Enable intake in staging and prove parent approval, lesson ordering, shared review, evidence attribution, and idempotent replay.

Production migration, production reconciliation, and production feature activation are three separate confirmation points. The 1,000-word `in_review` batch remains ineligible and is not imported by this work.

## Local integrity proof — 2026-07-22

- Applied the additive migration twice successfully against local Supabase, proving repeat-safe DDL.
- Supabase schema lint reports no issue in the new intake or identity-guard functions. Four unrelated pre-existing unused-variable warnings remain elsewhere.
- Transactional RPC proof: first intake created one child + word + skill item and one lineage row; replay returned the same item without duplication. The fixture transaction was rolled back.
- Route-identity trigger proof rejected a deliberately mismatched schedule-word/learning-item link. The fixture transaction was rolled back.
- Reconciliation dry run proposed three links for three existing local single-route schedules. Local apply wrote those links; the immediate replay proposed zero.
- The read-only audit completed with intake disabled. The local snapshot contains no candidate mappings, so it reported zero eligible and zero `in_review` candidates.

The initial isolated proof found the local migration chain blocked at `20260721120000_add_base_word_final_y_transformations.sql`, whose reviewed transformation set was absent from this snapshot. The follow-on proof below reconciled that local-only boundary without editing the historical migration.

## Shared Base Word Lab completion proof — 2026-07-22

- Confirmed the historical final-y migration had zero eligible local rows, applied only its additive column/constraint, and repaired that version in the local ledger. All later migrations now apply normally; no hosted ledger or database was touched.
- Added `complete_adle_base_word_family_pilot_v2`. It retains V1's exact 18-item, reflection, attempt and transfer boundary while superseding and relinking the one active canonical-word schedule inside the same transaction.
- Proved two opaque local-only fixture relationships converging on one canonical target through `D4_MOR_BASE_WORDS_PRESERVE_BASE` and `D4_MOR_BASE_WORDS_IDENTIFY_BASE`.
- The second lesson retained two learning items, superseded the earlier schedule, created one active schedule with two route links, and emitted one `reactivated_for_new_skill` event attributed to both routes.
- One shared review attempt and one outcome were each attributed to both routes. Idempotent completion replay returned `already_completed` without schedule drift.
- The proof ran inside a rolled-back transaction against a dedicated temporary child. Protected table counts were unchanged and fixture residue was zero. The non-sensitive receipt is written to `outputs/adle-playing-shared-routes-proof/local-proof-receipt.json`.
- Local `ADLE_CANONICAL_INTAKE_ENABLED` is enabled. The Base Word Lab allowlist was not broadened. The post-proof audit reports zero candidate mappings, zero unresolved multi-skill words, and zero schedules needing linkage; reconciliation proposes zero writes.

The 1,000-word `in_review` batch remains unimported and no production or hosted staging mutation is authorised by this proof.
