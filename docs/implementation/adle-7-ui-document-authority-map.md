# ADLE 7-UI Document Authority Map

## Purpose

This document defines the single authoritative home for each kind of 7-UI truth.
When documents overlap, the authority listed here wins.

## Authority Map

| Truth area | Authoritative source | Supporting sources | Must not live in |
|---|---|---|---|
| Programme status | `docs/implementation/adle-7-ui-roadmap.md` | `docs/implementation/version-3-roadmap.md` as index | Category packs, runtime files |
| Micro-skill status | `docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-global-control-matrix.csv` | `docs/implementation/adle-7-ui-control-matrix.md` | Hand-maintained prose tables |
| Runtime architecture | `docs/architecture/adle-activity-platform-architecture.md` | `docs/contracts/adle-template-development-contract.md` | Category design packs |
| Template rules | `docs/contracts/adle-template-development-contract.md` | `docs/product/areas/adle-template-catalog.md` | Per-micro-skill content |
| Teaching-content rules | `docs/contracts/adle-teaching-content-authoring-contract.md` | Phase 5A/5B teaching dictionary docs | React components |
| Category design process | `docs/contracts/adle-category-design-pack-contract.md` | Active category pack | Main roadmap |
| Active category design | Active category design pack, first `docs/product/areas/d4-mor-ux-design-pack.md` | Category matrix CSV | Global runtime architecture |
| Child UX principles | `docs/product/areas/adle-child-experience-principles.md` | `docs/product/ux-standards.md` | Evidence policy docs |
| Accessibility and motion | `docs/product/areas/adle-accessibility-and-motion-contract.md` | Template contract | Individual renderer code only |
| Evidence semantics | `docs/contracts/adle-daily-assignment-and-evidence-blueprint-contract.md` and `docs/contracts/adle-instructional-activity-registry-contract.md` | 7R/7S slice docs | 7-UI design packs |
| Actual teaching copy | Approved teaching content source/version, currently not activated for D4_MOR | Retained source artifacts under `docs/implementation/seed-data/adle-7-ui/source-artifacts/` | React components, roadmap prose |
| Proof status | `docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-proof-register.csv` | QA records linked from the register | Long matrix notes |
| Architecture decisions | `docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-decision-register.csv` | Architecture docs once decisions are accepted | Silent assumptions in code |
| Source-artifact provenance | `docs/implementation/seed-data/adle-7-ui/source-artifacts/source-artifact-register.csv` | Artifact retention folders | Downloads, local-only notes |

## Conflict Rules

- Matrix CSVs are the status source of truth; Markdown explains how to read them.
- Category packs may define learning interactions, but cannot redefine evidence, scheduling, persistence, reward, or global accessibility rules.
- Content workbooks may contain teaching copy, but become runtime truth only after review, versioning, and activation under the teaching-content contract.
- Renderer code implements accepted contracts; it does not create new teaching, evidence, or scheduling policy.
