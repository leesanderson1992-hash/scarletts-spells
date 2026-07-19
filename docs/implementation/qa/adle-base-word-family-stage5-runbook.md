# D4_MOR base-word family pilot: staging and evidence runbook

This is a guarded, disabled-by-default pilot. It does not authorise production release, account changes, or data seeding.

## Staging proof

Before loading fixture data, verify the required source migrations are present in
the staging schema and reconcile only those exact versions in the staging
migration ledger. Stop if schema evidence and source differ; do not use raw SQL
or broad `supabase db push`.

1. Run `adle:base-word-family-staging-proof preflight`, then `load` with the exact staging-host acknowledgement, `--apply`, and its confirmation token. This loader is staging-only and records one disposable import batch.
2. Run `setup` with an explicit unused plan date and `ADLE_BASE_WORD_PROOF_ENABLE_TEMPORARY_CHILD=yes`. The harness alone allowlists the child it has just created; it creates exactly two verified authentic learning items: `government` and `replayed`.
3. Enable only that temporary child in `ADLE_BASE_WORD_FAMILY_PILOT_CHILD_IDS`; set `ADLE_BASE_WORD_FAMILY_PILOT_ENABLED=enabled` for the controlled preview only.
4. Confirm one fresh assignment with its exact eighteen bindings: strategy introduction, two tap-to-reveal family matrices, two corrective base-cleaving activities, one multi-round word-sum builder, six controlled spellings, and six contextual dictations. The displayed families must be `play` and `govern`, with no unrelated filler family. The previous 13-item assignment is immutable and must not be reused.
5. Complete, reload, and verify: corrected words only (no raw attempt); keyboard/tap/drag equivalents; immutable payload binding; idempotent completion; authentic-target schedules; transfer first-miss ledger only; no transfer schedule; unchanged reward, mastery, and parent-control records.
6. Disable the preview gate, then run `cleanup` with the same acknowledgement and confirmation. It removes only the recorded child/account and import-batch rows. Record only aggregate counts in the release note.

If `load` stops after creating its batch, do not rerun it. Use the guarded
`recover` command with the same confirmation to remove the one matching
fixture batch, rerun `preflight`, and then retry `load`.

## Production release hold-point

Requires separate explicit release approval, migration-ledger check, and a confirmed Scarlett-only allowlist. The emergency stop is `ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED=true`. Do not enable the gate in this implementation task.

## Private parent observation sheet (kept outside this repository)

For each session record: date; anonymised session ID; elapsed completion time; authentic-target final outcomes; transfer misses and later confirmation; the child's base-word explanation; and effort (`easy`, `just right`, or `hard`) with any confusion, help, stopping, or distress. Disable immediately for privacy, distress/withdrawal, comprehension failure, malformed payload fallback, incorrect scheduling/reward behaviour, or an unexpected account scope.

After five completed or intentionally stopped sessions, review the evidence. Keep the eight guided-word cap unless the evidence supports a separate, approved five-session ten-word experiment. Twelve words remain out of scope.
