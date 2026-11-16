# Bulk assign search latency on staging

The final staging build is `dpl_AxDNHMDcgVa2YX95t63TT4318ir8`. The baseline was `dpl_Aq3hRR2KFCSyDNLWWd6hShUcwUWR`. A separate preview used the new browser code in the original function region to distinguish the browser change from placement. Every preview used the same staging database and authenticated staging administrator. [Staging Bulk assign](https://scarletts-spells-adle-staging-20261025-s2hfu4yhl.vercel.app/admin/teaching-dictionary/bulk-assign?skill=D4_INF_ING_ENDINGS_REGULAR) · [Previous specialist filter report](teaching-dictionary-bulk-specialist-staging-2026-11-16.md)

## Where the time went

Six warm requests on a timing-only copy of the baseline spent a median 312 ms in the live admin check, 347 ms in the candidate fact lookup, and about 7 ms retrieving the warmed spelling index. Another 323 ms elapsed before the first byte outside the measured handler. Input scheduling took 104 ms. The response body typically completed in 1 ms and the resulting rows rendered in 2–5 ms. These figures are medians over separate components, so their sum is approximate.

Baseline candidate requests executed in Vercel `iad1`. Staging’s Supabase pooler is in AWS `eu-west-1`. The new preview sets the candidate route’s Vercel Function region to `dub1`, which is also `eu-west-1`. The Browser Resource Timing and response request IDs confirmed that the original preview used `iad1` and the final preview used `dub1`. [Vercel function region configuration](https://vercel.com/docs/functions/configuring-functions/region) · [Vercel region list](https://vercel.com/docs/regions)

## Before and after

Three rounds per preview used the same input sequence and a DOM observer to measure from the input event until matching rows and candidate facts were available. The browser first made an empty-result lookup to warm the connection. New-term medians cover `care` and `basket`. The baseline figures below reproduce the workflow using this finer timing, which differs from the 1.31-second browser-driver result in the previous report.

| Search | Original Washington, D.C. preview | Browser change in Washington, D.C. | Final Dublin staging preview |
| --- | ---: | ---: | ---: |
| New term, warmed index and connection | 1,051 ms | 973 ms | 495 ms |
| New `care` lookup | 1,128 ms | 1,126 ms | 594 ms |
| Repeat a recent term | 1,100 ms | 2 ms | 4 ms |
| Narrow a complete `care` result to `careful` | 1,266 ms | 2 ms | 4 ms |
| Repeat with case or whitespace changes | 921 ms | 2 ms | 2 ms |

A fresh lookup still used one authenticated browser request. Its median time to first byte fell from 942 ms to 426 ms. The browser reuses up to eight spelling result pages for 15 seconds in the current tab. A refinement can use those rows when the fetched result contains every match. Reused results made zero requests. The expiry test then made a new request, which completed in 833 ms in one sample. Successful assignment edits, a request to recheck candidate facts, and returning to the tab clear the recent results.

The staging deployment’s `vercel.json` override is the following field, merged with the staging preview configuration. It applies to the candidate endpoint in this staging preview.

```json
{
  "functions": {
    "app/api/admin/teaching-dictionary/bulk-assign/candidates/route.ts": {
      "regions": ["dub1"]
    }
  }
}
```

Every matched search returned identical ordered rows and displayed candidate facts. The Bulk assign regression covers reuse, expiry, bounded storage, normalized queries, and rejection of refinements from incomplete results. TypeScript and ESLint passed. The staged endpoint rejected an unauthenticated request. An unsubmitted selection survived paging, and a fast change to the search field preserved the latest result.
