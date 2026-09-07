# Whole-writing S6 — known spelling errors and separate learner retries

**Baseline:** `adfbd571aa0811fe8d224b34310ed086864736d7`  
**Implementation branch:** `codex/s6-known-errors-retries`  
**Status:** implemented locally; all controls default off; no consequential consumer is enabled.

## Authority and scope

S6 reuses the approved S4 governed relationships, E1 publication/replay path,
S5 occurrence identity and Phase C shadow lineage, the resolver-visible
token-safe canonical spelling mappings, and the existing parent review and
returned-correction workflow.

The integrated E1/S5 baseline required these targeted adjustments to the
roadmap:

- each S6 check is keyed to the stable S5 occurrence rather than a flattened
  writing-sample offset;
- E1 partial replays select current S6 checks per occurrence using the same
  authority-event and completion ordering as S5;
- a replay creates an append-only exact historical link and cannot create a
  second parent review candidate for the same occurrence;
- exact retry equality establishes correctness only. Independence, assistance
  and answer visibility remain separate facts and default to `unknown`;
- context-required mappings remain absent from S6 and wait for S8.

There is no Target Word, taught-history, Forge, reward or review-schedule
filter. Every extracted learner-authored occurrence is checked. Unknown or
excluded authorship is recorded as ineligible rather than discarded.

## Runtime

`writing_shadow_controls` has two independent default-off switches:

- `known_error_detection_enabled` runs deterministic known-error checks;
- `known_error_review_enabled` materialises current findings into the existing
  `misspelling_instances` parent-review surface.

The worker requests only resolver-visible, active, token-safe governed
mappings. It groups multiple mappings that agree on one correction into one
occurrence finding and abstains when governed mappings conflict. It reads the
mapping authority twice and fails the run if the fingerprint changes during
analysis.

Every enabled run writes one check for every occurrence. A check is one of
`FINDING`, `NO_MAPPING`, `ABSTAINED`, or `INELIGIBLE_AUTHORSHIP`. The batch,
checks and findings commit in the same transaction as the existing S5 result.
Findings retain their mapping IDs, exact micro-skill keys, authority references,
dialect and normalisation version.

Review materialisation runs before and after each bounded worker batch. It
waits until the existing writing sample is available, writes no flattened
position claim, and preserves the exact field path and UTF-16 range in governed
metadata. The existing parent review remains the release gate. S6 does not
send automatic child feedback.

## Persistence and lineage

Migration `20260907100000_add_whole_writing_known_errors_and_retries.sql` adds:

- append-only `writing_known_spelling_batches`;
- append-only occurrence-complete `writing_known_spelling_checks`;
- append-only `writing_known_spelling_findings` with `ORIGINAL` or
  `EXACT_HISTORICAL_MATCH` lineage;
- current per-occurrence views that preserve unaffected rows during partial E1
  replay and allow a later `NO_MAPPING` check to supersede a prior finding;
- exact `source_writing_occurrence_id` lineage through misspelling, suggestion,
  issue and correction-attempt records;
- separate `correction_outcome`, `assistance_state`, and `answer_visibility`
  columns on correction attempts;
- service-only aggregate and repeated-pair observability views.

Correction-attempt fact fields are immutable after insertion. Existing legacy
attempts remain unchanged. The legacy `corrected_independently` column remains
for compatibility, but new returned attempts set it to false unless a future
authority supplies explicit independence evidence.

S6-originated `misspelling_instances` survive ordinary legacy re-analysis. The
legacy analyser carries their occurrence-linked rows forward rather than
deleting them because their source offsets are intentionally field-local.

## Safety boundaries

S6 does not:

- qualify Phase C evidence;
- create or final-classify a learning issue;
- create an ADLE learning item or remediation lesson;
- emit Authentic Use;
- alter proficiency, rewards, review schedules or retirement;
- infer context correctness;
- infer independence from an answer match;
- use runtime AI;
- modify or adopt the unconfirmed Context Resolver proposal.

G2 remains required before automatic child-facing feedback or repeated-error
escalation can be activated. S7 remains responsible for unresolved/unknown
errors and ADLE remediation.

## Verification

The local pure regression covers repeated occurrences, Target-independent
coverage, unknown authorship, agreed multi-skill mappings, conflicting
corrections, stable replay identity and correction/independence separation:

```text
npm run writing:s6-regression
```

The disposable PostgreSQL 18 proof applies the unmodified S1–S5/E1 migrations
and the S6 migration, then verifies append-only storage, current/history
selection, review deduplication, parent-review lineage, immutable repair facts,
service-only reads and observability:

```text
WRITING_PROOF_RUNTIME=/tmp/scarlett-writing-proof-runtime \
  node --import tsx --conditions=react-server scripts/prove-whole-writing-local.mjs
```

The proof connects to no application or Production database. A Preview/staging
proof is still required before either S6 switch is enabled outside local
development.

## Rollout and rollback

Apply the additive migration in Preview/staging, leave both switches off, and
run the disposable proof cohort. Enable detection first and inspect current and
historical S6 counts. Enable review materialisation only after candidate
reconciliation shows no duplicate occurrence links.

Rollback disables review materialisation first, then detection. Historical
checks and parent decisions remain intact. No reward, proficiency or learning
consequence needs reversal because S6 has no such writer.
