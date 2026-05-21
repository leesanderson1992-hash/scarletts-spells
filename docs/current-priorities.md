# Current Priorities — Scarlett’s Spells

## Current initiative

- Slice `4A` docs-only spelling catalog-review contract after Slice `3`
  parent-local promotion

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
- current active work is Slice `4A` documentation only:
  - define parent-facing `No matching skill`
  - define `Send this spelling case to catalog review.`
  - define future `spelling_catalog_review_cases`
  - define bounded family/cluster filtering as Slice `4B.0`
  - define parent case capture as Slice `4B.1`
  - define minimal admin review as Slice `4C`
  - define admin decisions and canonical promotion as Slice `4D`
  - keep migrations, runtime code, Review Work UI, tests, package files,
    resolver behavior, mastery, rewards, assignments, scoring, analytics,
    template routing, and manual writing sample scope unchanged
- the bounded post-Stage-`7` parent-facing evidence-transparency slice is now
  implemented:
  - dashboard and insights wording is advisory where evidence is still immature
  - Review Work remains the canonical parent review surface
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
  - Slice `4C`: minimal protected admin/catalog-review read/triage surface
  - Slice `4D`: admin decisions and canonical promotion
- no runtime Stage `8` automatic mastery implementation should begin until the
  mastery/evidence boundary is rechecked against the live product copy

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
- hosted Supabase/auth/test-harness issues must be kept separate from genuine
  product defects in future QA passes

## Active source-of-truth links

- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)
- [docs/architecture/writing-engine-foundation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-foundation.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)
- [docs/support/vercel-launch-checklist.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/support/vercel-launch-checklist.md:1)
