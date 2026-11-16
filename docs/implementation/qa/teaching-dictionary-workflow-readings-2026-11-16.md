# Teaching Dictionary workflow performance on staging

**16 November 2026.** Bulk assign does the most work before an editor chooses anything. Word pages and selected Bulk review pages also run expensive lesson checks during browsing. Import words and the Bulk review lesson picker are comparatively light.

## Measurements

Signed-in Chrome loaded the preview source in a local Next.js server backed by the staging Supabase project. Each scenario ran four times. The table reports the median of the last three navigations to the visible page heading. On the word page, the editor also recorded when lesson checks finished. These figures describe this staging fixture and test environment. Hosted browser timing was unavailable for a comparable run.

PostgREST counts include any shared page reads captured during the navigation. The harness logged completed staging responses, including reads from the shared app shell and overlapping authority refreshes where captured. It excluded Supabase Auth, Storage, and browser assets. Bytes are decoded response bodies, shown with decimal units. The HTML column is the decoded browser document, which includes Next.js data embedded in the document. The Supabase Usage dashboard is the source for billed egress.

| Page or state | Repeat median | PostgREST requests | Decoded PostgREST responses | Decoded browser response |
| --- | ---: | ---: | ---: | ---: |
| Catalogue, first page | 1.49 s | 14–25 observed | 67 KB–1.64 MB observed | 151 KB HTML |
| Import words | 1.02 s | 5 | 11.7 KB | 69 KB HTML |
| Bulk assign, before choosing a skill | 6.28 s | 44 | 2.30 MB | 912 KB HTML |
| Bulk review, before choosing a lesson | 0.94 s | 3 | 10.8 KB | 43 KB HTML |
| Bulk review, regular `-ing` export view | 9.77 s | 80 | 2.78 MB | 51 KB HTML |
| Bulk review, `-ful/-less` export view | 8.55 s | 85 | 1.11 MB | 52 KB HTML |
| Bulk review, `un-` export view | 3.62 s | 33 | 167 KB | 51 KB HTML |
| `careful` word editor, initial document | 5.66 s | 52 repeats, 78 first | 33.6 KB repeats, 962 KB first | 211 KB HTML |
| `careful` word editor, automatic readiness | 16.56 s from navigation | 111 additional | 2.87 MB additional | 460 KB JSON |

The Catalogue’s earlier paired test established four captured requests on a repeat load with cached authority. This run observed overlapping authority reads and did not establish a clean warm-cache payload. The largest observed transfer coincided with authority reads, while the browser document stayed near 151 KB. Use the earlier comparison for the verified savings from moving four reads to Import words. [Catalogue sidebar release comparison](teaching-dictionary-catalogue-staging-2026-11-16.md)

The first instrumented `-ing` run showed an alert because the harness blocked a read-only hashing RPC sent as POST. The table uses a fresh four-run sample with that immutable RPC allowed. The regular `-ing` export view rendered without the alert in every rerun. It made 13 hashing RPCs, with about 171 KB of serialized request bodies as a separate upstream payload measure.

## Recommended implementation order

1. **Bulk assign.** Render the cluster and micro-skill chooser from its small catalogues. Begin candidate reads only after a skill is chosen. Page the candidate IDs server-side and load full sense, morphology and family details for visible and selected rows. The current entry request reads the whole catalogue and relationship authority, including a 784 KB dependency-authority response and 605 KB across the word, metadata and morphology tables. Compare candidate order, totals, sense choices, blockers and assignment decisions against the existing workflow. [Bulk assign loader](../../../app/(authenticated)/admin/teaching-dictionary/bulk-assign/page.tsx)
2. **Word editor.** Defer automatic readiness until Micro-skills opens, a route link requires it, or the editor enters an approval that depends on it. The `careful` check read two route groups and transferred 2.28 MB just from dependency authorities. Then split the initial editor reads, loading optional history, audio, family candidates and specialist data at their point of use. For reviews, reuse identical immutable authority inputs across group checks where possible and return a compact summary with route detail on request. Keep complete compiler inputs and current validation at approval and publication. The first target is zero readiness requests during ordinary browsing and the second is parity for blockers, approval decisions and fingerprints. [Word editor](../../../app/(authenticated)/admin/teaching-dictionary/detail.tsx) · [Readiness endpoint](../../../app/api/admin/teaching-dictionary/[wordId]/lesson-readiness/route.ts)
3. **Selected Bulk review pages.** Keep the current lesson picker. Give the export view a compact read for queue rows, reasons and scope counts. Load the workbook facts for the requested batch at download time. For the full Active pool, use the live selector for the chosen lesson. Keep full group validation and fresh fingerprints in Preview and Publish. Start with regular `-ing` and `-ful/-less`. Regular `-ing` transferred 2.32 MB in dependency authorities and ran package hashing on the export view. `-ful/-less` transferred a 784 KB authority object and issued six individual dictionary-fingerprint RPCs. Check that queue decisions and both export scopes match the current workflow. [Bulk review loader](../../../app/(authenticated)/admin/teaching-dictionary/lesson-updates/page.tsx) · [Suffix review loader](../../../lib/teaching-dictionary-manager/able-ible-review.ts)
4. **Catalogue authority.** Keep the current page and page facts RPCs. Instrument cache hits, rebuilds and background revalidation separately. If authority refresh dominates repeat-use traffic, compare a compact, paginated read of the governed decisions with the existing resolver, including Evidence approved and Missing route member. Verify totals, order and changes after approval or withdrawal before switching. [Catalogue loader](../../../app/(authenticated)/admin/teaching-dictionary/page.tsx)
5. **Import words.** Leave this behind the larger work. The two exact count requests have empty response bodies. When the workbook replaces or restructures these tools, fetch exact batch counts for the relevant export and load the micro-skill labels when approval guidance opens. Limit workbook preview and apply lookups to the submitted words, senses and affixes. [Import loader](../../../app/(authenticated)/admin/teaching-dictionary/import/page.tsx)

Repeat these scenarios after each change and compare request counts, decoded bytes and time to the first usable action. Measure the complete interaction as well as the first screen so a smaller initial response does not mask slower reviews or duplicate reads. [Implementation plan](../teaching-dictionary-admin-implementation-plan-2026-11-16.md)
