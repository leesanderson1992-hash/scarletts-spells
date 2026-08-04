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

- The event queue is primary; the five-minute cron is the missed-event sweep.
- Inspect oldest unresolved demand, retry/failed jobs, activation latency, and
  duplicate-constraint errors.
- A disabled feature flag makes the worker a no-op and stops new intake.
- Forward-disable instead of deleting candidates, demands, links, or events.
- Use only aggregate affected-child counts in receipts. Do not copy child
  identity, email, raw answers, dictations, notes, database URLs, or secrets.
