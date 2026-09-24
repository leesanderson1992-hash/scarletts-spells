# Global contextual-review advisory exception — proposed, not approved

Status: **PROPOSED / DEFAULT OFF**. This document does not approve a V4
release, publish or select it, or authorise learning consequences. The current
S8 operational block remains in force until the owner and a separate reviewer
approve an explicit advisory-use exception and the migration/runtime proof is
complete.

The proposed exception permits the exact frozen V4 candidates to generate
parent-visible observations for every canonical occurrence in a newly submitted
writing snapshot. It does **not** permit the analyser to create a child-facing
issue on its own. An identified parent must decide `VALID`, `INVALID` with a
finite same-family alternative, `UNCERTAIN`, or `EXCLUDED`. Only a parent
`INVALID` decision creates a prompted, word-only repair issue. The parent's
repair outcome is stored as `REPAIR_ONLY` and cannot create Golden Nuggets,
authentic-use credit, proficiency, microskill evidence, scheduling or rewards.

The single global `writing_context_advisory_control.enabled` value is false by
default. It has no per-child gate. Turning it off prevents new advisory intake
and parent decisions without removing source snapshots or prior review facts,
and does not block ordinary writing submission or spelling review. Parser
failure is recorded as `NOT_ASSESSED`; the parent's judgment remains possible
against the verified source occurrence.

The existing approved S8 delivery route is not reused. V4 remains unapproved,
unselected and default-off as a release. This exception, if separately
approved, is for an advisory parent-review product pathway only. It cannot be
used as qualification evidence for V4. Examples deliberately sent to Admin are
development/regression evidence, not independent holdout gold.

The current ADLE authentic-use loader and free-writing reward candidate path
collapse repeated words within one writing piece. Until a separately verified
occurrence-aware evidence bridge exists, both exclude only the affected
canonical homophone spelling from that piece, not the whole piece. A
contraction can be split by the legacy `[a-z]+` tokenizer, so its component
fragments are excluded too (for example, `it's` can suppress otherwise valid
standalone `it`/`s` credit in the same piece). This is a deliberately narrow,
documented loss of possible credit. Other words in the piece remain eligible.

Before enabling the global control, require: a named owner approval and an
independent policy review; local migration proof; end-to-end parent/child
retry proof; parser-unavailable proof; verification that all governed
occurrences remain reviewable and that unrelated spelling/reward candidates
still work; and a rollback drill that disables intake without touching stored
writing or decisions. Record those approvals and proof separately. No approval
is implied by merging or deploying the code.
