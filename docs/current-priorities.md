# Current Priorities — Scarlett’s Spells

## Current initiative

- Stage `7` private MVP release safety, documentation truth, and bounded
  post-Stage-`7` parent-facing evidence transparency

## Current stage

- Stage `7` Review Work integration is implemented through:
  - `7A` Add Writing Sample intake and Review Work handoff
  - `7B` unified Review Work queue visibility
  - `7C` Review Work detail suggested-issues visibility
  - `7D` parent verification actions in Review Work
  - `7E` queue/archive/status coherence
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

- next safe implementation pass should be documentation-first and narrowly
  bounded:
  - assess whether the existing evidence model is mature enough for any future
    parent-facing mastery claims
  - prefer evidence-maturity and evidence-capture readiness work before any
    automatic mastery semantics
- no runtime Stage `8` automatic mastery implementation should begin until:
  - the release slice is isolated and intentionally shipped
  - parent-facing evidence maturity is documented honestly
  - the mastery/evidence boundary is rechecked against the live product copy

## Blockers / open risks

- the roadmap must stay the single active implementation plan for this program
- historical planning docs must remain clearly marked as historical, not active
- production release must not blindly push the current dirty `main` worktree
- parent-facing dashboard and insights surfaces must remain advisory rather
  than implying automatic mastery certainty
- new writing-engine work must not reintroduce route-local domain logic, revive
  the retired spelling runtime, or bypass canonical Review Work truth
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
