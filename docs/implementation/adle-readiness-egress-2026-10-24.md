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
external publication and resolver changes may remain cached for up to 60
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
