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

Status: `7-UI-A documentation and reconciliation foundation; 7S live/manual proof recorded`.

The 7S reflection recall-gate live/manual proof is recorded in the proof register. Evidence-sensitive 7-UI runtime redesign may proceed only in the next approved runtime PR; no 7-UI-B runtime implementation is included in 7-UI-A or the 7S proof-recording pass.

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
| D4_MOR | Active foundation category; draft source retained and reconciled | Global matrix + D4_MOR matrix |
| D4_PG | In scope, unaudited for 7-UI | Global matrix |
| D4_PAT | In scope, unaudited for 7-UI | Global matrix |
| D4_INF | In scope, unaudited for 7-UI | Global matrix |
| D4_SYL | In scope, unaudited for 7-UI | Global matrix |
| D4_HOM | In scope, unaudited for 7-UI | Global matrix |
| D4_SCHWA | In scope, unaudited for 7-UI | Global matrix |
| D4_IRRE | In scope, unaudited for 7-UI | Global matrix |

## Morphology Rollout

First vertical proof: `D4_MOR_PREFIXES_UN`.

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
- Runtime redesign that could affect evidence quality is no longer blocked by the 7S proof gate, but still requires its own approved runtime PR and proof plan.

## Definition Of Complete

7-UI programme complete means:

- every current ADLE micro-skill is designed intentionally;
- every production micro-skill has approved teaching content;
- every production micro-skill reaches its intended rich experience;
- fallbacks remain safe for runtime failures and old assignments;
- accessibility, mobile, reduced-motion, performance, owner, child, live-flow, and evidence-regression proofs are recorded;
- evidence, scheduler, and reward semantics remain preserved unless separately approved.
