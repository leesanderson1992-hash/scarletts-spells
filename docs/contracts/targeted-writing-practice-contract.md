# Targeted Writing Practice Contract

## Purpose

This document is the canonical source of truth for the Targeted Writing Practice system.

Use it to define:
- what the system is
- what counts as a real writing issue
- when an issue becomes a Golden Nugget
- what becomes a learning item
- how backlog control works
- how this system relates to rewards, course submissions, and spaced review

If another doc conflicts with this file on writing-issue lifecycle or learning-gap semantics, this file wins.

Pedagogy and taxonomy truth defer to:
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/pedagogy/learning-system-overview.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/learning-system-overview.md:1)
- [docs/pedagogy/micro-skill-taxonomy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/micro-skill-taxonomy.md:1)
- [docs/pedagogy/mastery-domain-4-spelling.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/mastery-domain-4-spelling.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

The canonical distinction matrix for taxonomy, competency, issue classification, and lifecycle state lives in the taxonomy doc.

Shared contracts still apply:
- workflow and approval semantics defer to [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- reward semantics defer to [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- admin/internal access defers to [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)

## Core philosophy

The system turns real child writing into mastery-based daily practice.

It must not become:
- a simple spelling-list app
- an auto-punishment queue for every mistake
- an AI-led classifier that bypasses the parent

It should instead:
- use real written work as evidence
- give the child a self-correction chance before formalising a learning gap
- separate checking mistakes from genuine learning needs
- preserve writing history without flooding daily practice

This contract does not define the full pedagogy of micro-skills or mastery domains.
It defines how reviewed writing issues become durable issue truth and controlled `learning_items`.

It does not own:
- the top-level Writing Engine identity or product spine
- the mastery stage ladder
- evidence source weights or role weights
- transfer-gated "Mastered" semantics
- detailed scoring, breadth, confidence, or recurrence rules

## Canonical objects

### `writing_issue_suggestions`

These are raw candidate concerns.

They may come from:
- parent manual marking
- deterministic rule-based checks
- child-specific history
- active micro-skill watchlists
- repeated checking-only patterns
- transfer-failure history

They are not durable learning truth.

### `writing_issues`

These are the durable historical records of real reviewed issues from writing.

They preserve:
- the source submission
- the flagged span or field
- the proposed correction
- the parent-reviewed interpretation
- the final classification
- transfer and regression lineage over time

Every real issue should survive reanalysis here, even if suggestions are later regenerated.

### `writing_issue_correction_attempts`

These store the child self-correction loop.

They capture:
- what the child changed
- whether the child corrected independently
- the child reflection:
  - `easy`
  - `medium`
  - `hard`
  - `needed_help`
  - `could_not_fix`

For the current returned-child spelling correction surface, the child-facing UI
should expose only `easy`, `medium`, and `hard` unless a later docs pass
explicitly authorises `needed_help` and `could_not_fix` copy and UX. The broader
enum remains valid persistence capacity, not an automatic UI requirement.

### `learning_items`

These are the controlled practice and mastery units.

They are not the same as raw writing issues.

They exist so the app can:
- group similar issues together
- cap daily load
- track mastery in a controlled way
- project into legacy spaced-review structures

Each learning item should carry at minimum:
- `micro_skill_key`
- optional `theme_key`
- source issue links

Runtime ownership rule:
- `learning_item` must carry one primary `micro_skill_key`
- issue classification belongs to the reviewed `writing_issue`
- lifecycle state belongs to workflow objects, not taxonomy

## Final classification model

Each finalised `writing_issue` should end in one of these canonical classifications:

- `checking_only`
- `fragile_knowledge`
- `concept_gap`
- `transfer_failure`
- `not_an_issue`

### Meaning of each classification

`checking_only`
- the child likely already knew it
- the issue is primarily proofreading, checking, or self-monitoring
- this does not become a Golden Nugget

`fragile_knowledge`
- the child could sometimes fix it, but the knowledge is not secure
- this becomes a Golden Nugget

`concept_gap`
- the child could not fix it securely without help, or could not fix it at all
- this becomes a Golden Nugget

`transfer_failure`
- the child looked secure in practice before, but failed to carry the skill into fresh writing
- this creates or reactivates a Golden Nugget path

`not_an_issue`
- false positive, acceptable variant, name, intentional word choice, or otherwise not something to teach
- this does not become a Golden Nugget

## Strict checking-only rule

An issue may be finalised as `checking_only` only when all of these are true:

- the child corrected it independently
- the child marked it `easy`
- the parent agrees it was known and checking-only
- there is no strong recent evidence that the item or related micro-skill is fragile

Easy reflection alone is never enough.

If the same item or related `micro_skill_key` has recent failures:
- the system must not force `checking_only`
- the parent decision remains the gate

## What becomes a Golden Nugget

A Golden Nugget is created only when a finalised `writing_issue` represents a genuine learning need.

Golden Nuggets may come from:
- `fragile_knowledge`
- `concept_gap`
- qualifying `transfer_failure`

Golden Nuggets do not come from:
- `checking_only`
- `not_an_issue`

Sharper rule:
- checking-only issues must not mint Nuggets, Bars, or Coins

## Canonical lifecycle

The canonical lifecycle is:

`lesson submission or parent-entered writing_sample -> writing_issue_suggestions -> writing_issues -> writing_issue_correction_attempts -> final classification -> learning_items -> controlled-practice evidence / reward-state updates`

For a genuine learning need:

`draft suggestion -> reviewed issue -> child self-correction -> parent final classification -> Golden Nugget -> learning item -> In the Machine -> Gold Bar`

For a checking-only outcome:

`draft suggestion -> reviewed issue -> child self-correction -> parent final classification = checking_only -> history + proofreading signal only`

Operational mastery movement after `learning_items` are created now defers to:

- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

Current Slice 5 implementation rule:
- parent final classification is applied after child correction
- classification is currently performed from the resubmitted submission review surface where the child response evidence is visible
- final classification finalises the `writing_issue` record only
- final classification does not yet create Nuggets, `learning_items`, or `word_progress` writes
- submission approval is blocked until:
  - all captured spelling suggestions on that submission have been reviewed
  - any returned issues on that submission have been final-classified

Current Slice 6 implementation rule:
- qualifying finalised learning-gap issues will create canonical writing-practice `learning_items`
- these `learning_items` will become the canonical controlled practice-unit source for Targeted Writing Practice
- Slice 6 will not yet write:
  - `spelling_reward_states`
  - `spelling_reward_events`
  - `daily_assignments`
- Slice 6 therefore creates the first canonical Nugget path without yet changing reward-state or runtime compatibility sources

Current Slice 7 transition rule:
- `learning_items` remain the canonical active learning/practice/mastery truth
- the retired `word_progress` path must not be reintroduced into runtime or schema design
- generic `parent_verifications` preserve engine suggestion versus parent
  verified truth for future writing-engine modules
- unverified suggestions must not update mastery
- canonical daily assignment generation, interleaving, route-specific mastery, and full adaptive routing are deferred until the separate Micro-Skill Taxonomy and Assignment Contract exists

## Intake and review ownership rule

Parent-entered paper work is submitted through `Add Writing Sample`.

Historical `/analyse` may remain as a compatibility route, but its product role
is manual writing-sample intake only.

`/analyse/review` is obsolete and unsupported. It must not exist as a
supported route, compatibility handoff, or duplicate parent review surface.

Intake creates or attaches canonical `writing_sample` truth.

The intake page is not a review surface and must not host verification,
classification, or durable-issue finalisation actions.

The intake page must not own mastery, assignment generation, rewards, AI
checking, or other durable learning effects.

Canonical parent review ownership lives in `Review Work`.

Manual writing samples and lesson submissions converge into one `Review Work`
queue and one canonical review workflow.

Downstream parent verification and durable issue behavior must reuse existing
shared contracts only.

Parent verification remains the source of truth.

`false_positive` and `not_a_learning_issue` outcomes do not create learning
items.

## Durable structured submission payload contract

Structured lesson/test submissions must preserve two forms of child work:
- flattened readable submission text for parent review, spellcheckable
  ingestion, and workflow evidence
- structured answer payload evidence for restoring the original answer boxes
  after submit, approval, and later child revisit

Canonical storage roles:
- `task_submission_drafts` is mutable working state for autosave,
  in-progress work, and returned/editable correction state
- `task_submissions` is the submitted attempt header/workflow record and
  flattened readable text representation
- `task_submission_payloads` is immutable durable submitted structured
  payload evidence linked to one submitted attempt

`task_submission_payloads` contract:
- fields:
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
- initial payload types:
  - `structured_lesson_response`
  - `structured_test_response`
- constraints:
  - unique `(submission_id, payload_type)`
  - lookup index on `(task_id, child_id, created_at desc)`
  - optional lookup index on
    `(parent_user_id, child_id, task_id, created_at desc)` where useful
  - `payload_json` stores the structured response object, not flattened text
- security:
  - RLS enabled
  - authenticated parent access scoped to `auth.uid() = parent_user_id`
  - authenticated clients may select scoped rows only
  - durable payload writes are server/service persistence only
  - server-side code derives `parent_user_id`, `course_id`, `task_id`, and
    `child_id` from trusted context, not from client-supplied payload claims

Structured submit contract:
1. parse and validate the structured response
2. insert `task_submissions` as the workflow/header row with flattened
   `submission_text`
3. immediately insert the matching `task_submission_payloads` row
4. if durable payload insert fails, roll back or delete the just-created
   submission and return an error
5. only after durable payload succeeds may existing side effects continue,
   including task completion, writing sample creation, rewards, draft upsert,
   or draft cleanup

Structured submit implementation status:
- Pass 2 is implemented and QA-passed
- `submitTaskResponse` still writes the normal `task_submissions` row with
  flattened readable `submission_text`
- for structured lesson/test submissions, durable `task_submission_payloads`
  evidence is persisted immediately after the submission row and before any
  success side effects
- if durable payload persistence fails, the just-created submission is deleted
  and a visible submit error is returned
- `payload_json` stores the structured response object, not flattened text and
  not the whole draft payload
- `payload_type` mapping:
  - `lesson` -> `structured_lesson_response`
  - `test` -> `structured_test_response`
- `parent_user_id`, `course_id`, `task_id`, `child_id`, and `submission_id`
  are derived from trusted server-side context
- privileged persistence lives in
  `lib/lessons/persistence/submission-payloads.ts`
- `app/learn/actions.ts` remains an orchestration layer and does not import
  `createServiceRoleClient` or directly insert `task_submission_payloads`
- quick-submit compatibility:
  - primary structured submit evidence comes from the embedded structured
    response in the full structured lesson/test page `draft_payload`
  - if a structured lesson/test is submitted through a quick-submit path that
    only provides `submission_text`, a narrow fallback can derive structured
    evidence from `lesson_schema + submission_text`
  - fallback maps the submitted text into the first supported text/textarea
    block only
  - fallback returns `null` for missing, invalid, or unsupported schemas
  - fallback is a compatibility bridge, not the preferred structured submit
    path
- plain-writing submit behavior remains unchanged

Manual smoke evidence:
- actual structured lesson-page submit created both `task_submissions` and
  `task_submission_payloads`
- durable payload remained present after parent approval
- child revisit after parent approval restored submitted answer boxes from
  durable payload evidence
- returned/send-back, legacy fallback, and plain-writing manual checks passed
- the original visible blank-answer-box bug is fixed for submissions with
  durable payloads
- Pass 4 manual browser QA confirmed an approved structured lesson can be
  returned to the child, the child view shows `Restored from your last try`,
  and original answer fields are populated and editable

Structured child revisit hydration contract:
- load the latest draft and latest relevant submitted durable payload
- use draft when no submission exists or when the latest submission is returned
- use durable submitted payload when the latest structured submission is
  pending, approved, or completed and not returned
- legacy structured submissions without durable payload must not crash; they
  may fall back to existing empty or flattened-text behavior
- implementation status: Pass 3 implemented and QA-passed; returned-child
  legacy recovery implemented and QA-passed
- child structured lesson/test revisit reads
  `task_submission_payloads.payload_json` for the exact latest non-returned
  submission
- returned structured work remains draft-first and editable
- if a returned draft lacks meaningful structured answers, hydration can fall
  back to durable submitted payload evidence
- if durable payload is also missing, legacy text/textarea answers can be
  reconstructed from flattened `submission_text` when question labels match
- no submit persistence, parent approval/draft deletion, Review Work,
  admin/catalog-review, resolver, rewards, mastery, scoring, assignments,
  analytics, dashboards, or template-routing behavior changed in Pass 3

Approval safety contract:
- before deleting `task_submission_drafts` for structured lesson/test
  submissions, confirm the approved submission has a durable payload
- delete the draft only when the durable payload exists
- if durable payload is missing, skip draft deletion and keep approval
  otherwise unchanged
- approval must never delete, overwrite, or mutate durable submitted payloads
- plain-writing and non-structured approval behavior remains unchanged
- implementation status: Pass 4 implemented and QA-passed

Returned/send-back boundary:
- returned work remains draft-first and editable
- returned flow continues to merge `__field_feedback` and
  `__writing_issue_feedback` into the draft
- durable payload support must not change returned/send-back behavior

Returned-child spelling correction contract:
- this scope applies to structured lesson/test returned work only
- every `__writing_issue_feedback` item must be visible to the child when the
  latest submission is returned
- `__field_feedback` remains structured field feedback; `__writing_issue_feedback`
  remains the child-facing spelling/writing correction target list
- the child page must not independently mine raw `misspelling_instances`
- items with a matching `source_field_key` should render beside the relevant
  structured field
- items without a matching `source_field_key` must render in a fallback
  returned-issues panel rather than disappearing
- spelling-like items should show `observed_text`, `context_text`, and parent
  notes clearly without revealing `approved_replacement` by default
- each spelling-like returned item should provide a dedicated child
  retry/attempt input
- that retry/attempt value should persist to
  `writing_issue_correction_attempts.attempted_correction` on resubmission
- child retry/reflection remains evidence for parent judgement only; it must
  not directly update mastery, rewards, assignments, scoring, analytics,
  dashboards, or template routing
- parent final classification remains the gate for learning-item and broader
  evidence consequences

Returned spelling feedback source contract:
- parent send-back/return flow owns preparing child-facing correction feedback
- engine-found spelling candidates and parent-added missed words must not be
  read directly by the child UI; they must first be represented in returned
  draft feedback backed by durable `writing_issues`
- when a parent sends back structured lesson/test work, eligible engine-found
  misspellings and eligible parent-added missed words should be materialized
  into durable `writing_issues` before `__writing_issue_feedback` is built
- parent-added missed words remain separate from engine `Suggested Issues` in
  `Review Work`; this source-of-truth separation does not make them
  second-class returned-child correction targets
- parent-added materialized rows must preserve parent-authored provenance in
  `writing_issues.metadata`
- `micro_skill_key: "unknown"` must not block send-back, child retry,
  correction-attempt persistence, or parent final classification
- unknown, uncatalogued, or non-assignable micro-skills may block learning-item
  creation only at the final-classification learning-item stage, while the
  durable issue and child correction evidence remain preserved
- if a parent adds a missed word before send-back, it must be included in the
  send-back correction payload
- if a parent adds a missed word after work is already returned, the next
  bounded implementation should require the parent to send back/resend through
  the return action so the same return lifecycle refreshes the draft feedback;
  do not add a hidden child-page raw-misspelling read path

Implementation shape:
- the existing UI and persistence model support one bounded implementation pass
- staging is not required unless implementation uncovers a contract mismatch
  that would require schema or cross-surface product changes
- stop rather than broaden scope if the fix appears to require manual writing
  sample expansion, schema changes, resolver work, catalog mutation, or
  mastery/reward/assignment changes

Durable payload closeout validation:
- `npm run writing-engine:structured-submission-payload-storage-regression`
  passed
- `npm run writing-engine:structured-submission-payload-submit-regression`
  passed
- `npm run writing-engine:structured-submission-payload-hydration-regression`
  passed
- `npm run writing-engine:structured-submission-approval-draft-safety-regression`
  passed
- `npx tsc --noEmit`, `npm run build`, and `git diff --check` passed

Next safest pass:
- perform a read-only historical data-integrity audit and optional
  local/operator recovery-plan pass
- inventory structured lesson/test submissions without
  `task_submission_payloads`, returned drafts with empty structured answers,
  submissions recoverable only from flattened `submission_text`, and
  duplicate/pending historical submission rows for the same task/child
- do not implement hosted backfill by default
- do not proceed into resolver, admin/catalog-review, catalog mutation,
  mastery, reward, assignment, scoring, analytics, dashboard, or
  template-routing work from this closeout

Explicit non-goals:
- no `4E` / `4E.3` resolver work
- no admin/catalog-review work
- no manual writing sample expansion
- no hosted historical backfill
- no dashboards or analytics implementation
- no mastery, reward, assignment, scoring, or template-routing change
- no `micro_skill_catalog` mutation
- no rewrite of Review Work semantics beyond preserving child submitted
  structured payloads

Override outcomes must preserve verified truth rather than collapsing back to
the original suggestion.

Review Work boundary clarification:
- `Accept` means the parent is confirming an existing shared suggestion as
  already canonically valid
- override means the parent is recording a different canonical classification
  through existing shared verified fields
- these are related but not identical boundaries
- the bounded lesson-submission spelling `Accept` path is now implemented and
  validated only for lesson/task-submission-backed spelling suggestions that
  already meet the documented canonical mapping rule
- a bounded `Accept`-readiness slice does not by itself authorize catalog-
  backed override-option population
- if override options later need richer catalog-backed choices, that must be
  documented separately and must not rely on free-text taxonomy entry
- the first selectable override-option provider UI/runtime remains deferred
  for lesson/task-submission-backed spelling suggestions
- existing server-side override behavior is covered by the tracked
  override-provider behavior regression
- in any future selectable provider slice:
  - `verified_micro_skill_key` may be populated only from bounded canonical
    provider options rooted in `micro_skill_catalog`
  - `verified_category_code` remains the existing fixed option set
  - `verification_note` remains free-text audit text
  - template routing is owned by the verified micro-skill, not selected
    word by word
  - `verified_template_key` is deferred/blocked in Review Work and must not
    remain free-text canonical truth
- overridden decisions may save only canonical provider values
- server-side validation must reject non-catalog override mini-skill keys
- the bounded override save path may use the canonical spelling-anchor
  fallback that any future selectable Review Work provider UI must also use
  when a pending shared suggestion row still lacks persisted canonical
  micro-skill truth
- `accepted` validation remains unchanged
- accepted suggestions use the suggested canonical micro-skill's configured
  template route
- overridden suggestions use the verified replacement micro-skill's configured
  template route
- no parent-facing template dropdown/provider implementation is authorized now
- any future template choice UI must be separately authorized and bounded to
  the verified micro-skill's allowed template metadata
- the bounded read-only derived template metadata slice is now implemented for
  Review Work lesson/task-submission spelling items
- it does not change Review Work verification semantics; it only displays
  template-route metadata derived from canonical/verified micro-skill truth
- unresolved template metadata must display as read-only unavailable/deferred
  messaging, not as an input

Parent-Verified Spelling Candidate Capture boundary:
- a bounded Slice `2` stage now lets parents classify eligible
  lesson-submission-backed unmapped or parent-added spelling mistakes against
  existing canonical micro-skills without changing current `Review Work`
  ownership or shared verification semantics
- parent verification may confirm event-level truth and capture a candidate
  mapping, but normal parent review does not itself mint global canonical
  mapping truth
- for that stage, preserve three distinct layers:
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
    - includes existing catalog-backed mapping truth, parent-local promoted
      mappings scoped to the current parent/child environment, and any future
      admin/global promoted mappings only if separately implemented
- Slice `2` QA closeout:
  - success state is visible after save
  - pending candidate mappings do not unlock `Accept`
  - pending candidate mappings are not used by future suggestion resolution
  - parent-added missed words persist and remain reviewable after reopen
  - manual writing samples remain excluded
  - template guardrails remain intact
- known limitation:
  - candidate capture depends on seeded canonical micro-skill coverage
  - valid rows such as `natral -> natural` may remain blocked until the
    correct canonical micro-skill exists in the seeded/catalog-backed option
    set
- UX follow-up note:
  - a captured row may remain visible in both `Suggested / candidate` and
    `Parent Verification` while it remains `pending_parent_promotion`
  - this is acceptable for Slice `2`, though later wording may clarify the
    state as captured-but-not-promoted
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
- global canonical promotion remains a separate curator/admin workflow deferred
  from MVP
- future suggestions must not use:
  - arbitrary parent free text
  - unpromoted candidate mappings
  - raw parent-authored missed-word rows
  - raw `misspelling_instances`
  - raw `writing_issues`
  - any mapping lacking an existing canonical `micro_skill_key`
- first safe runtime scope for that later stage is:
  - lesson-submission-backed spelling rows only
  - includes parent-added missed words attached to lesson submissions
  - excludes manual writing samples from the first runtime slice
- that later stage must not change:
  - `Accept` readiness
  - override-provider behavior
  - derived template metadata behavior
  - reward
  - mastery
  - assignment
  - scoring
  - thresholds
  - template routing
  - analytics
  - positive-evidence semantics

Slice `4A` catalog-review contract:
- Slice `4A` is documentation only and follows Slice `3` parent-local
  promotion
- parent-facing action label:
  - `No matching skill`
- helper copy:
  - `Send this spelling case to catalog review.`
- wording rules:
  - do not use `Uncategorised` as the primary label because it sounds like a
    final state rather than a request for curation
  - do not use `Needs new skill` as the only label because admin may decide an
    existing skill fits, the case is word-level only, the case is not a
    learning issue, or the case should be merged or superseded
- parent action creates or updates a catalog-review case only
- parent action must not create global canonical mappings or new micro-skills
- future case owner:
  - recommended table concept: `spelling_catalog_review_cases`
  - not `parent_verified_spelling_candidate_mappings`, because that table
    requires an existing `micro_skill_key`
  - not `writing_issues`, because those are durable reviewed issue history
    rather than catalog-curation workflow
- future table shape should include:
  - parent/child/source lineage
  - task submission and writing sample references
  - source suggestion and misspelling instance references
  - source provenance and reviewed event source entity
  - original child spelling and proposed/correct spelling
  - normalized misspelling and normalized correction
  - representative context
  - parent reason/note
  - status
  - admin decision, reviewer, merge/supersede, and audit metadata
- Slice `4B.1` implementation contract is implemented and QA passed:
  - parent `No matching skill` catalog-review case capture for eligible
    lesson-submission spelling rows only
  - parent uses `No matching skill` when no existing catalog-backed micro-skill
    fits
  - helper copy remains `Send this spelling case to catalog review.`
  - optional `parent_note` is allowed only if supported by the implementation
  - saved state should be non-blocking, for example
    `Sent to catalog review`
  - parent can still complete or return Review Work according to existing rules
- concrete implemented `spelling_catalog_review_cases` table shape:
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
- allowed `source_provenance` values:
  - `lesson_submission_existing_output`
  - `lesson_submission_parent_added_missed_word`
- initial `case_status` values:
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
- implemented server action: `captureSpellingCatalogReviewCase`
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
  - server action must enforce ownership even if RLS exists
  - no admin policies or admin routes are introduced in Slice `4B.1`
  - future admin read/update policies belong to Slice `4C`/`4D`
- Review Work UI placement:
  - `No matching skill` appears in the compact spelling review table Actions for
    eligible lesson-submission spelling rows
  - it is not shown for manual writing samples
  - it is not shown when a row already has a parent decision, candidate mapping,
    durable issue, or open catalog-review case where that would create duplicate
    workflow
  - after capture, show a row status such as `Sent to catalog review`
  - do not disable unrelated Review Work completion unless existing rules
    already require it
- Slice `4B.0` must provide bounded micro-skill option filtering by
  family/cluster before or alongside parent case capture:
  - use existing `micro_skill_catalog` metadata only
  - help parents find existing canonical skills before raising
    `No matching skill`
  - do not create micro-skills
  - do not allow free-text `micro_skill_key`
  - do not write canonical truth
  - do not change resolver priority
  - do not block parent review completion
- Slice `4B.1` may add parent `No matching skill` case capture for eligible
  lesson-submission spelling rows only; this case capture is now implemented
  and QA passed
- Slice `4C` may add the first minimal protected admin/catalog-review surface
  only after parent-raised cases can exist
- Slice `4C` runtime is now implemented and QA passed as a protected
  read-only admin triage surface at `/admin/catalog-review`
- Slice `4C` admin/internal access is defined by
  [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1):
  - private-MVP admin identity comes from server-side `ADMIN_USER_IDS` and
    `ADMIN_EMAILS` allowlists
  - there is no DB admin role table, Supabase custom claims model,
    role-management UI, or separate admin login in Slice `4C`
  - authenticated parent identity is not admin/internal identity
  - admin pages live under `/admin`; first route is `/admin/catalog-review`
  - `app/admin/layout.tsx` is the mandatory server-side admin guard
  - `/admin/catalog-review` also calls `requireAdminUser()` before creating or
    using the service-role client
  - page-level `requireAdminUser()` runs outside broad data-read `try/catch`,
    so `redirect()` / `notFound()` control-flow is not swallowed by generic
    error rendering
  - future `/api/admin/*` routes must call the same admin helper before
    querying data
  - admin reads use server-only service-role access after admin authorization
    passes
  - no admin RLS read policies are added for v1
  - parent-scoped policies for `spelling_catalog_review_cases` must remain
    parent-scoped and must not be weakened for admin listing
  - parent users must not be able to list other parents' catalog-review cases
  - admin read access must be explicit, auditable, and tested before launch
  - any service-role usage must be server-only and never exposed to client
    components
- Slice `4C` shows only open `spelling_catalog_review_cases` and provides
  read/triage visibility only:
  - groups by normalized `misspelling -> correction`
  - sorts groups by latest `updated_at`
  - displays misspelling -> correction, count, latest date, representative
    context, parent note/reason, source provenance, status, and limited
    supporting spelling context where appropriate
  - includes safe empty/error states
  - avoids unnecessary parent/child identity exposure
- first admin surface must not be a full admin dashboard, broad
  role-management system, CMS, or global catalog mutation path from parent UI
- Slice `4C` must not add admin decisions, canonical/global promotion,
  micro-skill creation, resolver changes, parent `Review Work` changes, manual
  writing sample expansion, or
  mastery/reward/assignment/scoring/analytics/template changes
- Slice `4D` may add admin decisions and canonical promotion:
  - link existing skill
  - create/propose new skill
  - word-level only
  - not a learning issue
  - merge duplicate
  - supersede/reopen
- Slice `4D.1` is implemented and QA passed as case-only decisions:
  - `linked_existing_skill`
  - `new_skill_needed`
  - `word_level_only`
  - `not_a_learning_issue`
  - `no_action_needed` is not implemented in `4D.1`
  - `linked_existing_skill` must validate an existing active, assignable `D4`
    `micro_skill_catalog.micro_skill_key`
  - `linked_existing_skill` does not create canonical/global mapping truth,
    affect resolver output, or promote anything globally
- `new_skill_needed` does not create a new micro-skill; `word_level_only`
  resolves a real spelling issue as word-specific; `not_a_learning_issue`
  resolves a case as not useful for learning/practice/catalog truth
- Slice `4D.1` admin table contract:
  - uses one per-case admin decision table that visually follows the compact
    Review Work table pattern where appropriate
  - parent Review Work table purpose is evidence classification/reporting;
    admin catalog-review table purpose is evidence review and curation
  - main table fields are Wrong Word, Correct Word, Reason, Skill Family,
    Skill Cluster, Micro-skill, Decision, and Actions
  - Source, Evidence Count / Source Count, Current Status, Latest Original
    Spelling Pair, Representative Context, Parent Note, Decision Note, and
    Decision History live in case details/disclosure
  - family, cluster, and micro-skill labels should use parent/admin-facing
    display names where available; raw keys remain internal values
  - do not add group-wide mutation buttons on normalized
    `misspelling -> correction` groups
  - controls must be labelled and keyboard-accessible, with accessible icon
    actions where appropriate; no Archive action is implemented
- Slice `4D.1` audit contract:
  - `spelling_catalog_review_case_decisions` is the app/RPC-path audit ledger
  - record decision type, admin user id/email, previous status, new status,
    linked `micro_skill_key` where applicable, nullable `canonical_mapping_id`
    unused in `4D.1`, decision note, metadata, and `created_at`
  - app path writes audit rows through the admin action/RPC path; the RPC
    locks/updates the target case and inserts the audit row
  - DB-level append-only enforcement with triggers/privilege redesign is not
    implemented and is accepted only for private MVP
- Slice `4D.1` security and QA closeout:
  - every admin mutation calls `requireAdminUser()` server-side before
    service-role use
  - service-role remains server-only and post-authorization; no client
    component imports the service-role helper
  - parent-scoped RLS remains unchanged; no admin browser-client RLS policy was
    added for private MVP
  - the server action rejects non-link decisions that submit `micro_skill_key`;
    the RPC remains defense-in-depth
  - validation and manual browser QA passed with no remaining P0/P1/P2
    findings
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
- Slice `4E.1` storage foundation is implemented and closed out:
  - canonical/global spelling mappings are stored in
    `spelling_canonical_mappings`
  - canonical mapping audit events are stored separately in
    `spelling_canonical_mapping_events`
  - a service-role-only RPC/repository foundation exists for future canonical
    mapping writes
  - provenance is preserved for source case, source decision, admin identity,
    decision note, metadata, dialect, normalization version, status/lifecycle
    fields, and previous/new event values
  - Slice `4E.1` introduced no resolver reads, no resolver priority change, no
    admin UI decision, no parent `Review Work` change, no
    `micro_skill_catalog` mutation, no false-positive handling, and no manual
    writing sample broadening
  - existing Slice `4D.1` `linked_existing_skill` rows were not
    reinterpreted, backfilled, or promoted as canonical/global mapping truth
  - validation passed: `npx tsc --noEmit`, `npm run build`,
    `npm run writing-engine:canonical-mapping-storage-regression`, and
    `git diff --check`
  - residual private-MVP risk: service-role direct table writes can bypass
    canonical mapping event conventions until later DB hardening
- Slice `4E.2` admin canonical-curation decision flow is implemented and
  QA-passed:
  - new `/admin/catalog-review` submissions use
    `add_canonical_mapping`, `needs_new_micro_skill`, `word_level_only`,
    `not_a_learning_issue`, and `reject_no_canonical_update`
  - historical Slice `4D.1` `linked_existing_skill` and `new_skill_needed`
    remain readable in decision history only and must not be reinterpreted,
    backfilled, or promoted
  - `add_canonical_mapping` requires `requireAdminUser()` before service-role
    use, validates an active, assignable `D4`
    `micro_skill_catalog.micro_skill_key`, creates canonical mapping storage
    and a canonical mapping event through the Slice `4E.1` path, records
    `canonical_mapping_id` on the source case-decision row, and closes/updates
    the source catalog-review case
  - `add_canonical_mapping` must not mutate `micro_skill_catalog` and must not
    affect resolver output in Slice `4E.2`
  - non-canonical Slice `4E` decisions record/close case outcomes without
    creating canonical mappings or resolver-visible truth
  - non-canonical Slice `4E` decisions mean:
    - `needs_new_micro_skill`: real issue, no suitable existing skill yet; no
      micro-skill is created
    - `word_level_only`: real spelling issue but not reusable canonical
      micro-skill mapping truth
    - `not_a_learning_issue`: should not become practice, catalog, or
      canonical truth
    - `reject_no_canonical_update`: reviewed; no canonical mapping, resolver
      change, catalog update, or further curation action is needed
  - P1 provenance fix is part of the accepted contract: insert the source
    `spelling_catalog_review_case_decisions` row first, pass that id as
    `p_source_decision_id`, preserve `source_decision_id` on canonical mapping
    and event rows, then update the decision row with `canonical_mapping_id`
    in the same RPC transaction; canonical mapping creation failure rolls back
    the decision insert
  - RPC execute remains service-role only; no client service-role helper,
    parent RLS change, or admin browser-client RLS policy was added
  - audit provenance now links case -> case decision -> canonical mapping ->
    canonical mapping event for future catalog-gap, resolver-quality, and
    admin-audit analytics; no analytics tables or dashboards were added
  - validation passed: targeted eslint, `npx tsc --noEmit`, `npm run build`,
    `npm run writing-engine:canonical-mapping-storage-regression`,
    `npm run writing-engine:admin-canonical-curation-regression`, optional
    legacy regression, `git diff --check`, and P1 provenance re-audit
  - hosted DB smoke initially failed because the hosted RPC body was stale,
    then passed after corrected SQL was manually reapplied: mapping/event
    `source_decision_id` and decision `canonical_mapping_id` were populated,
    `reject_no_canonical_update` created no mapping, and cleanup left no smoke
    cases or mappings behind
  - residual deployment/process risk: hosted DB behavior passed after manual
    SQL reapplication, but hosted migration-ledger alignment is not proven
    because `supabase_migrations.schema_migrations` did not show expected
    `20260522%` rows. Multiple local migration files share a `20260522`
    prefix, so migration ordering/version hygiene should be reviewed before
    relying on CLI migrations for later slices. This does not block Slice
    `4E.2` source closeout, but the risk must be documented and explicitly
    decided before Slice `4E.3`
- future false-positive catalog review vocabulary is reserved:
  - case reason `false_positive_report`
  - admin outcomes `false_positive_confirmed` and
    `false_positive_needs_rule_fix`
  - `no_matching_skill` means the parent believes there is a real spelling
    issue but no existing micro-skill fits
  - `false_positive_report` means the parent believes the system should not
    have flagged the word/error and admin may need to fix bad canonical/system
    truth
  - parent false-positive catalog-review capture and admin false-positive
    mutation are not implemented until a later slice explicitly adds them
- only admin/catalog curation may create or update canonical/global mapping
  truth
- Slice `4C` implementation readiness:
  - runtime implementation and QA are complete
  - validation passed:
    - `npx eslint app/admin/catalog-review/page.tsx`
    - `npx tsc --noEmit`
    - `npm run build`
    - `git diff --check`
  - security QA confirmed anonymous users are handled by `/admin` session
    protection, signed-in non-admin users are blocked by server-side admin
    guard, allowlisted admins can access the admin shell/page, service-role
    access is post-authorization and server-only, and the page is read-only and
    mutation-free
  - residual risk: server environments must configure `ADMIN_USER_IDS` and/or
    `ADMIN_EMAILS` plus `SUPABASE_SERVICE_ROLE_KEY`; future browser-client
    admin reads require DB-backed admin roles/claims and explicit admin RLS
    policies; future write-capable admin workflows need separate helpers, audit
    trail design, and regression coverage
- resolver contract:
  - no resolver change in Slice `4A` or Slice `4B.1`
  - open catalog-review cases remain invisible to the resolver
  - parent notes/reasons remain evidence only
  - canonical/global storage foundation now exists after Slice `4E.1`, but
    resolver use remains blocked until a later resolver integration slice
  - do not use catalog-review cases, parent notes, parent-scoped candidate
    mappings, or `micro_skill_catalog` metadata as silent global mapping truth
  - future resolver integration may add resolver-visible
    `misspelling_normalized -> correct_spelling_normalized -> micro_skill_key`
    mappings, suppress or correct false-positive-producing mappings/rules,
    close catalog-review cases with audit, and improve future suggestions only
    after the resolver contract is explicitly revised
  - future resolver priority is refined by Slice `4E.0`: active
    canonical/global exact-pair spelling mapping, existing catalog-backed
    canonical mapping behavior, same-scope `parent_local_promoted` mapping,
    then unresolved
- Slice `4B.1` regression checklist:
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
  - implemented `spelling_catalog_review_cases`
  - implemented `captureSpellingCatalogReviewCase`
  - implemented parent-scoped RLS and authenticated parent ownership
    enforcement
  - implemented idempotent open-case dedupe
  - implemented compact Review Work `No matching skill` UI/status and
    `Sent to catalog review` saved state
  - implemented parent-added lesson missed-word support
  - implemented graceful behavior when the case table is unavailable
  - validation passed:
    - `npx tsc --noEmit`
    - `npm run build`
    - `npm run writing-engine:parent-verified-spelling-candidate-capture-regression`
    - `npm run writing-engine:parent-local-promotion-regression`
    - `npm run writing-engine:mapping-source-regression`
    - `npm run writing-engine:review-work-override-provider-behavior-regression`
    - `git diff --check`
  - mastery, rewards, assignments, scoring, analytics, and template metadata
    remain untouched
- non-goals and stop conditions:
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
  - stop if a design requires free-text `micro_skill_key` creation, parent
    writes to `micro_skill_catalog`, parent writes to global mapping truth, or
    unresolved catalog-review cases affect resolver suggestions

Canonical `Review Work` detail may render existing suggested outputs,
verification records, and durable issue history for either source type, but
that detail rendering is visibility-only until a later documented action stage
explicitly adds parent decision controls.

## Returned-work scope rule

Current Slice 4 rule:
- returning a submission sends back all linked eligible durable `writing_issues` on that submission
- this is submission-level return behavior, not per-issue selection

Eligible linked issues currently include durable issues on that submission that are still active in the returned-work loop, such as:
- `pending_parent_review`
- `child_responded`
- `sent_back_to_child`

Implication:
- the current system does not require the parent to pick individual issues before returning work
- future slices may add per-issue return selection, but that is not current canonical behavior

## Backlog-control rule

The app must preserve every real writing issue for history, but it must not treat every issue as a separate active daily-practice item.

Use this split:
- `writing_issues` preserve full history
- `learning_items` are controlled active practice units
- `micro_skill_key` and `theme_key` provide grouping
- `assignment_items` are the generic long-term composition surface for work
  generated from active learning items
- `daily_assignments` remain legacy header debt during the transition and are
  not the design anchor for future writing-engine modules

### Grouping default

If a newly approved learning gap maps to an already-active `micro_skill_key` and substantially the same practice need:

1. link the new source issue to the existing learning item or stream
2. increase evidence count or priority
3. add the new example word or pattern evidence where useful
4. do not automatically create a separate new daily lesson

Only create a separate learning item when the issue clearly has a distinct:
- target word
- rule
- practice need

Repeated issues should strengthen the same learning stream rather than flood the queue.

## One-to-many rule

Default MVP rule:
- one finalised learning-gap issue creates one primary learning item

Exception:
- multiple learning items are allowed only when the issue clearly contains multiple distinct learning targets

Grouping by `micro_skill_key` takes priority over lesson proliferation.

## Minimum viable micro-skill model

Use curated `micro_skill_key` values in MVP, not unrestricted free text.

Examples:
- `short_vowel_ck`
- `capital_i`
- `sentence_final_punctuation`
- `there_their_theyre`

The meaning and family placement of those micro-skills defer to the pedagogy taxonomy docs.
- `go_went_irregular_past`
- `drop_e_before_ing`
- `suffix_y_to_ies`

Fallbacks:
- `unknown`
- `other`

## Theme scope

Learning items may also carry a `theme_key`.

In MVP:
- `theme_key` should exist so related items can later roll into theme-level mastery
- full Proven Bag computation is deferred unless it is trivial

## Daily assignment rules

## Transitional source-of-truth rule

Until the later `learning_items`-first runtime exists:
- `writing_issues` remain the canonical reviewed issue-history source
- `learning_items` are the canonical writing-practice practice-unit source
- `spelling_reward_states` remain the current canonical reward-state source for existing spelling reward UI
- `daily_assignments` remain the current delivery surface, but new assignment generation now comes from canonical `learning_items`

Important:
- pages and actions must not invent competing local truth
- future slices should move runtime generation toward canonical `learning_items`, not entrench the older queue-first model
- long-term assignment architecture and generic assignment composition defer to
  the canonical brief and the micro-skill/assignment contract rather than this
  lifecycle contract

Daily assignments must be generated from curated active learning items, not from the full discovered issue backlog.

Suggested MVP defaults:
- due reviews first
- new Nuggets capped to 1 to 3 per day
- total daily practice target of 10 to 20 minutes
- interleaving included but controlled
- transfer task short and optional in early MVP

The child must not be punished for writing more by receiving an overwhelming practice queue.

Parent-facing history may show all discovered issues.
Child-facing practice must stay curated.

## Reject-suppression rule

Parents must be able to reject suggestions.

Rejected suggestions:
- should be retained as review history where useful
- should not aggressively resurface

Later versions may add:
- a personal dictionary
- allowed-word lists
- family-specific accepted terms

## Transfer-failure reactivation

If a previously mastered item fails again in fresh writing:

- create a new `writing_issue` cycle
- link it to the prior learning item
- mark the prior item as regressed or needing review
- preserve earlier mastery history

Do not overwrite prior success.

Stage movement, recurrence effects, and confidence reduction after transfer
failure now defer to the mastery/evidence contract.

## Non-AI Historic Learning Loop for MVP

MVP assistance is:
- parent-led
- rule-assisted
- history-assisted

The system should learn from:
- parent decisions
- child correction reflections
- repeated exact mistakes
- checking-only history
- active micro-skills
- Gold Bar regressions
- transfer failures

Paid AI is not an MVP requirement.

## Optional AI Assistance Later

AI may later help with:
- suggestion ranking
- likely micro-skill proposals
- probable transfer-failure detection
- recommendation quality

But AI must remain suggestion-only unless a later contract explicitly changes that rule.
