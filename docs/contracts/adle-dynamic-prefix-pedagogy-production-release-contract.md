# ADLE Dynamic Prefix pedagogy production release contract

Status: authorised production attempt rolled back on a failed live QA-route
gate; production is shadow with prior profile content restored.

## Immutable source

The production envelope reads the exact bytes at:

`docs/implementation/seed-data/teaching-dictionary/releases/2026-08-03-dynamic-prefix-pedagogy-v1/manifest.json`

The required SHA-256 is
`9890cf6149b3a411b2ea1aa4cd097b1727fa12678b72a52d3d36572c9f400a10`.
The manifest remains staging-pinned and is neither copied nor rewritten for
production. The production release identity and deterministic batch identity
belong to the separate envelope, not to a second teaching catalog.

## Tool and commands

The guarded tool is
`scripts/adle-dynamic-prefix-pedagogy-production-release.ts` and supports:

- `validate`: verifies exact manifest bytes, package structure, production URL
  identity, and the distinct production release/batch identity without opening
  a database connection;
- `plan`: opens a repeatable-read, explicitly read-only transaction and returns
  exact profile deltas, rollback hashes, protected table counts/hashes,
  migration/function facts, Prefix V2 counts/readability, and Vercel facts;
- `release`: mutation command; requires the production flag, exact
  publication token, a just-reviewed plan SHA, the 20-item migration in the
  ledger and live function, a serializable transaction, and an advisory lock;
- `verify`: read-only equality and protected-snapshot verification after a
  content release and before compiler-mode activation;
- `deactivate`: exact three-field restore from the five complete
  projections retained in the deterministic production batch receipt.

`validate`, `plan`, and `verify` accept only:

`ADLE_DYNAMIC_PREFIX_PEDAGOGY_PRODUCTION_RELEASE=read-only-preflight`

The mutation commands accept only:

`ADLE_DYNAMIC_PREFIX_PEDAGOGY_PRODUCTION_RELEASE=authorised-production-release`

They additionally require their distinct exact `--confirm` token. `release`
also requires `--confirm-plan-sha256` from an immediately preceding plan.
These acknowledgements are intentionally not embedded in the mutation npm
scripts.

Production release receipts use Teaching Dictionary ledger package type
`micro_skill_content_batch_v1` and schema
`dynamic_prefix_pedagogy_release_v1`. This package has no separate workbook;
the immutable human-reviewed manifest is its review surface, so the accepted
manifest SHA is persisted as both the required workbook/source fingerprint and
package fingerprint. The ledger records that basis explicitly and verification
requires exact equality across release ID, type, schema, both hashes, target
environment, and importer version.

The 2026-08-03 attempt is recorded in the
[production rollback receipt](../implementation/qa/adle-dynamic-prefix-pedagogy-production-rollback-receipt-2026-08-03.md).
The content release itself verified, but the live production QA URL returned a
login redirect rather than the required HTTP `404`. Guarded rollback removed
the compiler override and restored the exact prior five-profile projection.

## Mechanical identity gates

- Production Supabase is pinned to `wwohrqtunajrbwxyssjf`.
- Staging `jlhotktspjvffslvuyfz`, missing refs, and unknown refs are rejected.
- Production Vercel is pinned to project `scarletts-spells`, ID
  `prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`.
- Plan requires the latest production deployment to be Ready and sourced from
  the exact local baseline SHA.
- Plan reads Vercel environment-variable names only. It never prints values.
- Before content publication the compiler-mode key must be absent, making the
  source fallback `shadow`; an already configured key blocks the preflight.

## Permitted future data delta

Only these fields on the five existing profile rows may change:

1. `meaning_bins`;
2. `prefix_choices`;
3. `intro_content`.

The update is guarded by profile ID, micro-skill key, active row status,
approved review status, and `production_enabled=true`. The tool does not change
profile activation, IDs, membership, canonical words, metadata, morphology,
dictations, learner items, assignments, attempts, evidence, schedules, rewards,
taught history, or authentication rows. The production batch receipt is an
administrative release/rollback record; it is not learner content.

The release transaction captures full before projections for all five profiles
and the protected snapshot before writing. It compares every non-target profile
field and all protected table presence/count/hash facts before commit. Any drift
rolls back the transaction.

## Protected snapshots

Each protected table is represented by:

- presence or absence;
- exact row count;
- SHA-256 over the ordered database-side row fingerprints.

Absence is itself protected state. A table appearing or disappearing therefore
blocks release just like a count or content change. Raw learner/authentication
rows are never printed.

## Migration boundary

`release` is blocked until
`20260803113000_allow_in_im_il_ir_dynamic_prefix_20_item_plan.sql` is present in
the production migration ledger and the live composed-plan function contains
the matching narrow 20-item guard. The plan also requires the 16-item default,
all reviewed 18-item exceptions, and service-role-only function execution.
The migration contains no assignment mutation and cannot create a plan by
itself.

## Rollback

Application rollback is compiler mode `shadow` plus a deliberate redeployment.
Content rollback, when separately authorised, is the guarded `deactivate`
command restoring only the three release-owned fields from the five captured
projections. The additive 20-item database allowance remains unless separately
reviewed for database rollback.

## Regression coverage

`scripts/adle-dynamic-prefix-pedagogy-production-release-regression.ts` proves:

- staging, unknown and missing database identities fail;
- read-only planning needs no mutation token;
- mutation commands need the explicit mutation flag and exact command token;
- exact package bytes and SHA are mandatory;
- the production batch ID is deterministic and distinct from staging;
- unexpected/missing profile columns fail;
- only the three approved fields are mutable;
- profile activation and member rows have no update path;
- all five rollback projections are captured;
- protected presence/count/hash drift fails;
- Vercel project, deployment SHA/readiness, and compiler-mode assumptions fail
  closed;
- the plan transaction is explicitly read-only and contains no write query;
- the future release remains blocked until the narrow migration is verified.

The full validation matrix and current read-only findings are recorded in the
[production preflight report](../implementation/qa/adle-dynamic-prefix-pedagogy-production-preflight-2026-08-03.md).
