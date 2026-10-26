# Prefix manual intake and completion repair — disposable staging, 26 October 2026

## Scope and result

The two defects exposed by the fresh Prefix proof have bounded repairs on branch
`adle-readiness-next`: manual writing can now create a parent-verified, governed
spelling candidate, and assignment completion now records its first completion
time while committing section items and the assignment header together.

**The complete writing-to-lesson Prefix flow passed on disposable staging.**
The parent-verified sample produced two governed candidates, both became
learning items after exact reviewed mapping/content were available, and the
ordinary generator selected them. The child completed the lesson in the browser;
Finish, reload, assignment state, and next-day review schedule all agreed.
This is staging evidence. The earlier Production Prefix proof used synthetic
queue items and remains separately labelled as such.

## Environment and provenance

- Disposable Supabase project: `qkpjbajicacbrphthibk`; Production is
  `wwohrqtunajrbwxyssjf`. No Production record or release setting was changed.
- Local Next server on port 3100 used the disposable project's environment and
  `ADLE_CANONICAL_INTAKE_ENABLED=enabled`; automated Chromium visited the
  real parent Review Work page. Vercel Preview currently points to Production
  Supabase, so no Preview deployment was used for this staging proof.
- Staging test child `ad006d19-e1c2-46d7-a809-614702fc4765`, sample
  `20338336-0a60-4e8a-8075-86b6bd95ff71`, and synthetic completion assignment
  `6d048dac-e6fd-47e0-9806-ceaac40aabe7` are disposable QA fixtures.
- The staging `D4_MOR_PREFIXES_UN` catalogue row was made assignable solely as
  disposable test configuration. No Production curriculum row was changed.
- The sparse staging database initially had 61 dictionary words and no Prefix
  profile or reviewed mapping. A bounded mirror copied only the eight approved
  `un-` word/metadata/dictation/member rows, their active reviewed profile, and
  the two exact active visible mapping facts from read-only Production queries
  into staging. New staging rows carry QA source metadata and a dedicated import
  batch `1953a335-44c6-4fd4-a223-6568050217b1`; no Production child data was
  copied. The active review and banding policy versions were copied because the
  disposable database had neither. The profile was kept `production_enabled`
  false and admitted only by the staging route environment.

## Verified observations

1. The authenticated parent capture RPC saved two exact sample occurrences as
   `parent_local_promoted` candidate mappings. Both durable intake rows have
   `source_submission_id=null`, the exact `source_writing_sample_id`, and the
   expected source misspelling occurrence. It did not invent a task submission.
2. The shared evaluator returned `pending_mapping` for both candidates. The
   Review Work page displayed both corrections and “Awaiting reviewed
   misspelling mapping”; this was the correct initial blocker. Repeating the
   first correction through the actual parent page returned the saved
   confirmation and reused the candidate. After mirroring approved source
   facts, reevaluation returned `eligible=2`, `inserted=2`, and no blockers.
3. The authenticated assignment RPC left the header pending after the first
   item, then marked the final item and header completed in one transaction.
   `session_completed_at` was non-null. This was a synthetic assignment probe,
   separate from the real Prefix lesson.
4. The ordinary parent generator created Prefix assignment
   `2e8b8e8a-0325-4fe1-9bfa-3eb720d45662`. Its lesson snapshot contains both
   activated learning-item IDs; the four selected words were `unhappy`,
   `unlocked`, `unfair`, and `unkind`. The latter two were transfer words. The
   child browser completed teaching, discovery, split, meaning, build, four
   covered recalls, four dictated sentences, and reflection. Finish returned
   the completed screen after reload. [Completed staging lesson screenshot](screenshots/prefix-manual-staging-complete-2026-10-26.png).
5. Durable readback: assignment `completed`, 16 of 16 items `completed`,
   `session_completed_at=2026-10-26T13:59:41.029Z`, both authentic learning
   items `awaiting_review_outcome`, and one active review bundle
   `88f849a9-4a62-43e4-9ed0-21f5de567bdc` due 27 October containing exactly
   `unhappy` and `unlocked`. The two learning-item source rows point to the
   exact parent-verified candidate mappings. The assignment's legacy
   `source_learning_item_ids` array stayed empty; its compiled lesson snapshot
   carries the exact references used by this route.
6. The four focused PGlite SQL regressions, TypeScript check, targeted ESLint,
   ADLE attempt-capture regression, and `git diff --check` passed. The local
   full Supabase reset stopped at an older seed-dependent migration requiring
   873 dictionary words; the new migrations were instead applied and read back
   on disposable staging.

## Production release checks

The earlier Production Review Work skill menu appeared empty. A read-only
26 October database check under the `authenticated` role now returns 296 active,
assignable D4 skills, including `D4_MOR_PREFIXES_UN`. Thus a current catalogue
or RLS absence is ruled out; the original request failure has no captured
PostgREST error or response and remains un-attributed. The form must be checked
again on the exact Production release before claiming the live handoff works.

The assignment RPC covers only item/header writes. Prefix attempt persistence,
review scheduling, and reflection still run before that RPC as separate
operations. A whole-lesson transaction was not claimed or proved.
