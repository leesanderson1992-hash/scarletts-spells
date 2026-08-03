# Dynamic Prefix pedagogy release v1

This immutable reviewed package supplies the child-facing teaching definitions, deterministic Build pools, selected-prefix feedback content, and Prefix Form Sort categories used by the five Dynamic Prefix profiles.

It targets staging Supabase project `jlhotktspjvffslvuyfz` only. It does not create words, learner items, assignments, evidence, schedules, or rewards. The guarded release script updates only the five existing active Prefix profile projections and can restore the captured pre-release projection.

`manifest.json` is the only authored teaching catalog for this release. It
contains the 12 reviewed definitions, the five ordered choice pools, and a
seven-member audit for each profile. Every member audit is a complete verdict
matrix over that profile's choice pool: every selectable form is
explicitly `true` or `false`, exactly one form is `true`, and the true form is a
declared target. Loading and compilation compare the complete key set because
JSONB object-key order is not stable; learner-facing order remains governed by
the separate reviewed choice array. They fail closed if the matrix is missing
a choice, contains a second valid answer, or disagrees with the member's
reviewed `prefixText`.

The package SHA-256 is computed directly from the immutable manifest bytes.
Release validation, planning, application, verification, and deactivation all
reject production and unknown Supabase identities. Application is restricted
to the five existing reviewed profile JSONB projections and checks that
protected learner-table counts do not change.
