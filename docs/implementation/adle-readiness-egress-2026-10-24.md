# ADLE readiness and egress implementation ledger — 2026-10-24

## Production baseline captured before code rollout

Production reads used a read-only transaction. `pg_stat_statements` was last reset on 2026-07-22 08:33 UTC, so its counts are cumulative and cannot be attributed to the current week or to a particular endpoint.

| Observation | Measured value | Limit |
|---|---:|---|
| Production project uncached egress, 05 Oct–05 Nov billing period to date | 4.823 GB of 5 GB | Supabase Usage dashboard, hourly refresh; sampled 24 Oct. |
| 15 Oct daily egress | PostgREST 895.836 MB (98.8%); Auth 10.222 MB (1.1%); shared pooler 0.866 MB (0.1%) | Highest visible chart day; dashboard service attribution, not endpoint attribution. |
| 24 Oct daily egress to dashboard refresh | PostgREST 92.633 MB (89.8%); shared pooler 9.397 MB (9.1%); Auth 1.091 MB (1.1%) | Partial day. |
| Canonical word rows / table tuple bytes | 2,191 / 3,053,952 | Tuple bytes exclude JSON framing and HTTP transfer. |
| Word metadata rows / table tuple bytes | 4,280 / 7,963,366 | Same limit. |
| Canonical mapping rows / table tuple bytes | 1,007 / 663,953 | Same limit. |
| Route content version rows / table tuple bytes | 566 / 795,872 | Same limit. |
| One metadata query shape | 250,075 calls; 1.43 ms mean SQL time | Cumulative since reset; no request attribution. |
| One canonical mapping query shape | 249,007 calls; 1.74 ms mean SQL time | Cumulative since reset; no response-byte count. |
| One canonical word query shape | 249,007 calls; 0.73 ms mean SQL time | Cumulative since reset. |
| Production canonical-intake safety sweep | 2,016 runs in seven days; 89 ms mean cron execution; 10,105 ms max; one failed | Measures database cron invocation, not downstream HTTP or Supabase API traffic. |
| Current `missing_metadata` word matches | 16 | The proposed SQL page contains all 16; its word JSON was 2,968 bytes in a direct SQL measurement. |

The Supabase API Gateway logs for the last 24 hours (queried on 24 Oct) give the following **request counts**, grouped by path. They do not give dependable transferred bytes: `content_length` is missing or zero for most rows, and the few populated values are implausibly small for the full responses.

| API path | Requests / 24 h | Interpretation |
|---|---:|---|
| `/rest/v1/adle_reviewed_word_skill_pairs` | 1,301 | Repeated relationship authority reads; investigate page and worker attribution. |
| `/rest/v1/adle_reviewed_word_skill_withdrawals` | 1,298 | Repeated companion authority reads. |
| `/rest/v1/canonical_teaching_dictionary_words` | 737 | Shared among UI and jobs; endpoint count is not a page count. |
| `/rest/v1/rpc/adle_route_activation_revision_is_current_v2` | 541 | Repeated release/currentness checks. |
| `/rest/v1/canonical_teaching_dictionary_import_batches` | 338 | Likely background or admin activity; caller not proven. |
| `/rest/v1/adle_canonical_intake_candidates` | 333 | Likely intake or reconciliation activity; caller not proven. |
| `/rest/v1/canonical_teaching_dictionary_word_support` | 295 | Repeated word support read. |
| `/rest/v1/adle_reviewed_word_skill_releases` | 291 | Approximately five-minute cadence. |
| `/rest/v1/adle_curriculum_dependency_authorities` | 290 | Approximately five-minute cadence. |
| `/rest/v1/adle_curriculum_release_dependencies` | 288 | Approximately five-minute cadence. |
| `/rest/v1/rpc/claim_writing_context_shadow` | 288 | Five-minute worker claim. |
| `/rest/v1/rpc/claim_adle_review_context_job` | 287 | Five-minute worker claim. |
| `/rest/v1/rpc/reconcile_writing_context_shadow` | 287 | Five-minute worker reconciliation. |
| `/rest/v1/rpc/adle_claim_canonical_intake_jobs` | 286 | Five-minute worker claim. |

The route and relationship reads occur roughly 4.5 times as often as a single five-minute job. That ratio points to additional callers or repeated reads inside one run, but the aggregate log query cannot distinguish them. The `content_length` column must not be used as an egress baseline.

One concrete amplification path is `recoverWritingShadowRuns` in `lib/writing-engine/whole-writing/worker.ts`: for each claimed run with evidence enabled it loads the full relationship authority, then loads it again to compare fingerprints before saving. For resolution it also reads the full canonical word table twice. Those second reads protect against mid-run authority changes, so the remedy must preserve that guard (for example, a database-backed version/fingerprint check), not simply remove it. The API path counts above cannot isolate how many of the 1,301 relationship reads came from this worker.

The former Teaching Dictionary status-filter path paged nine complete tables in 500-row batches. At the measured row counts this required 26 table requests per filtered page load before drafts and the relationship authority, including all 2,191 words, 4,280 metadata rows and 2,247 dictation rows. The replacement SQL word page returns at most 50 words, and only those words' metadata/dictation are then fetched. This is a request-shape comparison, not a measured Supabase egress reduction.

The dashboard confirms PostgREST dominates measured egress on sampled days. Supabase API Gateway logs currently expose path frequency but not response bytes per path, according to Supabase's [egress guide](https://supabase.com/docs/guides/platform/manage-your-usage/egress). The repository and database do not expose authenticated page timings or complete response-byte attribution. A before-and-after percentage cannot be stated from this baseline. Capture a seven-day window of API request count, response bytes, p50/p95 latency, Storage bytes, and cron downstream responses before promoting this slice; repeat on the same day/time window after rollout. The [project usage page](https://supabase.com/dashboard/org/spbynuxckgxmkullikzo/usage?projectRef=wwohrqtunajrbwxyssjf#egress) is the billing egress source.

## Changes staged in code

1. The owner-directed `everywere → everywhere` resolver decision was reopened and moved by the existing audited RPCs. The historical mapping is disabled, the resolution item has no skill or mapping, and No Matching Skill case `d718e3ed-b2cb-4b43-b202-e4584e30b4ea` is open. The closed `were/where/wear` lesson's content set was not changed.
2. Teaching Dictionary word filtering now uses a bounded SQL page. SQL checks core metadata/dictation status. Evidence and route-blocked identities still come from the governed relationship interpreter. Only the displayed word IDs load detailed metadata/dictation. The new function needs its migration before this page code can deploy.
3. The word workspace now loads its relationship authority for every existing word, rather than only words with weak-vowel content versions.
4. ADLE lesson preflight scopes route, skill, member, content-review, activation-revision and release reads before building the report. The ADLE Requirements page passes its selected route and skill to that loader.
5. The word workspace API now returns a shared, read-only `WordRouteStatus` for each applicable word–skill–route pair, including pairs that have an approved relationship but no route member. It names dictionary approval, relationship approval, content role and preflight, editorial review, release, activation, blockers and the unevaluated child gate separately. This is an admin projection; native selectors remain the runtime authority.
6. Ordinary Teaching Dictionary pages now load prefix, suffix, base-family and route-content facts only for the displayed word IDs, in batches of at most 100 IDs. The `route_blocked` filter passes relevant approved relationship pairs from the existing interpreter to a new SQL RPC, which combines them with route-content pairs and returns only blocked word IDs. No Teaching Dictionary filter now transfers complete member/content tables to Node just to determine its candidate page. The governed relationship authority itself is still a cached full read and remains a separate optimisation target.

## Remaining implementation gates

These are not represented as completed by this ledger:

- Capture actual Supabase API and Storage egress and page/lesson HTTP timings. Query statistics alone cannot prove savings.
- Define machine-readable word-role and route-content contracts from each native validator, including technical versus editorial blockers. Keep a separate trigger role for words such as `everywhere`; the current homophone selectors require a queued member of their reviewed contrast set.
- Create an affected-pair readiness projection and invalidation for relationship, content, route and review changes. Activation must evaluate only affected route/skill words. Do not broaden route eligibility from spelling substrings.
- Replace the remaining full relationship-authority reads with an incremental governed projection after fingerprint and rollback tests, especially in writing-shadow recovery.
- Feed approved ready content candidates into each native selector while retaining contrast/family membership, child queue, mastery and compiler gates.
- Shadow-compare decisions in staging, prove historical snapshot replay, then switch individual routes with an explicit rollback path. No new route activation or production code rollout occurred in this slice.

## Verification

`npx tsc --noEmit`, `npm run build`, `npm run adle:authority-docs-check`, `npm run adle:teaching-dictionary-manager-regression`, `git diff --check`, `scripts/word-route-status-regression.ts`, and `scripts/teaching-dictionary-admin-page-regression.mjs` pass. The SQL regression uses a disposable PostgreSQL fixture and covers filters, counts, pagination, literal search and invalid input. Staging query/byte comparison and full lesson selection tests remain required before release.

An attempt to apply the full repository migration chain with `npx supabase start` stopped at the existing `20260707120000_fix_teaching_dictionary_display_word_data_quality.sql` migration: it asserts exactly 873 active seeded words, while a fresh local schema has zero. This is a pre-existing seed-dependent migration, before the new page migration. No local Supabase stack remained running from that attempt. The new migration has therefore passed its isolated PostgreSQL test but has not yet been exercised against a full current schema.

## Isolated staging proof — 2026-10-25

The owner authorised a disposable replacement staging project. Supabase project `qkpjbajicacbrphthibk` was created in `eu-west-1`. The Production **public schema only** was restored into it (281 tables; no application rows, learner records, or content rows copied). The new paging migration was then applied exactly and verified: `service_role` can execute the function, while `authenticated` and `anon` cannot. Production was not migrated. Before any further database change, the empty staging migration ledger was reconciled from a read-only dump of Production's `supabase_migrations` schema and 251 exact ledger rows. A transaction verified the copied rows' complete JSON fingerprint matched a fresh read-only Production query. The one already applied paging migration was then marked applied with the exact-version Supabase CLI repair command. Staging subsequently received the route-blocked SQL migration described below, so it has 253 versions, ending at `20261025090000`; no historical SQL was replayed and no application data was copied. A blanket `supabase db push` remains prohibited.

The dedicated Vercel project is `scarletts-spells-adle-staging-20261025` (`prj_pJiDIw4lY9f8wBgLmJCONO0Pngjw`). Its Preview environment uses this staging Supabase project, a synthetic admin, a staging route environment and the writing-context AI hold. No cron jobs are configured. The committed code SHA `9f0419f2bbf03f2f24a00c98000d2c53897e5a8e` was deployed as `dpl_2xtmKqkaoYvSx3NyJVn5Y3EwLNFr` at [the isolated Preview](https://scarletts-spells-adle-staging-20261025-1ikpoertw.vercel.app). Vercel Deployment Protection remains enabled. Two earlier Preview deployments returned Vercel edge 404 because the newly created Vercel project was classified as “Other”; the later deployments explicitly use the Next.js framework preset and serve `/login` with HTTP 200. An accidental Production-target deployment **within the disposable Vercel project only** was deleted before testing. A later command also accidentally created a **Preview** on the existing `scarletts-spells` project; it was removed while still building, before testing or alias assignment. `scarletts-spells.vercel.app` continued to point at the prior Production deployment `dpl_B1XwAKzLmb1hZPszpYday3pwoLxJ`. Neither accident changed a Production route, migration, record, or alias.

A synthetic staging import batch created 61 `fixturewordNNN` rows with missing facts and no relationships. The SQL RPC returned total 61, 50 rows on page 1 (8,672 JSON bytes) and 11 on page 2 (1,925 JSON bytes). These bytes are the direct JSON payload, not measured Supabase billing egress. A protected Preview browser run signed in as the synthetic admin, loaded the Missing metadata filter with 50 and 11 fixture rows on pages 1 and 2 respectively, loaded Evidence approved with zero rows, and loaded ADLE Requirements without HTTP errors. The measured page navigation times in one warmed browser run were 2,085 ms, 1,796 ms, 1,434 ms and 1,688 ms respectively. These staging timings are smoke measurements on synthetic data, **not** the Production before/after baseline. The browser saw zero direct Supabase requests because the tested pages fetch on the server; Vercel runtime logs showed no errors.

The subsequent scoped-route-read Preview loaded All active words (50 rows), Route blocked (zero), Missing metadata (50 and 11 rows), Evidence approved (zero) and ADLE Requirements without HTTP errors. One warmed browser run measured 1,507, 1,144, 997, 1,621, 1,102 and 1,316 ms for those navigations. This does not establish a speed improvement because the route tables are empty in the fixture and the runs were not controlled. The source-level reduction is the removal of unconditional full-table route-member/content transfers on the All, Missing metadata and Evidence approved paths.

The exact route-blocked SQL migration `20261025090000` was then applied through an isolated Supabase migration workdir after a dry run listed **only** that file; a second dry run was empty. The ordinary repository workdir has one pre-existing local-only migration (`20261013120000_homophone_two_confirmations_trigger.sql`), so a blanket push from it was rejected before application. The isolated workdir excluded only that pre-existing drifted file and preserved the other ledger-matching migrations. The new RPC returned one blocked synthetic word for a service-role test pair and denied anonymous execution. Its PGlite regression covers active, inactive, absent, route-content-only and irrelevant-role cases. The latest Preview loaded all four dictionary filters and ADLE Requirements with HTTP 200; its one-run navigations were 3,112, 1,653, 2,263, 1,726, 1,398 and 1,501 ms. These are smoke timings, not evidence of a latency change or billing egress reduction.

A further staging-only route-content fixture linked `fixtureword001` to a synthetic `D4_MOR_PREFIXES_UN` content version without a prefix member or editorial review. The Route blocked page then showed exactly one table row, `fixtureword001`, labelled “Member missing”. This proves that the SQL candidate result reaches the page without granting editorial readiness or activating the route.

The committed-code Preview was rechecked: All active words showed 50 rows, Route blocked one row with “Member missing”, Missing metadata 50 and 11 rows across pages, Evidence approved zero, and ADLE Requirements loaded. Every page returned HTTP 200. No Production deploy or migration followed this proof.

Staging access details and fixture scripts are in ignored local files only. The schema contains two legacy production-reference literals in scheduler function confirmation strings; no staging cron is configured and those functions were not invoked. Before selector shadow comparison, staging still needs representative reviewed route, relationship, content and synthetic child fixtures. No selector switch, route activation, Production release, or historical snapshot replay has occurred.

## Route contract and opt-in read measurement slice — 2026-10-25

Commit `3912d24` added `routeContentContractFor` and a generated inventory of
110 route/micro-skill combinations. It derives activity variants, required and
optional fact owners, word scopes, conditional activity enablement, word counts
and group coverage from the existing registries. This is an extraction of
current route declarations; native validators, reviewed route content,
release authorities and child selectors remain binding. The inventory is
generated separately because the existing broader architecture generator
currently attempts V1 metadata for release-V2 routes and has pre-existing
output drift. Its failure was observed, not treated as a passing gate.

The same commit added an opt-in `ADLE_READ_METRICS_ENABLED=1` aggregate event
around the relationship-authority loader and ADLE lesson preflight. It records
operation duration and, for their instrumented table reads, request count,
rows and serialized JSON payload bytes. It logs no returned rows or raw
spelling evidence. The byte count is the JSON representation received by the
application, **not** measured HTTP wire bytes or Supabase billed egress. Some
direct reads inside the operations are not yet instrumented; the event fields
are deliberately prefixed `instrumented`.

A following measurement extension adds the same wrapper to the daily-plan
facts loader and writing-shadow recovery. It counts the daily-plan loader's
shared `rows()` calls, the worker's initial claim/schedule RPCs and canonical
word pages, and includes instrumented nested relationship reads in the parent
operation. Nested events therefore overlap: do not sum a parent event and its
child event as distinct Supabase traffic. Direct calls and paged proficiency
helpers remain outside these counters. This is an attribution aid, not a
complete five-minute-job egress accounting system.

The first isolated Preview for `3912d24` (`dpl_EerK74Yjs126HwHS8msikM58CqiL`)
exposed an existing sparse-fixture failure in ADLE Requirements: a synthetic
route-content row pointed to a malformed draft without `displayWord`; the
preflight called `.toLowerCase()` and threw, while the page returned HTTP 200.
The earlier staging Preview logged the same error. Commit `60834de` made
preflight classify malformed draft JSON as `Source draft payload is malformed`
and block it. It did not approve that draft or change release behaviour.

The repaired code was deployed to isolated Preview
`dpl_CjvwBTQF6qEVdMmbi9n99hkbmBtR` at
`https://scarletts-spells-adle-staging-20261025-f0gh9cp13.vercel.app` with
the measurement flag enabled only for that deployment. Its Vercel project ID
was verified as `prj_pJiDIw4lY9f8wBgLmJCONO0Pngjw` and its staging-only
`vercel.json` has no cron. The six-page synthetic smoke reached HTTP 200:
Teaching Dictionary All (50 rows), Route blocked (one row), Missing metadata
(50 and 11 rows), Evidence approved (zero), and ADLE Requirements. The latest
ADLE Requirements preflight event had `status=ok`, 13 instrumented table
requests, 62 rows, 9,245 JSON payload bytes and 1,293.2 ms wall time; Vercel
logged no other errors for that request. A separate service-role read against
the disposable staging database measured the relationship-authority loader:
12 instrumented requests, 63 rows, 6,482 JSON payload bytes, 1,255.8 ms wall
time, and zero approved relationships in this synthetic fixture. These are
single staging observations, not Production baselines or before/after savings.

The measurement extension in `454d5a0` was deployed to the same isolated
project as Preview `dpl_5x7AoFubbZZNNxzQarXjDa9UVNcH` at
`https://scarletts-spells-adle-staging-20261025-1e0b4vkne.vercel.app`.
Its six-page synthetic smoke returned HTTP 200 with the expected 50/1/50/11/0
Teaching Dictionary row counts; ADLE Requirements also loaded. Its preflight
event reported `status=ok`, 13 instrumented requests, 62 rows and 9,245 JSON
payload bytes. The sampled Preview request logs contained no errors. The
writing-shadow worker was not invoked against staging because there is no
claimed synthetic run fixture; its existing isolated worker regression passed.

`npm run adle:route-content-contract-regression`,
`npm run adle:teaching-dictionary-manager-regression`, `npx tsc --noEmit`,
the Next.js build and `npm run adle:authority-docs-check` passed. The Preview
build also passed. No schema migration, learner row, Production deployment,
mapping, content approval, route activation or selector was changed in this
slice. Production measurement still needs a comparable window and reliable
request/response attribution before numeric savings targets can be set.

## First phase-2 status slice — 25 Oct 2026

The existing `wordRouteStatus` evaluator now attaches the versioned route
contract and stable gate codes while retaining the legacy blocker text and
native `administrativeCandidate` decision. It distinguishes route facts known
to pass native validation from facts not yet proven complete, and keeps
editorial review separate. The preflight now carries native validation
blockers separately for route-content drafts; it does not infer technical
completeness from an approval or a release. A present unreviewed draft is
reported as present and awaiting review, rather than as absent route content.
The Teaching Dictionary word workspace displays the facts and editorial
dimensions. The evaluator remains read-only and is not a selector authority.

The isolated staging Preview `dpl_AVTWMxa7zfkhBjNQHKYY7AnKX18g` at
`https://scarletts-spells-adle-staging-20261025-1x6ivqmkt.vercel.app` was
built from the staging-only Vercel project with no cron or schema change. The
synthetic `fixtureword001` page rendered separate “Route facts: not yet proven
complete” and “Editorial review: pending” labels. Its status API returned one
`dynamic_prefix_word_lab` status with `administrativeCandidate=false`,
`technicalFacts=not_proven`, `editorialApproved=false`, and eight explicit
blockers. The prior Preview also returned `administrativeCandidate=false`, but
incorrectly said route content was absent; the new status exposes the existing
malformed draft and its pending editorial sign-off. This is a controlled status
correction, not a lesson-admission change or a Production performance result.

Focused status, Teaching Dictionary and route-contract regressions, authority
documentation check, lint, TypeScript and the full Next.js build passed.
Phase 2 still needs scoped governed relationship reads, cross-page consumers,
and representative reviewed staging fixtures before any selector is switched.

## Word-scoped governed read slice — 25 Oct 2026

The Teaching Dictionary word detail and its lesson-readiness API now request
one word's governed relationship evidence. The shared repository still uses
the existing adapters and canonical interpreter. It scopes canonical mappings
by normalized spelling; visibility events by mapping ID; generic supports,
specialist members and pair decisions by canonical word ID; then follows the
referenced profiles and import batches. It also reads all canonical identities
with the same normalized spelling so a duplicate remains an unstable identity.
Reviewed writing pairs are read by word first, then their releases and
withdrawals are fetched and ordered as in the all-word path. The result uses
the existing evidence cache tag and 60-second TTL, so the detail render and
its API can share a recent word result. List and background consumers retain
their full authority read; no alternate approval or selector rule was added.

An isolated staging comparison used five synthetic words. It temporarily
added and then removed three synthetic generic-support rows: one approved
example, one approved contrast and one unreviewed example. For all five words,
the scoped and full loaders returned identical exact-word relationships and
decisions. On that small fixture, the full authority read transferred 67 rows
and 7,713 serialized JSON bytes across 12 instrumented table requests; the
approved word's scoped read transferred 5 rows and 788 bytes across 10
instrumented requests. Those counts exclude the writing-release loader's
direct reads and the base-word loader's direct reads. They measure application
JSON, not HTTP transfer or billed Supabase egress. A committed in-memory
PostgREST regression additionally compares positive resolver and reviewed
release evidence, deassignment, withdrawn release evidence and duplicate
normalized spelling identities between full and scoped reads.

This slice reduces per-word data transfer on a cold read. It does not prove a
site-wide latency or billing improvement. The scoped read still makes several
dependent requests, and activated base/compound releases can carry larger
route-wide projections. Manager mutations expire the shared tag immediately;
out-of-band publication and resolver changes may remain cached for up to 60
seconds. The next read-efficiency work should measure real Production request
and egress attribution, scope route release projections where authority checks
allow it, and wire cross-system invalidation before promising immediate
readiness updates. The list page and lesson selectors were not switched.

Commit `f093b6a` was copied file-for-file into the dedicated staging Vercel
project and deployed as Preview `dpl_26aEb33Voo4FagXRtqJhFswV6ctK` at
`https://scarletts-spells-adle-staging-20261025-aellhhn8j.vercel.app`.
The synthetic admin signed in through Chrome, opened `fixtureword001`, and
saw the word workspace and completed lesson checks. The inactive prefix route
still showed the malformed draft, missing editorial sign-off, missing reviewed
release and profile gate blockers; Launch lesson remained disabled. The
Preview error log query returned no errors for the sampled window. The
browser proof is saved locally at
`.tmp/adle-staging-2026-10-25/scoped-word-preview.png` (ignored fixture
evidence). No Production deployment or schema change occurred.

## Cross-system admin cache invalidation slice — 25 Oct 2026

The shared Teaching Dictionary evidence cache already had a tag, but its
successful invalidation calls were largely confined to Teaching Dictionary
actions. Resolver visibility changes, unified resolver confirmations and
demotions, reviewed word-skill publication and withdrawal, No Matching Skill
resolution, hidden mapping adoption, catalog mapping decisions, and lesson
release/rollback could therefore leave the word workspace and evidence-filter
list showing an older relationship result until the 60-second TTL elapsed.
The corresponding successful Server Actions now expire that shared tag after
their governed write. The lesson-launch action also expires it after a
compensating rollback, and catalog mapping creation expires it immediately
after its committed RPC even if downstream continuation later reports an
error. Teaching Dictionary workspace saves now expire the tag on success
instead of marking it stale for background revalidation. The base-family
withdrawal action also expires it.

This is cache coordination, not automatic editorial approval, route
activation or selector admission. The tag is currently shared by the full
list and every word-scoped entry; invalidation is lazy and does not scan the
dictionary, but the next visits to many different words may each re-fetch.
Out-of-band SQL and release scripts do not call a Next.js Server Action, so
their cache visibility is still bounded by the 60-second TTL. A later slice
needs an explicit affected-word/version signal or scoped tags for those
writers, with measured query counts before adding a database event mechanism.
No billed-egress saving is claimed for this invalidation slice.

Commit `8ccda25` passed focused Teaching Dictionary and word-skill scoped-read
regressions, lint, TypeScript, and the full Next.js build. Its exact changed
files were copied into the isolated staging source and deployed as Preview
`dpl_8fm3eY4Hho1fMuRQyA98WzB61dw4` at
`https://scarletts-spells-adle-staging-20261025-jxjbcvhfm.vercel.app`.
The Preview reached `READY`; the synthetic `fixtureword001` workspace loaded
with one joined but unapproved skill, eight blockers, and an inactive route.
Canonical Resolver and Word–skill review pages also loaded. The review,
publication and withdrawal controls are off in this disposable project, so
this smoke did not exercise a publication or prove immediate post-mutation
cache visibility. The sampled Preview error-log query returned no errors.
The browser screenshot is retained locally at
`.tmp/adle-staging-2026-10-25/cache-preview.png` (ignored fixture evidence).
No Production deployment or database mutation occurred in this slice.

### Live cache-transition proof on disposable staging — 25 Oct 2026

After the read-only smoke above, a separate synthetic proof exercised both
mutation paths on the same Preview. The disposable staging review controls
were temporarily enabled; enrichment inventory, generation and replay stayed
disabled. A reviewed `demonstrates` pair linked synthetic `fixtureword002`
(`f3b1173c-a1c6-4925-9968-72b9c4d28ab1`) to
`D4_MOR_PREFIXES_UN`. The package is
`5a7df74e-a2d9-4e8c-9ce1-47128e367e55` and its release is
`00e5b8c2-9727-41d3-ad3f-f879146e527f`.

| Transition | Word workspace result | Observation |
| --- | --- | --- |
| Warm read before publication, 12:55:42 UTC | 0 joined skills | Within the 60-second cache lifetime before publication. |
| Publish reviewed pair, 12:55:51 UTC; read at 12:55:58 | 1 joined skill | The changed status appeared within 16 seconds of the warm read. The route remained inactive and the word lacked reviewed route content. |
| Warm read before withdrawal, 12:56:19 UTC | 1 joined skill | Same exact word and Preview. |
| Withdraw release, 12:56:25 UTC; read at 12:56:29 | 0 joined skills | The prior status disappeared within 10 seconds of the warm read. |

The instrumented relationship loader emitted nine table requests, three rows
and 279 serialized JSON bytes on the first word reads after publication and
withdrawal. At 12:58:17–20 UTC, two further same-word reloads produced one
relationship-loader event, consistent with the second read using the cache.
These are application JSON and query counts, not billed Supabase egress.
The before/after UI transitions within the TTL, together with fresh loader
events after the writes, are evidence that the deployed publication and
withdrawal actions expired this cache entry. They do not cover every other
admin writer or prove Production behavior.

The first publication attempt exposed a missing seed row in the schema-only
staging copy: `writing_enrichment_authority_events.environment_key` required a
`writing_enrichment_controls` row for `staging`. The row was inserted with all
execution flags false, then a transactionally rolled-back publication check
passed before retrying through the UI. The reviewed synthetic release was
withdrawn, review/publication/withdrawal controls were restored to off, and
the disabled enrichment control row remains because the immutable publication
event references it. No learner, route activation, Production record or
`everywhere` assignment changed. Final screenshot:
`.tmp/adle-staging-2026-10-25/cache-transition-withdrawn.png` (ignored
fixture evidence).

### Shared route-word status in admin views — 25 Oct 2026

Commit `80960be` added a route/skill-scoped governed status read to ADLE
lesson readiness and the filtered ADLE Requirements detail. It batches the
same relationship interpreter used by the Teaching Dictionary word workspace,
including pair decisions and withdrawn reviewed releases. The route view
discovers candidates from route content, reviewed pairs, generic support,
visible active resolver mappings, and prefix/suffix memberships. A withdrawn
reviewed pair with no other current source is excluded from its candidate
list. The intake view requests only dictionary IDs on its 25-row page. Both
views use `wordRouteStatus`; intake facets and child selection retain their
separate meanings. No selector, release, approval or Production database state
was changed.

The batch authority regression matched full-read relationships and decisions
for approved, deassigned, withdrawn and unstable-identity fixtures. TypeScript,
targeted lint, the word-route-status regression and the isolated staging
comparison passed. In the disposable staging project, synthetic
`fixtureword001` had the same relationship, technical, editorial, activation
and administrative gates in the route read and the existing word-scoped read.
The route read showed one candidate, zero approved relationships and zero
administrative admissions; the withdrawn-only `fixtureword002` was absent.

The local staging read emitted 15 instrumented table requests, eight returned
rows and 892 serialized JSON bytes for route-wide candidate discovery and
status; the two-word explicit scope emitted 10 instrumented requests, seven
rows and 778 serialized JSON bytes. Durations were 616 ms and 465 ms in that
run. Instrumentation does not cover every underlying call, so these are
lower bounds for request count and application payload proxies, not HTTP
transfer or Supabase billed egress. No like-for-like prior route-status
baseline exists because that status was not previously displayed.

The isolated Preview `dpl_H3yY7DwrFAFjFafYqCo4nPikFapB` reached `READY` at
`https://scarletts-spells-adle-staging-20261025-lblwwjqnr.vercel.app`.
Chrome displayed the selected prefix route's one blocked word and its eight
gate messages. A temporary synthetic intake demand then displayed the same
governed gates and blocker messages in ADLE Requirements, alongside its
separate intake facets. The demand was deleted and a reload showed zero rows.
The screenshot is retained locally at
`.tmp/adle-staging-2026-10-25/shared-route-status-intake-preview.png`.
The disposable project has no learner data and its route and intake execution
controls remain off. This proves the admin projection, not automatic lesson
admission, Production egress savings, or the child-specific selector.

### Affected-word transition and prefix selector shadow — 25 Oct 2026

Commit `e1e36ae` added a read-only comparison for the dynamic prefix route.
It compares governed administrative candidates with the current production-
enabled prefix profile pool, observes the native four-word selector and runs
its existing compiler. It never passes a candidate into the assignment
writer. The synthetic regression detects both an otherwise eligible word
missing from the native pool and a native member without governed readiness;
it also verifies a compiling four-word selection and a disabled profile.

The disposable staging read for `D4_MOR_PREFIXES_UN` found one blocked route
word, zero governed candidates and zero native profile words. No child or
released prefix profile exists in this schema-only project, so this is a
negative comparison only. The prefix route's existing atomic publisher in
`20261015151000_teaching_dictionary_atomic_launch.sql` already inserts a
reviewed content word into a new profile snapshot as a member after checking
editorial review, dictionary facts and profile identity. The shadow therefore
tests that governed handoff rather than introducing a second runtime word
list.

A temporary synthetic approved support row for `fixtureword001` changed its
route relationship gate from unapproved to approved on the next live scoped
read. Its administrative candidate gate stayed false because content,
release and activation remained blocked. Deleting the support row restored
the unapproved gate on the next read. The temporary import batch and support
row were removed in `finally`; no route, child, Production record or
`everywhere` mapping changed. The three route reads emitted 27, 28 and 27
instrumented requests, respectively; 10, 13 and 10 returned rows; and
1,375, 1,996 and 1,375 serialized JSON bytes. These include the route
preflight and are lower bounds on request count and application payload
proxies, not Supabase billed egress or a before/after savings claim.

The status projection is computed on read: a word read scopes the word, and
route activation view scopes the route and micro-skill. Governed admin writes
invalidate the shared word-evidence cache; out-of-band writes can remain in
that 60-second word cache until its TTL expires, while the route view reads
live. There is no persisted readiness projection to backfill or refresh in
this slice.

A later disposable database fixture supplied four synthetic approved prefix
words, metadata, dictation, support relationships and one enabled reviewed
profile. A synthetic child item was passed in memory; no child or assignment
row was written. The real profile loader returned four words, the native
selector chose four, the compiler passed, and the shared admin status
reported four candidates with released and activated gates. A temporary
staging pair de-assignment then reduced the admin candidates to three while
the unguarded selector still chose four and compiled. This is a confirmed
selection gap for current exact-pair decisions. The new writer veto reads the
latest pair decisions for its profile candidates in one scoped PostgREST read
per 100 word IDs; the same fixture proved the guarded selector returned no
lesson with only three approved words. The pure regression also proves a fifth
reviewed word can replace a withdrawn transfer. A later restore returned the
admin count to four and removed the veto. Disabling the profile emptied the
native pool. All synthetic profile, word, support, decision and batch rows
were deleted; the final staging read again found no native prefix profile.

This test stops before the authenticated assignment writer and persistence
boundary. It proves the loader, authority projection, veto query and selector
decision, not a completed learner assignment or historical snapshot replay.
The additional veto read has a bounded selected-column payload; billed egress
and end-to-end response time still need an authenticated staging baseline.

Commit `65199b5` contains the prefix writer veto and regression. The isolated
Vercel project `scarletts-spells-adle-staging-20261025` built it as Preview
`dpl_3PeFjtr2c1s29jtfWcBTMGcNtWtS`, with a `READY` inspection at
`https://scarletts-spells-adle-staging-20261025-r0n15no19.vercel.app`.
Production was not deployed. A final disposable database check found zero
children, zero ADLE learning items, zero proof profiles, and zero proof import
batches. Preview build success does not establish an authenticated assignment
or historical replay; that remains the next proof gate.

## Authenticated prefix save gate — 25 Oct 2026

The next disposable Supabase fixture created one child under the synthetic
staging admin, one verified-misspelling ADLE learning item, five reviewed
`un-` profile words and their required morphology, support and dictation
facts. Temporary active review and banding policies made the normal daily
plan writer runnable in the otherwise empty isolated project. The signed-in
admin's user client and the normal service-role writer prepared a four-word
prefix lesson; the shared compiler's shadow comparison matched.

After preparation, an exact-pair `deassign` event withdrew one selected
transfer. The new transaction-scoped persistence RPC rejected the stale
lesson with `ADLE_PREFIX_PAIR_DEASSIGNED`; the writer returned
`relationship_withdrawn_before_persistence`, and the child had zero saved
assignments. A fresh prepare selected the fifth reviewed word in its place,
saved one assignment, and loaded a `ready` frozen lesson snapshot. Withdrawing
that replacement **after** save left the historical snapshot byte-for-byte
unchanged on a second read. The fixture's `finally` cleanup removed the
assignment, child, policies, decisions, words and batch; a final read found
zero residual batch and decision rows. This proves the normal authenticated
writer and read-model boundaries in isolated staging, not a browser lesson
interaction or Production behaviour.

The transaction lock is shared by prefix pair-decision inserts and the new
prefix save RPC. It orders a concurrent withdrawal against assignment save:
withdrawal first rejects the save; save first produces a historical assignment.
The five-word test proves the former order and post-save replay. A concurrent
two-session stress test and browser completion remain separate acceptance
checks. This change does not alter existing child proficiency, queued learning
items, resolver mappings or review schedules on de-assignment. Those lifecycle
behaviours need the phase-3 policy and tests in the implementation plan.

The isolated Preview containing the new writer is
`dpl_ASq9yfdQUrtMHDduMRj3PqHnJxUA` at
`https://scarletts-spells-adle-staging-20261025-8g2848x6z.vercel.app`;
its build and TypeScript check passed and Vercel reported `READY`. The applied
staging schema ledger ends at `20261025150000`; the follow-up definition
fails closed on a null environment, route or word set. The authenticated
five-word proof passed again after that hardening. A final staging count found
zero children, learning items, assignments, proof profiles, proof batches and
temporary active policy versions. Production was not migrated or deployed.

## Withdrawn word queue and review proof — 25 Oct 2026

The daily-plan fact loader now reads current exact-pair deassignments in
bounded, selected-column pages. It keeps the persisted child learning item but
excludes the withdrawn pair from new-lesson inputs, probe-miss candidate
inputs, and active teaching/proficiency supports. The word's existing review
schedule and review-word facts remain available. Review outcomes still feed
word-level evidence pricing; current governed relationships, rather than the
historical review attachment, determine whether positive evidence contributes
to a micro-skill. A newest withdrawn learning item cannot override an active
pair as the new lesson's primary skill for the same word.

The pure evidence regression passed. An authenticated disposable staging
fixture then inserted a pending item and historical review for a selected
transfer, withdrew its exact pair, and called the real `loadDailyPlanFacts`
boundary. It observed one blocked-but-retained item, zero withdrawn pairs in
new-lesson needs or proficiency supports, a retained scheduled review, and
positive word-level review credit. The same run proved stale assignment
rejection, fifth-word replacement, saved snapshot replay and post-save
withdrawal replay. The temporary child, outcome, schedule, decisions, words,
policies and batch were removed; the append-only trigger disabled solely for
deleting the synthetic outcome was restored and verified. Production was not
queried or changed.

This establishes word-level credit, not automatic `mastered` status: the
current mastery policy also requires parent-reviewed authentic use. Resolver
skill attribution on a deassigned mapping and a learner-facing explanation of
blocked queued needs remain separate gates. The extra latest-decision read is
instrumented; a before/after Supabase billed-egress and p95 comparison remains
required before claiming a speed or cost improvement.

The instrumented repeat in the disposable staging database reported three
`daily_plan_facts` reads at 26 instrumented queries each, 80–85 rows,
19,668–21,494 serialized JSON bytes, and 353.5–723.1 ms end-to-end. The
new latest-decision query returned 0 or 1 rows (2 or 122 serialized JSON
bytes) and took 150.9–496.3 ms in this small sample. Those reads run in
parallel with other fact queries, so their individual latency is not an
end-to-end latency delta. These are application instrumentation proxies from
three synthetic calls, not billed egress or a comparative production baseline.
The fixture again finished with zero proof batches, children and temporary
policies; the review outcome append-only trigger was enabled.

Commit `5ec0a4e` was copied into the staging-only Vercel source and built as
Preview `dpl_2NRd7w7QzqocezJHrzYKMYeo2rbz` at
`https://scarletts-spells-adle-staging-20261025-dyw914jh6.vercel.app`.
Vercel inspection reported `READY`; a signed-in Chrome dashboard loaded,
and the sampled Preview error-log query returned no errors. The CLI's initial
deployment polling timed out after upload, but deployment inspection confirmed
the build completed. No Production deployment occurred.

## Comparable dynamic-prefix status/selector baseline — 25 Oct 2026

The disposable staging project ran one held five-word `D4_MOR_PREFIXES_UN`
fixture with a live deassignment and synthetic child. The measurement script
ran the route word status read, native profile and queue read, current pair
veto, and read-only selector/compiler shadow in that order. It discarded one
warm-up and recorded five repetitions against the **same database state**.
`fetch` response clones supplied decoded HTTP body sizes; these are neither
compressed wire bytes nor Supabase billed egress. No raw learner evidence was
logged. The fixture later verified saved snapshot replay and removed every
synthetic learner and content row.

| Same-workload measure | Before pilot contract | After pilot contract |
|---|---:|---:|
| Supabase requests per run | 50 | 50 |
| Decoded response bytes per run | 51,349 | 51,349 |
| Status read requests / bytes | 45 / 39,527 | 45 / 39,527 |
| Native profile, queue and veto requests / bytes | 5 / 11,822 | 5 / 11,822 |
| Combined elapsed median, five warm runs | 1,573 ms | 1,641 ms |
| Combined elapsed observed range | 1,469–1,714 ms | 1,578–1,929 ms |
| Statuses / live native members / selected | 6 / 4 / 4 | 6 / 4 / 4 |
| Selected without administrative admission | 0 | 0 |

The after result is a **diagnostic contract change**, not a transfer
optimization. Request count and decoded bytes remained exactly equal; the
small latency difference across five runs does not establish a regression or
improvement. Across the five baseline repetitions, the prefix-profile path
returned 144,615 decoded bytes in 30 requests, the largest measured path.
The status service made 45 of the 50 requests, so it is the next scoped-read
optimization target. The baseline does not cover the five-minute worker,
other routes, browser page timing, Storage, or Production's seven-day billed
egress; those require separate comparable observations before sitewide claims.

The exact diagnostic commit `22c5f8a` was built in isolated Preview
`dpl_5SdvBf74Fu2eC4668DopCX6pgoy6`. A fresh synthetic fixture after the
build repeated five reads at 50 requests and 51,349 decoded bytes each, with
1,772 ms median combined elapsed time. Its four selected words matched all
four governed candidates and compiled. The fixture completed its historical
replay checks and cleaned up. Latency remains a small, noisy staging sample;
the unchanged request and byte counts are the supported conclusion.

## Dynamic-prefix preflight duplicate-read reduction — 25 Oct 2026

`loadLessonReadiness` previously called `loadDynamicPrefixProfiles` twice
for the same route even when there was no reviewed draft member to overlay.
The candidate call's only difference in that case is its
`productionEnabled` presentation flag. Preflight now reuses the first
validated profile result and enables that flag on a copy. It still performs
the separate candidate read when reviewed draft members exist. Relationship
discovery is unchanged, including inactive and historical profile members.

The same five-word, post-withdrawal synthetic staging workload was repeated
with one warm-up and five measured reads:

| Measure per run | Recorded baseline | Optimized local code |
|---|---:|---:|
| Supabase requests | 50 | 46 |
| Decoded HTTP response bytes | 51,349 | 40,526 |
| Admin status requests / bytes | 45 / 39,527 | 41 / 28,704 |
| Native selector requests / bytes | 5 / 11,822 | 5 / 11,822 |
| Combined median elapsed | 1,573 ms | 1,795 ms |
| Statuses / native members / selected | 6 / 4 / 4 | 6 / 4 / 4 |

This proves four fewer requests and 10,823 fewer decoded response bytes for
the measured route/status operation. It does **not** prove a response-time
improvement: the small latency sample was slower, and runs used different
synthetic fixtures and network conditions. It also does not measure compressed
transfer or billed Supabase egress. The four selected words matched the four
governed candidates, had administrative admission, compiled, and the
withdrawal/replay fixture passed and cleaned up. Production and other routes
remain unmeasured for this change.

Commit `9c435b1` built successfully in isolated staging Preview
`dpl_Bzom2avrjrkXTZkHUSLJzVCodxi5`. A new synthetic fixture after that
build repeated five status/selector reads: 46 requests and 40,526 decoded
bytes per read, six statuses, four governed candidates, four selected words,
and none selected without administrative admission. The native compiler
passed. The assignment gate rejected a withdrawn pair before save; a
replacement lesson saved and replayed; a later withdrawal left the historical
snapshot unchanged. Cleanup reported zero residual batches and learner
writes. Combined elapsed median was 1,923 ms in this fresh run, reinforcing
that the limited timing data cannot establish a speed benefit. The Preview
itself was built and READY; this proof exercised the exact code against the
isolated staging database, not a signed-in browser request to that Preview.

## Route-scoped draft approval reads — 25 Oct 2026

`loadLessonReadiness` also read the entire
`teaching_dictionary_overview_reviews` and
`teaching_dictionary_manager_publications` tables on each scoped route check.
It now reads only draft IDs present in the selected route-content versions,
using the existing bounded ID batch helper. The selected draft and review
interpretation is unchanged.

The ordinary prefix fixture had one scoped route-content version and zero
rows in either approval table. Its request and byte counts stayed at 46 and
40,526 per run, as expected. To test transfer, 60 disposable **unrelated**
drafts, reviews and publications were added in isolated staging. The same
held child/route state was read with the previous and revised code, with one
warm-up and five measured repetitions each:

| Same-state staging read | Previous full-table read | Scoped draft read |
|---|---:|---:|
| Supabase requests per run | 46 | 46 |
| Decoded HTTP response bytes per run | 52,878 | 40,526 |
| Status read requests / bytes | 41 / 41,056 | 41 / 28,704 |
| Statuses / native pool / selected | 6 / 4 / 4 | 6 / 4 / 4 |

The complete six-word shadow decision projection matched before and after,
including blocker codes and the withdrawn pair. This synthetic comparison
shows 12,352 fewer decoded bytes when unrelated review rows exist; it is not
a Production egress or latency estimate. Every disposable draft, review and
publication was removed, its staging immutability trigger was verified
enabled, and the original child/assignment fixture passed replay and cleanup.

Commit `fc6dd4b` built and typechecked in isolated staging Preview
`dpl_ArEP19HUjc2jvYtyBmoZJtbKSZpH`. A new synthetic child/route fixture
after the build repeated five measured reads at 46 requests and 40,526
decoded bytes each. All four governed candidates were the four native
selected words, with zero selected without administrative admission; the
native compiler passed. Withdrawal before save, replacement and historical
replay passed, and the fixture cleaned up. This is a code-plus-staging proof;
the protected Preview's authenticated page was not exercised in Chrome in
this pass.

## Daily-plan read baseline — 25 Oct 2026

`scripts/adle-daily-plan-performance-staging.ts` measures two read-only
operations against the held five-word synthetic child after one warm-up and
five repetitions. It signs in the disposable staging admin before measurement
and counts only Supabase response bodies during each measured phase. The
preparation phase does **not** persist an assignment.

| Staging operation | Requests per run | Decoded response bytes per run | Median elapsed |
|---|---:|---:|---:|
| `loadDailyPlanFacts` | 27 | 21,718 | 233 ms |
| `prepareDynamicPrefixAssignment` | 33 | 33,542 | 673 ms |

The active canonical-word read returned 16,661 decoded bytes per run in
**each** operation, 77% of the fact-load response bytes. The preparation
also read a prefix profile and child queue. This is a synthetic one-child
baseline, not billed egress or a Production latency estimate. The fact loader
is shared by other lesson routes, so narrowing its word pool requires proving
transfer-word, review, banding, family/group and child-selection coverage
before changing its query. The fixture's withdrawal, snapshot replay and
cleanup checks passed after measurement.

## Specialist profile scope — 25 Oct 2026

When a prefix or suffix assignment names a required profile, its writer now
passes that micro-skill key to the existing profile loader before the database
read. The previous writer loaded every profile in the family and filtered the
result afterward. Unspecified-profile selection still reads the whole family.

Read-only Production aggregate queries found 5 active approved prefix profiles
with 38 members and 10 active approved suffix profiles with 45 members. An
exact-profile request therefore has a narrower profile/member read. This is a
query-shape improvement, not a measured Production byte or latency saving.
The same aggregates found 2,191 active canonical words; their eight selected
fields totalled 530,059 bytes as SQL `row_to_json` text before response-array
and HTTP framing. The daily-plan loader reads this full catalogue and remains
the larger measured optimization target. No word text or learner evidence was
retrieved in these aggregate checks.

The disposable staging prefix fixture has only one active profile, so a
five-sample preparation comparison remained at 33 Supabase requests and
33,542 decoded response bytes per run. Its compiler parity, withdrawal veto,
saved snapshot replay, and cleanup passed. This sample does not prove a speed
gain: the median preparation time was 712 ms versus the earlier 673 ms and
the runs were taken at different times. The suffix route was covered by its
loader and shared-authority regressions, not by a signed-in staging lesson.

## Conditional generic morphology read — 25 Oct 2026

The daily-plan fact loader fetched active word morphology even when no active,
reviewed generic transfer-selector profile could consume it. The morphology
read now runs only when such a profile exists. It remains live when a reviewed
profile exists; no approval or child gate is cached or bypassed.

Read-only Production aggregates found 2,191 active, approved morphology rows
and **zero** active transfer-selector profiles. Their selected columns totalled
681,228 bytes as SQL `row_to_json` text over the full table. That total is a
table-size proxy, not measured PostgREST transfer or billed egress; the old
unpaged read could also be capped by the API row limit. It does confirm the
Production read is currently unnecessary for generic transfer selection.

## Scoped generic dictation read — 25 Oct 2026

The shared daily-plan fact loader previously fetched every active, approved
dictation sentence even for specialist routes. Generic v3 authoring is its
only consumer. The generic path now composes the lesson first, then fetches
approved dictation only for its selected word IDs. Empty selections issue no
dictation request. Missing or unapproved sentences still block generic
authoring; the compiler receives the same selected facts.

Production has 2,191 active, approved dictation rows. Their five selected
fields total 627,007 bytes as SQL `row_to_json` text across the full table.
This is a size proxy, not HTTP or billed egress; the former unpaged HTTP read
may have returned at most 1,000 rows. The scoped request contains at most the
composed lesson's five words and cannot be silently truncated at that limit.

On the same disposable five-word prefix fixture, five measured runs after one
warm-up changed the daily-plan fact read from 26 requests/21,716 decoded bytes
to 25 requests/20,406 decoded bytes; prefix preparation changed from
32/33,540 to 31/32,230. The 1,310-byte reduction is specific to the
fixture's five approved sentence rows. Median elapsed times were 318 ms and
706 ms respectively, so this sample does not establish a speed improvement.
The prefix compiler parity, concurrent withdrawal before save, replacement,
historical snapshot replay and zero-residual cleanup passed. The generic v3
regression verifies the scoped ID query, approval filters, unchanged authoring
and missing-content block. Production endpoint egress remains unmeasured.

The same held synthetic child, one warm-up and five measured staging runs
changed `loadDailyPlanFacts` from 27 requests / 21,718 decoded response bytes
to 26 / 21,716. Prefix preparation changed from 33 / 33,542 to 32 / 33,540.
Staging had no morphology rows in this fixture, hence the two-byte response
difference. Compiler parity, withdrawal, saved replay and cleanup passed.
Median timings were 481 ms for facts and 995 ms for preparation in this run;
these were slower than the earlier runs, so no speed improvement is claimed.

## Support-source reuse and catalogue completeness — 25 Oct 2026

The Authentic Use proficiency path read the complete support table in
`loadDailyPlanFacts` and then read it again inside relationship authority.
Commit `28c02fc5f1db329c759e4264e70760d5745ea9da` reuses the request's
complete source rows, including inactive rows and governance fields, while
retaining the authority's prior ID order and source fingerprint. A focused
relationship regression found identical decisions and fingerprint without the
second table read. In the disposable 1,006-support fixture, the full/scoped
comparison used six support requests across both loads versus twelve before
the change. Composed lessons and proficiency reports matched. Withdrawal,
review mastery credit, saved assignment replay and fixture cleanup also
passed. These are staging request counts, not measured Production egress.

The commit was released as Production deployment
`dpl_2SYGocQAcagj9pwRGLyMNh3Tmcfi`. Its public authenticated HEAD readback
reported the exact SHA, valid identity, unchanged runtime fingerprint and
release hold disabled. Fresh exact-SHA approval
`fb35215e-c663-45bc-b9ae-2d178e9166f5` cites the owner's 9 Oct standing
permission. The policy and five-minute scheduler were rebound to that SHA.
The 23:10 UTC job returned HTTP 200 from the new SHA, both workers idle,
zero unrecorded sends and no deployment error logs.

An additional Production aggregate found 1,144 active support rows. The
ordinary full fact loader's former unpaged support request could return only
the first 1,000 rows under the PostgREST limit. The next bounded fix pages
support rows in every mode. A disposable staging fixture with 1,006 rows
returned all 1,006 in three pages without changing the lesson, withdrawal or
replay checks. This completeness fix may add requests to ordinary full reads;
its measured Production egress effect remains unknown.
