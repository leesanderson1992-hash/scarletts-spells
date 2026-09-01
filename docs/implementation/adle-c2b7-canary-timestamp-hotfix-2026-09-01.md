# ADLE C2B.7 canary timestamp hotfix receipt

Date: 2026-09-01
Production Supabase: `wwohrqtunajrbwxyssjf`
Canary learner: `e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e`

## Verdict

`C2B.7 CANARY HOTFIX COMPLETE — FIRST REAL V2 TRANSITION VERIFIED`

The Review inputs were already immutable and safe. The failed finalization was
caused by PostgreSQL microsecond precision differing from JavaScript
millisecond precision inside the target transition fingerprint envelope.

## Bounded repair

The governed completion preparation function now issues its single completion
instant using:

```sql
date_trunc('milliseconds', clock_timestamp())
```

TypeScript also canonicalizes a governed source instant once, before building
the reducer-result envelope. The C2B.1 reducer and all scheduler semantics are
unchanged.

Migration:

```text
20260901130000_normalize_adle_c2b6_review_completion_milliseconds.sql
SHA-256: 5c4bb42a55336ef16d9300f069c7c33205c1dea5d652276b1546173b6fb4da11
```

The migration replaced one SECURITY DEFINER preparation function, retained
service-role-only execution, and changed no learner, schedule, policy, receipt,
outcome, or transition row when applied.

Runtime-only source fingerprint:

```text
675cd834fe69b4a84c40661610cbd5c63eb93e15a1c4efb4527d6c14dfaaea8c
```

It covers:

- `lib/adle/review-policy/canonical-timestamp.ts`
- `lib/adle/review-policy/target-transition-persistence.ts`
- `lib/adle/review-policy/mixed-policy-finalization.ts`

## Precision and fingerprint proof

The disposable Production-shaped database proved:

```text
input:  2026-09-01T12:04:44.123456+00:00
token:  2026-09-01T12:04:44.123+00:00
TS SHA: 8b7389e42aca0904336e7a3d90428e816c71b25986b831709aec1514a8278b41
SQL SHA:8b7389e42aca0904336e7a3d90428e816c71b25986b831709aec1514a8278b41
```

The disposable database was dropped after proof.

## Production release

An initial local-prebuilt deployment exposed that Vercel redacts the sensitive
public anon key in local pulls. That artifact produced missing-environment
errors in an unrelated intake endpoint and was immediately rolled back before
being retained as the public release. No environment setting was changed.

The same source was then built by Vercel's remote Production builder, where the
encrypted Production variables are available, and promoted:

```text
deployment: dpl_2B3S6RH2Zh8CzSKQHtMHJ62yvVCo
url:        https://scarletts-spells-kgyhojsoo-leesanderson1992-hashs-projects.vercel.app
alias:      https://scarletts-spells.vercel.app
status:     READY
```

Post-promotion smoke proof:

- login returned HTTP 200;
- the protected Supabase-dependent intake endpoint returned the expected HTTP
  401 rather than a missing-environment 500; and
- the deployment error log was empty.

## Saved Review finalization

The exact already-safe Review session
`71865eb0-8ecd-5141-9550-da761dc2d4a2` was finalized once through the governed
R6 mixed-policy path using a fixed idempotency key.

Result:

- session `ready_to_complete -> completed`;
- state revision `146 -> 147`;
- 10 immutable original outcomes materialized: 9 success, 1 failure;
- one completion receipt;
- Review-only day correctly selected because no specialist lesson was due;
- no controlled graduation receipt was fabricated.

## First real v2 transition

Schedule `5d5e843f-df5d-4188-ae53-65158b02021d` produced exactly one
`REVIEW_OUTCOME_APPLIED` boundary:

```text
transition event: 86979bba-12e8-460d-99a1-c7ce56480c32
source outcome:   4105dd9b-89c9-510c-9ddb-b6922e48254b
revision:         1 -> 2
rung:             DAY_1 -> DAY_3
due date:         2026-08-29 -> 2026-09-04
failures:         0
failure episode:  null
occurred at:      2026-09-01T12:03:43.643+00:00
fingerprint:      359f0b26db5415cdbe6d938231777fc99dd329cdcefc3d15b64c2b478d7fafd0
```

The resulting schedule rehydrated as `TARGET_REGRESSION_V1`. Production still
contains exactly one v2 schedule. Target `is_active=false` and
`is_default_for_new_schedules=false` remain unchanged.

## Regression proof

- C2B.2–C2B.6 focused regressions: PASS.
- C2B.2/C2B.6/C2B.7 disposable database proof: PASS.
- Target reducer: PASS, 67 canonical transition classes.
- Scheduler simulation: PASS.
- Long-horizon simulation: PASS, 2,400 runs, fingerprint
  `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`.
- Current scheduler and Review R4/R5/R6 regressions: PASS.
- Phase B, Phase C and current proficiency regressions: PASS.
- Script/application TypeScript, lint, build and `git diff --check`: PASS.

## Remaining cohort boundary

No second word was cut over. The post-Review read-only preview now has
fingerprint `54ad2d1dc32d206367f1a77e66ff3b4b89bb49e728b08883151fc5f8a9fcef40`
and different live eligibility counts because the completed Review legitimately
transitioned ten schedules. The original C2B.5 preview must therefore not be
reused to mutate the remaining cohort. Any next cutover requires a fresh,
learner-bounded preview and explicit owner approval.
