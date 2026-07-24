# Morphology family authoring template

This pack describes proposed base-word-family curriculum data. It is
authoring infrastructure only: creating, validating, or exporting a pack does
not approve its teaching content, import it, activate a route, or create child
learning items.

## Files

- `base_word_families.template.csv` — one proposed family and its teaching
  route.
- `base_word_family_members.template.csv` — proposed family membership and
  lesson-supporting analysis.
- `base_word_route_dependencies.template.csv` — the exact approved-word,
  support, and teaching-content prerequisites observed by the Base Word route.
- `../../../../scripts/validate-base-word-family-intake.py` — a local,
  deterministic structural validator which emits hashes and performs no
  database or network operation.

Copy the templates to a separately named review package before editing them.
The placeholder rows are intentionally not curriculum data and are never
importable.

## Required review boundary

For each family provide a stable `base_family_key`, an existing
`micro_skill_key`, an existing canonical `base_word_key`, source provenance,
and a meaningful etymology route. A family must be a real meaning-and-
structure relationship, not merely a spelling resemblance.

For each member provide its role (`base`, `authentic_target`, `transfer`, or
`optional_transfer_check`), child-friendly meaning, word sum, ordered
morphology parts, joins, and transformations, provenance, and review fields.
`assignment_eligible` may be `TRUE` only with a reviewed dictation sentence,
target-token index, and matching audio text. Every authentic target needs an
exact `support_example` or `review_example` dependency row. Its micro-skill
also needs active, signed-off teaching content with both required explanations.

The current Base Word implementation supports only
`D4_MOR_BASE_WORDS_IDENTIFY_BASE` and
`D4_MOR_BASE_WORDS_PRESERVE_BASE`. A family containing an authentic target
also needs at least one separately eligible `base` or `transfer` member: this
is the runtime transfer-pool requirement.

`approved_for_first_exposure` is a human decision. The validator rejects an
approval status without reviewer identity and ISO-8601 review time, but it
never assigns approval or changes source files. Human review must separately
check factual accuracy, licence, British-English suitability, age suitability,
and exact word-to-micro-skill support.

## Local validation

Run only against a local review package:

```text
python3 scripts/validate-base-word-family-intake.py \
  path/to/base_word_families.csv \
  path/to/base_word_family_members.csv \
  path/to/base_word_route_dependencies.csv
```

The result is deterministic JSON containing row counts, SHA-256 hashes, and
the Base Word runtime-contract result. It is evidence for structural review,
not approval or release authority. A `runtime_contract_ready` value is still
not a route activation, payload compilation result, staging proof, or human
curriculum approval.

## Later delivery gates

Only a separately reviewed delivery change may add an approved immutable
package, a guarded staging import, a staging proof, or a production release.
No authoring pack may silently overwrite previously approved content.
