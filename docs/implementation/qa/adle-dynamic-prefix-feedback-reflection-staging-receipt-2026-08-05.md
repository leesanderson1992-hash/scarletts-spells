# Dynamic Prefix feedback and evidence staging receipt — 2026-08-05

## Scope and identity

- Repository baseline: `b2f25b2c821d8e9dfedcb12c1f5ea1252e067ce6`.
- Implementation commit deployed: `053633b8f92ff031420ce46e2ffc1c526f9707df`.
- Vercel project: `scarletts-spells-staged` (`prj_oJkffstOtacc4juYloXajHpjJUha`).
- Pinned Preview: `dpl_5qfVDqnTpLVXB4jd7Exd1Qix5k5E`, Ready.
- Supabase project ref: `jlhotktspjvffslvuyfz`.
- Production project and Supabase identities were explicitly rejected before writes.
- The Preview was a local CLI deployment of the clean implementation commit tree;
  Vercel did not attach Git-source metadata to that upload.

Production remained read-only. Dynamic Prefix remained
`shared_authoritative`; canonical intake remained enabled and its five-minute
scheduler healthy; Dynamic Affix remained paused.

## Normal-writer fixture

- Disposable assignment: `8182acbe-1628-4d0a-9739-e43cf44a5ddd`.
- Date: `2026-08-05`.
- Route: `dynamic_prefix_word_lab` V2.
- Payload: `dynamic_prefix_lesson_v2`, version 2.
- Profile: `D4_MOR_PREFIXES_SUB_INTER_SUPER`.
- Item count: 18, positions 1–18 unique, all completed.
- Authentic words: `international`, `superhero`, `subway`.
- Transfer word: `interact`.
- Compiler authority: shared-authoritative normal QA writer; no legacy compiler path.

The staging launcher, loader, selector, shared compiler decision, assignment
plan, writer and persistence created the assignment. No payload was hand-built.

## Interaction result

The deliberate Cleaver miss displayed exactly:

```text
Look for the prefix at the start of the word.
Use today’s prefix cards to help.
Try again.
```

It did not disclose `un-`, another profile prefix, the target prefix or the
correct split. Correct retry advanced normally.

The first Dictation retained a correct target and one neutral non-target
substitution in the existing full-sentence attempt. Target correctness stayed
true. Reflection displayed the context slip separately, did not label it a
target error, retained the Prefix teaching cards and questions, and restored
the same derived slip and neutral typed response after reload without
duplication.

## Durable completion and evidence

Completion produced 16 attempt events: eight guided, four controlled Cover
Check productions and four Dictations. Every word has one Cover Check and one
Dictation attempt. All four target outcomes are correct. Reloading the completed
route left counts unchanged at 16 attempts, four taught rows, three schedules
and one Reflection.

| Word | Role | Cover | Dictation | Taught | Priced evidence | State | Learning item | Bundle/schedule |
|---|---|---:|---:|---:|---:|---|---|---|
| `international` | authentic | 1 correct | 1 correct | 1 | `0.75` | active | transitioned | yes / yes |
| `superhero` | authentic | 1 correct | 1 correct | 1 | `0.75` | active | transitioned | yes / yes |
| `subway` | authentic | 1 correct | 1 correct | 1 | `0.75` | active | transitioned | yes / yes |
| `interact` | transfer | 1 correct | 1 correct | 1 | `0.75` | active | none | none / none |

Pricing used `evidence_policy_v1_2026-07-04`. Each word has one
`lesson_production` entry; the same-session Cover and Dictation successes do
not stack. There were four evidence-bearing words, three schedule-bearing
words, zero transfer learning items and zero duplicate evidence entries.

`interact` has active Level 3 banding and therefore has `0.1` potential breadth
credit in the active state. Its only support mapping for this microskill is
currently `in_review`, so actual proficiency breadth remains correctly
withheld by the governed eligibility gate. Evidence capture is independent of
that gate and of scheduling.

The non-target sentence slip created no learning item, evidence deduction,
target failure, schedule or reward event. The disposable child had no treasure
events. Authentic reward behavior remained on its established schedule-coupled
path; the transfer word emitted no schedule-coupled reward.

## Visual and mobile evidence

The [four-image index](adle-dynamic-prefix-feedback-reflection-2026-08-05/adle-dynamic-prefix-feedback-reflection-2026-08-05.md)
contains the Cleaver, Dictation, Reflection and redacted competency proof. The
deterministic interaction suite passed the mobile `390 × 844` touch project;
no mobile-specific overflow finding was observed.

## Validation

Passed:

- `npm run adle:dynamic-prefix-feedback-reflection-regression`
- `npm run adle:dynamic-prefix-pedagogy-regression`
- `npm run adle:dynamic-prefix-shared-authority-regression`
- `npm run adle:dynamic-prefix-qa-regression`
- `npm run adle:shared-affix-compiler-regression`
- `npm run adle:shared-affix-production-parity-regression`
- `npm run adle:route-resolution-regression`
- `npm run adle:persisted-route-metadata-regression`
- `npm run adle:composer-payload-regression`
- `npm run adle:composer-persistence-regression`
- `npm run adle:attempt-capture-regression`
- `npm run adle:evidence-regression`
- `npm run adle:proficiency-regression`
- `npm run adle:word-lab-completion-contract-regression`
- `npm run adle:review-scheduler-regression`
- `npm run adle:reward-bridge-regression`
- `npm run adle:generic-snapshot-contract-regression`
- `npm run adle:generic-snapshot-reader-regression`
- `npm run adle:cover-shutter-interaction-regression` (three applicable tests passed; three cross-project cases skipped by design)
- `npm run adle:semantic-production-baseline` (31 regressions)
- `npx tsc --noEmit`
- `npm run typecheck:scripts`
- `npm run build`
- changed-file ESLint.

Full `npm run lint` remains blocked only by the unchanged pre-existing
`scripts/adle-daily-plan-compatibility-live-proof.ts:10:34` wrapper use of
`any`. The changed-file lint set is green; this excluded Generic Snapshot
wrapper was not modified.

Architecture generation/drift and documentation regression were rerun after
this receipt and recorded in the closeout commit.

## Guarded cleanup

Before deletion, the exact owned fixture contained one child, one assignment,
18 items, 16 attempts, one Reflection, three learning items, four taught rows,
one bundle, three schedules and zero reward events. The tagged disposable child
was then deleted through the staging service boundary. Exact post-cleanup
queries returned zero for every recorded child and assignment scope. No prior
QA child, retained assignment or unrelated staging row was removed. Temporary
environment files were also removed.

## Publication boundary

`CONTROLLED_END_TO_END_PREFIX_TRIGGER_PROVED` remains true. The lifecycle
status remains `CONTROLLED_END_TO_END_PREFIX_LIFECYCLE_AUDIT_REQUIRED` until a
separately authorised production correction is deployed and observed. The
immutable production `interact` evidence gap was not backfilled.
