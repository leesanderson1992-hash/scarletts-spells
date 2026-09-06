# Whole-writing S5 shadow evidence implementation — 6 September 2026

S5 makes whole-writing Phase C results durable and inspectable without enabling
any learning consequence. Every extracted learner-authored occurrence enters the
shadow classifier. Target Word, Forge, taught-history and review-schedule status
are not filters. Unknown correctness, context, environment or independence stays
pending in the assessment record and blocked in the Phase C decision.

## Durable read model

Migration `20260906150000_add_whole_writing_shadow_projections.sql` adds four
append-only service-owned tables:

- one projection batch for each completed evidence-enabled shadow run;
- one Phase C decision receipt for every occurrence in that batch;
- indexed governed micro-skill candidates for resolved words, even when the
  performance is blocked;
- admitted skill projections only when the existing Phase C authority emits
  them.

The result writer checks that Phase C returned exactly one decision for every
occurrence before it can complete the transaction. This prevents silent
Target/non-Target, short-word or repetition filtering between extraction and
the longitudinal read model. Occurrence, interpretation, assessment, decision,
relationship-candidate and admitted-projection rows commit atomically with the
completed shadow run.

All four tables reject updates. Deletes remain available only through the
existing governed source/learner cascade lifecycle. Authenticated and anonymous
roles have no table or view access; the administrator report authenticates with
the existing admin allowlist and reads with the service role.

## Current and historical interpretation

`writing_shadow_current_projection_batches` deterministically selects the newest
completed projection batch for each immutable source snapshot, ordered by the
run completion time and immutable IDs. The current occurrence view contains only
receipts in those batches. Historical reads address all batches directly.

Each receipt has the stable exact key
`whole-writing:{learner_id}:{occurrence_id}`. A replay links to the most recent
prior receipt only when this key is identical, recording
`EXACT_HISTORICAL_MATCH`. Canonical remapping, assessment IDs and projection
versions do not create another learner performance. Similar submission, word,
date or text values are never treated as exact lineage.

The existing Phase C compatibility scan is separate and read-only. It compares
an occurrence receipt with existing Phase C events only by the explicit
performance-lineage key, then checks learner, canonical identity and occurrence
time for agreement. It reports exact match, exact-lineage conflict, or no exact
lineage. It never invents a compatibility key or merges by similarity.

## Admin report and controls

`/admin/whole-writing-evidence` provides a bounded longitudinal table with
current/history selection, child selection, observed token and source anchor,
canonical resolution, governed micro-skill candidates, Phase C disposition,
exact replay lineage and optional exact compatibility reconciliation. It does
not display the full writing piece and has no mutation action.

The existing per-child `evidence_shadow_enabled` control remains the producer
gate. It defaults off. Disabling it stops new projection batches while retaining
source and historical receipts. A previous batch remains directly inspectable;
no rollback rewrites evidence or learning history.

## Consequence firewall

S5 adds no writer, trigger, RPC or report action for `adle_learning_items`, Gold
Coin or Gold Bar ledgers, `adle_authentic_use_events`, proficiency profiles,
Review schedules or retirement receipts. A governed word–skill relationship is
stored as a candidate history even while the occurrence is blocked; it is not an
admitted performance. No proficiency formula or qualification rule is added.

G1 and G3 therefore remain unresolved exactly as planned. S9 must establish
verified correctness, meaning, environment and independence before any whole-
writing performance can qualify. S5 does not infer those facts from submission,
recognition, ordinary parent approval or absence of a detected error.

## Verification

The pure regression proves Target-independent positive fan-out for a synthetic
verified non-Target word, causal-only negative projection, repair exclusion,
unknown-fact blocking, stable event identity, distinct occurrences and exact
compatibility collapse. The disposable PostgreSQL proof loads the real S1–S5
migrations and proves append-only storage, one decision per occurrence,
service-only access, current/history selection, exact replay linkage and zero
admitted projections for unknown facts.

The staging gate must additionally prove the actual recovery route, report
authorization and reload behaviour against a disposable cohort, then remove the
cohort and restore protected counts before S5 is marked staging-complete.
