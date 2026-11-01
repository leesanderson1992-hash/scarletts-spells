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

The expanded read-only shared-fact audit found zero approved Production words
missing a shared definition, metadata row, spoken syllables, pronunciation hint,
dictation, age/frequency/complexity band, or provenance. It found 151 approved
words without a written-syllable breakdown; that field remains optional for
historical entries and is reported separately rather than automatically filled.
Eighteen approved words use a historical `in_review` age or complexity band;
the new Overview selectors show those values as needing review and require a
reviewed choice before a new canonical Overview approval.
The reviewed choices are the six learner age bands and the high/medium/low
frequency and low/medium/high complexity bands already used by active records.

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
The expanded shared-fact audit found 422 approved staging words without a
shared definition; 61 lack metadata, spoken syllables, a pronunciation hint,
dictation, bands, or provenance, and 62 lack a written-syllable breakdown.
Seventeen more approved staging words use a historical `in_review` band.
The format-review queue now links each required shared-fact gap to its Overview
control as well as listing morphology and route-copy issues.

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

The installed staging family functions also passed the transaction-rolled-back
`prove-lexical-free-base-creation-staging.mjs` proof: creating a standalone
`plate` family and a `kid`/`kids` family produced the expected reviewed
memberships, and duplicate creation was rejected. No fixture was committed.

`prove-lexical-bound-root-join-staging.mjs` also passed using transaction-only
`act` and `action` morphology fixtures. A reviewed bound-root family gained a
second approved revision with both members and copied root metadata. A mismatched
root source was rejected before approval. The entire fixture was rolled back;
the staging catalog still has no persisted approved bound-root family for a
browser search proof.

The protected Preview browser proof also selected the active prefix micro-skill
for the staging-only `fixtureword001` without saving it. The Lesson checks
table rendered an activity row and its readiness request completed. The word's
facts are incomplete, so this proves the missing-requirement display path,
not a passing ✓ or a generated lesson.

The later Preview at commit `58bc6ce` passed the protected browser proof with
the expanded queue. It displayed a missing-definition link to the Overview
definition control and retained the earlier morphology, family-search, word
page, and Lesson checks smoke checks. It made no dictionary mutations.

The Preview at commit `373f3ff` passed the same protected browser smoke after
the canonical word-sum approval guard was added. The focused workspace
regression rejects an approved sum that differs from the reviewed parts while
accepting the generated sum. The browser smoke does not itself submit an
invalid approval.

The Preview at commit `0819076` passed the protected browser proof for all
three reviewed band selectors and their allowed values. Its queue still loaded
and linked missing shared facts. No selections were saved in the browser proof.

The Preview at commit `c8c30bc` passed the protected search proof. An approved
free-base family remained searchable, and a two-letter query returned only
families whose reviewed lemma contains those letters. The focused regression
covers bound-root ranking, latest approved revisions, and the old family-key
suffix false match. Staging still has no persistent approved bound-root family
for a live browser search.
The read-only Production database proof
`prove-canonical-family-search-production-readonly.ts` confirms that an actual
approved bound root is returned by the new lemma query and result projection.
It neither changes Production nor proves the endpoint is live there.

## Migration version collision resolved

The first staging family install used version `20261101170000`, which Production
already records for `parent_context_bulk_decisions`. Before any Production
family migration, the two candidate files were renumbered to `20261101210000`
and `20261101211000`. The staging ledger was corrected only after checking its
stored SQL against the exact renamed files, first in a rollback proof and then
in an applied transaction. The free-base and bound-root transaction proofs
passed again after the correction. Production family schema remains unchanged.
