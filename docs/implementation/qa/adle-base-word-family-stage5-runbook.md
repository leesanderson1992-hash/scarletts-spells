# D4_MOR base-word family pilot: staging and evidence runbook

This is a guarded, disabled-by-default pilot. It does not authorise production release, account changes, or data seeding.

## Staging proof

1. Create an anonymised staging parent and child, then add reviewed fixture families and two verified authentic learning items.
2. Enable only that child in `ADLE_BASE_WORD_FAMILY_PILOT_CHILD_IDS`; set `ADLE_BASE_WORD_FAMILY_PILOT_ENABLED=enabled`.
3. Generate one assignment and confirm its exact thirteen bindings: strategy intro, family matrices, word sums, five controlled spellings, and five dictations.
4. Complete, reload, and verify: immutable payload binding; idempotent completion; authentic-target schedules; transfer first-miss ledger only; no transfer schedule; unchanged reward, mastery, and parent-control records.
5. Delete the staging assignment, fixtures, pilot-run record, allowlist entry, and gate setting. Record only aggregate counts in the release note.

## Production release hold-point

Requires separate explicit release approval, migration-ledger check, and a confirmed Scarlett-only allowlist. The emergency stop is `ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED=true`. Do not enable the gate in this implementation task.

## Private parent observation sheet (kept outside this repository)

For each session record: date; anonymised session ID; elapsed completion time; authentic-target final outcomes; transfer misses and later confirmation; the child's base-word explanation; and effort (`easy`, `just right`, or `hard`) with any confusion, help, stopping, or distress. Disable immediately for privacy, distress/withdrawal, comprehension failure, malformed payload fallback, incorrect scheduling/reward behaviour, or an unexpected account scope.

After five completed or intentionally stopped sessions, review the evidence. Keep the eight guided-word cap unless the evidence supports a separate, approved five-session ten-word experiment. Twelve words remain out of scope.
