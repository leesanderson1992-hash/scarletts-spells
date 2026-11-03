# Canonical dictionary pilot staging Preview — 2026-11-03

The isolated staging Vercel project `scarletts-spells-adle-staging-20261025`
built committed source `6e12795d2ed5ec0f833d08345ce0c88d65c7d07e` as Preview
`dpl_6hnXMTrHPi62GupW7x1eHechNsU1` at
<https://scarletts-spells-adle-staging-20261025-qjn0n1j9m.vercel.app>.
The deployment was `Ready` on Vercel inspection. Its Preview configuration
points to staging Supabase, selects the staging ADLE environment, and holds
writing-context AI. A unique 32-character `NEXT_DEPLOYMENT_ID` was supplied
at build and runtime.

The protected, signed-in `scripts/prove-canonical-dictionary-preview.mjs`
browser proof passed against that exact Preview. It checked the format queue,
dictionary index, free-base family search, a representative Overview, the
reviewed band selectors, inline help controls, and Lesson checks. It made zero
dictionary mutations. Staging has no persisted approved bound-root family, so
that browser proof did not cover bound-root search. A separate rolled-back
staging transaction covers bound-root family revision and publication.

The reviewed 14-word Production candidate has not been imported. Only two of
those spellings exist in staging, with different canonical IDs and no suffix
profile memberships, so this Preview does not prove the exact batch. Four
rolled-back staging publication proofs cover the base, root, structured base,
and suffix dependency shapes. The read-only Production preflight confirms all
14 word IDs and source hashes, the selected existing families, and one approved
base anchor for every free-base part. The full batch still needs a controlled
end-to-end rehearsal and release checks before any Production import.
