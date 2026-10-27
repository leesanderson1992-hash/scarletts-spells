# Admin word-status handoff: isolated staging receipt

Scope: Teaching Dictionary, No Matching Skill, ADLE Requirements and Recommended Dictionary Entries alignment. This is a code and isolated-staging receipt, not Production release evidence or a new lesson eligibility permission.

## Identity and safety

- Staging Supabase project: `qkpjbajicacbrphthibk`.
- Staging Vercel project: `scarletts-spells-adle-staging-20261025`.
- First Preview: `dpl_7TViEQ6ThP9qpLXRGBBcivSHjonN` at commit `2616247`.
- Read-overlap Preview: `dpl_HV9cUzSGAsy3mNguqFxPr8eCQrpv` at commit `ea8ea29`.
- Final Preview: `dpl_2BqHUpYwK9t7gSK6Y3bbidjneyqv` at commit `944eb06`.
- Production Supabase records, releases and settings were not changed in this proof.

## Verified decisions

`npm run admin:word-handoff-regression` passed. It checks exact active en-GB case-to-word identity, that the existing recommendation view excludes a newly created canonical word even while its content awaits review, the governed No Matching Skill transaction and valid-word-context guard, and the shared `wordRouteStatus` evaluator. The existing Teaching Dictionary manager and scoped governed-read regressions also passed. TypeScript, focused ESLint and Vercel Preview builds passed for the deployed slices.

The staging database initially had zero open No Matching Skill cases. A disposable synthetic `zzcaerful → careful` queue case was inserted without child-source evidence. On the first Preview, No Matching Skill displayed the case with a dictionary-word link, and the Teaching Dictionary word page displayed the exact open case and its pair-and-skill decision form. The synthetic case was removed with the existing deletion RPC; readback found zero matching open queue cases. The browser approval action was not submitted for that fixture because it lacked an eligible source.

An eligible synthetic staging seed row for `carefull → careful` was then imported through the existing seed-plan structure and moved through `move_spelling_resolution_to_no_matching_skill_admin`. It was explicitly labelled as synthetic QA, not learner evidence. The owner selected the pre-existing `D4_MOR_SUFFIXES_FUL_LESS` skill in the final Preview's Teaching Dictionary form and submitted the exact pair approval. Staging readback found the resolution item `confirmed`, the canonical mapping `active` and `visible` with resolver enabled, zero open No Matching Skill rows for the pair, and the historical case `returned` with timestamps. An authenticated browser readback found zero open cases, the confirmed pair in Canonical Misspelling Resolver, and no remaining open spelling-case panel on the Teaching Dictionary word. Its shared suffix route status reported technical facts complete, editorial approval true, administrative candidate true and no blockers. No Production record was used for this proof.

ADLE Requirements and Teaching Dictionary word detail both consume `wordRouteStatus`; No Matching Skill no longer calculates its own route readiness. A canonical dictionary entry alone leaves a genuine spelling-skill decision open. No new lesson permission or route activation is granted by this slice.

## Read-path observation

On the same isolated staging environment, a headless authenticated browser loaded the Teaching Dictionary list four times on each Preview, waiting for the first table. The first sample was discarded. Warm samples were 2,333/1,872/1,925 ms before the read-overlap change (median 1,925 ms) and 2,354/1,504/1,598 ms after (median 1,598 ms). This small sample supports no Production latency or egress claim.

Staging had one prefix and one suffix profile; their combined decoded response was 275 bytes. A proposed extra query round for profiles was reverted. A scoped authority read matched 50 of 50 displayed-word decisions and reduced one measured authority payload from 586,995 to 452,982 decoded bytes, but increased that read from 2,153 to 2,254 ms and would bypass the 60-second global authority cache. It was also reverted. The shipped list change overlaps independent reads without adding query rounds or changing governed decisions.

## Remaining release proof

The eligible-source exact-pair handoff passed in staging. Recommendation removal and shared `wordRouteStatus` parity passed their focused regressions; no live recommendation was created solely for a destructive browser round trip. Production promotion must follow the repository's exact-SHA writing-context AI release gate. Lesson-permission and family-role decisions belong to the later micro-skill refactor.
