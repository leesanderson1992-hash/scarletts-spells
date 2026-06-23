# Current Priorities — Scarlett’s Spells

## Current Private MVP Scope

The current launch MVP is private, parent-led use for one child. The parent can
use `Review Work` as the canonical review surface for structured lesson/test
submissions and manual writing-sample handoff, inspect durable submitted
payloads, approve or return work, let the child retry returned work, review
safe returned-correction continuity, add missed spellings, and rely on
dashboard/progress language as advisory rather than automatic mastery truth.

This scope is implemented and QA-supported by the focused Review Work,
returned-child correction, Stage `7F`, structured submission payload, parent
candidate-capture, parent-local promotion, PCRM evidence-boundary, typecheck,
and production-build checks.

MVP readiness status is `Ready with caveats`: the product is suitable for
controlled private parent-led use, not broad public release. Browser smoke
confirmed parent login/session, dashboard, advisory progress wording, Review
Work queue/detail, a sent-back structured lesson submission, unified spelling
review, parent-added missed words, disabled approval while unresolved, and
send-back controls. The smoke did not mutate data and did not directly cover
child retry in-browser because browser control became flaky; the focused
returned-child correction regression covers that path.

Release-boundary caveat: do not push blindly. The private MVP closeout commit
must include only the current priorities update, the parent-verified candidate
capture regression harness maintenance, and the approved deletion of
`docs/D4 Seeding Map Finale Final.xlsx`; local Supabase temp artifacts remain
excluded.

## Explicitly Not In MVP

- resolver-visible canonical mappings
- automatic mastery / Stage `8`
- reward-system expansion
- word-map runtime assignment routing
- broad AI diagnosis
- hosted backfill
- new writing domains

## Next Safe Slice After Launch

1. Version 2 roadmap Slice `5`: child-local reuse and suggestion improvement,
   unless an operational need makes the optional canonical mapping
   operations/audit hardening follow-up more urgent.
2. Optional production-scale canonical mapping operations/audit hardening now
   that the CSV import -> canonical adoption -> resolver visibility -> runtime
   categorisation path is live. This is not required for the core flow to work,
   but may be useful before larger imports. Potential scope: pagination/search,
   operator filters, visible/hidden rollback clarity, audit export/runbook, and
   monitoring for resolver-visible mapping effects.
3. Real-data PCRM/canonical adoption smoke after launch readiness, without
   fixture data as product proof, if PCRM remains a near-term source path.
4. Manual/operator review of the two canonical-lineage-protected pre-June
   structured warning submissions and the remaining post-cleanup
   duplicate/pending warning row, if further cleanup is still desired.

## Current initiative

- The bounded Parent Review spelling workflow MVP loop is complete and
  QA-passed for private parent-led use.
- Version 2.0 Slice `5A` parent Review Work friction reduction is implemented:
  eligible existing-skill decisions now compose parent-local promotion with
  idempotent PCRM admin recommendation evidence submission. The separate
  parent `Recommend this pairing for review` button is removed in favor of
  simple status text. Parent actions still cannot create canonical truth,
  enable resolver visibility, mutate `micro_skill_catalog`, or change
  assignment, mastery, rewards, dashboards, analytics, scoring, templates, or
  completion gating. No migration was needed. Focused regressions, build,
  typecheck, and targeted lint passed. Browser smoke is confirmed on the
  parent Review Work page: changing the recommended skill selection exposes
  the `!` action as `Use this skill and send for admin review`; one click
  saves locally, creates admin recommendation evidence visible in
  `/admin/canonical-recommendations`, and leaves no separate recommend or
  promote-locally-first parent step.
- Version 2.0 Slice `5B` parent-local reuse/suggestion improvement is
  implemented: same-parent/same-child `parent_local_promoted` mappings now
  surface in future eligible Review Work rows as `Your saved match` and can
  prefill the family/cluster/skill selectors. This reuse remains scoped,
  reversible, and non-canonical; pending, reverted, other-parent, other-child,
  inactive, non-assignable, non-D4, and mismatched mappings do not become
  suggestion truth. No migration or resolver/canonical/catalog mutation was
  needed.
- Version 2.0 roadmap registration is now the active docs-first planning
  direction: use
  [docs/implementation/version-2-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/version-2-roadmap.md:1)
  to plan daily assignment practice and accelerated spelling-engine
  population without weakening truth boundaries.
- Version 2.0 Slice `4` bulk candidate mapping import/review is implemented
  and production-smoked through the import-to-resolver-visible canonical truth
  path
  in
  [docs/implementation/version-2-slice-4-bulk-candidate-mapping-import-review-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/version-2-slice-4-bulk-candidate-mapping-import-review-plan.md:1).
  Slice `4A.1` is implemented as a pure CSV parser and file-only validator.
  Slice `4A.2` is implemented as optional read-only catalog and canonical
  comparison, gated by explicit flags and anon-key access only. Slice `4A.3` is
  implemented, QA-audited, and local smoke-tested as optional read-only
  supporting evidence comparison for parent-local mappings, catalog-review
  cases/decisions, and PCRM recommendations. Slice `4A.4` is implemented as
  operator hardening and docs closeout. Slice `4A` is complete as a
  dry-run/report-only operator planner. Supporting evidence remains
  manual-review signal only and does not create canonical/global/resolver truth.
  Slice `4A` did not add migrations, write Supabase rows, create canonical
  mappings, expose resolver-visible truth, mutate `micro_skill_catalog`, or
  change Review Work, assignments, mastery, rewards, analytics, dashboards,
  scoring, or templates. Slice `4B` is now registered as docs/planning only for
  dedicated `spelling_seed_import_batches` and `spelling_seed_import_rows`
  storage. It confirms dedicated seed storage is safer than reusing PCRM or
  catalog-review tables, defines statuses, lineage, idempotency,
  duplicate/conflict handling, RLS/admin boundaries, audit fields, rollback
  expectations, and migration gates, and authorizes no migration, runtime code,
  Supabase mutation, import/apply mode, canonical mapping creation, resolver
  visibility, Review Work change, assignment change, or `micro_skill_catalog`
  mutation. Slice `4C` is implemented as the seed import storage foundation
  only via unique timestamp migration
  `supabase/migrations/20260614120000_add_spelling_seed_import_storage.sql`.
  It creates dedicated `spelling_seed_import_batches` and
  `spelling_seed_import_rows` tables with constraints, indexes, RLS,
  `anon`/`authenticated` revokes, `service_role` grants, audit fields, row to
  batch FK, `suggested_micro_skill_key` FK, nullable future canonical lineage,
  and duplicate row lineage. Slice `4C` did not add import/apply mode, seed row
  import, runtime app behavior, canonical mapping creation, resolver
  visibility, Review Work behavior, assignments, mastery, rewards, analytics,
  dashboards, scoring, templates, or `micro_skill_catalog` mutation.
- Slice `4C` is production-released. A no-op compatibility migration
  `supabase/migrations/20260421_add_false_positive_to_misspelling_instances.sql`
  was added so the Supabase CLI can compare the legacy production ledger row
  without migration repair. The approved production release then applied, in
  order, `20260605103000`, `20260605144500`, `20260608193000`,
  `20260612103000`, and `20260614120000` through
  `supabase migration up --db-url ... --include-all --yes`. Production ledger
  now records all expected active migration versions through Slice `4C`.
  Production verification confirmed the seed import tables exist with RLS
  enabled, no policies, `service_role` grants only, expected constraints/FKs,
  and expected indexes. No migration repair, hosted SQL patch,
  `supabase db push`, seed import, import/apply mode, or runtime behavior
  change was run.
- Slice `4D` is implemented in source as a service-role/operator-only
  candidate-review import command:
  `npm run writing-engine:seed-import-candidate-review`. It requires the
  original CSV, the exact Slice `4A` dry-run JSON report, a Slice `4C` schema
  proof artifact, a source license note, service-role credentials in operator
  context only, and the explicit confirmation token
  `IMPORT_SEED_CANDIDATE_REVIEW_ROWS`. It validates current CSV contents
  against the approved dry-run report, source/report hashes, dry-run schema
  version, normalization version, safe candidate buckets, import-time
  active/assignable/D4 micro-skill eligibility, duplicate/conflict evidence,
  existing active source hashes, local-vs-hosted write approval, Slice `4C`
  RLS/grant/index/constraint proof, and protected table counts, then writes
  only `spelling_seed_import_batches` and `spelling_seed_import_rows`. A
  local-only smoke command exists as
  `npm run writing-engine:seed-import-candidate-review-local-smoke`; local
  smoke passed against `127.0.0.1` / local Supabase with synthetic local-only
  data, inserting one seed batch and one eligible seed row, verifying duplicate
  source-hash blocking, and confirming protected table counts were unchanged.
  Slice `4D` did not add
  migrations, app runtime behavior, admin UI, hosted Supabase mutation,
  canonical mapping creation, resolver visibility, Review Work behavior,
  assignment generation, mastery, rewards, analytics, dashboards, scoring,
  templates, parent/child RLS policies, or `micro_skill_catalog` mutation.
- Slice `4E.0` is registered as docs/planning only for seed-row admin review.
  It defines a no-migration private-MVP contract using existing
  `spelling_seed_import_rows` status/review fields for status-only decisions
  such as keep pending, reject, duplicate, conflict blocked, supersede, or
  nominate for later canonical adoption. It explicitly reserves
  `adopted_hidden_canonical`, `canonical_mapping_id`, and
  `spelling_canonical_mappings` writes for later Slice `4F`; it does not add
  runtime code, migrations, Supabase mutation, admin UI, resolver visibility,
  Review Work behavior, assignments, mastery, rewards, analytics, dashboards,
  scoring, templates, parent/child access, or `micro_skill_catalog` mutation.
- Slice `4E.1` is implemented as a server-only admin/operator read
  model/listing at `/admin/seed-import-review`, linked from the spelling admin
  hub and admin navigation. It reads `spelling_seed_import_batches`,
  `spelling_seed_import_rows`, and `micro_skill_catalog` labels only after the
  existing admin allowlist guard, displays seed provenance and review-read-model
  fields, and adds no decision actions, Supabase writes, canonical mapping
  creation, `canonical_mapping_id` writes, resolver visibility, Review Work
  behavior, assignments, mastery, rewards, analytics, dashboards, scoring,
  templates, parent/child access, or `micro_skill_catalog` mutation.
- Slice `4E.2` is implemented as server-only, status-only admin/operator
  review decision actions for imported seed rows. The action path calls
  `requireAdminUser()` before service-role use, updates only existing
  `spelling_seed_import_rows` review/status fields, supports keep pending,
  reject, duplicate, conflict blocked, nomination for later canonical adoption,
  and supersede, and validates duplicate targets against the same normalized
  misspelling, correction, and dialect by default. It does not create
  canonical mappings, write `canonical_mapping_id`, set
  `adopted_hidden_canonical`, enable resolver visibility, change Review Work,
  generate assignments, or mutate `micro_skill_catalog`.
- Review Work now supports engine suggestions, parent-added missed words,
  send-back, child retry, returned correction continuity, returned correction
  categorisation/admin/parent-local routing where safe, compact unified spelling
  table presentation, completion gating, historical terminal verification
  ownership, and `checking_only` terminal handling.
- Slice `4F` explicit hidden-canonical adoption from seed rows is implemented
  and local/source QA-passed. It adds a service-role-only security-definer RPC,
  first-class `source_seed_import_row_id` canonical lineage, a
  `seed_import_adopted` canonical mapping event, a server-only admin action
  under `/admin/seed-import-review`, and a simplified admin queue where safe
  rows can be adopted for canonical review or rejected. Adoption can nominate
  the seed row when needed, then creates or links hidden active canonical
  mappings only. Rejected and adopted rows leave the active queue. Resolver
  visibility remains disabled.
- Slice `4F.1` adds a guarded local/staging smoke harness:
  `npm run writing-engine:seed-import-hidden-canonical-adoption-local-smoke`.
  Local smoke passed after applying the new 4F migration to local Supabase
  only, creating synthetic seed-import evidence, adopting one real nominated
  seed row into hidden canonical truth, verifying `resolver_visibility_status =
  'hidden'`, verifying `created` and `seed_import_adopted` events, and proving
  protected table counts plus `micro_skill_catalog` stayed unchanged. The
  smoke refuses production Supabase and allows staging only with an explicit
  staging confirmation.
- Hosted production release for the 4F migration is complete. The release used
  a manual single-migration SQL patch after a production migration-ledger and
  schema preflight, then recorded version `20260618120000` in
  `supabase_migrations.schema_migrations`. Post-release verification confirmed
  the RPC exists, seed-row lineage columns exist, `seed_import_adopted` is
  allowed, seed rows still have no anon/authenticated grants, and only
  `service_role` can execute the 4F RPC.
- Slice `4G.0` / `4G.0a` resolver visibility readiness/audit is implemented
  and production-used at `/admin/spelling-canonical-resolver-readiness`.
  Resolver visibility enablement is explicit and audited through the existing
  admin visibility route, not automatic during import/adoption.
- Production runtime resolver-visible canonical truth is now enabled and
  smoke-proven. Vercel production has
  `WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled`; an imported
  seed row was adopted for canonical review, appeared as hidden canonical
  truth, appeared in resolver readiness, was explicitly enabled for resolver
  visibility, and then correctly highlighted/categorised a canonical truth word
  in submitted learner work. This proves the full production chain:
  CSV import -> adopt for canonical review -> hidden canonical mapping ->
  readiness audit -> explicit resolver visibility -> runtime categorisation.

## Current stage

- Stage `7` Review Work integration is implemented through:
  - `7A` Add Writing Sample intake and Review Work handoff
  - `7B` unified Review Work queue visibility
  - `7C` Review Work detail suggested-issues visibility
  - `7D` parent verification actions in Review Work
  - `7E` queue/archive/status coherence
  - `7F` parent review action restoration and bounded spelling-loop closeout
- `Parent-Verified Spelling Candidate Capture` Slice `3` is implemented and
  validated:
  - parent-local promotion can make pending candidate mappings reusable only
    inside the same parent/child scope
  - no parent action creates global canonical mapping truth
- current active work has moved through Slice `4A`, `4B.0`, `4B.1`, and the
  admin/internal access foundation prerequisite for Slice `4C`:
  - define parent-facing `No matching skill`
  - define `Send this spelling case to catalog review.`
  - define future `spelling_catalog_review_cases`
  - define bounded family/cluster filtering as Slice `4B.0`
  - define parent case capture as Slice `4B.1`
  - define minimal admin review as Slice `4C`
  - implement the private-MVP admin/internal access foundation defined in
    [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
  - define admin decisions and canonical promotion as Slice `4D`
  - keep migrations, runtime code, Review Work UI, tests, package files,
    resolver behavior, mastery, rewards, assignments, scoring, analytics,
    template routing, and manual writing sample scope unchanged
- the bounded post-Stage-`7` parent-facing evidence-transparency slice is now
  implemented:
  - dashboard and insights wording is advisory where evidence is still immature
  - Review Work remains the canonical parent review surface
- Durable Structured Submission Payloads is closed for the bounded Pass
  `1`-`4` track:
  - storage foundation, submit persistence, child revisit hydration, approval
    draft-deletion safety, and returned-child legacy recovery are implemented
    and QA-passed
  - approval does not delete the only structured answer source for vulnerable
    legacy lesson/test submissions
  - returned structured work remains draft-first and editable
  - follow-up correction contract is now implemented for the bounded Parent
    Review spelling loop, including returned correction visibility and
    parent-added returned spelling rows
- hosted Supabase migration infrastructure is closed for source, local,
  staging, and production ledger alignment:
  - production ledger now contains the unique baseline row
    `20260525123937/baseline_current_production_schema`
  - do not replay the baseline over an existing production schema
  - do not run old archived duplicate migrations, blind migration repair, or
    casual historical migration renames
  - local rebuild proof, staging database rebuild proof, and staging
    app/browser smoke have passed for the new unique baseline migration
  - staging app/browser smoke covered login/dashboard, structured submission
    durable payload persistence and hydration, Review Work approval/archive,
    admin catalog-review load, and a staging-only `No matching skill` promotion
    into an open catalog-review case
  - the staging catalog-review smoke used `STAGING_SMOKE_*` micro-skill seed
    data only; that seed is not part of the baseline or migration history
  - future production DB-changing releases remain gated on explicit ledger
    checks and unique timestamp migrations
  - future DB-changing work must follow
    [docs/operations/supabase-migration-policy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/operations/supabase-migration-policy.md:1)
- local QA/build state currently supports private parent-led use for one child:
  - focused Review Work regressions pass
  - PCRM boundary regression passes
  - `npx tsc --noEmit` passes
  - `npm run build` passes
  - browser smoke passed on a current Review Work record
- do not blindly push dirty local worktrees; run git-safety checks and focused
  QA for the current slice before release

## Next stage

- choose the next slice explicitly after Review Work closeout:
  - Parent Recommended Canonical Mapping is implemented through PCRM-D:
    PCRM-A docs/contract, PCRM-B evidence model/read path, PCRM-C parent
    recommendation action/UI, and PCRM-D admin recommendation review/curation
    are complete and validated
  - PCRM-D updates only `spelling_canonical_mapping_recommendations`
    status/audit metadata; it does not create or link
    `spelling_canonical_mappings`, mutate `micro_skill_catalog`, mutate
    parent-local candidate mappings, merge `No matching skill` with PCRM, or
    change completion gating, mastery, rewards, assignments, analytics,
    dashboards, scoring, or resolver behavior
  - PCRM-D browser smoke used Option A: focused regressions and build passed,
    but no naturally generated pending recommendation row was available for
    real pending-row browser smoke
  - `scripts/dev-pcrm-recommendation-fixture.ts` is local/staging/manual smoke
    support only, not production seed data
  - R3 resolver runtime adoption is now production-enabled for explicitly
    resolver-visible canonical mappings through
    `WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled`; the next
    active resolver/canonical work should focus on controlled scale,
    auditability, rollback, and operator UX, not generic resolver runtime
    implementation
  - PCRM-G accepted-evidence canonical adoption is implemented in source as an
    admin-only, DB-changing slice with a new unique timestamp migration/RPC;
    it creates or links canonical mapping truth, sets recommendation
    `canonical_mapping_id` only after adoption succeeds, writes PCRM adoption
    audit lineage, and leaves resolver visibility disabled
  - existing admin catalog-review `Add canonical mapping` is now the
    smoke-proven path for canonical truth population from real Review Work
    `No matching skill` evidence: hosted-staging smoke created canonical
    mapping `893fdd29-c09c-41f6-b568-9558a4b9de48` from source case
    `b4f67f65-574d-4465-8785-a1c2b36fb6c9` and decision
    `a05adb3a-2b8e-4bd0-bff7-c8a11f7a0ddd`; `resolver_visibility_status`
    remained `hidden`, metadata `resolver_visible` remained `false`, no
    `resolver_visibility_enabled` event was created, and resolver runtime
    regressions passed
  - PCRM-G remains separately blocked for hosted browser smoke by lack of
    meaningful PCRM recommendation data; do not use PCRM fixture data as the
    product proof while catalog-review already proves real Review Work
    canonical truth creation
  - unsupported returned rows without safe lineage remain blocked/deferred until
    a future provenance-expansion slice
  - parent adding a missed word after work is already returned still uses the
    resend lifecycle unless a future docs-first slice plans a safe shortcut
- no runtime Stage `8` automatic mastery implementation should begin until the
  mastery/evidence boundary is rechecked against the live product copy
- for Durable Structured Submission Payloads, the next safe work is a
  manual/operator review of the known remaining non-critical warning rows if
  further historical cleanup is desired; do not start hosted backfill,
  resolver, admin/catalog-review, catalog mutation, mastery, rewards,
  assignments, scoring, analytics, dashboards, or template-routing work from
  that closeout
- `4E.3` / R3 resolver integration is implemented, QA-passed, production
  deployed, and runtime-enabled for explicitly resolver-visible canonical
  mappings. Blocked resolver-visible states do not fall through; Stage `2C` /
  Stage `3A` pure helpers remain unchanged; no schema or migration changes were
  introduced. Runtime rollback remains removing/unsetting
  `WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS` in Vercel production,
  while mapping-level rollback remains the audited admin disable action.

## Blockers / open risks

- the roadmap must stay the single active implementation plan for this program
- historical planning docs must remain clearly marked as historical, not active
- production release must not blindly push the current dirty `main` worktree
- parent-facing dashboard and insights surfaces must remain advisory rather
  than implying automatic mastery certainty
- new writing-engine work must not reintroduce route-local domain logic, revive
  the retired spelling runtime, or bypass canonical Review Work truth
- parent-raised spelling catalog gaps must not directly create global
  canonical mappings or new micro-skills
- open/pending catalog-review cases must remain invisible to the resolver
- parent notes and reasons must remain evidence only
- Slice `4C` remains read-only internal triage only; admin decisions,
  canonical/global promotion, micro-skill creation, catalog mutation, and case
  closing/merging/superseding/reopening remain deferred to Slice `4D` or later
- hosted Supabase/auth/test-harness issues must be kept separate from genuine
  product defects in future QA passes
- hosted Supabase migration-ledger drift must be treated as a release-safety
  gate for DB-changing work; production DB deployment requires an explicit
  ledger check before applying any migration

## Active source-of-truth links

- [docs/implementation/version-2-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/version-2-roadmap.md:1)
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)
- [docs/architecture/writing-engine-foundation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-foundation.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)
- [docs/support/vercel-launch-checklist.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/support/vercel-launch-checklist.md:1)
- [docs/operations/supabase-migration-policy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/operations/supabase-migration-policy.md:1)
