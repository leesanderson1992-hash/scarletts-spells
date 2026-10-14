# R6 frozen Review workload Production release — 2026-10-14

The owner authorised applying and pushing the R6 lesson throttle repair. The
deployed application commit is `c09f0ba3db75b09e11601d99a4321a434234efc9`
on `main`; Production deployment `dpl_FHg3sCqmwT755cebHBg17WuNxRFP` is Ready
and serves `https://scarletts-spells.vercel.app`.

The targeted Production migration was
`20261014190000_adle_r6_frozen_review_workload.sql`, SHA-256
`8f7b1f47fbc604dac64065a86679da014674c213cf4c03991f9d0538421a99ae`.
Preflight confirmed the R6 and C2B6 prerequisite functions and ledger rows,
the absence of the new table, and zero open R6 orchestration sessions needing
backfill. The SQL and its ledger row were applied in one transaction. Assignment,
per-word schedule, and Review-session row counts did not change. An unrelated
pending homophone migration was not applied.

Post-apply readback confirmed one migration ledger row, the new table with RLS,
and zero frozen workload rows before the next Review assignment. The service
role can call both eight-argument R6/C2B6 persistence RPCs and cannot call
their older seven-argument forms.

Before release, TypeScript typechecks, the Next.js Production build, the R6
and C2B6 focused regressions, the direct composer regression, authority docs
check, and a disposable PostgreSQL 17 migration proof passed. The staged
Production build returned its exact SHA, expected runtime fingerprint, valid
identity, and disabled per-deployment release hold on authenticated HEAD
readback. The public alias returned the same values after promotion.

The 2026-10-09 standing owner permission was cited in fresh writing-context
provider approval `10a36fda-09ee-40ab-b011-a0f370ac57f3`, bound to the exact
deployed SHA. Provider project, model, endpoint, standard retention, disabled
data sharing, runtime/configuration fingerprints, rate card, and request/spend
limits remained unchanged. Policy revision
`87bd284b-396f-4c40-ba14-fc6dcd972035` and the Production recovery scheduler
were bound together after promotion. Execution readiness was true, the latest
scheduler request returned HTTP 200, and the new deployment's error log query
returned zero events.

The repair governs new R6 Review assignments. It does not create a lesson for
Scarlett's earlier review-only day or rewrite past Review outcomes.
