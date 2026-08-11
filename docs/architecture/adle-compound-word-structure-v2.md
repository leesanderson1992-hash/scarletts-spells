# Compound Word structure v2

CW-1 establishes one governed structural contract for both micro-skills in
`D4_MOR_COMPOUND_WORDS`. It changes no canonical-intake route, lesson route,
assignment writer, child runtime, release, or activation.

## Canonical v2 authority

`CompoundWordStructureV2` and the three normalized Teaching Dictionary tables
are the forward authority:

- `canonical_teaching_dictionary_compound_structures_v2` owns the whole word,
  exact micro-skill, reviewed meanings, semantic relationship, eligibility,
  morphology provenance, review, and source provenance;
- `canonical_teaching_dictionary_compound_components_v2` owns densely ordered
  components and required canonical component-word identities;
- `canonical_teaching_dictionary_compound_joins_v2` owns the ordered `none`,
  `space`, or `hyphen` separator between each component pair.

Ordered components and joins are structural truth. Closed/open/hyphenated
classification is derived from joins. Validation requires at least two
components, `joins.length === components.length - 1`, dense stable ordinals,
canonical component IDs, and reconstruction equal to the canonical whole
word's exact display form. Whole and component identities must be active and
approved for first exposure.

The migration creates schema only. It inserts no structure, profile, release,
activation, assignment, or learner row. RLS and grants match the existing
governed curriculum tables.

## Compatibility boundary

The following remain compatibility-only authority for historical replay:

- `canonical_teaching_dictionary_compound_profiles`;
- `canonical_teaching_dictionary_compound_facts`;
- `ClosedCompoundWord`;
- `ClosedCompoundLessonPayloadV1`;
- `closed_compound_word_lab:v1` payload validation and runtime resolution.

`adaptClosedCompoundWordV1ToV2` can project a v1 word into the canonical v2
shape only when a caller supplies the governed component IDs and reviewed
component-to-whole relationship missing from v1. It fails closed rather than
inventing either fact. No historical row or payload is rewritten.

## Review readiness

The deterministic review projection is
`data/adle/review/d4-mor/v2/compound-word-v2-readiness-review.json`. It combines
the approved D4 word analyses with canonical Teaching Dictionary identities,
dictation, and existing released closed facts read inside a read-only
transaction. Null identities or meanings are preserved as gaps.

The committed projection is review evidence, not a release package. Its
`publication_ready` value is false for every current row.

## Future removal boundary

After a later `compound_word_lab:v2` route is released and historical replay no
longer needs the v1 runtime implementation, the closed-only profile loader,
compiler, assignment-plan builder, renderer dispatch, route gate, and
closed-only import/promotion scripts can be considered for removal. They must
not be removed while v1 assignments or release auditability depend on them.

## CW-2 boundary

CW-2 may build the generalized recipe/payload/compiler/loader on the v2
structure, extend shared activity configuration for governed separators and
multi-part compounds, and declare specialist compatibility for both Compound
Word micro-skills. Canonical intake ownership, assignment activation, Model C
publication, separator-aware evidence, and Production learner work remain
separate later scopes unless CW-2 is explicitly authorised to include them.
