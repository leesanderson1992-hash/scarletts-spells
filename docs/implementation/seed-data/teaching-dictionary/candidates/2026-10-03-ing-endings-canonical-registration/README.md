# -ing canonical-word registration candidate

This package registers the 50 approved-sheet words that do not yet have an
active Canonical Teaching Dictionary identity. It contains only canonical word
facts: identity, enriched metadata, reviewed-word-sum candidates, and the
supplied dictation sentences. It creates no resolver mappings, learner data,
assignments, evidence, schedules, rewards, or route activation.

The local Teaching Dictionary validator and dry-run importer passed with zero
errors. The dry-run plan contains one source row and 50 rows in each of the
canonical word, metadata, morphology, and dictation tables.

## Controlled Production proof requirement

The controlled proof runs directly against Production using only the named
disposable child fixtures. It verifies a live lesson through Finish,
reload/retry, and persisted completion, attempt, reflection, and reward
records. It does not exercise the ordinary parent-review or Golden Nugget
journey, so controlled `verified_misspelling` rows with controlled source
references must not be used as evidence for that journey.

The existing Teaching Dictionary release CLI still requires an exact staging
release receipt before it will write a canonical package to Production. The
controlled-proof policy changes the ADLE lesson proof; it does not silently
weaken that canonical-content release guard.

## Facts still requiring named release review

The source sheet is approved for its words, definitions, and dictation
sentences. The release contract also requires named factual review of the
enriched pronunciation and morphology fields. British IPA is currently absent
from the source lexicon for `retying`, `putting`, and `reading`; those rows are
kept as candidate facts rather than invented release approval.
