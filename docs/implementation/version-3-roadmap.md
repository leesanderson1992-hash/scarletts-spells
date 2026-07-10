# Version 3.0 Roadmap: Programme Index

## Purpose

This roadmap is now a concise programme index for Scarlett's Spells Version 3.0.
Detailed 7-UI planning lives in the dedicated 7-UI roadmap and registers.

Historical detailed roadmap content was retained at:

- `docs/implementation/completed/version-3-roadmap-pre-7-ui-a-2026-07-10.md`

## Current Programme Status

Current focus: `ADLE 7-UI-A documentation and reconciliation foundation`.

Runtime status:

- ADLE Slices 1-6, 7a, 7P, 7R, and 7S are documented as implemented.
- 7a live QA, 7P real-child assignment proof, 7R scheduled-review miss proof, and 7S reflection recall-gate live/manual proof are recorded or referenced.
- Evidence-sensitive 7-UI runtime redesign is no longer blocked by the 7S proof gate, but still requires a separate approved runtime PR.

## 7-UI Programme Links

- Programme roadmap: `docs/implementation/adle-7-ui-roadmap.md`
- Document authority map: `docs/implementation/adle-7-ui-document-authority-map.md`
- Control matrix guide: `docs/implementation/adle-7-ui-control-matrix.md`
- Change control: `docs/implementation/adle-7-ui-change-control.md`
- Runtime architecture: `docs/architecture/adle-activity-platform-architecture.md`
- Category design pack contract: `docs/contracts/adle-category-design-pack-contract.md`
- Template development contract: `docs/contracts/adle-template-development-contract.md`
- Teaching-content authoring contract: `docs/contracts/adle-teaching-content-authoring-contract.md`
- D4_MOR category pack: `docs/product/areas/d4-mor-ux-design-pack.md`

## 7-UI Category Index

All current ADLE micro-skills are in programme scope. The source of row truth is:

- `docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-global-control-matrix.csv`

| Family | Micro-skills | 7-UI status |
|---|---:|---|
| D4_MOR | 24 | Active foundation category |
| D4_PG | 116 | In scope, unaudited |
| D4_PAT | 28 | In scope, unaudited |
| D4_INF | 28 | In scope, unaudited |
| D4_SYL | 17 | In scope, unaudited |
| D4_HOM | 13 | In scope, unaudited |
| D4_SCHWA | 9 | In scope, unaudited |
| D4_IRRE | 5 | In scope, unaudited |

## Standing Boundaries

7-UI must preserve ADLE evidence, scheduler, and reward semantics unless a separate approved contract change says otherwise.

PR 7-UI-A is documentation-only. The separate 7S proof-recording pass applied the existing 7R local/live proof-database migration and recorded the proof; it still authorizes no 7-UI runtime component changes, composer changes, workbook import, evidence-semantics changes, scheduler changes, reward changes, or bulk teaching-content activation.
