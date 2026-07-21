# Staging ledger exception — base-word-family disposable proof

Date: 2026-07-19  
Project: `jlhotktspjvffslvuyfz` (staging only)

## Evidence

The staging project intentionally contains a sparse teaching-dictionary data
set (16 active words). The local migration ledger therefore cannot be made
globally identical to the repository by blindly applying or repairing every
missing row.

- `20260707120000_fix_teaching_dictionary_display_word_data_quality` is not
  applicable: its own invariant requires 873 active words and would fail on
  this sparse staging data set.
- `20260717153000_add_idempotent_course_task_submission` is unrelated to the
  base-word-family proof and its schema is absent. It remains pending for its
  owning course-release work.
- `20260717120000_add_adle_word_lab_atomic_completion_rpc` is eligible for a
  ledger-only repair only after its function signature is confirmed present.
- The legacy no-op `20260421` compatibility migration remains outside this
  proof's scope; it is not evidence that a historical migration should be
  replayed.

## Approved scoped action

For this disposable staging proof only:

1. repair the ledger entry for the verified, already-present `un-` completion
   RPC;
2. apply the two unique forward base-word migrations individually;
3. record their ledger entries only after each SQL file succeeds;
4. verify the added column and guarded RPC contracts before any fixture write.

This is not a full historical ledger repair, a `supabase db push`, or a
production release procedure.
