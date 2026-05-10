# Course Builder Unification Implementation Plan

## Status

- Complete
- Closed on 8 May 2026
- Current relevance: completed implementation record for Slices `1` to `10G`
- Follow-on work: `Slice 11` is now also complete, with later builder work moved into post-Slice-11 follow-on planning

## Purpose

This document breaks Course Builder Unification into safe implementation slices.

It should be used with:
- [docs/contracts/course-builder-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/course-builder-contract.md:1)
- [docs/architecture/course-builder-unification-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/course-builder-unification-architecture.md:1)
- [docs/implementation/completed/recurring-progress-canonicalization-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/recurring-progress-canonicalization-plan.md:1)
- [docs/archive/reviews/course-builder-unification-review.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/reviews/course-builder-unification-review.md:1)
- [docs/archive/reviews/course-builder-unification-expert-review-pack.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/reviews/course-builder-unification-expert-review-pack.md:1)

## Final handover status

- Slice `9B` is implemented.
- Static checks passed:
  - `npx tsc --noEmit`
  - targeted eslint on the touched course-builder validation files
- Manual `9B` QA is complete and confirmed.
- Slice `10` audit and pilot-readiness pass is implemented.
- Static checks passed after the Slice `10` pilot-readiness fixes.
- Slice `10` pilot report remains the handover source for the original pilot-readiness evidence.
- Post-pilot remediation through `Slice 10A` to `10F` was completed.
- Manual rerun checks for `Slice 10G` have passed.
- The Slice `10` track is closed with deferred debt explicitly moved into `Slice 11`.

## Final repo truth

- Slices `1` through `10` are landed as the original unification sequence.
- Slice `10` should now be treated as:
  - pilot-readiness audit complete
  - pilot report complete
  - post-pilot remediation complete
  - QA rerun and closeout complete
- The next historical follow-on after this record was `Slice 11`, which is now complete and archived separately in [docs/implementation/completed/course-builder-slice-11-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/course-builder-slice-11-plan.md:1).

## Naming distinctions

- `course builder` means the parent authoring and review flow under `/courses`.
- `child learning surfaces` means the child-facing runtime under `/learn`.
- `review detail` / `submission detail` means the parent review page for one submission.
- `review queue page` means the parent review list page.
- These distinctions matter because course-builder remediation must not silently widen into unrelated review-runtime semantics.

## Slice 1 — Rename `Phased` to `Progress` in parent UX only

**Status**
- confirmed implemented on 2 May 2026

**Goal**
- use `Progress` in parent-facing course-builder UX while preserving current internal `phased` data semantics

**Files likely affected**
- course-creation and course-edit UI
- parent-facing labels and helper copy
- documentation references in builder surfaces

**Data model changes**
- none required

**Acceptance criteria**
- parent sees `Progress`
- internal value may remain `phased`
- no completion or unlock behavior changes

**Tests/manual checks**
- create a course using `Progress`
- confirm it still behaves like current phased structure
- confirm no child unlock regressions

**Risks**
- terminology drift between docs and code comments
- confusion if some parent screens still say `Phased`

## Slice 2 — Shared creator visibility and task-type filtering

**Status**
- confirmed implemented and manually verified on 2 May 2026

**Goal**
- make one shared lesson/task creator honor course-type-specific choices

**Files likely affected**
- parent task/lesson creator UI
- creator validation helpers
- course-type visibility rules

**Data model changes**
- none required initially

**Acceptance criteria**
- `Checklist` available in both modes
- `Lesson` available in both modes
- `Focus block` available only in `Timed`
- lessons still route through structured lesson schema

**Tests/manual checks**
- open creator in `Progress` and confirm no `Focus block`
- open creator in `Timed` and confirm `Focus block` appears
- confirm lesson flow still uses structured builder rules

**Risks**
- UI filtering without matching validation
- accidental reintroduction of mode-invalid task types

## Slice 3 — Timed phase generation

**Status**
- confirmed implemented and manually verified on 2 May 2026

**Goal**
- generate first-class timed phases from:
  - start date
  - duration
  - phase count

**Files likely affected**
- timed course setup UI
- phase generation logic
- course detail reads for timed structures

**Data model changes**
- possible strengthening of timed phase metadata

**Acceptance criteria**
- timed course generates ordered phases
- week windows are visible
- parent can rename phases
- holiday shifts can be modeled later without renumbering assumptions breaking

**Tests/manual checks**
- create timed course with different phase counts
- verify generated ordering and week windows
- verify parent rename persists

**Risks**
- weak phase metadata shape
- later holiday shifting may expose hidden assumptions

## Slice 4 — Timed recurring goal model

**Status**
- confirmed implemented and manually verified on 2 May 2026

**Goal**
- introduce canonical timed goals with clear type boundaries

**Files likely affected**
- timed goal authoring UI
- timed goal read/write services
- parent insights goal summaries

**Data model changes**
- likely goal typing support:
  - `numerical`
  - `aspiration`

**Acceptance criteria**
- course-level numerical goals are distinct from aspiration goals
- phase-level recurring goals are distinct from course-level goals
- no second completion model is introduced

**Tests/manual checks**
- create both goal types
- verify aspiration goals do not behave like recurring checklist engines
- verify numerical goals support pacing concepts

**Risks**
- collapsing course goals and recurring goals into one vague model
- leaking pace logic into completion truth

## Slice 5 — Checklist recurrence and quantity entry

**Status**
- implemented with canonical recurring progress read-model unification on 2 May 2026
- confirmed implemented and manually verified on 2 May 2026
- canonical recurring summary now resolves through `getRecurringTaskProgressSummary(...)` in `lib/courses/progress.ts`
- learn week planner, learn course page, learn module page, and task detail page now render recurring month totals from that shared helper instead of local card math
- learn week mini cards and the month rollup now resolve that helper against the visible planner date instead of an implicit client-side `today`

**Goal**
- support calm recurring logging for timed goals and recurring checklist work

**Files likely affected**
- recurring checklist/task UI
- occurrence logic
- child logging surfaces
- parent insights missed-event summaries

**Data model changes**
- possible explicit occurrence tracking or equivalent derived rolling model
  - no new table was required in this pass
  - canonical source of truth remains `task_completions`
  - recurring child surfaces now read through one shared summary helper instead of per-page month math
  - no second recurring or completion table was introduced

**Acceptance criteria**
- daily recurring supports current-day logging
- weekly recurring supports one current weekly occurrence only
- quantity entry works where relevant
- missed events surface in insights rather than duplicate backlog cards

**Tests/manual checks**
- log daily quantity
- log weekly quantity
- verify next weekly occurrence appears only when the next week begins
- verify missed week behavior does not create duplicate cards
  - verified on 2 May 2026
  - weekly same-occurrence accumulation confirmed
  - next weekly occurrence does not go live inside the same week
  - missed weekly events surface in insights without duplicating child planner cards
  - note: the “other mini cards updated” expectation only applies when the same recurring task is rendered in additional week-card placements

**Risks**
- inconsistent recurrence semantics across pages
- underdefined missed-event behavior

## Slice 6 — Focus block engine

**Status**
- implemented on 2 May 2026
- manual verification completed on 3 May 2026
- timed parent flow should read as `Course goals -> Cycles -> Add tasks to cycles`, with recurring tasks and focus blocks planned inside that cycle-oriented task flow rather than as a detached parallel track
- module task lists now render focus blocks as parent rows with nested mini tasks collapsed by default and editable from the parent row
- module-row focus-block editing now includes add, remove, and reorder support for linked mini tasks, and mini-task expansion uses a local disclosure instead of a server roundtrip
- rewarded focus blocks now surface the “Keep going” encouragement popup after each mini-task completion until the full focus-block reward is earned

**Goal**
- add timed-only focus blocks with ordered mini-task progression

**Files likely affected**
- focus-block authoring UI
- focus-block runtime
- scheduling integration
- parent insights summaries

**Data model changes**
- focus-block structure may need ordered mini-task support if not already sufficient
  - v1 uses existing `focus_blocks` plus ordered linked `course_tasks`
  - no second focus mini-task table was introduced in this pass

**Acceptance criteria**
- focus blocks exist only in `Timed`
- progress derives from mini-task completion
- next mini task can move into `To be scheduled`
- focus-block reward behavior in v1 is:
  - none
  - or one simple completion reward
  - shared timed creator exposes `Focus block` alongside `Checklist` and `Lesson`
  - choosing `Focus block` loads a focus-block mini-task builder instead of the lesson builder

**Tests/manual checks**
- create focus block
- complete mini tasks in order
- confirm next task promotion works
- confirm no reward splitting behavior appears in v1
- confirm module task lists keep focus mini tasks hidden until the parent opens the focus block row
- confirm the parent can edit the focus block from that same module row
- confirm module-row focus-block editing can add or remove linked mini tasks and save the new order
- confirmed in manual QA on 3 May 2026

**Risks**
- conflation with recurring goals
- overbuilding rewards before the base flow is stable
- keep `Focus block` available only in `Timed` and only through the shared Step 3 creator, not as a separate canonical builder step

## Slice 7 — Review markers

**Status**
- implemented on 3 May 2026
- manual verification completed on 3 May 2026
- `Progress` review markers now link to a selected phase through `course_checkpoints.phase_id`
- `Timed` review markers remain cycle-linked through `course_checkpoints.cycle_number`
- parent course views now surface review markers inside the relevant phase/cycle planning views without changing unlock or completion truth

**Goal**
- add lightweight review markers/checkpoints after phases in both course types

**Files likely affected**
- parent review-marker UI
- course detail selectors
- parent insights/course summaries

**Data model changes**
- may reuse or lightly extend checkpoint records
  - this pass lightly extends `course_checkpoints` with a nullable `phase_id` for `Progress` placement

**Acceptance criteria**
- review markers can be added after phases
- they are visible as informational checkpoints
- they do not block progression by themselves

**Tests/manual checks**
- add review marker to `Progress`
- add review marker to `Timed`
- confirm no unlock/completion behavior changes
  - in `Progress`, confirm the parent can choose the phase and the review marker appears under that phase
  - in `Timed`, confirm the current cycle review marker continues to appear in the cycle checkpoint area
- confirmed in manual QA on 3 May 2026

**Risks**
- review markers becoming accidental gates
- confusion with task completion checkpoints

## Slice 8 — Parent insights selectors

**Status**
- implemented on 3 May 2026
- manually verified on 4 May 2026
- parent insights warning truth now routes through shared selectors in `lib/courses/insights.ts`
- `Progress` now shows locked/unlocked path summaries, phase-path counts, and informational review-marker summaries
- `Timed` now shows recurring pace signals and missed-week summaries from shared selectors rather than page-local mapping
- timed parent insights now also expose live recurring month totals from the same recurring progress summary used by week/course surfaces
- recurring child and parent surfaces now also expose all-time task totals from that same shared recurring progress summary
- no new warning tables were added; v1 remains selector-first
- follow-on architecture work for recurring windows, goal pacing, missed-event normalization, and recurring read-surface reconciliation is now complete and manually verified in:
  - [docs/implementation/completed/recurring-progress-canonicalization-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/recurring-progress-canonicalization-plan.md:1)

**Goal**
- centralize derived parent warnings and course progress summaries

**Files likely affected**
- parent insights selectors/helpers
- parent insights UI
- shared course read-model helpers

**Data model changes**
- none required initially if selector/read-model approach is sufficient

**Acceptance criteria**
- `Progress` shows locked/unlocked path summary
- `Timed` shows recurring pace and missed-event summaries
- warnings are selector-driven, not page-local

**Tests/manual checks**
- compare warnings against raw logged activity
- confirm insights reconcile with course/week surfaces
- confirm child pages do not define parent warning truth
  - compare `Progress` path counts against the ordered course/module path on the course page
  - compare `Timed` pace warnings against recurring task month totals and missed-week summaries on `/learn/week` and course surfaces
- confirmed in manual QA on 4 May 2026

**Risks**
- duplicated warning logic
- denormalizing too early instead of proving selector-first behavior

## Slice 9 — Validation hardening

**Status**
- updated for human handover on 5 May 2026
- Slice 9 should now be treated as four completed sub-steps plus one final audit gate:
  - `Slice 9A — Timed cycle-first reconciliation`
  - `Slice 9A.1 — UX cleanup and interaction coherence`
  - `Slice 9A.2 — Step 3/5 corrective alignment`
  - `Slice 9A.3 — Architecture stabilization and closure gate`
  - `Slice 9B — Validation hardening`
- Slice `9A` is complete.
- Slice `9A.1` has been incorporated and superseded by the implemented `9A.2` and `9A.3` follow-on passes where appropriate.
- Slice `9A.2` is complete.
- Slice `9A.3` is complete.
- Slice `9B` is implemented and manually verified.
- Final audit and handover review are still pending before `Slice 10`.

**Locked Slice 9 product decisions**
- timed parent wording uses cycles
- phase wording is not parent-visible in timed UX
- timed checkpoints associate with cycles
- `cycle_number` remains the current internal placement field
- timed backing modules remain internal compatibility details only
- child-facing timed views must not expose:
  - backing module names
  - `_timed_phase_backing_`
  - phase task containers
  - module IDs
  - compatibility containers

**Goal**
- enforce mode-specific correctness outside the UI, but only after the timed authoring model is reconciled to the intended cycle-first UX

**Why the slice is split**
- the approved product model is now:
  - `Timed` parent UX is cycle-first
  - cycles are the visible organizing units in the parent flow
  - tasks are authored against cycles
- the live schema still stores tasks on modules
- hardening validation directly against the current loose timed module-first flow would cement a legacy behavior the product no longer wants

**Slice 9A — Timed cycle-first reconciliation**

Goal:
- align timed authoring to the intended cycle-first parent workflow before tightening validation

Status:
- implemented on 4 May 2026
- uses a compatibility-layer backing module per timed phase

Implemented shape:
- keep cycles as the visible organizing unit in timed parent UX
- if task storage still requires modules, use a compatibility layer:
  - one system-generated backing module per timed phase
  - parent authors against the cycle
  - server resolves the matching phase to its backing module for storage
- do not expose legacy timed module-first authoring as canonical
- keep legacy timed modules readable in the parent UI as compatibility-only records rather than losing or hiding older timed tasks

Acceptance criteria:
- timed parent workflow reads as:
  - Course Creation
  - Cycle Creation
  - Add Tasks to Cycles
  - Add Checkpoints
  - Full Review and Submit
- timed tasks can be created against cycles without the parent needing to reason about modules
- schema compatibility is preserved without treating visible timed modules as the product model

Manual checks:
- create a timed course
- add cycles
- add tasks to a cycle
- confirm tasks persist and render correctly after refresh
- confirm checkpoints still attach correctly in timed flow

Notes:
- modules remain internal compatibility storage for new timed cycle-backed authoring
- historical Slice 9A.1 cleanup work has been completed and superseded by the implemented `9A.2` and `9A.3` stabilization passes

Historical product direction locked by the completed `9A` passes:
- timed parent UX should use cycle language
- course goals should not appear inside cycle setup
- helper information should be on-demand through an info affordance
- timed tasks should be assignable to cycles through one compact composer
- the builder should behave like a linear progression, not a dashboard with step chips

Key UX gaps to resolve:
- timed Step 1 still mixes course setup and cycle setup
- course goals and goal mapping are still too close to cycle framing
- helper content is still too prominent instead of on-demand
- timed task creation still creates too much vertical repetition
- legacy timed modules still need clearer compatibility framing
- the overall builder flow still does not feel linear enough

Implementation plan:

Phase 1 — Reframe timed language around cycles
- target:
  - [app/courses/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/page.tsx:1)
- changes:
  - rewrite timed course option copy to cycle-first language
  - explain that timing drives generated cycles in parent-facing language
  - keep the create-course panel focused on one primary job: start the right kind of course
  - demote helper framing that is not required for the first decision

Phase 2 — Separate course setup from cycle setup
- target:
  - [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1)
- timed changes:
  - make course setup and cycle setup separate jobs
  - remove course goals from the cycle setup section
  - keep cycle setup focused on:
    - cycle structure
    - optional current cycle focus
    - cycle checkpoints
  - keep the builder summary-first, but without prominent generated-phase framing at the top
- phased changes:
  - review step labeling and summary density for parity with timed
  - ensure phased steps also follow the same summary-first discipline

Phase 3 — Replace prominent helper blocks with on-demand help
- target:
  - [app/courses/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/page.tsx:1)
  - [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1)
- changes:
  - replace prominent helper panels with info-icon-driven tooltip or popover patterns
  - ensure help is available on hover and click/tap
  - keep the main action path visually dominant

Phase 4 — Collapse timed task creation into one compact composer
- targets:
  - [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1)
  - [components/shared-task-creator-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/shared-task-creator-form.tsx:1)
- changes:
  - use one compact task composer for timed authoring
  - add a cycle-assignment dropdown
  - keep the primary control row limited to:
    - cycle
    - title
    - task type
    - add action
  - use cycle-facing names only in the selector, not cycle-plus-phase labels
  - branch the composer by task type so only relevant fields stay visible
  - move secondary detail such as instructions into the type-specific area below the primary row
  - hide minutes for now
  - keep lesson-specific selections horizontal
  - present lesson starter templates as compact minimized chips
  - start reward configuration on `reward on completion` while preserving existing reward validation behavior
  - keep grouped cycle summaries below
  - show scheduled tasks under each cycle row with collapsible detail and edit/delete affordances
  - avoid repeating a full task form under every cycle

Phase 5 — Make the builder feel linear
- targets:
  - [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1)
- changes:
  - make each step carry one primary job
  - trim dashboard-like content from the main wizard path
  - keep next actions and blockers obvious
  - retain review as a readiness gate

Phase 6 — Keep legacy timed modules secondary and safe
- targets:
  - [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1)
- changes:
  - keep legacy modules accessible
  - keep them clearly secondary
  - ensure they do not compete visually with the cycle-first canonical flow

Phase 7 — Split deep editors by decision type
- targets:
  - [app/courses/[courseId]/modules/[moduleId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/modules/%5BmoduleId%5D/page.tsx:1)
  - [app/courses/[courseId]/modules/[moduleId]/tasks/[taskId]/edit/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/edit/page.tsx:1)
  - [app/courses/[courseId]/edit/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/edit/page.tsx:1)
- changes:
  - group task edit into sections:
    - task identity
    - content or lesson
    - pacing
    - rewards
    - state or visibility
  - group course edit into:
    - identity
    - structure and timing
    - publishing state
  - review module detail page for clearer sub-sections:
    - summary
    - add task
    - existing tasks
    - focus block and linked work
    - child progress hints

Phase 8 — Standardize state handling and empty states
- targets:
  - course list
  - course detail
  - module detail
  - task edit
  - review
- changes:
  - explicitly design:
    - empty
    - active
    - incomplete
    - blocked
    - compatibility
    - ready
  - ensure every empty state answers:
    - what belongs here
    - why it matters
    - what to do next

Recommended order:
1. `app/courses/page.tsx`
2. `app/courses/[courseId]/page.tsx`
3. timed course setup and cycle setup separation
4. compact timed task composer with cycle assignment
5. review/readiness cleanup in that same page
6. module/task deep editors
7. copy/state polish
8. docs update last

Acceptance criteria:
- timed course entry uses cycle-first product language from the start
- course goals are not shown inside cycle setup
- helper guidance is available on demand rather than visually dominant
- timed task authoring uses one compact composer with explicit cycle assignment
- timed authoring uses the approved five-step spine only:
  - course goals
  - cycles
  - tasks
  - checkpoints
  - course overview
- no separate timed support-work step remains in the canonical flow
- timed Step 4 uses:
  - cycle selector labels rather than raw cycle-number input
  - checkpoint dates defaulted from selected cycle end dates
  - one compact list of all scheduled checkpoints
  - edit/delete affordances on checkpoint rows
- timed Step 4 does not include legacy-module content
- timed Step 5 combines readiness and missing-setup state into one top-level block
- timed Step 5 review tips move behind an info affordance when not blocker-level
- timed Step 5 shows full course scope by cycle:
  - cycle identity
  - date range
  - scheduled tasks
  - checkpoints
- timed Step 5 removes duplicate legacy-module summaries from the main review body
- timed Step 5 removes writing/spelling bridge content from the main review flow
- legacy timed modules are visible but clearly secondary
- the builder feels linear, with one primary job per step
- final review acts as a readiness gate, not just a recap
- phased review still treats modules as canonical in phased authoring and review

Remaining `Slice 9A.1` correction focus:
- normalize the `Focus block` branch so it follows the same Step 3 hierarchy and density rules as the other shared-composer modes
- tighten timed Step 5 so it reads as the child-order overview before launch, not just a grouped review grid
- remove any remaining interpretive prose from Step 5 once visible status and structure already explain the state

Recommended workflow for the remaining `Slice 9A.1` pass:
1. inspect the shared Step 3 composer branch-by-branch, not just at the top level
2. verify every task type against the same checklist:
   - stable primary row
   - compact secondary detail
   - no empty or weak wrappers
   - collapsibility for heavyweight authoring tools
3. treat Step 5 as a child-order review surface first, then decide explicitly whether final-order adjustments are in or out of scope
4. if reordering is included in Step 5, name it as a deliberate final-order workflow instead of letting it drift in as layout polish
5. review the implementation against the mistake log before closing the pass, especially:
   - branch inconsistency inside shared systems
   - field-level cleanup without layout cleanup
   - visible step labels updated without equivalent structure/hierarchy updates in sibling branches

Manual checks:
- create a timed course from the course list
- confirm timed language uses cycles rather than phases in parent-facing setup
- open a timed course with no tasks and confirm one clear next move
- confirm course goals do not appear in cycle setup
- add tasks through one shared composer and assign them to different cycles through a dropdown
- confirm no separate support-work step appears in timed authoring
- create timed checkpoints and confirm the selected cycle defaults the date to the cycle end
- confirm Step 4 shows one full checkpoint list across the course and allows edit/delete actions
- confirm Step 5 combines readiness and missing-setup state into one top block
- confirm Step 5 shows tasks and checkpoints grouped by cycle in the final overview
- confirm writing/spelling bridge content is absent from the main Step 5 review flow
- confirm the `Focus block` creator follows the same compact Step 3 hierarchy as the other task types
- confirm Step 5 reads as the child-facing order of the course, not just a grouped review summary
- confirm any remaining Step 5 explanatory sentence is hidden behind an info affordance unless it is blocker-level
- open a timed course with legacy timed modules and confirm they remain accessible but visually secondary
- review a partially complete timed course and confirm blockers are obvious
- review a complete phased course and confirm modules remain canonical in phased review
- open task edit and module detail on narrow screens and confirm grouped sections remain usable

**Slice 9A.2 — Step 3/5 corrective alignment**

**Status**
- complete
- manual QA passed after the Step 5 post-action redirect correction and the final `Focus block` parity review

**Goal**
- close the remaining UX drift inside the already-approved timed builder model without widening scope into validation or schema work

**Files likely affected**
- `app/courses/[courseId]/page.tsx`
- `components/shared-task-creator-form.tsx`
- `components/structured-lesson-builder.tsx`
- any directly-related focus-block builder component if compact-mode behavior must change

**Data model changes**
- none

**Primary corrections**
- normalize the `Focus block` branch so it follows the same Step 3 hierarchy and density rules as the other shared-composer modes
- tighten Step 5 so it reads as the child-order overview before launch
- remove any remaining non-blocker prose from Step 5 once visible status and structure already carry the meaning

**Acceptance criteria**
- every Step 3 task type, including `Focus block`, satisfies the same layout checklist:
  - stable primary row
  - compact secondary detail
  - no empty or weak wrappers
  - collapsibility for heavyweight authoring tools
- the `Focus block` creator no longer behaves like a visually separate mini-builder
- Step 5 uses collapsible cycle rows where appropriate
- tasks and checkpoints appear underneath the relevant cycle in order
- Step 5 reads as the child-facing order of the course, not just a grouped review summary
- Step 5 exposes explicit final-order adjustment controls for task and focus-block order
- remaining explanatory prose in Step 5 is hidden behind an info affordance unless it is blocker-level

**Manual checks**
- open Step 3 in every timed creator mode and confirm branch parity, especially `Focus block`
- confirm the `Focus block` path keeps the same top-row hierarchy as the other task types
- open Step 5 and confirm cycle rows present the child-facing order of work and checkpoints
- confirm any remaining Step 5 prose is either blocker-level or hidden behind info

**Working checklist to close Slice 9A.2**
- fix Step 5 ordering actions so successful postback returns to Step 5 instead of the start of the wizard
- verify every new Step 5 ordering form preserves:
  - active step
  - scoped child/mode path
  - relevant local review state
- re-run Step 3 branch-parity QA across:
  - checklist
  - lesson
  - test
  - recurring daily
  - recurring weekly
  - focus block
- confirm `Focus block` no longer has any stronger wrapper weight than sibling creator modes
- confirm the compact focus mini-task builder is:
  - collapsed by default
  - lighter than the previous special-case mini-builder
  - still operationally complete
- re-run Step 5 child-order QA and confirm:
  - cycle rows stay collapsible
  - tasks appear in the intended child-facing order
  - focus blocks appear as grouped ordered units
  - checkpoints remain legible within current date-driven ordering constraints
- recheck narrow-screen behavior for:
  - Step 3 focus-block authoring
  - Step 5 cycle rows and ordering controls
- do not mark `9A.2` complete until the redirect regression and branch-parity review are both closed

**Close-out result**
- Step 5 ordering actions now preserve the parent’s place on Step 5
- timed Step 3 creator modes passed the final branch-parity review, including `Focus block`

**Risks**
- treating the shared composer as fixed while leaving one branch inconsistent
- improving grouped review content without actually making it child-order legible
- shipping working ordering controls with broken wizard-step postback behavior

**Slice 9A.3 — Architecture stabilization and closure gate**

**Status**
- complete
- follows `Slice 9A.2`

**Goal**
- make the approved timed-builder UX durable by locking implementation ownership, branch parity rules, Step 5 interaction boundaries, and completion gates before `9B`

**Files likely affected**
- architecture docs
- implementation plan docs
- course-builder UX docs
- only targeted code if small ownership cleanups are required to support the architectural boundary

**Data model changes**
- none by default

**Architecture safeguards**
- define component ownership for:
  - shared task composer shell
  - task-type branches
  - focus-block branch
  - checkpoint management surface
  - final review / child-order overview surface
- lock a branch-parity checklist for all Step 3 creator modes
- make the Step 5 interaction boundary explicit:
  - read-only child-order overview
  - or final-order adjustments allowed
- add a completion gate for the full `9A` sequence so closure cannot happen while one shared branch is still lagging

**Current owner map**
- shared Step 3 task-composer shell:
  - `components/shared-task-creator-form.tsx`
- Step 3 lesson authoring sub-surface:
  - `components/structured-lesson-builder.tsx`
- Step 3 focus-block mini-task authoring sub-surface:
  - `components/focus-block-mini-task-builder.tsx`
- Step 4 timed checkpoint creation surface:
  - `components/timed-checkpoint-creator-form.tsx`
- Step 4 and Step 5 timed surface composition:
  - `app/courses/[courseId]/page.tsx`
- Step 5 final-order adjustment actions:
  - `app/courses/actions.ts`

**Acceptance criteria**
- one documented owner exists for each of the main timed-builder surfaces
- the same branch-parity checklist is required for every Step 3 creator mode
- Step 5 interaction scope is explicit and no longer inferred from layout
- `9A` closure requires:
  - doc alignment
  - routing alignment
  - shared-branch alignment
  - mistake-log regression review
  - manual QA on every timed Step 3 branch and Step 5 overview path

**Implementation result**
- owner map documented and aligned with the live timed-builder files
- the Step 3 branch-parity checklist is now part of the required closure gate, not just a recommendation
- Step 5 interaction scope is explicitly locked as:
  - child-order overview
  - plus compact final-order adjustment surface before launch
- `9A` closure is now blocked unless:
  - docs align
  - routed UI aligns
  - branch parity aligns
  - mistake-log regressions are checked
  - manual QA covers the required timed flows

**Manual checks**
- verify ownership boundaries against the live files before closing the pass
- verify the parity checklist has been applied to all Step 3 creator modes
- verify the Step 5 interaction boundary is reflected in both docs and UI

**Risks**
- closing `9A` on visual progress while leaving architectural drift in shared branches
- allowing Step 5 to become half review surface and half editing surface without an explicit product decision

**Slice 9B — Validation hardening**

**Status**
- implemented
- static checks passed
- manually verified

Goal:
- enforce the intended `Progress` and `Timed` invariants in actions/services rather than relying on UI-only filtering

**Files changed**
- `app/courses/actions.ts`
- `lib/courses/validation.ts`

**Data model changes**
- none required by default
- a compatibility-layer helper for timed backing modules is acceptable if schema storage still depends on modules

**Implementation result**
- shared server-side validation helpers now own the main mode and placement checks
- unsafe structure switching is blocked against linked course-builder records instead of relying on UI-only filtering
- shared creator writes now reject invalid `creator_mode` / `task_type` combinations server-side
- phased courses reject timed-only task modes even if the UI is bypassed
- focus block compatibility actions now validate timed-course structure explicitly
- checkpoint create/update now enforce phased-vs-timed placement rules server-side

**Acceptance criteria**
- invalid mode/task combinations are rejected
- `Progress` does not allow timed-only structures
- `Timed` rules are enforced even if UI is bypassed
- unsafe phased/timed structure switching is blocked once core linked planning or activity records exist:
  - modules
  - tasks
  - task completions
  - task submissions
  - course checkpoints
  - focus blocks
  - course goals
  - goal mappings
  - direct course-linked reward ledger events
- completion rules still defer to the universal progress contract

**Static checks**
- `npx tsc --noEmit` passed
- targeted eslint passed

**Tests/manual checks**
- attempt invalid task creation across both modes
- verify server-side validation catches it
- verify no UI-only assumptions remain
- attempt unsafe structure switching on populated courses
- confirm valid phased and valid timed authoring still work end to end

**Manual checks confirmed**
- invalid task creation across both modes now rejects correctly
- unsafe structure switching is blocked on populated courses
- valid phased and valid timed authoring still work end to end
- timed checkpoints remain cycle-linked
- timed compatibility storage remains internal and not parent-visible

**Risks**
- relying on surface-level filtering only
- introducing hard validation before the timed cycle-first model is reconciled
- preserving legacy timed module-first authoring by accident instead of isolating it as an implementation detail

**Deferred items**
- full `creator_mode` vs `task_type` contract cleanup
- `phase_id` model-role split
- `cycle_number` naming cleanup
- checkpoint ordering model only when product scope requires it

## Post-9A architectural fix requirements

These are approved follow-on architecture fixes, but they should not all be pulled into one slice.

### Resolve next with validation / shared-builder hardening

- remove the shared-builder alias split between:
  - `creator_mode`
  - `task_type`
- goal:
  - one canonical creator-type contract for shared Step 3 branching, validation, and documentation
- why next:
  - this alias directly affects active shared UI logic and increases branch-drift risk

### Resolve after `9B` in a model-clarification pass

- separate the dual role currently carried by `phase_id`
- current problem:
  - phased ownership and timed backing-module routing are different concepts
- goal:
  - keep the shared engine while making those responsibilities explicit rather than implicit
- why later:
  - this is a model-boundary cleanup with migration and compatibility risk, not just a UX/validation cleanup

### Resolve later in a domain naming / schema tidy-up pass

- review whether `cycle_number` should remain as the long-term internal timed-placement field
- goal:
  - decide whether the current field remains acceptable hidden implementation detail or should be renamed/reframed with related timed entities together
- why later:
  - this is low product-risk if kept behind parent-facing cycle labels

### Resolve only when product scope requires it

- add a dedicated checkpoint ordering model only if product needs checkpoint order to be independent from scheduled date
- current accepted boundary:
  - checkpoint order remains date-driven within the current schema
- trigger for change:
  - parents need stable sequence semantics beyond date ordering
  - child presentation or reporting depends on explicit checkpoint position as separate truth

## Slice 9 final audit requirements

Before `Slice 10`, the final audit must confirm:
- all relevant write paths use shared validation helpers where `9B` intended them to
- no legacy write path bypasses the shared validation rules
- child-facing timed views do not expose:
  - backing module names
  - `_timed_phase_backing_`
  - phase task containers
  - module IDs
  - compatibility containers
- the current implementation has been reviewed for:
  - code contraction opportunities
  - duplication reduction
  - avoidable performance risks
- the implementation and documentation are ready for human takeover without requiring reconstruction of Slice 9 status

## Slice 10 — QA and manual pilot

**Status**
- implemented as a pilot-readiness audit and handover pass on 5 May 2026
- static checks passed after the final Slice `10` fixes
- pilot report created
- controlled human/browser pilot findings are now being folded into the post-Slice-`10` remediation track

**Goal**
- validate the unified course-builder flow with a controlled manual pilot before broad expansion

**Files likely affected**
- QA docs
- test fixtures
- pilot notes
- small child-surface leak fixes where needed

**Data model changes**
- none

**Implementation result**
- created the Slice `10` pilot report for human takeover
- removed the remaining timed child week-planner module-framing leak so timed child planning now stays cycle/course framed
- preserved all previously approved Slice `9A` and `9B` product and validation boundaries
- left deferred architectural debts explicitly deferred

**Acceptance criteria**
- parent can create and use both course types
- child can operate both course types without confusion
- pace warnings behave as documented
- no duplicate backlog behavior appears in weekly recurrence

**Tests/manual checks**
- end-to-end `Progress` creation and child unlock pass
- end-to-end `Timed` creation and recurring logging pass
- focus-block use in `Timed`
- review-marker visibility
- parent insights reconciliation
- parent review/approval flow
- child week-planner check for timed course framing

**Static checks**
- `npx tsc --noEmit` passed
- targeted eslint passed

**Manual pilot note**
- The Codex Slice `10` pass completed the pilot-readiness audit, plan update, and pilot report.
- A real controlled human/browser pilot remains required as the rerun gate in `Slice 10G`, using `docs/archive/reviews/course-builder-slice-10-pilot-report.md` plus the remediation checks below.

## Post-Slice-10 remediation sequence

These slices are the active implementation sequence for closing the course-builder track after the pilot-readiness handoff.

## Slice 10A — Documentation truth pass

**Status**
- landed and manually verified

**Goal**
- align this implementation plan with current repo truth and the real post-pilot state

**Scope**
- reconcile Slices `1` to `10`
- remove stale “pilot is the next step” framing
- add the remediation slices and closeout gate
- keep naming distinctions explicit across:
  - course builder
  - child learning surfaces
  - review detail / submission detail
  - review queue page

**Acceptance criteria**
- current repo truth is reflected accurately
- the doc reads as a post-pilot remediation plan
- the active slices are `10A` through `10G`

## Slice 10B — All-course operational controls

**Status**
- landed and manually verified

**Goal**
- add missing operational controls that affect both `Progress` and `Timed` courses

**Scope**
- add activate/deactivate control so unfinished courses can stay hidden from child learning surfaces
- keep parent access to hidden courses inside the course builder
- remove the redundant course-detail review bridge after confirming the shared review page remains the correct review home

**Acceptance criteria**
- course activation state is easy to change and clearly visible
- hidden courses stay out of child learning surfaces until the parent reactivates them
- the course builder no longer carries a redundant review section when the dedicated review page already covers that workflow

## Slice 10C — Progress-course workflow fixes

**Status**
- landed and manually verified

**Goal**
- remove the main authoring friction points in `Progress` courses

**Scope**
- add task duplication support
- restore the same builder header/navigation model on task creation and editing pages
- remove the unnecessary focus column from `Progress` course views

**Acceptance criteria**
- parents can copy a task cleanly
- task create/edit pages preserve builder context
- `Progress` views no longer carry `Timed`-only focus framing

## Slice 10D — Child workflow fixes

**Status**
- landed and manually verified

**Goal**
- make child module and submission flows more coherent

**Scope**
- bulk select to add tasks to week from child module view
- clear route back to module after submitting work

**Acceptance criteria**
- child module view supports efficient week planning
- post-submission flow does not strand the child away from module context

## Slice 10E — Builder UX consolidation

**Status**
- landed and manually verified

**Goal**
- reduce authoring friction by centralizing decisions and trimming repeated explanation

**Scope**
- centralize lesson-builder inputs
- compact task creator actions into clearer save/publish/delete controls
- reduce repeated helper text and over-reliance on hover-only explanation

**Acceptance criteria**
- related decisions are grouped together
- action hierarchy is clearer
- repeated explanatory copy is reduced without losing meaning

## Slice 10F — Full UX standards sweep

**Status**
- landed and manually verified

**Goal**
- review the whole course builder against the UX standards and apply safe cleanup

**Scope**
- every parent course-builder surface
- relevant child learning surfaces touched by this plan
- explicit review against:
  - summary-first
  - one primary action
  - progressive disclosure
  - compact metadata
  - actionable status
  - consistent save behavior
  - scanability

**Acceptance criteria**
- the builder has a recorded UX defect sweep
- safe fixes are applied
- larger issues are explicitly deferred rather than left implicit

## Slice 10G — QA rerun and closeout

**Status**
- landed and manually verified

**Goal**
- rerun the controlled pilot logic after the remediation work and decide whether the plan can close

**Scope**
- progress-course end-to-end pass
- timed-course end-to-end pass
- child learning-flow pass
- operational controls pass
- UX standards signoff

**Acceptance criteria**
- remediation checks pass or are explicitly deferred
- final pilot outcome is recorded
- closeout decision is explicit

## Slice 10G closeout outcome

**Overall outcome**
- passed with deferred debt

**What is complete**
- `Slice 10A` documentation truth pass
- `Slice 10B` all-course operational controls
- `Slice 10C` progress-course workflow fixes
- `Slice 10D` child workflow fixes
- `Slice 10E` builder UX consolidation
- `Slice 10F` full UX standards sweep
- `Slice 10G` QA rerun and closeout

**What remains but is accepted as Slice 11 work**
- simplifying course creation into a leaner conditional entry model
- compressing phased setup into a smaller numerical truth surface
- unifying module and task authoring through a shared builder shell
- flattening the structured lesson builder
- redesigning final review for large-course scale
- reducing code size by splitting oversized builder pages/actions and removing duplicated orchestration

**Closeout decision**
- this plan is ready to live in `docs/implementation/completed/`
- remaining debt is accepted as `Slice 11` work, not unresolved `Slice 10` defect work

## Post-closeout follow-up track — Slice 11

This is a new track, not an extension of `Slice 10`.

Reason:
- `Slice 10A` to `10G` are about post-pilot remediation and closeout.
- The next set of builder decisions are larger UX and architecture choices.
- This is the right moment to reduce code size and remove duplicated builder patterns rather than layering more fixes onto already-large files.

### Architectural findings carried into Slice 11

- [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1) is still too large and mixes setup, task authoring, checkpoints, review summaries, timed-specific framing, and step orchestration in one file.
- [app/courses/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/actions.ts:1) is carrying too many unrelated builder mutations in one action surface.
- [components/structured-lesson-builder.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder.tsx:1) and [components/shared-task-creator-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/shared-task-creator-form.tsx:1) already provide reuse, but the surrounding pages still duplicate orchestration, framing, and save-state presentation.
- `Progress` and `Timed` authoring still share concepts, but they are not yet expressed through a clean common builder shell with mode-specific branches.
- Final review and large-course scanability need a deliberate data-shape and layout strategy rather than more page-local patches.

### Slice 11 design rule

Every `Slice 11` pass should pursue both:
- better UX
- less code through consolidation, extraction, and removal of duplicated page logic

No `Slice 11` pass should add another parallel builder pattern if an existing one can be generalized instead.

`Slice 11` is architect-approved in principle in this repo as a coherent follow-on track:
- it is intentionally separated from `Slice 10` closeout
- it treats major builder redesign and code reduction as one combined job
- it explicitly targets oversized builder pages, duplicated orchestration, and over-specialized authoring branches

## Slice 11A — Course creation simplification

**Status**
- proposed

**Goal**
- simplify course creation so it reads as one clear entry action with minimal visible help

**Scope**
- keep creation on `/courses`
- hide timing inputs unless `Timed course` is selected
- remove any remaining visible helper prose that is not essential
- keep the entry flow compact and operational

**Key considerations**
- This should not become a second wizard.
- The form should reveal only what the user needs for the chosen structure.
- The same creation model should support both `Progress` and `Timed` courses without duplicating separate entry forms.

**Code simplification opportunity**
- replace structure-specific inline branching with one shared creation schema and a smaller conditional timing segment
- remove duplicated helper blocks and one-off layout wrappers on the course list page

## Slice 11B — Phased setup compression

**Status**
- proposed

**Goal**
- compress phased setup into a thin operational step with concise numerical truth

**Scope**
- remove unnecessary date handling from phased setup unless it drives real behavior
- reduce card density
- keep only the counts and state needed to orient the parent

**Key considerations**
- `Progress` setup should not inherit `Timed` visual weight.
- The step should orient quickly and then get out of the way.
- If a value does not materially affect phased behavior, it should not be foregrounded.

**Code simplification opportunity**
- separate phased and timed setup summaries into shared compact summary components rather than long page-local JSX branches
- reduce special-case copy and card wrappers in the setup step

## Slice 11C — Module and task authoring unification

**Status**
- proposed

**Goal**
- make adding and editing tasks feel like a seamless continuation of module authoring

**Scope**
- unify module overview and task entry framing
- remove the feeling of dropping into a different tool when creating/editing tasks
- keep builder context persistent throughout lessons and activities work

**Key considerations**
- This is a workflow coherence problem, not just a styling problem.
- Module ordering, task creation, and task editing should share one consistent navigation language.
- The UI should feel like one authoring stage with focused subviews, not separate mini-apps.

**Code simplification opportunity**
- extract a shared module-authoring shell used by module overview, task create, and task edit
- remove duplicated context bars, save rows, and header framing across module-task surfaces

## Slice 11D — Lesson builder flattening

**Status**
- proposed

**Goal**
- flatten the structured lesson builder so it stays powerful without feeling over-carded

**Scope**
- reduce nested card depth
- make content blocks feel compositional and easier to scan
- keep complex actions visible only where they are needed

**Key considerations**
- Cards should mark real boundaries, not every subsection.
- The builder must still support varied lesson structures without collapsing clarity.
- Visual simplification should not remove editing confidence.

**Code simplification opportunity**
- consolidate repeated block framing and editor wrappers inside `StructuredLessonBuilder`
- reuse shared block row primitives instead of repeated card templates

## Slice 11E — Final review scalability redesign

**Status**
- proposed

**Goal**
- redesign final review as a scalable audit surface that can hold large course structures cleanly

**Scope**
- assume 20 phases, 100 modules, and 500 lessons
- move toward grouped counts, collapsible sections, and issue-first scanning
- remove non-essential helper content from review surfaces

**Key considerations**
- Final review is an audit surface, not a teaching surface.
- The page must remain navigable even when the course is very large.
- Information density should increase without becoming chaotic.

**Code simplification opportunity**
- create a shared review-summary data model instead of building large ad hoc display sections directly in the page
- centralize count/status derivation so review rendering is less bespoke

## Slice 11F — Guidance and help policy sweep

**Status**
- proposed

**Goal**
- formalize where visible help remains and where `i` hints should take over

**Scope**
- visible guidance only for blocker-level or destructive clarity
- move all non-essential explanation to on-demand help
- apply one consistent help policy across the builder

**Key considerations**
- Help should not return as scattered inline prose.
- On-demand hints should explain, not compensate for unclear defaults.
- The help policy needs to be consistent across course, module, and task surfaces.

**Code simplification opportunity**
- standardize on a small set of helper primitives instead of bespoke explanatory rows
- delete repeated instructional copy branches once a common help policy is applied

## Slice 11G — QA, code-health, and closeout

**Status**
- proposed

**Goal**
- validate the redesigned builder and confirm the simplification work actually reduced complexity

**Scope**
- end-to-end QA for both `Progress` and `Timed`
- review of code-size and duplication reduction
- final decision on whether the course-builder track can move to `completed/`

**Key considerations**
- This phase should verify not just behavior but maintainability.
- The builder should be easier for a human to change safely after this track.
- If the UX improves but the code becomes more fragmented, the track is not done.

**Code simplification opportunity**
- explicitly measure whether page-local branching, duplicated action wiring, and repeated layout structures were reduced across the builder

## Slice 11 sequencing rule

Preferred order:
1. `11A` course creation simplification
2. `11B` phased setup compression
3. `11C` module and task authoring unification
4. `11D` lesson builder flattening
5. `11E` final review scalability redesign
6. `11F` guidance and help policy sweep
7. `11G` QA, code-health, and closeout

## Closeout conditions

This document can move to `docs/implementation/completed/` only when:

- post-pilot defects are fixed or explicitly deferred
- the UX sweep is complete and recorded
- manual pilot rerun checks have passed
- the final outcome is recorded:
  - passed without blockers
  - passed with minor deferred debt
  - or blocked by specific remaining issues

**Risks**
- trying to scale implementation before real user-path validation
- skipping cross-surface reconciliation checks

## Implementation Order Rule

Do not skip ahead.

Preferred order:
1. slice 1
2. slice 2
3. slice 3
4. slice 4
5. slice 5
6. slice 6
7. slice 7
8. slice 8
9. slice 9
10. slice 10

## Global Guardrails

Throughout all slices:
- completion and unlocking defer to [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- reward semantics defer to [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- lessons remain on the structured lesson path from [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1)
- spelling remains downstream and separate
- no second completion model may be introduced
