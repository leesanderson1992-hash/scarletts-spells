# Current Priorities — Scarlett’s Spells

## Current ADLE 7-UI Priority

Current ADLE priority: `PR 7-UI-H pilot amendments and runtime payload contract freeze`.

PRs 7-UI-A through 7-UI-F established the programme documentation, activity
registry, approved D4_MOR source package and reusable morphology primitives.
PR 7-UI-G implements the `D4_MOR_PREFIXES_UN` Word Lab vertical pilot and has
completed automated, authenticated real-route and disposable-database
engineering QA. The owner preview was accepted on 2026-07-14.

The Word Lab remains an explicitly generated, child-allowlisted pilot. It is
not broad D4_MOR runtime truth and must stay disabled outside the allowlist
until the Mac Safari and Chrome desktop/responsive accessibility matrix,
performance and genuine-child proof are recorded. Browser 200% zoom,
operating-system reduced-motion execution, native
Windows/Android/iOS and screen-reader checks are optional follow-up coverage.
7-UI-H may amend the pilot from that evidence
and freeze the v1 payload/resume compatibility contract; it must not bulk
activate the remaining D4_MOR category.

Authoritative links:

- [ADLE 7-UI Programme Roadmap](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/adle-7-ui-roadmap.md:1)
- [ADLE 7-UI Control Matrix Guide](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/adle-7-ui-control-matrix.md:1)
- [ADLE 7-UI-G Observation Ledger](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/qa/adle-7-ui-g-observation-ledger.md:1)
- [ADLE 7S Reflection Recall-Gate Proof](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/qa/adle-slice-7s-reflection-recall-gate-proof-2026-07-10.md:1)
- [D4_MOR Morphology UX Design Pack](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/d4-mor-ux-design-pack.md:1)

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
the obsolete D4 seeding-map workbook; local Supabase temp artifacts remain
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

1. Real-data PCRM/canonical adoption smoke after launch readiness, without
   fixture data as product proof, if PCRM remains a near-term source path.
2. Manual/operator review of the two canonical-lineage-protected pre-June
   structured warning submissions and the remaining post-cleanup
   duplicate/pending warning row, if further cleanup is still desired.
3. Optional additional production-scale canonical mapping operations/audit
   hardening after real operator use. Slice `4H` already provides the primary
   paginated `/admin/canonical-mappings` operations surface, search/filtering,
   export, audit summaries, and rollback copy; only extend this if larger
   imports or live usage expose a concrete operational gap.

## Current initiative

- Returned-correction learning route planning is now clarified: child retry is
  not categorisation. Parent sends spelling corrections back with correction
  text and child-facing guidance only; final educational outcome is chosen only
  after the child retry or "I think this is right" response.
- Returned corrections may complete as non-learning outcomes
  `checking_only` or `not_an_issue` without a micro-skill. Learning-relevant
  outcomes `fragile_knowledge`, `concept_gap`, and `transfer_failure` require
  an active assignable route before they can create or strengthen a child
  `learning_item`.
- Parent-local promoted routes may support learning-item creation only when
  they explicitly become a child-scoped, active assignable route. A parent
  recommendation that is not confirmed/promoted is route evidence only, not
  learning-queue truth.
- Admin handoff means deferred route support. It must not put the item into the
  child learning queue, must not imply a learning item was created, and may be
  repaired later only by controlled reconciliation once admin/canonical truth
  supplies an assignable route.
- `Stage A: Review Work Returned-Correction Learning Route Diagnostics` is
  implemented as a read-only diagnostic model in
  `lib/writing-engine/persistence/returned-correction-learning-route-diagnostics.ts`.
  It reports source ids, issue state, durable micro-skill, parent-local/admin
  route status, catalog active/assignable status, learning-item linkage,
  retry-readiness, learning-queue-readiness, disposition, and why-not reasons.
  Focused regression:
  `npm run writing-engine:returned-correction-route-diagnostics-regression`.
- `Stage B: Returned-Correction Workflow Gate Fix` is implemented. Learning-gap
  final classification now checks the durable `writing_issues.micro_skill_key`
  against active assignable `micro_skill_catalog` truth before calling the
  finalisation RPC. Unknown, uncatalogued, inactive, or non-assignable durable
  routes are blocked before finalisation, leaving child retry evidence intact.
  Returned-correction route capture may record pending learning-gap route intent
  for parent-local/admin route evidence without writing final classification to
  the issue. Admin-deferred returned learning gaps block ordinary approval and
  are not learning-queue-ready. Focused regression:
  `npm run writing-engine:returned-correction-stage-b-regression`.
- Stage `B.1` to `B.3` Review Work UI amendments are implemented. Pre-retry
  Review Work is a correction/feedback surface only: it hides micro-skill
  selectors, learning-route recommendations, parent-local promotion, and admin
  route controls. After child response, the unified spelling table is
  reason-first: `Reason` appears before `Learning route`, and route controls
  appear only after a learning-relevant outcome is selected or already saved.
  `checking_only` and `not_an_issue` remain non-learning outcomes that can save
  without a route.
- `Stage C: Parent-Local/Admin Route Bridge` is implemented with no migration.
  When a returned correction is finalised as learning-relevant and the durable
  issue route is still missing/unknown, the server may bridge only an explicit
  `parent_local_promoted` candidate mapping for the same parent, child,
  original `writing_issue`, returned attempt/submission lineage, and active
  assignable micro-skill. The bridge writes the verified route onto
  `writing_issues.micro_skill_key`, records audit metadata under
  `returned_correction_route_bridge`, and only then calls the existing
  finalisation RPC. Parent recommendations alone and admin handoff remain
  deferred route evidence and do not create learning items. Stage D remains the
  historical repair/backfill slice. Focused regression:
  `npm run writing-engine:returned-correction-stage-c-regression`.
  Browser smoke on 25 Jun 2026 confirmed the Review Work queue shows returned
  issues to finalise, returned detail shows `Reason` before `Learning route`,
  and selecting `concept_gap` reveals learning-route controls without
  submitting.
- `Stage D: Backfill / Repair Existing Data` is implemented as a dry-run-first
  operator repair path for historical returned-correction rows finalised before
  the explicit bridge existed. The default command,
  `npx tsx scripts/returned-correction-stage-d-repair.ts --child-id <child-id>`,
  reports stable JSON with issue ids, child/submission lineage, observed and
  correction text, final classification, durable route, parent-local/admin
  route status, catalog active/assignable status, existing learning-item links,
  proposed mutations, and why repair is or is not safe. Apply mode requires
  `--apply` plus `--child-id` and either `--submission-id` or
  `--writing-issue-id`. Repair does not invent learning truth: it only repairs
  learning-relevant finalised rows with child retry evidence and an active
  assignable durable route, or a Stage C-proven parent-local promoted route.
  Parent recommendations alone and admin handoff remain deferred route support.
  No rewards, mastery claims, daily assignments, `micro_skill_catalog`
  mutation, RLS broadening, or browser service-role path is introduced. Focused
  regression: `npm run writing-engine:returned-correction-stage-d-regression`.
- Future launch-scale route reconciliation is required: when a learning-relevant
  returned correction is finalised without a matching active assignable route,
  the evidence must remain queryable as deferred route support. Later canonical
  mapping adoption or admin micro-skill creation must be able to replay those
  deferred rows through an explicit dry-run-first reconciliation job so the
  child can still receive the learning item once route support exists. Canonical
  truth is route support only; it must not by itself create rewards, mastery,
  daily assignments, or learning items without the preserved learning-relevant
  final classification and an active assignable route.
- `Stage E: Scoped Deferred Admin Reconciliation` is the current production
  repair phase pattern for reviewed returned corrections that are
  learning-relevant but have no canonical/admin route yet. The scoped
  production pass finalised the reviewed rows as `concept_gap`, confirmed that
  no active canonical mappings existed for those pairs, created open admin
  review cases, and deliberately created no learning items, evidence rows,
  rewards, mastery claims, daily assignments, or route mutations. This keeps
  the rows recoverable once admin/canonical route support exists.
- `Stage F: Deferred Route Replay / Launch-Scale Reconciliation` is
  implemented through F.2/F.3 discovery and visibility. The pure planner
  `lib/writing-engine/persistence/returned-correction-deferred-route-replay.ts`
  remains the truth model; the shared helper
  `lib/writing-engine/persistence/returned-correction-deferred-route-replay-apply.ts`
  is used by the existing replay script, the admin/canonical hook, and the
  sweep. The script
  `scripts/returned-correction-stage-f-deferred-route-replay.ts` provide
  dry-run-first replay for finalised Stage E/admin-deferred rows once
  canonical/admin truth supplies an active assignable route. Admin catalog
  decisions that add canonical mapping route support or link an existing skill
  now surface matching deferred rows into
  `returned_correction_replay_recommendations`; the scheduled-safe sweep
  `scripts/returned-correction-stage-f-sweep.ts` catches missed rows and is
  dry-run by default. Apply remains manual/operator scoped and observable.
  Canonical/admin truth supplies route support only: learning item replay still
  requires the preserved learning-relevant final classification, returned
  correction attempt evidence, and an active assignable route. No rewards,
  mastery, daily assignments, child-side categorisation, RLS broadening,
  catalog mutation, or browser service-role path is introduced. Focused
  regressions:
  `npm run writing-engine:returned-correction-stage-f-regression` and
  `npm run writing-engine:returned-correction-stage-f-automation-regression`.
  Stage F.2/F.3 is closed for now as an emergency net. The current
  `waitingForRoute` row is intentionally blocked because it is a
  homophone/context-use issue: the child's spelling is a valid word used
  incorrectly in context, not a missing spelling micro-skill. Do not create a
  placeholder micro-skill or canonical route for it. Revisit only when a true
  no-matching-skill spelling case appears or when a homophone/context learning
  model is explicitly designed. Queue verification for replayed learning items
  should wait until there is an actual manually applied replay candidate.
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
- Version 2.0 Slice `5` is closed. Its refined objective is met: sending a
  parent-selected spelling route to admin review now promotes the mapping
  locally as `parent_local_promoted`, so the child can benefit within the
  current parent/child scope while canonical/admin truth is pending; later
  matching rows can reuse that same scoped route as `Your saved match`. This
  remains temporary parent-local route support only, not global canonical truth
  or resolver-visible truth.
- Version 2.0 Slice `4H` canonical mapping operations/audit hardening is
  implemented: `/admin/canonical-mappings` is now the primary paginated
  operations surface for searching, filtering, exporting, and auditing
  canonical mappings and resolver visibility. It shows status/visibility
  counts, source lineage, latest audit event summaries, and clearer rollback
  copy. CSV export is admin-only, read-only, capped, and includes applied
  filters. No migration, canonical adoption change, resolver rule change,
  parent Review Work change, assignment/mastery/reward/dashboard/analytics/
  scoring/template change, or `micro_skill_catalog` mutation was needed.
- Version 2.0 roadmap registration is now the active docs-first planning
  direction: use
  [docs/implementation/version-2-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/version-2-roadmap.md:1)
  to plan daily assignment practice and accelerated spelling-engine
  population without weakening truth boundaries.
- ADLE 7P Live Pilot Foundation is implemented as the required bridge after 7a
  and before template UI redesign. Child navigation now points to
  `/learn/week/adle` (`Today's Spelling`), and legacy `/learn/week/practice`
  redirects child-mode traffic to ADLE. `/learn/week/adle` is read-only on load:
  it reads an existing ADLE assignment and does not create `daily_assignments`
  or `assignment_items`. Pilot generation is explicit via guarded command after
  read-only preview and real child identity approval. First proof is
  assignment/evidence/schedule only; Word Treasure is a second proof, not a
  blocker for the first ADLE assignment pilot. See
  [docs/implementation/adle-slice-7p-live-pilot-foundation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/adle-slice-7p-live-pilot-foundation.md:1).
- Legacy Daily Practice remains documented as legacy: it used the old
  `learning_items` path and the `/api/internal/daily-spelling-practice/generate`
  cron. ADLE uses `adle_learning_items`; `assignment_items.learning_item_id`
  remains null by design and ADLE linkage lives in
  `assignment_items.metadata.adleLearningItemRef` plus `adle_learning_items`.
- ADLE 7R Attempt Capture and Evidence Classification Integrity records the
  first live pilot finding: assignment delivery/completion/scheduling worked,
  but item-level first-exposure attempts needed their own ledger. Wrong
  first-exposure attempts are now stored as non-punitive lesson evidence and do
  not create scheduled-review failures or authentic-use events. See
  [docs/implementation/adle-slice-7r-attempt-capture-integrity.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/adle-slice-7r-attempt-capture-integrity.md:1).
- ADLE 7S Reflection Recall Gate closes the live-pilot reflection UX finding:
  a correction card may show the correct spelling for teaching, but the retry
  input appears only after the child hides the word. The next ADLE step is the
  7-UI template UI/UX redesign; see
  [docs/implementation/version-3-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/version-3-roadmap.md:113)
  and
  [docs/implementation/adle-slice-7s-reflection-recall-gate.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/adle-slice-7s-reflection-recall-gate.md:1).
- The scheduled daily spelling practice materializer is implemented as the
  production bridge from active `learning_items` to today's bounded
  `daily_assignments`: Vercel cron calls
  `/api/internal/daily-spelling-practice/generate`, the route requires
  `Authorization: Bearer ${CRON_SECRET}`, computes the practice date in
  `Europe/London`, uses server-only service-role access, and calls the existing
  Slice `6` generator. It caps queued learning items into calm daily practice
  instead of exposing backlog size, and it adds no learning-truth, evidence,
  reward, mastery, canonical, resolver, Review Work, or course-completion
  behavior. Local smoke on port `3005` verified 401 without the cron secret,
  200 with the local cron secret, one generated assignment for the seeded active
  learning-item child, and an idempotent rerun that appended zero duplicate
  items; authenticated browser smoke verified the logged-in child neutral state,
  Daily Practice menu link, `/learn/week/practice`, and legacy child redirects.
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
