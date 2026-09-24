# Global contextual-review advisory exception — sole-owner approved, default off

Status: **SOLE-OWNER ADVISORY APPROVAL / PREVIEW DEPLOYED / DEFAULT OFF**.
Katie Sanderson approved the advisory-use proposal and implementation review
in the current task on 2026-09-24. She also approved proceeding with
non-production verification and agreed to the proposed end-to-end checks.
Katie has since confirmed that this is a sole-owner project and her
authorisation alone is sufficient for the advisory-use exception. She has
also expressly authorised a Vercel Preview to use Production Supabase. This
does not assert that a migration, parser-environment test or rollback drill
has passed, nor does it by itself authorise applying migrations to Production
Supabase. It does not approve, publish or select a V4 release. The advisory
path remains disabled until the migration/runtime proof and enablement checks
are complete.

The global switch is still off. The owner-approved exception permits the
exact frozen V4 candidates to generate
parent-visible observations for every canonical occurrence in a newly submitted
writing snapshot. It does **not** permit the analyser to create a child-facing
issue on its own. An identified parent must decide `VALID`, `INVALID` with a
finite same-family alternative, `UNCERTAIN`, or `EXCLUDED`. Only a parent
`INVALID` decision creates a prompted, word-only repair issue. If the parent
classifies the original contextual error as a concept gap, fragile knowledge
or transfer failure and selects its governed homophone microskill, that
parent-confirmed original error may create the ordinary learning need and
Golden Nugget discovery record. The prompted retry remains `REPAIR_ONLY`:
it is never independent authentic use, transfer or mastery evidence. A missing
canonical word, word-to-skill support, or signed-off teaching content leaves
the ADLE handoff visibly pending, not silently routed to an invented spelling
mapping. Machine observation alone still has no learning consequence.
If the corresponding ADLE item has already been resolved, the new need stays
pending a separately governed re-entry decision; it does not silently reopen
mastery or claim that another lesson is scheduled.

The single global `writing_context_advisory_control.enabled` value is false by
default. It has no per-child gate. Turning it off prevents new advisory intake
and parent decisions without removing source snapshots or prior review facts,
and does not block ordinary writing submission or spelling review. Parser
failure is recorded as `NOT_ASSESSED`; the parent's judgment remains possible
against the verified source occurrence.

The existing approved S8 delivery route is not reused. V4 remains unapproved,
unselected and default-off as a release. This exception is for an advisory
parent-review product pathway only. It cannot be
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

Before enabling the global control, require: the recorded sole-owner approval;
local migration proof; end-to-end parent/child
retry proof; parser-unavailable proof; verification that all governed
occurrences remain reviewable and that unrelated spelling/reward candidates
still work; and a rollback drill that disables intake without touching stored
writing or decisions. Record proof separately. No enablement is implied by
merging or deploying the code. Preview use of Production Supabase must be
explicitly distinguished from approval to change its schema or live data.

## 2026-09-24 Preview preflight

The requested Vercel Preview may use Production Supabase under Katie's
sole-owner authorisation. The initial read-only check found ordinary writing
tables but not the whole-writing and contextual-review schema. Katie then
expressly authorised all prerequisites needed to get the Preview running.
The hosted migration ledger contained applied version `20260901160000` whose
source was absent from this branch; it was recovered from the hosted ledger,
without altering that ledger, and fingerprinted as
`51792f5a717ea997e7dab529557d1186ec302720a42c49fd0135bb9ed26a8f28`.
The exact 15-migration dry run passed with no seeds or role imports. Those 15
forward migrations (`20260906100000` through `20260924130000`) were then
applied to Production Supabase. A read-only follow-up confirmed all 15 ledger
entries, the snapshot/occurrence/parent-decision tables, zero parent decisions,
and `writing_context_advisory_control.enabled = false`. The disposable
PostgreSQL source/decision/repair proof passed before application. Production
had a completed daily physical backup; point-in-time recovery was not enabled.

Branch-scoped Preview overrides for `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` were added from the Production Supabase project's
API keys; no global Preview or Production Vercel credential was replaced.
The Preview deployment
`https://scarletts-spells-qrl61cii6-leesanderson1992-hashs-projects.vercel.app`
reached `READY` and its protected `/login` route returned HTTP 200. Browser
inspection was stopped by Vercel deployment protection because the available
browser session is signed into a different account; protection was not
disabled. The branch still has no `S8_V4_PYTHON` or
`S8_V4_TRANSFORMER_PYTHON` runtime. Frozen V4 fails closed without them, so
this Preview does not yet prove the intended analyser-assisted parent flow.
The global control remains off. The prerequisite S8 migration seeded four
historical context-family release rows and twelve selection-event rows in
Production, with zero approval events and zero active child shadow controls;
no V4 release was approved or activated.
