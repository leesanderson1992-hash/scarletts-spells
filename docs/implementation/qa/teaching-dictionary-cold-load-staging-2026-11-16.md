# Catalogue and suffix review first loads on Dublin staging

The updated preview is `dpl_C2HbygvWqsdvogAYNG4CQUT1hwE2`. The prior Dublin preview was `dpl_AmmCzX1PNgJB9vCrtQp9EKQtk2gV`. Both use the same staging database. The timing comparison came from equivalent instrumented copies of the two builds, with separate Catalogue cache keys. Request IDs confirmed Dublin execution and matched the browser timings to the database logs. [Updated staging Catalogue](https://scarletts-spells-adle-staging-20261025-7sdt1zqzi.vercel.app/admin/teaching-dictionary) · [Earlier region comparison](teaching-dictionary-regions-staging-2026-11-16.md)

Cold Catalogue was rebuilding the evidence authority through several consecutive stages. The new loader overlaps the independent release, writing association, and scoped source reads while preserving the same governed interpreter. For suffix review, the live pool and preflight previously assembled the same suffix profile separately, and candidate discovery waited for preflight. They now share the live profile within the request and discover candidates while preflight runs. Preflight still loads a separate candidate profile when it has proposed changes to apply.

| Dublin measurement | Before | After |
| --- | ---: | ---: |
| Catalogue, cold time to heading, three distinct pages | 2.63 s | 1.48 s |
| Catalogue, cold authority rebuild, median | 1.16 s | 0.47 s |
| Catalogue, warm time to heading, eight paired cache hits | 2.05 s | 1.18 s |
| `-ful/-less`, first request on each diagnostic preview | 5.03 s | 4.92 s |
| `-ful/-less`, median of three repeat requests | 1.51 s | 1.39 s |

The three Catalogue cold runs were confirmed cache misses for pages 1–3. Cold page times were 2.63, 2.32, and 4.33 seconds before, and 2.32, 1.35, and 1.48 seconds after. Corresponding pages used 28, 30, and 29 database requests on both builds. Warm comparisons include only matched requests with four database reads and no logged authority rebuild. One immediate follow-up on the updated preview rebuilt the cache again, so I omitted that pair from the warm comparison. Warm timings ranged from 1.16 to 5.44 seconds before and 0.97 to 1.28 seconds after.

Suffix review reads fresh data on both first and repeat visits. The first navigation is a fresh-preview observation, with one sample per instrumented build. The hosting worker's cold state was uncontrolled. Both builds issued 73 observed PostgREST requests and returned 187,867 decoded bytes per suffix review. The update shares profile assembly and overlaps work, with equivalent observed database traffic. First-request preflight took 1.68 seconds before and 2.23 seconds after, so the diagnostic comparison does not establish a material first-load gain for suffix review. The first suffix review on the regular optimized preview took 2.97 seconds, another indication of first-load variation.

The three Catalogue pages and the suffix review rendered the same content across diagnostic and regular previews. The suffix review and live pool workbook cells also matched. TypeScript, ESLint, and the Teaching Dictionary workspace and governed review regressions passed.
