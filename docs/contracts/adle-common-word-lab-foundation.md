# ADLE common Word Lab foundation contract

Status: dark foundation; no live assignment writer, storage, route activation, or production renderer.

## Boundary

The ADLE composer remains responsible for daily review planning, learning-item
and microskill prioritisation, probes, banding, taught history, and assignment
orchestration. The common Word Lab compiler receives an already-selected
microskill. It does not import or reproduce composer prioritisation,
completion, evidence, scheduling, or reward algorithms.

The future first-exposure boundary is:

```text
selected microskill
→ authoritative route
→ versioned recipe
→ recipe-specific word selection
→ immutable WordLabSnapshotV1
→ common shell and versioned activity plugins
→ server completion boundary
```

The current `adle_family_methods`, `adle_activity_templates`, generic five-word
policy, Generic Snapshot V2, and legacy readers retain their existing meaning.
They are not reinterpreted as Word Lab recipes.

## Authority and activation

- The curriculum route registry remains authoritative for route availability.
- The recipe registry is declarative inventory, not an activation switch.
- Resolution precedence is exact microskill override, then cluster, then family.
- Fixture and candidate recipes cannot resolve in production mode.
- Missing, ambiguous, inactive, non-common-shell, or incompatible routes and
  recipes fail closed without generic fallback.

## Recipe and snapshot rules

- Lesson, authentic, transfer, practice, guided, Cover Check, Dictation,
  companion, coverage, and activity counts belong to the recipe.
- There is no common Word Lab five-word constant.
- Recipe conditions are a closed declarative union; arbitrary expressions are
  prohibited.
- A compiled snapshot copies the resolved word requirements, activity and item
  bindings, content versions, policy versions, scheduling/reward roles, and
  completion requirements.
- Canonical JSON and SHA-256 fingerprints make recipe and snapshot mutation
  detectable.
- Unknown activity kinds or contract versions, invalid resume fingerprints,
  invalid bindings, role conflicts, or unmet coverage fail closed.

## Shell and plugin ownership

The common shell owns sequencing, progress, resume, reduced-motion and sound
boundaries, help, answer-visibility policy, reflection, result collection, and
the child-safe blocked state. Activity plugins own interaction-specific local
state and feedback. Neither layer writes evidence, schedules words, grants
rewards, or decides server correctness.

The development fixture at `/dev/adle/common-word-lab` is unavailable in
production and performs no remote writes.

## Compatibility

This foundation does not change the live composer, production route registry
entries, assignment persistence, completion actions, Generic Snapshot V2,
current Word Lab payloads, or historical readers and resume formats. A future
stage must add route-neutral storage and atomic persistence in staging before
any live route can adopt `WordLabSnapshotV1`.
