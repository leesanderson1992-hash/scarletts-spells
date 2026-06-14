# Current Priorities — Scarlett’s Spells

## Current Private MVP Scope

The current launch MVP is private, parent-led use for one child. The parent can
use `Review Work` as the canonical review surface for structured lesson/test
submissions and manual writing-sample handoff, inspect durable submitted
payloads, approve or return work, let the child retry returned work, review
safe returned-correction continuity, add missed spellings, and rely on
dashboard/progress language as advisory rather than automatic mastery truth.

This scope is implemented and QA-supported by the focused Review Work,
returned-child correction, Stage `7F`, structured submission payload, parent
candidate-capture, parent-local promotion, PCRM evidence-boundary, typecheck,
and production-build checks.

MVP readiness status is `Ready with caveats`: the product is suitable for
controlled private parent-led use, not broad public release. Browser smoke
confirmed parent login/session, dashboard, advisory progress wording, Review
Work queue/detail, a sent-back structured lesson submission, unified spelling
review, parent-added missed words, disabled approval while unresolved, and
send-back controls. The smoke did not mutate data and did not directly cover
child retry in-browser because browser control became flaky; the focused
returned-child correction regression covers that path.

Release-boundary caveat: do not push blindly. The private MVP closeout commit
must include only the current priorities update, the parent-verified candidate
capture regression harness maintenance, and the approved deletion of
`docs/D4 Seeding Map Finale Final.xlsx`; local Supabase temp artifacts remain
excluded.

## Explicitly Not In MVP

- resolver-visible canonical mappings
- automatic mastery / Stage `8`
- reward-system expansion
- word-map runtime assignment routing
- broad AI diagnosis
- hosted backfill
- new writing domains

## Next Safe Slice After Launch

1. Real-data PCRM/canonical adoption smoke after launch readiness, without
   fixture data as product proof.
2. Manual/operator review of the two canonical-lineage-protected pre-June
   structured warning submissions and the remaining post-cleanup
   duplicate/pending warning row, if further cleanup is still desired.

## Current initiative

- The bounded Parent Review spelling workflow MVP loop is complete and
  QA-passed for private parent-led use.
- Version 2.0 roadmap registration is now the active docs-first planning
  direction: use
  [docs/implementation/version-2-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/version-2-roadmap.md:1)
  to plan daily assignment practice and accelerated spelling-engine
  population without weakening truth boundaries.
- Version 2.0 Slice `4` bulk candidate mapping import/review is now planned
  in
  [docs/implementation/version-2-slice-4-bulk-candidate-mapping-import-review-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/version-2-slice-4-bulk-candidate-mapping-import-review-plan.md:1).
  `Slice 4A.1` is implemented as a pure CSV parser and file-only validator.
  First implementation did not add migrations, write Supabase rows, create
  canonical mappings, expose resolver-visible truth, mutate
  `micro_skill_catalog`, or change Review Work, assignments, mastery, rewards,
  analytics, dashboards, scoring, or templates.
- Review Work now supports engine suggestions, parent-added missed words,
  send-back, child retry, returned correction continuity, returned correction
  categorisation/admin/parent-local routing where safe, compact unified spelling
  table presentation, completion gating, historical terminal verification
  ownership, and `checking_only` terminal handling.
- The next active Slice `4` work is `Slice 4A.2`: optional read-only
  `micro_skill_catalog` and canonical mapping comparison for the dry-run
  planner. Do not restart Parent Review spelling work unless a fresh bug is
  found.

## Current stage

- Stage `7` Review Work integration is implemented through:
  - `7A` Add Writing Sample intake and Review Work handoff
  - `7B` unified Review Work queue visibility
  - `7C` Review Work detail suggested-issues visibility
  - `7D` parent verification actions in Review Work
  - `7E` queue/archive/status coherence
  - `7F` parent review action restoration and bounded spelling-loop closeout
- `Parent-Verified Spelling Candidate Capture` Slice `3` is implemented and
  validated:
  - parent-local promotion can make pending candidate mappings reusable only
    inside the same parent/child scope
  - no parent action creates global canonical mapping truth
- current active work has moved through Slice `4A`, `4B.0`, `4B.1`, and the
  admin/internal access foundation prerequisite for Slice `4C`:
  - define parent-facing `No matching skill`
  - define `Send this spelling case to catalog review.`
  - define future `spelling_catalog_review_cases`
  - define bounded family/cluster filtering as Slice `4B.0`
  - define parent case capture as Slice `4B.1`
  - define minimal admin review as Slice `4C`
  - implement the private-MVP admin/internal access foundation defined in
    [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
  - define admin decisions and canonical promotion as Slice `4D`
  - keep migrations, runtime code, Review Work UI, tests, package files,
    resolver behavior, mastery, rewards, assignments, scoring, analytics,
    template routing, and manual writing sample scope unchanged
- the bounded post-Stage-`7` parent-facing evidence-transparency slice is now
  implemented:
  - dashboard and insights wording is advisory where evidence is still immature
  - Review Work remains the canonical parent review surface
- Durable Structured Submission Payloads is closed for the bounded Pass
  `1`-`4` track:
  - storage foundation, submit persistence, child revisit hydration, approval
    draft-deletion safety, and returned-child legacy recovery are implemented
    and QA-passed
  - approval does not delete the only structured answer source for vulnerable
    legacy lesson/test submissions
  - returned structured work remains draft-first and editable
  - follow-up correction contract is now implemented for the bounded Parent
    Review spelling loop, including returned correction visibility and
    parent-added returned spelling rows
- hosted Supabase migration infrastructure is closed for source, local,
  staging, and production ledger alignment:
  - production ledger now contains the unique baseline row
    `20260525123937/baseline_current_production_schema`
  - do not replay the baseline over an existing production schema
  - do not run old archived duplicate migrations, blind migration repair, or
    casual historical migration renames
  - local rebuild proof, staging database rebuild proof, and staging
    app/browser smoke have passed for the new unique baseline migration
  - staging app/browser smoke covered login/dashboard, structured submission
    durable payload persistence and hydration, Review Work approval/archive,
    admin catalog-review load, and a staging-only `No matching skill` promotion
    into an open catalog-review case
  - the staging catalog-review smoke used `STAGING_SMOKE_*` micro-skill seed
    data only; that seed is not part of the baseline or migration history
  - future production DB-changing releases remain gated on explicit ledger
    checks and unique timestamp migrations
  - future DB-changing work must follow
    [docs/operations/supabase-migration-policy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/operations/supabase-migration-policy.md:1)
- local QA/build state currently supports private parent-led use for one child:
  - focused Review Work regressions pass
  - PCRM boundary regression passes
  - `npx tsc --noEmit` passes
  - `npm run build` passes
  - browser smoke passed on a current Review Work record
- do not blindly push dirty local worktrees; run git-safety checks and focused
  QA for the current slice before release

## Next stage

- choose the next slice explicitly after Review Work closeout:
  - Parent Recommended Canonical Mapping is implemented through PCRM-D:
    PCRM-A docs/contract, PCRM-B evidence model/read path, PCRM-C parent
    recommendation action/UI, and PCRM-D admin recommendation review/curation
    are complete and validated
  - PCRM-D updates only `spelling_canonical_mapping_recommendations`
    status/audit metadata; it does not create or link
    `spelling_canonical_mappings`, mutate `micro_skill_catalog`, mutate
    parent-local candidate mappings, merge `No matching skill` with PCRM, or
    change completion gating, mastery, rewards, assignments, analytics,
    dashboards, scoring, or resolver behavior
  - PCRM-D browser smoke used Option A: focused regressions and build passed,
    but no naturally generated pending recommendation row was available for
    real pending-row browser smoke
  - `scripts/dev-pcrm-recommendation-fixture.ts` is local/staging/manual smoke
    support only, not production seed data
  - R3 resolver runtime adoption already exists as code-only source work behind
    `WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled`; the next
    active resolver/canonical planning work is PCRM canonical adoption into
    the already implemented resolver-visible mapping path, not generic
    resolver runtime implementation
  - PCRM-G accepted-evidence canonical adoption is implemented in source as an
    admin-only, DB-changing slice with a new unique timestamp migration/RPC;
    it creates or links canonical mapping truth, sets recommendation
    `canonical_mapping_id` only after adoption succeeds, writes PCRM adoption
    audit lineage, and leaves resolver visibility disabled
  - existing admin catalog-review `Add canonical mapping` is now the
    smoke-proven path for canonical truth population from real Review Work
    `No matching skill` evidence: hosted-staging smoke created canonical
    mapping `893fdd29-c09c-41f6-b568-9558a4b9de48` from source case
    `b4f67f65-574d-4465-8785-a1c2b36fb6c9` and decision
    `a05adb3a-2b8e-4bd0-bff7-c8a11f7a0ddd`; `resolver_visibility_status`
    remained `hidden`, metadata `resolver_visible` remained `false`, no
    `resolver_visibility_enabled` event was created, and resolver runtime
    regressions passed
  - PCRM-G remains separately blocked for hosted browser smoke by lack of
    meaningful PCRM recommendation data; do not use PCRM fixture data as the
    product proof while catalog-review already proves real Review Work
    canonical truth creation
  - unsupported returned rows without safe lineage remain blocked/deferred until
    a future provenance-expansion slice
  - parent adding a missed word after work is already returned still uses the
    resend lifecycle unless a future docs-first slice plans a safe shortcut
- no runtime Stage `8` automatic mastery implementation should begin until the
  mastery/evidence boundary is rechecked against the live product copy
- for Durable Structured Submission Payloads, the next safe work is a
  manual/operator review of the known remaining non-critical warning rows if
  further historical cleanup is desired; do not start hosted backfill,
  resolver, admin/catalog-review, catalog mutation, mastery, rewards,
  assignments, scoring, analytics, dashboards, or template-routing work from
  that closeout
- `4E.3` R3 resolver integration is implemented and QA-passed as code-only
  source work. Runtime use is gated by
  `WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS=enabled`; blocked
  resolver-visible states do not fall through; Stage `2C` / Stage `3A` pure
  helpers remain unchanged; no schema or migration changes were introduced.
  Production deployment still requires the approved release process and hosted
  schema/ledger safety check before enabling the runtime flag

## Blockers / open risks

- the roadmap must stay the single active implementation plan for this program
- historical planning docs must remain clearly marked as historical, not active
- production release must not blindly push the current dirty `main` worktree
- parent-facing dashboard and insights surfaces must remain advisory rather
  than implying automatic mastery certainty
- new writing-engine work must not reintroduce route-local domain logic, revive
  the retired spelling runtime, or bypass canonical Review Work truth
- parent-raised spelling catalog gaps must not directly create global
  canonical mappings or new micro-skills
- open/pending catalog-review cases must remain invisible to the resolver
- parent notes and reasons must remain evidence only
- Slice `4C` remains read-only internal triage only; admin decisions,
  canonical/global promotion, micro-skill creation, catalog mutation, and case
  closing/merging/superseding/reopening remain deferred to Slice `4D` or later
- hosted Supabase/auth/test-harness issues must be kept separate from genuine
  product defects in future QA passes
- hosted Supabase migration-ledger drift must be treated as a release-safety
  gate for DB-changing work; production DB deployment requires an explicit
  ledger check before applying any migration

## Active source-of-truth links

- [docs/implementation/version-2-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/version-2-roadmap.md:1)
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)
- [docs/architecture/writing-engine-foundation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-foundation.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)
- [docs/support/vercel-launch-checklist.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/support/vercel-launch-checklist.md:1)
- [docs/operations/supabase-migration-policy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/operations/supabase-migration-policy.md:1)
