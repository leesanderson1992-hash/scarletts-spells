# ADLE Phase B canonical word–skill reconciliation

Date: 2026-08-30

Architecture baseline: `802fa1f`

Relationship interpretation and approved owning policy: `ADLE_PROFICIENCY_MODEL_V1`

This is an owner-facing, read-only reconciliation. The Production pass used
only `select` queries. It did not write this result to Supabase or Production.
The complete deterministic report can be regenerated with
`npm run adle:word-skill-reconciliation` for fixtures or with the guarded
`--live --environment production --acknowledge-read-only-production` arguments
when Production credentials are supplied to the same script.

## Implementation facts

| Source | Implementation authority | Exact identity and admission | Version lineage | Limitations |
|---|---|---|---|---|
| Approved resolver mapping | `spelling_canonical_mappings` plus the `resolver_visibility_enabled` rows in `spelling_canonical_mapping_events`; resolver contract in `docs/contracts/parent-recommended-canonical-mapping.md` | The active mapping's normalized correction must resolve to exactly one active `canonical_teaching_dictionary_words.id`; its `micro_skill_key` must be active; the mapping must be active, resolver-visible, and have an enabling audit event. Role is `demonstrates`. | `normalization_version` plus the sorted enabling event IDs | The mapping table stores normalized correction text, not canonical word UUID. Fifteen currently visible mappings fail closed because the correction has no active canonical dictionary identity. No spelling-similarity fallback is used. |
| Released Prefix/Suffix specialist membership | `canonical_teaching_dictionary_prefix_profiles` / `_members` and `canonical_teaching_dictionary_suffix_profiles` / `_members`; current runtime loaders and release registry | Profile and member must be active and approved, member must be `assignment_eligible`, profile must be `production_enabled`, word and skill identities must be governed. Role is `demonstrates`; `contrast` would be non-positive. | Import batch UUID and commit/folder hash, profile source-row hash, member source-row hash | Import batch status is lineage, not a second release gate. Runtime release authority is the production-enabled reviewed profile. Only the governed dynamic Prefix/Suffix profile keys are read. |
| Released Base route content | `loadEnabledBaseWordReleaseAuthorities` over the Model C activation head/revision/release/dependency authorities | Enabled environment activation, matching immutable release/dependency fingerprints, catalog skill, canonical family member, `assignmentEligible`, and the member-to-skill semantic applicability check are required. Role is `demonstrates`. | Release key, release-manifest SHA-256, family-authority semantic fingerprint, family/member provenance IDs | Disabled or fingerprint-invalid releases fail closed in the existing release loader. No generic-support duplicate is required. |
| Released Compound route content | `adle_route_activation_heads`, revisions, release manifests, release dependencies, and the `compound_structure` semantic projection | The environment head must point to an enabled revision with one matching dependency. The semantic authority fingerprint must match. Each structure explicitly supplies `wholeCanonicalWordId`, `microSkillKey`, and `assignmentEligible`. Role is `demonstrates`. | Release key, release-manifest SHA-256, semantic-authority fingerprint, structure authority/canonical word provenance | The one governed 14-member semantic authority contains both compound skills; each enabled revision filters by the structure's explicit skill key. Identity/fingerprint mismatches throw rather than silently disappear. |
| Approved generic support | `canonical_teaching_dictionary_word_support` plus its import batch | Active rows from an applied batch require an exact canonical word UUID, active skill key, and approved exact row review. `support_example` and `review_example` are `demonstrates`; `contrast` is `contrast_only`. | Import batch UUID, source-row hash, and batch commit/folder hash | In-review rows and contrast rows remain visible as deterministic exclusions. Generic support does not gate specialist or resolver authority. |
| Explicit reviewed association | Injectable, server-only adapter in `lib/adle/word-skill-relationships/adapters.ts` | Requires stable word/skill identity, active row, exact-pair approval, approved review, positive role, and a deterministic authority version. | Supplying governed association package/version plus association ID | There is no activated live association store. `data/adle/approved/d4-mor/v1/d4-mor-v1-word-analyses.json` is `not_activated`, so the Production count is zero. It was not promoted or treated as live authority. |

The stable identity registries are `canonical_teaching_dictionary_words.id` and
`micro_skill_catalog.micro_skill_key`. Inactive or duplicate/unstable registry
identity fails closed before source admission.

## Production reconciliation

Production source fingerprint:
`fc8de6230a196402d8cefe7cf207130a93cbe07916d996107504e880ed9cf794`.
Two independent live reads produced the same fingerprint and counts.

| Authority | Source rows | Admitted provenance | Excluded | Blocked | Ambiguous |
|---|---:|---:|---:|---:|---:|
| Approved resolver mapping | 255 | 188 | 52 | 15 | 0 |
| Released specialist membership | 75 (35 Prefix, 40 Suffix) | 75 | 0 | 0 | 0 |
| Released route content | 241 (227 Base, 14 Compound) | 241 | 0 | 0 | 0 |
| Approved generic support | 988 | 39 | 949 | 0 | 0 |
| Explicit reviewed association | 0 | 0 | 0 | 0 | 0 |
| **Total** | **1,559** | **543** | **1,001** | **15** | **0** |

| Reconciliation measure | Count |
|---|---:|
| Admitted provenance occurrences | 543 |
| Deduplicated exact pairs | 462 |
| Multi-provenance exact pairs | 79 |
| Specialist-only exact pairs | 261 |
| Resolver-only exact pairs | 109 |
| Pairs with generic-support provenance | 39 |
| Pairs with explicit-reviewed provenance | 0 |
| Contrast-only exclusions | 27 |
| Inactive-skill exclusions | 0 |
| Unknown/unstable identity blocks | 15 |
| Unreviewed/unreleased exclusions | 973 |
| Other inactive-source exclusions | 1 |
| Ambiguous relationships | 0 |

The 973 unreviewed/unreleased count is `EXACT_PAIR_NOT_APPROVED`: 922 generic
support facts and 51 resolver facts. The other excluded facts are 27
`CONTRAST_ONLY` generic rows and one inactive resolver source. There are no
unreleased specialist rows in the released Production authority.

### Blocked Production facts

All 15 blocks are `CANONICAL_WORD_ID_UNKNOWN`. The adapter retains the exact
normalized correction, skill, and resolver provenance; it does not invent a
canonical word UUID.

| Normalized correction | Micro-skill | Resolver mapping ID |
|---|---|---|
| `disgusting` | `D4_MOR_ROOTS_COMMON_LATIN_ROOTS` | `b910d97d-a60f-46b7-b75c-a883595c9313` |
| `importantly` | `D4_MOR_PREFIXES_IN_IM_IL_IR` | `eaa8fd66-3d2b-4246-8b86-a484e58f32ee` |
| `ingredient` | `D4_PG_LONG_EE_E_OPEN` | `5649871d-d062-4cf6-be3a-d02f5319b252` |
| `ingredients` | `D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX` | `f1bed481-4847-47f7-b855-933948fbf2be` |
| `it’s` | `D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS` | `fcf44b20-bbf7-422c-be87-a3fbec25e183` |
| `loaded` | `D4_PG_LONG_OA_OA` | `a29864bf-5047-4739-b573-767dea4d4c65` |
| `loads` | `D4_PG_LONG_OA_OA` | `20541100-2e6d-49dd-9322-796ef207445f` |
| `malteasers` | `D4_PG_Z_SOUND_CHOICES_SE_FINAL` | `1b8cf85f-3f00-45bb-aaf9-c3b29b0e4877` |
| `renew` | `D4_MOR_PREFIXES_RE_PRE` | `8e575e1a-43d5-4c5f-bd9f-d400578620ec` |
| `repeated` | `D4_PG_LONG_EE_EA` | `e89121e0-b55a-4a36-8827-96564f58b625` |
| `successful` | `D4_MOR_SUFFIXES_FUL_LESS` | `893fdd29-c09c-41f6-b568-9558a4b9de48` |
| `tournament` | `D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS` | `59cd6aca-1191-47de-959b-abcef4991d0b` |
| `unlocked` | `D4_MOR_PREFIXES_UN` | `0c57e097-8160-444d-94c9-4838e9d3400d` |
| `varieties` | `D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS` | `59904a36-368f-4c39-a83f-ea9d5de981cb` |
| `you’re` | `D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE` | `e67f4703-29d4-4202-87c0-41f2320b69c9` |

These row-local blocks do not make the no-schema adapter indeterminate: they
are excluded from the admitted graph with a stable reason. Adding canonical
dictionary identities later is the smallest owner-governed change that could
make them eligible; Phase B does not do that work.

## Representative Production results

- `careful` has four admitted pairs: `BASE_PLUS_SUFFIX` via resolver,
  `IDENTIFY_BASE` via released Base content, `PRESERVE_BASE` via approved
  generic support, and `SUFFIXES_FUL_LESS` via resolver plus released specialist
  membership. Its in-review generic `FUL_LESS` duplicate remains excluded.
- `playing` has `IDENTIFY_BASE` via resolver only and `PRESERVE_BASE` via resolver
  plus released Base content. Its in-review `ING_ENDINGS_REGULAR` generic row is
  excluded.
- `dishonest + D4_MOR_PREFIXES_DIS_MIS` is one pair with both resolver mapping
  `aeebb500-6aa8-43e5-a757-1e27010ecdf9` and specialist member
  `5291a0b4-354c-4191-bcf6-0d8a36de3858` provenance.
- `hopeful` has `IDENTIFY_BASE` via released Base content, `PRESERVE_BASE` via
  generic support, and `SUFFIXES_FUL_LESS` via resolver plus specialist member.
- Specialist-only example: `sign + D4_MOR_BASE_WORDS_IDENTIFY_BASE`, versioned by
  release `adle_base_word_lab_v2_2026_08_10`, manifest SHA-256
  `84e7fde227808806ef3852be1adaac2e9bbf78d8c691007233470464464f796c`.
- Resolver-only example: `wrist + D4_PAT_SILENT_LETTERS_WR`, mapping
  `72df4e03-16a0-46b6-b4cb-a86ad528a73e`, normalization
  `spelling_normalize_v1`, enable event
  `f90eefc6-4dee-4030-94e4-2111682585e1`.
- Multi-provenance example: `preview + D4_MOR_PREFIXES_RE_PRE` retains resolver
  mapping `9e2563cf-3478-4e75-9796-fee6c1aafc62` and specialist member
  `6c1e63be-8c76-427b-bec1-5ceb52c9f85c`.

## Deterministic fixture reconciliation

The regression fixture has 22 source rows, 9 admitted provenance records (10
source occurrences), 7 deduplicated pairs, 2 multi-provenance pairs, 2
specialist-only pairs, 2 resolver-only pairs, 1 generic-support pair, 1
explicit-reviewed pair, 1 contrast exclusion, 1 inactive-skill exclusion, 2
unknown/unstable identity blocks, 4 unreviewed/unreleased exclusions, and 1
ambiguous relationship. Its fingerprint is
`0e078b7d18622a463371af862dddc622a0572163d6bf35a4337502691abd95ce`.

The fixture proves that identical duplicate provenance is retained as one
provenance record with `occurrenceCount: 2`, while conflicting metadata for the
same provenance identity makes the pair `AMBIGUOUS` and prevents admission.
It also proves that specialist-only and resolver-only pairs do not require a
generic-support duplicate.

## No-schema and boundary verdict

**PHASE B NO-SCHEMA AUTHORITY SUFFICIENT**

The existing UUID/key identities, review/release flags, immutable release
fingerprints, import/source hashes, and resolver visibility audit events are
sufficient for a deterministic read adapter. The 15 missing-word mappings are
represented as row-local `BLOCKED` facts and are never admitted.

No schema or migration changed. No learner evidence, proficiency, Review,
scheduler, resolver behavior, composer, assignment generation, UI, rewards,
Word Treasure, Production data, Production configuration, or runtime consumer
changed. The read model is server-only and has no automatic consumer.
