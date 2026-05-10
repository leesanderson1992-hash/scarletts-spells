# Test-Week Launch Child Lockdown And Parent Navigation Spec

## Purpose

This document is the completed implementation record for the test-week launch child-lockdown and parent-navigation pass.

It exists to:
- capture the final agreed test-week scope
- record the pass-by-pass implementation outcome
- preserve the corrected rule that hides daily spelling only, not all `recurring_daily` task types

## Status

- Complete
- Created on 10 May 2026
- Closed on 10 May 2026 after manual QA passed
- Current relevance: completed implementation record for the test-week launch pass

## Summary

This spec defines the implementation for Scarlett's test-week launch setup.

The required end state is:

- child mode exposes only `This Week`, `My Learning`, and `My Progress`
- child mode cannot practically access daily spelling / practice / review surfaces during test week
- parent mode keeps access to active course and spelling-engine tooling, but the sidebar is reorganised into cleaner nested sections
- Scarlett's child-facing progress, submissions, and rewards can be reset to a clean slate without destroying the parent-side spelling-engine evidence needed to keep building the engine

This change should be implemented as a bounded UI + routing + support-SQL pass. It is not a schema migration project and it is not a wider product-architecture rewrite.

## Status Update

- Manual checks passed for the intended test-week launch behaviour except for one brief-interpretation issue, which is now corrected in repo truth.
- The earlier implementation hid all child-facing `recurring_daily` tasks because the brief/spec wording was interpreted too broadly.
- That broad `recurring_daily` suppression was a mistake in the brief interpretation, not the intended product rule.
- Final corrected rule:
  - hide only daily spelling surfaces and the daily spelling task/runtime path
  - keep non-spelling `recurring_daily` course tasks visible in child mode when they are part of the learning plan

## Pass Status

- Pass 1 — Child Lockdown And Surface Simplification: Complete
- Pass 2 — Parent Navigation Reorganisation: Complete
- Pass 3 — Clean-Slate Reset SQL: Complete
- Pass 4 — Verification And Regression Checks: Complete

## Repo Grounding

This spec is grounded in current repo truth as of 10 May 2026.

Confirmed implementation anchors:

- shared app navigation lives in [components/app-shell.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/app-shell.tsx:1)
- child week surface lives in [app/learn/week/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/week/page.tsx:1)
- child week planner UI lives in [components/learn-week-planner.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/learn-week-planner.tsx:1)
- child course overview lives in [app/learn/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/page.tsx:1)
- child course detail lives in [app/learn/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/courses/%5BcourseId%5D/page.tsx:1)
- child module detail lives in [app/learn/modules/[moduleId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/page.tsx:1)
- child task detail lives in [app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/page.tsx:1)
- child spelling practice route lives in [app/practice/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/practice/page.tsx:1)
- child review route lives in [app/review/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/review/page.tsx:1)
- parent assignments route lives in [app/assignments/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/assignments/page.tsx:1)
- parent intake route lives in [app/analyse/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/analyse/page.tsx:1)
- parent analysis review route lives in [app/analyse/review/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/analyse/review/page.tsx:1)
- parent review-work queue lives in [app/courses/review/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/page.tsx:1)
- existing broad reset helper lives in [docs/support/sql/reset-child-learning-and-rewards.sql](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/support/sql/reset-child-learning-and-rewards.sql:1)

Important current behaviour confirmed from repo truth:

- current child nav shows `This Week`, `My Learning`, `Today's Practice`, `Review Words`, `My Progress`
- current parent nav already supports nested items via `details/summary` in the shared shell
- `app/learn/week/page.tsx` currently calls `ensureChildDailyAssignment(...)` in child mode and reads from `daily_assignments`
- `components/learn-week-planner.tsx` currently renders a spelling-practice card and recurring daily task surfaces
- child course and module surfaces currently include `recurring_daily` tasks
- the existing reset SQL deletes `misspelling_instances` and `writing_samples`, which conflicts with the required "preserve spelling-engine evidence" constraint

## Goals

- Simplify child mode to a tightly bounded test-week experience.
- Prevent Scarlett from seeing or drifting into daily spelling assignment surfaces.
- Keep parent mode fully usable for course oversight and spelling-engine building.
- Reorganise the parent sidebar into clearer grouped sections without inventing new product areas.
- Provide a support SQL reset path that clears Scarlett's child-facing progress and rewards while preserving parent-side analysis and learning-evidence history.
- Produce a spec that another Codex run can implement without making product decisions.

## Non-Goals

- Do not create new database migrations.
- Do not redesign the parent or child visual system beyond the navigation and small supporting copy changes required by this spec.
- Do not create a new standalone `Writing` parent route for this pass.
- Do not destroy spelling-engine evidence tables such as `writing_samples`, `writing_issues`, `learning_items`, or their linked evidence/history.
- Do not retire the underlying parent spelling-engine pages.
- Do not rework the broader course/task model or reward model outside the bounded reset requirements.

## Locked Product Decisions

- Test week starts tomorrow, 11 May 2026.
- Child mode should expose only:
  - `This Week`
  - `My Learning`
  - `My Progress`
- Daily spelling should be hidden from the child and direct child-mode entry should be blocked via redirect, not just by removing links.
- Parent menu should be reorganised into:
  - `Dashboard`
  - `Courses`
    - `Courses`
    - `Review Work`
  - `Insights`
  - `Spelling Engine`
    - `Assignments`
    - `Intake`
    - `Analysis`
  - `Settings`
  - `Children`
- The requested label `Instake` is normalised to `Intake`.
- The requested `Writing` submenu is intentionally dropped for this pass because no clean existing dedicated route exists and duplicating another menu target would make the sidebar misleading.
- Clean-slate SQL must preserve parent-side spelling-engine evidence/history.
- The existing broad reset helper should remain in place as historical/support utility; a new dedicated test-week reset helper should be created instead of replacing it.

## Route And Menu Mapping

### Child mode final navigation

Implement child nav as:

- `This Week` -> `/learn/week`
- `My Learning` -> `/learn`
- `My Progress` -> `/insights`

Remove from child nav:

- `Today's Practice` -> `/practice`
- `Review Words` -> `/review`

Do not add any replacement child menu item for daily spelling.

### Parent mode final navigation

Implement parent nav as:

- `Dashboard` -> `/dashboard`
- `Courses`
  - `Courses` -> `/courses`
  - `Review Work` -> `/courses/review`
- `Insights` -> `/insights`
- `Spelling Engine`
  - `Assignments` -> `/assignments`
  - `Intake` -> `/analyse`
  - `Analysis` -> `/analyse/review`
- `Settings` -> `/settings`
- `Children` -> `/children`

Implementation note:

- Preserve current query scoping via `buildScopedPath(...)` so active child and mode continue to flow through navigation links.
- Preserve the existing `details/summary` nested interaction pattern already used by `components/app-shell.tsx`.

## Child-Mode Guard Behaviour

### Routes that must be guarded

Guard these routes when `mode === "child"`:

- `/practice`
- `/review`
- `/assignments`

### Required behaviour

- Child-mode visits to any guarded route must redirect to `/learn/week` for the active child.
- The redirect must preserve child scoping using the existing `buildScopedPath(...)` helper.
- Guard behaviour should live in the page routes themselves, not only in the navigation shell.

### Why this is required

Removing nav links alone is insufficient because:

- direct URL entry would still work
- child-facing CTAs inside other surfaces could still route into blocked areas
- test-week setup requires practical removal, not a cosmetic hide only

## Daily-Task Suppression Behaviour

### Required end state

The child should not see daily spelling surfaced anywhere during test week.

This includes:

- no spelling-practice nav entry
- no spelling practice CTA on `This Week`
- no daily spelling check-in card on `This Week`
- no child-facing invitation copy that tells Scarlett to use daily spelling / review / practice

### Current repo behaviours that must be addressed

Current repo truth shows daily spelling in multiple places:

- `app/learn/week/page.tsx` calls `ensureChildDailyAssignment(...)` and reads weekly `daily_assignments`
- `components/learn-week-planner.tsx` renders spelling-practice UI and daily-task groupings
- `app/learn/courses/[courseId]/page.tsx` explicitly separates `recurring_daily` tasks
- `app/learn/modules/[moduleId]/page.tsx` and `app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx` contain `recurring_daily` handling

### Implementation direction

For the test-week pass:

- remove child-facing spelling-practice and daily-assignment UI from the week planner path
- stop child-mode week rendering from depending on current-week `daily_assignments`
- do not call `ensureChildDailyAssignment(...)` from the child week page during this bounded test-week configuration
- keep non-spelling course tasks, including non-spelling `recurring_daily` tasks, visible on child learning surfaces

Important boundary:

- do not delete the underlying daily-assignment or practice runtime
- keep parent-side routes and runtime intact
- this is a child-surface suppression pass, not a runtime retirement pass

### Child course/task surfacing rule

On child-facing learning pages:

- non-spelling `recurring_daily` course tasks should remain visible in normal child learning flows
- `recurring_weekly`, `lesson`, and `test` task handling remains intact unless otherwise blocked by existing logic

Only the daily spelling runtime/surfaces should be blocked:

- `/practice`
- `/review`
- `/assignments`

Child task detail pages for non-spelling `recurring_daily` course tasks should continue to render normally.

### Corrected implementation outcome

Repo truth after the correction pass is:

- child navigation still exposes only `This Week`, `My Learning`, and `My Progress`
- child-mode route guards still redirect `/practice`, `/review`, and `/assignments`
- spelling-practice and daily-assignment surfaces remain hidden from child mode
- non-spelling `recurring_daily` course tasks remain visible on child week/course/module/task surfaces

## SQL Reset Scope

### Required functional outcome

The reset helper must return Scarlett to a clean child-facing slate by:

- setting all task progress back to incomplete through row deletion in completion/submission tables
- removing submission history
- zeroing gold coins by deleting the ledger and transfer rows that produce the balance
- zeroing gold bars and golden nuggets by deleting spelling reward state/event rows
- removing daily spelling runtime rows tied to the child

### Existing file assessment

Current helper:

- [docs/support/sql/reset-child-learning-and-rewards.sql](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/support/sql/reset-child-learning-and-rewards.sql:1)

This file is too destructive for the test-week requirement because it deletes:

- `misspelling_instances`
- `writing_samples`

That conflicts with the preserved spelling-engine evidence requirement.

### Required implementation decision

Create a new dedicated helper file rather than replacing the existing one.

Recommended new file:

- `docs/support/sql/reset-child-test-week-clean-slate.sql`

Reason:

- preserves the existing broad reset utility for other support use
- avoids silently changing the meaning of a file that may already be used for wider wipes
- makes the narrower preservation rules explicit in the filename

### Data to clear

The new test-week reset helper should clear child-facing runtime/progress data for the configured `child_id` and `parent_user_id`:

- `public.task_completions`
- `public.task_submissions`
- `public.task_submission_drafts`
- `public.daily_assignments`
- `public.practice_attempts`
- `public.child_gold_coin_ledger_events`
- `public.gold_coin_transfer_requests`
- `public.spelling_reward_states`
- `public.spelling_reward_events`

If implementation inspection finds tightly linked child-facing rows that are created only as submission scratch state and are safe to clear without touching preserved engine evidence, they may be added only if they meet both conditions:

- they are not part of the preserved spelling-engine evidence/history
- they are keyed directly to the child-facing reset scope

### Data to preserve

Preserve these spelling-engine evidence/history areas:

- `public.writing_samples`
- `public.misspelling_instances`
- `public.writing_issues`
- `public.writing_issue_suggestions`
- `public.writing_issue_correction_attempts`
- `public.learning_items`
- `public.learning_item_issue_links`
- `public.learning_item_evidence`
- `public.writing_false_positive_suppressions`

Preserve all course-definition and planning structures:

- `public.courses`
- `public.course_modules`
- `public.course_tasks`
- `public.focus_blocks`
- `public.course_checkpoints`
- `public.task_day_plans`
- `public.task_week_selections`

### Rationale for preserving engine evidence

The parent will continue using Scarlett's work to build the spelling engine.

That means evidence and analysis history must remain available for:

- intake and analysis review
- review-work inspection
- learning-item progression and watchouts
- parent-side insight building

The reset is for the child's visible operational state, not for erasing the diagnostic corpus.

### Verification queries required in the support SQL

The new helper should end with verification queries showing row counts for at least:

- `task_completions`
- `task_submissions`
- `task_submission_drafts`
- `daily_assignments`
- `practice_attempts`
- `child_gold_coin_ledger_events`
- `gold_coin_transfer_requests`
- `spelling_reward_states`
- `spelling_reward_events`

The helper should not end with destructive checks against preserved engine-evidence tables, because those should remain non-zero when applicable.

## Likely Files To Change

This list is directional and should be used to guide the implementation pass, not as permission to broaden scope.

Primary implementation files:

- [components/app-shell.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/app-shell.tsx:1)
- [app/practice/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/practice/page.tsx:1)
- [app/review/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/review/page.tsx:1)
- [app/assignments/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/assignments/page.tsx:1)
- [app/learn/week/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/week/page.tsx:1)
- [components/learn-week-planner.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/learn-week-planner.tsx:1)
- [app/learn/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/courses/%5BcourseId%5D/page.tsx:1)
- [app/learn/modules/[moduleId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/page.tsx:1)
- [app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/page.tsx:1)

New support file:

- `docs/support/sql/reset-child-test-week-clean-slate.sql`

Supporting references that should inform implementation but not necessarily change:

- [lib/children.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/children.ts:1)
- [docs/support/sql/reset-child-learning-and-rewards.sql](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/support/sql/reset-child-learning-and-rewards.sql:1)
- [docs/support/sql/reset-targeted-writing-task-chain.sql](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/support/sql/reset-targeted-writing-task-chain.sql:1)

## Implementation Passes

## Pass 1 — Child Lockdown And Surface Simplification

Objective:

- reduce child mode to the three agreed areas
- remove access to daily spelling / practice / review during test week

Required work:

- update child nav items in `components/app-shell.tsx`
- add child-mode redirect guards to `app/practice/page.tsx`, `app/review/page.tsx`, and `app/assignments/page.tsx`
- remove or bypass child-mode `ensureChildDailyAssignment(...)` usage from the week surface
- strip spelling-practice UI and daily-assignment references from `components/learn-week-planner.tsx`
- exclude `recurring_daily` tasks from child course/module/task rendering
- add direct-entry redirect handling for child attempts to open daily task detail pages

Completion criteria:

- child nav only shows `This Week`, `My Learning`, `My Progress`
- child direct visits to blocked routes are redirected
- child week/course/module flows do not expose daily spelling

## Pass 2 — Parent Navigation Reorganisation

Objective:

- reorganise the parent sidebar into clearer grouped sections using the existing nested-nav pattern

Required work:

- restructure parent nav definitions inside `components/app-shell.tsx`
- keep route targets on existing pages only
- preserve current-child scoping and mode query behaviour

Completion criteria:

- top-level parent nav order matches this spec
- nested `Courses` and `Spelling Engine` sections expand correctly
- all links resolve to existing routes with correct child scoping

## Pass 3 — Clean-Slate Reset SQL

Objective:

- add a safe support reset helper for Scarlett's child-facing operational state

Required work:

- create `docs/support/sql/reset-child-test-week-clean-slate.sql`
- model the file structure after existing support SQL helpers
- use explicit `target_child_id` and `target_parent_user_id` declarations
- delete only the child-facing runtime/progress/reward rows listed in this spec
- preserve spelling-engine evidence/history tables
- include verification queries

Completion criteria:

- SQL clearly documents what it clears and what it preserves
- reset scope matches the locked product decision
- helper does not delete `writing_samples`, `misspelling_instances`, `writing_issues`, or `learning_items`

## Pass 4 — Verification And Regression Checks

Objective:

- verify the bounded test-week behaviour without widening scope

Required work:

- run targeted static validation after code edits
- check child navigation and redirects
- check parent nav grouping
- inspect the new SQL helper for destructive-boundary correctness

Recommended validation commands:

- repo-appropriate typecheck command if available and safe
- any targeted lint/test command that validates touched surfaces without forcing unrelated cleanup

Completion criteria:

- no child-facing daily spelling path remains accessible through normal UI flow
- parent nav matches agreed grouping
- SQL helper reflects the preserved-evidence boundary

## Verification Checklist

### Child mode checks

- child nav shows only `This Week`, `My Learning`, `My Progress`
- `/practice?child=...&mode=child` redirects to `/learn/week?...`
- `/review?child=...&mode=child` redirects to `/learn/week?...`
- `/assignments?child=...&mode=child` redirects to `/learn/week?...`
- `This Week` does not show spelling-practice cards, daily assignment cards, or daily spelling CTAs
- child course pages do not list `recurring_daily` tasks
- child module pages do not list `recurring_daily` tasks
- direct child access to a daily-task detail route does not render the task body

### Parent mode checks

- parent nav shows:
  - `Dashboard`
  - `Courses`
  - `Insights`
  - `Spelling Engine`
  - `Settings`
  - `Children`
- `Courses` expands to `Courses` and `Review Work`
- `Spelling Engine` expands to `Assignments`, `Intake`, and `Analysis`
- each parent route opens the existing intended page with correct child scoping

### Reset SQL checks

- child task completions are zero after running the helper
- child submissions are zero after running the helper
- child gold coin ledger totals are zero after running the helper
- child transfer requests are zero after running the helper
- child spelling reward rows are zero after running the helper
- preserved evidence tables still retain rows when they existed before reset

## Risks And Notes

- `app/learn/week/page.tsx` currently mixes course tasks, weekly planning, reward reads, and daily-assignment reads; keep the implementation narrow to child suppression rather than refactoring the page wholesale.
- `components/learn-week-planner.tsx` currently has many daily/practice branches; prefer removing child-facing spelling UI through focused conditions rather than a large component rewrite.
- Parent `Assignments` currently uses the same route in both modes; child-mode route guarding must not break parent access.
- Removing child-facing daily-task surfacing can affect assumptions in copy and empty states on learning pages; copy should be updated only where it directly references blocked daily spelling behaviour.
- The existing broad reset helper should not be silently narrowed, because that could break support workflows that expect the wider wipe.
- Preserving spelling-engine evidence while deleting task submissions creates an intentional asymmetry in history. This is acceptable for the test-week objective and should be documented clearly in the new SQL file header comments.

## Implementation Prompt Handoff

When implementing this spec:

- inspect the referenced files first and confirm repo reality still matches this document
- implement pass-by-pass in the order defined above
- preserve unrelated worktree changes
- do not broaden scope into schema retirement, route redesign, or general learning-surface refactors
- use the shared shell and existing `buildScopedPath(...)` pattern rather than inventing new routing helpers
- create a new support SQL helper instead of replacing the existing broad reset file
- verify child lockdown, parent nav grouping, and reset-boundary correctness before closing the task
