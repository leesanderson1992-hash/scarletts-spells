# Gold Bar authentic-use alignment — GB.1–GB.4 implementation receipt

Date: 2026-09-01

Status: implemented and regression-proved; **not Production-active**.

Policy: `WORD_TREASURE_AUTHENTIC_USE_V2`

## Delivered boundary

- GB.1 aligns reward, evidence-lineage, proficiency-matrix, authority-manifest,
  and current-state documentation.
- GB.2 adds an append-only Review qualification ledger and the atomic
  `record_review_writing_gold_bar_use_v2` reward transaction.
- GB.3 consumes only the immutable prompted-use event after successful Review
  finalization. It runs with `after()` and catches reward failures, so Review,
  C2B scheduling, and specialist continuation are not rolled back or blocked.
- GB.4 adds a fail-closed contextual-use interface. Non-context-sensitive words
  return `NOT_REQUIRED`; bounded high-confidence homophone rules return
  `VALID`/`INVALID`; every unsupported or unresolved case returns `UNCERTAIN`.

Review writing retains `REVIEW_WRITING_AUTHENTIC_USE` and prompted contextual
provenance. Existing parent-confirmed writing now records the explicit
`SPONTANEOUS_AUTHENTIC_USE` source-class metadata without changing its approval
or counter behaviour. Proficiency and final-rung retirement rules are not
changed.

## Durable identity and threshold

The qualification ledger enforces one row per source authentic-use event, one
row per Review encounter, and one row per `(treasure_id, review_session_id)`.
The reward event additionally uses the existing unique
`(treasure_id, event_type, source_type, source_entity_id)` identity with the
Review session as source entity. The transaction locks the Treasure row,
rechecks Review/source/encounter/canonical-word lineage and Forge timing,
inserts the reward event, increments the counter, and awards the bar together.

The transaction reads `required_uses_for_bar`; it does not hard-code or change
the threshold. Disposable-schema proof confirmed its default remains `5`.

## Release gate

`reviewWritingGoldBarGateConfig` returns no configuration in
`VERCEL_ENV=production`, regardless of feature variables. Outside Production,
the path additionally requires both:

- `GOLD_BAR_REVIEW_WRITING_ENABLED=enabled`
- a valid prospective `GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT`

The submitted-writing timestamp must be on or after both that effective time
and `entered_forge_at`. There is no backfill or historical reinterpretation.
Removing the Production code boundary is GB.5 and needs separate approval.

## Regression proof

Passed:

- `npm run word-treasure:gold-bar-authentic-use-alignment-regression`
- application TypeScript check (`npx tsc --noEmit`)
- `npm run typecheck:scripts`
- targeted ESLint on all changed runtime/regression TypeScript
- `npm run adle:authority-docs-check`
- `npm run adle:review-r5-regression`
- `npm run adle:review-r6-regression`
- `npm run adle:reward-bridge-regression`
- `npm run adle:final-rung-retirement-regression`
- `npm run adle:learner-evidence-regression`
- `npm run adle:c2b-production-observation-regression`
- `npm run word-treasure:returned-correction-repair-regression`

The new migration also compiled successfully on a disposable clone of the
repository's production-shaped local schema after applying the governed
migration ancestry through FR.2. The proof confirmed the qualification table,
atomic RPC, and unchanged `required_uses_for_bar` default. The disposable
database was removed after the check; the source template was read only.

No migration was applied to Production. No deployment, activation, historical
award, commit, or push was performed.
