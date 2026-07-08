# ADLE 7P: Live Pilot Foundation

Status: `Implemented 2026-07-08; live pilot proof still requires approved real-child generation and QA.`

## Roadmap position

ADLE 7P is an inserted bridge slice, not a deviation from the ADLE roadmap.

Order:

1. Slice 7a child fun session + reward loop
2. **Slice 7P live pilot foundation**
3. Slice 7-UI template redesign
4. Slice 7b parent surfaces
5. Slice 8 productionisation

Core rule: do not continue template UI redesign until one real child live ADLE
assignment can be previewed, intentionally generated, opened by the child,
completed, and verified in the database.

## What changed

- `/learn/week/adle` is now read-only on load. It reads an existing ADLE
  assignment header and items; it does not create `daily_assignments` or
  `assignment_items`.
- Child navigation now points to `/learn/week/adle` as `Today's Spelling`.
- `/learn/week/practice` is legacy for child daily assignment traffic and
  redirects child mode to `/learn/week/adle`.
- `npm run adle:preview` provides a read-only composer preview using the shared
  ADLE facts loader, composer, and persistence planner.
- `npm run adle:child-identity-check` provides a read-only parent/child
  identity and row-count preflight.
- `npm run adle:generate-pilot-assignment` is a guarded command for explicit
  pilot generation. It re-runs preview/static checks immediately before writing
  and refuses duplicates/empty plans.
- `npm run adle:child-route-readonly-regression` guards the child route against
  accidental lazy generation.

## Legacy vs ADLE learning items

Legacy Daily Practice:

- Route: `/learn/week/practice`
- Source table: legacy `learning_items`
- Generation: Vercel cron route
  `/api/internal/daily-spelling-practice/generate`
- Assignment item FK: `assignment_items.learning_item_id`
- Current child-pilot status: retired/redirected for child daily assignment use

ADLE Daily Assignment:

- Route: `/learn/week/adle`
- Source table: `adle_learning_items`
- Generation: explicit guarded pilot command for this slice
- Assignment item linkage:
  `assignment_items.metadata.adleLearningItemRef`; the legacy
  `assignment_items.learning_item_id` remains null by design
- Current child-pilot status: preview/generation foundation implemented; first
  real child assignment proof still pending

## Commands

Read-only preview:

```bash
npm run adle:preview -- \
  --parent-user-id <parent_uuid> \
  --child-id <child_uuid> \
  --assignment-date 2026-07-08 \
  --json
```

Read-only identity check:

```bash
npm run adle:child-identity-check -- \
  --parent-user-id <parent_uuid> \
  --json
```

Guarded generation, only after preview and real child identity are approved:

```bash
npm run adle:generate-pilot-assignment -- \
  --parent-user-id <parent_uuid> \
  --child-id <child_uuid> \
  --assignment-date 2026-07-08 \
  --approved-parent-user-id <same_parent_uuid> \
  --approved-child-id <same_child_uuid> \
  --confirm-generate ADLE-7P-GENERATE
```

## Pilot proof order

First proof: assignment, evidence, and schedule only.

1. Run child identity check.
2. Approve the real child id and parent id.
3. Run read-only preview for the pilot date.
4. Confirm Part 1/Part 2 selection, skip reasons, duplicate risk, and
   persistence action.
5. Generate intentionally with the guarded command.
6. Verify one `daily_assignments` row.
7. Verify expected `assignment_items` rows.
8. Child opens `/learn/week/adle`.
9. Child completes Part 1 and Part 2.
10. Verify taught word history, review outcome/schedule updates, and evidence
    rows.
11. Refresh `/learn/week/adle` and verify no duplicate assignment/items.

Second proof: Word Treasure. It is not a blocker for the first ADLE assignment
pilot. The second proof must show parent-approved Golden Nugget exists before
completion, ADLE lesson completion moves it into Forge, authentic use later
progresses toward Golden Bar, and assignment visibility alone creates no reward
state.

## Production data rule

Do not mutate production data until both the preview output and real child
identity are approved. This slice adds the guarded mechanism; it does not itself
prove the live child pilot.
