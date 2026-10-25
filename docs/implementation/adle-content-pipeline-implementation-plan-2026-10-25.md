# ADLE content pipeline implementation plan — 2026-10-25

Status: implementation in progress. This document schedules work; it does not
change curriculum policy, approve content, alter a relationship, or activate a
route. The policy owners remain [the ADLE authority map](../architecture/adle-authority-map.md)
and its manifest. The measured baseline and completed first query slice are in
[the readiness and egress ledger](adle-readiness-egress-2026-10-24.md).

## Outcome and boundary

One canonical word–micro-skill–route status must explain, with source evidence,
whether the word exists, has an approved relationship, has the facts needed by
the route's actual activities, has reviewed content, is released, and may be
considered by a selector. A separate child-scoped decision chooses the lesson
words. Admin pages may present different tasks, but must interpret those gates
the same way.

The `everywere → everywhere` mapping remains disabled and its No Matching Skill
case remains open. This plan does not make `everywhere` a contrast/content word,
approve a relationship for it, or add a special trigger path. The general model
must keep spelling evidence, word–skill relationships, route content roles, and
child selection separate so later editorial decisions do not require another
architectural exception.

## Current implementation seams

| Concern | Current authority or implementation | Consequence for the plan |
|---|---|---|
| Route capability | `lib/adle/curriculum-readiness/route-registry.ts` | Capability is not release or activation. Cover specialist and generic routes explicitly. |
| Question facts and variants | `lib/adle/composable-lesson/activity-requirements.ts` and `activity-variants.ts` | Requirements have fact owner, word role, conditional activity and word scope. Preserve selected-example and set-level checks rather than requiring every fact on every word. |
| Draft and route validation | `lib/teaching-dictionary-manager/contracts.ts`, `lesson-preflight.ts`, and native specialist compilers | `routeBlockers` currently mixes missing facts with reviewed provenance; `WordRouteStatus.contentPreflightReady` is a composite gate, not pure technical readiness. |
| Relationship decision | `lib/adle/word-skill-relationships/repository.ts` and its adapters/authority | Its full-table authority reads are repeated by admin and worker callers. Replace read shape without changing the governed precedence or withdrawal semantics. |
| Admin status | `lib/teaching-dictionary-manager/word-route-status.ts` | Already distinguishes several gates but is a read-only presentation projection; it is not a selector admission decision. |
| Native selection | `lib/adle/composer-word-selection.ts`, specialist readiness loaders/selectors, and `daily-assignment-composer.ts` | Candidate admission must be fed into native selectors; group coverage, child queue, banding, mastery, and snapshot checks stay in their existing owners. |
| Release | `lib/adle/loaders/curriculum-release-authority.ts`, route activation revisions, release manifests | Preserve immutable release fingerprints, activation revision currentness, and rollback to an earlier head. |
| Egress | Teaching Dictionary SQL paging is staged; `loadCachedTeachingDictionaryEvidenceAuthority` still caches a full relationship authority for 60 seconds | Optimize authority reads and invalidation from measurements, not a larger global TTL. |

### Withdrawal lifecycle found during the prefix save gate

| Existing child state | Current code path and observed implication | Phase-3 decision |
|---|---|---|
| Completed lesson and skill level | `daily_assignments.compiled_lesson_snapshot` replays unchanged. `proficiency/evidence/projector.ts` projects positive evidence through *current* approved `demonstrates` relationships, so withdrawing a pair can change the shadow/current level while the completed lesson and raw event remain. `composer-facts-loader.ts` uses governed relationships only when authentic-use proficiency is enabled; its other path uses active dictionary supports. Thus displayed level behaviour can differ by mode. | Preserve completion and raw evidence, recompute current level consistently, and explain any changed level from the relationship revision. Test both proficiency modes before switching the live display. |
| Pending ADLE learning item | `adle_learning_items` is stored by child, word and skill and is not changed by a pair decision. The guarded prefix selector excludes a deassigned word from its profile, so that item cannot launch this route; another reviewed word may fill the lesson. Other selectors and generic intake need the same live veto. | Keep the child's need visible with an explicit blocked/reclassification status; do not erase it or silently substitute a different skill. |
| Authentic misspelling detection | `find_resolver_visible_token_safe_canonical_mappings` reads active visible mappings and skill catalog state, but no pair-decision state. A deassignment therefore does not by itself stop canonical detection or remove the mapping's skill label. The relationship authority can reject that same word–skill pair downstream. | Separate spelling correction authority from skill attribution. Decide whether a mapping remains resolver-visible with a blocked/unknown teaching skill or needs editorial remapping. |
| Scheduled review | `review-due-queue.ts` uses schedule rows; `composer-facts-loader.ts` obtains route attachments and learning items without a pair-decision check in the review-word construction. A due review can continue after deassignment. `evidence-pricing.ts` credits a successful review by child and canonical word, independently of the pair decision. | **Owner decision, 25 Oct 2026:** keep the word in the child's reviews and continue counting qualifying review outcomes toward that word's mastery. Do not count them as positive evidence for the withdrawn micro-skill. Preserve historical review outcomes and test the full review-to-word-mastery path. The `mastered` state also requires a parent-reviewed authentic use under the current evidence policy; reviews alone can advance the score and secure state but cannot satisfy that final gate. |

These are code-path findings, not a claim that all current production learners
have these states. The authenticated staging proof exercised new assignment
selection and historical snapshot replay; it did not mutate an existing
learner's proficiency or review schedule.

## Decision model to implement

Use `canonical_word_id + micro_skill_key + route_id + route_version` as the
readiness key. Keep the source mapping/occurrence ID, reviewed relationship
source, content/member ID, review ID, release manifest and activation revision
as distinct evidence. Each result should contain stable blocker codes, human
labels, source IDs/fingerprints, `evaluated_at`, and the contract version.

Report these independent dimensions:

1. **Dictionary identity and approval:** exactly one active canonical word and
   its relevant reviewed dictionary facts.
2. **Relationship approval:** governed exact word–skill support, with role and
   withdrawal/precedence respected. A resolver mapping alone cannot approve a
   teaching relationship.
3. **Route applicability:** compatible route, appropriate member/content role,
   and group or family membership where the native selector requires it.
4. **Technical facts:** deterministic presence and structural validation for
   the enabled question variants. State whether facts are missing, invalid, or
   derivable from already governed source facts.
5. **Editorial review:** provenance, meaning distinctions, pedagogical
   suitability, group review and content approval. Populated fields do not
   grant this gate.
6. **Release and activation:** published authority, current dependency
   fingerprint, environment and route head. Deactivation closes new selection.
7. **Child selection:** a live, child-scoped decision owned by the native
   selector, including queue status, exposure, mastery, complexity window,
   representative group coverage and assignment constraints. Do not persist
   this as a global word-ready flag.

The first six dimensions are reusable administrative status. A word can be
technically complete but awaiting editorial review, or released but unsuitable
for a particular child's lesson. No boolean named `ready` should collapse
these states.

## Delivery phases and gates

### 0. Instrument the existing load before further optimization

- Record seven comparable days of Supabase PostgREST/Auth/Storage egress,
  request counts by path, database query shape/calls, and five-minute job
  invocation counts. Add server-side, privacy-safe spans around the main admin
  pages, relationship authority, lesson preflight, release currentness checks,
  writing-shadow worker and lesson composition. Log route/skill IDs and counts,
  not raw learner spelling evidence or credentials.
- Measure application response bytes, Supabase response bytes where the
  transport exposes them, SQL rows returned, query count, p50/p95 response
  time and cache hit/miss. Gateway `content_length` in the existing logs is
  unreliable; never claim endpoint egress from that field alone.
- Establish a reproducible staging fixture and performance script before
  optimizing the next read path. The existing disposable Supabase/Vercel
  staging projects contain schema and synthetic paging fixtures, but not
  reviewed route and child selection fixtures.
- Gate: baseline table with window, environment, traffic source, request
  count, bytes, rows and latency. Current evidence includes 26 full-table
  requests in the former Teaching Dictionary status-filter path and repeated
  relationship reads, but no defensible application-wide savings percentage.

### 1. Derive a versioned route-content contract from native code

- For every route/profile in `ADLE_CURRICULUM_ROUTE_REGISTRY`, enumerate enabled
  variants via `activityVariantsForRoute`. Resolve facts from
  `ADLE_ACTIVITY_REQUIREMENT_REGISTRY` and the native route validator/compiler.
  Classify each fact by owner, word role, word scope, mandatory/conditional/
  optional status, derivation, review authority, and exact validator.
- Express set-level constraints separately: minimum and representative word
  counts, homophone contrast groups, prefix/suffix form coverage, base/family
  membership, dictation and assessment requirements. The route contract must
  never infer suitability from a substring or copy the same fact to every
  word because one selected example needs it.
- Keep a machine-readable manifest and generated human-facing route checklist
  from the same source. Compare it against the current compilers; fail a
  coverage test if a route/variant has no validator or a required compiler
  fact is absent from the contract. Version a semantic change and update the
  owning policy contract and decision log only when policy actually changes.
- Initial pilot: one bounded route with representative reviewed content and
  child fixtures; then cover the remaining specialist routes and generic
  composer. Route choice for the pilot is an engineering fixture choice, not
  a change to the `everywhere` decision.
- Gate: contract-to-compiler tests show the same blockers for valid, missing,
  malformed and unreviewed content; conditional activities apply only when
  enabled.

### 2. Build one governed status service and scoped relationship read model

- Extract a pure evaluation function taking approved facts and a route
  contract. Return the seven dimensions above with stable blocker codes and
  provenance. Reuse `routeBlockers`, preflight and native validators; split
  deterministic structural results from editorial decisions before reusing
  those blockers in admin pages.
- Add a batch read API scoped by word IDs, skill keys or route/version. Adapt
  existing word support, reviewed associations, resolver evidence and
  specialist memberships through the current relationship interpreter.
  Preserve pair decisions, withdrawals, import-batch lineage and releases.
- If a persisted projection is needed after measurement, store only a
  rebuildable read model keyed by the word–skill–route identity, with source
  fingerprints, contract version and invalidation revision. Source approval
  tables remain authoritative. Query it with SQL pagination and filters.
  The initial service can remain computed on demand if the scoped reads meet
  the measured budget.
- Gate: parity corpus comparing old governed relationship decisions and
  preflight output to new dimensions; zero unapproved admissions. Every
  mismatch is classified and resolved before a page or selector switches.

### 3. Incremental recalculation and safe route activation

- Inventory all write boundaries for dictionary facts, dictation, morphology,
  relationship decisions/withdrawals, member/content review, requirement
  version, release and activation. After a committed change, enqueue or
  execute recalculation for its affected word–skill–route keys. Use a route/
  skill-scoped batch on activation or contract change, never a dictionary-wide
  scan on one word edit.
- Make recalculation idempotent and compare source fingerprints to avoid stale
  writes. A withdrawal or deactivation must make new assignment admission
  false immediately even if a queued projection has not refreshed; selectors
  must check live release/withdrawal authority or a transactionally maintained
  revision. Provide repair/rebuild and drift reports.
- Treat withdrawal as a four-consumer lifecycle event. Keep completed lessons
  and raw evidence, but recompute current skill interpretation against the
  governed relationship and explain any resulting level change. Mark affected
  pending learning items as blocked or route them to a reviewed alternative;
  never silently delete the child's need. Evaluate active review schedules and
  route attachments separately from new lesson eligibility. The owner decided
  that a withdrawn word remains in reviews and qualifying review outcomes
  continue contributing to word-level mastery, while the withdrawn pair cannot
  receive new positive skill evidence.
- Decide resolver policy explicitly. A pair de-assignment currently does not
  disable an independent visible canonical mapping. Preserve spelling
  detection where appropriate while separating it from skill attribution;
  do not silently leave an invalid skill label on new authentic evidence.
- Activation UI reports counts by technical complete, missing/invalid facts,
  awaiting editorial review, released/active, and child-eligibility unevaluated.
  Activation remains an explicit reviewed release action; evaluation alone
  cannot publish content.
- Gate: one-row mutations re-evaluate only their affected keys; route changes
  re-evaluate only route/skill scope; disabled/withdrawn authority blocks new
  lessons even during a delayed worker run. Cover proficiency, pending queues,
  resolver attribution, reviews and saved replay in withdrawal lifecycle tests.

### 4. Reduce Supabase transfers with measured, scoped reads

- Finish Teaching Dictionary paging/filtering proof and extend SQL-backed
  filters to the remaining admin read models. Request only selected columns,
  the displayed page's detail IDs, and bounded relationship/route scopes.
- Replace repeated full relationship loads in
  `loadCanonicalWordSkillRelationshipAuthority` callers only after parity
  tests. For `recoverWritingShadowRuns`, retain its mid-run mutation guard by
  comparing a governed version/fingerprint, rather than dropping the second
  full read without an equivalent guard.
- Scope release/currentness reads per route/skill and avoid repeated companion
  table fetches in one request. Cache immutable, fingerprinted release
  manifests and static registry/contract data. Keep approvals, withdrawals,
  route heads and child queue gates live or invalidated by their write events.
- Add indexes only for observed filtered/joined predicates after `EXPLAIN`
  on representative staging data; no blanket indexing or TTL increase.
- Gate: compare the same fixture and traffic window against phase 0. Require
  lower transferred bytes and query count on changed paths, no p95 regression,
  and unchanged governed decisions. Set numeric thresholds from the recorded
  baseline; do not invent a percentage in advance.

### 5. Align admin interfaces without duplicating decisions

- Teaching Dictionary Manager: show approved skill associations, role,
  contract-specific missing facts, separate technical/editorial/release gates,
  and the source of each blocker.
- Canonical Misspelling Resolver: show mapping validity and visibility with a
  link to the word–skill status; it must not imply that mapping approval
  grants route readiness.
- No Matching Skill: distinguish a genuine classification gap from a missing
  dictionary word or a blocked existing relationship. Preserve existing
  evidence and reviewed decisions.
- Recommended Dictionary Entries: check canonical identity first; recommend
  a word only if the word is missing, not because its relationship or content
  is missing. Route existing words to the relevant repair workflow.
- ADLE Requirements and Route Activation: consume the same status service,
  aggregate blocker codes and counts, and link to exact word/group actions.
  Preserve the existing release controls.
- Gate: an identical word–skill–route fixture gives identical dimensions and
  blocker codes on all applicable pages; page-specific wording and actions
  remain distinct. Prefer small read-model changes over UI redevelopment.

### 6. Admit ready candidates to native lesson selectors

- Add one candidate adapter for approved, applicable, reviewed and released
  word–skill–route pairs. Its role comes from governed content/member facts.
  An approved relationship alone is not enough to enter a specialist route.
- Feed candidate IDs and immutable authority fingerprints to existing route
  selectors. Preserve their contrast sets, families, form/group coverage,
  authentic versus transfer roles, child queue, exposure/mastery, banding,
  word counts, compiler validation and frozen assignment snapshots.
- Run old and new decisions side by side in isolated staging. Record why each
  candidate was admitted, excluded or selected; treat any new unreviewed
  admission as a failure. Do not create route-specific duplicate word lists
  merely to populate a lesson.
- Gate: newly approved and complete content enters the candidate pool without
  a manual copy; incomplete/unreviewed/withdrawn content does not; historical
  assignments replay from their stored snapshots.

### 7. Controlled route rollout and observation

- Use the disposable isolated staging project with synthetic reviewed content,
  route revisions and child fixtures. Verify activation, deactivation,
  withdrawal, delayed recalculation, rollback, lesson finish/retry and snapshot
  replay. Keep Preview bound to staging Supabase; do not point Vercel Preview at
  Production for these tests.
- Switch one route at a time behind a reversible candidate-admission control,
  keeping the current selector available for immediate rollback. Migrate or
  backfill a read model only after exact migration-ledger preflight. No
  historical content, evidence or child proficiency is rewritten.
- Before each Production release, satisfy the repository's exact-SHA release
  gate and current provider/runtime checks. Production migration, route
  activation and editorial approval remain separate governed actions.
- Gate: shadow diff is explained, currentness checks pass, no new unreviewed
  lesson, no snapshot replay difference, and the measured request/byte/latency
  dashboard remains within the phase-0-derived budget.

### 8. Retire superseded paths after each verified cutover

- Keep a short ownership inventory for each route and admin page: the canonical
  status service, the remaining native validator/selector, and every legacy
  calculator, loader or cache still called. Delete a superseded implementation
  in the same route cutover follow-up once comparison, rollback and historical
  replay checks pass; do not leave two permanent authorities behind.
- Remove page-local readiness calculations, redundant relationship/release
  fetches, unused adapters and duplicate route-specific candidate lists only
  when their callers have moved to the shared service. Preserve native
  pedagogical validators, child selection gates, release controls, migrations
  and historical snapshots while they still own distinct responsibilities.
- Use call-site searches, query traces and the cross-page parity corpus to
  prove each removed path is unused and its decision is covered. Record the
  before/after query count, returned bytes and p50/p95 time for the affected
  path. If a temporary fallback must remain, name its owner and removal gate.
- Gate: each migrated route/page has one documented decision owner, no
  unbounded duplicate read, passing parity and replay tests, and a measured
  performance comparison. A route is not considered fully migrated while an
  obsolete parallel readiness calculation remains active.

## Test and measurement matrix

| Scenario | Required observation |
|---|---|
| Existing and newly approved relationship | Same approved source and role on every admin surface; affected pair recalculated once. |
| Relationship withdrawn or mapping disabled | No new candidate admission; historical evidence and snapshots retained. |
| Missing fact versus unreviewed fact | Distinct blocker codes; deterministic completeness never supplies editorial approval. |
| Content correction or requirement-version change | Only affected pair or route scope recalculated; previous result invalidated by fingerprint. |
| Route activation, deactivation, rollback | Counts refresh and new selection follows live head/currentness; prior lesson replay stable. |
| Group coverage and individual child | Native selector still enforces reviewed groups and child queue, mastery and complexity. |
| Cross-page consistency | Same key and contract version produce the same status dimensions and blocker codes. |
| No Matching Skill example | `everywere → everywhere` stays disabled/open and is neither an approved relationship nor homophone content. |
| Query performance | Compare page/job/lesson query count, rows, response bytes, p50/p95 and Supabase service egress against the recorded baseline. |

## Proposed first implementation slice

Start with phase 0 instrumentation and phase 1 contract extraction in one
bounded, reviewable code slice. The contract tests should exercise at least
one specialist route with conditional activities and one with a reviewed
group constraint. Do not connect it to selector admission or persist readiness
in this slice. This gives phase 2 a stable decision vocabulary and phase 4 a
real byte/query baseline. Follow with one route's scoped status service and
staging parity before expanding to all routes.

## Progress after the scoped admin status slice — 25 Oct 2026

The Teaching Dictionary word workspace, selected route activation view and
filtered ADLE Requirements detail now call the same governed relationship
interpreter and `wordRouteStatus` projection. Route activation uses a
micro-skill-scoped candidate discovery followed by batched word IDs; intake
uses only its displayed canonical word IDs. A disposable staging comparison
matched the word workspace gates, kept a withdrawn-only pair out of the route
candidate list, and admitted zero words on an inactive route. The temporary
intake fixture was removed after the UI proof. See the egress ledger for the
instrumented request and payload counts.

This is an administrative read slice. The legacy intake facets still describe
learner demand and child-specific admission; the native lesson selector and
release controls still own delivery. The next implementation gate is to
separate the route-wide technical fact result from editorial review in native
validators, connect affected-scope invalidation for writes and route changes,
then shadow a single route's candidate adapter against its current selector.
Remove overlapping page calculations only after their distinct intake or
native-selection meaning has been confirmed and the shadow comparison passes.

The prefix route now has a read-only shadow comparator. An affected-word
staging transition proved that approval and withdrawal appear on the next
route-scoped read without a dictionary-wide readiness rebuild. A disposable
database fixture then loaded four approved prefix members through the native
profile loader. Both the admin status and native selector admitted four, and
the compiler accepted the selection. A governed pair de-assignment reduced
admin admission to three while the unguarded native selector still chose four.
The prefix assignment writer now reads the latest exact pair decisions for
its candidate words and excludes de-assigned members before selection. The
same fixture proved that four words become insufficient after that veto;
a later restore removed the veto and returned admin admission to four.
Disabling the profile also emptied the native pool. All fixture rows were
removed. The existing atomic prefix publisher already creates reviewed
member snapshots, so no new route-specific word list was introduced.

The writer slice built successfully in isolated Preview
`dpl_3PeFjtr2c1s29jtfWcBTMGcNtWtS`. Next gate: prove the
normal authenticated assignment action with a disposable child and a reviewed
five-word profile. Verify a withdrawn transfer is replaced by another approved
word, saved snapshots replay, and a post-selection withdrawal cannot race a
persisted assignment. Retain the full governed relationship interpreter as
the status authority; this single-query veto closes the newly proved writer
gap without adding its full read cost to each assignment.

## Progress after the authenticated save and withdrawal review gates — 25 Oct 2026

The authenticated five-word staging proof now covers stale selection
rejection before save, replacement with another reviewed transfer, frozen
snapshot replay, and post-save withdrawal replay. The database guard orders
the pair decision and assignment save within the same transaction boundary.

The subsequent child-lifecycle slice keeps a withdrawn learning item stored
but removes its pair from new lesson needs and skill-proficiency supports.
Historical review schedule rows and review-word facts remain; qualifying
reviews still contribute to word-level mastery evidence. A disposable staging
fixture exercised these paths through `loadDailyPlanFacts` and verified full
cleanup. This implements the owner's review and word-mastery decision without
restoring the withdrawn pair's teaching eligibility.

Remaining gates are resolver skill attribution after exact-pair withdrawal,
a parent/admin explanation for a blocked queued need, concurrency stress for
the save lock, and a browser completion/retry verifier for the released route.
Measure the daily-plan decision query's payload and latency against a
comparable baseline before claiming sitewide speed or egress savings. The
review policy's final `mastered` state still requires parent-reviewed
authentic use; review success supplies word-level production evidence only.
