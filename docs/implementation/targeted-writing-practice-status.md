# Targeted Writing Practice Status

## Purpose

This file tracks current implementation state for the Writing Engine / Targeted
Writing Practice work.

It is a status document, not a product brief, contract, or roadmap.

Canonical documentation now defers to:

- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)
- [docs/contracts/canonical-spelling-word-map-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/canonical-spelling-word-map-contract.md:1)
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)

## Current headline

- Shared `lib/writing-engine` foundation exists.
- Generic `parent_verifications` exist.
- Generic `assignment_items` exist.
- Durable issue-lifecycle and learning-item creation exist.
- The older spelling runtime surfaces are retired and should not be treated as
  an active product path.
- `daily_assignments` remains transitional header debt rather than the long-term
  assignment anchor.
- `word_progress` is retired from active runtime ownership and remains
  historical/legacy debt only.
- Stage `1B` manual spelling diagnostic MVP is complete on the shared Writing
  Engine boundary.
- Stage `1B.1` manual diagnostic, `1B.2` verification orchestration, and
  `1B.3` shared parent-verification persistence are complete.
- Stage `1C` verified outcome to mastery bridge is complete for manual spelling
  diagnostics.
- Stage `1D` generic assignment generation is now complete on the shared engine
  boundary through bounded `1D.1` to `1D.5` closeout.
- Future spelling word-map/dictionary content is now contracted as content
  metadata only. It may later supply lesson words for existing active
  assignable spelling micro-skills, but it is not resolver, mastery,
  assignment, taxonomy, or fallback spelling-list truth.
- Stage `2C.1` canonical spelling word-map storage foundation is implemented
  locally and committed as source only:
  - migration:
    `supabase/migrations/20260608193000_add_canonical_spelling_word_map_storage.sql`
  - dry-run planner:
    `python3 scripts/import-canonical-spelling-word-map.py "docs/implementation/seed-data/canonical-spelling-word-map/canonical-spelling-word-map-v1.xlsx"`
  - no hosted deployment, Supabase import, resolver behaviour, assignment
    generation, mastery/evidence, reward, scoring, analytics, dashboard,
    template-routing, UI, or taxonomy behaviour changed
  - the dry-run planner refuses `--apply` and does not connect to Supabase
  - diagnostic examples remain non-resolver-visible
  - production deployment remains blocked until an explicit migration-ledger
    check and approved DB-changing release
  - Stage `2D` assignment consumption remains future work only
- Stage `2C.2` local/dev migration application proof is complete:
  - target environment was local/dev only:
    `http://127.0.0.1:54321` and
    `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
  - `supabase migration up` was not used because unrelated pending migration
    `20260601142522` appeared locally
  - only
    `supabase/migrations/20260608193000_add_canonical_spelling_word_map_storage.sql`
    was applied directly through the local Supabase database container with
    `psql`
  - the local migration ledger row was recorded only for `20260608193000`
  - all seven dedicated word-map tables exist locally with RLS enabled,
    `service_role` grants, and no `anon` / `authenticated` grants
  - all seven tables remain empty; no workbook import occurred
  - workbook validation and the dry-run importer still pass
  - protected runtime/authority tables remained unchanged
  - hosted/production migration remains unapplied and blocked until an
    explicit migration-ledger check and approved DB-changing release
  - Stage `2D` assignment consumption remains future work only
- Stage `2C.3` local/dev import preflight is implemented and QA-audited:
  - dry-run remains the default importer behavior
  - generic `--apply` remains refused
  - `--apply-local` is preflight-only and keeps `actual_import_run` false
  - an explicit local DB URL and confirmation token are required
  - hosted and non-local DB targets are blocked
  - Docker `psql` mode verifies the local Supabase DB container
  - preflight checks migration ledger version `20260608193000`, all seven
    storage tables, active DB conflicts, protected-table counts, and diagnostic
    resolver visibility
  - no workbook rows were imported
  - hosted/production import remains blocked
- Stage `2C.4` local/dev canonical spelling word-map import is complete and
  QA-audited:
  - import batch:
    `cb5897f7-4ec3-4f25-9429-568a7296b35c`
  - inserted rows: 99 metadata, 40 diversity groups, 88 word-map words, 30
    contrast pairs, 20 diagnostic examples, and 30 route-support rows
  - protected runtime/authority table counts were unchanged, diagnostic
    examples remained resolver-invisible, and duplicate local import is blocked
    by active DB conflict checks
  - hosted/production import remains blocked until a separate approved
    DB-changing release
  - Stage `2D` assignment-generation hookup remains future work only
- Stage `2D.0` canonical spelling word-map assignment-consumption design is
  registered as documentation only:
  - no code changes, migrations, imports, Supabase mutation, or runtime
    behavior changes are implemented by this registration
  - future assignment consumption must be anchored on an already-existing
    active child-specific spelling `learning_item`
  - word-map rows remain content metadata and must not create `learning_items`
    or `assignment_items` by themselves
  - diagnostic examples remain non-resolver-visible and must not be read by
    assignment generation
  - resolver behavior, mastery, rewards, scoring, analytics, dashboards, UI,
    taxonomy, canonical mappings, recommendations, review cases, and evidence
    behavior remain unchanged
  - next implementation slice is `Stage 2D.1: Read-only canonical word-map
    assignment-content resolver, no generation hook`
- Stage `2D.1` canonical spelling word-map assignment-content resolver is
  implemented and QA-passed as read-only foundation only:
  - added a typed resolver/read-model for assignment-safe word-map content
    anchored on an already-existing active child-specific spelling
    `learning_item`
  - added a Supabase read-only repository boundary for active learning-item,
    catalog, route-support, word, contrast, and import-batch status reads
  - no assignment-generation hook was added
  - no Supabase writes, migrations, imports, `learning_items`,
    `assignment_items`, resolver behavior, mastery/evidence, rewards, scoring,
    analytics, dashboards, UI, taxonomy, canonical mappings, recommendations,
    or review-case behavior changed
  - diagnostic examples remain non-resolver-visible and are not queried by the
    resolver
  - QA passed:
    `npm run writing-engine:word-map-assignment-content-regression`,
    `npm run writing-engine:assignment-generation-regression`,
    `npx tsc --noEmit`, and `git diff --check`
- Stage `2D.2` local/dev read-only Supabase smoke for the Stage `2D.1`
  resolver is implemented and QA-passed:
  - verifies the existing read-only resolver/repository against seeded local
    word-map rows
  - uses an already-existing safe local/dev active spelling `learning_item`
    fixture
  - no assignment-generation hook was added
  - no Supabase writes were performed by the smoke
  - no migrations, imports, or seed actions were performed in Stage `2D.2`
  - the smoke did not create `learning_items` or `assignment_items`
  - diagnostic examples remain non-resolver-visible and are not queried by the
    smoke resolver path
  - resolver, canonical mapping, PCRM, mastery/evidence, rewards, scoring,
    analytics, dashboards, UI, taxonomy, recommendations, and review-case
    behavior remain unchanged
  - QA passed:
    `npm run writing-engine:word-map-local-smoke`,
    `npm run writing-engine:word-map-assignment-content-regression`,
    `npm run writing-engine:assignment-generation-regression`,
    `npx tsc --noEmit`, and `git diff --check`
  - residual risk: local Supabase was partially unhealthy/slow; the fixture is
    local/dev only and safe to delete when no longer needed
- Stage `1` is now complete for its intended purpose:
  - shared Writing Engine foundation
  - first spelling diagnostic path
  - persisted parent verification
  - verified outcome to canonical mastery/evidence bridge
  - generic assignment generation from canonical `learning_items`
  - proof that assignment generation is not word-list-only
- Stage `7` Review Work integration is now complete on its documented bounded
  path through `7A` to `7F`.
- The bounded Parent Review spelling workflow MVP loop is complete:
  - engine suggestions, parent-added missed words, send-back, child retry,
    returned correction continuity, compact unified spelling review,
    completion gating, historical terminal verification ownership, and
    `checking_only` terminal handling are implemented
  - returned correction categorisation/admin/parent-local routing is supported
    where safe lineage exists
  - unsupported returned rows without safe lineage remain blocked/deferred
    rather than guessed
- Parent Recommended Canonical Mapping is now contracted:
  - `PCRM-A` docs/contract is complete
  - `PCRM-B` recommendation evidence storage/read-model foundation is already
    implemented
  - `PCRM-C` parent recommendation action/UI is implemented and
    regression-passed for promoted parent-local candidate mappings
  - `PCRM-D` admin recommendation review/curation is implemented and
    regression-passed
  - PCRM-D updates recommendation status/audit metadata only; plain
    `accepted` remains evidence-only and resolver-invisible
  - `PCRM-F` canonical adoption/resolver-visibility planning is implemented
  - `PCRM-G` accepted-evidence canonical adoption is implemented in source as
    an admin-only, DB-changing slice; adoption creates or links canonical
    mapping truth and sets `canonical_mapping_id` only after success, while
    resolver visibility remains disabled
  - resolver runtime integration already exists as R3 feature-flag-gated source
    work; future PCRM work is adoption hardening and release gating into that
    existing path, not generic resolver implementation
- `Parent-Added Missed Word Correction Repair` is implemented and QA-passed.
  It belongs to the parent-review -> child-retry -> final-classification ->
  learning-evidence loop, not resolver/PCRM/global canonical work.
- `Unified Spelling Approval Truth Alignment` is implemented and QA-passed.
  It follows the Parent-Added Missed Word Correction Repair and makes the
  Review Work page approval state and approval server action use the same
  unified spelling completion contract.
- A bounded post-Stage-`7` parent-facing evidence-transparency slice is now
  complete.
- The app is currently suitable for private parent-led use with one child,
  with the parent still acting as the authority on what counts as verified
  truth and what broader progress/maturity summaries mean.
- The repo currently builds. Do not blindly push dirty local worktrees; run the
  relevant QA and git-safety checks for the current slice before release.
- Hosted Supabase production is behaviour-correct for recent Writing Engine
  schema, but the migration ledger is not aligned with historical local
  migrations. Treat production as a manually reconciled baseline and follow
  [docs/operations/supabase-migration-policy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/operations/supabase-migration-policy.md:1)
  before any DB-changing work.

## Current status snapshot

### Done
- Stage `1A` shared Writing Engine foundation
- Stage `1B.1` deterministic manual spelling diagnostic service
- Stage `1B.2` manual diagnostic verification orchestration
- Stage `1B.3` manual diagnostic parent-verification persistence
- Stage `1B` manual spelling diagnostic MVP overall
- Stage `1C` verified outcome to mastery bridge for manual spelling diagnostics
- Stage `1D` generic assignment generation overall
- Stage `1D.5` dictation builder and duplicate-safe append closeout
- Stage `1` overall
- generic verification contract
- generic assignment-item contract
- retirement of the old spelling-engine runtime surfaces
- canonical brief and mastery/evidence contract
- Parent-Added Missed Word Correction Repair closeout
- Unified Spelling Approval Truth Alignment closeout

### Partially done
- broader documentation reconciliation to the canonical brief and mastery
  contract
- generic assignment-header transition away from older `daily_assignments`

### Retired
- `/analyse` as a canonical review surface
- `/analyse/review`
- `/practice`
- `/assignments`
- old spelling-session assignment generation path

### Recent closeout

- `Unified Spelling Approval Truth Alignment`
  - status: implemented and QA-passed in runtime commit `3874992` (`Align
    Review Work approval with unified spelling truth`)
  - purpose:
    - make Review Work approval use one spelling approval contract across the
      page and server action
    - prevent retry-generated duplicate raw captures from acting as hidden
      approval blockers after unified spelling review completion says all
      actionable spelling work is resolved
  - implemented repair:
    - `approveSubmissionReview` / `approveSubmissionReviewImpl` now rely on
      unified spelling completion as the canonical spelling approval truth
    - the Review Work detail page approval disabled state uses the same unified
      completion truth
    - the legacy raw `misspelling_instances` fallback no longer independently
      vetoes approval after unified completion passes
    - raw `misspelling_instances` remain evidence feeding unified review rows
    - genuinely unresolved actionable raw captures still block approval through
      unresolved unified review rows
    - suppressed regenerated retry candidates remain evidence/provenance and
      no longer block as hidden raw-row vetoes
  - QA evidence:
    - unified spelling review items regression passed
    - Stage `7F` parent review restoration regression passed
    - returned-child correction regression passed
    - parent-verified spelling candidate capture regression passed
    - PCRM evidence regression passed
    - PCRM-D admin curation regression passed
    - `git diff --check` passed
    - `npx tsc --noEmit` passed
  - browser smoke:
    - submission `15201d76-cfd5-4088-9018-31e8ea9fa2cd` approved
      successfully
    - the page showed `saved=Submission approved.`
    - the page showed `SUBMISSION STATUS Approved`
    - the old error `All captured suggestions must be reviewed before this
      submission can be approved.` did not return
  - residual risks:
    - the smoke fixture submission is now approved and is no longer reusable
      as a pending approval-blocked fixture
    - future approval protection depends on keeping unified review regressions
      sharp around unresolved raw captures versus suppressed retry evidence
  - explicit non-goals and boundaries:
    - no resolver behavior changes
    - no PCRM/PCRM-D semantic changes or resolver visibility
    - no canonical mapping adoption
    - no migrations or schema changes
    - no `micro_skill_catalog` mutation
    - no hosted data deletion or cleanup
    - no assignment, reward, dashboard, analytics, scoring, or
      template-routing redesign
    - no hidden suppression of genuinely unresolved actionable spelling work

- `Parent-Added Missed Word Correction Repair`
  - status: implemented and QA-passed in runtime commit `582874a` (`Repair
    returned draft feedback gating`)
  - purpose:
    - complete the current MVP parent-review -> child-retry ->
      final-classification -> learning-evidence loop for parent-added missed
      words attached to structured lesson/test submissions
    - keep parent-added missed words separate from engine Suggested Issues in
      Review Work while ensuring they are not second-class correction targets
  - implemented repair:
    - `returnSubmissionToChildImpl` writes and checks the returned
      `task_submission_drafts` payload before setting
      `parent_review_status` to `returned`
    - returned draft feedback includes `__writing_issue_feedback` for the
      child before the parent sees a successful "Sent back" state
    - send-back now fails loudly if child-facing returned draft feedback cannot
      be prepared
    - parent-menu convenience navigation to existing admin review surfaces
      was added in the earlier docs/runtime-adjacent slice
  - QA evidence:
    - focused returned-child correction regression passed
    - structured submission returned-draft safety regression passed
    - parent-local promotion regression passed
    - candidate capture regression passed
    - PCRM evidence regression passed
    - PCRM-D admin curation regression passed
    - assignment generation regression passed
    - Stage `1A` regression passed
    - `git diff --check` passed
    - `npx tsc --noEmit` passed
    - `npm run build` passed
    - data-backed browser smoke used source submission
      `3d99d39e-3328-4aa3-a49c-49efed39857a` and child retry submission
      `101c1bf0-d38f-46f7-95a5-3b1ad85e2fba`
  - smoke evidence:
    - parent-added `smoketestt -> smoketest` remained `child_responded`
    - parent-added `taik -> take` was finalised as `fragile_knowledge`
    - existing engine row `tast -> taste` remained `child_responded`
    - unknown `micro_skill_key` did not block send-back, retry, or parent final
      classification
    - assignable learning-item creation remained blocked when the micro-skill
      was unknown or non-assignable
  - residual risks:
    - real hosted Supabase still contains the smoke evidence rows
    - open returned correction rows may be inspected later
    - send-back is not fully transactional across every parent-review update,
      but returned draft feedback now gates returned status
  - explicit non-goals and stop conditions:
    - no schema changes or migrations
    - no resolver behavior changes
    - no PCRM recommendation resolver visibility
    - no canonical adoption action
    - no `micro_skill_catalog` mutation
    - no manual writing-sample expansion
    - no reward, dashboard, analytics, scoring, assignment, or template-routing
      redesign
    - future cleanup, transactional hardening, resolver/PCRM/global canonical
      adoption, and any smoke fixture cleanup require separate authorization

- Durable Structured Submission Payloads is closed for the bounded Pass
  `1`-`4` track:
  - status: Pass 4 approval draft-deletion safety is implemented and
    QA-passed; returned-child legacy recovery is implemented and manually
    verified
  - purpose:
    - separate mutable draft working state from immutable submitted structured
      attempt evidence
    - ensure structured lesson/test answers survive parent approval and child
      revisit
    - prevent `task_submission_drafts` from being the only archive of
      structured child answers
  - truth model:
    - `task_submission_drafts` = mutable working state for in-progress,
      autosaved, or returned/editable work
    - `task_submissions` = submission header/workflow record plus flattened
      readable `submission_text`
    - `task_submission_payloads` = durable submitted structured payload
      evidence linked to a submitted attempt
  - implementation sequence:
    1. storage foundation only: complete
    2. submit persistence: complete
    3. child revisit hydration: complete
    4. approval draft-deletion safety: complete
    5. closeout/regression hardening: complete for this bounded track
  - Pass 2 submit truth:
    - `submitTaskResponse` still writes `task_submissions` with flattened
      readable `submission_text`
    - structured lesson/test submits now immediately write durable
      `task_submission_payloads` evidence before completion, writing sample,
      reward, draft, revalidation, or success redirect side effects
    - helper failure rolls back the just-created submission and returns a
      visible submit error
    - privileged payload persistence lives in
      `lib/lessons/persistence/submission-payloads.ts`; `app/learn/actions.ts`
      only orchestrates ordering, helper call, rollback, and existing side
      effects
    - `payload_json` stores the structured response object, not flattened text
      or the entire draft payload
    - `lesson` maps to `structured_lesson_response`; `test` maps to
      `structured_test_response`
    - a narrow quick-submit fallback can derive structured evidence from
      `lesson_schema + submission_text` for supported structured lesson/test
      text/textarea cases; plain-writing remains unchanged
  - manual smoke:
    - actual structured lesson page submit created both `task_submissions` and
      `task_submission_payloads`
    - payload persisted through parent approval
    - child revisit after parent approval restored submitted answer boxes from
      durable payload evidence
    - returned/send-back, legacy fallback, and plain-writing checks passed
    - browser QA confirmed an approved structured lesson can be returned to
      the child, the child view shows `Restored from your last try`, and the
      original answers are populated and editable
  - Pass 4 approval truth:
    - structured lesson/test approval checks for a matching durable payload
      before deleting `task_submission_drafts`
    - durable payload present allows existing draft cleanup
    - durable payload missing preserves approval but skips draft deletion
    - plain-writing and non-structured approval behavior remains unchanged
    - approval never inserts, updates, upserts, deletes, or overwrites
      `task_submission_payloads`
  - returned-child recovery truth:
    - returned structured work remains draft-first and editable
    - returned draft feedback merge behavior is preserved
    - if a returned draft lacks meaningful structured answers, hydration can
      fall back to durable submitted payload
    - if durable payload is also missing, legacy text/textarea answers can be
      reconstructed from flattened `submission_text` when question labels
      match
  - returned-child spelling correction follow-up:
    - status: docs contract clarified; child UI/retry persistence,
      engine-found send-back bridge, and parent-added missed-word correction
      repair are implemented and QA-passed
    - this is a bounded correction to the previously closed returned-child
      recovery track, not a new mastery/reward/assignment stage
    - every `__writing_issue_feedback` item must render to the child when work
      is returned, including items that cannot be matched to a structured
      lesson field
    - parent-added missed words remain separate from engine `Suggested Issues`
      in `Review Work`, but that separation must not make them second-class
      correction targets
    - eligible parent-added missed words attached to structured lesson/test
      submissions must materialize into durable `writing_issues` during
      send-back, with parent-authored provenance preserved in metadata
    - `micro_skill_key: "unknown"` must not block send-back, child retry,
      correction-attempt persistence, or parent final classification
    - unknown/non-assignable micro-skills may block learning-item creation only
      at final-classification learning-item creation time; the durable issue
      and child correction evidence should remain preserved
    - spelling-like returned issues should provide a dedicated retry/attempt
      input and persist it to
      `writing_issue_correction_attempts.attempted_correction`
    - easy/medium/hard remains the child-facing reflection set for this pass;
      `needed_help` and `could_not_fix` remain persistence-supported but not
      UI-exposed without later authorisation
    - child retry/reflection remains evidence for later parent final
      classification and must not directly mutate mastery, rewards,
      assignments, scoring, analytics, dashboards, or template routing
    - returned draft feedback is written and checked before
      `parent_review_status` is set to `returned`
    - send-back must fail loudly if `__writing_issue_feedback` cannot be
      prepared for the child
    - implementation shape: the bounded
      `Parent-Added Missed Word Correction Repair` pass is implemented in
      runtime commit `582874a`
    - if a parent adds a missed word before send-back, include it in the
      send-back correction payload
    - if a parent adds a missed word after work is already returned, require
      the parent to send back/resend through the return action so the existing
      return lifecycle refreshes draft feedback; do not add hidden child-page
      raw `misspelling_instances` reads
    - future stop condition: if additional work requires schema changes,
      manual writing sample expansion, resolver work, PCRM adoption, catalog
      mutation, or mastery/reward/assignment changes, stop and return to docs
  - unified Parent Review spelling workflow closeout:
    - status: bounded MVP loop complete and documented in
      [docs/workflows/parent-review-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/parent-review-workflow.md:1)
    - current implementation uses one compact unified parent-facing spelling
      review table/read model, backed by multiple canonical source tables
    - the unified table is not one database table; it preserves source IDs and
      provenance across engine-suggested, parent-added, returned-correction,
      verification, and catalog-review records
    - returned corrections and parent-added missed words must remain visible in
      the parent workflow after child resubmission
    - returned correction categorisation/admin/parent-local routing is supported
      only where safe provenance exists; unsupported rows remain blocked or
      deferred
    - focused QA passed with TypeScript, production build, targeted Review Work
      regressions, PCRM boundary regression, and browser smoke on a current
      Review Work record
    - the browser smoke did not include every possible UI state, so new,
      deferred, and blocking states remain covered by targeted regressions
    - future work remains separate: Parent Recommended Canonical Mapping parent
      action/admin curation, resolver integration, unsupported lineage
      expansion, broader mastery/reward/assignment/dashboard/analytics effects,
      and any inline add-missed-word-after-returned shortcut
  - validation:
    - `npm run writing-engine:structured-submission-payload-storage-regression`
      passed
    - `npm run writing-engine:structured-submission-payload-submit-regression`
      passed
    - `npm run writing-engine:structured-submission-payload-hydration-regression`
      passed
    - `npm run writing-engine:structured-submission-approval-draft-safety-regression`
      passed
    - `npx tsc --noEmit` passed
    - `npm run build` passed
    - `git diff --check` passed
    - architecture QA passed after refactor
  - v1.1 historical structured payload integrity audit and cleanup:
    - read-only hosted audit found `0` critical findings, `75` warning
      findings, and `23` info findings across historical structured
      submission data
    - local-only audit report:
      `tmp/writing-engine-structured-payload-integrity-audit-2026-06-12T19-30-25-337Z.json`
    - controlled cleanup script:
      `npm run writing-engine:cleanup-pre-june-structured-warning-submissions`
    - cleanup script is dry-run by default, requires explicit Supabase target
      env vars, blocks hosted dry-run unless
      `STRUCTURED_WARNING_CLEANUP_ALLOW_HOSTED_READ_ONLY=true`, and blocks
      hosted apply unless `--apply`,
      `STRUCTURED_WARNING_CLEANUP_ALLOW_HOSTED_DELETE=true`, and
      `CONFIRM_PRE_JUNE_STRUCTURED_WARNING_DELETE=delete-pre-june-warning-submissions`
      are all present
    - cleanup is exact-ID based from the audit warning set, not broad date
      deletion; it writes local manifests under `tmp/` and must not commit
      those reports/manifests because they contain hosted child/submission IDs
    - safe-subset dry-run local-only evidence:
      `tmp/pre-june-structured-warning-cleanup-manifest-2026-06-12T20-52-25-830Z.json`
    - safe-subset dry-run targeted `35` pre-`2026-06-01` warning
      submissions, excluded `2` canonical-lineage-protected pre-June
      submissions, excluded `4` post-cutoff warning submissions, had zero
      canonical mapping/event lineage references in the final delete plan, and
      had empty `cascadeRisk` arrays
    - hosted apply was explicitly approved and verified on
      `2026-06-12` against
      `https://wwohrqtunajrbwxyssjf.supabase.co`; apply manifest:
      `tmp/pre-june-structured-warning-cleanup-manifest-2026-06-12T21-00-32-625Z.json`
    - verified apply deleted the safe subset:
      `35` `task_submissions`, `35` `writing_samples`,
      `51` `misspelling_instances`, `4` `task_submission_payloads`,
      `1` `task_submission_drafts`, `8` `spelling_catalog_review_cases`, and
      `8` `spelling_catalog_review_case_decisions`
    - protected/global counts were unchanged by apply:
      `micro_skill_catalog` `240 -> 240`,
      `spelling_canonical_mappings` `6 -> 6`,
      `spelling_canonical_mapping_events` `8 -> 8`, and `task_completions`
      `34 -> 34`
    - no raw hosted SQL was run, no migrations were created or applied, and
      the hosted key was not printed
    - any future hosted cleanup rerun remains a separate explicit approval
      step and must use the destructive confirmation gates again
    - apply command shape, with key redacted:
      `STRUCTURED_WARNING_CLEANUP_ALLOW_HOSTED_DELETE=true CONFIRM_PRE_JUNE_STRUCTURED_WARNING_DELETE=delete-pre-june-warning-submissions STRUCTURED_WARNING_CLEANUP_SUPABASE_URL=https://wwohrqtunajrbwxyssjf.supabase.co STRUCTURED_WARNING_CLEANUP_SUPABASE_KEY="[REDACTED_SERVICE_ROLE_KEY]" npm run writing-engine:cleanup-pre-june-structured-warning-submissions -- --apply`
    - no resolver, mastery, reward, assignment, scoring, analytics, dashboard,
      template, lesson-generation, canonical mapping truth, or
      `micro_skill_catalog` behavior changed
  - residual risk:
    - the original user-visible blank-box bug is fixed for submissions with
      durable payloads and for the manually tested returned legacy row
    - the audit and safe-subset cleanup do not prove all historical structured
      payloads are complete; they prove there were no critical findings in the
      audited scope and that the approved pre-June warning safe subset was
      removed without mutating protected canonical/global tables
    - `2` pre-June warning submissions were intentionally preserved because
      they are upstream of protected canonical catalog-review lineage
    - `4` warning submissions on or after `2026-06-01` were intentionally
      excluded by cutoff rules
    - no hosted historical backfill has been implemented
  - explicit non-goals:
    - no `4E` / `4E.3` resolver work
    - no admin/catalog-review work
    - no manual writing sample expansion
    - no hosted historical backfill
    - no mastery, reward, assignment, scoring, analytics, dashboard, or
      template-routing change
    - no `micro_skill_catalog` mutation
    - no canonical mapping truth deletion or resolver visibility enablement
  - required regression direction:
    - structured submit creates durable payload
    - payload insert failure prevents successful submit
    - child revisit after approval hydrates from durable submitted payload
    - approval never deletes the only structured answer source
    - returned/send-back remains draft-first with feedback
    - plain-writing behavior remains unchanged
    - legacy structured rows without payload do not crash
- returned-child correction implementation closeout evidence:
  - runtime commit: `582874a` (`Repair returned draft feedback gating`)
  - returned draft feedback now gates returned status:
    - the returned `task_submission_drafts` payload is written and checked
      before `parent_review_status` becomes `returned`
    - a returned/send-back action must not report success if the child would
      not receive `__writing_issue_feedback`
  - data-backed smoke fixture:
    - original source submission:
      `3d99d39e-3328-4aa3-a49c-49efed39857a`
    - child retry submission:
      `101c1bf0-d38f-46f7-95a5-3b1ad85e2fba`
    - parent-added rows:
      - `smoketestt -> smoketest`, status `child_responded`
      - `taik -> take`, finalised as `fragile_knowledge`
    - existing engine row:
      - `tast -> taste`, status `child_responded`
  - verified behavior:
    - parent-added missed words materialize into durable `writing_issues`
    - returned draft contains `__writing_issue_feedback`
    - child page renders retry inputs
    - child retry persists
      `writing_issue_correction_attempts.attempted_correction`
    - returned corrections remain visible in Review Work after resubmission
    - parent final classification uses the existing RPC path
    - unknown `micro_skill_key` does not block send-back, retry, or final
      classification
    - assignable learning-item creation remains blocked when
      `micro_skill_key` is unknown or non-assignable
  - validation:
    - focused returned-child correction regression passed
    - structured submission returned-draft safety regression passed
    - parent-local promotion regression passed
    - candidate capture regression passed
    - PCRM evidence regression passed
    - PCRM-D admin curation regression passed
    - assignment generation regression passed
    - Stage `1A` regression passed
    - `git diff --check` passed
    - `npx tsc --noEmit` passed
    - `npm run build` passed
  - residual risk:
    - real hosted Supabase contains the smoke evidence rows
    - remaining open returned correction rows may be inspected later
    - send-back is still not fully transactional across all parent-review
      updates, but returned draft feedback now gates returned status
- next safest pass:
  - read-only historical data-integrity audit and optional local/operator
    recovery plan
  - inventory structured lesson/test submissions without
    `task_submission_payloads`, returned drafts with empty structured answers,
    submissions recoverable only from flattened `submission_text`, and
    duplicate/pending historical rows for the same task/child
  - do not implement hosted backfill by default
  - do not proceed into resolver, admin/catalog-review, catalog mutation,
    mastery, reward, assignment, scoring, analytics, dashboard, or
    template-routing work from this closeout
- deployment guardrail:
  - `4E.3` source work may proceed locally after the structured-payload detour
  - production deployment is allowed only if `4E.3` is code-only against
    already-present hosted tables/RPCs, or if any DB-changing work uses a new
    unique timestamp migration plus an approved deployment process
  - future migrations must use `YYYYMMDDHHMMSS_description.sql`
- Stage `7F` is now fully closed:
  - `7F.10` regression coverage is complete
  - the bounded Stage `7F` regression script exists and passed when run
    directly:
    - `scripts/writing-engine-stage7f-parent-review-restoration-regression.ts`
  - the script meaningfully covers completed Stage `7F` lifecycle and
    guardrail slices without introducing a new harness
  - no essential manual browser checks remain for `7F.10`
  - Stage `7F` overall is complete and closed
  - `npm run lint` remains blocked by pre-existing repo-wide lint debt rather
    than the `7F.10` slice
- separate recommended follow-up is a docs-first micro-skill mapping
  readiness audit:
  - clarify why some Suggested Issues still cannot offer `Accept`
  - keep catalog / mapping readiness work outside Stage `7F`
- Stage `8` docs-first foundation audit is complete
- Stage `8A` — Parent-facing evidence wording safety pass is complete
- Stage `8` is now closed as a boundary-safety and parent-facing
  evidence-wording stage, not a mastery-runtime stage
- `Parent-Verified Spelling Candidate Capture` Slice `3` is now implemented
  and validated within its bounded lesson-submission scope
  - purpose:
    - allow parents to classify unmapped or parent-added spelling mistakes
      against existing canonical micro-skills
    - preserve verified event truth
    - capture reusable candidate mappings
    - keep candidate mappings separate from canonical mapping truth until
      explicit promotion
    - prevent free-text taxonomy pollution
    - prevent normal parent `Review Work` from creating global canonical truth
  - current blocker:
    - real writing now includes spelling mistakes outside current canonical
      mapping truth
    - parents can review or add those mistakes, but cannot safely classify
      them for future reuse without risking pollution of canonical mapping
      truth
    - example:
      - `natral -> natural` may be classified against an existing canonical
        micro-skill, but that capture alone must not mint global canonical
        mapping truth
  - this stage is separate from `Stage 7F`
  - this stage is separate from `Stage 8`
  - this stage does not change:
    - `Accept` readiness
    - override-provider behavior
    - read-only derived template metadata
    - reward
    - mastery
    - assignment
    - scoring
    - thresholds
    - template routing
    - analytics
    - positive-evidence semantics
- Slice `2` and Slice `3` runtime implementation are complete within their
  bounded lesson-submission scope
- optional DB-backed or app-triggered smoke-test follow-up for Stage `1`
- active-doc cleanup so historical implementation plans no longer compete with
  the roadmap
- `PCRM-A — Parent Recommended Canonical Mapping Docs And Contract` is
  complete:
  - focused contract:
    [docs/contracts/parent-recommended-canonical-mapping.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/parent-recommended-canonical-mapping.md:1)
  - parent may locally select/promote an existing active assignable spelling
    micro-skill and separately recommend the child spelling/correction/skill
    pairing for admin/global canonical consideration
  - parent recommendation is evidence only; it is not canonical mapping truth
    and is not resolver-visible
  - this path is separate from `No matching skill`, which remains the route for
    rows where no existing catalog-backed skill fits
  - parent-local promotion remains the completion-gating truth, so
    recommending a locally resolved/promoted row for canonical review must not
    block lesson completion or reopen the row
  - recommendation/admin-review status should be parallel evidence and must not
    require changing `parent_local_promoted` into an admin-pending status
  - admin may later accept, reject, merge, mark duplicate, or supersede the
    recommendation, but admin action must not silently change resolver behavior
  - PCRM-D plain `accepted` means accepted recommendation evidence only; it
    does not create/link canonical storage or resolver-visible truth
  - future admin review may add an explicit
    `accept_and_adopt_canonical_mapping` action for eligible evidence
  - resolver adoption belongs to a later explicit PCRM resolver integration
    slice
- `PCRM-B — Recommendation Evidence Model / Read Path` is implemented:
  - added dedicated recommendation evidence storage and a server-only
    repository/read-model helper
  - recommendation status is parallel evidence and does not replace
    `parent_local_promoted`
  - parent-scoped RLS allows authenticated parent read/insert only
  - parent-created rows may only start as `recommended` or
    `pending_admin_review`
  - parent-created rows cannot include canonical/admin curation fields such as
    `canonical_mapping_id`, admin reviewer identity, admin review
    note/timestamp, duplicate, merge, or supersession links
  - non-null child/source/candidate links are validated against the
    recommendation row's `parent_user_id` and `child_id` wherever the source
    tables expose those fields
  - admin mutation/curation remains future scope
  - no parent UI, admin curation UI, resolver behavior, or completion-gating
    behavior changed
  - no parent recommendation path writes `micro_skill_catalog`,
    `spelling_canonical_mappings`, or resolver-visible truth
  - no completion-gating behavior changed; the focused PCRM regression proves
    `parent_local_promoted` remains completion-safe and `parent_local_pending`
    still blocks
  - migration operation note: if
    `20260601103000_add_spelling_canonical_mapping_recommendations.sql` was
    already applied before hardening, the target database needs a follow-up
    hardening migration because Supabase will not normally re-run that same
    timestamped migration automatically
- `PCRM-C — Parent Recommendation Action/UI` is implemented:
  - parent may optionally recommend a known-skill spelling pair only after the
    row is already locally promoted through a scoped parent-local candidate
    mapping
  - the compact Review Work action appears only for rows with
    `candidateMappingId`, `categorisationStatus === "parent_local_promoted"`,
    and no open PCRM recommendation
  - existing open `recommended` or `pending_admin_review` evidence suppresses
    duplicate recommendation action and shows saved recommendation state
  - recommendation evidence is inserted into
    `spelling_canonical_mapping_recommendations` only
  - creating a recommendation does not mutate
    `parent_verified_spelling_candidate_mappings`, write
    `spelling_canonical_mappings`, write `micro_skill_catalog`, or affect
    resolver behavior
  - `No matching skill` remains separate catalog-gap/admin-review routing and
    does not create PCRM recommendation evidence
  - completion gating remains unchanged; parent-local promotion remains the
    completion-gating truth
  - PCRM-D admin recommendation review/curation is implemented; admins can mark
    recommendation evidence accepted, rejected, duplicate, merged, or superseded
    and update only `spelling_canonical_mapping_recommendations` status/audit
    metadata
  - plain `accepted` remains evidence-only; future canonical adoption requires
    an explicit audited admin action that creates or links canonical mapping
    truth
  - PCRM-D does not create or link `spelling_canonical_mappings`, mutate
    `micro_skill_catalog`, mutate parent-local candidate mappings, merge
    `No matching skill` with PCRM, or change completion gating, mastery,
    rewards, assignments, analytics, dashboards, scoring, or resolver behavior
  - browser smoke used Option A for PCRM-D closeout: focused regressions and
    build passed, but no naturally generated pending recommendation row was
    available for real pending-row browser smoke
  - `scripts/dev-pcrm-recommendation-fixture.ts` is local/staging/manual smoke
    support only, not production seed data
  - PCRM canonical adoption remains a future explicit slice into the already
    implemented R3 resolver-visible mapping path
  - future PCRM canonical adoption must preserve exact-pair mapping:
    `misspelling_normalized -> correct_spelling_normalized -> micro_skill_key`
  - the correct word is a shared target anchor, not the sole routing key; `taik
    -> take` and `tak -> take` may map to different micro-skills when their
    diagnostic errors differ
  - misspelling instances are evidence for the mapping and selected
    micro-skill, but do not by themselves update child mastery, competency,
    rewards, assignments, or learning-item state

### Historical implemented context
- `Unified Spelling Approval Truth Alignment` is implemented and QA-passed.
  Review Work approval now uses unified spelling completion as the canonical
  spelling approval truth, with raw `misspelling_instances` preserved as
  evidence rather than a second approval veto.
- `Parent-Verified Spelling Candidate Capture`
  Slice `3` is implemented and validated within its bounded
  lesson-submission scope
- parent-facing workflow to preserve:
  1. parent sees or adds a spelling mistake
  2. parent confirms:
     - `word_child_wrote`
     - `correct_spelling`
     - existing canonical `micro_skill_key`
  3. `micro_skill_key` must come from bounded catalog-backed options only
  4. the action saves verified event truth for the reviewed child occurrence
  5. the action may create a candidate spelling mapping with:
     - `misspelling_normalized`
     - `correct_spelling_normalized`
     - `micro_skill_key`
     - `source` / provenance
     - `status`
     - `promotion_scope`
  6. candidate mapping remains non-canonical until promoted
  7. future suggestions must not use pending candidate mappings
- three-layer truth model:
  - verified spelling evidence
    - event-level truth for one reviewed child occurrence
    - safe for audit/history immediately
    - does not create reusable canonical mapping truth by itself
  - candidate spelling mapping
    - proposed reusable mapping:
      - `misspelling -> correct_spelling -> micro_skill_key`
    - stored separately from:
      - `micro_skill_catalog`
      - existing deterministic Stage `2C` / Slice `1` catalog-backed mapping
        logic
      - `writing_issues`
      - `parent_verifications`
    - must carry provenance and status
    - must not be used by future suggestions while pending
  - canonical or promoted mapping truth
    - reusable suggestion truth only after explicit promotion
    - includes:
      - existing catalog-backed canonical mapping truth
      - parent-local promoted mappings scoped to the current parent/child
        environment
      - future admin/global promoted mappings only if a separate curator
        workflow is later implemented
- planning vocabulary only:
  - candidate status values:
    - `pending_parent_promotion`
    - `parent_local_promoted`
    - `admin_review_requested`
    - `global_canonical_promoted`
    - `rejected`
    - `superseded`
  - promotion scope values:
    - `child_local`
    - `parent_local`
    - `global`
- parent-local versus global promotion:
  - parent verification may confirm event-level truth and capture a candidate
    mapping, but normal parent review does not itself mint global canonical
    mapping truth
  - parent-local promotion is the highest authority authorised in the
    single-child MVP
  - explicit parent promotion is enough to make a mapping reusable inside the
    current parent/child environment
  - parent-local promoted mappings may be used only within that scoped
    environment
  - parent-local promotion must be auditable and reversible
  - no parent action directly writes global canonical mapping truth
  - global canonical promotion remains a separate curator/admin workflow
    deferred from MVP
- future suggestion resolver rule:
  - future suggestions may use:
    - existing catalog-backed canonical mapping truth
    - parent-local promoted mappings scoped to the current parent/child
      environment
    - future admin/global promoted mappings only if separately implemented
  - future suggestions must not use:
    - arbitrary parent free text
    - unpromoted candidate mappings
    - raw parent-authored missed-word rows
    - raw `misspelling_instances`
    - raw `writing_issues`
    - any mapping lacking an existing canonical `micro_skill_key`
- first safe runtime scope:
  - lesson-submission-backed spelling rows only
  - includes parent-added missed words attached to lesson submissions
  - excludes manual writing samples from the first runtime slice
  - excludes template-choice changes
  - excludes mastery/reward/assignment/scoring changes
  - excludes future suggestion resolver changes until promotion is implemented
  - pending candidate mappings are not reusable
  - raw parent-added missed words are not reusable suggestion truth by
    themselves
  - manual writing sample candidate capture is follow-up scope only
- implementation phase breakdown:
  - Slice `1` — Documentation registration
    - status: complete
    - no runtime code, schema, tests, or UI changes
  - Slice `2` — Bounded runtime capture for lesson submissions only
    - status: implemented and QA passed
    - save verified event truth
    - save separate candidate mapping row
    - candidate mapping remains `pending_parent_promotion`
    - future suggestion resolver must not consult pending candidate mappings
  - Slice `3` — Bounded parent-local promotion
    - status: implemented and validated
    - explicit parent promotion only
    - parents can promote `pending_parent_promotion` mappings to
      `parent_local_promoted`
    - parents can revert `parent_local_promoted` mappings back to
      `pending_parent_promotion`
    - scoped resolver use only after existing catalog-backed canonical mapping
      truth
    - pending mappings remain invisible to the resolver
    - manual writing samples remain excluded
  - Slice `4A` — Docs-only catalog-review contract
    - define parent-raised spelling catalog gaps after Slice `3`
    - parent-facing label: `No matching skill`
    - helper copy: `Send this spelling case to catalog review.`
    - no migration, runtime code, Review Work UI, package, test, resolver,
      mastery, reward, assignment, scoring, analytics, template-routing, or
      manual-writing-sample expansion
  - Slice `4B.0` — Bounded micro-skill option filtering by family/cluster
    - status: implemented and QA passed
    - replaces the bulky candidate-capture selector with a compact spelling
      review table
    - uses existing active assignable `D4` `micro_skill_catalog` rows for
      selectable micro-skills and existing family/cluster display metadata for
      parent-facing labels
    - help parents find existing canonical skills before raising a catalog
      review case
  - Slice `4B.1` — Parent `No matching skill` case capture
    - status: implemented and QA passed
    - create or update `spelling_catalog_review_cases` only
    - implemented with `captureSpellingCatalogReviewCase`, parent-scoped RLS,
      authenticated parent ownership enforcement, idempotent open-case dedupe,
      compact Review Work `No matching skill` UI/status,
      `Sent to catalog review` saved state, parent-added lesson missed-word
      support, and graceful behavior when the case table is unavailable
  - Slice `4C` — Minimal protected admin/catalog-review read/triage surface
  - Slice `4D` — Admin decisions and canonical promotion
  - Slice `5` — Optional manual writing sample extension
    - deferred until lesson-submission capture and parent-local promotion are
      stable
- blocked cases:
  - no free-text `micro_skill_key` invention
  - no automatic canonical mutation on initial save
  - no global canonical truth from normal parent `Review Work`
  - no parent action directly writes global canonical mapping truth
  - no unpromoted candidate mapping can be used by future suggestions
  - no raw `misspelling_instance` becomes reusable suggestion truth by itself
  - no raw `writing_issue` becomes reusable suggestion truth by itself
  - no template-key truth changes
  - no editable `verified_template_key`
  - no reward changes
  - no mastery changes
  - no assignment changes
  - no scoring or threshold changes
  - no positive-evidence semantics changes
  - no manual writing sample expansion in the first runtime slice
  - no reopening `Stage 7F`
  - no reopening `Stage 8`
  - no admin/global curation implementation in this stage
- Slice `2` QA closeout recorded:
  - pass:
    - candidate capture works on eligible lesson-submission spelling rows
    - success state is visible after save
    - pending candidate mappings do not unlock `Accept`
    - pending candidate mappings are not used by future suggestion resolution
    - canonical rows still show `Accept` correctly
    - invalid candidate-capture submit shows a visible error
    - parent-added missed words persist and remain reviewable after reopen
    - manual writing samples still do not expose candidate capture
    - template guardrails remain intact
  - known limitation:
    - candidate capture depends on seeded canonical micro-skill coverage
    - valid rows such as `natral -> natural` may remain blocked until the
      correct canonical micro-skill exists in the seeded/catalog-backed option
      set
    - this is a catalog/seed coverage limitation, not a Slice `2` runtime
      boundary failure
  - UX follow-up note:
    - a captured row can remain visible in both `Suggested / candidate` and
      `Parent Verification` while it remains `pending_parent_promotion`
    - this is acceptable for Slice `2`, though later wording may clarify the
      state as `captured / awaiting promotion` or `saved as evidence, not
      promoted yet`
- deferred after Slice `2`:
  - admin/global curation remains deferred to a later slice
  - manual writing sample candidate capture remains deferred
  - catalogue/seed coverage work may still be needed before some real
    examples, such as `natral -> natural`, can be classified
- Slice `2` closeout verdict:
  - Slice `2` passes QA within its bounded scope
  - Slice `2` can be marked implemented and QA-passed
  - remaining issue is seed/catalogue coverage, not a Slice `2` runtime
    regression
- Slice `3` QA closeout recorded:
  - pass:
    - parents can explicitly promote existing
      `pending_parent_promotion` candidate mappings
    - promoted mappings move to `parent_local_promoted`
    - parents can revert `parent_local_promoted` mappings back to
      `pending_parent_promotion`
    - promoted mappings are reusable only inside the same parent/child scope
    - resolver priority remains:
      1. existing catalog-backed canonical mapping truth
      2. parent-local promoted mappings in the same parent/child scope
      3. unresolved otherwise
    - pending mappings remain invisible to the resolver
    - reverted mappings stop being reusable
    - manual writing samples remain excluded from promotion/revert UI
    - parent-local promotion remains auditable and reversible
    - no parent action creates global canonical mapping truth
  - validation:
    - `npx tsc --noEmit`
    - `npm run writing-engine:parent-local-promotion-regression`
    - `npm run writing-engine:parent-verified-spelling-candidate-capture-regression`
    - `npm run build`
  - closeout verdict:
    - Slice `3` passes within its bounded lesson-submission scope
    - admin/global curation remains deferred
    - manual writing sample candidate capture/promotion remains deferred
    - remaining issue is catalog/seed coverage, not a Slice `3` runtime
      regression

### Slice 4A catalog-review contract status
- Slice `4A` is documentation only
- parent-facing action label:
  - `No matching skill`
- helper copy:
  - `Send this spelling case to catalog review.`
- wording guardrails:
  - `Uncategorised` is not the primary label because it sounds like a final
    state rather than a request for curation
  - `Needs new skill` is not the only label because admin may decide an
    existing skill fits, the case is word-level only, the case is not a
    learning issue, or the case should be merged or superseded
- Slice `4B.1` implemented and QA-passed goal:
  - parent `No matching skill` catalog-review case capture for eligible
    lesson-submission spelling rows only
  - parent uses `No matching skill` when no existing catalog-backed micro-skill
    fits
  - helper copy remains `Send this spelling case to catalog review.`
  - parent may optionally add a `parent_note` where supported by the
    implemented action/table contract
  - saved state should be non-blocking, for example
    `Sent to catalog review`
  - parent can still complete or return Review Work according to existing rules
- Slice `4B.1` parent action may create or update a catalog-review case only
- Slice `4B.1` case owner:
  - implemented table: `spelling_catalog_review_cases`
  - not `parent_verified_spelling_candidate_mappings`, because that table
    requires an existing `micro_skill_key`
  - not `writing_issues`, because those are durable reviewed issue history
    rather than catalog-curation workflow
- implemented `spelling_catalog_review_cases` fields:
  - `id`
  - `parent_user_id`
  - `child_id`
  - `task_submission_id`
  - nullable `writing_sample_id`
  - nullable `source_suggestion_id`
  - `source_misspelling_instance_id`
  - `source_provenance`
  - `reviewed_event_source_entity_id`
  - `original_child_spelling`
  - `original_correct_spelling`
  - `misspelling_normalized`
  - `correct_spelling_normalized`
  - `case_status`
  - `parent_note`
  - `metadata`
  - `created_at`
  - `updated_at`
- allowed initial `source_provenance` values:
  - `lesson_submission_existing_output`
  - `lesson_submission_parent_added_missed_word`
- initial Slice `4B.1` `case_status` values:
  - `open`
  - `closed_duplicate`
  - `superseded`
- parent action can create/update only `open` cases in Slice `4B.1`
- idempotency/dedupe:
  - repeated parent submissions for the same parent/child/source misspelling
    event update the same open case
  - only one open case should exist for the same
    `parent_user_id + child_id + source_misspelling_instance_id`
  - closed/superseded historical cases may remain for audit
  - existing parent verification, candidate mapping, or durable issue truth
    should prevent duplicate catalog-review capture where appropriate
- implemented server action boundary:
  - `captureSpellingCatalogReviewCase`
  - accepts only `submission_id`, `misspelling_instance_id`, optional
    `parent_note`, and `redirect_path`
  - requires authenticated parent ownership
  - verifies lesson submission, child, writing sample, and misspelling row scope
  - rejects manual writing samples and rows without lesson/task-submission
    lineage
  - does not accept `micro_skill_key`
  - does not create `parent_verifications`,
    `parent_verified_spelling_candidate_mappings`, or `writing_issues`
  - does not write `micro_skill_catalog`
  - does not affect resolver data, mastery, rewards, analytics, templates, or
    assignments
- RLS/auth expectations:
  - authenticated parent access is scoped to `auth.uid() = parent_user_id`
  - server action enforces ownership even if RLS exists
  - no admin policies or admin routes are introduced in Slice `4B.1`
  - future admin read/update policies belong to Slice `4C`/`4D`
- Slice `4B.0` is implemented as a compact Review Work spelling review table
  rather than the bulky candidate-capture selector
- Slice `4B.0` table columns:
  - Wrong Word
  - Correct Word
  - Skill Family dropdown
  - Skill Cluster dropdown
  - Micro-skill dropdown
  - Actions
- suggested spelling issues are pre-populated
- parent may override wrong/correct word only where the existing Review Work
  flow already allows it
- Skill Family uses existing parent-facing family display names and filters
  Skill Cluster
- Skill Cluster uses existing parent-facing cluster display names and filters
  Micro-skill
- Micro-skill uses existing parent-facing micro-skill display names
- final submitted value remains exactly one existing catalog-backed
  `micro_skill_key`
- Slice `4B.0` table does not create micro-skills, allow free-text
  `micro_skill_key`, change resolver priority, write canonical truth, or block
  parent review completion
- action semantics:
  - `X` = false positive
    - tooltip/focus text: `This was not actually wrong.`
  - `!` = not a learning issue
    - tooltip/focus text: `This is not something to practise.`
  - Tick = approve this correction and skill
    - tooltip/focus text: `Approve this correction and skill.`
- Tick must use existing Review Work verification semantics only
- Tick must not automatically create global truth
- Tick must not automatically promote parent-local mappings for future reuse
- parent-local promotion/revert remains separate Slice `3` behavior
- captured/promoted mapping status may be shown as status or separate action,
  but must not be collapsed into Tick
- Slice `4B.1` UI placement:
  - `No matching skill` appears in the compact spelling review table Actions for
    eligible lesson-submission spelling rows
  - it is not shown for manual writing samples
  - it is not shown when a row already has a parent decision, candidate mapping,
    durable issue, or open catalog-review case where that would create duplicate
    workflow
  - after capture, show row status such as `Sent to catalog review`
  - do not disable unrelated Review Work completion unless existing rules
    already require it
- first admin surface comes after parent-raised catalog-review cases can exist
- first admin place is `/admin/catalog-review` under the admin/internal access
  convention in
  [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
- Slice `4C` implementation readiness:
  - implemented and QA passed as protected read-only admin triage
  - admin access foundation is implemented:
    - `lib/admin/access.ts`
    - `lib/supabase/service-role.ts`
    - `/admin` session protection in `proxy.ts`
    - mandatory `app/admin/layout.tsx` server-side guard
  - `/admin/catalog-review` exists as the minimal admin catalog-review page
  - admin identity for the private MVP comes from private server-side
    `ADMIN_USER_IDS` and `ADMIN_EMAILS` allowlists
  - there is no DB admin role table, Supabase custom claims model,
    role-management UI, or separate admin login in Slice `4C`
  - authenticated parent identity is not admin/internal identity
  - `app/admin/layout.tsx` is the mandatory server-side guard for admin pages
  - `/admin/catalog-review` also calls `requireAdminUser()` before creating or
    using the service-role client
  - page-level `requireAdminUser()` is outside broad data-read `try/catch`, so
    `redirect()` / `notFound()` control-flow is not swallowed by generic error
    rendering
  - admin APIs are not implemented yet; future `/api/admin/*` route handlers
    must call the same admin helper before querying data
  - admin reads use server-only service-role access only after admin
    authorization passes
  - no admin RLS read policies are added for v1
  - parent-scoped policies must remain parent-scoped and must not be weakened
    to make admin listing work
  - parent users must not be able to list other parents' catalog-review cases
  - admin reads must be explicit, auditable, and tested before launch
  - any service-role usage must be server-only and never exposed to client
    components
- initial admin surface should focus on:
  - grouped `misspelling -> correction`
  - count/latest date
  - representative context
  - parent reason/note
  - source provenance
  - status
- Slice `4C` may provide read/triage visibility only and may show only open
  `spelling_catalog_review_cases`
- implemented page behavior:
  - reads only open `spelling_catalog_review_cases`
  - groups by normalized `misspelling -> correction`
  - sorts groups by latest `updated_at`
  - displays misspelling -> correction, count, latest date, representative
    context, parent note/reason, source provenance, status, and limited
    supporting spelling context where appropriate
  - includes safe empty/error states
  - avoids unnecessary parent/child identity exposure
- do not start with a broad admin dashboard, role-management system, CMS, or
  global catalog mutation from parent UI
- Slice `4C` must not add admin decisions, canonical/global promotion,
  micro-skill creation, resolver changes, parent `Review Work` behavior
  changes, manual writing sample expansion, or
  mastery/reward/assignment/scoring/analytics/template changes
- admin decisions are staged after parent capture and may include:
  - link existing skill
  - create/propose new skill
  - word-level only
  - not a learning issue
  - merge duplicate
  - supersede/reopen
- Slice `4D.1` is implemented and QA passed as the smallest safe
  write-capable admin slice; it remains case-only:
  - supported decisions are `linked_existing_skill`, `new_skill_needed`,
    `word_level_only`, and `not_a_learning_issue`
  - `no_action_needed` is not implemented; adding it requires a future
    docs/schema decision
  - `linked_existing_skill` must validate an existing active, assignable `D4`
    `micro_skill_catalog.micro_skill_key`
  - `linked_existing_skill` closes/resolves the review case only; it does not
    create canonical/global mapping truth, affect resolver output, or promote
    anything globally
- implemented Slice `4D.1` admin UI pattern:
  - uses one compact per-case admin decision table that visually follows the
    compact Review Work table pattern where appropriate
  - parent Review Work table purpose is evidence classification/reporting;
    admin catalog-review table purpose is evidence review and curation
  - main table fields are Wrong Word, Correct Word, Reason, Skill Family,
    Skill Cluster, Micro-skill, Decision, and Actions
  - Source, Evidence Count / Source Count, Current Status, Latest Original
    Spelling Pair, Representative Context, Parent Note, Decision Note, and
    Decision History live in case details/disclosure
  - family, cluster, and micro-skill labels should be parent/admin-facing
    display names where available, with raw keys kept as internal values
  - do not add grouped batch mutation buttons for normalized
    `misspelling -> correction` groups
  - controls are labelled and keyboard-accessible; accessible icon actions are
    used for submit/details, and there is no Archive action in this slice
- implemented Slice `4D.1` audit and migration contract:
  - `spelling_catalog_review_case_decisions` exists as the app/RPC-path audit
    ledger
  - app path writes audit rows through the admin action/RPC path
  - record decision type, admin identity, previous status, new status,
    linked `micro_skill_key` where applicable, nullable `canonical_mapping_id`
    unused in `4D.1`, decision note, metadata, and `created_at`
  - the RPC locks/updates the target case and inserts the audit row
  - DB-level append-only enforcement with triggers/privilege redesign is not
    implemented; accepted for private MVP and to be revisited before broader
    staff/admin operations
- Slice `4D.1` QA closeout:
  - validation passed: `npx eslint app/admin/catalog-review/page.tsx
    app/admin/catalog-review/admin-decision-row.tsx
    app/admin/catalog-review/actions.ts
    scripts/writing-engine-admin-catalog-review-case-resolution-regression.ts`,
    `npx tsc --noEmit`, `npm run build`, focused `4D.1` regression, and
    `git diff --check`
  - no P0/P1/P2 findings remain
  - non-link `micro_skill_key` tampering is rejected, while
    `linked_existing_skill` still validates active, assignable `D4`
    `micro_skill_key`
  - canonical/global truth, resolver non-effect, admin/security/service-role,
    UI/accessibility/table workflow, and manual browser QA passed
- only admin/catalog curation may create or update canonical/global mapping
  truth
- Slice `4E.0` canonical spelling mapping curation contract:
  - Slice `4D.1` remains historical case-only truth. Existing
    `linked_existing_skill` decisions must not be reinterpreted, backfilled,
    or promoted as resolver-visible canonical/global mapping truth
  - Slice `4E` changes the future admin curation model from case-only
    resolution to canonical curation. The primary affirmative decision is
    `add_canonical_mapping`, not `linked_existing_skill` plus a separate
    promote button
  - future `4E` canonical-curation decisions are `add_canonical_mapping`,
    `needs_new_micro_skill`, `word_level_only`, `not_a_learning_issue`, and
    `reject_no_canonical_update`
  - `add_canonical_mapping` validates an existing active, assignable `D4`
    `micro_skill_catalog.micro_skill_key`, writes a dedicated
    canonical/global spelling mapping row, writes a canonical mapping audit
    event, and records the source catalog-review case outcome. It must not
    create or mutate `micro_skill_catalog`
  - other `4E` decisions refuse or defer canonical update and must not create
    resolver-visible truth
  - canonical/global mapping storage must live in a dedicated table, likely
    `spelling_canonical_mappings`, with a dedicated audit/event table, likely
    `spelling_canonical_mapping_events`
  - `spelling_catalog_review_cases`, parent notes,
    `parent_verified_spelling_candidate_mappings`, and
    `micro_skill_catalog` metadata must not be used as the admin/global
    canonical mapping table
  - resolver effect remains gated until a later resolver integration slice.
    Open catalog-review cases and non-canonical decisions must never affect
    resolver output
  - future resolver priority remains:
    1. active resolver-visible canonical exact-pair spelling mapping
    2. existing catalog-backed resolver behavior
    3. same-scope `parent_local_promoted` mapping where supported
    4. engine/manual diagnostic suggestions
    5. unresolved or admin-review evidence only
- Slice `4E.1` implementation and QA closeout:
  - implemented dedicated canonical mapping storage in
    `spelling_canonical_mappings`
  - implemented dedicated canonical mapping event/audit storage in
    `spelling_canonical_mapping_events`
  - added a service-role-only RPC/repository foundation for future canonical
    mapping writes
  - preserved source case, source decision, admin identity, decision note,
    metadata, dialect, normalization version, status/lifecycle fields, and
    previous/new event values for future analytics
  - added no resolver reads, no resolver priority change, no admin UI
    decision, no parent `Review Work` change, no `micro_skill_catalog`
    mutation, no false-positive handling, and no manual writing sample
    broadening
  - did not reinterpret, backfill, or promote existing Slice `4D.1`
    `linked_existing_skill` rows as canonical/global mapping truth
  - validation passed: `npx tsc --noEmit`, `npm run build`,
    `npm run writing-engine:canonical-mapping-storage-regression`, and
    `git diff --check`
  - residual private-MVP risk: service-role direct table writes can bypass
    canonical mapping event conventions until later DB hardening
- Slice `4E.2` implementation and QA closeout:
  - implemented the admin canonical-curation decision flow on
    `/admin/catalog-review`
  - new submissions now use `add_canonical_mapping`,
    `needs_new_micro_skill`, `word_level_only`, `not_a_learning_issue`, and
    `reject_no_canonical_update`
  - historical Slice `4D.1` `linked_existing_skill` and `new_skill_needed`
    values remain readable in decision history only and are not offered for
    new submissions
  - `add_canonical_mapping` requires `requireAdminUser()` before service-role
    use, validates an active, assignable `D4`
    `micro_skill_catalog.micro_skill_key`, writes canonical mapping storage
    and a canonical mapping event through the Slice `4E.1` path, records
    `canonical_mapping_id` on the source case-decision row, and closes/updates
    the source catalog-review case
  - non-canonical Slice `4E` decisions record/close the case outcome but do
    not create canonical mappings or resolver-visible truth
  - non-canonical decision semantics:
    - `needs_new_micro_skill`: real issue, no suitable existing skill yet; no
      micro-skill is created
    - `word_level_only`: real spelling issue but not reusable canonical
      micro-skill mapping truth
    - `not_a_learning_issue`: should not become practice, catalog, or
      canonical truth
    - `reject_no_canonical_update`: reviewed; no canonical mapping, resolver
      change, catalog update, or further curation action is needed
  - P1 provenance fix passed re-audit: case decision is inserted first, its id
    is passed as `p_source_decision_id`, canonical mapping and event rows
    preserve `source_decision_id`, the decision row is updated with
    `canonical_mapping_id`, the RPC remains atomic, and canonical mapping
    creation failure rolls back the decision insert
  - resolver boundary remains unchanged: no resolver reads
    `spelling_canonical_mappings` and no resolver priority changed; after R2,
    individual active canonical mappings may be marked
    `resolver_visibility_status = 'visible'` by explicit admin action, but the
    resolver runtime still does not consume them until R3
  - no `micro_skill_catalog` mutation, parent `Review Work` broadening,
    manual writing sample broadening, false-positive handling, analytics
    table/dashboard, mastery, rewards, assignments, scoring, or template
    routing change was added
  - audit provenance now links case -> case decision -> canonical mapping ->
    canonical mapping event for future catalog-gap, resolver-quality, and
    admin-audit analytics
  - validation passed: full targeted admin/catalog-review eslint, `npx tsc
    --noEmit`, `npm run build`,
    `npm run writing-engine:canonical-mapping-storage-regression`,
    `npm run writing-engine:admin-canonical-curation-regression`, optional
    legacy regression, `git diff --check`, and P1 provenance re-audit
  - hosted DB smoke initially failed because the hosted RPC body was stale,
    then passed after the corrected SQL was manually reapplied:
    `add_canonical_mapping` created a decision, canonical mapping, and
    canonical mapping event; mapping and event `source_decision_id` matched the
    decision id; the decision `canonical_mapping_id` matched the mapping id;
    `reject_no_canonical_update` created no canonical mapping; cleanup left no
    smoke cases or mappings behind
  - hosted-staging canonical truth smoke passed on a real Review Work
    `No matching skill` catalog-review case without PCRM fixture data:
    source case `b4f67f65-574d-4465-8785-a1c2b36fb6c9`
    (`sucsesfull` -> `successful`) was resolved through
    `/admin/catalog-review` with `add_canonical_mapping`, decision
    `a05adb3a-2b8e-4bd0-bff7-c8a11f7a0ddd`, active D4 micro-skill
    `D4_MOR_SUFFIXES_FUL_LESS`, and canonical mapping
    `893fdd29-c09c-41f6-b568-9558a4b9de48`; the mapping stayed
    `resolver_visibility_status = hidden`, metadata `resolver_visible`
    stayed `false`, no `resolver_visibility_enabled` event was created, the
    page reloaded with one fewer open case, and focused resolver runtime
    regressions passed
  - PCRM-G remains a separate adoption path and is still blocked for hosted
    browser smoke by lack of meaningful PCRM recommendation rows; catalog-review
    is the current smoke-proven path from real Review Work spelling evidence
    into canonical mapping truth
  - residual deployment/process risk: hosted DB behavior passed after manual
    SQL reapplication, but `supabase_migrations.schema_migrations` did not
    show expected `20260522%` rows, so hosted migration-ledger alignment is
    not proven. Multiple local migration files share a `20260522` prefix, so
    migration ordering/version hygiene should be reviewed before relying on
    CLI migrations for later slices. This does not block the Slice `4E.2`
    source closeout, but do not proceed to Slice `4E.3` resolver integration
    until the risk is documented and an explicit decision is made on whether
    to reconcile first
- Admin Spelling Review Hub is implemented:
  - `/admin/spelling-review` reduces admin confusion by showing both existing
    spelling admin queues together
  - this is a summary/link UX composition slice only; it is not a full unified
    catalog review, embedded two-table mutation surface, data-model merge,
    resolver integration, migration, or canonical truth semantics change
  - hub section: Catalog gaps / No matching skill cases
    - existing route: `/admin/catalog-review`
    - table/source: `spelling_catalog_review_cases`
    - meaning: parent could not find a suitable existing skill
    - existing decisions and canonical mapping creation behavior remain
      unchanged
  - hub section: Parent recommended canonical mappings
    - existing route: `/admin/canonical-recommendations`
    - table/source: `spelling_canonical_mapping_recommendations`
    - meaning: parent selected an existing skill and recommends the
      word/correction/skill pairing for admin review
    - existing recommendation curation semantics remain unchanged
  - existing original routes remain valid
  - existing workflows, actions, decision semantics, canonical mapping
    creation behavior, PCRM curation behavior, No Matching Skill semantics,
    parent-local promotion behavior, RLS, migrations, resolver behavior,
    mastery, rewards, assignments, scoring, analytics, dashboards, and
    template routing are unchanged
  - service-role reads remain server-only and happen after admin authorization
  - validation includes
    `npm run writing-engine:admin-spelling-review-hub-regression`
- Follow-up admin archive/reopen/edit slice:
  - may add collapsed archived sections for resolved decisions
  - reopen/change-decision must be recorded as a new audited admin
    decision/event rather than mutating historical audit rows
- Follow-up resolver adoption slice:
  - may plan how confirmed canonical mappings become spelling-engine visible
  - must preserve exact-pair mapping semantics and must not silently make
    existing accepted recommendations resolver-visible
  - hosted Supabase migration-ledger risk should be resolved before
    production resolver-visible changes
- false-positive catalog review is future/planned only:
  - reserve future case reason `false_positive_report`
  - reserve future admin outcomes `false_positive_confirmed` and
    `false_positive_needs_rule_fix`
  - `no_matching_skill` means the parent sees a real spelling issue but no
    existing micro-skill fits
  - `false_positive_report` means the parent believes the system should not
    have flagged the word/error and admin may need to suppress or fix bad
    canonical/system truth
  - false-positive parent case capture and admin false-positive mutation are
    not implemented in Slice `4C` and are not part of `4D.1`
- Slice `4C` runtime QA closeout:
  - validation passed:
    - `npx eslint app/admin/catalog-review/page.tsx`
    - `npx tsc --noEmit`
    - `npm run build`
    - `git diff --check`
  - security QA conclusion:
    - anonymous users are handled by `/admin` session protection
    - signed-in non-admin users are blocked by server-side admin guard
    - allowlisted admins can access the admin shell/page
    - service-role access is post-authorization and server-only
    - the page is read-only and mutation-free
  - residual setup/risk:
    - `ADMIN_USER_IDS` and/or `ADMIN_EMAILS` must be configured server-side
    - `SUPABASE_SERVICE_ROLE_KEY` must be configured server-side
    - this is private-MVP admin access, not long-term staff role management
    - browser-client admin reads require a future DB role/claims model and
      explicit admin RLS policies
    - future write-capable admin workflows need separate action helpers, audit
      trail design, and regression coverage
- resolver contract:
  - R0 resolver integration contract is documented only; it does not change
    resolver reads, schema, RPCs, admin actions, parent Review Work,
    completion gating, `micro_skill_catalog`, mastery, rewards, assignments,
    scoring, analytics, dashboards, or template routing
  - R1 is complete, validated, and committed as
    `42791c6 feat: add resolver-visible canonical mapping foundation`; it adds
    first-class resolver visibility storage and a server-only exact-pair read
    helper as foundation only, does not wire resolver-visible mappings into
    runtime resolver/backfill paths, and does not add admin enable/disable
    actions
  - R2 is complete, QA-passed, pushed, and committed as
    `dc13429 feat: add resolver visibility admin controls`; it adds explicit
    admin enable/disable actions for `resolver_visibility_status`, audited
    rollback, and conflict blocking only
  - R3 is implemented and QA-passed as code-only resolver runtime adoption:
    runtime use is gated by
    `WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled`, active
    resolver-visible canonical exact-pair mappings are consulted before
    existing catalog-backed resolver behavior and same-scope parent-local
    promoted mappings, blocked resolver-visible states do not fall through,
    and Stage `2C` / Stage `3A` pure helpers remain unchanged
  - R3 introduced no schema or Supabase migration changes; runtime rollback is
    removing/unsetting the feature flag, while mapping-level rollback remains
    the existing audited admin disable action
  - R3 verification passed: `writing-engine:resolver-visible-canonical-mapping-regression`,
    `writing-engine:resolver-visibility-admin-actions-regression`,
    `writing-engine:resolver-runtime-integration-regression`,
    `writing-engine:primary-mapping-regression`,
    `writing-engine:authentic-submission-regression`,
    `writing-engine:parent-local-promotion-regression`, and `npm run build`
  - R3 browser smoke loaded `/admin/canonical-mappings`; local data had no
    canonical mappings for row-level resolver visibility status/control smoke
  - no resolver change in Slice `4A` or Slice `4B.1`
  - open catalog-review cases remain invisible to the resolver
  - parent notes/reasons remain evidence only
  - PCRM recommendation evidence remains invisible to the resolver unless a
    future explicit admin canonical adoption and resolver-visibility contract
    is implemented
  - PCRM-D plain `accepted` means accepted evidence only, not resolver truth
  - existing canonical mappings remain resolver-invisible until individually
    adopted/enabled through a future explicit admin action
  - metadata-only `resolver_visible` is not sufficient as the future production
    resolver authority
  - canonical/global storage foundation now exists after Slice `4E.1`; after
    R3, resolver use remains runtime-gated and exact-pair only
  - do not use catalog-review cases, parent notes, parent-scoped candidate
    mappings, or `micro_skill_catalog` metadata as silent global mapping truth
  - resolver visibility must require an active mapping, a first-class
    visibility field/status, exact normalized
    `misspelling_normalized -> correct_spelling_normalized -> micro_skill_key`
    match, dialect and normalization-version match, active assignable `D4`
    micro-skill, and a visibility-enable audit event
  - resolver use must block on conflicts, missing provenance or missing
    visibility audit history, disabled/deprecated/superseded/replaced
    mappings, inactive/non-assignable/non-`D4` skills, PCRM evidence not
    separately adopted, closed catalog cases without canonical mapping, open
    cases, parent notes, and parent-local mapping as global truth
  - future PCRM canonical adoption may add resolver-visible normalized
    spelling mappings from adopted PCRM evidence, suppress or correct
    false-positive-producing mappings/rules, close cases with audit, and
    improve future suggestions only after the relevant adoption and
    release-safety contract is explicitly revised
  - future resolver priority is refined by Slice `4E.0` and PCRM resolver
    integration: active resolver-visible canonical exact-pair mapping,
    existing catalog-backed resolver behavior, scoped parent-local promoted
    mapping where supported, engine/manual diagnostic suggestions, then
    unresolved or admin-review evidence only
- Slice `4E.3` owns resolver integration and is QA-passed code-only source work.
  Slice `4E.4` may handle canonical
  mapping lifecycle refinements such as disable/deprecate/supersede. Slice
  `4E.5` may handle false-positive curation. Hosted Supabase schema may
  already include R1 fields from SQL Editor application, but hosted
  migration-ledger remediation remains a separate release-safety decision; any
  later DB-changing resolver stage must use a unique timestamp migration, must
  not replay archived `20260522_*` migrations, must pass an explicit
  production migration-ledger check, and must follow
  `docs/operations/supabase-migration-policy.md`.
- Slice `4B.1` implementation QA checklist:
  - parent can create an open catalog-review case for an eligible
    lesson-submission spelling row
  - parent-added missed word attached to a lesson submission can create a case
    if eligible
  - repeated capture updates the existing open case rather than inserting
    duplicates
  - manual writing samples are rejected/excluded
  - submitted `micro_skill_key` is ignored/rejected
  - no `parent_verifications` row is created by this action
  - no `parent_verified_spelling_candidate_mappings` row is created by this
    action
  - no `writing_issues` row is created by this action
  - no `micro_skill_catalog` row is created/updated
  - resolver output remains unchanged
  - mastery, rewards, assignments, scoring, analytics, and template metadata
    remain untouched
- Slice `4B.1` QA closeout:
  - implemented table: `spelling_catalog_review_cases`
  - implemented server action: `captureSpellingCatalogReviewCase`
  - implemented parent-scoped RLS and authenticated parent ownership checks
  - implemented idempotent open-case dedupe for
    `parent_user_id + child_id + source_misspelling_instance_id`
  - implemented compact Review Work `No matching skill` UI/status and
    `Sent to catalog review` saved state
  - implemented parent-added lesson missed-word support without broadening
    manual writing samples
  - implemented graceful behavior when the case table is unavailable
  - manual/browser QA passed:
    - lesson-submission suggested spelling row can be sent to catalog review
    - repeated capture updates the existing open case rather than duplicating it
    - `X`, `!`, and Tick continue to work as before
    - manual writing samples do not show the action
    - parent-added lesson missed words can be sent
    - rows with existing decision, candidate mapping, durable issue, or open
      case do not show duplicate workflow
  - validation passed:
    - `npx tsc --noEmit`
    - `npm run build`
    - `npm run writing-engine:parent-verified-spelling-candidate-capture-regression`
    - `npm run writing-engine:parent-local-promotion-regression`
    - `npm run writing-engine:mapping-source-regression`
    - `npm run writing-engine:review-work-override-provider-behavior-regression`
    - `git diff --check`
- non-goals:
  - no migrations
  - no runtime code
  - no Review Work UI changes
  - no `package.json` edits
  - no tests
  - no resolver behavior changes
  - no mastery, reward, assignment, scoring, analytics, or template-routing
    changes
  - no manual writing sample broadening
  - no parent-created global canonical truth

### Slice 4B.0 implementation status
- Slice `4B.0` is implemented and QA passed
- previous bulky candidate-capture selector direction is superseded by the
  compact spelling review table
- delivered:
  - pre-populated spelling review table
  - parent-facing Skill Family, Skill Cluster, and Micro-skill display names
  - Skill Family -> Skill Cluster -> Micro-skill filtering
  - final submission of exactly one existing catalog-backed `micro_skill_key`
  - action icons for false positive, not a learning issue, and approve
    correction+skill
  - row-specific accessible names for Skill Family, Skill Cluster, and
    Micro-skill selects
- not delivered in this slice:
  - no migration
  - no `spelling_catalog_review_cases`
  - no parent `No matching skill` case capture
  - no admin/catalog review surface
  - no resolver priority change
  - no mastery, reward, assignment, scoring, analytics, or template-routing
    change
  - no manual writing sample broadening
  - no parent-created global canonical truth
- remaining staged work:
  - Slice `4B.1` remains parent `No matching skill` catalog-review case
    capture
  - Slice `4C` remains minimal admin read/triage
  - Slice `4D` remains admin decisions and canonical promotion

### Stage 7 implementation status
- Stage `7` overall is complete and QA passed on its documented bounded path
- the bullets below preserve the bounded Stage `7` closeout history; where
  older lines mention an intermediate “next boundary,” treat them as
  chronological context rather than current instruction
- `7A` complete and QA passed
- `7B` complete and QA passed
- `Review Work` is the canonical parent review surface
- `Add Writing Sample` and compatibility `/analyse` are intake-only entry
  points for parent-entered manual writing samples
- `/analyse/review` is obsolete and unsupported and should not remain as a
  supported route, redirect-owned compatibility surface, or active guidance
- paper work written outside the app is entered through intake, saved as a
  canonical `writing_sample`, and reviewed through `Review Work`
- lesson submissions and manual writing samples are expected to converge into
  one `Review Work` queue
- Stage `7` is visibility and workflow integration only on top of existing
  shared analysis, verification, and durable issue contracts
- bounded `7A` intake now exists at `/analyse`:
  - parent can type or paste paper-written work
  - save creates a canonical manual `writing_sample`
  - save reuses existing shared spelling candidate analysis where supported
  - save hands off to `Review Work`
- Stage `7A` QA evidence:
  - `npm run writing-engine:stage7a-intake-regression`
    - `writing-engine-stage7a-intake-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `7A` preserved boundaries:
  - `Add Writing Sample` remains intake only
  - `Review Work` remains the canonical parent review surface
  - `/analyse` is not canonical review ownership
  - Analyse intake does not own verification, mastery, assignment generation,
    rewards, or durable learning effects
  - no new engine, verification, durable issue, mastery/evidence,
    assignment, reward, analytics, or route-local review semantics were
    introduced
- current navigation target:
  - `Analyse Writing` belongs under `Courses`
  - standalone top-level Analyse navigation is not allowed
- current non-goals for Analyse Review retirement cleanup:
  - Stage `8`
  - mastery automation
  - assignment generation changes
  - rewards changes
  - AI checking
- bounded `7B` queue visibility now exists in `Review Work`:
  - manual writing samples and lesson submissions render in one live queue
  - queue rows identify source type
  - manual writing samples open through the same canonical `Review Work`
    route family
  - `7B` remains visibility-only and does not add new verification or durable
    issue actions
- Stage `7B` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7C` review detail suggested issues panel is now the next implementation
  boundary
- `7C` contract is now documentation-defined as a read-only canonical
  `Review Work` detail panel for existing shared outputs
- bounded `7C` detail visibility now exists in `Review Work`:
  - canonical `Review Work` detail now renders one read-only suggested-issues
    panel
  - manual writing samples and lesson submissions use the same panel shape and
    state vocabulary
  - the panel renders existing shared outputs only:
    - candidate spelling outputs
    - unresolved targeted-writing suggestion outputs
    - durable writing-issue history
  - detail rendering no longer triggers helper-suggestion sync or other
    render-time writes
  - no parent verification, durable-issue promotion, mastery/evidence,
    assignment, reward, analytics, or route-local source-of-truth semantics
    were introduced
- Stage `7C` implementation evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `7C` QA evidence:
  - one canonical read-only suggested-issues panel is visible in `Review Work`
    detail
  - both supported source types are covered:
    - lesson submissions
    - manual writing samples
  - distinct read-only visibility states are browser-verified where applicable:
    - outputs available
    - already reviewed/history
    - no outputs yet
    - empty result
  - no parent verification controls appear in `7C`
  - no render-time writes occur from viewing the panel
  - no render-time analysis occurs from viewing the panel
  - no second review surface or route-local suggested-issue ownership was
    introduced
  - same-session regression stability is verified for:
    - `npx tsc --noEmit`
- `7C` complete and QA passed
- `unsupported_source` and `load_error` exist in the shared `7C` read model,
  but are not yet browser-covered through the current supported `Review Work`
  flow because that would require fabricated unsupported routes or forced load
  failures
- next safe implementation boundary after `7C` QA was
  `Stage 7D — Parent verification actions in Review Work`
- `7D` is now documentation-defined and implementation-ready at the contract
  level
- `7D` remains bounded to canonical parent verification actions in
  `Review Work` and does not yet include queue/archive coherence, which
  remains owned by `7E`
- `7D` execution is now explicitly broken into bounded subtasks:
  - `7D.1` canonical action wiring
  - `7D.2` override flow
  - `7D.3` read-after-write detail truth
- the `7D` subtask plan is an implementation breakdown only, not a new product
  scope
- implementation must proceed one subtask at a time
- each `7D` subtask requires its own:
  - implementation report
  - QA pass
  - closeout before the next subtask begins
- bounded `7D.1` canonical action wiring now exists in `Review Work`:
  - canonical non-override parent verification actions are available inside
    `Review Work` detail
  - allowed decisions in `7D.1` only are:
    - `accepted`
    - `false positive`
    - `not a learning issue`
  - lesson submissions and manual writing samples reuse the same canonical
    non-override action family where supported
  - the manual false-positive post-submit auth/session defect is fixed on the
    canonical shared verification path
  - no override editor/input flow, queue/archive/status coherence work,
    mastery/evidence writes, assignment writes, reward writes, analytics
    writes, taxonomy changes, or Stage `7E` behaviour were introduced
- Stage `7D.1` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `7D.1` preserved boundaries:
  - `Review Work` remains the canonical parent review surface
  - `Add Writing Sample` remains intake only
  - `/analyse` does not regain review ownership
  - existing shared verification orchestration is reused
  - parent verification records remain distinct from durable writing issues
  - durable writing issue promotion continues only through existing documented
    shared orchestration
  - no new mastery/evidence, assignment, reward, analytics, taxonomy, or
    queue/archive semantics were introduced
- `7D.1` complete and QA passed
- bounded `7D.2` override flow now exists in `Review Work`:
  - override actions reuse existing shared verification semantics only
  - override inputs remain limited to documented shared verification fields
  - no new override payload shape, lifecycle state, queue/archive semantics,
    mastery/evidence writes, assignment writes, reward writes, analytics
    writes, or taxonomy changes were introduced
- Stage `7D.2` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7D.2` complete and QA passed
- bounded `7D.3` read-after-write detail truth now exists in `Review Work`:
  - post-action detail truth uses shared-model wording for the action-bearing
    surface
  - accepted, false positive, overridden, and not-a-learning-issue outcomes
    now reflect canonical shared verification truth in the detail view
  - success toast, recorded decision text, and parent verification count now
    render through the canonical shared detail surface
  - no queue/archive/status coherence work, new decision names, new
    verification states, new issue lifecycle states, mastery/evidence writes,
    assignment writes, reward writes, analytics writes, or taxonomy changes
    were introduced
- Stage `7D.3` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7D.3` complete and QA passed
- `7D` overall is now complete and QA passed
- next safe implementation boundary after `7D` QA is
  `Stage 7E — Queue completion/archive/status coherence`
- `Stage 7E` is now documentation-defined as:
  - canonical queue completion, archive coherence, and cross-surface status
    reconciliation inside `Review Work`
  - a shared read-model projection layer over existing verification and issue
    truth, not a new source of truth
  - explicitly bounded away from new verification semantics, new issue
    lifecycle states, direct mastery/evidence or assignment/reward/analytics
    writes, and Stage `8` automatic-mastery semantics
- `Stage 7E` is now split into an execution-only subtask plan:
  - `7E.1` — Queue/detail status projection coherence
  - `7E.2` — Archive/completion presentation coherence
  - `7E.3` — Cross-surface return-path and count reconciliation
- this split does not broaden product scope
- implementation must proceed one subtask at a time
- each `7E` subtask requires:
  - its own implementation report
  - its own QA pass
  - explicit closeout before the next subtask begins
- bounded `7E.1` queue/detail status projection coherence now exists:
  - `Review Work` queue-row status and `Review Work` detail status now
    reconcile through shared read-model projection after existing Stage `7D`
    verification actions
  - canonical shared truth only is used:
    - `task_submissions`
    - `writing_samples`
    - `writing_issue_suggestions`
    - `parent_verifications`
    - `writing_issues`
  - queue projection now respects canonical parent verification truth instead
    of treating already-verified misspellings as still unresolved
  - lesson submission queue rows now show shared projected status truth rather
    than contradictory older thread-only status where reviewable shared truth
    remains
  - manual writing samples with a single reviewable misspelling no longer
    remain live in the `Review Work` queue after canonical false-positive
    verification
  - no archive/completed-view redesign, new verification decisions,
    verification states, issue lifecycle states, queue truth tables, or Stage
    `8` semantics were introduced
- Stage `7E.1` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7E.1` preserved boundaries:
  - `Review Work` remains the canonical parent review surface
  - `Add Writing Sample` remains intake only
  - `Stage 7E.1` reused existing shared truth and shared read-model
    projection only
  - no new queue truth table was introduced
  - no route-local completion or archive ownership was introduced
  - archive/completion presentation coherence still belongs to `7E.2`
  - Stage `8` automatic mastery semantics remain out of scope
- `7E.1` complete and QA passed
- bounded `7E.2` archive/completion presentation coherence now exists:
  - completed/archive presentation is now derived from existing shared truth
    after documented Stage `7D` actions
  - archive/completed views no longer contradict canonical detail verification
    truth
  - lesson submissions and manual writing samples remain on the same canonical
    review spine where applicable
  - no new lifecycle states, queue truth tables, route-local archive
    ownership, or separate completion-truth source were introduced
- Stage `7E.2` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7E.2` preserved boundaries:
  - `Review Work` remains the canonical parent review surface
  - `Add Writing Sample` remains intake only
  - archive/completion presentation remains a shared read-model projection
    over existing truth
  - no route-local archive ownership or separate completion-truth source was
    introduced
  - Stage `8` automatic mastery semantics remain out of scope
- `7E.2` complete and QA passed
- bounded `7E.3` cross-surface return-path and count reconciliation now exists:
  - post-action return paths land in a coherent canonical `Review Work` queue
    state
  - queue counts, row visibility, and detail truth reconcile through the same
    shared read-model projection after documented verification actions
  - lesson submissions and manual writing samples remain coherent across
    queue, detail, and archive/history where applicable
  - no new queue truth table, route-local completion/archive ownership,
    lifecycle state, or Stage `8` semantics were introduced
- Stage `7E.3` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7E.3` preserved boundaries:
  - `Review Work` remains the canonical parent review surface
  - `Add Writing Sample` remains intake only
  - cross-surface return-path and count reconciliation remains a shared
    read-model concern over existing truth
  - no new queue truth table or route-local completion/archive ownership was
    introduced
  - Stage `8` automatic mastery semantics remain out of scope
- `7E.3` complete and QA passed
- `Stage 7E` overall is now complete and QA passed
- `7A` to `7E` remain complete on their original bounded path
- a new bounded follow-up restoration pass is now documentation-defined as
  `Stage 7F — Parent Review Action Restoration`
- `Stage 7F` exists because historical parent-facing lesson review actions
  were orphaned from the canonical `Review Work` detail UI during the
  `c808b1f` review-work foundation change, while the underlying canonical
  backend actions and child returned-work path remained in place
- `Stage 7F` is a narrow restoration pass, not a new architecture slice
- `Stage 7F` preserves the current canonical `Review Work` spine and does not
  revive `/analyse/review`, old Analyse review ownership, or duplicate review
  surfaces
- `Stage 7F` applicable contracts and sources of truth are now explicitly:
  - primary contract:
    - `docs/contracts/writing-engine-mastery-and-evidence-contract.md`
  - secondary boundary contract:
    - `docs/contracts/micro-skill-taxonomy-and-assignment-contract.md`
  - canonical architecture:
    - `docs/architecture/writing-engine-canonical-brief.md`
    - `docs/architecture/writing-engine-foundation.md`
  - active implementation docs:
    - `docs/implementation/writing-engine-roadmap.md`
    - `docs/implementation/targeted-writing-practice-status.md`
  - live runtime action contract:
    - `app/courses/review/actions.ts`
- no extra unstated contract was supplied beyond those canonical docs and the
  live action contract, so implementation must not invent hidden
  source-of-truth rules
- `Stage 7F` documentation now requires that:
  - parent-added missed issues preserve parent-authored provenance and are not
    presented as engine-suggested truth
  - returned lesson submissions remain live and visually distinct from generic
    needs-review rows
  - lesson approval remains blocked while unresolved suggestions remain
  - zero-suggestion silence must not auto-complete either source type
  - manual-sample completion currently lacks explicit persistence and must not
    be faked
- `Stage 7F` is broken into bounded mini-tasks in the roadmap:
  - `7F.1` lesson parent actions UI restoration
  - `7F.2` structured lesson feedback rehydration
  - `7F.3` lesson send-back flow reconnection
  - `7F.4` lesson approval guardrail restoration
  - `7F.5` suggested issue semantics clarification
  - `7F.6` lesson missed word restoration
  - `7F.7` parent-authored manual issue provenance
  - `7F.8` queue truth for returned and zero-suggestion lesson work
  - `7F.9` manual sample explicit completion model
  - `7F.10` Stage `7F` regression coverage
- `Stage 7F` sequencing rule:
  - one mini-task at a time
  - each mini-task requires its own implementation report, QA pass, and
    explicit closeout before the next begins
- `7F.6` is now the exact next implementation slice:
  - restore the lesson-only missed-word capture path using the existing
    canonical backend action
  - preserve all Stage `7D` and `7F.1` to `7F.5` verification, send-back,
    and approval guardrails
  - keep catalog / micro-skill mapping readiness work outside Stage `7F`
  - render saved parent-added missed words in a separate lesson-only
    parent-authored section rather than Suggested Issues engine-output framing
- `7F.1` acceptance and QA boundary:
  - lesson detail renders the action section
  - manual sample detail does not
  - canonical Suggested Issues detail remains the primary review spine
  - browser/UI regression must cover lesson vs manual rendering
  - `npx tsc --noEmit`
- bounded `7F.1` lesson parent actions UI restoration now exists:
  - lesson submission detail renders a lesson-only `Parent review actions`
    section below the canonical Suggested Issues panel
  - manual writing sample detail does not render that section
  - the restored `Approve / mark complete`, `Send back to child`, and
    `Parent note` controls are intentionally disabled / non-operative in
    `7F.1`
  - no backend mutation path was introduced by `7F.1`
- Stage `7F.1` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0`
  - `npm run build`
    - passed with exit code `0`
  - `npm run writing-engine:stage7a-intake-regression`
    - `writing-engine-stage7a-intake-regression: ok`
- `7F.1` preserved boundaries:
  - Suggested Issues remains the canonical issue-verification surface
  - no lesson action in manual writing sample detail
  - no `parent_review_status` change path was introduced
  - no returned-work draft payload write path was introduced
  - no approval or send-back success path was introduced
  - `7F.2` still owns structured lesson feedback rehydration
  - `7F.3` still owns send-back wiring
  - `7F.4` still owns approval guardrails
- `7F.1` complete and QA passed
- bounded `7F.2` structured lesson feedback rehydration now exists:
  - lesson submission detail may render structured lesson feedback inputs when
    current lesson schema/draft data supports them
  - manual writing sample detail does not render structured lesson feedback
    inputs
  - structured lesson feedback inputs reuse the existing action naming
    contract:
    - `field_feedback__{fieldKey}`
  - restored structured lesson feedback inputs remain disabled /
    non-operative in `7F.2`
  - no backend mutation path was introduced by `7F.2`
- Stage `7F.2` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0`
  - `npm run build`
    - passed with exit code `0`
- `7F.2` preserved boundaries:
  - Suggested Issues remains the canonical issue-verification surface
  - no structured lesson feedback inputs appear in manual writing sample
    detail
  - no send-back execution path was introduced yet
  - no approval guardrail behavior was introduced yet
  - `7F.3` still owns send-back wiring
  - `7F.4` still owns approval guardrails
- `7F.2` complete and QA passed
- bounded `7F.3` lesson send-back flow reconnection now exists:
  - lesson submission detail wires the lesson-only send-back form to the
    existing canonical action:
    - `returnSubmissionToChild(...)`
  - `parent_review_note` is editable and posts through the action
  - structured lesson feedback values post through the existing contract:
    - `field_feedback__{fieldKey}`
  - manual writing sample detail does not render or support lesson send-back
  - approval remains deferred and non-operative in `7F.3`
- Stage `7F.3` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0`
  - `npm run build`
    - passed with exit code `0`
- `7F.3` preserved boundaries:
  - Suggested Issues remains the canonical issue-verification surface
  - no lesson send-back UI appears in manual writing sample detail
  - approval remains deferred and non-operative
  - `7F.4` still owns approval guardrails
- `7F.3` complete and QA passed
- bounded `7F.4` lesson approval guardrail restoration now exists:
  - lesson-only approval is now wired to the existing canonical action:
    - `approveSubmissionReview(...)`
  - approval remains lesson-only
  - manual writing sample detail does not render or support lesson approval
  - approval is blocked while unresolved suggestions remain
  - the unresolved-suggestion guardrail is enforced both:
    - in the UI disabled state
    - server-side in the approval action
  - unresolved state is derived from the existing Suggested Issues / shared
    review truth model rather than a new unresolved-state model
  - accepted, overridden, `false_positive`, and `not_a_learning_issue`
    outcomes continue to count as resolved through existing shared truth
  - explicit parent completion remains required even when the engine found no
    suggestions
  - `7F.3` send-back behavior remains intact
- Stage `7F.4` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0`
  - `npm run build`
    - passed with exit code `0`
  - code-level audit confirmed:
    - approval form is wired to `approveSubmissionReview(...)`
    - approval disabled state is driven by the existing shared unresolved
      count
    - server-side approval guardrail rejects approval while unresolved
      suggestions remain
    - manual writing samples cannot render or submit lesson approval
    - `returnSubmissionToChild(...)` wiring from `7F.3` remains intact
  - manual/browser QA confirmed:
    - unresolved lesson submission approval is blocked
    - blocked approval returns the expected message:
      - `All captured suggestions must be reviewed before this submission can be approved.`
    - manual writing sample detail does not render lesson approval UI
    - manual writing sample detail does not render lesson send-back UI
    - manual sample Suggested Issues behavior remains unchanged
- `7F.4` non-blocking caveat:
  - the zero-unresolved approval success path was not manually re-tested in
    the active browser context because the active lesson submission still had
    unresolved suggestions
  - code-level audit confirmed the expected path:
    - UI enables approval when unresolved count is `0`
    - server action approves only when shared unresolved checks pass
  - this should be smoke-tested when a zero-unresolved or no-suggestion lesson
    item is available
  - this caveat does not block `7F.4` closeout
- `7F.4` related finding preserved for `7F.5`:
  - some Suggested Issues do not show a visible `Accept` button
  - classify this as `7F.5` wording/visibility debt, not a `7F.4` regression
  - the current code still contains an `Accept` action path
  - `Accept` visibility is controlled by the shared review model through
    `allowsAccepted`
  - `Accept` remains unavailable when a suggestion lacks canonical micro-skill
    truth
  - the action layer also rejects `accepted` decisions without valid canonical
    micro-skill truth
  - `7F.5` should clarify Suggested Issue action wording and visibility
    without weakening:
    - `allowsAccepted`
    - canonical micro-skill requirements
    - approval unresolved-suggestion guardrails
    - shared verification semantics
- `7F.4` preserved boundaries:
  - `7F.5` still owns Suggested Issue action wording and visibility
  - `7F.6` still owns lesson missed-word capture
  - `7F.8` still owns returned lesson row and zero-suggestion lesson queue
    truth restoration
  - `7F.9` still owns manual sample explicit completion persistence
  - `7F.10` still owns focused Stage `7F` regression coverage
  - no Stage `8` mastery/runtime work is authorized by this closeout
- `7F.4` complete and QA passed
- bounded `7F.5` Suggested Issue semantics clarification now exists:
  - Suggested Issues action wording and visibility are now clarified on the
    canonical Review Work surface
  - the UI now explains when `Accept` is available because canonical
    micro-skill truth already exists
  - the UI now explains when `Accept` is unavailable because canonical
    micro-skill truth is missing
  - the UI now explains the supported alternatives:
    - `False positive`
    - `Not a learning issue`
    - `Override shared verification`
  - a compact `What these actions mean` disclosure now explains the existing
    action meanings
  - stale lesson-action copy was corrected so the page no longer says
    send-back and approval are deferred to later stages
- `7F.5` guardrails preserved:
  - `allowsAccepted` was preserved
  - canonical micro-skill requirement for `accepted` was preserved
  - server-side rejection of invalid `accepted` decisions remains intact
  - approval guardrails from `7F.4` remain intact
  - send-back behavior from `7F.3` remains intact
  - no new verification decisions were introduced
  - no new unresolved-state model was introduced
  - no new source-of-truth tables were introduced
  - no mastery, evidence, assignment, reward, analytics, queue, or archive
    writes were introduced
- Stage `7F.5` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0`
  - `npm run build`
    - passed with exit code `0`
  - `npm run lint`
    - was run and failed due to pre-existing repo-wide issues
    - failures are concentrated under `.tmp` regression artifacts plus
      unrelated files outside `7F.5`
    - the lint failure is not caused by the `7F.5` change
- `7F.5` related finding preserved outside Stage `7F`:
  - the reason some Suggested Issues still cannot show `Accept` is missing
    canonical micro-skill mapping / truth readiness
  - classify this as catalog / micro-skill mapping readiness debt, not a
    `7F.5` regression
  - do not solve this inside `7F.5` or `7F.6`
  - any mapping or population work must be handled in a separate docs-first
    catalog readiness pass
- `7F.5` preserved boundaries:
  - `7F.6` still owns lesson missed-word capture
  - `7F.8` still owns returned lesson row and zero-suggestion lesson queue
    truth restoration
  - `7F.9` still owns manual sample explicit completion persistence
  - `7F.10` still owns focused Stage `7F` regression coverage
  - no Stage `8` mastery/runtime work is authorized by this closeout
  - catalog / micro-skill mapping population is not part of Stage `7F`
- `7F.5` complete and QA passed
- bounded `7F.6` lesson missed-word restoration now exists:
  - lesson submission detail exposes lesson-only `Add missed word`
  - the flow uses the existing canonical action:
    - `addMissedWordToSubmissionReview(...)`
  - saved parent-authored missed-word rows reappear in Review Work detail in a
    separate lesson-only parent-authored section
  - saved parent-authored missed-word rows are not presented as
    engine-suggested truth
  - parent-authored missed-word rows do not block approval as unresolved
    engine/shared suggestions
  - manual writing sample detail does not gain missed-word support
- Stage `7F.6` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0`
  - `npm run build`
    - passed with exit code `0`
  - `npm run lint`
    - was run and failed due to pre-existing repo-wide issues
    - failures are concentrated under `.tmp` regression artifacts plus
      unrelated files outside `7F.6`
    - the lint failure is not caused by the `7F.6` change
  - manual/browser QA confirmed:
    - `Add missed word` submits successfully
    - success messaging appears
    - the saved row reappears under `Parent-added missed words`
    - the saved row does not appear inside `Suggested Issues`
    - manual writing sample detail still shows no missed-word control
    - approval succeeds when only parent-authored missed-word rows remain
- `7F.6` preserved boundaries:
  - `7F.7` still owns parent-authored manual issue provenance
  - `7F.8` still owns returned lesson row and zero-suggestion lesson queue
    truth restoration
  - `7F.9` still owns manual sample explicit completion persistence
  - `7F.10` still owns focused Stage `7F` regression coverage
  - no Stage `8` mastery/runtime work is authorized by this closeout
  - catalog / micro-skill readiness remains outside Stage `7F`
- `7F.6` complete and QA passed
- bounded `7F.7` parent-authored manual issue provenance now exists:
  - manual writing sample Review Work detail exposes a parent-authored manual
    issue save path
  - the implementation reuses the existing manual issue action path:
    - `addManualWritingIssue(...)`
  - the manual sample path now supports saving against `writing_sample_id`
  - canonical durable issue truth is created on the manual sample using the
    existing durable-issue pathway
  - a suggestion-shaped row is still used in the existing path, but it is
    preserved as parent-authored provenance via:
    - `source_type: parent_manual`
  - manual sample Review Work detail now renders saved parent-authored manual
    issues in a separate parent-authored section
  - saved manual parent-authored issues are not presented as
    engine-suggested truth
- Stage `7F.7` QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0`
  - `npm run build`
    - passed with exit code `0`
  - `npm run lint`
    - was run and failed due to pre-existing repo-wide issues
    - failures are concentrated under `.tmp` regression artifacts plus
      unrelated files outside `7F.7`
    - the lint failure is not caused by the `7F.7` change
  - manual/browser QA confirmed:
    - manual writing sample detail shows the parent-authored manual issue save
      form
    - saving a parent-authored manual issue succeeds
    - success messaging appears
    - the saved issue reappears in the separate parent-authored manual issues
      section
    - the saved result is not framed as `Suggested / candidate`,
      `Unresolved` engine output, or generic engine suggestion truth
    - the result does not imply mastery truth, assignment truth, or engine
      verification truth
    - lesson `7F.6` / `7F.4` / `7F.3` regression checks passed
- `7F.7` preserved boundaries:
  - `7F.8` still owns returned lesson row and zero-suggestion lesson queue
    truth restoration
  - `7F.9` still owns manual sample explicit completion persistence
  - `7F.10` still owns focused Stage `7F` regression coverage
  - no Stage `8` mastery/runtime work is authorized by this closeout
  - catalog / micro-skill mapping remains outside Stage `7F`
- `7F.7` complete and QA passed
- the bounded post-Stage-`7` parent-facing evidence-transparency safety slice
  now exists:
  - dashboard and insights copy now distinguish verified parent review truth
    from broader advisory evidence/progress summaries
  - parent-facing wording no longer implies stronger mastery certainty than
    the current evidence model supports
  - no stored mastery/evidence, assignment, reward, analytics, or taxonomy
    truth was changed by this slice
- Stage `8` foundation readiness is now documentation-defined as a bounded
  audit / transparency slice only:
  - evidence maturity means advisory readiness of the currently captured shared
    evidence, not a new stored mastery state
  - current repo truth already exposes some maturity signals through read-only
    summaries:
    - total evidence count
    - recent success / failure mix
    - latest evidence source context
    - current competency / progress-state projections
  - what is still missing before real automatic mastery work:
    - any new automatic mastery runtime semantics
    - score / threshold ownership changes
    - new evidence-maturity persistence
    - stronger parent-facing mastery claims than the current advisory model
- post-Stage-`7` evidence-transparency QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `8A` is now the next safe implementation slice:
  - it is a bounded wording / presentation pass only
  - it does not authorize mastery logic or other runtime semantic changes
- Stage `8A` implementation is now complete:
  - the slice remained copy / label / help-text / presentation-only
  - `Review Work` remains the canonical verified-truth surface
  - parent-facing summary surfaces continue to show advisory
    evidence/progress interpretation only
  - no runtime mastery semantics, scoring, thresholds, persistence, routing,
    reward logic, positive-evidence logic, or Stage `7F` behavior changed
  - `npx tsc --noEmit` passed for the bounded implementation slice
  - residual metaphor risk remains in:
    - `Golden Nugget`
    - `In the Machine`
    - `Gold Bar so far`
  - that residual metaphor risk is a possible future copy-only pass, not a
    blocker
- Stage `8` overall is now closed:
  - it remained a boundary-safety and wording stage only
  - it did not broaden into mastery runtime semantics
- current private-live readiness for one child:
  - safe to use as a parent-led review and practice workflow
  - not safe to describe as full automatic child-work checking or automatic
    mastery judgement
  - parent must remain the authority on what matters, what is actionable, and
    what broader progress claims mean
- current production-release status:
  - the repo builds successfully with `npm run build`
  - production release path remains `git push origin main`
  - the current `main` worktree is dirty and must not be blindly pushed
  - before production push, the intended release slice should be isolated,
    reviewed, committed, and pushed intentionally
- no broader Stage `8` runtime follow-up is authorized by the completed
  `Stage 8A` closeout
- because no later implementation stage is canonically defined here, the next
  safe step is a docs-first planning / audit pass
- any future pass on the remaining product-metaphor labels is copy-only debt,
  not a blocker or new Stage `8` runtime boundary

### Stage 6A implementation status
- complete
- shared-boundary Stage `6A` grammar/proofreading candidate generation now
  exists under:
  - `lib/writing-engine/grammar/stage6a-authentic-submission-analysis.ts`
- Stage `6A` reuses the canonical authentic-writing source normalization and
  source provenance path established by `Stage 3A` and reused by `Stage 4A`
  and `Stage 5A`
- supported bounded Stage `6A` candidates now include:
  - standalone lowercase pronoun `i` -> `I` as a grammar candidate
  - repeated internal spacing between words as a proofreading candidate
- explicit unresolved outcomes now cover:
  - article-choice patterns that would require undocumented grammar taxonomy
    truth
  - quotation-mark patterns that would require broad proofreading ownership
- preserved canonical lineage includes:
  - `task_submission`
  - `writing_sample`
  - source span metadata
  - target text
  - child attempt text
- no verification writes, durable issue writes, mastery/evidence writes,
  `learning_items`, `learning_item_evidence`, `learning_item_issue_links`,
  `assignment_items`, rewards, analytics, dashboards, route-local ownership,
  or external API/model truth ownership were introduced
- Stage `6A` QA evidence:
  - `npm run writing-engine:grammar-proofreading-candidate-regression`
    - `writing-engine-stage6a-grammar-proofreading-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-verification-regression`
    - `writing-engine-stage5b-sentence-boundary-verification-regression: ok`
  - `npm run writing-engine:sentence-boundary-issue-promotion-regression`
    - `writing-engine-stage5c-sentence-boundary-issue-promotion-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `6A` residual risks:
  - candidate coverage is intentionally narrow and does not yet broaden into
    general grammar or broad proofreading ownership
  - unsupported transfer, analytics/calibration, and external-judgment cases
    remain deferred to later documented stages rather than being inferred here
  - coverage is regression-based rather than DB-backed or app-triggered

### Stage 6B implementation status
- complete
- shared-boundary Stage `6B` grammar/proofreading verification now exists
  under:
  - `lib/writing-engine/grammar/stage6b-authentic-submission-verification.ts`
- Stage `6B` reuses the existing shared `parent_verifications` contract and
  the established authentic-writing verification semantics from `Stage 3B`,
  `Stage 4B`, and `Stage 5B`
- supported parent decisions are now bounded to:
  - `accepted`
  - `overridden`
  - `false_positive`
  - `not_a_learning_issue`
- Stage `6B` preserves:
  - original suggestion truth
  - parent decision
  - parent-verified truth
  - canonical authentic-writing provenance
  - `sourceSpan`, `targetText`, and `childAttemptText` metadata where
    available
- write ownership remains limited to shared `parent_verifications`
- no durable issue writes, mastery/evidence writes, `learning_items`,
  `learning_item_evidence`, `learning_item_issue_links`, `assignment_items`,
  rewards, analytics, dashboards, UI/server-action work, route-local
  verification ownership, parallel verification storage, free-text taxonomy,
  or external API/model truth ownership were introduced
- Stage `6B` QA evidence:
  - `npm run writing-engine:grammar-proofreading-verification-regression`
    - `writing-engine-stage6b-grammar-proofreading-verification-regression: ok`
  - `npm run writing-engine:grammar-proofreading-candidate-regression`
    - `writing-engine-stage6a-grammar-proofreading-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-verification-regression`
    - `writing-engine-stage5b-sentence-boundary-verification-regression: ok`
  - `npm run writing-engine:sentence-boundary-issue-promotion-regression`
    - `writing-engine-stage5c-sentence-boundary-issue-promotion-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `6B` residual risks:
  - verification remains intentionally bounded to `Stage 6A` grammar and
    proofreading candidates only
  - durable grammar/proofreading issue promotion remains deferred to `Stage 6C`
  - `Stage 6A` candidate coverage remains intentionally narrow
  - coverage is regression-based rather than DB-backed or app-triggered

### Stage 6C implementation status
- complete
- shared-boundary Stage `6C` grammar/proofreading durable issue promotion now
  exists under:
  - `lib/writing-engine/grammar/stage6c-authentic-writing-issue-promotion.ts`
- Stage `6C` reuses only verified `Stage 6B` grammar/proofreading outcomes
  and the existing durable `writing_issue` lifecycle from `Stage 3C`,
  `Stage 4C`, and `Stage 5C`
- Stage `6C` promotes only:
  - `accepted`
  - `overridden`
  verified outcomes into durable issue truth
- Stage `6C` preserves:
  - original suggestion truth
  - parent decision
  - parent-verified truth
  - canonical authentic-writing provenance
  - `sourceSpan`, `targetText`, and `childAttemptText` metadata where
    available
- write ownership remains limited to the existing durable issue path
- `false_positive` and `not_a_learning_issue` outcomes remain auditable and do
  not create durable issue truth
- no mastery/evidence writes, `learning_items`, `learning_item_evidence`,
  `learning_item_issue_links`, `assignment_items`, rewards, analytics,
  dashboards, UI/server-action work, route-local issue ownership, parallel
  issue storage, free-text taxonomy, or external API/model truth ownership
  were introduced
- Stage `6C` QA evidence:
  - `npm run writing-engine:grammar-proofreading-issue-promotion-regression`
    - `writing-engine-stage6c-grammar-proofreading-issue-promotion-regression: ok`
  - `npm run writing-engine:grammar-proofreading-verification-regression`
    - `writing-engine-stage6b-grammar-proofreading-verification-regression: ok`
  - `npm run writing-engine:grammar-proofreading-candidate-regression`
    - `writing-engine-stage6a-grammar-proofreading-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-verification-regression`
    - `writing-engine-stage5b-sentence-boundary-verification-regression: ok`
  - `npm run writing-engine:sentence-boundary-issue-promotion-regression`
    - `writing-engine-stage5c-sentence-boundary-issue-promotion-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `6C` residual risks:
  - durable promotion remains intentionally bounded to verified `Stage 6A`
    grammar/proofreading candidates only
  - `Stage 6A` candidate coverage remains intentionally narrow
  - transfer/refinement evidence and analytics/calibration remain deferred to
    later documented stages
  - coverage is regression-based rather than DB-backed or app-triggered

### Stage 3 documentation gate
- Stage `3` is now documented as the authentic-writing submission-analysis
  stage rather than a placeholder heading
- canonical docs now define for Stage `3`:
  - the stage goal
  - the behaviour contract
  - architecture boundaries
  - non-goals
  - acceptance criteria
  - QA requirements
  - the boundary with Stage `4`
- parent `Stage 3` is intentionally broken into bounded mini-tasks before code:
  - `3A` submission-source normalization and spelling hypothesis generation
  - `3B` shared parent verification for authentic-writing hypotheses
  - `3C` verified authentic-writing outcome bridge into durable issue truth
- parent `Stage 3` is now complete
- Stage `3A` is now complete
- Stage `3A` remained bounded to:
  - spelling only
  - shared-boundary only
  - read/build only
  - no verification writes
  - no durable issue writes
  - no mastery updates
- Stage `3A` is now implemented:
  - shared submission-source normalization now exists under `lib/writing-engine`
  - spelling-only authentic-writing candidate hypothesis generation now exists
    under the shared Writing Engine boundary
  - deterministic candidate hypotheses are covered by the service shape and
    regression `testResultIsDeterministic()`
  - candidate hypotheses now preserve canonical source refs to:
    - `task_submission`
    - `writing_sample`
    - source span
    - target text
    - child attempt text
  - Stage `2` error-category, mapping, lesson-template, complexity, and
    similar-practice resolvers are reused where applicable
  - unresolved and ambiguous mapping/content gaps remain explicit
  - no parent-verification writes, durable issue writes, learning-item writes,
    or mastery updates were introduced
  - no route-local analysis ownership or retired runtime assumptions were
    reintroduced
- Stage `3A` QA evidence:
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:ambiguous-mapping-regression`
    - `writing-engine-stage2c-ambiguous-mapping-regression: ok`
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:word-complexity-regression`
    - `writing-engine-stage2e-word-complexity-regression: ok`
  - `npm run writing-engine:similar-practice-regression`
    - `writing-engine-stage2f-similar-practice-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `3A` residual risks:
  - no contract drift was found in `Stage 3A`
- Stage `3B` implementation status:
  - complete
  - shared `parent_verifications` persistence now accepts `Stage 3A`
    authentic-writing spelling hypotheses only
  - original suggestion truth remains auditable alongside parent-verified truth
  - supported outcomes are `accepted`, `overridden`, `false_positive`, and
    `not_a_learning_issue`
  - authentic-writing provenance is preserved through
    `sourceRef.taskSubmissionId`, `sourceRef.writingSampleId`, source-span
    metadata, target text, and child-attempt text
  - invalid decision / override combinations now fail explicitly before
    persistence
  - no write path was introduced outside canonical `parent_verifications`
  - no `writing_issues`, `learning_items`, `learning_item_evidence`, or
    mastery updates were added in this pass
  - no route-local verification ownership or parallel verification store was
    introduced
- Stage `3B` QA evidence:
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:ambiguous-mapping-regression`
    - `writing-engine-stage2c-ambiguous-mapping-regression: ok`
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:word-complexity-regression`
    - `writing-engine-stage2e-word-complexity-regression: ok`
  - `npm run writing-engine:similar-practice-regression`
    - `writing-engine-stage2f-similar-practice-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `3B` residual risks:
  - no contract drift was found in `Stage 3B`
- Stage `3C` implementation status:
  - complete
  - accepted and overridden authentic-writing verified outcomes can now be
    promoted into canonical durable `writing_issues`
  - durable issue truth preserves original suggestion truth,
    parent-verified educational truth, and authentic-writing submission
    provenance
  - `false_positive` and `not_a_learning_issue` outcomes remain auditable
    without creating durable issue truth
  - missing verified lineage required for durable issue truth now fails
    explicitly rather than creating partial issue records
  - no write path outside canonical durable issue storage was introduced
  - no mastery, `learning_items`, `learning_item_evidence`, reward, or
    analytics mutation was added in this pass
  - no route-local issue orchestration or parallel durable issue lifecycle was
    introduced
- Stage `3C` QA evidence:
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:ambiguous-mapping-regression`
    - `writing-engine-stage2c-ambiguous-mapping-regression: ok`
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:word-complexity-regression`
    - `writing-engine-stage2e-word-complexity-regression: ok`
  - `npm run writing-engine:similar-practice-regression`
    - `writing-engine-stage2f-similar-practice-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `3C` residual risks:
  - no contract drift was found in `Stage 3C`
- Parent Stage `3` closeout status:
  - `Stage 3` is complete
  - `Stage 3` fulfilled its intended purpose:
    - shared authentic-writing submission-analysis path established
    - spelling-only candidate generation proven
    - parent verification persisted canonically
    - accepted and overridden verified outcomes bridged into durable
      `writing_issues`
    - rejected outcomes remained auditable without fake durable issue truth
    - no parallel verification or issue-history model was introduced
    - no mastery, `learning_items`, `learning_item_evidence`, reward, or
      analytics mutation was introduced in `Stage 3`
- Parent Stage `3` QA evidence:
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:ambiguous-mapping-regression`
    - `writing-engine-stage2c-ambiguous-mapping-regression: ok`
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:word-complexity-regression`
    - `writing-engine-stage2e-word-complexity-regression: ok`
  - `npm run writing-engine:similar-practice-regression`
    - `writing-engine-stage2f-similar-practice-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Parent Stage `3` residual risks:
  - no contract drift was found in `Stage 3`
- Stage `4` documentation pass is now complete:
  - canonical docs now define for Stage `4`:
    - the stage goal
    - the punctuation-only behaviour contract
    - architecture boundaries
    - non-goals
    - acceptance criteria
    - QA requirements
    - the boundary with Stage `5`
  - parent `Stage 4` is intentionally broken into bounded mini-tasks before
    code:
    - `4A` punctuation hypothesis generation from authentic-writing inputs
    - `4B` shared parent verification reuse for punctuation hypotheses
    - `4C` verified punctuation outcome bridge into durable issue truth
- Stage `4A` implementation status:
  - complete
  - punctuation-only authentic-writing candidate hypothesis generation now
    exists under the shared Writing Engine boundary
  - Stage `4A` reuses the canonical authentic-writing source normalization and
    source provenance path established by Stage `3A`
  - supported punctuation-only cases now produce shared candidate hypotheses
    with preserved canonical source lineage
  - source span and target text are preserved where available in source-ref
    metadata
  - deterministic repeated output is now covered for the same canonical input
  - explicit unresolved outcomes now cover:
    - unsupported punctuation patterns
    - cases requiring sentence-boundary semantics
    - cases requiring grammar/usage semantics
  - no parent-verification writes, durable issue writes, mastery updates,
    `learning_items`, `learning_item_evidence`, or `assignment_items` writes
    were introduced
  - no route-local ownership, retired spelling runtime ownership,
    sentence-boundary logic, grammar broadening, or external API dependency
    was introduced
- Stage `4A` QA evidence:
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `4A` residual risks:
  - Stage `4A` intentionally leaves punctuation taxonomy resolution for later
    bounded passes
  - Stage `4A` intentionally leaves shared parent verification for `Stage 4B`
  - Stage `4A` intentionally leaves durable issue promotion for `Stage 4C`
  - cases that depend on sentence-boundary or grammar semantics remain
    explicit unresolved outcomes rather than inferred classifications
  - coverage is regression-based rather than DB-backed or app-triggered
- Stage `4B` implementation status:
  - complete
  - shared parent-verification persistence now exists for `Stage 4A`
    punctuation authentic-writing hypotheses through the existing
    `parent_verifications` contract
  - `Stage 4B` reuses the existing authentic-writing verification invariants
    established by `Stage 3B`
  - supported parent decisions are now bounded to:
    - `accepted`
    - `overridden`
    - `false_positive`
    - `not_a_learning_issue`
  - original suggestion truth and parent-verified truth are both preserved on
    the shared verification result shape
  - canonical `task_submission` / `writing_sample` lineage and punctuation
    source span / target text metadata are preserved into parent verification
  - no durable `writing_issues`, `writing_issue_suggestions`,
    `learning_items`, `learning_item_evidence`, or mastery writes were
    introduced
  - no route-local verification ownership, parallel verification store,
    sentence-boundary logic, grammar broadening, or external API dependency
    was introduced
- Stage `4B` QA evidence:
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `4B` residual risks:
  - Stage `4B` intentionally leaves durable punctuation issue promotion for
    `Stage 4C`
  - accepted punctuation verifications can preserve null educational
    classification fields when the `Stage 4A` hypothesis did not assign them
  - sentence-boundary and grammar-dependent punctuation cases remain outside
    `Stage 4B` and must not be verified here
  - coverage is regression-based rather than DB-backed or app-triggered
- Stage `4C` implementation status:
  - complete
  - the verified punctuation outcome bridge now connects bounded `Stage 4B`
    punctuation authentic-writing outcomes into the existing durable
    `writing_issue` lifecycle
  - `Stage 4C` reuses the existing shared `writing_issues` ownership path and
    does not introduce a punctuation-only issue store
  - only promotable `accepted` and `overridden` punctuation outcomes can create
    durable issue truth
  - `false_positive` and `not_a_learning_issue` outcomes remain auditable and
    do not create durable `writing_issues`
  - original suggestion truth, parent-verified truth, canonical
    `task_submission` / `writing_sample` lineage, and punctuation source span /
    target text metadata are preserved into durable issue metadata
  - invalid promotable shapes such as missing verified micro-skill truth or
    missing preserved lineage now fail explicitly rather than creating partial
    durable issue records
  - no `learning_items`, `learning_item_evidence`, mastery updates,
    assignment/reward/UI/server-action work, sentence-boundary logic, grammar
    broadening, route-local issue ownership, or external API dependency was
    introduced
- Stage `4C` QA evidence:
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `4C` residual risks:
  - accepted punctuation outcomes still require resolved educational truth to
    be promotable; unresolved accepted shapes fail explicitly rather than
    silently degrading
  - coverage is regression-based rather than DB-backed or app-triggered
  - sentence-boundary and grammar-dependent punctuation cases remain outside
    parent `Stage 4` and must not be promoted here
- Parent Stage `4` is now complete for its documented punctuation-only scope
- Stage `5` documentation pass is now complete:
  - canonical docs now define for Stage `5`:
    - the stage goal
    - the sentence-boundary behaviour contract
    - architecture boundaries
    - non-goals
    - acceptance criteria
    - QA requirements
    - the boundary with Stage `6`
  - parent `Stage 5` is intentionally broken into bounded mini-tasks before
    code:
    - `5A` sentence-boundary candidate hypothesis generation from
      authentic-writing inputs
    - `5B` shared parent verification reuse for sentence-boundary hypotheses
    - `5C` verified sentence-boundary outcome bridge into durable issue truth
- Stage `5A` implementation status:
  - complete
  - bounded sentence-boundary / sentence-formation candidate hypothesis
    generation now exists under the shared Writing Engine boundary
  - `Stage 5A` reuses the canonical authentic-writing source normalization and
    source provenance path established by `Stage 3A` and reused by `Stage 4A`
  - supported bounded sentence-boundary cases now produce shared candidate
    hypotheses for:
    - missing sentence-ending punctuation
    - missing space after sentence-ending punctuation
    - sentence-start capitalization gaps
  - source span, target text, and context metadata are preserved where
    available in source-ref metadata
  - explicit unresolved outcomes now cover:
    - unsupported sentence-boundary patterns
    - cases requiring grammar semantics
    - cases requiring broad proofreading semantics
  - no parent-verification writes, durable issue writes, mastery updates,
    `learning_items`, `learning_item_evidence`, or `assignment_items` writes
    were introduced
  - no route-local ownership, retired spelling runtime ownership,
    grammar/proofreading ownership broadening, or external API dependency was
    introduced
- Stage `5A` QA evidence:
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `5A` residual risks:
  - category, micro-skill, and template truth remain intentionally unresolved
    in this bounded pass
  - sentence-boundary verification remains intentionally deferred to `Stage 5B`
  - durable sentence-boundary issue promotion remains intentionally deferred to
    `Stage 5C`
  - coverage is regression-based rather than DB-backed or app-triggered
- Stage `5B` implementation status:
  - complete
  - shared `parent_verifications` persistence now exists for `Stage 5A`
    sentence-boundary authentic-writing hypotheses through the existing
    `parent_verifications` contract
  - `Stage 5B` reuses the existing manual-diagnostic, authentic-writing, and
    punctuation verification invariants established by `Stage 1B`, `Stage 3B`,
    and `Stage 4B`
  - supported parent decisions are now bounded to:
    - `accepted`
    - `overridden`
    - `false_positive`
    - `not_a_learning_issue`
  - original suggestion truth and parent-verified truth are both preserved on
    the shared verification result shape
  - canonical `task_submission` / `writing_sample` lineage and
    sentence-boundary source span / target text metadata are preserved into
    parent verification
  - no durable `writing_issues`, `learning_items`,
    `learning_item_evidence`, `assignment_items`, or mastery writes were
    introduced
  - no route-local verification ownership, parallel verification store,
    grammar/proofreading verification ownership, or external API dependency
    was introduced
- Stage `5B` QA evidence:
  - `npm run writing-engine:sentence-boundary-verification-regression`
    - `writing-engine-stage5b-sentence-boundary-verification-regression: ok`
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `5B` residual risks:
  - accepted sentence-boundary verifications can still preserve null
    educational classification fields because `Stage 5A` intentionally leaves
    category, mini-skill, and template truth unresolved
  - durable sentence-boundary issue promotion remains intentionally deferred to
    `Stage 5C`
  - coverage is regression-based rather than DB-backed or app-triggered
- Stage `5C` implementation status:
  - complete
  - verified sentence-boundary authentic-writing outcomes now bridge into the
    existing shared durable `writing_issues` lifecycle without introducing a
    new issue model
  - only `accepted` and `overridden` verified outcomes can create durable issue
    truth
  - `false_positive` and `not_a_learning_issue` remain auditable and do not
    create durable `writing_issues`
  - original suggestion truth and parent-verified educational truth are both
    preserved in durable issue metadata
  - canonical `task_submission` / `writing_sample` lineage and
    sentence-boundary source span / target text metadata are preserved into
    durable issue records
  - missing task-submission lineage, missing source-span lineage, missing
    preserved target text, and missing verified micro-skill truth now fail
    explicitly rather than creating partial durable issue records
  - no `learning_items`, `learning_item_evidence`, `assignment_items`, mastery,
    route-local ownership, grammar/proofreading ownership broadening, or
    parallel issue-history storage were introduced
- Stage `5C` QA evidence:
  - `npm run writing-engine:sentence-boundary-issue-promotion-regression`
    - `writing-engine-stage5c-sentence-boundary-issue-promotion-regression: ok`
  - `npm run writing-engine:sentence-boundary-verification-regression`
    - `writing-engine-stage5b-sentence-boundary-verification-regression: ok`
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `5C` residual risks:
  - accepted outcomes still depend on upstream educational truth being present;
    because `Stage 5A` intentionally leaves educational truth unresolved,
    accepted outcomes without verified or suggested micro-skill truth fail
    explicitly instead of promoting
  - coverage is regression-based rather than DB-backed or app-triggered
- Parent Stage `5` closeout status:
  - `Stage 5` is complete for its documented `5A` / `5B` / `5C` contract only
  - together, `Stage 5A`, `Stage 5B`, and `Stage 5C` now guarantee:
    - bounded sentence-boundary / sentence-formation candidate hypothesis
      generation from canonical authentic-writing inputs
    - shared parent-verification persistence for bounded sentence-boundary
      hypotheses
    - bounded durable issue promotion for accepted and overridden
      sentence-boundary outcomes through the existing shared `writing_issues`
      lifecycle
    - preserved canonical distinction between candidate-hypothesis truth,
      parent-verified truth, durable issue truth, and future active
      `learning_item` truth
- Parent Stage `5` boundaries remained intact:
  - shared Writing Engine ownership only
  - canonical authentic-writing provenance preserved
  - no undocumented route-local ownership
  - no grammar/proofreading broadening
  - no free-text taxonomy invention
  - no external API/model truth ownership
  - no `learning_items`, `learning_item_evidence`, or `assignment_items`
    writes beyond documented Stage `5` boundaries
  - no mastery/evidence writes beyond documented Stage `5` boundaries
  - no reward-system changes
  - no revival of `word_progress` or retired spelling runtime ownership
- Parent Stage `5` QA evidence summary:
  - focused `5A`, `5B`, and `5C` regressions passed
  - upstream shared regression suites for `Stage 1B`, `Stage 3A` / `3B` /
    `3C`, and `Stage 4A` / `4B` / `4C` passed
  - `npx tsc --noEmit` passed with exit code `0` and no output
- Parent Stage `5` residual risks:
  - `Stage 5` remains intentionally bounded; broader grammar/usage and
    proofreading ownership remain deferred to `Stage 6`
  - some accepted outcomes still depend on upstream educational truth being
    present because `Stage 5A` intentionally leaves category, mini-skill, and
    template truth unresolved in bounded cases
  - coverage is regression-based rather than DB-backed or app-triggered
- Parent Stage `5` boundary to the next stage:
  - `Stage 5` ends at sentence-boundary / sentence-formation authentic-writing
    issue handling
  - `Stage 6` remains the next boundary for grammar/usage work, broad
    proofreading/editing work, richer transfer evidence flows, and broader
    analytics/calibration
- next safe task after parent `Stage 5` closeout is documentation-first
  preparation for `Stage 6`

### Stage 2 documentation gate
- Stage `2` is now documented as a spelling content-foundation stage rather
  than a broad implementation placeholder
- canonical docs now define for Stage `2`:
  - the stage goal
  - the behaviour contract
  - architecture boundaries
  - non-goals
  - acceptance criteria
  - QA requirements
  - the boundary with Stage `3`
- parent `Stage 2` is now complete in this status file after bounded `2A`
  through `2F` closeout

### Stage 2 planned mini-tasks
- `2A` Canonical spelling-content source audit and resolver boundary
  - complete
- `2B` Error-category vocabulary contract
  - complete
- `2C` Word-to-mini-skill mapping resolver
  - broken into bounded mini-tasks before implementation
- `2D` Thin lesson-template registry
- `2E` Word complexity metadata resolver
- `2F` Similar-practice support resolver
- Stage `2A` delivered:
  - shared read-only spelling-content source audit
  - explicit `confirmed_canonical` / `candidate_only` /
    `unavailable_not_yet_canonical` source statuses
- Stage `2B` delivered:
  - finite canonical spelling error-category vocabulary
  - stable implementation-facing category codes and labels
  - deterministic normalization for current runtime category inputs
  - bounded alias handling for current runtime label variants
  - explicit missing/unknown category handling
- Stage `2B` QA evidence:
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2` residual risks after `2B`:
  - word-to-mini-skill mapping remains `candidate_only` until `2C`
  - similar-practice candidates remain `candidate_only`
  - word complexity metadata remained `unavailable_not_yet_canonical` until
    `2E`
  - broader cross-system adoption of the canonical category vocabulary remains
    future work
- Stage `2C` planned mini-tasks:
  - `2C.A` Canonical mapping source confirmation and boundary
    - complete
  - `2C.B` Deterministic primary mapping resolver
    - complete
  - `2C.C` Ambiguous mapping handling and closeout QA
    - complete
- Stage `2C.A` delivered:
  - a shared read-only word-to-mini-skill mapping source audit boundary
  - explicit `canonical` / `candidate_only` / `blocked` source classification
  - confirmed `micro_skill_catalog` as the only Stage `2` mini-skill identity anchor
  - read-only exposure of catalog word-list mapping candidates without promoting
    them to canonical mapping truth
- Stage `2C.A` QA evidence:
  - `npm run writing-engine:mapping-source-regression`
    - `writing-engine-stage2c-mapping-source-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2C.B` delivered:
  - deterministic primary word-to-mini-skill resolution from the bounded
    `2C.A` catalog-word candidate boundary
  - one primary `micro_skill_key` only
  - explicit unresolved results for:
    - missing words
    - out-of-scope boundaries
    - unavailable candidate words
    - unmapped words
  - no free-text `micro_skill_key` invention
- Stage `2C.B` QA evidence:
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:mapping-source-regression`
    - `writing-engine-stage2c-mapping-source-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2C.B` residual risks:
  - the resolver is intentionally bounded to exact normalized word matching
    against `2C.A` catalog candidate words; that is correct for `2C.B`, but
    ambiguity handling is still deferred to `2C.C`
  - mapping truth is still not promoted beyond what `2C.A` allows; the
    resolver returns catalog-owned keys only from the bounded candidate
    boundary, so broader canonical mapping truth remains future work
  - candidate-word coverage is only as complete as the currently exposed
    catalog metadata; missing candidate words correctly return explicit
    unresolved results rather than inferred mappings
- Stage `2C.C` delivered:
  - explicit ambiguous mapping outcomes
  - explicit unresolved / unavailable outcomes
  - no guessed `micro_skill_key` values
  - read-only bounded mapping closeout for the first Stage `2C` pass
- Stage `2C.C` QA evidence:
  - `npm run writing-engine:ambiguous-mapping-regression`
    - `writing-engine-stage2c-ambiguous-mapping-regression: ok`
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:mapping-source-regression`
    - `writing-engine-stage2c-mapping-source-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2C` is now complete:
  - `2C.A` complete
  - `2C.B` complete
  - `2C.C` complete
- Stage `2C` residual risks after closeout:
  - mapping truth is still intentionally bounded by `2C.A` candidate-only
    sources; `2C.C` adds explicit ambiguity handling without promoting broader
    canonical mapping truth
  - ambiguity handling is limited to exact normalized word overlap across
    bounded catalog candidate sources; that is appropriate for `2C.C`, but
    broader product adoption or richer disambiguation remains future work
  - candidate-word coverage is still limited by currently exposed catalog
    metadata, so missing coverage continues to surface as explicit unresolved
    outcomes rather than inferred mappings
- next safe implementation task is `2D`
- Stage `2D` documentation gate is now explicit:
  - goal:
    - define a thin deterministic lesson-template registry for spelling
  - behaviour contract:
    - stable template keys
    - deterministic lookup from canonical spelling-content truth
    - explicit missing-template outcomes
  - architecture boundary:
    - shared read-only lookup under `lib/writing-engine`
    - no assignment ownership rewrite
    - no route-local lesson source of truth
  - non-goals:
    - no lesson rendering system
    - no persistence/schema work
    - no reward/mastery/verification changes
  - implementation may proceed only within that bounded contract
- Stage `2D` is now complete:
  - stable implementation-facing spelling lesson-template keys are normalized
    from canonical catalog-backed template fields
  - deterministic read-only lesson-template lookup now exists under the shared
    `lib/writing-engine` boundary
  - supported spelling mini-skills now resolve deterministically to allowed
    template keys through the shared registry
  - explicit unresolved outcomes now cover:
    - missing template registry candidates
    - preferred template key unavailable
    - dictation template key unavailable
  - missing template truth now returns explicit unresolved outcomes in the
    registry layer instead of inventing fallback content
  - existing Stage `1D` assignment generation now consumes the shared lookup
    boundary without changing assignment ownership or duplicate identity rules
  - the same canonical input resolves to the same template outcome across
    repeated runs
  - no new canonical source of truth, route owner, or authored lesson system
    was introduced
- Stage `2D` QA evidence:
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2D` residual risks:
  - the registry is intentionally thin and read-only, so it depends on
    catalog-backed template quality and coverage in `micro_skill_catalog`
  - for Stage `1D` consumers, unresolved registry outcomes are still collapsed
    into the pre-existing assignment skip `missing_template_key`; that
    preserves Stage `1D` behavior, but richer unresolved-reason surfacing
    would need a docs-first pass later
  - regression coverage is good for normalization, determinism, and unresolved
    outcomes, but it remains fixture-based rather than DB-backed
- next safe implementation task is now `2E`
- Stage `2E` documentation gate is now explicit:
  - goal:
    - define a bounded read-only word complexity metadata resolver for spelling
  - behaviour contract:
    - stable complexity metadata shape
    - deterministic lookup from canonical spelling-content truth
    - explicit unknown / unavailable outcomes
  - architecture boundary:
    - shared read-only lookup under `lib/writing-engine`
    - no mastery scoring recalibration
    - no route-local complexity source of truth
  - non-goals:
    - no promotion/demotion logic
    - no analytics dashboard work
    - no persistence/schema work
  - implementation may proceed only within that bounded contract
- Stage `2E` is now complete:
  - stable implementation-facing spelling word complexity metadata now
    normalizes curated starter-word-bank difficulty into bounded complexity
    bands
  - deterministic read-only word complexity lookup now exists under the shared
    `lib/writing-engine` boundary
  - explicit unresolved outcomes now cover:
    - missing word
    - out-of-scope boundary
    - complexity metadata unavailable
    - unknown word complexity
  - complexity metadata remains descriptive content truth and does not change
    mastery scoring, stage gates, promotion logic, or assignment identity
  - no new canonical source of truth, external dependency, or analytics/rendering
    owner was introduced
- Stage `2E` QA evidence:
  - `npm run writing-engine:word-complexity-regression`
    - `writing-engine-stage2e-word-complexity-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2E` residual risks:
  - the resolver is intentionally bounded to curated starter-word-bank
    difficulty and does not yet broaden into richer lexical complexity sources
  - words outside curated starter-word difficulty coverage remain explicit
    unresolved outcomes rather than heuristic fallbacks
  - regression coverage is good for normalization, determinism, and unresolved
    outcomes, but it remains fixture-based rather than DB-backed
  - import-direction purity was validated by inspection rather than a
    dedicated automated regression
  - there is no dedicated regression asserting the Stage `2A` source-audit
    `sourceRefs` for complexity metadata, though resolver behavior itself is
    covered
- next safe implementation task is now `2F`
- Stage `2F` documentation gate is now explicit:
  - goal:
    - define a bounded read-only similar-practice support resolver for spelling
  - behaviour contract:
    - stable similar-practice input/output shape
    - deterministic lookup from canonical spelling-content truth
    - explicit under-populated / unavailable outcomes
  - architecture boundary:
    - shared read-only lookup under `lib/writing-engine`
    - no assignment routing change
    - no route-local similar-practice source of truth
  - non-goals:
    - no adaptive recommendation engine
    - no cross-learning-item batching
    - no persistence/schema work
  - implementation may proceed only within that bounded contract
- Stage `2F` is now implemented:
  - stable implementation-facing similar-practice resolution now exists under
    the shared `lib/writing-engine` spelling boundary
  - catalog-backed starter-word-bank and example-word content now resolve
    deterministically into ordered similar-practice support words
  - explicit unresolved outcomes now cover:
    - missing word
    - out-of-scope boundary
    - similar-practice unavailable
    - unsupported anchor word
    - under-populated similar practice
  - similar-practice support remains read-only curated content truth and does
    not change assignment routing, assignment ownership, mastery/evidence
    semantics, persistence/schema, UI, or external dependency ownership
  - no new canonical source of truth, adaptive recommendation layer, or
    route-local ownership was introduced
- Stage `2F` tests run:
  - `npm run writing-engine:similar-practice-regression`
  - `npm run writing-engine:spelling-content-regression`
  - `npm run writing-engine:lesson-template-regression`
  - `npm run writing-engine:assignment-generation-regression`
  - `npx tsc --noEmit`
- Stage `2F` passed QA:
  - the shared similar-practice resolver is read-only
  - it uses only the canonical catalog-backed starter-word-bank and
    example-word sources exposed through the Stage `2A` boundary
  - deterministic ordered outputs were confirmed for the same canonical inputs
  - explicit unresolved outcomes were confirmed instead of fallback suggestions
  - no adaptive recommendation logic, duplicate source-of-truth behavior, or
    route-local ownership was introduced
  - import direction was validated as shared-boundary only
- Stage `2F` residual risks:
  - the resolver is intentionally bounded to catalog-backed starter-word-bank
    and example-word coverage and does not yet broaden into richer
    similar-practice relationship sources
  - unsupported anchor words and sparsely populated catalogs remain explicit
    unresolved outcomes rather than inferred support suggestions
  - regression coverage is good for deterministic ordering and under-populated
    outcomes, but it remains fixture-based rather than DB-backed
  - import-direction purity was validated by inspection rather than a
    dedicated automated regression
  - there is no dedicated Stage `2F` mutation-safety regression on the
    resolver output itself, though the underlying Stage `2A` source boundary
    already has alias/mutation coverage
- Parent Stage `2` is now complete
- next safe task is a documentation-first preparation pass for `Stage 3`
- Parent Stage `2` QA evidence:
  - `npm run writing-engine:spelling-content-regression`
  - `npm run writing-engine:error-category-regression`
  - `npm run writing-engine:mapping-source-regression`
  - `npm run writing-engine:primary-mapping-regression`
  - `npm run writing-engine:lesson-template-regression`
  - `npm run writing-engine:word-complexity-regression`
  - `npm run writing-engine:similar-practice-regression`
  - `npm run writing-engine:assignment-generation-regression`
  - `npx tsc --noEmit`
- Parent Stage `2` blockers:
  - none after closeout reconciliation
- Parent Stage `2` non-blocking risks:
  - Stage `2C` mapping remains intentionally bounded by `candidate_only`
    catalog word-list sources
  - `2D`, `2E`, and `2F` rely on bounded catalog-backed coverage and explicit
    unresolved outcomes
  - regression coverage is mostly fixture-based rather than DB-backed
  - some import-direction and mutation-safety checks remain inspection-based
    rather than fully automated
- canonical lesson-submission spelling mapping closeout:
  - `Canonical Lesson Submission Spelling Mapping Slice 1` is now complete
  - this slice remains outside Stage `7F` behaviour work and outside Stage `8`
    mastery/runtime work
  - this completion currently describes the canonical docs boundary; it must
    not be treated as a fully reconciled tracked-runtime baseline until the
    repo state is explicitly checked in and aligned with the closeout
  - the implemented bounded canonical mapping rule is:
    - lesson/task-submission backed spelling suggestions only
    - submission-backed `misspelling_instance` lineage only
    - use normalized `suggested_replacement`
    - exact deterministic matching only
    - resolve only when exactly one active assignable `D4`
      `micro_skill_catalog` row matches
    - allowed catalog fields only:
      - `metadata.starter_word_bank`
      - `metadata.example_words`
      - `metadata.contrast_word_bank`
  - creation-time population is now supported for eligible new
    submission-backed spelling suggestions
  - bounded backfill is now supported for existing pending unverified
    submission-backed spelling suggestions whose `suggested_micro_skill_key`
    is null, empty, or `unknown`
  - manual writing samples remain excluded
  - ambiguous, unmapped, inactive, non-assignable, out-of-coverage, and
    otherwise ineligible cases remain unresolved
  - `allowsAccepted` and server-side accepted-decision validation remain
    preserved
  - `micro_skill_catalog` remains the only micro-skill identity source
  - no mastery/evidence, assignment, reward, analytics, queue, or archive
    writes were introduced
  - manual QA supplied by Lee passed:
    - positive:
      - `mony -> money`
      - `storry -> story`
      - `ceeling -> ceiling`
    - negative:
      - `plai -> play`
      - `buisness -> business`
      - `rane -> ran`
    - persisted/backfilled example:
      - `mony -> money` stored `D4_PG_LONG_EE_EY`
      - mapping metadata recorded `source = micro_skill_catalog_word_lists`
      - mapping metadata recorded `status = resolved`
      - mapping metadata recorded
        `rule_version = canonical_submission_spelling_mapping_slice1_v1`
    - parent verification examples:
      - `mony -> money` recorded `decision = accepted`
      - `storry -> story` recorded `decision = not_a_learning_issue`
  - lint caveat:
    - `npm run lint` remains blocked by pre-existing repo-wide lint debt
      rather than this slice
  - residual risks:
    - rows seeded outside the allowed catalog metadata fields remain
      unresolved by design
    - existing lesson misspellings with no persisted suggestion row may rely
      on read-time canonical mapping until a review action creates or touches
      a real suggestion row
    - if accepted/rejected parent-verification decisions are still counted as
      unresolved because `writing_issue_suggestions.suggestion_status`
      remains `pending`, that is a separate `Review Work`
      read-model/status reconciliation issue rather than a mapping-slice bug
  - boundary registration:
    - `Accept` readiness and override-option population are separate follow-up
      concerns
    - the bounded lesson-submission spelling mapping slice covers `Accept`
      readiness only
    - this bounded `Accept`-readiness slice is now implemented and validated
      for lesson/task-submission-backed spelling suggestions only
    - `Accept` is surfaced only when canonical micro-skill truth is present,
      deterministic, active/assignable, and non-`unknown`
    - override-option population is not yet implementation-ready here and
      remains separate catalog-option-provider debt
    - if a later implementation slice is authorized, the smallest safe slice
      is bounded lesson-submission spelling `Accept` readiness only
  - explicitly blocked from this bounded slice:
    - manual writing samples
    - unresolved suggestions
    - ambiguous matches
    - inactive matches
    - non-assignable matches
    - out-of-scope matches
  - unchanged by this bounded slice:
    - no Review Work workflow changes
    - no mastery, assignment, reward, scoring, thresholds, persistence,
      analytics, or positive-evidence logic changes
  - validation recorded for the bounded slice:
    - `npx tsc --noEmit`
    - `npm run writing-engine:mapping-source-regression`
    - `npm run writing-engine:primary-mapping-regression`
    - `npm run writing-engine:ambiguous-mapping-regression`
    - `npm run writing-engine:authentic-submission-regression`
    - `npm run writing-engine:authentic-verification-regression`
  - next safe work area after this closeout:
    - docs-first override-option provider planning/audit pass
    - not override-option implementation
- docs-only registration now defines that next safe slice:
  - `Review Work Suggested Issue override-option provider`
- closeout status:
  - selectable override-provider UI/runtime remains deferred
  - existing server-side override behavior is covered by the tracked
    override-provider behavior regression
  - no stale source-level override-provider harness is part of the current
    runtime or validation record
- deferred selectable-provider scope:
  - lesson/task-submission-backed spelling suggestions only
  - `verified_micro_skill_key` provider first
  - `verified_category_code` remains the existing fixed option set
  - `verification_note` remains free-text audit text
- canonical-source rule for any future selectable-provider slice:
  - `micro_skill_catalog` remains the only mini-skill identity source
  - options must come through a bounded provider/read model rather than
    unrestricted catalog browsing
- provider restrictions for any future selectable-provider slice:
  - only active, assignable, in-scope spelling micro-skills may be offered
  - no ambiguous, inactive, non-assignable, out-of-scope, fallback, or
    free-text options
- template rule:
  - template routing is micro-skill-owned, not word-owned
  - Review Work should verify the micro-skill and derive template routing from
    that verified micro-skill's configured template metadata
  - accepted suggestions use the suggested canonical micro-skill's configured
    template route
  - overridden suggestions use the verified replacement micro-skill's
    configured template route
  - `verified_template_key` remains deferred/blocked in Review Work for this
    stage
  - template free text is not authorized
  - no parent-facing template dropdown/provider implementation is authorized
    now
- blocked cases for selectable-provider UI/runtime:
  - manual writing samples
  - ambiguous matches
  - unmapped suggestions
  - inactive catalog rows
  - non-assignable catalog rows
  - out-of-scope micro-skills
  - generic/global catalog browsing
- unchanged by this registration:
  - no Review Work workflow change
  - no `Accept` gating change
  - no server-side validation weakening
  - no mastery, assignment, reward, scoring, thresholds, persistence,
    analytics, or positive-evidence logic change
- validation recorded for this bounded slice:
  - `npx tsc --noEmit`
  - `npm run writing-engine:review-work-override-provider-behavior-regression`
- still deferred after this closeout:
  - selectable override-provider UI/runtime
  - any separately authorized future template-choice UI, if ever needed, must
    be bounded to the verified micro-skill's allowed template metadata
  - manual writing sample override-provider expansion
- docs-only registration now defines the next safe template slice:
  - `Review Work Read-Only Derived Template Metadata`
- registered template-display boundary:
  - read-only display only
  - Review Work continues to verify micro-skill truth only
  - template metadata derives from the canonical/verified micro-skill, not
    word by word
  - no editable `verified_template_key`
  - no template dropdown/provider
  - no free-text template key
  - no global template browsing
  - no independent template truth persisted from Review Work
- registered derivation rules:
  - accepted/shared canonical spelling suggestions derive from the suggested
    canonical micro-skill
  - overridden suggestions derive from the verified replacement micro-skill
  - derivation may use only Stage 2A/2D template registry truth rooted in the
    micro-skill
- registered blocked cases:
  - manual writing samples
  - missing deterministic canonical micro-skill truth
  - unresolved template registry cases
  - word-by-word template assignment
  - parent-editable template fields
  - template dropdown/provider
  - global template browsing
- registered unresolved-display rule:
  - unresolved template metadata must display as read-only
    unavailable/deferred messaging, not as an input
- closeout status:
  - implementation complete for the bounded read-only slice
  - automated QA passed
  - engineering integration QA passed
  - no automated/source-level regressions were found
- implemented template-display scope:
  - read-only derived template metadata is live for Review Work
    lesson/task-submission spelling items
  - template routing remains micro-skill-owned, not word-owned
  - accepted/shared canonical spelling suggestions derive from the suggested
    canonical micro-skill
  - overridden verification rows derive from the verified replacement
    micro-skill
  - unresolved template metadata renders as read-only
    unavailable/deferred messaging
- still blocked after this closeout:
  - `verified_template_key` remains blocked as an editable Review Work field
  - no template dropdown/provider was introduced
  - manual writing samples remain out of scope for derived template display
  - no `Accept` or Review Work workflow semantics changed
- remaining recorded human/manual sweep item:
  - mapped lesson-submission spelling issue
  - unresolved lesson-submission spelling issue
  - recorded overridden verification
  - manual writing sample
- Review Work should not be reopened unless that manual sweep finds a bug or a
  later docs-first stage explicitly authorizes new work
- optional future work after closeout:
  - manual writing sample derived-template metadata planning only, if desired
  - parent-verified catalogue candidate capture, if desired
  - otherwise move away from Review Work
- if `2A` cannot confirm a canonical read path for any required Stage `2`
  content type without inventing a new source of truth, implementation must
  stop and return to docs before code

### Stage 1D documentation gate
- canonical docs now define the Stage `1D` implementation boundary before code
  work begins
- the first implementation slice is bounded to spelling `word_practice`
  `controlled_spelling` assignment generation from canonical `learning_items`
- the first implementation slice is read/build only; assignment-item
  persistence is deferred to a later Stage `1D` pass
- the `1D.1` read/build slice is now implemented under the shared
  `lib/writing-engine` boundary with focused regression coverage
- the `1D.2` docs pass is now bounded to:
  - deterministic selection of already-eligible `1D.1` candidates
  - duplicate-safe append into canonical `assignment_items`
  - no UI/server-action flow yet
  - no grouped-set, contrast, dictation, or broader adaptive logic yet
- Stage `1D.2` is now complete:
  - `1D.2A` deterministic candidate ordering is complete
  - `1D.2B` canonical duplicate detection read boundary is complete
  - `1D.2C` duplicate-safe append orchestration is complete
- Stage `1D.2` delivered:
  - deterministic candidate ordering
  - read-only duplicate detection scoped to destination/header and parent
  - duplicate-safe append-only `assignment_items` orchestration
  - duplicate filtering before position assignment
  - second-run idempotence
  - no cross-destination dedupe
- Stage `1D.2` QA evidence:
  - `npm run writing-engine:assignment-generation-regression` passed with
    `writing-engine-stage1d1-assignment-generation-regression: ok`
  - historical `1D.2` QA noted unrelated `learning-items.ts` typecheck debt at
    that time, but current repo truth now passes `npx tsc --noEmit` cleanly
  - QA found no remaining `1D.2C` findings
  - QA found no new typecheck failures tied to:
    - `lib/writing-engine/assignments/service.ts`
    - `lib/writing-engine/persistence/assignment-items.ts`
    - `scripts/writing-engine-stage1d1-assignment-generation-regression.ts`
    - `scripts/writing-engine-stage1a-regression.ts`
- Stage `1D.2` residual risks / follow-up debt:
  - `1D.2` coverage is fixture-based rather than DB-backed
  - future concurrency or transaction optimisation needs a fresh docs review
  - no UI or app-triggered smoke path exists yet by design
- Stage `1D.3` is now complete:
  - `1D.3` is the first grouped-set builder pass after the single-word
    `1D.1`/`1D.2` slice
  - it is limited to spelling `grouped_set_practice`
    `controlled_spelling` items
  - grouped-set prompt content must come from canonical catalog metadata plus
    one evidence-backed anchor word
  - grouped-set candidates must reuse the existing `1D.2` duplicate-safe
    append model
  - contrast, dictation, adaptive routing, and new assignment identity/provenance
    models remain out of scope
- Stage `1D.3` mini-task closeout is now complete:
  - `1D.3A` delivered:
    - grouped-set candidate builder and explicit skip semantics
    - read/build grouped-set support from canonical catalog metadata only
  - `1D.3B` delivered:
    - grouped-set persistence verification through the existing `1D.2`
      duplicate-safe append model unchanged
    - grouped-set first append success
    - grouped-set second-run idempotence
- Stage `1D.3` QA evidence:
  - `npm run writing-engine:assignment-generation-regression` passed with
    `writing-engine-stage1d1-assignment-generation-regression: ok`
  - grouped-set coverage now proves:
    - grouped-set candidate generation succeeds when catalog metadata is
      sufficient
    - grouped words are normalized, deduplicated, and preserve stable first-seen
      catalog order
    - one evidence-backed anchor `targetWord` is preserved
    - grouped-set first append succeeds
    - grouped-set second-run append is idempotent
    - grouped-set duplicate checks still use only the documented canonical
      identity fields
    - grouped-set prompt/answer payload is preserved on append
  - `npx tsc --noEmit` was run after `1D.3B`
  - QA found no new typecheck failures tied to:
    - `lib/writing-engine/assignments/candidates.ts`
    - `lib/writing-engine/assignments/service.ts`
    - `lib/writing-engine/persistence/assignment-items.ts`
    - `scripts/writing-engine-stage1d1-assignment-generation-regression.ts`
- Stage `1D.4` is now complete:
  - `1D.4A` contrast candidate builder and skip semantics are complete
  - `1D.4B` contrast persistence and idempotence verification are complete
- Stage `1D.4` QA evidence now includes:
  - contrast append coverage proves first append success
  - contrast append coverage proves second-run idempotence
  - contrast duplicate checks still use only the documented canonical identity
    fields
- Stage `1D.4` delivered:
  - contrast candidate builder
  - contrast append/idempotence using the existing `1D.2` model
  - no new duplicate model
  - no new provenance model
  - no UI/server actions/rewards/adaptive routing
- Stage `1D.4` tests run:
  - `npm run writing-engine:assignment-generation-regression`
  - `npx tsc --noEmit`
- Stage `1D.4` residual risks:
  - fixture-based coverage rather than DB-backed
  - richer contrast identity would require a docs-first revisit
  - no UI/app-triggered smoke path yet
- Stage `1D.5` is now complete:
  - `1D.5A` delivered the bounded spelling `dictation`
    `controlled_spelling` candidate builder and explicit skip semantics
  - `1D.5B` proved dictation persistence through the existing `1D.2`
    duplicate-safe append model unchanged
  - dictation generation remains bounded to:
    - `domain_module = spelling`
    - `practice_route = dictation`
    - `item_type = controlled_spelling`
  - canonical generation inputs remain:
    - `learning_items`
    - `micro_skill_catalog`
    - `learning_item_evidence`
  - one evidence-backed anchor `target_word` remains the candidate provenance
    anchor and duplicate-check target
  - dictation template selection remains canonical and deterministic for the
    same inputs
  - no audio delivery, browser speech synthesis, sentence batching, adaptive
    routing, rewards, UI/server actions, route-local composition, or
    assignment-header redesign was introduced
- Stage `1D.5` QA evidence:
  - `Stage 1D.5A` passed QA
  - `Stage 1D.5B` passed QA
  - `npm run writing-engine:assignment-generation-regression`
  - `npx tsc --noEmit`
  - first dictation append success is proven
  - second-run dictation idempotence is proven
  - duplicate reuse remains constrained to the unchanged `1D.2` identity
    fields:
    - `learning_item_id`
    - `item_type`
    - `target_word`
    - `template_key`
    - `source_type`
    - `source_entity_id`
  - existing `1D.1` / `1D.2` / `1D.3` / `1D.4` / `1D.5A` behavior remained
    unchanged
- Stage `1D.5` residual risks:
  - fixture-based coverage rather than DB-backed
  - live catalog rows still need real dictation template truth
  - no UI or app-triggered smoke path yet
  - any richer dictation delivery model requires a docs-first revisit
- Parent Stage `1D` is now complete:
  - canonical `learning_items` -> generic `assignment_items` generation exists
  - duplicate-safe append exists
  - bounded supported spelling routes now include:
    - `word_practice`
    - `grouped_set_practice`
    - `contrast_practice`
    - `dictation`
  - no evidence was found of revived `word_progress`, route-local composition,
    fake `writing_issues`, retired spelling runtime ownership, or reward logic
    as mastery truth
- Stage `1` QA closeout evidence:
  - `npm run writing-engine:regression` passed
  - `npm run writing-engine:diagnostic-regression` passed
  - `npm run writing-engine:verification-regression` passed
  - Stage `1C` mastery bridge regression passed
  - `npm run writing-engine:assignment-generation-regression` passed
  - `npx tsc --noEmit` passed
- Parent Stage `1` is now complete for its documented purpose
- `Stage 1D.6` is not currently defined as an active contract stage in the
  canonical docs; treat older mentions as placeholder planning language rather
  than a required Stage `1` follow-up
- Next safe pass after Stage `1` closeout is a documentation-first `Stage 2`
  planning pass

### Stage 1D.3 planned mini-tasks
- `1D.3A` — Grouped-set candidate builder and skip semantics
  - complete
- `1D.3B` — Duplicate-safe grouped-set persistence and regression verification
  - complete

### Stage 1C follow-up debt
- run a live app-triggered Stage `1B` -> `1C` smoke test once a manual
  diagnostic UI or internal trigger exists
- consider first-class origin columns before broader analytics/reporting:
  - `learning_items.source_origin_type`
  - `learning_items.source_parent_verification_id`
- split catalog skip reasons into uncatalogued / inactive / non-assignable when
  catalog diagnostics become important

These are not blockers for Stage `1D`.

### Known risks
- do not let new spelling work recreate route-local domain logic
- do not let legacy assignment-header debt become the new engine anchor
- do not let historical planning docs compete with the active roadmap
- do not let older Level 1–5 shorthand compete with the canonical 0–8
  mastery/evidence contract
- do not let post-Stage `1C` work blur manual diagnostics into authentic-writing
  `writing_issues`

## Stage 1B snapshot

Implemented in Stage `1B` so far:
- `1B.1` deterministic manual spelling diagnostic service under
  `lib/writing-engine/spelling`
- `ManualSpellingDiagnosticResult`
- candidate hypothesis payload using
  `sourceType = "manual_diagnostic"` and
  `sourceRef.sourceType = "manual_diagnostic"`
- diagnostic regression script
- `1B.2` verification orchestration with strict decision semantics
- verification regression script
- `1B.3` persistence through the shared `parent_verifications` contract
- persisted verification preserves original suggestion, parent decision,
  verified truth, and rejected outcomes

Strict verification semantics currently implemented:
- `accepted` cannot include verified override fields
- `overridden` requires at least one changed verified educational field
- note alone does not count as an override
- `false_positive` rejects verified override fields
- `not_a_learning_issue` rejects verified override fields

Stage `1B` remains the persisted manual-diagnostic and verification handoff
layer. Stage `1C` now bridges accepted and overridden verified outcomes into
canonical `learning_items` and `learning_item_evidence` without creating fake
`writing_issues`, without creating `learning_item_issue_links`, and without
reviving `word_progress`.

## Historical note

Detailed slice-by-slice historical sequencing belongs in:

- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)
- historical implementation records under `docs/implementation/completed/`

This file should be updated at major stage checkpoints rather than carrying the
full historical implementation narrative.
