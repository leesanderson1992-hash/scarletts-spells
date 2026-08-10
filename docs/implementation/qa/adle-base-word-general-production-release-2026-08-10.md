# Base Word general Production release — 2026-08-10

## Decision

Base Word Lab is generally enabled for eligible Production children. Eligibility
remains fail-closed: access alone cannot create a lesson. A child must have two
verified authentic targets for one supported micro-skill, the targets must belong
to two distinct governed families, and the exact enabled Model C release must
supply four eligible transfers and the complete immutable lesson payload.

## Authoritative release

- authoritative main: `650d9be8d2a0f5d48e2a69b98a2650093b641b4e`
- activation-regression correction: PR #40, commit
  `9b375a67c8f00f3d72031c30a85694b2cceaa988`
- Production deployment: `dpl_C9kRzaJ168KoNG3EunrmDkxHRg3S`
- route: `base_word_lab:v2`
- snapshot: `base_word_family_snapshot_v1`
- release ID: `9248ac2c-8d67-4341-b21c-1a5bcd129e30`
- release manifest SHA-256:
  `84e7fde227808806ef3852be1adaac2e9bbf78d8c691007233470464464f796c`
- dependency fingerprint:
  `cdfe674fa41b6b427637cdbce4fabb6d38042bce670abf248aa3392be606847c`
- identify-base activation revision:
  `fbca1b60-cfa0-46c7-b51c-d9cce7d33c44`
- preserve-base activation revision:
  `cdc4fb76-4315-4644-98c1-02c6ac92bedf`

Both activation revisions remained `enabled` and bound to the same immutable
release manifest throughout rollout.

## Gate change

`ADLE_BASE_WORD_FAMILY_PILOT_SCOPE` changed in the Vercel Production environment
from `allowlist` to `all_eligible`. The existing child-ID allowlist was retained
as an inert rollback aid; the access contract ignores it while the scope is
`all_eligible`. The global canonical-intake gate, route activation environment,
Base Word enabled gate, and emergency-disable value were not changed.

Production population was rechecked before expansion: 15 children across three
parent accounts, all controlled project-owner/test records, with no external
learner families identified.

## Acceptance evidence

Before expansion, the governed Model C release verifier confirmed the immutable
release, Teaching Dictionary closure, dependency fingerprint and both enabled
activation heads. The full preservation gate passed for canonical intake,
readiness, demand/reconciliation, Base Word route and persistence authority,
selection, snapshot, session routing, access, completion, evidence and review
scheduling. Dynamic Prefix, Dynamic Affix, generic snapshot and shared activity
registry regressions also passed.

After expansion and redeployment:

- `/` returned the expected `307` authentication redirect and `/login` returned
  `200`;
- the exact main SHA was Ready on the Production alias;
- four Base Word canonical-intake candidates remained present;
- zero Base Word candidates were attributed to a non-`base_word_lab:v2` route;
- one existing Base Word assignment remained valid metadata schema v2;
- zero malformed Base Word assignments existed;
- zero duplicate active learning-item groups existed;
- no learning item or assignment was created by the gate change;
- Vercel reported no Production runtime-error cluster during the release window;
- observed Production requests returned only `200` and expected `307` statuses.

The established lesson contract remains two verified `authentic_target` members
from two distinct families, four transfers, six independent words and 18
immutable assignment bindings. `bed`, `foot` and `sun` remain legitimate
`member_role='base'` members and cannot become authentic targets. No word
blacklist was introduced.

## Architecture preservation

This rollout changed configuration and the activation regression only. It did
not change shared Cleaver, Cover Check, Dictation, morphology primitives,
activity registry, task renderers, writer behaviour, completion/evidence or
review scheduling. Prefix, Dynamic Affix and generic routing were unchanged.

## Rollback

The immediate independent stop is to set
`ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED=true` in Production and redeploy.
If the failure concerns release authority rather than learner access, publish
new `paused` activation revisions for both supported micro-skills using the
governed CAS path. Use `safety_revoked` with `block_incomplete` only for a safety
withdrawal that must also block incomplete assignments. Never delete persisted
lineage, evidence, completed assignments or immutable release facts as rollback.

Immediate disable conditions remain: generic route downgrade, application/RPC
authority disagreement, non-authentic or wrong-release membership acceptance,
duplicate active items or approvals, 2+4/6/18 drift, malformed runtime routing,
completion/evidence/review drift, neighbour-route regression, or unexpected
Production errors.
