# Targeted Writing Practice Architecture

## Purpose

This document describes the intended MVP architecture for Targeted Writing Practice.

Top-level Writing Engine identity, product spine, mastery semantics, and
long-term assignment direction now defer to:

- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

It separates:
- canonical issue truth
- learning-item truth
- legacy runtime dependencies
- suggestion-seed infrastructure

## Current live architecture summary

Today the repo already has:
- `task_submissions` for writing/task hand-in
- `task_submission_drafts` for returned-work restoration
- `writing_samples` for spellcheckable text
- `misspelling_instances` for detected spelling concerns
- `spelling_reward_states` and `spelling_reward_events` for progress display
- `lib/writing-engine` as the shared Stage 1A domain boundary for future
  diagnostics, verification, mastery evidence, and assignment composition

Current limitation:
- `misspelling_instances` are recreated on reanalysis and are not durable enough to serve as the long-term issue lifecycle record

Current transitional reality:
- the course review surfaces now use durable accepted and rejected outcomes to decide whether review work is resolved
- child returned-work resubmissions now create durable `writing_issue_correction_attempts` and move linked issues to `child_responded`
- parent can now final-classify `child_responded` issues into the canonical final classifications
- qualifying finalised learning-gap issues can now create canonical writing-practice `learning_items`
- Slice 7A now explicitly confirms `learning_items` as canonical active learning/practice/mastery truth
- parent review detail can show returned-issue response history even when the fresh spelling sample no longer contains the original misspelling
- returning a submission currently sends back all linked eligible durable issues on that submission, not a parent-selected subset
- existing reward UI still reads Nugget / workshop / bar state from `spelling_reward_states`
- the old `/analyse`, `/analyse/review`, `/practice`, and `/assignments`
  spelling-era pages are retired redirects rather than active runtime surfaces
- `daily_assignments` now survives only as legacy assignment-header debt during
  the transition; new engine work should prefer generic `assignment_items`
- this means the repo is in a deliberate transitional state rather than a fully reconciled single-review-flow architecture
- raw override taxonomy entry in `Review Work` is boundary debt rather than
  canonical architecture truth
- later override-option population must pass through a bounded catalog-backed
  provider contract before runtime implementation

Review Work Suggested Issue override-option provider boundary:
- first slice is limited to lesson/task-submission-backed spelling suggestions
  only
- `micro_skill_catalog` remains the only mini-skill identity source
- provider options must be exposed through a bounded provider/read model rather
  than unrestricted catalog browsing
- server-side override validation is covered by the existing tracked
  override-provider behavior regression
- selectable Review Work override-provider UI/runtime remains deferred
- template routing is micro-skill-owned and should derive from the verified
  micro-skill's configured template metadata
- `verified_template_key` remains deferred/blocked in Review Work for this
  stage
- no first-slice implementation may save free-text mini-skill or free-text
  template override truth
- any future selectable Review Work provider UI and the live save path must
  share the same bounded
  canonical anchor derivation when persisted shared suggestion truth is still
  absent or `unknown`
- no parent-facing template dropdown/provider is authorized in this boundary
- any later template choice UI must be separately authorized and bounded to the
  verified micro-skill's allowed template metadata

Review Work read-only derived template metadata boundary:
- the bounded read-only display slice is now implemented for lesson/task-
  submission spelling suggestions in `Review Work`
- Review Work continues to verify micro-skill truth only
- template metadata derives from the canonical/verified micro-skill rather
  than word-by-word parent choice
- derivation may use only canonical Stage 2A/2D template registry truth rooted
  in the micro-skill
- unresolved template metadata must display as unavailable/deferred messaging
  rather than an input
- no editable `verified_template_key`, no template dropdown/provider, and no
  independent template truth persistence are authorized in this slice

Durable Structured Submission Payloads architecture boundary:
- structured lesson/test answer boxes must not depend on
  `task_submission_drafts` as their only archive after child submit
- `task_submission_drafts` is mutable working state for autosave,
  in-progress work, and returned/editable correction state
- `task_submissions` is the submitted attempt header and workflow record; its
  `submission_text` is a flattened readable representation, not reliable
  structured answer JSON
- `task_submission_payloads` owns immutable submitted structured
  attempt evidence
- planned table fields:
  - `id`
  - `submission_id`
  - `parent_user_id`
  - `course_id`
  - `task_id`
  - `child_id`
  - `payload_type`
  - `payload_version`
  - `payload_json`
  - `created_at`
  - `updated_at`
- initial `payload_type` values:
  - `structured_lesson_response`
  - `structured_test_response`
- constraints and indexes:
  - unique `(submission_id, payload_type)`
  - lookup index on `(task_id, child_id, created_at desc)`
  - optional lookup index on
    `(parent_user_id, child_id, task_id, created_at desc)` where useful
  - `payload_json` stores the structured response object, not flattened text
- RLS/security:
  - enable RLS
  - authenticated parent access is scoped to
    `auth.uid() = parent_user_id`
  - authenticated browser clients have parent-scoped `SELECT` only
  - writes are reserved for trusted server/service persistence
  - server-side submit and approval code must derive ownership fields from
    trusted submission/task context, not client-provided spoofable ids
- submit-flow contract:
  1. parse and validate structured response
  2. insert `task_submissions` with flattened `submission_text`
  3. immediately insert `task_submission_payloads`
  4. if payload insert fails, roll back or delete the just-created submission
     and return an error
  5. only after durable payload succeeds may existing side effects continue,
     including task completion, writing sample creation, rewards, draft upsert,
     or draft cleanup
- submit-flow implementation status:
  - Pass 2 is implemented and QA-passed
  - `app/learn/actions.ts` orchestrates task/child validation,
    `task_submissions` insert, helper call, rollback, and existing success
    side effects
  - privileged payload persistence is isolated in
    `lib/lessons/persistence/submission-payloads.ts`
  - the helper imports `server-only`, creates the service-role client, maps
    lesson/test task types to payload types, inserts `task_submission_payloads`,
    and returns a typed success/failure result
  - `app/learn/actions.ts` does not import `createServiceRoleClient` and does
    not insert into `task_submission_payloads` directly
  - primary structured submit uses the embedded structured response from
    `draft_payload`
  - structured quick-submit compatibility can derive a narrow payload from
    `lesson_schema + submission_text`, mapped only to the first supported
    text/textarea block
  - quick-submit fallback is not a full structured authoring path and returns
    no payload for missing, invalid, or unsupported schemas
  - plain-writing behavior is unchanged
- hydration contract:
  - load latest draft and latest relevant durable submitted payload
  - use draft when no submission exists or latest submission is returned
  - use durable submitted payload when the latest structured submission is
    pending, approved, or completed and not returned
  - legacy structured rows without durable payload must not crash; they may
    fall back to existing empty or flattened-text behavior
  - implementation status: Pass 3 is implemented and QA-passed; returned-child
    legacy recovery is also implemented and QA-passed
  - child structured lesson/test revisit reads
    `task_submission_payloads.payload_json` for the exact latest non-returned
    submission
  - the original visible blank-answer-box bug is fixed for submissions with
    durable payloads
  - returned work remains draft-first and editable; if a returned draft lacks
    meaningful structured answers, hydration can fall back to durable payload,
    then to label-matched text/textarea reconstruction from flattened
    `submission_text`
- approval contract:
  - before deleting `task_submission_drafts` for structured lesson/test
    submissions, check that the approved submission has durable payload
  - delete draft only if the durable payload exists
  - if no durable payload exists, skip draft deletion and keep approval
    otherwise unchanged
  - approval must never delete, overwrite, or mutate durable submitted payloads
  - implementation status: Pass 4 is implemented and QA-passed
  - plain-writing and non-structured approval behavior remains unchanged
- returned/send-back contract:
  - returned flow remains draft-first and editable
  - returned flow continues to merge `__field_feedback` and
    `__writing_issue_feedback` into the draft
  - durable payload support must not break returned hydration
  - manual browser QA confirmed an approved structured lesson can be returned
    to the child, the restore banner appears, and original answer fields are
    populated and editable
  - child returned-work UI consumes returned draft feedback only; it must not
    independently query raw `misspelling_instances`
  - parent send-back owns preparing `__writing_issue_feedback` from durable
    `writing_issues`
  - parent send-back must write and check the returned draft feedback payload
    before setting `parent_review_status` to `returned`
  - if the returned draft cannot be prepared for the child, send-back must fail
    rather than create a false successful returned state
  - parent-added missed words remain separate from engine `Suggested Issues`
    in `Review Work`, but structured lesson/test send-back must still treat
    them as eligible returned-child correction targets
  - parent-added materialized `writing_issues` must preserve parent-authored
    provenance in metadata
  - `micro_skill_key: "unknown"` is valid for send-back and child retry; only
    learning-item creation after final classification requires an assignable
    catalogued micro-skill
  - if a parent adds a missed word after work is already returned, the safe
    MVP path is to resend through the return action rather than adding a
    child-page raw misspelling read model
- unified Parent Review spelling workflow contract:
  - UX and page sequence details live in
    [docs/workflows/parent-review-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/parent-review-workflow.md:1)
  - architecture rule: the unified spelling review table is a read model, not
    a new source-of-truth table
  - the read model may assemble from `misspelling_instances`,
    `writing_issue_suggestions`, `parent_verifications`, `writing_issues`,
    `writing_issue_correction_attempts`, `spelling_catalog_review_cases`, and
    candidate mapping state
  - do not duplicate `writing_issues` onto a new child resubmission for display
  - do not recreate parent-added missed words after child resubmission
  - do not treat regenerated engine candidates as returned corrections
  - preserve parent-authored provenance when parent-added rows are materialised
    into durable returned correction targets
  - final classification for returned corrections targets the original
    `writing_issue.id`
  - `task_submission_payloads` remain submitted evidence, not returned
    correction lifecycle truth
  - returned-correction admin/catalog-review and parent-local promotion need a
    specific returned-row bridge contract before implementation if the current
    routes only support candidate mappings or raw misspelling rows
- non-goals:
  - no `4E` / `4E.3` resolver work
  - no admin/catalog-review work
  - no manual writing sample expansion
  - no hosted historical backfill
  - no mastery, reward, assignment, scoring, analytics, dashboard, or
    template-routing change
  - no `micro_skill_catalog` mutation
- implementation sequence:
  1. storage foundation only: complete
  2. submit persistence: complete
  3. child revisit hydration: complete
  4. approval draft-deletion safety: complete
  5. closeout/regression hardening: complete for this bounded track
- validation evidence:
  - storage, submit persistence, hydration, and approval draft-safety
    regressions passed
  - `npx tsc --noEmit`, `npm run build`, and `git diff --check` passed
  - manual structured lesson-page smoke proved payload rows are created and
    survive parent approval
  - manual checks passed for approved revisit, returned/send-back, legacy
    fallback, and plain-writing unchanged
- next safest pass:
  - read-only historical data-integrity audit and optional local/operator
    recovery plan
  - inventory structured lesson/test submissions without durable payloads,
    returned drafts with empty structured answers, summary-text-only
    recoverable submissions, and duplicate/pending historical rows for the
    same task/child
  - no hosted historical backfill by default
  - no resolver, admin/catalog-review, catalog mutation, mastery, reward,
    assignment, scoring, analytics, dashboard, or template-routing work

Parent-Verified Spelling Candidate Capture architecture boundary:
- the bounded Slice `2` stage now lets parents classify eligible
  lesson-submission-backed unmapped or parent-added spelling mistakes against
  existing canonical micro-skills for future reuse
- Slice `2` must not change future suggestion resolver behavior, `Accept`
  readiness, template-key truth, or current `Review Work` ownership beyond the
  documented capture flow
- example:
  - `natral -> natural` may be classified against an existing canonical
    micro-skill, but that initial capture remains non-canonical until explicit
    promotion
- preserve three layers:
  - verified spelling evidence for the reviewed child occurrence
  - candidate spelling mapping stored separately from canonical truth
  - canonical or promoted mapping truth reusable only after explicit promotion
- candidate mappings must be stored separately from:
  - `micro_skill_catalog`
  - existing deterministic Stage `2C` / Slice `1` catalog-backed mapping logic
  - `writing_issues`
  - `parent_verifications`
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
- parent-local promotion is the highest authority authorised in the
  single-child MVP
- parent-local promoted mappings may improve suggestions only inside the same
  parent/child environment
- global canonical promotion remains a separate curator/admin workflow deferred
  from MVP
- Slice `2` QA closeout:
  - candidate capture works on eligible lesson-submission spelling rows
  - success state is visible after save
  - pending candidate mappings do not unlock `Accept`
  - pending candidate mappings are not used by future suggestion resolution
  - parent-added missed words persist and remain reviewable after reopen
  - manual writing samples remain excluded
- known limitation:
  - candidate capture depends on seeded canonical micro-skill coverage
  - valid rows such as `natral -> natural` may remain blocked until the
    correct canonical micro-skill exists in the seeded/catalog-backed option
    set
- UX follow-up note:
  - a captured row may remain visible in both `Suggested / candidate` and
    `Parent Verification` while the mapping remains
    `pending_parent_promotion`
  - this is acceptable for Slice `2` and may receive clearer wording later
- normal parent `Review Work` must not directly create global canonical truth
- pending candidate mappings are not reusable
- raw parent-authored missed-word rows, raw `misspelling_instances`, and raw
  `writing_issues` are not reusable suggestion truth by themselves
- first safe runtime scope is:
  - lesson-submission-backed spelling rows only
  - includes parent-added missed words attached to lesson submissions
  - excludes manual writing samples from the first runtime slice
  - excludes future suggestion resolver changes until promotion is implemented
- Slice `4A` catalog-review architecture boundary:
  - docs-only contract after Slice `3` parent-local promotion
  - parent-facing action label: `No matching skill`
  - helper copy: `Send this spelling case to catalog review.`
  - `Uncategorised` is not the primary label because it sounds like a final
    state rather than a request for curation
  - `Needs new skill` is not the only label because admin may decide an
    existing skill fits, the case is word-level only, the case is not a
    learning issue, or the case should be merged or superseded
  - parent action may create or update a catalog-review case only
  - parent action must not create global canonical mappings, new micro-skills,
    or resolver-visible truth
- future `spelling_catalog_review_cases` table should own catalog-review case
  workflow because:
  - `parent_verified_spelling_candidate_mappings` requires an existing
    `micro_skill_key`, while the Slice `4` gap is often that no suitable
    micro-skill exists
  - `writing_issues` are durable reviewed issue history, not catalog-curation
    workflow
  - case rows need source lineage, normalized misspelling/correction,
    representative context, parent reason/note, review status, admin decision,
    merge/supersede metadata, and audit fields
- Slice `4B.1` implemented and QA-passed case-capture architecture:
  - `spelling_catalog_review_cases` stores parent-raised catalog-review cases
    for eligible lesson-submission spelling rows only
  - parent workflow starts from the compact spelling review table and uses
    `No matching skill` only when no existing catalog-backed micro-skill fits
  - saved state should be non-blocking, for example
    `Sent to catalog review`
  - optional `parent_note` is allowed by the implemented action/table contract
  - parent can still complete or return Review Work according to existing rules
- implemented table fields:
  - identity: `id`, `created_at`, `updated_at`
  - ownership/source: `parent_user_id`, `child_id`, `task_submission_id`,
    nullable `writing_sample_id`, nullable `source_suggestion_id`,
    `source_misspelling_instance_id`, `source_provenance`,
    `reviewed_event_source_entity_id`
  - spelling evidence: `original_child_spelling`,
    `original_correct_spelling`, `misspelling_normalized`,
    `correct_spelling_normalized`
  - workflow/evidence: `case_status`, `parent_note`, `metadata`
- allowed initial `source_provenance` values:
  - `lesson_submission_existing_output`
  - `lesson_submission_parent_added_missed_word`
- initial Slice `4B.1` case statuses are `open`, `closed_duplicate`, and
  `superseded`; parent action can create/update only `open`
- idempotency:
  - one open case per `parent_user_id + child_id +
    source_misspelling_instance_id`
  - repeated parent submissions update the existing open case
  - closed/superseded historical cases may remain
  - existing parent verification, candidate mapping, or durable issue truth
    should prevent duplicate catalog-review capture where appropriate
- implemented `captureSpellingCatalogReviewCase` server action:
  - accepts only `submission_id`, `misspelling_instance_id`, optional
    `parent_note`, and `redirect_path`
  - requires authenticated parent ownership and verifies submission, child,
    writing sample, and misspelling scope
  - rejects manual writing samples and rows without lesson/task-submission
    lineage
  - does not accept `micro_skill_key`
  - does not create `parent_verifications`,
    `parent_verified_spelling_candidate_mappings`, or `writing_issues`
  - does not write `micro_skill_catalog`
  - does not affect resolver data, mastery, rewards, analytics, templates, or
    assignments
- Slice `4B.1` implementation closeout:
  - parent-scoped RLS and server-side authenticated parent ownership checks are
    in place
  - open-case idempotency dedupes repeated captures for the same
    `parent_user_id + child_id + source_misspelling_instance_id`
  - compact Review Work exposes `No matching skill` only for eligible rows and
    shows `Sent to catalog review` after capture
  - parent-added lesson missed words attached to lesson submissions are
    supported
  - the UI gracefully withholds case capture when the case table is unavailable
  - the closeout added no admin queue, admin decisions,
    canonical/global mapping writes, parent-created global canonical truth,
    micro-skill creation, resolver priority change, manual writing sample
    broadening, or mastery/reward/assignment/scoring/analytics/template changes
- RLS/auth:
  - authenticated parent access must be scoped to
    `auth.uid() = parent_user_id`
  - server action ownership checks remain required even with RLS
  - no admin policies or routes are part of Slice `4B.1`
  - future admin read/update policies belong to Slice `4C`/`4D`
- staged architecture:
  - Slice `4B.0`: bounded Review Work micro-skill option filtering by
    family/cluster using existing `micro_skill_catalog` metadata only
  - Slice `4B.1`: parent `No matching skill` case capture for eligible
    lesson-submission spelling rows only
  - Slice `4C`: minimal protected admin/catalog-review read/triage surface
  - Slice `4D`: admin decisions and canonical promotion
- Slice `4B.0` filtering safeguard:
  - helps parents find existing canonical skills before raising
    `No matching skill`
  - reduces false catalog-review cases
  - must not create micro-skills, allow free-text `micro_skill_key`, write
    canonical truth, change resolver priority, or block parent review
    completion
- admin surface timing:
  - Slice `4C` runtime is implemented and QA passed as a protected read-only
    catalog-review admin UI
  - do not create a broad admin system upfront
  - first admin surface should be introduced only after parent-raised cases can
    exist
  - admin/internal access convention is defined in
    [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
  - first admin review surface is `/admin/catalog-review`
  - admin identity for the private MVP comes from private server-side
    `ADMIN_USER_IDS` and `ADMIN_EMAILS` allowlists
  - there is no DB admin role table, Supabase custom claims model,
    role-management UI, or separate admin login in Slice `4C`
  - authenticated parent identity is not admin/internal identity; parent-scoped
    ownership checks and RLS remain parent-scoped
  - `app/admin/layout.tsx` is the mandatory server-side guard for admin pages
  - `/admin/catalog-review` also calls `requireAdminUser()` before creating or
    using the service-role client; this page-level guard is outside broad
    data-read error handling
  - admin APIs are not implemented yet; future `/api/admin/*` route handlers
    must call the same admin helper before querying data
  - admin reads use a server-only service-role helper after admin authorization
    passes
  - no admin RLS read policies are added for v1
  - admin reads must be explicit, auditable, and tested before launch
  - parent users must not be able to list other parents' catalog-review cases
  - any service-role usage must be server-only and never exposed to client
    components
  - implemented admin view shows only open `spelling_catalog_review_cases`,
    groups by normalized `misspelling -> correction`, sorts groups by latest
    `updated_at`, and displays count/latest date, representative context,
    parent reason/note, source provenance, status, and limited supporting
    spelling context
  - first admin view provides read/triage visibility only, includes safe
    empty/error states, and avoids unnecessary parent/child identity exposure
  - do not start with a full admin dashboard, broad role-management work, CMS,
    or global catalog mutation from parent UI
  - Slice `4C` must not add admin decisions, canonical/global promotion,
    micro-skill creation, resolver changes, parent `Review Work` behavior
    changes, manual writing sample expansion, or
    mastery/reward/assignment/scoring/analytics/template changes
- admin decisions are later than parent capture and may include:
  - link existing skill
  - create/propose new skill
  - word-level only
  - not a learning issue
  - merge duplicate
  - supersede/reopen
- Slice `4D.1` is implemented and QA passed as case-only admin decisions:
  - `linked_existing_skill`
  - `new_skill_needed`
  - `word_level_only`
  - `not_a_learning_issue`
  - `no_action_needed` is not implemented in `4D.1`
  - `linked_existing_skill` validates an existing active, assignable `D4`
    `micro_skill_catalog.micro_skill_key`
  - `linked_existing_skill` does not create canonical/global mapping truth,
    affect resolver output, or promote anything globally
- `new_skill_needed` does not create a new micro-skill; `word_level_only`
  resolves a real spelling issue as word-specific; `not_a_learning_issue`
  resolves a case as not useful for learning/practice/catalog truth
- Slice `4D.1` admin UI uses one compact per-case decision table that visually
  follows the compact Review Work table pattern where appropriate and uses
  admin-specific evidence and curation semantics:
  - parent Review Work table purpose is evidence classification/reporting
  - admin table purpose is evidence review and decision-path curation
  - main table fields are Wrong Word, Correct Word, Reason, Skill Family,
    Skill Cluster, Micro-skill, Decision, and Actions
  - Source, Evidence Count / Source Count, Current Status, Latest Original
    Spelling Pair, Representative Context, Parent Note, Decision Note, and
    Decision History live in case details/disclosure
  - do not add group-wide mutation buttons to normalized
    `misspelling -> correction` groups
  - controls use clear labels, keyboard access, and accessible icon actions;
    no Archive action is implemented
- Slice `4D.1` audit uses `spelling_catalog_review_case_decisions` as the
  app/RPC-path audit ledger and records decision type, admin identity,
  previous/new status, linked `micro_skill_key` where applicable, nullable
  `canonical_mapping_id` unused in `4D.1`, decision note, metadata, and
  `created_at`
- the RPC locks/updates the target case and inserts the audit row; DB-level
  append-only enforcement with triggers/privilege redesign is not implemented
  and is accepted only for private MVP
- Slice `4D.1` QA passed with no remaining P0/P1/P2 findings; non-link
  `micro_skill_key` tampering is rejected, and canonical/global truth,
  resolver non-effect, admin/security/service-role, UI/accessibility/table
  workflow, and manual browser QA boundaries passed
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
- Slice `4E.1` canonical spelling mapping storage foundation is implemented:
  - `spelling_canonical_mappings` stores exact normalized canonical/global
    spelling mappings
  - `spelling_canonical_mapping_events` stores the dedicated audit/event trail
  - a service-role-only RPC/repository foundation exists for future canonical
    mapping writes
  - the storage preserves source case, source decision, admin identity,
    decision note, metadata, dialect, normalization version, status/lifecycle
    fields, and previous/new event values for future analytics
  - this slice added no resolver reads, no resolver priority change, no admin
    UI decision, no parent `Review Work` change, no `micro_skill_catalog`
    mutation, no false-positive handling, and no manual writing sample
    broadening
  - existing Slice `4D.1` `linked_existing_skill` rows were not
    reinterpreted, backfilled, or promoted as canonical/global mapping truth
  - validation passed: `npx tsc --noEmit`, `npm run build`,
    `npm run writing-engine:canonical-mapping-storage-regression`, and
    `git diff --check`
  - residual private-MVP risk: service-role direct table writes can bypass
    canonical mapping event conventions until later DB hardening
- Slice `4E.2` admin canonical-curation decision flow is implemented and
  QA-passed:
  - `/admin/catalog-review` now offers `add_canonical_mapping`,
    `needs_new_micro_skill`, `word_level_only`, `not_a_learning_issue`, and
    `reject_no_canonical_update` for new submissions
  - historical Slice `4D.1` `linked_existing_skill` and `new_skill_needed`
    values remain readable in decision history only
  - `add_canonical_mapping` runs behind server-side admin authorization,
    validates active, assignable `D4` `micro_skill_catalog.micro_skill_key`,
    writes canonical mapping storage and event rows through the Slice `4E.1`
    path, records `canonical_mapping_id` on the source decision row, and
    closes/updates the source case
  - P1 audit provenance is fixed: the source case-decision row exists before
    canonical mapping creation, its id is passed as `p_source_decision_id`,
    mapping/event rows preserve `source_decision_id`, and the same RPC
    transaction updates the decision with `canonical_mapping_id`; canonical
    mapping creation failure rolls back the decision insert
  - non-canonical Slice `4E` decisions close/record only the case outcome and
    do not create canonical mappings
  - non-canonical decision semantics distinguish a real issue needing a future
    micro-skill, a word-level-only issue, a non-learning issue, and a reviewed
    refusal where no canonical mapping, resolver change, catalog update, or
    further curation action is needed
  - no `micro_skill_catalog` mutation, parent `Review Work` broadening,
    manual writing sample broadening, false-positive handling, resolver read,
    resolver priority change, analytics table, dashboard, mastery, rewards,
    assignments, scoring, or template-routing change was introduced
  - active canonical mappings are not resolver-visible until Slice `4E.3`
  - provenance now supports future catalog-gap, resolver-quality, and
    admin-audit analytics by linking case -> case decision -> mapping -> event
  - hosted DB smoke initially failed because the hosted RPC body was stale,
    then passed after corrected SQL was manually reapplied: the affirmative
    path populated mapping/event `source_decision_id`, updated the decision
    with `canonical_mapping_id`, and `reject_no_canonical_update` created no
    canonical mapping; cleanup left no smoke cases or mappings behind
  - residual deployment/process risk: hosted DB behavior passed after manual
    SQL reapplication, but hosted migration-ledger alignment is not proven
    because `supabase_migrations.schema_migrations` did not show expected
    `20260522%` rows. Multiple local migration files share a `20260522`
    prefix, so migration ordering/version hygiene should be reviewed before
    relying on CLI migrations for later slices. This does not block Slice
    `4E.2` source closeout, but the risk must be documented and explicitly
    decided before Slice `4E.3`
- future false-positive review is reserved:
  - case reason `false_positive_report`
  - admin outcomes `false_positive_confirmed` and
    `false_positive_needs_rule_fix`
  - `no_matching_skill` means a real spelling issue has no fitting
    micro-skill; `false_positive_report` means the system should not have
    flagged the word/error and may need canonical/system-truth correction
  - false-positive catalog-review capture and admin mutation are not
    implemented yet
- only admin/catalog curation may create or update canonical/global mapping
  truth
- Slice `4C` implementation readiness:
  - docs contract exists in
    [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
  - admin access foundation and read-only `/admin/catalog-review` triage
    surface are implemented and QA passed
  - validation passed:
    - `npx eslint app/admin/catalog-review/page.tsx`
    - `npx tsc --noEmit`
    - `npm run build`
    - `git diff --check`
  - residual setup/risk: server environments must configure `ADMIN_USER_IDS`
    and/or `ADMIN_EMAILS` plus `SUPABASE_SERVICE_ROLE_KEY`; browser-client
    admin reads require future DB-backed role/claims and explicit admin RLS;
    write-capable admin workflows require separate action helpers, audit trail
    design, and regression coverage
  - parent-scoped RLS must remain unchanged
  - service-role access must stay server-only and must be guarded by the admin
    helper before any query
- resolver implications:
  - no resolver change in Slice `4A` or Slice `4B.1`
  - open catalog-review cases remain invisible to the resolver
  - parent notes/reasons remain evidence only
  - canonical/global storage foundation now exists after Slice `4E.1`, but
    resolver use remains blocked until a later resolver integration slice
  - do not use catalog-review cases, parent notes, parent-scoped candidate
    mappings, or `micro_skill_catalog` metadata as silent global mapping truth
  - future resolver integration may add resolver-visible normalized spelling
    mappings, suppress or correct false-positive-producing mappings/rules,
    close cases with audit, and improve future suggestions only after the
    resolver contract is explicitly revised
  - future resolver priority is refined by Slice `4E.0`: active
    canonical/global exact-pair spelling mapping, existing catalog-backed
    canonical mapping behavior, same-scope `parent_local_promoted` mapping,
    then unresolved
- Slice `4B.1` Review Work UI placement:
  - `No matching skill` appears in the compact spelling review table Actions for
    eligible lesson-submission spelling rows
  - exclude manual writing samples
  - exclude rows that already have a parent decision, candidate mapping, durable
    issue, or open catalog-review case where that would duplicate workflow
  - after capture, show `Sent to catalog review` or equivalent row status
  - do not change unrelated Review Work completion behavior

## Canonical lineage

The canonical lineage should become:

`writing submission -> writing_issue -> learning_item -> future learning_items-first practice route`

This means:
- `writing_issues` are the durable historical source of issue truth
- `learning_items` are the active practice and mastery units
- `word_progress` no longer exists in the active schema or runtime
- the broader Writing Engine meaning of mastery, transfer, and assignment
  ownership is no longer owned by this transition document

## MVP storage shape

### `writing_issue_suggestions`

Role:
- temporary suggestion seeds

Inputs may include:
- parent manual marking
- deterministic spelling checks
- child-specific repeated errors
- active weak micro-skills
- checking-only recurrence
- transfer-failure recurrence

Persistence rule:
- suggestions may be regenerated
- suggestions are not canonical history
- raw suggestion or missed-word rows are not reusable mapping truth by
  themselves

### `writing_issues`

Role:
- durable reviewed issue history

Should store at minimum:
- submission linkage
- optional original suggestion linkage
- source span or structured-response field
- original text or observed form
- proposed correction
- parent-reviewed correction
- final classification
- `micro_skill_key`
- optional `theme_key`
- status timestamps
- lineage references for transfer/regression history

Design note:
- `checking_only` and approved learning-gap outcomes are final states on this record
- they are not separate MVP tables
- raw `writing_issues` are not reusable mapping truth by themselves

### Candidate spelling mappings

Role:
- proposed reusable mapping truth for later promotion

Should store conceptually at minimum:
- `misspelling_normalized`
- `correct_spelling_normalized`
- existing canonical `micro_skill_key`
- provenance / source
- status
- promotion scope

Persistence rule:
- candidate mappings remain separate from:
  - `micro_skill_catalog`
  - existing deterministic Stage `2C` / Slice `1` catalog-backed mapping
    logic
  - `writing_issues`
  - `parent_verifications`
- pending mappings must not be used by future suggestions
- parent-local promotion, when later implemented, may make mappings reusable
  only inside the same parent/child scope
- global canonical promotion requires a separate curator/admin workflow

### `writing_issue_correction_attempts`

Role:
- preserve the child self-correction loop

Should store:
- linked `writing_issue`
- child attempt content
- whether corrected independently
- reflection enum
- timestamps

### `learning_items`

Role:
- controlled practice and mastery units

Should store at minimum:
- primary `micro_skill_key`
- optional `theme_key`
- active/inactive state
- current evidence count or priority
- linked source issues
- practice pool references or stored examples
- regression/reactivation markers where needed

Default rule:
- one learning-gap issue creates one primary learning item
- multiple items are exceptional

## Role of `misspelling_instances`

`misspelling_instances` should remain suggestion seeds only.

Rules:
- they may seed `writing_issue_suggestions`
- they may be deleted and recreated during reanalysis
- they must not become the durable issue lifecycle record

Practical implication:
- finalized issue history must survive even if `replaceAnalysisForSample()` regenerates all misspelling rows

## Grouping model

The grouping key is primarily `micro_skill_key`.

If multiple approved issues map to the same active `micro_skill_key` and substantially the same practice need:
- reuse the same active learning stream
- increase evidence count or priority
- add source links and practice examples
- avoid creating a separate daily lesson automatically

Example:
- `chiken -> chicken`
- `tack` / `ck` confusion
- `duq -> duck`

may all strengthen one active stream:
- `micro_skill_key = short_vowel_ck`

## Practice backlog control

The architecture must support:
- full issue history on the parent side
- capped active learning items on the child side
- curated daily selection from active learning items

Suggested assignment defaults:
- due reviews first
- new Nuggets capped to 1 to 3 per day
- total daily target of 10 to 20 minutes
- interleaving included but controlled
- transfer task short and optional in early MVP

Detailed assignment architecture and generic assignment-item truth now defer to
the canonical brief and the micro-skill/assignment contract.

## Compatibility rule for `word_progress`

`word_progress` is now a retired schema dependency preserved only in historical records and migration history.

But its role changes:
- it is legacy/runtime debt rather than the target architecture
- it is not the long-term source of issue truth
- it should not be broadened into a new generic projection target unless a clearly justified temporary internal bridge is required

Long-term direction:
- issue history and learning-item lineage should remain understandable even if `word_progress` is replaced later

Boundary rule:
- if a `learning_item` cannot be honestly represented as a single word-level review target, it must not be projected into `word_progress`
- abstract spelling patterns, morphology, grouped family work, proofreading habits, sentence application, dictation, oracy items, and broad schema streams must not be flattened into fake representative word rows

## Transitional compatibility rule

Slice 6 and Slice 7 must be treated as two separate architecture steps.

Slice 6:
- creates the first canonical writing-practice Nugget path through `learning_items`
- does not yet change reward-state tables
- does not yet change `word_progress`
- does not yet change `daily_assignments`

Slice 7:
- is the canonical spine + bounded legacy/runtime boundary slice
- confirms `learning_items` as canonical truth
- fences old `word_progress` dependencies
- stops new canonical writing flows from creating fresh `word_progress` rows
- adds generic `parent_verifications` so future writing-engine modules preserve
  suggestion versus verified truth
- adds generic `assignment_items` so future writing-engine modules can compose
  mixed-domain work without inheriting the older spelling queue shape
- prepares for a later `learning_items`-first assignment engine

This boundary is deliberate:
- Slice 6 establishes canonical writing-practice practice truth
- Slice 7 fences the old queue/runtime model rather than expanding it
- later slices can replace legacy runtime pieces after the micro-skill and assignment contract exists

## Reward integration boundary

Reward truth remains in the reward contract.

Architecture rule:
- `writing_issues` and `learning_items` decide whether a genuine learning gap exists
- reward tables should only be updated from approved learning-gap paths

Therefore:
- `checking_only` cannot create Nuggets
- `checking_only` cannot create Bars
- `checking_only` cannot create Coins

Systematic source-of-truth rule:
- `learning_items` should become the canonical writing-practice source for Nugget/practice-unit truth
- `spelling_reward_states` remain the canonical current-state reward source for existing reward UI until the planned compatibility bridge is introduced
- later slices must reconcile these through explicit projection, not by letting separate pages interpret them independently

Current Slice 4 implementation note:
- returned child resubmissions still travel through the normal course-task submission path
- this means they can still trigger the standard daily check-in reward logic
- this is current live behavior, not a separate writing-practice-only reward path

## Transfer-failure architecture

When fresh writing shows a previously mastered skill failing again:
- create a new `writing_issue`
- link it to the existing or prior `learning_item`
- preserve the earlier mastery history
- allow the active stream to reactivate or regress without destroying lineage

This preserves:
- first learning evidence
- later success
- later transfer breakdown
- re-strengthening attempts

The stage ladder, recurrence interpretation, and parent-facing mastered rules
now defer to the mastery/evidence contract rather than this architecture doc.

## Reject-suppression concept

The architecture should support parent rejection and suppression.

Minimum MVP behavior:
- rejected suggestions should be preserved enough for auditability
- they should not aggressively resurface
- exact repeated rejected word-pair suppressions now exist for the same child and parent context

Later expansion may include:
- allowed words
- accepted name lists
- personal dictionary features

## Returned child-correction reveal rule

For MVP child self-correction:
- the child should see the observed issue, the local context, and the parent note
- the app should not hand over the exact corrected answer by default for ordinary spelling self-correction

Architecture implication:
- `approved_replacement` remains part of durable parent-side issue truth
- but the child-facing returned issue surface can choose not to reveal it directly
- this preserves self-correction evidence quality without changing the parent review record

## Slice 5 finalisation boundary

Current Slice 5 rule:
- parent final classification finalises the `writing_issue` record after child response
- finalised returned issues remain visible as historical review evidence
- finalisation does not yet create:
  - Nuggets
  - `learning_items`
  - `word_progress` projection writes
  - downstream practice assignment changes
- approval is now gated until:
  - returned issues awaiting final classification are closed
  - captured suggestion review on that submission is complete
- review-truth logic is stronger and more consistent after Slice 5.1, but some status derivation still remains page-local rather than fully centralised

## Slice 6 Nugget boundary

Slice 6 introduced:
- minimal canonical `learning_items`
- one qualifying learning item per finalised learning-gap issue
- parent-visible Nugget / learning-item evidence on writing-practice review surfaces

Slice 6 did not introduce:
- reward-table writes
- `word_progress` writes
- `daily_assignments` writes
- child runtime visibility of the new Nuggets yet

This ensures the first Nugget path is canonical without implying that reward-state and assignment/runtime systems have already cut over.

## Returned-work linkage rule

For Slice 4:
- the return action is submission-scoped
- all linked eligible durable issues on that submission are written into the returned-work payload
- the child correction surface then renders from that returned issue payload

This means the current architecture does not model:
- explicit per-issue return selection
- partial return of only some linked durable issues

## Non-AI Historic Learning Loop for MVP

MVP helper signals should be derived from:
- parent-reviewed history
- child self-correction reflections
- repeated exact issue forms
- repeated `checking_only` outcomes
- active micro-skills
- transfer failures
- mastery regressions

This architecture must work without paid AI.

## Optional AI Assistance Later

AI may later sit on top of this architecture to improve:
- suggestion ranking
- likely classification hints
- likely micro-skill mapping
- transfer-failure heuristics

But the durable history model should not depend on AI being available.
