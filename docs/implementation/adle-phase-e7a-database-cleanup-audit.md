# Phase E7A database cleanup audit

Status: read-only audit complete; cleanup is not authorised.

Production application SHA: `a57fe67fe840fa02f0d326391c230daa9a36f485`
Production project: `wwohrqtunajrbwxyssjf`
Catalogue receipt: `adle_phase_e7a_database_cleanup_audit_v1` at `2026-08-29T12:44:27.818Z`
Transaction: `REPEATABLE READ READ ONLY`; `transaction_read_only=on`; mutation performed: `false`
Migration ledger: `109/109`, local-only `0`, Production-only `0`

## Conclusion

Seven function surfaces are proven safe candidates for a separately approved forward cleanup migration. No table, column, index, constraint, trigger, policy, grant independent of those functions, cron job, migration file, ledger row, or learner row is justified for removal.

The seven candidates are four retired writers/completion RPCs and three generic-v2 validator surfaces:

1. `persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)`
2. `persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)`
3. `persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)`
4. `persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text)`
5. `complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)`
6. `adle_generic_lesson_snapshot_is_structurally_valid(jsonb)`
7. `adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)`

Candidate 7 is currently referenced by candidate 2, candidate 6, and the current aggregate validator `adle_lesson_snapshot_is_structurally_valid(jsonb)`. A cleanup migration must first remove the obsolete snapshot-v2 branch from the aggregate validator. That is a dependency-preserving definition convergence, not permission to remove the aggregate validator, its constraint, or any v3 validator.

## Evidence rules

Production has `track_functions=none`; PostgreSQL function statistics cannot prove invocation. A removal classification therefore requires all of:

- no current application import/call;
- no surviving Production function-body call after the planned dependency rewrite;
- no catalogue dependency;
- no Production row in the retired format;
- a current replacement authority;
- retained-reader regressions that do not use the candidate.

Migration and regression references are governance/history, not Production application callers. They remain in place and will need explicit test updates only if a future cleanup migration is authorised.

Static source proof also found one dormant runtime export: `persistWordLabCompletion` in `lib/adle/loaders/word-lab-completion-loader.ts`. No app/component/lib caller imports it; the current compound path imports only `persistReleaseBoundWordLabCompletion`. A future cleanup release must remove that dormant export in the same application release as the RPC drop so the repository cannot expose a callable client for a missing RPC. The shared `WordLabReflectionWrite` type remains because current compound and base-word completion use it.

## Complete candidate-object inventory

### Functions, RPCs, validators and attached grants

| Object | Original purpose | Current application reference | Production/database reference | Production dependency | Disposition |
| --- | --- | --- | --- | --- | --- |
| `persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)` | Pre-snapshot atomic generic/specialist assignment creation | None; current generic and specialist writers call snapshot-v3 RPCs | No Production function calls it; service-role-only execute grant | Created snapshot-null forward state; retained readers do not invoke its creator | `ZERO_USE_REMOVAL_CANDIDATE` |
| `persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)` | Generic immutable snapshot-v2 creation | None | Calls the v2 validator; no other Production function calls it; service-role-only execute grant | Generic-v2 rows `0` | `ZERO_USE_REMOVAL_CANDIDATE` |
| `persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)` | Snapshot-null base-word pilot creation | None; current base-word creation compiles specialist snapshot v3 and calls `persist_adle_specialist_daily_plan_v3` | No Production function calls it; service-role-only execute grant | Four snapshot-null base-word-v2 assignments exist, but creation is not needed to resume/complete them | `ZERO_USE_REMOVAL_CANDIDATE` |
| `persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text)` | Route-metadata base-word assignment creation without immutable snapshot v3 | None; current base-word creation uses specialist snapshot-v3 persistence | No Production function calls it; service-role-only execute grant | Existing assignments are completed through `complete_adle_base_word_family_pilot_v2`, not this creator | `ZERO_USE_REMOVAL_CANDIDATE` |
| `complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)` | Retired fixed-`un` 16-item Word Lab completion contract | Only an unused export remains in `word-lab-completion-loader.ts`; no Production caller imports it | No Production function calls it; service-role-only execute grant | Fixed-`un`-v1 rows `0`; closed-v1 rows `0`; current compound completion uses `complete_adle_release_bound_word_lab_v2`; current affix completion uses current independent durable writes | `ZERO_USE_REMOVAL_CANDIDATE` |
| `adle_generic_lesson_snapshot_is_structurally_valid(jsonb)` | Version-dispatch wrapper for generic snapshots 2 and 3 | None | No Production function calls the wrapper; executable by service/authenticated | Generic-v2 rows `0`; v3 writer calls the v3 validator directly | `ZERO_USE_REMOVAL_CANDIDATE` |
| `adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)` | Validate retired generic snapshot v2 | None | Called by the obsolete v2 writer, obsolete generic wrapper, and current aggregate validator's v2 branch | Generic-v2 rows `0`; safe only after atomically removing all three obsolete references | `ZERO_USE_REMOVAL_CANDIDATE` |
| `adle_lesson_snapshot_is_structurally_valid(jsonb)` | Current aggregate lesson-snapshot constraint/trigger validator | Indirectly required for every immutable lesson snapshot | Called by the current specialist v3 writer, R6 specialist-stage append, and immutable-snapshot trigger/constraint | Protects both current v3 rows and all future v3 writes | `CURRENT_AUTHORITY — KEEP`; replace only its dead v2 branch |
| `adle_generic_lesson_snapshot_is_structurally_valid_v3(jsonb)` | Current generic snapshot-v3 validation | Current generic v3 writer | Called by current generic writer and aggregate validator | Current/future snapshot-v3 authority | `CURRENT_AUTHORITY — KEEP` |
| `persist_adle_generic_daily_plan_v3(...)` | Current generic snapshot-v3 atomic writer | `generic-snapshot-v3-persistence.ts` | Service-role-only | Current forward authority | `CURRENT_AUTHORITY — KEEP` |
| `persist_adle_specialist_daily_plan_v3(...)` | Current specialist snapshot-v3 atomic writer | `specialist-snapshot-v3-persistence.ts` | Service-role-only; uses aggregate v3 validator | Current forward authority | `CURRENT_AUTHORITY — KEEP` |
| `complete_adle_release_bound_word_lab_v2(...)` and readiness helpers | Compound-v2 completion | Current ADLE completion action | Uses route-metadata v2 and current shared lineage | Two completed snapshot-null compound-v2 histories and current compound route | `CURRENT_AUTHORITY — KEEP` |
| `complete_adle_base_word_family_pilot_v1(...)` | Exact historical base-word transaction contract | Indirect through v2 | Called by `complete_adle_base_word_family_pilot_v2` on first completion and replay | One genuine pending snapshot-null base-word-v2 assignment | `HISTORICAL_AUTHORITY — KEEP` |
| `complete_adle_base_word_family_pilot_v2(...)` | Shared-route/base-word completion wrapper | Current base-word completion action | Calls completion v1 and current per-word route/schedule tables | One pending plus three completed snapshot-null base-word-v2 assignments | `CURRENT_AUTHORITY — KEEP` |
| `adle_lesson_route_metadata_is_valid_v1/v2`, metadata immutability trigger | Validate retained route identities | Current generic v3 uses v1; specialist/base/compound paths use v2 | Referenced by current writers/completers and table constraint | Metadata-free rows are allowed by null; current route metadata remains immutable | `CURRENT_AUTHORITY — KEEP` |
| R8B/R8C/R8D, Stage-F and governed auto-resume functions | Canonical intake and continuation | Current Parent Review/canonical intake | Active cross-function references and active cron safety sweep | 48 genuine-learner intake candidates; active queue/events | `CURRENT_AUTHORITY — KEEP` |
| Review R5/R6 functions/triggers and reward/Word Treasure functions | Review, schedule, proficiency and rewards | Current Review and reward paths | Active tables, triggers and RPCs | Protected history and live authority | `CURRENT_AUTHORITY — KEEP` |
| `publish_adle_teaching_dictionary_closure_v1(...)` | Governed release-authority publication | Current base-word release tooling and local release proofs | Service-role-only | Current release governance despite v1 suffix | `CURRENT_AUTHORITY — KEEP` |

Dropping a candidate function also removes only its attached execute privilege. No standalone grant is proposed for deletion.

Definition SHA-256 restoration receipts:

| Object | Definition SHA-256 |
| --- | --- |
| `persist_adle_composed_daily_plan_v1` | `79a98937b6664476f857b331a34eabd21d7170f4ec337681c2a54351c9103ff8` |
| `persist_adle_generic_daily_plan_v2` | `afa14e96373e76c15ba2e90f090de3169ac626870fe4093cb6c84ae7f420185e` |
| `persist_adle_base_word_family_pilot_v1` | `d6697eddbefc3f9636f9ff6645b74fd2f28670746fa69d66178d65f955af37d7` |
| `persist_adle_base_word_family_pilot_v2` | `ac5ab5f28efc192de35be465c2c7e167d7e91a081321b8dbfb3d96ed7557b576` |
| `complete_adle_word_lab_v1` | `4ee491437a6e6edd287ae187424ea013405a5bbbb9e1f0756f75813511be62c1` |
| generic version wrapper | `8398fd1077d13846d3c02a3ff7b0613ae628e316763f1be1296d689522e48c2b` |
| generic v2 validator | `bf99950e871a45ef1260eff1626d291c09f23b2449cf286a486888c46e2811c0` |

### Tables and data

| Object | Purpose/data | References and counts | Disposition |
| --- | --- | --- | --- |
| `daily_assignments` | Shared current assignment/session envelope | 82 current source references across app/lib/components with `assignment_items`; contains all 28 ADLE assignments, 2 review snapshots, and 157 Daily Practice headers | `CURRENT_AUTHORITY — KEEP` |
| `assignment_items` | Shared current assignment item/evidence binding | Current routes, historical readers and course/parent surfaces; contains 99 protected controlled-spelling items in snapshot-null lessons and one `REVIEW_QUICK_SORT` | `CURRENT_AUTHORITY — KEEP` |
| `adle_base_word_family_pilot_runs` | Base-word lesson number/completion evidence | Four rows; current base-word readiness reads run count; three genuine-learner rows | `CURRENT_AUTHORITY — KEEP` |
| `canonical_teaching_dictionary_compound_profiles` | Reviewed pre-v2 compound profile evidence | One row; current live readiness/documentary audit reads it | `HISTORICAL_AUTHORITY — KEEP` |
| `canonical_teaching_dictionary_compound_facts` | Reviewed compound source facts used to build/reconcile v2 authority | Seven rows; current live readiness and v2 review-artifact tooling read it | `HISTORICAL_AUTHORITY — KEEP` |
| `canonical_teaching_dictionary_compound_structures_v2`, components and joins | Current compound-v2 authority | Current app loaders and canonical-intake readiness | `CURRENT_AUTHORITY — KEEP` |
| Review, R8, proficiency/evidence, learning-item, reward and Word Treasure tables | Protected current learner authority | Non-zero live counts and current runtime references | `CURRENT_AUTHORITY — KEEP` |

No fixed-`un`-v1-specific or closed-compound-v1-specific table exists that is both isolated and unused. Shared dictionary evidence is retained.

### Shared columns, indexes, constraints, triggers and policies

No shared storage object is safe to drop:

- `daily_assignments.assignment_generation_source` and `source_learning_item_ids` are used by current writing-practice ownership/read models and current assignment selection.
- `lesson_route_metadata`, `compiled_lesson_snapshot`, and `compiled_review_snapshot` are current and historical authorities.
- route-version, snapshot-version, recognised-session uniqueness and child/date indexes support current reads/writes.
- `daily_assignments_compiled_lesson_snapshot_versioned_check` must remain. Its validator definition may converge from v2+v3 to v3-only because Production has zero v2 rows; the constraint itself is current.
- lesson/review snapshot immutability triggers, route-metadata immutability, R6 completion convergence and `set_updated_at` remain current.
- parent-scoped assignment/item policies and table grants serve current application routes.
- foreign keys, status checks, primary keys and the child/date/title uniqueness constraint are shared current integrity.

Disposition for every route-era/shared column, index, constraint, trigger, policy and table grant: `CURRENT_AUTHORITY — KEEP`.

### Cron/scheduler objects

Production contains one matching cron job: `adle-canonical-intake-production-safety-sweep-v1`, every five minutes, active. It is current R8 safety authority. Disposition: `CURRENT_AUTHORITY — KEEP`.

No Daily Practice cron/RPC/function/policy/table was found. The retired writer was application code writing shared tables.

## Daily Practice decision

Production has exactly `157` headers, `0` items, `0` completed headers, all with `assignment_generation_source='learning_items'`, dated from `2026-06-26T07:28:02.292Z` to `2026-08-27T06:42:11.531Z`.

- E5 removed the UI/completion surface and E1 stopped creation.
- No current runtime or database reward/check-in function selects the exact title.
- Current reward/check-in reads use their own governed reward authorities, not these empty headers.
- The underlying tables and relevant columns are heavily shared current authority.
- Deleting the rows would remove harmless historical evidence for no structural benefit.

Decision: retain all 157 rows unchanged as harmless historical storage. There is no justified Daily Practice database drop in E7.

## Historical-reader protections

Read-only Production counts at the audit snapshot:

- snapshot-null lessons: `24`;
- immutable snapshot-v3 lessons: `2`;
- metadata-free generic assignments: `2` (one completed, one pending);
- `REVIEW_QUICK_SORT`: `1`;
- controlled-spelling items in snapshot-null lessons: `99`;
- base-word-v2 snapshot-null: `4` (three completed, one pending);
- active schedule rows: `56` (`27` per-word-v1, `29` active `legacy_bundle`);
- active bundles: `21`.

The snapshot-null distribution also includes two completed compound-v2 assignments, five completed dynamic-prefix-v2 assignments, seven completed and four pending dynamic-affix-v3 assignments. Readers, normalizers, adapters and completion RPCs for those formats stay protected. Removing creators does not rewrite or invalidate their rows.

## R8, Review, proficiency and reward safety

The proposed function-only boundary has no reference edge to:

- occurrence intake, exact-ID handoff, demand/reconsideration or governed continuation;
- learning-item lineage/materialisation;
- authentic-use/proficiency evidence;
- Review snapshots, encounters, repairs, outcomes, receipts, per-word schedules or active bundles;
- Word Treasure, gold-coin or reward bridges.

The active R8 safety-sweep cron remains. `legacy_bundle` remains active forward authority and is not part of cleanup.

## Protected Production baseline

Genuine learner: `e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e`.

- semantic aggregate SHA-256: `84dc42f833ee087d7c0cafb516fe4795ad960d1a739487eec95d0a7a04983094`
- eligibility projection SHA-256: `ea2d9bc760d17aafbd8c2c50124b64e6ede877ec2097da96e2a610a40dee834b`
- raw aggregate SHA-256: `d5c49cf38a8f1fb11ac8964018bb22d25cb560e69fb45ecb724644d200abda9e`
- learning items: `35`; SHA `de17954b152b2382d3c1480ab3de37c84acdf0d90798abe3d472e2c431f5f8f3`
- canonical-intake candidates: `48`; raw SHA `6419f0508f1d733a3e0fbef09e605fde1bcfd42a33d629a89997f74f15b823ce`
- Review schedules: `27`; SHA `822fc6f32d4db6e9010d2817cb3e8ba119aeb5be11a2dc574a022d3b2e5c1a52`
- Review sessions/encounters/repairs/receipts: `2/20/10/2`
- Review outcome events: `23`; Memory Cue versions: `9`
- Word Treasures/events: `32/53`; SHAs `61c56ee4bd3bdde93acfce71f55fa0fb95cf1a1f55f6b1b0a691d994c91f89cf` / `fd1e6b7785a17cc28b6a146ca4e07944b86696074ea2e38ca7f0aa5266068685`
- gold-coin events: `44`; SHA `577a86479993db5faba43db9d821eb2326cf5ff1a2be9e1c725531adab088a6d`
- taught history: `38`; authentic-use events: `355`; assignment attempts: `196`

Canonical-intake scheduler bookkeeping fields are excluded from the semantic aggregate exactly as in the Phase E protected-state contract.

## Proposed future forward migration (plan only)

One new uniquely timestamped migration, after separate owner approval:

1. Acquire a transaction and set conservative `lock_timeout`/`statement_timeout`.
2. Fail closed unless ledger/base SHA receipt is approved and Production still has zero generic snapshot-v2 rows, zero fixed-`un`-v1 item markers and zero closed-v1 item markers.
3. Fail closed unless all seven function signatures and captured definition SHA-256 receipts match this audit.
4. Replace `adle_lesson_snapshot_is_structurally_valid(jsonb)` with the same v3 route dispatch and no snapshot-v2 branch. Keep its name, immutability, search path and grants.
5. Drop, by exact signature and without `CASCADE`, in dependency-safe order:
   - `persist_adle_generic_daily_plan_v2(...)`;
   - `adle_generic_lesson_snapshot_is_structurally_valid(jsonb)`;
   - `adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)`;
   - `persist_adle_composed_daily_plan_v1(...)`;
   - `persist_adle_base_word_family_pilot_v1(...)`;
   - `persist_adle_base_word_family_pilot_v2(...)`;
   - `complete_adle_word_lab_v1(...)`.
6. Revalidate the existing lesson-snapshot constraint against the two current v3 rows; do not recreate or lock/rewrite learner data.
7. Assert v3 writers, protected completion functions, R8 functions, active cron and all protected tables remain present with expected grants.
8. Commit. No data manipulation statement is included.

The same controlled release should make only the corresponding repository maintenance changes:

- remove the unused `persistWordLabCompletion`, `WordLabCompletionCounts`, and `WordLabCompletionResult` exports while retaining the shared reflection and current release-bound completion types;
- retire or rewrite `scripts/adle-d4-mor-atomic-persistence-regression.ts`, which exists solely to invoke the retired composed-plan/Word-Lab-v1 RPCs;
- add a new migration regression proving the seven exact signatures are absent, the aggregate validator is v3-only, and all current/historical authorities remain;
- leave historical migration files and their historical-definition regressions unchanged unless a regression is explicitly a current-Production presence assertion;
- update retired operational verification scripts that require the old function to exist (`adle-dynamic-prefix-pedagogy-production-release.ts` and `apply-adle-route-metadata-staging-migration.ts`) so they cannot be mistaken for current release paths.

Expected locks are brief `ACCESS EXCLUSIVE` function-object locks plus catalogue locks for `CREATE OR REPLACE`/`DROP FUNCTION`; no table drop or row rewrite is planned. Constraint validation is already satisfied and should be tested locally for lock behaviour before Production approval.

## Restoration strategy

Rollback is a new forward restoration migration, never migration-ledger repair:

1. recreate the v2 validator and generic wrapper from their captured `pg_get_functiondef` receipts;
2. restore the aggregate validator's v2 branch;
3. recreate the five writer/completion functions from their captured definitions;
4. restore exact service-role/authenticated grants and revoke public/anon as captured;
5. verify all definition hashes and regression contracts;
6. do not alter learner rows or replay assignments.

The historical migrations remain untouched and provide provenance, but restoration should use the final Production definitions captured at E7A rather than replaying old migrations.

## Owner gate

No cleanup may begin until the owner explicitly approves the seven-function forward-migration scope, the aggregate-validator v3-only replacement, the lock window, the preflight fail-closed assertions, and the restoration migration/receipt. Approval must not be inferred from E7A audit approval.
