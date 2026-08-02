# ADLE Activity Platform Architecture

## Purpose

This document owns the 7-UI runtime architecture for rendering many ADLE activity templates without creating bespoke persistence paths or one component per micro-skill.

## Target Flow

```text
assignment item
-> template key and version
-> typed registry entry
-> payload schema validation
-> payload normalisation
-> lazily loaded renderer
-> shared activity runtime
-> standard completion result
-> existing attempt capture
-> evidence policy outside the renderer
```

## Runtime Layers

```text
shared ADLE runtime
-> reusable activity-template mechanics
-> category-specific learning primitives
-> micro-skill experience profile and reviewed content
```

## Current Implemented Baseline

Current implementation has:

- a typed `templateKey -> activity template definition` registry;
- unversioned `assignment_items.prompt_data`;
- section-driven rendering in the child session runner;
- server-side correctness derivation;
- item-level attempt capture;
- separate evidence, scheduler, and reward paths.

The composable-lesson foundation added descriptive contracts and audit
tooling. The explicit-route stage then adds assignment-level route identity
without changing the existing lesson payloads: new assignment writers persist
the versioned route, recipe and raw payload contract, while the current runtime
adapters continue to reconstruct the same payloads.

This is enough for warm shells and current dictation-style rendering, but not enough for many rich templates.

7-UI-C adds D4_MOR category-v1 semantic candidate source artifacts only. Those
artifacts define morphology parts, joins/separators,
transformations, reusable linguistic identities, and experience-manifest
selection without changing assignment payload emission, registry behaviour,
renderers, composer output, evidence, scheduler, or reward semantics. 7-UI-D
records human approval for that category-v1 content/schema candidate, but does
not activate it or make it runtime truth. 7-UI-E freezes the approved
category-v1 source package under `data/adle/approved/d4-mor/v1/` with
`activationStatus = not_activated` and `runtimeEnabled = false`. The package is
not imported by the composer, registry, session runner, renderer, Supabase, or
evidence/scheduler/reward paths in that PR.

## Registry Direction

Each registry entry should declare:

- `templateKey`;
- `templateVersion`;
- supported category/family;
- experience mode;
- lazy renderer;
- payload schema;
- normaliser;
- answer-visibility policy;
- correctness policy;
- evidence class label;
- fallback ladder;
- accessibility capabilities;
- supported completion envelope.

The registry remains the drop-in seam. It must not become a giant switch statement.

## Composable Lesson Contract Boundary

The runtime-neutral contract is
`lib/adle/composable-lesson/contracts.ts`. It versions route, recipe, activity,
word-role, snapshot, validator, compiler and provenance references. Activity
snapshots are discriminated unions with typed conditions; there is no generic
string-expression workflow language.

The generic composer now implements `CompiledLessonSnapshotV2`. It compiles
only after `composeDailyPlan` and `planAssignmentPersistence` have finalised a
real insert, binds every activity to its deterministic
`assignment_items.source_entity_id`, and persists the header, route metadata,
snapshot, variable-count items and stretch intakes in one service-role RPC.
The smaller `PersistedLessonRouteMetadataV1` contract remains the
assignment-level routing boundary for every route. Prefix, suffix, compound
and Base Word payloads remain authoritative teaching snapshots for their
existing validators and adapters.

Generic V2 snapshots live only in nullable, immutable
`daily_assignments.compiled_lesson_snapshot`; they are never duplicated into
route metadata or item payloads. `assignment_items.prompt_data` remains the
authoritative activity-input source. The snapshot owns semantic identities,
ordered bindings, word roles, conditions, attempt/evidence classes,
schedule/reward roles and the canonical content fingerprint.

`ADLE_GENERIC_SNAPSHOT_MODE` supports `off`, `observe` and `enforce`, with
`off` as the safe default. A present snapshot is validated in every mode.
Observe mode retains the item-derived projection only after field-by-field
parity; enforce mode reconstructs the same read model from validated snapshot
activities plus bound item rows. A present invalid or unsupported snapshot
blocks the entire assignment before either completion action writes. Snapshot
absence alone enters compatibility for explicit pre-snapshot generic and
metadata-free historical assignments.

## Persisted Route Resolution

`daily_assignments.lesson_route_metadata` is the sole authoritative route
metadata location. It is nullable for historical assignments, structurally
validated, immutable after insertion and has no default.

Resolution follows three rules:

1. valid metadata resolves the exact route, recipe and raw payload version
   through the canonical route registry;
2. absent metadata uses the registered historical discriminator and payload
   reader;
3. present invalid, unsupported or contradictory metadata blocks and never
   falls back to payload sniffing.

The server page and completion actions call the same resolver. A blocked route
renders a child-safe grown-up-check state and writes no attempts, evidence,
schedules or rewards. Resume state remains route-specific and unchanged;
route identity is loaded from the assignment on every server request.

The metadata stores no compiler, renderer, activity-contract or content
version. Compiler/adapter/renderer identity is derived from the canonical
registry, activity detail remains in immutable assignment items, and content
versions remain in existing rich payloads.

## Canonical Factual Inventories

Code owns structured architecture inventory:

- routes: `lib/adle/curriculum-readiness/route-registry.ts`;
- activity fact requirements:
  `lib/adle/composable-lesson/activity-requirements.ts`;
- compatibility blocker codes:
  `lib/adle/composable-lesson/compatibility.ts`;
- readiness stages and policy:
  `lib/adle/composable-lesson/readiness-audit.ts`.

Generated route, activity, blocker and repository-readiness references live in
`docs/generated/adle-composable-lesson/`. They are factual projections, not
handwritten sources of truth. Run `npm run adle:architecture-drift-check` to
detect drift.

The generated shared-affix profile and blocker inventories describe typed
position, split, build, meaning, count and role policies for all five Prefix V2
and ten Affix V3 profiles. Dynamic Prefix keeps its unchanged selector and V2
contract but reaches the shared compiler through a guarded authority boundary:
all five approved profiles advance through shadow, enforced-parity and
shared-authoritative modes after exact `un-` normal-path source release.
Dynamic Affix remains dark on its existing
compiler and writer. This boundary does not alter the activity registry,
`AdleSessionRunner`, route metadata, persistence contract, Generic Snapshot or
Common Word Lab shell.

The existing `base_word_family_v1` activation registry remains the persisted
Base Word compatibility projection. It points to the canonical descriptive
`base_word_lab:v2` declaration and is not broadened to activate other routes.

## Compatibility Boundary

Compatibility assessment is pure and does not select words or query the
database. It keeps four states separate:

- supported;
- authentic-target eligible;
- transfer eligible;
- selected in an immutable assignment.

Activity readiness is derived from owned facts rather than manually authored
`canSplit`, `canBuild`, `canMeaningSort` or `canDictate` flags. Missing facts
remain typed blockers. The current Closed Compound authentic/transfer coupling
and separator-comparator disagreement are reported as production-parity
findings; this foundation does not repair either behaviour.

## Readiness Audit Boundary

The readiness audit has three explicit modes:

- `repository/report` proves repository structure and reports live fact stages
  as not assessed;
- `live/report` reports select-only production observations without using
  readiness blockers as an exit failure;
- `live/strict` exits with failure for blockers or unassessed stages.

The live adapter is pinned to the production Supabase hostname, has a table
allowlist, exposes only selects, and reads no learner tables. Project-pin,
registry or execution errors use exit code `2`; genuine strict readiness
failures use exit code `1`. Live credentials are never used by CI.

## Renderer Boundary

Renderers may own local interaction, drag/tap/typing, animation, sound, temporary state, local feedback, and completion output.

Renderers must not own Supabase writes, assignment completion persistence, evidence creation, proficiency changes, scheduling, reward creation, or global lesson navigation.

## Shared Runtime Boundary

The shared runtime owns activity framing, progress, attempt identity, timings, retry/hint/replay counts, completion submission, recoverable state, fallback rendering, error boundaries, navigation, and accessibility state.

## Versioning And Old Payloads

The exact activity-template version storage decision remains separate from
assignment-level route identity. The current compatibility policy is:

- old payloads must never be silently reinterpreted under new semantics;
- missing/unsupported versions fall to safe fallback or explicit unsupported handling;
- assignment data stores semantic teaching payloads, not visual layout details.

Historical rows are not backfilled. Existing payload sniffing is restricted to
metadata-free assignments and retained compatibility cases. Existing payload
validators, adapters and resume keys remain in place until route-specific
migration and retirement proofs are separately approved.

## Route And Snapshot Rollout And Rollback

The additive database schema is deployed before metadata-writing application
code. Staging must use the pinned staging project and prove explicit routes,
metadata-free historical routes, resume, completion and application rollback.

Application rollback is the normal recovery path. The nullable column,
constraints, index, compatible RPCs and any written metadata remain in place;
older application versions ignore the additional field and continue creating
metadata-free assignments that the legacy readers support.

The generic V2 schema follows the same rule: deploy the nullable/no-backfill
column and atomic writer before snapshot-writing code, prove observe parity,
then enable the snapshot reader. Older application commits do not select the
snapshot column and therefore continue reading and completing snapshot-bearing
assignments from their unchanged item rows. Rollback never deletes or rewrites
an immutable snapshot.

## Determinism And Resumability

Variation should use a stable seed from assignment item identity, template key/version, and attempt number.

Persist only resumable interaction state and authoritative completion data. Do not persist pointer movement, animation frames, or every drag event.

## Performance

Rich renderers should be lazy-loaded by template or category. Safe warm-shell fallback must remain available in the base bundle.
