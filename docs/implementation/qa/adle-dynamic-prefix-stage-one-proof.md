# Dynamic Prefix Word Lab — Stage-One Staging Proof

Status: staging proof passed on 2026-07-21. The route is preview-only; production remains closed pending explicit written approval.

## Immutable content baseline

- Profile: `D4_MOR_PREFIXES_UN`
- Canonical import package: `adle_canonical_un_prefix_2026_07_21`
- Package SHA-256: `4d93822664e3790da805ca934a7c2149218cbd3fba47d072e566bbf806d78b31`
- Dynamic route: `/learn/week/adle/dynamic-prefix`
- Production gate: closed

## Recorded staging evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Preview-only gate is enabled; production remains closed | pass | Preview deployment `dpl_EsXCMsZq7tTfeEySJMeKvDHkQotn`: `https://scarletts-spells-staged-5kdyzjr2c.vercel.app`; `ADLE_DYNAMIC_PREFIX_STAGING_ENABLED=enabled` was supplied only to the preview deploy. No production deployment or production environment update was performed. |
| Authenticated staging user can open explicit Dynamic Prefix route | pass | Staging parent `katiesanderson8624@gmail.com` opened `/learn/week/adle/dynamic-prefix` and created the explicit disposable child assignment. |
| 1 / 2 / 3 / 4 / >4 authentic-target selector cases | pass | `scripts/adle-dynamic-prefix-word-lab-staging-proof.ts`: all scenarios passed. The selected order was `unhappy`, `unfair`, `unkind`, `unlock`; `>4` left one authentic target pending. |
| Transfer fill, oldest-first and overflow-pending behaviour | pass | The same proof recorded 3/2/1/0 approved same-prefix transfers for 1/2/3/4 authentic targets; four targets were oldest-first and the fifth remained pending. |
| Dynamic rendering, dictation, reload/resume and durable completion | pass | Child `2d78b23a-2ceb-44d0-8c8f-318c2ef81e8f`, assignment `1cd7590c-96cb-4780-a872-7c867e5a4647`: browser completed Learn, Discover, Split, Match, generic Build (`un- + happy`), recall, reviewed dictation and reflection. Prior browser reload at Split restored the held successful split state. Database audit: 16 completed items; 14 events (6 guided, 4 controlled, 4 dictation); all dictation targets correct; four taught rows and four active scheduled rows; all four learning items transitioned to `awaiting_review_outcome`. |
| Legacy fixed `un-` assignment remains v1 and completable | pass | `npx tsx scripts/adle-d4-mor-guided-pilot-regression.ts` passed after the legacy case-sensitive sentence-feedback regression was restored. The v1 resolver and payload remain separate from the v2 route. |
| Fail-closed missing-review / insufficient-transfer cases | pass | `scripts/adle-dynamic-prefix-word-lab-regression.ts` passed; runtime binding validation also rejects incomplete/mismatched v2 snapshots. |

## Completion path note

The existing `complete_adle_word_lab_v1` RPC intentionally validates the exact
legacy v1 binding IDs and reflection key, so it remains exclusive to immutable
v1 snapshots. Dynamic v2 uses the established durable completion contract with
generic snapshot-binding validation, reviewed-token correctness, attempt
ledger, learning-item transitions and scheduling. This preserves v1 unchanged
while preventing the v2 payload from being forced through v1-specific content.

## Rollback

Set `ADLE_DYNAMIC_PREFIX_STAGING_ENABLED=disabled` (or remove it) from the preview environment, then redeploy. The route returns 404 and no legacy route or production behaviour changes.

## Production activation

Explicit written approval naming `D4_MOR_PREFIXES_UN` Dynamic Prefix Word Lab v2
was recorded on 2026-07-21. Production is still protected by the separate
`ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED` switch; the preview flag cannot enable
production. Fixed v1 `un-` snapshots remain legacy assignments.
