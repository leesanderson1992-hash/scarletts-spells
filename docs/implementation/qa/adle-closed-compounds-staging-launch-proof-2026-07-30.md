# Closed Compounds staging launch proof — 2026-07-30

Scope: `D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS`

Environment: dedicated staged Vercel project and Supabase project `jlhotktspjvffslvuyfz`. Production selection remains disabled.

## Released staging state

- Stable staged deployment: `dpl_FLhyKsNvX31BTdZwawAS5Mut5Xmv`
- Stable URL: `https://scarletts-spells-staged.vercel.app`
- Profile row: active, `approved_for_first_exposure`, `production_enabled = false`
- Explicit staged route marker: `ADLE_ROUTE_ACTIVATION_ENVIRONMENT=staging`
- Eligible Teaching Dictionary pool: `bedroom`, `breakthrough`, `football`, `playground`, `rainbow`, `sunshine`, `weekend`
- Assignment selection: four deterministic words, stored in the immutable 18-item assignment snapshot

The loader was corrected to select active, approved dictionary, metadata, and dictation rows before indexing by canonical word. Superseded dictation versions can no longer displace an active sentence nondeterministically.

## Automated gates

- TypeScript: passed
- focused ESLint: passed
- production Next.js build: passed locally and on Vercel
- closed-compound profile/regression: passed
- composer, review-scheduler, evidence, completion-contract and reflection regressions: passed
- shared D4 morphology pilot and base-word contract regressions: passed
- all dynamic-prefix and dynamic-suffix profile regressions: passed
- live staged profile compilation: one approved profile, seven eligible dictionary members, four unique selected dictation sentences

## Disposable-child browser proof

Disposable child: `b8e3a45d-8cca-4e7e-af2a-2055d1b112dd`

Assignment: `16ca6c63-b16c-44ca-bfef-66d87fc6caf6`

Verified against the stable staged URL:

- dedicated Word Lab branding and six-stage progress rail;
- all eight muddled word pieces shown together;
- complementary jigsaw geometry;
- physical pointer drag and snap for `rain + bow`;
- keyboard select-and-join for the remaining three compounds;
- reload retained the completed `rainbow` pair;
- independently ordered word and meaning columns;
- live cursor-following arrow, snapped persistent arrow, incorrect retraction and retry;
- shared Cover Check rendered once and exposed one spelling input;
- `rain bow` was rejected for `rainbow` and preserved as the raw attempt;
- shared Dictation exposed one full-sentence input and used four distinct approved sentences;
- a drafted Dictation sentence survived reload;
- Reflection displayed the missed `rainbow` attempt, accepted a visible high-contrast written response, and appeared on the completed route.

## Database completion proof

Before completion, assignment creation produced exactly 18 assignment items and zero attempt, reflection, taught-history, learning-item, or schedule rows.

After completion:

- assignment status: `completed`;
- assignment items: 18 completed;
- attempt events: 18 total;
- guided/read-only events: 10, all `is_correct = null`;
- controlled spelling events: 4, with the raw `rain bow` miss preserved;
- full-sentence Dictation events: 4, all from distinct approved sentences;
- reflection rows: 1;
- taught-word history rows: 4;
- active review bundle: 1, next due `2026-07-31`;
- scheduled review members: 4.

## Cleanup

The disposable child was deleted after the proof. Post-cleanup counts were zero for the child, daily assignment, assignment items, attempt events, reflection, review bundle, schedule members, taught-word history and learning items.

## Release boundary

This record approves the profile for staging. It does not enable `production_enabled`, alter production Supabase, or provide production-release authority.
