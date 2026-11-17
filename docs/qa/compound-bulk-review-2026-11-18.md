# Compound Bulk review

## Scope

Extend the existing stepped workbook workflow to Closed Compounds and
Separated/Hyphenated Compounds. Reuse the governed compound package publisher,
activation checks, canonical Dictionary identity, selected meaning bindings,
and immutable lesson snapshots. Prefix, suffix and comparative publication
paths keep their existing behavior.

The workbook holds reviewed meanings, pronunciation and dictation, typed
component parts, join dropdowns, a primary teaching component family, and one
plain-text explanation of the whole meaning. Existing approved compound
explanations are prefilled; the remaining explanation can be edited and
rechecked in Preview. No admin JSON entry is introduced. Component dictionary
identities are resolved from the approved underlying words. Missing component
words are reported for correction rather than invented.

All canonical skill assignments, native released compounds, import requests
and pending drafts are included. Active words leave the default review export
only when canonical facts are complete and no unpublished update remains.
The separate full pool export follows the actual activated runtime pool.
Historical lesson availability is preserved while legacy words are reconciled.

Multiple existing component-family links remain intact when parts are
unchanged. The flat workbook shows one primary component family; changes to
parts with several reviewed family links require review on the word page so
no other component's link is silently discarded.

## Compatibility repairs

- A historical separated-compound teaching authority with no reading pages
  returns its existing fallback rather than dereferencing an absent array.
- The compound durable snapshot validator accepts the compiler's established
  C-collated fingerprint, while retaining its historically accepted database
  hash. Shared hash functions, structural checks, and stored snapshots do not
  change. Tampered content or malformed activities remain invalid.
- Publishing or rolling back a disposable staging compound package preserves
  the existing child allowlist. Production activation behavior is unchanged.
- Compound publishing and rollback share a route-level transaction lock, so
  the two groups cannot deadlock while locking their shared Dictionary closure.

## Verification

The initial staging fixture uses the human-approved compound structure,
dictionary closure and teaching releases. Its source words and component
meanings come from those reviewed artifacts. It does not copy learner data.

The real workbook importer, family creation/selection, Overview and route
reviews, governed publisher, runtime loader and assignment persistence were
exercised with framework authentication/cache/redirect adapters mocked in the
explicit staging scripts:

- bedroom and playground: closed spelling, new bed family and existing play
  family; incorrect join rejected; both publish; the other five remain queued.
- ice cream and part-time: open and hyphenated spellings, new component
  families; legacy spoken-syllable/stress mismatch flagged and corrected in
  the reviewed staging workbook; both publish; the other five remain queued.
- Existing compounds are republished. The two bed/room component families of
  bedroom remain linked to its current approved morphology.
- A separated-compound rollback leaves both words in the pending and review
  queues, retains the disposable child scope, and can be retried.
- Saved four-word ADLE snapshots include both newly reconciled target words
  for each lesson. Multi-token dictation remains bound to the complete open
  compound.

Reproducible checks:

- `scripts/compound-workbook-candidate-regression.ts`
- `scripts/compound-workbook-staging-proof.cjs` (requires the disposable staged
  release; use `--repeat` for already reconciled targets)
- `scripts/compound-snapshot-database-staging-regression.mjs` (read-only,
  against the saved compiled QA snapshot)
- Existing compound release and reading-page regressions, prefix pedagogy,
  all four comparative candidate rules and the 38-check ADLE semantic baseline.
- TypeScript and focused ESLint.

Production rollout deploys the workflow and the bounded compatibility
migrations. Production editorial words are left for the owner to review and
publish; no production workbook is applied as part of this rollout.
