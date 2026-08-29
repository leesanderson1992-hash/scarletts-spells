# ADLE activity platform architecture

Updated: 2026-08-29
Production authority: `f3a4b37d9df460553feb9bf748f543dff2da66ae`

This document describes the current released application architecture. Dated
implementation plans and QA receipts describe historical checkpoints; they do
not override these current boundaries.

## Current flow

```text
governed spelling occurrence
  -> R8 canonical intake and learning-item lineage
  -> Today's ADLE Session selection
  -> current route compiler
  -> immutable compiled_lesson_snapshot v3
  -> persisted route resolution
  -> CanonicalActivitySpec
  -> CanonicalActivityHost / current specialist adapter
  -> attempts and evidence
  -> per-word Review schedule
  -> immutable Review v3
  -> Parent Review Work
```

Every new generic and specialist lesson is persisted with snapshot v3. There
is no application fallback that can create snapshot-null, generic-v2,
fixed-`un` v1, closed-compound-v1, or old daily-plan output.

## Current routes

`lib/adle/curriculum-readiness/route-registry.ts` owns the five current
new-assignment routes:

- `generic_composer:v1`;
- `dynamic_prefix_word_lab:v2`;
- `dynamic_affix_word_lab:v3`;
- `base_word_lab:v2`;
- `compound_word_lab:v2`.

`daily_assignments.lesson_route_metadata` is immutable after insertion. Valid metadata resolves the exact
registered route. Metadata-free assignments enter only the retained historical
normalizer. In other words, absent metadata selects registered historical
compatibility, while present invalid or contradictory metadata fails closed
and never falls back to payload sniffing.

## Snapshot-v3 boundary

Snapshot v3 stores canonical activity concept, mode, contract version, authored
payload, deterministic bindings, semantic roles, evidence/schedule roles, and
content provenance in `daily_assignments.compiled_lesson_snapshot`.

The writer compiles only after selection has produced a real assignment plan.
Service-only persistence stores the header, route metadata, immutable v3
snapshot, bound items, and any governed intake together. Readers validate the
snapshot before rendering; an invalid or unsupported present snapshot blocks
the assignment with no learner writes.

Generic snapshot v2 is retired and has zero Production rows. Snapshot absence
is historical compatibility, not a writer mode. The 24 historical
snapshot-null lessons and two metadata-free generic assignments are not
backfilled and retain their current readers and completion paths.

## Activity authority

`lib/adle/activity-catalogue.ts` is the machine capability inventory.
`CanonicalActivityHost` and its versioned renderer registry are the React
renderer-selection authority. The pure generic compatibility normalizer can
translate supported historical template keys into `CanonicalActivitySpec`,
but it cannot choose React components or create assignments.

Thin route adapters retain curriculum transformation, resume state,
correctness, evidence, assignment binding, and completion envelopes. Shared
activities may own interaction state, feedback, animation, audio, and a typed
completion result. They must not own persistence, learning-item creation,
proficiency, scheduling, rewards, or global lesson navigation.

Unknown contracts and invalid payloads fail closed. There is no generic prompt
fallback renderer.

## Current canonical experiences

- `TeachingPages` and `FirstImpressionLesson` own the shared first-impression
  teaching sequence.
- `SplitHandle` owns Prefix, Affix, and Base Word split/cleave interaction.
- `DefinitionWordBuilder` and `CompoundJigsawActivity` share ordered-placement
  mechanics while preserving distinct learner experiences.
- Discovery, `MeaningConnectionActivity`, and `BinSort` are the three governed
  meaning/categorisation actions.
- `CoverShutter` owns study-cover-spell-compare.
- `SentenceDictation` owns authored whole-sentence recall.
- `ColdWordRecall` owns scheduled and diagnostic independent recall.
- `ReflectionActivity`, Memory Cue authoring, and `LessonReflection` retain
  their distinct evidence contracts.

Compound Word Lab v2 is the only current compound route. Closed-compound-v1
payload adapters and render-only contracts were retired after Production
proved zero rows and zero consumers. Dynamic Prefix v2 is profile-driven;
the fixed-`un` v1 route and adapter were retired after the same proof.

## R8, evidence, and proficiency

R8 keeps occurrence identity, canonical-word identity, and learner x word x
microskill learning-target identity separate. Exact-ID handoff and governed
readiness determine whether a candidate is `READY` or durably `BLOCKED`.
Blocked candidates are reconsidered by released hooks and the bounded safety
sweep; submission text never substitutes for canonical identity.

First-impression success may activate a word and add controlled evidence, but
it is not independent production. Cold or prompted Review production can move
a word to `produced` under the governed evidence policy. Breadth proficiency
is credited only when support, approval, and banding gates admit the word.
Repairs append evidence without rewriting the original outcome.

## Review and bundle authority

Review v3/R6 owns immutable snapshots, encounters, original outcomes, repairs,
Memory Cues, completion receipts, and outcome events. R5 owns per-word due
dates, catch-up stages, pause state, and pre-retirement checks.

`legacy_bundle` is a current forward scheduling authority despite its name.
Current snapshot-v3 lesson completion can create bundle rows and bundle-linked
schedules. Bundle creation, readers, and `source_bundle_id` provenance remain
supported. The post-E5 baseline records 29 active bundle schedule rows and 21
active bundles.

## Reward and course boundaries

Word Treasure is a separate governed reward journey. Parent approval and the
returned-correction bridge call the canonical writer only after the governed
learning-item relationship exists. Replay is idempotent. Lesson generation and
activity rendering do not mint rewards.

Course Review Work remains a separate mandatory
`pending`/`approved`/`returned` progression gate.

## Historical compatibility

The following remain intentionally supported:

- snapshot-null specialist readers and completion paths;
- metadata-free generic decoding and old template normalization;
- `REVIEW_QUICK_SORT` to `CompatibilityNoop`;
- controlled-spelling and historical free-response adapters;
- base-word-v2 completion compatibility;
- immutable lesson and Review history;
- current `legacy_bundle` creation and readers;
- historical migrations and database objects.

Historical rows are never reinterpreted or rewritten merely to simplify code.

## Retired application surfaces

Phase E retired generic snapshot-v2 infrastructure, fixed-`un` v1,
closed-compound-v1, snapshot-null creation, the obsolete daily-spelling writer,
and the daily-practice route/viewer/read-model/completion/materialiser. The 157
historical empty daily-practice headers remain harmlessly stored; Today's ADLE
Session is the current learner-facing authority.

## Generated references and drift

Generated factual references live in:

- `docs/adle/ACTIVITY_CATALOGUE.md`;
- `docs/adle/ACTIVITY_CONVERGENCE_BACKLOG.md`;
- `docs/adle/ACTIVITY_IMPLEMENTATION_AUDIT.md`;
- `docs/generated/adle-composable-lesson/`.

Their machine inputs include
`lib/adle/composable-lesson/activity-requirements.ts`, the route registry,
compatibility blocker inventory, and readiness policy. The readiness audit's
`repository/report`, `live/report`, and `live/strict` modes retain their
documented read-only/fail-closed boundaries.

Regenerate them from the machine sources and run the repository architecture
drift checks whenever those sources change. Generated documents must not be
hand-edited.

## Change rules

New activities follow: reuse an existing canonical concept, configure a
supported mode, extend a shared abstraction under governance, or declare a
new-interaction requirement with explicit pedagogical evidence.

No application change may restore a retired writer or renderer as fallback.
Any future database-object cleanup is Phase E7: it requires a fresh read-only
dependency audit, explicit owner approval, a unique forward migration, and a
restoration plan. Historical migrations are never deletion candidates.
