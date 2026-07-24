# ADLE production curriculum readiness and activation platform

Date: 2026-07-23

## Purpose

This implementation adds one fail-closed readiness and activation boundary for
every registered ADLE lesson route. Curriculum may be imported before a route
is enabled; only an explicit `production_enabled` activation can make that
route resolver-visible.

The first registered production route is `base_word_family_v1`, limited to:

- `D4_MOR_BASE_WORDS_PRESERVE_BASE`
- `D4_MOR_BASE_WORDS_IDENTIFY_BASE`

The generic five-word composer and the six-word Base Word Lab keep their
existing independent payload and completion contracts.

## Source and production boundary

- Production project: `wwohrqtunajrbwxyssjf`.
- Production acknowledgement: `APPLY-ADLE-CURRICULUM-TO-SCARLETTS-SPELLS`.
- The approved source-package and import-manifest SHA-256 values are mandatory.
- The 1,000-word `in_review` batch is excluded from every manifest and audit.
- No misspelling may become a dictionary word.
- No importer may infer a micro-skill, family, word analysis, contrast,
  dictation sentence, or transfer word.

The approved D4 morphology package is source material, not runtime truth. Its
records become runtime-eligible only through a validated manifest and the
existing reviewed curriculum tables.

## Activation model

An activation is keyed by `micro_skill_key + lesson_route_key + environment`.
The supported states are `content_review`, `ready_for_proof`,
`production_enabled`, `paused`, and `retired`.

Production generation requires all of:

1. a code-registered route and payload version;
2. an active, assignable D4 catalog skill compatible with that route;
3. signed-off exact-target and route-specific curriculum content;
4. a production `production_enabled` activation row;
5. the route's existing feature/emergency gate; and
6. a successful route-specific readiness validator.

Missing content remains an auditable blocker. It does not select another word
or lesson type.

## Import and rollback

The production CLI is read-only unless passed the exact production host,
acknowledgement, manifest digest, approval reference, `--apply`, and command
confirmation. The database function stores the immutable manifest and changes
route activation atomically. Curriculum row imports remain bound to the
existing canonical Teaching Dictionary import batch referenced by the
manifest.

Rollback is non-destructive:

- pause the activation;
- supersede tagged test mappings/learning items where separately authorised;
- retain curriculum versions, mappings, lineage, assignments, schedules,
  attempts, outcomes, evidence, proficiency, rewards, and Word Treasure.

## Initial production proof

Test Scarlett is the only learner in scope. The Base Word Lab proof must retain
two authentic targets plus four transfers, exact targets first, shared
canonical-word review schedules, and once-only evidence/rewards.

No other lesson route is enabled by this release.

## Required deployment order

1. Run all repository regressions, lint, TypeScript, build, and database lint.
2. Apply `20260723100000_add_adle_curriculum_route_activations.sql`.
3. Deploy the application code. Until an activation exists, canonical intake
   and Base Word Lab composition fail closed with
   `adle_route_not_production_enabled`.
4. Run the read-only production inventory.
5. Build and review a manifest that references one complete, already-applied
   Teaching Dictionary import batch.
6. Run manifest dry-run and resolve every blocker.
7. Apply the activation manifest using the exact production confirmation.
8. Run Test Scarlett lesson and shared-review proof, then save the receipt.

Application deployment must not precede the migration because the new loaders
query the additive activation table.
