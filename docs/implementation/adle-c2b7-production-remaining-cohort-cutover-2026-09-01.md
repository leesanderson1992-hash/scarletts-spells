# ADLE C2B.7 Production remaining-cohort cutover receipt

Date: 2026-09-01
Production project: `wwohrqtunajrbwxyssjf`
Approval: `OWNER_APPROVAL_C2B7_PRODUCTION_REMAINING_COHORT_02_2026-09-01`

## Verdict

`C2B.7 COMPLETE — GUARDED PRODUCTION TARGET ROLLOUT VERIFIED`

The exact 17-row owner-approved cohort was cut over atomically through
`public.apply_adle_review_policy_cutover_c2b6(uuid,text,text,jsonb)`. No other
schedule, learner, registry flag, controlled receipt, schema, code deployment,
or learner-performance fact changed in this operation.

## Approval identity

```text
preview:   263278060f62e930be58681206d7b19e87dc4d69b205b5e06f3a55922b7219fa
receipt:   ffcb6f8d083373192feedccac43e8ba84d004c47b4afdff1f1a159105c7d6fd6
migration: a36c48a633b37bd66b56957c6437e7c175cb50162a66619d3f2b6607b061128d
learner:   e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e
maximum:   17
```

The fresh read-only preview was rerun immediately before mutation and retained
the exact approved fingerprint and candidate set. The guarded runner verified
the receipt and migration hashes before invoking the database authority.

## Atomic result

```json
{
  "status": "applied",
  "appliedCount": 17,
  "replayedCount": 0,
  "reviewedPreviewFingerprint": "263278060f62e930be58681206d7b19e87dc4d69b205b5e06f3a55922b7219fa"
}
```

Each approved row preserved membership `scheduled`, rung, due date, last
28-day fact and last-completion facts; changed only to the exact target
policy/state pair; initialized failure lineage to none; and advanced revision
once. Each received exactly one immutable `POLICY_CUTOVER_APPLIED` boundary
with its approved source fingerprint.

## Fresh read-only Production proof

| Fact | Before | After |
| --- | ---: | ---: |
| Schedule rows | 56 | 56 |
| Exact target-v2 rows | 1 | 18 |
| Transition events | 2 | 19 |
| This approval's ledger events | 0 | 17 |
| Controlled receipts | 0 | 0 |
| Target active | false | false |
| Target default | false | false |

Protected fingerprints:

```text
non-selected schedules before/after:
8742756efc0d9ca7848ba53b2aad977a1f896843ddcf9116e5088bb5ab1d4ee5

four explicitly excluded schedules before/after:
7c35bf6502e9b2ad60fa80e8920062a3755709822ab8b631c79ef2c9b6d2c689

policy before/after:
6caf8bd0e73b3dcd179f7b25afebebb88f8f40be1716edcf7b416429d110718b

controlled receipts before/after:
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

All 17 rows rehydrated through the C2B.3 target hydrator. A separate
repeatable-read, read-only R6 eligibility query found 10 target-v2 rows due as
of 2026-09-01; these are eligible through the already-deployed exact mixed-pin
path. The other target rows retain their future due dates. No assignment or
Review session was created by verification.

The post-cutover global read-only preview reports:

```text
target v2:       18
eligible v1:      3
owner review:    35
fingerprint:     27bd0c7d24ff0280e6ca88b58388b81cf2e9cde0b2745a9892675a256527c30b
```

The three remaining eligible v1 rows are the deliberately excluded words that
became eligible only after the canary Review. They were not cut over.

## Verification

- C2B.2–C2B.6 and canary hotfix regressions: PASS.
- Target reducer: PASS, 67 canonical transition classes.
- Scheduler simulation: PASS.
- Long-horizon simulation: PASS, 2,400 runs, fingerprint
  `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`.
- Current scheduler and Review R4/R5/R6: PASS.
- Phase B word-skill, Phase C learner evidence, current proficiency: PASS.
- Authority docs, script/application TypeScript, lint, Production build and
  `git diff --check`: PASS.

## Boundaries

Target remains inactive and non-default for new schedules. No legacy-bundle,
catch-up, reteach, final-rung or excluded word was converted. No proficiency,
reward, Word Treasure, UI, queue semantics or reducer changed. No deployment,
commit or push occurred in this cutover operation.
