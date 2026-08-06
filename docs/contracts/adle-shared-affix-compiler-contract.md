# ADLE shared position-aware affix compiler contract

Status: Dynamic Prefix V2 shared writer authority is active in production for
all five approved profiles under seven-day natural observation. Dynamic Affix
V3 has an all-ten-profile guarded compiler boundary; production remains on its
unchanged pre-migration application and configuration pending separate release
authority.

## Authority and boundary

`shared-affix-contracts.ts` owns the serialisable V1 input, output, policy and
shared blocker vocabulary. `shared-affix-profile-registry.ts` owns structural
policy for five Prefix V2 and ten Affix V3 profiles. Teaching Dictionary rows
remain authoritative for reviewed profile, member, word and dictation content.
The route registry remains authoritative for public route and payload versions.

The Prefix and Affix writer boundaries are:

```text
unchanged route selector and selected-word order
→ typed compiler-authority decision
→ normalised reviewed facts
→ pure shared compiler
→ fingerprint validation
→ unchanged DynamicPrefixLessonPayloadV2 or DynamicAffixLessonPayloadV3 adapter and validator
→ assignment-plan/binding/count validation
→ existing atomic persistence
```

All five profiles have `shared_migration` authority: `UN`, `DIS_MIS`,
`IN_IM_IL_IR`, `RE_PRE`, and `SUB_INTER_SUPER`. The approved production `un-`
profile is projected to staging only through immutable release
`adle_dynamic_prefix_un_profile_staging_v1_2026_08_02`; synthetic and fixture-
only facts are not runtime authority.

Dynamic Affix V3 retains the existing compiler explicitly as its legacy oracle,
keeps `selectDynamicAffixWordLab` unchanged, and routes both normal assignment
entry points through one consolidated writer. The shared adapter is eligible
only through `dynamic-affix-compiler-rollout.ts`; there is no direct writer-to-
compiler import and no V4 payload.

## Input and selection rules

`AffixLessonCompilationInputV1` carries route, recipe, taxonomy, reviewed
profile facts, canonically sortable word facts, explicit ordered selection,
typed policy and provenance. The shared compiler never selects a learner,
profile, authentic target or transfer; queries a database; or performs a write.

Fact order is canonicalized for hashing. `lessonWordIds`, authentic IDs,
transfer IDs, pedagogical arrays and activity order remain exact. Prefix V2
continues to persist its established public snapshot rather than a new true-
morphology envelope.

## Declarative policy

The shared compiler has no `D4_MOR_*` literal or microskill-key branch.
Profile structure is selected from closed typed split, build, meaning, choice,
schedule, reward, guided-shape and item-count policies.

Prefix loader requirements are also declared with each Prefix mapping:
introduction requirement, required example count, and full versus legacy
dictionary-readiness projection. The registry is not a content source and does
not activate profiles. Loaded forms must match declared forms exactly or the
profile is unavailable.

## Rollout modes

`ADLE_DYNAMIC_PREFIX_COMPILER_MODE` accepts:

- `shadow`: legacy output is declared authority; shared output is compared;
- `enforced_parity`: mismatch or blocker stops before persistence;
- `shared_authoritative`: migrated profiles call only the shared path.

Missing or invalid values resolve to `shadow`. In shared-authoritative mode,
there is no catch-and-call-legacy path. Application deployment rollback is the
rollback mechanism for all five profiles.

`ADLE_DYNAMIC_AFFIX_COMPILER_MODE` accepts `legacy_authoritative`, `shadow`,
`enforced_parity`, and `shared_authoritative`. Unset or blank means
`legacy_authoritative`; an invalid non-empty value fails closed. Shadow returns
the exact canonical legacy V3 bytes after comparison, enforced parity blocks
before persistence on disagreement, and shared authority never calls legacy or
falls back to it. Application deployment rollback is the Affix rollback
mechanism for all ten profiles.

The flag owner is ADLE composable lesson migration. Retirement requires a
separately recorded deletion decision after production rollout, seven
production days, 50 successful migrated assignments, at least five per profile,
zero blockers, green performance, current rollback proof and historical V2
readability.

## Compatibility and fail-closed behavior

The V2 adapter preserves schema/content/profile versions, word/source order,
decomposition, split points, semantic and teaching bases, choices,
introductions, meaning groups, guided shape, dictation, reflection and
authentic IDs under canonical JSON.

Source and compiled-lesson fingerprints are recomputed before adaptation.
Enforced and shared modes block before `persistComposedAdleDailyPlan` for
missing mappings/words, shared blockers, fingerprint drift, invalid adapters,
semantic drift, assignment-plan drift, binding drift or item-count drift.
Shadow may persist a valid legacy result after reporting shared drift because
legacy is that mode's declared authority.

Telemetry is one-line redacted JSON. It contains route/profile/version, mode,
parity/blocker, truncated fingerprints and timings only—never learner identity,
assignment identity, word text, meanings, dictation or payloads.

## Protected behavior

The compiler migration does not change Prefix selection, V2 persistence, route metadata,
resume storage, completion, attempts, evidence, taught history, review schedules or rewards.
It also preserves Dynamic Affix selection, V3 public bytes, item order, runtime,
resume, Reflection and all-word rewards. Dynamic Affix authentic words retain
learning-item transitions and scheduling; transfer words retain taught history,
evidence, state/breadth effects and rewards but do not receive learning items,
review bundles or schedules. New writes fail closed on role/item/schedule
disagreement; historical V3 readers remain unchanged.
The subsequent `dynamic_prefix_pedagogy_v1` presentation stage deliberately
changes Prefix teaching and feedback through additive typed policy while retaining those
persistence boundaries. Common Word Lab
and Generic Snapshot are not activated. No database migration or Teaching
Dictionary mutation is part of compiler authority.

## Proof and rollback

Local proof covers all seven reviewed words in all four authentic positions
for each of the five profiles and all three modes, plus mutations, fingerprints,
determinism, plan bindings, zero-write gates and performance thresholds.

Staging proof must pin Supabase `jlhotktspjvffslvuyfz` and Vercel
`scarletts-spells-staged` / `prj_oJkffstOtacc4juYloXajHpjJUha`, reject both
production identities, exercise normal writer paths, verify learner lifecycle
and rollback compatibility, clean every disposable row, and prove profile and
dictionary facts unchanged.

Production activation on 2026-08-03 uses Ready deployment
`dpl_6RfsgoWpYnqpkQzVR6hhJsuseo6R` from exact commit
`2c6ed3bafed708b3104332c87907be77e45c0ab2`. The accepted five-profile
projection, protected snapshot, retained content rollback, pre-auth QA `404`,
unrelated admin authentication, authorised staging access, all-five
`shared_migration` authority, and zero legacy invocation were proved before
natural observation began. No production learner fixture was created.

The legacy compiler remains as the shadow/parity oracle and rollback aid until
production rollout and observation complete across all five profiles and a
separate retirement stage is approved.

## Dynamic Prefix pedagogy presentation

New reviewed Prefix profiles may opt into `dynamic_prefix_pedagogy_v1`. The
profile projection must supply one complete teaching card per declared target,
at least three deterministic reviewed choices, selected-category mappings, and
a complete choice-verdict matrix for every eligible member. Every matrix must
cover the full selectable pool and accept exactly one declared target. Choice
order remains governed by the separate reviewed choice array because JSONB
object-key order is not semantic. Missing labels, meanings, rules, sources,
audit verdicts, or mappings block before persistence.

The in-/im-/il-/ir- profile uses a four-category Prefix Form Sort and therefore
has 20 assignment bindings. Other Prefix counts remain 16, 16, 16 and 18.
Prefix results presentation is `none`; Dynamic Affix retains its established
overview behavior. Prefix controlled spelling opts into an element-relative
80% Cover track threshold without changing other Cover consumers.

Prefix pedagogy snapshots also carry an additive Cleaver feedback policy.
The shared compiler declares one profile-neutral retry policy for all five
Prefix profiles; renderers do not branch on microskill keys. Its first and
repeated feedback are non-answer-revealing, refer to the serialized teaching
cards, and suppress correct-boundary reveal. Historical Prefix V2 snapshots
without the field remain readable through the compatibility adapter's same
safe default. Dynamic Affix snapshots do not inherit this Prefix-only policy.
