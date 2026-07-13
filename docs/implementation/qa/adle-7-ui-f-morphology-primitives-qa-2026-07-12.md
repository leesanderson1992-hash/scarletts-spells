# ADLE 7-UI-F Morphology Primitives QA

Date: 2026-07-12

## Summary

7-UI-F is accepted as a primitive/platform proof for D4_MOR.

The approved D4_MOR v1 source package can be converted into small reusable UI
view models, rendered through child-facing primitives, and inspected in a
development-only preview at `/dev/adle/morphology-primitives`.

This proof does not activate D4_MOR runtime content and does not wire the
approved package into the composer, Supabase, assignment generation, live ADLE
child session, evidence, scheduler, or rewards.

## QA Results

| Check | Result |
|---|---|
| `npm run adle:d4-mor-ui-primitives-regression` | Passed |
| `npx tsc --noEmit` | Passed |
| `npm run typecheck:scripts` | Passed |
| Focused ESLint on new 7-UI-F files | Passed |
| `npm run adle:d4-mor-content-schema-regression` | Passed |
| `npm run adle:d4-mor-approved-package-regression` | Passed |
| `npm run adle:activity-registry-regression` | Passed |
| `npm run adle:session-wiring-regression` | Passed |
| `npm run adle:attempt-capture-regression` | Passed |
| `npm run adle:reflection-recall-gate-regression` | Passed |
| `npm run adle:reward-bridge-regression` | Passed |

Focused ESLint covered:

- `lib/adle/ui/morphology-primitives.ts`
- `components/adle/experience/activity-frame.tsx`
- `components/adle/interactions/selectable-item.tsx`
- `components/adle/activities/morphology/shared/morphology-primitives.tsx`
- `app/dev/adle/morphology-primitives/page.tsx`
- `app/dev/adle/morphology-primitives/morphology-primitives-preview.tsx`
- `scripts/adle-d4-mor-ui-primitives-regression.ts`

## Browser Smoke

The development preview route returned `200 OK` and browser smoke verified:

- the morphology primitive preview rendered;
- pilot, recall-neutral, transformation, and long-word sections were present;
- no horizontal overflow was detected in the checked viewport;
- the assembly rail select/place/remove interaction worked;
- no browser console errors were reported.

## Acceptance Boundary

Accepted for 7-UI-F:

- approved D4_MOR semantic source can become small typed primitive view models;
- reusable child-experience and morphology primitives exist;
- representative approved cases render in a dev-only preview;
- recall-neutral rendering is available for future recall-sensitive work;
- existing ADLE registry/session/attempt/reward boundaries remain unchanged.

Not accepted as 7-UI-F scope:

- live `D4_MOR_PREFIXES_UN` lesson orchestration;
- flippable, draggable, snapping, jigsaw-style interaction layer;
- LessonGuide or beat-script runtime;
- composer payload emission;
- Supabase import or runtime activation;
- attempt submission, evidence pricing, scheduler, or reward changes.

Those items remain in the 7-UI-G vertical runtime pilot scope.
