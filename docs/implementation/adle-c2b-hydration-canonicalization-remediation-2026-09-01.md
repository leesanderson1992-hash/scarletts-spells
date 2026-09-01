# ADLE C2B hydration canonicalization remediation — 2026-09-01

Status: code complete; Production deployment approval required.

## Production root-cause proof

A guarded `REPEATABLE READ READ ONLY` audit of Production project
`wwohrqtunajrbwxyssjf` compared the latest immutable transition `to_state`
with every persisted target-v2 schedule state.

- Target rows inspected: 18.
- Timestamp text differences: 16.
- Timestamp instant differences: 0.
- Non-timestamp field differences: 0.
- Revision, membership, rung, due date, completion date, failure count and
  episode, policy, and state shape were otherwise exact for all rows.
- No Production mutation occurred.

The historical rows use PostgreSQL text such as
`2026-08-27 10:03:48.542852+00`; current hydration uses canonical ISO text such
as `2026-08-27T10:03:48.542852+00:00`. They are the same governed instant.

## Bounded remediation

`canonicalUtcTimestampExactComparison` creates an exact instant comparison key
for the governed timestamp field. It accepts only explicit ISO/PostgreSQL
timestamp forms with a timezone, preserves up to nanosecond fractional
precision, and normalizes the timezone offset. It is separate from the
millisecond persistence/fingerprint authority, whose behaviour is unchanged.

`equalPersistedTargetStatesForHistory` continues to require the exact target
state shape and byte-exact equality for every field except
`wordLastReviewCompletedAt`. That single field is compared using the exact
instant key. Invalid timestamp forms or genuinely different instants fail
closed. Revision, route, rung, due date, failure lineage, event identity and
transition chaining checks are unchanged.

No migration or historical-data rewrite is required.

Runtime remediation file hashes:

- `canonical-timestamp.ts`:
  `10488c2c07fa08108040da42a1540ff797f2130637bf5cf45696ef6332b1b4fa`
- `runtime-coexistence.ts`:
  `5404148852f5676df5a3616a6f7188fc764d9bedcdb571fb34fea33fef45cb8c`
- Ordered two-file fingerprint:
  `ad9333761dad2bc4867621871d8973d6ea6e9d2aa7b2abda234bb9089bed9dec`

## Verification

- New canonicalization regression: pass; all 18 Production-shaped rows.
- Legacy/canonical equivalent instant: pass.
- One-microsecond different instant: rejected.
- Rung, due date, route, revision and failure-lineage mismatches: rejected.
- Null historical timestamp and canary history: pass.
- Production read-only observation using the local remediation: 18/18 hydrate,
  zero alerts.
- Observation fingerprint:
  `fccb855d78b726295bb0f6ac83f1e5be330e774888e5cef13a7d60c760d11147`.
- Protected Production fingerprints: identical before/after.
- Target policy: inactive and non-default.
- C2B.3–C2B.7, both hotfixes, target reducer, current scheduler and R6: pass.
- Long-horizon runs: 2,400; fingerprint
  `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`.
- Script/application TypeScript, lint, production build and diff check: pass.

The code has not been deployed, committed or pushed in this gate.
