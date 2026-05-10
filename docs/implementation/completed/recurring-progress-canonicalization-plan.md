# Recurring Progress Canonicalization Plan

## Closed status

- Status: `Complete`
- Closed on: `4 May 2026`
- Current relevance: historical implementation record
- Follow-on work: none inside this track; future work should route through the broader course-builder roadmap
## Status

- approved on 3 May 2026 as the follow-on architecture track for recurring progress
- Phase A implemented on 3 May 2026
- Phase B implemented on 3 May 2026
- Phase C implemented on 3 May 2026
- Phase C cleanup completed on 4 May 2026
- Phase D implemented on 4 May 2026
- Phase E implemented on 4 May 2026
- Phases A-E manually verified on 4 May 2026
- current app state now has a shared multi-window recurring runtime for `month`, `phase`, and `course`
- current app state now has a shared goal progress layer for numerical timed goals backed by explicit goal-to-recurring mappings
- current app state now has one explicit weekly-only missed-event selector contract for v1
- current app state now routes recurring UI-facing read truth through one selector family and aligned shared helper semantics
- immediate engineering priority is now outside the recurring canonicalization track

## Purpose

This document is the implementation plan for making recurring-task logging, pacing, and parent warnings derive from one canonical recurring progress model.

It exists to solve a specific structural problem:
- recurring logging is written once in `task_completions`
- but different surfaces have been tempted to derive different totals and pacing views
- the app now needs one durable recurring progress engine that every surface can read without redefining the maths

This plan should be read alongside:
- [docs/implementation/completed/course-builder-unification-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/course-builder-unification-plan.md:1)
- [docs/architecture/course-builder-unification-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/course-builder-unification-architecture.md:1)
- [docs/contracts/course-builder-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/course-builder-contract.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

## Immediate next step

This track is complete through Phase E and manually verified.

Reason:
- recurring windows, goal pacing, and missed-event semantics are now locked in shared selectors
- recurring child and parent surfaces now reconcile against the same canonical selector family
- follow-on work should now move back to the broader course-builder roadmap rather than extending this track

## Files likely affected

- `lib/courses/progress.ts`
- `lib/courses/insights.ts`
- `lib/courses/queries.ts`
- `app/learn/week/page.tsx`
- `components/learn-week-planner.tsx`
- `app/learn/courses/[courseId]/page.tsx`
- `app/insights/page.tsx`
- timed goal/course summary surfaces in `app/courses/[courseId]/page.tsx`

## Decisions now locked by Phase B

1. Timed phase-window progress must use generated `course_phases` boundaries as canonical.
2. If stored or queryable phase dates exist, no page or selector may recalculate phase boundaries from course start and cycle length.
3. Weekly good days remain advisory only and do not change missed-event truth in v1.
4. Missed-event logic remains weekly-only in v1.
5. Parent insights should support neutral recurring summaries as well as warning states.
6. Course-level numerical goals should be designed to aggregate an explicit filtered set of recurring tasks rather than a single hardwired task.

## Phase B data-path outcome

Phase B resolved the remaining boundary issue as a shared data-shape task.

What is now true:
- canonical timed phase windows use `course_phases.start_date` and `course_phases.end_date`
- those dates are now part of the shared `CoursePhaseRow` shape
- parent and child course detail paths both receive those fields through the shared course-detail query path
- the recurring progress engine now consumes explicit `phase` and `course` window contexts without silently downgrading missing boundaries to `month`

## Problem statement

Recurring work currently has a shared write truth, but it still risks fragmented read truths.

The intended product model is:
- a recurring task may be logged daily or weekly
- that logged quantity should accumulate over time
- that same accumulated progress should be visible in multiple places
- recurring work may also contribute to:
  - month-level recurring task views
  - timed phase pacing
  - course-level numerical goals

The app therefore needs a recurring progress model that can answer:
- what was logged today
- what was logged this week
- how much was logged this month
- how much has been logged all time
- how much has been logged inside the current phase
- how much has been logged across the whole course
- what the expected pace is for the relevant window
- what counts as missed

## Canonical sources of truth

### Write truth

Recurring logging write truth remains:
- `task_completions.task_id`
- `task_completions.child_id`
- `task_completions.completion_date`
- `task_completions.quantity_completed`

No new page-local counters should be introduced.

### Configuration truth

Recurring task and goal configuration truth remains:
- `course_tasks`
- `course_goals`
- `courses`
- `course_phases`

Responsibilities:
- `course_tasks`
  - recurring task type
  - monthly target
  - weekly good days
- `course_goals`
  - goal scope
  - goal type
  - goal target
  - goal progress source
- `courses` / `course_phases`
  - define phase and course boundaries for window-based goal pacing

### Derived truth

The canonical derived recurring truth should live in shared selectors in `lib/courses/progress.ts` and dependent selectors in `lib/courses/insights.ts`.

No page should calculate its own recurring totals or pacing state.

## Current implemented logic

Current shared recurring summary is built in `getRecurringTaskProgressSummary(...)`.

It currently derives:
- `allTimeTotal`
- `windowType`
- `windowStart`
- `windowEnd`
- `windowTotal`
- `currentOccurrenceQuantity`
- `targetAmount`
- `remainingToTarget`
- `progressPercent`
- `expectedByNow`
- `behindBy`
- `windowLabel`
- `occurrenceLabel`

Current missed-event logic:
- only applies to `recurring_weekly`
- checks the previous closed Monday-Sunday week
- if there is no completion in that week, the task is marked as missed
- `weekly_days` remain advisory and do not change missed-event truth
- daily, phase, and course windows do not produce missed-event counts in v1

Current pacing signal logic:
- uses a monthly target
- uses the current day of month divided by days in month
- calculates a linear expected monthly amount by now
- compares month-to-date total against that expected amount

This is now the active shared recurring runtime:
- `month` is still the child-facing default window
- `phase` and `course` are now real selector windows rather than reserved contract placeholders

## Current operational decision

Until this plan is implemented:
- `task_completions` remains the canonical write truth
- shared recurring selectors remain the only acceptable read truth
- no new page-local recurring maths should be introduced
- parent insights may continue to show interim monthly pacing signals, but these should be treated as transitional, not final architecture

Phase A and Phase B outcome now locked:
- recurring selector fields are window-based at the contract level
- recurring runtime now supports `month`, `phase`, and `course`
- parent insights uses neutral recurring summaries and warning summaries from the same shared contract
- weekly missed events remain weekly-only and good days remain advisory
- canonical phase boundaries now flow from `course_phases` into the shared selector layer
- Phase D now locks one explicit shared missed-event selector contract:
  - weekly-only in v1
  - previous closed Monday-Sunday week
  - parent insights remains the warning surface
  - child backlog duplication remains out of scope

## Long-term target architecture

The long-term recurring progress model should be window-based rather than month-first.

### Core selector family

The shared selector family should support:
- `day`
- `week`
- `month`
- `phase`
- `course`

Recommended selector shape:

`getRecurringTaskProgressWindowSummary(task, completions, referenceDate, windowContext)`

Where `windowContext` determines:
- window type
- start boundary
- end boundary
- target amount
- expected pace rules

Returned fields should include:
- `allTimeTotal`
- `windowTotal`
- `currentOccurrenceQuantity`
- `targetAmount`
- `remainingToTarget`
- `progressPercent`
- `expectedByNow`
- `behindBy`
- `windowLabel`
- `occurrenceLabel`

### Goal selector layer

The next selector layer should translate recurring task progress into goal progress.

Recommended selector shape:

`getGoalProgressSummary(goal, courseContext, recurringTaskSummaries, referenceDate)`

This layer should handle:
- timed phase-level numerical goals
- timed course-level numerical goals
- recurring tasks feeding course-goal pacing without redefining completion truth

### Why this is the right structure

This preserves:
- one write model
- one set of time/window boundaries
- one family of recurring selectors
- many rendering surfaces

It prevents:
- monthly logic being copied everywhere
- phase and course pacing becoming bespoke page logic
- parent insights drifting from child surfaces

## Surfaces that must use the shared selectors

The following surfaces should remain renderers only:
- child `This Week` calendar card
- child `Recurring progress for x month`
- child `My learning > Daily Habits & Weekly Goals`
- parent `Insights`
- any future timed phase pacing view
- any future course-level numerical goal summary view

If a surface needs a recurring total, it should come from the shared recurring selector family.

## Implementation phases

### Phase A — Lock the selector contract

Goal:
- define the recurring summary contract once before widening usage

Work:
- formalize the current recurring summary fields
- add explicit window terminology
- separate:
  - current occurrence quantity
  - window total
  - all-time total
- document which fields are advisory vs completion truth

Done when:
- one recurring selector contract exists and all future work targets that contract

### Phase B — Introduce window-based recurring summaries

Goal:
- move from month-first recurring progress to window-based recurring progress

Work:
- implement a window-aware recurring selector
- add support for:
  - month window
  - phase window
  - course window
- preserve current daily and weekly occurrence logic
- resolve the canonical phase-date data path so the selector receives:
  - `phaseId`
  - `startDate`
  - `endDate`
- use generated `course_phases` boundaries as canonical for timed phase windows
- do not recompute phase boundaries in pages or selectors when stored/queryable phase dates exist

Done when:
- recurring totals for month, phase, and course can all be derived from one selector family
- shared course detail exposes canonical phase dates to the progress engine

Status:
- implemented on 3 May 2026

### Phase C — Introduce goal progress summaries

Goal:
- let numerical goals read from recurring task progress without inventing separate maths
- lock one canonical mapping from numerical goals to the recurring tasks that feed them

Work:
- lock the goal-to-recurring mapping model first
- use a normalized shared relation so one goal can aggregate an explicit filtered set of recurring tasks
- expose that mapping through the shared course-detail/query path
- define goal progress selector inputs
- map timed phase goals onto phase windows
- map timed course-level goals onto course windows
- keep aspiration goals outside this pacing engine

Requirements:
- canonical write truth must remain `task_completions`
- no page-local recurring maths or goal maths may be introduced
- `course_goals` must not infer linked recurring tasks from titles or page state
- numerical goal aggregation must resolve from an explicit shared mapping path
- the mapping path must support one goal linking to multiple recurring tasks
- the mapping path must support parent-owned validation that linked tasks:
  - belong to the same course
  - are recurring daily or recurring weekly tasks
- aspiration goals must remain outside this recurring pacing engine
- phase-level numerical goals must read from shared `phase` window summaries
- course-level numerical goals must read from shared `course` window summaries
- completion and unlocking truth must remain unchanged

Step 1 data-path outcome:
- canonical goal-to-recurring mapping now uses `course_goal_task_sources`
- shared course detail should expose that mapping rather than requiring pages to derive it
- Step 1 only locks the data model and shared query path; it does not yet roll out goal progress UI

Step 2 runtime outcome:
- shared goal progress summaries now derive numerical goal pacing from the recurring selector family
- goal targets now come from `course_goals.target_quantity` rather than from summed recurring task targets
- parent insights and timed parent course summaries can now render selector-driven phase/course goal pacing
- aspiration goals remain outside the recurring pacing engine

Cleanup outcome:
- timed insights no longer carries the transitional `recurringProgress` month alias
- parent insights now reads recurring month summaries from `recurringProgressByWindow.month`
- existing numerical goals can now be mapped or remapped from the parent course page
- the dead page-local recurring month helper was removed from the dashboard surface
- legacy month-first logic still exists in isolated non-canonical areas such as `lib/progress/stateModel.ts`, but it is no longer part of the shared recurring/goal selector path

Done when:
- parent insights can show phase/course goal pacing from shared goal selectors

### Phase D — Normalize missed-event rules

Goal:
- make missed-event semantics explicit and reusable

Work:
- lock one shared missed-event selector contract for v1
- keep missed-event tracking weekly-only
- define weekly missed truth as:
  - recurring weekly task
  - previous closed Monday-Sunday window
  - no completion in that completed week
- keep weekly good days advisory only
- make the shared missed-event selector reusable across insights and QA

Done when:
- the app has one explicit missed-event rule set rather than informal page behavior

Status:
- implemented on 4 May 2026

### Phase E — Reconcile every read surface

Goal:
- remove any remaining page-local recurring maths

Work:
- audit all recurring surfaces
- replace local recurring calculations with shared selector reads
- remove dead helpers that duplicate recurring totals
- include shared helpers that directly shape visible recurring UI state
- keep broader reward/spelling month-first logic out of scope unless it is presenting conflicting recurring truth to the user

Done when:
- every recurring count shown in UI can be traced back to one selector family

Status:
- implemented on 4 May 2026

## Acceptance criteria

### Canonical truth

- recurring logging is still written only through `task_completions`
- no UI surface stores or computes independent recurring totals outside shared selectors

### Child surfaces

- the `This Week` calendar card shows recurring totals from shared selectors
- `Recurring progress for x month` shows recurring totals from shared selectors
- `My learning > Daily Habits & Weekly Goals` shows recurring totals from shared selectors
- all-time recurring totals update immediately after the child logs more quantity

### Parent surfaces

- parent `Insights` shows recurring totals from shared selectors
- parent pace warnings reconcile with the same recurring totals seen by the child
- parent missed-event summaries reconcile with the shared missed-event selector

### Goal alignment

- timed phase-level numerical goals can read from phase-window recurring summaries
- timed course-level numerical goals can read from course-window recurring summaries
- this does not redefine completion or unlocking truth

## Manual checks

1. Log quantity on a recurring daily task twice on different days.
   Expected:
   - all-time total increases across all recurring surfaces
   - month total increases where month views are shown

2. Log quantity twice on the same recurring weekly task in one week.
   Expected:
   - current weekly occurrence quantity increases
   - all-time total increases
   - no second weekly occurrence appears

3. Compare the same recurring task across:
   - `/learn/week`
   - `My learning > Daily Habits & Weekly Goals`
   - parent `Insights`
   Expected:
   - all-time total matches
   - month total matches where shown

4. Compare a timed phase goal against the underlying recurring task logs.
   Expected:
   - phase-window total matches the shared selector result
   - no page-local pace math differs

5. Compare a timed course-level numerical goal against the same underlying logs.
   Expected:
   - course-window total matches the shared selector result
   - parent insights and course views agree

## Risks

- keeping month-first maths too long and patching around it repeatedly
- mixing recurring task pacing with completion truth
- defining missed events differently across week view and insights
- phase/course goal summaries becoming separate mini-engines
- trying to persist warning tables before selector-first behavior is proven insufficient

## Out of scope

This plan does not:
- change lesson completion rules
- change module unlock truth
- change reward semantics
- add a second completion model

Those remain governed by:
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)

## Recommended next move

The recurring canonicalization track is now complete through Phase E.

That will give the app:
- one recurring selector contract
- one window-based progress model
- one canonical phase-boundary data path from `course_phases` into the selector layer
- one clear base for phase and course numerical-goal pacing

Then Phase C and Phase D can be added without reworking the visible surfaces again.
