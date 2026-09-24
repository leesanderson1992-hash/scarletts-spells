# Contextual parent learning handoff — local implementation receipt

Baseline: `47b94c3c17509fc5c640304454a0957027bbe6d6` on
`codex/global-contextual-parent-review`. This is an additive development
implementation, not a V4 release change or production activation.

An identified parent may classify a returned contextual word-choice error as
`concept_gap`, `fragile_knowledge` or `transfer_failure` and select the exact
active/assignable D4 homophone microskill through the existing Family → Cluster
→ Microskill control. The database requires the current parent `INVALID`
decision, its same-family alternative and exact occurrence before finalising.
It calls the existing writing learning-item finaliser for the original error,
links the existing Golden Nugget discovery path, and records a separately
inspectable ADLE word/skill handoff. No misspelling mapping is manufactured.

The prompted word-only child retry remains `REPAIR_ONLY`; even if the legacy
attempt record says “corrected independently”, its linked evidence is stored
as `corrected_after_prompt` in the same transaction. ADLE authentic-use and
proficiency loaders still exclude contextual issue/attempt rows. Later
independent evidence retains its separate authority.

The ADLE handoff is `READY` only when the canonical word, word/skill support
and signed-off active teaching content are present. Otherwise it is pending
with a blocker. A previously resolved item is explicitly pending governed
re-entry review; a parent decision does not silently reopen mastery.

The global advisory switch is still default-off. The service-role-only
`disable_writing_context_advisory` operation and the rollback runbook provide
the first response for a production trial, preserving submitted writing and
human decisions. Reverting the application deployment is a separate second
step; additive historical tables must not be dropped during rollback.

Local verification: contextual routing regression, disposable PostgreSQL
proof (including invalid route rejection, pending curriculum, resolved-item
review and kill-switch preservation), focused ESLint, TypeScript, authority
documentation check, Webpack production build and `git diff --check` passed.
No production database, staging or Production deployment was touched.

Before enabling: obtain and record the independent advisory-use policy review,
apply/verify migrations in the intended environment, exercise the complete
parent/child flow, verify parser-unavailable behaviour and perform a rollback
drill. Owner approval of this implementation is not V4 release approval.
