# ADLE Phase E0 legacy-convergence baseline

Status: refreshed and locally verified E0 baseline at R8 completion, including
the narrow returned-correction Word Treasure repair. This document does not
authorise runtime deletion, learner cleanup, migration, or deployment.

## 1. Frozen source and Production baseline

- `HEAD`: `62aaf4c34d7634234ff81f5a6548ef4eecf72753`
- `origin/main`: `62aaf4c34d7634234ff81f5a6548ef4eecf72753`
- deployed Production Git SHA: `62aaf4c34d7634234ff81f5a6548ef4eecf72753`
- Production deployment: `dpl_9zWt4644BkV82jbciuGuj6zvTJea`, `READY`
- migration ledger: 109 local versions, 109 Production versions, zero pending,
  zero Production-only versions
- E0 Production access: `REPEATABLE READ READ ONLY`; writes performed: zero

The audit defaults to this frozen baseline. Release and observation gates may
pin a later deployed commit explicitly with
`--expected-baseline-commit <full-sha>`; the tool still rejects any mismatch
between that expected commit and the checked-out source.

The earlier Phase E source commits (`39fccd3`, `84309a4`, `62c5164`, and
`3bca29b`) are ancestors of this baseline. R8B through governed blocked-word
auto-resume then landed on top. Therefore E1-E3 are already implemented in the
authoritative source; this refresh verifies their state and does not repeat or
extend their deletions.

## 2. Current architecture map

```text
spelling occurrence / Review occurrence
  -> R8B occurrence-complete governed source
  -> R8C exact-ID handoff
  -> canonical-intake candidate + demand/queue
  -> R8D reconciliation / governed auto-resume readiness
  -> ADLE learner x canonical word x microskill item + immutable lineage
  -> Today's ADLE Session selection
  -> generic or specialist snapshot-v3 compiler
  -> service-only v3 persistence RPC
  -> immutable lesson snapshot v3
  -> route resolution -> CanonicalActivitySpec -> CanonicalActivityHost
  -> immutable completion evidence / taught history / authentic-use evidence
  -> R5 per-word schedule
  -> R6 Review snapshot -> encounters -> outcomes -> repairs -> Memory Cues
  -> Parent Review Work
```

Course Review Work remains a separate mandatory pending/approved/returned
progression gate. Word Treasure and reward authorities remain outside
`lib/adle` and are not Phase E cleanup targets.

Current authorities classified `KEEP_CURRENT_AUTHORITY`:

- `lib/adle/activity-catalogue.ts`, CanonicalActivitySpec, renderer registry,
  and CanonicalActivityHost;
- `lib/adle/today-assignment-service.ts` and unified Today's ADLE Session;
- generic and specialist snapshot-v3 compilers, validators, persistence ports,
  and current specialist adapters;
- Review v3/R6 immutable snapshots, R5 per-word schedules, encounters,
  outcomes, repairs, Memory Cues, outcome events, and Parent Review Work;
- canonical spelling mapping/intake, `adle_learning_items`, exact lineage,
  reconciliation, governed-source continuation, and blocked-word auto-resume;
- course Review Work, authentic-use, Word Treasure, and reward authorities.

## 3. Legacy architecture map and Production dependency evidence

```text
24 historical snapshot-null lessons
  -> persisted route metadata (22) or metadata-free detection (2)
  -> current specialist/generic compatibility adapters
  -> existing completion functions and stable resume keys

26 active legacy-bundle schedule words / 19 active bundles
  -> legacy Review provenance and compatibility schedule reads

157 empty Daily spelling practice headers
  -> retained read model/UI/completion surface
  -> zero assignment items and no surviving writer
```

Production assignment inventory:

| Route/version | Status | Snapshot | Count |
| --- | --- | --- | ---: |
| `base_word_lab:v2` | completed | null | 3 |
| `base_word_lab:v2` | pending | null | 1 |
| `compound_word_lab:v2` | completed | null | 2 |
| `dynamic_affix_word_lab:v3` | completed | null | 7 |
| `dynamic_affix_word_lab:v3` | pending | null | 4 |
| `dynamic_prefix_word_lab:v2` | completed | null | 5 |
| metadata-free generic | completed | null | 1 |
| metadata-free generic | pending | null | 1 |
| `dynamic_affix_word_lab:v3` | completed | immutable v3 | 1 |

Additional dependency counts:

- ADLE assignments: 27
- immutable Review snapshots: 2
- immutable lesson snapshots: 1, all schema version 3
- snapshot-null lessons: 24
- generic snapshot v2 rows: 0
- fixed-`un` v1 items: 0
- closed-compound v1 items: 0
- metadata-free generic assignments: 2
- historical `REVIEW_QUICK_SORT` items: 1
- historical controlled-spelling items: 99
- Daily spelling practice headers/items: 157/0
- active R5 per-word schedule rows: 25
- active legacy-bundle schedule rows: 26
- active legacy Review bundles: 19

Zero v2/v1 rows is deletion evidence only for the observed transaction. It is
not by itself authority to remove a historical reader; E5 still requires a
fresh observation-window audit.

## 4. Complete current candidate inventory

| Candidate | Current caller/data dependency | Creates new state? | Replacement authority | Classification / disposition |
| --- | --- | --- | --- | --- |
| retired daily-practice generator, cron route, planner, materializer | no runtime imports; 157 retained headers, 0 items | no; source deleted in `84309a4` | Today's ADLE Session plus existing reward/check-in reads | `DELETE_OBSOLETE_FORWARD_PATH` complete; do not delete rows or read UI in E1 |
| `ensureAdleDailyPlan`, composed-plan JS persistence, old child lazy generation | no runtime symbols/imports | no; source absent | `today-assignment-service.ts` explicit v3 generation | `DELETE_OBSOLETE_FORWARD_PATH` complete |
| `persist_adle_composed_daily_plan_v1` database RPC | no application runtime call; historical schema object remains executable by `service_role` | technically yes if called externally | v3 generic/specialist persistence RPCs | `DELETE_AFTER_DATA_PROOF`; harmless while uncalled, future drop needs a new approved migration |
| generic snapshot-v2 forward writer/RPC | no runtime call/import; 0 Production v2 snapshots | RPC technically can write v2 | generic snapshot-v3 compiler/persistence | source writer is `DELETE_OBSOLETE_FORWARD_PATH` complete; RPC is `DELETE_AFTER_DATA_PROOF` |
| `generic-snapshot-compiler.ts` v2 compiler | test/compatibility characterization only | test-only | generic snapshot-v3 compiler | `DELETE_AFTER_DATA_PROOF`; remove only with its test-only dependants in a later stage |
| generic v2 contracts/validator branch in `generic-snapshot-reader.ts` | 0 current v2 rows; reader is shared with metadata-free and v3 replay | reads only | v3 reader for new rows | `DELETE_AFTER_DATA_PROOF`; do not split/delete in E0 |
| snapshot-null generic read in `generic-snapshot-reader.ts` and `daily-plan-surface.ts` | 2 real Production assignments, one pending | reads only | none for immutable history | `KEEP_HISTORICAL_READ_ONLY` |
| route metadata v1/v2 parsing and legacy route detection in `persisted-route-metadata.ts` / `route-resolution.ts` | 24 snapshot-null lessons | reads only except current metadata constructors used by v3 writers | v3 snapshots for new work | `KEEP_HISTORICAL_READ_ONLY`; keep shared current constructors |
| current specialist snapshot-null adapters | 22 specialist assignments, including four pending | reads/completes existing rows | specialist snapshot v3 for new work | `KEEP_HISTORICAL_READ_ONLY` |
| `complete_adle_base_word_family_pilot_v2` | genuine pending base-word history and other snapshot-null base lessons | completes existing assignment | same completion authority also used by v3 base lessons | `KEEP_HISTORICAL_READ_ONLY` and current completion authority |
| legacy morphology resume key | existing pre-profile learner browser state can use it | browser-local state only | current route-specific resume keys | `KEEP_HISTORICAL_READ_ONLY` |
| `generic-activity-compatibility.ts` controlled spelling/free response adapters | 99 controlled-spelling items plus metadata-free generic history | reads existing item payloads | canonical activity contracts for new snapshots | `KEEP_HISTORICAL_READ_ONLY` |
| `REVIEW_QUICK_SORT` -> `CompatibilityNoop` | 1 Production item; renderer registry imports it | reads only/no learner evidence | Review v3 for new Review work | `KEEP_HISTORICAL_READ_ONLY` |
| legacy Review bundles and null `word_schedule_version` paths | 26 active words and 19 active bundles | schedule authority for historical rows | R5 per-word schedule for current rows | `KEEP_HISTORICAL_READ_ONLY` |
| Daily spelling practice read model/viewer/completion | 157 historical headers and Learn Week UI | may complete a historical item, but writer is gone | Today's ADLE Session | `KEEP_HISTORICAL_READ_ONLY` until E5 proof |
| closed-compound-v1 legacy metadata constructor/render-only registry entry | 0 Production items | constructor is not a forward runtime route | compound v2 | `DELETE_AFTER_DATA_PROOF` |
| snapshot-v3 writer rollout flags and child gates | no runtime symbols | no; deleted in `62c5164` | v3 required unconditionally | `DELETE_OBSOLETE_FORWARD_PATH` complete |
| preview-only duplicate components/routes removed in `3bca29b` | E3 static proof reports no runtime, canonical host, specialist, or historical-reader import | no | canonical shared activities | `DELETE_OBSOLETE_FORWARD_PATH` complete |
| R8B/R8C/R8D/Stage-F/auto-resume functions and source anchors | active canonical intake; 82 candidates and 64 active lineage rows | yes, governed current state | none | `KEEP_CURRENT_AUTHORITY` |
| historical migration files | migration audit history; ledger aligned | not run by the app | new unique forward migrations only | `KEEP_HISTORICAL_READ_ONLY`; never rename/delete/replay |
| stale ADLE catalogue/backlog prose saying Phase E has not started | documentation only | no | this frozen audit and current source | `DELETE_AFTER_DATA_PROOF`; converge in E6, not E0 runtime work |
| proof-child cleanup | affected proof learner exists and has real dependent rows; no Phase E cleanup manifest/owner grant found | would delete learner state | separately approved E4 transaction | `UNCERTAIN_REQUIRES_OWNER_REVIEW` |

## 5. Protected learner classifications

The audit uses repository-governed IDs and never classifies from a display name.

| Governed category | Child ID | Current dependencies | Phase E treatment |
| --- | --- | --- | --- |
| genuine real learner | `e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e` | 12 snapshot-null lessons, 29 ADLE learning items, 42 intake candidates, 25 schedules, 26 Word Treasures | protected; no reset, backfill, rewrite, or cleanup |
| authorised R7 real learner | `bfe4ece9-2419-4a15-93c0-fbfd4c552fa5` | 1 intake candidate and 2 Word Treasures | protected real learner |
| affected unactivated proof learner | `8629d7b2-5770-48bd-b33d-b10e02d9c559` | 1 snapshot-null lesson, 5 learning items, 6 candidates, 2 schedules, 6 Word Treasures | exists, but prior disposable cleanup authority is not proven for Phase E; protected pending owner review |
| Test 2 runtime learner | `2498bb47-0b09-47c9-bfc1-18f95b52d35c` | 12 lessons (11 null, 1 v3), 33 learning items, 33 candidates, 24 schedules, 36 Word Treasures | test use does not grant deletion authority; protected |
| every other learner | not enumerated in this report | may contain writing, assignment, reward, or Review history | fixture-shaped/undocumented; protected |

The genuine learner capture covers 36 direct and linked tables. The frozen
semantic aggregate is
`90b2df679bab447504fdc1fa67a72944a281ba9fdf0c50fc81f826db493880e2`;
the next-lesson/Review eligibility projection is
`55c2b2d794a35d6cb47d2fe8e2c057eafdf485dba902132be017a428ddeff99b`.
The audit also emits raw per-table hashes. Its semantic hash excludes only the
canonical-intake scheduler's volatile evaluation timestamps, retry timestamp,
lock version, and update timestamp; candidate identity, state, blockers,
learning-item link, route, and release authority remain hashed.

## 6. R8 preservation findings

R8 is current architecture, not legacy cleanup:

- all migrations `20260828120000` through `20260828160000` are present;
- 82 canonical-intake candidates exist: 62 activated, 17 pending content, and
  3 pending mapping;
- governed source handoff state contains 9 exact R8C handed-off sources and 78
  protected legacy-null sources;
- 64 active learning-item lineage rows remain;
- R8B occurrence identity, R8C exact-ID handoff, R8D reconciliation,
  Stage-F governed reconstruction, and governed-source continuation functions
  are installed and service-only;
- repaired R8E sources/items/candidates are current learner authority and must
  never be selected as Phase E cleanup merely because their origin was
  historical;
- blocked-word demand, mapping/content/profile readiness, release enqueue
  triggers, and five-minute auto-resume remain protected.

Any future reader deletion stops if it removes an occurrence/source anchor,
canonical-intake candidate, demand/queue relationship, learning-item lineage,
reconciliation record, or Stage-F provenance needed by current/repaired data.

## 7. Revised Phase E sequence

1. **E0 — refresh/freeze (this change):** audit/proof tooling and documentation
   only; no runtime change.
2. **E1 — legacy-writer verification:** the daily-practice writer retirement is
   already present. Exact scope is a no-op code verification: retain the static
   zero-writer contract, the 157 headers, read UI, completion compatibility,
   Today's ADLE Session, reward/check-in semantics, and assignment uniqueness.
3. **E2 — v3-only creation verification:** already present. Keep proving every
   current forward writer calls v3 persistence and no rollout/snapshot-null/v2
   writer is runtime reachable.
4. **E3 — retired-route/import verification:** already present. Keep the E3
   static import proof; make no further deletions under E0.
5. **E4 — proof-learner cleanup:** not authorised. Re-prove exact identity,
   cleanup authority, preimage manifest, all tables/schedules/rewards, exact
   transaction, and restoration evidence before seeking owner approval.
6. **E5 — historical reader/UI retirement:** deferred until a fresh post-R8
   observation audit proves zero dependency. Current 24 snapshot-null lessons,
   2 metadata-free generic assignments, 1 quick-sort item, 26 legacy schedule
   rows, 19 bundles, and 157 headers prohibit broad E5 deletion now.
7. **E6 — documentation convergence:** update stale forward-architecture prose
   only after the retained/deleted runtime boundaries are final.

Database cleanup remains a separately approved E7 concern and is not implied
by this sequence.

## 8. Stop conditions and rollback principles

Stop before any stage that would require:

- Production mutation, learner reset, history rewrite, backfill, or migration
  repair;
- treating a test-like name as disposal authority;
- removing a reader used by any pending/completed Production assignment;
- changing current lesson generation, Review, course gating, reward, or R8
  canonical-intake behavior;
- removing an R8 source/provenance anchor or creating duplicate learner state;
- deleting/renaming historical migrations or running broad `db push`.

E0 rollback is `git revert` of the E0 tooling/documentation commit; it has no
Production or learner-state rollback. Later application-only convergence must
use an immediately prior known-good application release and must never roll
back by altering learner history. Database-object removal, if ever approved,
uses one unique forward migration with a separately reviewed inverse/restore
plan.

## 9. Deferred database cleanup

Harmless objects that may remain indefinitely while uncalled include
`persist_adle_composed_daily_plan_v1`, `persist_adle_generic_daily_plan_v2`,
their validators/check helpers, old route-era columns, empty daily-practice
headers, and legacy Review bundle columns/tables. Their presence is safer than
premature deletion.

Potential future drops require fresh zero-call/zero-row evidence and a new
unique migration: legacy plan/v2 persistence RPCs, v2-only validation helpers,
closed-v1 schema helpers, obsolete daily-practice storage only after UI/history
retirement, and bundle-era columns/tables only after all 26 legacy schedule
members and 19 bundles cease to be historical authorities. Historical
migration files are never drop candidates.

## 10. Validation and changed assumptions

Passed on the frozen baseline plus the local E0 reward repair:

- Phase E read-only audit, no-legacy-writes contract, and E3 import proof;
- activity catalogue generation check/regression and canonical renderer registry;
- all current specialist snapshot-v3 and generic snapshot-v3 regressions;
- metadata-free/v2 generic reader and daily-plan compatibility regressions;
- Review R5, Review R6, Parent Review Work, Review intake completeness, and
  course Review Work gating;
- canonical intake core/readiness/demand/reconciliation/live, R8B, R8C, R8D,
  R8D/R8E compatibility, Stage-F, governed auto-resume, and returned-correction
  Stage-F regressions;
- ADLE reward bridge, Word Treasure parent-approval, returned-correction
  create/reuse/replay/order/failure-isolation, free-writing evidence, storage,
  and Word Treasure read-model regressions;
- returned-correction Stage D, child correction, route bridge, Stage F replay,
  Stage F automation, returned-lesson resubmission, and Stage 7F Parent Review
  restoration regressions;
- scripts TypeScript, application TypeScript, targeted ESLint, Production
  build, and `git diff --check`.

Resolved validation defect discovered during E0:

- `scripts/word-treasure-parent-approval-regression.ts` originally failed because
  `repairFinalisedReturnedCorrectionAfterRouteCapture` now delegates legacy
  learning-item repair to `applyReturnedCorrectionRepairPlan`, but neither the
  route action nor that repair layer calls
  `createOrUpdateGoldenNuggetFromParentApproval` afterwards. The narrow runtime
  repair restores that canonical call in the authenticated route action only
  after one learning-item ID is proven. The shared Stage D repair applier stays
  reward-neutral. An existing source event (`writing_issue` plus issue ID)
  suppresses replay, while the canonical child-plus-normalized-word uniqueness
  reuses an existing Treasure. Invalid or ambiguous repair plans still stop
  before any reward call.
- A repeatable-read, read-only Production query proves that branch still has
  genuine-learner dependencies. Across 88 finalised learning-relevant issues,
  16 have no Word Treasure matching either source issue or normalized corrected
  word. Eleven already have both the aligned route mapping and linked learning
  item but no matching Treasure, and all eleven belong to the protected genuine
  learner. The E0 audit emits this as
  `wordTreasureCompatibilityDependencies`; it is therefore not safe to dismiss
  the regression as obsolete fixture coverage. Production was not mutated;
  these historical rows remain untouched until an ordinary governed route
  retry uses the repaired application path.

Two older release-gate Production audit commands also stop on expected drift:
`r8d:production-readonly-audit` expects R8D not yet installed, and
`r8e:stage-f-compatibility-audit` expects the deterministic repair sources not
yet materialised. They remain historical gate evidence; this E0 audit and the
post-R8 regressions are the current read-only authority.

Changed assumptions from the old Phase E audit:

- immutable lesson snapshots increased from 0 to 1, and the row is v3;
- immutable Review snapshots increased to 2;
- snapshot-null lessons remain 24 and are still live history dependencies;
- R8 repairs/continuation created current candidate and lineage authority that
  cannot be classified as cleanup data;
- E1-E3 are already landed ancestors, so their next scope is verification,
  not another implementation/deployment;
- the affected proof learner still exists, but no current Phase E cleanup
  authority was proven;
- the migration ledger is now exactly aligned, including the governed legacy
  `20260421` migration version.

The full E0 matrix now also closes the verification-only work for E1-E3: no
legacy forward writer is runtime reachable, v3 snapshots remain mandatory for
all new lessons, and the E3 import proof remains empty. The next real Phase E
gate is therefore the next genuinely outstanding convergence stage, not a new
E1-E3 implementation. E4 remains optional, unapproved, and authority-blocked;
the next mandatory convergence gate is the observation-completion/read-only
re-audit required before proposing E5 historical-reader retirement.

## 11. Repeatable commands

```sh
npm run adle:phase-e:e0-static-regressions
npm run adle:phase-e:production-audit -- --genuine-child-id <governed-uuid>
```

The Production command requires `ADLE_PHASE_E_PRODUCTION_HOST` and a supported
Production database URL whose username contains the pinned project reference.
It emits counts and hashes, not learner writing.
