# Writing Engine Canonical Brief

## Purpose

This document is the canonical product and architecture brief for the Writing
Engine.

It merges the original Writing Engine mastery-model brief with later
documentation, audit, and reconciliation decisions so the repo has one
authoritative Writing Engine brief before lower-level documentation is further
reconciled.

This brief is intentionally broader than a runtime contract and more stable
than an implementation plan. It defines what the Writing Engine is, what truths
it must preserve, and how it relates to the surrounding documentation set.

## Product identity

The Writing Engine is not a spelling checker.

It is a mastery-based writing improvement system that helps a child become a
better writer by:

- analysing submitted work
- identifying weaknesses
- mapping those weaknesses to user-facing mini-skills
- allowing parent verification
- updating mastery
- generating assignments that improve real writing

The first practical implementation domain is spelling, but the engine must be
architected so later modules can reuse the same core pattern.

The Writing Engine is also the first full implementation of a wider platform
pattern:

`evidence -> verification -> mastery -> assignment -> transfer`

Implementation remains Writing-first, but the architecture must not become a
spelling-only or writing-only dead end.

## Scope: Writing-first, multi-domain later

The first implemented domain is spelling.

The architecture must later support:

- spelling
- punctuation
- sentence boundaries / sentence formation
- grammar and usage
- vocabulary and word choice
- paragraph structure
- proofreading and editing
- genre/style-specific writing

Future domains should plug into the shared Writing Engine boundary rather than
creating parallel verification, mastery, or assignment systems.

## User-facing language

Parent- and child-facing language should use:

- mini-skill
- lesson
- review
- practice
- mastered
- needs more practice
- used in real writing

Technical documentation may refer to graphs, prerequisite edges, or inference
internally, but user-facing experiences should use mini-skill language rather
than node language.

## Existing repo source-of-truth assumptions

The current likely canonical repo spine is:

- `micro_skill_catalog` = mini-skill registry
- `learning_items` = active learner mastery/practice stream
- `learning_item_evidence` = evidence ledger
- `writing_issues` = durable authentic writing issue history

Related canonical tables and supporting records may include:

- `micro_skill_families`
- `micro_skill_clusters`
- `writing_issue_suggestions`
- `writing_issue_correction_attempts`
- `learning_item_issue_links`
- `task_submissions`
- `writing_samples`

Current transitional or legacy surfaces:

- `daily_assignments` = current transitional delivery/header surface, not a
  long-term architecture anchor
- `word_progress` = legacy/runtime debt, not future source of truth

Do not create duplicate long-term truth tables unless a later audit proves
they are required.

## Canonical product spine

The canonical product spine is:

`authentic work / diagnostic source -> candidate issue or hypothesis -> parent verification -> verified outcome -> learning item / mini-skill stream -> learning evidence -> targeted assignment item -> later transfer evidence from real writing`

This means:

- authentic work and diagnostics can both produce candidate concerns
- candidate concerns do not become truth by themselves
- parent verification is the gate between suggestion and verified truth
- verified outcomes strengthen or create canonical learning streams
- later authentic writing provides transfer evidence back into the same mastery
  model

## Canonical parent review surface

Parent review of Writing Engine outputs happens in `Review Work`.

`Add Writing Sample` is an intake step for authentic paper writing that
originated outside the app.

`/analyse` is an intake-only route for that parent-entered writing.

`/analyse/review` is obsolete and unsupported. It must not exist as a supported
parent review surface, compatibility handoff, or duplicate review workflow.

Manual writing samples and lesson submissions are both valid source inputs into
the same canonical review spine.

Operationally this means the canonical pathway may begin with either:

- lesson submission
- parent-entered `writing_sample`

and continue through the same shared flow:

`lesson submission or parent-entered writing_sample -> candidate issue or hypothesis -> parent verification -> verified outcome -> durable issue / learning stream path`

This does not create a second review workflow. It is one canonical parent
review surface over multiple supported source types.

Canonical parent review detail may render existing shared suggested or
reviewable outputs inside `Review Work`.

Those detail panels remain part of the same canonical review spine:
- they do not create a second review surface
- they do not create new analysis
- they do not turn visibility alone into verified truth

Canonical parent verification actions may also live inside `Review Work`
detail, but only as a presentation and action-trigger surface over existing
shared verification contracts.

This means:
- `Review Work` is where parent review and parent verification happen
- `Review Work` is not where verification semantics are invented
- parent actions must reuse existing shared verified-truth and durable-issue
  pathways rather than creating a second review or issue workflow
- `Review Work` is the only canonical parent review surface
- `Analyse` does not own verification, mastery, assignment generation, rewards,
  or durable learning effects
- parent verification remains the source of truth for what counts as verified
  writing-engine truth
- `Accept` availability depends on existing canonical suggestion truth; it is
  not the same thing as offering richer override alternatives
- the current bounded `Accept` path is limited to lesson/task-submission-
  backed spelling suggestions that already satisfy the documented canonical
  mapping rule
- if Review Work later surfaces catalog-backed override choices, that must be
  treated as a separate option-provider boundary rather than assumed to be
  solved by bounded `Accept` readiness alone
- that next separate selectable UI/runtime boundary remains deferred for
  lesson/task-submission-backed spelling suggestions
- existing server-side override behavior is covered by the tracked
  override-provider behavior regression
- `micro_skill_catalog` remains the only mini-skill identity source for that
  slice
- bounded provider options must not become unrestricted catalog browsing or
  free-text override truth
- parent verification may confirm event-level truth and capture a candidate
  mapping, but normal parent review does not itself mint global canonical
  mapping truth
- if a later bounded stage captures spelling candidate mappings for future
  reuse, that mapping layer must remain separate from:
  - `micro_skill_catalog`
  - existing deterministic Stage `2C` / Slice `1` catalog-backed mapping
    logic
  - `writing_issues`
  - `parent_verifications`
- candidate capture may classify a case such as `natral -> natural` against an
  existing canonical micro-skill, but that initial capture remains
  non-canonical until explicit promotion
- `micro_skill_catalog` remains the only micro-skill identity source for that
  classification boundary
- no free-text `micro_skill_key` invention is authorized
- pending candidate mappings must not be reusable by future suggestions
- the bounded Slice `2` lesson-submission capture path is now implemented and
  QA passed:
  - success state is visible after save
  - pending candidate mappings do not unlock `Accept`
  - pending candidate mappings are not used by future suggestion resolution
  - parent-added missed words persist as reviewable parent input after reopen
  - manual writing samples remain excluded
- the bounded Slice `3` parent-local promotion path is now implemented and
  validated for lesson/task-submission spelling suggestions in `Review Work`:
  - parents can explicitly promote existing `pending_parent_promotion`
    candidate mappings to `parent_local_promoted`
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
  - parent-local promotion is auditable and reversible
  - no parent action in normal `Review Work` creates global canonical mapping
    truth
- known limitation:
  - candidate capture depends on seeded canonical micro-skill coverage
  - valid rows such as `natral -> natural` may remain blocked until the
    correct canonical micro-skill exists in the bounded seeded option set
  - this is a catalogue/seed coverage limitation, not a Slice `2` runtime
    boundary failure
- a captured row may remain visible in both `Suggested / candidate` and
  `Parent Verification` while the mapping is still
  `pending_parent_promotion`; this is acceptable for Slice `2`, though later
  copy may clarify the state as captured-but-not-promoted
- parent-local promotion is the highest authority authorised in the
  single-child MVP
- parent-local promoted mappings may improve suggestions only inside the same
  parent/child environment
- global canonical promotion remains a separate curator/admin workflow deferred
  from MVP
- no parent action in normal `Review Work` directly writes global canonical
  mapping truth
- Slice `4A` documents the next catalog-review boundary only:
  - parent-facing action label: `No matching skill`
  - helper copy: `Send this spelling case to catalog review.`
  - `Uncategorised` is not the primary label because it sounds like a final
    state rather than a request for curation
  - `Needs new skill` is not the only label because admin may decide an
    existing skill fits, the case is word-level only, the case is not a
    learning issue, or the case should be merged or superseded
  - Slice `4B.1` parent action now creates or updates a catalog-review case
    only
  - no parent action creates a global canonical mapping or new micro-skill
- implemented case owner is the dedicated table concept,
  `spelling_catalog_review_cases`, rather than:
  - `parent_verified_spelling_candidate_mappings`, which requires an existing
    `micro_skill_key` even when the gap is that no suitable skill exists
  - `writing_issues`, which are durable reviewed issue history rather than
    catalog-curation workflow
- Slice `4B.1` is implemented and QA passed as parent case capture only:
  - scope is eligible lesson-submission spelling rows only
  - parent uses `No matching skill` when no existing catalog-backed
    micro-skill fits
  - helper copy remains `Send this spelling case to catalog review.`
  - optional `parent_note` is allowed by the implemented action/table contract
  - saved state should be non-blocking, for example
    `Sent to catalog review`
  - parent may still complete or return Review Work according to existing rules
- implemented `spelling_catalog_review_cases` schema:
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
- initial `case_status` values are `open`, `closed_duplicate`, and
  `superseded`; parent case capture can create or update only `open` cases in
  Slice `4B.1`
- idempotency/dedupe:
  - repeated parent submissions for the same parent/child/source misspelling
    event update the same open case
  - only one open case should exist for the same
    `parent_user_id + child_id + source_misspelling_instance_id`
  - closed/superseded historical cases may remain for audit
  - existing parent verification, candidate mapping, or durable issue truth
    should prevent duplicate catalog-review capture where appropriate
- implemented server action boundary is `captureSpellingCatalogReviewCase`:
  - accept only `submission_id`, `misspelling_instance_id`, optional
    `parent_note`, and `redirect_path`
  - require authenticated parent ownership and verify lesson submission, child,
    writing sample, and misspelling row scope
  - reject manual writing samples and rows without lesson/task-submission
    lineage
  - do not accept `micro_skill_key`
  - do not create `parent_verifications`,
    `parent_verified_spelling_candidate_mappings`, or `writing_issues`
  - do not write `micro_skill_catalog`
  - do not affect resolver data, mastery, rewards, analytics, templates, or
    assignments
- RLS/auth expectations:
  - authenticated parent access is scoped to `auth.uid() = parent_user_id`
  - server action must enforce ownership even if RLS exists
  - Slice `4B.1` introduces no admin policies or admin routes
  - future admin read/update policies belong to Slice `4C`/`4D`
- Slice `4B.0` now replaces the bulky candidate-capture selector with a
  compact spelling review table before case capture:
  - table columns are Wrong Word, Correct Word, Skill Family dropdown, Skill
    Cluster dropdown, Micro-skill dropdown, and Actions
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
  - actions are `X` false positive, `!` not a learning issue, and Tick
    approve correction and skill
  - Tick uses existing Review Work verification semantics only
  - Tick must not create global truth or automatically promote parent-local
    mappings
  - parent-local promotion/revert remains separate Slice `3` behavior
  - use existing active, assignable `D4` `micro_skill_catalog` rows for
    selectable micro-skills and existing family/cluster display metadata for
    parent-facing labels
  - do not create micro-skills
  - do not allow free-text `micro_skill_key`
  - do not write canonical truth
  - do not change resolver priority
  - do not block parent review completion
- Slice `4B.1` UI placement:
  - `No matching skill` appears in the compact table Actions column for
    eligible lesson-submission spelling rows
  - it is not shown for manual writing samples
  - it is not shown when a row already has a parent decision, candidate mapping,
    durable issue, or open catalog-review case where that would create duplicate
    workflow
  - after capture, show a row status such as `Sent to catalog review`
  - do not disable unrelated Review Work completion unless existing rules
    already require it
- Slice `4B.1` implementation closeout:
  - `captureSpellingCatalogReviewCase` creates or updates only open
    `spelling_catalog_review_cases`
  - parent-scoped RLS and server-side authenticated parent ownership checks are
    both required
  - repeated capture dedupes on the open
    `parent_user_id + child_id + source_misspelling_instance_id` case
  - compact Review Work shows `No matching skill` and the saved state
    `Sent to catalog review`
  - parent-added lesson missed words are supported without broadening manual
    writing samples
  - the UI gracefully withholds the case-capture action when the case table is
    unavailable
  - no admin queue, admin decisions, canonical/global mapping writes,
    parent-created global canonical truth, micro-skill creation, resolver
    priority change, manual writing sample broadening, or
    mastery/reward/assignment/scoring/analytics/template changes were added
- first admin surface should not be a broad admin system:
  - introduce it only after parent-raised catalog-review cases can exist
  - keep it minimal and protected at `/admin/catalog-review`
  - admin/internal access is defined by
    [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
  - Slice `4C` is implemented and QA passed as a protected read-only admin
    triage surface
  - authenticated parent identity is not admin/internal identity
  - private-MVP admin identity comes from server-side `ADMIN_USER_IDS` and
    `ADMIN_EMAILS` allowlists
  - no separate admin login, DB admin role table, Supabase custom claims, or
    role-management UI was added
  - `app/admin/layout.tsx` is the mandatory server-side admin guard
  - `/admin/catalog-review` also calls `requireAdminUser()` before creating or
    using the service-role client; this call is outside broad data-read
    `try/catch`, so `redirect()` / `notFound()` control-flow is not swallowed
  - future `/api/admin/*` routes must call the same admin helper before
    querying data
  - admin reads use a server-only service-role helper after admin authorization
    passes
  - no admin RLS read policies are added for v1
  - parent-scoped `spelling_catalog_review_cases` policies must remain
    parent-scoped; admin reads must not weaken parent access controls or let
    parent users list other parents' cases
  - any service-role usage must be server-only and must never be exposed to
    client components
  - admin read access must be explicit, auditable, and tested before launch
  - implemented behavior is read/triage of open spelling catalog-review cases
    grouped by normalized `misspelling -> correction`, sorted by latest
    `updated_at`, with count/latest date, representative context, parent
    reason/note, source provenance, status, and limited supporting spelling
    context
  - Slice `4C` includes safe empty/error states and avoids unnecessary
    parent/child identity exposure
  - Slice `4C` must not add admin decisions, canonical/global promotion,
    micro-skill creation, resolver changes, parent `Review Work` behavior
    changes, manual writing sample expansion, or
    mastery/reward/assignment/scoring/analytics/template changes
- admin decision work is later than parent capture:
  - link existing skill
  - create/propose new skill
  - word-level only
  - not a learning issue
  - merge duplicate
  - supersede/reopen
  - only admin/catalog curation may create or update canonical/global mapping
    truth
- Slice `4D.1` implementation closeout is case-only admin resolution:
  - `linked_existing_skill`, `new_skill_needed`, `word_level_only`, and
    `not_a_learning_issue`
  - `no_action_needed` is not implemented in `4D.1`
  - `linked_existing_skill` validates an existing active, assignable `D4`
    `micro_skill_catalog.micro_skill_key`
  - `linked_existing_skill` does not create global canonical truth, does not
    change resolver output, and does not promote anything globally
- `new_skill_needed` does not create a new micro-skill; `word_level_only`
  resolves a real spelling issue as word-specific; `not_a_learning_issue`
  resolves a case as not useful for learning/practice/catalog truth
- Slice `4D.1` admin UX reuses the compact Review Work table visual pattern
  where appropriate as one per-case decision table, not a grouped batch
  mutation surface:
  - parent Review Work table purpose is evidence classification/reporting
  - admin catalog-review table purpose is evidence review and curation
  - main table fields are Wrong Word, Correct Word, Reason, Skill Family,
    Skill Cluster, Micro-skill, Decision, and Actions
  - Source, Evidence Count / Source Count, Current Status, Latest Original
    Spelling Pair, Representative Context, Parent Note, Decision Note, and
    Decision History live in case details/disclosure
  - family, cluster, and micro-skill labels should use parent/admin-facing
    display names where available
  - mutation controls are labelled and keyboard-accessible, use accessible
    icon actions, and do not expose unnecessary parent/child identity; no
    Archive action is implemented
- Slice `4D.1` decisions use `spelling_catalog_review_case_decisions` as the
  app/RPC-path audit ledger, including decision type, admin identity,
  previous/new status, linked `micro_skill_key`, nullable
  `canonical_mapping_id` unused in `4D.1`, decision note, metadata, and
  `created_at`
- the RPC locks/updates the target case and inserts the audit row; DB-level
  append-only enforcement with triggers/privilege redesign is not implemented
  and is accepted only for private MVP
- Slice `4D.1` is implemented and QA passed; non-link `micro_skill_key`
  tampering is rejected, and canonical/global truth, resolver non-effect,
  admin/security/service-role, UI/accessibility/table workflow, and manual
  browser QA boundaries passed
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
  - dedicated storage now lives in `spelling_canonical_mappings`, with audit
    events in `spelling_canonical_mapping_events`
  - a service-role-only RPC/repository foundation exists for future canonical
    mapping writes
  - the slice preserves source case, source decision, admin identity, decision
    note, metadata, dialect, normalization version, status/lifecycle fields,
    and previous/new event values for future analytics
  - it introduced no resolver reads, no resolver priority change, no admin UI
    decision, no parent `Review Work` change, no `micro_skill_catalog`
    mutation, no false-positive handling, and no manual writing sample
    broadening
  - existing Slice `4D.1` `linked_existing_skill` rows were not
    reinterpreted, backfilled, or promoted as canonical/global mapping truth
  - validation passed: `npx tsc --noEmit`, `npm run build`,
    `npm run writing-engine:canonical-mapping-storage-regression`, and
    `git diff --check`
  - residual private-MVP risk: service-role direct table writes can bypass
    canonical mapping event conventions until a later DB hardening slice
- false-positive catalog review is reserved for a future Slice `4D` sub-slice:
  - reserve future case reason `false_positive_report`
  - reserve future admin outcomes `false_positive_confirmed` and
    `false_positive_needs_rule_fix`
  - false positives can indicate bad canonical/system truth, including
    repeated correct-word flags, incorrect corrections, correct spellings
    mapped to errors, bad canonical mappings, or over-eager rules
  - do not claim parent false-positive catalog-review capture or admin
    false-positive mutation is implemented until a later slice adds it
- implementation readiness:
  - Slice `4C` runtime is implemented and QA passed
  - QA evidence:
    - `npx eslint app/admin/catalog-review/page.tsx`
    - `npx tsc --noEmit`
    - `npm run build`
    - `git diff --check`
  - residual operational requirements:
    - configure `ADMIN_USER_IDS` and/or `ADMIN_EMAILS` server-side
    - configure `SUPABASE_SERVICE_ROLE_KEY` server-side
    - future browser-client admin reads require a DB-backed role or claims
      model plus explicit admin RLS policies
    - future write-capable admin workflows require separate action helpers,
      audit trail design, and regression coverage
- resolver contract remains unchanged in Slice `4A` and Slice `4B.1`:
  - open catalog-review cases are invisible to the resolver
  - parent notes/reasons are evidence only
  - canonical/global storage foundation now exists after Slice `4E.1`, but
    resolver use remains blocked until a later resolver integration slice
  - `spelling_catalog_review_cases`, parent notes, parent-scoped candidate
    mappings, and `micro_skill_catalog` metadata must not silently become
    global mapping truth
  - future resolver integration may add resolver-visible normalized spelling
    mappings, suppress or correct false-positive-producing mappings/rules,
    close cases with audit, and improve future suggestions only after the
    resolver contract is explicitly revised
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
  - no `parent_verifications`, `parent_verified_spelling_candidate_mappings`,
    `writing_issues`, or `micro_skill_catalog` rows are created/updated by this
    action except the catalog-review case row itself
  - resolver output remains unchanged
  - mastery, rewards, assignments, scoring, analytics, and template metadata
    remain untouched
- the bounded override save path uses the canonical anchor fallback that any
  future selectable Review Work provider UI must also use when persisted
  shared suggestion truth is still `unknown`
- template routing is micro-skill-owned, not word-owned, for Review Work
  spelling issues
- `verified_template_key` remains deferred/blocked in Review Work and must not
  become free-text canonical override truth
- accepted suggestions use the suggested canonical micro-skill's configured
  template route, and overridden suggestions use the verified replacement
  micro-skill's configured template route
- no parent-facing template dropdown/provider is authorized now; any later
  template choice UI must be separately authorized and bounded to the verified
  micro-skill's allowed template metadata
- the bounded Review Work read-only derived template metadata slice is now
  implemented for lesson/task-submission spelling suggestions
- it may display template-route metadata derived from canonical/verified
  micro-skill truth, but it must not introduce editable template fields,
  word-by-word template truth, or independent template persistence
- any later parent-verified spelling candidate-capture stage must not change:
  - `Accept` readiness
  - override-provider behavior
  - read-only derived template metadata behavior
  - reward
  - mastery
  - assignment
  - scoring
  - thresholds
  - template routing
  - analytics
  - positive-evidence semantics
- that stage is separate from `Stage 7F` and separate from `Stage 8`

Parent-facing summary surfaces outside `Review Work` may use advisory
evidence/progress wording, but that wording must not be treated as verified
truth or automatic mastery. `Stage 8A` is a wording-safety pass, not a
mastery-model change.

Completed `Stage 8A` preserved this boundary: summary surfaces remain advisory
interpretation only, while `Review Work` remains the canonical
parent-verified-truth surface. Residual product-metaphor labels may be refined
later through another bounded copy-only pass if needed.

Stage `8` closeout preserves the same rule: it was a boundary-safety and
parent-facing evidence-wording stage only, not a mastery-runtime stage, and it
did not alter verification truth, mastery semantics, or workflow ownership.

## Admin/Internal Access Boundary

Writing Engine admin/internal access defers to:

- [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)

The private-MVP admin model authorizes read-only internal surfaces only. It does
not authorize admin decisions, canonical/global promotion, micro-skill creation,
catalog mutation, resolver changes, parent `Review Work` changes, or any
weakening of parent-scoped RLS.

## Navigation ownership

Parent navigation should expose writing review under `Courses`.

This means:
- `Review Work` belongs under `Courses`
- `Analyse Writing` belongs under `Courses`
- standalone top-level Analyse navigation is not allowed

This navigation rule is an ownership rule, not just an information-architecture
 preference. Analyse intake is subordinate to canonical `Review Work`, not a
 parallel parent workflow.

## Mastery semantics

A word is evidence about one or more mini-skills, not the skill itself.

Correct spelling gives credit only for the mini-skills the word genuinely
tests.

The system must preserve these rules:

- one word must not prove mastery
- a complex word does not prove all simpler mini-skills
- supporting prerequisite mini-skills should not be strongly penalised unless
  the error directly proves prerequisite failure
- repeated controlled practice must not be mistaken for authentic transfer

Parent- and child-facing "Mastered" must require:

- authentic writing transfer
- breadth across representative examples
- sufficient confidence / evidence count
- low recent recurrence

This brief establishes those as canonical product semantics even where the
exact implementation formula remains versioned elsewhere.

## Internal and parent-facing mastery states

The canonical internal mastery ladder is:

0. Unseen
1. Introduced
2. Recognises
3. Controlled production
4. Contrast control
5. Delayed retention
6. Transfer
7. Generalised mastery
8. Automatic mastery

Parent-facing simplified states may be:

- Learning
- Practising
- Remembering
- Using in Writing
- Mastered

Important gate:

- "Mastered" must not be available without authentic writing transfer

## Evidence model

Evidence should be modelled conceptually using:

- source weight
- mini-skill role weight
- complexity weight
- diversity / breadth contribution
- independence
- recency / retention

Evidence source types should distinguish at least:

- recognition / multiple choice
- copying / guided task
- controlled lesson spelling
- contrast practice
- dictation
- delayed review
- authentic writing
- self-correction in free writing
- correct after previous failure
- parent-verified diagnostic
- parent-rejected suggestion
- false positive

Evidence records should preserve, where available:

- source type
- source entity
- target text
- attempt text
- correctness
- parent verification state
- mini-skill role
- evidence strength / weight
- complexity metadata
- breadth metadata

The exact mathematical scoring model belongs in a lower-level mastery/evidence
contract, but the requirement to preserve these evidence dimensions is part of
the canonical brief.

## Word-to-mini-skill evidence model

Each word can provide an evidence map that identifies:

- primary tested mini-skill
- supporting prerequisite mini-skills
- unrelated mini-skills
- evidence weights

Example:

- `hopeing -> hoping` strongly updates `drop final e before vowel suffix`
- it may weakly or conditionally affect suffix awareness or final silent-e base
  awareness
- it should not weaken unrelated mini-skills such as CVC word mastery

This distinction is required to avoid corrupting mastery with overly broad
negative updates.

## Word diversity and complexity

Mastery requires breadth across representative word groups, not repeated
success on a single item.

Word complexity should consider:

- frequency
- syllable count
- phonics regularity
- grapheme ambiguity
- morphology depth
- etymology / irregularity
- homophone / context risk
- number of mini-skills required
- highest-level mini-skill involved
- common error rate in actual learner work

Complexity matters only for the mini-skills a word genuinely tests.

Difficulty must not be treated as universal proof of lower-level mastery.

## Parent verification

Parent verification is central.

The engine may suggest:

- likely category
- mini-skill
- prerequisite gaps
- lesson
- assignment item

But in early stages:

- unverified suggestions must not update mastery

The system must preserve both:

- engine suggestion
- parent decision

Parent decisions should support:

- accept suggestion
- override category
- override mini-skill
- override lesson
- mark false positive / not an issue
- add note

This is required for auditability, future classifier improvement, override-rate
analysis, and protecting mastery from false positives.

## Assignment architecture

`assignment_items` is the generic assignment composition layer.

`daily_assignments` is the current transitional delivery/header surface only.
No new canonical architecture should be designed around it as the permanent
model.

Long-term direction should move toward a generic assignment header such as:

- `writing_assignments`
- `improvement_assignments`

Assignment items must be able to support:

- spelling dictation
- spelling contrast practice
- punctuation correction
- sentence splitting
- proofreading
- grammar transformation
- paragraph revision
- writing-transfer tasks

The Writing Engine must not become a word-list-only system.

Stage `1D` implementation rule:

- assignment generation must start from canonical `learning_items`, not from
  `word_progress`, retired spelling runtime rows, or route-local assignment
  composition
- the first implementation slice may be narrow, but the architecture must stay
  generic at the `assignment_items` boundary
- after `1D.2` proves deterministic append-only persistence for single-word
  spelling items, the next bounded builder pass should widen shape rather than
  widen ownership:
  - `1D.3` is the first grouped-set builder pass
  - it should remain inside the spelling domain
  - it should keep `learning_items`, `micro_skill_catalog`, and
    `learning_item_evidence` as the only canonical generation inputs
  - it should not broaden into adaptive routing, contrast logic, dictation, or
    route-local delivery
- after `1D.3` proves grouped-set building without new ownership or provenance,
  the next bounded builder pass should still widen shape rather than widen
  ownership:
  - `1D.4` is the first contrast builder pass
  - it should remain inside the spelling domain
  - it should keep `learning_items`, `micro_skill_catalog`, and
    `learning_item_evidence` as the only canonical generation inputs
  - it should reuse the existing duplicate-safe append model
  - it should not broaden into dictation, adaptive routing, or route-local
    delivery
- after `1D.4` proves contrast building without new ownership or provenance,
  the next bounded builder pass should still widen shape rather than widen
  ownership:
  - `1D.5` is the first dictation builder pass
  - it should remain inside the spelling domain
  - it should keep `learning_items`, `micro_skill_catalog`, and
    `learning_item_evidence` as the only canonical generation inputs
  - it should reuse the existing duplicate-safe append model
  - it should keep one active `learning_item` as the generation unit and one
    evidence-backed anchor `target_word` as the persisted identity anchor
  - it should not broaden into audio delivery, browser speech synthesis,
    sentence-level batching, adaptive routing, or route-local delivery
- if a proposed implementation requires undocumented assignment ownership,
  undocumented provenance rules, or a new legacy compatibility anchor, the
  docs must be updated before code is written

Stage `3` implementation rule:

- authentic-writing submission analysis must begin from canonical repo-owned
  submission truth, not route-local review heuristics or retired spelling-page
  logic
- the first Stage `3` pass remains spelling-only and must reuse the shared
  Writing Engine boundary plus documented Stage `2` spelling-content truth
- raw authentic-writing analysis output is candidate-hypothesis truth only:
  - it is not durable issue truth by itself
  - it is not mastery truth by itself
  - it is not transfer evidence by itself
- parent verification remains the gate between authentic-writing suggestions
  and verified educational truth
- accepted and overridden authentic-writing outcomes must remain able to feed
  the durable `writing_issue` lifecycle and later canonical `learning_items`
  without creating a parallel diagnostic-only issue system
- rejected authentic-writing outcomes must remain auditable without creating
  fake `writing_issues`, fake mastery updates, or fake transfer evidence
- if a proposed Stage `3` implementation requires a new parallel issue
  history, free-text mini-skill identity, or external API truth owner, the
  docs must be updated before code is written

Stage `4` implementation rule:

- Stage `4` is the punctuation-only reuse of the proven Stage `3`
  authentic-writing path
- raw punctuation analysis output is candidate-hypothesis truth only:
  - it is not durable issue truth by itself
  - it is not mastery truth by itself
  - it is not transfer evidence by itself
- Stage `4` must reuse the shared Writing Engine boundary plus the existing
  parent-verification and durable-issue contracts rather than creating a
  punctuation-specific parallel workflow
- punctuation hypotheses may classify punctuation-specific educational truth,
  but they must remain bounded to punctuation and must not expand into:
  - sentence-boundary detection
  - sentence-formation diagnosis
  - grammar/usage diagnosis
  - general proofreading ownership
- accepted and overridden punctuation outcomes must remain able to feed the
  durable `writing_issue` lifecycle without introducing punctuation-only issue
  stores or a new verification model
- rejected punctuation outcomes must remain auditable without creating fake
  `writing_issues`, fake mastery updates, or fake transfer evidence
- if a proposed Stage `4` implementation requires a new sentence-boundary or
  grammar taxonomy, a new evidence source type, or a new external truth owner,
  the docs must be updated before code is written

Stage `5` implementation rule:

- Stage `5` is the sentence-boundary / sentence-formation reuse of the proven
  Stage `3` and Stage `4` authentic-writing path
- raw sentence-boundary analysis output is candidate-hypothesis truth only:
  - it is not durable issue truth by itself
  - it is not mastery truth by itself
  - it is not transfer evidence by itself
- Stage `5` must reuse the shared Writing Engine boundary plus the existing
  parent-verification and durable-issue contracts rather than creating a
  sentence-boundary-specific parallel workflow
- sentence-boundary hypotheses may classify sentence-boundary-specific
  educational truth, but they must remain bounded to sentence-boundary /
  sentence-formation concerns and must not expand into:
  - grammar/usage diagnosis
  - broad proofreading ownership
  - transfer evidence ownership
- accepted and overridden sentence-boundary outcomes must remain able to feed
  the durable `writing_issue` lifecycle without introducing a sentence-only
  issue store or a new verification model
- rejected sentence-boundary outcomes must remain auditable without creating
  fake `writing_issues`, fake mastery updates, or fake transfer evidence
- if a proposed Stage `5` implementation requires a grammar fallback
  taxonomy, a proofreading catch-all taxonomy, a new evidence source type, or
  a new external truth owner, the docs must be updated before code is written
- Stage `5` is now complete for its documented `5A` / `5B` / `5C`
  sentence-boundary contract, and those boundaries remained intact at closeout
- Stage `6A` is now complete for its documented bounded
  grammar/proofreading candidate-only contract, and those boundaries remained
  intact at closeout
- Stage `6B` is now complete for its documented bounded
  grammar/proofreading shared verification contract, and those boundaries
  remained intact at closeout
- Stage `6C` is now complete for its documented bounded
  grammar/proofreading durable-issue bridge contract, and those boundaries
  remained intact at closeout

## Analytics and assessment contract

Analytics dashboards can come later, but evidence capture must be designed from
the start.

The system must eventually be able to answer:

Is the child becoming a better writer?

It should support later calculation of:

- spelling errors per 100 words
- punctuation errors per 100 words
- sentence-boundary errors per 100 words
- repeated error rate
- corrected-after-feedback rate
- high-frequency word accuracy
- target mini-skill transfer rate
- writing volume
- complexity of attempted words and sentences
- self-correction rate
- parent override rate
- controlled task accuracy
- contrast task accuracy
- dictation accuracy
- delayed review accuracy
- authentic writing transfer
- recurrence after mastery
- breadth coverage
- confidence / stability

Stage 1 should therefore capture the evidence fields needed for later analytics
even if dashboards are deferred.

## External API strategy

External APIs may assist later but must not own truth.

Possible later uses:

- LanguageTool for suggestion seeding in spelling, grammar, punctuation, or
  homophone detection
- Datamuse for related words, sound-alikes, and syllable/frequency enrichment
- Wiktionary or Free Dictionary for pronunciation, definitions, or etymology
  hints
- browser speech synthesis for dictation delivery

Stage 1 rule:

- no external APIs in the runtime-critical path

APIs may enrich or seed suggestions later, but the app owns:

- mini-skills
- lesson templates
- mastery
- assignments
- final parent-verified truth

## Stage 1A scope

Stage 1A is architecture foundation only.

It should not build the full spelling classifier.

Stage 1A should establish:

- shared `lib/writing-engine` boundary
- shared types/interfaces for domain modules
- candidate hypotheses
- parent verification commands
- verified outcomes
- mastery evidence commands
- assignment item candidates
- analytics/evidence capture contract
- generic assignment item contract
- future module plug-in surface

It should prove:

- unverified suggestions do not update mastery
- verified outcomes can produce evidence
- evidence can strengthen or create a learning item
- assignment items can be generated under the current transitional delivery
  model
- assignment items are not spelling-only
- domain logic lives in `lib/writing-engine`, not `app/*`

## Stage 1B scope

Stage 1B is the manual spelling diagnostic MVP.

Input:

- target word
- child spelling
- sentence context

Output:

- likely error category
- suggested mini-skill / mini-skills
- possible prerequisite gaps
- recommended micro-lesson
- similar practice words
- confidence score
- parent verification status

Initial classifier approach:

- deterministic rules for obvious patterns
- word-to-mini-skill map
- edit distance comparison
- grapheme/phonics comparison where practical
- parent verification

Examples:

- `runing -> running` = double final consonant before vowel suffix
- `hopeing -> hoping` = drop final e before vowel suffix
- `plai -> play` = final `ay` for long /a/

## Documentation ownership

This brief does not replace lower-level owner docs.

Documentation ownership remains:

- pedagogy docs own educational meaning
- contract docs own executable rules and invariants
- architecture docs own system boundaries and canonical shape
- `writing-engine-roadmap.md` owns implementation sequence
- `targeted-writing-practice-status.md` reports current state only

Older or superseded plans should be marked historical or archived if they
conflict with the active documentation set.

## Non-goals

This brief does not:

- define the exact implementation formula constants for mastery scoring
- replace detailed contracts for evidence persistence
- replace the implementation roadmap
- build the spelling classifier
- define external APIs as sources of truth
- justify reviving the retired spelling runtime

## Risks and controls

- Risk: the engine collapses into a spelling checker
  Control: preserve multi-domain architecture from the start
- Risk: one strong practice result is mistaken for mastery
  Control: require transfer, breadth, confidence, and recurrence protection
- Risk: supporting prerequisites are unfairly penalised
  Control: only apply strong negative updates where evidence directly proves
  failure
- Risk: generic assignments regress into word-list-only delivery
  Control: keep `assignment_items` generic and treat `daily_assignments` as
  transitional only
- Risk: false positives damage mastery
  Control: require parent verification before meaningful mastery updates
- Risk: external tools start to own educational truth
  Control: limit them to enrichment and suggestion seeding
- Risk: overlapping docs create drift
  Control: use this brief as the canonical synthesis before lower-level
  reconciliation
