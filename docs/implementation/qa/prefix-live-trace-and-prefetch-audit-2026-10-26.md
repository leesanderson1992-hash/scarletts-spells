# Production Prefix proof and navigation read audit — 26 October 2026

## Functional proof on the public release

Production project `wwohrqtunajrbwxyssjf`, public Vercel release
`d1576d7e70b73de63a4c70e6e669ec11b682ac14`. The dedicated synthetic
child `Prefix Live Trace 20261026` (`510307c9-da80-4c1f-bb33-94034ddd5747`)
was created in the ordinary parent UI. No real learner record, catalogue
approval, route release, or canonical mapping was changed.

The parent saved sample `8d7dfc9a-804a-422c-a12d-3c19b051d74c`, containing
`unnfair` and `unnhappy`. The browser initially showed a page-load error after
the save, but read-only database inspection confirmed the sample was durable;
the direct Review Work page then opened. The normal parent verification form
offered `Spell words with prefix un-` and confirmed `unnfair→unfair` and
`unnhappy→unhappy`. Both appeared as ready for the child's lesson selection
and created pending `D4_MOR_PREFIXES_UN` learning items. This is a synthetic
proof of the workflow, not evidence of an authentic child's spelling.

The ordinary parent dashboard generated assignment
`f43d7159-af62-43e7-ad41-9baa188e7324` at 20:24:47 UTC. Its immutable
snapshot selected `dynamic_prefix_word_lab/v2`, with `unfair` and `unhappy` as
authentic targets linked to the two learning-item IDs; `unkind` and `unlock`
were transfer words. The child browser finished all teaching, discovery,
split, meaning, build, four covered recalls, four dictated sentences and
reflection. After reload it still showed the completed lesson and reflection.
[Completed screen](screenshots/prefix-live-trace-finished-2026-10-26.png).

Read-only durable readback: assignment `completed`, `session_completed_at`
`2026-10-26T20:31:44.636Z`, 16/16 assignment items `completed`, two authentic
learning items `awaiting_review_outcome`, and one active two-word review bundle
due 27 October. The transfer words did not join that review bundle. This
closes the Production Prefix writing-to-finish functional proof; it does not
prove tomorrow's review outcome or word mastery.

## Traffic observed during generation

Supabase Logs Explorer `edge_logs`, `/rest/v1/`, fixed UTC windows. The earlier
synthetic Prefix assignment was created at 12:21:18 UTC, before this release;
the new assignment was created at 20:24:47 UTC. The windows below include
other site requests and cannot be attributed solely to either generation.

| Window | REST calls | Mean origin time | p95 origin time | Content-length present |
| --- | ---: | ---: | ---: | ---: |
| 12:21–12:23 UTC | 568 | 228.5 ms | 771 ms | 179/568 |
| 20:24–20:26 UTC | 1,098 | 382.6 ms | 799.4 ms | 320/1,098 |

The previous window's busiest endpoints were reviewed word–skill pairs and
withdrawals (72 each), dictionary words (48), and route revision RPC (24).
The new window had 134 pairs, 135 withdrawals, 91 dictionary words, and 54
route revision RPCs. These figures show repeated reads, but the windows are
not isolated operation traces. Missing `content_length` prevents deriving
transferred or billed bytes from them. No egress saving is claimed.

Vercel Production request logs for 20:24–20:26 UTC show one dashboard POST
alongside GETs for unrelated admin pages, learning pages, settings, insights,
courses and Review Work. `components/app-shell.tsx` explicitly set full
`prefetch` on every navigation link and additionally called `router.prefetch`
for main links after mount. `components/ui/parent-primitives.tsx` did the same
for dashboard card links. Current Next.js documentation says a true/full
prefetch can render uncached dynamic content, while `prefetch={false}` disables
that work. This is a confirmed source of unnecessary page requests; exact
PostgREST calls and bytes per prefetched page are not yet isolated.

The bounded code change disables speculative prefetch for shared navigation
and dashboard card links, and removes the explicit router warmup. Navigation
still works on click. Verify this candidate in a production-built Preview by
loading a parent dashboard and child lesson without clicking the sidebar, then
confirm that unrelated routes do not appear in Vercel logs. After release,
compare matched traffic windows and completed-day Supabase usage; first-click
navigation timing should also be checked for a material regression. The
scheduled 28 October retest remains the billed-egress comparison gate.

## Production release and immediate check

PR #95 passed `quality`, Vercel Preview, TypeScript, targeted lint and the
production build. The merged application SHA `fab03a14dadf9a49875be01c25c493039e82f0a5`
was staged as Production deployment `dpl_CUprDGbbbnrwoHem8q5Phq4QbLY1` and
then promoted. Authenticated `HEAD /api/internal/context-recovery` on the
unaliased deployment and public alias both returned that exact SHA, valid
identity, no identity failures, the expected runtime fingerprint and release
hold disabled. The existing writing-context policy and five-minute scheduler
were bound to the new approval and SHA in one transaction; their existing
request, cost and concurrency limits were preserved. Execution readiness
returned true. At 20:55 UTC, scheduler job 43 succeeded, its HTTP response was
200 with the new SHA and release hold false, and both job lanes reported idle.
The first Production error-log check found no error entries.

After promotion, the completed lesson was opened and its parent dashboard was
loaded and reloaded. Vercel logs for 20:53–20:55 UTC on the new deployment
contained seven GETs for `/dashboard` and six for `/learn/week/adle`, with no
GETs for unrelated admin or navigation destinations. The pre-change 20:24–20:26
UTC window contained GETs for twelve other destinations, including Teaching
Dictionary, Canonical Resolver, No Matching Skill, courses, settings and
insights. These windows include different user actions and any concurrent
traffic, so this is a request-pattern check, not a like-for-like estimate of
saved bytes or total request reduction. Completed-day billed egress still needs
the scheduled 28 October comparison against 25 October.
