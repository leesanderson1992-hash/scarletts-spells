# Dynamic Prefix pedagogy and UX staging receipt — 2026-08-03

## Scope and identity

- Repository baseline: `cdf1b2dbb1c4064e85121040b58631f9c55f7fd1` on clean, synchronized `main` before implementation.
- Vercel project: `scarletts-spells-staged` (`prj_oJkffstOtacc4juYloXajHpjJUha`).
- Final pinned Preview: `dpl_3Aeq5A7iFmMonLHHbKAhQqbNmtP7`, `https://scarletts-spells-staged-die6sdsgz.vercel.app`, status Ready, environment Preview.
- Five-profile flow Preview: `dpl_HXpXfbpr8jaXgGfT4QZL4erTubfS`, `https://scarletts-spells-staged-emefktdwx.vercel.app`, status Ready, environment Preview.
- Supabase project: staging ref `jlhotktspjvffslvuyfz`.
- Production ref `wwohrqtunajrbwxyssjf` was rejected and was not read from or written to by the release workflow.
- Immediately before staging writes, the authorized account was revalidated as `katiesanderson8624@gmail.com` and the owned, unarchived learner as `ADLE Prefix QA` (`2128f0d7-07de-4f4a-82fc-1464eb2bbedc`).
- QA flags selected shared-authoritative compilation and the staging-only launcher. The production-mode route regression resolves the launcher to `404`.

## Governed content and persistence

- Release: `adle_dynamic_prefix_pedagogy_staging_v1_2026_08_03_r2`.
- Import batch: `10a761b4-4e00-4e7b-8fc9-edc5af5a9d35`.
- Package SHA-256: `9890cf6149b3a411b2ea1aa4cd097b1727fa12678b72a52d3d36572c9f400a10`.
- Released projection SHA-256: `fe0c6af33ef5bbe65f1eda2b41f1981af8493ccac59f917d8a1619873ec2846f`.
- Staging migration: `20260803113000_allow_in_im_il_ir_dynamic_prefix_20_item_plan.sql`.
- The migration permits 20 items only for `D4_MOR_PREFIXES_IN_IM_IL_IR` when the Prefix pedagogy marker, Prefix Form Sort policy, four words, exact activity distribution, and 20 distinct IDs are all present. The existing generic 16/18-item rules remain unchanged.
- Protected counts after release: learning items 80; assignments 44; assignment items 748; attempts 468; review schedules 105; rewards 0. The profile-only release changed no protected learner row count.

## Normal-path assignments

The launcher used the normal loader, selector, shared compiler decision,
assignment plan, writer, persistence, route resolver, runtime adapter, and
learner renderer. It did not construct a hand-written payload.

| Date | Profile | Assignment ID | Items | Durable result |
|---|---|---|---:|---|
| 2026-08-03 | `D4_MOR_PREFIXES_UN` | `7f10ef31-ed98-4d54-93b5-979d88fd86bc` | 16 | Completed; 14 persisted attempts; reflection and taught history present |
| 2026-08-04 | `D4_MOR_PREFIXES_DIS_MIS` | `f2547449-95d0-4d33-8014-19dce964fc6d` | 16 | Completed; 14 persisted attempts; reflection, taught history, and review schedule present |
| 2026-08-05 | `D4_MOR_PREFIXES_IN_IM_IL_IR` | `affcb73a-c3da-4441-9491-04ba390b3f3b` | 20 | Completed; 18 persisted attempts; reflection, taught history, and review schedule present |
| 2026-08-06 | `D4_MOR_PREFIXES_RE_PRE` | `811d98db-62e3-44d7-ac1d-c1d83956da9e` | 16 | Completed; 14 persisted attempts; reflection, taught history, and review schedule present |
| 2026-08-07 | `D4_MOR_PREFIXES_SUB_INTER_SUPER` | `276864ae-0d47-4d4a-83eb-e6f27e8c795f` | 18 | Completed; 16 persisted attempts; reflection, taught history, and review schedule present |

The `un-` flow correctly retained an already-active pending learning item and
therefore created no new review-schedule row. This is protected scheduler
behavior, not a missing completion write. No relevant Nuggets were awarded, so
reward count remained zero; reward-bridge behavior is covered by its unchanged
contract regression.

The final Preview’s compact three-card grid was recaptured through one additional
retained, normal-path QA assignment on 2026-08-08:

- Queue fixture: `b62b9179-a251-4a25-890f-0f83861b2b63`, sourced as
  `dynamic-prefix-pedagogy-v1-visual-recapture:2026-08-03:D4_MOR_PREFIXES_SUB_INTER_SUPER` from an unused reviewed member.
- Assignment: `1af67bae-3840-4bbc-90c1-3aa39a7115b3`, 18 items, completed.
- This retained fixture is narrowly identified here. No older assignment,
  taught-history row, or unrelated staging row was reopened, deleted, or altered.

## Learner-flow proof

- All five profiles rendered one teaching card per target in target order, exactly three Learn screens, deterministic reviewed Build choices, selected-prefix safe wrong feedback, and no Prefix result overview.
- `in-/im-/il-/ir-` rendered the genuine four-category Prefix Form Sort and persisted 20 assignment items.
- One deliberate safe wrong sort or form-sort choice was exercised in every core flow. Feedback described only the selected prefix and ended with `Try again.`
- Build pools were inspected for exact reviewed ordering and unique correct choice.
- Reflection rendered the same teaching-card data, the locked singular/plural copy, and the approved neutral learner text. Reload/resume restored the `un-` and `in-/im-/il-/ir-` drafts.
- Cover Check was exercised with mouse/touch boundary coverage in the real-component Playwright fixture and keyboard Enter, Space, and ArrowRight in the learner flow. A closed cover protected the answer and did not complete the item; Check remained the completion boundary.
- All five completed routes were loaded at 390×844 with no crash or introduced horizontal overflow. The responsive real-component interaction suite additionally exercised touch and mouse at 390×844 and 1440×900.
- Dynamic Affix retained `overview_and_reflection`; Common Word Lab remained inactive; Generic Snapshot source contracts were unchanged.
- Shared-authoritative assignment decision regressions covered 140 fixture positions across three modes and prove zero legacy compiler calls in shared-authoritative mode. All five launcher profiles reported `shared_migration`.

## Evidence and human gate

- [Screenshot evidence index](adle-dynamic-prefix-pedagogy-ux-2026-08-03.md)
- Exactly 25 optimized desktop PNGs are linked from the index.
- The pre-existing narrow progress-pill clipping was not broadened into this stage and did not block any required control or evidence state.
- Human screenshot review and child acceptance remain required before publication.

## Automated verification

All final gates passed:

| Command | Result |
|---|---|
| `npm run lint` | Pass; rerun after the final Playwright harness edit |
| `npx tsc --noEmit` | Pass; rerun after the final Playwright harness edit |
| `npm run typecheck:scripts` | Pass; rerun after the final Playwright harness edit |
| `npm run build` | Pass; Next.js production build, 26 static pages generated |
| `npm run adle:dynamic-prefix-pedagogy:validate` | Pass; 12 definitions, five profiles, package SHA matched |
| `npm run adle:dynamic-prefix-pedagogy-regression` | Pass |
| `npm run adle:dynamic-prefix-20-item-persistence-regression` | Pass |
| `npm run adle:cover-shutter-threshold-regression` | Pass |
| `npm run adle:cover-shutter-interaction-regression` | Pass; three applicable tests, three cross-project skips |
| `npm run adle:dynamic-prefix-shared-authority-regression` | Pass; 140 positions, three modes |
| `npm run adle:dynamic-prefix-qa-regression` | Pass |
| `npx tsx scripts/adle-dynamic-prefix-runtime-regression.ts` | Pass |
| `npm run adle:shared-affix-compiler-regression` | Pass; 15 profiles, 75 reviewed target slots |
| `npm run adle:shared-affix-production-parity-regression` | Pass |
| `npm run adle:route-resolution-regression` | Pass |
| `npm run adle:persisted-route-metadata-regression` | Pass |
| `npm run adle:composer-payload-regression` | Pass |
| `npm run adle:composer-persistence-regression` | Pass |
| `npm run adle:generic-snapshot-contract-regression` | Pass |
| `npm run adle:generic-snapshot-reader-regression` | Pass |
| `npm run adle:word-lab-completion-contract-regression` | Pass |
| `npm run adle:attempt-capture-regression` | Pass |
| `npm run adle:evidence-regression` | Pass |
| `npm run adle:review-scheduler-regression` | Pass |
| `npm run adle:reward-bridge-regression` | Pass |
| `npm run adle:semantic-production-baseline` | Pass; 31 regressions |
| `npm run adle:architecture-inventory-generate` | Pass; 12 inventory files generated and reviewed |
| `npm run adle:architecture-drift-check` | Pass |
| `npm run adle:composable-documentation-regression` | Pass |

The first interaction-suite run timed out at development-page navigation before
executing pointer assertions. A second run proved both pointer tests but exposed
a hydration race in the repeated keyboard setup. The harness was corrected to
use a 90-second real `load` boundary and one worker; the final complete run
passed. These were test-readiness failures, not relaxed product assertions.

Production deployment and production data mutation were not performed. No
branch or commit was pushed.
