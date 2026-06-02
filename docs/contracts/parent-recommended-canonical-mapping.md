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

This is a planning and contract document. It does not authorize resolver
integration, `micro_skill_catalog` mutation, mastery changes, rewards,
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
may later accept, reject, merge, mark duplicate, or supersede evidence. Admin
acceptance may write canonical mapping storage, but current canonical mapping
storage records are created with resolver effect disabled.

Resolver-visible global truth remains separate. Parent recommendations,
pending admin review rows, open catalog-review cases, and canonical mappings
with resolver visibility disabled must not change global suggestions.

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
8. Resolver adoption remains a separate future slice.

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
- reject the recommendation
- merge it into another recommendation or canonical mapping
- mark it duplicate
- supersede it
- record an audit decision with admin identity, timestamp, note, and metadata

If admin acceptance creates or updates canonical mapping storage before resolver
integration, the resulting canonical mapping must remain non-resolver-visible.
Current canonical mapping creation already records `resolver_visible: false` in
metadata.

Admin curation must not create or mutate `micro_skill_catalog` unless a
separate micro-skill curation slice explicitly authorizes that behavior.

## Resolver Out Of Scope

This contract authorizes no resolver changes.

Specifically:
- no resolver priority changes
- no resolver reads from `spelling_canonical_mapping_recommendations`
- no resolver consumption of recommended, pending, accepted, rejected, merged,
  duplicate, or superseded recommendation rows
- no automatic global suggestions from parent recommendations
- no resolver-visible mapping until a separate resolver integration slice
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
- admin can accept, reject, merge, mark duplicate, or supersede
- audited decisions
- canonical mapping writes, if any, remain resolver-invisible until a later
  resolver slice

PCRM-E - QA and closeout:
- focused regression tests
- browser smoke for eligible and ineligible row states
- documentation/status updates
- `git diff --check`

Future PCRM Resolver Integration:
- separate slice defining resolver visibility, priority, conflict handling,
  rollout, and rollback

## Stop Conditions

Stop before implementation if:
- parent-local mapping and global canonical mapping are conflated
- current canonical mapping model is unclear
- resolver currently consumes draft/admin/recommended data directly
- no safe provenance exists for eligible rows
- implementation would require broad resolver changes
- implementation would let parents create or edit `micro_skill_catalog`
- admin curation model is not ready
- duplicate/conflict handling is undefined for the proposed runtime behavior
- recommendations cannot be audited
- docs contradict runtime
- completion gating would depend on recommendation/admin-review status rather
  than local review resolution
