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

## Automatic eligibility and device-voice proof — 2026-10-29

Applied the targeted device-voice publication migration to the guarded staging project. A reviewed `basket` route version retained the approved spelling and activity facts and used device speech for the word and sentence. The background reconciler examined its approved facts and published one new immutable content version (`5ad8eed2-d52e-481b-b0f4-e3eafde18e46`). The eight assigned `FINAL_ET` words then reported `lesson_pool_word` with no blockers in staging route status. A missing recording therefore did not require another editorial publication action, while the reviewed facts remained required.

| Audio | Date | Assignment | Result |
| --- | --- | --- | --- |
| Device voice | 2026-11-01 | `a6b9003d-aa21-4a48-a937-c3d074125be1` | Finished, reloaded, and persisted |
| Device voice, fresh start after resume fix | 2026-11-02 | `6eb9bd00-3ec4-4977-b917-4c3298d74f48` | Finished, reloaded, and persisted |

Both assignments included `basket` in the frozen `FINAL_ET` lesson and exercised its device-spoken word and sentence. The learner completed teaching, Dinner, Detective, Memory Lock, Dictation, reflection, and Finish in the local app against staging. Database readback after reload showed both assignments `completed`, R6 `major_stage = session_complete`, `session_completed_at` populated, and checkpoint `finished = true`. The two earlier recorded-audio assignments remained completed with the same R6 and checkpoint state.

The first disposable device-voice fixtures exposed missing R6 orchestration and a saved cover-shutter checkpoint that could resume behind the shutter. The final fixture creates orchestration as part of setup. The resume fix and its regression were committed separately, then the fresh Nov 2 lesson was run from its first teaching page through Finish and reload. Earlier failed fixtures remain staging-only diagnostic evidence, not completion evidence.

The feature and defect commits received hosted Vercel Preview deployments; the learner Finish/reload proof above used the local application with staging data. No Production release or route activation occurred.
