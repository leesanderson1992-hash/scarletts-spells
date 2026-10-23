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

## Production release

The repository's `main` branch contains the release code at
`698500f77bd2d3c7f38d7ef606182dfea838e20d`. Production deployment
`dpl_5XpdDkEktWXCqduJPLo11Ab6APGo` was staged with the all-learner parent
flag enabled, then promoted to `https://scarletts-spells.vercel.app`. The
authenticated public readback returned that exact SHA, the approved runtime
fingerprint, valid identity and disabled release hold. A fresh provider
approval (`ea8ecf32-090d-4646-bd00-2f53f73d5b72`) cites the owner's
9 October standing permission and retains the existing model, endpoint,
retention, sharing, rate card and spending limits. Policy revision
`b644726c-b6ed-44e4-b393-8b748eb03e8c` and the recovery scheduler were
bound to the new SHA together; execution readiness was true. The next Cron
run succeeded, and the new deployment had zero error log entries in the
release window.

The authenticated public parent page displayed all 243 skills and 371 studied
words, with separate proficiency and mastery sections. An expanded Level 4
skill displayed its Level 5 accuracy, breadth, retention and challenge gates.
The child view, queue and rewards were not switched. The parent flag is a
per-deployment override; promoting the prior deployment restores the existing
three-band parent display. Runtime calculation error counts and page latency
should continue to be watched during real use.
