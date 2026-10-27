# Active ADLE route contract repair — 26 October 2026

## Scope

This code change updates administrative readiness for the routes that were already active. It does not change learner assignments, approvals, route activation, release records or Production data.

The generated route-content inventory now has 110 contracts: 109 active specialist route/skill pairs and one generic fallback policy. Each contract identifies the release preflight and the selected-word validation path. A newly registered route without an explicit readiness mode fails contract generation.

## Corrected readings

- Contextual Homophone now validates its immutable released authority and compiles a representative selection for each reviewed contrast set. A batched, current approved-set read detects withdrawal or changes in set membership, meanings and sentences. On the Production read-only snapshot, 58/58 active skills matched their current approved sets and passed the new preflight. The batch used three logical table reads for the 58 skills (84 approved set rows and 175 member rows at the time of inspection).
- Weak Vowel now validates its released teaching template in the admin preflight. Published word versions are no longer treated as pending manager drafts. The Production read-only snapshot had 182 published word/skill versions, all attached to active, approved en-GB dictionary words. The old admin path would also call the dictionary-fingerprint RPC once for each of those 182 reviewed source words on a whole-route read; the publication-aware path excludes them from that draft-review loop.
- Weak Vowel word rows explicitly say that current publication, dictionary, family and assignment facts are checked when a child is selected. A valid template is not labelled as a completed child lesson. The shared word status keeps technical facts `not_evaluated` until that native selected-word check runs.
- The admin word-count label now describes the checks actually counted; the generic four-word compilation claim was removed because route sizes differ.

## Verification

- `npm run adle:route-content-contract-regression` — pass.
- `npm run adle:teaching-dictionary-governed-regression` — pass, including changed and withdrawn contextual content and tampered Weak Vowel authority.
- `npm run adle:teaching-dictionary-manager-regression` — pass.
- `npx tsx scripts/word-route-status-regression.ts` — pass.
- Contextual choice and Weak Vowel native regressions — pass.
- `npm run build` — pass.
- Read-only comparison of all active Production release authorities: Contextual Homophone 58/58 and Weak Vowel 8/8 passed the new release preflights. The contextual comparison used the current approved database sets as well as the frozen release content.

## Remaining gates

The follow-up on 27 October resolved the route-level false blockers for the two historical Base Word skills and the two partially valid suffix profiles in local code. Individual words with incomplete or unreviewed facts remain blocked. A representative child-level staging proof and Production deployment are still outstanding. The current Production site continues to show its previously deployed readiness code until release.

## 27 October follow-up: Base Word, suffix and inflectional routes

The active Production authorities were read without writes. The Base Word native release preflight initially rejected Identify Base solely because three historical base-only members had no authentic-target compiler witness, and Preserve Base solely because one transfer member had none. Historical v1 family roles only offer `authentic_target` words to the native selector. The local preflight now requires witnesses for exactly those targets; schema v2 keeps full applicable-member coverage. The four active Base Word skills now pass their frozen-authority compiler preflight. The four non-target words remain individually marked unselectable on the admin projection.

The current Production suffix loader produced all ten enabled reviewed profiles. It rejected one member in `D4_MOR_SUFFIXES_FUL_LESS` and one in `D4_MOR_SUFFIXES_MENT` because their true-morphology provenance is explicitly `draft_requires_editorial_review`. Each profile retains four valid members; with one synthetic verified misspelling at a time, all four valid members in both profiles compiled a four-word lesson. The other eight profiles had four to six valid members each, and all valid members compiled in the same read-only exercise. The local admin gate now reports a compiling, already enabled profile as route-ready while keeping each rejected member blocked with its editorial-review reason. A proposed reviewed addition that fails validation still blocks its proposed release. No morphology approval was changed.

The four active `ing_endings_word_lab` skills and four active `comparative_superlative_word_lab` skills all passed the native frozen-authority release preflight. The two compound skills and fourteen governed homophone skills also passed. The earlier read-only comparison passed 58 contextual homophone and eight weak-vowel skills. These checks establish route-authority readiness, not that every child has an eligible queued item.

The disposable staging project has the current 281-table schema but no active route heads or suffix profiles. It cannot validate this change until a bounded, representative route fixture is imported. Use separate fixture slices for historical and current Base Word authorities, a four-valid-plus-one-unreviewed suffix profile, and `-ing`/comparative families; compare the admin row, selected-word decision and compiled lesson for each. Preserve the unreviewed word's blocker. Then run a Preview against that staging database and a disposable child, including Finish/reload/retry and historical snapshot replay. This is preferable to changing all route families in one Production release because their authorities and word-role rules differ.

| Active route family | Production authority count | Staging proof required |
| --- | ---: | --- |
| Prefix profile | 5 | Existing approved profile, queued authentic target, transfer fill and an excluded member |
| Suffix profile | 10 | Four valid members plus an unreviewed fifth, all valid authentic targets, proposed review failure |
| Base Word | 4 | Historical v1 base/transfer roles, current v2 applicable members, queued target and old snapshot replay |
| `-ing` endings | 4 | One family for each rule, word withdrawal, queued target and compiled dictation |
| Comparative/superlative | 4 | One family for each rule, selected adjective forms and compiled lesson |
| Compound and governed homophone | 2 + 14 | Released member and selector parity |
| Contextual homophone and Weak Vowel | 58 + 8 | Current review withdrawal and published-word/family checks |

Stage these as bounded slices, then run one cross-route status comparison and child journey. Acceptance requires the Teaching Dictionary, route page and native selector to agree about every fixture word; all enabled routes with valid content must compile; editorially unreviewed words must remain blocked; and prior completed lessons must still replay. Only then prepare a Production release candidate.

Verification after this follow-up: route-content contract regression (110 contracts), governed preflight regression, Teaching Dictionary manager regression, TypeScript, and Production build all passed. No staging or Production data was modified by this follow-up.
