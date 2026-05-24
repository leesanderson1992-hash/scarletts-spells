# Writing Engine Roadmap

## Purpose

This is the single active implementation plan for the Writing Improvement
Engine.

Use it to track:
- the approved stage order
- what each stage must deliver
- the fixed architecture decisions implementation must preserve
- what is deferred until later stages

This file is the active roadmap.

Implementation truth still lives in:
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)

Canonical semantics still defer to:
- [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)
- [docs/architecture/writing-engine-foundation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-foundation.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- [docs/pedagogy/learning-system-overview.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/learning-system-overview.md:1)
- [docs/pedagogy/micro-skill-taxonomy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/micro-skill-taxonomy.md:1)
- [docs/pedagogy/mastery-domain-4-spelling.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/mastery-domain-4-spelling.md:1)

## Global standards

All Writing Engine screens, flows, assignment surfaces, review actions, reward
messages, and progress UI must comply with these standards unless a
Writing-specific UX doc explicitly overrides them:

- [docs/product/ux-standards.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/ux-standards.md:1)
- [docs/product/action-control-standards.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/action-control-standards.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

Implementation prompts for Stage `1A` and later stages must reference these
standards. Action controls must follow the global action-control standards.
Progress and completion semantics must respect the universal progress contract.
Reward language must not equate Gold Bars with canonical parent-facing
`Mastered`. Writing Engine mastery language must defer to the mastery/evidence
contract.

## Fixed implementation decisions

Treat these as fixed unless a later canonical doc changes them:

- the product goal is real writing improvement, not just spelling correction
- the first deep module is spelling, but the engine must later support:
  - punctuation
  - sentence boundaries
  - grammar
  - vocabulary
  - proofreading
  - paragraph revision
  - writing transfer
- the shared domain boundary is `lib/writing-engine`
- the canonical spine remains:
  - `micro_skill_catalog`
  - `learning_items`
  - `learning_item_evidence`
  - `learning_item_issue_links`
  - `writing_issues`
  - `task_submissions`
  - `writing_samples`
- parent verification is required before new diagnostic suggestions update
  mastery
- assignment composition must be generic and must not be word-list-only
- `word_progress` must not be reintroduced as canonical truth
- the retired spelling runtime must not be revived as the delivery model for
  the Writing Engine

## Current repo position

Already implemented:
- shared `lib/writing-engine` contracts and services
- generic `parent_verifications`
- generic `assignment_items`
- stage `1A` retirement of the old spelling-engine runtime surfaces
- shared analysis helpers moved out of route-local `app/analyse`

Current transition reality:
- `learning_items` are canonical active mastery/practice truth
- `daily_assignments` may still exist as legacy header debt, but they are not
  the architecture anchor for new engine work
- `Review Work` is the canonical parent review surface for writing review
- `Add Writing Sample` and compatibility `/analyse` are intake-only entry
  points for parent-entered manual writing samples
- `/analyse/review` is obsolete and unsupported and must not survive as a
  supported route, redirect-owned compatibility surface, or nav target
- lesson submissions and manual writing samples must converge into one
  canonical `Review Work` queue
- the next safe work is bounded `Stage 7` Review Work integration on top of
  existing shared engine outputs rather than new analysis or review semantics

Current ownership rule:
- `Analyse Writing` belongs under `Courses` navigation
- standalone top-level Analyse navigation is not allowed
- Analyse intake does not own verification, mastery, assignment generation,
  rewards, or durable learning effects
- parent verification remains the source of truth
- Stage 8, mastery automation, assignment broadening, rewards, and AI checking
  are out of scope for Analyse Review retirement cleanup

## Stage roadmap

## Registered next bounded stage

### Durable Structured Submission Payloads

Status: `Pass 3 child revisit hydration implemented and QA-passed; approval draft-deletion safety still pending`

Purpose:
- separate mutable structured lesson/test draft state from immutable submitted
  structured attempt evidence
- ensure structured lesson/test answers survive parent approval and child
  revisit
- prevent `task_submission_drafts` from being the only archive of structured
  child answers

Truth model:
- `task_submission_drafts` is mutable working state for autosave,
  in-progress work, and returned-for-correction work
- `task_submissions` is the submitted attempt header, workflow record, and
  flattened readable text representation
- `task_submission_payloads` is durable submitted structured payload
  evidence linked to the submitted attempt

Implemented so far:
- Pass 1 storage foundation is complete:
  - `task_submission_payloads` exists as immutable submitted structured
    evidence storage
  - authenticated access is parent-scoped `SELECT` only
- Pass 2 submit persistence is complete:
  - `submitTaskResponse` still creates the normal `task_submissions` row with
    flattened `submission_text`
  - structured lesson/test submissions immediately persist a durable
    `task_submission_payloads` row before completion, writing sample, reward,
    draft, revalidation, or success-redirect side effects
  - if durable payload persistence fails, the just-created submission is
    rolled back and a visible submit error is returned
  - `payload_json` stores the structured response object, not flattened text
    and not the entire draft payload
  - `lesson` maps to `structured_lesson_response`; `test` maps to
    `structured_test_response`
  - ownership fields are derived from trusted server-side task, child,
    parent, course, and submission context
  - privileged persistence lives in
    `lib/lessons/persistence/submission-payloads.ts`, which imports
    `server-only`, owns service-role writes, maps payload types, and returns a
    typed success/failure result
  - `app/learn/actions.ts` remains the submit orchestration layer and does not
    import `createServiceRoleClient` or insert into `task_submission_payloads`
    directly
  - the full structured lesson/test page remains the preferred path via the
    embedded structured response in `draft_payload`
  - quick-submit compatibility can build a narrow fallback structured payload
    from `lesson_schema + submission_text`, mapped only into the first
    supported text/textarea block; missing, invalid, or unsupported schemas
    produce no durable structured payload
  - plain-writing submit behavior remains unchanged
- Pass 3 child revisit hydration is complete:
  - structured lesson/test revisit now reads
    `task_submission_payloads.payload_json` for the exact latest non-returned
    submission
  - returned/send-back remains draft-first and editable
  - legacy structured rows without durable payload fall back safely instead of
    crashing
  - no submit persistence, parent approval/draft deletion, Review Work,
    admin/catalog-review, resolver, rewards, mastery, scoring, assignments,
    analytics, dashboards, or template-routing behavior changed

Manual smoke:
- actual structured lesson-page submit now creates both `task_submissions` and
  `task_submission_payloads`
- the durable payload remains present after parent approval
- child revisit after parent approval now restores submitted answers from
  durable payload evidence when that payload exists
- returned/send-back, legacy fallback, and plain-writing manual checks passed
- the original visible blank-answer-box bug is fixed for submissions with
  durable payloads

Boundary notes:
- this track is separate from `4E` / `4E.3` resolver integration
- this track does not change admin/catalog-review, manual writing samples,
  mastery, rewards, assignments, scoring, analytics, or template routing
- no hosted historical backfill is authorised in the docs pass
- no implementation may solve the bug by hiding completed lessons or blocking
  child revisit unless a separate product contract explicitly requires it

Implementation sequence:
1. storage foundation only: `complete`
   - add `task_submission_payloads`
   - add conservative RLS and ownership contract
   - add storage/source-contract regression
   - no submit, hydration, or approval runtime changes yet
2. submit persistence: `complete`
   - write the durable payload immediately after `task_submissions` insert
   - roll back the just-created submission if durable payload insert fails
3. child revisit hydration: `complete`
   - draft-first for in-progress and returned work
   - durable submitted payload for pending/approved structured revisit
   - safe legacy fallback for structured submissions without payload
4. approval draft-deletion safety: `future`
   - delete draft only when the structured submitted payload exists
   - preserve vulnerable legacy draft rows when no durable payload exists
5. closeout and regression hardening

Validation evidence for Pass 2:
- `npm run writing-engine:structured-submission-payload-storage-regression`
  passed
- `npm run writing-engine:structured-submission-payload-submit-regression`
  passed
- `npm run writing-engine:structured-submission-payload-hydration-regression`
  passed
- `npx tsc --noEmit` passed
- `npm run build` passed
- `git diff --check` passed
- architecture QA passed after moving privileged persistence into the
  server-only helper
- quick-submit fallback bug was diagnosed and fixed
- Pass 3 manual checks passed for approved revisit, returned/send-back, legacy
  fallback, and plain-writing unchanged

Required regression direction:
- structured lesson/test submit creates durable payload evidence
- payload insert failure prevents successful submit
- child revisit after approval hydrates from durable submitted payload
- approval does not delete the only structured answer source
- returned/send-back remains draft-first with feedback
- plain-writing behavior is unchanged
- legacy structured submissions without payload do not crash

### Parent-Verified Spelling Candidate Capture

Status: `Slice 3 implemented and validated within its bounded lesson-submission scope`

Purpose:
- allow parents to classify unmapped or parent-added spelling mistakes against
  existing canonical micro-skills
- preserve verified event truth
- capture reusable candidate mappings
- keep candidate mappings separate from canonical mapping truth until explicit
  promotion
- prevent free-text taxonomy pollution
- prevent normal parent `Review Work` from creating global canonical truth

Known limitation:
- the child is now producing real writing that includes genuine spelling
  mistakes outside current canonical mapping truth
- parents can review or add those mistakes in `Review Work`, but they cannot
  classify every valid case until the required catalog-backed micro-skill
  exists in the seeded option set
- example:
  - `natral -> natural` may be classified against an existing canonical
    micro-skill only after that canonical micro-skill is available in the
    bounded catalog-backed options

Boundary notes:
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
- `Review Work` remains the canonical parent review surface and must continue
  to reuse shared verification semantics only

Parent-facing workflow to register:
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
6. the candidate mapping remains non-canonical until promoted
7. future suggestions must not use pending candidate mappings

Three-layer truth model:
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
    - future admin/global promoted mappings only if a separate curator workflow
      is later implemented

Planning vocabulary only:
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

Promotion model:
- parent verification may confirm event-level truth and capture a candidate
  mapping, but normal parent review does not itself mint global canonical
  mapping truth
- parent-local promotion is the highest authority authorised in the
  single-child MVP
- for the single-child MVP, explicit parent promotion is enough to make a
  mapping reusable inside the current parent/child environment
- parent-local promoted mappings may be used only within that scoped
  environment
- parent-local promotion must be auditable and reversible
- global canonical promotion remains a separate curator/admin workflow deferred
  from MVP
- no parent action directly writes global canonical mapping truth

Future suggestion resolver rule:
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

First safe runtime scope:
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

Implementation phase breakdown:
- Slice `1` — Documentation registration
  - status: complete
  - purpose:
    - register the boundary
    - align roadmap/status/contracts
    - define evidence/candidate/canonical truth model
    - define parent-local versus global promotion
    - define blocked cases
    - define first runtime scope
  - rules:
    - no runtime code
    - no schema
    - no tests
    - no UI changes
- Slice `2` — Bounded runtime capture for lesson submissions only
  - status: implemented and QA passed
  - allow parent to classify unmapped lesson-submission spelling rows and
    parent-added missed words attached to lesson submissions
  - save verified event truth
  - save separate candidate mapping row
  - candidate mapping remains `pending_parent_promotion`
  - future suggestion resolver must not consult pending candidate mappings
  - allowed:
    - lesson-submission-backed spelling rows only
    - bounded catalog-backed micro-skill selection only
    - candidate mapping creation only
  - forbidden:
    - manual writing sample support
    - parent-local promotion
    - admin/global curation
    - resolver use of pending mappings
    - free-text `micro_skill_key` invention
    - automatic canonical mutation
    - template-key changes
    - reward/mastery/assignment/scoring changes
- Slice `3` — Bounded parent-local promotion
  - status: implemented and validated
  - allow explicit parent promotion of saved candidate mappings
  - make promoted mappings reusable only inside the same parent/child scope
  - update the future suggestion resolver to consult parent-local promoted
    mappings only after existing catalog-backed canonical mapping truth
  - delivered:
    - promote existing `pending_parent_promotion` candidate mappings to
      `parent_local_promoted`
    - revert `parent_local_promoted` mappings back to
      `pending_parent_promotion`
    - keep resolver priority:
      1. existing catalog-backed canonical mapping truth
      2. parent-local promoted mappings in the same parent/child scope
      3. unresolved otherwise
    - keep pending mappings invisible to the resolver
    - keep manual writing samples excluded from promotion/revert UI
  - allowed:
    - parent-local promotion only
    - scoped resolver use
    - audit/reversal support
  - forbidden:
    - global canonical promotion
    - admin/curator workflow
    - shared/global reuse
    - automatic promotion on initial capture
- Slice `4A` — Docs-only catalog-review contract
  - define a parent-raised spelling catalog-gap workflow after Slice `3`
  - parent-facing action label: `No matching skill`
  - helper copy: `Send this spelling case to catalog review.`
  - parent action creates or updates a catalog-review case only
  - parent actions must not create global canonical mappings or new
    micro-skills
  - no runtime, schema, Review Work UI, resolver, mastery, reward,
    assignment, scoring, analytics, or template-routing changes
  - status:
    - authorized for documentation only
- Slice `4B.0` — Bounded micro-skill option filtering
  - status: implemented and QA passed
  - replaces the bulky candidate-capture selector with a compact spelling
    review table
  - table columns:
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
  - Skill Cluster uses existing parent-facing cluster display names and
    filters Micro-skill
  - Micro-skill uses existing parent-facing micro-skill display names
  - final submitted value remains exactly one catalog-backed
    `micro_skill_key`
  - action icons:
    - `X` = false positive
      - tooltip/focus text: `This was not actually wrong.`
    - `!` = not a learning issue
      - tooltip/focus text: `This is not something to practise.`
    - Tick = approve this correction and skill
      - tooltip/focus text: `Approve this correction and skill.`
  - Tick uses existing Review Work verification semantics only
  - Tick must not automatically create global truth or promote parent-local
    mappings for future reuse
  - captured/promoted mapping status may be shown, but promotion/revert remain
    separate Slice `3` behavior
  - the table uses existing active, assignable `D4` `micro_skill_catalog`
    rows for selectable micro-skills and existing family/cluster display
    metadata for parent-facing labels
  - the table does not create micro-skills, allow free-text
    `micro_skill_key`, write canonical truth, change resolver priority, or
    block parent review completion
- Slice `4B.1` — Parent catalog-review case capture
  - status: implemented and QA passed
  - parent `No matching skill` save path for eligible lesson-submission
    spelling rows only
  - creates or updates a `spelling_catalog_review_cases` row only
  - implemented with `captureSpellingCatalogReviewCase`, parent-scoped RLS,
    authenticated parent ownership enforcement, idempotent open-case dedupe,
    compact Review Work `No matching skill` UI/status,
    `Sent to catalog review` saved state, parent-added lesson missed-word
    support, and graceful behavior when the case table is unavailable
  - keeps manual writing samples out of scope
- Slice `4C` — Minimal protected admin review surface
  - first admin place should be introduced only after parent-raised
    catalog-review cases can exist
  - documentation status: unblocked by
    [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
  - status: implemented and QA passed as protected read-only admin triage
  - authenticated parent identity is not admin/internal identity; parent-scoped
    ownership checks and RLS must remain parent-scoped
  - implemented foundation: `/admin` session protection in `proxy.ts`,
    `lib/admin/access.ts`, `lib/supabase/service-role.ts`, and mandatory
    `app/admin/layout.tsx` server-side admin guard
  - route: `/admin/catalog-review` under the implemented admin layout guard
  - admin identity for the private MVP comes from private server-side
    `ADMIN_USER_IDS` and `ADMIN_EMAILS` allowlists; do not use
    `NEXT_PUBLIC_*`, DB admin tables, Supabase custom claims, role-management
    UI, or a separate admin login in Slice `4C`
  - admin read path uses a server-only service-role helper only after admin
    authorization passes; the page also calls `requireAdminUser()` outside the
    broad data-read `try/catch`, so `redirect()` / `notFound()` control-flow is
    not converted into generic error rendering
  - do not expose a service-role client to client components, browser paths, or
    parent routes
  - no admin RLS read policies are added for v1; parent-owned table policies
    remain scoped to `auth.uid() = parent_user_id`
  - scope is read/triage of open spelling catalog-review cases, not a broad
    admin dashboard, CMS, role-management system, or parent-facing catalog
    mutation surface
  - the view reads only open `spelling_catalog_review_cases`, grouped by
    normalized `misspelling -> correction`, sorted by latest `updated_at`, with
    count, latest date, representative context, parent note/reason, source
    provenance, status, and limited supporting spelling context where useful
  - it includes safe empty/error states and avoids unnecessary parent/child
    identity exposure
  - admin reads must be explicit, auditable, and tested before launch; parent
    users must never be able to list other parents' catalog-review cases
  - QA evidence:
    - `npx eslint app/admin/catalog-review/page.tsx`
    - `npx tsc --noEmit`
    - `npm run build`
    - `git diff --check`
  - security QA conclusion:
    - anonymous users are handled by `/admin` session protection
    - signed-in non-admin users are blocked by the server-side admin guard
    - allowlisted admins can access the admin shell/page
    - service-role access is post-authorization and server-only
    - the page is read-only and mutation-free
  - residual setup/risk:
    - `ADMIN_USER_IDS` and/or `ADMIN_EMAILS` must be configured server-side
    - `SUPABASE_SERVICE_ROLE_KEY` must be configured server-side
    - this remains a private-MVP admin model, not long-term staff role
      management
    - if admin reads later move to a browser Supabase client, the app needs a
      DB-backed admin role or claims model plus explicit admin RLS policies
    - future write-capable admin workflows need separate action helpers, audit
      trail design, and regression coverage
- Slice `4D` — Admin decisions and canonical promotion
  - admin/catalog curation may link an existing skill, create/propose a new
    skill, mark word-level only, mark not a learning issue, merge duplicates,
    supersede, or reopen
  - only this admin/catalog curation layer may create or update
    canonical/global mapping truth
  - Slice `4D` remains docs-first before implementation and must define its
    audit trail, decision actions, canonical write path, validation, and tests;
    Slice `4C` read-only status is not permission to mutate canonical truth
- Slice `5` — Optional manual writing sample extension
  - consider whether manual writing samples should gain candidate capture
  - status:
    - deferred
    - only after lesson-submission capture and parent-local promotion are
      stable

Blocked cases:
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

Slice `2` QA closeout:
- passes:
  - candidate capture works on eligible lesson-submission spelling rows
  - success state is visible after save:
    - `Saved as verified evidence.`
    - `Candidate mapping captured.`
    - `Not used for future suggestions until promoted.`
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
    `Parent Verification`
  - this is acceptable for Slice `2` because the mapping is still
    `pending_parent_promotion` and has not been promoted
  - later clarity wording may use:
    - `captured / awaiting promotion`
    - `saved as evidence, not promoted yet`
- final verdict:
  - Slice `2` passes QA within its bounded scope
  - Slice `2` can be marked implemented and QA-passed
  - remaining issue is seed/catalogue coverage, not a Slice `2` runtime
    regression

Slice `3` QA closeout:
- pass:
  - parents can explicitly promote existing `pending_parent_promotion`
    candidate mappings
  - promoted mappings move to `parent_local_promoted`
  - parents can revert promoted mappings back to
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
  - no `Accept` readiness, override-provider, template-key-truth, mastery,
    reward, assignment, scoring, threshold, analytics, or
    positive-evidence behavior changed
- validation:
  - `npx tsc --noEmit`
  - `npm run writing-engine:parent-local-promotion-regression`
  - `npm run writing-engine:parent-verified-spelling-candidate-capture-regression`
  - `npm run build`
- final verdict:
  - Slice `3` passes within its bounded lesson-submission scope
  - remaining issue is catalog/seed coverage, not a Slice `3` runtime
    regression

Deferred after Slice `3`:
- parent-raised catalog-review curation is registered as docs-only Slice `4A`
- manual writing sample candidate capture/promotion remains deferred to
  Slice `5`
- catalogue/seed coverage work may be needed before some real examples, such
  as `natral -> natural`, can be classified

Next documented stage after Slice `3`:
- Slice `4A` — Docs-only catalog-review contract
  - define how parents can raise spelling catalog gaps without creating global
    canonical truth
  - no migration, runtime code, Review Work UI, package, test, resolver,
    mastery, reward, assignment, scoring, analytics, template-routing, or
    manual-writing-sample expansion is authorized
- Slice `4B.0` — Bounded micro-skill option filtering by family/cluster
  - implemented and QA passed as the compact spelling review table UX
- Slice `4B.1` — Parent `No matching skill` catalog-review case capture
  - implemented and QA passed
  - parent case capture only for eligible lesson-submission spelling rows
  - no admin queue, admin decision, canonical/global mapping write,
    micro-skill creation, resolver change, manual writing sample broadening, or
    mastery/reward/assignment/scoring/analytics/template change
- Slice `4C` — Minimal protected admin/catalog-review read/triage surface
  - access convention is now documented in
    [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
  - admin access foundation is implemented with the server-only admin access
    helper, server-only service-role helper, `/admin` route protection in
    proxy/middleware, and mandatory `app/admin/layout.tsx` guard
  - `/admin/catalog-review` is implemented and QA passed as a protected
    read-only triage page
  - admin reads use server-only service-role access after the admin guard and
    page-level `requireAdminUser()`; no admin RLS read policies are added for
    v1
  - the page reads only open `spelling_catalog_review_cases`, groups by
    normalized `misspelling -> correction`, sorts by latest `updated_at`, and
    displays count, latest date, representative context, parent note/reason,
    source provenance, status, and limited supporting spelling context
  - Slice `4C` must not include admin decisions, canonical/global promotion,
    micro-skill creation, resolver changes, parent `Review Work` changes,
    manual writing sample expansion, or
    mastery/reward/assignment/scoring/analytics/template changes
- Slice `4D` — Admin decisions and canonical promotion
- Slice `5` — Optional manual writing sample extension
  - remains deferred until parent-local promotion stability and any
    curation decision are settled

Slice `4A` catalog-review contract:
- parent-facing action label is `No matching skill`
- helper copy is `Send this spelling case to catalog review.`
- `Uncategorised` is not the primary label because it sounds like a final
  state rather than a request for curation
- `Needs new skill` is not the only label because admin may decide an existing
  skill fits, the case is word-level only, the case is not a learning issue,
  or the case should be merged or superseded
- Slice `4B.1` is implemented and QA passed as parent `No matching skill`
  catalog-review case capture for eligible lesson-submission spelling rows only
- parent workflow:
  - parent uses `No matching skill` when no existing catalog-backed
    micro-skill fits after using the compact family/cluster/micro-skill table
  - helper copy remains `Send this spelling case to catalog review.`
  - parent may add an optional `parent_note` where supported by the implemented
    action/table contract
  - saved row state should be non-blocking, for example
    `Sent to catalog review`
  - parent can still complete or return Review Work according to existing
    completion/return rules
- Slice `4B.1` case capture creates or updates only
  `spelling_catalog_review_cases`
- implemented `spelling_catalog_review_cases` shape:
  - `id uuid primary key default gen_random_uuid()`
  - `parent_user_id uuid not null references auth.users(id) on delete cascade`
  - `child_id uuid not null references public.children(id) on delete cascade`
  - `task_submission_id uuid not null references public.task_submissions(id) on
    delete cascade`
  - `writing_sample_id uuid references public.writing_samples(id) on delete set
    null`
  - `source_suggestion_id uuid references public.writing_issue_suggestions(id)
    on delete set null`
  - `source_misspelling_instance_id uuid not null references
    public.misspelling_instances(id) on delete cascade`
  - `source_provenance text not null`
  - `reviewed_event_source_entity_id text not null`
  - `original_child_spelling text`
  - `original_correct_spelling text`
  - `misspelling_normalized text not null`
  - `correct_spelling_normalized text not null`
  - `case_status text not null default 'open'`
  - `parent_note text`
  - `metadata jsonb not null default '{}'::jsonb`
  - `created_at timestamptz not null default timezone('utc', now())`
  - `updated_at timestamptz not null default timezone('utc', now())`
- allowed Slice `4B.1` `source_provenance` values:
  - `lesson_submission_existing_output`
  - `lesson_submission_parent_added_missed_word`
- initial `case_status` values:
  - `open`
  - `closed_duplicate`
  - `superseded`
- parent action can create or update only `open` cases in Slice `4B.1`
- idempotency/dedupe:
  - repeated parent submissions for the same parent/child/source misspelling
    event update the same open case
  - only one open case should exist for the same
    `parent_user_id + child_id + source_misspelling_instance_id`
  - closed or superseded historical cases may remain for audit
  - existing parent verification, candidate mapping, or durable issue truth
    should prevent duplicate catalog-review capture where appropriate
- implemented server action boundary: `captureSpellingCatalogReviewCase`
  - accepts only `submission_id`, `misspelling_instance_id`, optional
    `parent_note`, and `redirect_path`
  - requires authenticated parent ownership
  - verifies the lesson submission, child, writing sample, and misspelling row
    are in scope
  - rejects manual writing samples
  - rejects rows without lesson/task-submission lineage
  - does not accept `micro_skill_key`
  - does not create `parent_verifications`
  - does not create `parent_verified_spelling_candidate_mappings`
  - does not create `writing_issues`
  - does not write `micro_skill_catalog`
  - does not affect resolver data, mastery, rewards, analytics, templates, or
    assignments
- RLS/auth expectations:
  - authenticated parent access must be scoped to
    `auth.uid() = parent_user_id`
  - the server action must enforce ownership even with RLS in place
  - no admin policies or admin routes are introduced in Slice `4B.1`
  - future admin read/update policies belong to Slice `4C`/`4D`
- Review Work UI placement:
  - `No matching skill` appears in the compact spelling review table Actions
    column for eligible lesson-submission spelling rows
  - it is not shown for manual writing samples
  - it is not shown when a row already has a parent decision, candidate
    mapping, durable issue, or open catalog-review case where that would create
    duplicate workflow
  - after capture, show a row status such as `Sent to catalog review`
  - do not disable unrelated Review Work completion unless existing rules
    already require it
- `parent_verified_spelling_candidate_mappings` should not own this workflow
  because it requires an existing `micro_skill_key`, while the Slice `4` gap
  is often that no suitable micro-skill exists
- `writing_issues` should not own this workflow because `writing_issues` are
  durable reviewed issue history, not catalog-curation workflow
- admin queue should initially show:
  - grouped `misspelling -> correction`
  - count and latest date
  - representative context
  - parent reason/note
  - source provenance
  - status
- Slice `4C` access-control readiness:
  - documentation contract exists in
    [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
  - admin access foundation and the read-only catalog-review triage UI are
    implemented and QA passed
  - admin/internal identity is private server-side allowlists:
    `ADMIN_USER_IDS` preferred, `ADMIN_EMAILS` acceptable for private MVP
  - admin pages live under `/admin`; `app/admin/layout.tsx` is the mandatory
    server-side guard
  - `/admin/catalog-review` also calls `requireAdminUser()` before creating or
    using the service-role client; this guard is outside broad data-read error
    handling
  - admin APIs are not implemented yet; future admin APIs live under
    `/api/admin/*` and must call the same admin helper before querying
  - parent-scoped policies for `spelling_catalog_review_cases` must remain
    parent-scoped
  - admin reads use a server-only service-role helper after admin authorization
    passes; service-role keys must never be exposed to client components or
    `NEXT_PUBLIC_*`
  - no admin RLS read policies are added for v1
  - admin reads must not grant normal parent users cross-parent visibility
- Slice `4C` QA closeout:
  - validation passed:
    - `npx eslint app/admin/catalog-review/page.tsx`
    - `npx tsc --noEmit`
    - `npm run build`
    - `git diff --check`
  - security QA confirmed anonymous `/admin/*` access is handled by session
    protection, signed-in non-admin users are blocked by the server-side admin
    guard, allowlisted admins can access the admin shell/page, service-role
    access is post-authorization and server-only, and the page is read-only and
    mutation-free
  - residual operational requirements:
    - configure `ADMIN_USER_IDS` and/or `ADMIN_EMAILS` server-side
    - configure `SUPABASE_SERVICE_ROLE_KEY` server-side
    - do not treat private-MVP allowlists as long-term staff role management
    - browser-client admin reads require a future DB role/claims model and
      explicit admin RLS policies
    - write-capable admin workflows require separate helpers, audit trail
      design, and regression coverage
- admin decisions may include:
  - link existing skill
  - create/propose new skill
  - word-level only
  - not a learning issue
  - merge duplicate
  - supersede/reopen
- Slice `4D.1` implementation closeout:
  - implemented and QA passed as admin-only case resolution for
    `spelling_catalog_review_cases`
  - remains case-only and does not create resolver-visible canonical/global
    truth, create or mutate `micro_skill_catalog`, change parent Review Work,
    or broaden manual writing samples
  - `linked_existing_skill`
  - `new_skill_needed`
  - `word_level_only`
  - `not_a_learning_issue`
  - `no_action_needed` is not implemented in `4D.1`; adding it requires a
    docs/schema decision first
  - `linked_existing_skill` validates an existing active, assignable `D4`
    `micro_skill_catalog.micro_skill_key`
  - `linked_existing_skill` does not create canonical/global mapping truth,
    does not affect resolver output, and does not promote anything globally
- `new_skill_needed` resolves the case as future catalog/micro-skill work
  without creating a micro-skill
- `word_level_only` resolves the case as a real spelling issue best handled as
  a specific word rather than reusable micro-skill truth
- `not_a_learning_issue` resolves the case as not useful for learning,
  practice, catalog truth, or canonical truth
- Slice `4D.1` admin UI uses one compact per-case decision table that visually
  follows the compact Review Work table pattern where appropriate, but with
  admin-specific columns and curation semantics:
  - parent Review Work table purpose: parent classifies or reports evidence
  - admin catalog-review table purpose: admin reviews evidence and curates the
    decision path
  - main table fields are Wrong Word, Correct Word, Reason, Skill Family,
    Skill Cluster, Micro-skill, Decision, and Actions
  - case details/disclosure may include Source, Evidence Count / Source Count,
    Current Status, Latest Original Spelling Pair, Representative Context,
    Parent Note, Decision Note, and Decision History
  - family, cluster, and micro-skill controls should use parent/admin-facing
    display names where available; raw keys remain internal values only
  - do not add group-wide mutation buttons on normalized
    `misspelling -> correction` groups because grouped cases may have distinct
    contexts and evidence
  - accessible icon actions are labelled; there is no Archive action in this
    slice
- Slice `4D.1` audit and migration truth:
  - `spelling_catalog_review_case_decisions` is the app/RPC-path audit ledger
  - app path is append-only through the implemented server action/RPC path
  - each decision records admin user id/email, previous status, new status,
    decision type, decision note, linked `micro_skill_key` where applicable,
    nullable `canonical_mapping_id` unused in `4D.1`, metadata, and
    `created_at`
  - the RPC locks and updates the target case and inserts the audit row
  - DB-level append-only enforcement with triggers/privilege redesign is not
    yet implemented; this is accepted for private MVP but must be revisited
    before broader staff/admin operations
- Slice `4D.1` admin/security QA closeout:
  - every admin mutation calls `requireAdminUser()` server-side before
    service-role use
  - service-role access remains server-only and post-authorization; no client
    component imports the service-role helper
  - parent-scoped RLS remains unchanged, and no admin browser-client RLS policy
    was added for private MVP
  - the server action rejects non-link decisions that submit `micro_skill_key`;
    the RPC remains defense-in-depth
  - validation passed: `npx eslint app/admin/catalog-review/page.tsx
    app/admin/catalog-review/admin-decision-row.tsx
    app/admin/catalog-review/actions.ts
    scripts/writing-engine-admin-catalog-review-case-resolution-regression.ts`,
    `npx tsc --noEmit`, `npm run build`, focused `4D.1` regression, and
    `git diff --check`
  - QA found no remaining P0/P1/P2 issues; canonical/global truth,
    resolver non-effect, admin/security/service-role, and
    UI/accessibility/table workflow boundaries passed
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
    1. active canonical/global exact-pair spelling mapping
    2. existing catalog-backed canonical mapping behavior
    3. same-scope `parent_local_promoted` mapping
    4. unresolved
- Slice `4E.1` canonical spelling mapping storage foundation closeout:
  - implemented dedicated storage tables `spelling_canonical_mappings` and
    `spelling_canonical_mapping_events`
  - implemented a service-role-only RPC/repository foundation for future
    canonical mapping writes
  - preserved provenance for source case, source decision, admin identity,
    decision note, metadata, dialect, normalization version, mapping status,
    lifecycle fields, and previous/new event values
  - introduced no resolver reads, no resolver priority change, no admin UI
    decision, no parent `Review Work` change, no `micro_skill_catalog`
    mutation, no false-positive handling, and no manual writing sample
    broadening
  - did not reinterpret, backfill, or promote existing Slice `4D.1`
    `linked_existing_skill` rows as canonical/global mapping truth
  - validation passed: `npx tsc --noEmit`, `npm run build`,
    `npm run writing-engine:canonical-mapping-storage-regression`, and
    `git diff --check`
  - residual private-MVP risk: service-role direct table writes can bypass
    canonical mapping event conventions until a later DB hardening slice adds
    stricter append-only/write-ownership protection
- Slice `4E.2` admin canonical-curation decision flow is implemented and
  QA-passed:
  - `/admin/catalog-review` now offers the canonical-curation decisions
    `add_canonical_mapping`, `needs_new_micro_skill`, `word_level_only`,
    `not_a_learning_issue`, and `reject_no_canonical_update` for new
    submissions
  - historical Slice `4D.1` `linked_existing_skill` and `new_skill_needed`
    rows remain readable in decision history only; they are not offered for
    new submissions and were not reinterpreted, backfilled, or promoted
  - `add_canonical_mapping` requires server-side admin authorization before
    service-role use, validates an active, assignable `D4`
    `micro_skill_catalog.micro_skill_key`, creates canonical mapping storage
    and a canonical mapping event through the Slice `4E.1` path, records
    `canonical_mapping_id` on the source case-decision row, and closes/updates
    the source catalog-review case
  - `add_canonical_mapping` does not mutate `micro_skill_catalog` and does not
    affect resolver output; active canonical mappings remain resolver-invisible
    until Slice `4E.3`
  - non-canonical Slice `4E` decisions record/close the case outcome only;
    they do not create canonical mappings or resolver-visible truth
  - non-canonical decision semantics:
    - `needs_new_micro_skill`: real issue, no suitable existing skill yet; no
      micro-skill is created
    - `word_level_only`: real spelling issue but not reusable canonical
      micro-skill mapping truth
    - `not_a_learning_issue`: should not become practice, catalog, or
      canonical truth
    - `reject_no_canonical_update`: reviewed; no canonical mapping, resolver
      change, catalog update, or further curation action is needed
  - P1 provenance fix is closed: the source
    `spelling_catalog_review_case_decisions` row is inserted first, its id is
    passed as `p_source_decision_id` to the canonical mapping RPC, mapping and
    event rows preserve `source_decision_id`, the decision row is updated with
    the returned `canonical_mapping_id`, the flow remains atomic in the same
    RPC transaction, and canonical mapping creation failure rolls back the
    decision insert
  - audit provenance now links case -> case decision -> canonical mapping ->
    canonical mapping event, supporting future catalog-gap, resolver-quality,
    and admin-audit analytics without adding analytics tables or dashboards
  - security boundary remains unchanged: RPC execute is service-role only, no
    client service-role helper was added, and no parent RLS or admin
    browser-client RLS policy changed
  - validation passed: `npx eslint app/admin/catalog-review/page.tsx
    app/admin/catalog-review/admin-decision-row.tsx
    app/admin/catalog-review/actions.ts
    lib/writing-engine/persistence/spelling-canonical-mappings.ts
    scripts/writing-engine-canonical-mapping-storage-regression.ts
    scripts/writing-engine-admin-canonical-curation-regression.ts`,
    `npx tsc --noEmit`, `npm run build`,
    `npm run writing-engine:canonical-mapping-storage-regression`,
    `npm run writing-engine:admin-canonical-curation-regression`, optional
    legacy admin catalog-review regression, `git diff --check`, and P1
    provenance re-audit
  - hosted DB smoke initially failed because the hosted RPC body was stale,
    then passed after the corrected SQL was manually reapplied:
    `add_canonical_mapping` created a decision, canonical mapping, and
    canonical mapping event; mapping and event `source_decision_id` matched the
    decision id; the decision `canonical_mapping_id` matched the mapping id;
    `reject_no_canonical_update` created no canonical mapping; cleanup left no
    smoke cases or mappings behind
  - residual deployment/process risk: hosted DB behavior passed after manual
    SQL reapplication, but `supabase_migrations.schema_migrations` did not
    show expected `20260522%` rows, so hosted migration-ledger alignment is
    not proven. Multiple local migration files share a `20260522` prefix, so
    migration ordering/version hygiene should be reviewed before relying on
    CLI migrations for later slices. This does not block the Slice `4E.2`
    source closeout, but do not proceed to Slice `4E.3` resolver integration
    until the risk is documented and an explicit decision is made on whether
    to reconcile first
- false-positive catalog review is a future Slice `4D` planning concern:
  - reserve future case reason `false_positive_report`
  - reserve future admin outcomes `false_positive_confirmed` and
    `false_positive_needs_rule_fix`
  - `no_matching_skill` means the parent believes there is a real spelling
    issue but no existing micro-skill fits
  - `false_positive_report` means the parent believes the system should not
    have flagged the word/error, such as repeated correct-word flags,
    incorrect corrections, correct spellings mapped to errors, bad canonical
    mappings, or over-eager rules
  - do not claim parent false-positive catalog-review capture or admin
    false-positive mutation is implemented until a later slice explicitly
    adds it
- resolver contract:
  - no resolver change in Slice `4A` or Slice `4B.1`
  - open catalog-review cases remain invisible to the resolver
  - parent notes and reasons remain evidence only
  - canonical/global storage foundation now exists after Slice `4E.1`, but
    resolver use remains blocked until a later resolver integration slice
  - do not use `spelling_catalog_review_cases` as canonical truth, parent
    notes as truth, `parent_verified_spelling_candidate_mappings` as silent
    global truth, or `micro_skill_catalog` metadata as canonical mapping truth
    unless Stage `2C` and the relevant contracts are explicitly revised
  - future resolver integration may add resolver-visible
    `misspelling_normalized -> correct_spelling_normalized -> micro_skill_key`
    mappings, suppress or correct false-positive-producing mappings/rules,
    close catalog-review cases with audit, and improve future suggestions only
    after the resolver contract is explicitly revised
  - future resolver priority is refined by Slice `4E.0`: active
    canonical/global exact-pair spelling mapping, existing catalog-backed
    canonical mapping behavior, same-scope `parent_local_promoted` mapping,
    then unresolved
- Slice `4E.3` owns resolver integration. Slice `4E.4` may handle canonical
  mapping lifecycle refinements such as disable/deprecate/supersede. Slice
  `4E.5` may handle false-positive curation. Hosted Supabase migration-ledger
  reconciliation is a separate deployment hygiene task and is not solved by
  the Slice `4E.2` docs closeout.
- Slice `4B.1` regression checklist:
  - parent can create an open catalog-review case for an eligible
    lesson-submission spelling row
  - parent-added missed word attached to a lesson submission can create a case
    if eligible
  - repeated capture updates the existing open case rather than inserting
    duplicates
  - manual writing samples are rejected/excluded
  - submitted `micro_skill_key` is ignored or rejected
  - no `parent_verifications` row is created by this action
  - no `parent_verified_spelling_candidate_mappings` row is created by this
    action
  - no `writing_issues` row is created by this action
  - no `micro_skill_catalog` row is created or updated
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
  - validation passed:
    - `npx tsc --noEmit`
    - `npm run build`
    - `npm run writing-engine:parent-verified-spelling-candidate-capture-regression`
    - `npm run writing-engine:parent-local-promotion-regression`
    - `npm run writing-engine:mapping-source-regression`
    - `npm run writing-engine:review-work-override-provider-behavior-regression`
    - `git diff --check`
- stop conditions:
  - any design requires parent free-text `micro_skill_key` creation
  - any parent action writes `micro_skill_catalog` or global mapping truth
  - any unresolved catalog-review case affects resolver suggestions
  - any implementation requires manual writing sample support
  - any path cannot preserve source/audit lineage

Slice `4B.0` implementation closeout:
- implemented and QA passed as the compact spelling review table contract
- previous bulky candidate-capture selector wording is superseded
- table scope:
  - pre-populated suggested spelling issues
  - parent-editable wrong/correct word only where the existing Review Work
    flow already allows it
  - Skill Family dropdown with existing parent-facing family display names
  - Skill Cluster dropdown filtered by selected Skill Family
  - Micro-skill dropdown filtered by selected Skill Cluster
  - Actions column with false positive, not a learning issue, and approval
    icons
- action semantics:
  - `X`: false positive, `This was not actually wrong.`
  - `!`: not a learning issue, `This is not something to practise.`
  - Tick: approve this correction and skill, `Approve this correction and
    skill.`
- Tick must reuse existing Review Work verification semantics
- Tick must not automatically create global truth
- Tick must not automatically promote parent-local mappings for future reuse
- parent-local promotion/revert remains separate Slice `3` behavior
- captured/promoted mapping status may be shown as status or separate action,
  but must not be collapsed into Tick
- selectable micro-skill truth remains existing active, assignable `D4`
  `micro_skill_catalog` rows only
- parent-facing labels use existing family, cluster, and micro-skill display
  metadata where available
- final submitted value remains exactly one catalog-backed `micro_skill_key`
- this slice must not add migrations, create `spelling_catalog_review_cases`,
  add `No matching skill` capture, add admin review, change resolver priority,
  change mastery/reward/assignment/scoring/analytics/template-routing
  contracts, broaden manual writing samples, or allow parent-created global
  canonical truth
- Slice `4B.1` remains parent `No matching skill` catalog-review case capture
- Slice `4C` remains minimal admin read/triage
- Slice `4D` remains admin decisions and canonical promotion

### Stage 1A — Shared writing-engine foundation

Status: `Complete`

Delivered:
- `lib/writing-engine` boundary
- generic types for:
  - domain modules
  - analysis sources
  - candidate hypotheses
  - parent verification
  - verified outcomes
  - mastery evidence commands
  - assignment item candidates
  - analytics event payloads
- shared persistence/service boundaries
- `parent_verifications`
- `assignment_items`
- retirement of the old spelling runtime surface

### Stage 1B — Manual spelling diagnostic MVP

Status: `Complete`

Goal:
- prove the first module on the shared engine path

Inputs:
- target word
- child spelling
- sentence context

Outputs:
- likely error category
- suggested mini-skill
- possible prerequisite gaps
- recommended lesson/template
- similar practice words
- confidence score
- parent verification status

Implementation shape:
- deterministic rules first
- no full-document spellcheck
- no external API dependency in the critical path
- no route-local domain logic

Current implementation truth:
- Stage `1B.1` is complete:
  - deterministic manual spelling diagnostic service under
    `lib/writing-engine/spelling`
  - `ManualSpellingDiagnosticResult`
  - candidate hypothesis payload with
    `sourceType = "manual_diagnostic"` and
    `sourceRef.sourceType = "manual_diagnostic"`
  - focused diagnostic regression coverage
- Stage `1B.2` is complete:
  - manual diagnostic verification orchestration
  - accepted / overridden / false-positive / not-a-learning-issue verification
    outcomes shaped without updating mastery
  - strict verification semantics:
    - `accepted` cannot include verified override fields
    - `overridden` requires at least one changed verified educational field
    - note alone does not count as an override
    - `false_positive` and `not_a_learning_issue` reject verified override
      fields
  - invalid decision / override combinations raise explicit errors
  - focused verification regression coverage
- Stage `1B.3` is complete:
  - manual diagnostic parent verification persists through the shared
    `parent_verifications` contract
  - persisted records preserve:
    - original engine suggestion
    - parent decision
    - parent-verified truth
    - rejected outcomes
  - persistence reuses the shared verification contract without introducing
    mastery mutation
  - focused persistence regression coverage through the verification regression
    suite
- Stage `1B` does not yet:
  - update mastery
  - create or mutate `learning_items`
  - create or mutate `learning_item_evidence`
  - create `writing_issues`
  - use `word_progress`
  - add UI or route-local delivery logic
- Stage `1C` owns verified outcome -> mastery evidence / mastery bridge work

Done when:
- a spelling diagnostic can create a candidate hypothesis
- parent verification can accept, override, or reject it
- parent verification records persist through the shared contract while
  preserving suggestion vs verified truth
- verified outcomes are prepared as the handoff into Stage `1C`

### Stage 1C — Verified outcome to mastery bridge

Status: `Complete`

Goal:
- ensure the first diagnostic loop creates or strengthens real mastery streams

Build:
- verified outcome -> mastery evidence command
- catalog-validated verified outcome -> create or strengthen `learning_items`
- append `learning_item_evidence` for mastery-updating verified diagnostics
- preserve suggestion vs verified truth in evidence metadata
- preserve false-positive auditability
- support diagnostic-origin learning items without requiring `writing_issues`
- keep `writing_issues` reserved for authentic-writing issue history
- do not create `learning_item_issue_links` for manual diagnostics
- keep `word_progress` retired from canonical ownership

Done when:
- accepted and overridden verified outcomes update the canonical
  mastery/evidence model
- manual diagnostic outcomes can create or strengthen canonical
  `learning_items`
- one `learning_item_evidence` row is appended for each
  mastery-updating verified manual diagnostic outcome
- `false_positive` and `not_a_learning_issue` remain auditable in
  `parent_verifications` only
- manual diagnostics do not create `writing_issues`
- manual diagnostics do not create `learning_item_issue_links`
- `learning_items.source_writing_issue_id` no longer blocks
  diagnostic-origin streams
- unverified suggestions still do not update mastery

Follow-up debt after Stage `1C` QA closeout:
- run a live app-triggered Stage `1B` -> `1C` smoke test once a manual
  diagnostic UI or internal trigger exists
- consider first-class origin columns before broader analytics/reporting:
  - `learning_items.source_origin_type`
  - `learning_items.source_parent_verification_id`
- split catalog skip reasons into uncatalogued / inactive / non-assignable if
  catalog diagnostics become operationally important

These are not blockers for Stage `1D`.

### Stage 1D — Generic assignment generation

Status: `Complete`

Goal:
- generate `assignment_items` from canonical `learning_items` using the shared
  Writing Engine assignment boundary

Documentation gate:
- implementation must not begin until the Stage `1D` contract is documented in
  the active canonical docs
- if implementation requires an undocumented architecture decision, new source
  of truth, new provenance model, or a broadened runtime surface, stop and
  update the docs first
- Stage `1D` must be implemented in bounded passes rather than as one broad
  assignment-engine change

Build:
- generic assignment-item creation from canonical `learning_items`
- shared assignment-generation reads under `lib/writing-engine`
- shared assignment-item persistence through `assignment_items`
- generic composition rules that do not assume assignment = word list

Stage `1D` behaviour contract:
- source of truth for assignment generation is canonical active
  `learning_items`, with supporting catalog/evidence reads from:
  - `micro_skill_catalog`
  - `learning_item_evidence`
- new generation logic must live under:
  - `lib/writing-engine/assignments`
  - `lib/writing-engine/persistence`
  - `lib/writing-engine/types.ts`
- `daily_assignments` may remain a transitional delivery/header surface, but
  Stage `1D` must not treat it as the canonical assignment-composition owner
- assignment generation must stay generic in architecture even when the first
  implementation slice supports only one narrow item type
- unsupported domains, routes, or missing canonical inputs must be skipped
  explicitly rather than flattened into fake spelling-word rows

First implementation slice: `Stage 1D.1`
- create the smallest safe assignment-generation slice first
- limit `Stage 1D.1` to read/build behavior only:
  - read canonical assignment-generation inputs
  - build shared assignment-item candidates
  - do not yet append persisted rows
- generate one generic `assignment_item` candidate type:
  - `controlled_spelling`
- first supported domain/route combination only:
  - `domain_module = spelling`
  - `practice_route = word_practice`
- for the current canonical catalog, the spelling mastery domain is represented
  by:
  - `micro_skill_catalog.mastery_domain_key = "D4"`
- when `learning_items.metadata.created_from_domain_module` is absent, Stage
  `1D.1` may use that contract-backed catalog field as the spelling-domain
  discriminator for this first slice
- use canonical learning-item and evidence truth to derive:
  - source provenance
  - target word
  - template selection
  - prompt payload
- do not yet implement:
  - grouped-set practice
  - dictation
  - contrast practice
  - punctuation / grammar / proofreading builders
  - adaptive interleaving
  - reward projection

Stage `1D.1` non-goals:
- do not use `word_progress`
- do not revive `/analyse`, `/practice`, `/assignments`, or spelling-session
  runtime helpers
- do not create fake `writing_issues`
- do not alter Stage `1C` provenance truth in `learning_item_evidence`
- do not add reward logic
- do not build a broad adaptive engine
- do not make assignment generation spelling-word-list-only as the architecture
- do not add route-local assignment composition logic
- do not introduce a new source type, source context, or provenance model
  unless the docs are updated first

Stage `1D.1` acceptance criteria:
- assignment generation reads canonical active `learning_items` rather than
  legacy runtime rows
- the first generated item shape is represented through generic
  `assignment_items` contracts rather than route-local structures
- the first slice supports `controlled_spelling` for spelling
  `word_practice` items only
- target word, template key, and provenance are derived from canonical
  learning-item/evidence/catalog truth
- unsupported routes or domains are skipped explicitly rather than coerced into
  word-list rows
- no new canonical ownership is introduced into `word_progress`
- no retired spelling runtime surface is revived

Stage `1D.1` QA checklist:
- verify Stage `1A` and Stage `1C` regression coverage still passes
- verify a diagnostic-origin `learning_item` can produce one
  `controlled_spelling` assignment item through the shared engine boundary
- verify generated item metadata preserves canonical source provenance
- verify unsupported routes/domains are skipped with explicit reasons
- verify no touched file introduces:
  - `word_progress` ownership
  - fake `writing_issues`
  - reward writes
  - route-local assignment composition
  - old spelling-session runtime ownership

Next-stage boundary after `1D.1`:
- `Stage 1D.2` may add deterministic selection and duplicate-safe persistence
  for generated assignment items under `assignment_items`
- `Stage 1D.3` may add the next concrete generic item builder such as grouped
  set or contrast practice
- later stages may broaden item types only after the current documented slice
  is implemented and verified

Stage `1D.2` behaviour contract:
- `1D.2` is the smallest safe persistence pass after `1D.1`
- it may consume only already-eligible `1D.1` assignment-item candidates for:
  - `domain_module = spelling`
  - `practice_route = word_practice`
  - `item_type = controlled_spelling`
- `1D.2` selection is deterministic, not adaptive:
  - it orders the eligible candidate set using stable canonical identifiers
  - it appends the ordered candidates that are not already represented in the
    target canonical assignment-item set
- `1D.2` does not broaden candidate generation rules, item types, domains,
  routes, or mastery semantics

Stage `1D.2` source of truth and persistence boundary:
- canonical eligibility truth remains:
  - active `learning_items`
  - supporting `micro_skill_catalog`
  - supporting `learning_item_evidence`
- canonical persistence truth for this pass is:
  - append-only writes into `assignment_items`
- `daily_assignments` may still provide the transitional header/destination id
  for an append operation, but it is not the source of assignment truth, does
  not own candidate composition, and must not become the new architecture
  anchor
- `1D.2` must reuse the shared `lib/writing-engine` assignment/persistence
  boundary and must not move composition into route-local code or server
  actions

Stage `1D.2` deterministic selection rules:
- selection starts from the set of candidates that already satisfy the
  documented `1D.1` build contract
- `1D.2` must not add caps, quotas, balancing, interleaving, review-vs-new
  prioritisation, or any broader adaptive choice layer
- the ordered candidate list must be stable for the same canonical inputs
- when multiple eligible candidates exist, ordering must be deterministic in
  this exact order:
  1. `learning_item_id` ascending
  2. `target_word` ascending
  3. `template_key` ascending
  4. `source_entity_id` ascending
  5. `item_type` ascending
- runtime randomness, request-order side effects, or append timing must not
  change that ordering
- `1D.2` selection means:
  - produce a stable ordered list of eligible candidates
  - filter out candidates already present under the duplicate-safe append rules
  - append the remaining candidates in that same stable order

Stage `1D.2` duplicate-safe append rules:
- the duplicate check must be performed against canonical persisted
  `assignment_items` for the target assignment destination before appending a
  new row
- `1D.2` must not introduce a new provenance or identity model for duplicate
  detection
- for this bounded pass, a candidate is already represented when the target
  destination already contains an `assignment_item` with the same canonical
  composition identity:
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- repeated `1D.2` runs against the same canonical inputs must not append a
  second equivalent row
- duplicate-safe behavior must come before position assignment so skipped
  duplicates do not create gaps or reorder later appended items
- `1D.2` is append-only for new canonical items:
  - do not rewrite historical `assignment_items`
  - do not merge historical rows
  - do not backfill new provenance into old rows
  - do not cancel or archive existing rows as part of this pass

Stage `1D.2` explicit non-goals:
- no UI flow
- no server-action delivery flow
- no grouped-set practice
- no contrast practice
- no dictation
- no broader adaptive logic
- no route-local assignment composition
- no reward logic
- no `word_progress`
- no revived historical assignment/session runtime
- no new source/provenance model
- no new assignment-header architecture
- no broad assignment-engine redesign

Stage `1D.2` acceptance criteria:
- `1D.2` appends only candidates that already satisfy the documented `1D.1`
  contract
- candidate ordering is deterministic for the same canonical inputs
- re-running `1D.2` against the same target destination does not create
  duplicate canonical `assignment_items`
- appended rows preserve `1D.1` provenance and generic item shape
- no write path other than canonical `assignment_items` append is introduced
- no UI/server-action flow is required for the pass to be considered complete
- no new source of truth, provenance model, reward logic, or route-local
  architecture is introduced

Stage `1D.2` QA checklist:
- verify `1D.1` regression coverage still passes unchanged
- verify the same canonical eligible inputs produce the same ordered candidate
  list across repeated runs
- verify the first `1D.2` append writes new `assignment_items` in deterministic
  order
- verify a second `1D.2` run against the same destination and same canonical
  inputs appends zero duplicate rows
- verify duplicate filtering uses existing canonical assignment-item fields
  rather than a new provenance/identity layer
- verify skipped duplicates do not consume positions
- verify no touched file introduces:
  - grouped-set, contrast, or dictation builders
  - adaptive ranking or balancing logic
  - reward writes
  - route-local composition
  - `word_progress` ownership
  - revived legacy assignment/session runtime assumptions

Stage `1D.2` stop-and-return-to-docs rule:
- if implementation requires a new assignment identity model, new provenance
  model, new source of truth, route-local composition path, assignment-header
  redesign, or broader selection logic than the bounded deterministic pass
  above, stop implementation and update the canonical docs first

Stage `1D.2` mini-task breakdown:

`1D.2` must be implemented as small bounded passes. Each mini-task below is
intentionally scoped for one safe Codex implementation pass.

Mini-task `1D.2A` - Deterministic candidate ordering
- Purpose:
  - add one shared `1D.2` selection helper that consumes only already-eligible
    `1D.1` candidates and returns them in the documented deterministic order
- Scope:
  - take `1D.1` candidate outputs as input
  - filter to candidate results only; do not broaden eligibility
  - sort in this exact ascending order:
    1. `learning_item_id`
    2. `target_word`
    3. `template_key`
    4. `source_entity_id`
    5. `item_type`
  - keep selection purely read/build with no persistence
- Non-goals:
  - no duplicate detection against persisted `assignment_items`
  - no append writes
  - no position assignment
  - no new item builders, caps, quotas, balancing, or adaptive logic
- Expected files/areas affected:
  - `lib/writing-engine/assignments/*`
  - `scripts/writing-engine-stage1d1-assignment-generation-regression.ts` or a
    focused `1D.2` regression successor if a new script is genuinely clearer
  - docs/status references only if needed after implementation
- Acceptance criteria:
  - the same eligible candidate set always returns in the same documented order
  - ineligible or skipped `1D.1` results are not reinterpreted as eligible
  - no persistence path is introduced
- Tests/QA expectations:
  - add focused ordering regression coverage
  - verify `1D.1` regression coverage still passes unchanged
  - verify ordering is independent of input array order
- Dependencies on previous mini-tasks:
  - depends only on completed `1D.1`
- Stop conditions:
  - stop if deterministic ordering appears to require a new candidate identity
    model
  - stop if ordering pressure suggests introducing broader prioritisation,
    balancing, or review scheduling logic

Mini-task `1D.2B` - Canonical duplicate detection read boundary
- Purpose:
  - define the smallest shared read path that can answer whether a `1D.1`
    candidate is already represented in canonical `assignment_items` for one
    target assignment destination
- Scope:
  - add repository/read helper support for duplicate checks using existing
    canonical fields only:
    - `learning_item_id`
    - `item_type`
    - `target_word`
    - `template_key`
    - `source_type`
    - `source_entity_id`
  - scope duplicate detection to the target `daily_assignment_id` /
    destination context
  - keep this mini-task read-only
- Non-goals:
  - no append writes
  - no position assignment
  - no mutation of historical `assignment_items`
  - no new provenance columns, hashes, or identity tables
- Expected files/areas affected:
  - `lib/writing-engine/assignments/service.ts`
  - `lib/writing-engine/persistence/assignment-items.ts`
  - focused regression script coverage for duplicate-read semantics
- Acceptance criteria:
  - the duplicate-read helper can determine whether a candidate already exists
    using only documented canonical fields
  - duplicate checks remain scoped to the target destination and do not invent
    cross-destination ownership semantics
  - no write path is added in this mini-task
- Tests/QA expectations:
  - add fixtures proving an exact canonical match is treated as already present
  - add fixtures proving partial matches do not count as duplicates
  - verify no new source of truth or identity/provenance model is introduced
- Dependencies on previous mini-tasks:
  - may depend on `1D.2A` if the regression path is easier when ordered
    candidates already exist
  - does not require append orchestration
- Stop conditions:
  - stop if duplicate-safe behavior appears to require a new assignment
    identity key, new provenance storage, or changes to the canonical contract
  - stop if destination scoping becomes ambiguous beyond the documented
    `daily_assignments` transitional-header role

Mini-task `1D.2C` - Duplicate-safe append orchestration
- Purpose:
  - wire deterministic candidate ordering and canonical duplicate checks into
    one append-only orchestration path for `assignment_items`
- Scope:
  - consume already-eligible `1D.1` candidates
  - order them using `1D.2A`
  - filter already-represented rows using `1D.2B`
  - append only new rows into canonical `assignment_items`
  - ensure duplicate filtering happens before position assignment
- Non-goals:
  - no UI flow
  - no server-action flow
  - no grouped-set, contrast, dictation, or broader adaptive behavior
  - no rewrite, merge, cancellation, or archival of historical
    `assignment_items`
- Expected files/areas affected:
  - `lib/writing-engine/assignments/service.ts`
  - `lib/writing-engine/persistence/assignment-items.ts`
  - any narrow shared assignment orchestration helper under
    `lib/writing-engine/assignments/*`
  - focused regression script coverage for idempotent append behavior
- Acceptance criteria:
  - a first run appends only new canonical rows in deterministic order
  - a second run against the same destination and same canonical inputs appends
    zero duplicate rows
  - skipped duplicates do not consume positions
  - appended rows preserve `1D.1` provenance and generic item shape
- Tests/QA expectations:
  - add end-to-end regression coverage for:
    - first append success
    - second-run idempotence
    - no position gaps caused by skipped duplicates
  - verify `1D.1` coverage still passes
  - verify no route-local composition, reward logic, or `word_progress`
    ownership is introduced
- Dependencies on previous mini-tasks:
  - depends on `1D.2A`
  - depends on `1D.2B`
- Stop conditions:
  - stop if append orchestration requires a new transaction/locking model that
    changes the documented architecture
  - stop if safe append ordering cannot be preserved without broadening the
    destination/header contract
- stop if implementation pressure expands beyond append-only persistence for
  `controlled_spelling` / spelling `word_practice`

Stage `1D.2` closeout status:
- `Stage 1D.2` is complete
- mini-task `1D.2A` is complete:
  - deterministic ordering of already-eligible `1D.1` candidates
- mini-task `1D.2B` is complete:
  - read-only duplicate detection using the documented canonical identity
    fields
- mini-task `1D.2C` is complete:
  - duplicate-safe append-only orchestration into canonical `assignment_items`

Stage `1D.2` delivered:
- deterministic candidate ordering for already-eligible `1D.1`
  `controlled_spelling` candidates
- read-only duplicate detection scoped to:
  - `daily_assignment_id`
  - `parent_user_id`
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- duplicate-safe append-only `assignment_items` orchestration
- duplicate filtering before position assignment
- second-run idempotence for the same destination and same canonical inputs
- no cross-destination dedupe

Stage `1D.2` QA evidence:
- `npm run writing-engine:assignment-generation-regression` passed with:
  - `writing-engine-stage1d1-assignment-generation-regression: ok`
- `npx tsc --noEmit` was run
- current typecheck failures are pre-existing and unrelated to `1D.2`:
  - `lib/writing-engine/persistence/learning-items.ts:105`
  - `lib/writing-engine/persistence/learning-items.ts:145`
- QA found no remaining `1D.2C` findings
- QA found no new typecheck failures tied to:
  - `lib/writing-engine/assignments/service.ts`
  - `lib/writing-engine/persistence/assignment-items.ts`
  - `scripts/writing-engine-stage1d1-assignment-generation-regression.ts`
  - `scripts/writing-engine-stage1a-regression.ts`

Stage `1D.2` residual risks and follow-up debt:
- repo-wide typecheck still has pre-existing unrelated debt in
  `learning-items.ts`
- `1D.2` regression coverage is fixture-based rather than DB-backed
- any future concurrency or transaction optimisation must return to docs first
  before broadening the current append model
- there is still no UI or app-triggered smoke-test path; `1D.2` remains a
  shared-engine/backend-only pass by design

Next planned pass after `1D.2`:
- `Stage 1D.3` is the next planned product/runtime pass if continuing generic
  item builders
- a typecheck-debt closure pass for the pre-existing `learning-items.ts`
  errors would also be a safe follow-up before broader Stage `1D` expansion
- Stage `1D` parent remains in progress; `1D.2` is not the final required
  Stage `1D` delivery

Stage `1D.3` goal:
- add the first grouped-set generic assignment builder without broadening
  canonical ownership, provenance, or adaptive routing

Stage `1D.3` behaviour contract:
- `1D.3` is the first bounded multi-word builder pass after `1D.2`
- it may add one new supported route/item combination only:
  - `domain_module = spelling`
  - `practice_route = grouped_set_practice`
  - `item_type = controlled_spelling`
- generation truth remains:
  - active `learning_items`
  - supporting `micro_skill_catalog`
  - supporting `learning_item_evidence`
- `1D.3` must preserve all existing `1D.1` / `1D.2` behavior for:
  - spelling
  - `word_practice`
  - `controlled_spelling`
- one active `learning_item` remains the generation unit
- one grouped-set `assignment_item` may contain multiple deterministic practice
  words, but it still represents only that single `learning_item`
- grouped-set prompt content must be catalog-backed:
  - use canonical grouped-word metadata such as `starter_word_bank` and
    `example_words`
  - preserve one evidence-backed anchor word as the candidate `target_word`,
    provenance anchor, and duplicate-check target
  - do not invent grouped sets from route-local heuristics or legacy runtime
    projection
- grouped-set candidate construction must stay deterministic for the same
  canonical inputs:
  - normalize and deduplicate grouped words
  - preserve stable catalog order after normalization
- explicit skip behavior is required when:
  - the route/domain is unsupported
  - grouped-set metadata is missing
  - canonical grouped words collapse to fewer than two unique words
  - provenance anchor fields required by `1D.2` persistence are missing
- `1D.3` must continue to reuse the existing `1D.2` duplicate-safe append
  model and must not introduce a new assignment identity or provenance layer

Stage `1D.3` architecture boundaries:
- new builder logic must remain under:
  - `lib/writing-engine/assignments`
  - `lib/writing-engine/persistence`
  - `lib/writing-engine/types.ts`
- `assignment_items` remains the canonical generic composition layer
- `daily_assignments` may still act only as transitional destination/header
  debt
- no route-local `app/*` assignment composition may be introduced
- no cross-learning-item grouping, batching, or family-level assignment
  materialization may be introduced in this pass

Stage `1D.3` non-goals:
- no contrast builder
- no dictation builder
- no punctuation / grammar / proofreading builder
- no adaptive ranking, caps, quotas, or interleaving engine
- no reward logic
- no `word_progress`
- no fake `writing_issues`
- no revived historical spelling runtime/session flow
- no new assignment identity, hash, provenance table, or header architecture
- no fallback from grouped-set practice into route-local or single-word
  coercion when canonical grouped metadata is insufficient

Stage `1D.3` acceptance criteria:
- an eligible spelling `grouped_set_practice` `learning_item` can produce one
  generic grouped-set `assignment_item` through the shared engine boundary
- the grouped-set candidate is built from canonical catalog metadata rather
  than route-local free text
- the candidate preserves one evidence-backed anchor `target_word` and
  canonical provenance
- grouped words are deterministic for the same canonical inputs
- grouped-set candidates with insufficient canonical grouped content are
  skipped explicitly
- `1D.2` append idempotence still holds for grouped-set candidates
- existing `1D.1` and `1D.2` single-word behavior remains unchanged

Stage `1D.3` QA checklist:
- verify existing `1D.1` / `1D.2` regression coverage still passes
- add focused regression coverage for:
  - successful grouped-set candidate generation
  - deterministic grouped-word ordering after normalization/deduplication
  - explicit skip when grouped-set metadata is missing
  - explicit skip when grouped words collapse to fewer than two unique entries
  - first append success for a grouped-set candidate
  - second-run idempotence for the same destination and canonical inputs
- verify grouped-set persistence still uses the existing canonical duplicate
  fields:
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- verify no touched file introduces:
  - route-local grouped-set composition
  - adaptive routing/balancing
  - reward writes
  - `word_progress` ownership
  - a new assignment identity or provenance model

Next-stage boundary after `1D.3`:
- `Stage 1D.4` may add the next concrete builder such as contrast or dictation
  only after `1D.3` grouped-set generation is implemented and verified
- any pass that needs cross-learning-item set grouping, broader selection
  quotas, new duplicate identity, or richer assignment-header ownership must
  return to docs first

Stage `1D.3` mini-task breakdown:

`1D.3` must be implemented as small bounded passes. Each mini-task below is
intentionally scoped for one safe Codex implementation pass.

Mini-task `1D.3A` - Grouped-set candidate builder and skip semantics
- Purpose:
  - add the first safe grouped-set read/build path under the shared Writing
    Engine assignment boundary
  - establish deterministic grouped-word payload construction and explicit skip
    semantics before any persistence work
- Scope:
  - consume canonical:
    - `learning_items`
    - `micro_skill_catalog`
    - `learning_item_evidence`
  - support only:
    - `domain_module = spelling`
    - `practice_route = grouped_set_practice`
    - `item_type = controlled_spelling`
  - build one grouped-set candidate for one active `learning_item`
  - derive grouped practice words from catalog-backed metadata only:
    - `starter_word_bank`
    - `example_words`
  - preserve one evidence-backed anchor `target_word` for:
    - provenance
    - duplicate-check compatibility
    - canonical candidate identity
  - normalize and deduplicate grouped words while preserving stable catalog
    order
  - add explicit skip semantics when:
    - route/domain is unsupported
    - grouped-set metadata is missing
    - grouped words collapse to fewer than two unique entries
    - required provenance anchor fields are missing
- Non-goals:
  - no append writes
  - no duplicate detection against persisted `assignment_items`
  - no position assignment
  - no cross-learning-item grouping or batching
  - no contrast, dictation, adaptive routing, rewards, UI, server actions,
    route-local composition, fake `writing_issues`, or `word_progress`
  - no new source of truth, identity model, or provenance model
- Acceptance criteria:
  - an eligible spelling `grouped_set_practice` `learning_item` can produce one
    grouped-set `controlled_spelling` candidate through the shared engine
    boundary
  - grouped-set words are built only from canonical catalog metadata
  - one evidence-backed anchor `target_word` is preserved on the candidate
  - grouped-word ordering is deterministic for the same canonical inputs
  - insufficient grouped-set inputs are skipped explicitly rather than falling
    back to `word_practice` or free-text heuristics
  - no persistence path is introduced
- Tests/QA expectations:
  - add focused regression coverage for:
    - successful grouped-set candidate generation
    - deterministic grouped-word ordering after normalization/deduplication
    - explicit skip when grouped-set metadata is missing
    - explicit skip when grouped words collapse to fewer than two unique
      entries
    - explicit skip when provenance anchor fields required by `1D.2`
      persistence are missing
  - verify existing `1D.1` / `1D.2` regression coverage still passes unchanged
- Dependencies on previous mini-tasks:
  - depends on completed `1D.1`
  - should read the documented `1D.2` duplicate-safe append identity contract
    so the anchor `target_word` remains compatible with the later persistence
    pass
- Stop conditions:
  - stop if grouped-set candidate construction appears to require a new
    assignment identity or provenance model
  - stop if grouped-set content cannot be built honestly from canonical
    catalog/evidence inputs alone
  - stop if preserving one-learning-item-per-item composition becomes
    impossible without introducing cross-learning-item grouping

Mini-task `1D.3B` - Duplicate-safe grouped-set persistence and regression
verification
- Purpose:
  - reuse the existing `1D.2` append model to persist already-eligible grouped-
    set candidates safely and prove idempotent behavior
- Scope:
  - consume only already-eligible `1D.3A` grouped-set candidates
  - reuse the documented `1D.2` duplicate-safe append model unchanged:
    - same canonical duplicate fields
    - same append-only ownership in `assignment_items`
    - same destination/header role for `daily_assignments`
  - preserve the `1D.3A` evidence-backed anchor `target_word` as the duplicate-
    check target
  - verify first append success and second-run idempotence for grouped-set
    candidates
- Non-goals:
  - no new grouped-set builder semantics beyond `1D.3A`
  - no new duplicate identity or provenance layer
  - no rewrite, merge, archival, or cancellation of historical
    `assignment_items`
  - no contrast, dictation, adaptive routing, rewards, UI, server actions,
    route-local composition, fake `writing_issues`, or `word_progress`
  - no assignment-header redesign
- Acceptance criteria:
  - a first run appends only new grouped-set canonical rows through
    `assignment_items`
  - a second run against the same destination and same canonical inputs appends
    zero duplicate grouped-set rows
  - grouped-set persistence reuses the existing `1D.2` duplicate-safe fields:
    - `learning_item_id`
    - `item_type`
    - `target_word`
    - `template_key`
    - `source_type`
    - `source_entity_id`
  - appended grouped-set rows preserve `1D.3A` candidate provenance and
    grouped-word payload shape
  - existing `1D.1` / `1D.2` single-word behavior remains unchanged
- Tests/QA expectations:
  - add focused regression coverage for:
    - first grouped-set append success
    - second-run grouped-set idempotence
    - grouped-set persistence still using the existing canonical duplicate
      fields only
  - verify existing `1D.1` / `1D.2` coverage still passes
  - verify `1D.3A` grouped-set candidate coverage still passes unchanged
- Dependencies on previous mini-tasks:
  - depends on completed `1D.3A`
  - depends on the existing completed `1D.2` append contract and duplicate-safe
    persistence helpers
- Stop conditions:
  - stop if grouped-set persistence appears to require changes to the existing
    `1D.2` duplicate-safe append identity contract
  - stop if safe grouped-set append behavior requires a new transaction,
    provenance, or assignment-header architecture
  - stop if implementation pressure broadens beyond reuse of the existing
    append-only `1D.2` model

First safe implementation pass for `1D.3`:
- `1D.3A` is the first safe implementation pass
- it is read/build only and establishes candidate/skip semantics before any
  persistence change

Next Codex implementation prompt for `1D.3A`:
- Implement `Stage 1D.3A` only. Do not broaden beyond the documented contract.
- Add the first grouped-set candidate builder under the shared Writing Engine
  assignment boundary for exactly:
  - `domain_module = spelling`
  - `practice_route = grouped_set_practice`
  - `item_type = controlled_spelling`
- Source of truth must remain canonical:
  - `learning_items`
  - `micro_skill_catalog`
  - `learning_item_evidence`
- Build grouped practice words only from catalog-backed metadata such as:
  - `starter_word_bank`
  - `example_words`
- Preserve one evidence-backed anchor `target_word` for provenance and later
  duplicate-check compatibility.
- Normalize and deduplicate grouped words while preserving stable catalog
  order.
- Add explicit skip results when:
  - route/domain is unsupported
  - grouped-set metadata is missing
  - grouped words collapse to fewer than two unique entries
  - required provenance anchor fields are missing
- Keep this pass read/build only:
  - no append writes
  - no duplicate detection against persisted `assignment_items`
  - no position assignment
- Do not change `1D.1` / `1D.2` single-word behavior.
- Do not introduce route-local composition, contrast, dictation, adaptive
  routing, rewards, UI, server actions, fake `writing_issues`,
  `word_progress`, or any new source of truth / identity / provenance model.
- Required QA:
  - existing `1D.1` / `1D.2` regression coverage still passes
  - focused regression coverage for grouped-set candidate success
  - deterministic grouped-word ordering after normalization/deduplication
- explicit grouped-set skip coverage for missing metadata
- explicit grouped-set skip coverage for fewer than two unique grouped words
- explicit grouped-set skip coverage for missing provenance anchor fields

Stage `1D.3` closeout status:
- `Stage 1D.3` is complete
- mini-task `1D.3A` is complete:
  - grouped-set candidate builder and explicit skip semantics
  - read/build-only grouped-set support for:
    - spelling
    - `grouped_set_practice`
    - `controlled_spelling`
  - grouped-word payload sourced only from:
    - `starter_word_bank`
    - `example_words`
  - one evidence-backed anchor `target_word` preserved for provenance and later
    duplicate detection
- mini-task `1D.3B` is complete:
  - grouped-set candidates verified against the existing `1D.2`
    duplicate-safe append model unchanged
  - grouped-set first append success verified
  - grouped-set second-run idempotence verified

Stage `1D.3` delivered:
- first grouped-set generic assignment builder for:
  - spelling
  - `grouped_set_practice`
  - `controlled_spelling`
- explicit grouped-set skip behavior for:
  - missing grouped metadata
  - fewer than two unique grouped practice words after normalization
- grouped-set append compatibility through the existing canonical
  `assignment_items` append path
- duplicate checks still anchored on the documented canonical identity fields:
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- grouped-set prompt and expected-answer payload preserved on append
- no new duplicate identity model
- no new provenance model
- no route-local grouped-set composition

Stage `1D.3` QA evidence:
- `npm run writing-engine:assignment-generation-regression` passed with:
  - `writing-engine-stage1d1-assignment-generation-regression: ok`
- grouped-set QA coverage now proves:
  - grouped-set candidate generation succeeds when catalog metadata is
    sufficient
  - grouped words are normalized, deduplicated, and preserve stable first-seen
    catalog order
  - one evidence-backed anchor `target_word` is preserved
  - first grouped-set append succeeds
  - second-run grouped-set append is idempotent
  - grouped-set duplicate checks continue using only the documented canonical
    identity fields
  - grouped-set prompt and expected-answer payload are preserved on append
- `npx tsc --noEmit` was run after `1D.3B`
- QA found no new typecheck failures tied to:
  - `lib/writing-engine/assignments/candidates.ts`
  - `lib/writing-engine/assignments/service.ts`
  - `lib/writing-engine/persistence/assignment-items.ts`
  - `scripts/writing-engine-stage1d1-assignment-generation-regression.ts`

Stage `1D.3` residual risks and follow-up debt:
- regression coverage remains fixture-based rather than DB-backed
- any future attempt to dedupe grouped-set candidates by full grouped-word-list
  identity must return to docs first
- there is still no UI or app-triggered smoke-test path; `1D.3` remains a
  shared-engine/backend-only pass by design

Next planned pass after `1D.3`:
- `Stage 1D.4` is the current bounded runtime pass if continuing generic item
  builders
- `Stage 1D.4` must remain docs-first and must not broaden into adaptive
  routing, rewards, UI/server actions, or assignment-header redesign without a
  fresh contract update
- a typecheck-debt closure pass for unrelated repo-wide issues would still be a
  safe follow-up outside the `1D.4` runtime slice

Stage `1D.4` goal:
- add the first contrast generic assignment builder without broadening
  canonical ownership, provenance, or adaptive routing

Stage `1D.4` behaviour contract:
- `1D.4` is the first bounded contrast builder pass after `1D.3`
- it may add one new supported route/item combination only:
  - `domain_module = spelling`
  - `practice_route = contrast_practice`
  - `item_type = controlled_spelling`
- generation truth remains:
  - active `learning_items`
  - supporting `micro_skill_catalog`
  - supporting `learning_item_evidence`
- `1D.4` must preserve all existing `1D.1` / `1D.2` / `1D.3` behavior for:
  - spelling
  - `word_practice`
  - `grouped_set_practice`
  - `controlled_spelling`
- one active `learning_item` remains the generation unit
- one contrast `assignment_item` may contain one deterministic target/contrast
  pair payload, but it still represents only that single `learning_item`
- contrast prompt content must be catalog-backed:
  - use canonical contrast metadata such as `contrast_word_bank`,
    `starter_word_bank`, and `example_words`
  - preserve one evidence-backed anchor word as the candidate `target_word`,
    provenance anchor, and duplicate-check target
  - derive the contrast partner from canonical metadata for the same
    `learning_item`
  - do not invent contrast pairs from route-local heuristics, cross-learning-
    item composition, or legacy runtime projection
- contrast candidate construction must stay deterministic for the same
  canonical inputs:
  - normalize and deduplicate candidate contrast words
  - preserve stable catalog order after normalization
  - choose the first valid partner distinct from the anchor `target_word`
- explicit skip behavior is required when:
  - the route/domain is unsupported
  - contrast metadata is missing
  - canonical contrast words collapse to no valid partner distinct from the
    anchor word
  - provenance anchor fields required by `1D.2` persistence are missing
- `1D.4` must continue to reuse the existing `1D.2` duplicate-safe append
  model and must not introduce a new assignment identity or provenance layer

Stage `1D.4` architecture boundaries:
- new builder logic must remain under:
  - `lib/writing-engine/assignments`
  - `lib/writing-engine/persistence`
  - `lib/writing-engine/types.ts`
- `assignment_items` remains the canonical generic composition layer
- `daily_assignments` may still act only as transitional destination/header
  debt
- no route-local `app/*` assignment composition may be introduced
- no cross-learning-item contrast batching or family-level assignment
  materialization may be introduced in this pass

Stage `1D.4` non-goals:
- no dictation builder
- no punctuation / grammar / proofreading builder
- no adaptive ranking, caps, quotas, or interleaving engine
- no reward logic
- no `word_progress`
- no fake `writing_issues`
- no revived historical spelling runtime/session flow
- no new assignment identity, hash, provenance table, or header architecture
- no fallback from contrast practice into route-local, grouped-set, or
  single-word coercion when canonical contrast metadata is insufficient

Stage `1D.4` acceptance criteria:
- an eligible spelling `contrast_practice` `learning_item` can produce one
  generic contrast `assignment_item` through the shared engine boundary
- the contrast candidate is built from canonical catalog metadata rather than
  route-local free text
- the candidate preserves one evidence-backed anchor `target_word` and
  canonical provenance
- the contrast partner is deterministic for the same canonical inputs
- contrast candidates with insufficient canonical contrast content are skipped
  explicitly
- `1D.2` append idempotence still holds for contrast candidates
- existing `1D.1`, `1D.2`, and `1D.3` behavior remains unchanged

Stage `1D.4` QA checklist:
- verify existing `1D.1` / `1D.2` / `1D.3` regression coverage still passes
- add focused regression coverage for:
  - successful contrast candidate generation
  - deterministic contrast-partner selection after normalization/deduplication
  - explicit skip when contrast metadata is missing
  - explicit skip when contrast words collapse to no valid partner distinct
    from the anchor word
  - first append success for a contrast candidate
  - second-run idempotence for the same destination and canonical inputs
- verify contrast persistence still uses the existing canonical duplicate
  fields:
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- verify no touched file introduces:
  - route-local contrast composition
  - adaptive routing/balancing
  - reward writes
  - `word_progress` ownership
  - a new assignment identity or provenance model

Next-stage boundary after `1D.4`:
- `Stage 1D.5` may add the next concrete builder such as dictation only after
  `1D.4` contrast generation is implemented and verified
- any pass that needs cross-learning-item pairing, broader selection quotas,
  richer duplicate identity, or stronger assignment-header ownership must
  return to docs first

First safe implementation pass for `1D.4`:
- `1D.4A` is the first safe implementation pass
- it is read/build only and establishes candidate/skip semantics before any
  persistence change

Stage `1D.4` mini-task breakdown:

`1D.4` must be implemented as small bounded passes. Each mini-task below is
intentionally scoped for one safe Codex implementation pass.

Mini-task `1D.4A` - Contrast candidate builder and skip semantics
- Purpose:
  - add the first safe contrast read/build path under the shared Writing
    Engine assignment boundary
  - establish deterministic contrast-pair payload construction and explicit
    skip semantics before any persistence work
- Scope:
  - consume canonical:
    - `learning_items`
    - `micro_skill_catalog`
    - `learning_item_evidence`
  - support only:
    - `domain_module = spelling`
    - `practice_route = contrast_practice`
    - `item_type = controlled_spelling`
  - build one contrast candidate for one active `learning_item`
  - derive contrast prompt content from catalog-backed metadata only:
    - `contrast_word_bank`
    - `starter_word_bank`
    - `example_words`
  - preserve one evidence-backed anchor `target_word` for:
    - provenance
    - duplicate-check compatibility
    - canonical candidate identity
  - normalize and deduplicate candidate contrast words while preserving stable
    catalog order
  - choose the first valid contrast partner distinct from the anchor
    `target_word`
  - add explicit skip semantics when:
    - route/domain is unsupported
    - contrast metadata is missing
    - canonical contrast words collapse to no valid distinct partner
    - required provenance anchor fields are missing
- Non-goals:
  - no append writes
  - no duplicate detection against persisted `assignment_items`
  - no position assignment
  - no cross-learning-item pairing or batching
  - no dictation, adaptive routing, rewards, UI, server actions,
    route-local composition, fake `writing_issues`, or `word_progress`
  - no new source of truth, identity model, or provenance model
- Acceptance criteria:
  - an eligible spelling `contrast_practice` `learning_item` can produce one
    contrast `controlled_spelling` candidate through the shared engine
    boundary
  - contrast content is built only from canonical catalog metadata
  - one evidence-backed anchor `target_word` is preserved on the candidate
  - contrast-partner selection is deterministic for the same canonical inputs
  - insufficient contrast inputs are skipped explicitly rather than falling
    back to `word_practice`, `grouped_set_practice`, or dictation
  - no persistence path is introduced
- Tests/QA expectations:
  - add focused regression coverage for:
    - successful contrast candidate generation
    - deterministic contrast-partner selection after
      normalization/deduplication
    - explicit skip when contrast metadata is missing
    - explicit skip when contrast words collapse to no valid distinct partner
    - explicit skip when provenance anchor fields required by `1D.2`
      persistence are missing
  - verify existing `1D.1` / `1D.2` / `1D.3` regression coverage still passes
    unchanged
- Dependencies on previous mini-tasks:
  - depends on completed `1D.3`
  - should read the documented `1D.2` duplicate-safe append identity contract
    so the anchor `target_word` remains compatible with the later persistence
    pass
- Stop conditions:
  - stop if contrast candidate construction appears to require a new
    assignment identity or provenance model
  - stop if contrast content cannot be built honestly from canonical
    catalog/evidence inputs alone
  - stop if preserving one-learning-item-per-item composition becomes
    impossible without introducing cross-learning-item pairing

Mini-task `1D.4B` - Contrast persistence and idempotence verification
- Purpose:
  - reuse the existing `1D.2` append model to persist already-eligible
    contrast candidates safely and prove idempotent behavior
- Scope:
  - consume only already-eligible `1D.4A` contrast candidates
  - reuse the documented `1D.2` duplicate-safe append model unchanged:
    - same canonical duplicate fields
    - same append-only ownership in `assignment_items`
    - same destination/header role for `daily_assignments`
  - preserve the `1D.4A` evidence-backed anchor `target_word` as the
    duplicate-check target
  - verify first append success and second-run idempotence for contrast
    candidates
- Non-goals:
  - no new contrast builder semantics beyond `1D.4A`
  - no new duplicate identity or provenance layer
  - no rewrite, merge, archival, or cancellation of historical
    `assignment_items`
  - no dictation, adaptive routing, rewards, UI, server actions,
    route-local composition, fake `writing_issues`, or `word_progress`
  - no assignment-header redesign
- Acceptance criteria:
  - a first run appends only new contrast canonical rows through
    `assignment_items`
  - a second run against the same destination and same canonical inputs appends
    zero duplicate contrast rows
  - contrast persistence reuses the existing `1D.2` duplicate-safe fields:
    - `learning_item_id`
    - `item_type`
    - `target_word`
    - `template_key`
    - `source_type`
    - `source_entity_id`
  - appended contrast rows preserve `1D.4A` candidate provenance and
    target/contrast payload shape
  - existing `1D.1` / `1D.2` / `1D.3` / `1D.4A` behavior remains unchanged
- Tests/QA expectations:
  - add focused regression coverage for:
    - first contrast append success
    - second-run contrast idempotence
    - contrast persistence still using the existing canonical duplicate fields
      only
  - verify existing `1D.1` / `1D.2` / `1D.3` / `1D.4A` coverage still passes
- Dependencies on previous mini-tasks:
  - depends on completed `1D.4A`
  - depends on the existing completed `1D.2` append contract and duplicate-safe
    persistence helpers
- Stop conditions:
  - stop if contrast persistence appears to require changes to the existing
    `1D.2` duplicate-safe append identity contract
  - stop if safe contrast append behavior requires a new transaction,
    provenance, or assignment-header architecture
  - stop if implementation pressure broadens beyond reuse of the existing
    append-only `1D.2` model

Stage `1D.4` closeout status:
- `Stage 1D.4` is complete
- mini-task `1D.4A` is complete:
  - contrast candidate builder and explicit skip semantics
  - read/build-only contrast support for:
    - spelling
    - `contrast_practice`
    - `controlled_spelling`
  - one evidence-backed anchor `target_word` preserved for provenance and later
    duplicate detection
- mini-task `1D.4B` is complete:
  - contrast candidates verified against the existing `1D.2` duplicate-safe
    append model unchanged
  - contrast first append success verified
  - contrast second-run idempotence verified

Stage `1D.4` delivered:
- first contrast generic assignment builder for:
  - spelling
  - `contrast_practice`
  - `controlled_spelling`
- contrast append compatibility through the existing canonical
  `assignment_items` append path
- duplicate checks still anchored on the documented canonical identity fields:
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- no new duplicate identity model
- no new provenance model
- no UI/server actions
- no reward logic
- no adaptive routing

Stage `1D.4` QA evidence:
- `npm run writing-engine:assignment-generation-regression` passed with:
  - `writing-engine-stage1d1-assignment-generation-regression: ok`
- `npx tsc --noEmit` completed without reported typecheck failures
- QA found no `1D.4B` findings
- contrast append QA coverage now proves:
  - first contrast append succeeds through the existing canonical append path
  - second-run contrast append is idempotent
  - contrast duplicate checks continue using only the documented canonical
    identity fields
  - prior `1D.1` / `1D.2` / `1D.3` / `1D.4A` behavior remains unchanged

Stage `1D.4` residual risks and follow-up debt:
- regression coverage remains fixture-based rather than DB-backed
- any future attempt to introduce richer contrast identity would require a
  docs-first revisit
- there is still no UI or app-triggered smoke-test path; `1D.4` remains a
  shared-engine/backend-only pass by design

Next safe pass after `1D.4`:
- a documentation-first `Stage 1D.5` contract pass is the next safe product /
  architecture step if continuing generic item builders
- a repo-wide typecheck-debt closure pass would also be safe as unrelated
  follow-up work outside the `1D.5` runtime slice
- Stage `1D` parent remains in progress until a later documented pass closes
  the remaining planned work; `1D.4` is not documented as the final required
  `Stage 1D` delivery

Next Codex prompt after `1D.4` closeout:
- Adopt the role of a senior documentation-first Writing Engine architecture
  guardian and implementation planner.
- Do not edit code.
- After `Stage 1D.4` QA passes, prepare the next documentation-first pass for
  `Stage 1D.5`.
- Before proposing implementation:
  1. Re-read the active canonical docs.
  2. Confirm whether `Stage 1D.5` is already fully defined.
  3. If not, update the docs first.
- Your job:
  - define the `Stage 1D.5` goal
  - define the behavior contract
  - define architecture boundaries
  - define non-goals
  - define acceptance criteria
  - define QA requirements
  - define the boundary with the following stage
- Keep the next slice bounded and do not broaden into undocumented
  architecture.

Stage `1D.5` goal:
- add the first dictation generic assignment builder without broadening
  canonical ownership, provenance, audio delivery, or adaptive routing

Stage `1D.5` behaviour contract:
- `1D.5` is the first bounded dictation builder pass after `1D.4`
- it may add one new supported route/item combination only:
  - `domain_module = spelling`
  - `practice_route = dictation`
  - `item_type = controlled_spelling`
- generation truth remains:
  - active `learning_items`
  - supporting `micro_skill_catalog`
  - supporting `learning_item_evidence`
- `1D.5` must preserve all existing `1D.1` / `1D.2` / `1D.3` / `1D.4`
  behavior for:
  - spelling
  - `word_practice`
  - `grouped_set_practice`
  - `contrast_practice`
  - `controlled_spelling`
- one active `learning_item` remains the generation unit
- one dictation `assignment_item` may contain one deterministic single-target
  dictation payload, but it still represents only that single `learning_item`
- dictation prompt content must stay canonical:
  - preserve one evidence-backed anchor word as the candidate `target_word`,
    provenance anchor, and duplicate-check target
  - use catalog-backed template selection and any available canonical support
    text only
  - do not invent route-local audio, free-text teacher script, or
    cross-learning-item sentence composition
- dictation candidate construction must stay deterministic for the same
  canonical inputs:
  - preserve stable anchor-word selection for the same evidence inputs
  - use a dictation-specific `template_key` so dictation items remain distinct
    from `word_practice`, `grouped_set_practice`, and `contrast_practice`
    items without a new duplicate identity model
- explicit skip behavior is required when:
  - the route/domain is unsupported
  - provenance anchor fields required by `1D.2` persistence are missing
  - no dictation-specific template can be selected from canonical catalog
    truth
- `1D.5` must continue to reuse the existing `1D.2` duplicate-safe append
  model and must not introduce a new assignment identity, provenance, audio,
  or delivery layer

Stage `1D.5` architecture boundaries:
- new builder logic must remain under:
  - `lib/writing-engine/assignments`
  - `lib/writing-engine/persistence`
  - `lib/writing-engine/types.ts`
- `assignment_items` remains the canonical generic composition layer
- `daily_assignments` may still act only as transitional destination/header
  debt
- no route-local `app/*` assignment composition may be introduced
- no browser speech synthesis, generated audio assets, or app-delivery
  contracts may be introduced in this pass
- no cross-learning-item dictation batching or sentence-level dictation
  materialization may be introduced in this pass

Stage `1D.5` non-goals:
- no punctuation / grammar / proofreading builder
- no sentence-application builder
- no adaptive ranking, caps, quotas, or interleaving engine
- no reward logic
- no `word_progress`
- no fake `writing_issues`
- no revived historical spelling runtime/session flow
- no new assignment identity, hash, provenance table, audio table, or header
  architecture
- no fallback from dictation into route-local, grouped-set, contrast, or
  single-word coercion when canonical dictation template truth is insufficient

Stage `1D.5` acceptance criteria:
- an eligible spelling `dictation` `learning_item` can produce one generic
  dictation `assignment_item` through the shared engine boundary
- the dictation candidate is built from canonical truth rather than route-local
  text or delivery logic
- the candidate preserves one evidence-backed anchor `target_word` and
  canonical provenance
- dictation template selection is deterministic for the same canonical inputs
- dictation candidates with insufficient canonical template truth are skipped
  explicitly
- `1D.2` append idempotence still holds for dictation candidates
- existing `1D.1`, `1D.2`, `1D.3`, and `1D.4` behavior remains unchanged

Stage `1D.5` QA checklist:
- verify existing `1D.1` / `1D.2` / `1D.3` / `1D.4` regression coverage still
  passes
- add focused regression coverage for:
  - successful dictation candidate generation
  - deterministic dictation template selection
  - explicit skip when dictation template truth is missing
  - explicit skip when provenance anchor fields required by `1D.2`
    persistence are missing
  - first append success for a dictation candidate
  - second-run idempotence for the same destination and canonical inputs
- verify dictation persistence still uses the existing canonical duplicate
  fields:
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- verify no touched file introduces:
  - route-local dictation composition
  - browser speech synthesis or audio generation
  - adaptive routing/balancing
  - reward writes
  - `word_progress` ownership
  - a new assignment identity or provenance model

Next-stage boundary after `1D.5`:
- `Stage 1D.6` may add the next concrete builder such as sentence application
  or a richer dictation-delivery contract only after `1D.5` dictation
  generation is implemented and verified
- any pass that needs audio delivery, cross-learning-item batching, broader
  selection quotas, richer duplicate identity, or stronger assignment-header
  ownership must return to docs first

First safe implementation pass for `1D.5`:
- `1D.5A` is the first safe implementation pass
- it is read/build only and establishes candidate/skip semantics before any
  persistence change

Stage `1D.5` mini-task breakdown:

`1D.5` must be implemented as small bounded passes. Each mini-task below is
intentionally scoped for one safe Codex implementation pass.

Mini-task `1D.5A` - Dictation candidate builder and skip semantics
- Purpose:
  - add the first safe dictation read/build path under the shared Writing
    Engine assignment boundary
  - establish deterministic dictation payload construction and explicit skip
    semantics before any persistence work
- Scope:
  - consume canonical:
    - `learning_items`
    - `micro_skill_catalog`
    - `learning_item_evidence`
  - support only:
    - `domain_module = spelling`
    - `practice_route = dictation`
    - `item_type = controlled_spelling`
  - build one dictation candidate for one active `learning_item`
  - preserve one evidence-backed anchor `target_word` for:
    - provenance
    - duplicate-check compatibility
    - canonical candidate identity
  - select a dictation-specific `template_key` from canonical catalog/template
    truth
  - include only canonical support text if available; do not invent route-local
    script content
  - add explicit skip semantics when:
    - route/domain is unsupported
    - required provenance anchor fields are missing
    - no dictation-specific template can be selected from canonical truth
- Non-goals:
  - no append writes
  - no duplicate detection against persisted `assignment_items`
  - no position assignment
  - no browser speech synthesis, generated audio assets, or delivery logic
  - no cross-learning-item batching or sentence composition
  - no sentence-application, adaptive routing, rewards, UI, server actions,
    fake `writing_issues`, or `word_progress`
  - no new source of truth, identity model, or provenance model
- Acceptance criteria:
  - an eligible spelling `dictation` `learning_item` can produce one
    dictation `controlled_spelling` candidate through the shared engine
    boundary
  - dictation content is built only from canonical truth
  - one evidence-backed anchor `target_word` is preserved on the candidate
  - dictation template selection is deterministic for the same canonical
    inputs
  - insufficient dictation inputs are skipped explicitly rather than falling
    back to `word_practice`, `grouped_set_practice`, or `contrast_practice`
  - no persistence path is introduced
- Tests/QA expectations:
  - add focused regression coverage for:
    - successful dictation candidate generation
    - deterministic dictation template selection
    - explicit skip when dictation template truth is missing
    - explicit skip when provenance anchor fields required by `1D.2`
      persistence are missing
  - verify existing `1D.1` / `1D.2` / `1D.3` / `1D.4` regression coverage
    still passes unchanged
- Dependencies on previous mini-tasks:
  - depends on completed `1D.4`
  - should read the documented `1D.2` duplicate-safe append identity contract
    so the anchor `target_word` remains compatible with the later persistence
    pass
- Stop conditions:
  - stop if dictation candidate construction appears to require a new
    assignment identity or provenance model
  - stop if dictation content cannot be built honestly from canonical
    catalog/evidence inputs alone
  - stop if meaningful dictation support becomes impossible without introducing
    audio delivery or cross-learning-item sentence composition

Mini-task `1D.5B` - Dictation persistence and idempotence verification
- Purpose:
  - reuse the existing `1D.2` append model to persist already-eligible
    dictation candidates safely and prove idempotent behavior
- Scope:
  - consume only already-eligible `1D.5A` dictation candidates
  - reuse the documented `1D.2` duplicate-safe append model unchanged:
    - same canonical duplicate fields
    - same append-only ownership in `assignment_items`
    - same destination/header role for `daily_assignments`
  - preserve the `1D.5A` evidence-backed anchor `target_word` as the
    duplicate-check target
  - verify first append success and second-run idempotence for dictation
    candidates
- Non-goals:
  - no new dictation builder semantics beyond `1D.5A`
  - no new duplicate identity or provenance layer
  - no audio storage or delivery contract
  - no rewrite, merge, archival, or cancellation of historical
    `assignment_items`
  - no sentence-application, adaptive routing, rewards, UI, server actions,
    route-local composition, fake `writing_issues`, or `word_progress`
  - no assignment-header redesign
- Acceptance criteria:
  - a first run appends only new dictation canonical rows through
    `assignment_items`
  - a second run against the same destination and same canonical inputs appends
    zero duplicate dictation rows
  - dictation persistence reuses the existing `1D.2` duplicate-safe fields:
    - `learning_item_id`
    - `item_type`
    - `target_word`
    - `template_key`
    - `source_type`
    - `source_entity_id`
  - appended dictation rows preserve `1D.5A` candidate provenance and payload
    shape
  - existing `1D.1` / `1D.2` / `1D.3` / `1D.4` / `1D.5A` behavior remains
    unchanged
- Tests/QA expectations:
  - add focused regression coverage for:
    - first dictation append success
    - second-run dictation idempotence
    - dictation persistence still using the existing canonical duplicate
      fields only
  - verify existing `1D.1` / `1D.2` / `1D.3` / `1D.4` / `1D.5A` coverage
    still passes
- Dependencies on previous mini-tasks:
  - depends on completed `1D.5A`
  - depends on the existing completed `1D.2` append contract and duplicate-safe
    persistence helpers
- Stop conditions:
  - stop if dictation persistence appears to require changes to the existing
    `1D.2` duplicate-safe append identity contract
  - stop if safe dictation append behavior requires a new transaction,
    provenance, assignment-header, or audio-delivery architecture
  - stop if implementation pressure broadens beyond reuse of the existing
    append-only `1D.2` model

Stage `1D.5` completion status:
- complete
- mini-task `1D.5A`:
  - complete
- mini-task `1D.5B`:
  - complete

Stage `1D.5` delivered:
- the first bounded spelling `dictation` `controlled_spelling` candidate
  builder through the shared Writing Engine boundary
- explicit dictation skip semantics for:
  - unsupported route/domain
  - missing provenance anchor fields required by `1D.2` persistence
  - missing dictation-specific template truth
- deterministic canonical dictation template selection for the same
  `learning_items`, `micro_skill_catalog`, and `learning_item_evidence`
  inputs
- append/idempotence verification through the unchanged `1D.2`
  duplicate-safe append model
- preservation of one evidence-backed anchor `target_word` as the candidate
  provenance anchor and duplicate-check target

Stage `1D.5` QA evidence:
- `Stage 1D.5A` passed QA
- `Stage 1D.5B` passed QA
- `npm run writing-engine:assignment-generation-regression` passed
- `npx tsc --noEmit` passed
- first dictation append success is proven
- second-run dictation idempotence is proven
- duplicate reuse remained constrained to the unchanged `1D.2` identity
  fields:
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- existing `1D.1` / `1D.2` / `1D.3` / `1D.4` / `1D.5A` behavior remained
  unchanged

Stage `1D.5` residual risks:
- fixture-based coverage rather than DB-backed
- live catalog rows still need real dictation template truth
- no UI or app-triggered smoke path yet
- any richer dictation delivery model requires a docs-first revisit

Parent Stage `1D` closeout status:
- `Stage 1D` is complete
- Stage `1D` fulfilled its intended purpose:
  - generate generic `assignment_items` from canonical `learning_items`
  - prove assignment generation is not word-list-only
  - preserve canonical source-of-truth, provenance, and shared-boundary rules
  - avoid reviving `word_progress`, retired spelling runtime ownership,
    route-local composition, fake `writing_issues`, or reward logic as mastery
    truth
- bounded supported spelling routes now implemented under the shared assignment
  boundary:
  - `word_practice`
  - `grouped_set_practice`
  - `contrast_practice`
  - `dictation`
- no active `Stage 1D.6` contract is currently defined in the canonical docs;
  earlier mentions should be treated as placeholder planning language rather
  than a required Stage `1` follow-up

Parent Stage `1` closeout status:
- `Stage 1` is complete
- Stage `1` delivered:
  - `1A` shared Writing Engine foundation
  - `1B` first spelling diagnostic path
  - persisted canonical `parent_verifications`
  - `1C` verified outcome bridge into canonical `learning_items` and
    `learning_item_evidence`
  - `1D` generic canonical `assignment_items` generation from
    `learning_items`
- Stage `1` fresh QA evidence:
  - `npm run writing-engine:regression` passed
  - `npm run writing-engine:diagnostic-regression` passed
  - `npm run writing-engine:verification-regression` passed
  - Stage `1C` mastery bridge regression passed
  - `npm run writing-engine:assignment-generation-regression` passed
  - `npx tsc --noEmit` passed
- remaining risks are follow-up debt, not Stage `1` blockers

Next safe pass after Stage `1`:
- a documentation-first `Stage 2` planning pass is the next safe product /
  architecture step
- do not broaden directly into `Stage 2` implementation without refreshing the
  docs first

Done when:
- Writing Engine work no longer assumes assignment = word list
- the first bounded Stage `1D` slice is implemented without reviving legacy
  runtime ownership

### Follow-up before broader reward work

Status: `Required follow-up`

Before any broader reward-system refactor or canonical reward replacement work:
- define a canonical reward projection contract from `learning_items` and
  `learning_item_evidence` into reward-safe states
- keep Gold Bar / reward-secure status distinct from the parent-facing Writing
  Engine state `Mastered`
- preserve the rule that reward projection is downstream of canonical
  learning/evidence truth rather than a competing mastery source
- define which canonical evidence signals are sufficient for reward-safe
  projection without implying authentic transfer, breadth, confidence, or low
  recurrence unless those requirements are truly met

This follow-up must happen before:
- replacing legacy reward compatibility paths with canonical projections
- broad reward-system refactors tied to Writing Engine mastery
- any attempt to treat reward-state security as equivalent to canonical
  mini-skill mastery

### Stage 2 — Spelling content foundations

Status: `Complete`

Goal:
- establish the canonical spelling-content layer the Writing Engine needs
  before broader analysis or richer assignment behavior can scale safely

Documentation gate:
- implementation must not begin until the Stage `2` contract is documented in
  the active canonical docs
- if implementation requires undocumented spelling content ownership, new
  canonical truth tables, auto-generated taxonomy, or route-local content
  logic, stop and update the docs first

Stage `2` behaviour contract:
- Stage `2` owns the first canonical spelling-content foundation for the shared
  Writing Engine boundary
- Stage `2` must define deterministic content truth for:
  - spelling error-category vocabulary
  - word-to-mini-skill mappings
  - thin lesson-template registry
  - word complexity metadata
  - similar-practice word support
- this stage is a content-foundation stage, not a new verification, mastery,
  assignment-routing, or authentic-writing-analysis stage
- Stage `2` content must support the existing Stage `1` spelling diagnostic and
  assignment architecture without changing their documented ownership rules
- curated spelling content must be implementation-owned inside the shared
  Writing Engine boundary, not inferred ad hoc from route-local UI logic

Stage `2` architecture boundaries:
- canonical consumers remain the shared `lib/writing-engine` boundary
- canonical upstream truth remains:
  - `micro_skill_catalog` for curated mini-skill identity
  - the existing Writing Engine contracts for mastery/evidence semantics
- Stage `2` may add or refine curated spelling content sources needed to
  resolve:
  - supported error categories
  - supported word-to-mini-skill links
  - supported lesson-template selection
  - supported complexity metadata
  - supported similar-practice relationships
- Stage `2` must not move spelling content ownership into:
  - route-local `app/*` code
  - reward logic
  - legacy `word_progress`
  - retired spelling-session runtime helpers
- Stage `2` must preserve the distinction between:
  - educational content metadata
  - parent-verified truth
  - mastery/evidence records
  - assignment-item persistence

Stage `2` non-goals:
- no authentic writing submission analysis
- no new parent-verification decision model
- no new mastery stage ladder, evidence weighting model, or reward projection
- no new assignment-routing engine or UI delivery flow
- no reintroduction of `word_progress` as canonical ownership
- no route-local fallback taxonomy or free-text mini-skill invention
- no external API dependency in the runtime-critical path
- no broad schema rewrite or duplicate long-term truth tables unless later docs
  explicitly approve them

Stage `2` acceptance criteria:
- canonical spelling error-category vocabulary is defined and bounded
- supported word-to-mini-skill mapping rules are defined and deterministic for
  the same canonical inputs
- a thin lesson-template registry contract exists for supported spelling
  mini-skills without broadening assignment ownership
- word complexity metadata shape is defined for spelling words and is clearly
  separated from mastery truth
- similar-practice support is defined as curated educational metadata rather
  than route-local suggestion logic
- the documented Stage `2` outputs can be consumed by Stage `1` spelling
  diagnostic and assignment flows without changing the Stage `1` behaviour
  contract
- Parent Stage `2` closeout:
  - `2A` through `2F` are complete within their bounded documented contracts
  - parent-stage QA evidence:
    - `npm run writing-engine:spelling-content-regression`
    - `npm run writing-engine:error-category-regression`
    - `npm run writing-engine:mapping-source-regression`
    - `npm run writing-engine:primary-mapping-regression`
    - `npm run writing-engine:lesson-template-regression`
    - `npm run writing-engine:word-complexity-regression`
    - `npm run writing-engine:similar-practice-regression`
    - `npm run writing-engine:assignment-generation-regression`
    - `npx tsc --noEmit`
  - blockers:
    - none in implementation truth after closeout reconciliation
  - non-blocking risks:
    - Stage `2C` mapping remains intentionally bounded by
      `candidate_only` catalog word-list sources
    - `2D`, `2E`, and `2F` rely on bounded catalog-backed coverage and
      explicit unresolved outcomes
    - regression coverage remains mostly fixture-based rather than DB-backed
    - some import-direction and mutation-safety checks remain inspection-based
      rather than fully automated

Stage `2` QA requirements:
- verify supported spelling content resolves deterministically for the same
  canonical inputs
- verify unknown or unsupported words/categories/skills fail or skip
  explicitly rather than inventing fallback truth
- verify mini-skill identity still defers to curated `micro_skill_catalog`
- verify no implementation step broadens mastery truth beyond the existing
  mastery/evidence contract
- verify no implementation step broadens assignment ownership beyond the
  existing shared Writing Engine boundary
- verify no route-local or legacy runtime surface becomes the spelling-content
  source of truth

Stage `2` implementation shape:
- Stage `2` must be implemented as bounded mini-tasks
- pure domain/helper/content-resolution work must stay separate from any later
  persistence, UI, or server-action work unless a mini-task explicitly
  documents that broadened scope first
- if any mini-task discovers unclear source-of-truth, identity, provenance,
  permission, or persistence rules, stop and return to docs before code

Stage `2` planned mini-task breakdown:

Mini-task `2A` — Canonical spelling-content source audit and resolver boundary

- ID:
  - `2A`
- Name:
  - Canonical spelling-content source audit and resolver boundary
- Purpose:
  - define the first shared read-only boundary for Stage `2` spelling content
    without changing persistence or runtime ownership
- Scope:
  - confirm which existing canonical sources already hold enough spelling
    content for Stage `2`
  - define one shared content-resolver boundary under `lib/writing-engine`
  - document deterministic read rules for:
    - error-category vocabulary
    - word-to-mini-skill mappings
    - lesson-template lookup
    - word complexity lookup
    - similar-practice lookup
  - allow read-only normalization of existing canonical content truth where
    already documented
- Non-goals:
  - no new persisted content model
  - no schema migration
  - no assignment-generation rewrite
  - no UI, server actions, or review-flow changes
- Expected files/areas:
  - `docs/implementation/writing-engine-roadmap.md`
  - `docs/implementation/targeted-writing-practice-status.md`
  - expected implementation area later:
    - `lib/writing-engine/spelling/*`
    - shared read-only repository/helpers adjacent to existing
      `lib/writing-engine/persistence/*`
- Acceptance criteria:
  - one documented shared resolver boundary exists for Stage `2` spelling
    content
  - each Stage `2` content type has a documented canonical read path or an
    explicit blocker
  - no new canonical ownership is assigned to route-local or legacy surfaces
- Tests/QA:
  - doc review verifies all Stage `2` content types have either:
    - a canonical source
    - a bounded next mini-task
    - or a stop-and-return-to-docs blocker
  - verify the resolver boundary does not imply new mastery or assignment
    ownership
- Dependencies:
  - Stage `1` closeout complete
  - current Stage `2` contract approved
- Stop conditions:
  - stop if content truth cannot be resolved from existing canonical sources
    without inventing a new source of truth
  - stop if the resolver requires route-local reads or legacy compatibility
    layers

Mini-task `2B` — Error-category vocabulary contract

- ID:
  - `2B`
- Name:
  - Error-category vocabulary contract
- Purpose:
  - define the bounded canonical spelling error-category vocabulary that Stage
    `1B` diagnostics and later Stage `3` analysis can share
- Scope:
  - document the supported spelling error-category set
  - define stable category codes/keys and their meaning
  - define deterministic normalization rules for category resolution inputs
  - define how unsupported or ambiguous categories are skipped or surfaced
- Non-goals:
  - no classifier expansion
  - no authentic-writing submission analysis
  - no parent-verification model change
  - no persistence or analytics expansion
- Expected files/areas:
  - `docs/implementation/writing-engine-roadmap.md`
  - expected implementation area later:
    - `lib/writing-engine/spelling/*`
    - possibly shared spelling-content constants/types under
      `lib/writing-engine/types.ts`
- Acceptance criteria:
  - supported error categories are finite, stable, and documented
  - each category has implementation-facing identity and product meaning
  - unsupported cases are documented to fail or skip explicitly
- Tests/QA:
  - resolver-level fixture coverage for deterministic category normalization
  - explicit unknown-category coverage
- Dependencies:
  - `2A`
- Stop conditions:
  - stop if category identity depends on undocumented parent-facing copy or
    route-local labels
  - stop if implementation needs a new verification-decision type

Mini-task `2B` closeout status:
- `2B` is complete
- `2B` delivered:
  - a finite and stable canonical spelling error-category vocabulary
  - deterministic normalization for current runtime spelling category inputs
  - bounded alias handling for current runtime label variants
  - explicit missing / unknown category handling
- `2B` QA evidence:
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
- `2B` residual risks:
  - word-to-mini-skill mapping remains `candidate_only` until `2C`
  - similar-practice candidates remain `candidate_only`
  - word complexity metadata remains `unavailable_not_yet_canonical`
  - broader cross-system adoption of the canonical category vocabulary remains
    future work beyond `2B`
- next safe pass after `2B` is `2C`

Mini-task `2C` — Word-to-mini-skill mapping resolver

- ID:
  - `2C`
- Name:
  - Word-to-mini-skill mapping resolver
- Purpose:
  - define the first canonical read-only resolver from spelling word/pattern
    content into curated `micro_skill_catalog` identity
- Scope:
  - document deterministic mapping inputs and outputs
  - support primary mini-skill mapping only for the first bounded pass
  - support explicit skip semantics when a word cannot be mapped canonically
  - preserve `micro_skill_catalog` as the identity anchor
- Non-goals:
  - no free-text mini-skill creation
  - no prerequisite graph engine
  - no mastery updates
  - no assignment persistence changes
- Expected files/areas:
  - `docs/implementation/writing-engine-roadmap.md`
  - expected implementation area later:
    - `lib/writing-engine/spelling/*`
    - read-only catalog/content access under
      `lib/writing-engine/persistence/*`
- Acceptance criteria:
  - the same canonical word inputs resolve to the same `micro_skill_key`
  - unknown mappings skip explicitly
  - documented output does not bypass or replace `micro_skill_catalog`
- Tests/QA:
  - fixture coverage for known mapped words
  - explicit coverage for unknown/ambiguous mappings
  - verify no fallback `micro_skill_key` invention
- Dependencies:
  - `2A`
  - `2B`
- Stop conditions:
  - stop if mapping requires a second undocumented mini-skill identity source
  - stop if one word needs undocumented multi-stream assignment ownership in
    this first pass

Stage `2C` implementation shape:
- `2C` must be implemented as bounded mini-tasks
- because Stage `2B` closeout still records word-to-mini-skill mapping as
  `candidate_only`, implementation must begin by confirming the canonical
  mapping source before adding a shared resolver
- pure read-only source confirmation and mapping-resolution helpers must stay
  separate from any later assignment, persistence, UI, or server-action work

Stage `2C` planned mini-task breakdown:

Mini-task `2C.A` — Canonical mapping source confirmation and boundary

- ID:
  - `2C.A`
- Name:
  - Canonical mapping source confirmation and boundary
- Purpose:
  - confirm which existing catalog-backed spelling content can act as the
    canonical Stage `2C` mapping source without inventing a second mini-skill
    identity system
- Scope:
  - audit current candidate mapping sources
  - define the first shared read-only mapping boundary under
    `lib/writing-engine`
  - document which inputs are canonical, candidate-only, or blocked for
    mapping resolution
- Non-goals:
  - no broad mapping population
  - no persistence changes
  - no assignment generation changes
  - no prerequisite graph logic
- Expected files/areas:
  - `docs/implementation/writing-engine-roadmap.md`
  - `docs/implementation/targeted-writing-practice-status.md`
  - expected implementation area later:
    - `lib/writing-engine/spelling/*`
    - read-only helpers adjacent to `lib/writing-engine/persistence/*`
- Acceptance criteria:
  - one documented mapping boundary exists
  - the canonical identity anchor remains `micro_skill_catalog`
  - each proposed mapping source is explicitly classified as:
    - canonical
    - candidate-only
    - or blocked
- Tests/QA:
  - doc review verifies no second mini-skill identity source is introduced
  - verify blocked sources are surfaced explicitly rather than inferred
- Dependencies:
  - `2A`
  - `2B`
- Stop conditions:
  - stop if implementation needs a new table, schema field, or non-catalog
    identity source
  - stop if the current docs cannot distinguish canonical mapping truth from
    temporary runtime behavior

Mini-task `2C.B` — Deterministic primary mapping resolver

- ID:
  - `2C.B`
- Name:
  - Deterministic primary mapping resolver
- Purpose:
  - implement the first read-only deterministic resolver from canonical
    spelling inputs into one primary `micro_skill_key`
- Scope:
  - support one primary mapping outcome only
  - accept only documented canonical mapping inputs from `2C.A`
  - return explicit skip/unresolved results for unmapped words
- Non-goals:
  - no multi-skill output
  - no prerequisite inference
  - no mastery updates
  - no assignment persistence changes
- Expected files/areas:
  - expected implementation area later:
    - `lib/writing-engine/spelling/*`
    - read-only catalog/content access under `lib/writing-engine/persistence/*`
- Acceptance criteria:
  - the same canonical inputs resolve to the same primary `micro_skill_key`
  - unmapped words skip explicitly
  - output does not bypass or replace `micro_skill_catalog`
- Tests/QA:
  - fixture coverage for known direct mappings
  - explicit unmapped coverage
  - verify no fallback free-text `micro_skill_key` invention
- Dependencies:
  - `2C.A`
- Stop conditions:
  - stop if deterministic resolution requires undocumented heuristics or a
    second identity source
  - stop if one input needs multi-stream ownership in this bounded pass

Mini-task `2C.B` closeout status:
- `2C.A` is complete
- `2C.B` is complete
- `2C.B` delivered:
  - deterministic primary word-to-mini-skill resolution from the bounded
    `2C.A` catalog-word candidate boundary
  - one primary `micro_skill_key` only
  - explicit unresolved results for:
    - missing words
    - out-of-scope boundaries
    - unavailable candidate words
    - unmapped words
  - no free-text `micro_skill_key` invention
- `2C.B` QA evidence:
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
- `2C.B` residual risks:
  - the resolver is intentionally bounded to exact normalized word matching
    against `2C.A` catalog candidate words; that is correct for `2C.B`, but
    ambiguity handling is still deferred to `2C.C`
  - mapping truth is still not promoted beyond what `2C.A` allows; the
    resolver returns catalog-owned keys only from the bounded candidate
    boundary, so broader canonical mapping truth remains future work
  - candidate-word coverage is only as complete as the currently exposed
    catalog metadata; missing candidate words correctly return explicit
    unresolved results rather than inferred mappings
- next safe pass after `2C.B` is `2C.C`

Mini-task `2C.C` — Ambiguous mapping handling and closeout QA

- ID:
  - `2C.C`
- Name:
  - Ambiguous mapping handling and closeout QA
- Purpose:
  - close the first Stage `2C` pass by defining explicit ambiguous-mapping
    outcomes and proving the resolver remains bounded
- Scope:
  - define explicit ambiguous / unresolved outcomes
  - verify the resolver does not broaden into assignment or mastery ownership
  - close out the first bounded mapping pass with focused regression evidence
- Non-goals:
  - no auto-disambiguation engine
  - no cross-system adoption work
  - no persistence or analytics changes
- Expected files/areas:
  - expected implementation area later:
    - `lib/writing-engine/spelling/*`
    - focused regression scripts under `scripts/`
- Acceptance criteria:
  - ambiguous cases surface explicit unresolved results
  - no fallback or guessed `micro_skill_key` is emitted
  - focused regression proves the resolver remains read-only and bounded
- Tests/QA:
  - explicit ambiguous-input coverage
  - existing `2A`, `2B`, Stage `1B`, and Stage `1D` regressions still pass
- Dependencies:
  - `2C.A`
  - `2C.B`
- Stop conditions:
  - stop if ambiguous handling pressures implementation into prerequisite
    ranking, assignment routing, or persistence changes

Mini-task `2C.C` closeout status:
- `2C.A` is complete
- `2C.B` is complete
- `2C.C` is complete
- parent `2C` is complete
- `2C.C` delivered:
  - explicit ambiguous mapping outcomes
  - explicit unresolved / unavailable outcomes
  - no guessed `micro_skill_key` values
  - read-only bounded mapping closeout for the first Stage `2C` pass
- `2C.C` QA evidence:
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
- `2C` residual risks after closeout:
  - mapping truth is still intentionally bounded by `2C.A` candidate-only
    sources; `2C.C` adds explicit ambiguity handling without promoting broader
    canonical mapping truth
  - ambiguity handling is limited to exact normalized word overlap across
    bounded catalog candidate sources; that is appropriate for `2C.C`, but
    broader product adoption or richer disambiguation remains future work
  - candidate-word coverage is still limited by currently exposed catalog
    metadata, so missing coverage continues to surface as explicit unresolved
    outcomes rather than inferred mappings
- next safe pass after `2C` is `2D`

Post-`2C` bounded follow-up closeout:
- `Canonical Lesson Submission Spelling Mapping Slice 1` is now complete
- this slice remains outside Stage `7F` behaviour work and outside Stage `8`
  mastery/runtime work
- the closeout above is canonical at the documentation boundary, but it must
  not be treated as a clean tracked-runtime baseline until the current repo
  state is explicitly reconciled:
  - if key runtime pieces still exist only as local or untracked work, the
    next safe step is docs reconciliation first
  - implementation follow-up must treat that local work as evidence only, not
    authority
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
  submission-backed spelling suggestions whose `suggested_micro_skill_key` is
  null, empty, or `unknown`
- manual writing samples remain excluded from this slice
- ambiguous, unmapped, inactive, non-assignable, out-of-coverage, and
  otherwise ineligible cases remain unresolved
- `allowsAccepted` and server-side accepted-decision validation remain
  preserved
- `micro_skill_catalog` remains the only micro-skill identity source
- no mastery, evidence, assignment, reward, analytics, queue, or archive
  writes were introduced
- manual QA supplied by Lee passed for this slice:
  - `mony -> money`, `storry -> story`, and `ceeling -> ceiling` showed
    `Accept`
  - `plai -> play`, `buisness -> business`, and `rane -> ran` kept `Accept`
    hidden/unavailable
  - `mony -> money` persisted/backfilled `D4_PG_LONG_EE_EY` with mapping audit
    metadata including:
    - `source = micro_skill_catalog_word_lists`
    - `status = resolved`
    - `rule_version = canonical_submission_spelling_mapping_slice1_v1`
    - matched fields including `starter_word_bank` and `example_words`
    - normalized suggested replacement `money`
  - `mony -> money` created a parent verification with
    `decision = accepted`
  - `storry -> story` created a parent verification with
    `decision = not_a_learning_issue`
- QA evidence for this closeout:
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run writing-engine:mapping-source-regression`
  - `npm run writing-engine:primary-mapping-regression`
  - `npm run writing-engine:ambiguous-mapping-regression`
  - `npm run writing-engine:authentic-submission-regression`
  - `npm run writing-engine:authentic-verification-regression`
- post-closeout boundary clarification:
  - `Accept` readiness and override-option population are separate boundaries
  - this bounded slice covers only when an existing shared suggestion may be
    accepted as already canonically valid
  - this bounded slice is now implemented and validated in the current
    bounded runtime path for lesson/task-submission spelling suggestions
  - `Accept` is surfaced only when canonical micro-skill truth is present and
    non-`unknown`
  - this slice does not by itself authorize or provide catalog-backed
    alternative override options
  - override-option population remains separate catalog-option-provider debt
  - if a later implementation slice is authorized, the smallest safe runtime
    slice is bounded lesson-submission spelling `Accept` readiness only
  - that later slice must not weaken:
    - `allowsAccepted`
    - server-side accepted-decision validation
    - `micro_skill_catalog` as the only micro-skill identity source
    - manual writing-sample exclusion for this bounded path
  - the next separate docs-only registration slice is:
    - `Review Work Suggested Issue override-option provider`
- exact eligible source remains:
  - lesson/task-submission-backed spelling suggestions only
- exact blocked cases remain:
  - manual writing samples
  - unresolved suggestions
  - ambiguous matches
  - inactive matches
  - non-assignable matches
  - out-of-scope matches
- unchanged by this bounded slice:
  - no Review Work workflow changes
  - no mastery, assignment, reward, scoring, thresholds, persistence,
    analytics, or positive-evidence changes
- validated regression coverage for this bounded slice includes:
  - `npx tsc --noEmit`
  - `npm run writing-engine:mapping-source-regression`
  - `npm run writing-engine:primary-mapping-regression`
  - `npm run writing-engine:ambiguous-mapping-regression`
  - `npm run writing-engine:authentic-submission-regression`
  - `npm run writing-engine:authentic-verification-regression`
  - direct Stage `7F` regression harness execution
- lint caveat:
  - `npm run lint` remains blocked by pre-existing repo-wide lint debt rather
    than this slice
- residual risks / follow-up:
  - rows seeded outside the allowed catalog metadata fields remain unresolved
    by design
  - existing lesson misspellings with no persisted suggestion row may rely on
    read-time canonical mapping until a review action creates or touches a
    real `writing_issue_suggestions` row
  - if accepted/rejected parent-verification decisions are still counted as
    unresolved because `writing_issue_suggestions.suggestion_status` remains
    `pending`, that is a separate `Review Work` read-model/status
    reconciliation issue, not a mapping-slice bug

### Registered slice — Review Work Suggested Issue override-option provider

Status: `Deferred selectable UI/runtime; server behavior regression tracked`

Purpose:
- replace or constrain raw override taxonomy entry with catalog-backed options
  for canonical parent overrides
- prevent free-text `micro_skill_key` or free-text `template_key` invention in
  `Review Work` override saves

Scope:
- lesson/task-submission-backed spelling suggestions only
- `verified_micro_skill_key` provider first
- `verified_category_code` remains the existing fixed option set
- `verification_note` remains free-text audit text
- selectable override-provider UI/runtime is not currently live in
  `Review Work`
- existing action-layer/server behavior is covered by:
  - `npm run writing-engine:review-work-override-provider-behavior-regression`

Canonical source and provider rules:
- `micro_skill_catalog` remains the only mini-skill identity source
- options must be surfaced through a bounded provider/read model, not an
  unrestricted catalog dump or generic/global catalog browsing
- only active, assignable, in-scope spelling micro-skills may be offered
- provider options must exclude:
  - ambiguous options
  - inactive rows
  - non-assignable rows
  - out-of-scope rows
  - fallback/free-text `micro_skill_key` values

Save and validation rules:
- overridden decisions may save only canonical provider values
- server-side validation must reject non-catalog override mini-skill keys
- future selectable provider UI must share the same bounded canonical anchor
  fallback used by server-side override validation when the pending shared
  suggestion row has not yet persisted a canonical micro-skill key
- `accepted` validation remains unchanged

Template handling:
- template routing is micro-skill-owned, not word-owned
- Review Work verifies the micro-skill classification and derives template
  routing from that verified micro-skill's configured template metadata
- if a suggestion is accepted, use the suggested canonical micro-skill's
  configured template route
- if a suggestion is overridden, use the verified replacement micro-skill's
  configured template route
- `verified_template_key` is explicitly deferred/blocked in Review Work for
  this stage
- template free text is not authorized
- no parent-facing template dropdown/provider implementation is authorized now
- any later template-choice UI requires separate bounded authorization and may
  only surface template choices from the verified micro-skill's allowed
  template metadata, never from global template browsing or word-by-word truth

Explicitly blocked:
- manual writing samples
- unresolved suggestions
- ambiguous matches
- unmapped suggestions
- inactive catalog rows
- non-assignable catalog rows
- out-of-scope micro-skills
- generic/global catalog browsing

Non-goals:
- no Review Work workflow changes
- no `Accept` gating changes
- no weakening of accepted-decision validation
- no mastery/evidence, assignment, reward, scoring, thresholds, persistence,
  analytics, or positive-evidence logic changes

Validation status:
- existing server/action-layer override behavior is tracked by:
  - `npx tsc --noEmit`
  - `npm run writing-engine:review-work-override-provider-behavior-regression`
- no selectable override-provider UI/runtime QA is recorded because that UI is
  not currently committed/live
- the deleted stale source-level override-provider harness is not part of the
  current validation record

Residual deferred scope:
- selectable override-provider UI/runtime remains deferred
- `verified_template_key` remains deferred/blocked in Review Work
- manual writing samples remain out of scope for override-provider expansion

### Registered slice — Review Work Read-Only Derived Template Metadata

Status: `Implemented and validated (bounded read-only slice)`

Purpose:
- expose read-only template-route metadata in `Review Work`
- keep Review Work focused on verifying canonical micro-skill truth rather
  than assigning template truth word by word

Boundary:
- read-only display only
- no editable `verified_template_key`
- no template dropdown/provider
- no free-text template key
- no global template browsing
- no independent template truth persisted from Review Work

Allowed derivation:
- lesson/task-submission-backed spelling suggestions only
- derive only from deterministic canonical/verified micro-skill truth
- for accepted/shared canonical spelling suggestions, derive from the
  suggested canonical micro-skill
- for overridden suggestions, derive from the verified replacement
  micro-skill
- use only canonical Stage 2A/2D template registry truth rooted in that
  micro-skill:
  - `micro_skill_catalog.allowed_template_keys`
  - `micro_skill_catalog.metadata.dictation_template_key`
  - `micro_skill_catalog.metadata.dictation_template_keys`

Blocked or unresolved:
- manual writing samples
- missing deterministic canonical micro-skill truth
- unresolved template registry cases
- word-by-word template assignment
- parent-editable template fields
- template dropdown/provider
- global template browsing

Display rule:
- unresolved template metadata must render as read-only unavailable/deferred
  messaging, never as an input
- the bounded read-only slice is now live for lesson/task-submission spelling
  suggestions in `Review Work`
- the implementation may use a derived read-only view-model field such as:
  - `derivedTemplateMetadata: { status, templateKey, sourceRefs, reason }`

QA closeout:
- automated QA passed for the bounded slice:
  - `npx tsc --noEmit`
  - `npm run writing-engine:review-work-override-provider-behavior-regression`
- engineering integration QA passed for the bounded Review Work slices
- no automated/source-level regressions were found in the bounded Review Work
  slices
- remaining non-code caveat:
  - a live browser/manual sweep should still be retained as a human
    verification step covering:
    - mapped lesson-submission spelling issue
    - unresolved lesson-submission spelling issue
    - recorded overridden verification
    - manual writing sample
- this remaining manual sweep item is not itself a code-implementation blocker
  unless launch-readiness policy requires manual UI sign-off

Non-goals:
- no Review Work workflow changes
- no `Accept` gating changes
- no weakening of accepted-decision validation
- no mastery/evidence, assignment, reward, scoring, thresholds, persistence,
  analytics, or positive-evidence logic changes

Residual deferred scope:
- `verified_template_key` remains deferred/blocked as an editable Review Work
  field
- any future parent-facing template choice UI requires separate bounded
  authorization and must remain micro-skill-owned rather than word-owned
- manual writing samples remain out of scope for derived template display
- Review Work should not be reopened unless the remaining manual sweep finds a
  bug or a later docs-first stage explicitly authorizes new work

Stage `2C` sequence rule:
- start with `2C.A`
- `2C.B` may begin only after the canonical mapping source is confirmed
- `2C.C` closes the first bounded mapping pass after direct primary mapping is
  in place
- do not combine `2C` read-only resolver work with persistence, UI, server
  actions, or Stage `3` analysis

Stage `2C` current blocker note:
- current docs and status still record word-to-mini-skill mapping as
  `candidate_only`
- therefore the first safe pass is source confirmation and boundary work, not a
  broad resolver implementation pass

Mini-task `2D` — Thin lesson-template registry

- ID:
  - `2D`
- Name:
  - Thin lesson-template registry
- Status:
  - `Complete`
- Goal:
  - define the first canonical, deterministic lesson-template lookup boundary
    for spelling so diagnostic and assignment flows can resolve supported
    template identities without inventing route-local lesson truth
- Behaviour contract:
  - `2D` owns template identity and lookup only; it does not own rendering,
    lesson delivery, or assignment composition
  - `2D` must define a thin, implementation-facing registry of allowed
    spelling lesson-template keys
  - supported spelling mini-skills must resolve deterministically to zero or
    one allowed lesson-template key for the same canonical inputs
  - lookup must begin from canonical spelling-content truth already bounded by
    Stage `2A` and canonical mini-skill identity already bounded by Stage `2C`
  - `2D` must define explicit missing-template outcomes instead of inventing
    fallback lesson content, free-text template keys, or route-local authored
    defaults
  - `2D` may support diagnostics and assignment builders as consumers of the
    registry, but it must not move assignment ownership away from canonical
    `learning_items` -> `assignment_items` generation
- Architecture boundaries:
  - canonical mini-skill identity remains anchored by `micro_skill_catalog`
  - canonical spelling-content reads remain bounded by the Stage `2A`
    resolver/source-audit contract
  - template lookup logic must live under the shared `lib/writing-engine`
    boundary
  - the registry is read-only content truth for this pass; it must not add a
    new persistence model, authored CMS surface, or route-local source of
    truth
  - `assignment_items` remain the canonical persisted assignment composition
    layer; template lookup may inform candidate building later, but does not
    own persisted assignment identity
  - parent-verification, mastery/evidence, and writing-issue ownership remain
    unchanged in `2D`
- Non-goals:
  - no lesson rendering system
  - no UI authoring tools
  - no reward coupling
  - no assignment-item identity rewrite
  - no adaptive lesson recommendation engine
  - no persistence or schema work
  - no route-local lesson content ownership
  - no mastery/evidence or parent-verification changes
- Expected files/areas:
  - `docs/implementation/writing-engine-roadmap.md`
  - expected implementation area later:
    - `lib/writing-engine/spelling/*`
    - possibly shared template lookup helpers used by existing assignment
      candidate builders
- Acceptance criteria:
  - supported spelling mini-skills can resolve deterministically to allowed
    template keys
  - missing template truth skips explicitly rather than inventing fallback
    content
  - registry ownership stays separate from persisted assignment items
  - the same canonical input resolves to the same template outcome across
    repeated runs
  - no new canonical source of truth, route owner, or authored lesson system
    is introduced
- Tests/QA:
  - fixture coverage for successful template resolution
  - explicit missing-template coverage
  - fixture coverage for deterministic repeated lookup on the same canonical
    inputs
  - verify no new write path, route-local lesson source, or assignment
    identity model is introduced
- Dependencies:
  - `2A`
  - `2C`
- Boundary with the next stage:
  - `2D` provides only lesson-template identity and lookup truth
  - later stages may consume that truth:
    - `2E` may add word complexity metadata
    - `2F` may add similar-practice support
    - Stage `3` may later consume the registry during authentic-writing
      analysis flows
  - `2D` must not itself broaden into content rendering, lesson sequencing,
    adaptive recommendations, or UI delivery
- Stop conditions:
  - stop if template identity conflicts with documented Stage `1D` assignment
    identity rules
  - stop if implementation needs route-local authored content as canonical
    template truth
  - stop if implementation needs a new persisted lesson entity, new source of
    truth outside the shared writing-engine boundary, or a broadened ownership
    model for assignment delivery
- QA closeout:
  - supported spelling mini-skills now resolve deterministically to allowed
    template keys through the shared registry
  - missing template truth now returns explicit unresolved outcomes in the
    registry layer instead of inventing fallback content
  - registry ownership stays separate from persisted assignment items;
    assignment persistence and identity rules were untouched
  - the same canonical input resolves to the same template outcome across
    repeated runs
  - no new canonical source of truth, route owner, or authored lesson system
    was introduced
- Tests run:
  - `npm run writing-engine:lesson-template-regression`
  - `npm run writing-engine:spelling-content-regression`
  - `npm run writing-engine:assignment-generation-regression`
  - `npx tsc --noEmit`
- Residual risks:
  - the registry is intentionally thin and read-only, so it depends on
    catalog-backed template quality and coverage in `micro_skill_catalog`
  - for Stage `1D` consumers, unresolved registry outcomes are still collapsed
    into the pre-existing assignment skip `missing_template_key`; that
    preserves Stage `1D` behavior, but richer unresolved-reason surfacing
    would need a docs-first pass later
  - regression coverage is good for normalization, determinism, and unresolved
    outcomes, but it remains fixture-based rather than DB-backed
- Next safe pass:
  - `2E`

Mini-task `2E` — Word complexity metadata resolver

- ID:
  - `2E`
- Name:
  - Word complexity metadata resolver
- Status:
  - `Complete`
- Goal:
  - define the first canonical, read-only word-complexity metadata lookup
    boundary for spelling words so later evidence and reporting can consume
    bounded complexity truth without changing mastery semantics
- Behaviour contract:
  - `2E` owns complexity metadata identity, normalization, and lookup only; it
    does not own mastery scoring, promotion logic, analytics rendering, or
    adaptive assignment behavior
  - `2E` must define a thin, implementation-facing complexity metadata shape
    for spelling words
  - supported spelling words must resolve deterministically to one explicit
    complexity metadata result for the same canonical inputs
  - lookup must begin from canonical spelling-content truth already bounded by
    Stage `2A` and canonical mini-skill identity already bounded by Stage `2C`
  - `2E` must define explicit unknown / unavailable outcomes instead of
    inferring loose complexity values or inventing fallback scoring
  - `2E` may support later evidence, reporting, and diagnostics as consumers
    of complexity metadata, but it must not itself change mastery truth
- Architecture boundaries:
  - canonical mini-skill identity remains anchored by `micro_skill_catalog`
  - canonical spelling-content reads remain bounded by the Stage `2A`
    resolver/source-audit contract
  - complexity lookup logic must live under the shared `lib/writing-engine`
    boundary
  - the resolver is read-only content truth for this pass; it must not add a
    new persistence model, external dependency, or route-local source of truth
  - complexity metadata must remain separate from:
    - stored mastery state
    - evidence weighting formulas
    - assignment identity
    - reward logic
- Non-goals:
  - no mastery scoring recalibration
  - no promotion/demotion logic
  - no analytics dashboard work
  - no schema-wide evidence rewrite
  - no adaptive ranking or assignment-routing changes
  - no external API or model in the runtime-critical path
  - no route-local authored complexity source
- Expected files/areas:
  - `docs/implementation/writing-engine-roadmap.md`
  - expected implementation area later:
    - `lib/writing-engine/spelling/*`
    - shared evidence/content helpers if needed
- Acceptance criteria:
  - complexity metadata shape is stable and documented
  - supported canonical inputs resolve deterministically for the same input
  - unknown complexity values remain explicit rather than inferred loosely
  - complexity metadata stays separate from mastery state updates
  - no new canonical source of truth, mastery formula, or analytics/rendering
    owner is introduced
- Tests/QA:
  - fixture coverage for normalization of supported complexity metadata
  - explicit coverage for unknown or partial metadata
  - deterministic repeated-lookup coverage for the same canonical inputs
  - verify no new write path, external dependency, mastery scoring change, or
    assignment identity change is introduced
- Dependencies:
  - `2A`
  - `2C`
- Boundary with the next stage:
  - `2E` provides only complexity metadata identity and lookup truth
  - later stages may consume that truth:
    - `2F` may add similar-practice support
    - later mastery/evidence revisions may consume complexity metadata only
      through a future documented scoring/calibration pass
    - Stage `3` may later consume complexity metadata during authentic-writing
      analysis flows
  - `2E` must not itself broaden into mastery scoring changes, dashboards,
    adaptive recommendations, or UI delivery
- Stop conditions:
  - stop if complexity scoring requires undocumented mastery formula changes
  - stop if implementation needs an external API or model in the critical path
  - stop if implementation needs a new persisted complexity entity, new source
    of truth outside the shared writing-engine boundary, or a broadened
    ownership model for mastery/evidence updates
- QA closeout:
  - Stage `2E` passed QA
  - stable implementation-facing spelling word complexity metadata now
    normalizes curated starter-word-bank difficulty into bounded complexity
    bands
  - deterministic read-only word complexity lookup now exists under the shared
    `lib/writing-engine` boundary
  - explicit unresolved outcomes now cover:
    - `missing_word`
    - `out_of_scope_boundary`
    - `complexity_metadata_unavailable`
    - `unknown_word_complexity`
  - complexity metadata remains descriptive content truth and does not change
    mastery scoring, stage gates, promotion logic, or assignment identity
  - no new canonical source of truth, external dependency, or
    analytics/rendering owner was introduced
- Tests run:
  - `npm run writing-engine:word-complexity-regression`
  - `npm run writing-engine:spelling-content-regression`
  - `npm run writing-engine:lesson-template-regression`
  - `npm run writing-engine:assignment-generation-regression`
  - `npx tsc --noEmit`
- Residual risks:
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
- Next safe pass:
  - `2F`

Mini-task `2F` — Similar-practice support resolver

Status: `Complete`

- ID:
  - `2F`
- Name:
  - Similar-practice support resolver
- Goal:
  - define the first canonical, read-only similar-practice lookup boundary for
    spelling so diagnostics and later assignment flows can surface curated
    support words without route-local suggestion logic
- Behaviour contract:
  - `2F` owns similar-practice identity, normalization, ordering, and lookup
    only; it does not own adaptive recommendations, assignment routing, or
    mastery changes
  - `2F` must define a thin, implementation-facing similar-practice input and
    output shape for spelling
  - supported inputs must resolve deterministically to one explicit
    similar-practice result for the same canonical inputs
  - lookup must begin from canonical spelling-content truth already bounded by
    Stage `2A` and canonical mini-skill identity already bounded by Stage `2C`
  - `2F` must define explicit under-populated / unavailable outcomes instead of
    inventing free-text support words or adaptive fallback suggestions
  - `2F` may support diagnostics and later assignment consumers, but it must
    not itself change assignment ownership or routing
- Architecture boundaries:
  - canonical mini-skill identity remains anchored by `micro_skill_catalog`
  - canonical spelling-content reads remain bounded by the Stage `2A`
    resolver/source-audit contract
  - similar-practice lookup logic must live under the shared
    `lib/writing-engine` boundary
  - the resolver is read-only content truth for this pass; it must not add a
    new persistence model, route-local source of truth, or external dependency
  - similar-practice metadata must remain separate from:
    - mastery/evidence updates
    - assignment identity
    - assignment routing
    - reward logic
- Non-goals:
  - no adaptive recommendation engine
  - no cross-learning-item batching
  - no assignment routing changes
  - no mastery evidence changes
  - no persistence/schema work
  - no route-local authored similar-practice source
  - no external API or model in the runtime-critical path
- Expected files/areas:
  - `docs/implementation/writing-engine-roadmap.md`
  - expected implementation area later:
    - `lib/writing-engine/spelling/*`
    - shared assignment/diagnostic consumers only after the resolver exists
- Acceptance criteria:
  - canonical similar-practice input/output shape is stable and documented
  - supported inputs produce deterministic similar-practice outputs
  - missing or insufficient content skips explicitly
  - similar-practice support remains curated metadata, not generated free text
  - no new canonical source of truth, routing owner, or adaptive engine is
    introduced
- Tests/QA:
  - fixture coverage for deterministic ordering
  - explicit under-populated-content coverage
  - deterministic repeated-lookup coverage for the same canonical inputs
  - verify no new write path, adaptive ranking, assignment routing change, or
    external dependency is introduced
- Dependencies:
  - `2A`
  - `2C`
- Boundary with the next stage:
  - `2F` provides only similar-practice identity and lookup truth
  - Stage `2` then has its intended first bounded spelling-content foundation
    documented and implemented through:
    - `2A`
    - `2B`
    - `2C`
    - `2D`
    - `2E`
    - `2F`
  - Stage `3` may later consume similar-practice support during
    authentic-writing analysis flows
  - `2F` must not itself broaden into adaptive recommendations, assignment
    routing, mastery changes, or UI delivery
- Stop conditions:
  - stop if similar-practice identity requires undocumented duplicate or
    provenance rules
  - stop if implementation drifts into adaptive ranking or assignment
    composition changes
  - stop if implementation needs a new persisted similar-practice entity, new
    source of truth outside the shared writing-engine boundary, or a broadened
    ownership model for routing or mastery updates
- Delivered:
  - stable implementation-facing similar-practice resolution now exists under
    the shared `lib/writing-engine` spelling boundary
  - catalog-backed starter-word-bank and example-word content now resolve
    deterministically into ordered similar-practice support words
  - explicit unresolved outcomes now cover:
    - `missing_word`
    - `out_of_scope_boundary`
    - `similar_practice_unavailable`
    - `unsupported_anchor_word`
    - `under_populated_similar_practice`
  - similar-practice support remains read-only curated content truth and does
    not change assignment routing, assignment ownership, mastery/evidence
    semantics, persistence/schema, UI, or external dependency ownership
  - no new canonical source of truth, adaptive recommendation layer, or
    route-local ownership was introduced
- QA evidence:
  - Stage `2F` passed QA
  - `npm run writing-engine:similar-practice-regression`
    - `writing-engine-stage2f-similar-practice-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Residual risks:
  - the resolver is intentionally bounded to catalog-backed starter-word-bank
    and example-word coverage and does not yet broaden into richer
    similar-practice relationship sources
  - unsupported anchor words and sparsely populated catalogs remain explicit
    unresolved outcomes rather than inferred support suggestions
  - regression coverage is good for deterministic ordering and
    under-populated outcomes, but it remains fixture-based rather than
    DB-backed
  - import-direction purity was validated by inspection rather than a
    dedicated automated regression
  - there is no dedicated Stage `2F` mutation-safety regression on the
    resolver output itself, though the underlying Stage `2A` source boundary
    already has alias/mutation coverage

Stage `2` sequence rule:
- start with `2A`
- `2B` and `2C` may follow once the resolver boundary is confirmed
- `2D`, `2E`, and `2F` depend on the read boundary from `2A` and must not
  begin by inventing independent ownership models
- do not combine pure read-only content resolution with persistence, UI, or
  server-action work unless a later docs pass explicitly authorizes it

Next-stage boundary after `Stage 2`:
- Stage `2` prepares canonical spelling-content truth only
- Stage `3` owns authentic writing submission analysis and may consume Stage
  `2` content foundations
- Stage `2` must not itself:
  - create authentic-writing hypotheses from submissions
  - create `writing_issues` from course-review text
  - broaden parent-verification workflows beyond the shared contract
  - introduce new mastery-updating evidence sources beyond the existing
    documented paths
- Parent Stage `2` is now complete through:
  - `2A`
  - `2B`
  - `2C`
  - `2D`
  - `2E`
  - `2F`
- Next safe pass after Stage `2` closeout:
  - documentation-first preparation for `Stage 3`

Done when:
- the spelling module has enough owned educational metadata to scale beyond the
  first diagnostic MVP
- the Stage `2` content foundation is documented tightly enough that
  implementation can proceed without inventing new ownership rules during code
  work

### Stage 3 — Authentic writing submission analysis

Status: `Complete`

Goal:
- connect authentic course-submission spelling review into the shared Writing
  Engine path without reviving retired spelling-runtime architecture or
  bypassing durable writing-issue truth

Behaviour contract:
- Stage `3` is the first authentic-writing analysis stage on the shared
  Writing Engine boundary
- the first bounded Stage `3` pass remains spelling-only:
  - no punctuation
  - no sentence-boundary logic
  - no grammar/proofreading expansion
- raw submission analysis output is candidate hypothesis truth only:
  - it must not become mastery truth by itself
  - it must not become transfer evidence by itself
  - it must not bypass parent verification
- Stage `3` candidate hypotheses must preserve canonical authentic-writing
  source references where available, including:
  - `task_submission`
  - `writing_sample`
  - source span / target text
  - child attempt text
- Stage `3` spelling hypotheses may consume Stage `2` spelling-content
  foundations for:
  - error-category normalization
  - word-to-mini-skill mapping
  - lesson-template lookup
  - complexity metadata
  - similar-practice support
- accepted and overridden parent-verified authentic-writing outcomes must stay
  representable as durable reviewed writing truth through the existing
  `writing_issue` lifecycle rather than a parallel diagnostic-only history
- rejected outcomes such as `false_positive` and `not_a_learning_issue` must
  remain auditable without creating mastery updates, `learning_items`, or fake
  `writing_issues`

Architecture boundaries:
- shared domain logic must live under `lib/writing-engine`
- canonical authentic-writing analysis inputs begin from repo-owned submission
  truth such as:
  - `task_submissions`
  - `writing_samples`
- supporting spelling-content reads may come from documented Stage `2`
  boundaries only
- Stage `3` must reuse the shared:
  - candidate-hypothesis contract
  - `parent_verifications` contract
  - existing targeted-writing issue lifecycle
- Stage `3` must not move canonical analysis ownership into:
  - route-local `app/*` code
  - retired spelling-session helpers
  - external API truth

Non-goals:
- no punctuation module work
- no sentence-boundary module work
- no grammar/proofreading module work
- no route-local analysis engine
- no external API dependency in the runtime-critical path
- no free-text `micro_skill_key` invention
- no direct mastery-score recalibration
- no direct reward-system rewrite
- no assignment-generation redesign
- no revival of `/analyse`, `/practice`, or `/assignments`

Acceptance criteria:
- authentic spelling analysis can produce shared Writing Engine candidate
  hypotheses from canonical submission inputs
- candidate hypotheses preserve canonical authentic-writing provenance and
  submission linkage
- the first Stage `3` implementation stays spelling-only and reuses documented
  Stage `2` spelling-content truth
- parent verification preserves suggestion truth versus parent-verified truth
  through the shared contract
- rejected outcomes remain auditable without creating mastery updates,
  `learning_items`, or fake durable issue history
- no new parallel submission-analysis, verification, or mastery system is
  introduced outside the shared Writing Engine and targeted-writing contracts

QA requirements:
- verify deterministic candidate-hypothesis output for the same canonical
  submission input
- verify authentic-writing source references are preserved on candidate
  results
- verify unresolved or ambiguous Stage `2` mapping/content gaps surface
  explicitly rather than through invented free-text mini-skills
- verify unverified, `false_positive`, and `not_a_learning_issue` outcomes do
  not update mastery or create canonical `learning_items`
- verify no touched file reintroduces route-local analysis ownership, retired
  spelling runtime assumptions, or external API truth ownership

Mini-task breakdown:

`3A` Submission-source normalization and spelling hypothesis generation
- Status:
  - complete
- Goal:
  - produce the first shared Writing Engine candidate hypotheses from
    authentic spelling submissions
- Scope:
  - spelling only
  - read/build only
  - canonical source refs to submission/sample/span
  - consume documented Stage `2` spelling-content resolvers only
- Must not:
  - persist parent verification
  - create `writing_issues`
  - update mastery
  - broaden beyond spelling
- Delivered:
  - deterministic candidate hypotheses through shared service shape and
    focused regression coverage
  - canonical provenance preserved on candidate results through:
    - `sourceRef.taskSubmissionId`
    - `sourceRef.writingSampleId`
    - `metadata.sourceSpan`
    - `metadata.targetText`
    - `metadata.childAttemptText`
  - ambiguous and unresolved Stage `2` mapping/content gaps remain explicit
    and do not invent fallback `micro_skill_key` values
  - spelling-only analysis is preserved through `domainModule = "spelling"`
    and reuse of spelling-only analyzers/resolvers
  - no writes, no mastery updates, and no route-local ownership were
    introduced
- QA evidence:
  - `npm run writing-engine:authentic-submission-regression`
  - `npm run writing-engine:diagnostic-regression`
  - `npm run writing-engine:error-category-regression`
  - `npm run writing-engine:primary-mapping-regression`
  - `npm run writing-engine:ambiguous-mapping-regression`
  - `npm run writing-engine:lesson-template-regression`
  - `npm run writing-engine:word-complexity-regression`
  - `npm run writing-engine:similar-practice-regression`
  - `npx tsc --noEmit`
- Residual risks:
  - no contract drift was found in `Stage 3A`

`3B` Shared parent verification for authentic-writing hypotheses
- Status:
  - complete
- Goal:
  - persist parent verification of Stage `3A` authentic-writing hypotheses
    through the shared `parent_verifications` contract
- Scope:
  - preserve original suggestion versus parent-verified truth
  - support accepted / overridden / `false_positive` /
    `not_a_learning_issue`
- Must not:
  - bypass shared verification invariants
  - update mastery directly from raw unverified submission analysis
  - invent a parallel verification store
- Behaviour contract:
  - `3B` consumes `Stage 3A` authentic-writing candidate hypotheses only
  - `3B` persists authentic-writing parent verification through the existing
    shared `parent_verifications` contract
  - `3B` must preserve:
    - original suggestion truth
    - parent decision
    - parent-verified educational truth where applicable
    - authentic-writing source refs from `Stage 3A`
  - `accepted` authentic-writing outcomes must reuse the original suggestion as
    verified truth and must not carry override fields
  - `overridden` authentic-writing outcomes must include at least one changed
    verified educational field
  - note alone does not count as an override
  - `false_positive` and `not_a_learning_issue` outcomes must reject verified
    override fields
  - invalid decision / override combinations must fail explicitly rather than
    persisting ambiguous verification records
- Architecture boundaries:
  - write ownership for `3B` is limited to the shared
    `parent_verifications` contract
  - `3B` must remain under the shared `lib/writing-engine` verification
    boundary
  - `3B` must not create or mutate:
    - `writing_issues`
    - `learning_items`
    - `learning_item_evidence`
  - `3B` must not move verification ownership into route-local `app/*` code
    or a dedicated authentic-writing-only verification store
- Non-goals:
  - no durable issue creation yet
  - no learning-item creation yet
  - no mastery/evidence updates
  - no final-classification orchestration
  - no punctuation / sentence / grammar broadening
  - no route-local verification ownership
- Acceptance criteria:
  - authentic-writing candidate hypotheses from `Stage 3A` can be persisted
    through the shared `parent_verifications` contract
  - persisted records preserve original suggestion truth versus
    parent-verified truth
  - accepted / overridden / `false_positive` /
    `not_a_learning_issue` authentic-writing outcomes all persist through the
    shared verification contract
  - invalid decision / override combinations fail explicitly
  - no write path other than canonical `parent_verifications` is introduced
  - no mastery, evidence, durable issue, or learning-item mutation is added in
    this pass
- QA requirements:
  - verify repeated runs with the same candidate input produce consistent
    verification payload shapes
  - verify authentic-writing source refs are preserved on persisted
    verification records
  - verify `accepted` cannot carry verified override fields
  - verify `overridden` requires at least one changed verified educational
    field
  - verify note alone does not count as an override
  - verify `false_positive` and `not_a_learning_issue` reject verified
    override fields
  - verify no touched file introduces:
    - `writing_issues` writes
    - `learning_items` writes
    - mastery updates
    - route-local verification ownership
    - a parallel authentic-writing verification store
- Boundary with `3C`:
  - `3B` ends at persisted, auditable parent verification for
    authentic-writing hypotheses
  - `3C` owns the bridge from accepted and overridden authentic-writing
    verified outcomes into durable `writing_issue` truth
  - rejected `3B` outcomes must remain auditable without being promoted into
    durable issue truth in `3B`

`3C` Verified authentic-writing outcome bridge into durable issue truth
- Status:
  - complete
- Goal:
  - connect accepted and overridden authentic-writing outcomes into the
    existing durable `writing_issue` lifecycle
- Scope:
  - preserve submission lineage
  - preserve verified educational truth
  - keep downstream learning-item creation on the existing targeted-writing
    path
- Must not:
  - create a parallel issue-history model
  - bypass final classification rules from the targeted-writing contract
  - collapse rejected outcomes into mastery-updating issue truth
- Behaviour contract:
  - `3C` consumes only verified authentic-writing outcomes from `Stage 3B`
  - `3C` may promote only `accepted` and `overridden` authentic-writing
    outcomes into durable `writing_issue` truth
  - `3C` must preserve:
    - original suggestion truth
    - parent decision
    - parent-verified educational truth
    - authentic-writing submission provenance from `Stage 3A` and `3B`
  - `false_positive` and `not_a_learning_issue` outcomes must remain auditable
    without creating durable `writing_issues`
  - invalid verified-outcome shapes or missing lineage required for durable
    issue truth must fail explicitly rather than creating partial issue records
- Architecture boundaries:
  - write ownership for `3C` is limited to the existing durable issue
    lifecycle, including canonical targeted-writing issue storage
  - `3C` must remain under the shared `lib/writing-engine` orchestration
    boundary
  - `3C` must not create or mutate:
    - `learning_items`
    - `learning_item_evidence`
    - mastery state
    - rewards or analytics truth
  - `3C` must not move durable issue orchestration into route-local `app/*`
    code or a dedicated authentic-writing-only issue system
- Non-goals:
  - no mastery updates yet
  - no learning-item creation yet
  - no learning-item evidence creation yet
  - no assignment or reward orchestration
  - no punctuation / sentence / grammar broadening
  - no route-local durable issue ownership
- Acceptance criteria:
  - accepted and overridden authentic-writing verified outcomes from `Stage 3B`
    can be promoted into the existing durable `writing_issue` lifecycle
  - durable issue records preserve original suggestion truth,
    parent-verified truth, and authentic-writing submission provenance
  - `false_positive` and `not_a_learning_issue` verified outcomes remain
    auditable without creating durable issue truth
  - no write path outside canonical durable issue storage is introduced
  - no mastery, learning-item, evidence, reward, or analytics mutation is
    added in this pass
- QA requirements:
  - verify accepted authentic-writing verified outcomes create durable issue
    truth with preserved submission lineage
  - verify overridden authentic-writing verified outcomes create durable issue
    truth with preserved parent-verified educational fields
  - verify `false_positive` and `not_a_learning_issue` outcomes do not create
    durable `writing_issues`
  - verify original suggestion truth remains auditable alongside durable issue
    truth
  - verify no touched file introduces:
    - mastery updates
    - `learning_items` writes
    - `learning_item_evidence` writes
    - route-local issue orchestration
    - a parallel durable issue lifecycle

Boundary with Stage `4`:
- `3C` ends at durable spelling issue truth for authentic-writing outcomes
- Stage `4` may reuse the proven Stage `3` path shape for
  punctuation-specific hypothesis generation, verification, and durable issue
  promotion
- `3C` must not preemptively broaden into punctuation-specific taxonomy,
  punctuation-specific verification, or punctuation-specific issue ownership

Boundary with Stage `4`:
- Stage `3` proves the authentic-writing submission-analysis path for spelling
  only
- Stage `4` may reuse that path for punctuation-specific hypothesis
  generation
- Stage `3` must not preemptively broaden into punctuation-specific rules,
  punctuation-specific taxonomy, or punctuation-specific issue ownership

Parent Stage `3` closeout:
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
  - `npm run writing-engine:authentic-verification-regression`
  - `npm run writing-engine:authentic-issue-promotion-regression`
  - `npm run writing-engine:verification-regression`
  - `npm run writing-engine:error-category-regression`
  - `npm run writing-engine:primary-mapping-regression`
  - `npm run writing-engine:ambiguous-mapping-regression`
  - `npm run writing-engine:lesson-template-regression`
  - `npm run writing-engine:word-complexity-regression`
  - `npm run writing-engine:similar-practice-regression`
  - `npx tsc --noEmit`
- Parent Stage `3` residual risks:
  - no contract drift was found in `Stage 3`

Next safe implementation pass:
- bounded `Stage 4B` punctuation parent verification

Exact next-pass prompt:
- Implement bounded `Stage 4B` only.
- Add shared parent-verification persistence for `Stage 4A` punctuation
  authentic-writing hypotheses through the existing shared
  `parent_verifications` contract.
- Reuse the existing authentic-writing verification invariants from `Stage 3B`.
- Preserve original suggestion truth, parent-verified truth, canonical
  `task_submission` / `writing_sample` lineage, and punctuation source span /
  target text metadata.
- Support only:
  - `accepted`
  - `overridden`
  - `false_positive`
  - `not_a_learning_issue`
- Do not add durable `writing_issues` writes, `writing_issue_suggestions`
  writes, `learning_items` writes, `learning_item_evidence` writes, mastery
  updates, assignment/reward/UI/server-action work, or sentence-boundary /
  grammar verification logic.
- If implementation requires a new verification model, sentence-boundary
  semantics, grammar semantics, or new taxonomy truth, stop and return to docs
  first.

### Stage 4 — Punctuation module

Status: `Complete`

Goal:
- prove that the authentic-writing Stage `3` path can be reused for
  punctuation-only issue handling without broadening into sentence-boundary or
  grammar modules

Behaviour contract:
- Stage `4` is punctuation-only
- Stage `4` reuses the proven Stage `3` path shape:
  - `4A` punctuation candidate hypothesis generation
  - `4B` shared parent verification for punctuation hypotheses
  - `4C` verified punctuation outcome bridge into durable issue truth
- canonical inputs begin from authentic-writing repo truth such as:
  - `task_submissions`
  - `writing_samples`
- raw punctuation analysis output is candidate-hypothesis truth only:
  - it is not durable issue truth by itself
  - it is not mastery truth by itself
  - it is not transfer evidence by itself
- accepted and overridden verified punctuation outcomes may create durable
  issue truth through the existing shared lifecycle
- `false_positive` and `not_a_learning_issue` punctuation outcomes remain
  auditable and must not create durable issue truth
- Stage `4` must preserve original suggestion truth alongside parent-verified
  truth

Architecture boundaries:
- new logic must remain under the shared Writing Engine boundary
- parent verification remains anchored by `parent_verifications`
- durable issue truth remains anchored by:
  - `writing_issue_suggestions`
  - `writing_issues`
  - `writing_issue_correction_attempts`
- canonical mini-skill identity remains anchored by `micro_skill_catalog`
  where a punctuation `micro_skill_key` is available
- Stage `4` must not move analysis, verification, or issue promotion into
  route-local `app/*` code or retired spelling runtime helpers

Non-goals:
- no sentence-boundary detection
- no sentence-formation diagnosis
- no grammar/usage diagnosis
- no broad proofreading ownership
- no mastery updates
- no `learning_items` writes
- no `learning_item_evidence` writes
- no assignment-generation changes
- no `word_progress`
- no external API truth owner

Acceptance criteria:
- punctuation-only candidate hypotheses can be built from canonical
  authentic-writing inputs through the shared engine boundary
- shared parent verification can persist accepted, overridden,
  `false_positive`, and `not_a_learning_issue` punctuation outcomes while
  preserving source lineage and suggestion-vs-verified truth
- accepted and overridden verified punctuation outcomes can create durable
  `writing_issues` through the existing shared issue lifecycle
- rejected punctuation outcomes remain auditable without creating durable issue
  truth
- repeated runs against the same inputs remain deterministic for the same
  canonical data
- no sentence-boundary or grammar logic is introduced

QA requirements:
- add focused punctuation candidate-generation regression coverage for `4A`
- add focused punctuation verification regression coverage for `4B`
- add focused punctuation issue-promotion regression coverage for `4C`
- verify existing shared verification invariants still pass
- verify existing authentic-writing Stage `3` regression coverage still passes
- verify no touched file introduces:
  - mastery updates
  - `learning_items` writes
  - `learning_item_evidence` writes
  - route-local analysis/verification/issue ownership
  - sentence-boundary or grammar broadening

Implementation breakdown:
- `4A` punctuation hypothesis generation from authentic-writing inputs
  - complete
- `4B` shared parent verification reuse for punctuation hypotheses
  - complete
- `4C` verified punctuation outcome bridge into durable issue truth

Stage `4A` closeout:
- `4A` is complete
- `4A` delivered:
  - punctuation-only authentic-writing candidate hypothesis generation
  - reuse of canonical authentic-writing source normalization/provenance from
    `Stage 3`
  - shared candidate-hypothesis output shape for later parent verification
  - deterministic output for the same canonical input
  - explicit unresolved outcomes for unsupported punctuation cases
  - explicit unresolved outcomes where sentence-boundary or grammar semantics
    would be required
- `4A` did not introduce:
  - `parent_verifications` writes
  - `writing_issues` writes
  - `writing_issue_suggestions` writes
  - `writing_issue_correction_attempts` writes
  - `learning_items` writes
  - `learning_item_evidence` writes
  - mastery updates
  - `assignment_items` writes
  - reward logic
  - analytics/dashboard work
  - UI
  - server actions
  - route-local analysis ownership
  - retired spelling runtime revival
  - `word_progress`
  - external API/model dependency in the runtime-critical path
- `4A` QA evidence:
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
- `4A` residual risks:
  - Stage `4A` intentionally leaves punctuation taxonomy resolution for later
    bounded passes
  - Stage `4A` intentionally leaves shared parent verification for `Stage 4B`
  - Stage `4A` intentionally leaves durable issue promotion for `Stage 4C`
  - cases requiring sentence-boundary or grammar semantics remain explicit
    unresolved outcomes rather than inferred classifications
  - coverage is regression-based rather than DB-backed or app-triggered

Stage `4B` closeout:
- `4B` is complete
- `4B` delivered:
  - shared parent-verification persistence for `Stage 4A` punctuation
    authentic-writing hypotheses
  - reuse of the existing shared `parent_verifications` contract
  - reuse of the existing authentic-writing verification invariants from
    `Stage 3B`
  - bounded support for:
    - `accepted`
    - `overridden`
    - `false_positive`
    - `not_a_learning_issue`
  - preserved original suggestion truth and parent-verified truth
  - preserved canonical `task_submission` / `writing_sample` lineage
  - preserved punctuation source span / target text metadata
- `4B` did not introduce:
  - durable `writing_issues` writes
  - `writing_issue_suggestions` writes
  - `learning_items` writes
  - `learning_item_evidence` writes
  - mastery updates
  - assignment writes
  - reward logic
  - analytics/dashboard work
  - UI
  - server actions
  - route-local verification ownership
  - parallel verification store
  - sentence-boundary logic
  - grammar verification logic
  - external API/model dependency in the runtime-critical path
- `4B` QA evidence:
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
- `4B` residual risks:
  - Stage `4B` intentionally leaves durable punctuation issue promotion for
    `Stage 4C`
  - accepted punctuation verifications can preserve null educational
    classification fields when the `Stage 4A` hypothesis did not assign them
  - sentence-boundary and grammar-dependent punctuation cases remain outside
    `Stage 4B` and must not be verified here
  - coverage is regression-based rather than DB-backed or app-triggered
- next safe task after `Stage 4B` closeout is bounded `Stage 4C`
  implementation
- next Codex prompt:
  - implement bounded `Stage 4C` only
  - add the verified punctuation outcome bridge from shared parent verification
    truth into durable punctuation issue truth
  - consume only verified `Stage 4B` punctuation authentic-writing outcomes
  - preserve original suggestion truth, parent-verified truth, canonical
    `task_submission` / `writing_sample` lineage, and punctuation source span /
    target text metadata
  - write durable punctuation issue truth through the existing shared
    `writing_issues` / `writing_issue_suggestions` ownership path only if that
    path is already documented for `Stage 4C`
  - do not add `learning_items`, `learning_item_evidence`, mastery updates,
    assignment/reward/UI/server-action work, sentence-boundary logic, grammar
    verification logic, or route-local issue ownership
  - if implementation requires new punctuation taxonomy truth, new
    sentence-boundary semantics, new grammar semantics, or new durable schema
    ownership, stop and return to docs first

Parent Stage `4` closeout:
- `Stage 4` is complete
- `Stage 4` delivered:
  - punctuation-only authentic-writing candidate hypothesis generation
  - shared parent verification for punctuation hypotheses through canonical
    `parent_verifications`
  - verified punctuation outcome bridge into canonical durable
    `writing_issues`
  - preserved original suggestion truth and parent-verified truth
  - preserved authentic-writing lineage, including `task_submission` /
    `writing_sample` provenance and punctuation source span / target text
    metadata
  - explicit unresolved outcomes in `4A`
  - explicit auditable rejection outcomes in `4B` and `4C`
- `Stage 4` did not introduce:
  - sentence-boundary detection/classification as Stage `4` ownership
  - sentence-formation diagnosis
  - grammar/usage diagnosis
  - broad proofreading ownership
  - `word_progress` as canonical truth
  - route-local analysis, verification, or issue ownership
  - parallel punctuation verification or issue-history systems
  - fake mastery/evidence truth
  - `learning_items` or `learning_item_evidence` writes in `Stage 4`
  - reward logic as mastery truth
  - undocumented UI/server-action delivery scope
  - undocumented taxonomy or provenance models
  - external API/model truth ownership
- `Stage 4` QA evidence:
  - `npm run writing-engine:punctuation-candidate-regression`
  - `npm run writing-engine:punctuation-verification-regression`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
  - `npm run writing-engine:authentic-submission-regression`
  - `npm run writing-engine:authentic-verification-regression`
  - `npm run writing-engine:authentic-issue-promotion-regression`
  - `npm run writing-engine:verification-regression`
  - `npm run writing-engine:diagnostic-regression`
  - `npx tsc --noEmit`
- `Stage 4` residual risks:
  - regression-based coverage rather than DB-backed or app-triggered
  - accepted punctuation outcomes still require resolved educational truth to
    be promotable
  - optional runtime smoke validation remains separate follow-up work
- next safe pass after `Stage 4` closeout is a documentation-first
  preparation pass for `Stage 5`

Boundary with Stage `5`:
- Stage `4` ends at punctuation-only authentic-writing issue handling
- Stage `5` owns sentence-boundary / sentence-formation logic
- Stage `4` must not introduce sentence-boundary heuristics, sentence-splitting
  issue types, or grammar fallback ownership
- if punctuation implementation needs sentence-boundary or grammar semantics to
  be correct, stop and update the docs before code is written

### Stage 5 — Sentence-boundary module

Status: `In progress`

Goal:
- introduce the first sentence-boundary / sentence-formation authentic-writing
  module on the proven shared Writing Engine path without broadening into
  grammar, proofreading, or transfer ownership

Documentation gate:
- implementation must not begin until the Stage `5` contract is documented in
  the active canonical docs
- if implementation pressure requires a new sentence-boundary taxonomy source,
  a new verification model, a new durable issue store, or grammar/proofreading
  fallback ownership, stop and update the docs first
- Stage `5` must be implemented in bounded passes rather than as one broad
  sentence-quality rewrite

Build:
- sentence-boundary / sentence-formation candidate hypothesis generation from
  canonical authentic-writing inputs
- shared parent verification reuse for sentence-boundary hypotheses
- verified sentence-boundary outcome bridge into durable issue truth

Stage `5` behaviour contract:
- Stage `5` is the sentence-boundary / sentence-formation reuse of the proven
  Stage `3` and Stage `4` authentic-writing path
- canonical inputs continue to begin from repo-owned authentic-writing truth:
  - `task_submissions`
  - `writing_samples`
- raw sentence-boundary analysis output is candidate-hypothesis truth only:
  - it is not durable issue truth by itself
  - it is not mastery truth by itself
  - it is not transfer evidence by itself
- accepted and overridden parent-verified sentence-boundary outcomes may be
  promoted into the existing durable `writing_issue` lifecycle
- `false_positive` and `not_a_learning_issue` outcomes remain auditable and
  must not create durable issue truth
- source lineage and sentence-boundary source metadata must remain preserved
  from candidate hypothesis through verification and issue promotion

Parent Stage `5` planned mini-tasks:
- `5A` sentence-boundary candidate hypothesis generation from authentic-writing
  inputs
- `5B` shared parent verification reuse for sentence-boundary hypotheses
- `5C` verified sentence-boundary outcome bridge into durable issue truth

Stage `5` architecture boundaries:
- new logic must remain under the shared Writing Engine boundary:
  - `lib/writing-engine/types.ts`
  - `lib/writing-engine/core`
  - `lib/writing-engine/persistence`
- parent-verification truth remains anchored by `parent_verifications`
- durable authentic-writing issue truth remains anchored by:
  - `writing_issue_suggestions`
  - `writing_issues`
  - `writing_issue_correction_attempts`
- Stage `5` must not move canonical analysis, verification, or issue
  promotion ownership into route-local `app/*` code, retired spelling runtime
  helpers, or external API truth owners

Stage `5` non-goals:
- no grammar/usage module
- no broad proofreading or editing ownership
- no mastery/evidence updates
- no `learning_items` writes
- no `learning_item_evidence` writes
- no `assignment_items` writes
- no reward, UI, or server-action work
- no free-text fallback taxonomy or generic sentence-quality bucket

Stage `5` acceptance criteria:
- `5A` can produce bounded sentence-boundary candidate hypotheses from
  canonical authentic-writing inputs while preserving canonical source lineage
- unresolved or out-of-scope cases remain explicit when they require:
  - grammar/usage semantics
  - broad proofreading ownership
  - unsupported sentence-boundary interpretation
- `5B` persists accepted / overridden / `false_positive` /
  `not_a_learning_issue` outcomes through the shared `parent_verifications`
  contract while preserving original suggestion truth vs verified truth
- `5C` promotes only accepted and overridden verified sentence-boundary
  outcomes into the existing durable `writing_issue` lifecycle
- rejected outcomes remain auditable without creating durable issue truth
- no parallel verification store, issue store, mastery path, or route-local
  ownership is introduced

Stage `5` QA requirements:
- add focused regression coverage for:
  - `5A` sentence-boundary candidate generation
  - `5B` sentence-boundary verification
  - `5C` sentence-boundary issue promotion
- verify the following still pass:
  - `npm run writing-engine:punctuation-candidate-regression`
  - `npm run writing-engine:punctuation-verification-regression`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
  - `npm run writing-engine:authentic-submission-regression`
  - `npm run writing-engine:authentic-verification-regression`
  - `npm run writing-engine:authentic-issue-promotion-regression`
  - `npm run writing-engine:verification-regression`
  - `npm run writing-engine:diagnostic-regression`
  - `npx tsc --noEmit`

Boundary with Stage `6`:
- Stage `5` ends at sentence-boundary / sentence-formation authentic-writing
  issue handling
- Stage `6` owns:
  - grammar/usage module work
  - broad proofreading / editing module work
  - richer transfer evidence flows
  - broader analytics and calibration
- Stage `5` must not introduce grammar-only classifications, broad
  proofreading ownership, or transfer-stage mastery logic

Stage `5A` closeout status:
- `Stage 5A` is complete

Stage `5A` delivered:
- bounded sentence-boundary / sentence-formation candidate hypothesis
  generation under the shared Writing Engine boundary
- reuse of the canonical authentic-writing source normalization and source
  provenance path established by `Stage 3A` and reused by `Stage 4A`
- supported bounded sentence-boundary candidate hypotheses for:
  - missing sentence-ending punctuation
  - missing space after sentence-ending punctuation
  - sentence-start capitalization gaps
- preserved source span, target text, and context metadata in source-ref
  metadata where available
- explicit unresolved outcomes for:
  - unsupported sentence-boundary patterns
  - cases requiring grammar semantics
  - cases requiring broad proofreading semantics
- preserved `5A` boundaries:
  - read/build only
  - shared Writing Engine boundary only
  - no parent-verification writes
  - no durable issue writes
  - no `learning_items`, `learning_item_evidence`, or `assignment_items`
    writes
  - no mastery updates
  - no route-local ownership
  - no free-text taxonomy invention

Stage `5A` QA evidence:
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

Stage `5A` residual risks:
- category, mini-skill, and template truth remain intentionally unresolved in
  this bounded pass
- sentence-boundary verification remains intentionally deferred to `Stage 5B`
- durable sentence-boundary issue promotion remains intentionally deferred to
  `Stage 5C`
- coverage is regression-based rather than DB-backed or app-triggered

Stage `5B` closeout status:
- `Stage 5B` is complete

Stage `5B` delivered:
- shared `parent_verifications` persistence for `Stage 5A`
  sentence-boundary authentic-writing hypotheses through the existing shared
  contract
- reuse of the existing manual-diagnostic, authentic-writing, and punctuation
  verification invariants established by `Stage 1B`, `Stage 3B`, and `Stage 4B`
- bounded parent-decision support for:
  - `accepted`
  - `overridden`
  - `false_positive`
  - `not_a_learning_issue`
- preserved original suggestion truth and parent-verified truth on the shared
  verification result shape
- preserved canonical `task_submission` / `writing_sample` lineage and
  sentence-boundary source span / target text metadata into parent
  verification
- preserved `5B` boundaries:
  - shared parent-verification persistence only
  - accepted / overridden / `false_positive` / `not_a_learning_issue` only
  - shared Writing Engine boundary only
  - no `writing_issues` writes
  - no `learning_items`, `learning_item_evidence`, or `assignment_items`
    writes
  - no mastery updates
  - no route-local verification ownership
  - no parallel verification storage
  - no grammar/proofreading verification ownership
  - no free-text taxonomy invention

Stage `5B` QA evidence:
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

Stage `5B` residual risks:
- accepted sentence-boundary verifications can still preserve null
  educational classification fields because `Stage 5A` intentionally leaves
  category, mini-skill, and template truth unresolved
- durable sentence-boundary issue promotion remains intentionally deferred to
  `Stage 5C`
- coverage is regression-based rather than DB-backed or app-triggered

Stage `5C` closeout status:
- `Stage 5C` is complete

Stage `5C` delivered:
- verified sentence-boundary authentic-writing outcomes now bridge into the
  existing shared durable `writing_issues` lifecycle without introducing a new
  issue model
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
- preserved `5C` boundaries:
  - verified sentence-boundary outcome bridge into durable issue truth only
  - shared Writing Engine ownership only
  - no `learning_items`, `learning_item_evidence`, or `assignment_items`
    writes
  - no mastery/evidence writes
  - no route-local issue ownership
  - no grammar/proofreading broadening
  - no free-text taxonomy invention
  - no external API/model truth ownership
  - no reward-system changes
  - no revival of `word_progress` or retired spelling runtime ownership

Stage `5C` QA evidence:
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

Stage `5C` residual risks:
- accepted outcomes still depend on upstream educational truth being present;
  because `Stage 5A` intentionally leaves educational truth unresolved,
  accepted outcomes without verified or suggested micro-skill truth fail
  explicitly instead of promoting
- coverage is regression-based rather than DB-backed or app-triggered

Stage `5C` next safe task:
- parent `Stage 5` documentation closeout

Stage `5C` contract confirmation:
- `Stage 5C` stayed within the documented contract and introduced no
  implementation beyond the bounded `5A` / `5B` / `5C` sentence-boundary path

Parent Stage `5` closeout status:
- `Stage 5` is complete for its documented `5A` / `5B` / `5C` contract only

Parent Stage `5` now guarantees:
- bounded sentence-boundary / sentence-formation candidate hypothesis
  generation from canonical authentic-writing inputs
- shared parent-verification persistence for bounded sentence-boundary
  hypotheses
- bounded durable issue promotion for accepted and overridden
  sentence-boundary outcomes through the existing shared `writing_issues`
  lifecycle
- preserved canonical distinction between:
  - candidate-hypothesis truth
  - parent-verified truth
  - durable issue truth
  - future active `learning_item` truth

Parent Stage `5` architecture boundaries remained intact:
- shared Writing Engine ownership only
- canonical authentic-writing provenance preserved
- no undocumented route-local ownership
- no grammar/proofreading broadening
- no free-text taxonomy invention
- no external API/model truth ownership
- no `learning_items`, `learning_item_evidence`, or `assignment_items` writes
  beyond documented Stage `5` boundaries
- no mastery/evidence writes beyond documented Stage `5` boundaries
- no reward-system changes
- no revival of `word_progress` or retired spelling runtime ownership

Parent Stage `5` QA evidence summary:
- focused `5A`, `5B`, and `5C` regressions passed
- upstream shared regression suites for `Stage 1B`, `Stage 3A` / `3B` / `3C`,
  and `Stage 4A` / `4B` / `4C` passed
- `npx tsc --noEmit` passed with exit code `0` and no output

Parent Stage `5` residual risks:
- `Stage 5` remains intentionally bounded; broader grammar/usage and
  proofreading ownership remain deferred to `Stage 6`
- some accepted outcomes still depend on upstream educational truth being
  present because `Stage 5A` intentionally leaves category, mini-skill, and
  template truth unresolved in bounded cases
- coverage is regression-based rather than DB-backed or app-triggered

Parent Stage `5` boundary to the next stage:
- `Stage 5` ends at sentence-boundary / sentence-formation authentic-writing
  issue handling
- `Stage 6` remains the next boundary for grammar/usage work, broad
  proofreading/editing work, richer transfer evidence flows, and broader
  analytics/calibration

Parent Stage `5` contract confirmation:
- parent `Stage 5` is complete only within the documented `5A` / `5B` / `5C`
  contract and does not authorize any additional Stage `5` implementation

Next safe task:
- documentation-first preparation and closeout alignment for `Stage 6`

### Stage 6 — Grammar, proofreading, and transfer refinement

Status: `Planned`

Goal:
- introduce the smallest safe grammar/proofreading-adjacent authentic-writing
  contract on the proven shared Writing Engine path without turning Stage `6`
  into a broad AI writing checker, route-local correction engine, transfer
  scorer, or analytics rewrite

Documentation gate:
- implementation must not begin until the Stage `6` contract is documented in
  the active canonical docs
- if implementation pressure requires a new truth owner, a new route-local
  analysis path, LLM/external API educational truth, free-text taxonomy,
  mastery/evidence writes before parent verification, or combined
  grammar/proofreading/transfer/analytics scope, stop and update the docs first
- Stage `6` must be implemented in bounded mini-tasks rather than as one broad
  "writing quality" pass

Build:
- bounded grammar/proofreading candidate-hypothesis generation from canonical
  authentic-writing inputs
- shared parent verification reuse for bounded grammar/proofreading hypotheses
- verified bounded grammar/proofreading outcome bridge into durable issue truth
- later documentation-first planning for transfer/refinement evidence only if
  the mastery/evidence contract already supports the semantics needed
- later documentation-first planning for analytics/calibration only after
  evidence semantics are documented

Stage `6` behaviour contract:
- Stage `6` is the bounded grammar/proofreading-adjacent reuse of the proven
  Stage `3`, `4`, and `5` authentic-writing path
- canonical inputs continue to begin from repo-owned authentic-writing truth:
  - `task_submissions`
  - `writing_samples`
- Stage `6` must begin with the smallest safe pass:
  - `6A` read/build only
  - candidate hypotheses only
  - no verification writes
  - no durable issue writes
  - no mastery/evidence writes
  - no assignment, reward, analytics, or dashboard writes
- raw Stage `6` analysis output is candidate-hypothesis truth only:
  - it is not durable issue truth by itself
  - it is not mastery truth by itself
  - it is not transfer evidence by itself
  - it is not proofreading completion truth by itself
- accepted and overridden parent-verified Stage `6` outcomes may later be
  promoted into the existing durable `writing_issue` lifecycle only through a
  bounded follow-up pass
- `false_positive` and `not_a_learning_issue` outcomes remain auditable and
  must not create durable issue truth, mastery truth, or transfer truth
- Stage `6` must not bypass the proven path:
  - candidate hypothesis
  - parent verification
  - verified outcome
  - durable issue truth
- Stage `6` must not create or update:
  - `learning_items`
  - `learning_item_evidence`
  - `learning_item_issue_links`
  - `assignment_items`
  - reward tables
  - analytics truth
  unless a later bounded Stage `6` sub-stage explicitly documents that new
  responsibility
- Stage `6` must not invent free-text taxonomy or free-text
  `micro_skill_key` values
- source lineage and bounded grammar/proofreading source metadata must remain
  preserved from candidate hypothesis through any later verification and issue
  promotion pass

Parent Stage `6` planned mini-tasks:
- `6A` bounded grammar/proofreading candidate-hypothesis contract and source
  boundary
- `6B` shared parent verification reuse for bounded grammar/proofreading
  hypotheses
- `6C` verified bounded grammar/proofreading outcome bridge into durable issue
  truth
- `6D` transfer/refinement evidence planning only if the existing
  mastery/evidence contract already supports the required semantics
- `6E` analytics/calibration planning only after evidence semantics are
  explicitly documented

Why this split is required:
- grammar/proofreading detection can reuse the existing authentic-writing path
  safely in the same way Stages `3` to `5` did
- transfer evidence semantics and analytics/calibration ownership are broader
  architecture questions and should not be coupled to the first
  grammar/proofreading candidate pass
- combining grammar, proofreading, transfer, analytics, and calibration in one
  implementation pass would violate the established bounded-stage pattern and
  would risk introducing a broad correction engine without canonical truth
  boundaries

Stage `6` source-of-truth rules:
- canonical authentic-writing input truth remains:
  - `task_submissions`
  - `writing_samples`
- candidate-hypothesis shaping must remain inside the shared Writing Engine
  boundary under:
  - `lib/writing-engine/types.ts`
  - `lib/writing-engine/core`
- parent-verification truth, when introduced in `6B`, remains anchored by:
  - `parent_verifications`
- durable authentic-writing issue truth, when introduced in `6C`, remains
  anchored by:
  - `writing_issue_suggestions`
  - `writing_issues`
  - `writing_issue_correction_attempts`
- taxonomy truth remains curated and repo-owned through the existing catalog
  and contract docs; no Stage `6` pass may create free-text educational truth
- mastery/evidence truth remains owned by the existing mastery/evidence
  contract and is not expanded by `6A`, `6B`, or `6C`
- transfer evidence truth and analytics/calibration truth remain deferred
  until later documented Stage `6D` / `6E` planning passes
- no route-local `app/*` surface, no retired spelling runtime helper, and no
  external API/model may become a canonical truth owner

Stage `6` architecture boundaries:
- new logic must remain under the shared Writing Engine boundary:
  - `lib/writing-engine/types.ts`
  - `lib/writing-engine/core`
  - `lib/writing-engine/persistence`
- Stage `6A` may add only bounded candidate-hypothesis generation and
  canonical source-lineage preservation for supported grammar/proofreading
  cases
- Stage `6B` may add only shared `parent_verifications` persistence reuse for
  supported `6A` hypotheses
- Stage `6C` may add only bounded orchestration that promotes accepted and
  overridden `6B` outcomes into the existing durable `writing_issue` lifecycle
- Stage `6D` and `6E` are planning/documentation passes first; they do not
  authorize implementation merely by being named here
- Stage `6` must not move canonical analysis, verification, issue promotion,
  transfer interpretation, or analytics ownership into route-local `app/*`
  code, retired spelling runtime helpers, or external API truth owners

Stage `6` non-goals:
- no general grammar checker
- no general proofreading or editing engine
- no route-local correction ownership
- no external API or LLM truth ownership
- no mastery/evidence updates before parent verification
- no `learning_items` writes
- no `learning_item_evidence` writes
- no `learning_item_issue_links` writes
- no `assignment_items` writes
- no reward changes
- no analytics dashboard work
- no mastery scoring recalibration
- no transfer-stage promotion logic
- no free-text fallback taxonomy or generic "writing quality" bucket
- no combining grammar, proofreading, transfer, analytics, and calibration in
  one implementation pass

Stage `6` acceptance criteria:
- `6A` can produce bounded grammar/proofreading candidate hypotheses from
  canonical authentic-writing inputs while preserving canonical source lineage
- `6A` remains conservative:
  - read/build only
  - no verification writes
  - no durable issue writes
  - no mastery/evidence writes
  - no assignment/reward/analytics writes
- unsupported or out-of-scope cases remain explicit when they require:
  - new grammar taxonomy truth not already documented
  - broad proofreading ownership
  - transfer interpretation
  - analytics/calibration semantics
  - broad style or composition judgment
- `6B`, if implemented later, persists only accepted / overridden /
  `false_positive` / `not_a_learning_issue` outcomes through the shared
  `parent_verifications` contract while preserving original suggestion truth
  vs verified truth
- `6C`, if implemented later, promotes only accepted and overridden verified
  Stage `6` outcomes into the existing durable `writing_issue` lifecycle
- rejected outcomes remain auditable without creating durable issue truth,
  mastery truth, transfer truth, or analytics truth
- no parallel verification store, issue store, mastery path, assignment path,
  or route-local ownership is introduced

Stage `6` QA requirements:
- add focused regression coverage for:
  - `6A` bounded grammar/proofreading candidate generation
  - `6B` bounded grammar/proofreading verification before any `6C` work
  - `6C` bounded grammar/proofreading issue promotion before any `6D` or `6E`
    work
- verify the following still pass after each implemented sub-stage:
  - `npm run writing-engine:sentence-boundary-candidate-regression`
  - `npm run writing-engine:sentence-boundary-verification-regression`
  - `npm run writing-engine:sentence-boundary-issue-promotion-regression`
  - `npm run writing-engine:punctuation-candidate-regression`
  - `npm run writing-engine:punctuation-verification-regression`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
  - `npm run writing-engine:authentic-submission-regression`
  - `npm run writing-engine:authentic-verification-regression`
  - `npm run writing-engine:authentic-issue-promotion-regression`
  - `npm run writing-engine:verification-regression`
  - `npm run writing-engine:diagnostic-regression`
  - `npx tsc --noEmit`
- verify no touched file introduces:
  - route-local correction ownership
  - external API/model truth ownership
  - mastery/evidence writes before parent verification
  - durable issue writes in `6A`
  - transfer evidence writes in `6A`, `6B`, or `6C`
  - analytics/dashboard work
  - free-text taxonomy invention

Stage `6` stop-and-return-to-docs rules:
- stop if `6A` needs a new grammar taxonomy source, a catch-all proofreading
  taxonomy, or a free-text `micro_skill_key` fallback to proceed
- stop if `6A` needs parent verification writes, durable issue writes,
  mastery/evidence writes, assignment writes, reward writes, or analytics
  writes to be considered useful
- stop if `6B` needs a new verification model, new parent-decision type, or a
  parallel verification store
- stop if `6C` needs a new durable issue store, direct mastery promotion, or
  transfer evidence ownership
- stop if transfer/refinement work needs new source types, new evidence
  semantics, or new parent-facing mastery states before `6D` documents them
- stop if analytics/calibration work needs new canonical metrics ownership or
  rendering truth before `6E` documents them

Boundary with the next stage:
- the first safe implementation boundary after this documentation pass is
  `Stage 6A` only
- `6A` does not authorize `6B`, `6C`, `6D`, or `6E`
- `6B` is the next stage after `6A` and owns shared verification reuse only
- `6C` is the next stage after `6B` and owns durable issue promotion only
- `6D` and `6E` are later planning boundaries and must not be folded into the
  first implementation pass
- no Stage `7` work is authorized by this contract; anything beyond the
  documented `6A` / `6B` / `6C` / `6D` / `6E` split must return to docs first

First safe implementation pass: `Stage 6A`
- create the smallest safe Stage `6` slice first
- limit `6A` to read/build behavior only:
  - read canonical authentic-writing inputs
  - build shared bounded grammar/proofreading candidate hypotheses
  - preserve canonical source refs and supported educational metadata
  - do not yet persist parent verification
  - do not yet create durable issue truth
- `6A` may support only bounded grammar/proofreading cases that can be
  expressed without broad correction-engine ownership
- `6A` must explicitly return unresolved or out-of-scope outcomes for:
  - cases requiring undocumented taxonomy truth
  - cases requiring transfer interpretation
  - cases requiring broad proofreading ownership
  - cases requiring analytics/calibration semantics
  - cases requiring external model judgment

Stage `6A` explicit non-goals:
- no verification writes
- no durable issue writes
- no mastery/evidence writes
- no `learning_items`, `learning_item_evidence`, or
  `learning_item_issue_links` writes
- no assignment writes
- no reward changes
- no dashboards
- no route-local ownership
- no external API/model truth dependency

Stage `6A` acceptance criteria:
- `6A` produces deterministic bounded grammar/proofreading candidate
  hypotheses for supported canonical authentic-writing inputs
- `6A` preserves canonical lineage to:
  - `task_submission`
  - `writing_sample`
  - source span or equivalent bounded source metadata where available
  - target text
  - child attempt text where available
- `6A` emits explicit unresolved outcomes for unsupported or ambiguous cases
  instead of silently widening scope
- `6A` introduces no writes outside candidate-building internals
- no route-local or external truth owner is introduced

Stage `6A` QA checklist:
- add focused `6A` regression coverage for deterministic candidate generation
- verify repeated runs against the same canonical input produce the same
  supported candidate or unresolved outcome set
- verify preserved source lineage is present on supported candidates
- verify unsupported cases remain explicit rather than coerced into generic
  grammar/proofreading buckets
- verify all upstream Stage `1B`, `3`, `4`, and `5` regression suites still
  pass
- verify `npx tsc --noEmit` passes

Exact first-pass implementation prompt:
- Implement `Stage 6A` only under the shared Writing Engine boundary.
- Documentation-first constraints are mandatory: read/build only, candidate
  hypotheses only, no verification writes, no durable issue writes, no
  mastery/evidence writes, no `learning_items`, no `learning_item_evidence`,
  no `learning_item_issue_links`, no `assignment_items`, no rewards, no
  analytics, no dashboards, no route-local ownership, and no external API or
  model truth dependency.
- Reuse canonical authentic-writing inputs from `task_submissions` and
  `writing_samples` and preserve canonical source refs on every supported
  candidate.
- Support only the smallest bounded grammar/proofreading cases that can be
  represented without broad correction-engine ownership; emit explicit
  unresolved outcomes for cases that require undocumented taxonomy truth,
  transfer semantics, analytics/calibration semantics, or broad proofreading
  ownership.
- Preserve the proven candidate-hypothesis contract used by Stages `3A`, `4A`,
  and `5A`, and add focused deterministic regression coverage plus upstream
  regression checks and `npx tsc --noEmit`.

Stage `6A` closeout status:
- `Stage 6A` is complete

Stage `6A` delivered:
- shared-boundary bounded grammar/proofreading candidate generation under:
  - `lib/writing-engine/grammar/stage6a-authentic-submission-analysis.ts`
- reuse of the canonical authentic-writing source normalization and source
  provenance path established by `Stage 3A` and reused by `Stage 4A` and
  `Stage 5A`
- supported bounded `Stage 6A` candidates for:
  - standalone lowercase pronoun `i` -> `I`
  - repeated internal spacing between words
- explicit unresolved outcomes for:
  - article-choice patterns that would require undocumented grammar taxonomy
    truth
  - quotation-mark patterns that would require broad proofreading ownership
- preserved canonical lineage including:
  - `task_submission`
  - `writing_sample`
  - source span metadata
  - target text
  - child attempt text
- preserved `6A` boundaries:
  - shared Writing Engine ownership only
  - read/build only
  - candidate-hypothesis generation only
  - no verification writes
  - no durable issue writes
  - no mastery/evidence writes
  - no `learning_items`, `learning_item_evidence`, or
    `learning_item_issue_links` writes
  - no `assignment_items` writes
  - no reward, analytics, dashboard, UI, or server-action work
  - no route-local ownership
  - no external API/model truth ownership
  - no free-text taxonomy invention
  - no revival of `word_progress` or retired spelling runtime ownership

Stage `6A` QA evidence:
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

Stage `6A` residual risks:
- candidate coverage is intentionally narrow and does not yet broaden into
  general grammar or broad proofreading ownership
- unsupported transfer, analytics/calibration, and external-judgment cases
  remain deferred to later documented stages rather than being inferred here
- coverage is regression-based rather than DB-backed or app-triggered

Stage `6A` next safe task:
- bounded `Stage 6B` shared parent-verification reuse for `Stage 6A`
  grammar/proofreading hypotheses

Stage `6A` contract confirmation:
- `Stage 6A` stayed within the documented candidate-only contract and did not
  introduce implementation beyond the bounded `6A` grammar/proofreading
  authentic-writing path

Stage `6B` closeout status:
- `Stage 6B` is complete

Stage `6B` delivered:
- shared-boundary grammar/proofreading parent-verification persistence under:
  - `lib/writing-engine/grammar/stage6b-authentic-submission-verification.ts`
- reuse of the existing shared `parent_verifications` contract and the
  established authentic-writing verification semantics from `Stage 3B`,
  `Stage 4B`, and `Stage 5B`
- supported bounded `Stage 6B` parent decisions for:
  - `accepted`
  - `overridden`
  - `false_positive`
  - `not_a_learning_issue`
- preserved:
  - original suggestion truth
  - parent decision
  - parent-verified truth
  - canonical authentic-writing provenance
  - `sourceSpan`, `targetText`, and `childAttemptText` metadata where
    available
- preserved `6B` boundaries:
  - shared Writing Engine ownership only
  - write path limited to `parent_verifications`
  - no durable issue promotion
  - no mastery/evidence writes
  - no `learning_items`, `learning_item_evidence`, or
    `learning_item_issue_links` writes
  - no `assignment_items` writes
  - no reward, analytics, dashboard, UI, or server-action work
  - no route-local verification ownership
  - no parallel grammar/proofreading verification store
  - no free-text taxonomy or free-text `micro_skill_key` invention
  - no external API/model truth ownership
  - no revival of `word_progress` or retired spelling runtime ownership

Stage `6B` QA evidence:
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

Stage `6B` residual risks:
- verification remains intentionally bounded to `Stage 6A` grammar and
  proofreading candidates only
- durable grammar/proofreading issue promotion remains deferred to `Stage 6C`
- `Stage 6A` candidate coverage remains intentionally narrow
- coverage is regression-based rather than DB-backed or app-triggered

Stage `6B` next safe task:
- bounded `Stage 6C` verified grammar/proofreading outcome bridge into
  durable issue truth

Stage `6B` contract confirmation:
- `Stage 6B` stayed within the documented shared verification contract and did
  not introduce durable issue promotion, mastery/evidence work, assignment
  work, reward work, analytics work, UI/server-action work, or broad
  grammar/proofreading expansion beyond bounded `Stage 6A` candidates

Stage `6C` closeout status:
- `Stage 6C` is complete

Stage `6C` delivered:
- shared-boundary verified grammar/proofreading outcome bridge into durable
  issue truth under:
  - `lib/writing-engine/grammar/stage6c-authentic-writing-issue-promotion.ts`
- reuse of only verified `Stage 6B` grammar/proofreading outcomes and the
  existing durable `writing_issue` lifecycle from `Stage 3C`, `Stage 4C`, and
  `Stage 5C`
- promotion of only:
  - `accepted`
  - `overridden`
  verified outcomes into durable issue truth
- preserved:
  - original suggestion truth
  - parent decision
  - parent-verified truth
  - canonical authentic-writing provenance
  - `sourceSpan`, `targetText`, and `childAttemptText` metadata where
    available
- preserved `6C` boundaries:
  - shared Writing Engine ownership only
  - write path limited to the existing durable issue lifecycle
  - `false_positive` and `not_a_learning_issue` remain auditable and do not
    create durable issue truth
  - no mastery/evidence writes
  - no `learning_items`, `learning_item_evidence`, or
    `learning_item_issue_links` writes
  - no `assignment_items` writes
  - no reward, analytics, dashboard, UI, or server-action work
  - no route-local issue ownership
  - no parallel issue store
  - no free-text taxonomy or free-text `micro_skill_key` invention
  - no external API/model truth ownership
  - no revival of `word_progress` or retired spelling runtime ownership

Stage `6C` QA evidence:
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

Stage `6C` residual risks:
- durable promotion remains intentionally bounded to verified `Stage 6A`
  grammar/proofreading candidates only
- `Stage 6A` candidate coverage remains intentionally narrow
- transfer/refinement evidence and analytics/calibration remain deferred to
  later documented stages
- coverage is regression-based rather than DB-backed or app-triggered

Stage `6C` next safe task:
- no further implementation is authorized on the current `Stage 6` path until
  later documentation-first planning explicitly defines the next boundary

Stage `6C` contract confirmation:
- `Stage 6C` stayed within the documented durable issue bridge contract and
  did not introduce mastery/evidence work, assignment/reward work,
  analytics/UI/server-action work, route-local issue ownership, a parallel
  issue store, or broad grammar/proofreading expansion beyond bounded
  `Stage 6A` candidates

### Stage 7 — Review Work integration

Status: `Implemented through 7A` to `7E`; private-MVP safety copy slice also implemented`

Goal:
- make existing Writing Engine reviewable outputs visible and usable inside the
  parent `Review Work` flow
- allow both lesson submissions and parent-entered paper work/manual writing
  samples to enter the same canonical review pathway

Canonical pathway:
- parent copies paper writing into `Add Writing Sample`
- the app creates or attaches a canonical `writing_sample`
- existing shared Writing Engine analysis produces candidate hypotheses where
  supported
- the `writing_sample` appears in the `Review Work` queue
- parent opens the canonical `Review Work` detail
- parent accepts, overrides, false-positives, or marks not-a-learning-issue
  using existing verification contracts
- accepted and overridden outcomes promote through existing durable issue paths
- later mastery and assignment paths consume verified durable truth only where
  already documented
- parent-facing summary surfaces outside `Review Work` must remain advisory
  while evidence maturity is still limited

Behaviour contract:
- `Review Work` is the canonical parent review surface
- `Add Writing Sample` is intake only and must not host review actions
- historical `/analyse` may remain as a compatibility route, but its product
  role is manual writing-sample intake only
- lesson submissions and manual writing samples share one queue model and one
  review workflow
- queue rows may identify source type, but they must not split into separate
  review workflows
- parent actions inside `Review Work` must reuse existing shared verification
  and durable issue contracts only
- `Review Work` is not a new engine and must not become a route-local source
  of analysis, verification, durable issue, mastery, assignment, reward, or
  taxonomy truth
- before any Stage `8` automatic mastery runtime work begins, the repo should
  complete a documentation-first evidence-maturity and parent-facing
  mastery-claim readiness audit

Mini-task breakdown:
- `7A` — Manual writing sample intake and Review Work handoff
- `7B` — Unified Review Work queue visibility
- `7C` — Review detail suggested issues panel
- `7D` — Parent verification actions in Review Work
- `7E` — Queue completion/archive/status coherence

Stage `7A` contract:
- parent can type or paste paper work into `Add Writing Sample`
- intake creates a canonical `writing_sample`
- intake preserves child, parent, source, text, and provenance metadata
- after save, intake redirects or links to `Review Work`
- intake page has no review actions
- intake page performs no verification, durable issue, mastery, assignment,
  reward, or analytics writes
- current implementation truth:
  - complete and QA passed
  - implemented at the bounded intake-only `/analyse` path
  - save creates canonical manual `writing_sample` truth
  - save reuses existing shared spelling candidate analysis where supported
  - save hands off to canonical `Review Work`
- Stage `7A` QA evidence:
  - focused regression harness:
    - `npm run writing-engine:stage7a-intake-regression`
  - typecheck:
    - `npx tsc --noEmit`

Stage `7B` contract:
- `Review Work` queue includes lesson submissions and manual writing samples
- rows identify source type
- both row types open the same canonical review flow
- there is one queue model, not two workflows

Stage `7C` goal:
- make existing shared Writing Engine reviewable outputs visible inside the
  canonical `Review Work` detail page as a suggested-issues panel
- establish the first canonical `Review Work` detail panel for existing
  suggested and reviewable outputs
- keep `7C` strictly visibility-first and read-only

Stage `7C` behaviour contract:
- `Review Work` detail gains one canonical suggested-issues panel
- the panel applies to both supported source types when shared outputs exist:
  - lesson submissions
  - manual writing samples
- the panel stays inside the canonical `Review Work` detail route family
- the panel is visibility-first and read-only
- the panel renders existing shared Writing Engine and targeted-writing outputs
  only
- if a source has no shared outputs yet, the panel shows an explicit empty or
  unavailable state
- rendering the panel must not trigger new analysis, reanalysis, or writes

Stage `7C` global integration guardrails:
- `7C` must be implemented as part of the full `Review Work` pathway, not as
  an isolated local component addition
- preserve one review spine and one detail surface
- do not create a second review workflow under `/analyse`
- `Add Writing Sample` and compatibility `/analyse` remain intake only
- suggested-issue composition must come from a shared `Review Work` detail
  read model or helper where composition is needed, not ad hoc page-local
  domain logic
- lesson submissions and manual writing samples must use the same panel shape,
  state vocabulary, and detail contract unless a documented source-specific
  reason exists
- the panel may label or group existing records, but it must not reinterpret
  them
- the panel must preserve the distinction between:
  - candidate hypotheses
  - parent verification records
  - durable `writing_issues`
  - unresolved or unsupported outputs
- unverified candidates must not be displayed as durable issues
- durable issues must not be displayed as mastery
- unresolved outputs must not be displayed as actionable learning items
- `7C` may display existing outputs from completed modules only:
  - spelling
  - punctuation
  - sentence-boundary
  - bounded grammar and proofreading
- module labels must map from existing shared output or domain fields and must
  not invent taxonomy
- the detail panel render and load path must be side-effect free

Stage `7C` architecture boundaries:
- `Review Work` owns parent review presentation only
- shared Writing Engine owns analysis lineage, candidate shaping,
  verification semantics, and durable issue promotion
- targeted-writing contracts own durable review and issue lifecycle semantics
- `writing_samples` remain canonical manual-writing source records
- `task_submissions` remain canonical lesson-submission lineage
- `parent_verifications` remain canonical verified-truth storage
- `writing_issues` remain canonical durable authentic-writing issue history
- `learning_items` and `learning_item_evidence` remain canonical
  mastery/practice truth and are not mutated by `7C`
- `assignment_items` remain canonical assignment-composition truth and are not
  mutated by `7C`
- route-local `app/*` code must not become suggested-issue source-of-truth
  ownership

Stage `7C` source-of-truth and read-model rules:
- `7C` may read only existing documented shared truths such as:
  - `writing_samples`
  - `task_submissions`
  - existing shared analysis and candidate outputs
  - `parent_verifications` where already relevant for display
  - `writing_issues` where already relevant for display
  - existing targeted-writing records already documented
- before implementation, the implementation pass must list the exact sources
  it reads and classify each one as:
  - candidate hypothesis
  - verification record
  - durable issue
  - unresolved or unsupported output
- if a source cannot be classified, it must not be used in `7C`

Stage `7C` allowed status vocabulary:
- suggested
- candidate
- verified
- durable issue
- unresolved
- no suggestions yet

Stage `7C` forbidden status vocabulary:
- mastered
- assigned
- rewarded
- complete
- ready for practice

Stage `7C` empty, loading, and error states:
- writing exists but no shared outputs yet
- analysis or output unsupported for this source
- analysis produced no suggestions
- item already reviewed or archived where relevant
- loading
- load failure or error
- do not collapse all of these into one generic `No issues` state

Stage `7C` non-goals:
- no parent verification actions
- no Accept button
- no Override or Edit decision button
- no False positive button
- no Not a learning issue button
- no Resolve button
- no Create issue button
- no Assign button
- no Practice button
- no Mastered button
- no new analysis
- no analysis trigger from page render
- no durable issue promotion
- no mastery or evidence writes
- no assignment, reward, or analytics writes
- no route-local review truth
- no taxonomy invention
- no external API or model truth
- no second review surface
- no queue or archive logic changes unless already owned by another Stage `7`
  sub-stage

Stage `7C` acceptance criteria:
- canonical `Review Work` detail has a suggested-issues panel contract
- the panel reads existing shared outputs only
- both lesson submissions and manual writing samples are covered where outputs
  exist
- the same panel and read-model shape is used for both source types unless an
  explicit documented exception exists
- candidate, verified, durable issue, and unresolved states are not collapsed
- empty, loading, and error states are explicit
- no action semantics are introduced
- docs explicitly defer parent verification actions to `7D`
- no out-of-scope writes are introduced
- no route-local domain ownership is introduced

Stage `7C` QA requirements:
- verify lesson submission detail shows the panel when shared outputs exist
- verify manual writing sample detail shows the same panel shape when shared
  outputs exist
- verify an explicit empty state when no outputs exist
- verify unsupported or unresolved output state where appropriate
- verify no parent verification controls appear
- verify no verification, durable issue, mastery, evidence, assignment,
  reward, or analytics writes occur from viewing the panel
- verify no analysis is triggered by rendering the detail page
- verify no route-local suggested-issue ownership is introduced
- verify Stage `7A` and `7B` E2E still pass where relevant
- reusable browser and Supabase QA protocol should be used where feasible:
  - expected rows verified
  - forbidden tables verified unchanged
- forbidden-write QA list for `7C` detail viewing:
  - `parent_verifications`
  - `writing_issues`
  - `writing_issue_suggestions`
  - `writing_issue_correction_attempts`
  - `learning_items`
  - `learning_item_evidence`
  - `learning_item_issue_links`
  - `assignment_items`
  - reward tables
  - analytics tables

Stage `7C` to `7D` boundary:
- `7C` owns suggested-issues panel visibility only
- `7D` owns parent verification actions inside `Review Work`
- if `7C` needs Accept, Override, False positive, or Not a learning issue
  controls, stop and return to docs because that belongs to `7D`
- if `7C` needs issue creation, stop and return to docs because that belongs
  to existing durable issue paths and later action stages, not visibility

Stage `7C` stop-and-return-to-docs rules:
- stop if `7C` appears to require new analysis
- stop if `7C` appears to require analysis trigger from render or load
- stop if `7C` appears to require new review actions
- stop if `7C` appears to require a new verification decision or state
- stop if `7C` appears to require durable issue promotion
- stop if `7C` appears to require route-local suggested-issue composition as
  source of truth
- stop if `7C` appears to require a second review surface
- stop if `7C` appears to require a new source-of-truth table
- stop if `7C` appears to require a new taxonomy or free-text
  `micro_skill_key`
- stop if `7C` appears to require mastery, evidence, assignment, reward, or
  analytics writes
- stop if `7C` appears to require external API or model truth
- stop if `7C` appears to require a source-specific manual-sample workflow
  separate from lesson submissions

Stage `7D` goal:
- make canonical parent verification actions usable inside `Review Work` detail
  using existing shared verification contracts only
- allow parent review decisions to be taken from the same canonical detail
  surface that already renders suggested issues
- keep `7D` focused on verification actions and documented downstream handoff,
  not on new analysis, new issue semantics, or mastery-facing behaviour

Stage `7D` behaviour contract:
- `Review Work` detail gains one canonical parent-verification action family
- the allowed parent decisions remain the existing shared verification
  decisions only:
  - accepted
  - overridden
  - false positive
  - not a learning issue
- `7D` actions must operate inside the canonical `Review Work` detail route
  family for both supported source types where shared outputs are reviewable:
  - lesson submissions
  - manual writing samples
- `7D` reuses the existing shared verification contract and existing durable
  issue promotion path only
- the UI may collect only the inputs already required by existing shared
  verification semantics:
  - decision
  - verified override fields where an override is already supported
  - parent note where already supported
- action controls must be driven by the existing shared read model and state
  vocabulary rather than route-local decision semantics
- submitting a parent decision must not create a second review workflow, a
  second verification store, or a second issue-promotion path

Stage `7D` global integration guardrails:
- `7D` must be implemented as part of the full `Review Work` pathway, not as a
  route-local action invention
- preserve one review spine and one detail surface
- do not create or revive a verification workflow under `/analyse`
- `Add Writing Sample` and compatibility `/analyse` remain intake only
- both supported source types must use the same canonical verification action
  family unless a documented source-specific exception is added first
- the UI may surface existing decision semantics, but it must not reinterpret
  them or rename them into new lifecycle states
- verification actions must preserve the distinction between:
  - candidate hypotheses
  - parent verification records
  - durable `writing_issues`
  - downstream mastery or assignment truth
- unverified candidates must not be displayed or stored as durable issues
- parent verification actions must not display or write mastery-facing states
  such as `mastered`, `assigned`, or `ready for practice`
- durable issue promotion remains a downstream consequence of existing shared
  contracts, not a new button family invented by `7D`

Stage `7D` architecture boundaries:
- `Review Work` owns parent review presentation and action triggering only
- shared Writing Engine owns:
  - analysis lineage
  - candidate shaping
  - verification semantics
  - verified outcome shaping
  - durable issue promotion rules
- targeted-writing contracts own durable review and issue lifecycle semantics
- `parent_verifications` remain canonical verified-truth storage
- `writing_issues` remain canonical durable authentic-writing issue history
- `writing_samples` remain canonical manual-writing source records
- `task_submissions` remain canonical lesson-submission lineage
- `learning_items` and `learning_item_evidence` remain canonical
  mastery/practice truth and are not written directly by `7D` UI actions
- `assignment_items` remain canonical assignment-composition truth and are not
  written directly by `7D` UI actions
- route-local `app/*` code must not become verification, issue, mastery,
  assignment, reward, analytics, or taxonomy source-of-truth ownership

Stage `7D` source-of-truth and action rules:
- `7D` may read from the same documented shared truths as `7C`, plus existing
  shared verification records where relevant for read-after-write display
- `7D` may write only through existing shared verification orchestration
  helpers and existing shared durable issue paths where already documented
- before implementation, the implementation pass must list the exact shared
  action helpers or server actions it will reuse
- if a required action helper does not already preserve existing verification
  semantics, stop and return to docs before inventing a new route-local path
- if a required display or action source cannot be classified as:
  - candidate hypothesis
  - verification record
  - durable issue
  - unresolved or unsupported output
  then it must not be used in `7D`

Stage `7D` allowed action vocabulary:
- accept
- override
- false positive
- not a learning issue

Stage `7D` forbidden action or status vocabulary:
- mastered
- assigned
- rewarded
- complete
- ready for practice
- fix now
- promote issue
- create learning item
- create assignment

Stage `7D` state and UI rules:
- action controls must follow the global action-control standards
- each reviewable suggestion row or card must expose at most one primary
  action at a time, with secondary actions remaining compact and explicit
- pending, success, and error states must be explicit and text-led
- the detail surface must remain scannable and must not mix action semantics
  with mastery or assignment messaging
- loading and load-failure states for the read model must remain distinct from
  action-submission failure states
- reviewed/history display after action should continue to use canonical shared
  verification truth rather than route-local badges

Stage `7D` non-goals:
- no new analysis
- no analysis trigger from page render or action submission
- no new verification decision or state
- no new override field semantics
- no new durable issue lifecycle state
- no direct Create issue button family outside existing verification flow
- no mastery or evidence writes from route-local UI logic
- no assignment, reward, or analytics writes from route-local UI logic
- no queue or archive redesign
- no second review surface
- no taxonomy invention
- no external API or model truth
- no source-specific manual-sample workflow separate from lesson submissions

Stage `7D` acceptance criteria:
- canonical `Review Work` detail has one documented parent-verification action
  family
- the action family reuses only existing shared verification semantics
- both lesson submissions and manual writing samples are supported where
  reviewable shared outputs exist
- the same action model and state vocabulary is used for both source types
  unless an explicit documented exception exists
- accepted, overridden, false-positive, and not-a-learning-issue outcomes are
  not renamed into new states
- the UI does not introduce direct mastery, assignment, reward, or analytics
  semantics
- durable issue promotion occurs only through existing shared downstream paths
- no new route-local verification or issue ownership is introduced
- docs explicitly defer queue/archive coherence to `7E`

Stage `7D` QA requirements:
- verify lesson submission detail supports the canonical verification actions
  where shared outputs are reviewable
- verify manual writing sample detail supports the same canonical action family
  where shared outputs are reviewable
- verify accepted, overridden, false-positive, and not-a-learning-issue
  actions reuse existing shared verification behaviour only
- verify override flows require only the fields already required by existing
  shared verification semantics
- verify no new verification states appear
- verify no new route-local durable issue or mastery writes occur
- verify no render-time analysis is triggered by loading or submitting actions
- verify Stage `7A`, `7B`, and `7C` E2E still pass where relevant
- reusable browser and Supabase QA protocol should be used where feasible:
  - expected rows verified
  - forbidden tables verified unchanged except for documented shared
    verification and downstream issue-path writes caused by allowed actions
- forbidden direct-write QA list for `7D` route-local action logic:
  - `learning_items`
  - `learning_item_evidence`
  - `learning_item_issue_links`
  - `assignment_items`
  - reward tables
  - analytics tables
- required shared-write QA list for `7D` action submission:
  - `parent_verifications` changes only through the shared verification path
  - `writing_issues` changes only where existing durable issue promotion is
    already documented for the chosen decision

Stage `7D` to `7E` boundary:
- `7D` owns parent verification actions inside canonical `Review Work` detail
- `7E` owns queue completion, archive coherence, and cross-surface status
  reconciliation after those actions
- if `7D` appears to require queue-count redesign, archive redesign, or new
  completion semantics, stop and return to docs because that belongs to `7E`

Stage `7D` stop-and-return-to-docs rules:
- stop if `7D` appears to require a new analysis path
- stop if `7D` appears to require a new verification decision or state
- stop if `7D` appears to require a new override payload shape
- stop if `7D` appears to require a new durable issue lifecycle state
- stop if `7D` appears to require direct mastery, evidence, assignment,
  reward, or analytics writes from the UI
- stop if `7D` appears to require route-local verification or issue storage
- stop if `7D` appears to require a second review surface
- stop if `7D` appears to require a new source-of-truth table
- stop if `7D` appears to require a new taxonomy or free-text
  `micro_skill_key`
- stop if `7D` appears to require external API or model truth
- stop if `7D` appears to require a source-specific manual-sample workflow
  separate from lesson submissions

Stage `7D` implementation breakdown:
- this is an execution breakdown only, not a new product scope
- the Stage `7D` contract above remains authoritative
- implementation must proceed one subtask at a time
- each subtask requires:
  - its own implementation report
  - its own QA pass
  - explicit closeout before the next subtask begins
- `Review Work` remains the canonical parent review surface throughout
- `Add Writing Sample` and compatibility `/analyse` remain intake only
- `/analyse` must not regain review ownership
- no second review surface may be introduced
- candidate hypotheses remain distinct from parent verification records
- parent verification records remain distinct from durable `writing_issues`
- durable `writing_issues` are promoted only through existing documented
  shared orchestration
- mastery, evidence, assignment, reward, and analytics truths must not be
  written directly by route-local `Review Work` UI logic
- queue completion, archive coherence, and cross-surface status reconciliation
  remain explicitly deferred to `Stage 7E`

Stage `7D.1` — Canonical action wiring:
- add canonical non-override parent verification controls inside `Review Work`
- allowed decisions in `7D.1` only:
  - accepted
  - false positive
  - not a learning issue
- no override editor or override input flow
- prove reuse of existing shared verification semantics
- preserve the existing `7C` read-model states
- no queue, archive, or status-coherence work

Stage `7D.1` acceptance criteria:
- `Review Work` detail exposes one canonical non-override verification action
  family
- only accepted, false-positive, and not-a-learning-issue actions are
  available
- the action family reuses existing shared verification orchestration only
- both lesson submissions and manual writing samples use the same canonical
  action model where reviewable shared outputs exist
- no override fields or override editor appear
- no new verification state names appear
- no route-local durable issue, mastery, assignment, reward, or analytics
  ownership is introduced
- queue/archive/status coherence remains unchanged and out of scope

Stage `7D.1` QA expectations:
- verify lesson submission detail supports accepted, false-positive, and
  not-a-learning-issue actions where shared outputs are reviewable
- verify manual writing sample detail supports the same non-override action
  family where shared outputs are reviewable
- verify shared verification semantics are reused without renaming decisions
- verify no override inputs appear
- verify Stage `7C` read-only state vocabulary remains intact before and after
  action submission
- verify no direct route-local writes occur to:
  - `learning_items`
  - `learning_item_evidence`
  - `learning_item_issue_links`
  - `assignment_items`
  - reward tables
  - analytics tables
- verify `parent_verifications` writes occur only through the shared
  verification path
- verify `writing_issues` changes occur only where already documented for the
  chosen decision
- verify `Stage 7A`, `7B`, and `7C` regressions still pass where relevant

Stage `7D.1` stop-and-return-to-docs rules:
- stop if implementation appears to require override inputs or override-only
  payload fields
- stop if implementation appears to require a new verification decision or
  renamed decision state
- stop if implementation appears to require queue or archive redesign
- stop if implementation appears to require direct route-local mastery,
  assignment, reward, or analytics writes
- stop if implementation appears to require a second review surface or a
  source-specific workflow fork

Stage `7D.2` — Override flow:
- add override decision flow using only existing verified override fields
  and existing shared override semantics
- do not invent new override payload shape, field semantics, decision names,
  or issue lifecycle states
- reuse existing shared verification orchestration
- keep action vocabulary shared across lesson submissions and manual writing
  samples where applicable

Stage `7D.2` acceptance criteria:
- `Review Work` detail supports override actions only through existing shared
  override semantics
- override inputs are limited to the fields already supported by shared
  verification contracts
- no new override payload shape or route-local override persistence path is
  introduced
- override uses the same canonical action family as the non-override
  decisions
- both supported source types use the same override vocabulary where
  applicable
- no new durable issue lifecycle states are introduced
- queue/archive/status coherence remains unchanged and out of scope

Stage `7D.2` QA expectations:
- verify override flow appears only where existing shared verification
  semantics support it
- verify override submission requires only documented shared override fields
- verify accepted, false-positive, not-a-learning-issue, and override remain
  distinct existing decisions rather than new lifecycle states
- verify route-local UI logic does not write directly to mastery, assignment,
  reward, or analytics truth
- verify shared downstream durable issue behaviour remains unchanged except
  where already documented for override decisions
- verify Stage `7D.1` behaviour continues to pass
- verify Stage `7A`, `7B`, and `7C` regressions still pass where relevant

Stage `7D.2` stop-and-return-to-docs rules:
- stop if implementation appears to require a new override field or new field
  meaning
- stop if implementation appears to require a new decision name, new
  verification state, or new issue lifecycle state
- stop if implementation appears to require source-specific override semantics
- stop if implementation appears to require direct queue/archive/status
  coherence work
- stop if implementation appears to require route-local verification storage

Stage `7D.3` — Read-after-write detail truth:
- ensure `Review Work` detail reflects canonical shared verification truth
  after actions
- confirm reviewed/history/display states come from existing shared read
  models
- keep queue/archive/status coherence explicitly out of scope for `7D`
- leave queue completion/archive/status coherence to `7E`

Stage `7D.3` acceptance criteria:
- post-action `Review Work` detail reflects canonical shared verification
  truth using existing shared read models
- reviewed/history/display states are not authored route-locally
- read-after-write detail does not invent new status vocabulary
- both supported source types reflect shared verification truth through the
  same canonical detail contract where applicable
- queue/archive/status coherence remains unchanged and is not claimed as
  solved by `7D`

Stage `7D.3` QA expectations:
- verify accepted, false-positive, not-a-learning-issue, and override outcomes
  are reflected in detail through canonical shared verification truth
- verify reviewed/history display comes from existing shared read models
  rather than route-local badges or inferred state
- verify no render-time analysis is triggered after actions
- verify no direct route-local writes occur to mastery, assignment, reward, or
  analytics truth
- verify earlier `7D` subtasks and Stage `7A`, `7B`, and `7C` regressions
  still pass
- verify queue/archive behaviour is unchanged and remains a `7E` concern

Stage `7D.3` stop-and-return-to-docs rules:
- stop if implementation appears to require queue-count changes, archive
  redesign, or new completion semantics
- stop if implementation appears to require a new read-model source of truth
- stop if implementation appears to require new reviewed/history lifecycle
  states
- stop if implementation appears to require route-local post-action truth
  ownership

Stage `7E` — Queue completion/archive/status coherence:

Stage goal:
- make canonical `Review Work` queue rows, detail return paths, archive
  visibility, and completion/status presentation coherent after documented
  parent verification actions
- keep that coherence as a projection over existing shared truth rather than a
  new source of truth

Behaviour contract:
- `Review Work` remains the canonical parent review surface for both:
  - lesson submissions
  - parent-entered manual `writing_sample` records
- after documented Stage `7D` actions, the canonical queue/detail/archive
  surfaces must reconcile against existing shared truth so the parent does not
  see contradictory statuses across:
  - queue row visibility
  - queue counts
  - archived/completed presentation
  - detail read-after-write return state
- `Stage 7E` may refine how existing shared truth is projected into queue and
  archive presentation, but it must not invent:
  - new verification semantics
  - new issue lifecycle semantics
  - new mastery, assignment, reward, analytics, or taxonomy truth
- completion/archive/status coherence must come from shared read-model
  composition over existing records, not from route-local UI-only state
- both supported source types must remain on one canonical queue/review spine
  unless a later documented contract explicitly introduces a different model

Architecture boundaries:
- `Review Work` owns queue/list/detail/archive presentation and status
  projection only
- canonical truth continues to live in existing shared sources such as:
  - `task_submissions`
  - `writing_samples`
  - `writing_issue_suggestions`
  - `parent_verifications`
  - `writing_issues`
- `Stage 7E` may add or refine shared read-model helpers that reconcile those
  sources for canonical queue/archive presentation
- `Stage 7E` must not create:
  - a second review surface
  - a route-local queue truth table
  - route-local completion or archive ownership
  - source-specific workflow forks for manual samples versus lesson
    submissions
- `Add Writing Sample` remains intake only
- compatibility `/analyse` must not regain review, queue, or archive
  ownership

Non-goals:
- no new analysis
- no analysis trigger from render or submit
- no new verification decisions or verification states
- no new durable issue lifecycle states
- no override-semantics redesign
- no direct mastery/evidence writes from route-local UI logic
- no direct assignment, reward, analytics, or taxonomy writes from route-local
  UI logic
- no automatic mastery changes
- no Stage `8` automatic-mastery semantics work
- no second review surface
- no revived historical review/runtime ownership

Acceptance criteria:
- after accepted, false-positive, not-a-learning-issue, and overridden actions,
  the canonical `Review Work` queue/detail/archive surfaces present coherent
  status truth from shared read models
- queue row visibility and queue counts do not contradict the canonical detail
  state after returning from an action
- archive/completion presentation is derived from shared truth rather than
  route-local ad hoc flags
- lesson submissions and manual writing samples remain on the same canonical
  queue/review contract where applicable
- `Stage 7E` does not introduce new decision names, verification states, issue
  lifecycle states, or direct route-local writes to mastery/evidence,
  assignments, rewards, analytics, or taxonomy truth

QA requirements:
- verify queue/detail coherence after each documented Stage `7D` decision:
  - accepted
  - false positive
  - not a learning issue
  - overridden
- verify back-to-list behaviour after actions lands in a coherent canonical
  queue state
- verify archive/completion presentation does not contradict shared detail
  truth
- verify lesson submissions and manual writing samples remain within the same
  canonical queue/review contract where applicable
- verify no render-time analysis is triggered
- verify no direct route-local writes occur to:
  - `learning_items`
  - `learning_item_evidence`
  - `learning_item_issue_links`
  - `assignment_items`
  - reward tables
  - analytics tables
- reusable browser and Supabase QA protocol should be used where feasible:
  - `npx tsc --noEmit`

Stage `7E` to next-stage boundary:
- `Stage 7E` owns queue completion, archive coherence, and cross-surface
  status reconciliation only
- automatic mastery remains owned by `Stage 8` in
  `docs/contracts/writing-engine-mastery-and-evidence-contract.md`
- if `Stage 7E` appears to require changes to mastery thresholds,
  authenticity/evidence weighting, assignment-composition semantics, or
  taxonomy semantics, stop and return to docs because that belongs to later
  documented stages rather than `7E`

Stage `7E` stop-and-return-to-docs rules:
- stop if implementation appears to require a new verification decision or
  verification state
- stop if implementation appears to require a new durable issue lifecycle
  state
- stop if implementation appears to require a new queue source-of-truth table
- stop if implementation appears to require route-local completion or archive
  ownership
- stop if implementation appears to require a second review surface
- stop if implementation appears to require source-specific queue/review
  semantics for manual writing samples versus lesson submissions
- stop if implementation appears to require direct mastery/evidence,
  assignment, reward, analytics, or taxonomy writes from the UI
- stop if implementation appears to require Stage `8` automatic-mastery
  semantics
- stop if implementation appears to require external API or model truth

Stage `7E` implementation breakdown:
- this is an execution breakdown only, not a new product scope
- the Stage `7E` contract above remains authoritative
- implementation must proceed one subtask at a time
- each subtask requires:
  - its own implementation report
  - its own QA pass
  - explicit closeout before the next subtask begins
- `Review Work` remains the canonical parent review surface throughout
- `Add Writing Sample` remains intake only
- compatibility `/analyse` must not regain review ownership
- no second review surface may be introduced
- queue/completion/archive/status coherence remains a projection over existing
  shared truth, not a new source of truth
- no new queue truth table may be introduced
- no route-local completion or archive ownership may be introduced
- candidate hypotheses, parent verification records, durable
  `writing_issues`, and downstream mastery/evidence truth remain distinct
  layers
- Stage `8` automatic mastery, assignment generation, reward, analytics, and
  taxonomy semantics remain out of scope

Stage `7E.1` — Queue/detail status projection coherence:
- make canonical `Review Work` queue-row status and canonical `Review Work`
  detail status agree after documented Stage `7D` verification actions
- use existing shared truth only:
  - `task_submissions`
  - `writing_samples`
  - `writing_issue_suggestions`
  - `parent_verifications`
  - `writing_issues`
- ensure status remains a shared read-model projection rather than route-local
  UI state
- cover existing decisions only:
  - accepted
  - false positive
  - not a learning issue
  - overridden
- do not add archive-presentation redesign in this subtask unless already
  required to prevent direct queue/detail contradiction
- do not redesign post-action return paths or queue-count semantics beyond the
  minimum needed to prevent direct queue/detail contradiction
- do not add new queue source-of-truth tables
- do not add Stage `8` mastery/evidence semantics

Stage `7E.1` acceptance criteria:
- after accepted, false-positive, not-a-learning-issue, and overridden
  actions, queue-row status and detail status do not contradict one another
- queue/detail coherence is derived from existing shared truth through shared
  read-model projection rather than route-local status flags
- both lesson submissions and manual writing samples remain on the same
  canonical queue/review contract where applicable
- no archive/completed-view redesign is claimed beyond contradiction
  prevention already required by queue/detail truth
- no new verification decisions, verification states, issue lifecycle states,
  queue truth tables, or Stage `8` semantics are introduced

Stage `7E.1` QA expectations:
- verify queue/detail coherence after each documented Stage `7D` decision:
  - accepted
  - false positive
  - not a learning issue
  - overridden
- verify no direct queue/detail contradiction remains after returning from a
  detail action
- verify both lesson submissions and manual writing samples stay within the
  same canonical queue/review contract where applicable
- verify no direct route-local writes occur to:
  - `learning_items`
  - `learning_item_evidence`
  - `learning_item_issue_links`
  - `assignment_items`
  - reward tables
  - analytics tables
- verify no render-time analysis is triggered
- verify Stage `7A`, `7B`, `7C`, and `7D` regressions still pass where
  relevant

Stage `7E.1` stop-and-return-to-docs rules:
- stop if implementation appears to require archive redesign or archive-only
  lifecycle semantics beyond direct queue/detail contradiction prevention
- stop if implementation appears to require a new queue source-of-truth table
- stop if implementation appears to require route-local status ownership
- stop if implementation appears to require source-specific queue semantics
  for manual samples versus lesson submissions
- stop if implementation appears to require Stage `8` mastery/evidence
  semantics

Stage `7E.2` — Archive/completion presentation coherence:
- make completed/archive presentation truthful after documented Stage `7D`
  actions
- ensure archive/completed views do not contradict canonical detail
  verification truth
- reuse existing shared read paths only
- do not invent new lifecycle states
- do not create route-local archive ownership
- do not introduce new completion truth separate from parent verification and
  existing issue truth
- keep lesson submissions and manual writing samples on the same canonical
  review spine where applicable

Stage `7E.2` acceptance criteria:
- completed/archive presentation does not contradict canonical detail
  verification truth after documented Stage `7D` actions
- archive/completion presentation is derived from existing shared truth rather
  than route-local ownership or ad hoc flags
- both supported source types remain on the same canonical review spine where
  applicable
- no new lifecycle states, queue truth tables, or separate completion-truth
  source are introduced

Stage `7E.2` QA expectations:
- verify archive/completed views remain truthful after accepted,
  false-positive, not-a-learning-issue, and overridden outcomes where
  applicable
- verify archive/completion presentation does not contradict queue or detail
  state
- verify lesson submissions and manual writing samples remain coherent across
  queue/detail/archive presentation where applicable
- verify no direct route-local writes occur to mastery/evidence, assignments,
  rewards, analytics, or taxonomy truth
- verify earlier `7E.1` behaviour and earlier Stage `7` regressions still
  pass where relevant

Stage `7E.2` stop-and-return-to-docs rules:
- stop if implementation appears to require a new completion lifecycle state
- stop if implementation appears to require route-local archive ownership
- stop if implementation appears to require a separate completion truth apart
  from existing shared verification and issue truth
- stop if implementation appears to require Stage `8` mastery or assignment
  semantics
- stop if implementation appears to require a second review or archive surface

Stage `7E.3` — Cross-surface return-path and count reconciliation:
- ensure post-action navigation and back-to-list behaviour land in a coherent
  canonical `Review Work` queue state
- reconcile visible queue counts, row visibility, and detail status after
  documented verification actions
- confirm manual writing samples and lesson submissions remain coherent across:
  - queue
  - detail
  - completed/archive presentation where applicable
  - post-action return path
- do not begin Stage `8`
- do not introduce automatic mastery, assignment, reward, analytics, or
  taxonomy semantics

Stage `7E.3` acceptance criteria:
- post-action return paths land in a coherent canonical queue state
- queue counts, row visibility, and detail status are reconciled against the
  same shared truth after documented verification actions
- both supported source types remain coherent across queue, detail, and
  completed/archive presentation where applicable
- no Stage `8` automatic mastery, assignment, reward, analytics, or taxonomy
  semantics are introduced

Stage `7E.3` QA expectations:
- verify back-to-list and post-action return flows land in a coherent queue
  state after accepted, false-positive, not-a-learning-issue, and overridden
  decisions
- verify visible queue counts reconcile with row visibility and detail truth
- verify lesson submissions and manual writing samples remain coherent across
  queue/detail/archive return paths where applicable
- verify no direct route-local writes occur to mastery/evidence, assignments,
  rewards, analytics, or taxonomy truth
- verify earlier `7E` subtasks and earlier Stage `7` regressions still pass
  where relevant

Stage `7E.3` stop-and-return-to-docs rules:
- stop if implementation appears to require a new queue-count source of truth
- stop if implementation appears to require route-local navigation state as
  canonical truth
- stop if implementation appears to require a new lifecycle state to explain
  return-path behaviour
- stop if implementation appears to require Stage `8` automatic mastery or
  assignment semantics
- stop if implementation appears to require a source-specific workflow split
  across queue, detail, or archive surfaces

Strict boundaries:
- no new analysis engine
- no new verification semantics
- no parallel issue-review workflow
- no route-local domain ownership
- no mastery/evidence writes from UI-only actions
- no assignment/reward changes
- no revived old spelling runtime
- no broad grammar/proofreading/transfer semantics
- no external API/model truth
- no free-text taxonomy invention
- `/analyse` is not canonical review ownership

Acceptance criteria:
- docs explicitly define where parent-entered paper work is submitted
- docs explicitly define `Review Work` as the canonical review surface
- docs explicitly define `Add Writing Sample` as intake only
- docs define the full intake -> review -> verification -> durable issue
  pathway
- docs define the Stage `7` mini-task breakdown
- docs define the first safe implementation pass
- docs include stop-and-return-to-docs rules

Stop-and-return-to-docs rules:
- stop if implementation needs new verification decisions or review states
- stop if manual writing samples cannot fit the same queue and review model
  without a second workflow
- stop if route-local persistence or route-local domain ownership appears
  necessary
- stop if mastery/evidence, assignment, reward, analytics, or taxonomy
  semantics would need to change
- stop if broader grammar/proofreading/transfer semantics are needed beyond
  already documented shared engine outputs

First safe implementation pass:
- completed:
  - `Stage 7A` — Manual writing sample intake and Review Work handoff only
  - bounded to intake, canonical `writing_sample` creation or attachment, and
    Review Work handoff
  - excludes review actions, verification writes, durable issue writes,
    mastery/evidence writes, assignment writes, reward writes, and analytics
    writes from the intake page
- next safe implementation boundary:
  - `Stage 7B` — Unified Review Work queue visibility only

Closeout note:
- `Stage 7A` does not mean manual writing samples are already visible in a
  unified `Review Work` queue
- queue convergence and unified row visibility remain owned by `Stage 7B`
- `Stage 7C` must now define the first canonical read-only suggested-issues
  panel inside `Review Work` detail before any `7D` action work begins

### Stage 7F — Parent Review Action Restoration

Status: `Documentation-defined bounded restoration pass; implementation not yet started`

Goal:
- restore historical parent-facing lesson review actions that were orphaned
  from the current canonical `Review Work` detail UI
- preserve the current canonical `Review Work` spine rather than reviving the
  historical page or any legacy review surface
- keep UI restoration, server-action reuse, queue/coherence work, and new
  persistence work separated into safe mini implementation tasks

Contracts and sources of truth:
- primary contract:
  - [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)
- secondary boundary contract:
  - [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- primary architecture truth:
  - [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
  - [docs/architecture/writing-engine-foundation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-foundation.md:1)
- primary implementation truth:
  - [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)
  - [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)
- runtime action contract:
  - [app/courses/review/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/actions.ts:1)
- runtime read-model and UI truth:
  - [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
  - [app/courses/review/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/page.tsx:1)
  - [app/courses/review/review-utils.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/review-utils.ts:1)
  - [app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/page.tsx:1)
- historical reference only:
  - `git show aa0341c:'app/courses/review/[submissionId]/page.tsx'`
  - `git show c808b1f -- 'app/courses/review/[submissionId]/page.tsx'`

Behaviour contract:
- `Stage 7F` is a narrow restoration pass, not a new architecture slice
- `Stage 7F` preserves the current canonical `Review Work` spine
- `Stage 7F` must not revive `/analyse/review`, old Analyse review ownership,
  duplicate review surfaces, or route-local truth
- parent review actions surfaced in `Review Work` must continue to reuse
  existing shared verification and durable-issue pathways only
- `Review Work` UI actions must not mutate mastery or evidence directly
- parent-added missed issues must preserve parent-authored provenance and must
  not be presented as engine-suggested truth
- returned lesson submissions must remain live and visually distinct from
  generic needs-review rows
- lesson approval must remain blocked while unresolved suggestions remain
- zero-suggestion silence must not auto-complete either source type
- manual-sample completion currently requires explicit persistence and must not
  be faked

Implementation sequencing rule:
- `Stage 7F` is broken into bounded mini-tasks below
- implementation must proceed one mini-task at a time
- each mini-task requires:
  - its own implementation report
  - its own QA pass
  - explicit closeout before the next mini-task begins
- do not combine persistence/UI/server-action work with pure domain/helper work
  unless the relevant mini-task explicitly owns that combination
- if provenance, persistence, identity, permission, or source-of-truth rules
  become unclear, stop and return to docs rather than inventing architecture

Blocker note:
- a previous prompt referenced `Current contract: [PASTE CONTRACT HERE]`, but no
  extra contract text was supplied
- therefore no additional hidden contract should be assumed beyond the sources
  above
- if implementation reaches a rule not covered by those sources, that is a
  stop-and-return-to-docs blocker

Mini-task `7F.1` — Lesson Parent Actions UI Restoration
- ID:
  - `7F.1`
- Name:
  - `Lesson detail parent actions surface`
- Purpose:
  - restore lesson-only parent review controls into the current canonical
    `Review Work` detail page
- Stage goal:
  - re-establish the lesson-detail action surface without changing the current
    shared action contract, verification semantics, or completion semantics
- Scope:
  - add a `Parent review actions` section for lesson submissions only
  - include `Approve / mark complete`
  - include `Send back to child`
  - include parent note input
- Behaviour contract:
  - `7F.1` restores visibility and placement of lesson-only parent action
    controls inside canonical `Review Work` detail
  - `7F.1` may reuse existing lesson action targets and existing lesson/manual
    source identification only
  - `7F.1` does not broaden the action payload, restore structured field
    feedback inputs, or reconnect child returned-work behavior
- Architecture boundaries:
  - keep canonical review ownership in `Review Work`
  - keep manual writing samples outside this action surface
  - keep shared action semantics in existing server actions rather than in
    route-local UI logic
  - keep the existing Suggested Issues panel as the primary canonical review
    spine above or alongside the restored section
- Non-goals:
  - no manual-sample send-back UI
  - no queue logic changes
  - no new verification semantics
  - no structured lesson field feedback inputs in this mini-task
  - no child returned-work payload validation beyond preserving the current
    form boundary
  - no approval guardrail changes
  - no backend persistence changes beyond existing action reuse
- Expected files/areas:
  - [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
  - historical reference from `aa0341c`
- Acceptance criteria:
  - lesson detail shows the parent actions section
  - manual sample detail does not
  - restored controls are visibly lesson-only and do not imply that manual
    samples support lesson approval or send-back
  - page remains anchored to the current canonical Suggested Issues panel
  - no structured lesson field feedback inputs are required for `7F.1`
- Tests/QA:
  - browser/UI regression for lesson vs manual rendering
  - browser/UI check that the restored section appears without reviving a
    second review surface
  - `npx tsc --noEmit`
- Dependencies:
  - none
- Next-stage boundary:
  - `7F.2` owns structured lesson feedback rehydration and any
    `field_feedback__{fieldKey}` input restoration
  - `7F.3` owns actual send-back flow reconnection
  - `7F.4` owns approval guardrail restoration and unresolved-suggestion
    blocking behavior
- Stop conditions:
  - if lesson/manual source identification is ambiguous at runtime
  - if restoring the section requires replacing the whole page rather than
    extending it

Closeout:
- `7F.1` is now implemented and QA passed
- lesson submission detail now renders a lesson-only `Parent review actions`
  section below the canonical Suggested Issues panel
- manual writing sample detail does not render that section
- the restored `Approve / mark complete`, `Send back to child`, and `Parent
  note` controls are intentionally disabled / non-operative in `7F.1`
- no backend mutation path was introduced by `7F.1`:
  - no `parent_review_status` change
  - no returned-work draft payload write
  - no approval success path
  - no send-back success path
- `7F.1` therefore closes as a rendering/guardrail restoration only

QA evidence:
- `npx tsc --noEmit`
  - passed with exit code `0`
- `npm run build`
  - passed with exit code `0`
- `npm run writing-engine:stage7a-intake-regression`
  - `writing-engine-stage7a-intake-regression: ok`

Residual boundaries preserved:
- `7F.2` still owns structured lesson feedback rehydration
- `7F.3` still owns send-back wiring
- `7F.4` still owns approval guardrail restoration

Manual QA notes worth preserving:
- verify the lesson-only action card remains visibly below Suggested Issues
- verify manual writing sample detail still omits the lesson action surface
- verify the disabled controls do not submit, redirect, mutate, or show
  success copy

Mini-task `7F.2` — Structured Lesson Feedback Rehydration
- ID:
  - `7F.2`
- Name:
  - `Structured lesson feedback inputs`
- Purpose:
  - re-enable question-level feedback for lesson submissions where the data
    model still supports it
- Scope:
  - restore loading of lesson schema and draft payload in lesson detail
  - render `field_feedback__{fieldKey}` inputs for reviewable structured
    fields
  - ensure payload shape matches `returnSubmissionToChild(...)`
- Non-goals:
  - no manual-sample field feedback
  - no new lesson response model
  - no child-page behavior changes
- Expected files/areas:
  - [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
  - [app/courses/review/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/actions.ts:1)
  - [app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/page.tsx:1)
    for compatibility verification only
- Acceptance criteria:
  - structured lesson fields render only when supported
  - send-back form posts field feedback through the existing action contract
- Tests/QA:
  - focused returned-work path regression
  - `npx tsc --noEmit`
- Dependencies:
  - `7F.1`
- Stop conditions:
  - if structured lesson field identity cannot be matched safely from current
    draft/schema data

Closeout:
- `7F.2` is now implemented and QA passed
- lesson submission detail may now render structured lesson feedback inputs
  when current lesson schema/draft data supports them
- manual writing sample detail does not render structured lesson feedback
  inputs
- structured lesson feedback inputs reuse the existing action naming contract:
  - `field_feedback__{fieldKey}`
- restored structured lesson feedback inputs remain disabled / non-operative in
  `7F.2`
- no backend mutation path was introduced by `7F.2`
- `7F.2` therefore closes as a lesson-only structured-feedback rendering pass,
  not a send-back or approval-behavior pass

QA evidence:
- `npx tsc --noEmit`
  - passed with exit code `0`
- `npm run build`
  - passed with exit code `0`

Residual boundaries preserved:
- `7F.3` still owns send-back wiring
- `7F.4` still owns approval guardrail restoration

Manual QA notes worth preserving:
- verify structured lesson feedback inputs appear only on supported lesson
  submissions
- verify unsupported lesson submissions still render the lesson action surface
  without the structured-feedback subsection
- verify manual writing sample detail still omits structured lesson feedback
  inputs
- verify disabled structured feedback inputs do not submit, redirect, mutate,
  or show success copy

Mini-task `7F.3` — Lesson Send-Back Flow Reconnection
- ID:
  - `7F.3`
- Name:
  - `Lesson send-back action restoration`
- Purpose:
  - restore the parent-facing send-back flow on lesson submissions using the
    existing canonical action
- Scope:
  - wire lesson send-back form to `returnSubmissionToChild(...)`
  - preserve parent note
  - preserve structured field feedback payload
  - verify child returned-work path still receives expected feedback
- Non-goals:
  - no manual-sample send-back
  - no new return lifecycle state
  - no archive redesign yet
- Expected files/areas:
  - [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
  - [app/courses/review/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/actions.ts:1904)
  - [app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/page.tsx:1)
- Acceptance criteria:
  - parent can send lesson work back with note/feedback
  - `parent_review_status` becomes `returned`
  - child page shows returned-work path where applicable
- Tests/QA:
  - focused lesson send-back regression
  - `npx tsc --noEmit`
- Dependencies:
  - `7F.1`
  - `7F.2`
- Stop conditions:
  - if child returned-work consumption depends on undocumented payload fields
    not present in current action

Closeout:
- `7F.3` is now implemented and QA passed
- lesson submission detail now wires the lesson-only send-back form to the
  existing canonical action:
  - `returnSubmissionToChild(...)`
- `parent_review_note` is editable and posts through the action
- structured lesson feedback values post through the existing contract:
  - `field_feedback__{fieldKey}`
- manual writing sample detail does not render or support lesson send-back
- approval remains deferred and non-operative in `7F.3`
- `7F.3` therefore closes as a lesson send-back reconnection pass, not an
  approval-guardrail pass

QA evidence:
- `npx tsc --noEmit`
  - passed with exit code `0`
- `npm run build`
  - passed with exit code `0`

Residual boundaries preserved:
- `7F.4` still owns approval guardrails

Manual QA notes worth preserving:
- verify successful send-back messaging appears on lesson detail rather than a
  no-op
- verify reopening the same review item shows coherent returned-state truth
- verify the child lesson page shows returned-work restoration and structured
  feedback where supported
- verify manual writing sample detail still omits lesson send-back UI
- verify `Approve / mark complete` remains non-operative until `7F.4`

Mini-task `7F.4` — Lesson Approval Guardrail Restoration
- ID:
  - `7F.4`
- Name:
  - `Lesson approval and unresolved-issue guardrails`
- Purpose:
  - restore explicit lesson approval UI while preserving the rule that
    unresolved suggestions block completion
- Scope:
  - wire lesson complete form to `approveSubmissionReview(...)`
  - ensure pending unresolved suggestions still block approval
  - ensure accepted, overridden, false positive, and not-a-learning-issue
    decisions count as resolved
- Non-goals:
  - no manual-sample completion
  - no mastery/evidence writes
  - no new review decisions
- Expected files/areas:
  - [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
  - [app/courses/review/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/actions.ts:2149)
  - [app/courses/review/review-utils.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/review-utils.ts:934)
    if read-model wording needs alignment
- Acceptance criteria:
  - lesson submission can be approved only after all suggestions are resolved
  - explicit parent completion remains required even when the engine found
    nothing
- Tests/QA:
  - regression covering blocked approval with unresolved suggestions
  - regression covering successful approval after resolution
  - `npx tsc --noEmit`
- Dependencies:
  - `7F.1`
- Stop conditions:
  - if current unresolved-state derivation disagrees with canonical
    parent-verification records in a way not covered by the current
    contract/doc set

Closeout:
- `7F.4` is now implemented and QA passed
- lesson-only approval is now wired to the existing canonical action:
  - `approveSubmissionReview(...)`
- approval remains lesson-only
- manual writing sample detail pages do not render or support lesson approval
- approval is blocked while unresolved suggestions remain
- the unresolved-suggestion guardrail is enforced both:
  - in the UI disabled state
  - server-side in the approval action
- unresolved state continues to derive from the existing Suggested Issues /
  shared review truth model rather than a new unresolved-state model
- accepted, overridden, `false_positive`, and `not_a_learning_issue` outcomes
  continue to count as resolved through existing shared truth
- explicit parent completion remains required even when the engine found no
  suggestions
- `7F.3` send-back behavior remains intact
- `7F.4` therefore closes as a lesson-only approval-guardrail restoration
  pass, not a Suggested Issue wording/visibility pass

QA evidence:
- `npx tsc --noEmit`
  - passed with exit code `0`
- `npm run build`
  - passed with exit code `0`
- code-level audit confirmed:
  - approval form is wired to `approveSubmissionReview(...)`
  - approval disabled state is driven by the existing shared unresolved count
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

Non-blocking caveat:
- the zero-unresolved approval success path was not manually re-tested in the
  active browser context because the active lesson submission still had
  unresolved suggestions
- code-level audit confirmed the expected path:
  - UI enables approval when unresolved count is `0`
  - server action approves only when shared unresolved checks pass
- this should be smoke-tested when a zero-unresolved or no-suggestion lesson
  item is available
- this caveat does not block `7F.4` closeout

Related finding preserved for the next slice:
- some Suggested Issues do not show a visible `Accept` button
- classify this as `7F.5` wording/visibility debt, not a `7F.4` regression
- the current code still contains an `Accept` action path
- `Accept` visibility is controlled by the shared review model through
  `allowsAccepted`
- `Accept` remains unavailable when a suggestion lacks canonical micro-skill
  truth
- the action layer also rejects `accepted` decisions without valid canonical
  micro-skill truth
- `7F.5` should clarify Suggested Issue action wording and visibility without
  weakening:
  - `allowsAccepted`
  - canonical micro-skill requirements
  - approval unresolved-suggestion guardrails
  - shared verification semantics

Residual boundaries preserved:
- `7F.5` still owns Suggested Issue action wording and visibility
- `7F.6` still owns lesson missed-word capture
- `7F.8` still owns returned lesson row and zero-suggestion lesson queue truth
  restoration
- `7F.9` still owns manual sample explicit completion persistence
- `7F.10` still owns focused Stage `7F` regression coverage
- no Stage `8` mastery/runtime work is authorized by this closeout

Mini-task `7F.5` — Suggested Issue Semantics Clarification
- ID:
  - `7F.5`
- Name:
  - `Suggested issue action wording and visibility`
- Purpose:
  - make the current Stage `7D` action-bearing panel unambiguous for parent
    review
- Scope:
  - ensure visible actions are:
    - `Accept`
    - `Override`
    - `False positive`
    - `Not a learning issue`
  - remove ambiguous `Not an Issue` wording if any remains in current UI copy
  - ensure recorded decisions are shown clearly post-action
- Non-goals:
  - no new verification semantics
  - no new source-of-truth tables
  - no queue logic changes
- Expected files/areas:
  - [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
  - [app/courses/review/review-utils.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/review-utils.ts:1)
- Acceptance criteria:
  - parent sees explicit `Accept`
  - wording reflects canonical decision names from the existing verification
    contract
  - previously recorded decisions remain visible
- Tests/QA:
  - UI/detail regression
  - `npx tsc --noEmit`
- Dependencies:
  - none
- Stop conditions:
  - if any label change conflicts with shared downstream decision names or the
    live action contract

Closeout:
- `7F.5` is now implemented and QA passed
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
- stale lesson-action copy was corrected so the page no longer says send-back
  and approval are deferred to later stages
- `7F.5` therefore closes as a wording/visibility clarification pass, not a
  catalog-population, verification-semantics, or queue-truth pass

Guardrails preserved:
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

QA evidence:
- `npx tsc --noEmit`
  - passed with exit code `0`
- `npm run build`
  - passed with exit code `0`
- `npm run lint`
  - was run and failed due to pre-existing repo-wide issues
  - failures are concentrated under `.tmp` regression artifacts plus unrelated
    files outside `7F.5`
  - the lint failure is not caused by the `7F.5` change

Related finding preserved outside Stage `7F`:
- the reason some Suggested Issues still cannot show `Accept` is missing
  canonical micro-skill mapping / truth readiness
- classify this as catalog / micro-skill mapping readiness debt, not a
  `7F.5` regression
- do not solve this inside `7F.5` or `7F.6`
- any mapping or population work must be handled in a separate docs-first
  catalog readiness pass

Residual boundaries preserved:
- `7F.6` still owns lesson missed-word capture
- `7F.8` still owns returned lesson row and zero-suggestion lesson queue truth
  restoration
- `7F.9` still owns manual sample explicit completion persistence
- `7F.10` still owns focused Stage `7F` regression coverage
- no Stage `8` mastery/runtime work is authorized by this closeout
- catalog / micro-skill mapping population is not part of Stage `7F`

Mini-task `7F.6` — Lesson Missed Word Restoration
- ID:
  - `7F.6`
- Name:
  - `Lesson missed word capture`
- Purpose:
  - restore a parent-facing missed-word path for lesson submissions using the
    existing backend action
- Scope:
  - add `Add missed word` control for lesson submissions
  - wire to `addMissedWordToSubmissionReview(...)`
  - ensure the saved result reappears in current Review Work truth
- Non-goals:
  - no manual writing sample missed-word support
  - no `7F.7` manual parent-authored issue path
  - no new durable-issue lifecycle
  - no general parent-authored issue model
  - no new source-of-truth table
  - no assignment/mastery/evidence/reward/analytics writes
  - no queue/archive redesign
  - no catalog/micro-skill mapping work
  - no Stage `8` work
- Expected files/areas:
  - [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
  - [app/courses/review/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/actions.ts:436)
  - [app/courses/review/review-utils.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/review-utils.ts:1)
- Provenance/rendering clarification:
  - `7F.6` implementation was paused before runtime changes because the
    current Review Work read model would re-surface a saved parent-added
    missed word as a generic engine-style `Suggested / candidate` entry
  - `7F.6` now defines the approved distinction before implementation resumes
  - a parent-added missed word is persisted Review Work review input authored
    by the parent
  - it is not:
    - engine-suggested candidate truth
    - unresolved engine output
    - verified issue truth
    - durable issue truth
    - mastery truth
    - assignment truth
  - parent-added missed words must not render inside the canonical Suggested
    Issues section as:
    - `Suggested / candidate`
    - `Unresolved`
    - or any engine-output framing
  - the approved rendering treatment for `7F.6` is a separate lesson-only
    parent-authored section in Review Work detail
  - parent-facing wording may be:
    - `Parent-added missed words`
    - or an equivalent compact parent-authored label
  - the separate section is presentation over existing persisted review truth
  - it must not create a second review workflow
  - Suggested Issues remains the canonical spine for engine/shared outputs
  - parent-added missed words must preserve parent-authored provenance
- Bounded provenance authorization:
  - existing persistence does not currently expose a safe enough distinction in
    the read model
  - `7F.6` is explicitly authorized to use a bounded provenance marker on
    existing lesson `misspelling_instances` rows
  - the provenance marker must be narrowly scoped:
    - only for lesson-submission rows created through
      `addMissedWordToSubmissionReview(...)`
    - only to distinguish parent-authored missed-word additions from
      engine-detected misspellings
    - may live on existing row metadata or existing row-attached persisted
      fields
    - must not create a new table
    - must not create a general parent-authored issue system
    - must not expand into `7F.7`
  - the marker must not be used to imply verified truth, durable issue truth,
    mastery truth, or assignment truth
- Acceptance criteria:
  - lesson detail allows parent to add missed word
  - saved parent-added missed word reappears in Review Work detail
  - saved parent-added missed word appears in a separate lesson-only
    parent-authored section
  - saved parent-added missed word does not render as engine-suggested truth
  - Suggested Issues remains the canonical section for engine/shared outputs
  - manual writing sample detail does not gain missed-word support
  - no new durable-issue lifecycle is introduced
  - no mastery/evidence/assignment/reward/analytics writes are introduced
- Tests/QA:
  - focused lesson missed-word regression
  - `npm run build`
  - `npx tsc --noEmit`
- Dependencies:
  - `7F.1`
- Stop conditions:
  - stop if implementation requires a broader provenance model than the
    bounded marker
  - stop if parent-added rows cannot be distinguished from engine-detected
    misspellings
  - stop if parent-added rows would need to render as `Suggested / candidate`
    or `Unresolved` engine output
  - stop if implementation requires a new table or general parent-authored
    issue lifecycle
  - stop if implementation pressure expands into manual samples, durable issue
    promotion, mastery/evidence, assignment, queue/archive, or catalog mapping

Mini-task `7F.7` — Parent-Authored Manual Issue Provenance
- ID:
  - `7F.7`
- Name:
  - `Manual sample parent-authored missed issue contract`
- Purpose:
  - define and implement the safest parent-authored missed-issue path for
    manual writing samples without misrepresenting provenance
- Scope:
  - extend `addManualWritingIssue(...)` or documented equivalent to accept
    `writing_sample_id`
  - create canonical durable issue truth on the manual sample
  - create a suggestion-shaped row only if the current Review Work
    history/read model requires it
  - if a suggestion-shaped row is used, it must be clearly parent-authored,
    not engine-suggested
- Non-goals:
  - no new verification decision family
  - no assignment generation
  - no manual sample completion yet
- Expected files/areas:
  - [app/courses/review/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/actions.ts:1223)
  - [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
  - [app/courses/review/review-utils.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/review-utils.ts:1)
- Acceptance criteria:
  - manual sample parent-added issue persists with clear provenance
  - UI/history does not present it as an engine suggestion
  - route-local UI still does not mutate mastery/evidence directly
- Tests/QA:
  - focused manual parent-authored issue regression
  - `npx tsc --noEmit`
- Dependencies:
  - none
- Stop conditions:
  - if current canonical model cannot represent parent-authored provenance
    cleanly without a new documented persistence rule
  - if a suggestion row is required but no safe source/provenance label exists
    in the current contract/doc set
- Closeout:
  - `7F.7` is complete
  - manual writing sample Review Work detail now exposes a parent-authored
    manual issue save path
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
- Guardrails preserved:
  - `7F.6` lesson-only parent-authored missed-word behavior remains intact
  - `7F.3` send-back behavior remains intact
  - `7F.4` approval guardrails remain intact
  - `7F.5` Suggested Issues wording/visibility remains intact
  - no new verification decision family was introduced
  - no manual sample completion behavior was introduced
  - no new source-of-truth table was introduced
  - no mastery, evidence, assignment, reward, analytics, queue, or archive
    truth changes were introduced
- QA evidence:
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
- Residual boundaries preserved:
  - `7F.8` still owns returned lesson row and zero-suggestion lesson queue
    truth restoration
  - `7F.9` still owns manual sample explicit completion persistence
  - `7F.10` still owns focused Stage `7F` regression coverage
  - no Stage `8` mastery/runtime work is authorized by this closeout
  - catalog / micro-skill mapping remains outside Stage `7F`

Mini-task `7F.8` — Queue Truth For Returned And Zero-Suggestion Lesson Work
- ID:
  - `7F.8`
- Name:
  - `Lesson queue truth restoration`
- Purpose:
  - prevent engine silence from auto-archiving lesson work and make returned
    rows distinct in the live queue
- Scope:
  - keep returned lesson submissions live
  - label them distinctly as `Sent back to child` or `Waiting for child
    revision`
  - keep pending zero-suggestion lesson submissions live until explicit
    approval
  - align detail copy with that truth
- Non-goals:
  - no manual sample completion persistence yet
  - no second queue surface
- Expected files/areas:
  - [app/courses/review/review-utils.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/review-utils.ts:934)
  - [app/courses/review/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/page.tsx:1)
  - [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
- Acceptance criteria:
  - returned lesson rows stay live and distinct
  - zero-suggestion pending lesson rows do not auto-archive
  - required wording appears on detail:
    - `No suggestions found. Please check the work and mark it complete when
      you are satisfied.`
- Tests/QA:
  - queue/detail regression for returned and zero-suggestion lessons
  - `npx tsc --noEmit`
- Dependencies:
  - `7F.3`
  - `7F.4`
- Stop conditions:
  - if thread-level archive rules conflict with submission-level status truth
    in a way not already covered by the current docs and read-model contract
- Closeout:
  - `7F.8` is complete
  - returned lesson submissions now remain live in the main Review Work queue
  - returned lesson submissions display distinct returned-state wording and do
    not disappear or collapse into an ambiguous generic state
  - zero-suggestion pending lesson submissions now remain live before approval
  - zero-suggestion pending lesson submissions do not auto-archive while still
    pending
  - lesson detail now shows the required wording:
    - `No suggestions found. Please check the work and mark it complete when
      you are satisfied.`
  - approval remains the explicit completion/archive boundary
  - approving a zero-suggestion lesson succeeds
  - completion/archive truth changes only after explicit approval
- Guardrails preserved:
  - `7F.8` restores queue/status truth only
  - `7F.8` does not create new verification semantics
  - `7F.8` does not change Suggested Issue decision semantics
  - `7F.8` does not alter micro-skill mapping
  - `7F.8` does not introduce mastery, evidence, assignment, reward,
    analytics, queue, or archive truth writes outside the bounded queue/status
    correction
  - `7F.8` does not authorize Stage `8` runtime work
  - `7F.3` send-back behaviour remains intact
  - `7F.4` approval still blocks on real unresolved engine/shared suggestions
  - `7F.5` Suggested Issues wording/help text remains unchanged
  - `7F.6` lesson Add missed word behaviour remains unchanged
  - `7F.7` manual writing sample parent-authored issue behaviour remains
    unchanged
- QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0`
  - `npm run build`
    - passed with exit code `0`
  - `npm run lint`
    - was run and failed due to pre-existing repo-wide lint debt
    - main known causes remain `.tmp` regression artifacts and unrelated
      existing files such as `app/auth/callback/route.ts` and
      `components/family-combobox.tsx`
    - no `7F.8`-specific lint regression was identified
  - manual/browser QA passed:
    - returned lesson live-queue result passed
    - zero-suggestion lesson live-queue result passed
    - zero-suggestion lesson detail-copy result passed
    - approval-boundary result passed
    - regression checks for `7F.3`, `7F.4`, `7F.5`, `7F.6`, and `7F.7`
      passed
    - no essential manual browser checks remain for `7F.8`
- Residual boundaries preserved:
  - `7F.9` remains the next safe Stage `7F` task
  - `7F.10` still owns focused Stage `7F` regression coverage
  - no Stage `8` mastery/runtime work is authorized by this closeout
  - spelling detection readiness remains outside this slice
  - canonical micro-skill mapping remains outside this slice
  - parent-selected micro-skill classification remains outside this slice

Mini-task `7F.9` — Manual Sample Completion Persistence
- ID:
  - `7F.9`
- Name:
  - `Manual sample explicit completion model`
- Purpose:
  - introduce the smallest safe persistence required so manual writing samples
    can be explicitly marked complete
- Scope:
  - add documented completion fields on `writing_samples`
  - add dedicated completion action
  - keep manual samples live until explicitly completed
- Non-goals:
  - no send-back for manual samples
  - no mastery/evidence/reward behavior
  - no zero-suggestion implicit completion
- Expected files/areas:
  - schema/migration area
  - [app/courses/review/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/actions.ts:1)
  - [app/courses/review/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/page.tsx:1)
  - [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
- Acceptance criteria:
  - manual sample remains live until explicit completion
  - archive status derives from durable completion truth, not unresolved count
    alone
  - completion behavior does not imply mastery/evidence mutation
- Tests/QA:
  - focused manual completion regression
  - schema verification
  - `npx tsc --noEmit`
- Dependencies:
  - `7F.7`
- Stop conditions:
  - if permission, provenance, or persistence ownership for manual review
    completion is not explicitly covered by current docs plus the new
    roadmap/status breakdown before implementation
- Closeout:
  - `7F.9` is complete
  - manual writing samples now remain live until explicit completion
  - manual writing sample archive status now derives from durable completion
    truth on `writing_samples`, not unresolved count alone
  - manual writing sample detail now exposes an explicit completion action
  - completing a manual writing sample persists durable completion truth
  - completed manual writing samples appear in archive/completed view
  - pending manual writing samples appear in `To be reviewed` / live
  - approved/completed lesson submissions appear in archive/completed view
  - returned lessons remain live
  - zero-suggestion pending lessons remain live until explicit approval
  - no item falls into neither live nor archive
  - explicit approval/completion remains the archive boundary
- Guardrails preserved:
  - `7F.9` restores and formalizes manual sample explicit completion truth
    only
  - `7F.9` does not create new verification semantics
  - `7F.9` does not change Suggested Issue decision semantics
  - `7F.9` does not alter micro-skill mapping
  - `7F.9` does not introduce mastery, evidence, assignment, reward, or
    analytics writes
  - `7F.9` does not authorize Stage `8` runtime work
  - `7F.3` send-back behaviour remains intact
  - `7F.4` approval guardrails remain intact
  - `7F.5` Suggested Issues wording/help text remains unchanged
  - `7F.6` lesson Add missed word behaviour remains unchanged
  - `7F.7` manual writing sample parent-authored issue behaviour remains
    unchanged
  - `7F.8` returned lesson and zero-suggestion lesson queue truth remains
    unchanged
- QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0`
  - `npm run build`
    - passed with exit code `0`
  - `npm run lint`
    - was run and failed due to pre-existing repo-wide lint debt
    - main known causes remain `.tmp` regression artifacts and unrelated
      existing files such as `app/auth/callback/route.ts` and
      `components/family-combobox.tsx`
    - no `7F.9`-specific lint regression was identified
  - manual/browser QA passed:
    - existing approved/completed lesson submission appears in
      archive/completed view
    - existing completed manual writing sample appears in archive/completed
      view
    - pending manual writing sample appears in `To be reviewed` / live
    - pending zero-suggestion lesson appears in `To be reviewed` / live
    - returned lesson appears in `To be reviewed` / live with returned
      wording
    - completing a manual writing sample moves it from live to archive
    - approving a lesson moves it from live to archive
    - no item disappears from both live and archive
    - regressions for `7F.3` through `7F.8` all passed
    - no essential manual browser checks remain for `7F.9`
- Residual boundaries preserved:
  - `7F.10` remains the next safe Stage `7F` task
  - no Stage `8` mastery/runtime work is authorized by this closeout
  - spelling detection readiness remains outside this slice
  - canonical micro-skill mapping remains outside this slice
  - parent-selected micro-skill classification remains outside this slice

Mini-task `7F.10` — Stage 7F Regression Coverage
- ID:
  - `7F.10`
- Name:
  - `Focused Stage 7F regression suite`
- Purpose:
  - add bounded regression coverage in the repo’s current script-based style
- Scope:
  - add one Stage `7F` regression script
  - validate lesson actions, manual restrictions, queue truth, and explicit
    completion truth
- Non-goals:
  - no general e2e harness invention
  - no unrelated Stage `8` coverage
- Expected files/areas:
  - `scripts/`
- Acceptance criteria:
  - script runs and covers all completed `7F` mini-tasks
- Tests/QA:
  - direct Stage `7F` regression harness execution
  - `npx tsc --noEmit`
  - `npm run build`
- Dependencies:
  - after all prior mini-tasks
- Stop conditions:
  - if required fixtures depend on missing documented persistence or identity
    rules
- Closeout:
  - `7F.10` is complete
  - a bounded Stage `7F` regression script now exists:
    - `scripts/writing-engine-stage7f-parent-review-restoration-regression.ts`
  - the regression script was run directly; no package command is currently
    registered for it
  - the script follows the repo’s current script-based regression style
  - the script covers:
    - lesson send-back behavior
    - approval guardrails
    - Suggested Issues wording/visibility semantics
    - lesson parent-authored missed-word provenance
    - manual parent-authored issue provenance
    - returned lesson live-queue truth
    - zero-suggestion lesson live-queue truth
    - manual sample explicit completion/archive truth
    - archive visibility integrity across lessons and manual samples
  - no new harness was introduced
  - no Stage `8`, mapping/readiness, or mastery/evidence behavior was
    introduced
- Guardrails preserved:
  - `7F.10` adds bounded regression coverage only
  - `7F.10` does not create new product semantics
  - `7F.10` does not change Suggested Issue decision semantics
  - `7F.10` does not alter micro-skill mapping
  - `7F.10` does not introduce mastery, evidence, assignment, reward, or
    analytics writes
  - `7F.10` does not authorize Stage `8` runtime work
  - `7F.3` send-back behaviour remains intact
  - `7F.4` approval guardrails remain intact
  - `7F.5` Suggested Issues wording/help text remains unchanged
  - `7F.6` lesson Add missed word behaviour remains unchanged
  - `7F.7` manual writing sample parent-authored issue behaviour remains
    unchanged
  - `7F.8` returned lesson and zero-suggestion lesson queue truth remains
    unchanged
  - `7F.9` manual sample explicit completion/archive truth remains unchanged
- QA evidence:
  - `npx tsc --noEmit`
    - passed with exit code `0`
  - `npm run build`
    - passed with exit code `0`
  - direct Stage `7F` regression harness execution passed with success output
    confirming the regression script is `ok`
  - `npm run lint`
    - was run and failed due to pre-existing repo-wide lint debt
    - main known causes remain `.tmp` regression artifacts and unrelated
      existing files such as `app/auth/callback/route.ts` and
      `components/family-combobox.tsx`
    - no `7F.10` source-file lint regression was identified
  - regression-script QA passed:
    - the script meaningfully exercises completed Stage `7F` lifecycle and
      guardrail slices
    - the script is not placeholder-only
    - no essential manual browser checks remain for `7F.10`
- Stage `7F` overall closeout:
  - `7F.1` through `7F.10` are complete
  - Stage `7F` overall is now complete and closed
  - the next safe task after Stage `7F` is the already-documented Stage `8`
    docs-first foundation audit boundary, not new Stage `7F` behaviour work
- Residual boundaries preserved:
  - no Stage `8` mastery/runtime work is authorized by this closeout
  - spelling detection readiness remains outside this slice
  - canonical micro-skill mapping remains outside this slice
  - parent-selected micro-skill classification remains outside this slice

## Post-Stage-7 private MVP safety slice

Goal:
- make parent-facing dashboard and insights language safe for a private,
  parent-led MVP after Stage `7`
- distinguish verified `Review Work` truth from broader inferred
  progress/mastery summaries without changing stored truth, scoring, or
  assignment generation

Behaviour contract:
- `Review Work` remains the canonical parent review surface
- `Add Writing Sample` remains intake only
- parent-facing dashboard and insights surfaces may summarise existing shared
  truth, but they must not imply stronger mastery certainty than the current
  evidence model supports
- parent-facing wording must make it clear when a surface is:
  - verified review truth
  - evidence/progress signal
  - advisory interpretation
- this slice may adjust copy, labels, and explanatory text only
- this slice must not change:
  - verification semantics
  - mastery scoring
  - evidence weighting
  - assignment generation ownership
  - route-local truth ownership

Non-goals:
- no Stage `8` automatic mastery semantics
- no scoring recalibration
- no promotion/demotion logic changes
- no assignment-generation redesign
- no new persistence
- no new dashboard analytics model

Acceptance criteria:
- parent-facing copy no longer implies stronger mastery certainty than the
  documented evidence model supports
- dashboard and insights remain usable for a parent, but clearly advisory where
  evidence is still immature
- `Review Work` remains the canonical review surface for verified parent action
  truth
- no stored mastery/evidence, assignment, reward, analytics, or taxonomy truth
  is changed by this slice

Stop-and-return-to-docs rules:
- stop if implementation appears to require stored mastery-state changes
- stop if implementation appears to require scoring or threshold recalibration
- stop if implementation appears to require new assignment-routing semantics
- stop if implementation appears to require a new parent-facing mastery state
  rather than copy clarification

## Stage 8 foundation audit — evidence maturity and mastery-claim readiness

Status:
- complete
- documentation-first and transparency-only
- automatic mastery runtime semantics not started

Goal:
- define what parent-facing evidence maturity means before any automatic
  mastery work
- make it safe for parent-facing summary surfaces to describe limited or
  growing evidence without overclaiming mastery certainty

Current implemented truth this slice may rely on:
- `Review Work` parent verification is canonical verified truth
- dashboard and insights already read existing shared evidence/progress models
- current read models already expose advisory signals such as:
  - total evidence count
  - recent success / failure mix
  - latest evidence source context
  - current competency / progress-state projections

Required boundaries:
- evidence maturity is an advisory presentation concept, not a new stored
  mastery state
- parent-facing summary surfaces must distinguish:
  - verified review truth
  - evidence / progress signal
  - advisory interpretation
- this slice must not change:
  - mastery scoring
  - evidence weighting
  - thresholds
  - promotion / demotion logic
  - assignment generation
  - reward logic
  - analytics truth
  - route-local truth ownership

What is still missing before real Stage 8 runtime work:
- explicit automatic mastery semantics over the current evidence ledger
- documented score / threshold ownership for promotion or demotion
- any new stored evidence-maturity or mastery-state fields
- stronger parent-facing mastery claims than the current advisory model

Acceptance criteria:
- canonical docs clearly define evidence maturity before automatic mastery work
- parent-facing summaries can describe early / building / broader evidence
  without implying automatic mastery
- `Review Work` remains the canonical parent review surface
- no stored mastery/evidence, assignment, reward, analytics, or taxonomy truth
  changes in this slice

Completed closeout record:
- Stage `8` completed as a boundary-safety and parent-facing
  evidence-wording stage, not a mastery-runtime stage
- `Review Work` remains the canonical verified-truth surface
- dashboard and insights remain advisory evidence / progress summaries only
- no runtime mastery semantics, scoring, thresholds, persistence, routing,
  assignment logic, reward logic, positive-evidence logic, or `Review Work`
  workflow changed as part of Stage `8` closeout
- completed Stage `7F` behavior remained preserved

Stop-and-return-to-docs rules:
- stop if implementation appears to require new stored evidence fields
- stop if implementation appears to require mastery-score changes
- stop if implementation appears to require threshold recalibration
- stop if implementation appears to require new parent-facing mastery states
- stop if implementation appears to require assignment-routing changes

## Stage 8A — Parent-facing evidence wording safety pass

Status:
- complete

Type:
- copy/label/help-text/presentation-only

Purpose:
- reduce parent-facing wording that may imply stronger mastery certainty than
  the evidence model supports

Preserve:
- `Review Work` remains the canonical verified-truth surface
- evidence-maturity vocabulary remains advisory
- Stage `8A` is not mastery logic and does not broaden into automatic mastery
  semantics

Allowed:
- soften labels, help text, and explanatory copy on parent-facing dashboard,
  insights, and progress-summary surfaces
- clarify when a parent-facing surface is:
  - verified review truth
  - evidence / progress signal
  - advisory interpretation

Runtime surfaces expected for the later implementation prompt:
- `app/dashboard/page.tsx`
- `app/insights/page.tsx`
- `lib/writing-practice/types.ts`
- `lib/progress/stateModel.ts`

Completed implementation record:
- softened parent-facing certainty language only
- preserved `Review Work` as the canonical verified-truth surface
- kept summary surfaces limited to advisory evidence / progress interpretation
- did not change runtime mastery semantics, scoring, thresholds, persistence,
  routing, reward logic, positive-evidence logic, assignment logic, or
  `Review Work` workflows
- preserved completed Stage `7F` behavior unchanged
- bounded verification completed with `npx tsc --noEmit`

Acceptance criteria:
- parent-facing summary wording is clearly advisory
- evidence-maturity vocabulary remains advisory
- `Review Work` remains the explicit verified-truth reference
- no runtime semantics change

Stop-and-return-to-docs rules:
- stop if implementation requires a new mastery state
- stop if implementation requires scoring or threshold changes
- stop if implementation requires routing changes
- stop if implementation requires new persistence or stored mastery state
- stop if implementation requires reward changes
- stop if implementation requires positive-evidence algorithm changes
- stop if implementation requires `Review Work` workflow changes
- stop if implementation would reopen completed Stage `7F` behavior

Residual wording risk:
- `Golden Nugget`
- `In the Machine`
- `Gold Bar so far`
- these remain product-metaphor labels that are now framed more safely
- they are a possible future copy-only pass, not a blocker

Next safe follow-up:
- Stage `8` is closed through the completed docs-first audit and completed
  `Stage 8A` wording pass
- no broader Stage `8` runtime work is authorized by this closeout
- because no next implementation stage is canonically defined here, the next
  safe step is a docs-first planning / audit pass
- residual metaphor wording risk remains future copy debt only, not a blocker

## Deferred or intentionally out of scope

Not part of the current roadmap stage:
- full-document spellcheck as the first deliverable
- full homophone engine
- external APIs as educational truth
- giant word registry before the first loop is working
- giant prerequisite graph before the first loop is working
- reviving `/analyse`, `/practice`, or `/assignments` as active runtime surfaces
- using multiple active planning docs for this same initiative

## Source merge note

This roadmap absorbs the active planning intent that previously existed outside
the repo in:
- [PLAN.md](</Users/katiesanderson/Downloads/PLAN.md>)
- [long termPLAN.md](</Users/katiesanderson/Downloads/long termPLAN.md>)

Those external files should no longer be treated as active planning sources.
