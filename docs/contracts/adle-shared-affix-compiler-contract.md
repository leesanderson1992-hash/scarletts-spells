# ADLE shared position-aware affix compiler contract

Status: Dynamic Prefix V2 guarded writer authority for four profiles; `un-`
explicitly deferred; Dynamic Affix V3 remains dark.

## Authority and boundary

`shared-affix-contracts.ts` owns the serialisable V1 input, output, policy and
shared blocker vocabulary. `shared-affix-profile-registry.ts` owns structural
policy for five Prefix V2 and ten Affix V3 profiles. Teaching Dictionary rows
remain authoritative for reviewed profile, member, word and dictation content.
The route registry remains authoritative for public route and payload versions.

The Prefix writer boundary is:

```text
unchanged Prefix selector and selected-word order
→ typed compiler-authority decision
→ normalised reviewed facts
→ pure shared compiler
→ fingerprint validation
→ unchanged DynamicPrefixLessonPayloadV2 adapter and validator
→ assignment-plan/binding/count validation
→ existing atomic persistence
```

Four profiles have `shared_migration` authority: `DIS_MIS`, `IN_IM_IL_IR`,
`RE_PRE`, and `SUB_INTER_SUPER`. `D4_MOR_PREFIXES_UN` has explicit
`legacy_pending_exact_source` authority because staging lacks its normal-path
approved profile row and the old select-only proof used a non-identical
in-memory projection. This is a declared migration state, not failure fallback.

Dynamic Affix V3 remains authoritative on its existing compiler and writer.
The shared Affix adapter is still regression-only.

## Input and selection rules

`AffixLessonCompilationInputV1` carries route, recipe, taxonomy, reviewed
profile facts, canonically sortable word facts, explicit ordered selection,
typed policy and provenance. The shared compiler never selects a learner,
profile, authentic target or transfer; queries a database; or performs a write.

Fact order is canonicalized for hashing. `lessonWordIds`, authentic IDs,
transfer IDs, pedagogical arrays and activity order remain exact. Prefix V2
uses the narrow `legacy_prefix_projection` marker because its public snapshot
does not carry the later true-morphology envelope.

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
rollback mechanism. `un-` is selected as legacy authority before mode dispatch.

The flag owner is ADLE composable lesson migration. Retirement requires seven
production days, 50 successful migrated assignments, at least five per profile,
zero blockers, green performance, and current rollback proof.

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

The migration does not change Prefix selection, V2 persistence, route metadata,
runtime, renderer, resume storage, completion, attempts, evidence, taught
history, review schedules, rewards or child-facing feedback. Common Word Lab
and Generic Snapshot are not activated. No database migration or Teaching
Dictionary mutation is part of compiler authority.

## Proof and rollback

Local proof covers all seven reviewed words in all four authentic positions
for each migrated profile and all three modes, plus mutations, fingerprints,
determinism, plan bindings, zero-write gates and performance thresholds.

Staging proof must pin Supabase `jlhotktspjvffslvuyfz` and Vercel
`scarletts-spells-staged` / `prj_oJkffstOtacc4juYloXajHpjJUha`, reject both
production identities, exercise normal writer paths, verify learner lifecycle
and rollback compatibility, clean every disposable row, and prove profile and
dictionary facts unchanged.

The legacy compiler remains until a separate exact-source `un-` migration and
production observation complete across all five profiles.
