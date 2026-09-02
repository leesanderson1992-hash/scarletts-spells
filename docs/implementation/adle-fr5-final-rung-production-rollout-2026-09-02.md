# ADLE FR.5 — final-rung Production schema/runtime rollout

Status: deployed; first governed final-rung canary pending

Date: 2026-09-02

## Authority and boundary

FR.5 deployed the already-approved FR.1–FR.4 final-rung architecture. It did
not change retirement or scheduler policy:

```text
C2B.1 target scheduler
  -> FINAL_RUNG_DELEGATED
  -> FR.1 ADLE_FINAL_RUNG_RETIREMENT_V1
  -> FR.2 CAS persistence and immutable receipt
  -> FR.3 mixed Review runtime integration
  -> FR.4 receipt-backed projection and read-only observation
```

Target execution remains pinned-policy/state-shape based. The target policy is
still inactive and non-default, and normal new-schedule creation remains on
the current v1 policy.

## Owner approvals

The owner separately approved:

1. applying the exact FR.2 and FR.3 Production migrations, in order; and
2. fast-forwarding `main` and deploying exact release commit
   `398dbdb1d1084859de04ebe3214cc47bc03ea180`.

No approval was given for additional learner cutover, policy/default changes,
retired-word reactivation, unrelated migration, or unrelated deployment.

## Production schema

Production project:

```text
wwohrqtunajrbwxyssjf
```

FR.2 was already present exactly once when the governed FR.5 preflight ran. It
was not reapplied. Its ledger identity, schema, constraints, RLS, grants and
service-only mutation authority were freshly verified:

```text
20260901140000_add_adle_fr2_retirement_persistence.sql
SHA-256: 915f86a4461e27e6496a1512bc2f8e44aab8c10db1ee07e719a6f10fedd31bd2
```

FR.3 was then applied exactly once:

```text
20260902120000_integrate_adle_fr3_final_rung_runtime.sql
SHA-256: 92aa3a065d6c79c2df591f53984d879a210bddeed5949e227aceeeccac474ab3
```

The committed FR.3 transaction proved:

- the FR.2 predecessor was present exactly once;
- mixed assignment/finalization functions are `SECURITY DEFINER` with
  `search_path = public, pg_temp`;
- only `service_role` can execute them;
- target Day-56 and governed pre-retirement shapes are admitted;
- finalization delegates supplied FR.1 decisions to FR.2;
- no SQL retirement/scheduler decision table was introduced; and
- target `is_active` and `is_default_for_new_schedules` remained false.

Two earlier application attempts reached only post-definition verification
assertions and rolled back their complete transactions. Neither produced a
ledger row or persistent object change. The third transaction passed every
assertion and committed.

## Protected-data proof

The successful transaction and a fresh read-only connection proved identical
protected facts before and after:

```text
schedule rows:                    58
target-v2 schedule rows:          18
schedule transition rows:         25
Review outcome rows:               43
Review completion receipts:         4
controlled-graduation receipts:     0
retirement receipts:                0
non-null retirement-check lineage:  0
final-rung boundary rows:            0
```

Protected fingerprints for schedules, transitions, outcomes, completion
receipts and policy rows were unchanged. No learner, schedule, outcome,
transition, assignment, session, or receipt fact was rewritten by the schema
rollout.

## Production release

`origin/main` was fast-forwarded from
`1a39e993b6908bf5e5bb4332fee58022557c4444` to:

```text
398dbdb1d1084859de04ebe3214cc47bc03ea180
```

Vercel Production deployment:

```text
deployment: dpl_DSMLYXTz4pSxde8jTquPWbqUCbTh
status: READY
aliases:
  scarletts-spells.vercel.app
  scarletts-spells-leesanderson1992-hashs-projects.vercel.app
  scarletts-spells-git-main-leesanderson1992-hashs-projects.vercel.app
```

HTTP smoke proof returned the expected authentication redirect from `/` and
HTTP 200 from `/login`. The post-deployment error scan found zero Production
errors and zero C2B/FR-related failures.

## Read-only Production observation

The schema-present FR.4 observer ran under `REPEATABLE READ READ ONLY`, with no
mutation surface and identical protected before/after fingerprints:

```text
observer: ADLE_C2B_PRODUCTION_OBSERVATION_V2
observed at: 2026-09-02T20:24:03.000Z
source baseline: 398dbdb1d1084859de04ebe3214cc47bc03ea180
deployment: dpl_DSMLYXTz4pSxde8jTquPWbqUCbTh
retirement capability: PRESENT
target hydration: 18/18
retirement hydration: 18/18
DAY_3: 11
DAY_7: 7
DAY_56/final-boundary rows: 0
retirement receipts: 0
alerts: 0
failed invariants: 0
target active: false
target default: false
```

Normalized Production observation fingerprint:

```text
a45f490ecc2fd14af1092d24fd9af8b7dd287b3b164a69410b066b77e47eaf4b
```

## Pending first canary

FR.5 schema and runtime rollout is complete, but no target word has reached
Day 56. The next action is observation, not further implementation.

When a target word becomes eligible at the final boundary:

1. run a fresh read-only FR.4 observation;
2. bind the exact learner, Review session, schedule IDs, revisions, due facts
   and observation fingerprint;
3. obtain separate owner approval for that exact first final-rung session;
4. allow the ordinary governed learner Review to complete; and
5. immediately verify the outcome, FR.1 decision, C2B/FR transition, immutable
   FR.2 receipt, resulting schedule state, projection and Production logs.

Do not cut over another learner, change target flags, fabricate a canary,
accelerate due dates, or create a retirement fact merely to exercise the path.

## Verdict

```text
FR.5 DEPLOYED — FIRST FINAL-RUNG CANARY PENDING
```
