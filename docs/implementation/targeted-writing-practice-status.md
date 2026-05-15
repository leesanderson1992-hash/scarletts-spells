# Targeted Writing Practice Status

## Purpose

This file tracks current implementation state for the Writing Engine / Targeted
Writing Practice work.

It is a status document, not a product brief, contract, or roadmap.

Canonical documentation now defers to:

- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)

## Current headline

- Shared `lib/writing-engine` foundation exists.
- Generic `parent_verifications` exist.
- Generic `assignment_items` exist.
- Durable issue-lifecycle and learning-item creation exist.
- The older spelling runtime surfaces are retired and should not be treated as
  an active product path.
- `daily_assignments` remains transitional header debt rather than the long-term
  assignment anchor.
- `word_progress` is retired from active runtime ownership and remains
  historical/legacy debt only.
- Stage `1B` manual spelling diagnostic MVP is complete on the shared Writing
  Engine boundary.
- Stage `1B.1` manual diagnostic, `1B.2` verification orchestration, and
  `1B.3` shared parent-verification persistence are complete.
- Stage `1C` verified outcome to mastery bridge is complete for manual spelling
  diagnostics.
- Stage `1D` generic assignment generation is now complete on the shared engine
  boundary through bounded `1D.1` to `1D.5` closeout.
- Stage `1` is now complete for its intended purpose:
  - shared Writing Engine foundation
  - first spelling diagnostic path
  - persisted parent verification
  - verified outcome to canonical mastery/evidence bridge
  - generic assignment generation from canonical `learning_items`
  - proof that assignment generation is not word-list-only
- Stage `7` Review Work integration is now complete on its documented bounded
  path through `7A` to `7E`.
- A bounded post-Stage-`7` parent-facing evidence-transparency slice is now
  complete.
- The app is currently suitable for private parent-led use with one child,
  with the parent still acting as the authority on what counts as verified
  truth and what broader progress/maturity summaries mean.
- The repo currently builds, but the current dirty `main` worktree must not be
  blindly pushed to production.

## Current status snapshot

### Done
- Stage `1A` shared Writing Engine foundation
- Stage `1B.1` deterministic manual spelling diagnostic service
- Stage `1B.2` manual diagnostic verification orchestration
- Stage `1B.3` manual diagnostic parent-verification persistence
- Stage `1B` manual spelling diagnostic MVP overall
- Stage `1C` verified outcome to mastery bridge for manual spelling diagnostics
- Stage `1D` generic assignment generation overall
- Stage `1D.5` dictation builder and duplicate-safe append closeout
- Stage `1` overall
- generic verification contract
- generic assignment-item contract
- retirement of the old spelling-engine runtime surfaces
- canonical brief and mastery/evidence contract

### Partially done
- broader documentation reconciliation to the canonical brief and mastery
  contract
- generic assignment-header transition away from older `daily_assignments`

### Retired
- `/analyse` as a canonical review surface
- `/analyse/review`
- `/practice`
- `/assignments`
- old spelling-session assignment generation path

### Next
- next documentation-authorized work is
  `Post-Stage-7 private MVP release safety and evidence-maturity readiness`
- next safe implementation boundary is
  `documentation-first Stage 8 foundation audit — evidence maturity, capture readiness, and parent-facing mastery-claim boundaries`
- optional DB-backed or app-triggered smoke-test follow-up for Stage `1`
- active-doc cleanup so historical implementation plans no longer compete with
  the roadmap

### Stage 7 implementation status
- Stage `7` overall is complete and QA passed on its documented bounded path
- the bullets below preserve the bounded Stage `7` closeout history; where
  older lines mention an intermediate “next boundary,” treat them as
  chronological context rather than current instruction
- `7A` complete and QA passed
- `7B` complete and QA passed
- `Review Work` is the canonical parent review surface
- `Add Writing Sample` and compatibility `/analyse` are intake-only entry
  points for parent-entered manual writing samples
- paper work written outside the app is entered through intake, saved as a
  canonical `writing_sample`, and reviewed through `Review Work`
- lesson submissions and manual writing samples are expected to converge into
  one `Review Work` queue
- Stage `7` is visibility and workflow integration only on top of existing
  shared analysis, verification, and durable issue contracts
- bounded `7A` intake now exists at `/analyse`:
  - parent can type or paste paper-written work
  - save creates a canonical manual `writing_sample`
  - save reuses existing shared spelling candidate analysis where supported
  - save hands off to `Review Work`
- Stage `7A` QA evidence:
  - `npm run writing-engine:stage7a-intake-regression`
    - `writing-engine-stage7a-intake-regression: ok`
  - `npm run e2e:health`
    - passed
  - `npm run e2e:add-writing-sample`
    - passed
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `7A` preserved boundaries:
  - `Add Writing Sample` remains intake only
  - `Review Work` remains the canonical parent review surface
  - `/analyse` is not canonical review ownership
  - no new engine, verification, durable issue, mastery/evidence,
    assignment, reward, analytics, or route-local review semantics were
    introduced
- bounded `7B` queue visibility now exists in `Review Work`:
  - manual writing samples and lesson submissions render in one live queue
  - queue rows identify source type
  - manual writing samples open through the same canonical `Review Work`
    route family
  - `7B` remains visibility-only and does not add new verification or durable
    issue actions
- Stage `7B` QA evidence:
  - `npm run e2e:health`
    - passed
  - `npm run e2e:add-writing-sample`
    - passed
  - `npm run e2e:review-work-queue`
    - passed
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7C` review detail suggested issues panel is now the next implementation
  boundary
- `7C` contract is now documentation-defined as a read-only canonical
  `Review Work` detail panel for existing shared outputs
- bounded `7C` detail visibility now exists in `Review Work`:
  - canonical `Review Work` detail now renders one read-only suggested-issues
    panel
  - manual writing samples and lesson submissions use the same panel shape and
    state vocabulary
  - the panel renders existing shared outputs only:
    - candidate spelling outputs
    - unresolved targeted-writing suggestion outputs
    - durable writing-issue history
  - detail rendering no longer triggers helper-suggestion sync or other
    render-time writes
  - no parent verification, durable-issue promotion, mastery/evidence,
    assignment, reward, analytics, or route-local source-of-truth semantics
    were introduced
- Stage `7C` implementation evidence:
  - `npm run e2e:health`
    - passed
  - `npm run e2e:add-writing-sample`
    - passed
  - `npm run e2e:review-work-queue`
    - passed
  - `npm run e2e:review-work-detail`
    - passed
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `7C` QA evidence:
  - one canonical read-only suggested-issues panel is visible in `Review Work`
    detail
  - both supported source types are covered:
    - lesson submissions
    - manual writing samples
  - distinct read-only visibility states are browser-verified where applicable:
    - outputs available
    - already reviewed/history
    - no outputs yet
    - empty result
  - no parent verification controls appear in `7C`
  - no render-time writes occur from viewing the panel
  - no render-time analysis occurs from viewing the panel
  - no second review surface or route-local suggested-issue ownership was
    introduced
  - same-session regression stability is verified for:
    - `npm run e2e:health`
    - `npm run e2e:add-writing-sample`
    - `npm run e2e:review-work-queue`
    - `npm run e2e:review-work-detail`
    - `npx tsc --noEmit`
- `7C` complete and QA passed
- `unsupported_source` and `load_error` exist in the shared `7C` read model,
  but are not yet browser-covered through the current supported `Review Work`
  flow because that would require fabricated unsupported routes or forced load
  failures
- next safe implementation boundary after `7C` QA was
  `Stage 7D — Parent verification actions in Review Work`
- `7D` is now documentation-defined and implementation-ready at the contract
  level
- `7D` remains bounded to canonical parent verification actions in
  `Review Work` and does not yet include queue/archive coherence, which
  remains owned by `7E`
- `7D` execution is now explicitly broken into bounded subtasks:
  - `7D.1` canonical action wiring
  - `7D.2` override flow
  - `7D.3` read-after-write detail truth
- the `7D` subtask plan is an implementation breakdown only, not a new product
  scope
- implementation must proceed one subtask at a time
- each `7D` subtask requires its own:
  - implementation report
  - QA pass
  - closeout before the next subtask begins
- bounded `7D.1` canonical action wiring now exists in `Review Work`:
  - canonical non-override parent verification actions are available inside
    `Review Work` detail
  - allowed decisions in `7D.1` only are:
    - `accepted`
    - `false positive`
    - `not a learning issue`
  - lesson submissions and manual writing samples reuse the same canonical
    non-override action family where supported
  - the manual false-positive post-submit auth/session defect is fixed on the
    canonical shared verification path
  - no override editor/input flow, queue/archive/status coherence work,
    mastery/evidence writes, assignment writes, reward writes, analytics
    writes, taxonomy changes, or Stage `7E` behaviour were introduced
- Stage `7D.1` QA evidence:
  - `npm run e2e:health`
    - passed
  - `npm run e2e:add-writing-sample`
    - passed
  - `npm run e2e:review-work-queue`
    - passed
  - `npm run e2e:review-work-detail`
    - passed
  - `npm run e2e:review-work-verification`
    - passed
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `7D.1` preserved boundaries:
  - `Review Work` remains the canonical parent review surface
  - `Add Writing Sample` remains intake only
  - `/analyse` does not regain review ownership
  - existing shared verification orchestration is reused
  - parent verification records remain distinct from durable writing issues
  - durable writing issue promotion continues only through existing documented
    shared orchestration
  - no new mastery/evidence, assignment, reward, analytics, taxonomy, or
    queue/archive semantics were introduced
- `7D.1` complete and QA passed
- bounded `7D.2` override flow now exists in `Review Work`:
  - override actions reuse existing shared verification semantics only
  - override inputs remain limited to documented shared verification fields
  - no new override payload shape, lifecycle state, queue/archive semantics,
    mastery/evidence writes, assignment writes, reward writes, analytics
    writes, or taxonomy changes were introduced
- Stage `7D.2` QA evidence:
  - `npm run e2e:health`
    - passed
  - `npm run e2e:add-writing-sample`
    - passed
  - `npm run e2e:review-work-queue`
    - passed
  - `npm run e2e:review-work-detail`
    - passed
  - `npm run e2e:review-work-verification`
    - passed
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7D.2` complete and QA passed
- bounded `7D.3` read-after-write detail truth now exists in `Review Work`:
  - post-action detail truth uses shared-model wording for the action-bearing
    surface
  - accepted, false positive, overridden, and not-a-learning-issue outcomes
    now reflect canonical shared verification truth in the detail view
  - success toast, recorded decision text, and parent verification count now
    render through the canonical shared detail surface
  - no queue/archive/status coherence work, new decision names, new
    verification states, new issue lifecycle states, mastery/evidence writes,
    assignment writes, reward writes, analytics writes, or taxonomy changes
    were introduced
- Stage `7D.3` QA evidence:
  - `npm run e2e:health`
    - passed
  - `npm run e2e:add-writing-sample`
    - passed
  - `npm run e2e:review-work-queue`
    - passed
  - `npm run e2e:review-work-detail`
    - passed
  - `npm run e2e:review-work-verification`
    - passed
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7D.3` complete and QA passed
- `7D` overall is now complete and QA passed
- next safe implementation boundary after `7D` QA is
  `Stage 7E — Queue completion/archive/status coherence`
- `Stage 7E` is now documentation-defined as:
  - canonical queue completion, archive coherence, and cross-surface status
    reconciliation inside `Review Work`
  - a shared read-model projection layer over existing verification and issue
    truth, not a new source of truth
  - explicitly bounded away from new verification semantics, new issue
    lifecycle states, direct mastery/evidence or assignment/reward/analytics
    writes, and Stage `8` automatic-mastery semantics
- `Stage 7E` is now split into an execution-only subtask plan:
  - `7E.1` — Queue/detail status projection coherence
  - `7E.2` — Archive/completion presentation coherence
  - `7E.3` — Cross-surface return-path and count reconciliation
- this split does not broaden product scope
- implementation must proceed one subtask at a time
- each `7E` subtask requires:
  - its own implementation report
  - its own QA pass
  - explicit closeout before the next subtask begins
- bounded `7E.1` queue/detail status projection coherence now exists:
  - `Review Work` queue-row status and `Review Work` detail status now
    reconcile through shared read-model projection after existing Stage `7D`
    verification actions
  - canonical shared truth only is used:
    - `task_submissions`
    - `writing_samples`
    - `writing_issue_suggestions`
    - `parent_verifications`
    - `writing_issues`
  - queue projection now respects canonical parent verification truth instead
    of treating already-verified misspellings as still unresolved
  - lesson submission queue rows now show shared projected status truth rather
    than contradictory older thread-only status where reviewable shared truth
    remains
  - manual writing samples with a single reviewable misspelling no longer
    remain live in the `Review Work` queue after canonical false-positive
    verification
  - no archive/completed-view redesign, new verification decisions,
    verification states, issue lifecycle states, queue truth tables, or Stage
    `8` semantics were introduced
- Stage `7E.1` QA evidence:
  - `npm run e2e:health`
    - passed
  - `npm run e2e:add-writing-sample`
    - passed
  - `npm run e2e:review-work-queue`
    - passed
  - `npm run e2e:review-work-status`
    - passed
  - `npm run e2e:review-work-detail`
    - passed
  - `npm run e2e:review-work-verification`
    - passed
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7E.1` preserved boundaries:
  - `Review Work` remains the canonical parent review surface
  - `Add Writing Sample` remains intake only
  - `Stage 7E.1` reused existing shared truth and shared read-model
    projection only
  - no new queue truth table was introduced
  - no route-local completion or archive ownership was introduced
  - archive/completion presentation coherence still belongs to `7E.2`
  - Stage `8` automatic mastery semantics remain out of scope
- `7E.1` complete and QA passed
- bounded `7E.2` archive/completion presentation coherence now exists:
  - completed/archive presentation is now derived from existing shared truth
    after documented Stage `7D` actions
  - archive/completed views no longer contradict canonical detail verification
    truth
  - lesson submissions and manual writing samples remain on the same canonical
    review spine where applicable
  - no new lifecycle states, queue truth tables, route-local archive
    ownership, or separate completion-truth source were introduced
- Stage `7E.2` QA evidence:
  - `npm run e2e:review-work-archive`
    - passed
  - `npm run e2e:review-work-status`
    - passed
  - `npm run e2e:review-work-detail`
    - passed
  - `npm run e2e:review-work-verification`
    - passed
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7E.2` preserved boundaries:
  - `Review Work` remains the canonical parent review surface
  - `Add Writing Sample` remains intake only
  - archive/completion presentation remains a shared read-model projection
    over existing truth
  - no route-local archive ownership or separate completion-truth source was
    introduced
  - Stage `8` automatic mastery semantics remain out of scope
- `7E.2` complete and QA passed
- bounded `7E.3` cross-surface return-path and count reconciliation now exists:
  - post-action return paths land in a coherent canonical `Review Work` queue
    state
  - queue counts, row visibility, and detail truth reconcile through the same
    shared read-model projection after documented verification actions
  - lesson submissions and manual writing samples remain coherent across
    queue, detail, and archive/history where applicable
  - no new queue truth table, route-local completion/archive ownership,
    lifecycle state, or Stage `8` semantics were introduced
- Stage `7E.3` QA evidence:
  - `npm run e2e:review-work-return-path`
    - passed
  - `npm run e2e:review-work-detail`
    - passed
  - `npm run e2e:review-work-verification`
    - passed
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- `7E.3` preserved boundaries:
  - `Review Work` remains the canonical parent review surface
  - `Add Writing Sample` remains intake only
  - cross-surface return-path and count reconciliation remains a shared
    read-model concern over existing truth
  - no new queue truth table or route-local completion/archive ownership was
    introduced
  - Stage `8` automatic mastery semantics remain out of scope
- `7E.3` complete and QA passed
- `Stage 7E` overall is now complete and QA passed
- the bounded post-Stage-`7` parent-facing evidence-transparency safety slice
  now exists:
  - dashboard and insights copy now distinguish verified parent review truth
    from broader advisory evidence/progress summaries
  - parent-facing wording no longer implies stronger mastery certainty than
    the current evidence model supports
  - no stored mastery/evidence, assignment, reward, analytics, or taxonomy
    truth was changed by this slice
- Stage `8` foundation readiness is now documentation-defined as a bounded
  audit / transparency slice only:
  - evidence maturity means advisory readiness of the currently captured shared
    evidence, not a new stored mastery state
  - current repo truth already exposes some maturity signals through read-only
    summaries:
    - total evidence count
    - recent success / failure mix
    - latest evidence source context
    - current competency / progress-state projections
  - what is still missing before real automatic mastery work:
    - any new automatic mastery runtime semantics
    - score / threshold ownership changes
    - new evidence-maturity persistence
    - stronger parent-facing mastery claims than the current advisory model
- post-Stage-`7` evidence-transparency QA evidence:
  - `npm run e2e:health`
    - passed
  - `npm run e2e:add-writing-sample`
    - passed
  - `npm run e2e:review-work-queue`
    - passed
  - `npm run e2e:review-work-detail`
    - passed
  - `npm run e2e:review-work-verification`
    - passed
  - `npm run e2e:review-work-archive`
    - passed
  - `npm run e2e:review-work-status`
    - passed
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- current private-live readiness for one child:
  - safe to use as a parent-led review and practice workflow
  - not safe to describe as full automatic child-work checking or automatic
    mastery judgement
  - parent must remain the authority on what matters, what is actionable, and
    what broader progress claims mean
- current production-release status:
  - the repo builds successfully with `npm run build`
  - production release path remains `git push origin main`
  - the current `main` worktree is dirty and must not be blindly pushed
  - before production push, the intended release slice should be isolated,
    reviewed, committed, and pushed intentionally
- next safe implementation boundary after `7E` QA is
  `documentation-first Stage 8 foundation audit — evidence maturity, capture readiness, and parent-facing mastery-claim boundaries`

### Stage 6A implementation status
- complete
- shared-boundary Stage `6A` grammar/proofreading candidate generation now
  exists under:
  - `lib/writing-engine/grammar/stage6a-authentic-submission-analysis.ts`
- Stage `6A` reuses the canonical authentic-writing source normalization and
  source provenance path established by `Stage 3A` and reused by `Stage 4A`
  and `Stage 5A`
- supported bounded Stage `6A` candidates now include:
  - standalone lowercase pronoun `i` -> `I` as a grammar candidate
  - repeated internal spacing between words as a proofreading candidate
- explicit unresolved outcomes now cover:
  - article-choice patterns that would require undocumented grammar taxonomy
    truth
  - quotation-mark patterns that would require broad proofreading ownership
- preserved canonical lineage includes:
  - `task_submission`
  - `writing_sample`
  - source span metadata
  - target text
  - child attempt text
- no verification writes, durable issue writes, mastery/evidence writes,
  `learning_items`, `learning_item_evidence`, `learning_item_issue_links`,
  `assignment_items`, rewards, analytics, dashboards, route-local ownership,
  or external API/model truth ownership were introduced
- Stage `6A` QA evidence:
  - `npm run writing-engine:grammar-proofreading-candidate-regression`
    - `writing-engine-stage6a-grammar-proofreading-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-verification-regression`
    - `writing-engine-stage5b-sentence-boundary-verification-regression: ok`
  - `npm run writing-engine:sentence-boundary-issue-promotion-regression`
    - `writing-engine-stage5c-sentence-boundary-issue-promotion-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `6A` residual risks:
  - candidate coverage is intentionally narrow and does not yet broaden into
    general grammar or broad proofreading ownership
  - unsupported transfer, analytics/calibration, and external-judgment cases
    remain deferred to later documented stages rather than being inferred here
  - coverage is regression-based rather than DB-backed or app-triggered

### Stage 6B implementation status
- complete
- shared-boundary Stage `6B` grammar/proofreading verification now exists
  under:
  - `lib/writing-engine/grammar/stage6b-authentic-submission-verification.ts`
- Stage `6B` reuses the existing shared `parent_verifications` contract and
  the established authentic-writing verification semantics from `Stage 3B`,
  `Stage 4B`, and `Stage 5B`
- supported parent decisions are now bounded to:
  - `accepted`
  - `overridden`
  - `false_positive`
  - `not_a_learning_issue`
- Stage `6B` preserves:
  - original suggestion truth
  - parent decision
  - parent-verified truth
  - canonical authentic-writing provenance
  - `sourceSpan`, `targetText`, and `childAttemptText` metadata where
    available
- write ownership remains limited to shared `parent_verifications`
- no durable issue writes, mastery/evidence writes, `learning_items`,
  `learning_item_evidence`, `learning_item_issue_links`, `assignment_items`,
  rewards, analytics, dashboards, UI/server-action work, route-local
  verification ownership, parallel verification storage, free-text taxonomy,
  or external API/model truth ownership were introduced
- Stage `6B` QA evidence:
  - `npm run writing-engine:grammar-proofreading-verification-regression`
    - `writing-engine-stage6b-grammar-proofreading-verification-regression: ok`
  - `npm run writing-engine:grammar-proofreading-candidate-regression`
    - `writing-engine-stage6a-grammar-proofreading-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-verification-regression`
    - `writing-engine-stage5b-sentence-boundary-verification-regression: ok`
  - `npm run writing-engine:sentence-boundary-issue-promotion-regression`
    - `writing-engine-stage5c-sentence-boundary-issue-promotion-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `6B` residual risks:
  - verification remains intentionally bounded to `Stage 6A` grammar and
    proofreading candidates only
  - durable grammar/proofreading issue promotion remains deferred to `Stage 6C`
  - `Stage 6A` candidate coverage remains intentionally narrow
  - coverage is regression-based rather than DB-backed or app-triggered

### Stage 6C implementation status
- complete
- shared-boundary Stage `6C` grammar/proofreading durable issue promotion now
  exists under:
  - `lib/writing-engine/grammar/stage6c-authentic-writing-issue-promotion.ts`
- Stage `6C` reuses only verified `Stage 6B` grammar/proofreading outcomes
  and the existing durable `writing_issue` lifecycle from `Stage 3C`,
  `Stage 4C`, and `Stage 5C`
- Stage `6C` promotes only:
  - `accepted`
  - `overridden`
  verified outcomes into durable issue truth
- Stage `6C` preserves:
  - original suggestion truth
  - parent decision
  - parent-verified truth
  - canonical authentic-writing provenance
  - `sourceSpan`, `targetText`, and `childAttemptText` metadata where
    available
- write ownership remains limited to the existing durable issue path
- `false_positive` and `not_a_learning_issue` outcomes remain auditable and do
  not create durable issue truth
- no mastery/evidence writes, `learning_items`, `learning_item_evidence`,
  `learning_item_issue_links`, `assignment_items`, rewards, analytics,
  dashboards, UI/server-action work, route-local issue ownership, parallel
  issue storage, free-text taxonomy, or external API/model truth ownership
  were introduced
- Stage `6C` QA evidence:
  - `npm run writing-engine:grammar-proofreading-issue-promotion-regression`
    - `writing-engine-stage6c-grammar-proofreading-issue-promotion-regression: ok`
  - `npm run writing-engine:grammar-proofreading-verification-regression`
    - `writing-engine-stage6b-grammar-proofreading-verification-regression: ok`
  - `npm run writing-engine:grammar-proofreading-candidate-regression`
    - `writing-engine-stage6a-grammar-proofreading-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:sentence-boundary-verification-regression`
    - `writing-engine-stage5b-sentence-boundary-verification-regression: ok`
  - `npm run writing-engine:sentence-boundary-issue-promotion-regression`
    - `writing-engine-stage5c-sentence-boundary-issue-promotion-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `6C` residual risks:
  - durable promotion remains intentionally bounded to verified `Stage 6A`
    grammar/proofreading candidates only
  - `Stage 6A` candidate coverage remains intentionally narrow
  - transfer/refinement evidence and analytics/calibration remain deferred to
    later documented stages
  - coverage is regression-based rather than DB-backed or app-triggered

### Stage 3 documentation gate
- Stage `3` is now documented as the authentic-writing submission-analysis
  stage rather than a placeholder heading
- canonical docs now define for Stage `3`:
  - the stage goal
  - the behaviour contract
  - architecture boundaries
  - non-goals
  - acceptance criteria
  - QA requirements
  - the boundary with Stage `4`
- parent `Stage 3` is intentionally broken into bounded mini-tasks before code:
  - `3A` submission-source normalization and spelling hypothesis generation
  - `3B` shared parent verification for authentic-writing hypotheses
  - `3C` verified authentic-writing outcome bridge into durable issue truth
- parent `Stage 3` is now complete
- Stage `3A` is now complete
- Stage `3A` remained bounded to:
  - spelling only
  - shared-boundary only
  - read/build only
  - no verification writes
  - no durable issue writes
  - no mastery updates
- Stage `3A` is now implemented:
  - shared submission-source normalization now exists under `lib/writing-engine`
  - spelling-only authentic-writing candidate hypothesis generation now exists
    under the shared Writing Engine boundary
  - deterministic candidate hypotheses are covered by the service shape and
    regression `testResultIsDeterministic()`
  - candidate hypotheses now preserve canonical source refs to:
    - `task_submission`
    - `writing_sample`
    - source span
    - target text
    - child attempt text
  - Stage `2` error-category, mapping, lesson-template, complexity, and
    similar-practice resolvers are reused where applicable
  - unresolved and ambiguous mapping/content gaps remain explicit
  - no parent-verification writes, durable issue writes, learning-item writes,
    or mastery updates were introduced
  - no route-local analysis ownership or retired runtime assumptions were
    reintroduced
- Stage `3A` QA evidence:
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:ambiguous-mapping-regression`
    - `writing-engine-stage2c-ambiguous-mapping-regression: ok`
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:word-complexity-regression`
    - `writing-engine-stage2e-word-complexity-regression: ok`
  - `npm run writing-engine:similar-practice-regression`
    - `writing-engine-stage2f-similar-practice-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `3A` residual risks:
  - no contract drift was found in `Stage 3A`
- Stage `3B` implementation status:
  - complete
  - shared `parent_verifications` persistence now accepts `Stage 3A`
    authentic-writing spelling hypotheses only
  - original suggestion truth remains auditable alongside parent-verified truth
  - supported outcomes are `accepted`, `overridden`, `false_positive`, and
    `not_a_learning_issue`
  - authentic-writing provenance is preserved through
    `sourceRef.taskSubmissionId`, `sourceRef.writingSampleId`, source-span
    metadata, target text, and child-attempt text
  - invalid decision / override combinations now fail explicitly before
    persistence
  - no write path was introduced outside canonical `parent_verifications`
  - no `writing_issues`, `learning_items`, `learning_item_evidence`, or
    mastery updates were added in this pass
  - no route-local verification ownership or parallel verification store was
    introduced
- Stage `3B` QA evidence:
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:ambiguous-mapping-regression`
    - `writing-engine-stage2c-ambiguous-mapping-regression: ok`
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:word-complexity-regression`
    - `writing-engine-stage2e-word-complexity-regression: ok`
  - `npm run writing-engine:similar-practice-regression`
    - `writing-engine-stage2f-similar-practice-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `3B` residual risks:
  - no contract drift was found in `Stage 3B`
- Stage `3C` implementation status:
  - complete
  - accepted and overridden authentic-writing verified outcomes can now be
    promoted into canonical durable `writing_issues`
  - durable issue truth preserves original suggestion truth,
    parent-verified educational truth, and authentic-writing submission
    provenance
  - `false_positive` and `not_a_learning_issue` outcomes remain auditable
    without creating durable issue truth
  - missing verified lineage required for durable issue truth now fails
    explicitly rather than creating partial issue records
  - no write path outside canonical durable issue storage was introduced
  - no mastery, `learning_items`, `learning_item_evidence`, reward, or
    analytics mutation was added in this pass
  - no route-local issue orchestration or parallel durable issue lifecycle was
    introduced
- Stage `3C` QA evidence:
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:ambiguous-mapping-regression`
    - `writing-engine-stage2c-ambiguous-mapping-regression: ok`
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:word-complexity-regression`
    - `writing-engine-stage2e-word-complexity-regression: ok`
  - `npm run writing-engine:similar-practice-regression`
    - `writing-engine-stage2f-similar-practice-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `3C` residual risks:
  - no contract drift was found in `Stage 3C`
- Parent Stage `3` closeout status:
  - `Stage 3` is complete
  - `Stage 3` fulfilled its intended purpose:
    - shared authentic-writing submission-analysis path established
    - spelling-only candidate generation proven
    - parent verification persisted canonically
    - accepted and overridden verified outcomes bridged into durable
      `writing_issues`
    - rejected outcomes remained auditable without fake durable issue truth
    - no parallel verification or issue-history model was introduced
    - no mastery, `learning_items`, `learning_item_evidence`, reward, or
      analytics mutation was introduced in `Stage 3`
- Parent Stage `3` QA evidence:
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:ambiguous-mapping-regression`
    - `writing-engine-stage2c-ambiguous-mapping-regression: ok`
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:word-complexity-regression`
    - `writing-engine-stage2e-word-complexity-regression: ok`
  - `npm run writing-engine:similar-practice-regression`
    - `writing-engine-stage2f-similar-practice-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Parent Stage `3` residual risks:
  - no contract drift was found in `Stage 3`
- Stage `4` documentation pass is now complete:
  - canonical docs now define for Stage `4`:
    - the stage goal
    - the punctuation-only behaviour contract
    - architecture boundaries
    - non-goals
    - acceptance criteria
    - QA requirements
    - the boundary with Stage `5`
  - parent `Stage 4` is intentionally broken into bounded mini-tasks before
    code:
    - `4A` punctuation hypothesis generation from authentic-writing inputs
    - `4B` shared parent verification reuse for punctuation hypotheses
    - `4C` verified punctuation outcome bridge into durable issue truth
- Stage `4A` implementation status:
  - complete
  - punctuation-only authentic-writing candidate hypothesis generation now
    exists under the shared Writing Engine boundary
  - Stage `4A` reuses the canonical authentic-writing source normalization and
    source provenance path established by Stage `3A`
  - supported punctuation-only cases now produce shared candidate hypotheses
    with preserved canonical source lineage
  - source span and target text are preserved where available in source-ref
    metadata
  - deterministic repeated output is now covered for the same canonical input
  - explicit unresolved outcomes now cover:
    - unsupported punctuation patterns
    - cases requiring sentence-boundary semantics
    - cases requiring grammar/usage semantics
  - no parent-verification writes, durable issue writes, mastery updates,
    `learning_items`, `learning_item_evidence`, or `assignment_items` writes
    were introduced
  - no route-local ownership, retired spelling runtime ownership,
    sentence-boundary logic, grammar broadening, or external API dependency
    was introduced
- Stage `4A` QA evidence:
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `4A` residual risks:
  - Stage `4A` intentionally leaves punctuation taxonomy resolution for later
    bounded passes
  - Stage `4A` intentionally leaves shared parent verification for `Stage 4B`
  - Stage `4A` intentionally leaves durable issue promotion for `Stage 4C`
  - cases that depend on sentence-boundary or grammar semantics remain
    explicit unresolved outcomes rather than inferred classifications
  - coverage is regression-based rather than DB-backed or app-triggered
- Stage `4B` implementation status:
  - complete
  - shared parent-verification persistence now exists for `Stage 4A`
    punctuation authentic-writing hypotheses through the existing
    `parent_verifications` contract
  - `Stage 4B` reuses the existing authentic-writing verification invariants
    established by `Stage 3B`
  - supported parent decisions are now bounded to:
    - `accepted`
    - `overridden`
    - `false_positive`
    - `not_a_learning_issue`
  - original suggestion truth and parent-verified truth are both preserved on
    the shared verification result shape
  - canonical `task_submission` / `writing_sample` lineage and punctuation
    source span / target text metadata are preserved into parent verification
  - no durable `writing_issues`, `writing_issue_suggestions`,
    `learning_items`, `learning_item_evidence`, or mastery writes were
    introduced
  - no route-local verification ownership, parallel verification store,
    sentence-boundary logic, grammar broadening, or external API dependency
    was introduced
- Stage `4B` QA evidence:
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `4B` residual risks:
  - Stage `4B` intentionally leaves durable punctuation issue promotion for
    `Stage 4C`
  - accepted punctuation verifications can preserve null educational
    classification fields when the `Stage 4A` hypothesis did not assign them
  - sentence-boundary and grammar-dependent punctuation cases remain outside
    `Stage 4B` and must not be verified here
  - coverage is regression-based rather than DB-backed or app-triggered
- Stage `4C` implementation status:
  - complete
  - the verified punctuation outcome bridge now connects bounded `Stage 4B`
    punctuation authentic-writing outcomes into the existing durable
    `writing_issue` lifecycle
  - `Stage 4C` reuses the existing shared `writing_issues` ownership path and
    does not introduce a punctuation-only issue store
  - only promotable `accepted` and `overridden` punctuation outcomes can create
    durable issue truth
  - `false_positive` and `not_a_learning_issue` outcomes remain auditable and
    do not create durable `writing_issues`
  - original suggestion truth, parent-verified truth, canonical
    `task_submission` / `writing_sample` lineage, and punctuation source span /
    target text metadata are preserved into durable issue metadata
  - invalid promotable shapes such as missing verified micro-skill truth or
    missing preserved lineage now fail explicitly rather than creating partial
    durable issue records
  - no `learning_items`, `learning_item_evidence`, mastery updates,
    assignment/reward/UI/server-action work, sentence-boundary logic, grammar
    broadening, route-local issue ownership, or external API dependency was
    introduced
- Stage `4C` QA evidence:
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `4C` residual risks:
  - accepted punctuation outcomes still require resolved educational truth to
    be promotable; unresolved accepted shapes fail explicitly rather than
    silently degrading
  - coverage is regression-based rather than DB-backed or app-triggered
  - sentence-boundary and grammar-dependent punctuation cases remain outside
    parent `Stage 4` and must not be promoted here
- Parent Stage `4` is now complete for its documented punctuation-only scope
- Stage `5` documentation pass is now complete:
  - canonical docs now define for Stage `5`:
    - the stage goal
    - the sentence-boundary behaviour contract
    - architecture boundaries
    - non-goals
    - acceptance criteria
    - QA requirements
    - the boundary with Stage `6`
  - parent `Stage 5` is intentionally broken into bounded mini-tasks before
    code:
    - `5A` sentence-boundary candidate hypothesis generation from
      authentic-writing inputs
    - `5B` shared parent verification reuse for sentence-boundary hypotheses
    - `5C` verified sentence-boundary outcome bridge into durable issue truth
- Stage `5A` implementation status:
  - complete
  - bounded sentence-boundary / sentence-formation candidate hypothesis
    generation now exists under the shared Writing Engine boundary
  - `Stage 5A` reuses the canonical authentic-writing source normalization and
    source provenance path established by `Stage 3A` and reused by `Stage 4A`
  - supported bounded sentence-boundary cases now produce shared candidate
    hypotheses for:
    - missing sentence-ending punctuation
    - missing space after sentence-ending punctuation
    - sentence-start capitalization gaps
  - source span, target text, and context metadata are preserved where
    available in source-ref metadata
  - explicit unresolved outcomes now cover:
    - unsupported sentence-boundary patterns
    - cases requiring grammar semantics
    - cases requiring broad proofreading semantics
  - no parent-verification writes, durable issue writes, mastery updates,
    `learning_items`, `learning_item_evidence`, or `assignment_items` writes
    were introduced
  - no route-local ownership, retired spelling runtime ownership,
    grammar/proofreading ownership broadening, or external API dependency was
    introduced
- Stage `5A` QA evidence:
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `5A` residual risks:
  - category, micro-skill, and template truth remain intentionally unresolved
    in this bounded pass
  - sentence-boundary verification remains intentionally deferred to `Stage 5B`
  - durable sentence-boundary issue promotion remains intentionally deferred to
    `Stage 5C`
  - coverage is regression-based rather than DB-backed or app-triggered
- Stage `5B` implementation status:
  - complete
  - shared `parent_verifications` persistence now exists for `Stage 5A`
    sentence-boundary authentic-writing hypotheses through the existing
    `parent_verifications` contract
  - `Stage 5B` reuses the existing manual-diagnostic, authentic-writing, and
    punctuation verification invariants established by `Stage 1B`, `Stage 3B`,
    and `Stage 4B`
  - supported parent decisions are now bounded to:
    - `accepted`
    - `overridden`
    - `false_positive`
    - `not_a_learning_issue`
  - original suggestion truth and parent-verified truth are both preserved on
    the shared verification result shape
  - canonical `task_submission` / `writing_sample` lineage and
    sentence-boundary source span / target text metadata are preserved into
    parent verification
  - no durable `writing_issues`, `learning_items`,
    `learning_item_evidence`, `assignment_items`, or mastery writes were
    introduced
  - no route-local verification ownership, parallel verification store,
    grammar/proofreading verification ownership, or external API dependency
    was introduced
- Stage `5B` QA evidence:
  - `npm run writing-engine:sentence-boundary-verification-regression`
    - `writing-engine-stage5b-sentence-boundary-verification-regression: ok`
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `5B` residual risks:
  - accepted sentence-boundary verifications can still preserve null
    educational classification fields because `Stage 5A` intentionally leaves
    category, mini-skill, and template truth unresolved
  - durable sentence-boundary issue promotion remains intentionally deferred to
    `Stage 5C`
  - coverage is regression-based rather than DB-backed or app-triggered
- Stage `5C` implementation status:
  - complete
  - verified sentence-boundary authentic-writing outcomes now bridge into the
    existing shared durable `writing_issues` lifecycle without introducing a
    new issue model
  - only `accepted` and `overridden` verified outcomes can create durable issue
    truth
  - `false_positive` and `not_a_learning_issue` remain auditable and do not
    create durable `writing_issues`
  - original suggestion truth and parent-verified educational truth are both
    preserved in durable issue metadata
  - canonical `task_submission` / `writing_sample` lineage and
    sentence-boundary source span / target text metadata are preserved into
    durable issue records
  - missing task-submission lineage, missing source-span lineage, missing
    preserved target text, and missing verified micro-skill truth now fail
    explicitly rather than creating partial durable issue records
  - no `learning_items`, `learning_item_evidence`, `assignment_items`, mastery,
    route-local ownership, grammar/proofreading ownership broadening, or
    parallel issue-history storage were introduced
- Stage `5C` QA evidence:
  - `npm run writing-engine:sentence-boundary-issue-promotion-regression`
    - `writing-engine-stage5c-sentence-boundary-issue-promotion-regression: ok`
  - `npm run writing-engine:sentence-boundary-verification-regression`
    - `writing-engine-stage5b-sentence-boundary-verification-regression: ok`
  - `npm run writing-engine:sentence-boundary-candidate-regression`
    - `writing-engine-stage5a-sentence-boundary-candidate-regression: ok`
  - `npm run writing-engine:punctuation-candidate-regression`
    - `writing-engine-stage4a-punctuation-candidate-regression: ok`
  - `npm run writing-engine:punctuation-verification-regression`
    - `writing-engine-stage4b-punctuation-verification-regression: ok`
  - `npm run writing-engine:punctuation-issue-promotion-regression`
    - `writing-engine-stage4c-punctuation-issue-promotion-regression: ok`
  - `npm run writing-engine:authentic-submission-regression`
    - `writing-engine-stage3a-authentic-submission-regression: ok`
  - `npm run writing-engine:authentic-verification-regression`
    - `writing-engine-stage3b-authentic-verification-regression: ok`
  - `npm run writing-engine:authentic-issue-promotion-regression`
    - `writing-engine-stage3c-authentic-issue-promotion-regression: ok`
  - `npm run writing-engine:verification-regression`
    - `writing-engine-stage1b-verification-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `5C` residual risks:
  - accepted outcomes still depend on upstream educational truth being present;
    because `Stage 5A` intentionally leaves educational truth unresolved,
    accepted outcomes without verified or suggested micro-skill truth fail
    explicitly instead of promoting
  - coverage is regression-based rather than DB-backed or app-triggered
- Parent Stage `5` closeout status:
  - `Stage 5` is complete for its documented `5A` / `5B` / `5C` contract only
  - together, `Stage 5A`, `Stage 5B`, and `Stage 5C` now guarantee:
    - bounded sentence-boundary / sentence-formation candidate hypothesis
      generation from canonical authentic-writing inputs
    - shared parent-verification persistence for bounded sentence-boundary
      hypotheses
    - bounded durable issue promotion for accepted and overridden
      sentence-boundary outcomes through the existing shared `writing_issues`
      lifecycle
    - preserved canonical distinction between candidate-hypothesis truth,
      parent-verified truth, durable issue truth, and future active
      `learning_item` truth
- Parent Stage `5` boundaries remained intact:
  - shared Writing Engine ownership only
  - canonical authentic-writing provenance preserved
  - no undocumented route-local ownership
  - no grammar/proofreading broadening
  - no free-text taxonomy invention
  - no external API/model truth ownership
  - no `learning_items`, `learning_item_evidence`, or `assignment_items`
    writes beyond documented Stage `5` boundaries
  - no mastery/evidence writes beyond documented Stage `5` boundaries
  - no reward-system changes
  - no revival of `word_progress` or retired spelling runtime ownership
- Parent Stage `5` QA evidence summary:
  - focused `5A`, `5B`, and `5C` regressions passed
  - upstream shared regression suites for `Stage 1B`, `Stage 3A` / `3B` /
    `3C`, and `Stage 4A` / `4B` / `4C` passed
  - `npx tsc --noEmit` passed with exit code `0` and no output
- Parent Stage `5` residual risks:
  - `Stage 5` remains intentionally bounded; broader grammar/usage and
    proofreading ownership remain deferred to `Stage 6`
  - some accepted outcomes still depend on upstream educational truth being
    present because `Stage 5A` intentionally leaves category, mini-skill, and
    template truth unresolved in bounded cases
  - coverage is regression-based rather than DB-backed or app-triggered
- Parent Stage `5` boundary to the next stage:
  - `Stage 5` ends at sentence-boundary / sentence-formation authentic-writing
    issue handling
  - `Stage 6` remains the next boundary for grammar/usage work, broad
    proofreading/editing work, richer transfer evidence flows, and broader
    analytics/calibration
- next safe task after parent `Stage 5` closeout is documentation-first
  preparation for `Stage 6`

### Stage 2 documentation gate
- Stage `2` is now documented as a spelling content-foundation stage rather
  than a broad implementation placeholder
- canonical docs now define for Stage `2`:
  - the stage goal
  - the behaviour contract
  - architecture boundaries
  - non-goals
  - acceptance criteria
  - QA requirements
  - the boundary with Stage `3`
- parent `Stage 2` is now complete in this status file after bounded `2A`
  through `2F` closeout

### Stage 2 planned mini-tasks
- `2A` Canonical spelling-content source audit and resolver boundary
  - complete
- `2B` Error-category vocabulary contract
  - complete
- `2C` Word-to-mini-skill mapping resolver
  - broken into bounded mini-tasks before implementation
- `2D` Thin lesson-template registry
- `2E` Word complexity metadata resolver
- `2F` Similar-practice support resolver
- Stage `2A` delivered:
  - shared read-only spelling-content source audit
  - explicit `confirmed_canonical` / `candidate_only` /
    `unavailable_not_yet_canonical` source statuses
- Stage `2B` delivered:
  - finite canonical spelling error-category vocabulary
  - stable implementation-facing category codes and labels
  - deterministic normalization for current runtime category inputs
  - bounded alias handling for current runtime label variants
  - explicit missing/unknown category handling
- Stage `2B` QA evidence:
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2` residual risks after `2B`:
  - word-to-mini-skill mapping remains `candidate_only` until `2C`
  - similar-practice candidates remain `candidate_only`
  - word complexity metadata remained `unavailable_not_yet_canonical` until
    `2E`
  - broader cross-system adoption of the canonical category vocabulary remains
    future work
- Stage `2C` planned mini-tasks:
  - `2C.A` Canonical mapping source confirmation and boundary
    - complete
  - `2C.B` Deterministic primary mapping resolver
    - complete
  - `2C.C` Ambiguous mapping handling and closeout QA
    - complete
- Stage `2C.A` delivered:
  - a shared read-only word-to-mini-skill mapping source audit boundary
  - explicit `canonical` / `candidate_only` / `blocked` source classification
  - confirmed `micro_skill_catalog` as the only Stage `2` mini-skill identity anchor
  - read-only exposure of catalog word-list mapping candidates without promoting
    them to canonical mapping truth
- Stage `2C.A` QA evidence:
  - `npm run writing-engine:mapping-source-regression`
    - `writing-engine-stage2c-mapping-source-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2C.B` delivered:
  - deterministic primary word-to-mini-skill resolution from the bounded
    `2C.A` catalog-word candidate boundary
  - one primary `micro_skill_key` only
  - explicit unresolved results for:
    - missing words
    - out-of-scope boundaries
    - unavailable candidate words
    - unmapped words
  - no free-text `micro_skill_key` invention
- Stage `2C.B` QA evidence:
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:mapping-source-regression`
    - `writing-engine-stage2c-mapping-source-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2C.B` residual risks:
  - the resolver is intentionally bounded to exact normalized word matching
    against `2C.A` catalog candidate words; that is correct for `2C.B`, but
    ambiguity handling is still deferred to `2C.C`
  - mapping truth is still not promoted beyond what `2C.A` allows; the
    resolver returns catalog-owned keys only from the bounded candidate
    boundary, so broader canonical mapping truth remains future work
  - candidate-word coverage is only as complete as the currently exposed
    catalog metadata; missing candidate words correctly return explicit
    unresolved results rather than inferred mappings
- Stage `2C.C` delivered:
  - explicit ambiguous mapping outcomes
  - explicit unresolved / unavailable outcomes
  - no guessed `micro_skill_key` values
  - read-only bounded mapping closeout for the first Stage `2C` pass
- Stage `2C.C` QA evidence:
  - `npm run writing-engine:ambiguous-mapping-regression`
    - `writing-engine-stage2c-ambiguous-mapping-regression: ok`
  - `npm run writing-engine:primary-mapping-regression`
    - `writing-engine-stage2c-primary-mapping-regression: ok`
  - `npm run writing-engine:mapping-source-regression`
    - `writing-engine-stage2c-mapping-source-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:error-category-regression`
    - `writing-engine-stage2b-error-category-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npm run writing-engine:diagnostic-regression`
    - `writing-engine-stage1b-diagnostic-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2C` is now complete:
  - `2C.A` complete
  - `2C.B` complete
  - `2C.C` complete
- Stage `2C` residual risks after closeout:
  - mapping truth is still intentionally bounded by `2C.A` candidate-only
    sources; `2C.C` adds explicit ambiguity handling without promoting broader
    canonical mapping truth
  - ambiguity handling is limited to exact normalized word overlap across
    bounded catalog candidate sources; that is appropriate for `2C.C`, but
    broader product adoption or richer disambiguation remains future work
  - candidate-word coverage is still limited by currently exposed catalog
    metadata, so missing coverage continues to surface as explicit unresolved
    outcomes rather than inferred mappings
- next safe implementation task is `2D`
- Stage `2D` documentation gate is now explicit:
  - goal:
    - define a thin deterministic lesson-template registry for spelling
  - behaviour contract:
    - stable template keys
    - deterministic lookup from canonical spelling-content truth
    - explicit missing-template outcomes
  - architecture boundary:
    - shared read-only lookup under `lib/writing-engine`
    - no assignment ownership rewrite
    - no route-local lesson source of truth
  - non-goals:
    - no lesson rendering system
    - no persistence/schema work
    - no reward/mastery/verification changes
  - implementation may proceed only within that bounded contract
- Stage `2D` is now complete:
  - stable implementation-facing spelling lesson-template keys are normalized
    from canonical catalog-backed template fields
  - deterministic read-only lesson-template lookup now exists under the shared
    `lib/writing-engine` boundary
  - supported spelling mini-skills now resolve deterministically to allowed
    template keys through the shared registry
  - explicit unresolved outcomes now cover:
    - missing template registry candidates
    - preferred template key unavailable
    - dictation template key unavailable
  - missing template truth now returns explicit unresolved outcomes in the
    registry layer instead of inventing fallback content
  - existing Stage `1D` assignment generation now consumes the shared lookup
    boundary without changing assignment ownership or duplicate identity rules
  - the same canonical input resolves to the same template outcome across
    repeated runs
  - no new canonical source of truth, route owner, or authored lesson system
    was introduced
- Stage `2D` QA evidence:
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2D` residual risks:
  - the registry is intentionally thin and read-only, so it depends on
    catalog-backed template quality and coverage in `micro_skill_catalog`
  - for Stage `1D` consumers, unresolved registry outcomes are still collapsed
    into the pre-existing assignment skip `missing_template_key`; that
    preserves Stage `1D` behavior, but richer unresolved-reason surfacing
    would need a docs-first pass later
  - regression coverage is good for normalization, determinism, and unresolved
    outcomes, but it remains fixture-based rather than DB-backed
- next safe implementation task is now `2E`
- Stage `2E` documentation gate is now explicit:
  - goal:
    - define a bounded read-only word complexity metadata resolver for spelling
  - behaviour contract:
    - stable complexity metadata shape
    - deterministic lookup from canonical spelling-content truth
    - explicit unknown / unavailable outcomes
  - architecture boundary:
    - shared read-only lookup under `lib/writing-engine`
    - no mastery scoring recalibration
    - no route-local complexity source of truth
  - non-goals:
    - no promotion/demotion logic
    - no analytics dashboard work
    - no persistence/schema work
  - implementation may proceed only within that bounded contract
- Stage `2E` is now complete:
  - stable implementation-facing spelling word complexity metadata now
    normalizes curated starter-word-bank difficulty into bounded complexity
    bands
  - deterministic read-only word complexity lookup now exists under the shared
    `lib/writing-engine` boundary
  - explicit unresolved outcomes now cover:
    - missing word
    - out-of-scope boundary
    - complexity metadata unavailable
    - unknown word complexity
  - complexity metadata remains descriptive content truth and does not change
    mastery scoring, stage gates, promotion logic, or assignment identity
  - no new canonical source of truth, external dependency, or analytics/rendering
    owner was introduced
- Stage `2E` QA evidence:
  - `npm run writing-engine:word-complexity-regression`
    - `writing-engine-stage2e-word-complexity-regression: ok`
  - `npm run writing-engine:spelling-content-regression`
    - `writing-engine-stage2a-spelling-content-regression: ok`
  - `npm run writing-engine:lesson-template-regression`
    - `writing-engine-stage2d-lesson-template-regression: ok`
  - `npm run writing-engine:assignment-generation-regression`
    - `writing-engine-stage1d1-assignment-generation-regression: ok`
  - `npx tsc --noEmit`
    - passed with exit code `0` and no output
- Stage `2E` residual risks:
  - the resolver is intentionally bounded to curated starter-word-bank
    difficulty and does not yet broaden into richer lexical complexity sources
  - words outside curated starter-word difficulty coverage remain explicit
    unresolved outcomes rather than heuristic fallbacks
  - regression coverage is good for normalization, determinism, and unresolved
    outcomes, but it remains fixture-based rather than DB-backed
  - import-direction purity was validated by inspection rather than a
    dedicated automated regression
  - there is no dedicated regression asserting the Stage `2A` source-audit
    `sourceRefs` for complexity metadata, though resolver behavior itself is
    covered
- next safe implementation task is now `2F`
- Stage `2F` documentation gate is now explicit:
  - goal:
    - define a bounded read-only similar-practice support resolver for spelling
  - behaviour contract:
    - stable similar-practice input/output shape
    - deterministic lookup from canonical spelling-content truth
    - explicit under-populated / unavailable outcomes
  - architecture boundary:
    - shared read-only lookup under `lib/writing-engine`
    - no assignment routing change
    - no route-local similar-practice source of truth
  - non-goals:
    - no adaptive recommendation engine
    - no cross-learning-item batching
    - no persistence/schema work
  - implementation may proceed only within that bounded contract
- Stage `2F` is now implemented:
  - stable implementation-facing similar-practice resolution now exists under
    the shared `lib/writing-engine` spelling boundary
  - catalog-backed starter-word-bank and example-word content now resolve
    deterministically into ordered similar-practice support words
  - explicit unresolved outcomes now cover:
    - missing word
    - out-of-scope boundary
    - similar-practice unavailable
    - unsupported anchor word
    - under-populated similar practice
  - similar-practice support remains read-only curated content truth and does
    not change assignment routing, assignment ownership, mastery/evidence
    semantics, persistence/schema, UI, or external dependency ownership
  - no new canonical source of truth, adaptive recommendation layer, or
    route-local ownership was introduced
- Stage `2F` tests run:
  - `npm run writing-engine:similar-practice-regression`
  - `npm run writing-engine:spelling-content-regression`
  - `npm run writing-engine:lesson-template-regression`
  - `npm run writing-engine:assignment-generation-regression`
  - `npx tsc --noEmit`
- Stage `2F` passed QA:
  - the shared similar-practice resolver is read-only
  - it uses only the canonical catalog-backed starter-word-bank and
    example-word sources exposed through the Stage `2A` boundary
  - deterministic ordered outputs were confirmed for the same canonical inputs
  - explicit unresolved outcomes were confirmed instead of fallback suggestions
  - no adaptive recommendation logic, duplicate source-of-truth behavior, or
    route-local ownership was introduced
  - import direction was validated as shared-boundary only
- Stage `2F` residual risks:
  - the resolver is intentionally bounded to catalog-backed starter-word-bank
    and example-word coverage and does not yet broaden into richer
    similar-practice relationship sources
  - unsupported anchor words and sparsely populated catalogs remain explicit
    unresolved outcomes rather than inferred support suggestions
  - regression coverage is good for deterministic ordering and under-populated
    outcomes, but it remains fixture-based rather than DB-backed
  - import-direction purity was validated by inspection rather than a
    dedicated automated regression
  - there is no dedicated Stage `2F` mutation-safety regression on the
    resolver output itself, though the underlying Stage `2A` source boundary
    already has alias/mutation coverage
- Parent Stage `2` is now complete
- next safe task is a documentation-first preparation pass for `Stage 3`
- Parent Stage `2` QA evidence:
  - `npm run writing-engine:spelling-content-regression`
  - `npm run writing-engine:error-category-regression`
  - `npm run writing-engine:mapping-source-regression`
  - `npm run writing-engine:primary-mapping-regression`
  - `npm run writing-engine:lesson-template-regression`
  - `npm run writing-engine:word-complexity-regression`
  - `npm run writing-engine:similar-practice-regression`
  - `npm run writing-engine:assignment-generation-regression`
  - `npx tsc --noEmit`
- Parent Stage `2` blockers:
  - none after closeout reconciliation
- Parent Stage `2` non-blocking risks:
  - Stage `2C` mapping remains intentionally bounded by `candidate_only`
    catalog word-list sources
  - `2D`, `2E`, and `2F` rely on bounded catalog-backed coverage and explicit
    unresolved outcomes
  - regression coverage is mostly fixture-based rather than DB-backed
  - some import-direction and mutation-safety checks remain inspection-based
    rather than fully automated
- no Stage `2` mini-task currently authorizes:
  - UI work
  - server actions
  - persistence/schema work
  - assignment ownership changes
  - authentic-writing analysis
- no Stage `2B` implementation introduced:
  - classifier expansion
  - parent-verification changes
  - persistence changes
  - analytics changes
- if `2A` cannot confirm a canonical read path for any required Stage `2`
  content type without inventing a new source of truth, implementation must
  stop and return to docs before code

### Stage 1D documentation gate
- canonical docs now define the Stage `1D` implementation boundary before code
  work begins
- the first implementation slice is bounded to spelling `word_practice`
  `controlled_spelling` assignment generation from canonical `learning_items`
- the first implementation slice is read/build only; assignment-item
  persistence is deferred to a later Stage `1D` pass
- the `1D.1` read/build slice is now implemented under the shared
  `lib/writing-engine` boundary with focused regression coverage
- the `1D.2` docs pass is now bounded to:
  - deterministic selection of already-eligible `1D.1` candidates
  - duplicate-safe append into canonical `assignment_items`
  - no UI/server-action flow yet
  - no grouped-set, contrast, dictation, or broader adaptive logic yet
- Stage `1D.2` is now complete:
  - `1D.2A` deterministic candidate ordering is complete
  - `1D.2B` canonical duplicate detection read boundary is complete
  - `1D.2C` duplicate-safe append orchestration is complete
- Stage `1D.2` delivered:
  - deterministic candidate ordering
  - read-only duplicate detection scoped to destination/header and parent
  - duplicate-safe append-only `assignment_items` orchestration
  - duplicate filtering before position assignment
  - second-run idempotence
  - no cross-destination dedupe
- Stage `1D.2` QA evidence:
  - `npm run writing-engine:assignment-generation-regression` passed with
    `writing-engine-stage1d1-assignment-generation-regression: ok`
  - historical `1D.2` QA noted unrelated `learning-items.ts` typecheck debt at
    that time, but current repo truth now passes `npx tsc --noEmit` cleanly
  - QA found no remaining `1D.2C` findings
  - QA found no new typecheck failures tied to:
    - `lib/writing-engine/assignments/service.ts`
    - `lib/writing-engine/persistence/assignment-items.ts`
    - `scripts/writing-engine-stage1d1-assignment-generation-regression.ts`
    - `scripts/writing-engine-stage1a-regression.ts`
- Stage `1D.2` residual risks / follow-up debt:
  - `1D.2` coverage is fixture-based rather than DB-backed
  - future concurrency or transaction optimisation needs a fresh docs review
  - no UI or app-triggered smoke path exists yet by design
- Stage `1D.3` is now complete:
  - `1D.3` is the first grouped-set builder pass after the single-word
    `1D.1`/`1D.2` slice
  - it is limited to spelling `grouped_set_practice`
    `controlled_spelling` items
  - grouped-set prompt content must come from canonical catalog metadata plus
    one evidence-backed anchor word
  - grouped-set candidates must reuse the existing `1D.2` duplicate-safe
    append model
  - contrast, dictation, adaptive routing, and new assignment identity/provenance
    models remain out of scope
- Stage `1D.3` mini-task closeout is now complete:
  - `1D.3A` delivered:
    - grouped-set candidate builder and explicit skip semantics
    - read/build grouped-set support from canonical catalog metadata only
  - `1D.3B` delivered:
    - grouped-set persistence verification through the existing `1D.2`
      duplicate-safe append model unchanged
    - grouped-set first append success
    - grouped-set second-run idempotence
- Stage `1D.3` QA evidence:
  - `npm run writing-engine:assignment-generation-regression` passed with
    `writing-engine-stage1d1-assignment-generation-regression: ok`
  - grouped-set coverage now proves:
    - grouped-set candidate generation succeeds when catalog metadata is
      sufficient
    - grouped words are normalized, deduplicated, and preserve stable first-seen
      catalog order
    - one evidence-backed anchor `targetWord` is preserved
    - grouped-set first append succeeds
    - grouped-set second-run append is idempotent
    - grouped-set duplicate checks still use only the documented canonical
      identity fields
    - grouped-set prompt/answer payload is preserved on append
  - `npx tsc --noEmit` was run after `1D.3B`
  - QA found no new typecheck failures tied to:
    - `lib/writing-engine/assignments/candidates.ts`
    - `lib/writing-engine/assignments/service.ts`
    - `lib/writing-engine/persistence/assignment-items.ts`
    - `scripts/writing-engine-stage1d1-assignment-generation-regression.ts`
- Stage `1D.4` is now complete:
  - `1D.4A` contrast candidate builder and skip semantics are complete
  - `1D.4B` contrast persistence and idempotence verification are complete
- Stage `1D.4` QA evidence now includes:
  - contrast append coverage proves first append success
  - contrast append coverage proves second-run idempotence
  - contrast duplicate checks still use only the documented canonical identity
    fields
- Stage `1D.4` delivered:
  - contrast candidate builder
  - contrast append/idempotence using the existing `1D.2` model
  - no new duplicate model
  - no new provenance model
  - no UI/server actions/rewards/adaptive routing
- Stage `1D.4` tests run:
  - `npm run writing-engine:assignment-generation-regression`
  - `npx tsc --noEmit`
- Stage `1D.4` residual risks:
  - fixture-based coverage rather than DB-backed
  - richer contrast identity would require a docs-first revisit
  - no UI/app-triggered smoke path yet
- Stage `1D.5` is now complete:
  - `1D.5A` delivered the bounded spelling `dictation`
    `controlled_spelling` candidate builder and explicit skip semantics
  - `1D.5B` proved dictation persistence through the existing `1D.2`
    duplicate-safe append model unchanged
  - dictation generation remains bounded to:
    - `domain_module = spelling`
    - `practice_route = dictation`
    - `item_type = controlled_spelling`
  - canonical generation inputs remain:
    - `learning_items`
    - `micro_skill_catalog`
    - `learning_item_evidence`
  - one evidence-backed anchor `target_word` remains the candidate provenance
    anchor and duplicate-check target
  - dictation template selection remains canonical and deterministic for the
    same inputs
  - no audio delivery, browser speech synthesis, sentence batching, adaptive
    routing, rewards, UI/server actions, route-local composition, or
    assignment-header redesign was introduced
- Stage `1D.5` QA evidence:
  - `Stage 1D.5A` passed QA
  - `Stage 1D.5B` passed QA
  - `npm run writing-engine:assignment-generation-regression`
  - `npx tsc --noEmit`
  - first dictation append success is proven
  - second-run dictation idempotence is proven
  - duplicate reuse remains constrained to the unchanged `1D.2` identity
    fields:
    - `learning_item_id`
    - `item_type`
    - `target_word`
    - `template_key`
    - `source_type`
    - `source_entity_id`
  - existing `1D.1` / `1D.2` / `1D.3` / `1D.4` / `1D.5A` behavior remained
    unchanged
- Stage `1D.5` residual risks:
  - fixture-based coverage rather than DB-backed
  - live catalog rows still need real dictation template truth
  - no UI or app-triggered smoke path yet
  - any richer dictation delivery model requires a docs-first revisit
- Parent Stage `1D` is now complete:
  - canonical `learning_items` -> generic `assignment_items` generation exists
  - duplicate-safe append exists
  - bounded supported spelling routes now include:
    - `word_practice`
    - `grouped_set_practice`
    - `contrast_practice`
    - `dictation`
  - no evidence was found of revived `word_progress`, route-local composition,
    fake `writing_issues`, retired spelling runtime ownership, or reward logic
    as mastery truth
- Stage `1` QA closeout evidence:
  - `npm run writing-engine:regression` passed
  - `npm run writing-engine:diagnostic-regression` passed
  - `npm run writing-engine:verification-regression` passed
  - Stage `1C` mastery bridge regression passed
  - `npm run writing-engine:assignment-generation-regression` passed
  - `npx tsc --noEmit` passed
- Parent Stage `1` is now complete for its documented purpose
- `Stage 1D.6` is not currently defined as an active contract stage in the
  canonical docs; treat older mentions as placeholder planning language rather
  than a required Stage `1` follow-up
- Next safe pass after Stage `1` closeout is a documentation-first `Stage 2`
  planning pass

### Stage 1D.3 planned mini-tasks
- `1D.3A` — Grouped-set candidate builder and skip semantics
  - complete
- `1D.3B` — Duplicate-safe grouped-set persistence and regression verification
  - complete

### Stage 1C follow-up debt
- run a live app-triggered Stage `1B` -> `1C` smoke test once a manual
  diagnostic UI or internal trigger exists
- consider first-class origin columns before broader analytics/reporting:
  - `learning_items.source_origin_type`
  - `learning_items.source_parent_verification_id`
- split catalog skip reasons into uncatalogued / inactive / non-assignable when
  catalog diagnostics become important

These are not blockers for Stage `1D`.

### Known risks
- do not let new spelling work recreate route-local domain logic
- do not let legacy assignment-header debt become the new engine anchor
- do not let historical planning docs compete with the active roadmap
- do not let older Level 1–5 shorthand compete with the canonical 0–8
  mastery/evidence contract
- do not let post-Stage `1C` work blur manual diagnostics into authentic-writing
  `writing_issues`

## Stage 1B snapshot

Implemented in Stage `1B` so far:
- `1B.1` deterministic manual spelling diagnostic service under
  `lib/writing-engine/spelling`
- `ManualSpellingDiagnosticResult`
- candidate hypothesis payload using
  `sourceType = "manual_diagnostic"` and
  `sourceRef.sourceType = "manual_diagnostic"`
- diagnostic regression script
- `1B.2` verification orchestration with strict decision semantics
- verification regression script
- `1B.3` persistence through the shared `parent_verifications` contract
- persisted verification preserves original suggestion, parent decision,
  verified truth, and rejected outcomes

Strict verification semantics currently implemented:
- `accepted` cannot include verified override fields
- `overridden` requires at least one changed verified educational field
- note alone does not count as an override
- `false_positive` rejects verified override fields
- `not_a_learning_issue` rejects verified override fields

Stage `1B` remains the persisted manual-diagnostic and verification handoff
layer. Stage `1C` now bridges accepted and overridden verified outcomes into
canonical `learning_items` and `learning_item_evidence` without creating fake
`writing_issues`, without creating `learning_item_issue_links`, and without
reviving `word_progress`.

## Historical note

Detailed slice-by-slice historical sequencing belongs in:

- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)
- historical implementation records under `docs/implementation/completed/`

This file should be updated at major stage checkpoints rather than carrying the
full historical implementation narrative.
