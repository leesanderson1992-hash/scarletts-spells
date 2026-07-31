# Generic Composer Snapshot V2 — staging and rollback proof

Date: 2026-07-31
Scope: staging only; no production database or deployment mutation

## Pinned targets

- Supabase: `jlhotktspjvffslvuyfz`
- Vercel project: `scarletts-spells-staged`
- Vercel project ID: `prj_oJkffstOtacc4juYloXajHpjJUha`
- Production Supabase `wwohrqtunajrbwxyssjf` was explicitly rejected.

## Implementation commits

- `b9d69cf` — generic V2 contracts, mapping, requirements, compiler and
  deterministic fingerprinting
- `3fe33d1` — nullable immutable storage, atomic writer, rollout modes and
  observe reader
- `5e578c8` — project-pinned staging migration harness
- `2e10fc6` — enforce reader reconstruction and assignment-wide zero-write
  completion gate

Migration `20260731200000_add_adle_generic_lesson_snapshot_v2.sql` was applied
only to staging. Verification found the nullable column, structural check,
immutable trigger, narrow version index, authenticated validator grant,
service-only writer grant and zero backfilled rows.

## Deployments

| Stage | Deployment | Result |
|---|---|---|
| Observe | `dpl_5x5yTcPGj9QNodSovByN1Ks7BCc8` | Ready; snapshot/item browser parity passed |
| Enforce | `dpl_7QwVTXhccmwXRA4DtVmaiu658MLM` | Ready; malformed snapshot blocked with zero writes |
| Pre-snapshot rollback (`2c44e2b`) | `dpl_2d1Xg9VKiRCRdmjwTvBB4LoQcXct` | Ready; snapshot-bearing assignment ignored the additive field and resumed at Part 2 |
| Forward restoration | `dpl_6LALR9SrCSNAWt8MHjN25PBU8VUS` | Ready; enforce completion and compatibility proof passed |

All four were Preview deployments. No production deployment was requested or
performed.

## Disposable fixture ledger

- Parent: `d7c63760-0b88-4f79-9460-0daea7db1850`
- Primary child: `bde2d0b1-1223-4465-9209-b22c3c49b579`
- Snapshot assignment: `5c7a66e9-c67a-4597-9d78-16562e018c3f`
- Explicit snapshot-absent child/assignment:
  `532a8ff4-eba0-47d2-bc31-c5033344a279` /
  `c3a552ea-8fac-462c-ad88-c43f9feabab0`
- Metadata-free child/assignment:
  `57548b3b-e6ac-412a-b46f-accf5e3f2d9c` /
  `b1ff2951-d13c-46a0-affa-cd27895c38ff`

The harness stored disposable credentials only in ignored `.tmp` state. This
receipt contains no credential, word, prompt or raw attempt text.

At proof time, staging had no rows in `adle_family_methods` or
`adle_activity_templates`. To avoid changing shared registry content, the
disposable compiler facts used explicitly labelled `staging-proof-*` family
and template versions. Teaching-content and banding provenance came from the
active staging rows, and the compiled snapshot fingerprint covered all of
those facts. The local composer regressions exercise the same compiler with
the repository's complete eight-family and 32-template registry. No registry
row was inserted or changed for this proof.

## Database proof

- V2 compiled and semantically validated before the atomic RPC.
- One header, one immutable snapshot and nine source-bound items persisted;
  every snapshot source binding matched the item at the same position.
- Two concurrent repeat calls returned the same assignment ID.
- A deliberately invalid empty collection was rejected with zero header and
  zero item rows for the failed date.
- A deliberate persisted-item/template divergence made the present snapshot
  invalid. The enforce reader blocked it; audit found zero attempts, review
  outcomes, taught events, completed items or completed assignments. Restoring
  the one item field immediately restored the route.
- The final authenticated browser run completed all nine items. Database
  verification found five attempt events: one guided-practice, two scheduled
  review, one lesson-production and one lesson-dictation event, all with the
  expected evidence classes. It also found two review outcomes, one taught
  event, one lesson review bundle and one active lesson schedule row.
- Controlled spelling and dictation were both correct; the dictation event was
  the final scheduler evidence, preserving the existing precedence rule.

An initial disposable proof item used the non-contract fixture label
`scheduled` instead of `bundle_review`. The action correctly rejected the
scheduler transition. Its two pre-scheduler attempt rows were deleted, the
harness was corrected, and the complete browser/database proof was rerun from
the clean assignment state.

## Browser and rollback proof

Observe mode authenticated to the disposable parent, displayed the two review
words, entered the hidden-spelling phase and accepted a partial attempt while
retaining the item-derived projection.

Enforce mode displayed the same quick-sort/review sequence. The deliberate
binding divergence rendered only the child-safe grown-up-check screen. After
restoration, the snapshot assignment resumed normally.

The exact pre-snapshot commit `2c44e2b` was deployed from a detached temporary
worktree against the additive staging schema. It read the snapshot-bearing
assignment without selecting the new column, resumed at Part 2 from completed
review item statuses, accepted guided, controlled and dictation inputs, and
exposed its normal finish action.

After forward restoration, enforce mode authenticated again, completed Part 1,
reloaded directly into Part 2, completed the lesson and rendered the all-done
state. Separate children proved that explicit snapshot-absent and metadata-free
legacy assignments remain readable.

## Local regression evidence

- application and script TypeScript checks passed;
- focused lint passed;
- the 29-test semantic production baseline passed;
- generic contract/reader regressions cover exact parsing, all family
  sequences, 32 template mappings, deterministic relevant-content
  fingerprinting, item/read-model parity, unknown versions, duplicate IDs,
  missing/duplicate/extra bindings, position/section/template, word role,
  prompt, condition, schedule/reward, provenance and fingerprint failures;
- existing composer/activity/completion/evidence/scheduler/reward regressions
  retain review-only, lesson-only, combined, probe/probe-miss, stretch,
  homophone sentence-context, HIDE_WRITE, MEMORY_CUE, quick-sort, reflection,
  partial/resume, concurrency and no-op coverage.

## Cleanup and deferred rollout

The harness deleted the three disposable children, their assignments/items,
learning and scheduler rows, attempts, outcomes, taught history and generated
reward references, then deleted the disposable identity. A dynamic audit of
all 55 public tables containing `child_id`, `parent_user_id` or
`daily_assignment_id` found zero references; `auth.users` and
`auth.identities` also returned zero. The ignored credential/state files and
detached rollback worktree were removed and `git worktree list` again contains
only the primary repository.

Production schema/application rollout is the only deferred rollout step and
requires separate approval.
