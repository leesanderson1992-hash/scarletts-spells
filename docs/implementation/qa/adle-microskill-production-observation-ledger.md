# ADLE micro-skill production observation ledger

Updated: 2026-08-12

This is the concise, cross-micro-skill record of genuine production
observation. It complements, but never replaces, the immutable production
receipts and route-specific audits linked below. The current capability and
release authority remains the [ADLE current-state and release registry](../adle-current-state-and-release-registry.md).

## Status vocabulary

| Status | Meaning |
|---|---|
| `not_observed` | Production-enabled but no genuine child lesson is recorded. |
| `in_progress` | Natural observation has started but is not yet enough for coverage. |
| `coverage_complete` | Required genuine lesson/profile coverage exists. |
| `lifecycle_audit_required` | Coverage exists but a documented evidence, content, or lifecycle gate remains open. |
| `accepted` | The route-specific acceptance record has closed its required observation. |
| `not_applicable` | A later-phase capability; it has no standalone first-impression observation requirement. |
| `blocked` | Observation cannot start because the capability is not production-enabled. |

Natural coverage means a genuine child lesson, never a staging fixture or a
manufactured production assignment. Coverage does not itself establish final
acceptance.

## Production-enabled first-impression micro-skills

| Skill family | Micro-skill key | Release state | Production version/date | Natural lesson coverage | Completion/evidence audit | Open child-facing issue | Observation decision | Detailed evidence |
|---|---|---|---|---|---|---|---|---|
| Base Word | `D4_MOR_BASE_WORDS_PRESERVE_BASE` | `production_enabled` | Base Word Family V2, 2026-08-10 | Not recorded | No route-specific natural audit | None recorded | `not_observed` | [General Production release](adle-base-word-general-production-release-2026-08-10.md) |
| Base Word | `D4_MOR_BASE_WORDS_IDENTIFY_BASE` | `production_enabled` | Base Word Family V2, 2026-08-10 | One completed natural lesson | Durable audit passed: 18/18 bindings, reflection, correct scored work, authentic-only schedules and Forge transition | None recorded | `coverage_complete` | [General Production release](adle-base-word-general-production-release-2026-08-10.md); live durable audit, 2026-08-12 |
| Base Word | `D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX` | `production_enabled` | Base Word Family V2, 2026-08-11 | Not recorded | No route-specific natural audit | None recorded | `not_observed` | [Prefix/Suffix release receipt](../seed-data/teaching-dictionary/releases/2026-08-11-base-word-prefix-suffix-route-releases/publication-receipt.json) |
| Base Word | `D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX` | `production_enabled` | Base Word Family V2, 2026-08-11 | One completed natural lesson | Durable audit passed: 18/18 bindings, reflection, correct scored work, authentic-only schedules and Forge transition | None recorded | `coverage_complete` | [Prefix/Suffix release receipt](../seed-data/teaching-dictionary/releases/2026-08-11-base-word-prefix-suffix-route-releases/publication-receipt.json); live durable audit, 2026-08-12 |
| Dynamic Prefix | `D4_MOR_PREFIXES_UN` | `production_enabled` | Prefix V2, 2026-08-03 | One completed natural lesson | Durable audit passed | Reviewed base definitions for `natural` and `necessary` still need governed release | `coverage_complete`; `lifecycle_audit_required` | [Prefix observation receipt](adle-dynamic-prefix-pedagogy-production-rollback-receipt-2026-08-03.md) |
| Dynamic Prefix | `D4_MOR_PREFIXES_DIS_MIS` | `production_enabled` | Prefix V2, 2026-08-03 | One completed natural lesson | Durable audit passed | Generic-support approval remains outstanding | `coverage_complete`; `lifecycle_audit_required` | [Prefix observation receipt](adle-dynamic-prefix-pedagogy-production-rollback-receipt-2026-08-03.md) |
| Dynamic Prefix | `D4_MOR_PREFIXES_IN_IM_IL_IR` | `production_enabled` | Prefix V2, 2026-08-03 | One completed natural lesson | Durable audit passed | Generic-support approval remains outstanding | `coverage_complete`; `lifecycle_audit_required` | [Prefix observation receipt](adle-dynamic-prefix-pedagogy-production-rollback-receipt-2026-08-03.md) |
| Dynamic Prefix | `D4_MOR_PREFIXES_RE_PRE` | `production_enabled` | Prefix V2, 2026-08-03 | One completed natural lesson | Durable audit passed | Generic-support approval remains outstanding | `coverage_complete`; `lifecycle_audit_required` | [RE/PRE audit](adle-dynamic-prefix-re-pre-production-audit-2026-08-06.md) |
| Dynamic Prefix | `D4_MOR_PREFIXES_SUB_INTER_SUPER` | `production_enabled` | Prefix V2, 2026-08-03 | One completed natural lesson | Durable audit passed | Generic-support approval remains outstanding | `coverage_complete`; `lifecycle_audit_required` | [Prefix observation receipt](adle-dynamic-prefix-pedagogy-production-rollback-receipt-2026-08-03.md) |
| Dynamic Suffix | `D4_MOR_SUFFIXES_NESS` | `production_enabled` | Dynamic Suffix V3, 2026-07-27 | One completed natural lesson | Durable audit passed: 16/16 bindings, 14 unique attempts, Reflection, four taught/evidence records, authentic-only schedules/routes and transfer isolation | None recorded | `coverage_complete` | [Production receipt](adle-dynamic-suffix-ness-production-receipt-2026-07-27.json); live durable audit, 2026-08-12 |
| Dynamic Suffix | `D4_MOR_SUFFIXES_ABLE_IBLE` | `production_enabled` | Dynamic Suffix V3, 2026-07-27 | Not recorded | Production release verified; no natural audit | None recorded | `not_observed` | [Production receipt](adle-dynamic-suffix-able-ible-production-receipt-2026-07-27.json) |
| Dynamic Suffix | `D4_MOR_SUFFIXES_AL` | `production_enabled` | Dynamic Suffix V3, 2026-07-28 | Natural completion recorded | Completion audit complete | None recorded | `accepted` | [Completion audit](adle-dynamic-affix-al-production-completion-audit-2026-08-08.md) |
| Dynamic Suffix | `D4_MOR_SUFFIXES_OUS` | `production_enabled` | Dynamic Suffix V3, 2026-07-28 | Not recorded | Production release verified; no natural audit | None recorded | `not_observed` | [Production receipt](adle-dynamic-suffix-ous-production-receipt-2026-07-28.json) |
| Dynamic Suffix | `D4_MOR_SUFFIXES_ITY` | `production_enabled` | Dynamic Suffix V3, 2026-07-28 | Not recorded | Production release verified; no natural audit | None recorded | `not_observed` | [Production receipt](adle-dynamic-suffix-ity-production-receipt-2026-07-28.json) |
| Dynamic Suffix | `D4_MOR_SUFFIXES_LY` | `production_enabled` | Dynamic Suffix V3, 2026-07-28 | Not recorded | Production release verified; no natural audit | None recorded | `not_observed` | [Production receipt](adle-dynamic-suffix-ly-production-receipt-2026-07-28.json) |
| Dynamic Suffix | `D4_MOR_SUFFIXES_MENT` | `production_enabled` | Dynamic Suffix V3, 2026-07-28 | One completed natural lesson | Durable audit passed: 16/16 bindings, 14 unique attempts, Reflection, four taught/evidence records, authentic-only schedules/routes and transfer isolation | None recorded | `coverage_complete` | [Production receipt](adle-dynamic-suffix-ment-production-receipt-2026-07-28.json); live durable audit, 2026-08-12 |
| Dynamic Suffix | `D4_MOR_SUFFIXES_FUL_LESS` | `production_enabled` | Dynamic Suffix V3, 2026-07-28 | Not recorded | Production release verified; no natural audit | None recorded | `not_observed` | [Production receipt](adle-dynamic-suffix-ful-less-production-receipt-2026-07-28.json) |
| Dynamic Suffix | `D4_MOR_SUFFIXES_TION` | `production_enabled` | Dynamic Suffix V3, 2026-07-29 | One completed natural lesson | Durable audit passed: 16/16 bindings, 14 unique attempts, Reflection, four taught/evidence records, authentic-only schedules/routes and transfer isolation | None recorded | `coverage_complete` | [Production receipt](adle-dynamic-suffix-tion-production-receipt-2026-07-29.json); live durable audit, 2026-08-12 |
| Dynamic Suffix | `D4_MOR_SUFFIXES_SION` | `production_enabled` | Dynamic Suffix V3, 2026-07-29 | One completed natural lesson | Durable audit passed: 16/16 bindings, 14 unique attempts, Reflection, four taught/evidence records, authentic-only schedules/routes and transfer isolation | None recorded | `coverage_complete` | [Production receipt](adle-dynamic-suffix-sion-production-receipt-2026-07-29.json); live durable audit, 2026-08-12 |
| Closed Compound | `D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS` | `production_enabled` | Closed Compound V1, 2026-07-30 | Not recorded | Production release verified; no natural audit | None recorded | `not_observed` | [Production receipt](adle-closed-compounds-production-receipt-2026-07-30.md) |

## Not independently observable

| Skill family | Micro-skill key | Release state | Why it is not a missing observation | Observation decision |
|---|---|---|---|---|
| Open/Hyphenated Compound | `D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED` | `awaiting_content` | No production lesson may be generated. | `blocked` |
| Common Greek Roots | `D4_MOR_ROOTS_COMMON_GREEK_ROOTS` | `awaiting_content` | No production lesson may be generated. | `blocked` |
| Common Latin Roots | `D4_MOR_ROOTS_COMMON_LATIN_ROOTS` | `awaiting_content` | No production lesson may be generated. | `blocked` |
| Root-Family Spelling | `D4_MOR_ROOTS_ROOT_FAMILY_SPELLING` | `awaiting_content` | No production lesson may be generated. | `blocked` |
| Science/Maths Roots | `D4_MOR_ROOTS_SCIENCE_MATH_ROOTS` | `awaiting_content` | No production lesson may be generated. | `blocked` |

## Update rule

Every new route-specific production receipt or audit must update only its row
in this ledger. Do not replace historical receipts, copy raw learner content,
or turn a missing natural observation into a failed release.
