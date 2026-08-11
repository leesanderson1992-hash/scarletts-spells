# Compound Word lesson v2

CW-2 is based on authoritative main SHA
`d54712b34355021f1d1afd7b8613c5d590965f97`. It defines one inactive
`compound_word_lab:v2` recipe/runtime contract for both Compound Word
micro-skills. It does not change canonical intake, the active assignment
writer allow-list, Model C release rows, activation, or learner data.

## Canonical going forward

- `CompoundWordStructureV2` remains the sole governed representation of
  ordered canonical components and joins.
- `CompoundWordLessonPayloadV2` nests that structure rather than copying it.
- `compileCompoundWordLessonV2` selects four deterministic words through one
  code path for closed, spaced, hyphenated, and multi-part structures.
- `CompoundWordTaskConfigurationV2` derives split, jigsaw, assembly, meaning,
  recall, and dictation configuration from the governed structure.
- `DictationTargetSpanV2` represents inclusive-start/exclusive-end token spans
  and preserves the exact governed answer. Existing one-token payloads retain
  their compatibility adapter.
- `exact_governed_form` is the shared answer-policy contract for
  separator-significant work. It does not alter existing evidence
  normalization in CW-2.
- `MOR_COMPOUND_JIGSAW` and `MOR_COMPOUND_MEANING_CONNECTION` are registered
  once in the common activity registry. Generic compilation marks these
  route-owned modes unsupported rather than duplicating them.

The pure v2 assignment projection retains the existing 18-item lesson shape:
two introductions, four jigsaws, four meaning connections, four Cover Checks,
and four dictations. Learner-backed words retain their `learningItemId` and
source lineage in the payload, lesson-word projection, and assignment items.
Generated transfer words have no learner-item provenance.

The route registry declares both Compound Word micro-skills compatible with
`compound_word_lab:v2`, but its ownership is `recipe_contract_only` and
`newAssignmentCapable` is false. The production Today service and the active
assignment-writer allow-list therefore remain unchanged.

## Shared interaction extensions

- `SplitHandle` accepts all governed boundaries and completes only after each
  boundary is found. Existing single-boundary callers are unchanged.
- `CompoundJigsawActivity` accepts ordered two-or-more components and governed
  joins while keeping its pointer and keyboard interaction.
- `SnapRail` accepts ordered joins and reconstructs the exact written form;
  omitted joins preserve legacy concatenation.
- `CoverShutter` displays every governed component boundary.
- `MeaningConnectionActivity` optionally presents reviewed component meanings
  and the reviewed component-to-whole relationship.

## Compatibility only

`closed_compound_word_lab:v1`, `closed_compound_lesson_v1`, the v1 profile and
fact loader, historical payload validation, route resolution, resume keys, and
assignment rendering remain readable. The v1 renderer now delegates to the
same generalized lesson runtime view and generalized jigsaw primitives without
rewriting historical payloads.

## Future removable

After v2 has a governed Model C release and historical replay no longer needs
the old runtime path, the closed-only compiler, assignment plan, profile
loader, route gate, v1 renderer adapter, and closed import/promotion scripts
can be retired. The shared activity components and v1 payload reader remain
until their respective compatibility obligations end.

## CW-3 boundary

CW-3 owns canonical-intake route adoption, immutable curriculum/profile
publication, Model C dependency authority and activation, assignment-writer
enablement, multi-token target use in server-side evidence normalization,
completion/scheduling proof for authentic lineage, reconciliation of existing
Compound candidates, and guarded non-Production end-to-end proof. CW-2 does
not perform any of those actions.
