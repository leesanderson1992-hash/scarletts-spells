# Dynamic Prefix Word Lab v2 — `D4_MOR_PREFIXES_SUB_INTER_SUPER` child staging evidence

Status: passed in staging on 2026-07-23. This evidence applies only to the SUB/INTER/SUPER profile; it does not enable production.

## Staging data and runtime

| Item | Evidence |
| --- | --- |
| Staging project | Supabase `jlhotktspjvffslvuyfz` |
| Profile correction batch | `beb6972e-6bae-4f60-bad4-f44d2654e1e1` |
| Correction package SHA-256 | `fe27bdea6bbe48ba687021ffc39fdffd1d0b409636f00d24b1c903ee01aeb3d2` |
| Profile state | active, approved, `production_enabled = false` |
| Profile members | 7 active approved members |
| Immutable contract | 18 items: 2 introduction, 3 cleavers, 4 meaning sorts, 1 build, 4 controlled spelling and 4 dictations |
| Meaning sort | `Under`, `Between`, `Above or beyond` |
| Intro examples | reviewed `submarine`, `international` and `superhero` examples |

The forward staging-only persistence migration permits an 18-item plan only when every item is `dynamic_prefix_v2`, carries `D4_MOR_PREFIXES_SUB_INTER_SUPER`, and its immutable root snapshot names that profile. Existing 16-item plans remain unchanged.

## Child completion evidence

Disposable staging child `1666066a-f59b-461d-8ed9-4f2bf65283b5` had three pending verified-misspelling targets: `submarine`, `international` and `superhero`. `interact` filled the four-word lesson as an approved same-profile transfer.

Chrome completed immutable assignment `c8f29f7b-9c16-4470-b48f-b791870988a3` on staging. It verified the generic prefix introduction, all three reviewed profile examples, a reload/resume during discovery, the three cleavers (`sub-`, `inter-`, `super-`), the three explicit meaning labels, the meaning-led build target, controlled spelling, reviewed dictation, reflection and completion.

```json
{
  "assignmentStatus": "completed",
  "assignmentItemsCompleted": 18,
  "lessonIntroItems": 2,
  "guidedEvents": 8,
  "controlledSpellingEvents": 4,
  "dictationEvents": 4,
  "reflectionCount": 1,
  "taughtHistoryRows": 3,
  "scheduledRows": 3,
  "learningItemsAwaitingReview": 3
}
```

The transfer word deliberately created no learner history or schedule. The three authentic targets moved to `awaiting_review_outcome`, received active taught-history rows, and were scheduled for review. The completion redirect carried trace `b95be34d-cac4-4503-9554-232859b259c8` with “Lesson finished. New words join review tomorrow.”

## Cleanup

The disposable child and every fixture-owned record were removed after evidence capture:

```json
{
  "attemptEvents": 16,
  "reflections": 1,
  "assignmentItems": 18,
  "assignments": 1,
  "taughtHistory": 3,
  "reviewSchedules": 3,
  "reviewBundles": 1,
  "learningItems": 3,
  "child": 1
}
```

A post-delete audit returned zero rows for the fixture child, assignment, assignment items, attempt events, reflections, taught history, review schedules, review bundles and learning items.

## Release boundary

The profile is staging-approved and remains `production_enabled = false`. It needs separate written production approval naming `D4_MOR_PREFIXES_SUB_INTER_SUPER`; this staging proof does not change any production database, production route gate, or other prefix profile.
