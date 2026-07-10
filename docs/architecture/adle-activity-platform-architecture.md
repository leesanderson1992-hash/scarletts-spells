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

- a pure `templateKey -> activity archetype` resolver;
- unversioned `assignment_items.prompt_data`;
- section-driven rendering in the child session runner;
- server-side correctness derivation;
- item-level attempt capture;
- separate evidence, scheduler, and reward paths.

This is enough for warm shells and current dictation-style rendering, but not enough for many rich templates.

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

## Determinism And Resumability

Variation should use a stable seed from assignment item identity, template key/version, and attempt number.

Persist only resumable interaction state and authoritative completion data. Do not persist pointer movement, animation frames, or every drag event.

## Performance

Rich renderers should be lazy-loaded by template or category. Safe warm-shell fallback must remain available in the base bundle.
