# Version 2.0 Roadmap

## Purpose

This is the active Version 2.0 roadmap for Scarlett's Spells after the private
parent-led MVP.

It turns the proven parent-review loop into a reliable daily learning loop with
accelerated spelling-engine population.

Controlling context:
- [docs/current-priorities.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/current-priorities.md:1)
- [docs/workflows/mvp-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/mvp-workflow.md:1)
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- [docs/contracts/canonical-spelling-word-map-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/canonical-spelling-word-map-contract.md:1)
- [docs/contracts/parent-recommended-canonical-mapping.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/parent-recommended-canonical-mapping.md:1)
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/operations/supabase-migration-policy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/operations/supabase-migration-policy.md:1)

This roadmap is documentation only at registration. It does not authorize
runtime code, migrations, resolver behavior changes, Review Work behavior
changes, assignment-generation changes, reward changes, mastery changes,
dashboard changes, analytics changes, scoring changes, or template-routing
changes.

## 1. Version 2.0 goal

Reviewed writing becomes verified learning evidence; verified learning gaps become calm daily practice; repeated spelling evidence rapidly becomes reviewable child-local or admin-canonical mapping suggestions without weakening truth boundaries.

## 2. Product problem

The private MVP proves the parent-review loop:
- child completes structured lesson/test work or parent enters writing through
  `Add Writing Sample`
- `Review Work` is the canonical parent review surface
- parent can inspect engine suggestions and parent-added missed words
- parent can approve, reject, override, send back, and finalise returned
  corrections
- child retry and returned correction evidence are supported
- verified learning gaps can become `learning_items`
- parent-facing progress remains advisory, not automatic mastery truth

Version 2.0 must turn that loop into a daily learning system:

`reviewed writing -> child correction -> verified learning gap -> targeted daily practice -> spaced review -> fresh writing transfer evidence`

The next bottleneck is not parent trust. It is throughput:
- too much manual parent classification
- too little automatic/ranked micro-skill suggestion
- insufficient reusable spelling mapping coverage
- daily practice is not yet strong enough as the child-facing learning habit

Manual classification currently slows engine population:

`wrong spelling -> correct spelling -> choose micro-skill -> promote/recommend/categorise`

Version 2.0 must reduce that workload without letting unreviewed evidence
become truth.

## 3. Version 2.0 pillars

- Daily Assignment Practice: make daily spelling practice a calm, predictable
  child habit sourced from active child-specific `learning_items`.
- Engine Population Acceleration: identify repeated spelling evidence and move
  it into reviewable child-local or admin-canonical mapping workflows faster.
- Stronger Spelling Classification: provide ranked micro-skill suggestions so
  parent/admin review becomes confirmation, not taxonomy hunting.
- Trustworthy Evidence and Mastery Boundaries: preserve parent verification,
  learning-gap creation rules, advisory mastery wording, and transfer evidence
  requirements.
- Controlled Backlog and Child-Calm UX: show the child today's manageable work,
  not every discovered issue.
- Admin/Canonical Curation Safety: keep canonical adoption explicit, audited,
  reversible, and separate from resolver visibility.

## 4. In scope

- daily practice from existing active child-specific `learning_items`
- `assignment_items` as the generated practice delivery surface
- small capped daily practice set
- due reviews before new items
- 1-3 new Nuggets per day
- grouping repeated issues by `micro_skill_key`
- spelling-engine population audit
- ranked micro-skill suggestion helper
- child-local mapping reuse after parent approval/promotion
- admin review/adoption of high-confidence canonical mappings
- bulk candidate mapping import/review workflow
- canonical word-map content used only as supporting content for already-active
  `learning_items` or reviewable mapping suggestions
- false-positive and word-level-only handling as review outcomes
- operator/admin tools to identify top spelling mapping gaps

## 5. Out of scope for first Version 2 slices

- broad AI diagnosis
- automatic mastery
- reward expansion
- new writing domains
- grammar/punctuation/proofreading expansion
- resolver-visible global mappings by default
- hosted historical backfill
- parent free-text micro-skill creation
- raw `misspelling_instances` becoming reusable truth
- open catalog-review cases becoming resolver truth
- word-map rows creating `learning_items` or `assignment_items` by themselves

## 6. Truth boundaries

- raw `misspelling_instances` are evidence only
- parent-added missed words are evidence only
- child returned-correction attempts are retry evidence only, not
  categorisation, mastery, reward, or learning-queue truth
- parent recommendations are route evidence only until explicitly confirmed or
  promoted into a child-scoped active assignable route
- pending candidate mappings are not reusable
- parent-local promoted mappings may be reused only inside the same
  parent/child scope
- PCRM recommendation evidence remains evidence only until explicit admin
  adoption
- accepted PCRM evidence is not automatically canonical truth
- canonical/global spelling mappings require explicit admin adoption
- resolver visibility remains explicit, audited, reversible, and separately
  gated
- word-map rows are content metadata, not mastery, resolver, taxonomy, or
  assignment truth
- only verified learning gaps create or strengthen `learning_items`
- for returned corrections, "verified learning gap" means both a
  learning-relevant final classification and an active assignable route
- daily practice draws from curated active `learning_items`, not the full raw
  backlog
- admin handoff is deferred route support and must not create or imply a child
  learning item

## 6A. Returned-correction learning route contract

Canonical route:
1. Child submits work.
2. Parent reviews the writing, adds missed spelling words, adds correction text,
   and adds child-facing feedback.
3. Parent sends the work back without categorising the learning route.
4. Child either retries the correction or indicates "I think this is right."
5. Parent receives the returned work and chooses the final educational outcome:
   `checking_only`, `fragile_knowledge`, `concept_gap`, `transfer_failure`, or
   `not_an_issue`.
6. Only `fragile_knowledge`, `concept_gap`, and `transfer_failure` require a
   micro-skill route.
7. Parent-local promoted routes may create or strengthen a child learning item
   only when the route is active and assignable.
8. "No matching route" goes to admin as deferred route support.
9. Work can complete only when every returned correction is finalised as
   non-learning, finalised as learning-relevant with an assignable route, or
   explicitly deferred to admin without pretending that a learning item exists.

Admin handoff does not put an item in the child learning queue. If admin or
canonical truth later supplies an assignable route, a controlled reconciliation
step may attach that route and create or strengthen the learning item while
preserving historical evidence.

Launch-scale requirement: "no matching route" must be a durable deferred state,
not a terminal learning loss. When later admin/canonical work adds an active
assignable mapping or creates the missing micro-skill, the system needs an
explicit reconciliation path that finds previously finalised learning-relevant
returned corrections for the normalized pair and replays them into
`learning_items` only after the route is active and assignable. This should be
implemented as a dry-run-first job, ideally triggered by canonical/admin route
events and backed by a nightly sweep. It must not create rewards, mastery,
Forge/Word Treasure/Golden Bar movement, daily assignments, or learning items
from canonical truth alone.

Stage F.2/F.3 now implements that discovery layer without changing the learning
mutation boundary. Admin catalog decisions that add canonical route support or
link an existing active assignable skill surface matching deferred rows as
`returned_correction_replay_recommendations`. The scheduled-safe sweep
`scripts/returned-correction-stage-f-sweep.ts` can dry-run or explicitly upsert
those recommendations with `--upsert-recommendations`; it does not apply
learning-item mutations. The Stage F planner remains the truth model. A replay
recommendation is only actionable when the historical returned correction is
finalised as `fragile_knowledge`, `concept_gap`, or `transfer_failure`, has
returned-correction attempt evidence, and now resolves to one active assignable
route. Admin/canonical truth is route support only, not learning truth by
itself. A future product check is queue verification: prove that manually
replayed learning items enter daily learning planning correctly without
retroactive reward, mastery, daily-assignment completion, or child-facing
completion effects. That verification is deferred until there is an actual
manually applied replay candidate. The current `waitingForRoute` row is
intentionally blocked as a homophone/context-use issue, where the child's
spelling is a valid word used incorrectly in context; it is not a missing
spelling micro-skill and should not receive a placeholder canonical route.

Parent recommendation ladder:
- parent recommendation exists, not confirmed/promoted: suggestion only
- parent recommendation promoted locally and active/assignable: may create or
  strengthen the child learning item
- parent recommendation sent to admin with no assignable route: deferred, no
  learning item
- admin later approves canonical route: reconciliation may repair/create the
  learning item if the final outcome was learning-relevant

Implementation note: `Stage A: Review Work Returned-Correction Learning Route
Diagnostics` is implemented read-only in
`lib/writing-engine/persistence/returned-correction-learning-route-diagnostics.ts`
with regression command
`npm run writing-engine:returned-correction-route-diagnostics-regression`. It
explains row readiness and blocked reasons before behavior changes.

`Stage B: Returned-Correction Workflow Gate Fix` is implemented with regression
command `npm run writing-engine:returned-correction-stage-b-regression`.
Learning-gap finalisation now blocks before the RPC unless the durable issue
route is active and assignable; admin-deferred returned learning gaps remain
deferred and block ordinary approval; parent-local/admin route evidence can
carry pending learning-gap intent without finalising the issue.

Stage `B.1` to `B.3` complete the Review Work UI side of that contract:
pre-retry Review Work is only for corrections, missed words, and child-facing
feedback, so it hides all micro-skill selectors, learning-route
recommendations, parent-local promotion, and admin route controls. Once the
child response returns, the spelling table becomes reason-first: `Reason`
appears before `Learning route`; `checking_only` and `not_an_issue` save
without a route; and learning-route controls appear only after a
learning-relevant outcome is selected or already recorded.

`Stage C: Parent-Local/Admin Route Bridge` is implemented with regression
command `npm run writing-engine:returned-correction-stage-c-regression`. It uses
the existing parent-local candidate mapping table, not a migration: a promoted
local route can bridge finalisation only when it matches the same parent, child,
original issue, returned attempt/submission lineage, and active assignable
catalog micro-skill. The bridge updates `writing_issues.micro_skill_key` with
auditable `returned_correction_route_bridge` metadata before the existing
learning-item RPC runs. Parent recommendations alone and admin handoff remain
deferred route evidence.

Stage C smoke passed on 25 Jun 2026: the Review Work queue surfaced returned
issues to finalise, the returned detail rendered `Reason` before
`Learning route`, and selecting `concept_gap` exposed learning-route controls
without submitting or creating learning truth.

`Stage D: Backfill / Repair Existing Data` is implemented as a targeted,
dry-run-first historical repair path. It scans only an explicit child scope
with optional submission, writing-issue, and limit filters. Dry-run reports the
issue id, child/submission lineage, observed and correction text, final
classification, durable `writing_issues.micro_skill_key`, parent-local/admin
route status, catalog active/assignable status, existing learning-item links
and evidence, proposed action, and why repair is or is not safe.

Apply mode is intentionally narrower than dry-run: it requires `--apply`,
`--child-id`, and either `--submission-id` or `--writing-issue-id`. It may
repair only learning-relevant finalised rows that already have child retry
evidence plus either an active assignable durable route or a Stage C-proven
parent-local promoted route. Stage D may attach that verified parent-local
route to `writing_issues.micro_skill_key`, then create or strengthen the
learning item using the existing final-classification contract shape, including
issue links and evidence. It is idempotent by checking existing links and
Stage D evidence metadata before inserting.

Stage D does not invent learning truth: `checking_only` and `not_an_issue`
remain no-action, parent recommendations alone remain route evidence only,
admin handoff remains deferred route support, inactive/non-assignable routes
are blocked for manual review, and future canonical/admin truth still requires
explicit controlled reconciliation. It does not broaden RLS, expose
service-role access in browser/client paths, mutate `micro_skill_catalog`,
create canonical truth, create rewards, create mastery claims, move Forge/Word
Treasure/Golden Bar state, generate daily assignments, or alter Slice 7 daily
assignment completion behavior.

Commands:
- dry-run: `npx tsx scripts/returned-correction-stage-d-repair.ts --child-id <child-id>`
- scoped dry-run: `npx tsx scripts/returned-correction-stage-d-repair.ts --child-id <child-id> --submission-id <submission-id>`
- apply: `npx tsx scripts/returned-correction-stage-d-repair.ts --child-id <child-id> --submission-id <submission-id> --apply`
- regression: `npm run writing-engine:returned-correction-stage-d-regression`

`Stage E: Scoped Deferred Admin Reconciliation` is now captured as the current
operational phase pattern. For reviewed returned corrections that are
learning-relevant but have no active canonical/admin route, Stage E may
finalise the row as `concept_gap` only when the parent has explicitly reviewed
and confirmed that classification. If the normalized spelling pair is not
already covered by active canonical truth, Stage E sends it to admin review as
deferred route support. It does not attach a route, create a learning item,
insert learning evidence, create rewards, make mastery claims, move Forge/Word
Treasure/Golden Bar state, or generate daily assignments.

The 25 Jun 2026 scoped production pass used this pattern for seven reviewed
rows: they were finalised as `concept_gap`, seven open admin review cases were
created, zero active canonical mappings were found for those pairs, and zero
learning links/evidence/route mutations were produced. This is the desired
safe state until admin/canonical route support exists.

`Stage F: Deferred Route Replay / Launch-Scale Reconciliation` is implemented
for the operator-safe F.0/F.1 scope. Stage F productizes the replay path for
deferred route support:
- dry-run-first, scoped by child/submission/issue/admin case for operator use
- uses existing Stage A diagnostics and Stage C/D learning-item safety checks
- creates or strengthens `learning_items` only when the historical final
  classification is learning-relevant and the new route is active/assignable
- remains idempotent and avoids rewards, mastery, daily assignments, route
  invention, child-side categorisation, and browser service-role exposure
- future F.2/F.3 work should add admin/canonical event hooks and a scheduled
  sweep that call the same planner/mutation contract

### Stage F implementation contract

Role:
- CTO, Writing Engine architect, Supabase/RLS safety reviewer, learning queue
  architect, data-repair engineer, reward-system safety reviewer,
  release-safety reviewer, and docs maintainer.

Implemented:
- Pure helper:
  `lib/writing-engine/persistence/returned-correction-deferred-route-replay.ts`
- Operator script:
  `scripts/returned-correction-stage-f-deferred-route-replay.ts`
- Regression:
  `scripts/writing-engine-returned-correction-stage-f-replay-regression.ts`
- Command:
  `npm run writing-engine:returned-correction-stage-f-regression`

Goal:
- Provide the reusable reconciliation path for finalised learning-relevant
  returned-correction rows that were intentionally deferred because no active
  assignable route existed at finalisation time.
- When admin/canonical route support later exists, Stage F can safely create
  or strengthen the missing child `learning_item` without pretending canonical
  truth alone is learning truth.

Core product truth:
- child retry remains evidence only
- `checking_only` and `not_an_issue` never create learning items
- learning item creation requires both:
  - final classification in `fragile_knowledge`, `concept_gap`, or
    `transfer_failure`
  - active assignable route from durable issue route, Stage C bridge,
    canonical mapping, or explicit admin reconciliation
- admin handoff/deferred route support is not queueable learning truth until
  route support is active and assignable
- canonical truth is route support only; it must not create rewards, mastery,
  daily assignments, or learning items by itself

Inputs to inspect before implementation:
- Stage A diagnostics:
  `lib/writing-engine/persistence/returned-correction-learning-route-diagnostics.ts`
- Stage C bridge:
  `lib/writing-engine/persistence/returned-correction-route-bridge.ts`
- Stage D repair planner/script:
  `lib/writing-engine/persistence/returned-correction-repair.ts`
  `scripts/returned-correction-stage-d-repair.ts`
- finalisation / learning-item contract:
  `app/courses/review/actions/review-completion-actions.ts`
  `lib/writing-engine/persistence/learning-items.ts`
- admin/canonical decision paths:
  `app/courses/review/actions/catalog-review-case-actions.ts`
  `spelling_catalog_review_cases`
  `spelling_catalog_review_case_decisions`
  `spelling_canonical_mappings`
  `spelling_canonical_mapping_events`
  `micro_skill_catalog`

Implemented shape:
- The pure helper classifies rows into already linked, waiting for route,
  replayable via canonical mapping, replayable via admin decision, replayable
  via durable issue route, unsafe/manual review, or skipped non-learning
  outcome.
- The operator script loads scoped candidate rows, active canonical mappings,
  admin decisions, catalog state, attempts, issue links, and evidence, then
  emits stable JSON in dry-run mode.
- Apply mode uses the same planner output and writes Stage F audit metadata on
  route, learning item, link, and evidence mutations.
- Optional later scheduled runner/event hook should invoke this same planner in
  a scoped way.

CLI contract:
- dry-run must be default
- accepted scope:
  - `--child-id`
  - `--submission-id`
  - `--writing-issue-id`
  - `--admin-case-id`
  - `--canonical-mapping-id`
  - `--micro-skill-key`
  - `--limit`
- apply mode requires `--apply`
- apply must refuse broad execution unless scoped by one of:
  - `--writing-issue-id`
  - `--admin-case-id`
  - `--canonical-mapping-id`
  - `--submission-id`
  - or `--child-id` plus an explicit limit
- future scheduled/event mode must still call the same planner and mutation
  contract; it must not have a separate truth model.

Dry-run output:
- summary counts:
  - scanned
  - already linked
  - waiting for route
  - replayable via canonical mapping
  - replayable via admin decision
  - replayable via durable issue route
  - unsafe/manual review
  - skipped non-learning outcome
- per-row records:
  - issue id
  - child id
  - submission id / returned submission id
  - source misspelling instance id
  - observed spelling and correction
  - final classification
  - existing durable `writing_issues.micro_skill_key`
  - matching canonical/admin route support
  - catalog active/assignable state
  - existing learning item/link/evidence state
  - proposed action
  - why safe or blocked
- explicit `dryRun: true` and `mutationsApplied: 0`

Replayable cases:
- learning-relevant finalised row
- child retry / returned correction lineage is present
- no existing complete learning-item link/evidence
- normalized pair now resolves to exactly one active canonical mapping with an
  active assignable `micro_skill_key`, or exactly one explicit admin decision
  that supplies an active assignable route
- source issue state and lineage are compatible with Stage D/Stage C safety
  checks

No-action cases:
- non-learning final outcome
- already linked/repaired
- still no active assignable route
- admin case open but undecided
- canonical/admin route exists but catalog row is inactive or non-assignable

Unsafe/manual-review cases:
- multiple conflicting active canonical mappings for the pair
- conflicting admin decisions
- missing source misspelling lineage
- missing returned attempt/submission lineage
- existing partial learning links/evidence inconsistent with issue state
- route mismatch against a durable non-unknown issue route
- inactive/non-assignable `micro_skill_catalog` row

Apply may only:
- attach a verified route to `writing_issues.micro_skill_key` when the route is
  proven by canonical/admin truth and compatible with issue lineage
- create or strengthen `learning_items` through the existing learning-item
  contract
- create missing `learning_item_issue_links` / `learning_item_evidence` required
  by that contract
- write explicit Stage F audit metadata on issue/evidence rows

Apply must not:
- broaden RLS
- use service role in browser/client paths
- mutate `micro_skill_catalog`
- create canonical mappings or admin decisions
- create rewards, mastery claims, Word Treasure, Forge movement, Golden Bars,
  or daily assignments
- alter Slice 7 completion behavior
- create learning items from canonical truth without preserved
  learning-relevant final classification
- treat open admin review as route truth

Regression coverage:
- dry-run mutates nothing
- finalised `concept_gap` + active canonical mapping + active assignable route
  is replayable
- finalised `fragile_knowledge` and `transfer_failure` follow the same route
  rule
- `checking_only` and `not_an_issue` are skipped
- open admin case without decision remains waiting for route
- active canonical mapping with inactive/non-assignable catalog route is blocked
- multiple active mappings are unsafe/manual review
- already-linked row is idempotent/no action
- apply refuses broad scope
- apply twice does not duplicate learning items, links, evidence, or route
  metadata
- no reward/mastery/daily-assignment writes
- no service-role import in browser/client paths

Verification commands:
- `npm run writing-engine:returned-correction-stage-c-regression`
- `npm run writing-engine:returned-correction-stage-d-regression`
- `npm run writing-engine:returned-correction-stage-f-regression`
- `npx tsc --noEmit`
- `git diff --check`

Rollout:
- Stage F.0: script-only dry-run planner with fixture regression is implemented
- Stage F.1: scoped apply mode for operator use is implemented
- Stage F.2: admin/canonical decision hook that enqueues or recommends replay
  but still exposes dry-run/apply observability
- Stage F.3: scheduled sweep for missed canonical/admin route activation events

Success criteria:
- no matching route becomes durable deferred evidence, not lost learning
- when route support later exists, safe rows can enter `learning_items`
  idempotently
- no row enters learning items without learning-relevant final classification
  and active assignable route
- Stage C/D behavior remains unchanged
- no reward, mastery, daily assignment, RLS, catalog mutation, or client
  service-role regression is introduced

## 7. Proposed Version 2 slice order

Next active planning target: Version 2 roadmap Slice `5` child-local reuse and
suggestion improvement, if the next priority returns to parent Review Work
acceleration.

Slice `3` remains deferred by founder decision. Slice `4` and Slice `5` remain
valid Version 2 product tracks. Stage F is now implemented and should remain in
place as an emergency replay net for rare deferred rows that later gain route
support, not as an active backlog-replay project.

### Slice 0 - Version 2 roadmap registration

Goal:
- create this roadmap doc
- optionally add a short pointer from `docs/current-priorities.md`
- no runtime code
- no migrations

Hard boundary:
- this slice is documentation only

### Slice 1 - Read-only spelling-engine population audit

Status: `implemented as read-only operator audit script`

Goal:
- produce a ranked view of the highest-leverage ways to populate the spelling
  engine

Audit:
- unresolved spelling pairs
- unknown micro-skill rows
- repeated misspelling -> correction pairs
- repeated correction targets
- repeated pattern/micro-skill candidates
- parent-added rows not yet reusable
- parent-local mappings that might merit admin canonical review
- open catalog-review cases
- accepted/unadopted PCRM recommendations
- word-level-only candidates
- likely false positives
- missing D4 micro-skill coverage
- top 50 suggested mapping/micro-skill seed opportunities

Hard boundary:
- read-only only
- no mutations
- no resolver changes

Implementation closeout:
- added `scripts/writing-engine-spelling-population-audit.ts`
- added `npm run writing-engine:spelling-population-audit`
- audit reads spelling evidence, parent-local mappings, catalog-review cases,
  PCRM recommendations when available, canonical mappings, D4 catalog rows,
  learning items, and word-map metadata when available
- audit emits JSON only and treats every opportunity as review-only candidate
  evidence
- hosted/non-local reads require
  `SPELLING_POPULATION_AUDIT_ALLOW_HOSTED_READ_ONLY=true`
- read-only client guard refuses `rpc`, `insert`, `update`, `upsert`, and
  `delete`
- protected table counts are read before and after the audit to confirm the
  script did not mutate the audited database
- no runtime code, migrations, resolver behavior, Review Work behavior,
  assignment generation, rewards, mastery, dashboards, analytics, scoring, or
  template routing changed

Run:

```sh
npm run writing-engine:spelling-population-audit
```

For an explicitly approved hosted read-only audit, set:

```sh
SPELLING_POPULATION_AUDIT_ALLOW_HOSTED_READ_ONLY=true
```

### Slice 2 - Ranked micro-skill recommendation helper and Review Work table prefill contract

Goal:
- for a spelling pair, recommend the top likely active assignable D4
  micro-skills so parent/admin review becomes confirmation and correction, not
  taxonomy hunting
- keep the existing compact parent `Review Work` spelling table as the future
  UI surface
- prefill the existing `Skill Family`, `Skill Cluster`, and `Micro-skill`
  controls with the best viable recommendation where safe
- clearly label prefilled values as `Known Match`, `Your Match`, or
  `Possible Match · X%`
- preserve explicit parent action: confirm, change, reject, or send to catalog
  review

Slice `2` has four bounded parts:
- `Slice 2A` - computed helper/read-model only
- `Slice 2B` - `Review Work` table prefill integration
- `Slice 2C` - server-only canonical exact-pair recommendation signal
- `Slice 2D` - useful inferred prefill and compact confidence display

#### Slice 2A - computed helper/read-model only

Status: `implemented as read-only helper/read-model`

Slice `2A` should:
- implement a computed read-only recommendation helper/read-model
- not create a new recommendation storage table
- not require manual pre-population
- accept spelling pair inputs:
  - child spelling
  - correction
  - optional sentence/context
  - parent/child/submission scope where available
- return ranked recommendation data shaped for later `Review Work` table
  prefill
- not mutate Supabase
- not change `Review Work` UI
- not create truth
- not change resolver behavior
- not create `learning_items` or `assignment_items`

For Slice `2A`, "read-model" means a computed read-only projection assembled
from existing data, not a new manually populated storage table.

Implementation closeout:
- added pure scoring helper
  `lib/writing-engine/spelling/stage2a-micro-skill-recommendation.ts`
- added read-only repository/read-model boundary
  `lib/writing-engine/persistence/stage2a-micro-skill-recommendation.ts`
- added focused regression coverage via
  `npm run writing-engine:micro-skill-recommendation-regression`
- the helper returns `recommendationStatus`, `confidence`,
  `confidencePercent`, `reason`, `sourceSignals`, ranked candidates, fallback
  reason, and future table-prefill fields
- exact active canonical mappings and same-scope parent-local promoted mappings
  outrank weak pattern signals
- deterministic spelling-difference features, reviewed evidence, Slice `1`
  frequency, and word-map metadata remain recommendation signals only
- low/no viable evidence, likely false positives, and word-level-only cases do
  not allow prefill
- close inferred candidate scores reduce `confidencePercent` rather than
  automatically blocking prefill
- no `Review Work` UI, resolver behavior, mappings, verifications,
  `learning_items`, `assignment_items`, migrations, or Supabase writes changed

#### Slice 2B - Review Work table prefill integration

Status: `implemented as suggestion-only Review Work table prefill`

Slice `2B` should:
- feed the best recommendation into the existing compact `Review Work` spelling
  table
- prefill `Skill Family`, `Skill Cluster`, and `Micro-skill` controls where
  safe
- visually label prefilled values as recommendations
- preserve editability
- preserve Tick, X, `!`, and `No Matching Skill` flows
- preserve existing completion-gating and approval semantics
- never treat a suggestion as a parent decision

The recommendation must not count as a completed review decision and must not
silently unlock approval or completion.

Implementation closeout:
- unified `Review Work` spelling rows now carry nullable Slice `2A`
  recommendation metadata for still-open categorisation rows only
- the compact table prefills `Skill Family`, `Skill Cluster`, and `Micro-skill`
  only when `isPrefillAllowed` is true and the recommended micro-skill is still
  present in the existing active option set
- suggested prefills show compact parent-facing badges only: `Known Match`,
  `Your Match`, `Possible Match · X%`, `No Match Yet`, and `Check Manually`,
  with explanatory text kept in tooltips rather than visible row helper
  sentences
- low/no viable evidence, no-matching, word-level-only,
  likely-false-positive, insufficient-evidence, and unavailable optional-source
  recommendations do not prefill as confirmed values and display as
  `No Match Yet`
- `Possible Match · X%` may prefill the best viable active assignable D4
  candidate even when candidate scores are close; the percentage is engine
  confidence only and is not parent approval, mastery, canonical truth, or
  resolver truth
- `Check Manually` is reserved for genuinely unsupported or unchoosable states,
  not for ordinary close-score uncertainty or optional-source unavailability
- existing parent verification, catalog review, candidate mapping,
  parent-local promotion, and meaningful existing skill ownership still wins
- suggestion-only data is ignored by unified completion gating and does not
  create mappings, verifications, `learning_items`, `assignment_items`, mastery,
  rewards, resolver truth, or canonical truth
- parent edits and confirmations continue through the existing Tick, X, `!`,
  `No Matching Skill`, candidate-capture, and parent-local promotion actions
- optional Slice `2A` recommendation signal sources fail soft when unavailable
  or permission-denied under the parent-scoped client, so `Review Work` renders
  with lower-confidence/no suggestion instead of weakening RLS

#### Slice 2C - server-only canonical exact-pair recommendation signal

Status: `implemented as narrow server-only recommendation signal`

Slice `2C` allows `Review Work` recommendation display to use active exact-pair
canonical mappings as `Known Match` evidence without changing resolver truth.

Implementation closeout:
- added a narrow server-only helper for recommendation-only canonical exact-pair
  lookup
- the helper reads `spelling_canonical_mappings` only by normalised exact pair
  and returns only minimal fields: mapping id, misspelling, correction,
  `micro_skill_key`, and `resolver_visibility_status`
- active hidden and visible canonical mappings may support display-only
  `Known Match`
- the mapped micro-skill must still exist as active, assignable, and D4 in
  `micro_skill_catalog`
- resolver visibility remains irrelevant for display-only recommendation;
  `findResolverVisibleExactPairMapping` and resolver runtime behavior remain
  unchanged
- service-role access remains server-only, narrow, and invoked only from the
  server `Review Work` recommendation read-model path after parent ownership has
  already been established
- parent-scoped reads remain strict for required `Review Work` ownership/data,
  while optional recommendation signal sources fail soft
- no RLS policy, migration, canonical mapping creation, resolver visibility
  event, parent verification, parent-local promotion, `learning_item`,
  `assignment_item`, mastery, reward, dashboard, analytics, scoring, template,
  or completion-gating behavior changed

#### Slice 2D - useful inferred prefill and compact confidence display

Status: `implemented as suggestion-only inferred prefill confidence display`

Slice `2D` reduces parent taxonomy hunting by prefilling the best viable active
assignable D4 inferred candidate while displaying engine confidence clearly.

Implementation closeout:
- separated best viable candidate selection from confidence display
- inferred `Possible Match` recommendations may prefill the existing `Skill
  Family`, `Skill Cluster`, and `Micro-skill` controls when at least one viable
  active assignable D4 candidate exists and no stronger parent/admin/canonical
  owner already controls the row
- close top-candidate scores reduce `confidencePercent` rather than
  automatically blocking prefill
- `Possible Match` displays as `Possible Match · X%` using whole-number engine
  confidence only
- exact tied inferred candidates use deterministic micro-skill key ordering
  with reduced confidence instead of implying certainty
- raw frequency alone remains weak evidence and must not create high confidence
  or truth
- `Known Match` and `Your Match` remain authority badges and continue to win
  over `Possible Match`
- `No Match Yet` remains the fallback when no viable candidate exists or
  evidence is too poor to suggest any candidate
- recommendation metadata remains ignored by completion gating; parent
  confirmation remains explicit through the existing `Review Work` actions

#### Recommendation-versus-truth boundary

A Slice `2` recommendation is:
- suggestion evidence only
- not parent verification
- not a candidate mapping
- not parent-local promoted truth
- not canonical/global mapping truth
- not resolver-visible truth
- not mastery evidence
- not a `learning_item`
- not an `assignment_item`

#### Slice 2B parent-facing badges

Slice `2B` should keep the compact spelling table compact. It should display a
single short badge/label rather than visible helper sentences under the
dropdowns:

- `Known Match` — a readable active canonical/global exact-pair mapping supports
  the spelling pair
- `Your Match` — a same-parent/child scoped parent-local promoted exact-pair
  mapping supports the spelling pair
- `Possible Match` — inferred from spelling-pattern evidence, reviewed evidence,
  word-map support, or other non-truth recommendation signals; when prefilled,
  display as `Possible Match · X%`
- `No Match Yet` — no confident existing skill suggestion is available, including
  low confidence, insufficient evidence, no matching skill candidate, or
  unavailable optional sources without a real conflict
- `Check Manually` — genuine unresolved conflict, unsupported state, or exact
  tie that cannot be resolved safely; ordinary close-score uncertainty should
  lower confidence rather than block a viable prefill

Tooltip/help text may explain the badge for accessibility, but visible row copy
should stay minimal. Do not use visible wording such as `Engine Truth`.

#### Suggested helper output shape

The Slice `2A` helper/read-model should return a result shaped for later table
prefill:
- `recommendedFamilyKey`
- `recommendedClusterKey`
- `recommendedMicroSkillKey`
- `rankedMicroSkillCandidates`
- `confidence`
- `confidencePercent`
- `reason`
- `sourceSignals`
- `recommendationStatus`
- `fallbackReason`
- `isPrefillAllowed`

Suggested `recommendationStatus` values:
- `recommended`
- `low_confidence`
- `no_matching_skill_candidate`
- `word_level_only_candidate`
- `likely_false_positive`
- `conflict`
- `insufficient_evidence`

#### Ranking logic

The helper should score candidate micro-skills using safe read-only signals
such as:
- exact active canonical mapping match
- same-scope parent-local promoted exact mapping
- correction-word pattern support
- deterministic spelling-difference features, such as missing final e,
  consonant doubling, vowel substitution, transposition, suffix/prefix issue,
  and schwa/unstressed vowel issue
- active assignable D4 micro-skill metadata
- historical reviewed evidence
- Slice `1` audit-style frequency signals
- canonical word-map metadata where safely available

Rules:
- raw frequency alone must not create high-confidence truth
- conflicting top candidates may return `conflict`/`Check Manually` only when
  the helper cannot choose a viable candidate safely
- close margins between top candidates should reduce `confidencePercent` rather
  than automatically preventing prefill
- low confidence may still prefill only when the top candidate meets the
  minimum viability threshold and remains an existing active assignable D4
  micro-skill
- the helper must not invent `micro_skill_key`

#### Allowed source signals

The helper may use read-only signals from:
- misspelling/correction pair
- optional sentence/context
- existing active assignable D4 `micro_skill_catalog`
- existing canonical mappings
- parent-local promoted mappings where scoped
- historical reviewed evidence
- Slice `1` audit patterns if available
- canonical word-map metadata where safely available

The helper must not use as truth:
- arbitrary parent free text
- pending candidate mappings
- raw parent-authored missed-word rows
- raw `misspelling_instances`
- raw `writing_issues`
- open catalog-review cases
- accepted PCRM evidence not yet adopted
- word-map rows as mastery/assignment/resolver truth

#### Hard boundaries

No:
- resolver behavior changes
- canonical mapping creation
- parent-local promotion
- candidate mapping creation by suggestion alone
- parent verification creation by suggestion alone
- `learning_item` creation
- `assignment_item` creation
- mastery/reward/dashboard/analytics/scoring/template changes
- `micro_skill_catalog` mutation
- broad AI diagnosis
- manual writing sample expansion unless separately authorised
- hidden completion-gating change
- service-role exposure to client components
- hosted DB mutation

#### Slice 2 implementation closeout

Slice `2A` through `2D` are implemented. Browser verification confirmed
recommendation display examples such as:
- `buisness -> business`: `Known Match`
- `natrual -> natural`: `Known Match`

### Slice 3 - Parent review UX acceleration

Status: `deferred`

Founder decision:
- defer Slice `3` for a later product decision
- do not implement Slice `3` now
- do not remove Slice `3` from the roadmap

Reason:
- after Slice `2` recommendation/prefill work, additional parent review UX
  acceleration is lower immediate impact than fast spelling-engine population
  at scale
- Slice `3` may return later if explicit parent review action routing becomes
  a measurable bottleneck

Goal:
- if revived later, improve explicit parent-action routing in `Review Work`
  without automatic truth creation

Potential parent actions if revived:
- accept suggested skill
- choose different skill
- not a learning issue
- false positive
- no matching skill
- recommend pairing for admin review where eligible

Clarifications:
- stable dropdowns should remain as-is
- do not reorder the large micro-skill dropdown by recommendation priority
- do not build extra ranked option panels
- any revived Slice `3` should focus on explicit parent-action routing only,
  not automatic truth creation
- no implementation is authorised now

Hard boundary:
- parent approval creates event truth and may create/promote scoped child-local
  mappings only under existing rules
- no global canonical truth

### Slice 4 - Bulk candidate mapping import/review

Status: `implemented through production-smoked import-to-resolver-visible canonical truth runtime path; next work is scale/audit hardening and operator UX`

Goal:
- allow admin/operator to import or generate batches of candidate spelling
  mappings for review
- speed up spelling-engine population at scale
- reduce dependency on parent row-by-row classification

Planning closeout:
- detailed plan:
  [docs/implementation/version-2-slice-4-bulk-candidate-mapping-import-review-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/version-2-slice-4-bulk-candidate-mapping-import-review-plan.md:1)
- safest first implementation is file/report-based only:
  `Slice 4A - dry-run bulk candidate mapping import planner`
- safest later storage approach is dedicated seed-import storage:
  `spelling_seed_import_batches` and `spelling_seed_import_rows`
- Slice `4B` dedicated seed import storage planning is implemented as
  docs/planning only
- Slice `4C` seed import storage foundation is implemented as a unique
  timestamp migration only:
  `supabase/migrations/20260614120000_add_spelling_seed_import_storage.sql`
- Slice `4C` is released to production; the production release also added
  no-op active compatibility migration
  `supabase/migrations/20260421_add_false_positive_to_misspelling_instances.sql`
  so the Supabase CLI can compare the legacy production ledger row without
  migration repair
- Slice `4D` candidate-review import is implemented and QA-tested as a
  service-role/operator-only source path into the dedicated seed tables. It
  imports only approved `safe_for_candidate_review` rows from an exact
  Slice `4A` dry-run report, requires Slice `4C` schema proof, validates
  current CSV/report consistency, blocks hosted writes unless explicitly
  approved, preserves protected-table count checks, and has local-only smoke
  proof against `127.0.0.1` / local Supabase with synthetic data.
- Slice `4E.0` seed-row admin review is registered as docs/contract only. It
  selects a no-migration private-MVP stance using existing seed row
  `row_status`, review audit fields, review note, status reason, duplicate
  lineage, and metadata; defines status-only decisions; reserves
  `adopted_hidden_canonical`, `canonical_mapping_id`, and
  `spelling_canonical_mappings` writes for later Slice `4F`; and keeps admin
  access server-only behind the existing allowlist/service-role boundary.
- Slice `4E.1` seed-row admin review read model/listing is implemented as a
  server-only admin surface at `/admin/seed-import-review`, linked from the
  spelling admin hub and admin navigation. It reads seed import batches/rows
  and micro-skill labels only after admin authorization, displays provenance
  and review-read-model fields, and adds no mutation actions, canonical mapping
  writes, resolver visibility, Review Work behavior, assignments, mastery,
  rewards, dashboards, analytics, scoring, templates, parent/child RLS
  policies, or `micro_skill_catalog` mutation.
- Slice `4E.2` seed-row admin review decision actions are implemented as
  server-only status-only actions under `/admin/seed-import-review`. They call
  `requireAdminUser()` before service-role use, update only existing
  `spelling_seed_import_rows` review/status fields, support keep pending,
  reject, duplicate, conflict blocked, nomination for later canonical adoption,
  and supersede, validate allowed starting statuses and duplicate targets, and
  preserve the no-canonical/no-resolver boundary. The page includes minimal
  admin-only status controls and continues to disclose that decision history is
  not append-only.
- Slice `4F` explicit hidden-canonical adoption from seed rows is implemented
  as a hidden-only canonical truth adoption path. It adds one unique timestamp
  migration, service-role-only RPC
  `adopt_seed_import_row_hidden_canonical_admin`, first-class
  `source_seed_import_row_id` lineage on canonical mappings/events, the
  `seed_import_adopted` event type, a server-only admin action under
  `/admin/seed-import-review`, and a simplified active queue with
  `Adopt for canonical review` / `Reject` actions. The adoption action can
  nominate a safe seed row when needed, then create or link active hidden
  canonical mappings. It cannot enable resolver visibility or change
  resolver/runtime behavior, and rejected/adopted rows leave the active queue.
- Slice `4F.1` local/staging hidden-canonical adoption smoke is implemented.
  The smoke creates synthetic seed-import data only, chooses an existing active
  assignable D4 micro-skill, inserts one eligible nominated seed row, calls the
  4F RPC through service-role, asserts the row becomes
  `adopted_hidden_canonical`, asserts the mapping remains
  `resolver_visibility_status = 'hidden'`, verifies `created` and
  `seed_import_adopted` events, proves no `resolver_visibility_enabled` event
  was created, and confirms protected table counts plus `micro_skill_catalog`
  are unchanged. It refuses production Supabase and allows staging only with an
  explicit staging confirmation.
- Slice `4G.0` / `4G.0a` resolver visibility readiness/audit is implemented
  as a read-only admin surface at
  `/admin/spelling-canonical-resolver-readiness`, with a production-oriented
  read model for lineage, event summaries, duplicate/conflict blockers, and
  readiness classification. Readiness remains non-mutating and does not itself
  enable resolver visibility.
- The production runtime path is now proven for explicit resolver-visible
  canonical mappings. Production Vercel has
  `WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled`; an imported
  seed row was adopted for canonical review, appeared as hidden canonical
  truth, appeared in resolver readiness, was explicitly enabled for resolver
  visibility, and correctly highlighted/categorised a canonical truth word in
  submitted learner work.
- do not reuse `spelling_canonical_mapping_recommendations` for bulk external
  seed imports because PCRM rows mean scoped parent recommendation evidence
- do not reuse `spelling_catalog_review_cases` for bulk external seed imports
  because catalog-review cases mean parent-raised `No matching skill` gaps
- do not write directly to `spelling_canonical_mappings` in the first
  implementation

Input shape:
- misspelling
- correction
- `suggested_micro_skill_key`
- confidence
- source
- note/provenance

Optional input fields to consider:
- dialect
- age_band
- source_url
- source_dataset
- pattern_hint
- route_hint
- source_row_id
- import_batch_name

Input format:
- CSV and/or XLSX

Validation planning requirements:
- normalize misspelling/correction
- reject empty pairs
- detect duplicate rows within the file
- detect existing canonical mappings
- detect conflicting canonical mappings
- validate `suggested_micro_skill_key` exists, active, assignable, and D4
- detect inactive, non-assignable, and unknown skills
- compare against existing parent-local mappings where safe
- compare against catalog-review cases
- compare against PCRM recommendations
- identify rows safe for candidate review
- identify rows requiring manual review
- identify rows that should be rejected from import

Import modes to consider:
- dry-run/report only
- candidate-review import
- hidden-canonical import only after explicit admin/operator confirmation
- no resolver-visible import mode in first implementation

Storage options to evaluate:
- selected first implementation: keep file/report-based only
- selected future DB-backed approach: create
  `spelling_seed_import_batches` and `spelling_seed_import_rows`
- rejected for bulk external seed imports:
  `spelling_canonical_mapping_recommendations`
- rejected for bulk external seed imports: `spelling_catalog_review_cases`

External/common misspelling sources to consider:
- Birkbeck spelling error corpus
- Wikipedia common misspellings machine-readable list
- custom manually curated workbook
- GitHub Typo Corpus only with caution
- NeuSpell or correction-toolkit data only as a helper, not truth

Output:
- reviewable candidate/recommendation rows
- no resolver-visible truth by default
- audit trail preserved

First implementation slice:
- `Slice 4A - dry-run bulk candidate mapping import planner, file/report only`
  is implemented through `Slice 4A.4` as file/report-only validation plus
  optional read-only comparison
- Slice `4A.0` docs registration lives in
  [docs/implementation/version-2-slice-4-bulk-candidate-mapping-import-review-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/version-2-slice-4-bulk-candidate-mapping-import-review-plan.md:1)
- CSV-first input parser
- optional XLSX support only if it does not broaden scope materially
- validates required/optional schema
- normalizes misspelling/correction
- validates active assignable `D4` `suggested_micro_skill_key`
- compares read-only against canonical mappings, parent-local mappings where
  safe, catalog-review cases, and PCRM recommendations when available
- classifies rows as `safe_for_candidate_review`, `manual_review_required`, or
  `rejected_from_import`
- emits JSON and human-readable reports
- writes no Supabase rows
- adds regression coverage for parser, validation buckets, conflict detection,
  and no-mutation guard behavior

Staged implementation breakdown:
- `Slice 4A.0` docs registration
- `Slice 4A.1` pure parser and file-only validator: implemented
- `Slice 4A.2` read-only catalog and canonical comparison: implemented
- `Slice 4A.3` read-only supporting evidence comparison: implemented,
  QA-audited, and local smoke-tested
- `Slice 4A.4` operator hardening and docs closeout: implemented; Slice `4A`
  is complete as a dry-run/report-only operator planner
- `Slice 4B` dedicated seed import storage planning: implemented as
  docs/planning only
- `Slice 4C` seed import storage foundation: implemented as storage foundation
  only
- `Slice 4D` candidate-review import: implemented and QA-tested as
  service-role/operator-only source work with local smoke proof; no hosted
  import was run
- `Slice 4E.0` seed-row admin review contract: implemented as docs/planning
  only
- `Slice 4E.1` seed-row admin review read model/listing: implemented
- `Slice 4E.2` seed-row admin review decision actions: implemented
- `Slice 4E.3` optional UI polish or audit-hardening decision if useful after
  live operator use
- `Slice 4E.4` optional broader QA/browser/docs closeout if 4E.3 proceeds
- `Slice 4F` explicit hidden-canonical adoption from seed rows: implemented
  and local/source QA-passed
- `Slice 4F.1` local/staging hidden-canonical adoption smoke: implemented;
  local smoke passed after applying the 4F migration to local Supabase only
- `Slice 4G.0` / `4G.0a` resolver visibility readiness/audit: implemented and
  production-used
- explicit resolver visibility enablement and runtime resolver consumption:
  production-smoked for one canonical truth word

Hard boundary:
- bulk import must not write resolver-visible canonical mappings directly
- imported rows are not parent verification
- imported rows are not child evidence
- imported rows are not learning gaps
- imported rows do not create `learning_items`
- imported rows do not create `assignment_items`
- imported rows do not update mastery
- imported rows do not update rewards
- imported rows do not change dashboard, progress, scoring, or analytics
- imported rows do not mutate `micro_skill_catalog`
- imported rows do not become resolver-visible truth by default
- canonical/global mapping adoption requires explicit admin action
- resolver visibility remains separate, explicit, audited, and reversible
- no service-role exposure to client components
- any DB-changing implementation requires a unique timestamp migration and
  hosted migration-ledger safety check

Next base decision:
- the next numbered roadmap stage is Slice `5` child-local reuse and
  suggestion improvement.
- optional Slice `4`/admin-ops follow-up: production-scale canonical mapping
  operations/audit hardening. This is not required for the proven core flow,
  but may be useful before larger imports. Potential scope includes
  pagination/search, batch-safe operator review, visible/hidden rollback
  clarity, production smoke runbook, audit exports, and monitoring for
  resolver-visible mapping effects.
- assignment, mastery, rewards, dashboards, analytics, and
  `micro_skill_catalog` mutation remain out of scope until a separate
  assignment/mastery evidence slice.

#### Slice 4A docs-only update prompt

```md
Adopt the role of a CTO, senior documentation reviewer, Writing Engine architecture reviewer, spelling-engine classification engineer, and Supabase/Next.js release-safety reviewer for Scarlett's Spells.

Implement docs-only Version 2.0 Slice 4A registration: dry-run bulk candidate mapping import planner, file/report only.

Use these docs as controlling context:
- docs/implementation/version-2-roadmap.md
- docs/implementation/version-2-slice-4-bulk-candidate-mapping-import-review-plan.md
- docs/current-priorities.md
- docs/implementation/targeted-writing-practice-status.md
- docs/implementation/writing-engine-roadmap.md
- docs/contracts/writing-engine-mastery-and-evidence-contract.md
- docs/contracts/targeted-writing-practice-contract.md
- docs/contracts/micro-skill-taxonomy-and-assignment-contract.md
- docs/contracts/canonical-spelling-word-map-contract.md
- docs/contracts/parent-recommended-canonical-mapping.md
- docs/architecture/writing-engine-canonical-brief.md
- docs/architecture/targeted-writing-practice-architecture.md
- docs/operations/supabase-migration-policy.md

Goal:
Register Slice 4A as the next implementation slice: a local/operator dry-run bulk candidate mapping import planner that reads CSV first, validates and classifies rows, compares against existing read-only spelling-engine evidence where safe, and emits JSON plus human-readable reports without writing to Supabase.

Scope:
- docs/planning only
- define script goal, command shape, validation buckets, report shape, read-only comparison sources, no-mutation guard, and QA expectations
- keep dedicated seed import database storage as future work
- keep hidden-canonical import and resolver-visible import out of scope

Hard boundaries for this planning slice:
- docs/planning only
- no runtime code
- no migrations
- no Supabase mutation
- no resolver behaviour change
- no Review Work behaviour change
- no assignment generation change
- no mastery, reward, dashboard, analytics, scoring, or template change
- no `micro_skill_catalog` mutation
- no service-role exposure to client components
- imported rows are not parent verification, child evidence, learning gaps, learning items, assignment items, mastery, rewards, or resolver-visible truth
- canonical/global mapping adoption requires explicit admin action
- resolver visibility remains separate, explicit, audited, and reversible

Return:
1. Docs changed.
2. Confirmed first implementation slice.
3. Safety boundaries preserved.
4. Any remaining risks or ambiguities.
5. Slice 4A implementation prompt.
6. Full list of staged implementation breakdown.
```

### Slice 5 - Child-local reuse and suggestion improvement

Goal:
- once the parent approves/promotes a mapping for the child, the engine reuses
  it automatically within the same parent/child scope

Hard boundary:
- child-local reuse only
- no global reuse unless admin canonical adoption and resolver visibility are
  separately enabled

### Slice 6 - Daily spelling practice generation hook

Goal:
- generate a calm daily practice set from active `learning_items`

Rules:
- due reviews first
- 1-3 new Nuggets per day
- group by `micro_skill_key`
- use `assignment_items`
- use word-map content only as supporting content for existing active
  `learning_items`
- avoid overwhelming the child
- no automatic mastery claims

### Slice 7 - Child daily practice surface

Goal:
- make `/learn/week` show today's daily spelling-practice block clearly and let
  the child open a calm read-only/local-only item viewer without creating
  completion, mastery, evidence, or reward truth

Status:
- Slice `7A` is implemented as a server-only read model and route boundary
  foundation:
  - reads only generated `Daily spelling practice` headers with
    `assignment_generation_source = "learning_items"`
  - reads scoped, ordered `assignment_items`
  - optionally reads scoped `learning_items` and `micro_skill_catalog`
    display labels for safe child-facing grouping
  - returns `missing`, `empty`, `ready`, `completed`, `skipped`, and `blocked`
    states
  - exposes neutral copy for the child card and viewer
  - does not trigger generation, write tables, use service-role, or touch
    rewards, mastery, canonical mappings, resolver visibility, Review Work,
    analytics, scoring, templates, `/practice`, or `/assignments`
- Slice `7B` is implemented as a neutral child `/learn/week` display surface:
  - the page reads the Slice `7A` model server-side for the selected child and
    current date
  - `LearnWeekPlanner` renders a passive daily spelling practice card before
    the existing reward panel
  - the card shows empty, ready, closed, and blocked states with due review
    before new practice
  - as implemented in `7B` it had no generation trigger, answer capture,
    completion persistence, reward, mastery, evidence, scoring behavior, or
    broad runtime revival
  - `/practice` and `/assignments` remain redirect-only legacy paths for this
    slice
- Slice `7C` is implemented as a read-only/local-only child practice viewer:
  - `/learn/week/practice` reads the Slice `7A` model server-side for the
    selected child and current date
  - non-child access redirects safely away from the child practice detail route
  - the `/learn/week` card links to the viewer only when the read model is
    `ready` and at least one item is supported for the child surface
  - the viewer renders only supported `spelling` + `controlled_spelling` items
    with local navigation and optional local feedback
  - unsupported, missing, empty, completed, skipped, and blocked states render
    calm neutral copy
  - it adds no migration and no generation trigger, server action, persisted
    answer attempt, completion persistence, evidence, mastery, reward, canonical
    mapping, resolver, catalog, Review Work, analytics, scoring, template, or
    course-completion write
  - `/practice` and `/assignments` remain redirect-only legacy paths; Slice
    `7D` remains the decision point for any persisted completion marker
  - local browser smoke passed for the authenticated child `/learn/week`
    daily-practice card, direct `/learn/week/practice` neutral empty state,
    refresh stability, forbidden daily-practice copy, and legacy child redirects
- Slice `7D` is implemented as item-level delivery completion only:
  - the route-local server action lives in `/learn/week/practice/actions.ts` and
    calls the focused helper in
    `lib/writing-practice/daily-spelling-practice-completion.ts`
  - the helper marks only supported generated `assignment_items.status` rows as
    `completed`, scoped by authenticated parent, selected child, generated daily
    assignment, current practice date, `spelling`, and `controlled_spelling`
  - `daily_assignments.status` remains untouched; the read model presents
    `completed` only when all supported generated items are complete
  - no migration, answer attempt, correctness persistence, evidence write,
    mastery update, reward write, course completion write, resolver/catalog/
    canonical change, Review Work gating change, service-role import, or legacy
    `/practice` / `/assignments` runtime revival was added
  - local browser smoke passed for authenticated child `/learn/week`, direct
    `/learn/week/practice` neutral state, forbidden daily-practice copy, and
    legacy child redirects; no ready supported local practice existed during
    smoke, so item-completion behavior is covered by regression rather than
    claimed as completed in-browser
- Slice `7E` is implemented as QA, smoke, and release-readiness closeout:
  - strengthened regression coverage for mixed item statuses, final-item
    completion-form placement, thin action delegation, and no broad
    `app/learn/actions.ts` dumping-ground additions
  - added `npm run writing-engine:daily-spelling-practice-surface-regression`
    as the aggregate Slice 7 child-surface regression command
  - reran focused regressions, aggregate regression, typecheck, targeted lint,
    diff checks, and local browser smoke
  - release-readiness decision: release-ready for the Slice 7 child daily
    practice surface, with the documented local-smoke caveat that no ready
    supported practice existed in the local dataset

UX:
- today's practice
- due review
- new practice
- short optional transfer task
- simple item-level completion state
- no scary backlog

### Slice 8 - Admin canonical adoption hardening

Goal:
- make the best reviewed mappings safely canonical where appropriate

Include:
- accepted/unadopted PCRM review
- catalog-review canonical mappings
- conflict blocking
- resolver visibility still separate and explicit
- audit events
- rollback/disable path

## 8. Safety and migration rules

- do not run broad `db push`
- any DB-changing slice requires a unique timestamp migration
- production/hosted migration-ledger safety must be checked before DB-changing
  work
- no hosted destructive cleanup without explicit approval
- no service-role exposure to client components
- parent-scoped RLS must remain parent-scoped
- admin reads/writes must remain server-only and allowlist-protected for
  private MVP

## 9. Success metrics

- parent classification time per spelling row reduced
- percentage of rows with ranked suggested micro-skill
- percentage of parent accepted suggestions
- number of repeated pairs resolved child-locally
- number of admin canonical mappings adopted
- number of daily practice items generated from verified `learning_items`
- future `7D+` completion-state work can show the child completing daily
  spelling practice in a bounded 10-20 minute session without reward/mastery
  side effects
- no increase in false-positive resolver reuse
- no unreviewed raw evidence becomes reusable truth

## 10. Original first implementation prompt after roadmap

Historical recommended first slice:

`Read-only spelling-engine population audit`

Exact prompt:

```md
Adopt the role of a senior Supabase/Next.js architecture reviewer, spelling-engine data auditor, and learning-science-aware product engineer for Scarlett's Spells.

Implement Version 2.0 Slice 1 only: Read-only spelling-engine population audit.

Use these docs as controlling context:
- docs/implementation/version-2-roadmap.md
- docs/current-priorities.md
- docs/implementation/writing-engine-roadmap.md
- docs/implementation/targeted-writing-practice-status.md
- docs/contracts/writing-engine-mastery-and-evidence-contract.md
- docs/contracts/targeted-writing-practice-contract.md
- docs/contracts/micro-skill-taxonomy-and-assignment-contract.md
- docs/contracts/canonical-spelling-word-map-contract.md
- docs/contracts/parent-recommended-canonical-mapping.md
- docs/architecture/writing-engine-canonical-brief.md
- docs/architecture/targeted-writing-practice-architecture.md
- docs/operations/supabase-migration-policy.md

Goal:
Produce a ranked, read-only view of the highest-leverage ways to populate the spelling engine without changing resolver truth or weakening parent/admin review boundaries.

Audit:
- unresolved spelling pairs
- unknown micro-skill rows
- repeated misspelling -> correction pairs
- repeated correction targets
- repeated pattern/micro-skill candidates
- parent-added rows not yet reusable
- parent-local mappings that might merit admin canonical review
- open catalog-review cases
- accepted/unadopted PCRM recommendations
- word-level-only candidates
- likely false positives
- missing D4 micro-skill coverage
- top 50 suggested mapping/micro-skill seed opportunities

Hard boundaries:
- read-only only
- no runtime behavior changes
- no resolver changes
- no Review Work behavior changes
- no assignment generation changes
- no migrations
- no writes to Supabase data unless a later slice explicitly authorizes them
- no unreviewed raw evidence becomes reusable truth

Return:
1. Files changed.
2. Audit surfaces added.
3. Data sources read.
4. Safety boundaries preserved.
5. How to run the audit.
6. Suggested first 50 mapping/micro-skill seed opportunities if available.
7. Risks or follow-up cleanup recommendations.
```

## Later cleanup candidates

- Consider marking older roadmap/status documents as historical only after
  Version 2.0 becomes the accepted single active planning surface.
- Do not archive files as part of Slice 0.
- Keep any cleanup separate from implementation slices that change runtime or
  database behavior.
