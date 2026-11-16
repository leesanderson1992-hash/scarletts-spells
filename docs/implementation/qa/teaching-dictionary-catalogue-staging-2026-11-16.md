# Teaching Dictionary Catalogue staging comparison

The first admin slice adds the Teaching Dictionary sidebar dropdown, brings Catalogue search to the top of the page, and gives the existing CSV tools and recent drafts their own Import words page. The ordinary Catalogue render now directly requests a filtered page, facts for its displayed words, and reviewed-meaning presence for those words. The recent draft query, assignable skill catalogue, and two export batch counts run on Import words.

## Before and after

The baseline ran before changing the Catalogue reads, from `da1ebca3`. Both runs used authenticated Chrome against local Next development servers with the same staging Supabase database and route environment. Each scenario was loaded five times in the same order. The first load for each scenario ordinarily missed the relationship authority cache. Missing route member reused the global authority from Evidence approved. Repeat times below are the medians of loads two through five and include navigation, server work, and browser rendering. The first runs are useful for request counts and payloads, but can include compilation and are excluded from the timing comparison.

The request capture covers staging PostgREST responses during page navigation, including one shared app-shell child lookup, any cold authority reads, and SELECT RPCs sent as POST. It excludes Supabase Auth and browser assets. Byte counts are decoded PostgREST response bodies. Supabase bills egress separately at the project and service level.

| Scenario | Visible / total | Repeat requests before → after | Decoded bytes before → after | Repeat median before → after |
| --- | ---: | ---: | ---: | ---: |
| All active, page 1 | 50 / 833 | 8 → 4 | 50,235 → 44,603 | 1,686 → 1,846 ms |
| Search for `careful` | 1 / 1 | 8 → 4 | 12,983 → 7,351 | 1,325 → 1,262 ms |
| Missing core facts or dictation | 50 / 104 | 8 → 4 | 21,584 → 15,952 | 1,556 → 1,378 ms |
| Evidence approved | 50 / 437 | 8 → 4 | 56,193 → 50,561 | 1,595 → 1,053 ms |
| Prefix, suffix or base member missing | 1 / 1 | 9 → 5 | 12,083 → 6,451 | 1,861 → 1,527 ms |
| Awaiting British recording | 50 / 817 | 9 → 5 | 81,168 → 75,536 | 1,626 → 1,735 ms |
| All active, page 2 | 50 / 833 | 8 → 4 | 51,448 → 45,816 | 1,606 → 1,627 ms |

Every matched load returned the same ordered word IDs and exact total. All 35 pairs saved four requests and 5,632 decoded bytes per navigation. Two removed requests were HEAD counts with empty response bodies. The first load of the ordinary Catalogue went from 32 to 28 requests and from 987,871 to 982,239 decoded bytes. The first Evidence approved load went from 37 to 33 requests and from 1,489,122 to 1,483,490 decoded bytes. Cold relationship authority still accounts for most of the payload. Browser timing varied by scenario across these small samples.

Import words now owns the four reads. This comparison measures Catalogue navigation. A session that proceeds to Import words will still request its counts, skills, and drafts when that page opens. [Implementation plan](../teaching-dictionary-admin-implementation-plan-2026-11-16.md)

## Browser and code checks

The staging-backed browser opened and closed the dropdown with the keyboard, expanded it from the collapsed desktop sidebar, and selected Catalogue from the mobile drawer. It opened the last word on page 2 and returned to the same row, submitted a one-result search and an empty search, opened Import words and its existing CSV controls, downloaded the blank CSV template, and verified the Bulk review and Bulk assign destinations and active sidebar links. TypeScript, ESLint on the changed TypeScript files, the word workspace regression, and `git diff --check` passed.
