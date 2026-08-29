# ADLE Canonical Intake Contract

Current implementation status (2026-08-29): R8B/R8C/R8D, Stage-F governed
source continuation, and bounded automatic reconsideration are released
authorities. Canonical intake feeds learning items and Today's ADLE Session;
it does not create assignments or rewards directly.

## Purpose

Canonical intake converts a parent-approved spelling correction into durable
ADLE readiness state. It may create or reuse a child learning item. It never
creates an assignment, authors curriculum facts, or changes parent approval.

## Identity before content

The route-aware evaluator resolves canonical mapping identity before it checks
the Teaching Dictionary. Exactly one active, reviewed, resolver-visible mapping
with its visibility event establishes the exact mapped target token.

```text
identity unresolved -> pending_mapping -> Resolver Demand
identity established but route content incomplete -> pending_content -> Teaching Content Demand
identity established and route content complete -> activated learning item
```

`canonical_word_missing` is a teaching-content blocker when identity is
established. Mapping-specific blockers are the only source of Resolver Demands.
The same typed evaluator result is persisted and rendered; consumers do not
reclassify blocker codes.

The reviewed example is invariant:

```text
urnlocked
-> unlocked mapping retained
-> pending_content
-> teaching_content demand
-> admin notification
-> automatic later activation
```

`unlock` is not a substitute and must never be inferred.

For Dynamic Prefix, a complete reviewed profile member carries the route's own
assignment-eligibility decision. The canonical word must still have non-empty
age and frequency bands, but a route-certified member is not rejected solely
because the generic pilot band excludes it. Without both a ready route record
and the exact ready word/skill pair, the generic child-band gate remains
fail-closed.

## Durable state

Migration `20260804210000_add_adle_canonical_intake_demands.sql` adds one
technical candidate per source candidate mapping, a stable demand keyed by
demand type/target/route/version/microskill, unique active links, a leased
reconciliation queue, and append-only intake events.

Migration
`20260804223000_qualify_adle_canonical_intake_blocked_links.sql` qualifies the
blocked-state function's link/queue columns so they cannot collide with its
table-shaped output parameters. It does not change the persisted contract or
grants.

The normalized token remains after a later canonical-word ID is attached.
Blockers may be replaced without replacing the demand. New source links, not
retries, increment occurrences. Notification workflow (`unread`, `open`,
`resolved`) is separate from readiness truth.

## Candidate availability is not ADLE readiness

The lifecycle has three separate questions:

1. Does an exact governed occurrence/source exist?
2. Does that exact source own a durable canonical-intake candidate?
3. Does the candidate pass every current mapping, word, microskill, route,
   profile, content, child-band, and route-specific readiness gate?

Migration
`20260828160000_complete_governed_blocked_word_auto_resume.sql` completes the
missing boundary between the first two questions. A controlled Stage-F admin
replay may materialise one exact occurrence source, and one exact eligible
governed source may be authorised for the existing candidate seeder. Both
operations derive word, learner, occurrence, and microskill identity from the
database. They accept no caller-supplied substitute token or route.

Candidate seeding only queues the ordinary evaluator. It cannot create an ADLE
target or treat a released profile as teaching readiness. Historical R8E repair
remains a separate, explicitly governed operation for old occurrences that have
not yet crossed the source/candidate boundary.

## Processing and reconciliation

The approval hook first seeds a durable queued candidate/job, then evaluates
each candidate independently. Ready candidates call the existing atomic
learning-item/source persistence function. Blocked candidates atomically
upsert the technical candidate, stable demand, link, and event.

Governed Teaching Dictionary and Dynamic Prefix releases enqueue affected
targets when the intake queue exists. The application-owned, `CRON_SECRET`-
protected route claims bounded jobs with leases and retries. On Vercel Hobby,
staging schedules that route every five minutes with Supabase `pg_cron` and
`pg_net`; the bearer token and the exact Vercel automation-bypass token are
held in Supabase Vault. Vercel's daily-only Cron configuration does not contain
this job. Both event and safety-sweep paths reuse the same evaluator.
Successful activation resolves the link and notification while preserving the
demand and history. The reconciler has no assignment-table write; only the
normal daily composer can later select an activated item.

Generic transfer-selector profile release and signed-off generic teaching-
content release now enqueue existing candidates by exact microskill. They do
not discover writing issues or manufacture candidates. The Teaching Dictionary
and Dynamic Prefix release hooks remain unchanged. Dynamic Suffix profile and
member publication now enqueue only the affected microskill or exact canonical
word × microskill candidates. Base Word activation-head changes and immutable
curriculum dependency publication enqueue only existing candidates for that
dependency microskill. The five-minute sweep remains the fallback for missed
release events. No release hook creates a governed source, intake candidate,
ADLE item, lineage row, or Review state.

The generic route requires an active approved transfer-selector profile (or
the exact approved word support admitted by the evaluator), an active signed-
off content version, and non-empty child-facing and rule explanations. Dynamic
Prefix and Dynamic Affix require a production-enabled approved profile plus an
approved assignment-eligible exact member and compilable route payload. Base
Word requires an enabled activation revision, immutable curriculum release,
and exact dictionary-closure member. Compound Word requires the immutable
release dependency set, approved structure, and exact closure member. These
route-specific requirements remain independent of candidate creation.

Migration
`20260804234500_add_adle_canonical_intake_supabase_scheduler.sql` owns the
staging scheduler configuration, dispatch, activation, deactivation, and safe
status contract. Its schema constraints pin the target to the stable staging
host, the five-minute expression, and the two reviewed Vault secret names.
Activation and deactivation require distinct staging-ref confirmation tokens;
ordinary client roles have no table or function access. Production is not a
valid target of this staging migration or its operator.

Production publication on 2026-08-05 initially stopped before feature
enablement because production had no equivalent scheduler contract.
Migration `20260805070000_add_adle_canonical_intake_production_scheduler.sql`
and `adle-canonical-intake-production-scheduler.ts` provide the separate
production-pinned sibling. They fix the production database ref, project
name/ID, stable route, five-minute expression, Vault bearer-secret name, and
distinct configure/activate/deactivate confirmations. Production does not use
staging deployment protection, so it does not create or send the staging
Vercel-bypass credential. Configuration installs the matching Vercel
`CRON_SECRET` before activation; activation is a separate operation performed
only after the exact-source deployment is Ready. The staging migration remains
unchanged and must never be repurposed or edited in place.

## Admin and security boundary

`/admin/adle-canonical-intake-readiness` uses `requireAdminUser()`. It displays
safe aggregates, typed demands, blockers, the content checklist, and history.
The Spelling Review hub shows the unresolved notification count.

Allowed actions acknowledge, assign, mark in review, recheck, reject, or
supersede with an audited note. No action marks a candidate ready, activates a
child, creates an assignment, or publishes teaching facts.

All new tables have RLS enabled and ordinary client roles receive no access.
Mutation functions are service-role only. Demand rows contain no child name,
email, raw answer, dictation, or secret. Exact flag value
`ADLE_CANONICAL_INTAKE_ENABLED=enabled` is required for live processing.

The staging-first statements below record the 2026-08-05 release sequence.
They are historical chronology; current R8 authorities are released and
governed as stated at the top of this contract.

The 2026-08-05 targeted production publication proved the intake contract for
one approved submission: twelve Prefix candidates activated, exact target
`unlocked` remained one Teaching Content Demand, and zero Resolver Demands or
reconciliation-created assignments appeared. The normal composer then created
one Prefix V2 assignment. Its learner route exposed a separately deferred
Generic Snapshot column mismatch, so future intake was disabled and all valid
state was preserved. Later R8 releases resolved that temporary disabled state.
This receipt is not current runtime status and does not authorize an ad hoc
backlog replay.
