# Dynamic Prefix Word Lab v2 — `D4_MOR_PREFIXES_IN_IM_IL_IR` staging proof

Status: passed in staging on 2026-07-22. This evidence applies to this profile only and does not enable production.

## Reviewed staging correction

| Item | Evidence |
| --- | --- |
| Staging project | Supabase `jlhotktspjvffslvuyfz` |
| Correction batch | `1c08ae26-6a57-4c8c-97b7-814cb081f1a5` |
| Correction package SHA-256 | `b726fce03a96382005b09bbbb9c2c6de729db7d433d5c7c64521fce2dd16b439` |
| Base reviewed package SHA-256 | `d5d4b9df9c399db66a143ed86af55db58fa8ba7595a6e8263821693ba4641916` |
| Profile state | active, approved, `production_enabled = false` |

The transaction corrected retained MorphoLex morphology and reviewed bands, retained the active reviewed staging sentence/audio rows, and changed the sort to neutral form labels. All seven members passed sentence/audio equality, token-index, teaching-split reconstruction, one-cleaver-boundary, prefix-variant, human morphology, pronunciation and banding checks.

## Automated evidence

| Check | Result |
| --- | --- |
| Correction package validation and transaction verification | pass |
| 1 / 2 / 3 / 4 / >4 authentic target selection | pass |
| Transfer fill, oldest-first, reteach/stable ties and pending overflow | pass |
| One/two target mixed-form coverage | pass — all four forms are used where slots allow |
| Immutable payload and fail-closed checks | pass |
| Released dynamic `un-` v2 and fixed legacy `un-` v1 regressions | pass |

## Clean browser completion

Preview deployment `dpl_GHc6KFbhGtSwT8deCZWC8VWn6mta`: `https://scarletts-spells-staged-1wyea6n4t.vercel.app`.

Disposable staging child `1c856ca1-4f70-4163-a210-cc281900c907` held two verified-misspelling targets: `impatient` and `illegal`. The immutable four-word lesson covered `im-`, `il-`, `in-`, and `ir-`; the cleaver used `im + patient` and the build used `il + legal`.

The child browser completed base/root versus new-word discovery, the `im-` cleaver, neutral form sorting, mixed-form build, controlled spelling, four reviewed dictations, reflection, durable completion, evidence and scheduling. A reload on the `il- + legal` discovery card restored the in-progress state. Completion trace: `0f072e0f-245a-4d12-9613-020eb8b8c027`.

```json
{"assignmentItems":16,"attemptEvents":14,"reflections":1,"taught":2,"scheduled":2,"authenticLearningItems":2}
```

The two taught/scheduled rows correspond to authentic targets; transfer words do not create diagnostic learning-item history.

## Follow-up current-build browser rerun

Preview deployment: `https://scarletts-spells-staged-4dlvoloaz.vercel.app`.

The latest fresh, disposable staging assignment verified the revised lesson sequence:

- the generic **What is a prefix?** screen, followed by the `in-/im-/il-/ir-` family explanation and the approved letter rule;
- base/root-word versus new-word discovery, with the correct meaning alternating between first and second choice;
- no meaning-matching activity or `Match` progress step;
- cleavers for `im + patient` and `il + legal`, followed by one build for each available form: `in + correct`, `im + patient`, `il + legal`, and `ir + regular`;
- controlled spelling, four reviewed dictations, reflection, durable reload/resume during discovery, and completion.

Completion trace: `58a6a008-88c9-44fd-aff6-90c95e4c7df1`. The completed immutable assignment had all 16 items marked complete, wrote 14 attempt events, two authentic-target taught-history rows, and two active scheduled rows. The post-completion check confirmed the sentence-target attempts were correct.

## Cleanup and production boundary

The disposable child, assignment, 16 assignment items, 14 attempt events, reflection, taught history, schedules and two fixture learning items were deleted. The post-delete audit returned zero fixture-owned rows for every table.

The follow-up disposable child, its assignment, 16 items, 14 attempt events, reflection, taught history, schedules and two fixture learning items were deleted after the evidence check; the post-delete audit returned zero rows for every fixture-owned table checked.

No production database, learner, assignment, evidence, scheduler or route-gate write occurred. The profile remains staging-approved and production-disabled pending separate written production approval.
