# ADLE Canonical Intake Staging Receipt — 2026-08-04

Status: `BLOCKED_AT_PINNED_PREVIEW_CRON_PLAN`

Recorded at `2026-08-04T19:59:42Z`.

## Repository gate

- Repository: Scarlett's Spells
- Branch: `main`
- Approved baseline: `3f9dd67519a8967ab65753f210215ee358d3a389`
- Entry divergence: `0 / 0`
- Entry worktree: clean
- Current worktree: intentional uncommitted implementation only
- Production mutation: none

## Read-only identities

- Linked Vercel project: `scarletts-spells-staged` /
  `prj_oJkffstOtacc4juYloXajHpjJUha`
- Linked Supabase ref: `jlhotktspjvffslvuyfz`
- Production Supabase ref rejected by the staging design:
  `wwohrqtunajrbwxyssjf`
- Production Dynamic Prefix authority remained `shared_authoritative` at the
  entry read.
- Production canonical intake was not enabled or mutated.

The pre-implementation read-only current-submission check confirmed 13 approved
candidates, 13 exact active resolver-visible mappings, 12 canonical words, and
one missing canonical target row: exact token `unlocked`. No matching learning
item or Dynamic Prefix assignment existed. No personal information or raw
learner response is recorded here.

## Implemented locally

- target-identity-aware route readiness evaluator;
- exact `urnlocked -> unlocked -> pending_content` classification;
- durable candidate, demand, link, queue, and append-only event migration;
- stable token-keyed demand that later attaches a canonical-word ID;
- approval seed, candidate-isolated reconciliation, bounded leases/retries, and
  five-minute protected cron;
- governed Teaching Dictionary and Prefix release enqueue hooks;
- service-role-only functions and RLS;
- safe admin badge, demand table, checklist, workflow actions, and audit history;
- no reconciliation assignment write;
- contracts, runbook, release registry, and tracker updates.

## Automated results

Passed locally:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run typecheck:scripts`
- `npm run build`
- all canonical-intake focused regressions, including the current 13-candidate
  matrix (`12 ready / 1 pending_content / 1 Teaching Content Demand / 0 Resolver
  Demands`)
- composer payload and persistence regressions
- Dynamic Prefix pedagogy, shared-authority, and QA regressions
- shared-affix compiler and production-parity regressions
- Generic Snapshot contract and reader regressions
- semantic production baseline (31 regressions)
- architecture generation/drift and composable documentation regressions

## Staging migration

The CLI had no authenticated access token or staging database URL. The existing
authenticated Supabase dashboard session was therefore used only after its
visible project name, URL, and ref all matched the approved staging identity.

- Migration: `20260804210000_add_adle_canonical_intake_demands.sql`
- Source SHA-256:
  `14c1268d4d0806186ed1a79db8cde4772db38fc4fda322f9f7a26c7a68079d68`
- Ledger name: `add_adle_canonical_intake_demands`
- Tables created with RLS: 5
- Service role can execute the blocked-state function: yes
- Authenticated role can execute it: no
- Post-migration intake candidate/demand counts: `0 / 0`
- Protected counts remained:
  - learning items: 85
  - daily assignments: 50
  - assignment items: 852
  - attempts: 560
  - schedules: 110
  - rewards: 0

The migration itself created no candidate, demand, learner item, assignment,
attempt, schedule, or reward fixture.

## Preview deployment blocker

Local implementation checkpoint:
`13b16b11c1c7dc0c6b15890acd8c6218081e9d48`.

The exact-SHA pinned Preview was attempted with intake enabled and the reviewed
Dynamic Prefix staging/QA identity flags. Vercel rejected the deployment before
creating a deployment because the staging project is on the Hobby plan:

```text
Hobby accounts are limited to daily cron jobs.
This cron expression (*/5 * * * *) would run more than once per day.
```

The required five-minute safety sweep was not weakened to a daily schedule.
Deployment inventory showed no new Preview from this attempt. Consequently no
staging fixture, demand, notification, learning item, assignment, cron request,
or cleanup action ran.

Smallest safe remedy: upgrade the staging Vercel project to a plan that permits
the reviewed five-minute schedule, or separately approve and plan an equivalent
five-minute scheduler with the same secret, bounded-worker, retry, and no-direct-
assignment guarantees. After that external state change, resume from the
already-verified empty staging schema, deploy the exact implementation SHA, run
the disposable fixture matrix and guarded cleanup, then replace this blocker
status with completed staging evidence.
