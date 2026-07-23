# `in-/im-/il-/ir-` Dynamic Prefix v2 — Staging completion runbook

## Current verified position

The shared v2 template is already used; this is a profile-data and proof rollout.
The staging profile is active and reviewed, but remains `production_enabled = false`.
The correction package is `in-im-il-ir-staging-correction-package.json` and its
SHA-256 is `b726fce03a96382005b09bbbb9c2c6de729db7d433d5c7c64521fce2dd16b439`.
Its staging-only correction batch is `1c08ae26-6a57-4c8c-97b7-814cb081f1a5`.

The correction preserves the four existing reviewed staging sentence/audio
records (`illegal`, `impossible`, `incorrect`, `irregular`) and replaces only
their incorrect retained MorphoLex morphology, age/complexity bands and
provenance. Human-approved true morphology is canonical. Child activities use
the separate teaching split only.

## Required steps to complete the lesson

1. Validate the package before any write:

   ```sh
   npx tsx scripts/apply-adle-dynamic-prefix-in-im-il-ir-staging-correction.ts --validate
   ```

2. Apply only to the named staging database with `--environment staging` and
   the exact package hash. The importer starts one transaction, writes four
   canonical corrections, four metadata corrections and one profile
   presentation correction, verifies all seven records, then commits. Any
   invariant failure rolls back the complete batch.

3. Verify the runtime path. It must reject the profile if any word is missing
   an active approved frequency/age/complexity band, pronunciation metadata,
   human-approved morphology record, matching sentence/audio pair, valid
   target index, reconstructable teaching split, or exactly one prefix boundary.
   The released dynamic `un-` compatibility path remains unchanged.

4. Verify lesson behaviour. Transfer fill preserves authentic targets in
   oldest-first order, then chooses unused prefix forms first. With one or two
   authentic targets, the seven-word corpus can show all four forms. The build
   uses a different form from the cleaver whenever the immutable four-word
   lesson contains one. Meaning sorting shows neutral form labels only; the
   discovery cards contrast base/root meaning with new-word meaning.

5. Run the disposable staging proof. Use a newly created staging-only child and
   verified-misspelling fixtures; prove 1/2/3/4/>4 selection, transfer fill,
   reteach and stable ties, pending overflow, reload/resume, child completion,
   evidence, taught history, scheduling and cleanup. Do not use a live child.

6. Record the actual evidence in a dedicated proof file, then update the
   release registry and D4 readiness matrix to `staging_approved`. Keep the
   profile disabled. Production promotion is a later isolated transaction and
   needs a separate written approval explicitly naming
   `D4_MOR_PREFIXES_IN_IM_IL_IR`.

## Required verification commands

```sh
npx tsx scripts/adle-dynamic-prefix-word-lab-regression.ts
npx tsx scripts/adle-dynamic-prefix-four-profile-proof-regression.ts
npx tsx scripts/adle-dynamic-prefix-runtime-regression.ts
npx tsx scripts/adle-dynamic-prefix-assignment-plan-regression.ts
npx tsx scripts/adle-dynamic-prefix-staging-route-regression.ts
npx tsx scripts/adle-d4-mor-guided-pilot-regression.ts
```

The readiness CSV records every required word-level field, the source of truth,
the current staging state and the remaining proof/release gates.
