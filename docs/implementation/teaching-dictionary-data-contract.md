# Teaching Dictionary Data and Release Contract

## Authority

This document is the implementation contract for Teaching Dictionary content
packages. It supersedes the import/package portions of the historical Phase 5A,
5B and implementation-order documents.

The operating principle is:

```text
human-approved workbook
→ deterministic immutable package
→ validated staging release
→ same-package production release
```

The workbook is the human review surface. The immutable package is the only
database input. Candidate folders and generated SQL are never database inputs.

## Separate content layers

### Canonical word readiness

`canonical_word_batch_v1` makes factual word capability available:

- en-GB identity and display spelling;
- frequency, curriculum/age and complexity bands;
- pronunciation metadata;
- reviewed linguistic morphology and child-facing word sum;
- contextual dictation;
- provenance, source and licence decisions.

It does not diagnose a child, prescribe a micro-skill or create a
word-to-micro-skill support link. A canonical word is used only when a later
approved correction and active teaching route activate it.

### Micro-skill teaching content

`micro_skill_content_batch_v1` is independently governed content for a
micro-skill, including teaching-content versions, field reviews and
transfer-selector profiles. It is not part of a canonical-word batch.

### Factual repairs

`canonical_word_repair_v1`, or an optional
`canonical_word_repairs.csv` within a word batch, must include explicit current
value preconditions and complete reviewed replacement values. A repair
intention without the factual replacement data is retained as a deferred
worklist and is not imported.

## Canonical package format v2

Required files:

```text
release-manifest.json
canonical_words.csv
canonical_word_metadata.csv
canonical_word_morphology.csv
dictation_sentences.csv
teaching_content_sources.csv
```

Optional:

```text
canonical_word_repairs.csv
```

The package contains no empty placeholder teaching-content files. Unknown files
are rejected.

The manifest records the release ID, package type/schema version, workbook and
file hashes, composite package hash, source commit, required migration
versions, reviewed row counts, reviewer/source approval summaries, expected
target tables and prohibited table families.

The composite SHA-256 is calculated from every release-authorising manifest
field: release ID, package type/schema, workbook and CSV hashes, deferred
repair hash, source commit, migration requirements, counts, review and source
approval summaries, and allowed/prohibited target policy. The approved workbook
and any deferred-repair file are hashed again when the package is loaded. The
same reviewed inputs and release ID must produce the same package hash.

## Review and validation gates

Every promoted word must have exactly one active approved row in each factual
file. Validation fails when:

- an identity is duplicated or is not active en-GB;
- frequency, age or complexity banding is missing;
- British IPA, syllable count, stress or schwa status is incomplete;
- morphology is unresolved or an approved analysis has no structured parts or
  child-facing word sum;
- dictation does not contain the target exactly once at the zero-based token
  index, or audio text differs;
- named review is missing;
- a source is not `importable` or its legal status is not `passed` or
  `not_required`;
- a repair lacks its expected current state or reviewed replacement fields.

MorphoLex segmentation is linguistic evidence. It never automatically becomes
a word sum or lesson route.

Transfer selectors use normalised `type:surface` keys derived from the reviewed
structured parts, for example `suffix:ing` and `root:vis`. Coarse source labels
such as `SUFFIX` are retained as evidence but cannot activate a selector by
themselves.

## Database release invariants

- Canonical batches contain 1–1,000 reviewed canonical entries.
- Repairs and reused sources do not count toward the batch limit.
- A conflicting active identity fails closed. An exact existing `word_key` may
  be refreshed only when preflight resolves one active en-GB row. Its canonical
  ID is retained, prior factual rows and the complete before-state are
  preserved, and target-specific new/reused counts are receipted.
- An existing source key is reused only when all factual and legal fields match.
- Exact-package reruns are verified no-ops.
- A reused release ID with different content is rejected.
- The importer writes in one serializable transaction under an advisory lock.
- Inserts are parameterised and chunked; generated literal bulk SQL is not a
  supported release format.
- The transaction assumes `teaching_dictionary_releaser`, which has no write
  rights to learner, assignment, evidence, proficiency, reward or Word Treasure
  tables.
- Verification compares persisted canonical row digests as well as counts.
- Production requires the exact package to be applied and verified in staging.

Canonical releases must create zero support links, teaching-content versions,
learning items, assignments, evidence, proficiency, rewards and Word Treasure
rows.

## Deactivation

Release data is never destructively deleted. Guarded deactivation may supersede
an unused release’s wholly new factual rows. It must block when any runtime
table references a released word. A release that refreshed an existing
canonical identity requires a reviewed restoration or repair release rather
than generic deactivation.
