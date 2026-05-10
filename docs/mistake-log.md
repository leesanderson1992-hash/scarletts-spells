# Mistake Log

## 2026-05-09 — Step 3 task-manager links should not reach through optional timed backing modules without an explicit fallback boundary

### Mistake
- While converting Step 3 into a task manager, I initially built timed `Edit task` links by reaching directly through an optional timed backing module when shaping the manager view model.

### What was actually true
- Timed Step 3 still has a compatibility layer around backing modules, so the view-model boundary must make that fallback explicit instead of assuming the backing module is always present.
- The read model should carry stable editor-link truth even when the storage-backed container is derived indirectly.

### Correction
- Introduced an explicit `backingModuleId` fallback when shaping timed Step 3 manager links and used that value consistently for task editor href generation.

### Prevention rule
- When building read models on top of compatibility-backed storage:
  1. make optional storage bridges explicit in the read-model layer
  2. do not reach through optional containers inline when shaping navigation truth
  3. let TypeScript force the fallback boundary before closing the slice

## 2026-05-08 — Review queue completion must not be inferred from weak checker output

### Mistake
- While tightening the review queue move-out behavior, I briefly treated a latest submission with `0 unresolved suggestions` or no writing to analyse as effectively complete.

### What was actually true
- In this product, the spelling checker is still weak and cannot close the parent review loop by itself.
- Queue completion must remain parent-gated and only move to archive when the parent explicitly marks the latest review cycle complete.

### Correction
- Reverted the queue completion helper so only explicit parent approval produces the `completed` queue state.
- Left unresolved-suggestion count as display metadata only.

### Prevention rule
- When building queue or archive logic for parent review surfaces:
  1. keep machine-analysis results separate from parent workflow truth
  2. never let “no issues found” imply approval unless the product explicitly says it should
  3. re-check completion rules against the parent gate before shipping queue move-out behavior

## 2026-05-08 — Shared queue-thread helpers should reuse the exact exported type name, not a guessed alias

### Mistake
- While wiring the review queue page onto the new shared thread read model, I imported `ReviewQueueSubmissionThreadInput`.
- The shared helper actually exported `ReviewQueueThreadInput`.

### What was actually true
- The queue-summary page type only needed to extend the shared helper’s real exported input type.
- Guessing a nearby alias name created a typecheck failure and added noise to an otherwise small refactor.

### Correction
- Replaced the incorrect import and local extension type to use `ReviewQueueThreadInput`.

### Prevention rule
- When switching a page onto a new shared helper:
  1. copy the exported type name from the helper file directly
  2. avoid inventing “clearer” aliases unless they are intentionally defined in the shared module
  3. rerun typecheck before moving on to page-level cleanup

## 2026-05-08 — Page-level watchout rows should not pretend shared positive-evidence candidates already expose UI-only flags

### Mistake
- While implementing the Slice 6 pass 1 watchout split, I briefly referenced `candidate.isCandidate` and `candidate.isBlocked` from the shared positive-evidence candidate object inside the review page.
- Those flags only existed on the page-local `WatchoutRow` shape, not on the shared helper return type.

### What was actually true
- The shared helper already exposed the underlying truth needed by the page:
  - whether the suggestion was confirmed
  - whether a blocked reason existed
- The page should derive its own UI flags from that shared truth instead of pretending the helper returns page-only presentation fields.

### Correction
- Replaced the incorrect property reads with page-local derivation from:
  - `candidate.blockedReason === null`
  - `candidate.isConfirmed`
  - `suggestion.suggestion_status`

### Prevention rule
- When building a page-specific read model on top of a shared helper:
  1. check the shared exported type before reusing nearby page-local flag names
  2. derive presentation-only booleans in the page layer
  3. do not silently assume the shared helper already exposes UI-state aliases

## 2026-05-07 — New positive-evidence helpers should narrow their own result types instead of leaking nullable placeholders

### Mistake
- While building Slice 6B, I first wrote the positive-evidence candidate builder as a `map(...).filter(...)` pipeline with a type predicate, but the interim object shape still allowed broader unions than the exported candidate type.
- That left downstream pages treating candidates as possibly `null` even though the helper was intended to return only concrete candidates.

### What was actually true
- The helper was the right place to normalize and narrow the result.
- If the shared helper leaks nullable or over-broad candidate types, every consuming page has to compensate for typing noise that does not reflect the real runtime contract.

### Correction
- Rewrote the candidate assembly to push directly into a strongly typed `PositiveEvidenceCandidate[]`.
- Narrowed the projected evidence type and promotion level unions to the actual Slice 6B values instead of reusing the broader canonical unions.

### Prevention rule
- When adding a new shared read-model/helper type:
  1. make the helper return the final narrowed shape directly
  2. do not rely on a trailing type predicate to “clean up” a broader intermediate union
  3. keep exported unions as small as the slice truly needs

## 2026-05-07 — Narrow projection helpers should map after filtering, not pretend a broader row is already narrowed

### Mistake
- While adding Slice 6A review-helper suggestion generation, I filtered `ParentProgressWritingIssueSummaryRow | null` values with a type predicate that claimed the remaining rows already matched a smaller hand-written shape.

### What was actually true
- The non-null rows were still the broader summary-row type.
- TypeScript correctly rejected the predicate because the claimed narrowed shape was not assignable to the original parameter type.

### Correction
- Filtered only to non-null rows first, then mapped them into the smaller `{ observed_text, approved_replacement }` shape needed by the watch-profile builder.

### Prevention rule
- When a helper only needs a reduced projection from a broader typed row:
  1. filter for existence first
  2. map into the smaller shape second
- Do not use a type predicate to "jump" directly to a different structural shape.

## 2026-05-07 — Split-slice follow-through can leave stale “not implemented” bullets in the earlier slice

### Mistake
- After completing MVP Runtime Slice 2B, I updated the new Slice 2B section but initially left one stale “still intentionally not implemented” bullet inside the Slice 2A section saying parent-facing success-message refinement had not been done.

### What was actually true
- In a split slice, later follow-through work can legitimately close a gap that was previously deferred from the earlier sub-slice.
- Updating only the new sub-slice section is not enough if the earlier sub-slice still carries stale deferment bullets.

### Correction
- Removed the stale Slice 2A deferment bullet once Slice 2B completed the parent-facing message work.

### Prevention rule
- When a split slice finishes:
  1. update the new sub-slice section
  2. re-read the earlier sibling sub-slice for stale “not implemented” bullets
  3. remove or narrow any deferment that the later sub-slice has now completed

## 2026-05-07 — Slice status updates need a contradiction sweep, not just a headline update

### Mistake
- While updating the Targeted Writing Practice runtime docs for Slice 2A, I first changed the main slice status sections but left an older deferred list still claiming that learning-item grouping by micro-skill was future work.

### What was actually true
- The repo had already moved that behavior into the implemented Slice 2A runtime plan and status sections.
- A status update is not complete if older summary sections still describe the same capability as deferred.

### Correction
- Removed the stale deferred reference so the status doc now describes grouped learning-item reuse consistently.

### Prevention rule
- When marking a slice complete, do a contradiction sweep across:
  1. the slice section
  2. deferred lists
  3. current-priority summaries
  4. any “next phase” notes
- Do not treat the top-level status line as sufficient proof that documentation truth is aligned.

## 2026-05-07 — New writing-practice query helpers assumed stronger Supabase row typing than the repo currently has

### Mistake
- I added shared `lib/writing-practice/queries.ts` helpers and initially cast Supabase `select(...)` results straight to the new row types.
- I assumed the new tables would typecheck like fully generated database rows, but this repo does not yet have generated typings for those new tables.

### What was actually true
- `npx tsc --noEmit` surfaced the raw result shape as `GenericStringError[]`, so the direct casts were too optimistic for this codebase.
- The slice only needed a narrow read helper layer, not a new local database-typing system.

### Correction
- The helper returns now cast through `unknown` and stay tightly scoped to the explicit select projections used in the slice.

### Prevention rule
- Before adding shared selectors for newly created tables, check whether the repo already has generated Supabase table typings for them.
- If it does not, prefer the smallest safe type bridge instead of introducing broader typing machinery in the same slice.

## 2026-05-05 — Durable suppression schema without grants and policies is not enough

### Mistake
- I added the `writing_false_positive_suppressions` table and matching app write path, but the first migration only created the table and indexes.
- I did not carry through the same access pattern already used by the other writing-practice tables:
  - grants to `authenticated`
  - row-level security enablement
  - parent-owned access policy

### What was actually true
- In Supabase, “table exists” is not enough proof that the app can write to it.
- The reject flow could still save the rejection row while failing the suppression upsert, producing a partial-success user message.

### Correction
- Added grants, RLS enablement, and a parent-owned `for all` policy to `writing_false_positive_suppressions`.

### Prevention rule
- When adding a new parent-owned application table in this repo, verify all four together before calling the feature complete:
  1. table
  2. indexes
  3. grants
  4. RLS policies

## 2026-05-05 — Prompt-style fields need explicit inclusion to beat generic spelling heuristics

### Mistake
- I initially treated the founder-style AI prompt fields as if changing their lesson-schema flags alone would make them appear in spelling analysis.
- I did not account for the generic prompt/report exclusion heuristics in the spellcheck text extractor.

### What was actually true
- The structured lesson draft payload was carrying explicit field metadata, but the extractor was still excluding fields whose keys or labels looked like prompts unless explicit metadata could override the heuristic.

### Correction
- The spelling extractor now treats an explicit `excludeFromSpelling` boolean as the source of truth.
- `ai-prompt` and `summary-prompt` were changed to opt into spelling analysis in the relevant lesson preset.

### Prevention rule
- When a feature uses heuristic exclusion plus explicit field metadata, make the override precedence explicit in code and verify both the schema flag and the extractor behavior.

## 2026-05-05 — Returned correction UX was over-revealing the answer by default

### Mistake
- The first returned issue card implementation displayed `approved_replacement` directly to the child as the suggested answer.

### What was actually true
- That made the correction loop easier to complete, but it weakened the self-correction evidence the parent is supposed to judge in Slice 4.
- The parent-side durable issue record still needs `approved_replacement`, but the child-facing surface does not need to reveal it by default.

### Correction
- The child-facing returned issue cards now show the observed issue, context, and parent note without automatically revealing the exact corrected answer.

### Prevention rule
- For child self-correction UX, distinguish between:
  1. durable parent-side truth
  2. child-facing reveal policy
- Do not assume every parent-side correction field should be rendered directly to the child.

## 2026-05-05 — Returned-work draft metadata must survive structured autosave

### Mistake
- While wiring Slice 4A, I initially focused on attaching returned durable issue metadata during the parent return flow and creating correction attempts on child resubmission.
- I did not account for the fact that structured lesson autosave and submit rebuild `draft_payload` from the child form and can overwrite server-added returned-work metadata such as inline feedback and linked writing-issue payloads.

### What was actually true
- The returned-work bridge depends on draft payload metadata surviving across:
  - parent return
  - child autosave
  - child final resubmission
- Without explicit preservation on the server write path, the child can unknowingly erase:
  - `__field_feedback`
  - returned issue linkage payload such as `__writing_issue_feedback`

### Correction
- Server-side draft save and submission writes now merge preserved returned-work metadata from the existing draft payload instead of blindly replacing it.

### Prevention rule
- When a workflow stores server-authored metadata inside a child-edited draft payload, verify every later save/submit path preserves that metadata unless the slice explicitly intends to replace it.

## 2026-05-03 — Phase B recurring progress assumptions

### Mistake
- I initially assumed canonical timed phase boundaries already existed as persisted `course_phases` date fields and only needed to be exposed through the shared query/type path.
- I also treated the remaining month-window mismatch as if it were only a downstream consumer issue before checking the shared date helpers closely enough.

### What was actually true
- `course_phases` did not yet persist `start_date` / `end_date`, so Phase B needed:
  - a schema migration
  - central timed-phase date sync in `app/courses/actions.ts`
  - shared query/type exposure after persistence existed
- several shared and page-level helpers were still using `toISOString()` for date-only/month logic, which shaped recurring month windows in UTC rather than the user’s local day.

### Correction
- Persisted canonical phase boundary fields were added and wired into the shared selector path.
- Shared date helpers were normalized onto local date-only formatting so month-window summaries reconcile across child and parent recurring surfaces.

### Prevention rule
- For future selector/date work, verify both:
  - the actual persisted schema shape
  - the exact date-normalization strategy used in shared helpers
before assuming the remaining bug is only in a consuming page.

## 2026-05-03 — Same selector family but different window contexts

### Mistake
- I treated the remaining recurring mismatch as if all affected surfaces were already asking the shared selector for the same month window.
- I focused on canonical truth and local date normalization, but I did not verify that each surface was passing the same `referenceDate` and therefore the same month context.

### What was actually true
- The recurring surfaces are reading from the same selector family, but not all from the same window context:
  - task detail in `components/learn-week-planner.tsx` uses the clicked `dayKey`
  - monthly planner summary in `components/learn-week-planner.tsx` uses `selectedDay`
  - `My learning` uses `getDateOnly()`
  - parent `Insights` uses today's date through its timed insight summary path
- In a cross-month week, this means one surface can be showing April progress while another shows May progress, even though both are reading from the same canonical write truth.

### Correction
- For recurring QA, verify both:
  - shared selector source
  - shared window context
- A recurring summary should not be considered reconciled across surfaces until both the data source and the effective window reference are aligned.

### Prevention rule
- When debugging selector-driven summaries, check these in order:
  1. write truth
  2. selector contract
  3. boundary/reference-date context
  4. consumer rendering
- Do not assume “same selector” implies “same visible number” unless the window context is also the same.

## 2026-05-04 — Phase C “implemented” before cleanup was actually complete

### Mistake
- I treated Phase C as effectively complete once the shared goal selector and parent surfaces were wired, before closing the transitional cleanup items that still affected the architecture quality.
- In particular, I left:
  - the timed insights month alias in place
  - no parent remap flow for existing numerical goals
  - an unnecessary dashboard-local recurring month helper

### What was actually true
- The core Phase C selector rollout was in place, but the architecture was still carrying transitional pieces that weakened the “selector-first and fully maintainable” outcome.
- Existing numerical goals without mappings were still left in a practical dead-end state from the parent UI.

### Correction
- Removed the timed insights compatibility alias and switched the consumer to `recurringProgressByWindow.month`.
- Added parent remap support for existing numerical goals.
- Removed the dead dashboard-local recurring month helper and moved the monthly target-award path onto the shared recurring selector.

### Prevention rule
- For future architecture phases, do not treat “runtime works” as equivalent to “phase is complete”.
- Before marking a phase as clean, explicitly check:
  1. transitional aliases
  2. edit/remap flows for existing records
  3. dead local helpers that overlap canonical selector truth

## 2026-05-04 — Phase D policy stayed implicit longer than it should have

### Mistake
- I initially treated Phase D as if it still needed a broad implementation choice between daily, weekly, and future phase/course missed-event windows, even after the surrounding architecture had already stabilized around a weekly-only parent-warning model.

### What was actually true
- The product only needed one explicit v1 missed-event policy:
  - weekly recurring tasks only
  - previous closed Monday-Sunday week
  - no completion in that completed week = missed
- Leaving that policy implicit made the docs and selector naming looser than they needed to be.

### Correction
- The shared selector contract now encodes the weekly-only v1 policy explicitly.
- The docs now say clearly that daily, phase, and course windows are for totals and pacing only, not missed-event counts.

### Prevention rule
- When a phase is about normalizing semantics rather than adding a new feature, prefer making the current rule explicit in the shared contract before exploring broader future variants.

## 2026-05-04 — Slice 9A wizard labels and section routing must move together

### Mistake
- I initially changed the timed wizard framing and phase-first authoring flow in separate passes, which briefly left the visible step labels out of sync with the actual section-routing logic on the page.

### What was actually true
- In a structured wizard, the UX truth is carried by both:
  - the visible step labels
  - the content-step routing that decides which section renders
- Updating one without the other produces a misleading flow, even when the underlying data model changes are correct.

### Correction
- The timed wizard now maps its visible steps and rendered sections together:
  - phases
  - tasks
  - review point
  - course review
- The phase-first task flow and the backing-module compatibility helper now sit under the same routed step model.

### Prevention rule
- For future wizard/domain reconciliations, treat step labels, completion badges, and content routing as one change set.
- Do not consider a workflow moved until:
  1. the labels
  2. the rendered section mapping
  3. the server write target
all match the same product model.

## 2026-05-04 — Long JSX conditionals are easy to break during UX cleanup

### Mistake
- While refactoring the timed course wizard into clearer UX sections, I split a long conditional block into multiple `details` sections and briefly left the original JSX conditional closure in the wrong place.

### What was actually true
- The UI cleanup itself was correct in intent, but the route section was already carrying several nested conditionals and step-specific branches.
- In long server-rendered JSX files, moving one sibling section can easily leave:
  - a stale conditional close
  - an orphaned fragment
  - or an unmatched wrapper that only shows up at typecheck time

### Correction
- I rechecked the exact open/close boundaries around the timed Step 1 conditional, restored valid JSX structure, and reran typecheck before moving on to the rest of the pass.

### Prevention rule
- For future UX cleanup in large JSX workflows:
  1. isolate one conditional section at a time
  2. verify the full open/close wrapper chain immediately after that edit
  3. run typecheck before stacking more structural refactors on top

## 2026-05-04 — Product language needs to lock before step polish

### Mistake
- I treated the first Slice 9A.1 cleanup pass as mostly a presentation problem before the timed-course visible language had fully settled.

### What was actually true
- The builder flow could look cleaner and still be wrong if the parent-facing model was still described as phase-first in some places while the approved UX had already moved to cycle-first language.
- In a guided builder, labels and helper copy are part of the domain model the parent experiences, not just polish.

### Correction
- The timed parent flow now uses cycle-first language from course creation through course review.
- Course goals were kept in their own course-level step, separate from cycle setup and cycle task planning.

### Prevention rule
- Before polishing a multi-step workflow, explicitly lock:
  1. the visible product language
  2. the step order
  3. which concepts belong to each step
- Only then do the layout and interaction cleanup pass.

## 2026-05-04 — Icon-first UX still needs the full write path in the same pass

### Mistake
- I initially cleaned up Step 1’s layout before noticing that the existing server actions only fully supported creating goals and editing goal mapping, not editing the goal itself.

### What was actually true
- A table-first UI with icon-triggered edit actions is not complete unless the inline edit surface can actually save the whole record the row implies it can edit.
- Without that, the UX appears more finished than the underlying workflow really is.

### Correction
- Added a dedicated `updateCourseGoal` server action and wired the Step 1 edit icon to a real inline edit panel that updates both the goal fields and optional recurring-task mapping.

### Prevention rule
- When shifting a workflow from stacked forms to view-mode rows with icon actions, confirm the corresponding create, update, and advanced-edit write paths exist before treating the cleanup as done.

## 2026-05-04 — Optional planning overlays should not share first-read weight with structural setup

### Mistake
- I initially let the timed Step 2 cleanup keep the current mission surface at the same visual weight as the cycle map.

### What was actually true
- The focus or mission concept can still exist in the model, but the parent first needs to understand the generated cycle structure.
- Giving cycle structure and cycle focus equal prominence made the step feel like two setup workflows at once.

### Correction
- Step 2 now makes the cycle map the dominant surface and demotes current cycle focus to an optional secondary panel.

### Prevention rule
- When a step contains both:
  1. structural setup
  2. optional strategy overlays
- keep the structural setup as the first-read surface and make the overlay secondary unless product explicitly says otherwise.

## 2026-05-04 — “Summary-first” still fails when sparse header cards stay too tall

### Mistake
- I initially interpreted “summary-first” as permission to keep a large timed-builder header as long as it was mostly read-only.

### What was actually true
- The problem was not only edit density. The sparse header cards themselves were taking too much height and pushing the active step below the fold.
- Repeating timing controls and unrelated guidance in that same area made the builder feel more like a dashboard than a linear workflow.

### Correction
- The timed builder header was collapsed into a denser summary treatment with no duplicate timing editor and no checkpoint nudge in the header area.

### Prevention rule
- When compacting a workflow header, check both:
  1. whether controls are edit-hidden
  2. whether low-density summaries are physically small enough to preserve the active step in the initial viewport

## 2026-05-04 — A “shared composer” is still too heavy if the top row carries secondary fields

### Mistake
- I initially treated the Step 3 shared composer as sufficiently cleaned up once all task types used one form, even though the primary row was still carrying secondary inputs and the scheduled-task review stayed more open than the approved UX needed.

### What was actually true
- The shared-composer decision only improves the workflow if the first visible row stays limited to the primary task decision:
  - cycle
  - title
  - task type
  - add action
- Instructions, reward detail, lesson presets, and scheduled-task review all still needed stricter hierarchy and collapse rules.

### Correction
- Step 3 now moves instructions below the top row, hides minutes for now, defaults reward UI to reward on completion, minimizes lesson starter templates into chips, and collapses scheduled tasks under each cycle row with edit/delete affordances.

### Prevention rule
- For future shared-form cleanup, do not stop at “one composer”.
- Verify separately that:
  1. the top row contains only the primary decision
  2. type-specific detail is visually secondary
  3. review rows stay collapsed unless detail is actually needed

## 2026-05-04 — Field removal is not complete until empty wrappers and oversized spacing are removed too

### Mistake
- In Step 3, I removed or demoted several fields, but I left too much of the original container structure, padding, and section framing in place.
- That produced empty or weakly justified wrappers, especially in task details, recurring pace, and lesson mode.

### What was actually true
- The approved UX decisions were not just about hiding fields.
- They also required:
  - removing wrappers that no longer had meaningful content
  - collapsing heavyweight lesson authoring surfaces
  - compressing recurring controls into tighter operational rows
  - reducing padding when information density dropped

### Correction
- The next Step 3 correction pass needs to treat wrapper removal, collapsibility, and padding compression as required UX work, not optional visual polish.

### Prevention rule
- When simplifying a form:
  1. remove irrelevant fields
  2. remove any wrapper that becomes empty or weak
  3. compress spacing to match the new information density

## 2026-05-05 — A timed child leak audit must include planner surfaces, not only course/module/task pages

### Mistake
- I treated the timed child-view leakage cleanup as complete once the main timed course, module, and task pages stopped showing compatibility-module framing.

### What was actually true
- The child week planner was still rendering timed tasks with module labels pulled from shared storage, which kept a quieter version of the old module-first frame alive in a pilot-critical child surface.

### Correction
- The timed child week planner now suppresses module framing for timed tasks and uses course/cycle-facing context instead.

### Prevention rule
- When auditing child-facing product language, review all high-frequency child surfaces:
  1. course page
  2. module/task detail
  3. week planner
  4. progress/dashboard entry points
- Do not treat the main detail pages as a complete leakage audit on their own.
  4. verify that heavy authoring tools are collapsible if the step is meant to stay compact

## 2026-05-04 — An approved builder spine must remove extra internal steps, not just rename visible labels

### Mistake
- I allowed the timed builder to keep an extra internal support-work surface after the approved parent-facing spine had already been reduced to five steps.
- That left Step 4 and Step 5 offset from the product model even though the visible chips were already showing the new sequence.

### What was actually true
- Once the product spine is approved, internal content-step routing has to match it exactly.
- Keeping a hidden extra step creates follow-on drift in:
  - readiness logic
  - review content
  - adjacent helper copy
  - compatibility placement

### Correction
- The timed flow now removes the separate support-work step and keeps `Focus block` inside Step 3 task creation instead.

### Prevention rule
- When a wizard or builder step sequence changes:
  1. verify the visible step labels
  2. verify the internal routing map
  3. verify readiness rules and review content still point to the new step numbers
  4. remove any orphaned intermediate surface instead of leaving it hidden behind step offsets

## 2026-05-04 — Shared builder parity has to include the exception branch, not just the default paths

### Mistake
- I improved the main Step 3 shared creator modes, but I left the `Focus block` branch behaving like a heavier special-case mini-builder.
- I also improved Step 5 review structure without fully locking whether it was read-only or a final-order adjustment surface.

### What was actually true
- A shared creator is only safe when every branch follows the same hierarchy and density rules.
- A final review surface cannot stay half review and half editable by implication; the interaction boundary has to be named and implemented deliberately.

### Correction
- `9A.2` normalizes the `Focus block` branch into the same shared Step 3 hierarchy and makes Step 5 an explicit final-order adjustment surface before launch.

### Prevention rule
- When changing a shared builder:
  1. review every branch, especially the exception path
  2. verify shared hierarchy parity branch-by-branch, not just at the shell level
  3. make any editable review-surface boundary explicit in both docs and UI before closing the pass

## 2026-05-04 — Wizard actions must preserve scoped step state after posting

### Mistake
- I added Step 5 final-order adjustment controls that correctly perform the move action, but I wired their `redirect_path` back to the scoped course path instead of the current wizard-step path.
- That means the action succeeds and then returns the parent to the start of the builder instead of keeping them on Step 5.

### What was actually true
- In a scoped wizard flow, action success is not enough.
- Every new form action also has to preserve:
  - the active step
  - the scoped child/mode context
  - any relevant local review state

### Correction
- The next fix should keep Step 5 ordering actions on the Step 5 review surface after postback by reusing the current wizard-step redirect path rather than the base course path.

### Prevention rule
- When adding forms inside a wizard or multi-step builder:
  1. verify the action succeeds
  2. verify the redirect returns to the same step
  3. verify scoped path state is preserved
  4. treat post-action navigation as part of the feature, not as follow-up polish

## 2026-05-04 — Slice status and closure gates must be updated when a stabilization pass actually finishes

### Mistake
- After `9A.2` had effectively passed, the implementation plan still described it as implementation-in-progress with open QA findings.
- That left the plan state behind the real code and manual QA state.

### What was actually true
- In stabilization work, a stale slice status is not just a documentation detail.
- It weakens the closure gate by making it unclear whether the next slice is fixing live regressions or hardening an already-stable result.

### Correction
- `9A.2` is now marked complete, and `9A.3` records the owner map, Step 5 interaction boundary, and the formal `9A` closure gate.

### Prevention rule
- When a stabilization slice closes:
  1. update the implementation-plan status immediately
  2. remove stale open-findings language
  3. record the closure gate that was actually satisfied
  4. make the next slice start from the real state of the system, not the previous draft state

## 2026-05-04 — Docs-only stabilization slices still need a live-code acceptance review before closure

### Mistake
- I treated `9A.3` as complete once the architecture and plan documents were updated, before doing a formal self-review against the live implementation and the control-document acceptance criteria.

### What was actually true
- A documentation and architecture pass can look complete on paper while still drifting from:
  - the current owner map in code
  - the real interaction boundary in the UI
  - the exact closure conditions recorded in the implementation plan
- For stabilization slices, the acceptance review is part of the slice, not an optional follow-up.

### Correction
- Performed an explicit self-review of `9A.3` against the control docs and the live code paths, including:
  - acceptance-criterion pass/fail
  - accidental scope-creep check
  - remaining transitional fields review
  - residual page-local logic review

### Prevention rule
- When closing a docs-only stabilization slice:
  1. update the docs
  2. check the live owner map and interaction boundaries in code
  3. review the slice against its written acceptance criteria
  4. only then mark the slice complete

## 2026-05-06 — Legacy-runtime fencing slices must not be marked complete before the dependency inventory is closed

### Mistake
- During Slice `7B`, I briefly marked the slice as `Complete` after fencing the core legacy write paths and two main read surfaces.
- That was too strong because broader read-only `word_progress` and `daily_assignments` dependencies still remained across review, dashboard, insights, and assignments surfaces.

### What was actually true
- In a boundary slice, partial fencing is still partial.
- Core-path coverage is useful, but the slice is not complete until the remaining dependency inventory and labeling work matches the written slice scope.

### Correction
- I corrected the status to `Partially implemented` and recorded that the remaining legacy read surfaces are inventoried but not yet all labeled inline.

### Prevention rule
- When closing a boundary or fencing slice:
  1. inventory every remaining dependency first
  2. distinguish core-path fencing from full-slice closure
  3. only mark the slice complete when the written scope and the live inventory match

## 2026-05-07 — Canonical word collection helpers need explicit null filtering at the boundary

### Mistake
- In Slice 3, I initially built canonical assignment words by passing nullable issue replacements directly into `getCleanWords`.
- TypeScript correctly rejected that because the helper expects a `string[]`, not `(string | null)[]`.

### What was actually true
- The runtime already treats missing replacements as normal transitional data.
- The null filtering belongs exactly at the point where issue fields are converted into practice-word candidates.

### Correction
- I added explicit string filtering inside the canonical item-word builder before passing values into `getCleanWords`.

### Prevention rule
- When building practice-word lists from durable issue rows:
  1. filter nullable database fields before normalisation
  2. keep string-cleaning helpers typed narrowly
  3. let the boundary adapter handle transitional nulls explicitly

## 2026-05-07 — Shared-helper extractions need a stale-reference sweep before closure

### Mistake
- In Slice 4B, after extracting canonical practice-word logic into a shared helper, I left two stale references to the old local `WritingIssueAssignmentWordRow` type in `ensureDailyAssignment.ts`.
- TypeScript caught the mismatch immediately, but it still meant the first implementation pass was not closure-ready.

### What was actually true
- The refactor itself was correct, but helper extraction changes both imports and downstream type names.
- Finishing the extraction cleanly requires a quick stale-reference sweep after the new helper is wired in.

### Correction
- I replaced the leftover local type references with the new shared `WritingIssueAssignmentWordProjection` type and reran the checks.

### Prevention rule
- When extracting shared runtime helpers:
  1. replace the owner logic
  2. search for the old local helper/type names immediately
  3. rerun typecheck before treating the refactor as finished

## 2026-05-08 — Query-chain patching needs a syntax recheck before I move on

### Mistake
- While tightening the dashboard data fetch scope for the performance audit, I accidentally left a stray comma after a chained `.select(...)` call on the `course_modules` query.
- That broke the fluent query chain until I corrected it immediately.

### What was actually true
- The performance fix itself was correct: the dashboard should only fetch modules for the selected child’s course set.
- The error was purely in the patch syntax, not in the intended filtering logic.

### Correction
- I removed the stray comma, rechecked the query block, and reran typecheck and eslint.

### Prevention rule
- When patching fluent query chains:
  1. reread the whole chain after each edit
  2. watch for punctuation that breaks method chaining
  3. rerun checks before treating the performance fix as complete

## 2026-05-08 — Component extraction needs an immediate import sweep

### Mistake
- While extracting the Slice 11A course-creation form into its own component, I left `createCourse` imported in `app/courses/page.tsx` even though the action had moved into the new client component.
- TypeScript still passed, but eslint caught the stale unused import before closure.

### What was actually true
- The extraction itself was the right simplification: the server page became smaller and the timed-only reveal logic moved into one focused component.
- The mistake was a leftover import from the old inline form, not a flaw in the new structure.

### Correction
- I removed the stale import and reran typecheck and targeted eslint.

### Prevention rule
- When extracting a form or branch into a new component:
  1. remove the owner-side imports immediately
  2. rerun lint as well as typecheck
  3. do one quick stale-reference sweep before calling the pass finished

## 2026-05-09 — Shared course-schema fields must stay valid even when one structure hides them

### Mistake
- During Slice 11A, I hid timed-only inputs for `Progress` course creation and correctly treated `start_date` and `duration_weeks` as irrelevant for that structure.
- But I also let `createCourse` write `cycle_length_weeks = null` for `Progress`, even though the shared `courses` schema keeps that column non-null with a default operational value.

### What was actually true
- Slice 11A was supposed to preserve one shared creation path, not create a UI-only assumption that violated the shared database contract.
- Hiding a field in the UI does not mean the canonical shared record can omit it if the schema still requires a stable value.

### Correction
- I changed `createCourse` to always persist `cycle_length_weeks` with the shared default when no explicit timed value is supplied.
- I also aligned the hidden create-form fallback to submit `4` for that field so the UI and server boundary agree.

### Prevention rule
- When one structure hides shared fields:
  1. verify whether the canonical schema still requires a stable stored value
  2. keep the server-side write path authoritative for that default
  3. do not equate "not shown in UI" with "safe to persist as null"

## 2026-05-08 — Compression passes still need a stale-import sweep

### Mistake
- While compressing the phased setup surface for Slice 11B, I removed the last live use of `updateCourse` from `app/courses/[courseId]/page.tsx` but left the import behind.
- TypeScript still passed, but eslint caught the stale unused import before closure.

### What was actually true
- The Slice 11B simplification itself was correct: deleting the phased date form and extra explanatory scaffolding was the most elegant, lowest-code way to thin the setup surface.
- The regression was just an owner-file cleanup miss after deleting the final branch that referenced the action.

### Correction
- I removed the stale `updateCourse` import and reran typecheck and targeted eslint.

### Prevention rule
- When a simplification pass deletes a whole form or branch:
  1. check whether the owner file still imports the deleted branch's action/helpers
  2. rerun lint even if typecheck is green
  3. treat code deletion passes as stale-reference risks, not just extractions

## 2026-05-09 — Deletion-heavy passes can leave dead locals as well as dead imports

### Mistake
- While further compressing the phased setup surface in Slice 11B, I removed the visible planner messaging but left the `nextPlanningMove` local computed in `app/courses/[courseId]/page.tsx`.
- TypeScript still passed, but eslint caught the stale unused variable before closure.

### What was actually true
- The simplification itself was correct: the phased path did not need a separate planner narration block once the step row and counts carried the same operational truth.
- The miss was not architectural. It was a stale local left behind after deleting the UI that consumed it.

### Correction
- I removed the dead `nextPlanningMove` local and reran typecheck and targeted eslint.

### Prevention rule
- When deleting a UI block during a compression pass:
  1. search for the local values that only existed to feed that block
  2. treat dead locals the same way you treat dead imports
  3. rerun lint after every deletion-focused pass, even when typecheck is already green

## 2026-05-09 — Respect the active slice boundary before continuing deeper decomposition

### Mistake
- While working in the module/task area after `11B`, I let the implementation drift into `11C2`-style table decomposition when the requested slice had been narrowed back to `11C` only.
- That created avoidable churn: I started introducing a deeper row/view-model boundary before the user had actually asked to open the structural pass.

### What was actually true
- `11C` is about shared authoring framing and continuity:
  - module overview
  - task creation
  - task editing
- The table decomposition is valid work, but it belongs to a later explicit pass, not hidden inside `11C`.

### Correction
- I backed out the premature table-boundary extraction and kept the completed `11C` scope focused on the shared shell, shared builder context, and shared task-authoring stage framing.

### Prevention rule
- When a later slice is already planned:
  1. stop at the accepted boundary even if the next refactor is obvious
  2. do not let “while I’m here” structural work leak into the current pass
  3. if the next layer of cleanup becomes necessary, pause and confirm the slice expansion first

## 2026-05-09 — Shared creator placement should prefer event-driven state over effect-driven syncing

### Mistake
- During Slice 11C2, I first synchronized the shared Step 3 placement selects with `useEffect`-driven `setState` calls in `components/shared-task-creator-form.tsx`.
- The repo lint rules correctly flagged that as a cascading-render pattern.

### What was actually true
- The creator did need one shared placement-aware state model for:
  - placement group
  - module option
- But that state did not need effect-based synchronization.
- The cleaner boundary was to update both values directly in the placement change handler and keep the component free of set-state-in-effect logic.

### Correction
- I removed the effect-based syncing, kept the creator state local and explicit, and switched placement changes to update the dependent module choice directly in the `onChange` path.

### Prevention rule
- When a shared client form gets new dependent selects:
  1. prefer direct event-driven state transitions first
  2. treat effect-based synchronization as a smell unless it is truly coordinating with an external system
  3. run targeted eslint before closing any shared-shell change so hook-boundary regressions are caught early

## 2026-05-09 — New read-model boundaries need explicit typing early

### Mistake
- During Slice 11C2C, I initially let TypeScript infer the new module-authoring unit array from a mixed `flatMap` return.
- That weakened the new ownership boundary immediately: the compiler saw a loose union instead of a concrete `AuthoringUnitViewModel[]`.

### What was actually true
- The whole point of `11C2C` is to make the deeper-editor read model explicit.
- If the authoring-unit collection is left to broad inference, the route-to-row boundary is less trustworthy and easier to regress.

### Correction
- I replaced the inferred `flatMap` assembly with an explicitly typed `AuthoringUnitViewModel[]` builder loop.
- That made the read-model contract concrete and let the compiler verify the new ownership model properly.

### Prevention rule
- When introducing a new read-model layer:
  1. type the top-level collection explicitly at the boundary
  2. do not rely on inference for mixed discriminated-unit assembly
  3. treat compiler uncertainty in the new model as a sign the ownership seam is still too loose

## 2026-05-09 — Timed focus-block cycle derivation must come from the phase boundary, not module position

### Mistake
- During Slice 11C3, I first carried the timed focus-block `cycle_number` derivation over using the resolved module position inside the new domain action file.

### What was actually true
- Timed cycle truth belongs to the selected phase boundary, not the storage position of the backing module.
- Using module position would have made the new ownership split look cleaner while quietly weakening the domain truth.

### Correction
- I changed the new module-authoring action owner to derive timed focus-block cycle numbers from `assertPhaseBelongsToCourse(...).position + 1`.

### Prevention rule
- When extracting domain actions:
  1. preserve the original source of business truth, not just the nearest available field
  2. treat timed compatibility storage as an implementation detail unless the product rule explicitly says otherwise
  3. recheck any derived numbered field against the domain boundary before closing the extraction
