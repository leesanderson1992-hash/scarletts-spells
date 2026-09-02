# Gold Bar GB.5 Production release plan

Date: 2026-09-01

Policy: `WORD_TREASURE_AUTHENTIC_USE_V2`

Status: **PLANNING AND READ-ONLY PREFLIGHT COMPLETE — HOLD**

This is a controlled release plan, not Production authorization. No Production
migration, deployment, environment change, activation, backfill, reward write,
commit, or push is authorized by this document.

## Release objective and protected boundary

GB.5 may make the already-approved GB.1–GB.4 reward consumer available in
Production for Review writing submitted on or after one prospective effective
timestamp. It must preserve all of these invariants:

- `required_uses_for_bar = 5` remains the reward threshold;
- Review evidence remains `REVIEW_WRITING_AUTHENTIC_USE`, prompted, and
  independently auditable from spontaneous parent-approved writing;
- no second parent approval is required;
- visible answers, repaired answers, invalid context, uncertain context, uses
  before Forge entry, and uses before the policy effective time do not credit;
- one canonical word can receive at most one credit per governed Review
  session, and retries/replays are idempotent;
- historical Review submissions are not reinterpreted or backfilled;
- qualification and reward persistence remains atomic;
- reward failure cannot roll back Review completion, outcomes, scheduling,
  reducers, specialist continuation, or proficiency state;
- no proficiency, final-rung retirement, Review-outcome, or C2B policy changes
  are part of GB.5.

## Verified current Production state

The guarded read-only audit ran against Supabase project
`wwohrqtunajrbwxyssjf` on 2026-09-01. The current Vercel Production deployment
is `dpl_5LcPVwRwhp7sVKGeybfxKMGG5tJX`, Ready at source baseline
`1a39e993b6908bf5e5bb4332fee58022557c4444`.

| Check | Result |
|---|---|
| GB migration `20260901160000` | Absent, as required before authorization |
| GB qualification table/RPC | Absent |
| Review-writing reward events | `0` |
| Production Gold Bar environment variables | Absent |
| Runtime Production gate | Hard-disabled in code |
| Treasure threshold distribution | All 76 rows require `5` uses |
| Existing prompted Review facts | 6 active; 0 malformed; 0 canonical conflicts |
| Historically post-Forge-like matches | 2; prospectively excluded |
| Protected DB fingerprints before/after audit | Identical |
| Fresh live C2B observation | 10/10 invariants passed; 0 alerts; no writes |

Two release prerequisites currently fail:

1. Production is missing governed ledger ancestry
   `20260901140000_add_adle_fr2_retirement_persistence.sql`.
2. GB.1–GB.4 exists only in a dirty local working tree, not an immutable merged
   commit or Preview deployment.

The missing FR2 migration is a ledger-order prerequisite. Applying it remains
its own controlled database action and must not be bundled silently into Gold
Bar activation.

The guarded verifier command is:

```text
npm run word-treasure:gb5-production-readiness-audit -- \
  --environment production \
  --expected-state pre-schema \
  --confirm-read-only GOLD-BAR-GB5-PRODUCTION-READ-ONLY:wwohrqtunajrbwxyssjf
```

After an independently authorized schema-dark release, use the same command
with `--expected-state post-schema-dark`. The verifier has no mutation mode and
rejects apply, write, migrate, deploy, activate, repair, push, environment, and
backfill flags.

## Controlled release sequence

### GB.5A — seal the candidate

Required before any environment work:

1. Review and merge the approved GB.1–GB.4 files as one identifiable source
   baseline. The working tree must be clean.
2. Record the commit SHA and SHA-256 of
   `20260901160000_add_gold_bar_review_writing_alignment.sql`.
3. Run the full GB/reward/Review/C2B regression set from that exact SHA.
4. Produce a Ready Preview deployment from that SHA while Production remains
   hard-disabled.

Stop if the deployment source SHA, migration hash, or working tree state is
ambiguous.

### GB.5B — staging schema and behavioural proof

This phase needs separate staging-write authorization. Use only the pinned
staging Supabase project `jlhotktspjvffslvuyfz` and a Preview deployment.

1. Verify the staging migration ledger. Apply required missing ancestry in
   timestamp order; never use a broad `supabase db push` or migration repair.
2. Apply only the reviewed GB migration after its ancestry is complete.
3. Verify the qualification table, immutable trigger, RLS policy, service-role
   RPC grant, source identities, and unchanged threshold default.
4. Enable the two non-Production controls only in Preview:
   `GOLD_BAR_REVIEW_WRITING_ENABLED=enabled` and a staging-only prospective
   `GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT`.
5. Prove the matrix below using governed test fixtures. Capture before/after
   reward, Review, schedule, transition, outcome, and proficiency fingerprints.
6. Disable the Preview gate after proof and remove test fixtures through the
   established staging cleanup process.

Required behavioural proof:

| Scenario | Expected reward result |
|---|---|
| Correct hidden-answer Review use after Forge/effective time | One credit |
| Same word three times in one writing task | One credit |
| Finalization replay, HTTP retry, or concurrent RPC retry | No additional credit |
| Word appears only in prompt/instructions/configuration | Ineligible |
| Misspelled then independently repaired | Ineligible under V2 |
| Correct only after direct scaffold/model | Ineligible |
| Valid supported homophone context | One credit |
| Invalid homophone context | Ineligible |
| Context validator uncertain/unsupported | Uncertain; no credit |
| Use before Forge entry or policy effective time | Ineligible |
| Treasure at use count 4 | Exactly one credit and one Gold Bar award |
| Reward persistence failure | Review/C2B completion stays committed |

### GB.5C — Production schema-dark release

Completed and verified on 2026-09-02. This phase did not activate the consumer.

1. Rerun the guarded pre-schema audit against the intended clean source SHA.
2. Resolve missing migration ancestry through its separately approved release.
3. Apply the single reviewed GB migration with an exact-file migration runner.
4. Rerun the audit with `--expected-state post-schema-dark`.
5. Require: target ledger row exactly `1`; qualification table and RPC present;
   qualification rows `0`; Review reward events `0`; threshold still `5`; and
   protected Review/C2B/reward facts unchanged.
6. The Production application remained hard-disabled.

The additive schema remains dormant and backward-compatible with the currently
deployed application. A destructive down migration is not part of rollback.

### GB.5D — explicit Production activation candidate

Implemented as an activation-capable candidate on 2026-09-02; it is not
Production-active. The former unconditional Production deny is replaced by a
three-key, fail-closed check:

1. code recognizes the exact release policy
   `WORD_TREASURE_AUTHENTIC_USE_V2`; and
2. Production configuration contains all of:
   - `GOLD_BAR_REVIEW_WRITING_ENABLED=enabled`;
   - `GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT=<prospective UTC instant>`;
   - `GOLD_BAR_REVIEW_WRITING_RELEASE_POLICY=`
     `WORD_TREASURE_AUTHENTIC_USE_V2`.

An invalid, absent, stale, or mismatched value must return no configuration.
The activation regression must prove that Preview controls cannot activate
Production and that Production controls cannot lower the effective timestamp
to reinterpret completed submissions.

The effective timestamp must be later than schema-dark verification and no
earlier than the Ready time of the activation deployment. It is immutable for
this policy version once the first qualification is recorded. The runtime uses
the first append-only qualification row as the durable effective-time authority
and fails before the reward RPC when later configuration differs. GB.5D sets a
schema-dark verification safety floor but does not select the GB.5E Production
effective timestamp.

### GB.5E — activation and observation

This phase needs a final written owner release authorization naming the source
SHA, deployment candidate, migration hash, and UTC effective timestamp.

1. Configure the three exact Production controls for the next deployment.
2. Deploy the approved activation SHA and verify the deployment is Ready before
   the effective timestamp.
3. Confirm zero qualification/reward rows with `occurred_at` before the
   effective timestamp.
4. Observe the first post-effective completed Review and every completion in
   the initial observation window.
5. Rerun the C2B read-only observation with the activation deployment identity.

Recommended exit criterion: at least three completed governed Review sessions
or seven calendar days, whichever is later, including at least one qualifying
Forge-word use if naturally produced. Do not manufacture learner evidence in
Production merely to satisfy the observation window.

## Post-activation invariants

The release verifier must report aggregates and immutable identifiers only.
It must establish:

- no Review qualification or reward occurrence predates the effective time;
- each eligible qualification has exactly one credited
  `authentic_correct_use_recorded` event;
- each credited event has exactly one eligible qualification;
- reward increments equal eligible inserted credits;
- no `(treasure_id, review_session_id)`, source-event, or encounter duplicate;
- a fifth use produces at most one `golden_bar_awarded` event;
- ineligible/uncertain rows have no credited reward event;
- no historical prompted-use fact was backfilled;
- no new parent approval fact was created;
- Review session, completion receipt, outcome, scheduler transition, and
  proficiency fingerprints are unaffected by reward qualification;
- application logs contain no unresolved
  `[gold-bar-review-writing] qualification failed` errors.

Because qualification runs downstream in `after()`, observation must also look
for completed post-effective Review sessions with a matching Forge-word source
fact but no qualification row. Any such gap is a release alert. Idempotent
replay may repair a transient miss, but no automatic backfill or mutating
reconciler is authorized by GB.5 planning.

## Stop/rollback policy

Immediately stop new credit if any of these occur:

- duplicate credit or duplicate Gold Bar award;
- pre-effective or pre-Forge credit;
- visible, repaired, invalid-context, or uncertain-context credit;
- threshold other than `5`;
- qualification/reward lineage mismatch;
- reward activity changes Review, C2B, final-rung, or proficiency facts;
- persistent missing qualifications or qualification errors.

Rollback is application-only and non-destructive:

1. set the Production enable/release controls to a disabled state;
2. deploy the last known hard-off source baseline;
3. verify no new Review reward events after the rollback boundary;
4. leave the additive table/RPC and immutable history in place;
5. do not decrement counters, delete ledger rows, revoke earned bars, repair the
   migration ledger, or replay historical sessions without a separate audited
   correction decision.

Suspect credited facts remain frozen for investigation. Any correction requires
a new append-only policy and explicit owner authorization.

## Current gate decision

**HOLD — schema-dark and activation-capable, but not Production-active.**

GB.5A–GB.5C are complete and GB.5D supplies the reviewed three-key candidate.
Production still has no Gold Bar controls and runs the previous hard-off
deployment. Only explicit GB.5E authorization may select the prospective
timestamp, configure Production, deploy the candidate, or begin observation.

## Owner decisions required before activation

1. Approve the exact GB.5D source SHA and intended Production deployment
   candidate.
2. Reconfirm the Gold Bar migration hash and exact Production release marker.
3. Select and approve a prospective UTC effective timestamp later than the
   activation deployment Ready time.
4. Approve the observation window and rollback triggers.
5. Issue separate written GB.5E activation authority.
