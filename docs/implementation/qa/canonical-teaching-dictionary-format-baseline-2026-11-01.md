# Canonical teaching dictionary format baseline — 2026-11-01

Read-only Production audit: `node --env-file=.env.local --import tsx scripts/audit-canonical-dictionary-format.ts production`.
The script reads active dictionary words and morphology, the latest shared definition,
the latest route version per word and skill, and immutable lexical family membership.
It prints counts only. No word content or learner evidence is exported.

| Measure | Count |
| --- | ---: |
| Active words | 2,495 |
| Active morphology rows | 2,495 |
| Active words missing morphology | 0 |
| Canonical morphology rows | 0 |
| Exact display-range conversions, without governed route or family evidence links | 2 |
| Conflicting display ranges | 2 |
| Family evidence rows requiring a new reviewed version | 169 |
| Missing or mismatched joins | 264 |
| Historical alias fields | 972 |
| Missing reviewed part facts | 1,086 |
| Latest saved route versions checked | 842 |
| Latest saved route versions with a meaning copy different from Overview | 7 |
| Latest saved route versions with a word-sum copy different from Overview | 22 |

The morphology categories are mutually exclusive and sum to 2,495. Route conflict
counts can overlap a morphology category and each other. The two exact conversions
derive display offsets only; the Overview control leaves the review status and all
linguistic facts unchanged until an admin saves and approves a new version.
Historical morphology and route versions remain readable and immutable.

The review queue is `/admin/teaching-dictionary/format-review`. It shows the
classification and latest route-copy conflicts for each page of active words,
including approved words with no active morphology row.
The word link opens the visual Overview editor. The audit must be repeated after
staging conversion and after Production release; a lower count alone is not proof
that a word or lesson is correct.

## Staging baseline

The same read-only script with `.env.staging.local` and the `staging` argument
found 747 active words, 307 active morphology rows, and 440 words without a
morphology row. Of the existing morphology rows, 306 need reviewed part facts
and one needs its joins reviewed. There are 23 latest saved route versions;
none have a meaning or word-sum conflict with an available shared fact. One
route lacks a shared definition, and 22 lack a shared word sum. Staging is not
a copy of Production, so these counts are a separate comparison baseline.

## Staging Preview smoke proof

The protected staging Preview at commit `16808c8` passed
`scripts/prove-canonical-dictionary-preview.mjs` after the staging-only
family registry and written-vowel review prerequisites were installed. The
read-only browser proof signed in as the staging admin and loaded the format
review queue, dictionary index, `plate` Overview, and the approved free-base
family search API. It made no dictionary mutations. This staging dataset has
no approved bound-root family, so bound-root search remains unproved by this
browser check. The Preview does not include later source commits and is not a
Production release candidate.

The follow-up Preview at commit `1d31bf3` passed the same protected browser
proof, including an assertion that approved staging words with no morphology
row appear in the format-review queue. The first page contains 59 such words.
The check was read-only and did not alter dictionary records.
