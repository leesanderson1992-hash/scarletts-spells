# ADLE canonical `playing` production receipt — 2026-07-22

Scope: the canonical-target/shared-route slice only, released to the local
Scarlett Spells production project `wwohrqtunajrbwxyssjf`. No dictionary
content, support words, family fixtures, or 1,000-word review batch data was
created by this release.

## Release

- Release branch: `release/adle-canonical-playing-production`
- Release commits: `8b6edc1`, `1c4307d`, `daa9ead`
- Production deployment: `dpl_HSfZ51EUrUVH3Lk5zWjFsg3aGz5X`
- Deployment URL: `https://scarletts-spells-arzfqfw70-leesanderson1992-hashs-projects.vercel.app`
- Applied migrations: `20260722180000`, `20260722200000`
- Production-only `ADLE_CANONICAL_INTAKE_ENABLED` is set to `enabled`.

## Protected before-state

Test Scarlett (`e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e`) before release:

| Record type | Count |
| --- | ---: |
| Candidate mappings | 8 |
| Matching canonical mappings | 0 |
| ADLE learning items | 3 |
| Active `playing` items | 0 |
| Review schedules | 3 |
| Review outcomes | 3 |
| ADLE attempts | 4 |
| Spelling rewards | 0 |
| Word Treasures / events | 1 / 1 |

## Test-route receipt

| Misspelling | Canonical target | Micro-skill | Candidate | Mapping | Learning item | Lineage |
| --- | --- | --- | --- | --- | --- | --- |
| `plaiing` | `playing` | `D4_MOR_BASE_WORDS_PRESERVE_BASE` | `8602fc42-f3a6-4db4-8c61-2822fd8f2e86` | `98a53202-eb1a-4af9-aba6-d1cf6b1cb83f` | `5f54ea55-0785-48d1-b685-d8b0f2beedd3` | `87706c23-a465-4987-9cf8-40b95aa94086` |
| `plaing` | `playing` | `D4_MOR_BASE_WORDS_IDENTIFY_BASE` | `8c6f4adc-7f74-41de-9a8f-0f74db34f5f6` | `ad06d8df-5a59-4896-b58f-47be11ce3493` | `a57ebf98-6ec0-4ba3-8c5b-f8ef93711baa` | `8adda8ed-b8a5-4d98-85d0-5918f9d5b4f8` |

Both mappings are active but resolver-hidden and tagged
`production_test_playing_shared_routes`. Replaying each canonical-intake RPC
returned the existing learning item with `inserted=false`.

## Post-release checks

- Both migrations, additive tables, functions, identity triggers, RLS, and
  service-role grants verified.
- Two distinct active learning items share the approved canonical `playing`
  dictionary ID and have distinct catalogue micro-skills.
- Two active lineage rows exist; zero schedule rows exist for `playing`.
- No active multi-route schedule lacks explicit links.
- Existing `playing` support for both specified skills is absent (`0`), so
  lesson composition must fail closed; no same-skill substitute was created.
- No dictionary support rows were created by this release.

## Credential handling

The production runtime's `SUPABASE_SERVICE_ROLE_KEY` was rotated to the
project's server-only secret API key and production was redeployed. No key
material is recorded in this receipt.

## Remaining test boundary

The production app requires an authenticated application session to open the
admin readiness page. The unauthenticated deployment correctly returned the
normal sign-in screen. Teaching/review completion is intentionally not run:
the exact `playing` route currently lacks approved support and must remain
blocked rather than receiving invented content or a substitute word.
