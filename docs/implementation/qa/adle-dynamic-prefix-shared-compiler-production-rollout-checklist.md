# Dynamic Prefix shared compiler production rollout checklist

Status: not authorised; no production deployment or mutation belongs to the
four-profile implementation/staging goal.

## Authority gate

- Obtain separate written production deployment and disposable-proof approval.
- Require clean `main`, `HEAD == main == origin/main`, zero divergence, and the
  staging receipt for the exact commit being released.
- Pin production Supabase `wwohrqtunajrbwxyssjf` and production Vercel project
  `scarletts-spells` / `prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl` only after approval.
- Abort if staging credentials, an unknown project, or a different commit is
  observed.
- Reconfirm no database migration, RPC, Teaching Dictionary or profile change.

## Read-only preflight

- Verify the four migrated profiles and their seven eligible members match the
  approved staging source hashes and shared registry form/policy projections.
- Verify `D4_MOR_PREFIXES_UN` remains `legacy_pending_exact_source`.
- Verify Dynamic Affix remains on its existing writer and Common Word Lab plus
  Generic Snapshot remain inactive.
- Run the complete local regression, build, documentation drift and performance
  suite from the staging receipt.

## Guarded rollout

1. Deploy `ADLE_DYNAMIC_PREFIX_COMPILER_MODE=shadow`.
2. Observe zero semantic/fingerprint/plan/binding/count mismatches and green
   p95/p99 performance for the four migrated profiles.
3. Deploy `enforced_parity`; create only explicitly authorised disposable
   assignments for all four profiles and prove blocked cases write nothing.
4. Deploy `shared_authoritative`; prove the legacy compiler is not invoked for
   migrated profiles.
5. Complete one 16-item and the `SUB_INTER_SUPER` 18-item learner lifecycle,
   including reload/resume, dictation, reflection, attempts, evidence,
   authentic-only schedules, taught history and rewards.
6. Roll back to the pre-migration application deployment and prove a
   shared-created V2 assignment still reads/resumes/completes; forward-restore.
7. Remove all disposable rows in foreign-key-safe order and audit zero residue.

## Observation and retirement

- Observe seven consecutive shared-authoritative production days.
- Require at least 50 successful migrated-profile assignments and at least five
  for each migrated profile.
- Require zero parity, fingerprint, adapter, plan, binding or count blockers.
- Require p95 regression at most 10% and 20 ms absolute, compiler p95 at most
  10 ms, p99 at most 20 ms, and estimated heap growth at most 5 MB per decision.
- Only then remove the temporary environment mode for these four profiles and
  hard-code shared authority.
- Retain the old compiler and explicit profile-authority registry for `un-`.

## Receipt

Record commit/deploy IDs, identity checks, profile keys, source hashes, counts,
mode totals, mismatch totals, performance, lifecycle assertions, rollback and
forward-restore results, cleanup audit, zero dictionary/profile writes, and the
explicit statement that `un-` was not migrated.
