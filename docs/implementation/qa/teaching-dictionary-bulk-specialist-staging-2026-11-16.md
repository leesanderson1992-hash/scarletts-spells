# Bulk assign batched reads and specialist filter verification

The latest protected staging preview is `dpl_Aq3hRR2KFCSyDNLWWd6hShUcwUWR`. The baseline is `dpl_HkZCninLUiX8wWEmZXzFBB2cht2x`. Both used the same staging database and administrator. The targeted migration `20261116170000` installed two read-only functions restricted to the service role after a transaction rollback proof. Existing staging word and lesson content was used as the fixture. [Staging Bulk assign](https://scarletts-spells-adle-staging-20261025-l7quc0bw3.vercel.app/admin/teaching-dictionary/bulk-assign?skill=D4_INF_ING_ENDINGS_REGULAR) · [Previous spelling search report](teaching-dictionary-bulk-search-staging-2026-11-16.md)

The page read now retrieves current metadata, reviewed senses, morphology and the applicable candidate inputs together for at most 50 word IDs. The existing application evaluator still interprets those facts. The specialist index keeps spelling and approval status, the latest morphology parts, and the pronunciation attributes used by filters. Definitions and sentences are loaded with the visible rows. Filter options and tokenized phonemes are computed once per 60-second cache fill. The evidence update tag still invalidates both indexes.

## Hosted results

| Interaction | Median time, before → after | Decoded browser response, before → after |
| --- | ---: | ---: |
| First 50 regular `-ing` candidates with facts | 4.79 s → 3.80 s | 213,503 B → 213,503 B |
| Second candidate page | 1.86 s → 1.87 s | 46,765 B → 46,765 B |
| Warm spelling search for `care` | 1.32 s → 1.31 s | 5,378 B → 5,378 B |
| Open phoneme chooser and apply `/eɪ/` | 2.67 s → 2.19 s | 35,421 B → 35,421 B |

Each time is the median of three signed-in runs on the original previews, ending when matching rows and candidate facts were available. The new phoneme samples ranged from 2.16 to 4.25 seconds, compared with 2.18 to 2.67 seconds before. The first isolated diagnostic phoneme workflow took 3.23 seconds before and 2.67 seconds after. The small hosted samples include the network and application sign-in checks.

| Database interaction | PostgREST requests, before → after | Decoded responses, before → after |
| --- | ---: | ---: |
| Warm spelling search for `care` | 6 → 1 | 7,015 B → 6,874 B |
| Warm second candidate page | 6 → 1 | 54,862 B → 51,087 B |
| First candidate page with cold index | 27 → 22 | 530,381 B → 525,399 B |
| Open specialist choices with cold index | 5 → 1 | 540,297 B → 332,342 B |
| Fetch the `/eɪ/` result page | 5 → 1 | 26,363 B → 34,835 B |
| Cold specialist choices plus `/eɪ/` results | 10 → 2 | 566,660 B → 367,177 B |

Database figures are from protected diagnostic builds correlated by individual Vercel request IDs. They count decoded PostgREST response bodies. The `/eɪ/` page now reads display details with the page facts because the specialist index holds filter inputs. That page’s database bytes increased, while opening and using the specialist filter on a cold cache used 35% fewer bytes overall.

Full candidate responses and filter options matched for schwa yes, no and unknown, two syllables, unknown syllables, morphemes, phonemes, combined filters, literal spelling, and selected meanings with alternate pronunciations. Bulk assign TypeScript, lint, and the filter regression passed. An unauthenticated request and an invalid page request were rejected. An unsubmitted selection survived paging and could be cleared on return.
