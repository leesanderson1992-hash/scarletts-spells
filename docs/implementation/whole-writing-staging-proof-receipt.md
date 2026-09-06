# Whole-writing staging proof — 6 September 2026

**PASS: disposable S1–S3 source-to-shadow proof, including Finish, reload,
returned-work resubmission, recovery and cleanup.** This does not complete the
whole roadmap or authorize production rollout or learning consequences.

## Deployment and database

- User explicitly authorized the four staging migrations and disposable proof.
- Supabase: `jlhotktspjvffslvuyfz`, PostgreSQL 17.6. No production database changes.
- Application commit: `36c4984` (`Add whole-writing capture and shadow evidence foundation`).
- Preview: <https://scarletts-spells-staged-nt8meegkg.vercel.app>
- Deployment: `dpl_FrpaG5DwZ5899MKNuhoT8uqZPgsP`, READY, staging Vercel project
  `prj_oJkffstOtacc4juYloXajHpjJUha`. No production promotion.
- Built from a clean detached worktree, excluding the existing uncommitted
  Context Resolver and authority proposals. Those files remain unmodified.

`scripts/apply-whole-writing-staging.mjs` applied the following in one bounded
transaction, including migration ledger entries and PostgREST schema reload:

| Migration | SHA-256 |
|---|---|
| `20260906100000_add_writing_shadow_capture.sql` | `6853e4937aac5b6433b98fd8a339bb70ffc5faca825a38a72713006601070258` |
| `20260906110000_add_whole_writing_occurrences.sql` | `ec972285cbf2e395c05f7f2e7be5fb8c1b552c7050d4a4ba5d93cefa9b70ffcd` |
| `20260906120000_add_reviewed_word_skill_publications.sql` | `6f996bc6cd1ee356fddbe3b018d28beca71a6c7b4498c00099b69fd35f936398` |
| `20260906130000_add_writing_shadow_health.sql` | `9d6d979a62b08c006daa0258676d13faf872dc989b5e8e484daf13c801f5f9b7` |

## Bounded defect corrected before deployment

The legacy structured-lesson capture builder trimmed ordinary text answers
before the action could preserve their raw draft. The form now transports a
separate raw answer-map payload through `lib/lessons/source-capture.ts` and the
action consumes it for immutable capture. Existing formatted review/submission
behaviour stays intact. The regression covers raw whitespace, nested values and
UTF-16 offsets after an emoji. Application typecheck, focused lint and the
whole-writing regression passed; the Preview build also passed typechecking.

## Executed proof

One synthetic child, two disposable parents, one course/module, a browser lesson
and a concurrent test fixture were used. Only this child's capture, processing,
extraction and identity-resolution controls were enabled. Skill-evidence shadow
projection stayed disabled. All content was synthetic.

1. Browser lesson submission reached **Submitted! Your work is saved** and
   remained read-only after reopening/reload.
2. The snapshot preserved leading/trailing whitespace, combining marks,
   contractions, hyphenated forms, nested table/interview answers and the saved
   task definition. The first word after the emoji retained UTF-16 offset 5.
3. Each snapshot produced 21 occurrences: short/repeated words and identical
   answers in different fields survived. Prompt/select values were excluded.
4. Exact staging dictionary identity resolved 16 occurrences per source without
   any taught-word/Target Word history. Five unresolved occurrences remained
   available for enrichment. All outcomes stayed `NOT_ASSESSED`,
   `PENDING_VERIFICATION` and `NOT_QUALIFIED`.
5. Two concurrent authenticated test-submission RPC calls with the same request
   ID returned one `created`, one `duplicate`, and one source snapshot.
6. The real Preview recovery endpoint processed the shadow work. Recovery was
   called only after verifying there were no pending/failed/processing legacy
   jobs belonging to other children. The test's ordinary job completed once;
   subsequent shadow recovery did not repeat it.
7. Replay enqueue was idempotent (1 then 0). A claimed replay was deliberately
   expired; recovery completed attempt 2. The stale lease could not publish, and
   all 21 original occurrence IDs stayed unchanged. A final recovery selected
   zero ordinary jobs and claimed zero shadow runs.
8. The owning parent could read the snapshot; the other authenticated parent
   could not. Parent execution of service-only claims was denied. Snapshot and
   completed-result updates were rejected even through the service client.
9. Parent **Send back to child** succeeded through the real review UI. The
   learner saw Returned, restored answers, and submitted again. Submitted status
   survived reload. The new submission received its own immutable snapshot;
   the original source remained intact.
10. A rolled-back SQL proof forced a fixture-scoped snapshot constraint failure.
    The save left no submission/job behind. With capture disabled, the same
    transaction could save successfully without a snapshot. All temporary
    fixture updates and the temporary constraint were rolled back.
11. Counts in `adle_learning_items`, both coin/bar ledgers,
    `adle_authentic_use_events` and `adle_review_schedule_words` matched the
    pre-proof baseline throughout and after cleanup.

The final durable proof state before cleanup was **3 submissions, 3 snapshots,
63 occurrences and 4 completed runs**, including the replay. The browser lesson
and returned lesson used the actual form/action; the concurrent test exercised
the authenticated RPC directly, not the separate test UI.

The staging verifier is `scripts/whole-writing-staging-proof.mjs`. Commands cover
setup, inspect, concurrent, recover, verify, replay, verify-replay,
transaction-proof and cleanup. It pins the staging database and Preview.
Credentials and raw source data belong in private ignored files, never this
receipt. A future deployment/proof must explicitly update the pinned Preview
and private fixture rather than accidentally testing an older build.

## Cleanup, rollback and limits

Both exact disposable parent accounts were deleted through the existing account
cascade after disabling capture/processing. The child, controls, all three
snapshots, 63 occurrences, interpretations and shadow runs were verified removed.
Private fixture credentials and the downloaded Preview environment file were
removed after cleanup. No cohort remains enabled. The four additive migrations remain installed in
staging; no destructive down migration was run. Rollback is the existing
default-off producer/consumer controls, not deletion of genuine learner history.

The approved roadmap and ADLE authorities retain their authority. This proof
does not verify S4 publication/admin workflow, mass-enrichment operations,
qualified S5 histories, contextual correctness, Authentic Use, Gold Bars,
proficiency calculations or retirement integration. No knowledge was published,
no historical authentic work was replayed, and no new learning consequence was
enabled. Owner gates G1–G5 remain unchanged. Continue with the S4/E1 governed
knowledge workflow and S5 longitudinal inspection; no new architecture exercise
is needed for those already-planned stages.
