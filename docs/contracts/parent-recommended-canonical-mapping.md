# Parent Recommended Canonical Mapping Contract

## Purpose

This contract defines the bounded Parent Recommended Canonical Mapping
workflow for spelling review.

It exists to preserve the distinction between:
- a parent local review decision
- parent-local candidate mapping evidence
- `No matching skill` admin/catalog-review cases
- admin canonical mapping curation
- resolver-visible global truth

This is a planning and contract document. It does not authorize PCRM canonical
adoption, `micro_skill_catalog` mutation, mastery changes, rewards,
assignments, scoring, analytics, dashboards, or broad Review Work runtime
changes.

Use alongside:
- [docs/workflows/parent-review-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/parent-review-workflow.md:1)
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
- [docs/operations/supabase-migration-policy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/operations/supabase-migration-policy.md:1)

## Current Model

Parent local review decisions answer whether one reviewed child occurrence is a
real issue, false positive, checking-only issue, or learning gap. They are
scoped to the parent, child, submission, and evidence row. They do not create
global canonical mapping truth.

Parent-local candidate mappings are scoped reusable evidence. A parent may
capture or promote an observed misspelling/correction pair against an existing
catalog-backed `micro_skill_key`, but promotion is reusable only in the same
parent/child scope. Pending candidate mappings remain invisible to the
resolver. Parent-local promotion is the highest parent authority in the private
MVP.

`No matching skill` means the parent could not find a suitable existing
catalog-backed skill. That route creates or updates an admin/catalog-review
case and must not be overloaded to mean "please globalize my selected skill."

Admin canonical mapping curation is an internal/admin workflow. It may compare
recommendations or catalog-review cases against existing canonical mappings and
may later accept, reject, merge, mark duplicate, or supersede evidence.
PCRM-D plain `accepted` means "admin agrees this recommendation evidence is
valid"; it does not create, link, or expose resolver-visible canonical truth.
Current canonical mapping storage exists in `spelling_canonical_mappings` and
`spelling_canonical_mapping_events`, but current canonical mapping creation
records resolver non-effect through `resolver_visible: false`.

Resolver-visible global truth remains separate. Parent recommendations,
pending admin review rows, open catalog-review cases, and canonical mappings
with resolver visibility disabled must not change global suggestions. R3
resolver runtime adoption is now production-enabled behind
`WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled` for mappings that
have been explicitly enabled for resolver visibility. That runtime path does
not consume PCRM recommendation rows directly. PCRM canonical adoption into
`spelling_canonical_mappings` remains a separate explicit admin workflow before
any resolver visibility decision.

Historical R0/R1/R2/R3 resolver integration contract status:
- R0 documented the future resolver-visible contract only
- R1 added first-class resolver visibility storage and the exact-pair read
  helper
- R2 added audited admin resolver visibility controls
- R3 wired resolver-visible exact-pair mappings into runtime priority behind
  the feature flag; production now has the flag enabled and one imported,
  explicitly visible canonical mapping has been runtime-smoked in learner
  submitted work
- metadata-only `resolver_visible` remains historical/non-effect metadata and
  is not sufficient as production resolver-visible authority

## Parent Workflow

1. Parent reviews a spelling row in `Review Work`.
2. Parent confirms or overrides the row to an existing active, assignable
   spelling `micro_skill_key` from `micro_skill_catalog`.
3. Parent resolves the local review obligation through the existing supported
   local route, for example parent-local promotion or final classification.
4. Parent may optionally choose `Recommend this pairing for review`.
5. The app sends the observed spelling, expected correction, selected
   `micro_skill_key`, and source provenance as recommendation evidence for
   admin consideration.
6. The recommendation does not change global suggestions immediately.
7. Admin may later accept, reject, merge, mark duplicate, or supersede the
   recommendation.
8. A future admin action may explicitly accept and adopt an eligible
   recommendation as canonical mapping truth.
9. PCRM canonical adoption remains a separate future slice into the already
   implemented resolver-visible mapping path.

Suggested helper copy:

```text
This sends the pairing for review. It will not change global suggestions unless approved later.
```

The recommendation state is parallel evidence. It must not replace
`parent_local_promoted`, reopen a locally resolved row, or block completion
after the local review obligation is resolved.

## Eligibility Rules

The recommendation action may be shown only when all of these are true:
- the parent has scoped authority for the child and submission/evidence row
- the row has safe source/provenance lineage
- the row has an existing active, assignable catalog-backed `micro_skill_key`
- the row's observed spelling and expected correction can be normalized to a
  non-empty pair where the values differ
- the row is not already pending, accepted, rejected, merged, duplicate, or
  superseded in the recommendation flow, unless a later resubmission contract
  explicitly defines re-recommendation behavior

Eligible row families:
- engine-suggested rows with safe lineage
- parent-added missed words with safe lineage
- returned corrections with a safe bridge to the original issue, correction
  attempt, source misspelling, parent, child, and submission thread
- rows linked to parent-local candidate mappings where the selected
  `micro_skill_key` is catalog-backed and scoped to the same parent/child

The action must not be shown for:
- `No matching skill` rows or unknown/no-suitable-skill rows
- unsupported returned rows without safe lineage
- rows without scoped parent authority
- rows with free-text, invented, inactive, non-assignable, non-`D4`, or missing
  `micro_skill_key`
- rows already in a recommendation flow, unless a later resubmission policy
  explicitly allows another recommendation
- rows where creating a recommendation would require broad resolver,
  assignment, mastery, reward, analytics, dashboard, or catalog mutation work

## Authority Boundary

Parents may recommend only from their scoped child/submission evidence. The
server must derive or validate scope from trusted source records rather than
client-provided authority.

Parents must not:
- create or edit `micro_skill_catalog`
- write `spelling_canonical_mappings` directly
- mark a recommendation accepted, rejected, merged, duplicate, or superseded
- make resolver-visible truth
- use free-text `micro_skill_key` values
- recommend rows outside their parent/child/submission authority

Admin/internal users handle curation through protected server-side admin
surfaces. Admin authority is defined by the admin/internal access contract and
must remain server-guarded and auditable.

## Data And Provenance Contract

Every recommendation must preserve:
- observed child spelling
- expected correction
- selected `micro_skill_key`
- source row type: `engine_suggested`, `parent_added_missed_word`, or
  `returned_correction`
- source provenance
- available source identifiers:
  - `task_submission_id`
  - `writing_sample_id`
  - `source_misspelling_instance_id`
  - `source_writing_issue_id`
  - `source_correction_attempt_id`
  - `parent_verification_id`
  - `source_suggestion_id`
  - `candidate_mapping_id`
- reviewed event source id where available
- parent/user id
- child/family/account scope where the schema can represent it
- recommendation status
- timestamps
- recommendation note or metadata where applicable
- audit and duplicate/conflict fields for later admin curation

Current implemented recommendation statuses are:
- `recommended`
- `pending_admin_review`
- `accepted`
- `rejected`
- `merged`
- `duplicate`
- `superseded`

PCRM-B storage/read-model foundation is implemented in
`spelling_canonical_mapping_recommendations`. Parent-created rows may only
start as `recommended` or `pending_admin_review`; they cannot include admin
curation fields. The repository inserts pending evidence only and stores
metadata with `resolver_visible: false`.

## Future Canonical Adoption Decision

Future PCRM canonical adoption should add an explicit admin decision/action
named `accept_and_adopt_canonical_mapping` or equivalent.

Decision meanings:
- `accepted`: admin agrees the PCRM evidence is valid; evidence only
- `accept_and_adopt_canonical_mapping`: admin agrees the evidence is valid and
  creates or links canonical mapping truth

Plain `accepted` must not implicitly create `spelling_canonical_mappings`, set
`canonical_mapping_id`, enable resolver visibility, or change resolver output.
The adoption action may occur from an already-`accepted` recommendation or as a
single explicit "accept and adopt" review action, but it must be distinguishable
in audit metadata and admin copy.

Future canonical adoption should create or link a
`spelling_canonical_mappings` row. The source PCRM recommendation should write
`canonical_mapping_id` only after the canonical adoption/link succeeds.
Resolver visibility may be enabled only through explicit audited admin
authority; an adopted mapping can still remain resolver-invisible until a
separate visibility step is chosen and the runtime feature flag is enabled.

## Exact Pair And Micro-Skill Model

Canonical resolver mapping is exact-pair based:

```text
misspelling_normalized -> correct_spelling_normalized -> micro_skill_key
```

The correct word is a shared target anchor, not the sole resolver routing key.
Multiple misspellings of the same correct word may legitimately map to
different spelling micro-skills when they represent different diagnostic
errors.

Example:

```text
taik -> take -> one long-vowel/grapheme-choice micro-skill
tak  -> take -> a different final-e or split-digraph micro-skill
```

Those rows must not be collapsed into one word-level bucket if their diagnostic
teaching targets differ. A misspelling instance is evidence for the exact
mapping and selected micro-skill, but it does not by itself update child
mastery, competency, rewards, assignments, or learning-item state. Child
mastery evidence remains governed by the reviewed issue and learning-item
contracts.

## Canonical Adoption Eligibility

A PCRM recommendation is eligible for canonical adoption only when all of these
are true:
- recommendation evidence is already `accepted` or is being accepted in the
  same explicit admin adoption action
- the selected `micro_skill_key` exists in `micro_skill_catalog` and is active,
  assignable, and `D4`
- scoped parent/child/source provenance is safe and present
- `misspelling_normalized` and `correct_spelling_normalized` are non-empty and
  different
- the recommendation does not rely on `No matching skill` semantics
- duplicate, merged, or superseded evidence resolves through its target
  recommendation or target canonical mapping

Recommendations with status `recommended`, `pending_admin_review`, `rejected`,
`duplicate`, `merged`, or `superseded` are not independently adoptable. `No
matching skill` evidence remains in the separate catalog-review canonical
curation lane.

## Conflict And Priority Rules

Future resolver-visible canonical mapping contract:
- a canonical mapping may affect resolver output only when all of these are
  true:
  - `mapping_status = 'active'`
  - a future first-class visibility field/status says the mapping is
    resolver-visible
  - the resolver request matches the exact normalized triple
    `misspelling_normalized -> correct_spelling_normalized -> micro_skill_key`
  - dialect and normalization version match the resolver request defaults
  - the linked `micro_skill_key` is still present, active, assignable, and
    `D4`
  - a resolver-visibility enable event exists in the canonical mapping audit
    history
- canonical mappings remain resolver-invisible until individually adopted or
  enabled through an explicit audited admin action
- accepted PCRM recommendations remain evidence-only until a separate explicit
  admin adoption action creates or links canonical mapping truth and enables
  resolver visibility

Conflict handling for future adoption:
- same misspelling/correction/dialect and same `micro_skill_key`: link to the
  existing canonical mapping and audit the PCRM source link
- same misspelling/correction/dialect but different `micro_skill_key`: block
  adoption and require explicit admin conflict resolution
- same correct spelling with different misspelling: allow separate canonical
  mappings when the diagnostic teaching targets differ
- same misspelling with different correction: treat as a conflict requiring
  admin review
- existing non-visible mappings must not silently become resolver-visible
- inactive, non-assignable, missing, or non-`D4` micro-skills must block
  resolver visibility and resolver use
- disabled, deprecated, superseded, or replaced mappings must block resolver
  use
- missing provenance or missing resolver-visibility audit history must block
  resolver visibility
- closed catalog-review cases without canonical mappings, open catalog-review
  cases, parent notes, parent-local mappings, and PCRM accepted evidence alone
  must not be used as global resolver truth

Future resolver priority should be:
1. active resolver-visible canonical exact-pair mapping
2. existing catalog-backed resolver behavior
3. scoped parent-local promoted mapping, where supported
4. engine/manual diagnostic suggestions
5. unresolved or admin-review evidence only

PCRM evidence rows, open catalog-review cases, and non-adopted
recommendations must never affect resolver output.

## Audit, Rollback, And Observability

Canonical adoption and resolver visibility changes require
`spelling_canonical_mapping_events` audit entries. Audit should include admin
identity, timestamp, note or reason, source recommendation id, mapping id,
previous/new status where applicable, and previous/new resolver visibility
where applicable.

Rollback should disable resolver visibility or disable/deprecate/supersede the
mapping through an audited admin-only action. Rollback must not delete PCRM
evidence, source spelling instances, or canonical mapping event history.

Future observability should track:
- accepted recommendations not yet adopted
- adoption count
- adoption conflict count
- resolver-visible mapping count
- resolver hits by mapping
- rollback, disable, deprecate, and supersede events

## No Matching Skill Relationship

`No matching skill` and Parent Recommended Canonical Mapping are separate
routes.

`No matching skill` means the parent did not find a suitable existing
catalog-backed micro-skill. It routes the evidence to admin/catalog gap review.

Parent Recommended Canonical Mapping means the parent selected an existing
active, assignable skill locally and recommends that observed
word/correction/skill pairing for global canonical consideration.

Do not overload `No matching skill` semantics, statuses, or admin copy to
represent a parent recommendation for an already-selected skill.

## Admin Curation Contract

Admin curation should eventually allow an authorized admin to:
- view the recommendation with source evidence and context
- compare it to existing canonical mappings and related recommendations
- accept the recommendation
- explicitly accept and adopt an eligible recommendation as canonical mapping
  truth
- reject the recommendation
- merge it into another recommendation or canonical mapping
- mark it duplicate
- supersede it
- record an audit decision with admin identity, timestamp, note, and metadata

Plain admin acceptance remains evidence-only. If a future explicit adoption
action creates or links canonical mapping storage before resolver integration,
the resulting canonical mapping must remain non-resolver-visible unless the
same audited admin action is explicitly authorized to set resolver visibility.
Current canonical mapping creation already records `resolver_visible: false` in
metadata.

Admin curation must not create or mutate `micro_skill_catalog` unless a
separate micro-skill curation slice explicitly authorizes that behavior.

## PCRM Adoption Out Of Scope For This Contract

This contract authorizes no PCRM adoption implementation changes.

Specifically:
- no resolver priority changes
- no resolver reads from `spelling_canonical_mapping_recommendations`
- no resolver consumption of recommended, pending, accepted, rejected, merged,
  duplicate, or superseded recommendation rows
- no automatic global suggestions from parent recommendations or plain
  `accepted` PCRM evidence
- no resolver-visible mapping from PCRM evidence until separate canonical
  adoption and resolver-visibility steps
- open catalog-review cases and pending recommendation rows remain invisible to
  resolver behavior

## Implementation Slices

PCRM-A - Docs and contract only:
- this contract and source-of-truth doc updates
- no runtime changes

PCRM-B - Recommendation evidence model/read path:
- implemented storage/read-model foundation in
  `spelling_canonical_mapping_recommendations`
- no parent UI, admin curation UI, resolver change, completion-gating change,
  or canonical mapping write from parent recommendation capture

PCRM-C - Parent recommendation action/UI:
- implemented as parent-facing action/UI for promoted parent-local candidate
  mappings
- optional action after known-skill local classification and parent-local
  promotion
- only from safe scoped rows with `candidateMappingId`,
  `categorisationStatus === "parent_local_promoted"`, and no open PCRM
  recommendation
- writes recommendation evidence only to
  `spelling_canonical_mapping_recommendations`
- shows saved recommendation state without changing local completion truth
- does not mutate `parent_verified_spelling_candidate_mappings`, write
  `spelling_canonical_mappings`, write `micro_skill_catalog`, change resolver
  behavior, or reuse `No matching skill`

PCRM-D - Admin recommendation review/curation:
- status: implemented, validated, committed, and pushed as PCRM-D
- admin can accept, reject, mark duplicate, merge, or supersede
  recommendation evidence
- curation updates only `spelling_canonical_mapping_recommendations`
  status/audit metadata
- curation does not create or link `spelling_canonical_mappings`
- curation does not mutate `micro_skill_catalog`,
  `parent_verified_spelling_candidate_mappings`, resolver inputs, or
  resolver-visible truth
- `No matching skill` catalog-review cases remain separate from PCRM
- browser smoke used Option A for closeout: focused regressions and build
  passed, but no naturally generated pending recommendation row was available
  for real pending-row browser smoke
- `scripts/dev-pcrm-recommendation-fixture.ts` is local/staging/manual smoke
  support only, not production seed data; it requires
  `ALLOW_DEV_PCRM_FIXTURE=true` and `SUPABASE_SERVICE_ROLE_KEY`, refuses
  production-like envs/URLs, refuses non-local Supabase unless
  `ALLOW_STAGING_PCRM_FIXTURE=true`, and writes only fixture-marked rows to
  `spelling_canonical_mapping_recommendations`

PCRM-E - QA and closeout:
- focused regression tests
- documentation/status updates
- `git diff --check`

PCRM-F - Canonical Adoption and Resolver Visibility Planning:
- status: implemented docs-only/source-only slice
- defines explicit `accept_and_adopt_canonical_mapping` behavior, resolver
  visibility separation, priority, conflict handling, admin/RLS authority,
  rollout, rollback, observability, and regression/browser smoke requirements
- creates
  `docs/implementation/pcrm-canonical-adoption-and-resolver-visibility-plan.md`
- no runtime code, migrations, hosted SQL, Supabase mutation, admin action
  changes, parent Review Work changes, resolver behavior changes, feature flag
  enablement, `micro_skill_catalog` mutation, mastery, rewards, assignments,
  scoring, analytics, dashboards, or templates

PCRM-G - Accepted PCRM Canonical Adoption, No Resolver Visibility:
- status: implemented in source as an admin-only, DB-changing slice
- release-safety review found that existing canonical mapping RPCs did not
  support first-class PCRM adoption lineage atomically, so source adds the
  unique timestamp migration/RPC
  `supabase/migrations/20260612103000_add_pcrm_canonical_adoption_rpc.sql`
- eligible accepted and unlinked PCRM recommendation evidence can be adopted
  through `/admin/canonical-recommendations`
- adoption creates or links canonical mapping truth and sets
  `canonical_mapping_id` only after adoption succeeds
- compatible existing mappings link safely; conflicting mappings block
  adoption
- adoption writes canonical mapping audit lineage for source recommendation,
  candidate mapping, parent verification/source ids where available, normalized
  pair, micro-skill key, dialect, normalization version, admin identity, note,
  and timestamps
- resolver visibility remains disabled by PCRM adoption; no resolver visibility
  RPC is called during PCRM adoption. Runtime resolver-visible consumption may
  be enabled globally through
  `WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled`, but only
  mappings with first-class resolver visibility enabled are consumed.
- no parent Review Work, completion gating, `micro_skill_catalog`, mastery,
  rewards, assignments, scoring, analytics, dashboards, or templates are
  changed

Historical resolver-visible integration:
- R1 is complete, validated, and committed as
  `42791c6 feat: add resolver-visible canonical mapping foundation`; it adds
  first-class resolver visibility storage and a server-only exact-pair read
  helper only, does not add admin enable/disable actions, does not call the
  helper from resolver runtime, and keeps existing canonical mappings hidden
  by default
- R2 is complete, QA-passed, pushed, and committed as
  `dc13429 feat: add resolver visibility admin controls`; it adds explicit
  admin enable/disable actions for `resolver_visibility_status`, audited
  rollback, and conflict blocking only
- R3 is complete, QA-passed, production deployed, and runtime-enabled; it wires
  resolver-visible exact-pair mappings into runtime priority behind
  `WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled`
- future PCRM work should be described as canonical adoption into the already
  implemented resolver-visible mapping path, not generic resolver integration
- any DB-changing resolver stage must use a unique timestamp migration, must
  not replay archived `20260522_*` migrations, must pass an explicit
  production migration-ledger check, and must follow
  [docs/operations/supabase-migration-policy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/operations/supabase-migration-policy.md:1)

## Stop Conditions

Stop before implementation if:
- parent-local mapping and global canonical mapping are conflated
- current canonical mapping model is unclear
- resolver currently consumes draft/admin/recommended data directly
- resolver visibility cannot be modeled as first-class, explicit, audited,
  reversible, and exact-pair based
- no safe provenance exists for eligible rows
- implementation would require broad resolver changes
- implementation would use metadata-only `resolver_visible` as production
  resolver authority
- docs or implementation imply plain PCRM `accepted` automatically becomes
  resolver truth
- docs or implementation imply existing canonical mappings become
  resolver-visible by default
- docs or implementation collapse all misspellings of the same correct word
  into one micro-skill
- docs or implementation blur `No matching skill`, parent-local promotion,
  PCRM evidence, canonical mapping storage, resolver-visible truth, or child
  mastery evidence
- implementation would let parents create or edit `micro_skill_catalog`
- admin curation model is not ready
- duplicate/conflict handling is undefined for the proposed runtime behavior
- recommendations cannot be audited
- docs contradict runtime
- completion gating would depend on recommendation/admin-review status rather
  than local review resolution

## Future Validation Requirements

Future implementation should require:
- `npm run writing-engine:pcrm-recommendation-evidence-regression`
- `npm run writing-engine:pcrm-admin-recommendation-curation-regression`
- `npm run writing-engine:canonical-mapping-storage-regression`
- `npm run writing-engine:admin-canonical-curation-regression`
- `npm run writing-engine:primary-mapping-regression`
- `npm run writing-engine:mapping-source-regression`
- `npm run writing-engine:parent-local-promotion-regression`
- `npx tsx scripts/writing-engine-unified-spelling-review-items-regression.ts`
- `npx tsc --noEmit`
- `npm run build`

Future browser smoke should verify admin accept/adopt behavior, conflict
blocking, mapping audit, resolver visibility enable/rollback, and unchanged
parent Review Work completion behavior.

## Clarification (2026-07-04 reformed pedagogy)

Canonical mappings feed the global resolver only. They never create or gate
child `learning_items`. Learning items are created from reviewed writing
issues (targeted-writing-practice contract) or from diagnostic probe misses
(daily-assignment blueprint contract). A word can hold a canonical mapping
without ever being assigned to a child, and a child can hold a learning_item
for a word with no canonical mapping (routed to this contract's candidate
queue for later adoption).
