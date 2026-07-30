# ADLE 7-UI Control Matrix Guide

## Purpose

The 7-UI programme is controlled through machine-readable registers, not one large hand-maintained Markdown table.

Primary matrix:

- `docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-global-control-matrix.csv`

Supporting registers:

- `docs/implementation/seed-data/adle-7-ui/control-matrix/d4-mor-experience-readiness-matrix.csv`
- `docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-decision-register.csv`
- `docs/implementation/seed-data/adle-7-ui/control-matrix/adle-7-ui-proof-register.csv`
- `docs/implementation/seed-data/adle-7-ui/source-artifacts/source-artifact-register.csv`

## Current Inventory

The global control matrix is generated from the current repository taxonomy at:

- `docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json`

Current inventory:

- 8 ADLE family categories.
- 241 active D4 micro-skills in current programme scope.
- 25 current D4_MOR micro-skills: 18 production-enabled first-impression
  lessons, 2 later-phase base-word transfer skills, and 5 awaiting
  first-impression implementation.
- The frozen July 2026 D4_MOR package remains immutable historical evidence
  for its original 24-key taxonomy. Its two word-family keys are retired from
  current taxonomy; later `-ly`, `-tion`, and `-sion` additions are current
  live taxonomy but were not part of that historical package.
- Non-morphology categories are intentionally visible as `unaudited_not_started` or `not_started` so they remain in programme scope.

Current family counts:

| Family | Micro-skills |
|---|---:|
| D4_PG | 116 |
| D4_PAT | 28 |
| D4_INF | 28 |
| D4_MOR | 25 |
| D4_SYL | 17 |
| D4_HOM | 13 |
| D4_SCHWA | 9 |
| D4_IRRE | 5 |

## Status Field Rules

The matrix deliberately splits status fields that are often confused:

- `content_authored_status`: whether usable authored content exists.
- `content_reviewed_status`: whether required human review has passed.
- `content_activated_status`: whether a content version is active runtime truth.
- `lesson_designed_status`: whether the lesson sequence/profile has been designed.
- `runtime_implemented_status`: whether code exists.
- `runtime_enabled_status`: whether the implementation can be served to children.
- `validation_complete_status`: whether required proof is complete.

A row may have authored content but still be not reviewed, not activated, not implemented, and not enabled.

## Update Rules

- Any new or retired micro-skill must update the global matrix from taxonomy.
- Any category source artifact must update the source-artifact register.
- Any accepted category design change must update the category design pack and affected matrix rows.
- Any runtime implementation must update implementation and enabled statuses separately.
- Any proof result must update the proof register, then link the relevant matrix rows to the proof id.
