# ADLE Canonical Intake Demand Runbook

## Triage

Open `/admin/adle-canonical-intake-readiness`. Resolver Demands mean canonical
identity is unresolved. Teaching Content Demands mean identity is established
and the route's governed teaching dependencies are incomplete.

For `unlocked`, the expected notification is:

> Teaching Dictionary content is required for `unlocked`.

It must show the mapping as resolved and resolver-visible, route Dynamic
Prefix, microskill `D4_MOR_PREFIXES_UN`, and blocker
`canonical_word_missing`.

## Safe actions

An administrator may acknowledge the notification, assign an owner, mark the
demand in review, open the governed content handoff, enqueue a recheck, or
reject/supersede with an audited note. The handoff may pre-populate target,
route, microskill, source, and demand ID; it may not invent or approve facts.

Do not directly mark a candidate ready, create an assignment, substitute a
target token, or edit notification state to imitate readiness.

## Content checklist

Before `unlocked` may activate, an authorised release must provide the complete
reviewed canonical word, status and bands, morphology and reconstruction,
semantic base and teaching surface, approved `lock`/`un-`/`-ed` treatment,
pronunciation and syllables, meaning, dictation/audio alignment, Prefix profile
membership and eligibility, parts/joins, meaning bin, ordered Build choices,
valid-choice audit, provenance, and reviewer approval.

Creating only the canonical row leaves the demand open. Each governed partial
release replaces blockers on the same demand. A complete release enqueues
reconciliation, which creates/reuses the learning item and resolves the
notification without creating an assignment.

## Operations and privacy

- The event queue is primary. The scheduler claims event jobs every five
  minutes. Its missed-event fallback only rechecks blocked candidates whose
  last evaluation is at least 24 hours old (or whose explicit retry time is
  due), so unchanged mapping and content demands do not create a fresh job on
  every invocation. A mapping or governed content release still enqueues an
  immediate recheck. The worker allows up to 60 seconds for a bounded batch.
  Monitor `safetySweepQueued`, queue growth, and scheduler HTTP completion after
  deployment.
- On the staging Vercel Hobby project, Supabase Cron invokes the stable staging
  application route every five minutes. The route remains application-owned
  and requires its existing bearer secret; Supabase Vault also supplies the
  exact Vercel automation-bypass token.
- Validate project `scarletts-spells-staged`, staging database identity, the
  scheduler migration ledger/hash, empty or expected intake state, and the
  protected learner snapshot before activation. Unknown and production
  database identities are rejected.
- Activate with the guarded scheduler operator only after the exact source
  deployment is Ready. Verification requires an active named Cron job, ready
  Vault secrets, successful HTTP responses from at least two natural scheduled
  invocations, and no learner-table mutation.
- Roll back by running the guarded deactivation command, removing the staging
  `CRON_SECRET` value and exact automation bypass, and redeploying only when the
  application environment changed. Preserve scheduler audit metadata and the
  intake event history.
- Inspect oldest unresolved demand, retry/failed jobs, activation latency, and
  duplicate-constraint errors.
- A disabled feature flag makes the worker a no-op and stops new intake.
- Forward-disable instead of deleting candidates, demands, links, or events.
- Use only aggregate affected-child counts in receipts. Do not copy child
  identity, email, raw answers, dictations, notes, database URLs, or secrets.

## Production scheduler boundary

The staging scheduler migration and operator are not reusable in production:
their persisted constraints, confirmation tokens, target host, and Vault names
are deliberately staging-only. Do not modify those values in an SQL console.

Production activation uses migration
`20260805070000_add_adle_canonical_intake_production_scheduler.sql` and the
`adle:canonical-intake-production-scheduler` operator. The operator requires a
production-linked temporary Vercel directory, rejects staging/unknown database
identities, and separates `configure` from `activate` so the matching bearer
secret reaches an exact-source Ready deployment before any Cron job starts.
Use the distinct confirmation value for each mutating operation. On Vercel
Hobby, do not weaken the fallback to a daily schedule. Keep canonical intake
disabled until status proves the exact target and schedule and at least two
natural authenticated invocations have returned HTTP `200` without timeout.

If a downstream real learner-route gate fails after valid learning items are
created, set `ADLE_CANONICAL_INTAKE_ENABLED` to a non-enabled value and redeploy
the exact reviewed source. Leave the scheduler installed so its authenticated
invocations safely no-op. Preserve candidate, demand, queue, learning-item,
lineage, assignment, and event history; do not bulk-delete correct child state.
Any missing optional lesson-wrapper schema must be resolved through that
feature's separately authorized compatibility or migration process before
future intake is re-enabled.

## Readiness and intake reconciliation

The five ticks describe current content/resolver requirements. The Intake column
separately reports recorded admission to ADLE, rather than mastery. Use the
three-dot Teaching Dictionary link for the exact active word profile. Unknown
checks remain under Current blockers; a ready row still awaiting admission
stays unresolved until governed intake records its learning-item receipt.

For stale historical demand bookkeeping, an audited transaction may close a
nonterminal demand only from existing proof: every nonsuperseded linked source
is activated with a matching child/word/skill learning-item receipt, or every
link is already superseded. Preserve candidate, queue, assignment and source
facts; never infer activation from readiness ticks or mark a candidate ready.
Keep distinct rejected/superseded labels and leave absent or contradictory
proof visible for reconciliation. The 2026-10-15 operation rechecked 32 pending
occurrences (28 content and four resolver blockers), closed one already-admitted
word demand and 18 fully superseded historical demands with 19 audit events.
All 71 activated occurrence receipts matched. No assignment or learning-item
status changed. [Aggregate receipt](../implementation/qa/adle-intake-readiness-reconciliation-2026-10-15.json).

The page update was verified in authenticated Preview and Production at exact
code SHA `37b44db35d0724db55e90ca0e6ab2440b7738dea` (Production deployment
`dpl_2a3oFwwLWMjAPbhCEJQcwvXhr86D`). The final read model has 31 blocker groups,
zero unexplained unresolved groups and 48 resolved-history groups. Responsible
has five complete checks, zero waiting users and Resolved · in ADLE; it is
absent from Needs Attention. Its word menu opens the exact Teaching Dictionary
profile, stays within a 616-pixel-high viewport, and retains keyboard dismissal.
Application/scripts types, lint, focused readiness/reconciliation regressions,
15 shared-affix profiles/75 target slots, production builds and authority docs
passed. The exact-SHA provider approval and policy/scheduler cutover preserved
all approved AI terms and limits; authenticated public readback and recovery
delivery returned the final SHA, safety monitor passed, zero unrecorded sends.
The aggregate receipt records the identities and checks.
