# ADLE 7-UI Programme Roadmap

## Purpose

7-UI designs and builds the child lesson experience for every ADLE micro-skill, one curriculum category at a time.

The governing principle is:

```text
Every ADLE micro-skill is in scope.
We build category by category.
Within the active category, teaching content, lesson design, data modelling and implementation evolve together.
Shared architecture is reused, while each micro-skill still receives an intentional child experience.
```

## Current Status

Status: `7-UI-H guarded staging proof complete; atomic route 39.4% faster with durable contract verified; production database migration awaiting explicit approval`.

The 7S reflection recall-gate live/manual proof is recorded in the proof register. PR 7-UI-B added the typed activity-template registry foundation. PR 7-UI-C generated structurally reconciled D4_MOR category-v1 candidate source artifacts under `docs/implementation/seed-data/adle-7-ui/generated/d4-mor-category-v1/`. PR 7-UI-D records human approval for the D4_MOR category-v1 content/schema candidate under `docs/implementation/seed-data/adle-7-ui/review/d4-mor-human-review-pack/`. PR 7-UI-E freezes that approved candidate plus the approval record into the immutable approved source package under `data/adle/approved/d4-mor/v1/`. PR 7-UI-F adds the reusable D4_MOR primitive/view-model layer. PR 7-UI-G implements the guarded `D4_MOR_PREFIXES_UN` Word Lab, including atomic assignment persistence, private reflections, strict payload/resume validation and authenticated engineering QA recorded in `docs/implementation/qa/adle-7-ui-g-observation-ledger.md`.

The existing active D4_MOR teaching content remains general runtime truth. The approved package is consumed only by the explicit `d4-mor-un` generator for an allowlisted child; it is not generally selected by the composer, bulk imported into Supabase, or enabled for non-allowlisted children.

Current active category: `D4_MOR` morphology.

Why morphology first:

- It has an initial design pack.
- It has a retained authored workbook covering all 24 D4_MOR micro-skills.
- It has a reusable interaction model.
- It can prove the registry, payload, runtime, accessibility, fallback, and child-usability foundations.

Morphology is first, not final. All 240 current ADLE micro-skills are visible in the global control matrix.

## Programme Architecture

```text
shared ADLE runtime
-> reusable activity-template mechanics
-> category-specific learning primitives
-> micro-skill experience profile and reviewed content
```

Important seams:

```text
templateKey -> reusable renderer
category/family -> shared learning primitives
microSkillKey -> experience profile and lesson configuration
contentVersion -> reviewed teaching truth
```

A micro-skill should not normally receive its own React component or persistence path.

## Category Delivery Cycle

Each category follows this loop:

1. Audit category content and metadata.
2. Define the category lesson and interaction system.
3. Fully author one representative micro-skill.
4. Build the complete vertical lesson.
5. Validate with owner and child.
6. Refine content fields, payloads, primitives, and fallback behaviour.
7. Freeze the category v1 contract.
8. Complete and approve the remaining micro-skill content.
9. Build the rest in coherent groups.
10. Validate category completion.
11. Move to the next category.

Only one category should normally be the active implementation focus at a time.

## Category Status Index

| Family | Current status | Source of row truth |
|---|---|---|
| D4_MOR | Active foundation category; `D4_MOR_PREFIXES_UN` engineering-complete gated pilot, remaining category not activated | Global matrix + D4_MOR matrix + approved package manifest + 7-UI-G ledger |
| D4_PG | In scope, unaudited for 7-UI | Global matrix |
| D4_PAT | In scope, unaudited for 7-UI | Global matrix |
| D4_INF | In scope, unaudited for 7-UI | Global matrix |
| D4_SYL | In scope, unaudited for 7-UI | Global matrix |
| D4_HOM | In scope, unaudited for 7-UI | Global matrix |
| D4_SCHWA | In scope, unaudited for 7-UI | Global matrix |
| D4_IRRE | In scope, unaudited for 7-UI | Global matrix |

## Morphology Rollout

First vertical proof candidate: `D4_MOR_PREFIXES_UN`.

Current `D4_MOR_PREFIXES_UN` readiness:
`gated_vertical_pilot_engineering_complete_human_proof_pending`. Human
content/schema and owner approval are recorded. The guarded assignment payload,
rich child runtime, fallback, persistence and authenticated engineering proof
are complete. General activation remains blocked on genuine-child proof. The
agreed Mac Safari/Chrome accessibility matrix and bundle/lazy-loading proof are
recorded. True touch-event execution, controlled Web Vitals, native Windows,
Android, iOS and screen-reader runs are optional UI-H rollout coverage.

Near-term sequence:

1. `7-UI-D` - D4_MOR human approval pack - complete.
2. `7-UI-E` - approved D4_MOR v1 source freeze and pilot source fixture - complete.
3. `7-UI-F` - shared child-experience and morphology primitives - complete.
4. `7-UI-G` - `D4_MOR_PREFIXES_UN` vertical runtime pilot - allowlist-gated MVP mitigation recorded.
5. `7-UI-H` - pilot-only atomic completion and runtime payload contract freeze - authenticated guarded-staging proof complete at 27.0ms feedback, 2.874s completed route and a 238.4ms atomic transaction; `1 / 16 / 14 / 1 / 4 / 4 / 4` verified before and after reload. The route improvement is 39.4%, a recorded 0.6-point miss against the 40% stretch gate.

Production database migration is safe only after the UI-H working-tree diff and
full regression/build results are reviewed. That approved step may install the
service-role-only function with both runtime switches still disabled. It must
not deploy the application change, populate an allowlist, use production
learner data or broaden D4_MOR. Pilot application activation is a separate
decision after migration and smoke verification.

After proof and contract freeze, finish morphology in coherent groups:

1. Base-word skills.
2. Remaining prefix skills.
3. Suffix skills.
4. Compounds.
5. Word families.
6. Roots.

Category completion requires every production D4_MOR micro-skill to reach its intended rich experience, not just shared components existing.

## Proof Gates

Proof status is owned by:

- `docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-proof-register.csv`

Current gate status:

- `7UI-PROOF-7S-RECALL-GATE` is recorded.
- `7UI-PROOF-D4-MOR-7UI-G-ENGINEERING` and `7UI-PROOF-D4-MOR-OWNER` are recorded for the guarded `un-` vertical pilot.
- `7UI-PROOF-D4-MOR-A11Y` and `7UI-PROOF-D4-MOR-PERF` are recorded for the gated pilot.
- `7UI-PROOF-D4-MOR-CHILD` remains open before UI-G closure or contract freeze.

## Definition Of Complete

7-UI programme complete means:

- every current ADLE micro-skill is designed intentionally;
- every production micro-skill has approved teaching content;
- every production micro-skill reaches its intended rich experience;
- fallbacks remain safe for runtime failures and old assignments;
- accessibility, responsive mobile layout, automated reduced-motion behaviour, bundle performance, owner, child, live-flow, and evidence-regression proofs are recorded; physical touch, controlled Web Vitals, operating-system reduced-motion execution and browser 200% zoom are optional follow-up evidence;
- evidence, scheduler, and reward semantics remain preserved unless separately approved.
