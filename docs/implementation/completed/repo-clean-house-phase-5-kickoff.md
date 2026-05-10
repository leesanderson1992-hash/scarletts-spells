# Phase 5 — Schema retirement readiness and final destructive cleanup

## Purpose

This document defines the Phase 5 planning/spec boundary for proving that legacy schema dependencies are fully retired before any destructive cleanup is allowed.

It authorizes:
- one later retirement-readiness verification pass
- one later final destructive-cleanup implementation pass

It does not:
- implement Phase 5
- delete schema
- authorize destructive cleanup before the required proof exists

## Why Phase 5 Is Now Unblocked Enough To Plan

Phase 0 through Phase 4 are complete.

That makes Phase 5 plan-ready because:
- Phase 2 removed direct page-local `word_progress` reads from practice, dashboard, insights, review queue, and review detail, and narrowed the remaining legacy surface
- Phase 3 consolidated reward reads and most writes through shared helpers, leaving only narrow compatibility structures
- Phase 4 normalized structured lessons as the active contract and runtime, leaving only compatibility fallback and later schema cleanup

Those runtime and documentation reductions are now documented as landed, so the repo is ready for a retirement-readiness spec even though destructive deletion is still not allowed.

## Retirement-Readiness Verification Status

As of 10 May 2026, the Phase 5 retirement-readiness verification pass and the next bounded retirement implementation pass are complete.

Current verdict:
- retirement matrix produced
- bounded retirement implementation pass completed for the blocked runtime targets
- final destructive cleanup pass implemented in repo truth
- static and search-based verification completed
- authenticated manual QA completed on the affected domain flows
- Phase 5 is now implemented and verified

## Exact Current State After Phase 4

### `word_progress`

`word_progress` is no longer the page-local hidden owner on the main runtime surfaces.

The bounded retirement pass has now removed live `word_progress` ownership from:
- child practice attempt writes
- analyse review queue sync
- canonical assignment generation fallback
- dashboard, insights, and review-queue runtime reads

Remaining `word_progress` presence is now limited to:
- historical migration records
- historical documentation records
- historical assignment-source labels normalized away from the old schema name

### Reward compatibility

Reward compatibility is narrowed to:
- direct transfer-request row creation after shared spendable-balance validation
- live reward-state tables that remain part of the current reward model

The bounded retirement and destructive cleanup passes have now removed:
- direct `children.gold_coin_balance` compatibility display reads on child-facing surfaces
- helper-side `children.gold_coin_balance` compatibility writes during coin award/spend flows
- the retired `children.gold_coin_balance` schema column from active repo truth

### Structured lessons

Structured-lesson migration is application-complete enough for clean-house purposes:
- `lesson_schema` is the active contract
- structured lessons are the only active authoring path
- structured lessons are the only active child runtime path
- the remaining plain-writing lesson/test path is compatibility-only for tasks lacking `lesson_schema`
- `content_html` destructive schema cleanup is now implemented in the final Phase 5 migration set

### Destructive state

Destructive schema cleanup is now implemented in repo truth through the final Phase 5 migration set:
- `word_progress` retirement migration
- `writing_issues.linked_word_progress_id` removal
- `children.gold_coin_balance` removal
- `course_tasks.content_html` removal

## Problem Statement

The repo has reduced legacy ownership enough to plan retirement, but it has not yet proven that all remaining schema dependencies are removable.

Schema retirement readiness means proving that every remaining read, write, fallback, and documentation dependency tied to the legacy structures is either:
- removed
- or formally retired behind no-longer-needed compatibility boundaries

The destructive cleanup pass must not start until this proof exists.

## Retirement Matrix

| Target | Live reads | Live writes | Live fallbacks / compatibility markers | Active docs dependency | Static checks | Manual QA | Readiness verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `word_progress` | No active runtime reads | No active runtime writes | Historical migration/docs markers only | No active-doc dependency remains | Pass | Pass | Destructive cleanup implemented |
| Remaining reward compatibility structures | No active `children.gold_coin_balance` reads | No active `children.gold_coin_balance` writes | Direct transfer-request creation remains current workflow, not balance compatibility | No active-doc dependency remains | Pass | Pass | Destructive cleanup implemented for retired balance compatibility |
| Remaining structured-lesson legacy fields (`content_html`) | No app/runtime reads found | No app/runtime writes found | Compatibility-only lesson fallback still documented | Legacy retirement still documented intentionally | Pass | Pass | Destructive cleanup implemented |

## Inventory Findings

### `word_progress`

Live runtime ownership has been removed from:
- `lib/spelling/ensureDailyAssignment.ts`
- `app/practice/actions.ts`
- `app/analyse/actions.ts`
- `app/dashboard/page.tsx`
- `app/insights/page.tsx`
- `app/courses/review/page.tsx`
- `app/courses/review/[submissionId]/page.tsx`

Historical markers still exist in:
- migration history
- implementation/status records describing the retired path in past tense

Active docs no longer describe `word_progress` as an active runtime dependency.

Remaining references in active docs are now limited to:
- historical-schema-debt framing
- retirement-boundary instructions
- historical implementation/status records that clearly describe prior state in past tense

Verification conclusion:
- destructive cleanup is now implemented in repo truth
- the code-read and code-write runtime preconditions are now met for `word_progress`
- the docs-active-dependency precondition is now met for `word_progress`
- authenticated manual QA is now complete

### Remaining reward compatibility structures

The remaining reward compatibility structures currently include:
- direct `gold_coin_transfer_requests` request-row creation after shared validation
- live `spelling_reward_states` and `spelling_reward_events` dependencies that still support the active reward model

Removed in the bounded retirement pass:
- direct `children.gold_coin_balance` balance reads on practice and dashboard child-facing surfaces
- direct `children.gold_coin_balance` balance writes in shared coin award/spend helpers

Live fallback or compatibility markers still exist in:
- direct transfer-request row creation in `app/insights/actions.ts`
- reward compatibility language in the active refactor docs

Active docs no longer describe `children.gold_coin_balance` as an active reward runtime dependency.

Remaining references in active docs are now limited to:
- projection/cache definitions
- retirement-boundary wording
- historical implementation notes that no longer describe live ownership

Verification conclusion:
- destructive cleanup is now implemented in repo truth
- the old balance compatibility reads/writes are now removed
- the docs-active-dependency precondition is now met for the blocked reward target
- authenticated manual QA is now complete

### Remaining structured-lesson legacy fields

For `content_html` specifically:
- no app, lib, or component runtime references were found in this verification pass
- the remaining references are in documentation and migrations
- the active schema cleanup now lands through:
  - `supabase/migrations/20260430_drop_course_task_content_html.sql`
  - `supabase/migrations/20260510_phase5_final_destructive_cleanup.sql`

Current compatibility boundary still documented:
- the remaining plain-writing lesson/test path for tasks that still lack `lesson_schema`

Active docs still describing the remaining legacy field cleanup include:
- `docs/implementation/structured-lesson-migration-plan.md`
- this Phase 5 kickoff/spec document

Verification conclusion:
- the app/runtime layer is verified after destructive cleanup implementation
- destructive cleanup is now implemented in repo truth for `content_html`

## In Scope

- retirement readiness for `word_progress`
- retirement readiness for remaining reward compatibility structures
- retirement readiness for remaining structured-lesson legacy fields if any remain

## Out Of Scope

- actual destructive schema deletion in this doc-writing pass
- repo hygiene closeout
- broad runtime redesign
- reward redesign
- lesson redesign

## Required Preconditions Before Destructive Cleanup Is Allowed

- all code reads removed or adapter-retired
- all code writes removed
- docs no longer describe the schema as active dependency
- static checks pass
- manual QA passes on affected domains

## Required Outputs Of The Implementation Pass

- one retirement matrix
- one final destructive-cleanup implementation pass

## Acceptance Criteria

- the Phase 5 doc defines the current-state inventory and cleanup boundary without leaving product decisions to a later implementer
- the spec states exactly which legacy structures are retirement-readiness targets
- the spec defines the destructive-cleanup gate conditions clearly enough that a later Codex pass does not need to choose them
- the doc explicitly distinguishes retirement-readiness verification as complete from destructive cleanup as implemented in repo truth
- the closeout explicitly says Phase 6 is complete and the clean-house program can now close because Phase 5 destructive cleanup is implemented and verified

## Required Checks

- contradiction sweep across touched docs
- link verification from:
  - `docs/implementation/repo-clean-house-plan.md`
  - `docs/current-priorities.md`
  - `docs/00-index.md`

Verification results for this pass:
- `npx tsc --noEmit`: passed
- `npm run build`: passed after rerunning outside the sandbox because Turbopack could not bind a port in the sandboxed build process
- `rg "content_html" app lib components`: no active app/runtime matches
- `rg "word_progress|linked_word_progress_id|withCanonicalWritingIssueBoundary|getLegacyWordProgressRowsForChild|buildLegacyActiveWordLookup|gold_coin_balance" app lib`: no active app/lib runtime references remain
- transition-doc contradiction sweep:
  - active transition docs now describe the retired structures in past tense or as historical records only
  - active reward docs no longer describe `children.gold_coin_balance` as a live or retained runtime dependency
- limited route boot QA on the production server:
  - `/practice` returns `307 /login`
  - `/assignments` returns `307 /login`
  - `/dashboard` returns `307 /login`
  - `/insights` returns `307 /login`
- authenticated manual QA:
  - completed on 10 May 2026 using an existing parent account
  - `practice`: pass
  - `assignments`: pass
  - `dashboard`: pass
  - `insights`: pass
  - reward surface: pass
  - post-cleanup rebuilt app rerun:
    - `practice`: pass
    - `assignments`: pass
    - `dashboard`: pass
    - `insights`: pass
    - reward surface: pass

## Destructive Cleanup Gate Verdict

Phase 5 retirement-readiness verification, bounded runtime retirement, and final destructive cleanup are complete in repo truth.

Precondition outcome:
- all code reads removed or adapter-retired: passed for the blocked runtime targets
- all code writes removed: passed for the blocked runtime targets
- docs no longer describe the schema as active dependency: passed for `word_progress`, `children.gold_coin_balance`, and active `content_html` runtime ownership
- static checks pass: passed
- manual QA passes on affected domains: passed

Final decision for this pass:
- Phase 5 destructive cleanup is implemented and verified
- Phase 6 repo-hygiene closeout is now complete and the clean-house program can be formally closed

## Documentation Closeout Instructions

After this implemented pass, update the master plan, current priorities, and index to distinguish:
- readiness specified
- readiness implemented
- destructive cleanup completed

All touched docs should now distinguish:
- readiness verification complete
- destructive cleanup completed in repo truth
- Phase 6 now allowed as the next track
