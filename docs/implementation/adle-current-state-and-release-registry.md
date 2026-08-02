# ADLE Current State and Lesson Release Registry

Updated: 2026-08-02

## Purpose

This is the current operational release register for ADLE lesson capabilities.
It distinguishes historical pilots from routes that can genuinely be selected
for learners. It does not replace the programme roadmap or teaching-content
approval records.

## Release states

| State | Meaning |
|---|---|
| `awaiting_content` | No child-facing ADLE lesson may be generated. A correction remains visible in the reviewed backlog. |
| `staging_verification_pending` | Reviewed staging content, implementation, and disposable runtime proof exist; final owner/child verification is still required. |
| `staging_approved` | A versioned lesson, reviewed content, selection rules, and staging proof exist. Production activation still needs approval. |
| `production_enabled` | The route may be selected when its documented eligibility and assignment safeguards are met. |
| `legacy_pilot` | Historical, versioned assignments remain supported; no new general selection is permitted. |
| `not_required_first_impression` | This key is a later-phase transfer, proof, boundary, or review capability. It is not a missing standalone first-impression ADLE lesson. |

## Current capability register

Current D4_MOR position: 25 live micro-skills — 18 production-enabled
first-impression lessons, 0 staging-approved first-impression lessons, 2
later-phase base-word transfer skills marked `not_required_first_impression`,
and 5 first-impression lessons awaiting implementation.

The shared ADLE routing foundation was promoted on 2026-07-31. Newly composed
Generic, Dynamic Prefix V2, Dynamic Affix V3, Closed Compound V1 and Base Word
Family assignments now persist explicit immutable route metadata. Historical
metadata-free assignments, including fixed legacy `un-`, retain their existing
readers. This infrastructure release changed no capability state, selection,
lesson behavior or Teaching Dictionary content. See
`docs/implementation/qa/adle-explicit-route-metadata-production-receipt-2026-07-31.md`.

The Generic Composer V2 snapshot reader is implemented and proven on the
pinned staging project only. New generic plans can compile an immutable,
content-fingerprinted assignment snapshot; enforce mode reconstructs the
existing session read model and preserves review, lesson, attempt, evidence,
scheduler, reward, completion and resume behaviour. Explicit snapshot-absent
and metadata-free assignments retain compatibility readers, while a present
invalid snapshot blocks with zero learner writes. This foundation changes no
lesson capability state or Teaching Dictionary activation. Production rollout
is deferred. See
`docs/implementation/qa/adle-generic-snapshot-v2-staging-rollback-proof-2026-07-31.md`.

| Lesson capability | Micro-skill(s) | State | Selection rule | Notes |
|---|---|---|---|---|
| Base Word Lab | `D4_MOR_BASE_WORDS_PRESERVE_BASE`, `D4_MOR_BASE_WORDS_IDENTIFY_BASE` | `production_enabled` | Two verified authentic targets sharing a supported micro-skill; six independent words and up to two approved families | 18-item immutable snapshot. `bed`, `foot`, and `sun` remain blocked. |
| Dynamic Prefix Word Lab: `un-` | `D4_MOR_PREFIXES_UN` | `production_enabled` | Select up to four verified authentic targets, then approved same-profile transfers | The legacy reviewed seven-word lesson was promoted into the profile-driven runtime on 2026-07-28. Production batch `897c6cce-86cb-4b12-a6b7-698fb33152da` activated seven safe members with no learner, assignment, evidence or scheduling writes. |
| Dynamic Prefix Word Lab | All reviewed prefix skills | `production_enabled` | Select the enabled prefix micro-skill with the greatest distinct verified authentic queue; use up to four authentic targets, then same-prefix approved transfers to make four words | The route remains gated by `ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED=enabled`; each profile is independently dictionary-backed and production-enabled. |
| Dynamic Prefix Word Lab: `dis-` / `mis-` | `D4_MOR_PREFIXES_DIS_MIS` | `production_enabled` | Select up to four verified authentic targets, then approved same-profile transfers | Staging proof and written approval completed 2026-07-22. Production batch `6b7350f2-200e-4443-ab0f-85e78b03e842` retained `disappear` and `misspell`, created the five missing canonical rows, and activated one reviewed profile with seven members. The live gate is `enabled`; no other new prefix profile is present or enabled. |
| Dynamic Prefix Word Lab: `in-` / `im-` / `il-` / `ir-` | `D4_MOR_PREFIXES_IN_IM_IL_IR` | `production_enabled` | Select up to four verified authentic targets, then approved same-profile transfers | Staging correction and independent proof completed 2026-07-22. Production batch `ead4be9e-33e6-4ee3-ad06-3f778ab9958d` retained five reviewed rows, created two, and enabled seven safe members on 2026-07-28 with no learner writes. |
| Dynamic Prefix Word Lab: `re-` / `pre-` | `D4_MOR_PREFIXES_RE_PRE` | `production_enabled` | `adle-dynamic-prefix-re-pre-production-receipt-2026-07-23.json` | Production batch `016705bb-9a87-44ce-a610-596132240b9b` retained four complete rows, created `preschool`, `rebuild` and `return`, and enabled one reviewed profile with seven safe members. Public deployment `dpl_5tYTL3c9J3gJ4i7uxCQMspQVRupK` is Ready; no other new prefix profile changed. |
| Dynamic Prefix Word Lab: `sub-` / `inter-` / `super-` | `D4_MOR_PREFIXES_SUB_INTER_SUPER` | `production_enabled` | Select up to four verified authentic targets, then approved same-profile transfers | Staging proof and child-feedback correction completed 2026-07-23: 18-item contract, three prefix-form cleavers, explicit examples, instructed `Under`/`Between`/`Above or beyond` sort, meaning-led build, `inter + national` teaching build, and accessible slide/fallback Cover/Spell. Production batch `7fc4dc11-416f-42f1-936e-c398395afac8` retained five reviewed rows, created two, and enabled seven safe members on 2026-07-28 with no learner writes. |
| Dynamic Suffix Word Lab: `-ness` | `D4_MOR_SUFFIXES_NESS` | `production_enabled` | Select up to four verified authentic targets, then approved same-profile transfers | Production promotion completed 2026-07-27: batch `71693a19-7553-4afb-abe0-dd15d0329bdd` created one active reviewed profile with four safe members and no learner-data writes. The live gate is enabled and final deployment `dpl_9vMAtoWJ2YragUnLqWFW873BpVT8` is Ready. See `adle-dynamic-suffix-ness-production-receipt-2026-07-27.json`. |
| Dynamic Suffix Word Lab: `-able` / `-ible` | `D4_MOR_SUFFIXES_ABLE_IBLE` | `production_enabled` | Select up to four verified authentic targets, then approved same-profile transfers | Production promotion completed 2026-07-27: batch `a276c839-aab5-493a-a1b1-377e28e7fe52` created one active reviewed profile with four safe members and no learner-data writes. See `adle-dynamic-suffix-able-ible-production-receipt-2026-07-27.json`. |
| Dynamic Suffix Word Lab: `-al` | `D4_MOR_SUFFIXES_AL` | `production_enabled` | Fixed reviewed set of `musical`, `national`, `personal`, and `seasonal`; select up to four verified authentic targets, then same-profile transfers | Production promotion completed 2026-07-28: batch `5fe55b1b-85d4-4d63-a5e6-1595b4d1f509` enabled the reviewed four-member profile, imported only missing reviewed `seasonal`, and made no learner-data writes. The live suffix gate is enabled and deployment `dpl_62obz4E9TREgPV9f5dfanR4hHzG1` is Ready. See `adle-dynamic-suffix-al-production-receipt-2026-07-28.json`. |
| Dynamic Suffix Word Lab: `-ous` | `D4_MOR_SUFFIXES_OUS` | `production_enabled` | Reviewed set of `dangerous`, `poisonous`, `famous`, and `mysterious`; later complete, reviewed same-profile roster members may be selected as authentic targets or transfers | Production promotion completed 2026-07-28: batch `21fc81e3-4059-4a3c-b452-8a0088e28b99` enabled the reviewed four-member profile, imported only missing reviewed `mysterious`, and made no learner-data writes. The live suffix gate is enabled and deployment `dpl_ChCSn3iGuyU4ymrcoCPiujTH3afs` is Ready. See `adle-dynamic-suffix-ous-production-receipt-2026-07-28.json`. |
| Dynamic Suffix Word Lab: `-ity` | `D4_MOR_SUFFIXES_ITY` | `production_enabled` | Reviewed set of `equality`, `possibility`, `responsibility`, and `curiosity`; later complete, reviewed same-profile roster members may be selected as authentic targets or transfers | Production promotion completed 2026-07-28: batch `9c509ea0-76f7-43ae-814f-2a81bc703111` enabled the reviewed four-member profile, imported only missing reviewed `equality` and `responsibility` records, and made no learner-data writes. The production gate is enabled and deployment `dpl_2ySvCpDPzuRYc5mEBTPyrmihHhNX` is Ready. See `adle-dynamic-suffix-ity-production-receipt-2026-07-28.json`. |
| Dynamic Suffix Word Lab: `-ly` | `D4_MOR_SUFFIXES_LY` | `production_enabled` | Reviewed set of `quickly`, `slowly`, `quietly`, and `happily`; later complete, reviewed same-profile roster members may be selected as authentic targets or transfers | Production promotion completed 2026-07-28 after child approval: batch `338c204b-b1c7-4a17-a60d-c8b2e259c32c` enabled the reviewed four-member profile with no learner-data writes. The live suffix gate is enabled and deployment `dpl_GhSp6CvMgESfweWmmCCJWCQuSZ1X` is Ready. See `adle-dynamic-suffix-ly-production-receipt-2026-07-28.json`. |
| Dynamic Suffix Word Lab: `-ment` | `D4_MOR_SUFFIXES_MENT` | `production_enabled` | Select up to four verified authentic targets, then approved same-profile transfers to make the fixed four-word lesson | Production promotion completed 2026-07-28: batch `dc5a3ee6-9cce-4f54-8592-269db0ea8225` created one active reviewed profile with four safe members and no learner-data writes. The live gate is enabled and deployment `dpl_5bPXxBtR4ffwqqiQYHSfJ9G4nxzj` is Ready. See `adle-dynamic-suffix-ment-production-receipt-2026-07-28.json`. |
| Dynamic Suffix Word Lab: `-ful` / `-less` | `D4_MOR_SUFFIXES_FUL_LESS` | `production_enabled` | Fixed paired set of `careful`, `careless`, `hopeful`, and `hopeless`; 18-item lesson with two form-specific Cleavers, four meaning matches, and one meaning-led build per suffix | Production batch `81547b52-0fd5-44d4-8e07-55a3565c04c8` created one active reviewed profile with four safe members and no learner-data writes. The suffix gate is enabled and deployment `dpl_7B2seUmXBffNRcMJsmAjkKScwppT` is Ready. See `adle-dynamic-suffix-ful-less-production-receipt-2026-07-28.json`. |
| Dynamic Suffix Word Lab: `-tion` | `D4_MOR_SUFFIXES_TION` | `production_enabled` | Reviewed set of `action`, `invention`, `education`, and `celebration`; later complete, reviewed same-profile roster members may be selected as authentic targets or transfers | Child verification of the revised introduction and shared affix reflection completed 2026-07-29. Production batch `7c468fef-c50c-4a17-a6b0-587793c2f96e` created one active reviewed profile with four safe members, created the catalog entry, and made no learner-data writes. The suffix gate is enabled and deployment `dpl_4buaEgrUvNFYBm2WsfknLPcSd5X8` is Ready. See `adle-dynamic-suffix-tion-production-receipt-2026-07-29.json`. |
| Dynamic Suffix Word Lab: `-sion` | `D4_MOR_SUFFIXES_SION` | `production_enabled` | Reviewed set of `decision`, `division`, `confusion`, and `expansion`; later complete, reviewed same-profile roster members may be selected as authentic targets or transfers | Production promotion completed 2026-07-29: batch `d5f11ec9-1b93-499f-9ed3-ffbe17b591ae` created one active reviewed profile with four safe members and no learner-data writes. The suffix gate is enabled and deployment `dpl_Ar4QxewDxY64Lz1t2hSLjMF2Po9k` is Ready. See `adle-dynamic-suffix-sion-production-receipt-2026-07-29.json`. |
| Later-phase base-word capabilities | `D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX`, `D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX` | `not_required_first_impression` | Used only when an already-taught word needs base-plus-affix transfer work | No standalone first-impression ADLE profile is required. Historical morphology-node aliases such as base meaning/proof/review are not current live micro-skills. |
| Remaining first-impression suffix lessons | none currently | — | — | All currently planned suffix first-impression profiles are production-enabled. |
| Closed Compound Word Lab | `D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS` | `production_enabled` | Select four verified authentic targets first, then deterministically rotate the explicit seven-word approved pool | Production batch `2f6db9a1-f844-4577-9631-c3740f6ea7ae` activated seven explicit compound facts after child-completed staging verification. The 18-item Word Lab is independently gated by `ADLE_CLOSED_COMPOUND_PRODUCTION_ENABLED=enabled`; deployment `dpl_7QNw3SyH4weqWj573LT4LDDHHvUy` is Ready. |
| Open/Hyphenated Compound Word Lab | `D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED` | `awaiting_content` | none | Reviewed four-word roster: `ice cream`, `post office`, `twenty-one`, `part-time`; multi-token dictation span and separator-significant comparison are required. |
| Common Greek Roots Lab | `D4_MOR_ROOTS_COMMON_GREEK_ROOTS` | `awaiting_content` | none | Reviewed four-word roster: `telephone`, `telescope`, `microphone`, `microscope`; runtime eligibility remains fail-closed. |
| Common Latin Roots Lab | `D4_MOR_ROOTS_COMMON_LATIN_ROOTS` | `awaiting_content` | none | Reviewed four-word roster: `transport`, `export`, `construct`, `structure`; runtime eligibility remains fail-closed. |
| Root-Family Spelling Lab | `D4_MOR_ROOTS_ROOT_FAMILY_SPELLING` | `awaiting_content` | none | Reviewed four-word roster: `action`, `active`, `actor`, `react`. This current root-specific key is retained; it is not the retired general word-family cluster. |
| Science/Maths Roots Lab | `D4_MOR_ROOTS_SCIENCE_MATH_ROOTS` | `awaiting_content` | none | Reviewed four-word roster: `biology`, `geography`, `thermometer`, `triangle`; runtime eligibility remains fail-closed. |

`D4_MOR_WORD_FAMILIES_PRONUNCIATION_SHIFT` and
`D4_MOR_WORD_FAMILIES_RELATED_WORD_SUPPORT` were retired from current staging
and production taxonomy on 2026-07-29 after separate zero-learner-reference
audits and written production approval. Their frozen July 2026 approved-package
and human-review records remain historical evidence and are not current
taxonomy.

## Dynamic Prefix Word Lab contract

When a production-enabled prefix micro-skill is selected, its four-word lesson
uses the maximum number of distinct queued authentic targets, up to four. The
remaining places are filled only with approved transfer words for that same
prefix micro-skill. Where two skills have the same target count, choose reteach
priority first, then the oldest unresolved target, then a stable micro-skill
key. Any additional authentic targets remain pending for a later lesson.

## Dynamic Prefix Word Lab implementation state

The generic v2 selector and stable public compiler boundary live in
`lib/adle/morphology/dynamic-prefix-word-lab.ts`; inert V2 contracts and
validation live in `dynamic-prefix-contracts.ts`. A separate preview-gated v2
assignment and child route has passed the disposable staging proof recorded in
`docs/implementation/qa/adle-dynamic-prefix-stage-one-proof.md`. The legacy
fixed `un-` v1 payload, bindings, renderer, and snapshots remain unchanged and
renderable. Production activation was explicitly approved on 2026-07-21 and is
controlled by the independent `ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED` gate.

The V2 boundary accepts reviewed per-skill profiles rather than a dedicated
`un-` renderer. Four profiles (`DIS_MIS`, `IN_IM_IL_IR`, `RE_PRE`, and
`SUB_INTER_SUPER`) have guarded shared-compiler migration authority through
shadow, enforced-parity and shared-authoritative modes. `un-` remains on
explicit `legacy_pending_exact_source` authority because staging lacks its
normal approved profile row and the select-only proof projection is not an
exact production source. Missing mappings/content, fingerprints, adapter
parity, plan bindings or counts fail closed before assignment persistence in
enforced/shared modes. The full writer, lifecycle, rollback and cleanup proof
passed on the pinned staging project on 2026-08-02; see
`docs/implementation/qa/adle-dynamic-prefix-shared-compiler-staging-proof-2026-08-02.md`.

The future reviewed-correction bridge must create ADLE candidates only for
`production_enabled` keys. Raw, pending, rejected, dictionary-missing, and
`awaiting_content` corrections must never create an ADLE assignment.

## Prefix profile and compiler migration state

The dynamic profile loader is dictionary-first. It reads only active,
`approved_for_first_exposure` profile, member, word, dictation/audio and
banding facts. Per-word morphology records retain ordered parts, joins,
transformation notes, child-friendly meaning, prefix variant, micro-skill and
source provenance. A profile with any incomplete reviewed fact fails closed.

All five listed production profiles are independently dictionary-backed and
production-enabled. The global route gate does not override a profile record.
Compiler migration does not change profile activation or Teaching Dictionary
facts. The four-profile compiler boundary has passed guarded staging proof;
production deployment remains separately authorised and has not occurred. A
later `un-` migration must first establish an exact production-authority
fixture and equivalent normal staging profile path; its current synthetic
projection must not be counted.

## Documentation update rule

Every activation or retirement must update this register, the D4_MOR readiness
matrix, and the relevant runbook in the same change. Historical plans must link
here rather than state a competing live status.
