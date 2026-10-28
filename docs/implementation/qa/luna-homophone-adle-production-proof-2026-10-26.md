# Luna Review Proof — Production ADLE lesson, 26 October 2026

## Scope and result

The owner requested a proof on another child rather than Scarlett Sanderson or Test 2. The existing synthetic child **Luna Review Proof 20260930** (`7df7f48a-db70-4d15-975f-6551d72609f2`) had one active, pending `D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE` learning item and no daily assignment or review-schedule word before generation. Its source was `contextual_skill_threshold`, created on 5 October. No other child was touched in this proof.

The ordinary parent-dashboard **Generate today's ADLE lesson** control created assignment `c4c3804c-456d-4832-81d6-47a0f540dd1a` at 12:01 UTC. The saved route was `homophone_word_lab/v2`, compiled as `adle_specialist_snapshot_compiler_v3` schema 3 with three word snapshots. This was a Homophone Word Lab selected for the child named “Luna Review Proof”; it was not an ADLE Review Writing Challenge or a Prefix lesson.

The child UI displayed four teaching pages, four Bin Sort prompts, a 45-second Balloon Pop game, three covered-word recalls, three two-gap dictated passages, and a reflection. The Bin Sort choices were correct. The timed Balloon Pop round scored **0** because the balloons floated away; the reflection explicitly referred to the meaning clues. All three covered-word recalls and all six dictated gaps were correct. The **Finish lesson** action succeeded. A fresh browser reload still showed the finished screen and the saved reflection. Screenshot: `screenshots/luna-homophone-finished-2026-10-26.png`.

Read-only Production verification found assignment `status='completed'`, one saved reflection, three correct `lesson_production` attempt events, six correct `lesson_dictation` attempt events, and an active review schedule for the learner-backed word **their**, due **27 October 2026**. The source learning item moved from `pending` to `awaiting_review_outcome` and stayed active. The other two contrast words appeared in lesson content, but no review-schedule word was created for them. This is consistent with one learner-backed target rather than treating all three contrast words as independently queued targets.

## Limits and follow-up

- The zero Balloon Pop score means this proof establishes technical generation, completion, persistence, and review scheduling. It does not establish learner mastery.
- `daily_assignments.session_completed_at` stayed null despite `status='completed'` and a durable finished UI. The same timestamp inconsistency was observed for Test 2's Base-word completion and merits a separate consistency repair.
- This proof does not resolve the Test 2 prefix capture/selection blockers. It demonstrates automatic selection of an available homophone route for a pending learner item.
- The organisation's Supabase uncached-egress usage was already above its 5 GB Free-plan allowance when this proof was run. No billing or release setting was changed.
