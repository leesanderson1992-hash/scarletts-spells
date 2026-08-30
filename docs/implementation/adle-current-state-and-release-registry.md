# ADLE Current State and Lesson Release Registry

Updated: 2026-08-30

## Proficiency authority marker and 2026-08-30 revalidation

`CURRENT_RUNTIME`: this registry describes released lesson/read/write
capability. The current Slice 5 `0.1 / 0.4 / 1.0` proficiency projection remains
live.

`APPROVED_TARGET_MODEL`: future proficiency semantics are documented in
`docs/contracts/adle-spelling-proficiency-contract.md` and future word-route
semantics in `docs/contracts/adle-word-progression-and-review-contract.md`.
Neither is deployed. This registry must continue to distinguish those states
until controlled release; current Slice 2/R5 catch-up/ejection behaviour remains
live.

Canonical ownership and reading order are in
`docs/architecture/adle-authority-map.md`. This registry owns current runtime
state only and must not redefine target policy.

Read-only revalidation on 2026-08-30 corrects the Production application pin to
`42bf928fb6efde80c2f65dfd5a0a0bd9411616c1` and confirms both Compound route
heads are Production-enabled. The older separated/hyphenated
`awaiting_content` row is superseded by the corrected row below; dated rollout
entries remain historical.

## Purpose

This is the current operational release register for ADLE lesson capabilities.
It distinguishes historical pilots from routes that can genuinely be selected
for learners. It does not replace the programme roadmap or teaching-content
approval records.

The current Production application authority is
`42bf928fb6efde80c2f65dfd5a0a0bd9411616c1`. Today's ADLE Session unifies
generic lessons, specialist lessons, and Review v3. Every newly created lesson
persists immutable snapshot v3. The current route registry contains
`generic_composer:v1`, Dynamic Prefix v2, Dynamic Affix v3, Base Word v2, and
Compound Word v2. Generic-v2, fixed-`un` v1, closed-compound-v1, and the old
daily-practice application surface are retired.

The release chronology below remains useful evidence for individual content
profiles. Where an older dated entry describes a temporary rollout, generic
v2, or a v1 route as current, this 2026-08-30 current-state section supersedes
that operational claim; the dated text remains historical context only.

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

Current D4_MOR position: 25 live micro-skills — 19 production-enabled
first-impression lessons, 0 staging-approved first-impression lessons, 2
later-phase base-word transfer skills marked `not_required_first_impression`,
and 4 first-impression lessons awaiting implementation.

Current route metadata and snapshot v3 are immutable forward contracts.
Snapshot-null specialist readers, metadata-free generic replay, old template
normalization, controlled-spelling adapters, `REVIEW_QUICK_SORT` compatibility,
and base-word-v2 completion remain protected for historical assignments. A
present invalid snapshot blocks with zero learner writes. Historical Generic
Composer v2 staging receipts remain chronology, not current writer authority.

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
| Compound Word Lab v2 | `D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS` | `production_enabled` | Select four verified authentic targets first, then deterministically rotate the explicit seven-word approved pool | The current `compound_word_lab:v2` route uses immutable snapshot v3 and the shared first-impression runtime. The retired closed-compound-v1 route is not a fallback. |
| Open/Hyphenated Compound Word Lab | `D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED` | `production_enabled` | Select governed released members through `compound_word_lab:v2` | Read-only Production revalidation on 2026-08-30 found the route head released with seven governed specialist word/skill pairs. Earlier candidate/awaiting-content rows are historical and must not be used as the current route state. |
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

The current profile selector and stable public compiler boundary live in
`lib/adle/morphology/dynamic-prefix-word-lab.ts`; inert V2 contracts and
validation live in `dynamic-prefix-contracts.ts`. Dynamic Prefix v2 now creates
immutable snapshot-v3 lessons through the current route. The fixed `un-` v1
payload, bindings, renderer, and completion contract were retired in E5 after
Production proved zero persisted rows and zero runtime consumers. Production
activation remains controlled by the independent
`ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED` gate.

The V2 boundary accepts reviewed per-skill profiles rather than a dedicated
`un-` renderer. All five profiles (`UN`, `DIS_MIS`, `IN_IM_IL_IR`, `RE_PRE`,
and `SUB_INTER_SUPER`) have guarded shared-compiler migration authority through
shadow, enforced-parity and shared-authoritative modes. The `un-` source is the
approved production profile/member projection, released to staging only by
immutable package `adle_dynamic_prefix_un_profile_staging_v1_2026_08_02`;
synthetic and fixture-only projections are not authority. Missing mappings/content, fingerprints, adapter
parity, plan bindings or counts fail closed before assignment persistence in
enforced/shared modes. The full writer, lifecycle, rollback and cleanup proof
passed on the pinned staging project on 2026-08-02; see
`docs/implementation/qa/adle-dynamic-prefix-shared-compiler-staging-proof-2026-08-02.md`.

The future reviewed-correction bridge must create ADLE candidates only for
`production_enabled` keys. Raw, pending, rejected, dictionary-missing, and
`awaiting_content` corrections must never create an ADLE assignment.

The manual child-QA launcher is staging-only at
`/admin/adle-dynamic-prefix-qa`. It requires the exact pinned staging Supabase
and Vercel identities, authentication, an admin or explicit QA-user allowlist,
and an owned active child. It calls the normal selector and shared assignment
writer, returns only normal `/learn/week/adle` child-session links, and returns
HTTP `404` for production or unknown identities. It is not linked from
production learner or parent navigation.

The local `dynamic_prefix_pedagogy_v1` stage is a deliberate child-tested
presentation refinement rather than compiler parity maintenance. It adds
separate Learn 2/3 teaching cards, selected-prefix corrective feedback,
deterministic three-or-more-choice Build pools, Prefix-specific Reflection,
Prefix result-card suppression, and an 80% Cover track threshold. The
in-/im-/il-/ir- profile gains a genuine four-form choice activity and moves
from 16 to 20 items. The implementation, governed staging release, five core
normal-path completions, final three-card recapture, and 25-image evidence set
are recorded in the [2026-08-03 staging receipt](qa/adle-dynamic-prefix-pedagogy-ux-2026-08-03/staging-receipt.md)
and [evidence index](qa/adle-dynamic-prefix-pedagogy-ux-2026-08-03/adle-dynamic-prefix-pedagogy-ux-2026-08-03.md).
Human screenshot and child acceptance completed on 2026-08-03. The accepted
commit `f2b86d2037a4780a2cf3e3642f75e15319e5f199` was pushed to `main` and
automatically deployed to the production Vercel project as Ready deployment
`dpl_9ywWLPvywZAKTF1ZuN99Q7HL1Hsw`. An authorised production attempt on
2026-08-03 applied and verified only the narrow 20-item persistence allowance,
published and verified the five accepted JSONB projections, and created a
Ready shared-authoritative deployment. The live production QA URL returned a
login redirect instead of the required HTTP `404`, so the activation gate
failed. The compiler override was removed, a deliberate shadow deployment was
made Ready, and guarded deactivation restored all five prior content
projections. Production therefore returned to the safe `shadow` default with
the prior content projection at that checkpoint; the additive narrow migration
remained applied.
See the [production rollback receipt](qa/adle-dynamic-prefix-pedagogy-production-rollback-receipt-2026-08-03.md)
and [production publication handoff](dynamic-prefix-pedagogy-production-publication-handoff-2026-08-03.md).

Corrective commit `ff034e626ec0a217393e0ae3c17e2b902ece2fe0` moved the exact
QA launcher denial ahead of `/admin` authentication. Production shadow
deployment `dpl_55owTwtRpD7p8vfceiQdZTSn4A7c` is Ready and live-proved the
canonical route as HTTP `404` with zero redirects. Unrelated admin login flow
and authorised staging launcher access remain intact. This closes only the
pre-auth route defect in the historical rollback sequence.

Renewed authority then added guarded same-receipt reactivation in commit
`2c6ed3bafed708b3104332c87907be77e45c0ab2`. Fresh production plan SHA-256
`eb2d8039e7e9af922d5325611d7487db4eaaa7c8eebc36f592973cedc24f4661`
reconfirmed the restored profiles, retained rollback, migration, zero Prefix
V2 assignments, and protected hash before the exact accepted projection was
reactivated and verified. Deliberate shared-authoritative deployment
`dpl_6RfsgoWpYnqpkQzVR6hhJsuseo6R` is Ready from that exact commit and owns the
stable aliases. Production QA remains a pre-auth HTTP `404`; unrelated admin
and authorised staging access remain intact. The seven-consecutive-day
natural observation window is active from `2026-08-03T21:56:39Z` through
`2026-08-10T21:56:39Z`. No production learner fixture was created, and the
legacy compiler remains present.

## Prefix profile and compiler migration state

The dynamic profile loader is dictionary-first. It reads only active,
`approved_for_first_exposure` profile, member, word, dictation/audio and
banding facts. Per-word morphology records retain ordered parts, joins,
transformation notes, child-friendly meaning, prefix variant, micro-skill and
source provenance. A profile with any incomplete reviewed fact fails closed.

All five listed production profiles are independently dictionary-backed and
production-enabled. The global route gate does not override a profile record.
Compiler migration does not change production profile activation or Teaching
Dictionary facts. The approved `un-` staging release creates only one disabled
profile and seven members resolved by environment-local `word_key`; it does not
change canonical word, metadata, morphology or dictation rows. Migration
`20260803113000` remains the narrow persistence allowance. The accepted
five-profile projection is active with canonical projection SHA-256
`1abb9e9332cf947ae67cb020eb0cf05bc2c793f061096a1a991e88ddce2e0384`;
protected production snapshot SHA-256 remains
`64d8613911e934927f6ce21e221d0930eeffb7001ef4b9e3a8556679f2e0565e`.
All five compiler authorities remain `shared_migration`, production resolves
`shared_authoritative`, and the designed 140-position suite proves zero legacy
compiler calls in that mode. Observation has started but has not completed;
legacy retirement is not authorised.

## Automatic canonical intake implementation (2026-08-04)

Implementation began from baseline
`3f9dd67519a8967ab65753f210215ee358d3a389`. It adds one typed route-aware
evaluator, durable candidate/demand/link/queue/event storage, a five-minute
protected reconciler, content-release enqueue hooks, and the existing-pattern
admin demand dashboard.

The accepted current-submission classification is 12 ready candidates plus one
`pending_content` Teaching Content Demand for exact target `unlocked`, with zero
Resolver Demands. `urnlocked -> unlocked` remains the reviewed mapping.
Production intake remains disabled and no production schema, configuration,
demand, learning-item, or assignment mutation is authorised by this stage.
The real staging data path has proved the locked `12 activated / 1
pending_content / 1 Teaching Content Demand / 0 Resolver Demands` result,
idempotent replay, and bounded safety-sweep worker with no assignment write.
The owner accepted the two previously removed, unassigned staging-only learning
items as disposable; the post-cleanup count of 83 is the reviewed staging
baseline and no inferred reconstruction was written. Because Vercel Hobby only
supports daily Cron schedules, the five-minute staging sweep is now supplied
by a guarded Supabase `pg_cron`/`pg_net` scheduler that calls the unchanged
application-owned route with Vault-held bearer and Vercel-bypass credentials.
Migration `20260804234500` is staging-only and production-rejecting. See
the [2026-08-04 staging receipt](qa/adle-canonical-intake-staging-receipt-2026-08-04.md).
The exact deployment at local commit `b17b061` is Ready; two natural scheduler
invocations five minutes apart returned HTTP `200` with no timeout and no
protected learner-row change. Canonical intake itself remains disabled.
Production intake remains disabled; a separate production plan is still
required.

The guarded production publication began on 2026-08-05. The accepted
application chain and additive intake schema were published, then the first
attempt stopped before enablement because production lacked a reviewed
five-minute scheduler. A production-pinned Supabase Cron sibling was added by
`b065d8f` and the successful-job completion fix by `59b2ab8`. Migration
`20260805070000` is now applied; natural five-minute invocations returned HTTP
`200` and the scheduler remains active.

Under renewed authority, only submission
`2824a8d5-3839-443f-8450-ecfa524f28bf` was reconciled from exact plan SHA-256
`33f6405a3782f7dc68c184cde1826529142afb8e150da15f203874437ceca023`.
It produced 12 active/reused Prefix learning items, one `pending_content`
candidate for exact target `unlocked`, one Teaching Content Demand, and zero
Resolver Demands. The normal composer created one 18-item
`D4_MOR_PREFIXES_SUB_INTER_SUPER` Dynamic Prefix V2 assignment using
`shared_authoritative` with zero legacy calls.

The real learner route then exposed a pre-existing deferred Generic Snapshot
schema mismatch: the wrapper selected absent column
`daily_assignments.compiled_lesson_snapshot` and returned digest `4110052863`.
The valid intake, demand, lineage and assignment rows were preserved while
future intake was disabled. A separately authorised compatibility correction
(`b9e2b9a` / `ad6bcf7`) now selects one of two explicit daily-plan projections
after a cached exact-column capability check. Production deployment
`dpl_A1keeyi91vV7T2m4rGSKYsnNjrH7` proved the preserved 18-item Prefix V2
assignment with capability `deferred_absent`; its genuine first screen and
resume initialization rendered without learner writes. Deliberate deployment
`dpl_2Ynhce4ofYSfh8mtLCLnwi2J4mB8` restored future canonical intake, and the
natural five-minute scheduler re-evaluated the existing pending candidate
idempotently. At that checkpoint Generic Snapshot remained deferred and Dynamic Affix remained paused,
and the wider backlog remains unprocessed. The child subsequently completed
the genuine assignment. Completion preserved 18/18 items and the authentic
target paths, but exposed two prospective corrections: a hard-coded `un-`
Cleaver retry leaked into the `sub-/inter-/super-` profile, and transfer word
`interact` captured both attempts without taught/evidence pricing. A non-target
Dictation substitution also remained absent from Prefix Reflection despite the
full sentence being stored. The staging-only correction at local commit
`053633b8f92ff031420ce46e2ffc1c526f9707df` proved profile-neutral feedback,
derived context Reflection, and four evidence-bearing versus three
schedule-bearing words. Production history remains immutable and the lifecycle
status remains `CONTROLLED_END_TO_END_PREFIX_LIFECYCLE_AUDIT_REQUIRED` pending
separate publication authority. Controlled end-to-end Prefix trigger proof is
retained. See the
[production release receipt](qa/adle-canonical-intake-production-release-receipt-2026-08-05.md).

That correction is now published prospectively at Git-sourced production
deployment `dpl_5sCXLE6Y4sDZw7kFnqmGTEDesAsw` from exact source `d9695bfd`.
Canonical intake is runtime-proved enabled by a natural successful five-minute
sweep; one demand/link and the 12/1 candidate state remained idempotent. The
historical completed assignment and missing historical `interact` taught/
evidence rows remain untouched. Future natural observation—not synthetic or
backfilled evidence—must prove the corrected Cleaver, Dictation Reflection and
transfer outcome before lifecycle acceptance can close. See the
[focused production receipt](qa/adle-dynamic-prefix-feedback-reflection-production-receipt-2026-08-05.md).

The next natural `re-/pre-` assignment
`c5e661bc-8d10-44f5-8108-2df467299adb` supplied accepted child-facing Meaning
Sort feedback and Dictation-context Reflection observations. An initial audit
correctly found no final form submission; after the explicit completion press,
the re-audit proved 16/16 completion, 14 unique attempt events, one private
Reflection, four taught events, four session-capped `0.75` evidence entries,
three authentic schedules, no transfer schedule, and three idempotent Forge
transitions. No evidence was backfilled. The omitted Cleaver-error interaction
remains required in the next natural lesson. A prospective Reflection
presentation amendment orders the page as teaching recap, `Reflection Time`,
task, target-prefix prompt, Mistakes, then Reflection, with the legacy
MeaningCards boxes suppressed for Prefix. Lifecycle status remains
`CONTROLLED_END_TO_END_PREFIX_LIFECYCLE_AUDIT_REQUIRED`. See the
[RE/PRE durability audit](qa/adle-dynamic-prefix-re-pre-production-audit-2026-08-06.md).

## Dynamic Affix canonical-intake repair and natural `-al` completion (2026-08-08)

The direct Production repair added migration
`20260808093000_fix_dynamic_affix_canonical_intake_persistence`, which makes
the persistence boundary validate an exact reviewed, production-enabled suffix
profile member and retain `dynamic_affix_word_lab:v3`; it no longer silently
downgrades a governed suffix target to generic word-level intake. The same
release added an audited, idempotent canonical-mapping supersession RPC. It
superseded the old hidden `confushon → confusion` SION-syllable mapping and
published the reviewed `D4_MOR_SUFFIXES_SION` replacement.

All 29 existing approved Test 2 suffix candidates were reconciled in place:
29 active Dynamic Affix V3 candidates and 29 active learning items, with zero
duplicate active learning-item identities and no parent-approval rewrite. The
normal parent generator then created the `D4_MOR_SUFFIXES_AL` Dynamic Affix V3
assignment `4ee5f1e2-985b-4da2-8c5b-acdc2fe0dd1e`. It completed naturally:
16/16 items, one Reflection, three authentic bindings and one transfer binding;
the parent reported no complaint. Production deployment
`dpl_C7g2wGXiQJw2JHktR3HXmYxFNvBb` is Ready. See the
[completion audit](qa/adle-dynamic-affix-al-production-completion-audit-2026-08-08.md).

## Documentation update rule

Every activation or retirement must update this register, the D4_MOR readiness
matrix, and the relevant runbook in the same change. Historical plans must link
here rather than state a competing live status.
