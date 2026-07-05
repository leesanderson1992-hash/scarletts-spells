# ADLE Slice 1: Dictionary Eligibility Statuses and Complexity Banding — Plan

## Status

- Status: `Implemented 2026-07-05 (owner instructed "proceed to
  implementation" 2026-07-04). All four parts landed with passing
  regressions and exact preview parity; decision-log entry
  "2026-07-05 — ADLE Slice 1 implemented". The 1A migration is written and
  scratch-verified but not applied anywhere yet: the local dev database
  currently has an empty schema, so applying 20260629120000 +
  20260705090000 and re-running the Phase 5F import locally is the
  precondition for the banding runner's DB mode (CSV mode and all
  regressions are DB-independent). Hosted/production remains untouched.`
- Date: 2026-07-04 (implemented 2026-07-05)
- Policy sources:
  [adle-daily-assignment-and-evidence-blueprint-contract.md](../contracts/adle-daily-assignment-and-evidence-blueprint-contract.md)
  (including its 2026-07-04 formula-package amendment) and the approved
  [adle-word-complexity-banding-and-formula-numbers-proposal.md](adle-word-complexity-banding-and-formula-numbers-proposal.md)
- Roadmap position: first ADLE implementation slice in the Version 3
  roadmap's amended order (dictionary eligibility statuses → review
  scheduler → daily assignment composer → evidence engine)
- Deployment method (per `docs/operations/supabase-migration-policy.md`):
  **unique forward migration**, local/dev only, version format
  `YYYYMMDDHHMMSS`. No hosted/production Supabase mutation in this slice.

## Purpose

Give the Teaching Dictionary layer the two data capabilities every later
ADLE slice reads but never owns:

1. **Complexity banding (banding v1.1)** — per-word structural score and
   Level (1–3), versioned and admin-overridable, plus the
   per-micro-skill-per-level **allocation table**, recomputable per import
   batch.
2. **The eligibility ladder** — the five derived word statuses
   (`recognisable` → `evidence-eligible` → `assignment/diagnostic-eligible`
   → `review-eligible` → `mastery-breadth-eligible`) as read-model
   derivations on the one dictionary, with the obscure-word firewall
   (frequency/AoA gate child-facing eligibility only).

This slice produces no assignments, no reviews, no evidence, no proficiency,
no rewards, and no resolver changes.

## Inputs and preconditions

- Local teaching-dictionary storage exists
  (`supabase/migrations/20260629120000_add_canonical_teaching_dictionary_storage.sql`):
  `canonical_teaching_dictionary_words`, `_word_metadata`, `_word_support`,
  `_content_versions`, `_import_batches`, `_sources`.
- The Phase 5F local import path (`scripts/import-teaching-dictionary-csv.py`)
  is the only writer of dictionary rows; this slice extends that pattern, it
  does not bypass it.
- Approved formula truth: banding v1.1 scoring, 3-level thresholds,
  note→class irregularity mapping, mismatch proxy, and the fail-closed
  onboarding rules (proposal §1, §2.1).
- Preview parity oracle:
  `docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-04-complexity-banding-preview/`
  (874 words → L1 424 / L2 342 / L3 108; 372 populated skill/level cells;
  365 under floor 8). The runtime banding of the same candidate batch must
  reproduce these numbers exactly.

## Design

### 1A. Schema additions (one unique forward migration)

New tables, following the existing dictionary tables' conventions
(row_status, source lineage, timestamps, RLS enabled, service-role-only
grants, no browser paths):

`canonical_teaching_dictionary_word_banding`
- `canonical_word_id` FK → `canonical_teaching_dictionary_words`
- `banding_version` text (e.g. `banding_v1.1_2026-07-04`)
- inputs snapshot: `syllable_points`, `length_points`, `irregularity_class`,
  `irregularity_points`, `morphology_depth`, `morphology_points`,
  `has_schwa`, `mismatch_flag`
- `structural_score` int, `complexity_level` int
- `import_batch_id` FK (the banding run), `row_status`
- unique `(canonical_word_id, banding_version)`

Re-banding under a new version inserts new rows; old versions are retained
for audit. One version is active at a time (see registry below).

`canonical_teaching_dictionary_banding_overrides`
- `canonical_word_id` FK, `override_level` int,
  `override_reason` text **not null**, `created_by`, `row_status`
- one active override per word; overrides are version-independent and
  survive re-banding (effective level = active override, else computed
  level for the active banding version)

`canonical_teaching_dictionary_banding_versions`
- `banding_version` text pk, `is_active` boolean, `level_count` int,
  `formula_reference` text (proposal path), `activated_at`
- exactly one active version enforced; the level range is owned here

`canonical_teaching_dictionary_skill_level_allocation`
- `micro_skill_key` FK → `micro_skill_catalog`, `level` int,
  `allocation` int, `banding_version` text, `computed_at`,
  `import_batch_id` FK
- derived artefact, fully recomputed on every banding run; consumers
  (level targets, probe selection — later slices) read it, never write it

### 1B. Banding runner (deterministic, dry-run-first)

`scripts/adle-band-teaching-dictionary.py`, same operating pattern as the
Phase 5F importer:

- reads active dictionary words + metadata, computes banding v1.1 exactly
  per the approved formula (the note→class table and thresholds live in the
  script as versioned constants; workbook/policy columns are never read)
- **fail-closed onboarding** (proposal §2.1): a word missing `syllables`,
  `morphemes`, `has_schwa`, or `phoneme_hint` gets **no banding row** and is
  listed in the report; blank `irregularity_notes` = regular class 0
- **unknown irregularity notes** → class 1 + a `new_note_values` review list
  in the report; the run does not fail
- recomputes the allocation table for the active version
  (non-contrast support roles only, matching the approved preview)
- dry-run by default, writes a JSON batch report (level distribution,
  per-skill allocation deltas, skipped words, new note values — the
  `banding_preview_summary.json` shape); applies only with an explicit
  `--apply` flag against local/dev
- override application: overrides are respected at read time, never
  rewritten by banding runs

### 1C. Eligibility read model (pure, server-only)

New module namespace `lib/adle/` (ADLE-owned read models, separate from
`lib/writing-engine/` per the blueprint's ownership boundaries), starting
with `lib/adle/dictionary-eligibility.ts`:

Pure functions deriving the ladder from row inputs — statuses are computed,
never stored (blueprint: "statuses on one dictionary, not two stores"):

1. `recognisable` — active dictionary word row
2. `evidence-eligible` — recognisable + at least one active, approved
   micro-skill support mapping + canonical truth present
3. `assignment/diagnostic-eligible(childBand)` — evidence-eligible +
   `review_status` approved for assignment + active teaching content for a
   mapped skill + word `frequency_band`/`age_band` within the supplied
   child band (the only place frequency/AoA act; they never touch the Level)
4. `review-eligible(childId)` — was actually taught or probed for this
   child. This slice defines the interface with an injected
   `TaughtWordHistoryProvider`; until the review-scheduler slice supplies a
   real provider, the default provider returns none (fail closed)
5. `mastery-breadth-eligible(childBand)` — evidence-eligible + within the
   child's band; the breadth-target consumer arrives in a later slice

Plus `effectiveComplexityLevel(word)` = active override else computed level
for the active banding version, and typed readers for the allocation table.

No browser imports, no RLS widening, no child/parent UI in this slice.

### 1D. Regression coverage

- `scripts/adle-banding-regression.py` — formula unit truths (monotonicity,
  the Level-1 guarantee, note→class mapping, mismatch proxy on known words,
  threshold edges), fail-closed skips, unknown-note listing, override
  precedence, allocation recompute correctness on fixtures, and **parity**:
  banding the 2026-06-29 candidate batch reproduces the approved preview
  numbers exactly (874 banded; 424/342/108; 372 cells; 365 under floor)
- `lib/adle` regression via the repo's script-runner pattern, registered as
  `npm run adle:dictionary-eligibility-regression` — ladder derivations,
  the frequency/AoA firewall (a Level change never follows from a band
  change and vice versa), fail-closed defaults for missing
  inputs/providers, obscure-word exclusion from breadth eligibility
- `python3 -m py_compile` gate for the new scripts, matching Phase 5
  verification style

## Implementation order

1. 1A migration (inspection-only until owner approves apply to local dev)
2. 1B banding runner, dry-run against the imported candidate batch; parity
   check against the preview oracle
3. 1C eligibility module with fixture-backed tests
4. 1D regressions registered; full verification pass
5. Closeout: decision-log entry + status flip in this document

## Acceptance criteria (traceable to the contracts)

- banding rows exist only for words with complete structural metadata;
  everything else is reported, not defaulted (fail closed)
- frequency/AoA appear nowhere in Level computation; they appear only in
  statuses 3 and 5 (obscure-word firewall holds at the type level: the
  banding module does not receive band fields)
- overrides survive a re-banding run untouched; effective level prefers the
  active override
- the allocation table is recomputed, never hand-edited; consumers read it
- statuses are derived on one dictionary; no second word store, no stored
  ladder column
- the workbook's policy columns are nowhere read at runtime
- banding the candidate batch reproduces the approved preview exactly
- no assignment, review, evidence, proficiency, reward, resolver, RLS, or
  production changes

## Explicit non-goals

- no review scheduler, composer, or evidence writes (later slices)
- no admin UI for overrides (storage + script path only; UI is its own
  slice after the read models exist)
- no hosted/production Supabase mutation, no `supabase db push`
- no dictionary content changes; the population pass is separate and feeds
  this slice's runner through the existing import path
- no `micro_skill_catalog` mutation

## Open questions for the owner — resolved 2026-07-04/05

1. Namespace confirmation: **resolved — `lib/adle/` introduced** with the
   owner's "proceed to implementation" instruction (the recommended option;
   keeps the blueprint's ADLE/writing-engine/reward boundaries visible in
   the code layout).
2. Migration apply target: **local dev only remains the approved target**,
   but no apply has happened yet — implementation found the local dev
   database with an empty schema (no migrations, no Phase 5F import).
   Rebuilding local dev (apply `20260629120000` + `20260705090000`, re-run
   the Phase 5F import, then the banding runner's guarded `--apply`) is the
   follow-up step. Hosted remains untouched.
