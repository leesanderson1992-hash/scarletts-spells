# ADLE Current State and Lesson Release Registry

Updated: 2026-07-22

## Purpose

This is the current operational release register for ADLE lesson capabilities.
It distinguishes historical pilots from routes that can genuinely be selected
for learners. It does not replace the programme roadmap or teaching-content
approval records.

## Release states

| State | Meaning |
|---|---|
| `awaiting_content` | No child-facing ADLE lesson may be generated. A correction remains visible in the reviewed backlog. |
| `staging_approved` | A versioned lesson, reviewed content, selection rules, and staging proof exist. Production activation still needs approval. |
| `production_enabled` | The route may be selected when its documented eligibility and assignment safeguards are met. |
| `legacy_pilot` | Historical, versioned assignments remain supported; no new general selection is permitted. |

## Current capability register

| Lesson capability | Micro-skill(s) | State | Selection rule | Notes |
|---|---|---|---|---|
| Base Word Lab | `D4_MOR_BASE_WORDS_PRESERVE_BASE`, `D4_MOR_BASE_WORDS_IDENTIFY_BASE` | `production_enabled` | Two verified authentic targets sharing a supported micro-skill; six independent words and up to two approved families | 18-item immutable snapshot. `bed`, `foot`, and `sun` remain blocked. |
| Prefix Word Lab: fixed `un-` | `D4_MOR_PREFIXES_UN` | `legacy_pilot` | Fixed approved pilot words only | Existing v1 snapshots remain renderable. New general generation is prohibited until the dynamic replacement is approved. |
| Dynamic Prefix Word Lab | `D4_MOR_PREFIXES_UN`, then other reviewed prefix skills | `production_enabled` | Select the enabled prefix micro-skill with the greatest distinct verified authentic queue; use up to four authentic targets, then same-prefix approved transfers to make four words | Approved for production activation on 2026-07-21. The route remains closed unless `ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED=enabled`; other prefix profiles remain out of scope. |
| Dynamic Prefix Word Lab: `dis-` / `mis-` | `D4_MOR_PREFIXES_DIS_MIS` | `production_enabled` | Select up to four verified authentic targets, then approved same-profile transfers | Staging proof and written approval completed 2026-07-22. Production batch `6b7350f2-200e-4443-ab0f-85e78b03e842` retained `disappear` and `misspell`, created the five missing canonical rows, and activated one reviewed profile with seven members. The live gate is `enabled`; no other new prefix profile is present or enabled. |
| Dynamic Prefix Word Lab: `in-` / `im-` / `il-` / `ir-` | `D4_MOR_PREFIXES_IN_IM_IL_IR` | `staging_approved` | Select up to four verified authentic targets, then approved same-profile transfers | Staging correction and independent proof completed 2026-07-22. The profile remains production-disabled pending separate written production approval. |
| Dynamic Prefix Word Lab: `re-` / `pre-` | `D4_MOR_PREFIXES_RE_PRE` | `production_enabled` | `adle-dynamic-prefix-re-pre-production-receipt-2026-07-23.json` | Production batch `016705bb-9a87-44ce-a610-596132240b9b` retained four complete rows, created `preschool`, `rebuild` and `return`, and enabled one reviewed profile with seven safe members. Public deployment `dpl_5tYTL3c9J3gJ4i7uxCQMspQVRupK` is Ready; no other new prefix profile changed. |
| Dynamic Prefix Word Lab: `sub-` / `inter-` / `super-` | `D4_MOR_PREFIXES_SUB_INTER_SUPER` | `staging_approved` | Select up to four verified authentic targets, then approved same-profile transfers | Staging proof completed 2026-07-23 with its reviewed 18-item contract: three prefix-form cleavers, `Under`/`Between`/`Above or beyond` sort and meaning-led build. The profile remains production-disabled pending separate written approval. |
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
