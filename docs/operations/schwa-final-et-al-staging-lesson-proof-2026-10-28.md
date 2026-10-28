# Final `-et` and `-al` staging lesson proof — 2026-10-28

## Scope

Ran the learner flow in the local Next app connected to the guarded staging Supabase project. Both skills were enabled only for disposable child `5a255a24-108c-4f59-a1fb-5e1c1004575f`. This was not a hosted Vercel Preview or a Production activation.

| Skill | Date | Assignment | Words | Result |
| --- | --- | --- | --- | --- |
| `D4_SCHWA_FINAL_AL` | 2026-10-29 | `65020c8c-7d04-4e74-9e16-8f20d118e8d5` | actual, actually, factual, natural, usual, usually | Finished and persisted after reload |
| `D4_SCHWA_FINAL_ET` | 2026-10-30 | `9b985b96-4388-4cba-be3b-f4f0c4edba81` | basket, diet, jacket, market, quiet, target | Finished and persisted after reload |

Each assignment had 25 frozen assignment items. The browser completed teaching pages, Call It to Dinner, Vowel Detective, Memory Lock, sentence dictation using the reviewed recordings, reflection, and Finish. Readback confirmed `daily_assignments.status = completed`, R6 `major_stage = session_complete`, checkpoint `finished = true`, non-null completion timestamps, and the saved reflection for both assignments.

## Defect found

The first disposable `-et` assignment (`2721033c-2522-4c2a-a222-28fd7ba0d7d3`, 2026-10-28) rejected the correct `e` selection in *basket*. The governed lesson adapter omitted the reviewed `selectionTarget`, and the Dinner final-vowel validator did not recognise `-et`. The focused code fix passes the reviewed `e` selection for `-et` while preserving the highlighted two-letter `et` span. The corrected assignment above was created fresh and completed. The first assignment is a staging-only superseded fixture and was not used as completion evidence.

## Checks

- `npx tsx scripts/weak-vowel-governed-content-regression.ts` passed.
- `npx tsx scripts/weak-vowel-lesson-regression.ts` passed.
- `NODE_OPTIONS=--conditions=react-server npx tsx scripts/adle-r6-weak-vowel-route-regression.ts` passed.
- `npx tsc --noEmit` and `git diff --check` passed.

## Release boundary

The proof used the local application with staging data. No hosted Preview was deployed, no Production route was activated, and these staging-only publications and child assignments do not constitute Production learner release evidence.
