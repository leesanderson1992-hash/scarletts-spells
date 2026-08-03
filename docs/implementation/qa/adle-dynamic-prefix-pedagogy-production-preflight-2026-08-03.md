# Dynamic Prefix pedagogy v1 — read-only production preflight

Date: 2026-08-03

Decision: `READY_FOR_SEPARATE_PRODUCTION_RELEASE_AUTHORITY`

Production writes performed: **zero**

This report records the guarded read-only preflight only. The narrow migration
was not applied, profile content was not changed, Vercel environment values
were not changed, and no production learner fixture or deliberate deployment
was created.

## Baseline and deployment

- Git baseline: `5c4dea7810033e69ee548f7f882e898024fa666f` on synchronized `main`.
- Production Vercel project: `scarletts-spells`,
  `prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`.
- Deployment: `dpl_52mk5ST8ekwciS4PSeQBUJRcofGH`, Ready, production.
- Deployment source: exact baseline SHA.
- Production Supabase ref: `wwohrqtunajrbwxyssjf`.
- Accepted package SHA:
  `9890cf6149b3a411b2ea1aa4cd097b1727fa12678b72a52d3d36572c9f400a10`.
- Production release ID:
  `adle_dynamic_prefix_pedagogy_production_v1_2026_08_03`.
- Deterministic production batch ID:
  `206216eb-4892-5e37-9819-9864f2008cfa`.
- Read-only plan SHA:
  `8b8c7a93367da526a6287c8ae12fd138c800af96164590428af9ae6767b7238f`.

The authorised push of the documentation handoff caused an automatic
production build. It deployed only the synchronized documentation commit and
did not change production data or environment values.

## Compiler-mode and environment-name inventory

`ADLE_DYNAMIC_PREFIX_COMPILER_MODE` is absent from production. Source therefore
resolves the compiler mode to `shadow`. A later authorised stage must set it to
`shared_authoritative` only after the migration and profile projections verify,
then deliberately redeploy.

The production environment-name inventory, with no values read into this
report, is:

```text
ADLE_7P_PILOT_LESSON_WORD_COUNT
ADLE_BASE_WORD_FAMILY_PILOT_ENABLED
ADLE_BASE_WORD_FAMILY_PILOT_SCOPE
ADLE_CANONICAL_INTAKE_ENABLED
ADLE_CLOSED_COMPOUND_PRODUCTION_ENABLED
ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED
ADLE_DYNAMIC_SUFFIX_PRODUCTION_ENABLED
ADLE_MORPHOLOGY_UN_PILOT_CHILD_IDS
ADLE_MORPHOLOGY_UN_PILOT_ENABLED
ADLE_WORD_LAB_ATOMIC_COMPLETION_ENABLED
ADMIN_EMAILS
ADMIN_USER_IDS
CRON_SECRET
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
SB_SERVICE_ROLE_KEY
SUPABASE_SERVICE_ROLE_KEY
TASK_SUBMISSION_CRON_SECRET
WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS
```

## Five-profile production delta

All five rows are active, `approved_for_first_exposure`, production-enabled,
and have exactly seven active reviewed assignment-eligible members. Every
member maps to exactly one accepted manifest choice.

For every profile the changed fields are exactly `meaning_bins`,
`prefix_choices`, and `intro_content`. All other profile fields—including ID,
activation, source metadata, review facts, and timestamps—are unchanged.

| Profile | Production profile ID | Current hash | Proposed hash | Rollback hash | Members / canonical hash |
|---|---|---|---|---|---|
| `D4_MOR_PREFIXES_UN` | `424dd982-8454-44a8-8f35-670fb8f343cd` | `e26fca4e2b299a9bfa84955916ccb30410108e777ac18cf22f25e07d9a24dd7a` | `0eaa7343a7121785aecf9a0f97d109317d213ae7731f81ef8d7d2354a468f154` | `e26fca4e2b299a9bfa84955916ccb30410108e777ac18cf22f25e07d9a24dd7a` | 7 / `d9c2914b37693bbb6e300b97ca8872bbba569ccafc0a46caf370dae9e75a4cd0` |
| `D4_MOR_PREFIXES_DIS_MIS` | `2edaee78-8720-4d41-b663-05cd27e9ee2a` | `a66670d000141873741789c45d58b48b7cdceeff46b4bfbbda389a09d9285364` | `096f8d2ba8cc4ad0a875e8bb32e46987f8b8590fd0311eb8a65f222d54bcbabe` | `a66670d000141873741789c45d58b48b7cdceeff46b4bfbbda389a09d9285364` | 7 / `57855b39491ab91e845fd8a63cf521b396bcdd7f1ed5b098a050d3e66914e29f` |
| `D4_MOR_PREFIXES_IN_IM_IL_IR` | `0decf6fd-b3c0-419b-aacd-21cb4eae4f97` | `a3d48cb9afcf0a968f39b155c77d855eb43c00035368781f3481d0420e708970` | `40b1c0bd05af90963a3fa66a983e70d2d59cfba1c8d0eb9b1460a9b7e7498fb0` | `a3d48cb9afcf0a968f39b155c77d855eb43c00035368781f3481d0420e708970` | 7 / `91b54ecd2a77462b7c5e646ce7fa1788a755cdfed45d9c6fc948c5a28d81ebae` |
| `D4_MOR_PREFIXES_RE_PRE` | `d21f1a35-59bb-455c-a9f4-7207acaf07c7` | `ee1a5f60d949e839edd6021a8343f89726152d4ce912fced38f31d619e40387f` | `664ba31b24656484cef8b52cfc80b36d301221cb774fd6a358be75c507a96329` | `ee1a5f60d949e839edd6021a8343f89726152d4ce912fced38f31d619e40387f` | 7 / `e9331ddb12713745e9e6ef070f6e8eeb1e7bde4d96ffca831d84ac44c26a4d5c` |
| `D4_MOR_PREFIXES_SUB_INTER_SUPER` | `ee86137f-eb80-45c5-aac8-c5a754bf35af` | `5d24f2e4349bf60765ca35057b9790605af0fa21ae2aded5318882836117abda` | `bc53c38946f42f3885170345e0446fb18b7149f0e496e6d3a2f9d7b7ca15b6f6` | `5d24f2e4349bf60765ca35057b9790605af0fa21ae2aded5318882836117abda` | 7 / `e35a1d9a443d2ee5454903e3483b59f24174529feb3c2a182614a005d4dd8250` |

Exact field hashes (`before → proposed`) are:

| Profile | Field | Before SHA-256 | Proposed SHA-256 |
|---|---|---|---|
| `UN` | `meaning_bins` | `6771169ce8fc94695a32aa6d04923148717b51de04a027007d6441433bde5683` | `def94031da33c927743fd5783601eb2dbb9de2c946b13e92244af8a4efaa9162` |
| `UN` | `prefix_choices` | `44764f70c94831dd63d478b3154a51a416dc552bf6e5c7efd931308146dc2b81` | `a24406f59cd5e3f9f767d1cdabd279a935eedb38510e9ee9d4999071cc924055` |
| `UN` | `intro_content` | `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b` | `1cf37f6d84347b94020f6b8ad2799667653ee6de92e9d12d2fdbef1b9d80856f` |
| `DIS_MIS` | `meaning_bins` | `521cc48a449a92e99477be56ca800c5b4450879772449432bb56fead9c42fab4` | `5811309035dac943987021da6f28bd60515c02f22b75309384b76b71218a9aa3` |
| `DIS_MIS` | `prefix_choices` | `2ab817ef09710382e225dceb7d6ffa545910ab3d58d50840734c201482c14fec` | `6c9887be312731554f77daabb33fde536ee9187c04f97f42e1f5bbf488e5957b` |
| `DIS_MIS` | `intro_content` | `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b` | `eba6d7c9e67d1e04278f13b347b632a309b195ceeb44d08272c4739369dd0d51` |
| `IN_IM_IL_IR` | `meaning_bins` | `eb0d03092d5416e06bfa57886b9e5eaf259bf7b85a36ffd5f3e39ebb3b6224d6` | `d450674347a6bb00fe9a4412dab47822a7c4cef47c3c10b135c7f7bad85cb73f` |
| `IN_IM_IL_IR` | `prefix_choices` | `f3c41e683d819bc748874316bcd31c568d5225e60eb3788ccd751e8bd9b190a7` | `f6ac15223ecab29d5a858d3545a02cb8f17dbd35042d4269d479894703966de2` |
| `IN_IM_IL_IR` | `intro_content` | `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b` | `33903df664c770936feabe104c8a9bda257cf3a11947bf0c1e6a8459d424a933` |
| `RE_PRE` | `meaning_bins` | `6125fc769856bae5a3e7068b7bc4dfc3f5bb41d0cc5c85f5c45fcdd969a2b775` | `d8b3b2c2817aac49b2728cfd80e4497232df1f46b770323cf430ca729b16fd55` |
| `RE_PRE` | `prefix_choices` | `509032589a34e20da0ba8880f35d35f0fac0c6d4f928c1f7836655c808674332` | `03ed22844aec9f2760b8f946922f07395b52ac9d1dee2ea56f3f982ec3517317` |
| `RE_PRE` | `intro_content` | `9a2fea3c1920b1c58a0d33125d4b4f478fad77deb5044c30b1114f607b94df62` | `9b5aa6712f5d55f473dc55ea9a5058050a1222f266a5446dd4b7e6cd23babb8d` |
| `SUB_INTER_SUPER` | `meaning_bins` | `9308da4d126d7e2638b4a0c44832ec67c9f9b7eecd362882fcbe9f11965934ae` | `52ffaac6dd5cd74635b8704859f7cf11b3c9f9643e1ec811ddfd76cfa5f1cf7e` |
| `SUB_INTER_SUPER` | `prefix_choices` | `b649fbdab03b7d31b660269e9b5312b76626430313e99ddd5d1dc68105929177` | `9d77eefe8e3079b33bf1d9bd59e65495449c97b7717c77797b5349e80d0acca3` |
| `SUB_INTER_SUPER` | `intro_content` | `221e6373e7ab01e99447c4ef697a730bf410c30d319bd9b999400cf8f1b582d9` | `dda6e2beb683a36ede294deee8868601ccdcf1ff661b25dae47f05b1e51f65b0` |

Aggregate hashes:

- current canonical profiles:
  `93b831183a5ab5601b9dc89615bde0a84880b8a3ba6142de2c8419fc812521f1`;
- proposed canonical profiles:
  `1abb9e9332cf947ae67cb020eb0cf05bc2c793f061096a1a991e88ddce2e0384`;
- complete five-profile rollback projection:
  `9588f9b01dadb812fed46749b613dddac1c4742632a989bc53cd26923ee3b2bd`.

The plan found no missing or unexpected profile columns.

## Protected production snapshot

Expected post-release presence, counts, and hashes are exactly identical to
this before snapshot. Aggregate protected snapshot SHA-256:
`64d8613911e934927f6ce21e221d0930eeffb7001ef4b9e3a8556679f2e0565e`.

| Protected table | Present | Count | SHA-256 |
|---|---:|---:|---|
| `public.canonical_teaching_dictionary_prefix_members` | yes | 35 | `4f1a8c871973d20a343e5afab5fcd13d9155992347c732fbf0a5b3df4f6f5c66` |
| `public.canonical_teaching_dictionary_words` | yes | 1887 | `5edfe1595690f019dac442dc7c7c97b978a798ac25f486f25b7501b08fa86998` |
| `public.canonical_teaching_dictionary_word_metadata` | yes | 1894 | `36058bb3b5a654098f2b8b3ff707262a3471844c2fd5c9769433abcdc2c61950` |
| `public.canonical_teaching_dictionary_word_morphology` | yes | 1000 | `8adda862c4bd2cd753f9cc1732652e16e74ff67e33a9428c0ab58705898f73b9` |
| `public.canonical_teaching_dictionary_dictation_sentences` | yes | 1895 | `11a69306ccaa28a945637f03074bad6bbade446cfe36ec8f34a3269a1b03a73f` |
| `public.learning_items` | yes | 12 | `f674488912241e469fbea038b4ba0af7532cf3ab511b442c3705307dfae6e27a` |
| `public.adle_learning_items` | yes | 5 | `9c7fea4ddf1f52fd88e899527260dccba92d678ddfb1b7993136c454e4753f9a` |
| `public.daily_assignments` | yes | 74 | `9b66c240f050280e32c08335ebabff8b923114db55c2f9b336b87f6529e33fdb` |
| `public.assignment_items` | yes | 24 | `0309b8ce9662583a642ac7133607f68f45aeebcb8f311adc0a9f3fe0391d8f29` |
| `public.adle_assignment_attempt_events` | yes | 4 | `e671de52515c440f51a9db06c34014f0dfeff516347d76ab3a6f0438cdbbac00` |
| `public.learning_item_evidence` | yes | 24 | `b95ccfdd63be7dd75f6c1b2d89def24da9bb2d7e78099e198f9d03657829b302` |
| `public.adle_authentic_use_events` | yes | 60 | `87cdc519d1af23767cef698f668149a24ffd7da50c4c8553d83c8ef7e8175d24` |
| `public.adle_slippage_events` | yes | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `public.adle_word_proficiency` | no | 0 | `5ad38304b535c2987dbd24657c1a11b884984ff600d9f389deb0d4e634fee792` |
| `public.adle_review_bundles` | yes | 1 | `d4b56af15197975b6ce442a52981394b13cd501d235e06190342bf5fac58a9de` |
| `public.adle_review_schedule_words` | yes | 3 | `3c07a818e0f3bb2d0c370f71e1cf21ab1700228cae84c43d56aa79bd16d21f2b` |
| `public.adle_review_schedule_word_routes` | yes | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `public.adle_review_outcome_events` | yes | 3 | `c34d3d4603f9c5bb84c316397d652bed6fa6467e1e71788c0afa6c3fe3632fd4` |
| `public.adle_review_outcome_event_routes` | yes | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `public.adle_taught_word_history` | yes | 3 | `5a99c73bf9b484005bd601848d93e822120d44d98c97af9621cd65c21b890808` |
| `public.child_word_treasures` | yes | 3 | `c8ccf13d486c379c8ea3b271568e98a0215c2bd84b5aa6992e7f92ad305f93f2` |
| `public.child_word_treasure_events` | yes | 3 | `21c98a5301a016223436cfcf827912d398cadf2453305ef0aeaa5e525b1b1758` |
| `public.child_word_treasure_evidence_candidates` | yes | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `auth.users` | yes | 4 | `c282c9c4a7d3301e3d4bbf01677e754bc68cd0134072542c3feb05f03569de7f` |

No raw learner, authentication, answer, or dictation values were emitted.

## Prefix V2 assignments and historical reading

Production currently contains zero Dynamic Prefix V2 assignments: pending 0,
completed 0, skipped 0. There was therefore no live historical payload to
sample. Historical Prefix V2 validation remains covered by the runtime and
pedagogy regression fixtures; the plan is fail-closed if any future stored
Prefix V2 root payload is unreadable.

## Narrow 20-item migration assessment

- Production ledger entry `20260803113000`: absent.
- Current migration ledger: 58 entries; latest `20260731124500`; canonical
  ledger SHA-256
  `8bc57b494ce1c9e277ec703d8b729e9218908d9134ffece72b1582550c5490e0`.
- Local reviewed migration SHA-256:
  `7314dc9c9399674aa9a55f17119458e82546ded4353e76452179defdc6fa63f7`.
- Live function:
  `public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)`.
- Live function SHA-256:
  `b172a579152cfcb412438704b0168065617cda7872cb3a19ccdd0387cf25b3b3`.
- Existing 16-item default: retained.
- Existing reviewed 18-item SUB/INTER/SUPER, FUL/LESS and closed-compound
  exceptions: retained.
- Approved 20-item IN/IM/IL/IR guard in production: absent, matching the ledger.
- Local migration: verified to add only the exact 20-item pedagogy shape.
- Function execution: service role yes; authenticated no; anon no.
- Applying the migration alone creates or mutates an assignment: no.

The absent migration is the expected first action of a separately authorised
release, and `release` mechanically refuses profile publication until both the
ledger and live guard confirm it.

## Stop conditions and rollback

Stop for Git/Vercel/Supabase identity drift, package drift, schema/profile/member
readiness drift, protected presence/count/hash drift, migration/function drift,
historical reader failure, or loss of the pre-publication `shadow` boundary.

Rollback order remains:

1. restore compiler mode to `shadow` and deliberately redeploy;
2. verify historical and shared-created Prefix V2 readability;
3. if needed, run guarded `deactivate` to restore the five captured three-field
   projections;
4. retain the additive migration unless a separate database rollback is
   reviewed.

## Validation results

| Command | Result |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run typecheck:scripts` | PASS |
| `npm run build` | PASS |
| `npm run adle:dynamic-prefix-pedagogy-production:validate` | PASS |
| `npm run adle:dynamic-prefix-pedagogy-production:plan` | PASS; plan SHA above; no mutation |
| `npm run adle:dynamic-prefix-pedagogy-production-regression` | PASS |
| `npm run adle:dynamic-prefix-pedagogy:validate` | PASS |
| `npm run adle:dynamic-prefix-pedagogy-regression` | PASS |
| `npm run adle:dynamic-prefix-20-item-persistence-regression` | PASS |
| `npm run adle:cover-shutter-threshold-regression` | PASS |
| `npm run adle:cover-shutter-interaction-regression` | PASS; 3 applicable tests passed, 3 project-inapplicable cases skipped |
| `npm run adle:dynamic-prefix-shared-authority-regression` | PASS; 140 positions / three modes |
| `npm run adle:dynamic-prefix-qa-regression` | PASS |
| `npx tsx scripts/adle-dynamic-prefix-runtime-regression.ts` | PASS |
| `npm run adle:shared-affix-compiler-regression` | PASS |
| `npm run adle:shared-affix-production-parity-regression` | PASS |
| `npm run adle:route-resolution-regression` | PASS |
| `npm run adle:persisted-route-metadata-regression` | PASS |
| `npm run adle:composer-payload-regression` | PASS |
| `npm run adle:composer-persistence-regression` | PASS |
| `npm run adle:generic-snapshot-contract-regression` | PASS |
| `npm run adle:generic-snapshot-reader-regression` | PASS |
| `npm run adle:word-lab-completion-contract-regression` | PASS |
| `npm run adle:attempt-capture-regression` | Known standalone wrapper compile failure; see below |
| `npm run adle:evidence-regression` | PASS |
| `npm run adle:review-scheduler-regression` | PASS |
| `npm run adle:reward-bridge-regression` | PASS |
| `npm run adle:semantic-production-baseline` | PASS; all 31 regressions, including attempt capture |
| `npm run adle:architecture-inventory-generate` | PASS; no generated diff |
| `npm run adle:architecture-drift-check` | PASS |
| `npm run adle:composable-documentation-regression` | PASS |

The standalone attempt-capture wrapper reproduces the known baseline
TypeScript-narrowing errors in
`generic-snapshot-reader.ts` and `daily-plan-surface.ts`. Neither file nor the
attempt-capture regression was changed by this stage. The Generic Snapshot
contract and reader regressions pass, and the semantic production baseline runs
the actual attempt-capture regression successfully. This is therefore the
unchanged wrapper defect, not an attempt-capture behavioural regression. No
unrelated Generic Snapshot change was made.

## Publication boundary

The plan is ready for a separate explicit production-release authority, subject
to an immediate re-plan before mutation. The [pending production receipt](adle-dynamic-prefix-pedagogy-production-receipt-pending.md)
has not been completed. The seven-day production observation window has not
started.
