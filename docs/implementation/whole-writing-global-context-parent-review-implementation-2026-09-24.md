# Global contextual parent review — implementation receipt

Branch: `codex/global-contextual-parent-review`. Baseline:
`6a8b02ec7b6d4e41afda3086bb27c5ee3ac4e1c3`.

Status: **implemented, globally default off; not authorised for live use**.
The separate advisory-use exception in
`whole-writing-global-context-advisory-exception-proposal.md` remains
**proposed**. No V4 release, manifest, parser, fallback policy, frozen evidence,
selection, approval or activation was changed. No migration was applied to
staging or Production. The new ADLE contextual evidence bridge (Phase 5) is
not implemented; it requires its own policy and regression approval.

The existing submission job now uses the immutable writing snapshot and exact
UTF-16 `writing_occurrences` to inventory the four canonical homophone
families. The normal spelling materialiser excludes correctly spelled family
members, while malformed forms remain in spelling review. A global singleton
control gates new advisory observation intake, and is `false` by default.
The four frozen V4 candidates are called only as advisory analysers. Each
observation records release and manifest identity, decision and trace
fingerprint; parser failure becomes `NOT_ASSESSED` without changing source or
creating an issue.

Review Work shows every governed occurrence captured under the global route,
including `VALID`, `INVALID`, `UNCERTAIN` and unavailable observations. Parent
decisions are append-only and reference the same exact occurrence. Only a
parent `INVALID` decision creates an existing `writing_issues` row. The child
uses existing word-only retry lineage; the parent's outcome is finalised as
`REPAIR_ONLY` without a learning item or reward. Normal spelling finalisation
is wrapped so bulk approval cannot accidentally change that boundary.
Contextual retry attempts record `scaffolded` assistance because the child is
prompted about the exact word. Answer visibility remains `unknown`: the retry
control does not show the approved replacement, but a parent's free-text note
could reveal it. A matching replacement is never inferred to be independent.

The live authentic-use and free-writing reward paths exclude the affected
canonical word (and legacy-tokeniser contraction fragments), not the whole
writing sample. Confirmation revalidates old pending reward candidates. The
guarded batch authentic-use script uses the same exclusion and omits
contextual prompted repairs. The proficiency evidence loader, known-match
pre-resolution and returned-correction repair/replay paths explicitly exclude
contextual repair issues. Unrelated words in the piece remain eligible.

An optional parent action promotes a reviewed occurrence into a separate Admin
diagnostic queue. An Admin page reports per-family review completeness and
machine/parent disagreement, with analyser-assessed scope counts clearly
marked as diagnostic rather than human construction truth. Promotion never
creates qualification gold.

The main residual operational gate is a separately reviewed advisory-use
exception, followed by migration application and an end-to-end review/retry
proof in the intended environment **before** changing the global control.
Until then the control must remain off. The historical V4 Stage A failure
remains a release-qualification block; this pathway does not override it.

Local checks: targeted contextual routing and Python batch-exclusion tests;
disposable PostgreSQL migration/source/decision/repair proof; S7/S8 and V4
release-identity regressions; Review Work, returned-child-correction,
free-writing reward, ADLE proficiency and returned-correction Stage D/F
regressions; TypeScript, focused lint and a Next.js webpack production build.
The default Turbopack build cannot follow the external `node_modules` symlink
used only by this isolated worktree; webpack completed successfully. The
V4 hybrid-freeze regression's ignored parser checkpoint is absent from this
fresh worktree, so that specific fixture-based check could not run here.
