# Prefix manual intake and completion repair — disposable staging, 26 October 2026

## Scope and result

The two defects exposed by the fresh Prefix proof have bounded repairs on branch
`adle-readiness-next`: manual writing can now create a parent-verified, governed
spelling candidate, and assignment completion now records its first completion
time while committing section items and the assignment header together.

**The source and completion mechanisms passed staging checks. Full Prefix
writing-to-lesson signoff has not passed.** This disposable project lacks the
reviewed `un-` dictionary/profile/release and misspelling mappings needed to
select an actual Prefix lesson. Existing Production Prefix lesson evidence used
synthetic queue items and therefore cannot substitute for this intake proof.

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

## Verified observations

1. The authenticated parent capture RPC saved two exact sample occurrences as
   `parent_local_promoted` candidate mappings. Both durable intake rows have
   `source_submission_id=null`, the exact `source_writing_sample_id`, and the
   expected source misspelling occurrence. It did not invent a task submission.
2. The shared evaluator returned `pending_mapping` for both candidates. The
   Review Work page displayed both corrections and “Awaiting reviewed
   misspelling mapping”; this is the correct blocker for this sparse staging
   database. Repeating the first correction through the actual parent page
   returned the saved confirmation and reused the candidate.
3. The authenticated assignment RPC left the header pending after the first
   item, then marked the final item and header completed in one transaction.
   `session_completed_at` was non-null. This was a synthetic assignment probe,
   not a Prefix lesson Finish action.
4. The four focused PGlite SQL regressions, TypeScript check, targeted ESLint,
   ADLE attempt-capture regression, and `git diff --check` passed. The local
   full Supabase reset stopped at an older seed-dependent migration requiring
   873 dictionary words; the new migrations were instead applied and read back
   on disposable staging.

## Remaining proof gate

The disposable database has 61 dictionary words and no Prefix profiles. Its
legacy Prefix importers pin the retired staging project and assert historical
word counts, so running them against this new project would be unsafe. An
isolated, provenance-preserving import of the already reviewed `un-` content,
mapping, release, and activation is needed before this child can become ready,
generate a lesson, press Finish, reload, and verify review scheduling. No
editorial approval should be fabricated to make the test pass.

The earlier Production Review Work skill menu appeared empty. A read-only
26 October database check under the `authenticated` role now returns 296 active,
assignable D4 skills, including `D4_MOR_PREFIXES_UN`. Thus a current catalogue
or RLS absence is ruled out; the original request failure has no captured
PostgREST error or response and remains un-attributed. The form must be checked
again on the exact Production release before claiming the live handoff works.

The assignment RPC covers only item/header writes. Prefix attempt persistence,
review scheduling, and reflection still run before that RPC as separate
operations. A whole-lesson transaction was not claimed or proved.
