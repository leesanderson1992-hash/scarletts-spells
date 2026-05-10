# Course Builder Slice 10 Pilot Report

## Summary status

- Slice `10` was completed as a pilot-readiness audit and handover pass on 5 May 2026.
- Post-pilot remediation through `Slice 10A` to `10F` was completed and manually verified by 8 May 2026.
- The `Slice 10G` QA rerun has passed with deferred debt accepted into `Slice 11`.
- The unified builder remains aligned with the approved `Progress` and `Timed` product model.
- One final child-facing timed leak was fixed in this pass:
  - the child week planner no longer uses module framing for timed course tasks
- Static checks passed after the Slice `10` fixes:
  - `npx tsc --noEmit`
  - targeted eslint on touched files
- Recommendation:
  - pilot-readiness evidence remains valid
  - the remediation rerun has now passed
  - `Slice 10` is closed with deferred builder architecture work moved to `Slice 11`

## Parent pilot results

### Status
- pilot-readiness audit complete
- rerun manual checks complete

### Confirmed from code and prior verified slices
- `Progress` remains phase/module-first in parent UX
- `Timed` remains cycle-first in parent UX
- timed Step `5` remains the child-order overview plus compact final-order adjustment surface
- `Focus block` remains timed-only and stays inside shared Step `3`
- timed checkpoints remain cycle-linked
- no stale parent-visible timed module-first builder framing remains in the main canonical flow

### Rerun result
- create and edit a `Progress` course end to end: passed
- create and edit a `Timed` course end to end: passed
- add tasks of all supported types: passed
- add checkpoints: passed
- reorder timed Step `5` items: passed
- confirm post-action step preservation: passed

## Child pilot results

### Status
- pilot-readiness audit complete
- rerun manual checks complete

### Confirmed from code review
- phased child views still use module framing where expected
- timed child course view uses cycle-first framing
- timed child module/task surfaces now present cycle framing rather than compatibility-module framing
- timed child week planner no longer presents module framing as the canonical timed context
- no visible `_timed_phase_backing_` or `Phase task container` leak was found in the reviewed child surfaces

### Rerun result
- open both course types in child mode: passed
- complete checklist work: passed
- log recurring daily and weekly work: passed
- submit lesson/test work: passed
- confirm focus-block progression feels coherent: passed
- confirm no internal timed compatibility language appears in the live UI: passed

## Validation results

### Confirmed
- Slice `9B` shared validation helpers remain the main enforcement path for:
  - structure switching
  - task creation/update invariants
  - focus-block compatibility
  - timed/phased checkpoint placement
- `duplicateTask(...)` remains hardened through shared validation before cloning
- timed child-facing cleanup in Slice `10` did not widen or bypass the validation model

### Remaining spot checks not re-proven by this rerun
- tampered task create/update payloads
- unsafe structure switching on populated courses
- invalid checkpoint placement attempts

## Recurring and insights sanity results

### Confirmed from code review
- recurring child surfaces continue to read through shared recurring summary helpers
- no new page-local recurring truth was introduced in Slice `10`
- month/all-time recurring display remains selector-driven rather than newly local

### Still worth checking later if these surfaces are materially changed again
- month-window reconciliation across:
  - child week planner
  - child course/task views
  - parent insights
- missed-event messaging remains parent-facing and non-duplicative for the child

## Reward and completion sanity results

### Confirmed from code review
- completion still defers to `task_completions` and submission approval flows
- no second completion model was introduced
- lesson/test review/approval remains the completion gate where required
- focus-block near-reward and reward celebration surfaces remain in place
- Slice `10` did not change reward or completion semantics

### Still worth checking later if reward or completion semantics are touched again
- lesson/test approval transitions
- recurring logging reward behavior
- no obvious doubled or dropped coin events in normal use

## Defects fixed in Slice 10

- removed the remaining timed child week-planner module-framing leak
  - timed planner cards now use course/cycle-facing context instead of module framing
- replaced one stale timed child fallback string:
  - `Open a module to begin...`
  - now cycle-first for timed courses

## Remaining risks

- The child week planner still uses shared task storage under the hood, so future work must avoid reintroducing module framing in timed child contexts.
- Deferred architectural debts remain intentionally unresolved:
  - `creator_mode` vs `task_type` contract cleanup
  - `phase_id` model-role split
  - `cycle_number` naming cleanup
  - checkpoint ordering model redesign

## Confirmed deferred items

- full `creator_mode` vs `task_type` contract cleanup
- `phase_id` model-role split
- `cycle_number` naming cleanup
- first-class checkpoint ordering model
- broader server-action contraction/splitting
- schema or migration work
- recurring-progress refactor
- reward-system refactor
- completion/unlock refactor

## Controlled pilot checklist

1. Create a `Progress` course and confirm phases, modules, tasks, checkpoints, and final review all work together.
2. Create a `Timed` course and confirm goals, cycles, tasks, focus blocks, checkpoints, and final-order adjustment all work together.
3. In child mode, open both course types and confirm the learning frame matches the product model:
   - `Progress` = module-first
   - `Timed` = cycle-first
4. Log recurring daily and weekly work from:
   - child course view
   - child task view
   - child week planner
5. Submit and review lesson/test work through the parent review flow.
6. Confirm no timed child surface exposes backing-module/internal compatibility framing.

## Recommendation

- Slice `10` is closed.
- Deferred debt is accepted into `Slice 11`.
- The next builder work should be treated as a major architecture and code-reduction track, not as unfinished `Slice 10`.
