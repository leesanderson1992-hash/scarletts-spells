# Dynamic Prefix next-lesson activation receipt — 2026-08-07

Status: `ACTIVATED`

## Scope

This receipt records the authorised production correction and normal parent-path
activation of the next Dynamic Prefix lesson. No synthetic learner, hand-built
payload, Teaching Dictionary mutation, or lesson completion was performed.

## Root cause and correction

The reviewed `D4_MOR_PREFIXES_IN_IM_IL_IR` profile has six guided Split/Build
slots. Its governed compiler policy creates one Build activity for each prefix
form represented in the selected lesson, then uses Split activities for the
remaining slots. The genuine selection represented three forms and correctly
compiled as three Split plus three Build activities.

The production persistence function still required the earlier fixed two Split
plus four Build shape. Migration
`20260807014500_allow_governed_in_im_il_ir_20_item_distribution.sql` preserves
the exact 20-item Prefix Form Sort envelope while accepting only governed
`2/4`, `3/3`, or `4/2` Split/Build distributions whose payload and activity
counts match.

## Publication identities

- Source commit: `9ddc71e94980e292b0a35cb72d0c17de9ae171c3`
- Commit message: `fix(adle): allow governed prefix form distributions`
- Production Vercel project: `scarletts-spells` /
  `prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`
- Ready deployment: `dpl_Hgi7XompvtkgPRx1bHhxsN1ZUfie`
- Deployment source: exact source commit above
- Production Supabase ref: `wwohrqtunajrbwxyssjf`
- Migration version: `20260807014500`
- Migration SHA-256:
  `0598aa9aea1a5c58c25ffcaf1c080d3cc013a417de4d38f3b56079de0e71f11d`
- Live persistence-function SHA-256 after migration:
  `82aaa4bd968311fdb744cb2770994db8fff0ec9bbc6f8ef000b401c434ecced6`
- Function grants: service role allowed; `authenticated` and `anon` denied
- Existing 16-item default and reviewed 18-item exceptions retained

## Genuine activation result

- Assignment: `3d250bdd-ace9-46c4-ae9d-34cd162051f4`
- Plan date: `2026-08-07`
- Status after read-only open: `pending`
- Route payload: Dynamic Prefix Word Lab V2
- Profile: `D4_MOR_PREFIXES_IN_IM_IL_IR`
- Content version: `d4_mor_prefix_word_lab_v2`
- Presentation policy: `dynamic_prefix_pedagogy_v1`
- Lesson words: `invisible`, `impossible`, `incorrect`, `illegal`
- Assignment items: 20
- Unique positions: 20 (`1` through `20`)
- Prefix V2 provenance items: 20
- Profile-key-matching items: 20
- Guided distribution: three Split, four Prefix Form Sort, three Build
- Controlled items: four
- Dictation items: four
- Attempts written by opening the lesson: zero
- First screen rendered: `Learn 1 of 3 — What is a prefix?`

The initial failed activation had created only an empty pending assignment
header. The successful normal writer reused the guarded daily-plan identity and
persisted all 20 items atomically; no duplicate assignment was created.

## Validation

- `npm run adle:dynamic-prefix-20-item-persistence-regression` — pass
- `npm run adle:composer-persistence-regression` — pass
- `npm run adle:dynamic-prefix-pedagogy-regression` — pass
- `npm run adle:dynamic-prefix-shared-authority-regression` — pass, 140
  exhaustive positions and zero legacy calls in shared-authoritative mode
- `npm run adle:route-resolution-regression` — pass
- `npx tsx scripts/adle-dynamic-prefix-four-profile-proof-regression.ts` — pass
- `npx tsc --noEmit` — pass
- Focused ESLint for the changed regression — pass
- Migration dry run in a rolled-back production transaction — pass
- Post-migration ledger, function-hash and grant verification — pass
- Genuine parent activation and learner-route render — pass

## Boundaries

- The child must complete the lesson normally.
- No attempt, completion, evidence, schedule, reward, or taught-history row was
  created by the activation/read-only open.
- No unrelated queued Prefix learning item was changed.
- No Dynamic Affix, Common Word Lab, Generic Snapshot, compiler, selection, or
  curriculum-content change was made.
