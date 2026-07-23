# Dynamic Prefix Word Lab v2 — `D4_MOR_PREFIXES_RE_PRE` child staging evidence

Status: passed in staging on 2026-07-23. This evidence applies to the RE/PRE profile only; it does not enable production.

## Staging data and runtime

| Item | Evidence |
| --- | --- |
| Staging project | Supabase `jlhotktspjvffslvuyfz` |
| RE/PRE profile correction batch | `81697144-7996-4a60-bfde-0d879b7f304a` |
| Correction package SHA-256 | `4d3c6ce97d7264e7fdb8b175d91ee61ddc224fa9b0bbd326cc3670a13fb5593c` |
| Profile state | active, approved, `production_enabled = false` |
| Profile members | 7 active approved members |
| Meaning sort | `Again` and `Before`, with empty descriptions |
| Build prompt | reviewed new-word meaning is carried into the build activity |

The correction made no canonical-word, learner, assignment, evidence, scheduler, route-gate or production write. It preserved the seven reviewed RE/PRE member rows and only changed the staging profile configuration.

## Child completion evidence

Disposable staging child `5a138bd6-60f2-400b-9ff6-b43891127e50` had two pending verified-misspelling targets: `rebuild` and `preheat`. The compiled four-word lesson used those authentic targets and safe same-profile transfers.

The child completed immutable assignment `7dd75c08-a6d5-44eb-b9ac-ea40427f4574`.

```json
{
  "assignmentStatus": "completed",
  "assignmentItemsCompleted": 16,
  "guidedSplitEvents": 1,
  "guidedMeaningSortEvents": 4,
  "guidedBuildEvents": 1,
  "controlledSpellingEvents": 4,
  "dictationEvents": 4,
  "reflectionCount": 1,
  "taughtHistoryRows": 2,
  "scheduledRows": 2
}
```

The recorded reflection was: “pre- mean before and re- means again.” Both authentic targets moved to `awaiting_review_outcome`, have active taught-history rows, and have active scheduled review rows. Transfer words did not create learning-item history.

## Release boundary

## Reload and resume

A separate disposable staging child, `92dd54b9-3c53-4afc-a7e9-a764eaffb82f`, compiled a fresh immutable RE/PRE assignment. Chrome verified the following sequence:

1. the generic **What is a prefix?** introduction;
2. the approved **Meet the re- and pre- prefix family** page with its approved wording;
3. a full browser reload; and
4. restoration to the same second introduction screen.

This proves that the in-progress guided state resumes durably. Combined with the clean child completion above, the automated selector/runtime coverage, and the package/field fail-closed checks, the RE/PRE profile is staging-approved. It remains production-disabled pending a separate written production approval.

## Cleanup

The disposable child and every fixture-owned record were deleted after evidence capture:

```json
{
  "attemptEvents": 14,
  "reflections": 1,
  "assignmentItems": 16,
  "assignments": 1,
  "taughtHistory": 2,
  "reviewSchedules": 2,
  "learningItems": 2,
  "child": 1
}
```

The post-delete audit returned zero rows for the child, its learning items, assignment, assignment items, attempt events, reflection, taught history and review schedules.

The reload/resume fixture was also deleted after the check: two learning items, one assignment and 16 assignment items. It had no completion evidence, history or schedules.
