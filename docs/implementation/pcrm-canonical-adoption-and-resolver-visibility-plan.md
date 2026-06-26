# PCRM Canonical Adoption and Resolver Visibility Planning

## Purpose

This document defines `PCRM-F: Canonical Adoption and Resolver Visibility
Planning`.

This is a docs-only/source-only planning slice. It does not authorize runtime
code, migrations, hosted SQL, Supabase mutation, admin action changes, parent
Review Work changes, resolver behavior changes, feature flag enablement,
mastery changes, rewards, assignments, scoring, analytics, dashboards,
templates, or `micro_skill_catalog` mutation.

The product goal is a safe adoption path from accepted Parent Recommended
Canonical Mapping evidence into audited canonical mapping truth, and then into
explicit resolver-visible mapping truth only where appropriate.

## Current State

R3 resolver runtime adoption already exists as code-only, feature-flag gated
source work. Runtime use requires:

```text
WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled
```

When the feature flag is enabled,
`app/courses/review/resolver-visible-priority.ts` checks active
resolver-visible canonical exact-pair mappings before catalog canonical and
parent-local promoted mappings. Blocked resolver-visible states do not fall
through to lower-priority sources.

The resolver-visible canonical mapping read path in
`lib/writing-engine/persistence/spelling-canonical-mappings.ts` requires:

- an active `spelling_canonical_mappings` row
- `resolver_visibility_status = "visible"`
- a `resolver_visibility_enabled` audit event in
  `spelling_canonical_mapping_events`
- no visible same-misspelling/different-correction conflict
- no visible same-exact-pair/different-micro-skill conflict
- an active, assignable, D4 `micro_skill_catalog` target

PCRM-D remains evidence-only. The current `/admin/canonical-recommendations`
action updates only `spelling_canonical_mapping_recommendations` status and
admin review metadata. Plain `accepted`:

- does not create `spelling_canonical_mappings`
- does not link `canonical_mapping_id`
- does not enable resolver visibility
- does not change resolver output

Existing reusable pieces:

- canonical mapping creation helper/RPC:
  `createSpellingCanonicalMappingAdmin` /
  `create_spelling_canonical_mapping_admin`
- resolver visibility helper/RPC:
  `enableResolverVisibilityForCanonicalMappingAdmin`,
  `disableResolverVisibilityForCanonicalMappingAdmin`, and
  `set_spelling_canonical_mapping_resolver_visibility_admin`
- admin resolver visibility UI at `/admin/canonical-mappings`
- catalog-review canonical creation precedent at `/admin/catalog-review`,
  where `add_canonical_mapping` creates canonical storage but keeps resolver
  visibility separate

## Authority Model

Parent local review decision:
- resolves one reviewed child occurrence inside the parent/child/submission
  scope
- does not create global canonical mapping truth
- does not create resolver-visible truth

Parent-local promoted candidate mapping:
- may make a spelling pair reusable only in the same parent/child scope
- remains below resolver-visible canonical mappings in runtime priority
- must not write `spelling_canonical_mappings`

PCRM recommendation evidence:
- records that a parent recommends a known spelling pair and existing
  catalog-backed micro-skill for admin consideration
- remains evidence, not canonical truth
- must preserve safe source lineage

PCRM-D admin accepted evidence:
- means the admin agrees the recommendation evidence is valid
- remains resolver-invisible
- does not create or link canonical mapping truth

Canonical mapping truth:
- lives in `spelling_canonical_mappings`
- must be created or linked only by audited admin adoption
- may remain resolver-invisible after adoption

Resolver-visible canonical mapping truth:
- is canonical mapping truth with explicit resolver visibility enabled
- requires an audit event
- may be consumed by the resolver only when the runtime feature flag is enabled

Runtime resolver consumption:
- is already implemented in R3
- is globally rollbackable by unsetting the feature flag
- is mapping-level rollbackable by disabling resolver visibility on the
  mapping

## Proposed Admin Workflow

The admin workflow should remain a three-step authority ladder:

1. `Accept evidence only`
2. `Adopt as canonical mapping`
3. `Enable resolver visibility`

Accepted PCRM recommendation evidence should appear as eligible for canonical
adoption only after it passes validation. An admin may choose an explicit
`accept_and_adopt_canonical_mapping` action, or an equivalent two-step action
from an already accepted row.

Adoption must either:

- create a new canonical mapping, or
- link the recommendation to an existing compatible canonical mapping

The recommendation row should receive `canonical_mapping_id` only after the
canonical mapping create/link succeeds. Adoption must write canonical mapping
audit metadata or an event that preserves PCRM source lineage.

Resolver visibility remains disabled by default after adoption. Admins may
later use explicit resolver visibility controls, currently represented by
`/admin/canonical-mappings`, if the mapping is safe.

PCRM `accepted` alone must never enable resolver visibility.

## Adoption Eligibility Rules

A PCRM recommendation is eligible for canonical adoption only when all of
these are true:

- recommendation evidence is already `accepted` or is being accepted in the
  same explicit adoption action
- status is not `rejected`, `duplicate`, `merged`, `superseded`, or pending,
  unless the workflow follows its target row
- `misspelling_normalized` and `correct_spelling_normalized` are non-empty and
  different
- selected `micro_skill_key` exists in `micro_skill_catalog`
- selected `micro_skill_key` is active, assignable, and D4
- source provenance is safe enough to audit
- no parent free-text taxonomy value is used
- no mapping is adopted without an existing canonical micro-skill

Compatible existing mapping behavior:

- same exact pair, dialect, normalization version, and same micro-skill may
  link to an existing mapping
- same exact pair, dialect, normalization version, and different micro-skill is
  a conflict
- same misspelling with different correction is a conflict
- same correction with different misspelling may be a separate mapping when
  the diagnostic teaching target differs

## Conflict Handling

Duplicate compatible mapping:
- link to the existing mapping through an audited adoption/link action
- preserve the source recommendation id

Conflicting existing canonical mapping:
- block adoption
- show admin-safe conflict copy
- do not write `canonical_mapping_id`

Superseded PCRM evidence:
- do not adopt independently
- follow the superseding target row

Merged PCRM evidence:
- do not adopt independently
- follow the merge target row or linked canonical mapping

Missing or inactive micro-skill:
- block adoption and resolver visibility

Non-D4 micro-skill:
- block adoption and resolver visibility

Missing source lineage:
- block adoption until lineage is clarified

Mapping already visible:
- do not create duplicate visibility authority
- record any PCRM link separately from visibility state

Mapping disabled, deprecated, or superseded:
- block resolver use
- require an explicit admin decision before any new active mapping is created
  or linked

Hosted schema or ledger uncertainty:
- stop DB-changing work until release-safety review confirms the deployment
  method

## Resolver Visibility Enablement

Adoption creates or links canonical mapping truth.

Visibility enablement allows the resolver to consume that canonical mapping.

Visibility enablement must:

- be explicit
- be admin-only
- require an admin note
- write a resolver visibility audit event
- validate conflicts
- validate active assignable D4 micro-skill state

Runtime consumption still requires:

```text
WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled
```

Rollback:

- global rollback: unset or disable the feature flag
- mapping rollback: disable resolver visibility on the mapping through the
  audited admin path

PCRM `accepted` alone must never enable resolver visibility.

## Rollback And Audit Requirements

Do not delete PCRM evidence.

Do not delete canonical mapping events.

Disable, deprecate, or supersede mappings instead of destructive deletion.

Every adoption, link, visibility enablement, visibility disablement,
deprecation, or supersession must preserve audit history.

Audit should preserve where available:

- admin identity
- decision note
- source recommendation id
- source candidate mapping id
- source parent verification id
- source submission/sample/issue/suggestion/correction ids
- normalized misspelling/correction pair
- micro-skill key
- dialect
- normalization version
- previous and new mapping status
- previous and new resolver visibility status
- timestamps

## Release Safety Requirements

`PCRM-F` is docs-only/source-only. It requires no migration and no hosted
Supabase mutation.

`PCRM-G` has been implemented in source as an admin-only adoption slice. The
release-safety review found that existing canonical mapping storage/RPCs did
not provide first-class PCRM recommendation, candidate mapping, and parent
verification lineage for atomic adoption. `PCRM-G` therefore adds a new unique
timestamp source migration/RPC:

- `supabase/migrations/20260612103000_add_pcrm_canonical_adoption_rpc.sql`

Hosted-staging smoke for canonical truth population should not be blocked on
PCRM fixture data. The existing admin catalog-review `Add canonical mapping`
path has passed hosted-staging smoke against real Review Work `No matching
skill` evidence: source case `b4f67f65-574d-4465-8785-a1c2b36fb6c9`, decision
`a05adb3a-2b8e-4bd0-bff7-c8a11f7a0ddd`, canonical mapping
`893fdd29-c09c-41f6-b568-9558a4b9de48`. The resulting mapping remained
`resolver_visibility_status = hidden`, metadata `resolver_visible` remained
`false`, no `resolver_visibility_enabled` event was created, and resolver
runtime regressions passed. PCRM-G remains separately blocked for hosted
browser smoke until meaningful PCRM recommendation data exists.

Treat `PCRM-G` as DB-changing for release purposes. It must not be deployed to
hosted production until the production migration ledger and hosted schema are
checked against source expectations.

Before any DB-changing implementation:

- verify hosted schema fields and RPC signatures
- run an explicit production migration-ledger check
- use a new unique timestamp migration for schema/RPC changes
- do not replay archived duplicate-version historical migrations
- do not use SQL Editor manual patching unless a release-safety decision
  explicitly approves it
- stop if hosted schema, ledger, required tables, or required RPCs differ from
  source expectations

Feature flag enablement is not part of PCRM-F, PCRM-G, or PCRM-H. It should be
allowed only after admin/browser smoke verifies adoption, visibility audit,
resolver behavior, and rollback.

## Product And Admin Copy

Use wording that does not imply parent recommendations are global truth or that
admin evidence acceptance changes future suggestions immediately.

Recommended labels:

```text
Accept evidence only
Adopt as canonical mapping
Enable resolver visibility
```

Recommended explanatory copy:

```text
Accepted evidence is not used by future suggestions until adopted and made resolver-visible.
```

```text
Adopting this recommendation creates or links canonical mapping truth. It does not make the resolver use the mapping.
```

```text
Resolver visibility is a separate audited admin step. Runtime use still requires the resolver-visible mappings feature flag.
```

Do not imply that canonical mapping adoption updates mastery, rewards, child
progress, assignments, scoring, analytics, dashboards, or template routing.

## Later Implementation QA Checklist

Later implementation should verify:

- accepted PCRM evidence does not affect resolver output
- adoption creates or links canonical mapping truth
- adoption writes canonical mapping audit events
- recommendation `canonical_mapping_id` is written only after successful
  adoption
- adoption rolls back cleanly on canonical mapping failure
- compatible duplicate mappings link safely
- conflicts block adoption
- missing, inactive, non-assignable, or non-D4 micro-skills block adoption
- missing source lineage blocks adoption
- resolver visibility remains disabled after adoption unless explicitly enabled
- enabling visibility requires audit
- resolver consumes visible mapping only when the feature flag is enabled
- disabling the feature flag rolls back resolver behavior
- disabling mapping visibility rolls back that mapping
- parent Review Work completion gating is unchanged
- no mastery, reward, assignment, scoring, analytics, dashboard, template, or
  taxonomy behavior changes

Suggested later regression commands:

- `npm run writing-engine:pcrm-recommendation-evidence-regression`
- `npm run writing-engine:pcrm-admin-recommendation-curation-regression`
- `npm run writing-engine:canonical-mapping-storage-regression`
- `npm run writing-engine:admin-canonical-curation-regression`
- `npm run writing-engine:resolver-visible-canonical-mapping-regression`
- `npm run writing-engine:resolver-runtime-integration-regression`
- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`

## Contradictions / Historical Notes

Older docs used "future resolver integration" to describe work that is now
split into multiple completed and future pieces.

Current truth:

- R1 resolver-visible storage/read foundation is complete.
- R2 resolver visibility admin controls are complete.
- R3 resolver runtime adoption is complete as code-only, feature-flag gated
  source work.
- PCRM-F planning is complete.
- PCRM-G accepted-evidence canonical adoption is implemented in source as an
  admin-only, DB-changing slice. It creates or links canonical mapping truth,
  sets `canonical_mapping_id` only after success, writes PCRM adoption audit
  lineage, and leaves resolver visibility disabled. Follow-up source hardening
  in `20260626120000_harden_pcrm_adoption_normalization_version.sql` keeps
  existing-mapping link/conflict checks scoped by exact pair, dialect,
  normalization version, and micro-skill.

Any remaining "future resolver integration" wording should be read as
historical unless it specifically means future PCRM canonical adoption,
resolver-visibility enablement, release smoke, or feature-flag rollout.

The active next work is not generic resolver runtime implementation. It is
PCRM adoption smoke, release-safety review, and later explicit
resolver-visibility enablement.

## Stop Conditions

Stop if a proposed plan or implementation would:

- mutate hosted Supabase immediately
- make PCRM `accepted` resolver-visible
- let parent recommendations bypass admin canonical adoption
- bypass explicit resolver-visibility audit
- change parent Review Work completion gating
- change resolver runtime behavior in PCRM-F
- enable the resolver-visible mappings feature flag
- change mastery, rewards, assignments, scoring, analytics, dashboards,
  templates, or `micro_skill_catalog`
- proceed with DB-changing work while production migration-ledger or hosted
  schema uncertainty remains unresolved

## Recommended Next Slice

Exact next implementation slice:

```text
PCRM-H: PCRM Adoption Conflict and Existing Mapping Link Hardening
```

Slice type:

```text
Source/admin hardening plus browser/admin smoke. Treat as DB-changing only if review finds schema/RPC gaps beyond the PCRM-G migration.
```

PCRM-H should verify the PCRM-G adoption path against realistic admin/browser
flows and harden conflict/link messaging if needed. It must continue to leave
resolver visibility disabled unless a later explicit visibility gate is chosen.
