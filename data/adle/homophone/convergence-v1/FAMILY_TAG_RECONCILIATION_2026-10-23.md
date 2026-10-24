# Family tag reconciliation — 23 October 2026

The reviewed reconciliation has been released to the Production lexical family
registry. The original 194-word release, prior canonical fact rows, learner
evidence, and lesson snapshots remain available.

## Scope and result

- The approved 886-word morphology review, 194 previously imported words, and
  three newly released anchors form 1,083 distinct words. Every word has at
  least one approved family membership.
- There are 1,096 approved memberships in 866 approved families. The 13 approved
  two-base words retain both memberships, including `photo + graph` words.
- 99 membership rows change key. A further 73 obsolete family-key definitions
  are mapped in the audit. The empty `scissor_noun_base_family` draft is omitted.
- All 128 approved root decisions remain in `approved-root-family-decisions.csv`.
  The 31 root decisions used by the 886-word set map to their approved tags;
  history-only roots do not become lesson families.
- The approved `interest + ing` and `poten + ial` analyses are retained; the
  `poten` family is classified as a bound-root family. The released package is
  unchanged.

`reconciled-word-family-coverage.csv` gives one row per word.
`reconciled-lexical-family-members.csv` gives every proposed membership and its
source word sum. `reconciled-lexical-families.csv` defines the resulting family
identities. `family-tag-change-audit.csv` records old-to-new keys.
`family-reconciliation-dependencies.csv` records the 13 validator cases that
were open during reconciliation. `family-prerequisite-resolution.csv` records
all 21 prerequisites and their Production resolution.
Regenerate all outputs with `python3 scripts/reconcile-approved-lexical-family-tags.py`.

For eight imported words, the canonical release stores the reviewed spelling
change in its transformation-notes text while its structured transformation
array is empty. The membership sheet retains those notes separately and
matches the active canonical array exactly. The approved base parts and word
sums carry the intended analysis.

## Publication prerequisites

The three anchors `essence`, `respond`, and `shelf` were released in
`2026-10-23-family-prerequisite-canonical-v1`. The same release corrected the
word sums and base parts for `did`, `scissors`, and `shelves`. Governed
definition versions now include the verb sense of `fix` and the determiner
role of `little`.

The membership validator now uses a reviewed variant/rebase relation for
`community`, `irresponsible`, `separate`, and `social`; case-insensitive matching
for `i'd`, `i'm`, and `i've`; and separator-aware matching for `ice cream`,
`twenty-one`, and `well-being`. The six compound rows are three words with two
memberships each. Their second family must not be dropped to satisfy validation.

The `scissors` noun family is a whole-word lexical family, distinct from the
imported `scissor` verb. The `shelves` noun family is based on `shelf`, not
`shelve`. Both have approved canonical word sums and memberships.

The Production readback found 866 approved families, zero drafts, 1,096
memberships across 1,083 words, four reviewed variants, and no membership
pointing to retired morphology. See
`docs/implementation/seed-data/teaching-dictionary/releases/2026-10-23-approved-lexical-families-v1/production-receipt.json`.
