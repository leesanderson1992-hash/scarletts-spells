# Dynamic Suffix `-ment` staging runtime proof — 2026-07-27

## Scope

This proof covers only `D4_MOR_SUFFIXES_MENT` in staging. The profile remains
production-disabled. No production database, gate, environment variable, or
deployment changed.

## Reviewed content and import

- The reviewed package contains exactly `enjoyment`, `payment`, `agreement`,
  and `movement`.
- The package SHA-256 is
  `4e60dc19c4f975dcf6562c3ce41a62b2fd4c633d11f16c700a8e3dcbcd2b94f6`.
- Staging contains one active, approved four-member profile with
  `production_enabled = false`.
- The opening page displays
  `Add -ment to a word to turn an action into a thing, process or result.`
  exactly once, explains `m-e-n-t`, and retains the final `e` in
  `agreement` and `movement`.

## Runtime evidence

- Final Preview deployment:
  `dpl_3hLCAMf4oYwtyBMxN9tcBGcdZ49W`
  (`https://scarletts-spells-e70dz4mn4-leesanderson1992-hashs-projects.vercel.app`).
- Disposable assignment `7bdc4bc7-0dfa-43b7-995f-c64df529a55e`
  completed all 16 immutable items.
- The evidence ledger contains exactly 14 attempts: six guided, four
  controlled-spelling, and four reviewed full-sentence dictation events.
- Capitalised `Enjoyment` was accepted as correct while the original raw
  attempt remained in evidence.
- The lesson saved one `ment-base-preservation-v1` reflection, four active
  taught-word-history rows, and four active next-review schedules.
- Introduction, all four discovery comparisons, two suffix cleavers, varied
  deterministic build choices, controlled spelling, all four dictations,
  reflection, a mid-lesson reload/resume, completion, and completed-state
  reload passed in the real child route.
- No meaning-sort or fallback prefix cards appeared.

## Defects found and corrected during proof

- Resume hydration now uses a task-timed restore and no longer stalls in a
  background browser tab.
- Cleaver progression now says `Try another split`, then `Build a word`.
- Fully correct dictation now says `Your sentence matches.` instead of telling
  the child to retry a highlighted word.
- Dynamic suffix completion now teaches and schedules all four selected suffix
  words; the Dynamic Prefix transfer-scheduling rule remains unchanged.
- The reusable verifier reads the micro-skill from assignment-item metadata,
  matching the deployed schema.

## Cleanup and release decision

The disposable child, auth user, learning item, assignment, attempts,
reflection, taught history, review schedules, and related fixture-owned rows
were removed. The cleanup verifier found zero residual fixture rows.

`D4_MOR_SUFFIXES_MENT` is therefore `staging_approved`. Production remains
disabled and requires separate written approval, production import, profile
activation, gate verification, deployment, and a production receipt.
