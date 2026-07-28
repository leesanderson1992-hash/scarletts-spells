# Dynamic Suffix `-ful/-less` staging runtime proof — 2026-07-28

## Scope

This record covers only `D4_MOR_SUFFIXES_FUL_LESS` in staging. Production
remains disabled. No production database row, production allowlist, production
gate, or production deployment changed.

## Reviewed content and guarded import

- The reviewed package contains exactly `careful`, `careless`, `hopeful`, and
  `hopeless`.
- Its SHA-256 is
  `fa5d07a334dd1aae42f8784629c102466bf64535fee1adfa3e5c8448efb78fa3`.
- Guarded staging batch `e28e4a3b-9058-46b5-a693-75399198dda9` created one
  active, approved four-member profile with `production_enabled = false`.
- The package keeps child teaching splits separate from canonical morphology
  and includes reviewed pronunciation, band, complexity, dictation, token,
  transformation, and provenance facts.
- Migration `20260728100000_allow_ful_less_dynamic_suffix_18_item_plan.sql`
  permits the reviewed 18-item exception only for this exact profile and
  payload shape, while retaining the existing reviewed prefix exception.

## Automated and build evidence

- The focused `-ful/-less`, shared Dynamic Suffix, and Dynamic Prefix runtime
  regressions passed.
- Application TypeScript and script TypeScript checks passed.
- The final staging Preview build passed on deployment
  `dpl_HnL28PxUuBiE9aFNY25EpzhWNqNR`
  (`https://scarletts-spells-7bfz6ejvu-leesanderson1992-hashs-projects.vercel.app`).
- The stable staging alias is
  `https://scarletts-spells-staged-ful-less.vercel.app`.

## Disposable-child runtime evidence

Disposable assignment `4bea7a1d-d32c-47d4-adfa-5144c9e79dbd` completed the
real child route and passed its database verifier:

- exactly 18 completed assignment items;
- exactly 16 attempt events: eight guided, four controlled-spelling, and four
  reviewed full-sentence dictation events;
- one `ful-less-opposite-meanings-v1` reflection;
- four taught-word-history records;
- four active review schedules.

The run verified all five introduction screens, clean discovery meanings, one
`-ful` and one `-less` Cleaver, four `FULL OF` / `WITHOUT` meaning matches,
two meaning-led builds with stable varied tile order, capitalised `Careful`
accepted as correct, all four reviewed dictations, reflection, mid-lesson
reload/resume, completion, and completed-state reload.

## Defects found and corrected

The live proof found a legacy prefix label in the meaning overview. The shared
renderer and position-aware runtime now carry the reviewed combined suffix
label, so the overview says `What -ful and -less can do` and
`Suffix meanings, four words`. Focused regressions prevent a return to the
legacy `What un- can do` fallback.

After each bounded correction, the disposable fixture was removed, regression
and TypeScript checks were rerun, a fresh Preview was deployed, and the proof
was restarted from a new child and assignment.

## Cleanup and owner/child verification

The disposable child, auth user, learning item, assignment, attempts,
reflection, taught history, review schedules, and related fixture-owned rows
were removed. The cleanup verifier passed with no fixture residue.

A fresh, untouched 18-item lesson is prepared under the existing staging test
account:

- child: `FUL LESS Child Verification`;
- child id: `8108e996-6a37-462d-a717-e4c1b1a661b8`;
- assignment: `0ea3fc92-859f-4e00-8308-2cfcc30bdd60`;
- starting state: pending, 18 pending items, zero attempts, zero taught words,
  and zero schedules.

Automated staging proof has passed, but final owner/child verification has not
yet been recorded. The profile is therefore
`staging_verification_pending`, not `staging_approved`. Production remains
disabled and requires final child approval followed by separate written
production authorisation.
