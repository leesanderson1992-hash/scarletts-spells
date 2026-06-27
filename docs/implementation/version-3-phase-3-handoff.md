# Phase 3 New-Chat Handoff

## Copy Into New Chat

We are starting Scarlett's Spells Version 3.0 Phase 3: Word Treasure end to end.

Start from current `main`. Phase 2 has been implemented, QA-audited, committed,
and pushed to `origin/main` through:

- `8e84044 docs: close phase 2 QA`
- `cfa6120 Simplify returned retry cards`
- `2110284 Implement phase 2 completion follow-up`
- `a38cb45 docs: document phase 2 completion follow-up`
- `88d356f Show returned submission celebration modal`
- `1690831 Add returned correction celebration`

The expected starting state is a clean `main` matching `origin/main`. Confirm with
`git status --short --branch` before making Phase 3 changes. Do not push Phase 3
work unless explicitly requested.

Read first:
- `docs/implementation/version-3-roadmap.md`
- `docs/contracts/reward-system-contract.md`
- `docs/contracts/writing-engine-mastery-and-evidence-contract.md`
- `docs/contracts/targeted-writing-practice-contract.md`
- `docs/support/reward-source-of-truth-definitions.md`

Phase 3 must begin with a docs-only commit, then proceed in small numbered
implementation slices: `3.0`, `3.1`, `3.2`, etc. Keep each slice independently
testable and commit after each accepted slice.

## Phase 2 Carry-Forward Notes

- Phase 2 completion and retry UX is implemented and QA-audited.
- Phase 2 Golden Nugget popup rows are read-model/estimate display only; they
  are not durable My Progress state yet.
- Residual risk: legacy returned-correction evidence metadata may classify a
  non-empty typed retry attempt optimistically through `marked_fixed` and
  `corrected_independently`. Phase 3 or a small hardening slice should align
  those fields with the approved-replacement comparison before durable Word
  Treasure evidence is introduced.

## 3.0 Docs-Only Roadmap Update

- Expand Phase 3 in `docs/implementation/version-3-roadmap.md`.
- Document that Phase 3 now covers the Word Treasure lifecycle end to end:
  - parent-approved Golden Nugget creation
  - estimated child popup rewards before approval
  - Daily Assignment attempt moves Nugget into forge/workshop
  - 5 qualifying free-writing lesson uses earn a Gold Bar
  - My Progress reads canonical Word Treasure state
  - old reward tables remain compatibility only
- Clarify that this pulls the necessary Golden Bar evidence work forward from
  later roadmap phases.
- Include the Phase 2 residual evidence-risk hardening decision in the Phase 3
  sequencing.
- No runtime code changes.
- Check: `git diff --check`.
- Commit: `docs: expand phase 3 word treasure scope`.

## 3.1 Canonical Storage Foundation

- Add migrations for canonical Word Treasure storage:
  - `child_word_treasures`
  - `child_word_treasure_events`
- Do not remove or rename `spelling_reward_states` or
  `spelling_reward_events`.
- Do not switch UI reads yet.
- Use canonical statuses: `golden_nugget`, `in_forge`, `golden_bar`, with
  legacy "Warm Workshop" only as optional transitional display copy.
- Add schema/types/read helpers where needed.
- Tests: migration/schema checks and targeted type checks.
- Commit: `add word treasure storage foundation`.

## 3.2 Parent Approval Creates Durable Nuggets

- On parent final classification of a genuine learning need, create or update
  `child_word_treasures`.
- Record lifecycle event in `child_word_treasure_events`.
- Link source issue/submission/learning item where available.
- Child correction submission remains non-durable until parent approval.
- Align returned-correction evidence metadata so wrong retry attempts are not
  over-credited as fixed/independent before they can influence durable Word
  Treasure state.
- Tests:
  - approved genuine issue creates Nugget
  - unapproved retry does not create durable Nugget
  - non-issue classifications do not create Nugget
  - non-matching retry attempts are not recorded as fixed/independent evidence
- Commit: `create word treasures from parent approval`.

## 3.3 My Progress Canonical Read Model

- Update My Progress to read Word Treasure counts/history from
  `child_word_treasures`.
- Keep fallback to `spelling_reward_states` during compatibility bridge.
- Do not delete old compatibility reads yet.
- Tests:
  - canonical Nugget appears on My Progress
  - old compatibility rows still display during bridge
  - duplicate display is avoided
- Commit: `read word treasures on child progress`.

## 3.4 Child Popup Reward Language

- Update child completion popup semantics:
  - pending parent review shows estimated Nuggets/Coins as possible after
    approval
  - durable Nuggets are not shown as already earned before approval
  - actual Gold Bar rows only show when a Gold Bar is newly earned
- Preserve Phase 2 full-page overlay behavior.
- Tests:
  - returned resubmission shows estimates only
  - approval-dependent rewards are not persisted from child retry
  - copy avoids shame/failure wording
- Commit: `clarify estimated word treasure rewards`.

## 3.5 Daily Assignment Moves Nuggets Into Forge

- When a Golden Nugget word appears in a Daily Assignment and the child
  attempts/submits that item, move the treasure to `in_forge`.
- Do not implement new ADLE scheduling.
- Do not move the word merely because it was assigned; require child
  engagement.
- Tests:
  - assignment attempt moves `golden_nugget` to `in_forge`
  - assignment visibility alone does not move it
  - repeated attempts do not duplicate events
- Commit: `move word treasures into forge from daily practice`.

## 3.6 Free-Writing Evidence and Gold Bars

- On lesson submission only, scan authentic/original free-writing responses for
  corrected Word Treasure words.
- Count only uses after `entered_forge_at`.
- Exclude returned corrections, spelling retries, daily practice, copied text,
  controlled drills, and the original mistake-producing submission.
- Record each qualifying use as an event and increment the treasure evidence
  count.
- Award `golden_bar` at 5 qualifying uses.
- Show newly earned Gold Bars on the child submission popup.
- Tests:
  - 5 qualifying lesson uses award one Gold Bar
  - fewer than 5 do not
  - non-lesson or retry uses do not count
  - duplicate counting from the same submission is prevented
- Commit: `award gold bars from free writing evidence`.

## 3.7 End-To-End Signoff

- Add or run an E2E smoke path:
  - parent returns misspelling
  - child submits correction
  - parent approves/finalises
  - Nugget appears on My Progress
  - Daily Assignment attempt moves it into forge/workshop
  - five later lesson uses award Gold Bar
  - popup and My Progress reflect the result
- Run targeted lint/type/regression checks.
- Document any manual browser verification.
- Commit: `verify phase 3 word treasure lifecycle`.

## Boundaries

- Do not remove old reward tables in Phase 3.
- Do not redesign Gold Coin economy.
- Do not infer micro-skill mastery from Golden Bars.
- Do not mint Golden Bars from same-session correction work.
- Do not use `learning_items.progress_state` as instructional or reward state.
- Do not implement ADLE scheduling.
