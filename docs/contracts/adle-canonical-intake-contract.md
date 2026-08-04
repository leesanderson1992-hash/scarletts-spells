# ADLE Canonical Intake Contract

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

## Durable state

Migration `20260804210000_add_adle_canonical_intake_demands.sql` adds one
technical candidate per source candidate mapping, a stable demand keyed by
demand type/target/route/version/microskill, unique active links, a leased
reconciliation queue, and append-only intake events.

The normalized token remains after a later canonical-word ID is attached.
Blockers may be replaced without replacing the demand. New source links, not
retries, increment occurrences. Notification workflow (`unread`, `open`,
`resolved`) is separate from readiness truth.

## Processing and reconciliation

The approval hook first seeds a durable queued candidate/job, then evaluates
each candidate independently. Ready candidates call the existing atomic
learning-item/source persistence function. Blocked candidates atomically
upsert the technical candidate, stable demand, link, and event.

Governed Teaching Dictionary and Dynamic Prefix releases enqueue affected
targets when the intake queue exists. A protected five-minute cron route claims
bounded jobs with leases and retries. Both paths reuse the same evaluator.
Successful activation resolves the link and notification while preserving the
demand and history. The reconciler has no assignment-table write; only the
normal daily composer can later select an activated item.

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

Staging evidence is required first. Production migration, enablement, targeted
replay, and backlog processing remain separately authorised operations.
