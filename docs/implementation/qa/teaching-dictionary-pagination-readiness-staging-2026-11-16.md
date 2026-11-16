# Teaching Dictionary pagination and readiness on staging

The staged build is `dpl_HNPN2U61pptSYwfHzF5BVqrmvecr`. The before build is `dpl_HpC8mXV1FKFVcyqbM44VcTaQLUDs`. The two protected previews used the same staging Supabase database and the same staging administrator fixture. The browser measurements below use the original previews. The database figures use separate staging builds with aggregate fetch instrumentation, correlated with the individual request IDs. No staging word or lesson content was changed. [Current staging Catalogue](https://scarletts-spells-adle-staging-20261025-n8itvwxxo.vercel.app/admin/teaching-dictionary) · [Previous hosted report](teaching-dictionary-hosted-efficiency-2026-11-16.md)

## Bulk assign and word readiness

Bulk assign now applies spelling, schwa, morpheme, syllable and phoneme filters on the server. It returns up to 50 candidates and their needed facts together. Filter options and lightweight saved assignment labels still describe the full skill. The shared catalogue filter index lives on the server, with a 60-second cache and the existing evidence invalidation tag. A cold index still reads the catalogue across the underlying tables. Write validation continues to use the existing approval action.

On the previous build, opening the regular `-ing` candidates used 541,782 decoded HTML bytes and a further 6,010 B candidate-facts response. On the new build, the same first page and its facts used 216,897 decoded HTML bytes, a 60% reduction in the initial HTML. Paging and filtering now send a new candidate page. A plain spelling filter previously used the downloaded browser data and needed no response for the sampled `care` search.

| Browser interaction | Decoded response, before → after | Median time, before → after |
| --- | ---: | ---: |
| Bulk assign, first selected page including facts | 547,792 B → 216,897 B | 5.66 s → 3.52 s |
| Bulk assign, page 2 | 23,459 B → 47,857 B | 1.99 s → 2.36 s |
| Bulk assign, `care` filter | 0 B → 5,557 B | 0.05 s → 1.81 s |
| Bulk assign, `/eɪ/` filter | 28,925 B → 33,765 B | 6.12 s → 2.41 s |
| `careful` readiness | 460,027 B → 5,864 B | 6.47 s → 3.40 s |
| `careful`, opening Identify the Base lesson preview | Included in readiness → 426,396 B on demand | Separate on-demand step |

Timings are medians of three signed-in runs on each preview. For Bulk assign the measurement ends when the matching rows and candidate facts are ready. Readiness time runs from the Micro-skills click to the completed check. The previews were measured in separate browser runs. The small sample and the staging connection affect the timing comparison.

The 5,864 B readiness response contains the word’s statuses, blockers, witnesses, route facts and launch fingerprints. The tested summary was 98.7% smaller. Opening the Identify the Base lesson panel added 426,396 B and 20 PostgREST reads (676,738 decoded B) in the corresponding diagnostic sample. The matched full readiness calculation still used 111 PostgREST reads and 1,804,908 decoded B on each build. The reduction is in the browser response. In the comparison where the Bulk assign index was rebuilt, initial page and facts together were 31 PostgREST reads and 977,169 B on each build. Warm new-build reads used 25 requests and 394,832 B. Page 2 required five requests and 43,072 B in each build.

The first two pages matched in row identity and order. `care` returned three rows and `/eɪ/` returned 77 rows on both builds. A pending selection survived a page change and could be cleared on return. Both readiness summary projections and the on-demand compiled preview matched the previous data, including the launch fingerprint and compiler witnesses.

## Controlled Catalogue cache test

Each diagnostic build had a fresh namespace for the page-scoped and global authority caches, with the same 60-second policy. Using direct signed-in GETs avoided browser link prefetch. The test took an initial reading, two immediate reuses, a request after expiry, and a later follow-up. Rows and displayed statuses were identical within each cycle and across both builds. Each sampled page had 50 rows.

| Matched cache state | PostgREST requests before → after | Decoded PostgREST responses before → after |
| --- | ---: | ---: |
| Catalogue, initial page-scoped rebuild | 28 → 28 | 982,239 B → 982,239 B |
| Catalogue, two warm requests | 4 → 4 | 44,603 B → 44,603 B |
| Evidence Approved, two warm requests and settled follow-up | 4 → 4 | 50,561 B → 50,561 B |
| Evidence Approved, request plus rebuild after expiry | 33 → 33 | 1,483,490 B → 1,483,490 B |

Expiry triggered a background rebuild while the page continued to serve the same results. Vercel attributed overlapping background reads to later requests in some expiry and global cold samples, so the table only compares totals from isolated requests. The controlled test confirms the warm-cache benefit and the same page-scoped rebuild cost on both builds. The Catalogue cache policy was already present and this change did not adjust it.

TypeScript, ESLint on changed code, and the Teaching Dictionary Bulk assign and workspace regressions passed.
