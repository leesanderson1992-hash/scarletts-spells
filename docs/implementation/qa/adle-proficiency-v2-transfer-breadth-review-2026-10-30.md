# V2 transfer breadth review — 30 October 2026

## Decision implemented in code

For every active micro-skill family, Levels 1–2 may use qualified controlled and retrieval successes for breadth. Levels 3–5 count a distinct family or contextual role towards breadth only after a qualifying independent transfer or authentic-writing success for that group. Repeating a group on several dates can support accuracy and retention, but does not create additional breadth. Level 5's 56-day retention span begins with independent evidence, not a controlled teaching attempt. The numeric V2 thresholds remain unchanged. The proficiency pool uses all approved linked words; teaching age and frequency bands do not constrain it.

The same calculation is used for phoneme–grapheme, spelling pattern, syllable, schwa, morphology, inflection and irregular-word skills. Homophone/contextual skills retain their closed-set role targets and verified-context evidence rules. This change does not alter word mastery, lesson assignment, rewards or Review scheduling.

Reviewed morphology now recognizes both the older `type`/`text` and newer `kind`/`sourceText` base-part formats. An affix-labelled part is not guessed into a base family. Words without a governed family or reviewed base can remain an exact-word fallback and are reported through the existing group authority path.

## Read-only Production comparison

Scarlett Sanderson's exact Production learner was resolved, and all 297 active micro-skills were recalculated at `asOf=2026-10-30`. No learner records were written. The restricted receipt is `outputs/schwa-cluster-bulk-readiness-2026-10-29/scarlett-v2-transfer-breadth-all-skills-2026-10-30-r5.json` (SHA-256 `c26211d2f8967b782bcd7b32a077622162eac85008be3f3f2c983842f1c15662`). It contains aggregate gate trails and changed skill keys, without raw writing.

| Measure | Previous R4 | Proposed R5 |
|---|---:|---:|
| Level 1 | 75 | 77 |
| Level 2 | 24 | 32 |
| Level 3 | 22 | 23 |
| Level 4 | 20 | 16 |
| Level 5 | 14 | 9 |
| No certified level | 142 | 140 |

Twenty-two skills changed level or status. Of these, three are status-only changes from removing the age-restricted proficiency pool. Every awarded proposed level has a passing gate trail, apart from the existing explicitly held homophone one-date setback behavior (none failed this audit). All nine proposed Level 5 skills pass distinct transferred-group breadth and four independent dates spanning at least 56 days. All 399 calculated word-mastery rows and their Review fields matched the previous calculation exactly.

`D4_MOR_PREFIXES_DIS_MIS` changes from Level 5 to Level 3: six groups appear in qualified evidence overall, but only three groups have independent transfer. The Level 3 breadth gate is 3/3; Level 4 is 3/4; Level 5 is 3/6. The observed six groups must not be labelled as six transferred families.

Changes are distributed across spelling patterns (2), homophones (1), inflections (1), morphology (8), phoneme–grapheme (5), syllables (1), irregular words (3) and schwa (1). This distribution confirms the common calculator is applied catalogue-wide rather than patched for `dis/mis` alone.

## Verification and release boundary

The calculator regression includes the six-overall/three-transfer example in every standard skill family, Level 5 retention with a controlled start, a two-role homophone set, and both reviewed morphology formats. Parent Insights regression, TypeScript, targeted ESLint and production build passed. The comparison read was learner-scoped and made no consequential writes.

This is a code and review result, not a Production parent release. The currently deployed parent calculation has not been changed by this review. The revised parent display should be released only with the documented 22-result comparison available for review and a rollback path for the calculation version. Remaining exact-word fallback cases should be reviewed as content authority gaps rather than silently treated as extra root families.
