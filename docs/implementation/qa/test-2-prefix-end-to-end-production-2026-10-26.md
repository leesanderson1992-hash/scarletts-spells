# Test 2 prefix writing to ADLE production proof — 26 October 2026

## Result

**The prefix end-to-end proof did not pass.** The normal ADLE generator produced a valid Base-word Family Pilot lesson, but the newly submitted prefix work did not produce a selectable prefix target or a Prefix Word Lab lesson. No dictionary, relationship, approval, route-release, or existing queue status was changed for the test.

## Actions and observed evidence

1. In the Production parent UI, saved a manual writing sample for Test 2 (`2498bb47-0b09-47c9-bfc1-18f95b52d35c`): “It was unnfair when the game ended early, and I felt unnhappy about the result.” Writing sample `e038d632-bfad-405e-a475-5342f3464980`, created at 07:47 UTC. [Review Work sample](https://scarletts-spells.vercel.app/courses/review/sample_e038d632-bfad-405e-a475-5342f3464980?child=2498bb47-0b09-47c9-bfc1-18f95b52d35c).
2. The writing analysis persisted one `misspelling_instances` row: `unnhappy → unhappy`, detected by the heuristic. It did not persist `unnfair → unfair`. The Review Work page displayed one candidate and “Candidate capture is blocked until assignable spelling micro-skills are available.” Production `micro_skill_catalog` nevertheless reports `D4_MOR_PREFIXES_UN` active and assignable.
3. A normal parent-authored attempt to add the missed `unnfair → unfair` issue returned “We couldn't save that manual writing issue just yet.” One accepted `writing_issue_suggestions` row (`713bba9a-aab7-4a51-9387-749f1c005509`) was created with `suggested_micro_skill_key='unknown'`; no `writing_issues` row was created. The form in `manual-sample-sections.tsx` does not send `micro_skill_key`; `normaliseMicroSkillKey()` in `manual-sample-actions.ts` substitutes `unknown`. The exact database rejection behind the issue insert still needs capture; this is a likely contributing cause, not a proven trigger diagnosis.
4. Both exact canonical mappings exist with `mapping_status='active'` and `resolver_visibility_status='visible'`. Neither has `metadata.automatic_detection_eligibility='token_safe'`. The Production `find_resolver_visible_token_safe_canonical_mappings_scoped(...)` function returned no rows for the two tokens. The visible mapping status alone therefore does not authorize automatic token detection. This is a deliberate gate; it should not be bypassed simply for the proof.
5. The Prefix Word Lab child page reported “not ready for this learner”. Test 2's existing `unfair` and `unhappy` `adle_learning_items` both have `item_status='awaiting_review_outcome'`. `selectableLearningItems()` accepts only `pending` and `pending_reteach`; the new manual sample created no new learning item.
6. Clicked **Generate today’s ADLE lesson** once from the Test 2 parent dashboard. Production created daily assignment `31db51a4-cd2e-49b3-a44f-cad359d7ac14` at 07:52 UTC on 26 October, title `ADLE Base-word Family Pilot`, status `pending`. The learner UI opened its Base-word teaching page. [Generated ADLE lesson](https://scarletts-spells.vercel.app/learn/week/adle?child=2498bb47-0b09-47c9-bfc1-18f95b52d35c&mode=child). Screenshot: `screenshots/test-2-adle-base-word-2026-10-26.png`.
7. A final read-only Production check still found only the one detected sample misspelling, no durable issue from this sample, and the two prefix items unchanged as `awaiting_review_outcome`.

## What must change before this can count as a passing proof

- Provide a functioning parent review route for manual sample misses, including a real, active micro-skill choice and an atomic save of suggestion plus durable issue; show the database error when persistence fails.
- Show candidate spelling pairs even when catalogue options fail to load, with a specific failure reason; avoid a misleading blanket “no assignable micro-skills” message.
- Preserve the editorial gate on canonical token-safe detection. Either approve suitable exact pairs through that review process or require explicit parent verification of missed tokens.
- Progress the test child's existing `awaiting_review_outcome` words only through the normal review outcome, or use freshly verified, selectable prefix words. Then rerun the prefix selector and confirm an immutable `dynamic_prefix_word_lab/v2` snapshot with the expected authentic targets and approved transfers.
- Confirm the ordinary parent generator's competing Base-word and review precedence when assessing which route wins; a ready prefix pool need not be the day's selected lesson.

No performance savings or prefix selection success is inferred from this failed proof.

## Follow-up: Base Word completion attempt at 08:09 UTC

The owner asked to finish the generated lesson. In the Test 2 learner UI, all teaching pages, family reveals, splits, eight word sums, six covered-word recalls, six dictated sentences and the final reflection were completed. The dictated sentences and word recalls matched the immutable assignment snapshot. Clicking **Finish Word Lab** produced a server error (digest `621921959`). Production Vercel logs show:

> `persistBaseWordFamilyPilotCompletion: Generated Base Word family-practice words cannot enter learner review scheduling`

The first atomic completion rolled back: assignment `31db51a4-cd2e-49b3-a44f-cad359d7ac14` remained `pending`; both prefix queue items remained `active` and `awaiting_review_outcome`.

The saved V2 assignment has `assignment_items.metadata.adleLearningItemRef` for its two authentic targets and null for its four generated family-practice words. The historical V1 completion RPC checks `metadata.learningItemId`, a field absent from these V2 items. This is the confirmed source of the false rejection. A narrow forward migration at `supabase/migrations/20261026081500_accept_base_word_learning_item_ref_at_completion.sql` accepts either field for an exact lesson-production word and leaves generated practice excluded. A read-only preflight confirmed its predecessor text occurs once in the live function and the saved assignment's two targets carry the new field.

The Production migration ledger ended at `20261025200000` before release. The new migration has a unique later version. The Base Word completion-boundary, pilot-contract and session-routing regressions passed locally. The SQL compiled on the local Production-shaped database in a rollback transaction; the Supabase CLI then applied it there and recorded one ledger row. A local synthetic predicate check accepted the V2 learner-backed production word and excluded generated and dictation items. Supabase preview branching was unavailable because this account's Free plan requires an upgrade, so no hosted preview branch was created. The browser error screenshot is `screenshots/test-2-base-word-finish-error-2026-10-26.png`.

## Follow-up: migration release and successful completion

With the owner's instruction to proceed, the Supabase CLI applied only migration `20261026081500` to Production after an explicit 259-version ledger check and exact-function predecessor check. The Production ledger contains one row for that version, and the live completion function contains the V2 reference guard. No Vercel code deployment was made. Commit `6dec4c29d9bb9f98259b40013587f93b873bca92` records the migration and regression on `main`.

The saved Test 2 lesson reopened at its final reflection. The **Finish Word Lab** retry succeeded in the child UI: “You finished today's spelling!” The assignment is `completed`; one reflection and 18 attempt events were stored. The two authentic Base-word targets are now `awaiting_review_outcome` with an active two-word review bundle due **27 October 2026**. The four generated family-practice words did not enter that learner review bundle. The two prefix learning items remain active and `awaiting_review_outcome`; the prefix route was not selected or proved by this Base-word completion. Screenshot: `screenshots/test-2-base-word-finished-2026-10-26.png`.

`daily_assignments.session_completed_at` is still null after the successful RPC even though `status='completed'` and the learner UI shows completion. That timestamp consistency should be investigated separately; it did not prevent the current completion or review scheduling.
