# Prefix republishing and assigned-word review coverage

## Defects and correction

A prefix word already in a profile was replaced in the member list, but its
choice audit was appended. The lesson loader requires exactly one audit per
word, so a five-word update created 14 audits for nine words and was rolled
back by the post-publication runtime check.

The publisher now removes the earlier audit for the reviewed word before
appending its new validated audit to the new immutable profile. Earlier
profiles and all publication history are preserved. This shared publisher
covers all prefix workbook lessons. No runtime validation is relaxed. An unchanged prefix workbook can resume
after publication changes its source revision; all reviewed sense and part
facts must match exactly before its revision is refreshed. Changed facts
retain the stale-source guard.

Bulk review now includes the same scoped canonical relationship authority as
the bulk assigner, including assigned words that do not have runtime members.
Its pending draft read subtracts rolled-back publications rather than treating
all historical publications as successful. Pending updates remain visible in
the review list and workbook, including words whose prior version is Active.
The page states the total population and explains the overlap between Active
words and words needing review.

## Production diagnosis (read only)

For `D4_MOR_PREFIXES_IN_IM_IL_IR`, at diagnosis there were 20 assigned words,
nine words in the existing runtime pool, and 18 words requiring review after
reconciliation. Seven Active words were also in review: five rolled-back
updates and the two unresolved words, impatient and invisible. Eleven assigned
words were outside the runtime pool. These counts are time-specific, not
hard-coded display values.

## Verification

- Run `ADLE_DYNAMIC_PREFIX_COMPILER_MODE=shared_authoritative
  ADLE_ROUTE_ACTIVATION_ENVIRONMENT=staging node --env-file=.env.staging.local
  --conditions=react-server --import tsx scripts/prefix-republication-staging-proof.cjs`.
- The explicit staging proof imports and republishes imperfect and inaccurate
  twice using the same workbook bytes, rehearses rollback, confirms both pending and review queues retain
  them, then imports and publishes again. Every profile has 11 distinct word
  audits; both words remain selectable by the real runtime loader.
- The proof checks every assigned staging word is either Active or in review.
- TypeScript, focused ESLint, four-profile compilation and prefix pedagogy
  regressions pass.

Production rollout applies the guarded function migration and deploys the
review queue changes. The owner will upload and publish her workbook herself;
this release does not retry or publish her production drafts automatically.
