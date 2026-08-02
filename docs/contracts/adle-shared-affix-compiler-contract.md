# ADLE shared position-aware affix compiler contract

Status: implemented in shadow; no production route, writer, reader or renderer consumes this compiler.

## Authority and boundary

`lib/adle/morphology/shared-affix-contracts.ts` owns the serialisable V1 input,
output, policy and blocker vocabulary. `shared-affix-profile-registry.ts` owns
the complete declarative mapping for the five Dynamic Prefix V2 and ten
Dynamic Affix V3 production microskills. `shared-affix-compiler.ts` is a pure
compiler. It receives already-selected words and never selects a learner,
microskill, authentic target or transfer word; queries a database; persists a
snapshot; or decides completion, evidence, scheduling or rewards.

The current boundary is:

```text
unchanged Prefix V2 or Affix V3 selector
→ normalised reviewed affix facts and explicit selected-word order
→ pure shared position-aware compiler
→ non-persisted CompiledAffixLessonV1
→ V2 or V3 compatibility adapter
→ exact current payload comparison
```

Dynamic Prefix V2 and Dynamic Affix V3 remain authoritative. Production does
not dual-compile. The shared path runs only in regressions and the host-pinned,
select-only staging proof.

## Input and selection rules

`AffixLessonCompilationInputV1` carries the versioned route and recipe,
taxonomy, one `NormalisedAffixTeachingProfileV1`, canonically sortable reviewed
word facts, an explicit ordered selection, typed policy and provenance.
Selection order is separate from fact order: shuffling the reviewed fact array
cannot change compiled output or fingerprints, while the unchanged selector's
`lessonWordIds` order remains exact.

Only the repository-proven positions `before` and `after` exist. No
`both_sides`, base-family or multi-affix variant is declared. Prefix V2 words
use the explicit `legacy_prefix_projection` review marker because V2 does not
carry the structured true-morphology envelope. Affix V3 copies its reviewed
true morphology, semantic base, teaching surface, transformations, notes and
provenance without spelling inference.

## Declarative policy

The compiler contains no `D4_MOR_*` literal and no microskill-key branch.
Profile differences are selected from closed typed variants:

- split: first word; distinct forms then fill; guided budget after one build
  per represented form; or one per form otherwise direct/changed contrast;
- build: another form or first; one per represented form; every lesson word;
  or one per represented form preferring a non-split word;
- meaning: none or sort all lesson words;
- choice order: declared order or the released stable suffix rotation;
- scheduling: authentic targets for Prefix V2 or all lesson words for Affix
  V3; rewards remain all four production words.

Intentional item counts remain 16 or 18. Assignment-binding specifications
retain the current section, template, evidence kind and activity identifiers.

## Compatibility

`shared-affix-compatibility.ts` normalises current selected facts and adapts a
compiled lesson back to `DynamicPrefixLessonPayloadV2` or
`DynamicAffixLessonPayloadV3`. It must preserve schema versions 2 and 3,
content versions, word/source order, decomposition, split points, semantic and
teaching bases, choices, introductions, meaning groups, guided activity shape,
dictation, reflection and authentic IDs exactly under canonical JSON.

No shared payload is persisted. Existing assignment-plan builders, route
metadata, runtime adapters, renderers, resume formats, completion actions,
evidence, taught history, schedulers and reward bridges remain unchanged.

## Fail-closed and fingerprints

Compilation returns typed blockers from `SHARED_AFFIX_BLOCKER_CODES`; it never
returns an unexplained `null`. Missing or contradictory decomposition,
reconstruction, form, semantic base, teaching surface, reviewed
transformation, meaning, counts, coverage, binding or adapter parity blocks.

Canonical JSON and SHA-256 produce a source fingerprint and compiled lesson
fingerprint. Undefined optional properties are omitted before hashing.
Reviewed facts are sorted for the source fingerprint; pedagogical arrays and
the explicit selection order are not sorted.

## Proof and rollback

The generated profile and blocker inventories live under
`docs/generated/adle-composable-lesson/`. Local coverage includes every
reviewed package target, all policy variants, supported transformations,
mutation blockers, deterministic order, payload versions, runtime
reconstruction and assignment bindings.

The redacted staging receipt is
`docs/implementation/qa/adle-shared-affix-staging-proof-2026-08-01.json`.
The proof pins the staging project, rejects production, permits only GET/HEAD,
creates no learner or assignment fixture, performs no remote write and places
all 75 assignment-eligible words in all four authentic slots.

Application rollback is deletion or reversion of the four dark shared-affix
modules, their test/proof scripts, generated inventories and documentation.
No database, route, persisted payload or historical assignment rollback is
required because none changed.
