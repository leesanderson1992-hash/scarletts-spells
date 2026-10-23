# Parent proficiency V2 readiness — 23 October 2026

## Scope

The V2 parent dashboard is controlled by `PARENT_PROFICIENCY_V2_ENABLED` (default
off). This read model makes no learner, Review, queue, reward or mastery-policy
threshold writes. The Production check used Scarlett Sanderson's unique active
learner record at `asOf=2026-10-23`; no learner ID, raw writing or word list is
included in this receipt. Direct SQL source counts ran in a repeatable-read,
read-only transaction followed by rollback. The hosted read model used
learner-scoped Supabase selects.

## Real evidence check

| Measure | Result |
|---|---:|
| Active micro-skills | 243 |
| Supported Level 1 / 2 / 3 / 4 / 5 | 69 / 29 / 22 / 15 / 7 |
| Ready to discover | 68 |
| Unresolved governed group pool | 27 |
| Awarded level gate-trail mismatches | 0 |
| Skills with limited evidence confidence | 159 |
| Skills with incomplete group derivation | 86 |
| Skills with unscored or uncertain evidence | 76 |
| Skills with below-nominal next-level breadth pool | 41 |
| Admitted / blocked / ambiguous learner events | 1,559 / 33 / 0 |
| Studied word states | 371 |
| Source-distinct studied words | 371 |
| Word states: mastered / secure / produced / active | 64 / 28 / 255 / 24 |
| Word states with unresolved slip | 0 |
| Dated future Review actions / Review actions due | 29 / 10 |

For the 22 Level 4–5 skills, 680 distinct admitted source events contributed:
454 authentic-use events, 207 assignment attempts, 17 verified spelling
events and 2 learning-item evidence events. Their environments included
authentic writing, contextual transfer, isolated retrieval and controlled
lessons. No upper-level homophone claim was awarded. A local hosted read of
the full dashboard completed in roughly 9–12 seconds from the development
machine; deployed request latency still needs monitoring.

## Bounded defect repair

The source audit found 104 active prompted Review writing records and 35
active supplied-spelling records for Scarlett. The old word pricing loop could
treat either as an independent authentic spelling production. V2 work excludes
those explicit provenance kinds from word pricing while retaining their source
rows and leaving every policy weight and threshold unchanged. The Phase C
learner-scoped repair lookup was batched because one hosted URL containing
hundreds of UUID filters failed. The subsequent full Production read completed.

## Limits and release note

The 27 unresolved skills have no governed learner-appropriate group pool and
receive no invented level. The 159 limited-confidence results display their
confidence; uncertainty is not counted as a miss. Morphology without a
reviewed root or released family does not inflate breadth. Correctly applied
components inside an otherwise misspelt word are not inferred from its whole
word outcome; they require an exact reviewed source projection.

The Production parent switch remains default off until the deployment and
public parent readback are complete. The current child view, queue and rewards
are outside this release. Disabling the flag restores the existing parent
three-band display.
