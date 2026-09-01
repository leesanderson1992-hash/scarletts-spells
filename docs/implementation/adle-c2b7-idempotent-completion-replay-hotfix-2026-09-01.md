# ADLE C2B.7 idempotent completion replay hotfix receipt

Date: 2026-09-01

## Outcome

The mixed-policy Review finalizer now resolves an already-completed session
from its singular immutable completion receipt before calling the completion
preparation RPC. A repeated browser submission returns the stored successful
completion with `replayed: true`.

Missing, inconsistent, or conflicting session/receipt evidence fails closed.
The first-completion path, scheduler reducers, persistence SQL, educational
policy, due dates, failure lineage, registry flags, and learner evidence are
unchanged.

## Source identity

Authoritative runtime file:

```text
lib/adle/review-policy/mixed-policy-finalization.ts
SHA-256: de54e99981224743d0c4bd0457e26f083550c29c3d7ba020733e696a71c5eb9a
```

Focused regression:

```text
scripts/adle-c2b7-idempotent-completion-replay-regression.ts
SHA-256: 0f491cd789f0812db365a4806451ed7302c62f298733718e731a7944ba2683b1
```

## Verification

- Exact completed session/receipt replay: PASS.
- Fresh browser idempotency key against the immutable receipt: PASS.
- Microsecond/millisecond timestamp parity: PASS.
- Replay return occurs before preparation RPC: PASS.
- Inconsistent completion evidence fails closed: PASS.
- C2B.2–C2B.7, Review R4–R6, scheduler, Phase B/C and current proficiency
  regressions: PASS.
- Long-horizon simulation: 2,400 runs; fingerprint
  `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`.
- Script/application TypeScript, lint, production build and diff check: PASS.

## Production release

```text
deployment: dpl_H6iEe91wJsESBXmDfS86qS8ghzEd
url:        https://scarletts-spells-cif2cpxru-leesanderson1992-hashs-projects.vercel.app
alias:      https://scarletts-spells.vercel.app
status:     READY
```

Post-deployment login and protected-endpoint smoke checks passed. The release
had zero error-level or HTTP 500 log entries during the observation window.
No SQL, schema, policy flag, scheduler state, learner evidence, or Production
data mutation occurred as part of this code-only hotfix deployment.
