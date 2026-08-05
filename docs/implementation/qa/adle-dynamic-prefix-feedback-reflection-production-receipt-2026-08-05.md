# Dynamic Prefix feedback, Reflection and transfer-evidence production receipt

Date: 2026-08-05  
Environment: production  
Publication status: published prospectively; future natural acceptance pending

## Scope and source

This receipt closes the authorised production publication of the staging-accepted
Dynamic Prefix correction without changing curriculum projections, selection,
historical attempts or learner evidence.

- Baseline: `b2f25b2c821d8e9dfedcb12c1f5ea1252e067ce6`.
- Implementation: `053633b8f92ff031420ce46e2ffc1c526f9707df`.
- Staging closeout: `d9695bfd65374d4c6f5a9f9b56c507bdbc5bc0a6`.
- Both accepted commits were pushed to `origin/main` without force.
- GitHub linked exact source `d9695bfd65374d4c6f5a9f9b56c507bdbc5bc0a6`
  to successful production deployment `dpl_5sCXLE6Y4sDZw7kFnqmGTEDesAsw`.
- The stable production alias resolves to that Ready deployment.

The verified identities were Vercel project `scarletts-spells` /
`prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl` and Supabase project
`wwohrqtunajrbwxyssjf`. Staging project `jlhotktspjvffslvuyfz` was rejected.

## Environment restoration

`ADLE_CANONICAL_INTAKE_ENABLED` is a sensitive Vercel variable. A Vercel
environment export represents its value as an empty string and therefore is
not evidence of the effective runtime value. Under explicit authority, the
single production variable was overwritten with the exact supported value
`enabled`; no other environment variable was targeted.

Deliberate deployment `dpl_84TPRoLkmzuxbuFiLeE4oojc2Z4J` first made the
restored value effective from a clean clone of the accepted SHA. After the
accepted commits reached `origin/main`, Git-sourced deployment
`dpl_5sCXLE6Y4sDZw7kFnqmGTEDesAsw` became Ready and took the stable aliases.

Runtime proof came from natural five-minute scheduler calls rather than secret
inspection:

- `2026-08-05T21:30:00.367819Z`: HTTP `200`, no timeout;
- `2026-08-05T21:35:00.247991Z`: HTTP `200`, no timeout on the Git-sourced
  deployment;
- the existing `unlocked` candidate was re-evaluated at
  `2026-08-05T21:35:05.318629Z`;
- 12 candidates remained `activated`, one remained `pending_content`, one
  occurrence-one Teaching Content Demand and one waiting link remained;
- no active reconciliation job remained and no wider-backlog candidate was
  created.

## Published prospective behavior

The exact deployed source now provides:

- one typed, profile-neutral Dynamic Prefix Cleaver retry policy that references
  the current teaching cards, discloses no answer, never falls back to `un-`,
  and ends with `Try again.`;
- target/context Dictation separation, deriving non-target sentence spelling
  slips from the existing full sentence attempt without creating another raw
  answer store;
- Prefix Reflection display of those context slips while preserving target
  correctness, target evidence, resume text and existing questions;
- evidence-bearing versus schedule-bearing completion sets, so a correct
  transfer word receives one taught event and one same-session-capped `0.75`
  lesson-production evidence contribution without receiving a learning item,
  review bundle or spaced schedule solely from transfer use.

The focused regression covers all five Prefix profiles, context-slip token
normalisation, target/context independence, same-session non-stacking and the
transfer scheduling boundary. Dynamic Prefix remains `shared_authoritative`;
the shared-authority suite proves zero legacy compiler calls. Dynamic Affix
remains paused. Generic Snapshot remains deferred and its optional column is
still absent. Common Word Lab is unchanged.

## Immutable historical assignment

Completed production assignment `b84a41d2-4bf5-4079-b80f-d7d7611dd862`
was read only and was not reopened, regenerated or backfilled.

- route: `dynamic_prefix_word_lab` version `v2`;
- profile: `D4_MOR_PREFIXES_SUB_INTER_SUPER`;
- status: completed;
- 18 assignment items, 18 completed, 18 unique positions;
- 16 durable attempt events and one Reflection row;
- Generic Snapshot capability: `deferred_absent`;
- Generic Snapshot reader invoked: no;
- identical before/after assignment-state fingerprint:
  `02efb97bfbb1d908c85960da9b13b04254e10cfd51df7fe872676204128e7684`;
- read-side learner writes: zero.

The three authentic targets `international`, `superhero` and `subway` each
retain one correct controlled event, one correct Dictation event, one taught
event, one learning-item transition and one schedule. Their existing `0.75`
lesson evidence remains unchanged.

Historical transfer word `interact` retains its guided event plus its correct
Cover Check and Dictation events, but still has no taught event, priced
evidence, learning item, review bundle or schedule. No historical taught or
evidence row was fabricated. Its support remains `in_review`, so governed
breadth remains withheld. The prospective correction applies only to future
natural completions.

## Route and protected-state proof

- `/admin/adle-dynamic-prefix-qa` returned HTTP `404` with zero redirects,
  including with a query string.
- `/admin/spelling-review` retained its unauthenticated `307` login redirect.
- Production table counts before and after the natural scheduler/deployment
  proof remained: 79 daily assignments, 42 assignment items, 20 attempt events,
  one Reflection, 17 ADLE learning items, six taught rows, two review bundles
  and six scheduled words.
- Two unrelated `Daily spelling practice` headers created before this
  publication account for the documented assignment-count movement; neither
  has ADLE assignment items and neither came from canonical-intake replay.
- No synthetic child, assignment, attempt, evidence, reward or schedule was
  created.
- The nine-candidate wider historical backlog was not processed.

## Validation

Passed on the exact accepted chain:

- application and script TypeScript checks;
- production build;
- focused Dynamic Prefix feedback/Reflection regression;
- Dynamic Prefix pedagogy, QA/proxy and shared-authority regressions;
- attempt capture, evidence, proficiency and completion regressions;
- composer payload/persistence, review scheduler and reward regressions;
- route metadata/resolution and child-route read-only regressions;
- semantic production baseline (31 regressions);
- architecture drift and composable documentation regressions;
- canonical-intake scheduler and production-scheduler regressions.

`npm run lint` continues to report only the unchanged
`no-explicit-any` issue in
`scripts/adle-daily-plan-compatibility-live-proof.ts`, introduced before this
two-commit change and already documented as the deferred Generic Snapshot
wrapper-only issue. It is not a regression in this publication.

## Decision and observation boundary

`CONTROLLED_END_TO_END_PREFIX_TRIGGER_PROVED` remains true.

The correction is published for future natural lessons. The immutable
historical lesson cannot prove behavior that did not exist when it completed,
and no synthetic production lesson was manufactured. Therefore lifecycle
status remains:

```text
CONTROLLED_END_TO_END_PREFIX_LIFECYCLE_AUDIT_REQUIRED
```

It may move to complete only after sufficient future natural production
evidence verifies the profile-neutral Cleaver cue, context-slip Reflection and
evidence-bearing/non-scheduled transfer outcome. Legacy reader/compiler
retirement remains separately gated.
