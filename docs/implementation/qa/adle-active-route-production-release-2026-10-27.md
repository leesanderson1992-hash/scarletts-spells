# Active ADLE route readiness — Production release, 27 October 2026

## Released identity

- Application code SHA: `2cc5ab419362b168e82319ad35934bf371689212`; Production deployment `dpl_G9eFYhufMg2M4a5Yif7Jn1mmdbZK` serves `https://scarletts-spells.vercel.app`.
- The integrated code passed TypeScript, the Production Next.js build, 110 route/skill contract checks, governed preflight and Teaching Dictionary regressions, and focused suffix, Base Word, `-ing`, comparative, relationship-scope and word-status checks. Disposable [staging proof](adle-active-route-staging-proof-2026-10-27.md) passed on Preview `dpl_4KwVZ466TrAusQb7d1Jxt6kFnYtq`, including child Finish and saved-lesson replay.
- Production migration `20261027080000_scope_inflection_relationship_release_members.sql` was applied alone with its ledger row. Source SHA-256: `d8f39d045bdadb0c2bdd2b6ee40edb073aef77f1e97d751b98cf3acc654682fa`. Readback found the read-only RPC, service-role execute, no anonymous execute, and 156 active membership rows. No word assignment, editorial approval, lesson progress, or route activation was changed.
- The unaliased and public `HEAD /api/internal/context-recovery` both returned HTTP 200, the exact code SHA, valid identity, no identity failures, runtime fingerprint `5d2de1feb5104acbba1ad3edb2652830b6fdd71d40af36af422eabd47274bd35`, and release hold disabled.
- Fresh provider approval `ecc28950-554d-47ac-950c-d2db4038c9d4` cites the owner's 9 October standing permission. It preserves the approved Production OpenAI project, `gpt-6-luna`, `/v1/responses`, standard API retention, disabled data sharing, configuration/runtime fingerprints, four unrevoked learner authorisations, rate card, and limits of 37 requests and $0.1147 per day, $0.0031 per request, one concurrent request.
- The policy and scheduler were bound together to the new SHA in one transaction. Policy revision `49f25965-fe21-4e38-a4b1-9ac86af0f521`; existing five-minute Cron job `43`. Execution readiness and the safety monitor returned true with zero unrecorded sends. An authenticated public recovery GET returned HTTP 200 with both workers idle. The 08:35 UTC scheduled job succeeded and its HTTP response returned 200, the new SHA, release hold disabled, and both workers idle. No error/fatal logs were found on this deployment in the 08:21–08:36 UTC log window.

## Live administrative readback

These are Production counts at release time. An approved relationship alone does not admit a word to an ADLE lesson; reviewed route content and other gates still apply.

| Active route/skill | Associated | Approved relationship | Technically complete | Other blockers shown | Through administrative gates |
| --- | ---: | ---: | ---: | --- | ---: |
| `-ing` Regular | 33 | 33 | 29 | 4 missing route content | 29 |
| Comparative Regular | 22 | 16 | 18 | 4 missing route content; base forms are supports | 12 |
| Suffix `-ful/-less` | 16 | 16 | 4 | 11 missing route content; unready profile words retain their own blockers | 4 |
| Base Word Preserve Base | 14 | 14 | 13 | 4 awaiting content review; one word lacks a compiler-valid selection | 9 |

The four extra `-ing` Regular relationships without reviewed route membership were `according`, `interesting`, `occurring`, and `scrolling`. The interface displayed the precise route-content blocker for each; none was counted as administratively eligible. This is a content/relationship review queue, not evidence that they should be added automatically.

## Performance and follow-up

The staging RPC sample returned 680 serialized JSON bytes for one word versus 111,315 bytes for the full 156-row projection; these are response-body measurements, not billed egress savings. The scheduled completed-day Supabase comparison on 28 October remains the measurable egress check. Newly available approved content can enter the route pool through the existing release authority; learner selection still applies its queue, mastery, and compiler rules. Historical snapshots and reviews remain in place.
