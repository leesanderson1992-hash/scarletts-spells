# ADLE Slice 7a — step-6 QA walkthrough (2026-07-08)

Local/dev only. Verifies the Slice 7a child fun session + reward loop against the
real database and the real browser session, not just fixtures.

## 1. Reward bridge — proven against the real DB (7a-C)

Invoked the real consumers (`advanceForgeForAdleTaughtWords`,
`recordAdleAuthenticUsesForRewards`) via `npx tsx` with an injected service
client against seeded rows for a labeled test parent/child:

- **Nugget → Forge:** a seeded `golden_nugget` treasure moved to `in_forge`
  (`entered_forge_at` = today); replaying the consumer forged nothing new
  (idempotent).
- **Golden Bar at threshold:** a treasure at 4/5 uses + one parent-verified ADLE
  authentic use (`piece_ref = ws:{sample}`) → `golden_bar` awarded once,
  `golden_bar_at` = today; replay recorded nothing; the count stayed at 5.
- **Cross-path no-double-count:** free-writing counted a writing sample, then
  ADLE observed the same sample → counted **once** (stayed at 1, not 2).

## 2. Full lesson walkthrough — real forms → real actions → real forge (3-ii + 7a-C + 7a-D)

Seeded a composable homophone lesson (`ensureAdleDailyPlan` composed it: review
words baby/back; lesson words a/act/air/are/as) with a `golden_nugget` on "a",
logged the browser in as the child, and drove the UI:

- **Part 1 (review):** the warm quick-sort prompt rendered; filled sentence-
  context homophones → "All words correct — brilliant." → submitted
  (`completeAdleReviewPartAction`) → Part 2 unlocked.
- **Part 2 (lesson):** the intro showed enriched display-word previews with
  provenance badges; guided steps rendered as warm prompt shells; filled the 5
  controlled-spelling + 5 dictation inputs → submitted (`completeAdleLessonPartAction`).
- **Completion:** the full-page celebration rendered **"Into the Workshop! … → a"**.
- **DB cross-check:** treasure "a" `golden_nugget → in_forge`, `entered_forge_at`
  = today, `source_learning_item_id` = null, `entered_forge` event logged.
- A separate seed (treasure with `golden_bar_at` = today) confirmed the **Golden
  Bar ceremony** renders on the completed screen, and that a word barred today
  appears only in the ceremony, not the forge list (bar-supersedes-forge).

## 3. Defect found and fixed (live-only)

The first lesson walkthrough completed but showed the fail-soft celebration.
Server log: a foreign-key violation — the forge wiring passed the **ADLE**
learning-item id into `child_word_treasures.source_learning_item_id`, whose FK
references the **legacy `learning_items`** table (ADLE items live in
`adle_learning_items`). Neither the pure regression nor the direct-consumer QA
caught it (both passed `learningItemId: null`); only the live walkthrough did.

**Fix (commit `c810a6f`):** dropped `learningItemId` from the bridge's forge
input so ADLE never writes the legacy FK. Re-drove the walkthrough → forge +
celebration correct.

## Result

All Slice 7a paths verified live. 14 `adle:*` suites green; app `tsc` + lint
clean; `lib/adle` imports no reward code (boundary intact). Test data (parent
`adle-7a-qa@scarlettsspells.test`) is disposable QA seed; the QA scripts were
temporary and not committed.
