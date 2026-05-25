# Current Priorities — Scarlett’s Spells

## Current initiative

- Slice `4C` readiness: private-MVP admin/internal access foundation is now
  implemented; the next safe work is the minimal protected read-only
  catalog-review triage surface

## Current stage

- Stage `7` Review Work integration is implemented through:
  - `7A` Add Writing Sample intake and Review Work handoff
  - `7B` unified Review Work queue visibility
  - `7C` Review Work detail suggested-issues visibility
  - `7D` parent verification actions in Review Work
  - `7E` queue/archive/status coherence
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
  - Stage `7` E2E bundle passes
  - `npm run build` passes
- the repo is not yet at a clean production release boundary because `main`
  contains a large dirty worktree with tracked and untracked changes beyond the
  small Stage `7` release slice

## Next stage

- after Slice `4A`, the next safe implementation path is staged:
  - Slice `4B.0`: bounded micro-skill option filtering by family/cluster using
    existing `micro_skill_catalog` metadata only
  - Slice `4B.1`: parent `No matching skill` catalog-review case capture
  - Slice `4C`: minimal protected admin/catalog-review read/triage surface,
    now unblocked at the admin access foundation level by
    [docs/architecture/admin-internal-access.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/admin-internal-access.md:1)
  - Slice `4D`: admin decisions and canonical promotion
- no runtime Stage `8` automatic mastery implementation should begin until the
  mastery/evidence boundary is rechecked against the live product copy
- for Durable Structured Submission Payloads, the next safe work is a
  read-only historical data-integrity audit and optional operator recovery
  plan; do not start hosted backfill, resolver, admin/catalog-review, catalog
  mutation, mastery, rewards, assignments, scoring, analytics, dashboards, or
  template-routing work from that closeout
- `4E.3` source work may proceed locally after the structured-payload detour,
  but production deployment is allowed only if it is code-only against already
  present hosted tables/RPCs or uses a new unique timestamp migration with an
  approved deployment process

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
