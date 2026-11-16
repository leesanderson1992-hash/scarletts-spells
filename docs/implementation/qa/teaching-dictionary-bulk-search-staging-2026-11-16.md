# Bulk assign search and cold-load staging comparison

The latest protected staging build is `dpl_HkZCninLUiX8wWEmZXzFBB2cht2x`. The baseline is the previous pagination build, `dpl_HNPN2U61pptSYwfHzF5BVqrmvecr`. Both used the same staging database and signed-in staging administrator. [Staging Bulk assign](https://scarletts-spells-adle-staging-20261025-dyej74guu.vercel.app/admin/teaching-dictionary/bulk-assign) · [Previous hosted pagination report](teaching-dictionary-pagination-readiness-staging-2026-11-16.md)

Bulk assign’s initial page and spelling search now use a cached server-side directory of word IDs, spellings and approval status. Detailed metadata, reviewed senses, morphology and candidate facts are fetched only for the displayed rows. The first supported candidate page shares its sense and morphology reads with candidate validation. The specialist filters load their options when first opened and use their existing full-data filter rules. The browser uses an authenticated endpoint and aborts superseded requests. All database changes in the implementation are read-path changes and use the existing schema.

| Hosted interaction | Median time, before → after | Decoded browser payload, before → after |
| --- | ---: | ---: |
| First 50 regular `-ing` candidates and their facts | 5.32 s → 4.49 s | 216,897 B → 213,503 B |
| Second candidate page | 2.66 s → 1.89 s | 47,857 B → 46,765 B |
| Search for `care`, three matches | 2.51 s → 1.36 s | 5,557 B → 5,378 B |
| Search for literal `%`, zero matches | 1.49 s → 0.85 s | 170 B → 52 B |
| Repeat the search with ` CARE ` | 2.07 s → 1.32 s | 5,557 B → 5,378 B |
| Open the phoneme chooser and filter by `/eɪ/`, 77 matches | 2.76 s → 2.29 s | 33,765 B → 35,421 B |

Timings are medians of three browser runs on each original hosted preview. The samples measured from navigation or input until the result rows and candidate facts were available. The previews were measured in separate runs. The first phoneme use can also fetch the chooser options and rebuild the specialist index. These are small hosted samples and include application auth and network time.

Every timed result matched the baseline’s row IDs, order, totals and displayed facts. The browser also preserved an unsubmitted selection across pages and cleared it on return without sending an approval. The new endpoint rejected unauthenticated and invalid requests. TypeScript, ESLint and the Bulk assign regression passed.

## Database reads

The first request on each separately instrumented staging build used an isolated data cache key. The browser receipt ID joined the test request to aggregate PostgREST response lengths. The measurements count database HTTP requests and decoded bytes, including the admin shell on the initial navigation. They measure database traffic separately from browser bytes and billed egress.

| Scenario | PostgREST requests, before → after | Decoded PostgREST bytes, before → after |
| --- | ---: | ---: |
| First candidate page, cold data cache | 31 → 27 | 977,169 B → 530,381 B |
| First candidate page, warm data cache | 25 → 26 | 394,832 B → 407,441 B |
| Second page, warm data cache | 5 → 6 | 43,072 B → 54,862 B |
| Search for `care` | 5 → 6 | 6,248 B → 7,015 B |
| Search for literal `%` with the index warm | 0 → 0 | 0 B → 0 B |

A cold candidate load transferred 46% fewer decoded database bytes and made four fewer requests. Warm spelling searches now fetch display metadata for the returned words, which adds one request to the sampled warm path. The first specialist chooser request can still load the full filter data. In the cold diagnostic sample, opening the phoneme chooser triggered five requests for 540,297 B before the five requests for 26,363 B that fetched the selected phoneme page. A rapid-input test verified that an older request could not replace the latest spelling results.
