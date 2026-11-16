# Teaching Dictionary regional latency on staging

The staged preview is `dpl_AmmCzX1PNgJB9vCrtQp9EKQtk2gV`. The baseline is `dpl_AxDNHMDcgVa2YX95t63TT4318ir8`. The two source snapshots differed only in their Vercel preview configuration. Staging Supabase uses AWS `eu-west-1`. Vercel request IDs confirmed that Catalogue, Bulk review, and the readiness endpoint moved from Washington, D.C. (`iad1`) to Dublin (`dub1`). [Staging Catalogue](https://scarletts-spells-adle-staging-20261025-fcrb8kwec.vercel.app/admin/teaching-dictionary) · [Vercel function region configuration](https://vercel.com/docs/functions/configuring-functions/region)

## Hosted before and after

Each workflow had four signed-in runs per deployment from the same browser and network. I alternated which deployment went first within each pair. Page timing runs from navigation until the real heading becomes visible after streaming. `careful` readiness runs from clicking Micro-skills until the editor records readiness as complete. The repeat column uses the median of runs two through four. The first-run column describes the first measured pair without assuming the app cache state.

| Workflow | Repeat median, before → after | Repeat improvement | First observed run, before → after |
| --- | ---: | ---: | ---: |
| Catalogue | 2.31 s → 1.30 s | 44% | 2.32 s → 3.63 s |
| Catalogue, Evidence Approved | 2.33 s → 1.55 s | 33% | 7.60 s → 2.32 s |
| Bulk review, lesson picker | 1.60 s → 0.95 s | 41% | 2.34 s → 1.52 s |
| Bulk review, regular `-ing` | 5.38 s → 1.78 s | 67% | 6.42 s → 2.30 s |
| Bulk review, `-ful/-less` | 3.86 s → 1.72 s | 55% | 5.07 s → 5.77 s |
| Bulk review, `un-` | 3.96 s → 1.95 s | 51% | 3.39 s → 1.48 s |
| `careful` word readiness | 3.38 s → 1.79 s | 47% | 5.58 s → 3.26 s |

`Server-Timing` put median readiness handler time at 3.08 s before and 1.48 s after. The 5,864-byte readiness JSON matched on all eight requests. The rendered Catalogue and Bulk review content matched across the 48 page navigations. In-app navigations to Catalogue and Bulk review also returned their Next.js data from Dublin. The sample shows repeat-use improvements for every workflow. The Catalogue and `-ful/-less` first pairs were slower in Dublin, and the sample does not establish a cold-cache latency gain for those two paths.

The workspace’s [staging deployment config](../../../vercel.staging.json) is byte-for-byte the config used for this preview. Use it as the Vercel local configuration in the isolated deployment directory linked to `scarletts-spells-adle-staging-20261025`. It pins the Catalogue page, the Bulk review page, the word readiness endpoint, and the previously placed Bulk assign candidate endpoint to Dublin.
