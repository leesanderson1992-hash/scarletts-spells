# ADLE R6 review workload and lesson throttle repair plan

Status: implementation plan and acceptance criteria; release evidence is recorded separately.
Date: 2026-10-14

## Decision and scope

An R6 day permits a specialist or generic lesson only when the **uncapped number of reviews due at the start of that day's Review session** is at most the governed session cap. The Review session still presents at most the cap, oldest first. Persist the start-of-session workload decision with the Review assignment and consume that frozen decision after Review finalisation. Use the same per-word scheduling authority that selected the Review targets. Preserve bundle-backed scheduling for paths that still require it; this repair changes the R6 lesson gate, not the scheduler's transition policy or lesson selection order.

The current Review selector reads hydrated per-word v1 and v2 schedules through `selectDueMixedReviewWords` in `lib/adle/review-v3/r6-generation.ts`. The R6 lesson gate instead calls the bundle-backed `throttlePredicate` through `lib/adle/review-v3/r6-specialist-eligibility.ts`. `lib/adle/loaders/composer-facts-loader.ts` does not load `word_next_due_on` into its legacy schedule facts, so that gate cannot represent the per-word due state. R5/R6 transitions advance per-word dates without synchronising old bundle dates, as documented in `docs/implementation/adle-review-r5-legacy-scheduler-compatibility.md`.

A read-only Production reconciliation on 14 October showed the consequence: the frozen Review assignment selected ten due words, three other per-word reviews were still due, and the bundle-backed gate counted 34. Thirteen due at session start correctly made that day review only. After completion the per-word count fell to three, while the bundle count remained 34. A repair that merely recounts per-word reviews after completion would wrongly allow a lesson on that thirteen-word day.

## Required behaviour

1. Compute the **uncapped** due cohort from the exact mixed per-word v1/v2 authority used to select the capped Review targets. Include scheduled reviews, catch-up retests, pre-retirement checks, and target-policy next-day recovery when their governed due date has arrived. Preserve the selector's policy-pin, hydration, and row-status checks. Do not count `ejected_pending_reteach` as a scheduled review.
2. Freeze the assignment date, due count, cap, resulting `lessonAllowed` decision, due schedule-word IDs or a verifiable cohort fingerprint, and the authority version at Review assignment creation. A count of exactly the cap allows a lesson; cap plus one blocks it.
3. Persist this record atomically with the Review assignment under the existing child/date advisory lock and idempotency rules. A reused incomplete assignment must return its original decision. Neither Review outcomes nor later schedule changes may rewrite it.
4. After Review finalisation, `ensureSpecialistStageR6` reads the frozen decision for that assignment. It must not call the bundle-backed throttle or recompute the decision from the now-advanced schedule. When the decision blocks teaching, complete the Review-only session through the existing idempotent RPC. Otherwise continue normal skill selection and route readiness checks.
5. Keep the legacy `review-due-queue.ts` and bundle-backed composer paths in place until a separate dependency audit authorises their migration. Do not change per-word intervals, original outcomes, rewards, or the pending learning-item queue in this repair.

## Implementation sequence

### 1. Shared mixed-schedule workload calculation

Extract the due-cohort calculation behind `selectDueMixedReviewWords` so the R6 generator obtains both the uncapped cohort and its first `sessionCap` targets from one hydrated input and one deterministic ordering. Avoid calculating the count by summing bundles or by calling the capped selector with a magic large cap. Give the calculation an explicit authority/version identifier and return a diagnostic count by due kind for audit. Fail closed on unknown schedule versions or failed target-row hydration.

### 2. Immutable assignment workload record

Add an additive, assignment-scoped persistence field or table for the frozen workload. Prefer a typed record keyed by `daily_assignment_id` with `assignment_date`, `due_count_at_start`, `session_cap_at_start`, `lesson_allowed_at_start`, `authority_version`, and a digest or ordered IDs for the uncapped due cohort. The persistence RPC for both current-policy R6 and mixed-policy C2B6 assignments must write it in the same transaction as the Review snapshot and orchestration row. Validate child/date scope, count versus cohort, cap, selected targets as the first capped cohort, and retry equality. Restrict later updates and expose only the fields needed by the specialist gate.

### 3. R6 specialist gate

Replace `isReviewOnlyR6Day(facts, date)` in the R6 path with a reader of the persisted assignment workload. Read it before loading lesson facts; return an explicit blocked state if the workload record is missing or inconsistent. Continue to use `loadDailyPlanFacts` for learning items and lesson selection after the frozen gate permits teaching. Keep `complete_adle_review_only_session_r6` idempotent. Do not make a Review-only result appear to be a generation error.

### 4. Existing sessions and release transition

Before switching the consumer, audit open R6 Review assignments. Backfill a frozen workload only while the Review is still open and its per-word schedules retain their pre-finalisation state; validate the frozen selected targets against the recomputed capped prefix. Do this under the same child/date lock. For an assignment already finalised without a workload record, do not infer the start count from current due dates or old bundles: hold specialist generation for a bounded manual reconciliation. Do not reopen completed Review-only sessions or create retrospective lessons. Make the read path understand any previously persisted snapshot version during the transition, then require the new workload record for newly created assignments.

### 5. Documentation and visibility

Clarify the current runtime note in `docs/contracts/adle-daily-assignment-composer-contract.md`: R6 Review selects and freezes its own per-word workload, and the post-Review lesson gate consumes that snapshot. Update `docs/implementation/adle-current-state-and-release-registry.md` and the R5 compatibility receipt to record the repaired boundary. This preserves the existing throttle policy; it does not introduce a new interval or lesson-selection policy version. Add structured, non-learner-text diagnostics showing the frozen due count, cap, authority version, decision, and whether a Review-only completion followed it.

## Verification and acceptance

- Unit fixtures cover mixed v1/v2 schedules and every due kind; zero, cap-minus-one, cap, and cap-plus-one counts; old bundle dates that disagree with per-word dates; and an ejected word without a review date.
- Persistence regressions cover atomic creation for both R6 persistence RPCs, duplicate requests, concurrent generation, mismatched cohort/target prefix, missing hydration, and immutable replay of the original decision.
- End-to-end session regressions cover: thirteen due at start with ten reviewed and three left due (Review only); ten due at start with all ten reviewed (lesson allowed); and ten due at start followed by a newly due word or another schedule transition (the frozen decision still governs that assignment). Review finalisation retries must not append duplicate lessons or rewrite the workload.
- A staging proof uses a disposable child and both current-policy and target-policy schedule rows. Check the Review snapshot, frozen workload, post-finalisation orchestration, lesson append or Review-only result, reload, and retry. No authentic learner spelling evidence is used in the fixture.
- Before Production release, run a read-only reconciliation of all active R6 children: compare new per-word uncapped counts with the legacy bundle counts and enumerate open assignments requiring transition handling. After release, verify a controlled session at exactly the cap can reach a lesson, while one above the cap remains Review only. Confirm no unexpected schedule, outcome, reward, or completed-assignment writes.
- Run the focused Review R6, mixed-policy scheduler, persistence, and lesson-route regressions; typecheck; and `npm run adle:authority-docs-check`. Record a release receipt with the exact deployed commit, migration, fixture results, and read-only Production counts.

## Completion criteria

The Review targets and lesson throttle use one per-word due cohort frozen before the session. Every new R6 assignment has a validated immutable workload record. Existing open assignments either have a verified pre-finalisation backfill or stop with an explicit reconciliation blocker. Bundle date drift cannot suppress a lesson when the frozen per-word count is at or below the cap, and review outcomes cannot make an over-cap day appear lesson eligible after the fact.
