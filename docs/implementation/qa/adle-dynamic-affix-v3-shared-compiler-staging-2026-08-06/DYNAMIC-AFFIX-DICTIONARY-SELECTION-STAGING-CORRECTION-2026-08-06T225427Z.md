# Dynamic Affix Teaching Dictionary transfer selection — staging correction accepted

Recorded at `2026-08-06T22:54:27Z` (`2026-08-06T23:54:27+01:00`). This is an
additive correction receipt for
[`STAGING-ACCEPTED-2026-08-06T194534Z.md`](./STAGING-ACCEPTED-2026-08-06T194534Z.md);
it does not replace the original shared-compiler acceptance.

## Accepted implementation and staging identities

- implementation SHA: `b6687cd342d53d5c57b9d4da4863c5de9fda1520`;
- implementation branch: `codex/dynamic-affix-dictionary-transfer-selection`;
- staging deployment: `dpl_FQjwTKe452oCwQUkeZqbFagqZwAT` (`Ready`),
  `https://scarletts-spells-staged-jl31gp22i.vercel.app`;
- staging Vercel project: `scarletts-spells-staged` /
  `prj_oJkffstOtacc4juYloXajHpjJUha`;
- staging Supabase project: `jlhotktspjvffslvuyfz`;
- compiler authority: `shared_authoritative`; the normal writer recorded
  `legacyInvoked: false` and exact public V3, assignment-plan and persisted
  binding parity.

An initial disposable run whose full SHA pin was mistyped was rejected before
acceptance, deleted in full, and proved zero residue. The accepted run was
recreated with the exact SHA above.

## Selection and fingerprint proof

Dynamic Affix profiles now provide governed candidate membership and
pedagogical constraints, not a fixed four-word production roster. The
`dynamic_affix_transfer_selection_v1` policy considers every reviewed,
route-ready, transfer-eligible profile member, covers missing declared forms,
Meaning Sort groups and the existing one-form direct/changed contrast, then
uses declared form order, declared meaning-group order, direct-before-changed
strategy and normalized word text as deterministic tie-breaks. Database UUIDs,
relation order, insertion order and timestamps are never ranking inputs.

The live read-only staging and production audits each found ten profiles and
forty reviewed members with no diagnostics. Their environment-local hashes
remain separate:

- staging legacy raw profile fingerprint:
  `43ddc766593a2adb1b8f14eee82ea47d5e769eb18f1f0b8e06674542312a633f`;
- production legacy raw profile fingerprint:
  `d63003bca07d52da47cf3e6fddd5aab7ba86f3d284ad955fffbc3c8b58739b4d`;
- staging environment-integrity fingerprint:
  `33a8a5684ded14781ea3385e33030970a0de20b50343c82c917b64eae72a61c6`;
- production environment-integrity fingerprint:
  `af7e6e247f3f6f043a44bafbb5a6b1f70fd8f58cfd0a882e3406234635c01c6`.

The environment-neutral gates match exactly:

- semantic profile fingerprint V2:
  `5860dabc039daa16fb12182d2c6f51b20a4929e54167341a2a1c2efc09408020`;
- ordered 640-selection semantic fingerprint V2:
  `cc6e0a99ae7e65e57437c736323890ea1fe2877ae52f583b05df6c7516937970`.

Reversing the raw LY member relation and replacing every environment-local UUID
does not change selection. The former `quickly` / `slowly` relation-order
disagreement is removed: transfer order follows the versioned coverage and
semantic ranking contract. Meaningful candidate eligibility or lesson-order
changes still alter the semantic fingerprint and downstream parity artifacts.

## Regression results

- Teaching Dictionary transfer selection: ten profiles, ten expanded candidate
  pools, ten incomplete candidates excluded, 640 ordered one-to-four-authentic
  selections, 40 UUID/relation-order mutations and 640 exact legacy/shared
  public V3 cases;
- live staging and production audit: 640 ordered selections, 640 exact compiler
  parity cases and 640 exact plan/runtime cases in each environment;
- authority regression: ten profiles, 640 selections, 2,560 authority
  decisions and 266 public-leaf mutations;
- item counts: 16 for ordinary profiles and 18 for `-ful/-less`;
- semantic production baseline: 36 regressions passed;
- candidate-loader regression: four reviewed candidates loaded, one in-review
  candidate excluded, inactive micro-skill blocked;
- TypeScript application and script checks, ESLint, Next.js production build,
  architecture drift, documentation drift and staging-proof safety regression:
  passed.

The expanded-candidate fixture proves that a fifth reviewed word becomes
selectable without registration in code. Staging currently has exactly forty
members—four per profile—so no Teaching Dictionary content row was created or
edited merely to demonstrate expansion.

## Focused genuine learner proof

Normal-writer assignments were completed through the learner UI for:

- `direct_one_form` (`-ment`);
- `two_form` (`-able/-ible`);
- `visible_tion` (child-visible `-tion`, true morphological `-ion`).

Each lifecycle exercised incorrect feedback and disclosure, four Cover Checks,
four Dictations, Reflection, reload/resume and completion. Persisted results for
each assignment were identical: 14 attempts, four Cover Checks, four
Dictations, four taught/evidence rows, one authentic learning item, one
authentic schedule, one authentic schedule route, zero transfer schedules or
routes, one review bundle and Reflection, and four rewards. The all-word
evidence/reward contract and authentic-only scheduling contract therefore
remain separated.

## Cleanup and boundaries

Every fixture-owned row and the disposable auth user were deleted. Residue is
zero across children, assignments, assignment items, learning items, attempts,
reflections, taught history, review bundles, schedule words, schedule routes,
treasures, treasure events and auth users. Protected counts returned exactly
to baseline. The ten-profile semantic and environment-integrity projections
were unchanged after cleanup.

Production remained on `legacy_authoritative` throughout staging reacceptance.
No production data, production configuration, Dynamic Prefix behavior,
canonical intake/backlog, Common Word Lab, Generic Snapshot, Closed Compound,
Base Word, evidence weights, review intervals, rewards or historical
assignments were mutated.
