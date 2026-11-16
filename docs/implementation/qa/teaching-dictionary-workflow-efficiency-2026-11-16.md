# Teaching Dictionary workflow efficiency verification

The efficiency changes separate a page’s entry state from the database work an editor requests through it. The comparison uses the staging database and the local browser harness described in the [original workflow readings](teaching-dictionary-workflow-readings-2026-11-16.md). Counts cover PostgREST responses captured for the interaction. Decoded response bytes measure payload size. Supabase billed egress is tracked separately.

## Changes by workflow

- **Bulk assign** opens with searchable Cluster → Micro-skill choices. The selected skill uses the same governed relationship interpreter and the server-side write checks. Its first results still use a compact catalogue index for the existing spelling, syllable, phoneme and morphology filters. Detailed sense morphology and family data are loaded in groups of at most 50 visible words. A same-page request is shared while pending. Assignment drafts and meaning selection retain their existing behavior.
- **Word editor** opens without a lesson readiness request. The Micro-skills tab, route links and approvals that require readiness can start one. The initial render checks just the latest draft for the newer-draft notice. Older history loads on request, and hidden pronunciation and recording components mount when their views are used.
- **Bulk review** shares a smaller current-pool read with the regular `-ing` export. Export queue generation uses the existing word-level blockers and skips prospective package hashing. Preview and Publish still run the full package preflight. The suffix full Active pool workbook reads from its live selector directly. Review candidate reads constrain authority, bindings and decisions to the selected lesson, and targeted preflight only loads authority rows for the releases it can use.
- **Catalogue** keeps the same row and filter logic. The normal page caches the word/skill pairs it displays and logs authority rebuilds separately through the existing read metrics. Refreshes still run the governed interpreter.
- **Import words** fetches draft summaries on entry. It requests the exact export batch count and micro-skill lookup data when the corresponding CSV tools open.

## Before and after

Traffic includes the shared admin shell. KB and MB use decimal units. The after measurements used three or four signed-in Chromium navigations per state against the staging Supabase database. Timings use repeat medians after the first navigation, with the midpoint for two repeats. Heading time is the browser’s elapsed time to a visible page heading. Candidate and readiness timings use the point when the data becomes usable. These timings come from a local Next.js development server. The unchanged lesson picker took 0.94 s in the baseline and 3.41 s in the repeat, so use the timing samples as observations rather than a hosted latency estimate.

| Page or interaction | PostgREST requests before → after | Decoded PostgREST bytes before → after | Browser repeat timing before → after |
| --- | ---: | ---: | ---: |
| Catalogue, first page across observed cache states | 14–25 → 13–25 | 66,832–1,636,380 → 75,118–969,897 | 1.49 s → 1.75 s |
| Import words, entry | 5 → 2 | 11,656 → 8,257 | 1.02 s → 4.38 s |
| Bulk assign, before choosing a skill | 44 → 3 | 2,296,204 → 10,805 | 6.28 s → 11.80 s |
| Bulk assign, first regular `-ing` candidate page after choosing a skill | Included in previous entry → 31 | Included in previous entry → 977,169 | Previous entry included candidates → 7.15 s from selected-page navigation through candidate facts |
| Bulk review, lesson picker | 3 → 3 | 10,805 → 10,805 | 0.94 s → 3.41 s |
| Bulk review, regular `-ing` export view | 80 → 54 | 2,777,643 → 467,900 | 9.77 s → 6.50 s |
| Bulk review, `-ful/-less` export view | 85 → 73 | 1,105,510 → 187,867 | 8.55 s → 4.56 s |
| Bulk review, `un-` export view | 33 → 33 | 166,574 → 166,574 | 3.62 s → 6.91 s |
| `careful` word editor, repeat initial document | 52 → 52 | 33,599 → 33,544 | 5.66 s → 5.28 s |
| `careful` word editor, automatic readiness | 111 additional → 0 | 2,874,996 additional → 0 | 16.56 s from navigation → deferred until requested |
| `careful` word editor, explicit Micro-skills readiness | Previously fetched on entry → 111 | Previously fetched on entry → 1,804,908 | 7.59 s from click, or 12.70 s from navigation with an immediate click |

The selected Bulk assign interaction transfers 987,974 decoded bytes over 34 requests including chooser entry and the first candidate page, down from the previous eager entry’s 2,296,204 over 44. Entry HTML dropped from about 912 KB to 43–45 KB. The selected page delivered about 549 KB of HTML and its initial filter index still spans the catalogue. Detailed facts load for up to 50 visible words. The previous timing captured the eager page heading, while the new candidate timing waits for the detailed facts, so the two interactions have different timing boundaries.

Import entry HTML dropped from about 69 KB to 54 KB. The earlier Catalogue staging comparison measured four PostgREST reads on a cache hit, down from eight before the Catalogue and Import split. The efficiency run also observed a four-read hit. The rebuild and cache-hit states varied across the wider samples, so the observed range does not establish a like-for-like rebuild saving. [Catalogue staging comparison](teaching-dictionary-catalogue-staging-2026-11-16.md)

The first `careful` navigation read 78 requests and 961,703 decoded bytes for the initial document, compared with 78 and 961,758 before. With readiness requested, the readiness endpoint’s browser response remained 460,027 decoded bytes. The reduction for explicit readiness is in the server’s upstream reads and the regular editor skips that response altogether.

## Verification and remaining work

- Signed-in staging reads reproduced the same assignment and removal pairs for regular `-ing`, `-ful/-less`, `un-` and Identify the Base. The previous and current snapshots matched for regular and drop-e `-ing` export rows, the suffix and prefix review queues and Active pools, and the sampled compiler inputs and fingerprints. The `careful` readiness snapshots matched on word and group blockers, witnesses and compiler readiness. Staging was used for read-only verification.
- The browser verified zero automatic readiness requests after the word editor hydrated, followed by a successful readiness response when Micro-skills opened. It also selected regular `-ing` through the searchable Bulk assign controls and opened the deferred Overview CSV tools from Import. The measured pages rendered without alerts. TypeScript, ESLint on changed TypeScript files, and both Teaching Dictionary regression commands passed.
- The remaining performance work is server-side search and pagination for the Bulk assign filter index, a smaller on-demand readiness response, and a controlled Catalogue cache-rebuild comparison. The combined workbook and its submitted-row lookup path are still part of the workbook implementation plan. The local measurements leave hosted latency unverified.
