# ADLE Canonical Intake Staging Receipt — 2026-08-04

Status: `PARTIAL_STAGING_PROOF_COMPLETE_SCHEDULER_AND_CLEANUP_RESTORE_BLOCKED`

Last updated at `2026-08-04T20:51:38Z`.

## Repository gate

- Repository: Scarlett's Spells
- Branch: `main`
- Approved baseline: `3f9dd67519a8967ab65753f210215ee358d3a389`
- Entry divergence: `0 / 0`
- Entry worktree: clean
- Local implementation commits:
  - `13b16b11c1c7dc0c6b15890acd8c6218081e9d48`
  - `157754f7c311b4aa6dbe831a69c7ac2e3b29a7c9`
- Current worktree: intentional staging-proof corrections pending commit
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

The first live blocked-state RPC exposed an ambiguous PL/pgSQL reference between
the function's table-shaped `candidate_id`/`demand_id` output parameters and
unqualified link columns. The follow-up migration replaces only that function
with fully qualified aliases and a named unique-constraint conflict target:

- Migration: `20260804223000_qualify_adle_canonical_intake_blocked_links.sql`
- Source SHA-256:
  `b6fcbedf4aabd7a08cb417a2286fd00d56b25204e3a85b6c9096b754f74d2161`
- Ledger name: `qualify_adle_canonical_intake_blocked_links`
- Service-role-only grants retained: yes

## Pinned Preview and live staging proof

A Preview was created after temporarily omitting only the rejected cron entry
from the deployment input. The committed `vercel.json` remained unchanged and
still requires the approved five-minute schedule.

- Vercel project: `scarletts-spells-staged` /
  `prj_oJkffstOtacc4juYloXajHpjJUha`
- Deployment: `dpl_8tJ5yRyrfEDGkjztAamx5QdxytJ9`
- URL: `https://scarletts-spells-staged-hxtcr5uyz.vercel.app`
- State: `Ready`
- Repository checkpoint represented by the application tree:
  `157754f7c311b4aa6dbe831a69c7ac2e3b29a7c9`
- Difference from the committed application configuration: the Preview input
  omitted the five-minute cron entry because the Hobby plan rejects it.

The disposable staging proof used tag
`adle_canonical_intake_staging_proof_2026_08_04` and the existing approved
staging-submission lineage. It did not alter the approval row.

Verified first pass:

```text
12 eligible and activated
12 newly inserted in the final clean pass
1 pending_content: unlocked
1 teaching_content demand
0 resolver demands
```

Verified replay:

```text
12 eligible
0 inserted
12 existing learning items strengthened/reused
1 pending_content
0 duplicate demands
```

Verified manual safety-sweep execution:

```text
1 job claimed
1 job completed
1 candidate remained pending_content
0 retries
0 failures
0 assignments created
```

The stable demand ID for the retained proof interval was
`e8b92944-8896-4dd6-8f88-ef2c68e25e6f`. Its exact target was `unlocked`, its
microskill was `D4_MOR_PREFIXES_UN`, its primary blocker was
`canonical_word_missing`, and its mapping identity was established. The demand
was not a Resolver Demand and no `unlock` substitution occurred.

While the live demand existed, the deployed admin route redirected an
unauthenticated request to the existing login page, proving the demand surface
remains behind the admin authentication boundary. Database verification proved
the unread Teaching Content Demand row. The existing static admin regressions
prove the required wording, checklist, aggregate-only child count, prohibited
activation/assignment actions, and authorization contract. An authenticated
visual pass was not performed because no credential was copied into the pinned
Preview.

Protected counts during the successful proof changed only by the twelve owned
learning items:

| Table | Before | During proof |
|---|---:|---:|
| Learning items | 83 | 95 |
| Daily assignments | 50 | 50 |
| Assignment items | 852 | 852 |
| Attempt events | 560 | 560 |
| Review schedules | 110 | 110 |
| Reward events | 0 | 0 |

The final guarded cleanup removed 13 source candidates, 13 technical candidate
rows, one demand, 12 proof-owned learning items, 13 mappings, and their exact
links/events. Post-cleanup candidate and demand counts were `0 / 0`; all other
protected counts in the table remained unchanged.

## Staging cleanup discrepancy

An earlier failed proof pass correctly reused two pre-existing staging learning
items. The first version of the cleanup harness derived its deletion set from
all proof lineage rows, rather than only items originally created by the proof,
and deleted those two reused, unassigned learning-item rows. This changed the
staging learning-item count from the pre-proof `85` to `83`. It did not change
daily assignments, assignment items, attempts, schedules, rewards, Teaching
Dictionary rows, Prefix profiles, or production data.

The harness is corrected: it now deletes only items whose original
`adle_learning_items.source_ref` is one of the tagged proof candidate refs and
reports reused rows separately. The two removed rows cannot be reconstructed
exactly from current database authority because their IDs and original source
references were deleted with them. No approximate replacement was created.
Exact restoration requires an authoritative staging backup/audit source or an
explicit decision that those unassigned staging rows were disposable.

## Preview deployment blocker

The exact application configuration remains blocked from deployment because the
staging project is on the Hobby plan:

```text
Hobby accounts are limited to daily cron jobs.
This cron expression (*/5 * * * *) would run more than once per day.
```

The required five-minute safety sweep was not weakened to a daily schedule. The
manual invocation above proves the bounded worker itself, but it is not evidence
that Vercel will invoke the route every five minutes.

Smallest safe remedy: upgrade the staging Vercel project to a plan that permits
the reviewed five-minute schedule, or separately approve and plan an equivalent
five-minute scheduler with the same secret, bounded-worker, retry, and no-direct-
assignment guarantees. After that external state change, resume from the
already-verified empty staging schema and deploy the exact implementation SHA.
Separately, resolve the two-row staging cleanup discrepancy from an
authoritative backup/audit source or explicitly classify those unassigned rows
as disposable. Only then can this receipt be marked fully complete.
