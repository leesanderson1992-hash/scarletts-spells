# Approved `un-` Dynamic Prefix staging profile release

This immutable, staging-only package projects the approved production
`D4_MOR_PREFIXES_UN` profile and its seven members onto the already-approved
staging canonical words. It creates no canonical word, metadata, morphology,
dictation, learner, assignment, evidence, schedule, or reward row.

The package is operated only through
`scripts/adle-dynamic-prefix-un-profile-release.ts`. The tool pins Supabase
staging project `jlhotktspjvffslvuyfz`, rejects production and unknown
identities, plans before mutation, applies in one serializable transaction,
reads every released field back, and provides guarded deactivate/reactivate
commands.

Production identifiers in `manifest.json` are provenance only. Environment-
local canonical word identities are resolved by immutable `wordKey`; production
UUIDs are never copied to staging.
