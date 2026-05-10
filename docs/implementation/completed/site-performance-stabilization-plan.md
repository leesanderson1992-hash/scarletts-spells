# Site Performance Stabilization Plan

## Status

- Status: `Complete`
- Closed on: `8 May 2026`
- Current relevance: historical implementation record
- Follow-on work: broader `practice` / `learn` revalidation trimming, `ensureChildDailyAssignment(...)` performance follow-up, and optional further canonical parent-progress profiling remain deferred cleanup only

## Purpose

This document is the canonical implementation reference for site performance stabilization after Slice 6.

It exists to separate:
- performance cleanup
- render and action latency reduction
- read-model trimming

from:
- Slice 6 feature semantics
- targeted writing contract changes
- reward or assignment redesign

This is an implementation plan, not a product contract.

## Current observed problem categories

The current site performance issues fall into three categories:

1. slow actions after saves, approvals, confirmations, and practice updates
2. slow server-rendered pages with large query fan-out and heavy in-memory joining
3. repeated heavy read-model recomputation across parent-facing surfaces

## Already-audited hotspots

The current audited hotspots are:
- `app/learn/week/page.tsx`
- `app/insights/page.tsx`
- `app/courses/review/page.tsx`
- `app/courses/review/[submissionId]/page.tsx`
- `app/practice/page.tsx`
- broad `revalidatePath(...)` usage in action handlers, especially:
  - `app/courses/review/actions.ts`
  - `app/practice/actions.ts`
  - `app/insights/actions.ts`

Observed patterns so far:
- route-level server components fetch many related tables at once
- some reads are broader than the surface actually needs
- some reads are still mode-agnostic when only one mode uses the result
- some actions revalidate many heavy routes after one mutation
- some derived runtime summaries are recalculated repeatedly across parent-facing pages

## Naming clarity

Keep these surface names explicit in all performance work:
- `This Week` = `app/learn/week/page.tsx`
- `My Progress` = `app/insights/page.tsx`
- `review detail` / `submission detail` = `app/courses/review/[submissionId]/page.tsx`
- `review queue page` = `app/courses/review/page.tsx`

## Boundaries

Unless a later phase explicitly changes direction, performance stabilization must preserve these boundaries:
- no product semantics changes by default
- no schema changes by default
- no reward redesign
- no assignment redesign
- no visible UX redesign unless a compact change is required to prevent repeated server work
- no architectural persistence or cache layer unless Phase 3 proves trimming and reuse are insufficient

Important truth that must remain unchanged while optimizing:
- review truth stays as implemented
- contradiction rules stay as implemented
- parent approval remains the completion gate
- controlled practice remains capped at Level 3 behavior
- Slice 6 semantics are not reopened by this track

## Implementation order

Current progress:
- Phase 1 is landed and manually verified.
- Phase 2 is landed and manually verified.
- Phase 3 is landed and manually verified.

### Phase 1 — Action latency containment

Goal:
- reduce sluggishness after actions by containing overly broad route revalidation

Primary target:
- trim `revalidatePath(...)` fan-out so each action only refreshes the surfaces that truly depend on the mutation

Typical files:
- `app/courses/review/actions.ts`
- `app/practice/actions.ts`
- `app/insights/actions.ts`

Acceptance criteria:
- action handlers preserve current behavior and messaging
- stale state does not appear after approvals, returns, confirmations, or practice writes
- routes unrelated to the mutation are no longer invalidated by default
- `npx tsc --noEmit` passes
- targeted eslint passes

Status:
- landed
- manual checks complete

### Phase 2 — Page render cleanup

Goal:
- reduce render time on the slowest server-rendered pages

Primary target:
- remove overfetching
- tighten filters
- stop fetching unrelated rows and then filtering in memory
- gate expensive reads by actual mode or surface usage

Primary surfaces:
- `app/learn/week/page.tsx`
- `app/insights/page.tsx`
- `app/courses/review/page.tsx`
- `app/courses/review/[submissionId]/page.tsx`
- `app/practice/page.tsx`

Acceptance criteria:
- visible behavior stays the same
- the page reads only the rows and fields it actually needs
- mode-specific work is not done for the wrong mode unless required by shared structure
- existing counts, statuses, and review queues still reconcile
- `npx tsc --noEmit` passes
- targeted eslint passes

Current implementation note:
- start with low-risk trims on `learn/week`, `insights`, and other live parent or child surfaces where mode-specific data is still fetched unconditionally
- only move into review-detail, review-queue, or practice read-shape changes when the win is equally clear and semantics-safe

Status:
- landed
- manual checks complete

### Phase 3 — Shared heavy-read cleanup

Goal:
- reduce repeated expensive derived reads that are recomputed across heavy parent-facing surfaces

Primary target:
- identify repeated read-model work and either extract, gate, or reuse it

Likely areas:
- canonical parent progress reads
- positive evidence candidate computation
- legacy runtime compatibility reads
- repeated joins built separately across parent-facing surfaces

Acceptance criteria:
- no change to Slice 6 semantics
- no new persistence layer unless strictly required
- shared heavy reads are either reused or avoided when not needed
- no regression in review, `This Week`, `My Progress`, or practice truth
- `npx tsc --noEmit` passes
- targeted eslint passes

Status:
- landed
- manual checks complete

### Phase 4 — Verification and durability pass

Goal:
- confirm the cleanup work improved performance without breaking runtime truth

Primary target:
- rerun checks and perform a final cleanup audit

The audit must verify:
- action latency improved materially
- page render load improved materially
- revalidation scope is tighter
- statuses and counts still reconcile across review, `This Week`, `My Progress`, and practice
- remaining performance debt is clearly classified as either:
  - release-safe to defer
  - cleanup still recommended
  - release blocker

Acceptance criteria:
- final cleanup report exists
- remaining risks are documented clearly
- manual checks are narrowed to only what still matters

## Audit outcome

Release-readiness outcome:
- no current performance blocker for release
- remaining performance debt is acceptable and deferred

Main deferred cleanup targets:
- broader `practice` / `learn` revalidation trimming
- `ensureChildDailyAssignment(...)` performance follow-up
- optional further canonical parent-progress profiling

## Manual verification expectations

Each implementation phase should preserve:
- review queue still shows one live thread per lesson/task
- review detail and insights still reconcile with confirmed evidence state
- contradiction rules remain unchanged
- parent approval remains the completion gate
- daily practice remains capped at Level 3 behavior
- no child-facing lesson or practice regression
- no counts or status mismatches between queue, detail, and insights after revalidation trimming

Core manual checks after each phase:
- submit, approve, return, resubmit, and confirm watchouts
- complete a practice session and confirm only the necessary surfaces update
- confirm `This Week` and `My Progress` still reflect the changed state correctly
- verify no stale rows remain after queue or review mutations

## Defaults and assumptions

- This is a post-Slice-6 stabilization track, not a new feature slice.
- The current manually confirmed behavior remains the source of truth.
- Broad caching is deferred unless smaller cleanup phases fail to improve the slowest paths enough.
- The intended execution shape is:
  1. documentation setup
  2. Phase 1 implementation
  3. Phase 2 implementation
  4. Phase 3 implementation
  5. Phase 4 verification and cleanup audit
