# Course Builder Post-Slice 11 Analysis Plan

## Purpose and non-goals

This document turns the bounded follow-ups from Slice `11` into one measured diagnosis plan.

It exists to:
- explain why the remaining builder hotspots are still dense after Slice `11`
- record hard baseline metrics that can be re-measured after later implementation
- inventory the remaining action and interaction patterns that still carry architectural or performance debt
- frame the next passes as explicit follow-on work, not as a continuation of Slice `11`

This document does not:
- reopen Slice `11`
- propose a broad cleanup backlog
- act as a feature specification
- treat line-count reduction by itself as proof of success

Use this with:
- [course-builder-slice-11-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/course-builder-slice-11-plan.md:1)
- [course-builder-unification-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/course-builder-unification-plan.md:1)
- [course-builder-unification-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/course-builder-unification-architecture.md:1)
- [course-builder-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/course-builder-contract.md:1)

## Current bounded follow-ups after Slice 11

Slice `11` closed as `landed with acceptable follow-ups`.

The remaining follow-ups are now:
1. oversized course route page
2. still-broad [app/courses/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/actions.ts:1)
3. dense [components/structured-lesson-builder-editor-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-editor-list.tsx:1)
4. Step `3` legacy delete path
5. deeper timed compatibility abstraction

These are bounded post-Slice-11 follow-ups, not unfinished Slice `11` implementation work.

## Baseline metrics table

These are diagnosis baselines only. They are useful because they can be re-measured later, but they are not success criteria by themselves.

### Current line-count baselines

| Target | Current lines | Known prior baseline | Delta |
|---|---:|---:|---:|
| [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1) | `2220` | `3026` | `-806` |
| [app/courses/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/actions.ts:1) | `1805` | `3623` | `-1818` |
| [app/courses/module-authoring-actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/module-authoring-actions.ts:1) | `1524` | n/a | n/a |
| [components/structured-lesson-builder.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder.tsx:1) | `242` | `1394` | `-1152` |
| [components/structured-lesson-builder-state.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-state.ts:1) | `505` | n/a | n/a |
| [components/structured-lesson-builder-preview.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-preview.tsx:1) | `244` | n/a | n/a |
| [components/structured-lesson-builder-editor-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-editor-list.tsx:1) | `576` | n/a | n/a |
| lesson-builder extracted surface total | `1567` | `1394` | `+173` |
| [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1) | `304` | n/a | n/a |
| [app/courses/components/final-review-view-model.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/final-review-view-model.ts:1) | `417` | n/a | n/a |
| [lib/courses/timed-phase-modules.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/courses/timed-phase-modules.ts:1) | `48` | n/a | n/a |

### Structural metrics

| Target | Supporting metrics |
|---|---|
| [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1) | `.map(` count `34`; `if (` count `16`; `<form` count `11`; `<Link` count `15`; `redirect(` count `1` |
| [app/courses/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/actions.ts:1) | exported async actions `18`; `if (` count `140`; `redirect(` count `133`; `revalidateCoursePages(` count `18` |
| [app/courses/module-authoring-actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/module-authoring-actions.ts:1) | exported async actions `12`; `if (` count `107`; `redirect(` count `88`; `revalidateCoursePages(` count `9`; `revalidateCourseMutationPaths(` count `2` |
| [components/structured-lesson-builder-editor-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-editor-list.tsx:1) | line count `576`; `.map(` count `5` |
| [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1) | line count `304`; `.map(` count `5`; `<form` count `1`; still contains a legacy form-submit delete path |
| [app/courses/review/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/actions.ts:1) | exported async actions `12`; `if (` count `86`; `redirect(` count `76`; `revalidatePath(` count `17` |

## Route-page hotspot analysis

### Current problem statement

[app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1) improved significantly in Slice `11`, but it is still the largest orchestration hotspot in the builder.

It still combines:
- route authentication and navigation decisions
- Progress and Timed structure branching
- stage selection and query-string orchestration
- data loading and cross-stage summary derivation
- action wiring for course, module, task, focus-block, and checkpoint flows
- direct composition of multiple dense interaction surfaces

### Deep/root causes

The file remains large because the route still does more than route orchestration.

Core reasons:
- too much page-local stage truth derivation remains inline
- Progress and Timed behavior still share a route but not enough extracted orchestration boundaries
- read-model selection, action ownership, and section composition are still braided together
- the page still owns too many child-surface decisions directly instead of delegating to stage-level builders
- several extracted components helped reduce row density, but the route still decides too much about how those components are assembled

### Current code boundaries involved

Primary boundaries:
- [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1)
- [app/courses/components/final-review-audit.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/final-review-audit.tsx:1)
- [app/courses/components/final-review-view-model.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/final-review-view-model.ts:1)
- [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1)
- [app/courses/components/phased-module-order-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/phased-module-order-list.tsx:1)
- query/select helper boundaries under `lib/courses`

### Intended future success measures

Later improvement should be measured by:
- fewer route-level branches that derive builder truth inline
- fewer route-level responsibilities beyond auth, params, top-level data load, and stage selection
- more stage-specific view-model or orchestration helpers
- less direct wiring of unrelated action families from the route page

Line-count reduction is secondary. The real success measure is that the route reads as a stage orchestrator rather than a practical owner of builder logic.

### Explicit out-of-scope notes

This analysis pass does not:
- redesign the course builder
- split Progress and Timed into separate builders
- reopen final-review architecture from Slice `11`

## Action-surface analysis

### Current problem statement

The builder’s action layer improved in Slice `11`, but action ownership is still broad and inconsistent across surfaces.

The main tension is no longer “everything lives in one file.” It is now:
- broad domain ownership still concentrated in a few large files
- many actions still rely on redirect and revalidation-heavy success paths
- local-first interaction standards are only partially adopted across row-level flows

### Action inventory

| Action owner | Exported async actions | Approximate domains owned | Redirect / revalidation profile | Current interaction style | Assessment |
|---|---:|---|---|---|---|
| [app/courses/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/actions.ts:1) | `18` | course lifecycle, module lifecycle, phase lifecycle, parent visibility, goals, checkpoints | `133` redirects; `18` `revalidateCoursePages(` | mostly coarse-grained form-submit and route-bounce mutations | still broad; appropriate for some coarse saves, but still the practical mutation owner of too many unrelated concerns |
| [app/courses/module-authoring-actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/module-authoring-actions.ts:1) | `12` | task lifecycle, focus-block lifecycle, module-editor bulk updates | `88` redirects; `9` `revalidateCoursePages(`; `2` `revalidateCourseMutationPaths(` | mixed: coarse saves plus some newer local-first inline actions | ownership is more explicit than before, but file is still broad and still carries legacy success-redirect patterns |
| [app/courses/review/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/actions.ts:1) | `12` | submission review, issue classification, evidence acceptance, review completion | `76` redirects; `17` `revalidatePath(` | review-heavy form-submit flows | not the immediate next pass target, but useful as a comparison point for broad action ownership and redirect concentration |
| builder-adjacent form/action owners in route and module surfaces | n/a | row-level delete, edit, reorder, show/hide affordances | mixed; some still submit hidden or inline forms | local-first on covered reorder surfaces, legacy on some delete paths | this is where interaction-cost debt is still most visible |

### Deep/root causes

Core reasons the action surface still feels broad:
- action ownership is still partly organized by historical file boundaries rather than stable domains
- redirect and revalidation patterns remain concentrated in high-count action files
- local-first interaction standards were applied first to the most painful reorder surfaces, but not yet everywhere
- coarse-grained create and save flows are mixed next to high-frequency row-level flows that deserve a different interaction-cost model

### Intended future success measures

Later work should prove:
- clearer domain ownership boundaries
- narrower action files that map to stable builder domains
- fewer success redirects on high-frequency row-level interactions where immediate local feedback is safe
- preserved use of coarse-grained form-submit flows where they remain appropriate

### Explicit out-of-scope notes

This analysis pass does not recommend:
- removing all redirect-based actions
- flattening review and builder action layers into one system
- broad mutation rewrites without a targeted domain pass

## Lesson-builder editor density analysis

### Current problem statement

[components/structured-lesson-builder-editor-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-editor-list.tsx:1) is now the densest extracted lesson-builder file.

That density alone is not proof of a problem. The open question is whether the remaining density represents:
- legitimate concentration of block-family editing, or
- repeated UI-editing patterns that should become narrower sub-boundaries

### Deep/root causes

The file remains dense because:
- all block-family editing still lives in one editor boundary
- the lesson-builder state and preview boundaries were split out first, leaving editor-family complexity intentionally concentrated
- many block types still need dedicated field wiring, which naturally limits how much density can be removed without over-abstracting

### Current code boundaries involved

Primary boundaries:
- [components/structured-lesson-builder.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder.tsx:1)
- [components/structured-lesson-builder-state.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-state.ts:1)
- [components/structured-lesson-builder-preview.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-preview.tsx:1)
- [components/structured-lesson-builder-editor-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-editor-list.tsx:1)

### Intended future success measures

Any later pass should separate:
- acceptable density caused by real editor complexity
- repeated block-family scaffolding that justifies extraction

Success does not mean splitting by default. It means proving whether the file now has:
- true ownership clarity with acceptable density
- or repeated block-family patterns that are worth isolating

Do not reopen Slice `11D` unless there is new evidence of repeated ownership or scaffolding debt, not just a preference for smaller files.

### Explicit out-of-scope notes

This analysis pass does not:
- redesign the lesson schema
- reopen lesson-builder persistence
- propose speculative extractions with broad prop bundles

## Step 3 delete-path analysis

### Current problem statement

[app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1) still contains a legacy form-submit delete path.

This stands out because nearby high-frequency interactions already moved to a local-first model:
- covered reorder surfaces
- deeper module-editor delete on the targeted surface

### Deep/root causes

The Step `3` table still mixes two interaction models:
- local-first optimistic reordering through [use-optimistic-reorder-list.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/use-optimistic-reorder-list.ts:1)
- form-submit delete through `deleteTaskAction` and `deleteFocusBlockAction`

That means the surface already behaves like a local interaction shell for reordering, but still falls back to route-bounce semantics for row deletion.

### Current code boundaries involved

Primary boundaries:
- [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1)
- [app/courses/module-authoring-actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/module-authoring-actions.ts:1)
- covered comparison surfaces:
  - deeper module-editor delete path
  - reorder surfaces already moved to structured local-first actions

### Intended future success measures

Later improvement should prove:
- Step `3` delete uses the same interaction-cost standard as local-first reorder on the covered surfaces
- row deletion does not depend on an unnecessary route bounce when immediate local removal is safe
- any rollback/error handling is explicit if optimistic deletion is adopted

### Explicit out-of-scope notes

This analysis pass does not:
- propose a whole-app delete rewrite
- require every delete flow to become optimistic
- reopen final-review or lesson-builder interactions

## Timed compatibility abstraction analysis

### Current problem statement

[lib/courses/timed-phase-modules.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/courses/timed-phase-modules.ts:1) is small, but its size is not the issue. The open question is whether the remaining timed backing-module compatibility layer is:
- internal accepted debt, or
- still leaking parent-facing complexity into the builder

### Deep/root causes

The compatibility layer still exists because timed phase tasks continue to map onto a backing-module storage model under the hood.

That creates a risk that:
- route-level orchestration keeps carrying compatibility-only branching
- builder terminology drifts back toward storage-model language
- future cleanup pressure lands in parent-facing UX rather than in internal compatibility boundaries

### Current code boundaries involved

Primary boundaries:
- [lib/courses/timed-phase-modules.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/courses/timed-phase-modules.ts:1)
- [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1)
- timed course read and selection logic under `lib/courses`
- any remaining parent-facing surfaces that still reference compatibility-only concepts

### Intended future success measures

Later work should first answer whether parent-facing leakage still exists.

If no leakage exists:
- keep this as accepted internal debt

If leakage exists:
- define a narrow cleanup pass around parent-facing abstractions only
- do not widen into a storage-model redesign without new evidence

### Explicit out-of-scope notes

This analysis pass does not:
- redesign timed course storage
- remove the compatibility layer on principle
- reopen Slice `11B` or Slice `11E`

## Recommended next implementation passes

These follow-on passes should stay outside the Slice `11` document.

### Pass 1. Builder route decomposition

Target:
- [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1)

Goal:
- reduce page-local truth derivation and route-level orchestration branching

Primary success signal:
- the route page becomes a true stage orchestrator backed by extracted stage-specific read-model or orchestration helpers

### Pass 2. Action-surface reduction

Targets:
- [app/courses/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/actions.ts:1)
- [app/courses/module-authoring-actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/module-authoring-actions.ts:1)

Goal:
- continue domain-based action ownership splitting
- narrow redirect and broad revalidation concentration where safe

Primary success signal:
- the broad files stop acting like practical owners of unrelated builder mutations

### Pass 3. Targeted delete interaction normalization

Target:
- [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1)

Goal:
- bring Step `3` delete onto the same interaction-cost standard already used by the covered local-first reorder surfaces

Primary success signal:
- Step `3` row deletion no longer depends on a route-bounce success path when immediate local removal is safe

### Pass 4. Timed compatibility follow-up only if leakage is proven

Target:
- [lib/courses/timed-phase-modules.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/courses/timed-phase-modules.ts:1)
- timed builder orchestration where compatibility-only concepts still leak upward

Goal:
- isolate or reduce parent-facing compatibility pressure only if the current abstraction is still surfacing in UX or route orchestration

Primary success signal:
- parent-facing surfaces stop carrying compatibility-only branches or terminology

### Pass 5. Lesson-builder editor-family split only if justified

Target:
- [components/structured-lesson-builder-editor-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-editor-list.tsx:1)

Goal:
- split by block family only if new repetition or growth proves it is warranted

Primary success signal:
- any new extraction reduces repeated ownership or scaffolding rather than just moving JSX

## Success measures for future verification

The later implementation passes should prove improvement with both:
- structural metrics
- architectural reading tests

Structural metrics:
- line counts
- action counts by owner
- redirect/revalidation concentration
- remaining row-level form-submit interaction count on covered surfaces

Architectural reading tests:
- route pages read as orchestrators
- action files read as domain owners rather than catch-all mutation owners
- lesson-builder boundaries remain explicit and justified
- row-level high-frequency interactions use an appropriate local-first cost model where safe
- timed compatibility remains internal unless a deliberate parent-facing abstraction is required

## Explicit out-of-scope / accepted debt

These items should stay outside this analysis plan unless future work explicitly reopens them:
- extending Slice `11`
- broad review-action redesign
- learn-surface redesign
- timed storage-model replacement without new evidence
- speculative lesson-builder decomposition without repeated block-family debt
- global delete-system rewrites

Accepted debt for now:
- broad review action ownership remains outside the immediate next builder-focused pass
- timed backing-module compatibility is acceptable unless parent-facing leakage returns
- lesson-builder editor density is acceptable unless repetition or growth proves otherwise
