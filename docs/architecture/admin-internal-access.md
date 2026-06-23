# Admin/Internal Access

## Purpose

This document defines the smallest safe admin/internal access model for
Scarlett's Spells for private-MVP protected internal read/triage surfaces.

It is a private-MVP access contract for protected internal read/triage surfaces.
It exists so Slice `4C` catalog-review admin UI can run without weakening parent
access, parent-scoped RLS, or Writing Engine taxonomy boundaries.

Implementation status: the admin access foundation is implemented. The
`/admin/catalog-review` read-only triage UI is implemented and QA passed.
Admin APIs, admin decisions, canonical promotion, micro-skill creation, catalog
mutation, and case status mutation are not implemented.

## Current Model

Existing Supabase login remains the only login.

Admin status is not a parent role and is not inferred from being signed in.
The app recognizes an admin only on the server by checking the authenticated
Supabase user against private environment allowlists:

- `ADMIN_USER_IDS`
- `ADMIN_EMAILS`

Prefer `ADMIN_USER_IDS` when the user id is known. `ADMIN_EMAILS` is acceptable
for the private MVP, but it is a convenience fallback rather than the long-term
authority model.

Admin allowlists must never use a `NEXT_PUBLIC_*` prefix and must never be
read by client components. There is no DB admin role table, Supabase custom
claims model, role-management UI, or separate admin login in this version.

## Route And Guard Convention

Admin pages live under `/admin`.

Implemented foundation:

- `/admin` session protection is registered in `proxy.ts`
- `app/admin/layout.tsx` is the mandatory server-side admin gate
- the layout calls the shared server-only admin helper before rendering child
  admin routes

The first implemented admin review route is:

- `/admin/catalog-review`

Future admin APIs must live under `/api/admin/*` and must call the same admin
helper before querying data. API route handlers must not rely on the admin page
layout for authorization.

Proxy/middleware may protect `/admin` from anonymous access by redirecting to
`/login`, but proxy/middleware is not the admin authorization boundary. A
signed-in non-admin parent must still be blocked by the server-side admin
guard.

## Implemented Helper Boundaries

The admin access helper lives at:

- `lib/admin/access.ts`

Implemented helper responsibilities:

- read the current Supabase user using the existing server auth path
- return unauthenticated when no user is signed in
- authorize only users whose id or email appears in the private allowlist
- expose `getAdminUser()` and `requireAdminUser()` for layouts, future admin
  route handlers, and future admin-only server actions
- avoid leaking allowlist values or service-role configuration to the browser

The service-role Supabase helper lives at:

- `lib/supabase/service-role.ts`

Implemented service-role responsibilities:

- use `import "server-only"`
- read a private server-side service-role key, never a `NEXT_PUBLIC_*` key
- be imported only by admin server components, admin route handlers, or
  admin-only server actions after admin authorization has passed
- never be passed to client components

The service-role helper exists as a server-only boundary. It is not imported by
client components. `/admin/catalog-review` uses it only after
`requireAdminUser()` passes.

## RLS And Parent Isolation

Do not add admin RLS read policies for v1.

Parent-owned table policies remain scoped to:

`auth.uid() = parent_user_id`

Admin cross-parent reads may happen only through server-only service-role access
after `requireAdminUser()` passes. Normal parent routes, server actions, and
browser clients must continue to use the regular Supabase clients and explicit
`parent_user_id` ownership checks.

Parent data isolation rules:

- normal parents must never be able to list another parent's children, courses,
  submissions, writing samples, spelling cases, candidate mappings, or review
  cases
- admin routes must not expose service-role results through shared parent
  components or parent APIs
- admin queries must select only the fields needed for the internal read/triage
  surface
- parent-scoped RLS must not be weakened to make admin UI easier
- if admin reads ever move to a browser Supabase client, this model is no
  longer sufficient and the app must first adopt DB-backed admin roles or
  Supabase custom claims plus explicit admin RLS policies

## Authorized Scope

This model authorizes read-only internal surfaces only.

For Slice `4C`, it authorizes the implemented protected
`/admin/catalog-review` read/triage surface over open
`spelling_catalog_review_cases`. That surface may group, inspect, and summarize
parent-raised catalog-review cases for internal triage.

The implemented Slice `4C` surface:

- reads only open `spelling_catalog_review_cases`
- groups cases by normalized `misspelling -> correction`
- sorts groups by latest `updated_at`
- displays misspelling -> correction, count, latest date, representative
  context, parent note/reason, source provenance, status, and limited
  supporting spelling context where appropriate
- includes safe empty/error states
- avoids unnecessary parent/child identity exposure
- calls `requireAdminUser()` before creating or using the service-role client
- keeps that page-level guard outside broad data-read `try/catch`, so
  `redirect()` / `notFound()` control-flow is not swallowed by generic error
  rendering

This model does not authorize:

- curation decisions
- canonical/global promotion
- micro-skill creation
- catalog mutation
- case closing, merging, superseding, or reopening
- resolver changes
- parent `Review Work` behavior changes
- manual writing sample expansion
- mastery, reward, assignment, scoring, analytics, or template-routing changes
- role-management UI
- a separate admin login
- a broad admin dashboard or CMS

Slice `4D` or another explicit future admin curation slice must define any
write-capable admin authority, mutation helpers, audit behavior, and tests
before those operations are implemented.

## Slice Boundaries

Slice `4C`:

- has implemented the admin access foundation
- has implemented `/admin/catalog-review` as a separate read-only UI slice
- has implemented read-only internal triage over open catalog-review cases
- uses the server-only admin guard and service-role boundary
- must not mutate catalog-review case status or canonical catalog truth

Slice `4D`:

- owns admin decisions and canonical promotion if later approved
- first safe implementation scope, `4D.1`, is implemented and QA passed as
  case-only admin resolution with `linked_existing_skill`,
  `new_skill_needed`, `word_level_only`, and `not_a_learning_issue`
- `linked_existing_skill` must validate an existing active, assignable `D4`
  `micro_skill_catalog.micro_skill_key`, but it must not create
  canonical/global mapping truth, affect resolver output, or promote anything
  globally in `4D.1`
- `new_skill_needed` does not create a new micro-skill; `word_level_only`
  resolves a real spelling issue as word-specific; `not_a_learning_issue`
  resolves a case as not useful for practice/catalog truth
- `no_action_needed` is not implemented in `4D.1`
- later sub-slices may define merging, superseding, reopening, false-positive
  review, proposal workflows, and canonical/global promotion
- future false-positive review vocabulary is reserved but not implemented:
  `false_positive_report`, `false_positive_confirmed`, and
  `false_positive_needs_rule_fix`
- the implemented `4D.1` admin decision UI is one compact per-case table with
  main fields Wrong Word, Correct Word, Reason, Skill Family, Skill Cluster,
  Micro-skill, Decision, and Actions; Source, evidence count, current status,
  latest original spelling pair, representative context, parent note, decision
  note, and decision history live in case details/disclosure
- `4D.1` must not add group-wide mutation buttons to grouped normalized
  spelling pairs; every decision submission remains per individual case
- admin mutation controls are labelled and keyboard-accessible, use accessible
  icon actions where appropriate, and avoid unnecessary parent/child identity
  exposure; no Archive action is implemented in `4D.1`
- the admin decision audit trail uses
  `spelling_catalog_review_case_decisions` as the app/RPC-path audit ledger
  and records decision type, admin user id/email, previous status, new status,
  linked `micro_skill_key` where applicable, nullable `canonical_mapping_id`
  unused in `4D.1`, decision note, metadata, and `created_at`
- app path writes are append-only through the server action/RPC path; DB-level
  append-only enforcement with triggers/privilege redesign is not implemented
  and is accepted only for private MVP
- every admin mutation calls `requireAdminUser()` server-side before
  service-role use; service-role access remains server-only and
  post-authorization; no admin browser-client RLS policy was added; non-link
  decisions that submit `micro_skill_key` are rejected by the server action,
  with the RPC retained as defense-in-depth
- Slice `4E.0` defines the next admin curation contract:
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
  - `add_canonical_mapping` must validate an existing active, assignable `D4`
    `micro_skill_catalog.micro_skill_key`, write a dedicated canonical/global
    spelling mapping row, write a canonical mapping audit event, and record
    the source catalog-review case outcome
  - `add_canonical_mapping` must not create or mutate `micro_skill_catalog`;
    other `4E` decisions refuse or defer canonical update and must not create
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
- Slice `4E.1` implemented storage foundation only:
  - dedicated canonical/global mapping storage exists in
    `spelling_canonical_mappings`
  - dedicated canonical mapping audit/event storage exists in
    `spelling_canonical_mapping_events`
  - a service-role-only RPC/repository foundation exists for future canonical
    mapping writes
  - no admin UI decision, resolver read, resolver priority change, parent
    `Review Work` change, `micro_skill_catalog` mutation, false-positive
    handling, or manual writing sample broadening was introduced
  - existing Slice `4D.1` `linked_existing_skill` rows were not
    reinterpreted, backfilled, or promoted as canonical/global mapping truth
  - validation passed: `npx tsc --noEmit`, `npm run build`,
    `npm run writing-engine:canonical-mapping-storage-regression`, and
    `git diff --check`
  - residual private-MVP risk: service-role direct table writes can bypass
    canonical mapping event conventions until later DB hardening
- Slice `4E.2` admin canonical-curation decision flow is implemented and
  QA-passed:
  - `/admin/catalog-review` offers `add_canonical_mapping`,
    `needs_new_micro_skill`, `word_level_only`, `not_a_learning_issue`, and
    `reject_no_canonical_update` for new submissions
  - historical Slice `4D.1` `linked_existing_skill` and `new_skill_needed`
    decisions remain readable in decision history only; they are not offered
    for new submissions and were not reinterpreted, backfilled, or promoted
  - `add_canonical_mapping` requires `requireAdminUser()` server-side before
    service-role use, validates an active, assignable `D4`
    `micro_skill_catalog.micro_skill_key`, creates canonical mapping storage
    and a canonical mapping event through the Slice `4E.1` path, records
    `canonical_mapping_id` on the source case-decision row, and closes/updates
    the source catalog-review case
  - non-canonical Slice `4E` decisions record/close case outcomes only; they
    do not create canonical mappings or resolver-visible truth
  - non-canonical decision semantics distinguish a real issue needing a future
    micro-skill, a word-level-only issue, a non-learning issue, and a reviewed
    refusal where no canonical mapping, resolver change, catalog update, or
    further curation action is needed
  - P1 provenance fix passed re-audit: the source decision row is inserted
    first, its id is passed as `p_source_decision_id`, canonical mapping and
    event rows preserve `source_decision_id`, the decision row is updated with
    `canonical_mapping_id`, the flow remains atomic in one RPC transaction,
    and canonical mapping creation failure rolls back the decision insert
  - admin/security boundary remains intact: RPC execute remains service-role
    only, no client service-role helper was added, and no parent RLS or admin
    browser-client RLS policy changed
  - resolver boundary remains intact: no resolver reads
    `spelling_canonical_mappings`, no resolver priority changed, and active
    canonical mappings remain resolver-invisible until Slice `4E.3`
  - audit provenance now links case -> case decision -> canonical mapping ->
    canonical mapping event for future catalog-gap, resolver-quality, and
    admin-audit analytics; no analytics tables or dashboards were added
  - validation passed: targeted eslint, `npx tsc --noEmit`, `npm run build`,
    canonical mapping storage regression, admin canonical-curation regression,
    optional legacy regression, `git diff --check`, and P1 provenance re-audit
  - hosted DB smoke initially failed because the hosted RPC body was stale,
    then passed after corrected SQL was manually reapplied: the affirmative
    path created a decision, mapping, and event; mapping/event
    `source_decision_id` matched the decision id; the decision
    `canonical_mapping_id` matched the mapping id; `reject_no_canonical_update`
    created no mapping; cleanup left no smoke cases or mappings behind
  - residual deployment/process risk: hosted DB behavior passed after manual
    SQL reapplication, but hosted migration-ledger alignment is not proven
    because `supabase_migrations.schema_migrations` did not show expected
    `20260522%` rows. Multiple local migration files share a `20260522`
    prefix, so migration ordering/version hygiene should be reviewed before
    relying on CLI migrations for later slices. This does not block the Slice
    `4E.2` source closeout, but do not proceed to Slice `4E.3` resolver
    integration until the risk is documented and an explicit decision is made
    on whether to reconcile first
- Admin Spelling Review Hub is implemented as a small admin UX simplification:
  - `/admin/spelling-review` is an admin-facing hub route so admins do not
    need to remember whether to visit `/admin/catalog-review` or
    `/admin/canonical-recommendations`
  - the hub is a summary/link composition layer only, not an embedded
    two-table mutation surface and not a full unified catalog-review
    architecture
  - it shows two clearly separated sections:
    - Catalog gaps / No matching skill cases: existing `/admin/catalog-review`
      workflow backed by `spelling_catalog_review_cases`; parent could not
      find a suitable existing skill
    - Parent recommended canonical mappings: existing
      `/admin/canonical-recommendations` workflow backed by
      `spelling_canonical_mapping_recommendations`; parent selected an
      existing skill and recommends the word/correction/skill pairing for
      admin review
  - original routes remain valid and existing workflows, actions, decision
    semantics, canonical mapping creation behavior, PCRM curation behavior, No
    Matching Skill semantics, parent-local promotion behavior, RLS, migrations,
    resolver behavior, mastery, rewards, assignments, scoring, analytics,
    dashboards, and template routing are unchanged
  - service-role summary reads remain server-only and happen only after
    admin authorization
  - validation includes the focused
    `npm run writing-engine:admin-spelling-review-hub-regression` boundary
    check
- canonical/global storage, admin canonical-curation writes, resolver
  visibility controls, and runtime consumption now exist. Resolver use is
  production-enabled only for mappings with first-class
  `resolver_visibility_status` explicitly enabled; do not use
  `spelling_catalog_review_cases`, parent notes, parent-scoped candidate
  mappings, or `micro_skill_catalog` metadata as silent global mapping truth.
- production Vercel has
  `WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled`; one imported
  seed canonical mapping has been explicitly enabled and runtime-smoked in
  submitted learner work. Future resolver work should focus on operations,
  monitoring, rollback clarity, and audit hardening rather than generic
  resolver integration.
- R0 resolver integration contract is documentation-only and authorizes no
  runtime, schema, RPC, admin action, parent Review Work, completion gating,
  `micro_skill_catalog`, mastery, rewards, assignments, scoring, analytics,
  dashboard, or template-routing change
- PCRM resolver adoption authority:
  - PCRM-D plain `accepted` means accepted recommendation evidence only; it
    must not create/link canonical storage or set resolver visibility
  - a future explicit `accept_and_adopt_canonical_mapping` admin action may
    accept eligible PCRM evidence and create/link canonical mapping truth in
    one audited decision
  - parent users may recommend only; they cannot create/link
    `spelling_canonical_mappings`, mutate `micro_skill_catalog`, or set
    resolver visibility
  - resolver visibility must remain first-class, explicit, audited, reversible,
    and exact-pair based; metadata-only `resolver_visible` is not sufficient as
    production resolver authority
  - canonical mappings must remain resolver-invisible until individually
    enabled, and accepted PCRM recommendations must remain evidence-only until
    separately adopted into canonical mapping truth
  - admin visibility enablement must require active mapping status,
    exact normalized `misspelling_normalized -> correct_spelling_normalized ->
    micro_skill_key`, dialect and normalization-version match, active
    assignable `D4` micro-skill, safe provenance, and a visibility-enable audit
    event
  - admin adoption must call `requireAdminUser()` server-side before any
    service-role operation
  - no client component may import or use the service-role helper
  - parent RLS must not be broadened for adoption
  - no admin browser-client write policy is authorized unless a later explicit
    admin-RLS design adds DB-backed roles/claims and policies
  - adoption and resolver-visibility changes must write
    `spelling_canonical_mapping_events` audit with admin identity, timestamp,
    note/reason, source recommendation id, mapping id, and previous/new
    status or visibility where applicable
  - rollback must be admin-only and audited by turning resolver visibility off
    or disabling/deprecating/superseding the mapping; it must not delete PCRM
    evidence or mapping event history
- Follow-up admin UX and truth-management slices after the hub:
  - archived/reopen/edit decisions may add collapsed archived sections for
    resolved catalog cases and reviewed PCRM recommendations, but any reopen or
    changed decision must be recorded as a new audited admin decision/event;
    historical audit rows must not be edited in place
  - resolver adoption may plan how confirmed canonical mappings become
    spelling-engine visible, but it must preserve exact-pair semantics, avoid
    silently making existing accepted recommendations resolver-visible, and
    resolve hosted Supabase migration-ledger risk before production
    resolver-visible changes; any DB-changing resolver stage must use a unique
    timestamp migration, must not replay archived `20260522_*` migrations, and
    must follow `docs/operations/supabase-migration-policy.md`

## QA Expectations

Slice `4C` runtime QA passed:

- anonymous `/admin/*` requests redirect to `/login`
- signed-in non-admin parents cannot render admin pages
- allowlisted users can render the admin shell
- service-role client code is server-only and not imported by client
  components
- parent routes still use parent-scoped clients and ownership filters
- existing parent-scoped RLS policies remain unchanged
- normal parents cannot list cross-parent catalog-review cases
- the page is read-only and mutation-free

Validation evidence:

- `npx eslint app/admin/catalog-review/page.tsx`
- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`

Operational setup:

- `ADMIN_USER_IDS` and/or `ADMIN_EMAILS` must be configured in the server
  environment
- `SUPABASE_SERVICE_ROLE_KEY` must be configured server-side
- this is a private-MVP admin model, not long-term staff role management
- future write-capable admin workflows need separate action helpers, audit
  trail design, and regression coverage

## Future Migration Path

If private-MVP allowlists stop being enough, migrate in this order:

1. add a DB-backed admin role table or Supabase custom claims model
2. define role-management ownership outside normal parent flows
3. add explicit admin RLS policies only after the identity model is durable
4. move any browser-client admin reads behind those policies
5. preserve service-role usage only for server-only operations that truly need
   RLS bypass

Until that migration is complete, server-side allowlists plus server-only
service-role reads are the only approved admin/internal access model.
