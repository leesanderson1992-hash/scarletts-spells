# Whole-writing S7 — unknown errors and ADLE remediation

## Status and authority

S7 is implemented from the proven E1/S5/S6 baseline
`cacd9cbb2d1829ad02c03da3d156547b73768c81` on
`codex/s7-unknown-errors-adle-remediation`.

The approved S7 plan remains valid. The integrated baseline already provides
immutable submissions, indexed word occurrences, canonical interpretations,
governed word–skill relationships, shadow Phase C projections, known-error
materialisation and separate retry facts. S7 therefore extends the existing
parent-review, catalog-review, Stage-F replay and canonical-intake authorities;
it does not create a second lesson queue or a new remediation policy.

The implementation uses these existing authorities:

- parent confirmation of the observed spelling and intended word;
- the returned-correction issue and retry workflow;
- parent-local skill selection and the existing catalog-review route;
- explicit administrator catalog decisions;
- the released Stage-F replay plan and apply operation;
- the canonical-intake authorization, reconciliation and readiness backlog;
- existing ADLE learning-item source receipts.

## Parent and learner flow

1. In Parent Review, the parent enters the spelling the child wrote and the
   intended word.
2. If the indexed submission contains one exact learner-authored occurrence,
   the finding is linked automatically. If it contains several identical
   occurrences, the parent selects the exact location. If no indexed occurrence
   is available, the finding is still retained for later enrichment.
3. The child receives the existing correction opportunity. The original error
   remains distinct from the retry fact, including correctness, assistance and
   answer-visibility state.
4. A successful retry is retained as repair and does not become independent
   positive evidence. An unresolved retry follows the existing governed mapping
   workflow.
5. A resolver-visible exact mapping can continue through the established route.
   Otherwise the parent can select an existing local skill or request catalog
   review. Parent suggestions remain candidates rather than global authority.
6. After an explicit administrator decision, only a safe Stage-F plan supported
   by that decision is applied. The same occurrence then enters canonical intake
   once. Missing mappings, conflicting skills or unavailable content remain in
   the existing review or readiness backlog.
7. Canonical intake creates or links the existing ADLE learning need when its
   established readiness rules permit. S7 does not insert directly into
   `adle_learning_items`.

## Persistence and lineage

Migration `20260907110000_integrate_whole_writing_unknown_error_intake.sql`
adds an indexed, nullable `source_writing_occurrence_id` to:

- `parent_verified_spelling_candidate_mappings`;
- `spelling_catalog_review_cases`;
- `spelling_canonical_mapping_recommendations`;
- `adle_canonical_intake_candidates`;
- `adle_learning_item_sources`.

Database triggers derive and validate that lineage against the existing source
misspelling or candidate mapping. They reject occurrence conflicts and
parent/child scope mismatches. Late exact linking propagates through existing
downstream receipts. The service-only S7 authorization wrapper preserves the
released canonical-intake authorization and adds the whole-writing occurrence
to its receipt.

The service-only `writing_unknown_error_intake_observability` view reports
occurrence-linked parent findings, candidate mappings, catalog cases, intake
candidates and learning sources without exposing raw writing.

## Runtime controls and failure behaviour

Parent-added findings remain controlled by the existing review workflow and S6
whole-writing capture/materialisation controls. Automatic continuation after an
administrator decision additionally requires the existing
`ADLE_CANONICAL_INTAKE_ENABLED` control. When disabled, the administrator's
decision is saved and no canonical-intake continuation runs.

The continuation is scoped to the decided catalog case, admits only
`admin_decision` route support, and is idempotent. Unsafe or incomplete plans
remain blocked and observable. A retry after Stage-F application resumes from
the existing facts rather than applying another repair.

## Explicit exclusions and owner gates

S7 does not add runtime AI, contextual-use analysis, automatic parent feedback,
new skill inference, guessed “tricky word” routing, positive repair evidence,
Gold Bars, proficiency changes, Authentic Use, review changes or retirement
changes. It neither modifies nor adopts the unconfirmed Context Resolver
proposal.

G2 still governs automatic feedback and repeated-error escalation. This slice
uses explicit parent and administrator actions and does not activate either
policy. S8 remains responsible for contextual correctness and homophone or
near-homophone misuse.

## Verification

The S7 regression covers exact and ambiguous occurrence selection, unavailable
occurrences, safe admin continuation, idempotent continuation, disabled
behaviour and architectural source guards. The disposable PostgreSQL proof
applies the migration unchanged and verifies lineage derivation, conflict and
child-scope rejection, late-link propagation, canonical-intake authorization,
service-only observability and compatibility with canonical-only learning-item
sources.

Completion additionally requires the repository type check, focused lint,
relevant S6/returned-correction/canonical-intake regressions, production build
and a disposable staging proof against the branch preview. Production deployment
or production migrations are not part of S7 development.

## Staging proof receipt — 7 September 2026

The additive migration was applied only to fixed staging Supabase project
`jlhotktspjvffslvuyfz`, after verifying every S1–S6 predecessor through
`20260907100000`. Its SHA-256 is
`4ab458844e06072e14a8ef7eeb7bf5d585b116238bece36f87c78d94c765c8e4`.
The migration ledger records version `20260907110000`. No Production database
was contacted.

The disposable runner used the READY staging Preview at
`scarletts-spells-staged-p6optzhph.vercel.app`. It submitted learner writing,
extracted the immutable occurrence, attached a parent-identified unknown error,
stored an incorrect retry, materialised the existing parent-approved governed
source and seeded the existing canonical-intake queue. The intake candidate
remained `queued`; all protected consequence counts were unchanged.

The output was:

```json
{"status":"passed","project":"jlhotktspjvffslvuyfz","preview":"scarletts-spells-staged-p6optzhph.vercel.app","exactOccurrenceLineage":true,"separateIncorrectRetry":true,"canonicalIntakeCandidate":"queued","protectedConsequenceChanges":0}
```

Cleanup removed the technical intake candidate first, temporarily disabled only
the existing consumed-source delete guard inside one database transaction,
deleted the disposable governed source and parent, restored the guard before
commit, and verified zero child residue. This is necessary because the existing
R8D authority correctly prevents ordinary deletion of a source after canonical
intake has consumed it.

Run the proof only with the fixed staging Preview environment loaded:

```text
npm run writing:s7-staging-proof
```
