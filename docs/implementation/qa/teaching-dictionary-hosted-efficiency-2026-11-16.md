# Teaching Dictionary hosted staging comparison

The latest Teaching Dictionary changes went to Vercel Preview `dpl_HpC8mXV1FKFVcyqbM44VcTaQLUDs` in the `scarletts-spells-adle-staging-20261025` project. The checkout was based on `da1ebca3` and included the Teaching Dictionary workspace changes that had been measured locally. The previous hosted build, `dpl_9p1duTKq66whVwRqWuZSZhi4PdwR`, was the comparison baseline. Both used the same staging database and staging administrator fixture. [Staging Catalogue](https://scarletts-spells-adle-staging-20261025-p6zhy8ca1.vercel.app/admin/teaching-dictionary) · [Local before-and-after report](teaching-dictionary-workflow-efficiency-2026-11-16.md)

Browser timings come from the original protected builds using Chromium. Each pair uses the same network and browser configuration, with the order alternating on repeat runs. Main HTML sizes describe the decoded navigation response. The page timing ends when the real heading becomes visible after streaming. The word readiness timing ends when the editor reports the checks ready. The Bulk assign candidate timing starts at Next and includes the candidate fact response.

PostgREST counts come from separate protected diagnostic previews built from the same respective sources with a fetch wrapper added to count decoded responses from staging PostgREST. Request IDs connect the browser responses to Vercel runtime logs. The wrapper records counts and byte lengths only. It adds work to the server, so the timing comparison uses the original previews. Database sizes include the shared admin shell and are separate from the browser response and Supabase billed egress.

## Hosted browser readings

Times are medians of two repeat navigations per workflow, or three repeat navigations for Bulk assign. I excluded the first navigation from each series. Browser timings reflect the staging network and this sample size.

| Scenario | Time to page heading before → after | Decoded HTML before → after | Encoded HTML before → after |
| --- | ---: | ---: | ---: |
| Catalogue | 3.56 s → 2.30 s | 128.4 KB → 128.4 KB | 15.0 KB → 15.2 KB |
| Import words | 1.87 s → 2.56 s | 60.9 KB → 46.8 KB | 13.3 KB → 10.7 KB |
| Bulk assign, chooser entry | 6.87 s → 2.11 s | 903.5 KB → 39.0 KB | 123.4 KB → 9.2 KB |
| Bulk review, lesson picker | 1.60 s → 1.44 s | 37.2 KB → 38.3 KB | 8.7 KB → 9.1 KB |
| Bulk review, regular `-ing` | 10.68 s → 4.22 s | 40.5 KB → 40.5 KB | 9.6 KB → 9.6 KB |
| Bulk review, `-ful/-less` | 8.31 s → 4.17 s | 40.7 KB → 40.7 KB | 9.6 KB → 9.6 KB |
| Bulk review, `un-` | 3.52 s → 4.15 s | 42.0 KB → 41.9 KB | 9.9 KB → 9.9 KB |
| `careful`, opening the editor | 4.22 s → 5.14 s | 200.2 KB → 193.4 KB | 26.3 KB → 25.0 KB |

Regular `-ing` candidates took 5.25 s from Next until the first page’s facts were usable. The selected view and candidate fact action together delivered 355.4 KB decoded to the browser. The previous chooser could not select regular `-ing`, so this step has only an after measurement.

The word editor previously issued one automatic readiness request per navigation, taking 8.36 s from navigation to ready in the dedicated repeat samples. The new editor issued zero readiness requests on opening and completed readiness in 5.88 s from an explicit Micro-skills click. These are two interaction timings with different start points.

## Hosted database reads

| Scenario | PostgREST requests before → after | Decoded responses before → after |
| --- | ---: | ---: |
| Catalogue, first observed authority load | 28 → 28 | 982,239 B → 982,239 B |
| Catalogue, later sample | 4 → 7 | 44,603 B → 48,338 B |
| Import words, direct entry | 5 → 2 | 11,656 B → 8,257 B |
| Bulk assign, chooser entry | 44 → 3 | 2,296,204 B → 10,805 B |
| Bulk review, lesson picker | 3 → 3 | 10,805 B → 10,805 B |
| Bulk review, regular `-ing` | 80 → 54 | 2,777,643 B → 467,900 B |
| Bulk review, `-ful/-less` | 85 → 73 | 1,105,510 B → 187,867 B |
| Bulk review, `un-` | 33 → 33 | 166,574 B → 166,574 B |
| `careful`, first editor document | 78 → 78 | 961,758 B → 961,703 B |
| `careful`, automatic readiness on entry | 111 → 0 | 2,874,996 B → 0 B |
| `careful`, when readiness runs | 111 → 111 | 2,874,996 B → 1,804,908 B |

The table uses the observed standalone request where a second sample included extra reads. Later Import samples were 15 reads and 28,597 B before and 10 reads and 21,465 B after. Later Bulk assign entry samples after deployment recorded up to five reads and 12,027 B. Subsequent Catalogue and word-editor navigation varied with cache state and concurrent reads. These samples confirm no Catalogue database saving on a first observed authority load. The readiness JSON response delivered to the browser remained 460,027 B.

Regular `-ing` still exists in the staging skill catalogue. The previous Family chooser had no active family row for its legacy family key, so it could not select that skill. The new Cluster chooser opened the first 50 visible candidates out of 833 matches. The selected view and candidate action together used 30–41 database reads and 971 KB–1.89 MB in the two diagnostic samples captured with the selection, before adding the entry request. The existing catalogue-wide filter index still runs after selection.

## Hosted workbook parity

I compared worksheet names and cell values for the regular `-ing`, `-ful/-less`, and `un-` Active pool workbooks and the `-ful/-less` and `un-` review workbooks. All five matched. Both regular `-ing` review requests returned the same empty-batch response. These requests downloaded existing staging data without editing content or approving words.
