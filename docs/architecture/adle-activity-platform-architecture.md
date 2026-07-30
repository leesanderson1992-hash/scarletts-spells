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

The composable-lesson foundation adds descriptive contracts and audit tooling
without changing that baseline. Current production compilers still emit their
existing payloads, and current runtime adapters still reconstruct those
payloads through their existing readers.

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

This contract is a proposed compilation target only. No production compiler
emits it and no production renderer consumes it in the foundation change.
Persisted prefix, suffix, compound, Base Word and generic assignments remain
authoritative for their existing readers.

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

Open decision: exact storage location for `templateVersion`.

Until approved, documentation accepts only this direction:

- old payloads must never be silently reinterpreted under new semantics;
- missing/unsupported versions fall to safe fallback or explicit unsupported handling;
- assignment data stores semantic teaching payloads, not visual layout details.

The foundation closes the descriptive snapshot shape but does not resolve
storage or migrate old rows. Existing payload sniffing, adapters, resume keys
and fallback behaviour remain in place until route-specific migration PRs.

## Determinism And Resumability

Variation should use a stable seed from assignment item identity, template key/version, and attempt number.

Persist only resumable interaction state and authoritative completion data. Do not persist pointer movement, animation frames, or every drag event.

## Performance

Rich renderers should be lazy-loaded by template or category. Safe warm-shell fallback must remain available in the base bundle.
