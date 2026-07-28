# ADLE Current State and Lesson Release Registry

Updated: 2026-07-28

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

## Current capability register

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
| Dynamic Suffix Word Lab: `-al` | `D4_MOR_SUFFIXES_AL` | `staging_approved` | Fixed reviewed set of `musical`, `national`, `personal`, and `seasonal`; select up to four verified authentic targets, then same-profile transfers | Staging intake and disposable proof passed on 2026-07-28: 16 items, 14 attempt events, reload/resume, controlled spelling and review scheduling. Child verification is approved. The profile remains `production_enabled = false` pending separate written production authorisation. See `adle-dynamic-suffix-al-staging-runtime-proof-2026-07-28.md`. |
| Dynamic Suffix Word Lab: `-ous` | `D4_MOR_SUFFIXES_OUS` | `production_enabled` | Reviewed set of `dangerous`, `poisonous`, `famous`, and `mysterious`; later complete, reviewed same-profile roster members may be selected as authentic targets or transfers | Production promotion completed 2026-07-28: batch `21fc81e3-4059-4a3c-b452-8a0088e28b99` enabled the reviewed four-member profile, imported only missing reviewed `mysterious`, and made no learner-data writes. The live suffix gate is enabled and deployment `dpl_ChCSn3iGuyU4ymrcoCPiujTH3afs` is Ready. See `adle-dynamic-suffix-ous-production-receipt-2026-07-28.json`. |
| Dynamic Suffix Word Lab: `-ity` | `D4_MOR_SUFFIXES_ITY` | `production_enabled` | Reviewed set of `equality`, `possibility`, `responsibility`, and `curiosity`; later complete, reviewed same-profile roster members may be selected as authentic targets or transfers | Production promotion completed 2026-07-28: batch `9c509ea0-76f7-43ae-814f-2a81bc703111` enabled the reviewed four-member profile, imported only missing reviewed `equality` and `responsibility` records, and made no learner-data writes. The production gate is enabled and deployment `dpl_2ySvCpDPzuRYc5mEBTPyrmihHhNX` is Ready. See `adle-dynamic-suffix-ity-production-receipt-2026-07-28.json`. |
| Dynamic Suffix Word Lab: `-ment` | `D4_MOR_SUFFIXES_MENT` | `production_enabled` | Select up to four verified authentic targets, then approved same-profile transfers to make the fixed four-word lesson | Production promotion completed 2026-07-28: batch `dc5a3ee6-9cce-4f54-8592-269db0ea8225` created one active reviewed profile with four safe members and no learner-data writes. The live gate is enabled and deployment `dpl_5bPXxBtR4ffwqqiQYHSfJ9G4nxzj` is Ready. See `adle-dynamic-suffix-ment-production-receipt-2026-07-28.json`. |
| Dynamic Suffix Word Lab: `-ful` / `-less` | `D4_MOR_SUFFIXES_FUL_LESS` | `production_enabled` | Fixed paired set of `careful`, `careless`, `hopeful`, and `hopeless`; 18-item lesson with two form-specific Cleavers, four meaning matches, and one meaning-led build per suffix | Production batch `81547b52-0fd5-44d4-8e07-55a3565c04c8` created one active reviewed profile with four safe members and no learner-data writes. The suffix gate is enabled and deployment `dpl_7B2seUmXBffNRcMJsmAjkKScwppT` is Ready. See `adle-dynamic-suffix-ful-less-production-receipt-2026-07-28.json`. |
| All other D4 micro-skills | all remaining keys | `awaiting_content` | none | Reviewed corrections stay in the parent-review backlog. |

## Dynamic Prefix Word Lab contract

When a production-enabled prefix micro-skill is selected, its four-word lesson
uses the maximum number of distinct queued authentic targets, up to four. The
remaining places are filled only with approved transfer words for that same
prefix micro-skill. Where two skills have the same target count, choose reteach
priority first, then the oldest unresolved target, then a stable micro-skill
key. Any additional authentic targets remain pending for a later lesson.

## Dynamic Prefix Word Lab implementation state

The generic v2 selector and immutable payload compiler live in
`lib/adle/morphology/dynamic-prefix-word-lab.ts`. A separate preview-gated v2
assignment and child route has passed the disposable staging proof recorded in
`docs/implementation/qa/adle-dynamic-prefix-stage-one-proof.md`. The legacy
fixed `un-` v1 payload, bindings, renderer, and snapshots remain unchanged and
renderable. Production activation was explicitly approved on 2026-07-21 and is
controlled by the independent `ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED` gate.

The v2 compiler accepts reviewed per-skill profiles rather than a dedicated
`un-` renderer. A profile must provide approved analysis, meanings, dictation,
and transfer words for its own micro-skill. Missing profile content, missing
analysis or dictation, insufficient transfers, non-authentic items, and
non-production-enabled skills fail closed without an assignment.

The future reviewed-correction bridge must create ADLE candidates only for
`production_enabled` keys. Raw, pending, rejected, dictionary-missing, and
`awaiting_content` corrections must never create an ADLE assignment.

## Remaining prefix-profile preparation

The dynamic profile loader is dictionary-first. It reads only active,
`approved_for_first_exposure` profile, member, word, dictation/audio and
banding facts. Per-word morphology records retain ordered parts, joins,
transformation notes, child-friendly meaning, prefix variant, micro-skill and
source provenance. A profile with any incomplete reviewed fact fails closed.

The four prepared profiles are intentionally stored with
`production_enabled = false`. The global production route gate does not
override a profile record. A separate staging proof and explicit written
approval are required for each profile before changing that value.

## Documentation update rule

Every activation or retirement must update this register, the D4_MOR readiness
matrix, and the relevant runbook in the same change. Historical plans must link
here rather than state a competing live status.
