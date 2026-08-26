# Gate B2 complete — Review v3 remains inactive

Production: wwohrqtunajrbwxyssjf
Learner: e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e
Main/deployed SHA: 1f4e687157ab767faa88417e68b0953828f577e0
Exact approved package SHA256: 3ece7d4484b672c7f19b1f91870d4ad55bcdab01fd2fd5b83acbd5a374cf88b8
Cutover receipt: 805b845d-19df-451c-ace8-860a44e1dfa0
Approval receipt: 217f5fca-6e67-4644-8944-20422c70ed1f
Cutover receipt timestamp: 2026-08-26T13:34:57.117538+00:00
Independent read-only verification: 2026-08-26 13:35:04.441621+00
Idempotency key: gate-b2:e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e:20260826:v2
Cutover version: gate-b-e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e-20260826-v2

## Verified authority transition

| Measure | Before | After |
|---|---:|---:|
| Active schedule rows | 25 | 25 |
| Canonical words | 25 | 25 |
| Legacy-authoritative | 25 | 0 |
| Per-word-authoritative | 0 | 25 |
| Scheduled | 24 | 24 |
| Catch-up stage 1 | 1 | 1 |
| Catch-up stage 2 | 0 | 0 |
| Pre-retirement | 0 | 0 |
| Paused parent review | 0 | 0 |
| Overdue | 25 | 25 |
| Due today / future due | 0 / 0 | 0 / 0 |
| Ambiguity | 0 | 0 |

Exactly the approved four authority columns were initialized from existing bundle values on 25 existing schedule rows. Catch-up word_next_due_on remains NULL; its effective due date continues to come from its unchanged retest date. Every other raw schedule-row field, including updated_at, matched exactly. No schedule rows were inserted or deleted.

The transaction inserted one Gate B2 approval receipt, inserted one authority-cutover receipt, and updated this learner's existing rollout to cutover_complete. Its activated_at remains NULL; state_version is 1. Other learners' schedule rows and rollout rows were unchanged, including the excluded test learner. No Review sessions, encounters, outcomes, assignments or learner-history changes were made by this cutover.

## Hashes

Before native audit fingerprint:
6c7874f1a8f4be124226010f72dd30798a9239ff6c3b9413426a6769b2a8dacd

After native audit fingerprint:
918ed206b3f9b66bfd6ffc79425da98d2d65bff9cbcc062fc3bc15f7fa99c982

The new fingerprint exactly matches the authority-only projection computed before mutation. It changes because the authority fields and classifications changed.

Native protected-state digest — identical before/after:
ac9d632fdbadce5777739c1bfe4fbb87fa36708682c8218700c572c366821b6e

Supplemental gate_b_readonly_learner_history_preservation_v2 digest — identical before/after:
bb76e8e1dff2c10a6bbbc1fb0535820d89d2485ef66ce0d75f9be2945eb8ec36

The exact active row-ID and canonical-word-ID sets were compared before commit and independently after commit. Native protected objects were also compared word for word, and the entire 39-table supplemental manifest matched.

## Exact per-word scheduling parity

| Word | Preserved state / interval | Before effective due | After effective due | Protected state |
|---|---|---|---|---|
| careful | Scheduled; 1 day | 2026-08-13 | 2026-08-13 | Identical |
| colourful | Scheduled; 1 day | 2026-08-13 | 2026-08-13 | Identical |
| dishonest | Scheduled; 1 day | 2026-08-09 | 2026-08-09 | Identical |
| dislike | Scheduled; 1 day | 2026-08-21 | 2026-08-21 | Identical |
| football | Scheduled; 1 day | 2026-08-14 | 2026-08-14 | Identical |
| grandmother | Scheduled; 1 day | 2026-08-14 | 2026-08-14 | Identical |
| hoping | Catch-up 1; failure 2026-07-10 | 2026-07-11 | 2026-07-11 | Identical |
| impossible | Scheduled; 1 day | 2026-08-08 | 2026-08-08 | Identical |
| incorrect | Scheduled; 1 day | 2026-08-08 | 2026-08-08 | Identical |
| international | Scheduled; 1 day | 2026-08-06 | 2026-08-06 | Identical |
| invisible | Scheduled; 1 day | 2026-08-08 | 2026-08-08 | Identical |
| making | Scheduled; 3 days | 2026-07-13 | 2026-07-13 | Identical |
| mislead | Scheduled; 1 day | 2026-08-09 | 2026-08-09 | Identical |
| misplace | Scheduled; 1 day | 2026-08-21 | 2026-08-21 | Identical |
| mother-in-law | Scheduled; 1 day | 2026-08-15 | 2026-08-15 | Identical |
| preview | Scheduled; 1 day | 2026-08-07 | 2026-08-07 | Identical |
| rebuild | Scheduled; 1 day | 2026-08-07 | 2026-08-07 | Identical |
| replay | Scheduled; 1 day | 2026-08-07 | 2026-08-07 | Identical |
| subway | Scheduled; 1 day | 2026-08-06 | 2026-08-06 | Identical |
| superhero | Scheduled; 1 day | 2026-08-06 | 2026-08-06 | Identical |
| unkind | Scheduled; 1 day | 2026-08-10 | 2026-08-10 | Identical |
| unnatural | Scheduled; 1 day | 2026-08-10 | 2026-08-10 | Identical |
| unnecessary | Scheduled; 1 day | 2026-08-10 | 2026-08-10 | Identical |
| well-known | Scheduled; 1 day | 2026-08-15 | 2026-08-15 | Identical |
| writing | Scheduled; 3 days | 2026-07-13 | 2026-07-13 | Identical |

Making and writing remain at 3 days, due 2026-07-13. Hoping retains catch-up stage 1, failure anchor 2026-07-10 and retest date 2026-07-11; its underlying normal ladder index remains 1. No interval was restarted and no overdue date advanced.

## Learner-history preservation

The approved v2 projection retains semantic intake state and excludes only its five previously approved operational bookkeeping fields. The native scheduling protection was not weakened. All table-level counts and digests below matched before/after:

| Table / projection | Rows | Digest parity |
|---|---:|---|
| adle_assignment_attempt_event_routes | 16 | Identical |
| adle_assignment_attempt_events | 152 | Identical |
| adle_authentic_use_events | 352 | Identical |
| adle_base_word_family_pilot_runs | 3 | Identical |
| adle_base_word_transfer_miss_events | 0 | Identical |
| adle_canonical_intake_candidates | 27 | Identical |
| adle_child_learning_reflections | 9 | Identical |
| adle_learning_item_sources | 24 | Identical |
| adle_learning_items | 27 | Identical |
| adle_probe_runs | 0 | Identical |
| adle_review_bundles | 10 | Identical |
| adle_review_outcome_event_routes | 0 | Identical |
| adle_review_outcome_events | 3 | Identical |
| adle_review_schedule_word_routes | 22 | Identical |
| adle_slippage_events | 0 | Identical |
| adle_taught_word_history | 34 | Identical |
| assignment_items | 254 | Identical |
| child_gold_bar_ledger_events | 5 | Identical |
| child_gold_coin_ledger_events | 43 | Identical |
| child_word_treasure_events | 45 | Identical |
| child_word_treasure_evidence_candidates | 0 | Identical |
| child_word_treasures | 26 | Identical |
| daily_assignments | 72 | Identical |
| learning_item_evidence | 76 | Identical |
| learning_item_issue_links | 38 | Identical |
| learning_items | 21 | Identical |
| misspelling_instances | 309 | Identical |
| parent_verifications | 56 | Identical |
| parent_verified_spelling_candidate_mappings | 39 | Identical |
| practice_attempts | 0 | Identical |
| spelling_reward_events | 0 | Identical |
| spelling_reward_states | 0 | Identical |
| task_completions | 74 | Identical |
| task_submission_payloads | 264 | Identical |
| task_submissions | 264 | Identical |
| word_progress | 0 | Identical |
| writing_issue_correction_attempts | 61 | Identical |
| writing_issues | 64 | Identical |
| writing_samples | 272 | Identical |

## Release boundary

- Rollout: cutover_complete, not active; activated_at NULL.
- Review-v3 sessions: 0. Encounters: 0. Active learner rollouts: 0. Starter cutovers: 0.
- One authority cutover now exists, for this approved learner only.
- Legacy scheduling remains blocked by the enabled guards; no synchronization layer was added.
- Canonical-intake safety-sweep cron remains enabled on its existing five-minute schedule.
- Stale August 11 assignment bd6389be-d27a-48fd-b7a1-8a9fc1d4c03b remained unchanged.
- No new assignment, Review outcome, taught-history, evidence, Forge/Nugget, or source-lineage change.
- No activation, Gate C, R7, Phase E, deployment or migration was performed.

STOPPED after Gate B2 verification. No additional operation is authorized by this receipt.
