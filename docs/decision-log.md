# Decision Log

## 2026-06-25 — Version 2 Slice 5 is closed

### What changed
- Version 2 Slice `5` is now documented as complete rather than a next active
  planning target.
- The closeout clarifies the refined objective: when a parent sends a selected
  spelling route to admin review, the action also promotes the mapping locally
  as `parent_local_promoted`, so the child can benefit within the same
  parent/child scope while canonical/admin truth is pending.
- The later `Your saved match` behavior remains the scoped reuse proof for
  those promoted parent-local mappings.

### Why this matters
- Slice `5A` and `5B` already satisfy the product objective delivered during
  Review Work UX acceleration.
- No new Slice `5` implementation work is needed unless a new product goal is
  introduced.
- Parent-local route support remains temporary and scoped. It does not create
  global canonical truth, resolver-visible truth, catalog mutations, rewards,
  mastery, assignments, dashboard changes, scoring, analytics, or templates.

## 2026-06-25 — Stage F.2/F.3 surfaces replayable deferred returned corrections

### What changed
- Stage F replay now has a shared server-safe helper for loading planner
  context, applying the existing replay mutation contract, and projecting
  replay recommendations.
- A new `returned_correction_replay_recommendations` table stores pending,
  blocked, applied, dismissed, or superseded admin/operator recommendations
  with planner snapshots. RLS is enabled and table grants remain service-role
  only.
- Admin catalog decisions that add canonical route support or link an existing
  active assignable skill call the Stage F planner and upsert matching replay
  recommendations.
- `scripts/returned-correction-stage-f-sweep.ts` adds the Stage F.3
  scheduled-safe sweep. It is dry-run by default and only persists
  recommendations with explicit `--upsert-recommendations`.
- `/admin/canonical-mappings` now shows "Deferred learning replay available",
  replayable counts, row lineage, existing learning link/evidence state, and
  dry-run planner reasons before any manual apply.
- Regression coverage is registered as
  `npm run writing-engine:returned-correction-stage-f-automation-regression`.

### Why this matters
- Deferred Stage E/admin rows can become visible when route support arrives
  without relying on an operator remembering manual SQL or a replay script.
- The Stage F planner remains the truth model. Canonical/admin truth supplies
  route support only; learning replay still requires the preserved
  learning-relevant final classification, returned-correction attempt evidence,
  and one active assignable route.
- The sweep and admin hook do not automatically apply learning mutations.
  Replay apply stays manual, scoped, and observable.
- The implementation does not broaden RLS, expose service-role browser paths,
  mutate `micro_skill_catalog`, create canonical/admin truth from replay logic,
  create rewards, make mastery claims, write daily assignment completion, or
  perform child-side categorisation.
- Stage F.2/F.3 is closed for now as an emergency net. The current
  `waitingForRoute` row is intentionally deferred because it is a
  homophone/context-use case: the child's spelling is a valid word used
  incorrectly in context, not evidence of missing spelling micro-skill coverage.
  No placeholder route should be created just to empty the queue.
- Queue verification for replayed learning items should wait until there is an
  actual manually applied replay candidate. Homophone/context rows should be
  revisited only when a dedicated homophone/context learning model is designed
  or a true no-matching-skill spelling case appears.

## 2026-06-25 — Stage F deferred route replay implemented for scoped operator use

### What changed
- Stage F now has a pure replay planner:
  [lib/writing-engine/persistence/returned-correction-deferred-route-replay.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/writing-engine/persistence/returned-correction-deferred-route-replay.ts:1).
- Stage F now has a dry-run-first operator script:
  [scripts/returned-correction-stage-f-deferred-route-replay.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/returned-correction-stage-f-deferred-route-replay.ts:1).
- Regression coverage is registered as
  `npm run writing-engine:returned-correction-stage-f-regression`.
- Apply mode is scoped and may replay only finalised learning-relevant rows
  with returned-correction attempt evidence and exactly one active assignable
  durable/canonical/admin route.
- F.2/F.3 remain future work: admin/canonical event hooks and a scheduled sweep
  should call the same planner/mutation contract.

### Why this matters
- Deferred Stage E/admin-review rows are no longer a dead end once route support
  exists.
- Stage F preserves the core contract: canonical/admin truth supplies route
  support only; learning items still require preserved learning-relevant final
  classification plus an active assignable route.
- The implementation does not broaden RLS, mutate `micro_skill_catalog`, create
  canonical/admin truth, expose service-role access in browser paths, create
  rewards, make mastery claims, generate daily assignments, or perform
  child-side categorisation.

## 2026-06-25 — Stage E deferred admin reconciliation completed; Stage F replay is next

### What changed
- Stage E is recorded as the scoped deferred-admin reconciliation phase for
  reviewed returned corrections that are learning-relevant but have no active
  assignable route.
- In the scoped production pass, seven reviewed returned-correction rows were
  finalised as `concept_gap`, confirmed to have no active canonical mapping for
  their normalized pairs, and sent to admin review with open catalog cases.
- The pass intentionally created no learning items, learning evidence, route
  mutations, rewards, mastery claims, daily assignments, or Forge/Word
  Treasure/Golden Bar movement.
- The next best engineering stage is Stage F: deferred route replay /
  launch-scale reconciliation.

### Why this matters
- Stage E preserves the parent-reviewed learning classification while avoiding
  invented route truth.
- At launch scale, the Stage E state must be replayable after admin/canonical
  route support exists; otherwise "no matching skill" would become a permanent
  lost learning opportunity.
- Stage F should provide the dry-run-first, idempotent reconciliation job that
  replays deferred finalised rows into `learning_items` only after active
  assignable route support is proven.

## 2026-06-25 — Deferred route support must be replayable after canonical/admin truth exists

### What changed
- Future launch-scale returned-correction reconciliation is now documented as a
  required implementation path.
- A learning-relevant returned correction with no active assignable route must
  remain durable deferred evidence rather than becoming a dead end for the
  child.
- When admin/canonical work later adds an active assignable route for the
  normalized pair, a dry-run-first reconciliation job should find matching
  deferred finalised rows and create or strengthen `learning_items` only after
  route support is proven.
- The future path should be event-triggered by canonical/admin route changes
  and backed by a nightly safety sweep.

### Why this matters
- At launch scale, "no matching skill" cannot mean the child permanently misses
  the learning opportunity.
- Canonical truth is route support, not learning truth by itself. It must not
  create rewards, mastery, daily assignments, Forge/Word Treasure/Golden Bar
  movement, or learning items without preserved learning-relevant final
  classification and an active assignable route.

## 2026-06-25 — Returned-correction Stage D repair is dry-run-first and scoped

### What changed
- Stage D adds a historical repair path for returned-correction rows finalised
  before the explicit Stage C bridge existed:
  [scripts/returned-correction-stage-d-repair.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/returned-correction-stage-d-repair.ts:1).
- The repair planner lives in
  [lib/writing-engine/persistence/returned-correction-repair.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/writing-engine/persistence/returned-correction-repair.ts:1)
  and classifies rows as no action, already repaired, repairable via durable
  route, repairable via Stage C parent-local bridge, admin deferred, or unsafe
  manual review.
- Dry-run is the default. Apply requires `--apply`, `--child-id`, and either
  `--submission-id` or `--writing-issue-id`.
- Apply may only attach a Stage C-verified parent-local route and create or
  strengthen the missing learning item/link/evidence for learning-relevant
  finalised rows with child retry evidence and an active assignable route.
- `checking_only`, `not_an_issue`, parent recommendation only, and admin
  handoff remain no-learning-item paths.
- Regression coverage is registered as
  `npm run writing-engine:returned-correction-stage-d-regression`.

### Why this matters
- Historical rows can be explained and repaired without weakening the current
  product contract.
- Stage D does not invent learning truth from raw misspellings, parent
  recommendations, canonical hints, or admin handoff.
- Idempotency is explicit: existing issue links block repair, learning item
  source/link uniqueness is respected, and Stage D evidence rows are checked
  before insert.
- The repair path does not broaden RLS, mutate `micro_skill_catalog`, expose
  service-role access in browser/client paths, create canonical truth, generate
  daily assignments, create rewards, or make mastery/Golden Bar/Forge claims.

## 2026-06-25 — Returned corrections separate child retry from learning-route categorisation

### What changed
- The planned Review Work returned-correction route is clarified:
  parent send-back needs correction text and child-facing guidance, not final
  micro-skill categorisation.
- Child retry, including an "I think this is right" style response, is
  correction-attempt evidence only. It must not create mastery, rewards,
  categorisation, or learning-queue truth.
- After the child response, the parent chooses the final educational outcome:
  `checking_only`, `fragile_knowledge`, `concept_gap`, `transfer_failure`, or
  `not_an_issue`.
- Learning-relevant outcomes require an active assignable route before they can
  create or strengthen `learning_items`.
- Parent recommendations are route evidence only until explicitly confirmed or
  promoted into a child-scoped active assignable route.
- Admin handoff is deferred route support. It must not create or imply a child
  learning item until controlled reconciliation has assignable route truth.
- Stage A now adds a read-only diagnostic model in
  [lib/writing-engine/persistence/returned-correction-learning-route-diagnostics.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/writing-engine/persistence/returned-correction-learning-route-diagnostics.ts:1)
  and regression coverage in
  [scripts/writing-engine-returned-correction-route-diagnostics-regression.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/writing-engine-returned-correction-route-diagnostics-regression.ts:1).
- Stage B now blocks learning-gap finalisation before the learning-item RPC
  unless the durable issue route is active and assignable.
- Returned-correction route actions may carry pending learning-gap intent as
  route evidence, but do not write final classification onto `writing_issues`.
- Admin-deferred returned learning gaps remain deferred and block ordinary
  approval rather than entering the learning queue.
- Stage `B.1` to `B.3` align the parent UI with the workflow: pre-retry Review
  Work hides all route/micro-skill/admin/local controls and post-retry Review
  Work shows `Reason` before `Learning route`, with route controls appearing
  only after a learning-relevant outcome.
- Stage C now uses the existing parent-local candidate mapping table as the
  explicit route bridge. A returned learning gap may bridge only from a
  `parent_local_promoted` mapping that matches the same parent, child, original
  `writing_issue`, returned attempt/submission lineage, and active assignable
  micro-skill. The bridge writes the route onto
  `writing_issues.micro_skill_key`, records `returned_correction_route_bridge`
  metadata, and then calls the existing learning-item RPC. No migration was
  needed.
- Parent recommendation only remains suggestion evidence. Admin handoff remains
  deferred route support. Stage D remains the controlled repair/backfill path
  for historical rows.

### Why this matters
- The Review Work table may show local/admin route activity without the durable
  `writing_issues.micro_skill_key` being ready for learning-item creation.
- The intended implementation must distinguish retry-ready, route-ready,
  learning-queue-ready, and admin-deferred states.
- Future canonical updates may improve route metadata or repair blocked rows
  through reconciliation, but must preserve historical child evidence rather
  than silently rewriting what happened.
- The diagnostic model reports source ids, issue status, final classification,
  durable route, parent-local/admin route state, catalog active/assignable
  status, learning-item linkage, retry-readiness, learning-queue-readiness,
  disposition, and why-not reasons without changing product behavior.
- Stage B removes the old successful-looking path where an issue could be
  finalised as a learning gap while the RPC merely reported that no assignable
  learning item was created.
- Stage C makes parent-local promoted routes explicit learning-item creation
  routes only after server-side lineage and catalog checks pass. It does not
  make raw recommendations or admin handoff queueable learning truth.
- Stage C smoke passed on 25 Jun 2026: Review Work queue returned rows were
  visible, the returned detail showed the reason-first table, and selecting a
  learning-relevant reason exposed learning-route controls without submitting.

## 2026-06-25 — Slice 7 child daily spelling practice is release-ready

### What changed
- Version 2.0 Slice `7E` closes the child daily spelling practice surface with
  release-readiness coverage.
- The aggregate regression command
  `npm run writing-engine:daily-spelling-practice-surface-regression` now runs
  the read-model, child-card, viewer, and completion regressions together.
- Regression coverage now includes mixed completed/ready item status handling,
  final-item completion-form placement, thin route-action delegation, and a
  guard against adding daily-practice completion to broad `app/learn/actions.ts`.

### Why this matters
- Slice `7A` to `7D` are now documented and QA-covered as one release-ready child
  daily practice surface.
- The release boundary remains narrow: item-level delivery completion only,
  `daily_assignments.status` untouched, no answer/correctness persistence, no
  evidence, no mastery, no rewards, and legacy `/practice` plus `/assignments`
  stay redirect-only.

## 2026-06-25 — Child daily spelling practice completion is item-level delivery state only

### What changed
- Version 2.0 Slice `7D` adds a route-local completion action in
  [app/learn/week/practice/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/week/practice/actions.ts:1).
- The actual scoped mutation lives in
  [lib/writing-practice/daily-spelling-practice-completion.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/writing-practice/daily-spelling-practice-completion.ts:1).
- The viewer now offers a neutral `Done for today` action on the final supported
  item.

### Why this matters
- Completion is persisted only as `assignment_items.status = "completed"` for
  supported generated spelling items.
- `daily_assignments.status` remains untouched, and no answer attempts,
  correctness, learning evidence, mastery, rewards, course completion, canonical
  mappings, resolver state, catalog state, or Review Work state are written.
- `/practice` and `/assignments` remain redirect-only legacy paths.

## 2026-06-25 — Child daily spelling practice has a read-only item viewer

### What changed
- Version 2.0 Slice `7C` adds the child practice detail route at
  [app/learn/week/practice/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/week/practice/page.tsx:1).
- Supported generated spelling items render through the local-only viewer in
  [components/daily-spelling-practice-viewer.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/daily-spelling-practice-viewer.tsx:1).
- The child weekly card in
  [components/learn-week-planner.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/learn-week-planner.tsx:1)
  links to `/learn/week/practice` only for ready supported practice.
- Static regression coverage was added in
  [scripts/writing-engine-daily-spelling-practice-viewer-regression.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/writing-engine-daily-spelling-practice-viewer-regression.ts:1).

### Why this matters
- Children can now open today's generated practice and move through words
  without creating learning truth, attempts, completion state, evidence,
  mastery, or reward implications.
- The viewer is read-only at the data boundary and local-only in the browser; no
  migration or service-role path was added.
- Legacy `/practice` and `/assignments` remain redirect-only. Slice `7D` remains
  the decision point for any persisted completion marker.

## 2026-06-24 — Child weekly planner now surfaces daily spelling practice read-only

### What changed
- Version 2.0 Slice `7B` wires the Slice `7A` daily spelling practice read
  model into
  [app/learn/week/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/week/page.tsx:1).
- The child weekly planner now renders a neutral display-only daily spelling
  practice card in
  [components/learn-week-planner.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/learn-week-planner.tsx:1).
- Static regression coverage was added in
  [scripts/writing-engine-daily-spelling-practice-child-card-regression.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/writing-engine-daily-spelling-practice-child-card-regression.ts:1).

### Why this matters
- Generated daily spelling practice is now visible on the child weekly surface
  without triggering generation, answer capture, completion persistence,
  evidence, mastery, or rewards.
- The card keeps due review before new practice and avoids backlog, reward,
  mastery, Forge, bar, coin, and treasure language.
- Legacy `/practice` and `/assignments` remain redirect-only paths for this
  slice.

## 2026-06-24 — Child daily practice starts with a read-only server model

### What changed
- Version 2.0 Slice `7A` added a server-only daily spelling practice read
  model in
  [lib/writing-practice/daily-spelling-practice-read-model.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/writing-practice/daily-spelling-practice-read-model.ts:1).
- The read model returns scoped generated daily practice states and ordered
  `assignment_items` for future child display without triggering generation or
  completion.
- Focused regression coverage was added in
  [scripts/writing-engine-daily-spelling-practice-read-model-regression.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/writing-engine-daily-spelling-practice-read-model-regression.ts:1).

### Why this matters
- The child surface can now be built from a neutral, parent/child-scoped read
  boundary instead of reusing course-task completion or reward paths.
- Daily practice display remains separate from mastery, evidence, rewards,
  canonical mappings, resolver visibility, Review Work, and legacy `/practice`
  or `/assignments` runtime surfaces.
- Browser smoke is deliberately deferred until the next UI slice because this
  change adds no route or rendered child behavior.

## 2026-05-11 — Canonical reward projection contract is a required follow-up before broader reward work

### What changed
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1) now records a required follow-up to define a future canonical reward projection contract from `learning_items` and `learning_item_evidence` into reward-safe states.

### Why this matters
- The Writing Engine now has canonical mastery/evidence truth, but the reward system still needs a distinct downstream projection contract rather than silently reusing reward states as if they were parent-facing mastery.
- This preserves the rule that Gold Bars or reward-secure states must not be equated with the Writing Engine parent-facing state `Mastered` unless the canonical mastery/evidence requirements are genuinely met.
- It also prevents broader reward work from accidentally rebuilding a hidden parallel mastery model before the projection boundary is explicitly defined.

## 2026-05-11 — Reward, workflow, and UX docs now distinguish Gold Bar from canonical parent-facing Mastered

### What changed
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1) now treats Gold Bar as secure reward-state progress rather than automatically equivalent to the Writing Engine parent-facing state "Mastered".
- [docs/workflows/mvp-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/mvp-workflow.md:1) now distinguishes reward cadence from the canonical mastery contract and stops framing `daily_assignments` as the lasting active-practice owner.
- [docs/product/areas/targeted-writing-practice-ux.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/targeted-writing-practice-ux.md:1) now frames staged rollout behavior as implementation staging rather than long-term compatibility architecture, and explicitly treats `assignment_items` as the intended long-term composition layer.

### Why this matters
- The active UX/workflow/reward docs no longer overstate Gold Bar as equivalent to the canonical Writing Engine mastery state.
- The active docs now align better with the canonical brief and the mastery/evidence contract without changing live runtime behavior.
- Remaining contradictions are now concentrated in runtime code and reward-state implementation, where they can be addressed separately with a dedicated implementation prompt.

## 2026-05-11 — Writing Engine active docs now defer to the canonical brief and mastery/evidence contract

### What changed
- [docs/pedagogy/mastery-domain-4-spelling.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/mastery-domain-4-spelling.md:1) now keeps pedagogical meaning while deferring operational mastery stages and scoring mechanics to the dedicated mastery/evidence contract.
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1) now explicitly defers product identity to the canonical brief and mastery mechanics to the mastery/evidence contract.
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1) now limits itself to micro-skill identity, assignment rules, grouping, and routing rather than re-owning mastery rules.
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1) now defers broader Writing Engine identity and mastery semantics upward.
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1) has been reduced to current implementation state, next work, and risks.
- [docs/implementation/targeted-writing-practice-runtime-transition-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-runtime-transition-plan.md:1) is now marked as historical/reference-only and has been removed from the active implementation list in [docs/00-index.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/00-index.md:1).

### Why this matters
- The active documentation set now has clearer ownership boundaries.
- The new canonical brief and mastery/evidence contract can now function as real governing sources instead of sitting beside overlapping older material.
- Older implementation records remain available for historical context without competing with the active roadmap.

## 2026-05-11 — Writing Engine mastery and evidence mechanics now have a dedicated contract

### What changed
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1) is now the dedicated lower-level contract for Writing Engine mastery and evidence rules.
- [docs/00-index.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/00-index.md:1) now lists that contract in the canonical contracts section.

### Why this matters
- The canonical brief now has a lower-level contract to defer to for operational mastery semantics instead of leaving scoring, stage gates, and evidence interpretation spread across prompts, planning briefs, and pedagogy prose.
- This gives future implementation a stable place to find source weights, role weighting, stage-gate rules, transfer requirements, breadth expectations, and recurrence logic.
- It also reduces the risk that later implementation work silently invents mastery behavior in code.

## 2026-05-11 — Writing Engine canonical brief added as the top-level reconciliation source

### What changed
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1) is now the canonical top-level Writing Engine brief.
- [docs/00-index.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/00-index.md:1) now lists that brief in the architecture section so it is discoverable alongside the lower-level owner docs.

### Why this matters
- The repo now has one authoritative Writing Engine brief that merges the original mastery-model brief with later audit, retirement, and documentation-governance decisions.
- This reduces the risk of the roadmap, pedagogy docs, architecture docs, and contracts each re-stating the Writing Engine differently.
- Lower-level docs can now reconcile to one shared brief rather than drifting across multiple external planning artifacts and older implementation plans.

## 2026-05-11 — Writing Engine documentation now uses one active roadmap and one active status tracker

### What changed
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1) is now the single active implementation plan for the Writing Engine program.
- [docs/current-priorities.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/current-priorities.md:1) is now limited to:
  - current initiative
  - current stage
  - next stage
  - immediate blockers
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1) remains the live status tracker rather than a forward plan.
- [docs/implementation/targeted-writing-practice-mvp-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-mvp-plan.md:1) is now explicitly historical.
- [docs/00-index.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/00-index.md:1) now points to the roadmap as the active Writing Engine plan and keeps the older MVP plan out of the active implementation list.

### Why this matters
- The repo now has one trusted implementation reference for the Writing Engine instead of overlapping planning sources.
- This reduces drift between architecture, contracts, status, and execution sequencing.
- It also prevents external planning files from becoming the practical source of truth after implementation has already moved into the repo.

## 2026-05-04 — Recurring canonicalization track is complete through Phase E and manually verified

### What changed
- The recurring progress canonicalization track is now complete through:
  - Phase A selector contract lock
  - Phase B window-based recurring runtime
  - Phase C goal progress summaries
  - Phase D weekly-only missed-event normalization
  - Phase E recurring read-surface reconciliation
- Manual verification has now confirmed:
  - recurring month totals reconcile across child and parent surfaces
  - all-time totals update across those surfaces
  - phase and course goal summaries reconcile with linked recurring logs
  - weekly missed-event behavior remains weekly-only and parent-facing

### Why this matters
- Follow-on project work no longer needs to keep re-opening recurring truth as a blocker.
- The next delivery focus can move back to the broader course-builder roadmap and adjacent refactor tracks.

## 2026-05-04 — Missed-event tracking is weekly-only in v1

### What changed
- Phase D of the recurring-progress canonicalization plan is now implemented.
- The canonical missed-event selector contract is now explicitly weekly-only in v1.
- The shared missed-event selector evaluates:
  - `recurring_weekly` tasks only
  - the previous closed Monday-Sunday window
  - no completion in that completed week = missed
- Parent insights remains the warning surface for missed events.

### What was intentionally not added
- daily missed-event counts
- phase-window missed-event counts
- course-window missed-event counts
- weekly good days as missed-event gates

### Why
- The product now has a shared recurring runtime and shared goal progress layer, so missed-event semantics were the next place where drift could spread if left implicit.
- Weekly-only v1 keeps warnings consistent without creating a second completion model or child-facing punitive backlog behavior.

## 2026-05-03 — Recurring progress must move from month-first summaries to a window-based selector model

### What changed
- A dedicated implementation plan was added at [docs/implementation/completed/recurring-progress-canonicalization-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/recurring-progress-canonicalization-plan.md:1).
- The current recurring model is now explicitly treated as an intermediate state:
  - shared write truth in `task_completions`
  - shared recurring selectors in `lib/courses/progress.ts`
  - but still largely month-first for pacing
- The agreed long-term direction is now:
  - one recurring selector family
  - window-based progress summaries for:
    - day
    - week
    - month
    - phase
    - course
  - a dependent goal-summary layer for numerical goals
- Phase A is now implemented:
  - the shared recurring selector contract is window-based
  - the active live runtime still uses `month`
  - missed events remain weekly-only in v1
  - weekly good days remain advisory only
  - parent insights supports neutral recurring summaries alongside warnings
- The next confirmed Phase B task is now a data-shape correction:
  - canonical timed phase windows must use generated `course_phases` boundaries
  - `CoursePhaseRow` and shared course-detail queries must expose phase date fields to the progress selector
  - pages and selectors must not recompute phase boundaries from course start/cycle length when stored or queryable phase dates exist
- Phase B is now implemented:
  - `course_phases.start_date` and `course_phases.end_date` are now the canonical timed phase boundary fields
  - the shared course-detail path now exposes those fields to both parent and child readers
  - the recurring selector runtime now supports explicit `month`, `phase`, and `course` windows
  - `phase` and `course` selector calls fail safely when boundaries are missing instead of silently downgrading to `month`

### What was intentionally not decided yet
- whether daily missed-event warnings should exist in v1

### Why
- The app now has multiple recurring surfaces:
  - child `This Week`
  - child `My learning`
  - parent `Insights`
- Parent insights Slice 8 is implemented, but future pacing work would become inefficient if more UI is built before the recurring selector contract is hardened.
- A window-based model is required so phase-level and course-level numerical goals can use the same canonical recurring truth instead of inventing separate maths.

## 2026-04-25 — Course builder reframed around Phased and Timed structures

### What changed
- The course model is now documented as two first-class setup types:
  - phased
  - timed
- `Phase` is now a first-class planning object for phased courses.
- Timed courses are now explicitly modelled around:
  - duration
  - cycles/blocks
  - recurring daily and weekly work
  - focus block per cycle
  - checkpoint/review period per cycle
- The task model direction was widened from simple writing tasks toward:
  - checklist
  - lesson
  - test
  - recurring daily
  - recurring weekly
  - checkpoint
- Reward level and optional phase completion badges were added to the documented product direction.

### What was intentionally not automated
- The app should not auto-generate a rigid full course calendar from measurable goals.
- It should not fabricate every future task instance across the whole period.
- It should not turn timed courses into a heavy scheduling engine.

### Why
- The previous documentation was structurally correct, but still too close to a database model.
- Real homeschool planning needs two distinct setup paths:
  - sequential staged learning
  - fixed-period training plans
- Parents need clearer authoring support for lessons and tests, not just checklist and writing stubs.
- Keeping recommendations separate from rigid scheduling preserves flexibility for real family life while staying deterministic and MVP-simple.

## 2026-04-23 — Course goals now guide planning instead of generating a rigid calendar

### What changed
- A new Course Goal layer was added to the course model.
- Course goals now support:
  - title
  - goal type
  - unit
  - target quantity
  - progress source
  - time span
  - success description
  - optional stretch target
  - status
- Course goals now produce structured planning guidance such as:
  - recommended task shape
  - suggested pace
  - tracking mode
  - mission suggestion
  - checkpoint suggestion
  - best next step for the parent

### What was intentionally not automated
- The app does not auto-generate every future task instance from a course goal.
- It does not create a rigid Monday-Sunday or 6-month task calendar from the goal automatically.
- It does not fabricate highly specific content tasks for skill goals.

### Why
- In homeschool planning, goals should guide structure without taking control away from the parent.
- A rigid generated calendar would feel brittle, over-automated, and hard to adjust around real family life.
- The parent needs to be able to use goals as planning guidance, then choose the actual recurring tasks, focus blocks, and checkpoints with intention.
- Keeping goals recommendation-based preserves the MVP-simple, deterministic product philosophy while making course setup clearer.

## 2026-04-23 — Product framed as homeschool course builder with universal progress psychology

### What changed
- The product is now explicitly framed as a parent-guided homeschool course builder with a spelling engine underneath.
- Courses, modules, tasks, recurring work, focus blocks, checkpoints, and writing submissions are now part of the main product story rather than a side extension.
- A universal progress psychology was added across all learning:
  - Golden Nuggets
  - In the Machine / Refining
  - Gold Bars
  - Proven Bag
- The child dashboard direction is now:
  - Today’s Training
  - Golden Nuggets in the Machine
  - Proven Bag
  - Reward Progress

### What was removed or replaced
- Replaced the older spelling-first framing where the broader course/task system felt secondary.
- Replaced the idea of separate reward logic for each learning area with one shared progress psychology across spelling and course work.
- Replaced any perfection-first reward framing with a model that values consistency, completion, and mastery.

### Why
- The platform is now growing into a homeschool system, not just a spelling tool.
- Parents need the product to support custom learning structure, not only spelling review.
- Writing created inside the platform should clearly be understood as the future bridge into spelling analysis.
- Children need a progress model where mistakes still feel valuable and in-progress work feels motivating, not like failure.

## 2026-04-27 — Reward system contract made canonical

### What changed
- A dedicated canonical reward doc was added at [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1).
- Reward language is now formally separated into:
  - progress state
  - reward currency
  - task reward rules
  - badges and collectibles
- Gold Coins are now the only spendable currency in the documentation contract.
- Gold Bars are now explicitly defined as mastery assets that can convert into Gold Coins.

### What was removed or replaced
- Replaced the earlier drift where some docs mixed progress-state labels with task reward labels.
- Replaced the old ingredient and voucher wording as the canonical model.
- Replaced the weaker informal daily reward description with a clearer default rule:
  - up to 1 Gold Coin per meaningful daily session

### Why
- The product had grown a strong emotional progress model, but the mechanics were still inconsistent across docs.
- Parents and future implementation work need one clear contract for:
  - mastery
  - currency
  - conversion
  - anti-gaming
  - pocket money transfer
- This gives the product one stable terminology set before the remaining ledger and conversion work is implemented.

## 2026-04-27 — Incorrect spelling golden path made canonical

### What changed
- The spelling workflow is now documented as:
  - child submits writing or parent uploads writing
  - likely misspellings detected
  - words already active in the queue are not duplicated
  - submission appears in `Review work`
  - parent checks highlighted text and adds missed words if needed
  - parent reviews correction, diagnosis, teaching mode, and lesson family
  - approved items generate practice automatically in the child queue
- The spelling review cadence is now documented as:
  - wrong word found -> review next day
  - if correct there -> next review in 3 days
  - if correct there -> next review in 7 days
  - if correct there -> next review in 14 days
  - if correct there -> Gold Bar
- Gold Bar regression is now documented:
  - misspelt again -> back to in progress
  - one later correct review can restore it
  - no extra Gold Coins for re-winning the same word

### What was removed or replaced
- Replaced the older vague “3 retrievals across time” wording as the main spelling mastery description.
- Replaced the older “parent sends selected writing into spelling review” flow as the only documented bridge.
- Replaced lingering task-reward wording that used progress-state labels instead of the canonical task reward rule terms.

### Why
- The docs had become directionally aligned but still contained small conflicting phrases that could confuse implementation.
- Parent review needs to stay explicit, but queue generation needs to be automatic once the parent has reviewed the item.
- The spelling cadence needed one deterministic documented schedule so product, code, and copy can converge on the same loop.

## 2026-04-23 — Parent review and child session phase completed

### What changed
- Parent review moved from a single crowded `/analyse` screen toward a clearer review flow with:
  - dedicated misspelling review
  - reviewed vs needs-review separation
  - lighter bulk actions
  - engine-mistake review
  - Supabase-first family selection
- Diagnosis became the main driver for:
  - teaching mode
  - family recommendation
  - parent-facing review wording
- Child mode `/practice` became a real 10-minute session with:
  - Start button
  - core six words
  - bonus words in a coherent order
  - lesson-type-specific interactions
  - reward feedback that should now be migrated toward the canonical Gold Coin contract
- Homophones became a first-class teaching mode instead of being treated as generic tricky words.

### What was removed or replaced
- Replaced the old idea of a flat daily approved lesson with a living spelling queue.
- Replaced the old assumption that every misspelling needs a strong lesson family with a more selective, teacher-like rule.
- Replaced the old habit of treating homophones as irregular/tricky by default with a dedicated `homophone` mode.
- Replaced heavy always-visible bulk review panels with lighter selection-first actions.

### Why
- The earlier model created too much noise in parent review.
- The engine needed a clearer distinction between:
  - what went wrong
  - how to teach it
  - how to group practice words
- Child practice needed to feel like a calm, real spelling session rather than an admin workflow.
- Parent trust improves when the UI is honest about weak diagnosis and only surfaces families when they are genuinely helpful.

---

## 2026-04-23 — Product direction expanded to include courses, modules, and tasks

### What changed
- The product direction was expanded from a spelling-first system into a broader parent-guided learning platform.
- A new course/module/task layer was added to the model:
  - courses
  - modules
  - tasks
  - recurring daily and weekly work
  - focus blocks
  - checkpoints
  - written submissions
- The intended long-term loop is now:
  course task writing -> submission saved -> spelling analysis -> spelling queue updated

### What was removed or replaced
- Replaced the narrow idea that all writing would mostly be pasted in manually by the parent.
- Replaced the assumption that spelling practice is the only child-facing structured workflow.

### Why
- The product needs to support longer-term learning, not just spelling remediation.
- Parent-created courses let the platform support subjects like chess, YouTube, and creative work.
- Writing inside tasks gives the platform its own meaningful writing inputs, which can later strengthen the spelling engine naturally.
- Separating the course/task model from the spelling queue keeps the architecture cleaner and easier to scale.
