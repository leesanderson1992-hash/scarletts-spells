# Scarlett ADLE five-level shadow readiness — 13 October 2026

## Scope

Read-only Production SQL transaction (`BEGIN READ ONLY`, followed by
`ROLLBACK`) against the exact active learner record matching Scarlett
Sanderson. No learner text, learner UUID, credentials, or source event rows are
recorded here. This is a source-readiness audit, **not** a certified five-level
proficiency result.

## Verified aggregate facts

| Fact | Count / status |
|---|---:|
| Matching active learner records | 1 |
| Stored date of birth | Present |
| Age at `asOf=2026-10-13` | 8 |
| ADLE assignment attempt events | 390 |
| ADLE Review outcome events | 121 |
| ADLE authentic-use event rows | 951 |
| Learning-item evidence rows | 90 |
| Parent-verified spelling candidate mappings | 67 |
| Active unresolved learning items | 47 |
| Active unresolved items outside the live pilot band | 5 |
| Source kind for all five excluded items | `verified_misspelling` |
| Of those, age-band exclusions | 4 |
| Of those, frequency-band exclusions | 1 |
| Active complexity-banding rows | 875 |
| Reviewed word-map rows with representative-group keys | 0 |
| Whole-writing shadow skill projections for Scarlett | 0 |

Scarlett's age-based **required** word pool under
`CHILD_REQUIREMENT_ELIGIBILITY_V1_2026_09_08` admits cumulative
`early_primary` and `middle_primary` medium/high-frequency words. The live
pilot's static band currently has those same age labels, but it is also used
by assignment/intake checks. The five blocked existing learning items expose
that teaching restriction; they do not establish a five-level outcome.

The active D4 homophone catalogue has 15 skills. A read of approved generic
support links found ten with two child-band-eligible words, three with three,
and two with four. This is a lower-bound content view, not the normalized
Phase B relationship count.

The five out-of-band items all have a `verified_misspelling` intake source
kind. This confirms they are recorded as verified needs; the individual
verification lineage still needs checking before changing teaching eligibility.

## Implementation and certification state

The code now has a separate pure V1 shadow calculator, learner-scoped Phase C
source reads, and an admin-only Scarlett report at
`/admin/adle-proficiency-shadow`. The report displays blocked gates and live
three-band evidence as different measures; it cannot change released
proficiency, assignments, Review, Word Treasure, or rewards.

No five-level result is certified by this audit. Governed representative-group
coverage, qualified whole-writing source integration, and recurrence/recovery
facts must be reconciled before the affected levels can be awarded. The
calculator reports missing authority explicitly. The admin report is not yet
deployed or reviewed against the Production web runtime.

**Review decision: no-go for parent/child proficiency cutover.** The admin
shadow page can display the incomplete evidence and blockers, but a versioned
live-versus-shadow comparison receipt cannot claim level differences until the
Production runtime calculation has run and the missing authority is reconciled.

## Verification

- `npx tsx scripts/adle-proficiency-shadow-regression.ts` — passed.
- `npx tsc --noEmit --incremental false --pretty false` — passed.
- `npx eslint` on changed TypeScript and TSX files — passed.
- `npm run build` — passed; the new admin route is dynamic.
